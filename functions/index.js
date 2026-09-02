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

const auctionProfiles = {
  '의사': ['판단력', '분석력', '관찰력', '책임감', '의사소통능력', '공감능력', '문제해결능력', '집중력', '리더십', '적응력', '정보활용능력'],
  '소방관': ['위기대처능력', '판단력', '신체능력', '협업능력', '책임감', '공간지각능력', '문제해결능력', '집중력', '의사소통능력', '적응력', '손재주'],
  '교사': ['의사소통능력', '공감능력', '책임감', '갈등조정능력', '계획성', '관찰력', '리더십', '언어능력', '창의성', '적응력', '정보활용능력'],
  '경찰관': ['판단력', '위기대처능력', '책임감', '관찰력', '의사소통능력', '갈등조정능력', '신체능력', '협업능력', '분석력', '적응력', '설득력'],
  '유튜브 크리에이터': ['창의성', '의사소통능력', '디지털 활용능력', '자기주도성', '실행력', '계획성', '언어능력', '정보활용능력', '분석력', '적응력', '끈기'],
  '게임 개발자': ['문제해결능력', '논리적 사고', '창의성', '디지털 활용능력', '협업능력', '집중력', '분석력', '끈기', '의사소통능력', '계획성', '적응력'],
  '요리사': ['손재주', '꼼꼼함', '집중력', '위기대처능력', '계획성', '창의성', '협업능력', '신체능력', '관찰력', '적응력', '실행력'],
  '간호사': ['관찰력', '책임감', '공감능력', '위기대처능력', '의사소통능력', '협업능력', '꼼꼼함', '판단력', '적응력', '집중력', '갈등조정능력'],
  '웹툰 작가': ['창의성', '디지털 활용능력', '관찰력', '언어능력', '끈기', '자기주도성', '계획성', '집중력', '공감능력', '정보활용능력', '손재주'],
  '반려동물 훈련사': ['관찰력', '공감능력', '끈기', '의사소통능력', '책임감', '문제해결능력', '신체능력', '계획성', '위기대처능력', '친화력', '적응력'],
  '로봇공학자': ['논리적 사고', '문제해결능력', '창의성', '수리능력', '디지털 활용능력', '분석력', '손재주', '협업능력', '집중력', '계획성', '끈기'],
  '스포츠 트레이너': ['신체능력', '관찰력', '의사소통능력', '계획성', '책임감', '공감능력', '리더십', '위기대처능력', '적응력', '분석력', '실행력'],
  '심리상담사': ['공감능력', '의사소통능력', '관찰력', '갈등조정능력', '책임감', '분석력', '언어능력', '집중력', '적응력', '문제해결능력', '친화력'],
  '항공 승무원': ['의사소통능력', '위기대처능력', '책임감', '친화력', '적응력', '공감능력', '협업능력', '언어능력', '관찰력', '계획성', '꼼꼼함'],
  '건축가': ['공간지각능력', '창의성', '문제해결능력', '수리능력', '계획성', '디지털 활용능력', '분석력', '의사소통능력', '꼼꼼함', '협업능력', '관찰력'],
  '패션 디자이너': ['창의성', '손재주', '관찰력', '디지털 활용능력', '자기주도성', '계획성', '의사소통능력', '정보활용능력', '실행력', '적응력', '분석력'],
  '사회복지사': ['공감능력', '의사소통능력', '책임감', '갈등조정능력', '문제해결능력', '협업능력', '친화력', '관찰력', '적응력', '설득력', '계획성'],
  '데이터 분석가': ['분석력', '논리적 사고', '수리능력', '정보활용능력', '문제해결능력', '디지털 활용능력', '꼼꼼함', '집중력', '의사소통능력', '계획성', '끈기'],
  '환경 연구원': ['관찰력', '분석력', '문제해결능력', '책임감', '정보활용능력', '협업능력', '논리적 사고', '꼼꼼함', '계획성', '적응력', '도전정신'],
  '창업가': ['도전정신', '실행력', '리더십', '문제해결능력', '설득력', '창의성', '의사소통능력', '정보활용능력', '자기주도성', '적응력', '계획성'],
}

const fallbackAuctionJob = '게임 개발자'
const auctionJobNames = Object.keys(auctionProfiles)

const requireAuctionUser = (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Firebase 로그인이 필요합니다.')
  const roomCode = String(request.data?.roomCode ?? '').trim()
  if (!/^\d{6}$/.test(roomCode)) throw new HttpsError('invalid-argument', '방 코드가 올바르지 않습니다.')
  return { uid: request.auth.uid, roomCode, roomRef: db.doc(`auctionRooms/${roomCode}`) }
}

const shuffledAuctionDeck = (jobs, count) => {
  const candidates = [...new Set(jobs.flatMap((job) => auctionProfiles[job] ?? auctionProfiles[fallbackAuctionJob]))]
  const deck = Array.from({ length: count }, (_, index) => candidates[index % candidates.length])
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index + 1)
    ;[deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]]
  }
  return deck
}

const staffDirectory = {
  '이상구': { number: '10', role: 'mentor' },
  '김민재': { number: '20', role: 'mentor' },
  '양예원': { number: '30', role: 'mentor' },
  '안지윤': { number: '40', role: 'mentor' },
  '김승주': { number: '50', role: 'mentor' },
  '이영우': { number: '60', role: 'mentor' },
  '추규한': { number: '70', role: 'mentor' },
  '관리자1': { number: '80', role: 'admin', storageKey: '80' },
  '관리자2': { number: '90', role: 'admin', storageKey: '90' },
  '예산고': { number: '80', role: 'teacher', storageKey: 'teacher-yesan-high' },
  '광시중': { number: '90', role: 'teacher', storageKey: 'teacher-gwangsi-middle' },
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

const createAccount = async (displayName, account, used) => {
  const pin = createPin(account.number, used)
  used.add(pin)
  const pinSalt = randomBytes(16).toString('hex')
  const pinHash = await hashPin(pin, pinSalt)
  return {
    credential: { displayName, accountNumber: account.number, role: account.role, pin },
    record: {
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
    },
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
    const created = await createAccount(displayName, account, used)
    batch.set(db.doc(`staffAccounts/${account.storageKey ?? account.number}`), created.record)
    credentials.push(created.credential)
  }
  batch.create(setupRef, { completedAt: FieldValue.serverTimestamp(), accountCount: credentials.length })
  await batch.commit()
  return { credentials }
})

export const bootstrapTeacherAccounts = onCall({ secrets: [pinPepper, masterUnlockCode] }, async (request) => {
  if (!safeEqual(request.data?.masterCode, masterUnlockCode.value())) throw new HttpsError('permission-denied', '관리자 코드가 올바르지 않습니다.')
  const setupRef = db.doc('system/teacherAccountSetup')
  if ((await setupRef.get()).exists) throw new HttpsError('already-exists', '교사용 계정 발급이 이미 완료되었습니다.')

  const teachers = Object.entries(staffDirectory).filter(([, account]) => account.role === 'teacher')
  const used = new Set()
  const credentials = []
  const batch = db.batch()
  for (const [displayName, account] of teachers) {
    const created = await createAccount(displayName, account, used)
    batch.create(db.doc(`staffAccounts/${account.storageKey}`), created.record)
    credentials.push(created.credential)
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
  const accountRef = db.doc(`staffAccounts/${account.storageKey ?? account.number}`)

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
  await db.doc(`staffAccounts/${account.storageKey ?? account.number}`).update({ failedAttempts: 0, lockedUntil: null, unlockedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
  return { unlocked: true }
})

export const startAuctionVote = onCall(async (request) => {
  const { uid, roomRef } = requireAuctionUser(request)
  const initialMoney = Number(request.data?.initialMoney)
  const bidLimit = Number(request.data?.bidLimit)
  if (!Number.isInteger(initialMoney) || initialMoney < 500 || initialMoney > 10000 || ![7, 10, 15].includes(bidLimit)) throw new HttpsError('invalid-argument', '게임 설정값이 올바르지 않습니다.')
  const participants = await roomRef.collection('participants').get()
  const playerCount = participants.docs.filter((item) => item.data().role === 'participant').length
  if (!playerCount) throw new HttpsError('failed-precondition', '참가자가 한 명 이상 필요합니다.')
  await db.runTransaction(async (transaction) => {
    const room = await transaction.get(roomRef)
    if (!room.exists || room.data().hostId !== uid) throw new HttpsError('permission-denied', '방장만 게임을 시작할 수 있습니다.')
    if (room.data().gameState !== 'WAITING') throw new HttpsError('failed-precondition', '이미 시작된 게임입니다.')
    transaction.update(roomRef, { gameState: 'JOB_SELECTION', initialMoney, bidLimit, totalItems: playerCount * 10, voteEndsAt: Timestamp.fromMillis(Date.now() + 30000), updatedAt: FieldValue.serverTimestamp() })
    for (const participant of participants.docs) transaction.update(participant.ref, { balance: initialMoney, inventory: {}, selectedJob: null, updatedAt: FieldValue.serverTimestamp() })
  })
  return { started: true }
})

export const castAuctionVote = onCall(async (request) => {
  const { uid, roomRef } = requireAuctionUser(request)
  const job = String(request.data?.job ?? '')
  if (!auctionProfiles[job]) throw new HttpsError('invalid-argument', '선택할 수 없는 직업입니다.')
  const [room, participant] = await Promise.all([roomRef.get(), roomRef.collection('participants').doc(uid).get()])
  if (!room.exists || room.data().gameState !== 'JOB_SELECTION' || room.data().voteEndsAt.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', '투표 시간이 종료되었습니다.')
  if (!participant.exists || participant.data().role !== 'participant') throw new HttpsError('permission-denied', '참가자만 투표할 수 있습니다.')
  await Promise.all([
    roomRef.collection('votes').doc(uid).set({ userId: uid, job, updatedAt: FieldValue.serverTimestamp() }),
    roomRef.collection('participants').doc(uid).update({ selectedJob: job, updatedAt: FieldValue.serverTimestamp() }),
  ])
  return { voted: true }
})

export const finishAuctionVote = onCall(async (request) => {
  const { uid, roomRef } = requireAuctionUser(request)
  const [room, participants] = await Promise.all([roomRef.get(), roomRef.collection('participants').get()])
  if (!room.exists || room.data().hostId !== uid) throw new HttpsError('permission-denied', '방장만 투표를 마감할 수 있습니다.')
  if (room.data().gameState !== 'JOB_SELECTION') throw new HttpsError('failed-precondition', '투표 중인 방이 아닙니다.')
  const participantDocs = participants.docs.filter((item) => item.data().role === 'participant')
  if (!participantDocs.length) throw new HttpsError('failed-precondition', '참가자가 한 명 이상 필요합니다.')
  const selectedJobs = participantDocs.map((participant) => auctionProfiles[participant.data().selectedJob] ? participant.data().selectedJob : auctionJobNames[randomInt(0, auctionJobNames.length)])
  const deck = shuffledAuctionDeck(selectedJobs, room.data().totalItems)
  const batch = db.batch()
  participantDocs.forEach((participant, index) => batch.update(participant.ref, { selectedJob: selectedJobs[index], updatedAt: FieldValue.serverTimestamp() }))
  batch.update(roomRef, { gameState: 'COUNTDOWN', selectedJob: null, selectedJobs, deck, auctionIndex: 0, currentPrice: 200, highestBidderId: null, highestBidderName: null, countdownEndsAt: Timestamp.fromMillis(Date.now() + 5000), updatedAt: FieldValue.serverTimestamp() })
  await batch.commit()
  return { selectedJobs }
})

export const startAuctionRound = onCall(async (request) => {
  const { uid, roomRef } = requireAuctionUser(request)
  await db.runTransaction(async (transaction) => {
    const participantRef = roomRef.collection('participants').doc(uid)
    const [room, participant] = await Promise.all([transaction.get(roomRef), transaction.get(participantRef)])
    if (!room.exists) throw new HttpsError('not-found', '게임방을 찾을 수 없습니다.')
    if (!participant.exists) throw new HttpsError('permission-denied', '입장한 참가자만 경매를 시작할 수 있습니다.')
    const data = room.data()
    if (data.gameState === 'AUCTION') return
    if (data.gameState !== 'COUNTDOWN') throw new HttpsError('failed-precondition', '시작 대기 중인 방이 아닙니다.')
    if (data.countdownEndsAt.toMillis() > Date.now()) throw new HttpsError('failed-precondition', '아직 시작 전입니다.')
    transaction.update(roomRef, { gameState: 'AUCTION', auctionEndsAt: Timestamp.fromMillis(Date.now() + data.bidLimit * 1000), updatedAt: FieldValue.serverTimestamp() })
  })
  return { started: true }
})

export const placeAuctionBid = onCall(async (request) => {
  const { uid, roomRef } = requireAuctionUser(request)
  const amount = Number(request.data?.amount)
  if (!Number.isInteger(amount) || amount < 250) throw new HttpsError('invalid-argument', '입찰 금액이 올바르지 않습니다.')
  await db.runTransaction(async (transaction) => {
    const participantRef = roomRef.collection('participants').doc(uid)
    const [room, participant] = await Promise.all([transaction.get(roomRef), transaction.get(participantRef)])
    if (!room.exists || room.data().gameState !== 'AUCTION') throw new HttpsError('failed-precondition', '현재 경매가 진행 중이 아닙니다.')
    if (!participant.exists || participant.data().role !== 'participant') throw new HttpsError('permission-denied', '참가자만 입찰할 수 있습니다.')
    const data = room.data()
    const player = participant.data()
    const now = Date.now()
    const strength = data.deck[data.auctionIndex]
    if (data.auctionEndsAt.toMillis() <= now) throw new HttpsError('deadline-exceeded', '입찰 시간이 종료되었습니다.')
    if (amount <= data.currentPrice || amount > player.balance) throw new HttpsError('failed-precondition', '입찰 금액이나 잔액을 확인해 주세요.')
    if ((player.inventory?.[strength] ?? 0) >= 3) throw new HttpsError('failed-precondition', '이미 최고 등급인 강점입니다.')
    const remaining = data.auctionEndsAt.toMillis() - now
    transaction.update(roomRef, { currentPrice: amount, highestBidderId: uid, highestBidderName: player.nickname, auctionEndsAt: remaining <= 2000 ? Timestamp.fromMillis(now + 5000) : data.auctionEndsAt, updatedAt: FieldValue.serverTimestamp() })
  })
  return { accepted: true }
})

export const settleAuctionItem = onCall(async (request) => {
  const { roomRef } = requireAuctionUser(request)
  await db.runTransaction(async (transaction) => {
    const room = await transaction.get(roomRef)
    if (!room.exists || room.data().gameState !== 'AUCTION') return
    const data = room.data()
    if (data.auctionEndsAt.toMillis() > Date.now()) throw new HttpsError('failed-precondition', '아직 입찰 시간이 남아 있습니다.')
    if (data.highestBidderId) {
      const winnerRef = roomRef.collection('participants').doc(data.highestBidderId)
      const winner = await transaction.get(winnerRef)
      if (winner.exists) {
        const strength = data.deck[data.auctionIndex]
        const inventory = { ...winner.data().inventory, [strength]: Math.min(3, (winner.data().inventory?.[strength] ?? 0) + 1) }
        transaction.update(winnerRef, { balance: winner.data().balance - data.currentPrice, inventory, updatedAt: FieldValue.serverTimestamp() })
      }
    }
    transaction.update(roomRef, { gameState: 'SOLD', updatedAt: FieldValue.serverTimestamp() })
  })
  return { settled: true }
})

export const advanceAuctionItem = onCall(async (request) => {
  const { uid, roomRef } = requireAuctionUser(request)
  await db.runTransaction(async (transaction) => {
    const room = await transaction.get(roomRef)
    if (!room.exists || room.data().hostId !== uid) throw new HttpsError('permission-denied', '방장만 다음 상품으로 진행할 수 있습니다.')
    const data = room.data()
    if (data.gameState !== 'SOLD') throw new HttpsError('failed-precondition', '낙찰 처리가 완료되지 않았습니다.')
    const nextIndex = data.auctionIndex + 1
    transaction.update(roomRef, nextIndex >= data.totalItems ? { gameState: 'RESULT', updatedAt: FieldValue.serverTimestamp() } : { gameState: 'AUCTION', auctionIndex: nextIndex, currentPrice: 200, highestBidderId: null, highestBidderName: null, auctionEndsAt: Timestamp.fromMillis(Date.now() + data.bidLimit * 1000), updatedAt: FieldValue.serverTimestamp() })
  })
  return { advanced: true }
})
