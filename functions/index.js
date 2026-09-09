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
const openaiApiKey = defineSecret('OPENAI_API_KEY')

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

const normalizeAuctionJob = (value) => String(value ?? '').trim().replace(/\s+/g, ' ')
const isValidAuctionJob = (job) => job.length >= 1 && job.length <= 24 && ![...job].some((character) => {
  const code = character.codePointAt(0)
  return code < 32 || code === 127
})
const allParticipantMoneySpent = (participants, winnerId, winningPrice) => {
  const players = participants.docs.filter((item) => item.data().role === 'participant')
  return players.length > 0 && players.every((participant) => {
    const balance = Number(participant.data().balance ?? 0) - (participant.id === winnerId ? winningPrice : 0)
    return balance <= 0
  })
}
const writeAuctionResults = (transaction, roomRef, roomData, participants, overrides = {}) => {
  const roomCode = roomRef.id
  for (const participant of participants.docs.filter((item) => item.data().role === 'participant')) {
    const data = { ...participant.data(), ...(overrides[participant.id] ?? {}) }
    transaction.set(db.doc(`auctionResults/${roomCode}_${participant.id}`), {
      userId: participant.id,
      roomCode,
      displayName: data.nickname ?? '참가자',
      selectedJob: data.selectedJob ?? '',
      balance: Number(data.balance ?? 0),
      inventory: data.inventory ?? {},
      selectedJobs: roomData.selectedJobs ?? [],
      deck: roomData.deck ?? [],
      auctionIndex: Number(roomData.auctionIndex ?? 0),
      totalItems: Number(roomData.totalItems ?? 0),
      endedByHost: roomData.endedByHost === true,
      savedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
}

const staffDirectory = {
  '이상구': { number: '10', role: 'mentor' },
  '김민재': { number: '20', role: 'mentor' },
  '양예원': { number: '30', role: 'mentor' },
  '안지윤': { number: '40', role: 'mentor' },
  '김승주': { number: '50', role: 'mentor' },
  '이영우': { number: '60', role: 'mentor' },
  '추규한': { number: '70', role: 'admin' },
  '관리자1': { number: '80', role: 'admin', storageKey: '80' },
  '관리자2': { number: '90', role: 'admin', storageKey: '90' },
  '예산고': { number: '80', role: 'teacher', schoolName: '예산고등학교', storageKey: 'teacher-yesan-high' },
  '광시중': { number: '90', role: 'teacher', schoolName: '광시중학교', storageKey: 'teacher-gwangsi-middle' },
}

const normalizeName = (value) => String(value ?? '').trim().replaceAll(' ', '')
const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
const hashPin = async (pin, salt) => (await scrypt(`${pin}:${pinPepper.value()}`, salt, 64)).toString('hex')
const studentSchools = {
  'yesan-high': { name: '예산고등학교', count: 22, prefix: 'yesan' },
  'gwangsi-middle': { name: '광시중학교', count: 22, prefix: 'gwangsi' },
}
const yesanStudentSchool = { key: 'yesan-high', ...studentSchools['yesan-high'] }
const rejectedPinPatterns = new Set(['000000', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999', '012345', '123456', '234567', '345678', '456789', '987654', '876543', '765432', '654321', '543210'])
const createPin = (number, used) => {
  const rejected = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210'])
  while (true) {
    const suffix = String(randomInt(0, 10000)).padStart(4, '0')
    const pin = `${number}${suffix}`
    if (!rejected.has(suffix) && !used.has(pin)) return pin
  }
}
const createStudentPin = (used) => {
  while (true) {
    const pin = String(randomInt(0, 1000000)).padStart(6, '0')
    if (!rejectedPinPatterns.has(pin) && !used.has(pin)) return pin
  }
}
const requireMasterCode = (request) => {
  if (!safeEqual(request.data?.masterCode, masterUnlockCode.value())) throw new HttpsError('permission-denied', '관리자 코드가 올바르지 않습니다.')
}
const requireStudentSchool = (value) => {
  const school = String(value ?? '')
  const schoolConfig = studentSchools[school]
  if (!schoolConfig) throw new HttpsError('invalid-argument', '학교가 올바르지 않습니다.')
  return { school, schoolConfig }
}
const requireActiveAdminSession = async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Firebase 로그인이 필요합니다.')
  const session = await db.doc(`staffSessions/${request.auth.uid}`).get()
  const sessionData = session.data()
  if (!session.exists || sessionData?.role !== 'admin' || sessionData?.expiresAt?.toMillis?.() <= Date.now()) {
    throw new HttpsError('permission-denied', '마스터 권한이 필요합니다.')
  }
}
const sanitizeText = (value, max = 800) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
const requireInterviewUser = (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Firebase 로그인이 필요합니다.')
  return request.auth.uid
}
const parseInterviewJson = (text) => {
  try {
    const cleaned = String(text ?? '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    const decision = ['pass', 'hold', 'retry'].includes(parsed.decision) ? parsed.decision : 'hold'
    const feedbackTone = ['good', 'neutral', 'bad'].includes(parsed.feedbackTone) ? parsed.feedbackTone : decision === 'pass' ? 'good' : decision === 'retry' ? 'bad' : 'neutral'
    const parsedScore = Number.parseInt(parsed.score, 10)
    const score = Math.max(0, Math.min(100, Number.isFinite(parsedScore) ? parsedScore : 60))
    return {
      question: sanitizeText(parsed.question, 500),
      feedback: sanitizeText(parsed.feedback, 700),
      hint: sanitizeText(parsed.hint, 500),
      hintIntent: sanitizeText(parsed.hintIntent, 500),
      hintGuide: sanitizeText(parsed.hintGuide, 700),
      closingSummary: sanitizeText(parsed.closingSummary, 900),
      suggestedStrengths: Array.isArray(parsed.suggestedStrengths) ? parsed.suggestedStrengths.map((item) => sanitizeText(item, 40)).filter(Boolean).slice(0, 5) : [],
      decision,
      feedbackTone,
      score,
    }
  } catch {
    return { question: sanitizeText(text, 500), feedback: '', hint: '', hintIntent: '', hintGuide: '', closingSummary: '', suggestedStrengths: [], decision: 'hold', feedbackTone: 'neutral', score: 60 }
  }
}
const requireInterviewId = (value) => {
  const interviewId = sanitizeText(value, 90)
  if (!/^[a-zA-Z0-9_-]{8,90}$/.test(interviewId)) throw new HttpsError('invalid-argument', '면접 기록 ID가 올바르지 않습니다.')
  return interviewId
}
const sanitizeInterviewApplication = (application = {}) => ({
  role: sanitizeText(application.role, 80),
  difficulty: ['veryEasy', 'easy', 'medium', 'hard'].includes(application.difficulty) ? application.difficulty : 'easy',
  interestReason: sanitizeText(application.interestReason, 500),
  strengths: sanitizeText(application.strengths, 500),
  experience: sanitizeText(application.experience, 500),
  closingLine: sanitizeText(application.closingLine, 220),
})
const getDifficultyGuide = (difficulty = 'easy') => ({
  veryEasy: '난이도: 매우쉬움. 초등 고학년도 답할 수 있을 만큼 짧고 친절하게 묻습니다. 한 번에 하나만 묻고, 예시를 질문 안에 넣어 주세요. 압박 질문은 하지 마세요.',
  easy: '난이도: 쉬움. 중학생도 답할 수 있게 학교생활, 취미, 친구와 한 활동, 앞으로 해 보고 싶은 일을 중심으로 묻습니다.',
  medium: '난이도: 중간. 고등학생 수준으로 이유와 간단한 예시를 함께 말하게 하되, 실제 경력이나 전문 프로젝트는 요구하지 않습니다.',
  hard: '난이도: 어려움. 실제 면접 느낌을 조금 더 주되, 중고등학생이 답할 수 있는 범위 안에서 꼬리 질문을 합니다. 전문 경력, 포트폴리오, 기술 문제 해결 사례는 요구하지 않습니다.',
}[difficulty] || '난이도: 쉬움. 중학생도 답할 수 있게 학교생활, 취미, 친구와 한 활동, 앞으로 해 보고 싶은 일을 중심으로 묻습니다.')
const sanitizeInterviewTurns = (turns = []) => {
  if (!Array.isArray(turns)) throw new HttpsError('invalid-argument', '면접 기록 형식이 올바르지 않습니다.')
  return turns.slice(0, 20).map((turn) => ({
    question: sanitizeText(turn?.question, 500),
    answer: sanitizeText(turn?.answer, 1200),
    feedback: sanitizeText(turn?.feedback, 700),
  })).filter((turn) => turn.question && turn.answer)
}
const getAnswerEffortScore = (answer) => {
  const text = sanitizeText(answer, 1200)
  if (!text) return 0
  let score = Math.min(45, text.length * 1.4)
  if (/[.!?。？！요다까죠음함해요]$/.test(text)) score += 8
  if (/(왜냐|이유|관심|좋아|잘|해봤|경험|노력|배우|도움|책임|생각|앞으로|친구|학교|동아리)/.test(text)) score += 18
  if (/(돈|집에|몰라|없어|귀찮|장난|ㅋㅋ|ㅎㅎ|ㅋ|ㅎ|싫어|대충)/.test(text)) score -= 28
  if (text.length < 8) score -= 25
  return Math.max(0, Math.min(100, Math.round(score)))
}
const getInterviewDecision = (turns) => {
  if (!turns.length) return { decision: 'retry', score: 0 }
  const scores = turns.map((turn) => getAnswerEffortScore(turn.answer))
  const average = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
  if (average >= 70) return { decision: 'pass', score: average }
  if (average >= 45) return { decision: 'hold', score: average }
  return { decision: 'retry', score: average }
}
const getInterviewHintFallback = ({ role, currentQuestion }) => ({
  hint: `질문이 무엇을 보려는지 먼저 생각한 뒤, 학교나 일상에서 꺼낼 수 있는 작은 예시로 답해 보세요.`,
  hintIntent: `면접관은 ${role}에 관심을 가진 이유와 이 일에 필요한 태도를 스스로 생각해 봤는지 확인하려고 해요.`,
  hintGuide: `1) 이 일이 왜 궁금한지 말하기 2) 학교, 집, 친구와 한 활동 중 비슷한 장면 떠올리기 3) 아직 경험이 없으면 앞으로 해 보고 싶은 일을 말하기. ${role}와 정확히 맞지 않아도 괜찮아요.`,
  question: currentQuestion,
  feedback: '',
  closingSummary: '',
  suggestedStrengths: [],
  decision: 'hold',
  feedbackTone: 'neutral',
  score: 0,
  aiSource: 'fallback',
})
const getInterviewFallback = ({ company, role, application, turns, finished }) => {
  const strengths = ['의사소통능력', '책임감', '문제해결능력', '협업능력', '끈기']
  if (finished) {
    const result = getInterviewDecision(turns)
    const summary = result.decision === 'pass'
      ? `${company}의 ${role} 면접을 통과했어요. 답변에서 관심과 강점이 비교적 잘 드러났습니다.`
      : result.decision === 'hold'
        ? `${company}의 ${role} 면접은 보류예요. 방향은 보였지만 이유와 예시를 조금 더 구체적으로 말하면 좋아요.`
        : `${company}의 ${role} 면접은 재도전이 필요해요. 장난식 답변보다 내가 왜 관심 있는지와 무엇을 해 보고 싶은지 다시 말해 보세요.`
    return {
      question: '',
      feedback: result.decision === 'retry' ? '답변이 너무 짧거나 장난스럽게 보여요. 면접에서는 짧아도 진짜 이유를 말하는 게 중요해요.' : '끝까지 답변을 이어 간 점은 좋아요. 다음에는 구체적인 예시를 하나 더 붙여 보세요.',
      closingSummary: summary,
      suggestedStrengths: strengths.slice(0, 3),
      decision: result.decision,
      feedbackTone: result.decision === 'pass' ? 'good' : result.decision === 'retry' ? 'bad' : 'neutral',
      score: result.score,
      aiSource: 'fallback',
    }
  }
  const previousScore = turns.length ? getAnswerEffortScore(turns.at(-1)?.answer) : 100
  const questions = [
    application.difficulty === 'veryEasy' ? `${company}의 ${role} 일이 왜 조금이라도 궁금했나요? 짧게 말해 주세요.` : `${company}의 ${role}에 지원한 이유를 본인 말로 설명해 주세요.`,
    `다른 지원자보다 내가 조금 더 잘할 수 있는 점은 무엇이라고 생각하나요?`,
    application.difficulty === 'hard' ? `${role}로 일하는 사람에게 필요한 태도 한 가지를 고르고, 왜 중요하다고 생각하는지 말해 주세요.` : `${role}로 일하는 사람에게 어떤 태도나 장점이 필요할 것 같나요?`,
    `학교나 일상에서 ${role}와 조금이라도 연결해 볼 수 있는 경험이 있다면 말해 주세요. 없다면 앞으로 해 보고 싶은 경험을 말해도 좋아요.`,
    `${company}에서 ${role} 일을 하게 된다면 가장 먼저 배워 보고 싶은 것은 무엇인가요?`,
    `지금까지 답변한 내용을 바탕으로 면접관에게 꼭 전하고 싶은 말을 해 주세요.`,
  ]
  const index = Math.min(turns.length, questions.length - 1)
  return {
    question: questions[index],
    feedback: turns.length ? previousScore < 40 ? '방금 답변은 너무 짧거나 장난스럽게 들릴 수 있어요. 다음 답변은 진짜 이유나 예시를 한 문장만 더 붙여 보세요.' : '방금 답변에서 방향은 보였어요. 다음 답변에는 구체적인 예시를 하나 붙이면 더 좋아요.' : '',
    closingSummary: '',
    suggestedStrengths: application.strengths ? strengths.slice(0, 3) : strengths.slice(0, 2),
    decision: 'hold',
    feedbackTone: turns.length ? previousScore < 40 ? 'bad' : previousScore >= 70 ? 'good' : 'neutral' : 'neutral',
    score: 0,
    aiSource: 'fallback',
  }
}
const callInterviewAi = async ({ company, role, application, turns, finished, mode = 'interview', currentQuestion = '' }) => {
  let apiKey = ''
  try {
    apiKey = openaiApiKey.value()
  } catch {
    apiKey = ''
  }
  if (!apiKey) return mode === 'hint' ? getInterviewHintFallback({ role, currentQuestion }) : getInterviewFallback({ company, role, application, turns, finished })
  const transcript = turns.map((turn, index) => `${index + 1}. 면접관: ${turn.question}\n지원자: ${turn.answer}`).join('\n')
const prompt = mode === 'hint' ? `청소년 진로 프로그램의 AI 채용면접 도우미로 행동하세요.
지원자는 중학생 또는 고등학생입니다. 답을 대신 써 주지 마세요. 현재 면접관 질문의 의도와 답변 가이드만 한국어로 알려 주세요.
${getDifficultyGuide(application.difficulty)}
힌트는 학교 수업, 동아리, 친구와 한 활동, 집에서 해 본 일, 좋아하는 활동, 앞으로 해 보고 싶은 경험에서 찾도록 안내하세요.
hintIntent에는 면접관이 이 질문으로 확인하려는 것을 1~2문장으로 적으세요.
hintGuide에는 학생이 답변을 만들 때 따라갈 순서를 2~3단계로 적으세요. 완성 답안 문장은 쓰지 마세요.
질문: ${currentQuestion}
회사: ${company}
지원 직무: ${role}
간단 지원서: ${JSON.stringify(application)}
지금까지의 면접:
${transcript || '아직 답변 없음'}
반드시 JSON만 출력하세요. 형식: {"hint":"", "hintIntent":"", "hintGuide":""}` : `청소년 진로 프로그램의 AI 채용면접관으로 행동하세요.
지원자는 실제 채용면접에 지원했다고 가정합니다. 직업정보 Q&A, 직업인 역할극, 업무상황 체험이 아니라 채용면접입니다.
대상은 중학생 또는 고등학생입니다. 실제 회사 경력, 전문 프로젝트 수행 경험, 포트폴리오, 연구·개발 실적, 기술적 문제 해결 사례가 있다고 전제하지 마세요.
${getDifficultyGuide(application.difficulty)}
질문은 학생이 답할 수 있는 수준으로 만드세요. 학교 수업, 동아리, 친구와 한 활동, 집에서 해 본 일, 좋아하는 활동, 앞으로 해 보고 싶은 경험, 왜 관심이 생겼는지를 중심으로 물어보세요.
금지 질문 예시: "수행했던 프로젝트를 설명하세요", "가장 도전적이었던 프로젝트는?", "기술적 문제를 어떻게 해결했나요?", "전문성을 어떻게 개발하고 있나요?", "연구나 개발 분야가 있나요?"
직무가 전문적이어도 질문은 "이 일을 한다면 어떤 점이 재미있을 것 같나요?", "비슷하게 해 본 작은 경험이 있나요? 없다면 해 보고 싶은 일은 무엇인가요?", "이 직업에 필요한 태도는 무엇이라고 생각하나요?"처럼 바꾸세요.
평가처럼 겁주지는 말되, 답변이 너무 짧거나 장난스럽거나 질문과 무관하면 "좋아요"로 시작하지 말고 분명히 다시 답하라고 안내하세요. 개인정보, 연락처, 주민번호, 실제 주소는 요구하지 마세요.
면접은 고정 5문항이 아니라 라이브 채팅처럼 이어집니다. 이전 답변을 바탕으로 자연스럽게 후속 질문을 하되, 같은 주제를 반복하지 마세요. 7문항 이후에는 마무리해도 좋다는 짧은 안내를 feedback에 넣을 수 있습니다.
면접 종료 시 decision은 pass, hold, retry 중 하나로 판정하세요. pass는 답변이 구체적이고 진지할 때, hold는 방향은 있으나 보완이 필요할 때, retry는 장난·무성의·무관한 답변이 많을 때입니다. score는 0~100 정수입니다.
feedbackTone은 직전 답변 피드백의 색상입니다. 좋은 답변이면 good, 보완이 필요하면 neutral, 장난·무성의·질문과 무관한 답변이면 bad로 주세요.
점수는 지원 이유 25점, 내 강점 표현 25점, 학교·일상 경험이나 앞으로의 계획 25점, 질문에 맞춘 성실한 태도 25점으로 계산하세요. 답변이 장난스럽거나 지나치게 짧거나 질문과 무관하면 해당 항목을 낮게 주세요.
회사: ${company}
지원 직무: ${role}
간단 지원서: ${JSON.stringify(application)}
지금까지의 면접:
${transcript || '아직 답변 없음'}
${finished ? '면접을 종료하고 최종 피드백을 작성하세요.' : '다음 면접 질문 1개를 작성하세요. 이전 답변이 있다면 짧은 피드백도 함께 주세요. 다음 질문은 반드시 중고등학생이 자신의 학교생활·일상·관심·앞으로의 계획으로 답할 수 있어야 합니다.'}
반드시 JSON만 출력하세요. 형식: {"question":"", "feedback":"", "feedbackTone":"neutral", "closingSummary":"", "suggestedStrengths":[""], "decision":"hold", "score":60}`
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_output_tokens: 700,
    }),
  })
  if (!response.ok) return mode === 'hint' ? getInterviewHintFallback({ role, currentQuestion }) : getInterviewFallback({ company, role, application, turns, finished })
  try {
    const data = await response.json()
    const outputText = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? '').join('\n') ?? ''
    return { ...parseInterviewJson(outputText), aiSource: 'openai' }
  } catch {
    return mode === 'hint' ? getInterviewHintFallback({ role, currentQuestion }) : getInterviewFallback({ company, role, application, turns, finished })
  }
}

export const runAiInterviewStep = onCall({ secrets: [openaiApiKey] }, async (request) => {
  const uid = requireInterviewUser(request)
  const interviewId = requireInterviewId(request.data?.interviewId)
  const company = sanitizeText(request.data?.company, 80)
  const schoolName = sanitizeText(request.data?.schoolName, 40)
  const displayName = sanitizeText(request.data?.displayName, 40)
  const application = sanitizeInterviewApplication(request.data?.application)
  const turns = sanitizeInterviewTurns(request.data?.turns)
  const finished = request.data?.finished === true
  const mode = request.data?.mode === 'hint' ? 'hint' : 'interview'
  const currentQuestion = sanitizeText(request.data?.currentQuestion, 500)
  if (!company || !application.role) throw new HttpsError('invalid-argument', '회사와 지원 직무를 선택해 주세요.')
  if (finished && !turns.length) throw new HttpsError('failed-precondition', '면접 답변이 아직 없습니다.')

  const aiResult = await callInterviewAi({ company, role: application.role, application, turns, finished, mode, currentQuestion })
  if (mode === 'hint') {
    return {
      interviewId,
      question: currentQuestion,
      feedback: '',
      hint: aiResult.hint,
      hintIntent: aiResult.hintIntent,
      hintGuide: aiResult.hintGuide,
      closingSummary: '',
      suggestedStrengths: [],
      decision: 'hold',
      feedbackTone: 'neutral',
      score: 0,
      aiSource: aiResult.aiSource,
      status: 'inProgress',
    }
  }
  const recordRef = db.doc(`aiInterviewLogs/${uid}_${interviewId}`)
  await recordRef.set({
    userId: uid,
    interviewId,
    company,
    schoolName,
    displayName,
    application,
    turns,
    status: finished ? 'completed' : 'inProgress',
    lastQuestion: finished ? '' : aiResult.question,
    lastFeedback: aiResult.feedback,
    closingSummary: aiResult.closingSummary,
    suggestedStrengths: aiResult.suggestedStrengths,
    decision: aiResult.decision,
    feedbackTone: aiResult.feedbackTone,
    score: aiResult.score,
    aiSource: aiResult.aiSource,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  return {
    interviewId,
    question: finished ? '' : aiResult.question,
    feedback: aiResult.feedback,
    hint: aiResult.hint,
    hintIntent: aiResult.hintIntent,
    hintGuide: aiResult.hintGuide,
    closingSummary: aiResult.closingSummary,
    suggestedStrengths: aiResult.suggestedStrengths,
    decision: aiResult.decision,
    feedbackTone: aiResult.feedbackTone,
    score: aiResult.score,
    aiSource: aiResult.aiSource,
    status: finished ? 'completed' : 'inProgress',
  }
})
const createStudentAccountRecord = async (school, schoolConfig, accountNumber, used) => {
  const pin = createStudentPin(used)
  used.add(pin)
  const pinSalt = randomBytes(16).toString('hex')
  const pinHash = await hashPin(pin, pinSalt)
  return {
    pin,
    record: {
      accountNumber,
      school,
      schoolName: schoolConfig.name,
      displayName: null,
      currentPin: pin,
      pinSalt,
      pinHash,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
  }
}
const studentAccountId = (schoolConfig, accountNumber) => `${schoolConfig.prefix}-${accountNumber}`

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

const bootstrapStudentAccountsForSchool = async (request, targetSchool = request.data?.school) => {
  await requireActiveAdminSession(request)
  const { school, schoolConfig } = requireStudentSchool(targetSchool)
  const used = new Set()
  const credentials = []
  const batch = db.batch()
  for (let index = 1; index <= schoolConfig.count; index += 1) {
    const accountNumber = String(index).padStart(2, '0')
    const accountRef = db.doc(`studentAccounts/${studentAccountId(schoolConfig, accountNumber)}`)
    if ((await accountRef.get()).exists) continue
    const created = await createStudentAccountRecord(school, schoolConfig, accountNumber, used)
    batch.create(accountRef, created.record)
    credentials.push({ accountNumber, pin: created.pin })
  }
  if (credentials.length) await batch.commit()
  return { credentials }
}

export const bootstrapYesanStudentAccounts = onCall({ secrets: [pinPepper] }, async (request) => bootstrapStudentAccountsForSchool(request, 'yesan-high'))

export const bootstrapStudentAccounts = onCall({ secrets: [pinPepper] }, async (request) => bootstrapStudentAccountsForSchool(request))

export const listStudentPinAccounts = onCall(async (request) => {
  await requireActiveAdminSession(request)
  const { school } = requireStudentSchool(request.data?.school)
  const accounts = await db.collection('studentAccounts').where('school', '==', school).get()
  return {
    accounts: accounts.docs.map((account) => {
      const data = account.data()
      return { id: account.id, accountNumber: data.accountNumber, displayName: data.displayName ?? '', currentPin: data.currentPin ?? '', active: data.active !== false }
    }).sort((left, right) => String(left.accountNumber).localeCompare(String(right.accountNumber), 'ko')),
  }
})

export const resetStudentPinAccount = onCall({ secrets: [pinPepper] }, async (request) => {
  await requireActiveAdminSession(request)
  const accountId = String(request.data?.accountId ?? '')
  const accountRef = db.doc(`studentAccounts/${accountId}`)
  const snapshot = await accountRef.get()
  if (!snapshot.exists) throw new HttpsError('not-found', '학생 계정을 찾을 수 없습니다.')
  const data = snapshot.data()
  const { schoolConfig } = requireStudentSchool(data.school)
  const used = new Set()
  const created = await createStudentAccountRecord(data.school, schoolConfig, data.accountNumber, used)
  await accountRef.update({ currentPin: created.pin, pinSalt: created.record.pinSalt, pinHash: created.record.pinHash, active: true, updatedAt: FieldValue.serverTimestamp() })
  return { account: { id: accountId, accountNumber: data.accountNumber, displayName: data.displayName ?? '', currentPin: created.pin, active: true } }
})

export const resetStudentPinAccounts = onCall({ secrets: [pinPepper] }, async (request) => {
  await requireActiveAdminSession(request)
  const { school, schoolConfig } = requireStudentSchool(request.data?.school)
  const accounts = await db.collection('studentAccounts').where('school', '==', school).get()
  const used = new Set()
  const batch = db.batch()
  const credentials = []
  for (const account of accounts.docs) {
    const data = account.data()
    const created = await createStudentAccountRecord(school, schoolConfig, data.accountNumber, used)
    batch.update(account.ref, { currentPin: created.pin, pinSalt: created.record.pinSalt, pinHash: created.record.pinHash, active: true, updatedAt: FieldValue.serverTimestamp() })
    credentials.push({ accountNumber: data.accountNumber, displayName: data.displayName ?? '', pin: created.pin })
  }
  if (credentials.length) await batch.commit()
  return { credentials: credentials.sort((left, right) => String(left.accountNumber).localeCompare(String(right.accountNumber), 'ko')) }
})

export const updateSessionLock = onCall(async (request) => {
  await requireActiveAdminSession(request)
  const sessionNumber = Number(request.data?.sessionNumber)
  const target = String(request.data?.target ?? '')
  const unlocked = request.data?.unlocked === true
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 5) {
    throw new HttpsError('invalid-argument', '회기 번호가 올바르지 않습니다.')
  }
  if (!['yesan', 'gwangsi', 'mentor'].includes(target)) {
    throw new HttpsError('invalid-argument', '공개 대상을 확인해 주세요.')
  }
  const lockRef = db.doc('system/sessionLocks')
  const snapshot = await lockRef.get()
  const current = snapshot.data()?.sessions ?? {}
  const legacy = typeof current['1'] === 'boolean'
  const nextSessions = legacy
    ? { yesan: { ...current }, gwangsi: { ...current }, mentor: { ...current } }
    : { ...current }
  await lockRef.set({
    sessions: {
      ...nextSessions,
      [target]: { ...(nextSessions[target] ?? {}), [String(sessionNumber)]: unlocked },
    },
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid,
  }, { merge: true })
  return { sessionNumber, target, unlocked }
})

export const backupAuctionData = onCall(async (request) => {
  await requireActiveAdminSession(request)
  const [roomSnapshot, resultSnapshot] = await Promise.all([
    db.collection('auctionRooms').get(),
    db.collection('auctionResults').get(),
  ])
  const rooms = await Promise.all(roomSnapshot.docs.map(async (roomDocument) => {
    const participants = await roomDocument.ref.collection('participants').get()
    return {
      id: roomDocument.id,
      data: roomDocument.data(),
      participants: participants.docs.map((participant) => ({ id: participant.id, data: participant.data() })),
    }
  }))
  const results = resultSnapshot.docs.map((result) => ({ id: result.id, data: result.data() }))
  const backupRef = db.collection('auctionBackups').doc()
  const backup = {
    createdAt: FieldValue.serverTimestamp(),
    createdBy: request.auth.uid,
    roomCount: rooms.length,
    participantCount: rooms.reduce((sum, room) => sum + room.participants.length, 0),
    resultCount: results.length,
    rooms,
    results,
  }
  if (Buffer.byteLength(JSON.stringify(backup), 'utf8') > 900000) {
    throw new HttpsError('resource-exhausted', '백업 자료가 너무 커서 한 번에 저장할 수 없습니다.')
  }
  await backupRef.create(backup)
  return { backupId: backupRef.id, roomCount: backup.roomCount, participantCount: backup.participantCount, resultCount: backup.resultCount }
})

export const recoverAuctionResults = onCall(async (request) => {
  await requireActiveAdminSession(request)
  const backupId = String(request.data?.backupId ?? '').trim()
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(backupId)) throw new HttpsError('invalid-argument', '백업 ID를 확인해 주세요.')
  const backupSnapshot = await db.doc(`auctionBackups/${backupId}`).get()
  if (!backupSnapshot.exists) throw new HttpsError('not-found', '경매 백업을 찾을 수 없습니다.')
  const backup = backupSnapshot.data()
  const rooms = Array.isArray(backup?.rooms) ? backup.rooms : []
  const existingResults = await db.collection('auctionResults').get()
  const existingIds = new Set(existingResults.docs.map((document) => document.id))
  const recoverable = rooms.flatMap((room) => {
    const participants = Array.isArray(room?.participants) ? room.participants : []
    return participants.filter((participant) => participant?.data?.role === 'participant').map((participant) => ({ room, participant }))
  }).filter(({ room, participant }) => !existingIds.has(`${room.id}_${participant.id}`))
  if (recoverable.length > 450) throw new HttpsError('resource-exhausted', '복구할 자료가 너무 많습니다.')
  const batch = db.batch()
  for (const { room, participant } of recoverable) {
    const roomData = room.data ?? {}
    const data = participant.data ?? {}
    batch.create(db.doc(`auctionResults/${room.id}_${participant.id}`), {
      userId: participant.id,
      roomCode: room.id,
      displayName: data.nickname ?? '참가자',
      selectedJob: data.selectedJob ?? '',
      balance: Number(data.balance ?? 0),
      inventory: data.inventory ?? {},
      selectedJobs: roomData.selectedJobs ?? [],
      deck: roomData.deck ?? [],
      auctionIndex: Number(roomData.auctionIndex ?? 0),
      totalItems: Number(roomData.totalItems ?? 0),
      endedByHost: roomData.endedByHost === true,
      recovered: true,
      recoveredFromBackup: backupId,
      originalGameState: roomData.gameState ?? '',
      savedAt: FieldValue.serverTimestamp(),
    })
  }
  if (recoverable.length) await batch.commit()
  return { backupId, recoveredCount: recoverable.length, skippedCount: existingResults.size }
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
    schoolName: account.schoolName ?? null,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 12 * 60 * 60 * 1000),
  })
  return { role: verified.account.role, displayName }
})

export const studentLogin = onCall({ secrets: [pinPepper] }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Firebase 로그인이 필요합니다.')
  const school = String(request.data?.school ?? '')
  const pin = String(request.data?.pin ?? '')
  const requestedName = String(request.data?.name ?? '').trim().replace(/\s+/g, ' ')
  const { schoolConfig } = requireStudentSchool(school)
  if (!/^\d{6}$/.test(pin)) throw new HttpsError('invalid-argument', '학교 또는 PIN이 올바르지 않습니다.')
  if (requestedName && (requestedName.length < 2 || requestedName.length > 20)) throw new HttpsError('invalid-argument', '이름은 2~20자로 입력해 주세요.')

  const accounts = await db.collection('studentAccounts').where('school', '==', school).where('active', '==', true).get()
  let matched = null
  for (const account of accounts.docs) {
    const data = account.data()
    if (!data.pinSalt || !data.pinHash) continue
    const candidateHash = await hashPin(pin, data.pinSalt)
    if (safeEqual(candidateHash, data.pinHash)) {
      matched = { ref: account.ref, data }
      break
    }
  }
  if (!matched) throw new HttpsError('permission-denied', 'PIN이 올바르지 않습니다.')

  const sessionRef = db.doc(`studentSessions/${request.auth.uid}`)
  if (matched.data.displayName) {
    await sessionRef.set({
      userId: request.auth.uid,
      accountNumber: matched.data.accountNumber,
      displayName: matched.data.displayName,
      school,
      schoolName: schoolConfig.name,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    return { needsName: false, displayName: matched.data.displayName, schoolName: schoolConfig.name }
  }
  if (!requestedName) return { needsName: true }

  const displayName = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(matched.ref)
    if (!snapshot.exists || !snapshot.data().active) throw new HttpsError('permission-denied', '사용할 수 없는 PIN입니다.')
    const currentName = snapshot.data().displayName
    if (currentName && currentName !== requestedName) throw new HttpsError('already-exists', '이미 다른 이름으로 등록된 PIN입니다.')
    if (!currentName) transaction.update(matched.ref, { displayName: requestedName, registeredBy: request.auth.uid, registeredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() })
    transaction.set(sessionRef, {
      userId: request.auth.uid,
      accountNumber: snapshot.data().accountNumber,
      displayName: currentName || requestedName,
      school,
      schoolName: schoolConfig.name,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    return currentName || requestedName
  })
  return { needsName: false, displayName, schoolName: schoolConfig.name }
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
  const requestedTotalItems = Number(request.data?.totalItems)
  if (!Number.isInteger(initialMoney) || initialMoney < 500 || initialMoney > 10000 || ![7, 10, 15].includes(bidLimit) || !Number.isInteger(requestedTotalItems) || requestedTotalItems < 1 || requestedTotalItems > 200) throw new HttpsError('invalid-argument', '게임 설정값이 올바르지 않습니다.')
  const participants = await roomRef.collection('participants').get()
  const playerCount = participants.docs.filter((item) => item.data().role === 'participant').length
  if (!playerCount) throw new HttpsError('failed-precondition', '참가자가 한 명 이상 필요합니다.')
  await db.runTransaction(async (transaction) => {
    const room = await transaction.get(roomRef)
    if (!room.exists || room.data().hostId !== uid) throw new HttpsError('permission-denied', '방장만 게임을 시작할 수 있습니다.')
    if (room.data().gameState !== 'WAITING') throw new HttpsError('failed-precondition', '이미 시작된 게임입니다.')
    transaction.update(roomRef, { gameState: 'JOB_SELECTION', initialMoney, bidLimit, totalItems: requestedTotalItems, voteEndsAt: Timestamp.fromMillis(Date.now() + 30000), updatedAt: FieldValue.serverTimestamp() })
    for (const participant of participants.docs) transaction.update(participant.ref, { balance: initialMoney, inventory: {}, selectedJob: null, updatedAt: FieldValue.serverTimestamp() })
  })
  return { started: true }
})

export const castAuctionVote = onCall(async (request) => {
  const { uid, roomRef } = requireAuctionUser(request)
  const job = normalizeAuctionJob(request.data?.job)
  if (!isValidAuctionJob(job)) throw new HttpsError('invalid-argument', '직업은 24자 이내로 입력해 주세요.')
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
  const selectedJobs = participantDocs.map((participant) => {
    const selectedJob = normalizeAuctionJob(participant.data().selectedJob)
    return isValidAuctionJob(selectedJob) ? selectedJob : auctionJobNames[randomInt(0, auctionJobNames.length)]
  })
  const deck = shuffledAuctionDeck(selectedJobs, room.data().totalItems)
  const batch = db.batch()
  participantDocs.forEach((participant, index) => batch.update(participant.ref, { selectedJob: selectedJobs[index], updatedAt: FieldValue.serverTimestamp() }))
  batch.update(roomRef, { gameState: 'COUNTDOWN', selectedJob: null, selectedJobs, deck, auctionIndex: 0, currentPrice: 50, highestBidderId: null, highestBidderName: null, countdownEndsAt: Timestamp.fromMillis(Date.now() + 10000), updatedAt: FieldValue.serverTimestamp() })
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
  if (!Number.isInteger(amount) || amount < 50) throw new HttpsError('invalid-argument', '입찰 금액이 올바르지 않습니다.')
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
    if (data.highestBidderId === uid) throw new HttpsError('failed-precondition', '현재 최고 입찰자는 추가 입찰을 할 수 없습니다.')
    const invalidBid = data.highestBidderId ? amount <= data.currentPrice : amount < data.currentPrice
    if (invalidBid || amount > player.balance) throw new HttpsError('failed-precondition', '입찰 금액이나 잔액을 확인해 주세요.')
    if ((player.inventory?.[strength] ?? 0) >= 3) throw new HttpsError('failed-precondition', '이미 최고 등급인 강점입니다.')
    const remaining = data.auctionEndsAt.toMillis() - now
    transaction.update(roomRef, { currentPrice: amount, highestBidderId: uid, highestBidderName: player.nickname, auctionEndsAt: remaining <= 2000 ? Timestamp.fromMillis(now + 5000) : data.auctionEndsAt, updatedAt: FieldValue.serverTimestamp() })
  })
  return { accepted: true }
})

export const settleAuctionItem = onCall(async (request) => {
  const { roomRef } = requireAuctionUser(request)
  await db.runTransaction(async (transaction) => {
    const [room, participants] = await Promise.all([transaction.get(roomRef), transaction.get(roomRef.collection('participants'))])
    if (!room.exists || room.data().gameState !== 'AUCTION') return
    const data = room.data()
    if (data.auctionEndsAt.toMillis() > Date.now()) throw new HttpsError('failed-precondition', '아직 입찰 시간이 남아 있습니다.')
    const participantOverrides = {}
    if (data.highestBidderId) {
      const winnerRef = roomRef.collection('participants').doc(data.highestBidderId)
      const winner = await transaction.get(winnerRef)
      if (winner.exists) {
        const strength = data.deck[data.auctionIndex]
        const inventory = { ...winner.data().inventory, [strength]: Math.min(3, (winner.data().inventory?.[strength] ?? 0) + 1) }
        const balance = winner.data().balance - data.currentPrice
        participantOverrides[data.highestBidderId] = { balance, inventory }
        transaction.update(winnerRef, { balance, inventory, updatedAt: FieldValue.serverTimestamp() })
      }
    }
    const gameState = allParticipantMoneySpent(participants, data.highestBidderId, data.highestBidderId ? data.currentPrice : 0) ? 'RESULT' : 'SOLD'
    transaction.update(roomRef, { gameState, updatedAt: FieldValue.serverTimestamp() })
    if (gameState === 'RESULT') writeAuctionResults(transaction, roomRef, data, participants, participantOverrides)
  })
  return { settled: true }
})

export const advanceAuctionItem = onCall(async (request) => {
  const { uid, roomRef } = requireAuctionUser(request)
  await db.runTransaction(async (transaction) => {
    const [room, participants] = await Promise.all([transaction.get(roomRef), transaction.get(roomRef.collection('participants'))])
    if (!room.exists || room.data().hostId !== uid) throw new HttpsError('permission-denied', '방장만 다음 상품으로 진행할 수 있습니다.')
    const data = room.data()
    if (data.gameState !== 'SOLD') throw new HttpsError('failed-precondition', '낙찰 처리가 완료되지 않았습니다.')
    const nextIndex = data.auctionIndex + 1
    const shouldEnd = nextIndex >= data.totalItems || allParticipantMoneySpent(participants, null, 0)
    transaction.update(roomRef, shouldEnd ? { gameState: 'RESULT', auctionIndex: nextIndex, updatedAt: FieldValue.serverTimestamp() } : { gameState: 'COUNTDOWN', auctionIndex: nextIndex, currentPrice: 50, highestBidderId: null, highestBidderName: null, countdownEndsAt: Timestamp.fromMillis(Date.now() + 10000), updatedAt: FieldValue.serverTimestamp() })
    if (shouldEnd) writeAuctionResults(transaction, roomRef, { ...data, auctionIndex: nextIndex }, participants)
  })
  return { advanced: true }
})

export const endAuctionGame = onCall(async (request) => {
  const { uid, roomRef } = requireAuctionUser(request)
  await db.runTransaction(async (transaction) => {
    const [room, participants] = await Promise.all([transaction.get(roomRef), transaction.get(roomRef.collection('participants'))])
    if (!room.exists || room.data().hostId !== uid) throw new HttpsError('permission-denied', '방장만 게임을 종료할 수 있습니다.')
    if (room.data().gameState === 'WAITING') throw new HttpsError('failed-precondition', '게임 시작 후 종료할 수 있습니다.')
    transaction.update(roomRef, { gameState: 'RESULT', endedByHost: true, updatedAt: FieldValue.serverTimestamp() })
    writeAuctionResults(transaction, roomRef, { ...room.data(), endedByHost: true }, participants)
  })
  return { ended: true }
})
