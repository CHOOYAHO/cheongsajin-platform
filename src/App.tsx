import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { signInAnonymously, signOut } from 'firebase/auth'
import './App.css'
import { auth, isFirebaseConfigured } from './lib/firebase'
import chungcheongnamdoLogo from './assets/chungcheongnamdo.png'
import educationOfficeLogo from './assets/chungnam-education-office.png'
import socialServiceLogo from './assets/chungnam-social-service.png'
import youthCenterLogo from './assets/yesan-youth-center.png'

type Session = { number: number; title: string; subtitle: string; status: 'done' | 'open' | 'locked'; icon: string }
type SessionTemplate = Omit<Session, 'status'>
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

function App() {
  const [entered, setEntered] = useState(false)
  const [activeSession, setActiveSession] = useState<number | null>(null)
  const [sessionPageMode, setSessionPageMode] = useState<'activity' | 'review'>('review')
  const [school, setSchool] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [isEntering, setIsEntering] = useState(false)
  const [entryError, setEntryError] = useState('')
  const schoolName = school === 'yesan-high' ? '예산고등학교' : school === 'gwangsi-middle' ? '광시중학교' : ''
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
      const sessionMatch = /^(activity|session)-(\d+)$/.exec(view)
      if ((view === 'dashboard' || sessionMatch) && !auth?.currentUser) {
        setActiveSession(null)
        setEntered(false)
        window.history.replaceState({ cheongsajinView: 'login' }, '', '#login')
        return
      }
      if (sessionMatch) {
        setEntered(true)
        setSessionPageMode(sessionMatch[1] === 'activity' ? 'activity' : 'review')
        setActiveSession(Number(sessionMatch[2]))
        return
      }
      if (view === 'dashboard') {
        setEntered(true)
        setActiveSession(null)
        return
      }
      setActiveSession(null)
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
    setEntered(false)
    window.history.replaceState({ cheongsajinView: 'login' }, '', '#login')
  }
  const openSession = (sessionNumber: number, mode: 'activity' | 'review') => {
    setSessionPageMode(mode)
    setActiveSession(sessionNumber)
    const view = mode === 'activity' ? `activity-${sessionNumber}` : `session-${sessionNumber}`
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
          <label>학교<select value={school} onChange={(e) => { setSchool(e.target.value); setEntryError('') }}><option value="">학교를 선택하세요</option><option value="yesan-high">예산고등학교</option><option value="gwangsi-middle">광시중학교</option></select></label>
          <label>이름<input value={name} onChange={(e) => { setName(e.target.value); setEntryError('') }} placeholder="이름을 입력해 주세요" autoComplete="name" /></label>
          <label>PIN 번호<input value={pin} onChange={(e) => { setPin(e.target.value); setEntryError('') }} placeholder="숫자 4자리" inputMode="numeric" maxLength={4} type="password" autoComplete="current-password" /></label>
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
          <div className="current-content"><div className="big-icon">{currentSession.icon}</div><div><p>{currentSession.number === 1 ? '서로를 알아가는 첫 번째 시간' : '나를 알아가는 두 번째 시간'}</p><h2>{currentSession.title}</h2><span>{currentSession.subtitle}</span></div><button onClick={() => currentSession.number === 1 && openSession(1, 'activity')}>{currentSession.number === 1 ? '활동 시작하기' : '활동 이어하기'} <span>→</span></button></div>
        </section>
        <section>
          <div className="section-title"><div><p className="eyebrow">전체 여정</p><h2>회기별 활동</h2></div><span>활동은 순서대로 열려요</span></div>
          <div className="session-grid">{sessions.map((session) => (
            <article className={`session-card ${session.status}`} key={session.number}>
              <div className="session-top"><span className="small-icon">{session.icon}</span><span className="status">{session.status === 'done' ? '완료' : session.status === 'open' ? '진행 중' : '잠김'}</span></div>
              <small>{session.number}회기</small><h3>{session.title}</h3><p>{session.subtitle}</p>
              {session.status === 'done' ? <button type="button" className="card-action" onClick={() => openSession(session.number, 'review')}>활동 다시 보기 <span>→</span></button> : session.status === 'open' && session.number === 1 ? <button type="button" className="card-action" onClick={() => openSession(1, 'activity')}>활동하기 <span>→</span></button> : <div className="card-action">{session.status === 'open' ? '활동하기' : '이전 활동을 완료하면 열려요'} <span>{session.status === 'locked' ? '🔒' : '→'}</span></div>}
            </article>
          ))}</div>
        </section>
      </main>
      <PartnerFooter />
    </div>
  )
}
export default App
