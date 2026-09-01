import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { signInAnonymously, signOut } from 'firebase/auth'
import './App.css'
import { auth, isFirebaseConfigured } from './lib/firebase'
import { auctionJobs, createAuctionDeck, jobStrengthProfiles } from './data/auction'
import chungcheongnamdoLogo from './assets/chungcheongnamdo.png'
import educationOfficeLogo from './assets/chungnam-education-office.png'
import socialServiceLogo from './assets/chungnam-social-service.png'
import youthCenterLogo from './assets/yesan-youth-center.png'

type Session = { number: number; title: string; subtitle: string; status: 'done' | 'open' | 'locked'; icon: string }
type SessionTemplate = Omit<Session, 'status'>
type PreferenceChoice = 'like' | 'neutral' | 'dislike' | 'unsure'
type PreferenceArea = { id: string; tag: 'R' | 'I' | 'A' | 'S' | 'E' | 'C'; title: string; icon: string; guide: string; questions: string[] }
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
  { school: 'staff', name: '1', pin: '1' },
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

type AuctionPhase = 'lobby' | 'waiting' | 'voting' | 'auction' | 'sold' | 'result'

function StrengthAuctionGame({ studentName }: { studentName: string }) {
  const [phase, setPhase] = useState<AuctionPhase>('lobby')
  const [role, setRole] = useState<'host' | 'participant'>('participant')
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [initialMoney, setInitialMoney] = useState(1000)
  const [bidLimit, setBidLimit] = useState(10)
  const [itemLimit, setItemLimit] = useState(8)
  const [voteTime, setVoteTime] = useState(15)
  const [selectedJob, setSelectedJob] = useState('')
  const [auctionIndex, setAuctionIndex] = useState(0)
  const [auctionTime, setAuctionTime] = useState(10)
  const [currentPrice, setCurrentPrice] = useState(200)
  const [highestBidder, setHighestBidder] = useState('지민')
  const [balance, setBalance] = useState(1000)
  const [inventory, setInventory] = useState<Record<string, number>>({})
  const [auctionDeck, setAuctionDeck] = useState<string[]>([])
  const currentStrength = auctionDeck[auctionIndex] ?? '문제해결능력'
  const myName = studentName || '참가자'
  const myStrengthLevel = inventory[currentStrength] ?? 0
  const rarity = (count: number) => count >= 3 ? 'EPIC' : count === 2 ? 'RARE' : 'NORMAL'

  const createRoom = () => {
    setRole('host')
    setRoomCode(String(Math.floor(100000 + Math.random() * 900000)))
    setPhase('waiting')
  }
  const joinRoom = () => {
    if (joinCode.trim().length < 4) return
    setRole('participant')
    setRoomCode(joinCode.trim().toUpperCase())
    setPhase('waiting')
  }
  const startVote = () => {
    setBalance(initialMoney)
    setVoteTime(15)
    setPhase('voting')
  }
  const finishVote = () => {
    const job = selectedJob || auctionJobs[Math.floor(Math.random() * auctionJobs.length)]
    setSelectedJob(job)
    setAuctionDeck(createAuctionDeck(job, itemLimit))
    setAuctionIndex(0)
    setAuctionTime(bidLimit)
    setPhase('auction')
  }
  const placeBid = (amount: number) => {
    if (amount <= currentPrice || amount > balance || myStrengthLevel >= 3) return
    setCurrentPrice(amount)
    setHighestBidder(myName)
    if (auctionTime <= 2) setAuctionTime(5)
  }
  const nextAuction = () => {
    setAuctionIndex((current) => current + 1)
    setCurrentPrice(200)
    setHighestBidder('지민')
    setAuctionTime(bidLimit)
    setPhase('auction')
  }

  useEffect(() => {
    if (phase !== 'voting') return
    if (voteTime <= 0) {
      finishVote()
      return
    }
    const timer = window.setTimeout(() => setVoteTime((current) => current - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [phase, voteTime])

  useEffect(() => {
    if (phase !== 'auction') return
    if (auctionTime <= 0) {
      if (highestBidder === myName) {
        setBalance((current) => current - currentPrice)
        setInventory((current) => ({ ...current, [currentStrength]: Math.min(3, (current[currentStrength] ?? 0) + 1) }))
      }
      setPhase('sold')
      return
    }
    const timer = window.setTimeout(() => setAuctionTime((current) => current - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [phase, auctionTime, highestBidder, myName, currentPrice, currentStrength])

  if (phase === 'lobby') return <div className="auction-lobby">
    <div className="auction-title"><span>🔨</span><h2>강점 경매장</h2><p>선택한 직업에 필요한 강점을 전략적으로 낙찰받아 보세요.</p></div>
    <div className="auction-entry-grid"><article><span>방장</span><h3>새 게임방 만들기</h3><p>참가자를 초대하고 금액·시간·상품 수를 설정해요.</p><button type="button" onClick={createRoom}>방 만들기 →</button></article><article><span>참가자</span><h3>게임방 입장하기</h3><p>방장이 알려준 코드를 입력해 주세요.</p><input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="방 코드 입력" maxLength={6} /><button type="button" onClick={joinRoom} disabled={joinCode.trim().length < 4}>입장하기 →</button></article></div>
    <div className="prototype-notice"><b>1차 프로토타입</b><p>현재는 한 기기에서 게임 흐름과 규칙을 시험하는 화면이에요. 실제 여러 기기 접속은 다음 단계에서 Firestore 실시간 방으로 연결해요.</p></div>
  </div>

  if (phase === 'waiting') return <div className="auction-waiting">
    <div className="room-summary"><div><span>방 코드</span><strong>{roomCode}</strong></div><div><span>참가자</span><strong>4 / 20명</strong></div><div><span>내 닉네임</span><strong>{myName}</strong></div></div>
    {role === 'host' ? <><div className="waiting-columns"><section><div className="auction-section-title"><h3>참가자 목록</h3><span>모두 접속 중</span></div><ul className="participant-list"><li><i />{myName}<b>방장</b></li><li><i />지민<span>접속</span></li><li><i />서준<span>접속</span></li><li><i />하은<span>접속</span></li></ul></section><section><div className="auction-section-title"><h3>게임 설정</h3><span>방장 전용</span></div><div className="auction-settings"><label>참가 가능 인원<input value={20} disabled /></label><label>초기 보유금액<input type="number" value={initialMoney} onChange={(event) => setInitialMoney(Number(event.target.value))} /></label><label>상품당 제한시간<select value={bidLimit} onChange={(event) => setBidLimit(Number(event.target.value))}><option value={7}>7초</option><option value={10}>10초</option><option value={15}>15초</option></select></label><label>총 경매 상품 수<input type="number" min={4} max={20} value={itemLimit} onChange={(event) => setItemLimit(Number(event.target.value))} /></label><label>직업 선택 방식<input value="참가자 15초 투표" disabled /></label></div></section></div><button type="button" className="auction-primary wide" onClick={startVote}>게임 시작 →</button></> : <div className="participant-wait"><div className="waiting-pulse">●</div><h3>방장이 게임을 준비하고 있습니다.</h3><p>참가자 4 / 20명 · 방 코드 {roomCode}</p><button type="button" className="auction-primary" onClick={startVote}>프로토타입 게임 진행 보기 →</button></div>}
  </div>

  if (phase === 'voting') return <div className="job-vote"><div className="auction-countdown"><b>{voteTime}</b><span>초</span></div><p>이번 게임의 목표 직업</p><h2>{selectedJob || '어떤 직업의 역량을 모을까요?'}</h2><span>원하는 직업을 하나 선택하세요. 최다 득표 직업으로 경매를 시작해요.</span><div className="job-options">{auctionJobs.map((job) => <button type="button" className={selectedJob === job ? 'selected' : ''} onClick={() => setSelectedJob(job)} key={job}>{job}</button>)}</div><div className="vote-actions"><button type="button" className="random-job" onClick={() => setSelectedJob(auctionJobs[Math.floor(Math.random() * auctionJobs.length)])}>🎲 랜덤 선택</button><button type="button" className="auction-primary" onClick={finishVote}>투표 마감·경매 시작 →</button></div></div>

  if (phase === 'sold') {
    const wonByMe = highestBidder === myName
    const nextLevel = myStrengthLevel
    return <div className="sold-screen"><span className="hammer-hit">🔨</span><p>낙찰!</p><h2>{currentStrength}</h2><div className="sold-price"><b>{highestBidder}</b><strong>{currentPrice}P</strong></div>{wonByMe && <div className={`upgrade-card rarity-${rarity(nextLevel).toLowerCase()}`}><span>{nextLevel > 1 ? '✨ 등급 강화!' : '새로운 강점 획득!'}</span><h3>{currentStrength}</h3><b>{rarity(nextLevel)}</b></div>}<button type="button" className="auction-primary" onClick={() => auctionIndex + 1 >= itemLimit ? setPhase('result') : nextAuction()}>{auctionIndex + 1 >= itemLimit ? '결과 확인 →' : '다음 상품 →'}</button></div>
  }

  if (phase === 'result') {
    const profile = jobStrengthProfiles[selectedJob]
    const groups = [
      { key: 'core' as const, title: '핵심 역량', description: '주요 업무 수행에 특히 중요해요.' },
      { key: 'related' as const, title: '관련 역량', description: '원활한 직무 수행과 밀접하게 연결돼요.' },
      { key: 'lower' as const, title: '우선도가 낮은 역량', description: '쓸모없는 역량이 아니라, 상대적 우선도가 낮아요.' },
    ]
    return <div className="auction-result"><span className="result-kicker">경매 종료 · 중요도 공개</span><h2>{selectedJob}에게 어떤 역량이 중요할까요?</h2><p className="result-guide">게임 중에는 숨겨졌던 직업별 중요도를 내 낙찰 결과와 비교해 보세요. 카드 등급은 중요도가 아니라 같은 역량을 낙찰받은 횟수예요.</p><div className="importance-grid">{groups.map((group) => <section className={`importance-${group.key}`} key={group.key}><h3>{group.title}</h3><p>{group.description}</p><ul>{profile[group.key].map((strength) => <li key={strength}><span>{strength}</span>{inventory[strength] ? <b className={`rarity-${rarity(inventory[strength]).toLowerCase()}`}>내 카드 {rarity(inventory[strength])}</b> : <small>미보유</small>}</li>)}</ul></section>)}</div><div className="result-question"><b>함께 이야기해 봐요</b><p>내가 높은 금액을 투자한 역량은 실제 중요도와 어떻게 달랐나요? 그렇게 판단한 이유는 무엇인가요?</p></div><button type="button" className="auction-primary" onClick={() => setPhase('lobby')}>로비로 돌아가기</button></div>
  }

  const bidOptions = [currentPrice + 50, currentPrice + 100, currentPrice + 150]
  return <div className="auction-stage"><div className="auction-topline"><span>{auctionIndex + 1} / {itemLimit} 상품</span><b>목표 직업 · {selectedJob}</b></div><div className="auction-product"><div className={`auction-clock ${auctionTime <= 3 ? 'urgent' : ''}`}><b>{auctionTime}</b><span>초</span></div><span>지금 필요한 강점</span><h2>🔨 {currentStrength}</h2>{myStrengthLevel >= 3 && <p className="epic-block">🌟 최고 등급을 보유하고 있어 입찰할 수 없어요.</p>}<div className="current-bid"><span>현재가</span><strong>{currentPrice}P</strong><small>최고 입찰자 · {highestBidder}</small></div><div className="bid-buttons">{bidOptions.map((amount) => <button type="button" onClick={() => placeBid(amount)} disabled={amount > balance || myStrengthLevel >= 3} key={amount}>{amount}P</button>)}</div><p className="anti-snipe">종료 2초 전 새 입찰이 들어오면 시간이 5초로 연장돼요.</p></div><aside className="auction-player"><div><span>{myName}</span><strong>💰 {balance}P</strong></div><h3>보유 역량</h3>{Object.keys(inventory).length ? <ul>{Object.entries(inventory).map(([strength, count]) => <li key={strength}><span>{strength}</span><b className={`rarity-${rarity(count).toLowerCase()}`}>{rarity(count)}</b></li>)}</ul> : <p>아직 낙찰받은 역량이 없어요.</p>}</aside></div>
}

function SecondActivityDetail({ step, schoolName, studentName, onLeave }: { step: number; schoolName: string; studentName: string; onLeave: () => void }) {
  const [gameStarted, setGameStarted] = useState(false)
  const [areaIndex, setAreaIndex] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState(7)
  const [responses, setResponses] = useState<Record<string, PreferenceChoice>>({})
  const area = preferenceAreas[areaIndex]
  const isGameComplete = areaIndex >= preferenceAreas.length
  const currentQuestion = area?.questions[questionIndex]
  const choiceLabels: Record<PreferenceChoice, string> = { like: '👍 좋아!', neutral: '😐 그저 그래', dislike: '👎 싫어!', unsure: '🤔 고민돼요' }
  const selectedQuestions = (choice: PreferenceChoice) => preferenceAreas.flatMap((item) => item.questions.filter((question) => responses[`${item.id}:${question}`] === choice))

  const answerCurrentQuestion = (choice: PreferenceChoice) => {
    if (!area || !currentQuestion) return
    setResponses((current) => ({ ...current, [`${area.id}:${currentQuestion}`]: choice }))
    if (questionIndex < area.questions.length - 1) setQuestionIndex((current) => current + 1)
    else {
      setQuestionIndex(0)
      setAreaIndex((current) => current + 1)
    }
  }

  useEffect(() => {
    if (!gameStarted || isGameComplete || step !== 2 || !currentQuestion) return
    setTimeLeft(7)
    const countdown = window.setInterval(() => setTimeLeft((current) => Math.max(0, current - 1)), 1000)
    const timeout = window.setTimeout(() => answerCurrentQuestion('unsure'), 7000)
    return () => {
      window.clearInterval(countdown)
      window.clearTimeout(timeout)
    }
  }, [gameStarted, isGameComplete, areaIndex, questionIndex, step])

  const detailContent = [
    { eyebrow: 'STEP 1', title: '활동 안내', subtitle: '나의 선택에는 정답이 없어요', icon: '🧭', description: '선호와 비선호가 사람마다 다르다는 점을 이해하고, 오늘 진행할 네 가지 활동의 흐름을 확인해요.' },
    { eyebrow: 'STEP 2', title: '나의 선호 탐색', subtitle: '좋아, 싫어!', icon: '👍', description: '여러 활동과 상황을 빠르게 살펴보며 지금 내 생각과 가장 가까운 답을 선택해요.' },
    { eyebrow: 'STEP 3', title: '나의 강점 탐색', subtitle: '강점 경매장', icon: '🔨', description: '직업에 필요한 강점을 전략적으로 낙찰받고, 같은 강점을 모아 더 높은 등급으로 강화해요.' },
    { eyebrow: 'STEP 4', title: '활동 마무리', subtitle: '오늘 발견한 나를 내 말로 정리하기', icon: '📝', description: '선호와 강점 활동에서 새롭게 알게 된 나의 모습을 짧은 문장으로 남겨요.' },
  ][step - 1]

  return (
    <div className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{studentName}</b><button onClick={onLeave} aria-label="나가기">↗</button></div></header>
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
          {!gameStarted && <div className="game-intro"><span className="game-symbol">👍 👎</span><h2>좋아! 싫어!</h2><p>우리는 좋아하는 것도, 싫어하는 것도 모두 달라요.<br />화면에 나타나는 활동을 보고 지금 내 생각과 가장 가까운 답을 빠르게 선택해 보세요.</p><div className="game-rules"><span>한 번에 한 문항</span><span>문항마다 7초</span><span>시간이 지나면 ‘고민돼요’</span><span>총 24문항</span></div><button type="button" onClick={() => setGameStarted(true)}>시작하기 →</button></div>}
          {gameStarted && !isGameComplete && area && <div className="question-stage">
            <div className="game-progress"><div><span>{areaIndex * 4 + questionIndex + 1} / 24</span><b>{area.title}</b></div><div className="progress-dots">{preferenceAreas.map((item, index) => <i className={index <= areaIndex ? 'active' : ''} key={item.id} />)}</div></div>
            <div className="area-heading"><span>{area.icon}</span><div><h2>{area.title}</h2><p>{area.guide}</p></div></div>
            <article className="quick-question-card">
              <div className="question-timer" aria-label={`${timeLeft}초 남음`}><b>{timeLeft}</b><span>초</span></div>
              <div className="timer-track"><span style={{ width: `${(timeLeft / 7) * 100}%` }} /></div>
              <small>{questionIndex + 1}번째 질문</small>
              <h3>{currentQuestion}</h3>
              <div className="quick-answer-buttons">{(['like', 'neutral', 'dislike'] as PreferenceChoice[]).map((choice) => <button type="button" className={choice} onClick={() => answerCurrentQuestion(choice)} key={choice}>{choiceLabels[choice]}</button>)}</div>
              <p>7초 안에 선택하지 않으면 <b>🤔 고민돼요</b>로 기록하고 다음 질문으로 넘어가요.</p>
            </article>
          </div>}
          {gameStarted && isGameComplete && <div className="preference-summary"><span className="complete-symbol">✓</span><h2>24개 선택을 모두 마쳤어요!</h2><p>좋아하거나 싫어한다고 선택한 활동을 한눈에 살펴보세요. <b>고민돼요 {selectedQuestions('unsure').length}개</b></p><div className="summary-columns"><div><h3>👍 좋아!</h3>{selectedQuestions('like').length ? <ul>{selectedQuestions('like').map((question) => <li key={question}>{question}</li>)}</ul> : <p>선택한 항목이 없어요.</p>}</div><div><h3>👎 싫어!</h3>{selectedQuestions('dislike').length ? <ul>{selectedQuestions('dislike').map((question) => <li key={question}>{question}</li>)}</ul> : <p>선택한 항목이 없어요.</p>}</div></div><div className="next-build-note"><b>다음 개발 단계</b><p>각 목록에서 핵심 항목 최대 3개 고르기 → 자유입력 → 개인 결과 → 전체 워드클라우드 순서로 이어질 예정이에요.</p></div><button type="button" className="restart-button" onClick={() => { setResponses({}); setAreaIndex(0); setQuestionIndex(0); setGameStarted(false) }}>처음부터 다시 하기</button></div>}
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
  const [sessionPageMode, setSessionPageMode] = useState<'activity' | 'review'>('review')
  const [school, setSchool] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [isEntering, setIsEntering] = useState(false)
  const [entryError, setEntryError] = useState('')
  const schoolName = school === 'yesan-high' ? '예산고등학교' : school === 'gwangsi-middle' ? '광시중학교' : school === 'staff' ? '멘토/관리자' : ''
  const completedSessionCount = school === 'yesan-high' ? 1 : 0
  const sessions: Session[] = sessionTemplates.map((session) => ({
    ...session,
    status: session.number <= completedSessionCount ? 'done' : session.number === completedSessionCount + 1 ? 'open' : 'locked',
  }))
  const currentSession = sessions.find((session) => session.status === 'open') ?? sessions[sessions.length - 1]
  const progress = completedSessionCount * 20

  useEffect(() => {
    window.history.replaceState({ cheongsajinView: 'login' }, '', '#login')
    const handleBack = (event: PopStateEvent) => {
      const view = typeof event.state?.cheongsajinView === 'string' ? event.state.cheongsajinView : 'login'
      const secondActivityMatch = /^activity-2-step-([1-4])$/.exec(view)
      const sessionMatch = /^(activity|session)-(\d+)$/.exec(view)
      if ((view === 'dashboard' || sessionMatch || secondActivityMatch) && !auth?.currentUser) {
        setActiveSession(null)
        setActiveSecondActivity(null)
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
        return
      }
      setActiveSession(null)
      setActiveSecondActivity(null)
      setEntered(false)
      if (auth?.currentUser) void signOut(auth)
    }
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])

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
    const isRegistered = testParticipants.some((participant) => participant.school === school && participant.name === name.trim() && participant.pin === pin.trim())
    if (!isRegistered) {
      setEntryError('등록된 정보와 일치하지 않습니다. 학교, 이름, PIN 번호를 확인해 주세요.')
      return
    }
    setIsEntering(true)
    setEntryError('')
    try {
      if (!auth) throw new Error('Firebase configuration is missing')
      await signInAnonymously(auth)
      setEntered(true)
      window.history.pushState({ cheongsajinView: 'dashboard' }, '', '#dashboard')
    } catch (error) {
      console.error(error)
      setEntryError('연결에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setIsEntering(false)
    }
  }
  const leave = async () => {
    if (auth?.currentUser) await signOut(auth)
    setActiveSession(null)
    setActiveSecondActivity(null)
    setEntered(false)
    window.history.replaceState({ cheongsajinView: 'login' }, '', '#login')
  }
  const openSession = (sessionNumber: number, mode: 'activity' | 'review') => {
    setSessionPageMode(mode)
    setActiveSession(sessionNumber)
    const view = mode === 'activity' ? `activity-${sessionNumber}` : `session-${sessionNumber}`
    window.history.pushState({ cheongsajinView: view }, '', `#${view}`)
  }
  const openSecondActivity = (step: number) => {
    setActiveSecondActivity(step)
    const view = `activity-2-step-${step}`
    window.history.pushState({ cheongsajinView: view }, '', `#${view}`)
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
          <label>PIN 번호<input value={pin} onChange={(e) => { setPin(e.target.value); setEntryError('') }} placeholder="PIN 번호를 입력해 주세요" maxLength={4} type="password" autoComplete="current-password" /></label>
          <button type="submit" disabled={isEntering || !isFirebaseConfigured}>{isEntering ? '안전하게 연결하는 중…' : '나의 활동실로 들어가기'} {!isEntering && <span>→</span>}</button>
          {entryError && <p className="entry-error" role="alert">{entryError}</p>}
        </form>
        <p className="privacy-note">🔒 입력한 정보는 활동 참여 확인에만 사용해요.</p>
        </section>
      </main>
      <PartnerFooter />
    </div>
  )

  if (activeSession === 1 && sessionPageMode === 'activity') {
    return (
      <div className="app-shell">
        <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{name.trim()}</b><button onClick={leave} aria-label="나가기">↗</button></div></header>
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
    return <SecondActivityDetail step={activeSecondActivity} schoolName={schoolName} studentName={name.trim()} onLeave={leave} />
  }

  if (activeSession === 2 && sessionPageMode === 'activity') {
    const sessionDate = school === 'yesan-high' ? '2026. 9. 4.(금)' : '2026. 9. 8.(화)'
    const sessionPlace = school === 'yesan-high' ? '예산고등학교 지정교실' : '광시중학교 1층 도서관'

    return (
      <div className="app-shell">
        <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{name.trim()}</b><button onClick={leave} aria-label="나가기">↗</button></div></header>
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
        <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{name.trim()}</b><button onClick={leave} aria-label="나가기">↗</button></div></header>
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
      <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{name.trim()}</b><button onClick={leave} aria-label="나가기">↗</button></div></header>
      <main className="dashboard">
        <section className="dashboard-intro">
          <div><p className="eyebrow">나의 활동실</p><h1>안녕, <em>{name.trim()}</em>!</h1><p>오늘도 나만의 가능성을 하나씩 발견해 볼까요?</p></div>
          <div className="progress-card"><div className="progress-label"><span>나의 여정</span><b>{progress}%</b></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>5개 활동 중 {completedSessionCount}개 완료</small></div>
        </section>
        <section className="current-session">
          <div className="session-badge">지금 할 활동 · {currentSession.number}회기</div>
          <div className="current-content"><div className="big-icon">{currentSession.icon}</div><div><p>{currentSession.number === 1 ? '서로를 알아가는 첫 번째 시간' : '나를 알아가는 두 번째 시간'}</p><h2>{currentSession.title}</h2><span>{currentSession.subtitle}</span></div><button onClick={() => openSession(currentSession.number, 'activity')}>{currentSession.number === 1 ? '활동 시작하기' : '활동 이어하기'} <span>→</span></button></div>
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
