import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth'
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import './App.css'
import { auth, db, functions, isFirebaseConfigured } from './lib/firebase'
import { auctionJobs, createAuctionDeckForJobs, jobStrengthProfiles } from './data/auction'
import chungcheongnamdoLogo from './assets/chungcheongnamdo.png'
import educationOfficeLogo from './assets/chungnam-education-office.png'
import socialServiceLogo from './assets/chungnam-social-service.png'
import youthCenterLogo from './assets/yesan-youth-center.png'

type Session = { number: number; title: string; subtitle: string; status: 'done' | 'open' | 'locked'; icon: string }
type SessionTemplate = Omit<Session, 'status'>
type PreferenceChoice = 'like' | 'neutral' | 'dislike' | 'unsure'
type PreferenceArea = { id: string; tag: 'R' | 'I' | 'A' | 'S' | 'E' | 'C'; title: string; icon: string; guide: string; questions: string[] }
type GuidePage = 'program' | 'profile' | 'mentors' | 'center'
type ProfilePayload = { introduction: string; interests: string; hopeJob: string; oneLineIntro: string; schoolMajor: string; majorReason: string; careerInterests: string; campusLife: string; strengths: string; message: string }
type MentorProfile = { id: string; displayName: string; oneLineIntro?: string; schoolMajor?: string; interests?: string; majorReason?: string; careerInterests?: string; campusLife?: string; strengths?: string; message?: string; major?: string; university?: string; introduction?: string; careerStory?: string }
const sessionTemplates: SessionTemplate[] = [
  { number: 1, title: '청사진을 위한 첫 만남', subtitle: '나와 멘토, 새로운 가능성을 만나요', icon: '👋' },
  { number: 2, title: '선호와 강점 탐색', subtitle: '좋아하는 것과 나만의 강점을 발견해요', icon: '✨' },
  { number: 3, title: '진로 역량 갖추기', subtitle: '희망 직업에 필요한 힘을 찾아봐요', icon: '🧩' },
  { number: 4, title: '직업 탐색과 AI 면접', subtitle: 'AI 면접관과 미래의 나를 연습해요', icon: '💬' },
  { number: 5, title: '나만의 청사진 만들기', subtitle: '활동을 모아 미래 포트폴리오를 완성해요', icon: '🗺️' },
]

const firstSessionActivities = [
  { duration: '5분', title: '사전 설문지 작성', description: '활동을 시작하기 전, 나의 진로 역량을 돌아보고 설문에 답했어요.' },
  { duration: '15분', title: '오리엔테이션 및 안전교육', description: '예산군청소년수련관과 청·사·진 프로그램의 전체 여정을 알아보고 안전수칙을 확인했어요.' },
  { duration: '10분', title: '멘토 소개', description: '멘토의 전공과 대학생활, 전공을 선택한 계기와 진로 경험을 들었어요.' },
  { duration: '40분', title: '멘토와의 첫 만남', description: '랜덤 질문을 뽑아 관심사와 경험, 강점과 꿈을 이야기하며 서로를 알아갔어요.' },
  { duration: '20분', title: '진로와 직업', description: '퀴즈와 짧은 이야기를 통해 진로와 직업의 의미를 생각해 봤어요.' },
  { duration: '10분', title: '활동 마무리', description: '궁금한 점을 나누고 다음 회기인 선호와 강점 탐색 활동을 확인했어요.' },
]

const testParticipants = [
  { school: 'yesan-high', name: '1', pin: '1' },
  { school: 'gwangsi-middle', name: '1', pin: '1' },
]

const preferenceAreas: PreferenceArea[] = [
  { id: 'making', tag: 'R', title: '직접 해보기', icon: '🔧', guide: '직접 만들고, 움직이고, 다루는 활동에 대해 나는 어떻게 느끼나요?', questions: ['도구를 사용해서 무언가 직접 만들기', '기계나 장비를 직접 다루어 보기', '몸을 움직이며 활동하기', '고장 난 물건의 문제를 찾아 고쳐보기'] },
  { id: 'exploring', tag: 'I', title: '알아보고 해결하기', icon: '🔎', guide: '궁금한 것을 알아보고 문제를 해결하는 활동에 대해 나는 어떻게 느끼나요?', questions: ['궁금한 것이 생기면 이유나 원인을 찾아보기', '어려운 문제의 해결방법을 생각해 보기', '관심 있는 주제의 정보를 찾아보기', '실험이나 관찰을 통해 결과를 확인하기'] },
  { id: 'expressing', tag: 'A', title: '자유롭게 표현하기', icon: '🎨', guide: '내 생각과 아이디어를 자유롭게 표현하는 활동에 대해 나는 어떻게 느끼나요?', questions: ['그림이나 디자인으로 생각을 표현하기', '글이나 이야기를 만들어 보기', '사진이나 영상을 직접 만들어 보기', '정해진 방법보다 내 방식으로 새롭게 만들어 보기'] },
  { id: 'together', tag: 'S', title: '함께하고 도와주기', icon: '🤝', guide: '다른 사람과 이야기하고 함께하는 활동에 대해 나는 어떻게 느끼나요?', questions: ['다른 사람의 고민이나 이야기를 들어주기', '내가 알고 있는 것을 다른 사람에게 알려주기', '친구들과 힘을 합쳐 함께 활동하기', '도움이 필요한 사람을 도와주기'] },
  { id: 'challenging', tag: 'E', title: '도전하고 이끌기', icon: '🚀', guide: '새로운 일에 도전하고 사람들과 함께 목표를 이루는 활동에 대해 나는 어떻게 느끼나요?', questions: ['사람들 앞에서 내 생각을 이야기하기', '모둠이나 팀에서 사람들을 이끌어 보기', '다른 사람에게 내 생각을 설명하고 설득하기', '목표를 정하고 경쟁하거나 도전하기'] },
  { id: 'organizing', tag: 'C', title: '계획하고 정리하기', icon: '🗂️', guide: '계획을 세우고 꼼꼼하게 정리하는 활동에 대해 나는 어떻게 느끼나요?', questions: ['해야 할 일을 순서대로 계획하기', '자료나 물건을 기준에 맞게 정리하기', '정해진 방법이나 순서에 따라 정확하게 진행하기', '실수한 부분이 없는지 꼼꼼하게 확인하기'] },
]

function PartnerFooter() {
  return (
    <footer className="partner-footer">
      <div className="partner-footer-inner">
        <p>함께하는 기관</p>
        <div className="partner-logos">
          <div className="partner-logo"><img src={chungcheongnamdoLogo} alt="충청남도" /></div>
          <div className="partner-logo"><img src={educationOfficeLogo} alt="충청남도교육청" /></div>
          <div className="partner-logo social-service-logo"><img src={socialServiceLogo} alt="충남사회서비스원" /></div>
          <div className="partner-logo"><img src={youthCenterLogo} alt="예산군청소년수련관" /></div>
        </div>
      </div>
    </footer>
  )
}

function ProfileEditor({ kind, displayName, schoolName, existing, onSave }: { kind: 'student' | 'mentor'; displayName: string; schoolName: string; existing?: MentorProfile; onSave: (profile: ProfilePayload) => Promise<void> }) {
  const [introduction, setIntroduction] = useState('')
  const [interests, setInterests] = useState('')
  const [hopeJob, setHopeJob] = useState('')
  const [oneLineIntro, setOneLineIntro] = useState('')
  const [schoolMajor, setSchoolMajor] = useState('')
  const [majorReason, setMajorReason] = useState('')
  const [careerInterests, setCareerInterests] = useState('')
  const [campusLife, setCampusLife] = useState('')
  const [strengths, setStrengths] = useState('')
  const [message, setMessage] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (!existing) return
    setOneLineIntro(existing.oneLineIntro ?? '')
    setSchoolMajor(existing.schoolMajor ?? [existing.university, existing.major].filter(Boolean).join(' / '))
    setInterests(existing.interests ?? '')
    setMajorReason(existing.majorReason ?? '')
    setCareerInterests(existing.careerInterests ?? '')
    setCampusLife(existing.campusLife ?? existing.careerStory ?? '')
    setStrengths(existing.strengths ?? '')
    setMessage(existing.message ?? existing.introduction ?? '')
  }, [existing])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaveState('saving')
    try {
      await onSave({ introduction, interests, hopeJob, oneLineIntro, schoolMajor, majorReason, careerInterests, campusLife, strengths, message })
      setSaveState('saved')
    } catch (error) {
      console.error(error)
      setSaveState('error')
    }
  }

  return <form className="profile-editor" onSubmit={submit}>
    <div className="profile-identity"><span>{kind === 'mentor' ? '🤝' : '👤'}</span><div><small>{kind === 'mentor' ? '멘토/관리자 프로필' : schoolName}</small><h2>{displayName}</h2></div></div>
    {kind === 'mentor' ? <div className="profile-field-grid mentor-fields"><label className="wide">1. 한 줄 소개 <small>나를 잘 보여주는 짧은 문장을 적어 주세요.</small><input value={oneLineIntro} onChange={(event) => setOneLineIntro(event.target.value)} maxLength={80} placeholder="예: 사람과 이야기를 좋아하는 사회복지학과 멘토입니다." /></label><label className="wide">2. 학교 / 학과(전공)<input value={schoolMajor} onChange={(event) => setSchoolMajor(event.target.value)} maxLength={100} placeholder="예: ○○대학교 / 사회복지학과" /></label><label className="wide">3. 나의 관심 분야 <small>전공 외 관심사도 가능해요.</small><input value={interests} onChange={(event) => setInterests(event.target.value)} maxLength={120} placeholder="예: 청소년 활동, 사진, 여행" /></label><label className="wide">4. 내가 이 전공을 선택한 이유 <small>한두 문장으로 적어 주세요.</small><textarea value={majorReason} onChange={(event) => setMajorReason(event.target.value)} maxLength={300} placeholder="이 전공에 관심을 갖게 된 계기를 적어 주세요." /></label><label className="wide">5. 요즘 내가 관심 있는 진로·직업<input value={careerInterests} onChange={(event) => setCareerInterests(event.target.value)} maxLength={150} placeholder="현재 관심 있게 알아보는 진로나 직업" /></label><label className="wide">6. 나의 대학생활 <small>동아리, 대외활동, 아르바이트, 취미 등을 자유롭게 적어 주세요.</small><textarea value={campusLife} onChange={(event) => setCampusLife(event.target.value)} maxLength={500} placeholder="대학생활에서 경험하고 있는 다양한 이야기를 들려주세요." /></label><label className="wide">7. 나의 강점 <small>3~4개 정도를 쉼표로 구분해 주세요.</small><input value={strengths} onChange={(event) => setStrengths(event.target.value)} maxLength={120} placeholder="예: 경청, 책임감, 도전정신, 친화력" /></label><label className="wide">8. 청소년들에게 해주고 싶은 말<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={300} placeholder="청소년들에게 전하고 싶은 한마디를 적어 주세요." /></label></div> : <div className="profile-field-grid"><label className="wide">나를 소개하는 한마디<textarea value={introduction} onChange={(event) => setIntroduction(event.target.value)} maxLength={240} placeholder="내가 좋아하는 것과 나의 특징을 적어 보세요." /></label><label>관심 분야<input value={interests} onChange={(event) => setInterests(event.target.value)} maxLength={80} placeholder="예: 그림, 운동, 과학" /></label><label>희망 진로<input value={hopeJob} onChange={(event) => setHopeJob(event.target.value)} maxLength={80} placeholder="아직 없다면 관심 직업도 좋아요." /></label></div>}
    <div className="profile-save-row"><button type="submit" disabled={saveState === 'saving'}>{saveState === 'saving' ? '저장하는 중…' : '프로필 저장하기'}</button>{saveState === 'saved' && <p role="status">✓ 프로필이 저장됐어요.</p>}{saveState === 'error' && <p className="error" role="alert">저장하지 못했어요. 잠시 후 다시 시도해 주세요.</p>}</div>
  </form>
}

type AuctionPhase = 'lobby' | 'waiting' | 'voting' | 'countdown' | 'auction' | 'sold' | 'result'
type AuctionParticipant = { id: string; nickname: string; role: 'host' | 'participant'; connected: boolean; selectedJob?: string | null; balance?: number; inventory?: Record<string, number> }
type AuctionRoom = { hostId: string; gameState: 'WAITING' | 'JOB_SELECTION' | 'COUNTDOWN' | 'AUCTION' | 'SOLD' | 'RESULT'; initialMoney?: number; bidLimit?: number; totalItems?: number; voteEndsAt?: { toMillis: () => number }; countdownEndsAt?: { toMillis: () => number }; selectedJob?: string | null; selectedJobs?: string[]; deck?: string[]; auctionIndex?: number; currentPrice?: number; highestBidderId?: string | null; highestBidderName?: string | null; auctionEndsAt?: { toMillis: () => number } }
type AuctionTestRole = 'host' | 'participant'
const auctionTestJobs = ['의사', '소방관', '교사', '경찰관', '유튜브 크리에이터', '게임 개발자', '요리사', '간호사', '웹툰 작가', '반려동물 훈련사', '로봇공학자', '스포츠 트레이너', '심리상담사', '항공 승무원', '건축가', '패션 디자이너', '사회복지사', '데이터 분석가', '환경 연구원', '창업가']
const savedSessionKey = 'cheongsajin-session'

function StrengthAuctionTest({ role, playerName, onExit }: { role: AuctionTestRole; playerName: string; onExit: () => void }) {
  const [phase, setPhase] = useState<Exclude<AuctionPhase, 'lobby'>>('waiting')
  const [voteTime, setVoteTime] = useState(30)
  const [countdownTime, setCountdownTime] = useState(5)
  const [selectedJob, setSelectedJob] = useState('')
  const [customJob, setCustomJob] = useState('')
  const [testSelectedJobs, setTestSelectedJobs] = useState<{ name: string; job: string }[]>([])
  const [auctionDeck, setAuctionDeck] = useState<string[]>([])
  const [auctionIndex, setAuctionIndex] = useState(0)
  const [auctionTime, setAuctionTime] = useState(10)
  const [currentPrice, setCurrentPrice] = useState(200)
  const [highestBidder, setHighestBidder] = useState('')
  const [balance, setBalance] = useState(1000)
  const [inventory, setInventory] = useState<Record<string, number>>({})
  const [virtualVotes, setVirtualVotes] = useState<{ name: string; job: string }[]>([])
  const testName = playerName.trim() || (role === 'host' ? '테스트 방장' : '나')
  const botNames = role === 'host' ? ['지민', '서준', '하윤'] : ['지민', '서준']
  const participants = role === 'host' ? [testName, ...botNames] : ['가상 방장', testName, ...botNames]
  const currentStrength = auctionDeck[auctionIndex] ?? '문제해결능력'
  const myStrengthLevel = inventory[currentStrength] ?? 0
  const rarity = (count: number) => count >= 3 ? 'EPIC' : count === 2 ? 'RARE' : 'NORMAL'
  const itemLimit = (participants.length - 1) * 10

  const startTest = () => {
    setVoteTime(30)
    setVirtualVotes([])
    setPhase('voting')
  }
  const finishVote = () => {
    const resolvedVirtualVotes = botNames.map((name, index) => virtualVotes.find((vote) => vote.name === name) ?? { name, job: auctionTestJobs[(index + 4) % auctionTestJobs.length] })
    const mySelectedJob = customJob.trim() || selectedJob || auctionTestJobs[Math.floor(Math.random() * auctionTestJobs.length)]
    const participantJobs = role === 'participant' ? [{ name: testName, job: mySelectedJob }, ...resolvedVirtualVotes] : resolvedVirtualVotes
    setVirtualVotes(resolvedVirtualVotes)
    setTestSelectedJobs(participantJobs)
    setSelectedJob(role === 'participant' ? mySelectedJob : participantJobs[0]?.job || '게임 개발자')
    setAuctionDeck(createAuctionDeckForJobs(participantJobs.map((participant) => participant.job), itemLimit))
    setAuctionIndex(0)
    setCurrentPrice(200)
    setHighestBidder('')
    setAuctionTime(10)
    setCountdownTime(5)
    setPhase('countdown')
  }
  const addVirtualVote = (name: string, fallbackJob: string) => {
    setVirtualVotes((current) => current.some((vote) => vote.name === name) ? current : [...current, { name, job: fallbackJob }])
  }
  const placeTestBid = (amount: number) => {
    if (role !== 'participant' || highestBidder === testName || amount > balance || amount <= currentPrice || myStrengthLevel >= 3) return
    setCurrentPrice(amount)
    setHighestBidder(testName)
    if (auctionTime <= 2) setAuctionTime(5)
  }
  const nextTestItem = () => {
    if (auctionIndex + 1 >= itemLimit) {
      setPhase('result')
      return
    }
    setAuctionIndex((current) => current + 1)
    setCurrentPrice(200)
    setHighestBidder('')
    setAuctionTime(10)
    setPhase('auction')
  }
  const restartTest = () => {
    setSelectedJob('')
    setCustomJob('')
    setVirtualVotes([])
    setTestSelectedJobs([])
    setAuctionDeck([])
    setAuctionIndex(0)
    setBalance(1000)
    setInventory({})
    setPhase('waiting')
  }

  useEffect(() => {
    if (phase !== 'voting') return
    if (voteTime <= 0) {
      finishVote()
      return
    }
    if (voteTime === 27) addVirtualVote(botNames[0], role === 'host' ? '게임 개발자' : '교사')
    if (voteTime === 18) addVirtualVote(botNames[1], role === 'host' ? '게임 개발자' : '간호사')
    if (voteTime === 9 && botNames[2]) addVirtualVote(botNames[2], '유튜브 크리에이터')
    const timer = window.setTimeout(() => setVoteTime((current) => current - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [phase, voteTime, role])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdownTime <= 0) {
      setPhase('auction')
      return
    }
    const timer = window.setTimeout(() => setCountdownTime((current) => current - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [phase, countdownTime])

  useEffect(() => {
    if (phase !== 'auction' || auctionTime <= 0) return
    const tick = window.setTimeout(() => setAuctionTime((current) => current - 1), 1000)
    return () => window.clearTimeout(tick)
  }, [phase, auctionTime])

  useEffect(() => {
    if (phase !== 'auction' || auctionTime <= 0) return
    const botBid = window.setTimeout(() => {
      if (Math.random() < .62) {
        const bidder = botNames[Math.floor(Math.random() * botNames.length)]
        setCurrentPrice((price) => Math.min(950, price + 50))
        setHighestBidder(bidder)
        if (auctionTime <= 2) setAuctionTime(5)
      }
    }, 900 + Math.random() * 1300)
    return () => window.clearTimeout(botBid)
  }, [phase, auctionTime, auctionIndex])

  useEffect(() => {
    if (phase !== 'auction' || auctionTime > 0) return
    if (highestBidder === testName) {
      setBalance((current) => current - currentPrice)
      setInventory((current) => ({ ...current, [currentStrength]: Math.min(3, (current[currentStrength] ?? 0) + 1) }))
    }
    setPhase('sold')
  }, [phase, auctionTime, highestBidder, testName, currentPrice, currentStrength])

  const testHeader = <div className="test-mode-bar"><div><b>🧪 {role === 'host' ? '방장용' : '참여자용'} 테스트 게임</b><span>Firebase에 저장되지 않는 연습 모드</span></div><button type="button" onClick={onExit}>테스트 종료</button></div>

  if (phase === 'waiting') return <div className="auction-waiting">{testHeader}<div className="room-summary"><div><span>방 코드</span><strong>TEST</strong></div><div><span>경매 참가자</span><strong>{participants.length - 1}명</strong></div><div><span>내 역할</span><strong>{role === 'host' ? '방장' : '참가자'}</strong></div></div><section className="participant-list-card"><div className="auction-section-title"><h3>테스트 참가자</h3><span>가상 참가자 자동 행동</span></div><ul className="participant-list">{participants.map((name, index) => <li key={name}><i />{name}{(index === 0 && role === 'host') || name === '가상 방장' ? <b>방장</b> : <span>{name === testName ? '나' : 'BOT'}</span>}</li>)}</ul></section><button type="button" className="auction-primary wide" onClick={startTest}>{role === 'host' ? '테스트 게임 시작 →' : '가상 방장에게 시작 요청 →'}</button></div>

  if (phase === 'voting') return <div className="job-vote">{testHeader}<div className="auction-countdown"><b>{voteTime}</b><span>초</span></div><p>각자의 목표 직업</p><h2>{role === 'host' ? `${virtualVotes.length} / ${botNames.length}명 선택 완료` : customJob.trim() || selectedJob || '내 직업을 하나 고르세요'}</h2><span>{role === 'host' ? '가상 참가자마다 자기 직업을 하나씩 고릅니다. 선택이 끝나면 실제 게임처럼 5초 뒤 경매가 시작돼요.' : '목록에서 고르거나 직접 입력할 수 있고, 랜덤으로 정할 수도 있어요.'}</span>{role === 'participant' && <><label className="custom-job-entry">직접 입력<input value={customJob} onChange={(event) => { setCustomJob(event.target.value); if (event.target.value.trim()) setSelectedJob('') }} maxLength={24} placeholder="예: 댄서, 변호사, 프로게이머" /></label><button type="button" className="random-job" onClick={() => { setSelectedJob(auctionTestJobs[Math.floor(Math.random() * auctionTestJobs.length)]); setCustomJob('') }} disabled={voteTime <= 0}>🎲 랜덤으로 선택</button></>}<div className="virtual-votes"><b>참가자별 직업 선택 현황</b>{virtualVotes.length ? <ul>{virtualVotes.map((vote) => <li key={vote.name}><span>{vote.name}</span><strong>{vote.job}</strong></li>)}</ul> : <p>잠시 후 가상 참가자들이 각자 직업을 선택해요.</p>}</div><div className="job-options test-job-options">{auctionTestJobs.map((job) => <button type="button" className={selectedJob === job && !customJob.trim() ? 'selected' : ''} onClick={() => { setSelectedJob(job); setCustomJob('') }} disabled={role === 'host' || voteTime <= 0} key={job}>{job}</button>)}</div>{role === 'host' && <div className="vote-actions"><button type="button" className="auction-primary" onClick={finishVote} disabled={voteTime > 0 && virtualVotes.length < botNames.length}>선택 마감·5초 뒤 경매 시작 →</button></div>}</div>

  if (phase === 'countdown') return <div className="job-vote">{testHeader}<div className="auction-countdown"><b>{countdownTime}</b><span>초</span></div><p>경매 시작 전</p><h2>곧 첫 상품이 출품돼요</h2><span>참가자별 직업은 따로 유지되고, 선택된 모든 직업의 역량이 공통 경매에 섞여 나와요.</span><div className="job-choice-list"><b>참가자별 직업</b><ul>{testSelectedJobs.map((participant) => <li key={participant.name}><span>{participant.name}</span><strong>{participant.job}</strong></li>)}</ul></div></div>

  if (phase === 'sold') {
    const wonByMe = highestBidder === testName
    const nextLevel = inventory[currentStrength] ?? 0
    return <div className="sold-screen">{testHeader}<span className="hammer-hit">🔨</span><p>{highestBidder ? '낙찰!' : '유찰'}</p><h2>{currentStrength}</h2>{highestBidder && <div className="sold-price"><b>{highestBidder}</b><strong>{currentPrice}P</strong></div>}{wonByMe && <div className={`upgrade-card rarity-${rarity(nextLevel).toLowerCase()}`}><span>{nextLevel > 1 ? '✨ 등급 강화!' : '새로운 강점 획득!'}</span><h3>{currentStrength}</h3><b>{rarity(nextLevel)}</b></div>}<button type="button" className="auction-primary" onClick={nextTestItem}>{auctionIndex + 1 >= itemLimit ? '결과 확인 →' : role === 'host' ? '다음 상품 진행 →' : '가상 방장 다음 상품 진행 →'}</button></div>
  }

  if (phase === 'result') {
    const profile = jobStrengthProfiles[selectedJob] ?? jobStrengthProfiles['게임 개발자']
    const groups = [
      { key: 'core' as const, title: '핵심 역량' },
      { key: 'related' as const, title: '관련 역량' },
      { key: 'lower' as const, title: '우선도가 낮은 역량' },
    ]
    return <div className="auction-result">{testHeader}<span className="result-kicker">테스트 종료 · 중요도 공개</span><h2>{role === 'host' ? '참가자별 직업과 경매 결과' : `${selectedJob}에게 어떤 역량이 중요할까요?`}</h2><p className="result-guide">{role === 'host' ? '실제 게임처럼 각 참가자의 직업은 따로 유지됐고, 모든 직업의 역량을 합친 공통 경매를 진행했어요.' : '실제 데이터에는 저장되지 않았어요. 내 직업의 중요도와 낙찰 결과를 비교해 보세요.'}</p>{role === 'host' && <div className="job-choice-list"><b>참가자별 직업</b><ul>{testSelectedJobs.map((participant) => <li key={participant.name}><span>{participant.name}</span><strong>{participant.job}</strong></li>)}</ul></div>}<div className="importance-grid">{groups.map((group) => <section className={`importance-${group.key}`} key={group.key}><h3>{group.title}</h3><ul>{profile[group.key].map((strength) => <li key={strength}><span>{strength}</span>{inventory[strength] ? <b className={`rarity-${rarity(inventory[strength]).toLowerCase()}`}>{rarity(inventory[strength])}</b> : <small>미보유</small>}</li>)}</ul></section>)}</div><div className="test-result-actions"><button type="button" className="auction-primary" onClick={restartTest}>같은 역할로 다시 하기</button><button type="button" className="random-job" onClick={onExit}>테스트 선택으로 돌아가기</button></div></div>
  }

  const bidOptions = [currentPrice + 50, currentPrice + 100, currentPrice + 150]
  return <div className="auction-stage">{testHeader}<div className="auction-topline"><span>{auctionIndex + 1} / {itemLimit} 상품</span><b>{role === 'host' ? '방장 진행 화면' : `내 직업 · ${selectedJob}`}</b></div><div className="auction-product"><div className={`auction-clock ${auctionTime <= 3 ? 'urgent' : ''}`}><b>{auctionTime}</b><span>초</span></div><span>지금 필요한 강점</span><h2>🔨 {currentStrength}</h2>{myStrengthLevel >= 3 && <p className="epic-block">🌟 최고 등급을 보유하고 있어 입찰할 수 없어요.</p>}{highestBidder === testName && <p className="epic-block">현재 내가 최고 입찰자예요. 다른 참가자가 입찰할 때까지 기다려 주세요.</p>}<div className="current-bid"><span>현재가</span><strong>{currentPrice}P</strong><small>최고 입찰자 · {highestBidder || '아직 없음'}</small></div><div className="bid-buttons">{bidOptions.map((amount) => <button type="button" onClick={() => placeTestBid(amount)} disabled={role === 'host' || highestBidder === testName || amount > balance || myStrengthLevel >= 3} key={amount}>{role === 'host' ? '참가자 화면 전용' : `${amount}P`}</button>)}</div><p className="anti-snipe">가상 참가자들이 자동으로 입찰하며, 종료 직전 입찰 시 5초 연장돼요.</p></div><aside className="auction-player"><div><span>{testName}</span><strong>💰 {balance}P</strong></div><h3>{role === 'host' ? '참가자별 직업' : `${selectedJob} 목표`}</h3>{role === 'host' ? <ul>{testSelectedJobs.map((participant) => <li key={participant.name}><span>{participant.name}</span><b>{participant.job}</b></li>)}</ul> : Object.keys(inventory).length ? <ul>{Object.entries(inventory).map(([strength, count]) => <li key={strength}><span>{strength}</span><b className={`rarity-${rarity(count).toLowerCase()}`}>{rarity(count)}</b></li>)}</ul> : <p>아직 낙찰받은 역량이 없어요.</p>}</aside></div>
}

function StrengthAuctionGame({ studentName }: { studentName: string }) {
  const [phase, setPhase] = useState<AuctionPhase>('lobby')
  const [role, setRole] = useState<'host' | 'participant'>('participant')
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [nickname, setNickname] = useState(studentName || '')
  const [roomError, setRoomError] = useState('')
  const [isRoomBusy, setIsRoomBusy] = useState(false)
  const [participants, setParticipants] = useState<AuctionParticipant[]>([])
  const [roomData, setRoomData] = useState<AuctionRoom | null>(null)
  const [initialMoney, setInitialMoney] = useState(1000)
  const [bidLimit, setBidLimit] = useState(10)
  const [selectedJob, setSelectedJob] = useState('')
  const [customJob, setCustomJob] = useState('')
  const [now, setNow] = useState(Date.now())
  const [settleRequestedFor, setSettleRequestedFor] = useState('')
  const [countdownRequestedFor, setCountdownRequestedFor] = useState('')
  const [testRole, setTestRole] = useState<AuctionTestRole | null>(null)
  const auctionIndex = roomData?.auctionIndex ?? 0
  const itemLimit = roomData?.totalItems ?? 0
  const currentPrice = roomData?.currentPrice ?? 200
  const currentStrength = roomData?.deck?.[auctionIndex] ?? '문제해결능력'
  const myName = nickname.trim() || studentName || '참가자'
  const myParticipant = participants.find((item) => item.id === auth?.currentUser?.uid)
  const participantPlayers = participants.filter((item) => item.role === 'participant')
  const selectedParticipantCount = participantPlayers.filter((item) => item.selectedJob).length
  const myJob = myParticipant?.selectedJob ?? selectedJob
  const balance = myParticipant?.balance ?? initialMoney
  const inventory = myParticipant?.inventory ?? {}
  const myStrengthLevel = inventory[currentStrength] ?? 0
  const rarity = (count: number) => count >= 3 ? 'EPIC' : count === 2 ? 'RARE' : 'NORMAL'
  const secondsLeft = (deadline?: { toMillis: () => number }) => deadline ? Math.max(0, Math.ceil((deadline.toMillis() - now) / 1000)) : 0
  const voteTime = secondsLeft(roomData?.voteEndsAt)
  const countdownTime = secondsLeft(roomData?.countdownEndsAt)
  const auctionTime = secondsLeft(roomData?.auctionEndsAt)

  const callAuction = async <T,>(name: string, data: Record<string, unknown>) => {
    if (!functions) throw new Error('Firebase Functions 연결이 필요합니다.')
    return (await httpsCallable<Record<string, unknown>, T>(functions, name)(data)).data
  }

  const createRoom = async () => {
    if (!db || !auth?.currentUser) return setRoomError('Firebase 연결을 확인해 주세요.')
    setIsRoomBusy(true)
    setRoomError('')
    try {
      let code = ''
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = String(Math.floor(100000 + Math.random() * 900000))
        if (!(await getDoc(doc(db, 'auctionRooms', candidate))).exists()) { code = candidate; break }
      }
      if (!code) throw new Error('room-code-collision')
      await setDoc(doc(db, 'auctionRooms', code), { hostId: auth.currentUser.uid, gameState: 'WAITING', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      await setDoc(doc(db, 'auctionRooms', code, 'participants', auth.currentUser.uid), { nickname: nickname.trim() || '방장', role: 'host', connected: true, joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp() })
      setRole('host')
      setRoomCode(code)
      setPhase('waiting')
    } catch (error) {
      console.error(error)
      setRoomError('게임방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally { setIsRoomBusy(false) }
  }
  const joinRoom = async () => {
    if (!db || !auth?.currentUser) return setRoomError('Firebase 연결을 확인해 주세요.')
    const code = joinCode.trim().toUpperCase()
    if (code.length < 4 || !nickname.trim()) return
    setIsRoomBusy(true)
    setRoomError('')
    try {
      const roomSnapshot = await getDoc(doc(db, 'auctionRooms', code))
      if (!roomSnapshot.exists()) throw new Error('room-not-found')
      if (roomSnapshot.data().gameState !== 'WAITING') throw new Error('room-started')
      await setDoc(doc(db, 'auctionRooms', code, 'participants', auth.currentUser.uid), { nickname: nickname.trim(), role: 'participant', connected: true, joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp() })
      setRole('participant')
      setRoomCode(code)
      setPhase('waiting')
    } catch (error) {
      console.error(error)
      setRoomError(error instanceof Error && error.message === 'room-not-found' ? '해당 방을 찾을 수 없어요.' : '입장할 수 없는 방이에요. 방 코드를 확인해 주세요.')
    } finally { setIsRoomBusy(false) }
  }
  const startVote = async () => {
    setRoomError('')
    try { await callAuction('startAuctionVote', { roomCode, initialMoney, bidLimit }) }
    catch (error) { console.error(error); setRoomError('게임을 시작하지 못했어요. 설정과 참가자를 확인해 주세요.') }
  }
  const castVote = async (job: string) => {
    setSelectedJob(job)
    try { await callAuction('castAuctionVote', { roomCode, job }) }
    catch (error) { console.error(error); setRoomError('투표를 저장하지 못했어요. 투표 시간이 끝났는지 확인해 주세요.') }
  }
  const submitCustomJob = () => {
    const job = customJob.trim()
    if (!job) return setRoomError('직업을 입력해 주세요.')
    void castVote(job)
  }
  const castRandomJob = () => {
    const job = auctionJobs[Math.floor(Math.random() * auctionJobs.length)]
    setCustomJob('')
    void castVote(job)
  }
  const finishVote = async () => {
    try { await callAuction('finishAuctionVote', { roomCode }) }
    catch (error) { console.error(error); setRoomError('직업 선택을 마감하지 못했어요.') }
  }
  const startAuctionAfterCountdown = async () => {
    try { await callAuction('startAuctionRound', { roomCode }) }
    catch (error) { console.error(error); setRoomError('경매를 시작하지 못했어요.') }
  }
  const placeBid = async (amount: number) => {
    try { await callAuction('placeAuctionBid', { roomCode, amount }) }
    catch (error) { console.error(error); setRoomError('입찰하지 못했어요. 현재가와 잔액을 확인해 주세요.') }
  }
  const nextAuction = async () => {
    try { await callAuction('advanceAuctionItem', { roomCode }) }
    catch (error) { console.error(error); setRoomError('다음 상품으로 진행하지 못했어요.') }
  }

  useEffect(() => {
    if (!db || !auth?.currentUser || !roomCode) return
    const userId = auth.currentUser.uid
    const roomRef = doc(db, 'auctionRooms', roomCode)
    const participantRef = doc(db, 'auctionRooms', roomCode, 'participants', userId)
    const stopRoom = onSnapshot(roomRef, (snapshot) => {
      const room = snapshot.data() as AuctionRoom | undefined
      if (!room) return
      setRoomData(room)
      const nextPhase: Record<AuctionRoom['gameState'], AuctionPhase> = { WAITING: 'waiting', JOB_SELECTION: 'voting', COUNTDOWN: 'countdown', AUCTION: 'auction', SOLD: 'sold', RESULT: 'result' }
      setPhase(nextPhase[room.gameState])
    })
    const stopParticipants = onSnapshot(collection(db, 'auctionRooms', roomCode, 'participants'), (snapshot) => {
      setParticipants(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AuctionParticipant, 'id'>) })))
    })
    const heartbeat = window.setInterval(() => void updateDoc(participantRef, { connected: true, lastSeenAt: serverTimestamp() }), 20000)
    return () => {
      stopRoom()
      stopParticipants()
      window.clearInterval(heartbeat)
      void updateDoc(participantRef, { connected: false, lastSeenAt: serverTimestamp() })
    }
  }, [roomCode])

  useEffect(() => {
    if (phase !== 'voting' && phase !== 'countdown' && phase !== 'auction') return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'countdown' || countdownTime > 0 || !roomData?.countdownEndsAt) return
    const key = String(roomData.countdownEndsAt.toMillis())
    if (countdownRequestedFor === key) return
    setCountdownRequestedFor(key)
    void startAuctionAfterCountdown()
  }, [phase, countdownTime, roomData?.countdownEndsAt, countdownRequestedFor])

  useEffect(() => {
    if (phase !== 'auction' || auctionTime > 0 || !roomData?.auctionEndsAt) return
    const key = `${auctionIndex}:${roomData.auctionEndsAt.toMillis()}`
    if (settleRequestedFor === key) return
    setSettleRequestedFor(key)
    void callAuction('settleAuctionItem', { roomCode }).catch((error) => console.error(error))
  }, [phase, auctionTime, auctionIndex, roomData?.auctionEndsAt, roomCode, settleRequestedFor])

  if (testRole) return <StrengthAuctionTest role={testRole} playerName={myName} onExit={() => setTestRole(null)} />

  if (phase === 'lobby') return <div className="auction-lobby">
    <div className="auction-title"><span>🔨</span><h2>강점 경매장</h2><p>선택한 직업에 필요한 강점을 전략적으로 낙찰받아 보세요.</p></div>
    <div className="auction-entry-grid"><article><span>방장</span><h3>새 게임방 만들기</h3><p>참가자를 초대하고 금액·시간 등 게임 설정을 준비해요.</p><input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="방장 닉네임" maxLength={12} /><button type="button" onClick={createRoom} disabled={isRoomBusy}>{isRoomBusy ? '연결 중…' : '방 만들기 →'}</button></article><article><span>참가자</span><h3>게임방 입장하기</h3><p>닉네임과 방장이 알려준 코드를 입력해 주세요.</p><input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="닉네임" maxLength={12} /><input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="방 코드 입력" maxLength={6} /><button type="button" onClick={joinRoom} disabled={isRoomBusy || joinCode.trim().length < 4 || !nickname.trim()}>{isRoomBusy ? '연결 중…' : '입장하기 →'}</button></article></div>
    {roomError && <p className="auction-error" role="alert">{roomError}</p>}
    <div className="prototype-notice"><b>실시간 게임</b><p>방 입장부터 직업 투표, 입찰, 낙찰과 결과까지 여러 기기에 실시간으로 동기화돼요.</p></div>
    <section className="auction-test-section"><div className="auction-section-title"><div><span>혼자서도 연습 가능</span><h3>테스트 게임</h3></div><b>Firebase 저장 없음</b></div><p>가상 참가자들과 전체 흐름을 미리 확인해 보세요.</p><div><button type="button" onClick={() => setTestRole('host')}><span>👑</span><b>방장으로 테스트</b><small>게임 시작·투표 마감·다음 상품 진행</small></button><button type="button" onClick={() => setTestRole('participant')}><span>🙋</span><b>참여자로 테스트</b><small>직업 투표·실시간 입찰·강점 수집</small></button></div></section>
  </div>

  if (phase === 'waiting') return <div className="auction-waiting">
    <div className="room-summary"><div><span>방 코드</span><strong>{roomCode}</strong></div><div><span>경매 참가자</span><strong>{participants.filter((item) => item.role === 'participant').length}명</strong></div><div><span>내 닉네임</span><strong>{nickname || myName}</strong></div></div>
    {role === 'host' ? <><div className="waiting-columns"><section><div className="auction-section-title"><h3>참가자 목록</h3><span>실시간 동기화</span></div><ul className="participant-list">{participants.map((participant) => <li key={participant.id}><i className={participant.connected ? '' : 'offline'} />{participant.nickname}{participant.role === 'host' ? <b>방장</b> : <span>{participant.connected ? '접속' : '연결 끊김'}</span>}</li>)}</ul></section><section><div className="auction-section-title"><h3>게임 설정</h3><span>방장 전용</span></div><div className="auction-settings"><label>경매 참가자 수<input value={participants.filter((item) => item.role === 'participant').length} disabled /></label><label>예상 총 상품 수<input value={participants.filter((item) => item.role === 'participant').length * 10} disabled /></label><label>초기 보유금액<input type="number" min={500} max={10000} value={initialMoney} onChange={(event) => setInitialMoney(Number(event.target.value))} /></label><label>상품당 제한시간<select value={bidLimit} onChange={(event) => setBidLimit(Number(event.target.value))}><option value={7}>7초</option><option value={10}>10초</option><option value={15}>15초</option></select></label><label>직업 선택 방식<input value="참가자 투표" disabled /></label></div></section></div><button type="button" className="auction-primary wide" onClick={startVote} disabled={!participants.some((item) => item.role === 'participant')}>게임 시작 →</button>{roomError && <p className="auction-error" role="alert">{roomError}</p>}</> : <><section className="participant-list-card"><div className="auction-section-title"><h3>참가자 목록</h3><span>실시간 동기화</span></div><ul className="participant-list">{participants.map((participant) => <li key={participant.id}><i className={participant.connected ? '' : 'offline'} />{participant.nickname}{participant.role === 'host' ? <b>방장</b> : <span>{participant.connected ? '접속' : '연결 끊김'}</span>}</li>)}</ul></section><div className="participant-wait"><div className="waiting-pulse">●</div><h3>방장이 게임을 준비하고 있습니다.</h3><p>참가자 {participants.filter((item) => item.role === 'participant').length}명 · 방 코드 {roomCode}</p></div></>}
  </div>

  if (phase === 'voting') return <div className="job-vote"><div className="auction-countdown"><b>{voteTime}</b><span>초</span></div><p>각자의 목표 직업</p><h2>{role === 'host' ? `${selectedParticipantCount} / ${participantPlayers.length}명 선택 완료` : myJob || '내 직업을 하나 고르세요'}</h2><span>{role === 'host' ? '참가자마다 자기 직업을 하나씩 고릅니다. 시간이 끝나면 미선택 참가자는 자동으로 배정돼요.' : '목록에서 고르거나 직접 입력할 수 있고, 랜덤 선택도 가능해요. 중복 선택도 가능해요.'}</span>{role === 'participant' && <><label className="custom-job-entry">직접 입력<div><input value={customJob} onChange={(event) => setCustomJob(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitCustomJob() }} maxLength={24} placeholder="예: 댄서, 변호사, 프로게이머" /><button type="button" onClick={submitCustomJob} disabled={!customJob.trim() || voteTime <= 0}>선택</button></div></label><button type="button" className="random-job" onClick={castRandomJob} disabled={voteTime <= 0}>🎲 랜덤으로 선택</button></>}<div className="job-options">{auctionJobs.map((job) => <button type="button" className={myJob === job ? 'selected' : ''} onClick={() => { setCustomJob(''); void castVote(job) }} disabled={role === 'host' || voteTime <= 0} key={job}>{job}</button>)}</div><div className="job-choice-list"><b>직업 선택 현황</b><ul>{participantPlayers.map((participant) => <li key={participant.id}><span>{participant.nickname}</span><strong>{participant.selectedJob || '고르는 중'}</strong></li>)}</ul></div>{role === 'host' ? <div className="vote-actions"><button type="button" className="auction-primary" onClick={finishVote} disabled={participantPlayers.length === 0 || (voteTime > 0 && selectedParticipantCount < participantPlayers.length)}>선택 마감·5초 뒤 경매 시작 →</button></div> : <div className="participant-wait"><p>선택한 직업: <b>{myJob || '아직 선택하지 않음'}</b></p></div>}{roomError && <p className="auction-error" role="alert">{roomError}</p>}</div>

  if (phase === 'countdown') return <div className="job-vote"><div className="auction-countdown"><b>{countdownTime}</b><span>초</span></div><p>경매 시작 전</p><h2>곧 첫 상품이 출품돼요</h2><span>각자 선택한 직업은 결과 화면에서 따로 적용됩니다.</span><div className="job-choice-list"><b>참가자별 직업</b><ul>{participantPlayers.map((participant) => <li key={participant.id}><span>{participant.nickname}</span><strong>{participant.selectedJob || '자동 배정 중'}</strong></li>)}</ul></div>{roomError && <p className="auction-error" role="alert">{roomError}</p>}</div>

  if (phase === 'sold') {
    const wonByMe = roomData?.highestBidderId === auth?.currentUser?.uid
    const nextLevel = myStrengthLevel
    return <div className="sold-screen"><span className="hammer-hit">🔨</span><p>{roomData?.highestBidderId ? '낙찰!' : '유찰'}</p><h2>{currentStrength}</h2>{roomData?.highestBidderId && <div className="sold-price"><b>{roomData.highestBidderName}</b><strong>{currentPrice}P</strong></div>}{wonByMe && <div className={`upgrade-card rarity-${rarity(nextLevel).toLowerCase()}`}><span>{nextLevel > 1 ? '✨ 등급 강화!' : '새로운 강점 획득!'}</span><h3>{currentStrength}</h3><b>{rarity(nextLevel)}</b></div>}{role === 'host' ? <button type="button" className="auction-primary" onClick={nextAuction}>{auctionIndex + 1 >= itemLimit ? '결과 공개 →' : '다음 상품 →'}</button> : <div className="participant-wait"><p>방장이 다음 상품을 준비하고 있어요.</p></div>}{roomError && <p className="auction-error" role="alert">{roomError}</p>}</div>
  }

  if (phase === 'result') {
    const resultJob = myJob || roomData?.selectedJobs?.[0] || selectedJob || '게임 개발자'
    const profile = jobStrengthProfiles[resultJob] ?? jobStrengthProfiles['게임 개발자']
    const groups = [
      { key: 'core' as const, title: '핵심 역량', description: '주요 업무 수행에 특히 중요해요.' },
      { key: 'related' as const, title: '관련 역량', description: '원활한 직무 수행과 밀접하게 연결돼요.' },
      { key: 'lower' as const, title: '우선도가 낮은 역량', description: '쓸모없는 역량이 아니라, 상대적 우선도가 낮아요.' },
    ]
    return <div className="auction-result"><span className="result-kicker">경매 종료 · 중요도 공개</span><h2>{resultJob}에게 어떤 역량이 중요할까요?</h2><p className="result-guide">게임 중에는 숨겨졌던 내 직업의 중요도를 낙찰 결과와 비교해 보세요. 카드 등급은 중요도가 아니라 같은 역량을 낙찰받은 횟수예요.</p><div className="importance-grid">{groups.map((group) => <section className={`importance-${group.key}`} key={group.key}><h3>{group.title}</h3><p>{group.description}</p><ul>{profile[group.key].map((strength) => <li key={strength}><span>{strength}</span>{inventory[strength] ? <b className={`rarity-${rarity(inventory[strength]).toLowerCase()}`}>내 카드 {rarity(inventory[strength])}</b> : <small>미보유</small>}</li>)}</ul></section>)}</div><div className="result-question"><b>함께 이야기해 봐요</b><p>내가 높은 금액을 투자한 역량은 실제 중요도와 어떻게 달랐나요? 그렇게 판단한 이유는 무엇인가요?</p></div><button type="button" className="auction-primary" onClick={() => { setRoomCode(''); setRoomData(null); setPhase('lobby') }}>로비로 돌아가기</button></div>
  }

  const bidOptions = [currentPrice + 50, currentPrice + 100, currentPrice + 150]
  return <div className="auction-stage"><div className="auction-topline"><span>{auctionIndex + 1} / {itemLimit} 상품</span><b>내 직업 · {myJob || '방장 진행 화면'}</b></div><div className="auction-product"><div className={`auction-clock ${auctionTime <= 3 ? 'urgent' : ''}`}><b>{auctionTime}</b><span>초</span></div><span>지금 필요한 강점</span><h2>🔨 {currentStrength}</h2>{myStrengthLevel >= 3 && <p className="epic-block">🌟 최고 등급을 보유하고 있어 입찰할 수 없어요.</p>}{roomData?.highestBidderId === auth?.currentUser?.uid && <p className="epic-block">현재 내가 최고 입찰자예요. 다른 참가자가 입찰할 때까지 기다려 주세요.</p>}<div className="current-bid"><span>현재가</span><strong>{currentPrice}P</strong><small>최고 입찰자 · {roomData?.highestBidderName || '아직 없음'}</small></div><div className="bid-buttons">{bidOptions.map((amount) => <button type="button" onClick={() => placeBid(amount)} disabled={role === 'host' || roomData?.highestBidderId === auth?.currentUser?.uid || auctionTime <= 0 || amount > balance || myStrengthLevel >= 3} key={amount}>{amount}P</button>)}</div><p className="anti-snipe">종료 2초 전 새 입찰이 들어오면 시간이 5초로 연장돼요.</p>{roomError && <p className="auction-error" role="alert">{roomError}</p>}</div><aside className="auction-player"><div><span>{myName}</span><strong>💰 {balance}P</strong></div><h3>{myJob ? `${myJob} 목표` : '보유 역량'}</h3>{Object.keys(inventory).length ? <ul>{Object.entries(inventory).map(([strength, count]) => <li key={strength}><span>{strength}</span><b className={`rarity-${rarity(count).toLowerCase()}`}>{rarity(count)}</b></li>)}</ul> : <p>아직 낙찰받은 역량이 없어요.</p>}</aside></div>
}

function SecondActivityDetail({ step, schoolName, studentName, onLeave, onHome }: { step: number; schoolName: string; studentName: string; onLeave: () => void; onHome: () => void }) {
  const [gameStarted, setGameStarted] = useState(false)
  const [questionDuration, setQuestionDuration] = useState<5 | 7 | 10>(7)
  const [isPaused, setIsPaused] = useState(false)
  const [areaIndex, setAreaIndex] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [remainingMs, setRemainingMs] = useState(7000)
  const [responses, setResponses] = useState<Record<string, PreferenceChoice>>({})
  const [resultSaveState, setResultSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const area = preferenceAreas[areaIndex]
  const isGameComplete = areaIndex >= preferenceAreas.length
  const currentQuestion = area?.questions[questionIndex]
  const choiceLabels: Record<PreferenceChoice, string> = { like: '👍 좋아!', neutral: '😐 그저 그래', dislike: '👎 싫어!', unsure: '🤔 고민돼요' }
  const selectedQuestions = (choice: PreferenceChoice) => preferenceAreas.flatMap((item) => item.questions.filter((question) => responses[`${item.id}:${question}`] === choice))

  const answerCurrentQuestion = (choice: PreferenceChoice) => {
    if (!area || !currentQuestion) return
    setResponses((current) => ({ ...current, [`${area.id}:${currentQuestion}`]: choice }))
    setRemainingMs(questionDuration * 1000)
    setIsPaused(false)
    if (questionIndex < area.questions.length - 1) setQuestionIndex((current) => current + 1)
    else {
      setQuestionIndex(0)
      setAreaIndex((current) => current + 1)
    }
  }

  const submitPreferenceResult = async () => {
    if (!db || !auth?.currentUser) {
      setResultSaveState('error')
      return
    }
    setResultSaveState('saving')
    try {
      await setDoc(doc(db, 'preferenceResults', auth.currentUser.uid), {
        userId: auth.currentUser.uid,
        schoolName,
        responses,
        questionDuration,
        summary: {
          like: selectedQuestions('like').length,
          neutral: selectedQuestions('neutral').length,
          dislike: selectedQuestions('dislike').length,
          unsure: selectedQuestions('unsure').length,
        },
        updatedAt: serverTimestamp(),
      })
      setResultSaveState('saved')
    } catch (error) {
      console.error(error)
      setResultSaveState('error')
    }
  }

  useEffect(() => {
    if (!gameStarted || isGameComplete || step !== 2 || !currentQuestion || isPaused) return
    const startedAt = performance.now()
    const startedWith = remainingMs
    let frame = 0
    const tick = (now: number) => {
      const next = Math.max(0, startedWith - (now - startedAt))
      setRemainingMs(next)
      if (next <= 0) answerCurrentQuestion('unsure')
      else frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [gameStarted, isGameComplete, areaIndex, questionIndex, step, isPaused])

  const detailContent = [
    { eyebrow: 'STEP 1', title: '활동 안내', subtitle: '나의 선택에는 정답이 없어요', icon: '🧭', description: '선호와 비선호가 사람마다 다르다는 점을 이해하고, 오늘 진행할 네 가지 활동의 흐름을 확인해요.' },
    { eyebrow: 'STEP 2', title: '나의 선호 탐색', subtitle: '좋아, 싫어!', icon: '👍', description: '여러 활동과 상황을 빠르게 살펴보며 지금 내 생각과 가장 가까운 답을 선택해요.' },
    { eyebrow: 'STEP 3', title: '나의 강점 탐색', subtitle: '강점 경매장', icon: '🔨', description: '직업에 필요한 강점을 전략적으로 낙찰받고, 같은 강점을 모아 더 높은 등급으로 강화해요.' },
    { eyebrow: 'STEP 4', title: '활동 마무리', subtitle: '오늘 발견한 나를 내 말로 정리하기', icon: '📝', description: '선호와 강점 활동에서 새롭게 알게 된 나의 모습을 짧은 문장으로 남겨요.' },
  ][step - 1]

  return (
    <div className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{studentName}</b><button className="logout-button" onClick={onLeave}>로그아웃</button></div></header>
      <main className="session-review activity-detail-page">
        <button className="back-button" type="button" onClick={() => window.history.back()}>← 2회기 활동 목록으로</button>
        <section className="review-hero second-session-hero detail-hero">
          <div><p className="eyebrow">{detailContent.eyebrow} · 2회기</p><h1>{detailContent.title}</h1><h2>{detailContent.subtitle}</h2><p>{detailContent.description}</p></div>
          <div className="review-icon" aria-hidden="true">{detailContent.icon}</div>
        </section>

        {step === 1 && <section className="detail-panel">
          <div className="detail-heading"><span>약 20~25분</span><h2>오늘은 이렇게 활동해요</h2><p>검사나 정답 찾기가 아니라, 내가 어떤 활동과 상황을 좋아하고 싫어하는지 알아보는 시간이에요.</p></div>
          <div className="activity-roadmap"><article><b>1</b><h3>방법 알아보기</h3><p>솔직하고 빠르게 선택해요.</p></article><article><b>2</b><h3>좋아, 싫어!</h3><p>24가지 활동에 답해요.</p></article><article><b>3</b><h3>강점 찾기</h3><p>경험 속 나의 힘을 찾아요.</p></article><article><b>4</b><h3>내 말로 마무리</h3><p>새롭게 발견한 나를 적어요.</p></article></div>
          <div className="mentor-note"><b>기억해요</b><p>활동 결과는 성격이나 직업을 판정하지 않아요. 선택한 이유와 경험을 편안하게 이야기해 주세요.</p></div>
        </section>}

        {step === 2 && <section className="detail-panel preference-game">
          {!gameStarted && <div className="game-intro"><span className="game-symbol">👍 👎</span><h2>좋아! 싫어!</h2><p>화면에 나타나는 활동을 하나씩 보고,<br />지금 내 생각과 가장 가까운 답을 빠르게 선택해 보세요.</p><div className="rule-cards"><article><b>1</b><h3>한 번에 한 문항</h3><p>앞 문항으로 돌아가지 않고 지금의 느낌대로 골라요.</p></article><article><b>2</b><h3>세 가지 답변</h3><p>좋아, 그저 그래, 싫어 중 하나를 선택해요.</p></article><article><b>3</b><h3>시간이 지나면</h3><p>응답하지 못한 문항은 자동으로 ‘고민돼요’가 돼요.</p></article></div><fieldset className="duration-picker"><legend>문항당 답변 시간</legend><p>나에게 맞는 속도를 선택하세요.</p><div>{([5, 7, 10] as const).map((seconds) => <button type="button" className={questionDuration === seconds ? 'selected' : ''} onClick={() => setQuestionDuration(seconds)} key={seconds}><b>{seconds}</b>초</button>)}</div></fieldset><div className="game-rules"><span>총 24문항</span><span>선택에는 정답이 없어요</span><span>진행 중 일시정지 가능</span></div><button type="button" onClick={() => { setRemainingMs(questionDuration * 1000); setGameStarted(true) }}>시작하기 →</button></div>}
          {gameStarted && !isGameComplete && area && <div className="question-stage">
            <div className="game-progress"><div><span>{areaIndex * 4 + questionIndex + 1} / 24</span><b>{area.title}</b></div><div className="progress-dots">{preferenceAreas.map((item, index) => <i className={index <= areaIndex ? 'active' : ''} key={item.id} />)}</div></div>
            <div className="area-heading"><span>{area.icon}</span><div><h2>{area.title}</h2><p>{area.guide}</p></div></div>
            <div className="question-controls"><span>문항당 {questionDuration}초</span><button type="button" onClick={() => setIsPaused((current) => !current)}>{isPaused ? '▶ 계속하기' : 'Ⅱ 일시정지'}</button></div>
            <article className={`quick-question-card ${remainingMs <= 3000 ? 'urgent' : ''} ${isPaused ? 'paused' : ''}`}>
              <div className="question-timer" aria-label={`${Math.ceil(remainingMs / 1000)}초 남음`}><b>{Math.ceil(remainingMs / 1000)}</b><span>초</span></div>
              <div className="timer-track"><span style={{ width: `${(remainingMs / (questionDuration * 1000)) * 100}%` }} /></div>
              {isPaused && <div className="pause-cover"><span>Ⅱ</span><b>잠시 멈췄어요</b><p>‘계속하기’를 누르면 남은 시간부터 이어져요.</p></div>}
              <small>{questionIndex + 1}번째 질문</small>
              <h3>{currentQuestion}</h3>
              <div className="quick-answer-buttons">{(['like', 'neutral', 'dislike'] as PreferenceChoice[]).map((choice) => <button type="button" className={choice} disabled={isPaused} onClick={() => answerCurrentQuestion(choice)} key={choice}>{choiceLabels[choice]}</button>)}</div>
              <p>{questionDuration}초 안에 선택하지 않으면 <b>🤔 고민돼요</b>로 기록하고 다음 질문으로 넘어가요.</p>
            </article>
          </div>}
          {gameStarted && isGameComplete && <div className="preference-summary"><span className="complete-symbol">✓</span><h2>24개 선택을 모두 마쳤어요!</h2><p>좋아하거나 싫어한다고 선택한 활동을 한눈에 살펴보세요. <b>고민돼요 {selectedQuestions('unsure').length}개</b></p><div className="summary-columns"><div><h3>👍 좋아!</h3>{selectedQuestions('like').length ? <ul>{selectedQuestions('like').map((question) => <li key={question}>{question}</li>)}</ul> : <p>선택한 항목이 없어요.</p>}</div><div><h3>👎 싫어!</h3>{selectedQuestions('dislike').length ? <ul>{selectedQuestions('dislike').map((question) => <li key={question}>{question}</li>)}</ul> : <p>선택한 항목이 없어요.</p>}</div></div><div className="next-build-note"><b>다음 개발 단계</b><p>각 목록에서 핵심 항목 최대 3개 고르기 → 자유입력 → 개인 결과 → 전체 워드클라우드 순서로 이어질 예정이에요.</p></div><div className="result-save-notice"><b>계정당 하나의 결과만 저장돼요.</b><p>이전에 제출한 결과가 있다면 이번 결과로 덮어씌워집니다.</p></div>{resultSaveState === 'saved' && <p className="save-message success" role="status">✓ 결과가 저장됐어요.</p>}{resultSaveState === 'error' && <p className="save-message error" role="alert">결과를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.</p>}<div className="result-actions"><button type="button" className="restart-button" onClick={() => { setResponses({}); setAreaIndex(0); setQuestionIndex(0); setIsPaused(false); setResultSaveState('idle'); setGameStarted(false) }}>다시 하기</button><button type="button" className="submit-result-button" disabled={resultSaveState === 'saving'} onClick={submitPreferenceResult}>{resultSaveState === 'saving' ? '저장하는 중…' : resultSaveState === 'saved' ? '결과 다시 제출하기' : '결과 제출하기'}</button><button type="button" className="home-result-button" onClick={onHome}>홈으로</button></div></div>}
        </section>}

        {step === 3 && <section className="detail-panel auction-panel"><StrengthAuctionGame studentName={studentName} /></section>}

        {step === 4 && <section className="detail-panel"><div className="detail-heading"><span>활동 틀</span><h2>오늘 발견한 나를 정리해요</h2><p>완성된 문장은 이후 개인 결과 화면과 포트폴리오에 연결할 예정이에요.</p></div><div className="reflection-fields"><label>나는 <input placeholder="어떤 활동을" /> 할 때 즐겁다.</label><label>나는 <input placeholder="어떤 활동이나 상황을" /> 하는 것은 별로 좋아하지 않는다.</label><label>「좋아! 싫어!」를 통해 새롭게 발견한 나의 모습<textarea placeholder="오늘 새롭게 알게 된 점을 자유롭게 적어보세요." /></label></div><button type="button" className="disabled-save" disabled>저장 기능 준비 중</button></section>}
      </main>
      <PartnerFooter />
    </div>
  )
}

function App() {
  const [entered, setEntered] = useState(false)
  const [activeSession, setActiveSession] = useState<number | null>(null)
  const [activeSecondActivity, setActiveSecondActivity] = useState<number | null>(null)
  const [activeGuide, setActiveGuide] = useState<GuidePage | null>(null)
  const [mentorProfiles, setMentorProfiles] = useState<MentorProfile[]>([])
  const [sessionPageMode, setSessionPageMode] = useState<'activity' | 'review'>('review')
  const [school, setSchool] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [isEntering, setIsEntering] = useState(false)
  const [entryError, setEntryError] = useState('')
  const [showMasterUnlock, setShowMasterUnlock] = useState(false)
  const [masterCode, setMasterCode] = useState('')
  const [isUnlocking, setIsUnlocking] = useState(false)
  const schoolName = school === 'yesan-high' ? '예산고등학교' : school === 'gwangsi-middle' ? '광시중학교' : school === 'staff' ? '멘토/관리자' : ''
  const completedSessionCount = school === 'yesan-high' || school === 'staff' ? 1 : 0
  const sessions: Session[] = sessionTemplates.map((session) => ({
    ...session,
    status: session.number <= completedSessionCount ? 'done' : session.number === completedSessionCount + 1 ? 'open' : 'locked',
  }))
  const progress = completedSessionCount * 20

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState({ cheongsajinView: 'login' }, '', '#login')
    const handleBack = (event: PopStateEvent) => {
      const view = typeof event.state?.cheongsajinView === 'string' ? event.state.cheongsajinView : 'login'
      const secondActivityMatch = /^activity-2-step-([1-4])$/.exec(view)
      const sessionMatch = /^(activity|session)-(\d+)$/.exec(view)
      const guideMatch = /^guide-(program|profile|mentors|center)$/.exec(view)
      if ((view === 'dashboard' || sessionMatch || secondActivityMatch || guideMatch) && !auth?.currentUser) {
        setActiveSession(null)
        setActiveSecondActivity(null)
        setActiveGuide(null)
        setEntered(false)
        window.history.replaceState({ cheongsajinView: 'login' }, '', '#login')
        return
      }
      if (secondActivityMatch) {
        setEntered(true)
        setSessionPageMode('activity')
        setActiveSession(2)
        setActiveSecondActivity(Number(secondActivityMatch[1]))
        return
      }
      if (guideMatch) {
        setEntered(true)
        setActiveSession(null)
        setActiveSecondActivity(null)
        setActiveGuide(guideMatch[1] as GuidePage)
        return
      }
      if (sessionMatch) {
        setEntered(true)
        setSessionPageMode(sessionMatch[1] === 'activity' ? 'activity' : 'review')
        setActiveSession(Number(sessionMatch[2]))
        setActiveSecondActivity(null)
        return
      }
      if (view === 'dashboard') {
        setEntered(true)
        setActiveSession(null)
        setActiveSecondActivity(null)
        setActiveGuide(null)
        return
      }
      setActiveSession(null)
      setActiveSecondActivity(null)
      setActiveGuide(null)
      setEntered(false)
      if (auth?.currentUser) void signOut(auth)
    }
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (user) => {
      if (!user || entered) return
      try {
        const saved = JSON.parse(window.localStorage.getItem(savedSessionKey) ?? 'null') as { school?: string; name?: string } | null
        if (saved?.school && saved?.name) {
          setSchool(saved.school)
          setName(saved.name)
          setPin('')
          setEntered(true)
          setActiveSession(null)
          setActiveSecondActivity(null)
          setActiveGuide(null)
          window.history.replaceState({ cheongsajinView: 'dashboard' }, '', '#dashboard')
        }
      } catch (error) {
        console.error(error)
        window.localStorage.removeItem(savedSessionKey)
      }
    })
  }, [entered])

  useEffect(() => {
    if (!entered || !db) return
    return onSnapshot(collection(db, 'mentorProfiles'), (snapshot) => {
      setMentorProfiles(snapshot.docs.map((profile) => ({ id: profile.id, ...profile.data() } as MentorProfile)).sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko')))
    }, (error) => console.error(error))
  }, [entered])

  const enter = async (event: FormEvent) => {
    event.preventDefault()
    if (!school) {
      setEntryError('학교를 선택해 주세요.')
      return
    }
    if (!name.trim()) {
      setEntryError('이름을 입력해 주세요.')
      return
    }
    if (!pin.trim()) {
      setEntryError('PIN 번호를 입력해 주세요.')
      return
    }
    const normalizedName = name.trim().replaceAll(' ', '')
    const isSchoolTeacher = (school === 'yesan-high' && normalizedName === '예산고') || (school === 'gwangsi-middle' && normalizedName === '광시중')
    const isStaff = school === 'staff' || isSchoolTeacher
    const isRegistered = testParticipants.some((participant) => participant.school === school && participant.name === name.trim() && participant.pin === pin.trim())
    if (!isStaff && !isRegistered) {
      setEntryError('등록된 정보와 일치하지 않습니다. 학교, 이름, PIN 번호를 확인해 주세요.')
      return
    }
    setIsEntering(true)
    setEntryError('')
    try {
      if (!auth) throw new Error('Firebase configuration is missing')
      if (isStaff) {
        if (!functions) throw new Error('Firebase Functions configuration is missing')
        await signInAnonymously(auth)
        const loginStaff = httpsCallable<{ name: string; pin: string }, { role: 'mentor' | 'teacher' | 'admin'; displayName: string }>(functions, 'staffLogin')
        await loginStaff({ name: name.trim(), pin: pin.trim() })
      } else await signInAnonymously(auth)
      window.localStorage.setItem(savedSessionKey, JSON.stringify({ school, name: name.trim() }))
      setEntered(true)
      setShowMasterUnlock(false)
      window.history.pushState({ cheongsajinView: 'dashboard' }, '', '#dashboard')
    } catch (error) {
      console.error(error)
      const errorCode = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      if (errorCode.includes('resource-exhausted')) {
        setShowMasterUnlock(true)
        setEntryError('PIN 입력이 15분간 잠겼어요. 관리자 코드로 바로 해제할 수 있어요.')
      } else setEntryError(isStaff ? '이름 또는 PIN 번호가 올바르지 않아요.' : '연결에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setIsEntering(false)
    }
  }
  const leave = async () => {
    if (auth?.currentUser) await signOut(auth)
    window.localStorage.removeItem(savedSessionKey)
    setActiveSession(null)
    setActiveSecondActivity(null)
    setActiveGuide(null)
    setEntered(false)
    window.history.replaceState({ cheongsajinView: 'login' }, '', '#login')
  }
  const openSession = (sessionNumber: number, mode: 'activity' | 'review') => {
    setSessionPageMode(mode)
    setActiveSession(sessionNumber)
    const view = mode === 'activity' ? `activity-${sessionNumber}` : `session-${sessionNumber}`
    window.history.pushState({ cheongsajinView: view }, '', `#${view}`)
  }
  const unlockStaff = async () => {
    if (!functions || !name.trim() || !masterCode.trim()) return
    setIsUnlocking(true)
    setEntryError('')
    try {
      const unlock = httpsCallable<{ name: string; masterCode: string }, { unlocked: boolean }>(functions, 'unlockStaffAccount')
      await unlock({ name: name.trim(), masterCode: masterCode.trim() })
      setShowMasterUnlock(false)
      setMasterCode('')
      setEntryError('잠금이 해제됐어요. 멘토 PIN으로 다시 로그인해 주세요.')
    } catch (error) {
      console.error(error)
      setEntryError('관리자 코드를 확인해 주세요.')
    } finally { setIsUnlocking(false) }
  }
  const openSecondActivity = (step: number) => {
    setActiveSecondActivity(step)
    const view = `activity-2-step-${step}`
    window.history.pushState({ cheongsajinView: view }, '', `#${view}`)
  }
  const goDashboard = () => {
    setActiveSession(null)
    setActiveSecondActivity(null)
    setActiveGuide(null)
    window.history.pushState({ cheongsajinView: 'dashboard' }, '', '#dashboard')
  }
  const openGuide = (guide: GuidePage) => {
    setActiveGuide(guide)
    window.history.pushState({ cheongsajinView: `guide-${guide}` }, '', `#guide-${guide}`)
  }
  const saveProfile = async (profile: ProfilePayload) => {
    if (!db || !auth?.currentUser) throw new Error('Firebase 연결이 필요합니다.')
    if (school === 'staff') {
      const session = await getDoc(doc(db, 'staffSessions', auth.currentUser.uid))
      if (!session.exists()) throw new Error('멘토 권한 세션을 찾을 수 없습니다.')
      const accountNumber = String(session.data().accountNumber)
      await setDoc(doc(db, 'mentorProfiles', accountNumber), { accountNumber, displayName: name.trim(), oneLineIntro: profile.oneLineIntro.trim(), schoolMajor: profile.schoolMajor.trim(), interests: profile.interests.trim(), majorReason: profile.majorReason.trim(), careerInterests: profile.careerInterests.trim(), campusLife: profile.campusLife.trim(), strengths: profile.strengths.trim(), message: profile.message.trim(), updatedAt: serverTimestamp() }, { merge: true })
    } else {
      await setDoc(doc(db, 'studentProfiles', auth.currentUser.uid), { userId: auth.currentUser.uid, displayName: name.trim(), school, introduction: profile.introduction.trim(), interests: profile.interests.trim(), hopeJob: profile.hopeJob.trim(), updatedAt: serverTimestamp() }, { merge: true })
    }
  }

  if (!entered) return (
    <div className="welcome-page">
      <main className="welcome-shell">
        <section className="welcome-copy">
        <h1 className="program-title">청·사·진 <span>- 청소년의 사기진작 진로멘토링</span></h1>
        <h2 className="welcome-title"><span>내 가능성을 발견하고,</span><span><em>미래의 청사진</em>을 그려요.</span></h2>
        <p className="welcome-description">좋아하는 것과 잘하는 것을 찾고, AI와 함께 희망 직업을 탐색해 나만의 진로 포트폴리오를 완성해요.</p>
        </section>
        <section className="entry-card">
        <div className="entry-heading"><span className="entry-icon">↗</span><div><h2>활동 시작하기</h2><p>선생님께 받은 참가 정보를 입력해 주세요.</p></div></div>
        <form onSubmit={enter}>
          <label>학교<select value={school} onChange={(e) => { setSchool(e.target.value); setEntryError('') }}><option value="">학교를 선택하세요</option><option value="yesan-high">예산고등학교</option><option value="gwangsi-middle">광시중학교</option><option value="staff">멘토/관리자</option></select></label>
          <label>이름<input value={name} onChange={(e) => { setName(e.target.value); setEntryError('') }} placeholder="이름을 입력해 주세요" autoComplete="name" /></label>
          <label>PIN 번호<input value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setEntryError('') }} placeholder={school === 'staff' ? '6자리 PIN 번호' : 'PIN 번호를 입력해 주세요'} maxLength={6} inputMode="numeric" type="password" autoComplete="current-password" /></label>
          <button type="submit" disabled={isEntering || !isFirebaseConfigured}>{isEntering ? '안전하게 연결하는 중…' : '나의 활동실로 들어가기'} {!isEntering && <span>→</span>}</button>
          {entryError && <p className="entry-error" role="alert">{entryError}</p>}
          {school === 'staff' && showMasterUnlock && <div className="master-unlock"><label>관리자 잠금 해제 코드<input value={masterCode} onChange={(event) => setMasterCode(event.target.value.replace(/\D/g, ''))} type="password" inputMode="numeric" maxLength={8} placeholder="관리자 코드" /></label><button type="button" onClick={unlockStaff} disabled={isUnlocking || !masterCode}>{isUnlocking ? '잠금 해제 중…' : '잠금 바로 해제하기'}</button></div>}
        </form>
        <p className="privacy-note">🔒 입력한 정보는 활동 참여 확인에만 사용해요.</p>
        </section>
      </main>
      <PartnerFooter />
    </div>
  )

  if (activeGuide) {
    const ownMentorProfile = mentorProfiles.find((profile) => profile.displayName === name.trim())
    return <div className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{name.trim()}</b><button className="logout-button" onClick={leave}>로그아웃</button></div></header>
      <main className="guide-detail-page">
        <button className="back-button" type="button" onClick={() => window.history.back()}>← 나의 활동실로</button>
        {activeGuide === 'program' && <><section className="guide-detail-hero blue"><span>🗺️</span><div><small>프로그램 안내</small><h1>청사진이란?</h1><p>청소년의 가능성을 발견하고 미래의 모습을 구체적으로 그려 가는 진로 멘토링 여정이에요.</p></div></section><section className="guide-content-card"><h2>청·사·진의 의미</h2><p><b>청소년의 사기진작 진로멘토링</b>의 줄임말로, 내가 좋아하는 것과 잘하는 것을 찾고 다양한 직업과 진로를 탐색하는 프로그램이에요.</p><div className="program-journey"><article><b>1</b><h3>서로 만나기</h3><p>멘토와 인사하고 진로의 의미를 알아봐요.</p></article><article><b>2</b><h3>나를 발견하기</h3><p>선호와 강점을 재미있는 활동으로 찾아봐요.</p></article><article><b>3</b><h3>역량 키우기</h3><p>희망 직업에 필요한 힘을 탐색해요.</p></article><article><b>4</b><h3>직업 연습하기</h3><p>직업 정보를 찾고 AI 면접을 경험해요.</p></article><article><b>5</b><h3>청사진 완성하기</h3><p>활동 결과를 모아 나만의 포트폴리오를 만들어요.</p></article></div></section></>}
        {activeGuide === 'profile' && <><section className="guide-detail-hero green"><span>👤</span><div><small>{school === 'staff' ? '멘토 정보' : '나의 정보'}</small><h1>{school === 'staff' ? '멘토 프로필 작성' : '학생 프로필 작성'}</h1><p>{school === 'staff' ? '작성한 내용은 멘토 소개 화면에 표시돼요.' : '관심 분야와 희망 진로를 기록하고 나의 변화를 쌓아 가요.'}</p></div></section><section className="guide-content-card"><ProfileEditor kind={school === 'staff' ? 'mentor' : 'student'} displayName={name.trim()} schoolName={schoolName} existing={school === 'staff' ? ownMentorProfile : undefined} onSave={saveProfile} /></section></>}
        {activeGuide === 'mentors' && <><section className="guide-detail-hero orange"><span>🤝</span><div><small>함께하는 사람</small><h1>멘토 소개</h1><p>청·사·진의 여정을 함께할 멘토들의 전공과 진로 이야기를 만나 보세요.</p></div></section><section className="guide-content-card"><div className="mentor-page-heading"><div><h2>우리의 멘토</h2><p>멘토가 프로필을 저장하면 이곳에 바로 표시돼요.</p></div>{school === 'staff' && <button type="button" onClick={() => openGuide('profile')}>내 멘토 프로필 작성 →</button>}</div>{mentorProfiles.length ? <div className="mentor-profile-grid">{mentorProfiles.map((profile) => { const schoolMajor = profile.schoolMajor || [profile.university, profile.major].filter(Boolean).join(' / '); const message = profile.message || profile.introduction; return <article key={profile.id}><div className="mentor-avatar">{profile.displayName.slice(0, 1)}</div><small>{schoolMajor || '학교와 전공을 준비 중이에요'}</small><h2>{profile.displayName} 멘토</h2><p className="mentor-one-line">{profile.oneLineIntro || '한 줄 소개를 준비하고 있어요.'}</p><dl className="mentor-profile-details">{profile.interests && <><dt>관심 분야</dt><dd>{profile.interests}</dd></>}{profile.majorReason && <><dt>전공 선택 이유</dt><dd>{profile.majorReason}</dd></>}{profile.careerInterests && <><dt>관심 진로·직업</dt><dd>{profile.careerInterests}</dd></>}{profile.campusLife && <><dt>대학생활</dt><dd>{profile.campusLife}</dd></>}{profile.strengths && <><dt>나의 강점</dt><dd>{profile.strengths}</dd></>}{!profile.campusLife && profile.careerStory && <><dt>나의 진로 이야기</dt><dd>{profile.careerStory}</dd></>}{message && <><dt>전하고 싶은 말</dt><dd>{message}</dd></>}</dl></article> })}</div> : <div className="empty-mentor-list"><span>🤝</span><h2>멘토 소개를 준비하고 있어요</h2><p>멘토가 프로필을 작성하면 이곳에서 확인할 수 있어요.</p></div>}</section></>}
        {activeGuide === 'center' && <><section className="guide-detail-hero purple"><span>🏫</span><div><small>운영기관 안내</small><h1>예산군청소년수련관 소개</h1><p>청소년이 꿈을 발견하고 다양한 활동을 경험하도록 함께하는 지역 청소년 활동 공간이에요.</p></div></section><section className="guide-content-card center-intro"><div><h2>청소년의 오늘과 미래를 응원합니다</h2><p>예산군청소년수련관은 청소년이 안전하고 즐겁게 참여할 수 있는 문화·진로·자치·체험 활동을 운영하며, 청소년의 건강한 성장을 지원해요.</p></div><div className="center-values"><article><span>🌱</span><h3>성장</h3><p>새로운 경험을 통해 자신의 가능성을 발견해요.</p></article><article><span>🤲</span><h3>참여</h3><p>청소년이 직접 의견을 내고 활동의 주인이 돼요.</p></article><article><span>🎯</span><h3>진로</h3><p>다양한 직업과 삶의 모습을 탐색할 기회를 만들어요.</p></article></div><div className="center-contact"><b>청·사·진 운영</b><span>예산군청소년수련관</span></div></section></>}
      </main>
      <PartnerFooter />
    </div>
  }

  if (activeSession === 1 && sessionPageMode === 'activity') {
    return (
      <div className="app-shell">
        <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{name.trim()}</b><button className="logout-button" onClick={leave}>로그아웃</button></div></header>
        <main className="session-review">
          <button className="back-button" type="button" onClick={() => window.history.back()}>← 나의 활동실로</button>
          <section className="review-hero activity-hero">
            <div>
              <span className="activity-badge">지금 할 활동 · 1회기</span>
              <p className="eyebrow">광시중학교</p>
              <h1>청사진을 위한 첫 만남</h1>
              <p>멘토와 인사하고 서로의 관심사와 경험을 나누며 진로 탐색의 첫걸음을 시작해요.</p>
            </div>
            <div className="review-icon" aria-hidden="true">👋</div>
          </section>
          <section className="session-info" aria-label="활동 정보">
            <div><small>참여 학교</small><b>광시중학교</b></div>
            <div><small>활동 일자</small><b>2026. 9. 1.(화)</b></div>
            <div><small>활동 장소</small><b>1층 도서관</b></div>
            <div><small>활동 시간</small><b>총 100분</b></div>
          </section>
          <section className="activity-notice">
            <span aria-hidden="true">💡</span><div><h2>활동을 시작하기 전에</h2><p>선생님과 멘토의 안내를 잘 듣고, 정답을 찾기보다 나의 생각과 경험을 편안하게 이야기해 주세요.</p></div>
          </section>
          <section className="review-section">
            <div className="review-section-heading"><div><p className="eyebrow">오늘의 활동</p><h2>이 순서대로 함께해요</h2></div><span>6개 활동 · 100분</span></div>
            <div className="activity-timeline activity-steps">
              {firstSessionActivities.map((activity, index) => (
                <article className="timeline-item" key={activity.title}>
                  <div className="timeline-number">{index + 1}</div>
                  <div><div className="timeline-title"><h3>{activity.title}</h3><span>{activity.duration}</span></div><p>{activity.description}</p></div>
                </article>
              ))}
            </div>
          </section>
          <section className="activity-help">
            <div><p>활동 중 도움이 필요한가요?</p><h2>혼자 고민하지 말고 멘토나 선생님에게 이야기해 주세요.</h2></div>
            <button type="button" onClick={() => window.history.back()}>활동실로 돌아가기 →</button>
          </section>
        </main>
        <PartnerFooter />
      </div>
    )
  }

  if (activeSession === 2 && sessionPageMode === 'activity' && activeSecondActivity) {
    return <SecondActivityDetail step={activeSecondActivity} schoolName={schoolName} studentName={name.trim()} onLeave={leave} onHome={goDashboard} />
  }

  if (activeSession === 2 && sessionPageMode === 'activity') {
    const sessionDate = school === 'yesan-high' ? '2026. 9. 4.(금)' : '2026. 9. 8.(화)'
    const sessionPlace = school === 'yesan-high' ? '예산고등학교 지정교실' : '광시중학교 1층 도서관'

    return (
      <div className="app-shell">
        <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{name.trim()}</b><button className="logout-button" onClick={leave}>로그아웃</button></div></header>
        <main className="session-review">
          <button className="back-button" type="button" onClick={() => window.history.back()}>← 나의 활동실로</button>
          <section className="review-hero second-session-hero">
            <div>
              <span className="activity-badge">2회기 · 활동 준비 중</span>
              <p className="eyebrow">{schoolName}</p>
              <h1>선호와 강점 탐색</h1>
              <p>좋아하는 것과 싫어하는 것을 살펴보고, 나만의 강점을 발견하는 활동이에요.</p>
            </div>
            <div className="review-icon" aria-hidden="true">✨</div>
          </section>
          <section className="session-info" aria-label="활동 정보">
            <div><small>참여 학교</small><b>{schoolName}</b></div>
            <div><small>활동 일자</small><b>{sessionDate}</b></div>
            <div><small>활동 장소</small><b>{sessionPlace}</b></div>
            <div><small>활동 시간</small><b>추후 안내</b></div>
          </section>
          <section className="review-section">
            <div className="review-section-heading"><div><p className="eyebrow">2회기 활동</p><h2>활동 내용이 여기에 들어가요</h2></div><span>내용 준비 중</span></div>
            <div className="placeholder-grid">
              <button type="button" className="placeholder-card" onClick={() => openSecondActivity(1)}><span>1</span><div><h3>활동 안내</h3><p>활동의 목적과 진행 방법을 먼저 확인해요.</p></div><b>열기 →</b></button>
              <button type="button" className="placeholder-card featured" onClick={() => openSecondActivity(2)}><span>2</span><div><h3>나의 선호 탐색</h3><strong>좋아, 싫어!</strong><p>24가지 활동과 상황에 대한 내 마음을 선택해요.</p></div><b>게임 시작 →</b></button>
              <button type="button" className="placeholder-card featured" onClick={() => openSecondActivity(3)}><span>3</span><div><h3>나의 강점 탐색</h3><strong>강점 경매장</strong><p>직업에 필요한 강점을 입찰하고 강화해요.</p></div><b>게임 시작 →</b></button>
              <button type="button" className="placeholder-card" onClick={() => openSecondActivity(4)}><span>4</span><div><h3>활동 마무리</h3><p>오늘 새롭게 발견한 나의 모습을 정리해요.</p></div><b>열기 →</b></button>
            </div>
          </section>
          <section className="empty-activity-note"><div aria-hidden="true">💡</div><h2>순서대로 활동해 주세요</h2><p>각 카드를 누르면 세부 활동 페이지로 이동해요. 응답 저장과 전체 워드클라우드는 다음 단계에서 연결할 예정이에요.</p></section>
        </main>
        <PartnerFooter />
      </div>
    )
  }

  if (activeSession === 1 && sessionPageMode === 'review') {
    const sessionDate = school === 'yesan-high' ? '2026. 8. 28.(금)' : '2026. 9. 1.(화)'
    const sessionPlace = school === 'yesan-high' ? '예산고등학교 지정교실' : '광시중학교 1층 도서관'

    return (
      <div className="app-shell">
        <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{name.trim()}</b><button className="logout-button" onClick={leave}>로그아웃</button></div></header>
        <main className="session-review">
          <button className="back-button" type="button" onClick={() => window.history.back()}>← 나의 활동실로</button>
          <section className="review-hero">
            <div>
              <span className="complete-badge">✓ 완료한 활동</span>
              <p className="eyebrow">1회기</p>
              <h1>청사진을 위한 첫 만남</h1>
              <p>나와 멘토, 새로운 가능성을 처음 만난 시간을 돌아봐요.</p>
            </div>
            <div className="review-icon" aria-hidden="true">👋</div>
          </section>
          <section className="session-info" aria-label="활동 정보">
            <div><small>참여 학교</small><b>{schoolName}</b></div>
            <div><small>활동 일자</small><b>{sessionDate}</b></div>
            <div><small>활동 장소</small><b>{sessionPlace}</b></div>
            <div><small>활동 시간</small><b>총 100분</b></div>
          </section>
          <section className="review-section">
            <div className="review-section-heading"><div><p className="eyebrow">활동 돌아보기</p><h2>첫 만남에서 무엇을 했나요?</h2></div><span>6개 활동 · 100분</span></div>
            <div className="activity-timeline">
              {firstSessionActivities.map((activity, index) => (
                <article className="timeline-item" key={activity.title}>
                  <div className="timeline-number">{index + 1}</div>
                  <div><div className="timeline-title"><h3>{activity.title}</h3><span>{activity.duration}</span></div><p>{activity.description}</p></div>
                </article>
              ))}
            </div>
          </section>
          <section className="next-session-card">
            <div><p>다음 활동</p><h2>선호와 강점 탐색</h2><span>좋아하는 것과 나만의 강점을 발견해요.</span></div>
            <button type="button" onClick={() => window.history.back()}>활동실에서 확인하기 →</button>
          </section>
        </main>
        <PartnerFooter />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{name.trim()}</b><button className="logout-button" onClick={leave}>로그아웃</button></div></header>
      <main className="dashboard">
        <section className="dashboard-intro">
          <div><p className="eyebrow">나의 활동실</p><h1>안녕, <em>{name.trim()}</em>!</h1><p>오늘도 나만의 가능성을 하나씩 발견해 볼까요?</p></div>
          <div className="progress-card"><div className="progress-label"><span>나의 여정</span><b>{progress}%</b></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>5개 활동 중 {completedSessionCount}개 완료</small></div>
        </section>
        <section className="dashboard-guide" aria-label="청사진 안내 메뉴">
          <button type="button" onClick={() => openGuide('program')}><span className="guide-icon blue">🗺️</span><div><small>프로그램 안내</small><h2>청사진이란?</h2><p>청·사·진의 의미와 전체 활동 여정을 알아봐요.</p></div><b>→</b></button>
          <button type="button" onClick={() => openGuide('profile')}><span className="guide-icon green">👤</span><div><small>{school === 'staff' ? '멘토 정보' : '나의 정보'}</small><h2>{school === 'staff' ? '멘토 프로필 작성' : '프로필 작성'}</h2><p>{school === 'staff' ? '멘토 소개 화면에 표시할 내 정보를 작성해요.' : '나를 소개하고 관심 분야와 희망 진로를 기록해요.'}</p></div><b>→</b></button>
          <button type="button" onClick={() => openGuide('mentors')}><span className="guide-icon orange">🤝</span><div><small>함께하는 사람</small><h2>멘토 소개</h2><p>이번 여정을 함께할 대학생 멘토를 만나봐요.</p></div><b>→</b></button>
          <button type="button" onClick={() => openGuide('center')}><span className="guide-icon purple">🏫</span><div><small>운영기관 안내</small><h2>예산군청소년수련관 소개</h2><p>청소년의 성장과 활동을 지원하는 공간을 알아봐요.</p></div><b>→</b></button>
        </section>
        <section>
          <div className="section-title"><div><p className="eyebrow">전체 여정</p><h2>회기별 활동</h2></div><span>활동은 순서대로 열려요</span></div>
          <div className="session-grid">{sessions.map((session) => (
            <article className={`session-card ${session.status}`} key={session.number}>
              <div className="session-top"><span className="small-icon">{session.icon}</span><span className="status">{session.status === 'done' ? '완료' : session.status === 'open' ? '진행 중' : '잠김'}</span></div>
              <small>{session.number}회기</small><h3>{session.title}</h3><p>{session.subtitle}</p>
              {session.status === 'done' ? <button type="button" className="card-action" onClick={() => openSession(session.number, 'review')}>활동 다시 보기 <span>→</span></button> : session.status === 'open' ? <button type="button" className="card-action" onClick={() => openSession(session.number, 'activity')}>활동하기 <span>→</span></button> : <div className="card-action">이전 활동을 완료하면 열려요 <span>🔒</span></div>}
            </article>
          ))}</div>
        </section>
      </main>
      <PartnerFooter />
    </div>
  )
}
export default App
