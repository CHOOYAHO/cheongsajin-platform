import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2/options'

initializeApp()
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 3 })

const db = getFirestore()
const scrypt = promisify(scryptCallback)
const pinPepper = defineSecret('PIN_PEPPER')
const masterUnlockCode = defineSecret('MASTER_UNLOCK_CODE')

const staffDirectory = {
  '이상구': { number: '10', role: 'mentor' },
  '김민재': { number: '20', role: 'mentor' },
  '양예원': { number: '30', role: 'mentor' },
  '안지윤': { number: '40', role: 'mentor' },
  '김승주': { number: '50', role: 'mentor' },
  '이영우': { number: '60', role: 'mentor' },
  '추규한': { number: '70', role: 'mentor' },
  '관리자1': { number: '80', role: 'admin' },
  '관리자2': { number: '90', role: 'admin' },
}

const normalizeName = (value) => String(value ?? '').trim().replaceAll(' ', '')
const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
const hashPin = async (pin, salt) => (await scrypt(`${pin}:${pinPepper.value()}`, salt, 64)).toString('hex')
const createPin = (number, used) => {
  const rejected = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210'])
  while (true) {
    const suffix = String(randomInt(0, 10000)).padStart(4, '0')
    const pin = `${number}${suffix}`
    if (!rejected.has(suffix) && !used.has(pin)) return pin
  }
}

export const bootstrapStaffAccounts = onCall({ secrets: [pinPepper, masterUnlockCode] }, async (request) => {
  if (!safeEqual(request.data?.masterCode, masterUnlockCode.value())) throw new HttpsError('permission-denied', '관리자 코드가 올바르지 않습니다.')
  const setupRef = db.doc('system/staffAccountSetup')
  if ((await setupRef.get()).exists) throw new HttpsError('already-exists', '계정 발급이 이미 완료되었습니다.')

  const used = new Set()
  const credentials = []
  const batch = db.batch()
  for (const [displayName, account] of Object.entries(staffDirectory)) {
    const pin = createPin(account.number, used)
    used.add(pin)
    const pinSalt = randomBytes(16).toString('hex')
    const pinHash = await hashPin(pin, pinSalt)
    batch.set(db.doc(`staffAccounts/${account.number}`), {
      displayName,
      accountNumber: account.number,
      role: account.role,
      pinSalt,
      pinHash,
      failedAttempts: 0,
      lockedUntil: null,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    credentials.push({ displayName, accountNumber: account.number, role: account.role, pin })
  }
  batch.create(setupRef, { completedAt: FieldValue.serverTimestamp(), accountCount: credentials.length })
  await batch.commit()
  return { credentials }
})

export const staffLogin = onCall({ secrets: [pinPepper] }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Firebase 로그인이 필요합니다.')
  const displayName = normalizeName(request.data?.name)
  const pin = String(request.data?.pin ?? '')
  const account = staffDirectory[displayName]
  if (!account || !/^\d{6}$/.test(pin)) throw new HttpsError('invalid-argument', '이름 또는 PIN이 올바르지 않습니다.')
  const accountRef = db.doc(`staffAccounts/${account.number}`)

  const verified = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(accountRef)
    if (!snapshot.exists || !snapshot.data().active) throw new HttpsError('permission-denied', '사용할 수 없는 계정입니다.')
    const data = snapshot.data()
    const now = Date.now()
    if (data.lockedUntil?.toMillis?.() > now) return { error: 'locked', remainingSeconds: Math.ceil((data.lockedUntil.toMillis() - now) / 1000) }
    const candidateHash = await hashPin(pin, data.pinSalt)
    if (!safeEqual(candidateHash, data.pinHash)) {
      const failedAttempts = (data.failedAttempts ?? 0) + 1
      const locked = failedAttempts >= 5
      transaction.update(accountRef, {
        failedAttempts,
        lockedUntil: locked ? Timestamp.fromMillis(now + 15 * 60 * 1000) : null,
        updatedAt: FieldValue.serverTimestamp(),
      })
      return { error: locked ? 'locked' : 'invalid', attemptsRemaining: Math.max(0, 5 - failedAttempts) }
    }
    transaction.update(accountRef, { failedAttempts: 0, lockedUntil: null, lastLoginAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    return { account: data }
  })

  if (verified.error === 'locked') throw new HttpsError('resource-exhausted', 'PIN 입력이 15분간 잠겼습니다.', { locked: true, remainingSeconds: verified.remainingSeconds })
  if (verified.error === 'invalid') throw new HttpsError('permission-denied', '이름 또는 PIN이 올바르지 않습니다.', { attemptsRemaining: verified.attemptsRemaining })

  await db.doc(`staffSessions/${request.auth.uid}`).set({
    userId: request.auth.uid,
    accountNumber: account.number,
    displayName,
    role: verified.account.role,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 12 * 60 * 60 * 1000),
  })
  return { role: verified.account.role, displayName }
})

export const unlockStaffAccount = onCall({ secrets: [masterUnlockCode] }, async (request) => {
  if (!safeEqual(request.data?.masterCode, masterUnlockCode.value())) throw new HttpsError('permission-denied', '관리자 코드가 올바르지 않습니다.')
  const displayName = normalizeName(request.data?.name)
  const account = staffDirectory[displayName]
  if (!account) throw new HttpsError('not-found', '계정을 찾을 수 없습니다.')
  await db.doc(`staffAccounts/${account.number}`).update({ failedAttempts: 0, lockedUntil: null, unlockedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  return { unlocked: true }
})
