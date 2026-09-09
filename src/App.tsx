import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import './App.css'
import { auth, db, functions, isFirebaseConfigured } from './lib/firebase'
import { auctionJobs, createAuctionDeckForJobs, jobStrengthProfiles, strengthDescriptions } from './data/auction'
import chungcheongnamdoLogo from './assets/chungcheongnamdo.png'
import educationOfficeLogo from './assets/chungnam-education-office.png'
import socialServiceLogo from './assets/chungnam-social-service.png'
import youthCenterLogo from './assets/yesan-youth-center.png'
import accessQrImage from './assets/access-qr.jpg'

type Session = { number: number; title: string; subtitle: string; status: 'done' | 'open' | 'locked'; icon: string }
type SessionTemplate = Omit<Session, 'status'>
type PreferenceChoice = 'like' | 'neutral' | 'dislike' | 'unsure'
type PreferenceArea = { id: string; tag: 'R' | 'I' | 'A' | 'S' | 'E' | 'C'; title: string; icon: string; guide: string; questions: string[] }
type PreferenceResult = { id: string; displayName?: string; schoolName?: string; responses?: Record<string, PreferenceChoice>; coreLikes?: string[]; coreDislikes?: string[]; reflection?: string }
type GuidePage = 'program' | 'profile' | 'mentors' | 'center' | 'questions'
type ProfilePayload = { introduction: string; interests: string; hopeJob: string; oneLineIntro: string; schoolMajor: string; majorReason: string; careerInterests: string; campusLife: string; strengths: string; message: string }
type MentorProfile = { id: string; displayName: string; oneLineIntro?: string; schoolMajor?: string; interests?: string; majorReason?: string; careerInterests?: string; campusLife?: string; strengths?: string; message?: string; major?: string; university?: string; introduction?: string; careerStory?: string }
type MentorQuestion = { id: string; studentName: string; schoolName: string; mentorId: string; mentorName: string; question: string; answer?: string; status: 'waiting' | 'read' | 'answered'; createdAt?: { toMillis: () => number }; answeredAt?: { toMillis: () => number } }
type StaffRole = 'mentor' | 'teacher' | 'admin'
type IssuedStudentPin = { accountNumber: string; displayName?: string; pin: string }
type ManagedStudentAccount = { id: string; accountNumber: string; displayName: string; currentPin: string; active: boolean }
type StaffSessionPlan = { title: string; subtitle: string; description: string; icon: string; theme: string; activities: { duration: string; title: string; description: string; mentorTip: string }[] }
type AdminSectionId = 'accounts' | 'activities' | 'records' | 'library'
type SessionLockMap = Record<number, boolean>
type SessionLockTarget = 'yesan' | 'gwangsi' | 'mentor'
type SessionLocksByTarget = Record<SessionLockTarget, SessionLockMap>
type MasterViewMode = 'mentor' | 'yesan-high' | 'gwangsi-middle'
type InterviewCompany = { name: string; fields: string[]; description: string; roles: string[]; strengths: string[] }
type InterviewDifficulty = 'veryEasy' | 'easy' | 'medium' | 'hard'
type InterviewApplication = { role: string; difficulty: InterviewDifficulty; interestReason: string; strengths: string; experience: string; closingLine: string }
type InterviewTurn = { question: string; answer: string; feedback?: string }
type InterviewDecision = 'pass' | 'hold' | 'retry'
type InterviewFeedbackTone = 'good' | 'neutral' | 'bad'
type InterviewStepResponse = { interviewId: string; question: string; feedback?: string; feedbackTone?: InterviewFeedbackTone; hint?: string; hintIntent?: string; hintGuide?: string; closingSummary?: string; suggestedStrengths?: string[]; decision?: InterviewDecision; score?: number; aiSource?: 'openai' | 'fallback'; status: 'inProgress' | 'completed' }
const defaultSessionLockMap: SessionLockMap = { 1: true, 2: true, 3: false, 4: false, 5: false }
const defaultSessionLocks: SessionLocksByTarget = {
  yesan: { ...defaultSessionLockMap },
  gwangsi: { ...defaultSessionLockMap },
  mentor: { ...defaultSessionLockMap },
}
const sessionTemplates: SessionTemplate[] = [
  { number: 1, title: '청사진을 위한 첫 만남', subtitle: '나와 멘토, 새로운 가능성을 만나요', icon: '👋' },
  { number: 2, title: '선호와 강점 탐색', subtitle: '좋아하는 것과 나만의 강점을 발견해요', icon: '✨' },
  { number: 3, title: '진로 역량 갖추기', subtitle: '관심 직업의 실제 업무와 AI 채용면접을 경험해요', icon: '🧩' },
  { number: 4, title: '직업 탐색', subtitle: '전문강사와 함께 진로와 직업을 넓게 탐색해요', icon: '💬' },
  { number: 5, title: '나만의 청사진', subtitle: 'Notion 미래 포트폴리오로 나의 미래를 정리해요', icon: '🗺️' },
]

const firstSessionActivities = [
  { duration: '5분', title: '사전 설문지 작성', description: '활동을 시작하기 전, 나의 진로 역량을 돌아보고 설문에 답했어요.' },
  { duration: '15분', title: '오리엔테이션 및 안전교육', description: '예산군청소년수련관과 청·사·진 프로그램의 전체 여정을 알아보고 안전수칙을 확인했어요.' },
  { duration: '10분', title: '멘토 소개', description: '멘토의 전공과 대학생활, 전공을 선택한 계기와 진로 경험을 들었어요.' },
  { duration: '40분', title: '멘토와의 첫 만남', description: '랜덤 질문을 뽑아 관심사와 경험, 강점과 꿈을 이야기하며 서로를 알아갔어요.' },
  { duration: '20분', title: '진로와 직업', description: '퀴즈와 짧은 이야기를 통해 진로와 직업의 의미를 생각해 봤어요.' },
  { duration: '10분', title: '활동 마무리', description: '궁금한 점을 나누고 다음 회기인 선호와 강점 탐색 활동을 확인했어요.' },
]

const staffSessionPlans: Record<number, StaffSessionPlan> = {
  3: {
    title: '진로 역량 갖추기', subtitle: '나의 선호와 경험을 관심 직업, 실제 업무, AI 채용면접으로 연결해요.', description: '2회기에서 발견한 선호와 역량을 관심 직업과 연결하고, 그 직업의 실제 업무를 비교한 뒤 희망 직업에 지원했다고 가정한 AI 채용면접을 경험하는 회기예요.', icon: '🧩', theme: 'competency',
    activities: [
      { duration: '10분', title: '2회기 결과 돌아보기', description: '자기이해검사, 좋아! 싫어!, 강점 경매장에서 발견한 선호와 역량을 다시 확인해요.', mentorTip: '결과를 점수처럼 해석하지 말고 학생이 고른 이유와 연결해 주세요.' },
      { duration: '15분', title: '내 경험 속 역량 찾기', description: '일상 경험을 떠올리고 경험, 내가 한 행동, 그 과정에서 드러난 역량을 연결해요.', mentorTip: '추상적인 장점보다 실제 행동과 근거가 나오도록 질문해 주세요.' },
      { duration: '15분', title: '관심 직업 연결하기', description: '나의 선호와 경험 속 역량을 바탕으로 더 알아보고 싶은 직업을 선택하고, 현재 알고 있는 내용을 정리해요.', mentorTip: '직업을 확정시키기보다 알아보고 싶은 이유를 말하게 해 주세요.' },
      { duration: '20분', title: '이 직업, 무슨 일을 할까?', description: '홈페이지를 활용해 선택한 직업이 실제로 어떤 일을 할지 먼저 자유롭게 예상하고 다른 학생들의 생각도 확인해요.', mentorTip: '틀린 답을 찾기보다 직업에 대한 현재 이미지를 충분히 꺼내게 해 주세요.' },
      { duration: '20분', title: '실제 업무 들여다보기', description: '브레인스토밍 결과와 실제 직업정보를 비교하며 알고 있던 업무, 새로 알게 된 업무, 다르게 알고 있던 내용을 확인해요.', mentorTip: '업무와 필요한 역량이 왜 연결되는지 한 번 더 짚어 주세요.' },
      { duration: '20분', title: 'AI 가상면접', description: '희망 직업에 실제 지원했다고 가정하고 AI 면접관의 질문과 후속 질문에 지원자처럼 답변해요.', mentorTip: '직업정보 Q&A나 역할극이 아니라 채용면접 시뮬레이션으로 안내해 주세요.' },
    ],
  },
  4: {
    title: '직업 탐색', subtitle: '전문강사와 함께 다양한 진로와 직업을 탐색해요.', description: '전문강사와 협의해 확정되는 참여형 진로·직업 탐색 회기예요. 현재 웹페이지에서는 특정 세부 활동을 임의로 확정하지 않고, 생각을 넓히고 나에게 다시 연결하는 방향을 안내해요.', icon: '💬', theme: 'interview',
    activities: [
      { duration: '협의', title: '전문강사와 함께하는 참여형 진로·직업 탐색', description: '강사의 전문영역과 실제 운영 가능한 프로그램에 맞춰 다양한 진로와 직업을 탐색해요.', mentorTip: '세부 활동은 확정 전까지 임의로 고정하지 않아요.' },
      { duration: '협의', title: '청소년 간 의견 공유', description: '활동 과정에서 떠오른 생각과 관점을 서로 나누며 직업을 바라보는 폭을 넓혀요.', mentorTip: '학생들의 의견이 비교나 평가가 아니라 확장으로 이어지게 도와주세요.' },
      { duration: '협의', title: '다양한 진로·직업 관점 확장', description: '익숙한 직업명 너머의 역할, 일하는 방식, 필요한 태도를 살펴봐요.', mentorTip: '하나의 정답보다 다양한 가능성을 발견하도록 안내해 주세요.' },
      { duration: '협의', title: '새롭게 알게 된 내용 기록', description: '활동을 통해 새롭게 알게 된 내용과 관심 분야를 자신의 언어로 남겨요.', mentorTip: '5회기 미래설계로 가져갈 개인별 발견을 정리해 주세요.' },
    ],
  },
  5: {
    title: '나만의 청사진', subtitle: '1~4회기 기록을 종합해 Notion 미래 포트폴리오를 만들어요.', description: '지금까지 발견한 흥미, 역량, 관심 직업, 새롭게 알게 된 내용을 종합해 10년 뒤의 나를 구체화하고 개인별 Notion 미래 포트폴리오로 정리하는 회기예요.', icon: '🗺️', theme: 'blueprint',
    activities: [
      { duration: '20분', title: '지금까지의 활동 돌아보기', description: '내가 좋아하는 것, 내가 가진 역량, 관심 직업, 새롭게 발견한 내용을 1~4회기 기록에서 골라요.', mentorTip: '모든 기록을 옮기기보다 자신에게 중요한 내용을 선택하게 해 주세요.' },
      { duration: '20분', title: '10년 뒤의 나 상상하기', description: '지금까지의 기록을 바탕으로 미래의 내 모습과 일하는 장면을 구체적으로 떠올려요.', mentorTip: '막연한 꿈보다 어디서, 누구와, 무엇을 하는지 장면으로 말하게 해 주세요.' },
      { duration: '35분', title: 'Notion 미래 포트폴리오 제작', description: '활동책자와 홈페이지에 축적한 내용을 활용해 개인별 Notion 포트폴리오를 만들어요.', mentorTip: '기존 기록을 단순 복사하지 않고 자기 언어로 재구성하도록 안내해 주세요.' },
      { duration: '15분', title: '미래 모습을 표현하는 결과물 제작', description: '미래 명함 등 나의 미래 모습을 보여 주는 결과물을 만들어 청사진을 구체화해요.', mentorTip: '형식보다 학생이 선택한 미래 모습이 드러나는지 봐 주세요.' },
      { duration: '10분', title: '전체 활동과 변화 돌아보기', description: '프로그램 전체 활동을 되돌아보고 처음과 달라진 생각, 새로 생긴 관심을 정리해요.', mentorTip: '작은 변화도 의미 있는 발견으로 인정해 주세요.' },
    ],
  },
}

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

const middleSchoolPreferenceAreas: PreferenceArea[] = [
  { id: 'making', tag: 'R', title: '직접 해보기', icon: '🔧', guide: '손으로 만들거나 몸을 움직이는 활동이 나에게 맞는지 생각해 봐요.', questions: ['준비물을 가지고 직접 만들어 보기', '기계나 도구를 직접 만져 보기', '가만히 앉아 있기보다 몸을 움직이며 활동하기', '망가진 물건을 보고 어디가 문제인지 찾아보기'] },
  { id: 'exploring', tag: 'I', title: '알아보고 해결하기', icon: '🔎', guide: '궁금한 것을 찾아보고 문제를 푸는 활동이 어떤지 생각해 봐요.', questions: ['왜 그런지 궁금해서 이유를 찾아보기', '어려운 문제를 어떻게 풀지 생각해 보기', '관심 있는 내용을 인터넷이나 책에서 찾아보기', '실험하거나 관찰해서 결과를 확인해 보기'] },
  { id: 'expressing', tag: 'A', title: '자유롭게 표현하기', icon: '🎨', guide: '내 생각을 그림, 글, 영상 등으로 표현하는 활동이 어떤지 생각해 봐요.', questions: ['그림이나 디자인으로 내 생각을 표현하기', '짧은 글이나 이야기를 만들어 보기', '사진이나 영상을 직접 찍고 편집해 보기', '정해진 방법보다 내 방식으로 새롭게 해 보기'] },
  { id: 'together', tag: 'S', title: '함께하고 도와주기', icon: '🤝', guide: '친구들과 함께하거나 누군가를 도와주는 활동이 어떤지 생각해 봐요.', questions: ['친구의 고민이나 이야기를 잘 들어주기', '내가 아는 것을 친구에게 알려주기', '친구들과 역할을 나누어 함께 활동하기', '도움이 필요한 친구나 사람을 도와주기'] },
  { id: 'challenging', tag: 'E', title: '도전하고 이끌기', icon: '🚀', guide: '앞에 나서거나 목표를 정해 도전하는 활동이 어떤지 생각해 봐요.', questions: ['친구들 앞에서 내 생각을 말해 보기', '모둠 활동에서 친구들을 이끌어 보기', '내 생각을 설명해서 친구를 설득해 보기', '목표를 세우고 끝까지 도전해 보기'] },
  { id: 'organizing', tag: 'C', title: '계획하고 정리하기', icon: '🗂️', guide: '순서를 정하고 꼼꼼하게 확인하는 활동이 어떤지 생각해 봐요.', questions: ['해야 할 일을 순서대로 계획해 보기', '책상이나 자료를 기준에 맞게 정리하기', '정해진 순서와 방법을 지켜서 하기', '실수한 부분이 없는지 꼼꼼하게 확인하기'] },
]

const preferenceQuestionKeywords: Record<string, string[]> = {
  '도구를 사용해서 무언가 직접 만들기': ['도구', '만들기'],
  '기계나 장비를 직접 다루어 보기': ['기계', '장비'],
  '몸을 움직이며 활동하기': ['몸활동', '움직임'],
  '고장 난 물건의 문제를 찾아 고쳐보기': ['수리', '문제찾기'],
  '궁금한 것이 생기면 이유나 원인을 찾아보기': ['궁금증', '원인찾기'],
  '어려운 문제의 해결방법을 생각해 보기': ['탐구', '생각'],
  '관심 있는 주제의 정보를 찾아보기': ['정보찾기', '관심주제'],
  '실험이나 관찰을 통해 결과를 확인하기': ['실험', '관찰'],
  '그림이나 디자인으로 생각을 표현하기': ['그림', '디자인'],
  '글이나 이야기를 만들어 보기': ['창작'],
  '사진이나 영상을 직접 만들어 보기': ['사진', '영상'],
  '정해진 방법보다 내 방식으로 새롭게 만들어 보기': ['내 방식대로', '새롭게'],
  '다른 사람의 고민이나 이야기를 들어주기': ['경청', '고민듣기'],
  '내가 알고 있는 것을 다른 사람에게 알려주기': ['알려주기', '나눔'],
  '친구들과 힘을 합쳐 함께 활동하기': ['협력', '함께하기'],
  '도움이 필요한 사람을 도와주기': ['도움', '배려'],
  '사람들 앞에서 내 생각을 이야기하기': ['발표', '표현'],
  '모둠이나 팀에서 사람들을 이끌어 보기': ['리더십', '이끌기'],
  '다른 사람에게 내 생각을 설명하고 설득하기': ['설명', '설득'],
  '목표를 정하고 경쟁하거나 도전하기': ['목표', '도전'],
  '해야 할 일을 순서대로 계획하기': ['계획', '순서'],
  '자료나 물건을 기준에 맞게 정리하기': ['정리', '분류'],
  '정해진 방법이나 순서에 따라 정확하게 진행하기': ['정확성', '절차'],
  '실수한 부분이 없는지 꼼꼼하게 확인하기': ['꼼꼼함', '확인'],
  '준비물을 가지고 직접 만들어 보기': ['만들기', '직접해보기'],
  '기계나 도구를 직접 만져 보기': ['도구', '기계'],
  '가만히 앉아 있기보다 몸을 움직이며 활동하기': ['움직임', '몸활동'],
  '망가진 물건을 보고 어디가 문제인지 찾아보기': ['수리', '문제찾기'],
  '왜 그런지 궁금해서 이유를 찾아보기': ['궁금증', '이유찾기'],
  '어려운 문제를 어떻게 풀지 생각해 보기': ['탐구', '생각'],
  '관심 있는 내용을 인터넷이나 책에서 찾아보기': ['정보찾기', '관심주제'],
  '실험하거나 관찰해서 결과를 확인해 보기': ['실험', '관찰'],
  '그림이나 디자인으로 내 생각을 표현하기': ['그림', '디자인'],
  '짧은 글이나 이야기를 만들어 보기': ['창작'],
  '사진이나 영상을 직접 찍고 편집해 보기': ['사진', '영상'],
  '정해진 방법보다 내 방식으로 새롭게 해 보기': ['내 방식대로', '새롭게'],
  '친구의 고민이나 이야기를 잘 들어주기': ['경청', '고민듣기'],
  '내가 아는 것을 친구에게 알려주기': ['알려주기', '나눔'],
  '친구들과 역할을 나누어 함께 활동하기': ['협력', '함께하기'],
  '도움이 필요한 친구나 사람을 도와주기': ['도움', '배려'],
  '친구들 앞에서 내 생각을 말해 보기': ['발표', '표현'],
  '모둠 활동에서 친구들을 이끌어 보기': ['리더십', '이끌기'],
  '내 생각을 설명해서 친구를 설득해 보기': ['설명', '설득'],
  '목표를 세우고 끝까지 도전해 보기': ['목표', '도전'],
  '해야 할 일을 순서대로 계획해 보기': ['계획', '순서'],
  '책상이나 자료를 기준에 맞게 정리하기': ['정리', '분류'],
  '정해진 순서와 방법을 지켜서 하기': ['정확성', '절차'],
}

const preferenceKeywords = (question: string) => preferenceQuestionKeywords[question] ?? [question]

const interviewCompanies: InterviewCompany[] = [
  { name: '예청건설', fields: ['건축', '토목', '현장관리'], description: '건물과 도로, 공공시설을 계획하고 안전하게 완성하는 회사예요. 현장과 사무실을 오가며 일정, 안전, 품질을 함께 관리해요.', roles: ['건축가', '토목기술자', '현장관리자', '안전관리자'], strengths: ['책임감', '공간지각능력', '문제해결능력', '협업능력'] },
  { name: '예청전자', fields: ['전자제품', '로봇', '데이터'], description: '생활을 편리하게 만드는 전자기기와 디지털 기술을 개발하는 회사예요. 아이디어를 제품으로 만들기 위해 실험과 분석을 반복해요.', roles: ['로봇공학자', '소프트웨어 개발자', '데이터 분석가', '품질관리자'], strengths: ['논리적 사고', '분석력', '디지털 활용능력', '끈기'] },
  { name: '예청엔터테인먼트', fields: ['콘텐츠', '공연', '영상'], description: '음악, 영상, 공연, 온라인 콘텐츠를 기획하고 제작하는 회사예요. 사람들의 관심을 읽고 새로운 이야기를 매력적으로 보여 줘요.', roles: ['콘텐츠 기획자', '영상 제작자', '공연 연출가', '마케팅 담당자'], strengths: ['창의성', '표현력', '기획력', '의사소통능력'] },
  { name: '예청모터스', fields: ['자동차', '정비', '모빌리티'], description: '자동차와 이동수단을 만들고 고치며 더 안전한 이동을 고민하는 회사예요. 기계 구조를 이해하고 문제를 정확히 찾아내는 힘이 중요해요.', roles: ['자동차 정비사', '기계공학자', '자동차 디자이너', '서비스 매니저'], strengths: ['손재주', '관찰력', '문제해결능력', '꼼꼼함'] },
  { name: '예청중학교', fields: ['교육', '상담', '학교 행정'], description: '학생들이 배우고 성장할 수 있도록 수업, 상담, 생활지도, 학교 운영을 함께하는 교육기관이에요.', roles: ['교사', '상담교사', '학교 행정직', '진로전담교사'], strengths: ['공감능력', '책임감', '설명력', '관찰력'] },
  { name: '예청약품', fields: ['의약품', '연구', '품질'], description: '사람들의 건강을 돕는 의약품과 건강 관련 제품을 연구하고 관리하는 회사예요. 정확함과 윤리의식이 특히 중요해요.', roles: ['약사', '의약품 연구원', '품질관리자', '임상시험 코디네이터'], strengths: ['꼼꼼함', '책임감', '분석력', '집중력'] },
  { name: '예청은행', fields: ['금융', '상담', '회계'], description: '개인과 기업의 돈을 안전하게 관리하고 필요한 금융 서비스를 제공하는 기관이에요. 신뢰와 숫자 감각, 설명 능력이 필요해요.', roles: ['은행원', '금융상담사', '회계 담당자', '자산관리사'], strengths: ['신뢰감', '수리능력', '설명력', '정확성'] },
  { name: '예청식품', fields: ['식품개발', '조리', '마케팅'], description: '맛있고 안전한 식품을 개발하고 생산해 사람들에게 전달하는 회사예요. 위생, 창의성, 소비자 이해가 함께 필요해요.', roles: ['요리사', '식품 연구원', '브랜드 마케터', '영양사'], strengths: ['창의성', '위생관리', '관찰력', '실행력'] },
  { name: '예청군청', fields: ['행정', '복지', '지역정책'], description: '지역 주민의 생활을 돕고 예청 지역의 정책과 공공서비스를 운영하는 기관이에요. 행정직의 다양한 모습을 살펴볼 수 있어요.', roles: ['일반행정직', '사회복지직', '청소년정책 담당자', '문화관광 담당자'], strengths: ['책임감', '문서정리능력', '공정성', '의사소통능력'] },
]

const interviewDifficultyLabels: Record<InterviewDifficulty, string> = { veryEasy: '매우쉬움', easy: '쉬움', medium: '중간', hard: '어려움' }
const blankInterviewApplication: InterviewApplication = { role: '', difficulty: 'easy', interestReason: '', strengths: '', experience: '', closingLine: '' }

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

function MasterViewBanner({ label }: { label: string }) {
  return <div className="master-view-banner" role="status">{label}</div>
}

function AccessQrModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div className="qr-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-modal-title"><button type="button" className="qr-modal-close" onClick={onClose} aria-label="QR 팝업 닫기">×</button><span>청·사·진 바로가기</span><h2 id="qr-modal-title">접속 QR</h2><p>휴대폰 카메라로 QR을 인식해 접속해 주세요.</p><img src={accessQrImage} alt="청·사·진 홈페이지 접속 QR 코드" /></section></div>
}

function ProfileEditor({ kind, displayName, schoolName, existing, onSave }: { kind: 'student' | 'mentor'; displayName: string; schoolName: string; existing?: Partial<ProfilePayload> & { university?: string; major?: string; careerStory?: string }; onSave: (profile: ProfilePayload) => Promise<void> }) {
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
    setIntroduction(existing.introduction ?? '')
    setHopeJob(existing.hopeJob ?? '')
    setOneLineIntro(existing.oneLineIntro ?? '')
    setSchoolMajor(existing.schoolMajor ?? [existing.university, existing.major].filter(Boolean).join(' / '))
    setInterests(existing.interests ?? '')
    setMajorReason(existing.majorReason ?? '')
    setCareerInterests(existing.careerInterests ?? '')
    setCampusLife(existing.campusLife ?? existing.careerStory ?? '')
    setStrengths(existing.strengths ?? '')
    setMessage(existing.message ?? existing.introduction ?? '')
  }, [existing])

  useEffect(() => {
    if (kind !== 'student' || existing || !db || !auth?.currentUser) return
    void getDoc(doc(db, 'studentProfiles', auth.currentUser.uid)).then((snapshot) => {
      if (!snapshot.exists()) return
      const profile = snapshot.data() as Partial<ProfilePayload>
      setIntroduction(profile.introduction ?? '')
      setInterests(profile.interests ?? '')
      setHopeJob(profile.hopeJob ?? '')
    }).catch((error) => console.error(error))
  }, [kind, existing])

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

function MentorQuestionPanel({ profiles, studentName, schoolName, onClose }: { profiles: MentorProfile[]; studentName: string; schoolName: string; onClose: () => void }) {
  const [mentorId, setMentorId] = useState('')
  const [question, setQuestion] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!db || !auth?.currentUser || !mentorId || !question.trim()) return
    setSaveState('saving')
    try {
      const mentor = profiles.find((profile) => profile.id === mentorId)
      await addDoc(collection(db, 'mentorQuestions'), { userId: auth.currentUser.uid, studentName, schoolName, mentorId, mentorName: mentor?.displayName ?? '', question: question.trim(), status: 'waiting', createdAt: serverTimestamp() })
      setSaveState('saved')
      setQuestion('')
    } catch (error) {
      console.error(error)
      setSaveState('error')
    }
  }
  return <section className="mentor-question-panel"><div><span>💬</span><div><small>궁금한 점을 남겨 보세요</small><h2>멘토에게 질문하기</h2></div><button type="button" onClick={onClose} aria-label="질문 작성창 닫기">×</button></div>{saveState === 'saved' ? <div className="question-saved"><b>질문을 저장했어요.</b><p>멘토가 확인할 수 있도록 안전하게 전달됩니다.</p><button type="button" onClick={() => setSaveState('idle')}>질문 하나 더 쓰기</button></div> : <form onSubmit={submit}><label>질문할 멘토<select value={mentorId} onChange={(event) => setMentorId(event.target.value)} required><option value="">멘토를 선택하세요</option>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.displayName} 멘토</option>)}</select></label><label>질문 내용<textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} placeholder="전공, 대학생활, 진로 등에 대해 궁금한 점을 적어 주세요." required /></label><div><small>{question.length} / 500자</small><button type="submit" disabled={saveState === 'saving' || !mentorId || !question.trim()}>{saveState === 'saving' ? '저장하는 중…' : '질문 보내기'}</button></div>{saveState === 'error' && <p className="entry-error" role="alert">질문을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.</p>}</form>}</section>
}

function MentorQuestionCard({ item, onRead, onAnswer }: { item: MentorQuestion; onRead: (question: MentorQuestion) => void; onAnswer: (question: MentorQuestion, answer: string) => Promise<void> }) {
  const [answer, setAnswer] = useState(item.answer ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!answer.trim()) return
    setSaveState('saving')
    try {
      await onAnswer(item, answer.trim())
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }
  return <article className={item.status === 'waiting' ? 'unread' : ''}><header><div><span>{item.schoolName}</span><b>{item.studentName}</b></div><div><strong>받은 멘토 · {item.mentorName || '확인 중'}</strong><small>{item.createdAt?.toMillis ? new Date(item.createdAt.toMillis()).toLocaleString('ko-KR') : '방금 전'}</small></div></header><section className="question-body"><small>학생 질문</small><p>{item.question}</p></section>{item.status === 'waiting' && <button type="button" className="question-read-button" onClick={() => onRead(item)}>질문 확인하기</button>}<form className="mentor-answer-form" onSubmit={submit}><label>멘토 답변<textarea value={answer} onChange={(event) => { setAnswer(event.target.value); setSaveState('idle') }} maxLength={1000} placeholder="학생에게 전할 답변을 작성해 주세요." /></label><div><span className={item.answer ? 'answer-complete' : 'answer-waiting'}>{item.answer ? '✓ 답변 완료' : '아직 답변하지 않음'}</span><small>{answer.length} / 1000자</small><button type="submit" disabled={saveState === 'saving' || !answer.trim()}>{saveState === 'saving' ? '저장 중…' : item.answer ? '답변 수정하기' : '답변 남기기'}</button></div>{saveState === 'saved' && <p className="save-message success" role="status">답변이 저장됐어요.</p>}{saveState === 'error' && <p className="save-message error" role="alert">답변을 저장하지 못했어요.</p>}</form></article>
}

function MentorQuestionPage({ questions, isAdmin, onRead, onAnswer }: { questions: MentorQuestion[]; isAdmin: boolean; onRead: (question: MentorQuestion) => void; onAnswer: (question: MentorQuestion, answer: string) => Promise<void> }) {
  const answeredCount = questions.filter((item) => Boolean(item.answer)).length
  return <><section className="guide-detail-hero blue question-page-hero"><span>💬</span><div><small>{isAdmin ? '전체 멘토 질문 관리' : '나에게 온 학생 질문'}</small><h1>질문 확인하기</h1><p>{isAdmin ? '어떤 멘토에게 어떤 질문이 왔는지와 답변 여부를 한눈에 확인해요.' : '학생들이 보낸 질문을 확인하고 답변을 남겨 주세요.'}</p></div></section><section className="guide-content-card question-page"><div className="question-page-summary"><div><small>전체 질문</small><b>{questions.length}개</b></div><div><small>답변 완료</small><b>{answeredCount}개</b></div><div><small>답변 대기</small><b>{questions.length - answeredCount}개</b></div></div>{questions.length ? <div className="question-page-list">{questions.map((item) => <MentorQuestionCard item={item} onRead={onRead} onAnswer={onAnswer} key={item.id} />)}</div> : <div className="question-inbox-empty"><span>💬</span><b>아직 들어온 질문이 없어요.</b><p>학생이 질문을 보내면 이곳에 바로 표시됩니다.</p></div>}</section></>
}

function StudentActivityRecords() {
  const [preference, setPreference] = useState<PreferenceResult | null>(null)
  const [auctions, setAuctions] = useState<AuctionResultRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!db || !auth?.currentUser) { setLoading(false); return }
    const userId = auth.currentUser.uid
    Promise.all([
      getDoc(doc(db, 'preferenceResults', userId)),
      getDocs(query(collection(db, 'auctionResults'), where('userId', '==', userId))),
    ]).then(([preferenceSnapshot, auctionSnapshot]) => {
      if (preferenceSnapshot.exists()) setPreference({ id: preferenceSnapshot.id, ...(preferenceSnapshot.data() as Omit<PreferenceResult, 'id'>) })
      setAuctions(auctionSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AuctionResultRecord, 'id'>) })).sort((left, right) => (right.savedAt?.toMillis?.() ?? 0) - (left.savedAt?.toMillis?.() ?? 0)))
    }).catch((error) => {
      console.error(error)
      setLoadError('활동 기록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.')
    }).finally(() => setLoading(false))
  }, [])

  const rarity = (count: number) => count >= 3 ? 'EPIC' : count === 2 ? 'RARE' : 'NORMAL'
  return <section className="student-activity-records"><div className="record-section-heading"><div><small>1~5회기</small><h2>활동 기록</h2></div><span>각 회기에서 저장한 결과가 여기에 차곡차곡 모여요.</span></div>{loading ? <div className="record-empty">활동 기록을 불러오는 중이에요.</div> : loadError ? <p className="entry-error" role="alert">{loadError}</p> : <div className="record-session-list"><article><div className="record-card-title"><span>👋</span><div><small>1회기</small><h3>첫 만남 및 진로·직업 이해</h3></div><b className="record-ready">활동 참여</b></div><p>청·사·진을 알아보고 멘토와 만나 진로와 직업의 의미를 탐색했어요.</p></article><article className="second-session-record"><div className="record-card-title"><span>✨</span><div><small>2회기</small><h3>선호·강점 탐색</h3></div><b className={preference || auctions.length ? 'record-saved' : ''}>{preference || auctions.length ? '기록 있음' : '기록 없음'}</b></div><div className="second-session-record-grid"><section><h4>👍 좋아! 싫어!</h4>{preference ? <><dl><dt>핵심 좋아</dt><dd>{(preference.coreLikes ?? []).join(', ') || '미선택'}</dd><dt>핵심 싫어</dt><dd>{(preference.coreDislikes ?? []).join(', ') || '미선택'}</dd></dl>{preference.reflection && <p>{preference.reflection}</p>}</> : <p>활동 결과를 저장하면 확인할 수 있어요.</p>}</section><section><h4>🔨 강점 경매장</h4>{auctions.length ? <div className="compact-auction-records">{auctions.map((record) => <div key={record.id}><header><strong>{record.selectedJob || '직업 미기록'}</strong><small>{record.savedAt?.toMillis ? new Date(record.savedAt.toMillis()).toLocaleDateString('ko-KR') : '저장일 확인 중'}</small></header><p>남은 포인트 {record.balance}P</p><ul>{Object.entries(record.inventory ?? {}).map(([strength, count]) => <li key={strength}>{strength} <b className={`rarity-${rarity(count).toLowerCase()}`}>{rarity(count)}</b></li>)}</ul></div>)}</div> : <p>경매 결과를 저장하면 확인할 수 있어요.</p>}</section></div></article>{sessionTemplates.slice(2).map((session) => <article className="future-record" key={session.number}><div className="record-card-title"><span>{session.icon}</span><div><small>{session.number}회기</small><h3>{session.title}</h3></div><b>기록 없음</b></div><p>{session.subtitle}</p><small>활동을 완료하고 결과를 저장하면 이곳에 표시됩니다.</small></article>)}</div>}</section>
}

type AuctionPhase = 'lobby' | 'waiting' | 'voting' | 'countdown' | 'auction' | 'sold' | 'result'
type AuctionParticipant = { id: string; nickname: string; role: 'host' | 'participant'; connected: boolean; lastSeenAt?: { toMillis: () => number }; selectedJob?: string | null; balance?: number; inventory?: Record<string, number> }
type AuctionRoom = { hostId: string; gameState: 'WAITING' | 'JOB_SELECTION' | 'COUNTDOWN' | 'AUCTION' | 'SOLD' | 'RESULT'; initialMoney?: number; bidLimit?: number; totalItems?: number; voteEndsAt?: { toMillis: () => number }; countdownEndsAt?: { toMillis: () => number }; selectedJob?: string | null; selectedJobs?: string[]; deck?: string[]; auctionIndex?: number; currentPrice?: number; highestBidderId?: string | null; highestBidderName?: string | null; auctionEndsAt?: { toMillis: () => number } }
type AuctionResultRecord = { id: string; userId?: string; roomCode: string; displayName: string; selectedJob: string; balance: number; inventory: Record<string, number>; selectedJobs?: string[]; deck?: string[]; auctionIndex: number; totalItems: number; endedByHost?: boolean; recovered?: boolean; originalGameState?: string; savedAt?: { toMillis: () => number } }
type AdminAuctionRoomRecord = { id: string; gameState: string; selectedJob?: string | null; selectedJobs?: string[]; auctionIndex: number; totalItems: number; participants: AuctionParticipant[] }
type AuctionTestRole = 'host' | 'participant'
const auctionTestJobs = ['의사', '소방관', '교사', '경찰관', '유튜브 크리에이터', '게임 개발자', '요리사', '간호사', '웹툰 작가', '반려동물 훈련사', '로봇공학자', '스포츠 트레이너', '심리상담사', '항공 승무원', '건축가', '패션 디자이너', '사회복지사', '데이터 분석가', '환경 연구원', '창업가']
const savedSessionKey = 'cheongsajin-session'

function StrengthAuctionTest({ role, playerName, onExit }: { role: AuctionTestRole; playerName: string; onExit: () => void }) {
  const [phase, setPhase] = useState<Exclude<AuctionPhase, 'lobby'>>('waiting')
  const [voteTime, setVoteTime] = useState(30)
  const [countdownTime, setCountdownTime] = useState(10)
  const [selectedJob, setSelectedJob] = useState('')
  const [customJob, setCustomJob] = useState('')
  const [testSelectedJobs, setTestSelectedJobs] = useState<{ name: string; job: string }[]>([])
  const [auctionDeck, setAuctionDeck] = useState<string[]>([])
  const [auctionIndex, setAuctionIndex] = useState(0)
  const [auctionTime, setAuctionTime] = useState(10)
  const [currentPrice, setCurrentPrice] = useState(50)
  const [highestBidder, setHighestBidder] = useState('')
  const [balance, setBalance] = useState(1000)
  const [inventory, setInventory] = useState<Record<string, number>>({})
  const [virtualVotes, setVirtualVotes] = useState<{ name: string; job: string }[]>([])
  const [manualItemCount, setManualItemCount] = useState(false)
  const [testItemLimit, setTestItemLimit] = useState(30)
  const testName = playerName.trim() || (role === 'host' ? '테스트 방장' : '나')
  const botNames = role === 'host' ? ['지민', '서준', '하윤'] : ['지민', '서준']
  const participants = role === 'host' ? [testName, ...botNames] : ['가상 방장', testName, ...botNames]
  const currentStrength = auctionDeck[auctionIndex] ?? '문제해결능력'
  const myStrengthLevel = inventory[currentStrength] ?? 0
  const rarity = (count: number) => count >= 3 ? 'EPIC' : count === 2 ? 'RARE' : 'NORMAL'
  const automaticItemLimit = (participants.length - 1) * 10
  const itemLimit = manualItemCount ? testItemLimit : automaticItemLimit

  const startTest = () => {
    setVoteTime(30)
    setVirtualVotes([])
    setPhase('voting')
  }
  const finishVote = () => {
    const resolvedVirtualVotes = botNames.map((name, index) => virtualVotes.find((vote) => vote.name === name) ?? { name, job: auctionTestJobs[(index + 4) % auctionTestJobs.length] })
    const mySelectedJob = selectedJob || auctionTestJobs[Math.floor(Math.random() * auctionTestJobs.length)]
    const participantJobs = role === 'participant' ? [{ name: testName, job: mySelectedJob }, ...resolvedVirtualVotes] : resolvedVirtualVotes
    setVirtualVotes(resolvedVirtualVotes)
    setTestSelectedJobs(participantJobs)
    setSelectedJob(role === 'participant' ? mySelectedJob : participantJobs[0]?.job || '게임 개발자')
    setAuctionDeck(createAuctionDeckForJobs(participantJobs.map((participant) => participant.job), itemLimit))
    setAuctionIndex(0)
    setCurrentPrice(50)
    setHighestBidder('')
    setAuctionTime(10)
    setCountdownTime(10)
    setPhase('countdown')
  }
  const addVirtualVote = (name: string, fallbackJob: string) => {
    setVirtualVotes((current) => current.some((vote) => vote.name === name) ? current : [...current, { name, job: fallbackJob }])
  }
  const confirmTestCustomJob = () => {
    const job = customJob.trim()
    if (job) setSelectedJob(job)
  }
  const placeTestBid = (amount: number) => {
    const invalidBid = highestBidder ? amount <= currentPrice : amount < currentPrice
    if (role !== 'participant' || highestBidder === testName || amount > balance || invalidBid || myStrengthLevel >= 3) return
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
    setCurrentPrice(50)
    setHighestBidder('')
    setAuctionTime(10)
    setCountdownTime(10)
    setPhase('countdown')
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

  if (phase === 'waiting') return <div className="auction-waiting">{testHeader}<div className="room-summary"><div><span>방 코드</span><strong>TEST</strong></div><div><span>경매 참가자</span><strong>{participants.length - 1}명</strong></div><div><span>내 역할</span><strong>{role === 'host' ? '방장' : '참가자'}</strong></div></div><section className="participant-list-card"><div className="auction-section-title"><h3>테스트 참가자</h3><span>가상 참가자 자동 행동</span></div><ul className="participant-list">{participants.map((name, index) => <li key={name}><i />{name}{(index === 0 && role === 'host') || name === '가상 방장' ? <b>방장</b> : <span>{name === testName ? '나' : 'BOT'}</span>}</li>)}</ul>{role === 'host' && <div className="test-item-setting"><button type="button" onClick={() => setManualItemCount((current) => !current)}>{manualItemCount ? '자동 계산 사용' : '상품 수 직접 입력'}</button><label>총 상품 수<input type="number" min={1} max={200} value={itemLimit} disabled={!manualItemCount} onChange={(event) => setTestItemLimit(Math.max(1, Math.min(200, Number(event.target.value))))} /></label></div>}</section><button type="button" className="auction-primary wide" onClick={startTest}>{role === 'host' ? '테스트 게임 시작 →' : '가상 방장에게 시작 요청 →'}</button></div>

  if (phase === 'voting') return <div className="job-vote">{testHeader}<div className="auction-countdown"><b>{voteTime}</b><span>초</span></div><p>각자의 목표 직업</p><h2>{role === 'host' ? `${virtualVotes.length} / ${botNames.length}명 선택 완료` : selectedJob || '내 직업을 하나 고르세요'}</h2><span>{role === 'host' ? '가상 참가자마다 자기 직업을 하나씩 고릅니다. 선택이 끝나면 실제 게임처럼 10초 뒤 경매가 시작돼요.' : '목록에서 고르거나 직접 입력할 수 있고, 랜덤으로 정할 수도 있어요.'}</span>{role === 'participant' && <><label className="custom-job-entry">직접 입력<div><input value={customJob} onChange={(event) => { setCustomJob(event.target.value); if (event.target.value.trim() !== selectedJob) setSelectedJob('') }} onKeyDown={(event) => { if (event.key === 'Enter') confirmTestCustomJob() }} maxLength={24} placeholder="예: 댄서, 변호사, 프로게이머" /><button type="button" onClick={confirmTestCustomJob} disabled={!customJob.trim() || voteTime <= 0}>확정</button></div></label><button type="button" className="random-job" onClick={() => { setSelectedJob(auctionTestJobs[Math.floor(Math.random() * auctionTestJobs.length)]); setCustomJob('') }} disabled={voteTime <= 0}>🎲 랜덤으로 선택</button></>}<div className="virtual-votes"><b>참가자별 직업 선택 현황</b>{virtualVotes.length ? <ul>{virtualVotes.map((vote) => <li key={vote.name}><span>{vote.name}</span><strong>{vote.job}</strong></li>)}</ul> : <p>잠시 후 가상 참가자들이 각자 직업을 선택해요.</p>}</div><div className="job-options test-job-options">{auctionTestJobs.map((job) => <button type="button" className={selectedJob === job && !customJob.trim() ? 'selected' : ''} onClick={() => { setSelectedJob(job); setCustomJob('') }} disabled={role === 'host' || voteTime <= 0} key={job}>{job}</button>)}</div>{role === 'host' && <div className="vote-actions"><button type="button" className="auction-primary" onClick={finishVote} disabled={voteTime > 0 && virtualVotes.length < botNames.length}>선택 마감·10초 뒤 경매 시작 →</button></div>}</div>

  if (phase === 'countdown') return <div className="job-vote">{testHeader}<div className="auction-countdown"><b>{countdownTime}</b><span>초</span></div><p>{auctionIndex === 0 ? '첫 경매 시작 전' : '다음 경매 시작 전'}</p><h2>다음 출품될 역량은 {currentStrength}입니다.</h2><span>{strengthDescriptions[currentStrength] ?? '직업과 활동에 도움이 되는 소중한 역량입니다.'}</span>{auctionIndex === 0 && <div className="job-choice-list"><b>참가자별 직업</b><ul>{testSelectedJobs.map((participant) => <li key={participant.name}><span>{participant.name}</span><strong>{participant.job}</strong></li>)}</ul></div>}</div>

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

  const bidOptions = highestBidder ? [currentPrice + 50, currentPrice + 100, currentPrice + 150] : [currentPrice, currentPrice + 50, currentPrice + 100]
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
  const [manualItemCount, setManualItemCount] = useState(false)
  const [customTotalItems, setCustomTotalItems] = useState(30)
  const [selectedJob, setSelectedJob] = useState('')
  const [customJob, setCustomJob] = useState('')
  const [now, setNow] = useState(Date.now())
  const [settleRequestedFor, setSettleRequestedFor] = useState('')
  const [countdownRequestedFor, setCountdownRequestedFor] = useState('')
  const [testRole, setTestRole] = useState<AuctionTestRole | null>(null)
  const [showResultRecords, setShowResultRecords] = useState(false)
  const [auctionResults, setAuctionResults] = useState<AuctionResultRecord[]>([])
  const [auctionResultsLoading, setAuctionResultsLoading] = useState(false)
  const [auctionResultsError, setAuctionResultsError] = useState('')
  const auctionIndex = roomData?.auctionIndex ?? 0
  const itemLimit = roomData?.totalItems ?? 0
  const currentPrice = roomData?.currentPrice ?? 50
  const currentStrength = roomData?.deck?.[auctionIndex] ?? '문제해결능력'
  const myName = nickname.trim() || studentName || '참가자'
  const myParticipant = participants.find((item) => item.id === auth?.currentUser?.uid)
  const participantPlayers = participants.filter((item) => item.role === 'participant')
  const automaticTotalItems = Math.max(1, participantPlayers.length * 10)
  const totalItemsSetting = manualItemCount ? customTotalItems : automaticTotalItems
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
  const hostParticipant = participants.find((item) => item.role === 'host')
  const hostDisconnected = role === 'participant' && !!hostParticipant && (!hostParticipant.connected || (!!hostParticipant.lastSeenAt && now - hostParticipant.lastSeenAt.toMillis() > 35000))

  const callAuction = async <T,>(name: string, data: Record<string, unknown>) => {
    if (!functions) throw new Error('Firebase Functions 연결이 필요합니다.')
    return (await httpsCallable<Record<string, unknown>, T>(functions, name)(data)).data
  }
  const loadAuctionResults = async () => {
    if (!db || !auth?.currentUser) return setAuctionResultsError('Firebase 연결을 확인해 주세요.')
    setAuctionResultsLoading(true)
    setAuctionResultsError('')
    try {
      const snapshot = await getDocs(query(collection(db, 'auctionResults'), where('userId', '==', auth.currentUser.uid)))
      const records = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AuctionResultRecord, 'id'>) }))
        .sort((left, right) => (right.savedAt?.toMillis?.() ?? 0) - (left.savedAt?.toMillis?.() ?? 0))
      setAuctionResults(records)
      setShowResultRecords(true)
    } catch (error) {
      console.error(error)
      setAuctionResultsError('결과 기록을 불러오지 못했어요.')
    } finally {
      setAuctionResultsLoading(false)
    }
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
    try { await callAuction('startAuctionVote', { roomCode, initialMoney, bidLimit, totalItems: totalItemsSetting }) }
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
    setRoomError('')
    try { await callAuction('finishAuctionVote', { roomCode }); setRoomError('') }
    catch (error) { console.error(error); setRoomError('직업 선택을 마감하지 못했어요.') }
  }
  const startAuctionAfterCountdown = async () => {
    setRoomError('')
    try { await callAuction('startAuctionRound', { roomCode }); setRoomError('') }
    catch (error) { console.error(error); setRoomError('경매를 시작하지 못했어요.') }
  }
  const placeBid = async (amount: number) => {
    setRoomError('')
    try { await callAuction('placeAuctionBid', { roomCode, amount }); setRoomError('') }
    catch (error) { console.error(error); setRoomError('입찰하지 못했어요. 현재가와 잔액을 확인해 주세요.') }
  }
  const nextAuction = async () => {
    setRoomError('')
    try { await callAuction('advanceAuctionItem', { roomCode }); setRoomError('') }
    catch (error) { console.error(error); setRoomError('다음 상품으로 진행하지 못했어요.') }
  }
  const endAuction = async () => {
    setRoomError('')
    try { await callAuction('endAuctionGame', { roomCode }); setRoomError('') }
    catch (error) { console.error(error); setRoomError('게임을 종료하지 못했어요. 방장 권한을 확인해 주세요.') }
  }
  const leaveAuctionRoom = async () => {
    if (db && auth?.currentUser && roomCode) {
      await deleteDoc(doc(db, 'auctionRooms', roomCode, 'participants', auth.currentUser.uid)).catch((error) => console.error(error))
    }
    setRoomCode('')
    setRoomData(null)
    setParticipants([])
    setRoomError('')
    setPhase('lobby')
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
    const heartbeat = window.setInterval(() => void updateDoc(participantRef, { connected: true, lastSeenAt: serverTimestamp() }).catch(() => undefined), 20000)
    return () => {
      stopRoom()
      stopParticipants()
      window.clearInterval(heartbeat)
      void updateDoc(participantRef, { connected: false, lastSeenAt: serverTimestamp() }).catch(() => undefined)
    }
  }, [roomCode])

  useEffect(() => {
    if (!roomCode) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [roomCode])

  useEffect(() => {
    setRoomError('')
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

  if (hostDisconnected) return <div className="host-left-screen"><span>👋</span><h2>방장이 게임을 나갔습니다.</h2><p>현재 게임은 더 이상 진행할 수 없어요.</p><button type="button" className="auction-primary" onClick={leaveAuctionRoom}>강점 경매장 초기 화면으로</button></div>

  if (showResultRecords) return <div className="auction-records"><div className="auction-section-title"><div><span>내 계정 기록</span><h3>강점 경매장 결과 기록</h3></div><button type="button" onClick={() => setShowResultRecords(false)}>돌아가기</button></div>{auctionResultsError && <p className="auction-error" role="alert">{auctionResultsError}</p>}{auctionResults.length ? <div className="auction-record-list">{auctionResults.map((record) => { const strengths = Object.entries(record.inventory ?? {}); const date = record.savedAt?.toMillis ? new Date(record.savedAt.toMillis()).toLocaleString('ko-KR') : '저장 시간 확인 중'; return <article key={record.id}><div><span>방 {record.roomCode}</span><b>{record.selectedJob || '직업 미기록'}</b><small>{date}</small></div><dl><dt>진행</dt><dd>{record.auctionIndex} / {record.totalItems}</dd><dt>잔액</dt><dd>{record.balance}P</dd><dt>종료</dt><dd>{record.endedByHost ? '방장 종료' : '게임 종료'}</dd></dl><ul>{strengths.length ? strengths.map(([strength, count]) => <li key={strength}><span>{strength}</span><b className={`rarity-${rarity(count).toLowerCase()}`}>{rarity(count)}</b></li>) : <li><span>낙찰받은 강점 없음</span></li>}</ul></article> })}</div> : <div className="empty-auction-records"><b>아직 저장된 경매 결과가 없어요.</b><p>실시간 강점 경매가 결과 화면까지 끝나면 이곳에 내 기록이 남아요.</p></div>}</div>

  if (phase === 'lobby') return <div className="auction-lobby">
    <div className="auction-title"><span>🔨</span><h2>강점 경매장</h2><p>선택한 직업에 필요한 강점을 전략적으로 낙찰받아 보세요.</p></div>
    <button type="button" className="auction-record-button" onClick={loadAuctionResults} disabled={auctionResultsLoading}>{auctionResultsLoading ? '기록 불러오는 중…' : '결과 기록 보기'}</button>
    <div className="auction-entry-grid"><article><span>방장</span><h3>새 게임방 만들기</h3><p>참가자를 초대하고 금액·시간 등 게임 설정을 준비해요.</p><input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="방장 닉네임" maxLength={12} /><button type="button" onClick={createRoom} disabled={isRoomBusy}>{isRoomBusy ? '연결 중…' : '방 만들기 →'}</button></article><article><span>참가자</span><h3>게임방 입장하기</h3><p>닉네임과 방장이 알려준 코드를 입력해 주세요.</p><input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="닉네임" maxLength={12} /><input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="방 코드 입력" maxLength={6} /><button type="button" onClick={joinRoom} disabled={isRoomBusy || joinCode.trim().length < 4 || !nickname.trim()}>{isRoomBusy ? '연결 중…' : '입장하기 →'}</button></article></div>
    {roomError && <p className="auction-error" role="alert">{roomError}</p>}
    <div className="prototype-notice"><b>실시간 게임</b><p>방 입장부터 직업 투표, 입찰, 낙찰과 결과까지 여러 기기에 실시간으로 동기화돼요.</p></div>
    <section className="auction-test-section"><div className="auction-section-title"><div><span>혼자서도 연습 가능</span><h3>테스트 게임</h3></div><b>Firebase 저장 없음</b></div><p>가상 참가자들과 전체 흐름을 미리 확인해 보세요.</p><div><button type="button" onClick={() => setTestRole('host')}><span>👑</span><b>방장으로 테스트</b><small>게임 시작·투표 마감·다음 상품 진행</small></button><button type="button" onClick={() => setTestRole('participant')}><span>🙋</span><b>참여자로 테스트</b><small>직업 투표·실시간 입찰·강점 수집</small></button></div></section>
  </div>

  if (phase === 'waiting') return <div className="auction-waiting">
    <div className="room-summary"><div><span>방 코드</span><strong>{roomCode}</strong></div><div><span>경매 참가자</span><strong>{participants.filter((item) => item.role === 'participant').length}명</strong></div><div><span>내 닉네임</span><strong>{nickname || myName}</strong></div></div>
    {role === 'host' ? <><div className="waiting-columns"><section><div className="auction-section-title"><h3>참가자 목록</h3><span>실시간 동기화</span></div><ul className="participant-list">{participants.map((participant) => <li key={participant.id}><i className={participant.connected ? '' : 'offline'} />{participant.nickname}{participant.role === 'host' ? <b>방장</b> : <span>{participant.connected ? '접속' : '연결 끊김'}</span>}</li>)}</ul></section><section><div className="auction-section-title"><h3>게임 설정</h3><span>방장 전용</span></div><div className="auction-settings"><label>경매 참가자 수<input value={participantPlayers.length} disabled /></label><label>총 상품 수<div className="item-count-control"><input type="number" min={1} max={200} value={totalItemsSetting} disabled={!manualItemCount} onChange={(event) => setCustomTotalItems(Math.max(1, Math.min(200, Number(event.target.value))))} /><button type="button" onClick={() => { setManualItemCount((current) => !current); setCustomTotalItems(automaticTotalItems) }}>{manualItemCount ? '자동' : '직접 입력'}</button></div></label><label>초기 보유금액<input type="number" min={500} max={10000} value={initialMoney} onChange={(event) => setInitialMoney(Number(event.target.value))} /></label><label>상품당 제한시간<select value={bidLimit} onChange={(event) => setBidLimit(Number(event.target.value))}><option value={7}>7초</option><option value={10}>10초</option><option value={15}>15초</option></select></label><label>직업 선택 방식<input value="참가자 투표" disabled /></label></div></section></div><button type="button" className="auction-primary wide" onClick={startVote} disabled={!participantPlayers.length}>게임 시작 →</button>{roomError && <p className="auction-error" role="alert">{roomError}</p>}</> : <><section className="participant-list-card"><div className="auction-section-title"><h3>참가자 목록</h3><span>실시간 동기화</span></div><ul className="participant-list">{participants.map((participant) => <li key={participant.id}><i className={participant.connected ? '' : 'offline'} />{participant.nickname}{participant.role === 'host' ? <b>방장</b> : <span>{participant.connected ? '접속' : '연결 끊김'}</span>}</li>)}</ul></section><div className="participant-wait"><div className="waiting-pulse">●</div><h3>방장이 게임을 준비하고 있습니다.</h3><p>참가자 {participantPlayers.length}명 · 방 코드 {roomCode}</p></div></>}
  </div>

  if (phase === 'voting') return <div className="job-vote"><div className="auction-countdown"><b>{voteTime}</b><span>초</span></div><p>각자의 목표 직업</p><h2>{role === 'host' ? `${selectedParticipantCount} / ${participantPlayers.length}명 선택 완료` : myJob || '내 직업을 하나 고르세요'}</h2><span>{role === 'host' ? '참가자마다 자기 직업을 하나씩 고릅니다. 시간이 끝나면 미선택 참가자는 자동으로 배정돼요.' : '목록에서 고르거나 직접 입력할 수 있고, 랜덤 선택도 가능해요. 중복 선택도 가능해요.'}</span>{role === 'participant' && <><label className="custom-job-entry">직접 입력<div><input value={customJob} onChange={(event) => setCustomJob(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitCustomJob() }} maxLength={24} placeholder="예: 댄서, 변호사, 프로게이머" /><button type="button" onClick={submitCustomJob} disabled={!customJob.trim() || voteTime <= 0}>확정</button></div></label><button type="button" className="random-job" onClick={castRandomJob} disabled={voteTime <= 0}>🎲 랜덤으로 선택</button></>}<div className="job-options">{auctionJobs.map((job) => <button type="button" className={myJob === job ? 'selected' : ''} onClick={() => { setCustomJob(''); void castVote(job) }} disabled={role === 'host' || voteTime <= 0} key={job}>{job}</button>)}</div><div className="job-choice-list"><b>직업 선택 현황</b><ul>{participantPlayers.map((participant) => <li key={participant.id}><span>{participant.nickname}</span><strong>{participant.selectedJob || '고르는 중'}</strong></li>)}</ul></div>{role === 'host' ? <div className="vote-actions"><button type="button" className="auction-primary" onClick={finishVote} disabled={participantPlayers.length === 0 || (voteTime > 0 && selectedParticipantCount < participantPlayers.length)}>선택 마감·10초 뒤 경매 시작 →</button><button type="button" className="host-end-button" onClick={endAuction}>게임 종료하고 결과 보기</button></div> : <div className="participant-wait"><p>선택한 직업: <b>{myJob || '아직 선택하지 않음'}</b></p></div>}{roomError && <p className="auction-error" role="alert">{roomError}</p>}</div>

  if (phase === 'countdown') return <div className="job-vote"><div className="auction-countdown"><b>{countdownTime}</b><span>초</span></div><p>{auctionIndex === 0 ? '첫 경매 시작 전' : '다음 경매 시작 전'}</p><h2>다음 출품될 역량은 {currentStrength}입니다.</h2><span>{strengthDescriptions[currentStrength] ?? '직업과 활동에 도움이 되는 소중한 역량입니다.'}</span>{auctionIndex === 0 && <div className="job-choice-list"><b>참가자별 직업</b><ul>{participantPlayers.map((participant) => <li key={participant.id}><span>{participant.nickname}</span><strong>{participant.selectedJob || '자동 배정 중'}</strong></li>)}</ul></div>}{role === 'host' && <div className="vote-actions"><button type="button" className="host-end-button" onClick={endAuction}>게임 종료하고 결과 보기</button></div>}{roomError && <p className="auction-error" role="alert">{roomError}</p>}</div>

  if (phase === 'sold') {
    const wonByMe = roomData?.highestBidderId === auth?.currentUser?.uid
    const nextLevel = myStrengthLevel
    return <div className="sold-screen"><span className="hammer-hit">🔨</span><p>{roomData?.highestBidderId ? '낙찰!' : '유찰'}</p><h2>{currentStrength}</h2>{roomData?.highestBidderId && <div className="sold-price"><b>{roomData.highestBidderName}</b><strong>{currentPrice}P</strong></div>}{wonByMe && <div className={`upgrade-card rarity-${rarity(nextLevel).toLowerCase()}`}><span>{nextLevel > 1 ? '✨ 등급 강화!' : '새로운 강점 획득!'}</span><h3>{currentStrength}</h3><b>{rarity(nextLevel)}</b></div>}{role === 'host' ? <div className="vote-actions"><button type="button" className="auction-primary" onClick={nextAuction}>{auctionIndex + 1 >= itemLimit ? '결과 공개 →' : '다음 상품 →'}</button><button type="button" className="host-end-button" onClick={endAuction}>게임 종료하고 결과 보기</button></div> : <div className="participant-wait"><p>방장이 다음 상품을 준비하고 있어요.</p></div>}{roomError && <p className="auction-error" role="alert">{roomError}</p>}</div>
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

  const bidOptions = roomData?.highestBidderId ? [currentPrice + 50, currentPrice + 100, currentPrice + 150] : [currentPrice, currentPrice + 50, currentPrice + 100]
  return <div className="auction-stage"><div className="auction-topline"><span>{auctionIndex + 1} / {itemLimit} 상품</span><b>내 직업 · {myJob || '방장 진행 화면'}</b></div><div className="auction-product"><div className={`auction-clock ${auctionTime <= 3 ? 'urgent' : ''}`}><b>{auctionTime}</b><span>초</span></div><span>지금 필요한 강점</span><h2>🔨 {currentStrength}</h2>{myStrengthLevel >= 3 && <p className="epic-block">🌟 최고 등급을 보유하고 있어 입찰할 수 없어요.</p>}{roomData?.highestBidderId === auth?.currentUser?.uid && <p className="epic-block">현재 내가 최고 입찰자예요. 다른 참가자가 입찰할 때까지 기다려 주세요.</p>}<div className="current-bid"><span>현재가</span><strong>{currentPrice}P</strong><small>최고 입찰자 · {roomData?.highestBidderName || '아직 없음'}</small></div><div className="bid-buttons">{bidOptions.map((amount) => <button type="button" onClick={() => placeBid(amount)} disabled={role === 'host' || roomData?.highestBidderId === auth?.currentUser?.uid || auctionTime <= 0 || amount > balance || myStrengthLevel >= 3} key={amount}>{amount}P</button>)}</div><p className="anti-snipe">종료 2초 전 새 입찰이 들어오면 시간이 5초로 연장돼요.</p>{role === 'host' && <button type="button" className="host-end-button wide" onClick={endAuction}>게임 종료하고 결과 보기</button>}{roomError && <p className="auction-error" role="alert">{roomError}</p>}</div><aside className="auction-player"><div><span>{myName}</span><strong>💰 {balance}P</strong></div><h3>{myJob ? `${myJob} 목표` : '보유 역량'}</h3>{Object.keys(inventory).length ? <ul>{Object.entries(inventory).map(([strength, count]) => <li key={strength}><span>{strength}</span><b className={`rarity-${rarity(count).toLowerCase()}`}>{rarity(count)}</b></li>)}</ul> : <p>아직 낙찰받은 역량이 없어요.</p>}</aside></div>
}

function SecondActivityDetail({ step, schoolName, studentName, viewerMode, masterViewLabel, onLeave, onHome }: { step: number; schoolName: string; studentName: string; viewerMode: 'student' | 'school' | 'all' | 'mentor'; masterViewLabel?: string; onLeave: () => void; onHome: () => void }) {
  const [mentorPreferenceMode, setMentorPreferenceMode] = useState<'all' | 'yesan' | 'gwangsi' | 'practice-yesan' | 'practice-gwangsi'>('all')
  const [gameStarted, setGameStarted] = useState(false)
  const [questionDuration, setQuestionDuration] = useState<5 | 7 | 10>(7)
  const [isPaused, setIsPaused] = useState(false)
  const [areaIndex, setAreaIndex] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [remainingMs, setRemainingMs] = useState(7000)
  const [responses, setResponses] = useState<Record<string, PreferenceChoice>>({})
  const [resultSaveState, setResultSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [coreLikes, setCoreLikes] = useState<string[]>([])
  const [coreDislikes, setCoreDislikes] = useState<string[]>([])
  const [reflection, setReflection] = useState('')
  const [savedResult, setSavedResult] = useState<PreferenceResult | null>(null)
  const [groupResults, setGroupResults] = useState<PreferenceResult[]>([])
  const [resultsLoading, setResultsLoading] = useState(false)
  const mentorActivitySchoolName = mentorPreferenceMode === 'practice-gwangsi' ? '광시중학교' : '예산고등학교'
  const activeSchoolName = viewerMode === 'mentor' && mentorPreferenceMode.startsWith('practice') ? mentorActivitySchoolName : schoolName
  const isPreferenceGameMode = viewerMode === 'student' || (viewerMode === 'mentor' && mentorPreferenceMode.startsWith('practice'))
  const activePreferenceAreas = activeSchoolName.includes('중학교') ? middleSchoolPreferenceAreas : preferenceAreas
  const area = activePreferenceAreas[areaIndex]
  const isGameComplete = areaIndex >= activePreferenceAreas.length
  const currentQuestion = area?.questions[questionIndex]
  const choiceLabels: Record<PreferenceChoice, string> = { like: '👍 좋아!', neutral: '😐 그저 그래', dislike: '👎 싫어!', unsure: '🤔 고민돼요' }
  const selectedQuestions = (choice: PreferenceChoice) => activePreferenceAreas.flatMap((item) => item.questions.filter((question) => responses[`${item.id}:${question}`] === choice))
  const resultQuestions = (result: PreferenceResult, choice: 'like' | 'dislike') => {
    const answers = Object.entries(result.responses ?? {}).filter(([, value]) => value === choice).map(([id]) => id.slice(id.indexOf(':') + 1))
    return answers.length ? answers : (choice === 'like' ? result.coreLikes : result.coreDislikes) ?? []
  }
  const wordCloudCounts = (key: 'coreLikes' | 'coreDislikes') => groupResults.flatMap((result) => {
    const allAnswers = resultQuestions(result, key === 'coreLikes' ? 'like' : 'dislike')
    return allAnswers.length ? allAnswers : result[key] ?? []
  }).flatMap(preferenceKeywords).reduce<Record<string, number>>((all, item) => ({ ...all, [item]: (all[item] ?? 0) + 1 }), {})
  const toggleCore = (question: string, kind: 'like' | 'dislike') => {
    const selected = kind === 'like' ? coreLikes : coreDislikes
    const update = kind === 'like' ? setCoreLikes : setCoreDislikes
    update(selected.includes(question) ? selected.filter((item) => item !== question) : selected.length < 3 ? [...selected, question] : selected)
  }
  const resetPreferenceGame = () => {
    setResponses({})
    setCoreLikes([])
    setCoreDislikes([])
    setReflection('')
    setAreaIndex(0)
    setQuestionIndex(0)
    setRemainingMs(questionDuration * 1000)
    setIsPaused(false)
    setResultSaveState('idle')
    setGameStarted(false)
  }
  const changeMentorPreferenceMode = (mode: typeof mentorPreferenceMode) => {
    setMentorPreferenceMode(mode)
    setGroupResults([])
    resetPreferenceGame()
  }

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
      const resultId = viewerMode === 'mentor' ? `${auth.currentUser.uid}_mentor_${activeSchoolName.includes('중학교') ? 'gwangsi' : 'yesan'}` : auth.currentUser.uid
      await setDoc(doc(db, 'preferenceResults', resultId), {
        userId: auth.currentUser.uid,
        schoolName: activeSchoolName,
        displayName: studentName,
        responses,
        questionDuration,
        coreLikes,
        coreDislikes,
        reflection: reflection.trim(),
        summary: {
          like: selectedQuestions('like').length,
          neutral: selectedQuestions('neutral').length,
          dislike: selectedQuestions('dislike').length,
          unsure: selectedQuestions('unsure').length,
        },
        updatedAt: serverTimestamp(),
      })
      setSavedResult({ id: resultId, displayName: studentName, schoolName: activeSchoolName, responses, coreLikes, coreDislikes, reflection: reflection.trim() })
      setResultSaveState('saved')
    } catch (error) {
      console.error(error)
      setResultSaveState('error')
    }
  }

  useEffect(() => {
    if (!db || !auth?.currentUser || step !== 2) return
    setSavedResult(null)
    if (isPreferenceGameMode) {
      const resultId = viewerMode === 'mentor' ? `${auth.currentUser.uid}_mentor_${activeSchoolName.includes('중학교') ? 'gwangsi' : 'yesan'}` : auth.currentUser.uid
      void getDoc(doc(db, 'preferenceResults', resultId)).then((snapshot) => {
        if (snapshot.exists()) setSavedResult({ id: snapshot.id, ...(snapshot.data() as Omit<PreferenceResult, 'id'>) })
      }).catch((error) => console.error(error))
      return
    }
    setResultsLoading(true)
    const mentorFilteredSchool = viewerMode === 'mentor' && mentorPreferenceMode === 'yesan' ? '예산고등학교' : viewerMode === 'mentor' && mentorPreferenceMode === 'gwangsi' ? '광시중학교' : ''
    const source = viewerMode === 'school' ? query(collection(db, 'preferenceResults'), where('schoolName', '==', schoolName)) : mentorFilteredSchool ? query(collection(db, 'preferenceResults'), where('schoolName', '==', mentorFilteredSchool)) : collection(db, 'preferenceResults')
    void getDocs(source).then((snapshot) => setGroupResults(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<PreferenceResult, 'id'>) })))).catch((error) => console.error(error)).finally(() => setResultsLoading(false))
  }, [step, schoolName, activeSchoolName, viewerMode, mentorPreferenceMode, isPreferenceGameMode])

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
      {masterViewLabel && <MasterViewBanner label={masterViewLabel} />}
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

        {step === 2 && !isPreferenceGameMode && <section className="detail-panel preference-results-board"><div className="detail-heading"><span>지도자용 결과</span><h2>{viewerMode === 'school' ? `${schoolName} 좋아·싫어 결과` : viewerMode === 'mentor' && mentorPreferenceMode === 'yesan' ? '예산고등학교 좋아·싫어 결과' : viewerMode === 'mentor' && mentorPreferenceMode === 'gwangsi' ? '광시중학교 좋아·싫어 결과' : '전체 좋아·싫어 결과'}</h2><p>제출된 전체 좋아·싫어 응답을 모아 확인하고, 학생이 고른 핵심 활동도 구분해서 볼 수 있어요.</p></div>{viewerMode === 'mentor' && <div className="mentor-result-tabs"><button type="button" className={mentorPreferenceMode === 'all' ? 'active' : ''} onClick={() => changeMentorPreferenceMode('all')}>전체 결과</button><button type="button" className={mentorPreferenceMode === 'yesan' ? 'active' : ''} onClick={() => changeMentorPreferenceMode('yesan')}>예산고 결과</button><button type="button" className={mentorPreferenceMode === 'gwangsi' ? 'active' : ''} onClick={() => changeMentorPreferenceMode('gwangsi')}>광시중 결과</button><button type="button" onClick={() => changeMentorPreferenceMode('practice-yesan')}>예산고 문항 직접 하기</button><button type="button" onClick={() => changeMentorPreferenceMode('practice-gwangsi')}>광시중 문항 직접 하기</button></div>}{resultsLoading ? <div className="empty-activity-note"><p>결과를 불러오는 중이에요.</p></div> : groupResults.length ? <><div className="result-overview"><article><small>제출 인원</small><b>{groupResults.length}명</b></article><article><small>핵심 좋아 활동</small><b>{groupResults.reduce((sum, result) => sum + (result.coreLikes?.length ?? 0), 0)}개</b></article><article><small>핵심 싫어 활동</small><b>{groupResults.reduce((sum, result) => sum + (result.coreDislikes?.length ?? 0), 0)}개</b></article></div><div className="wordcloud-columns">{(['coreLikes', 'coreDislikes'] as const).map((key) => { const counts = wordCloudCounts(key); return <section key={key}><h3>{key === 'coreLikes' ? '👍 좋아 워드클라우드' : '👎 싫어 워드클라우드'}</h3><div className="wordcloud">{Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([word, count]) => <span style={{ fontSize: `${Math.min(36, 8 + count * 7)}px` }} key={word}>{word}<small>{count}</small></span>)}</div></section> })}</div><div className="student-result-list"><h3>학생별 제출 결과</h3>{groupResults.map((result) => <article key={result.id}><b>{result.displayName || '이름 미입력'}</b><small>{result.schoolName}</small><div className="student-answer-group"><strong>👍 좋아</strong>{resultQuestions(result, 'like').map((question) => <span className={(result.coreLikes ?? []).includes(question) ? 'core-answer' : ''} key={question}>{question}{(result.coreLikes ?? []).includes(question) && <em>핵심 선택</em>}</span>)}</div><div className="student-answer-group"><strong>👎 싫어</strong>{resultQuestions(result, 'dislike').map((question) => <span className={(result.coreDislikes ?? []).includes(question) ? 'core-answer' : ''} key={question}>{question}{(result.coreDislikes ?? []).includes(question) && <em>핵심 선택</em>}</span>)}</div>{result.reflection && <blockquote>{result.reflection}</blockquote>}</article>)}</div></> : <div className="empty-activity-note"><h2>아직 제출된 결과가 없어요</h2><p>학생들이 결과를 제출하면 이곳에 표시돼요.</p></div>}</section>}

        {step === 2 && isPreferenceGameMode && <section className="detail-panel preference-game">
          {viewerMode === 'mentor' && <div className="mentor-practice-bar"><div><b>{activeSchoolName} 문항으로 직접 진행 중</b><span>멘토 계정에도 실제 결과가 저장됩니다.</span></div><button type="button" onClick={() => changeMentorPreferenceMode('all')}>결과 화면으로 돌아가기</button></div>}
          {savedResult && !gameStarted && <div className="saved-result-preview"><b>저장된 나의 결과</b><p>👍 {(savedResult.coreLikes ?? []).join(', ') || '핵심 좋아 활동 미선택'}</p><p>👎 {(savedResult.coreDislikes ?? []).join(', ') || '핵심 싫어 활동 미선택'}</p>{savedResult.reflection && <span>{savedResult.reflection}</span>}</div>}
          {!gameStarted && <div className="game-intro"><span className="game-symbol">👍 👎</span><h2>좋아! 싫어!</h2><p>화면에 나타나는 활동을 하나씩 보고,<br />지금 내 생각과 가장 가까운 답을 빠르게 선택해 보세요.</p><div className="rule-cards"><article><b>1</b><h3>한 번에 한 문항</h3><p>앞 문항으로 돌아가지 않고 지금의 느낌대로 골라요.</p></article><article><b>2</b><h3>세 가지 답변</h3><p>좋아, 그저 그래, 싫어 중 하나를 선택해요.</p></article><article><b>3</b><h3>시간이 지나면</h3><p>응답하지 못한 문항은 자동으로 ‘고민돼요’가 돼요.</p></article></div><fieldset className="duration-picker"><legend>문항당 답변 시간</legend><p>나에게 맞는 속도를 선택하세요.</p><div>{([5, 7, 10] as const).map((seconds) => <button type="button" className={questionDuration === seconds ? 'selected' : ''} onClick={() => setQuestionDuration(seconds)} key={seconds}><b>{seconds}</b>초</button>)}</div></fieldset><div className="game-rules"><span>총 24문항</span><span>선택에는 정답이 없어요</span><span>진행 중 일시정지 가능</span></div><button type="button" onClick={() => { setRemainingMs(questionDuration * 1000); setGameStarted(true) }}>시작하기 →</button></div>}
          {gameStarted && !isGameComplete && area && <div className="question-stage">
            <div className="game-progress"><div><span>{areaIndex * 4 + questionIndex + 1} / 24</span><b>{area.title}</b></div><div className="progress-dots">{activePreferenceAreas.map((item, index) => <i className={index <= areaIndex ? 'active' : ''} key={item.id} />)}</div></div>
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
          {gameStarted && isGameComplete && <div className="preference-summary"><span className="complete-symbol">✓</span><h2>24개 선택을 모두 마쳤어요!</h2><p>좋아·싫어 목록에서 나를 가장 잘 보여주는 활동을 각각 최대 3개 골라 주세요. <b>고민돼요 {selectedQuestions('unsure').length}개</b></p><div className="summary-columns core-selection"><div><h3>👍 핵심 좋아! <small>{coreLikes.length}/3</small></h3>{selectedQuestions('like').length ? <ul>{selectedQuestions('like').map((question) => <li key={question}><button type="button" className={coreLikes.includes(question) ? 'selected' : ''} onClick={() => toggleCore(question, 'like')}>{coreLikes.includes(question) ? '✓ ' : ''}{question}</button></li>)}</ul> : <p>선택한 항목이 없어요.</p>}</div><div><h3>👎 핵심 싫어! <small>{coreDislikes.length}/3</small></h3>{selectedQuestions('dislike').length ? <ul>{selectedQuestions('dislike').map((question) => <li key={question}><button type="button" className={coreDislikes.includes(question) ? 'selected' : ''} onClick={() => toggleCore(question, 'dislike')}>{coreDislikes.includes(question) ? '✓ ' : ''}{question}</button></li>)}</ul> : <p>선택한 항목이 없어요.</p>}</div></div><label className="preference-reflection">선택을 통해 새롭게 알게 된 나<textarea value={reflection} onChange={(event) => setReflection(event.target.value)} maxLength={400} placeholder="왜 이 활동을 좋아하거나 싫어하는지, 떠오르는 경험과 함께 적어 보세요." /></label><div className="personal-result-card"><b>{studentName}님의 선호 발견</b><p>나는 <strong>{coreLikes.join(', ') || '선택한 활동'}</strong>을 좋아하고, <strong>{coreDislikes.join(', ') || '선택한 활동'}</strong>은 별로 좋아하지 않아요.</p>{reflection && <span>{reflection}</span>}</div><div className="result-save-notice"><b>{viewerMode === 'mentor' ? `${activeSchoolName} 문항 결과로 저장돼요.` : '계정당 하나의 결과만 저장돼요.'}</b><p>{viewerMode === 'mentor' ? '멘토님이 직접 진행한 결과이며, 학생 결과와 함께 지도자용 화면에서 확인됩니다.' : '이전에 제출한 결과가 있다면 이번 결과로 덮어씌워집니다.'}</p></div>{resultSaveState === 'saved' && <p className="save-message success" role="status">✓ 결과가 저장됐어요.</p>}{resultSaveState === 'error' && <p className="save-message error" role="alert">결과를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.</p>}<div className="result-actions"><button type="button" className="restart-button" onClick={resetPreferenceGame}>다시 하기</button><button type="button" className="submit-result-button" disabled={resultSaveState === 'saving' || (!coreLikes.length && !coreDislikes.length)} onClick={submitPreferenceResult}>{resultSaveState === 'saving' ? '저장하는 중…' : resultSaveState === 'saved' ? '결과 다시 제출하기' : '결과 제출하기'}</button><button type="button" className="home-result-button" onClick={viewerMode === 'mentor' ? () => changeMentorPreferenceMode('all') : onHome}>{viewerMode === 'mentor' ? '결과 화면으로' : '홈으로'}</button></div></div>}
        </section>}

        {step === 3 && <section className="detail-panel auction-panel"><StrengthAuctionGame studentName={studentName} /></section>}

        {step === 4 && <section className="detail-panel"><div className="detail-heading"><span>활동 틀</span><h2>오늘 발견한 나를 정리해요</h2><p>완성된 문장은 이후 개인 결과 화면과 포트폴리오에 연결할 예정이에요.</p></div><div className="reflection-fields"><label>나는 <input placeholder="어떤 활동을" /> 할 때 즐겁다.</label><label>나는 <input placeholder="어떤 활동이나 상황을" /> 하는 것은 별로 좋아하지 않는다.</label><label>「좋아! 싫어!」를 통해 새롭게 발견한 나의 모습<textarea placeholder="오늘 새롭게 알게 된 점을 자유롭게 적어보세요." /></label></div><button type="button" className="disabled-save" disabled>저장 기능 준비 중</button></section>}
      </main>
      <PartnerFooter />
    </div>
  )
}

function StaffSessionDetail({ sessionNumber, schoolName, displayName, masterViewLabel, onLeave }: { sessionNumber: number; schoolName: string; displayName: string; masterViewLabel?: string; onLeave: () => void }) {
  const plan = staffSessionPlans[sessionNumber]
  const summaryTime = sessionNumber === 4 ? '전문강사 협의 후 확정' : '총 100분'
  const flowLabel = sessionNumber === 4 ? `${plan.activities.length}개 운영 방향 · 세부 활동 협의 중` : `${plan.activities.length}개 활동 · 100분`
  return (
    <div className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{displayName}</b><button className="logout-button" onClick={onLeave}>로그아웃</button></div></header>
      {masterViewLabel && <MasterViewBanner label={masterViewLabel} />}
      <main className="session-review staff-session-detail">
        <button className="back-button" type="button" onClick={() => window.history.back()}>← 나의 활동실로</button>
        <section className={`review-hero staff-session-hero ${plan.theme}`}>
          <div><span className="staff-preview-badge">관리자(마스터) 미리보기 · {sessionNumber}회기</span><p className="eyebrow">활동 세부 안내</p><h1>{plan.title}</h1><p>{plan.description}</p></div>
          <div className="review-icon" aria-hidden="true">{plan.icon}</div>
        </section>
        <section className="staff-session-summary"><div><small>회기</small><b>{sessionNumber}회기</b></div><div><small>활동 주제</small><b>{plan.subtitle}</b></div><div><small>예상 시간</small><b>{summaryTime}</b></div></section>
        <section className="activity-notice staff-notice"><span aria-hidden="true">📌</span><div><h2>멘토 진행 안내</h2><p>{sessionNumber === 3 ? 'AI 가상면접은 희망 직업에 지원한 지원자와 AI 면접관의 채용면접 시뮬레이션으로 운영합니다.' : sessionNumber === 4 ? '4회기 세부 활동은 전문강사와 협의해 확정되며, 웹페이지에서는 운영 방향만 안내합니다.' : '5회기는 1~4회기 기록을 종합해 Notion 미래 포트폴리오와 나만의 청사진으로 정리하는 흐름입니다.'}</p></div></section>
        <section className="review-section">
          <div className="review-section-heading"><div><p className="eyebrow">활동 흐름</p><h2>{sessionNumber === 4 ? '이 방향으로 운영해요' : '이 순서대로 진행해요'}</h2></div><span>{flowLabel}</span></div>
          <div className="staff-activity-list">{plan.activities.map((activity, index) => <article key={activity.title}><div className="staff-activity-number">{index + 1}</div><div className="staff-activity-body"><div><h3>{activity.title}</h3><span>{activity.duration}</span></div><p>{activity.description}</p><aside><b>멘토 포인트</b><span>{activity.mentorTip}</span></aside></div></article>)}</div>
        </section>
        {sessionNumber === 3 && <AiInterviewActivity schoolName={schoolName} displayName={displayName} />}
        <section className="activity-help"><div><p>활동 설계 확인</p><h2>세부 기능을 만들기 전 전체 진행 흐름을 먼저 확인해 주세요.</h2></div><button type="button" onClick={() => window.history.back()}>활동실로 돌아가기 →</button></section>
      </main>
      <PartnerFooter />
    </div>
  )
}

function ThirdActivityDetail({ step, schoolName, studentName, masterViewLabel, onLeave }: { step: number; schoolName: string; studentName: string; masterViewLabel?: string; onLeave: () => void }) {
  const detailContent = [
    { eyebrow: 'STEP 1', title: '활동 안내', subtitle: '진로 역량 갖추기', icon: '🧭', description: '2회기에서 발견한 선호와 강점을 관심 직업으로 연결하고, 오늘 활동의 전체 흐름을 확인해요.' },
    { eyebrow: 'STEP 2', title: '핵심 역량 브레인스토밍', subtitle: '이 직업, 무슨 일을 할까?', icon: '💬', description: '관심 직업이 실제로 어떤 일을 하는지 먼저 예상하고, 그 일에 필요한 역량을 자유롭게 떠올려요.' },
    { eyebrow: 'STEP 3', title: 'AI 가상면접', subtitle: '희망 직업 채용면접 시뮬레이션', icon: '🎤', description: '회사를 고르고 간단한 지원서를 작성한 뒤, AI 면접관과 채팅형 면접을 진행해요.' },
    { eyebrow: 'STEP 4', title: '활동 마무리', subtitle: '면접에서 발견한 나 정리하기', icon: '📝', description: '업무 브레인스토밍과 AI 면접을 통해 알게 된 나의 강점, 보완점, 다음 준비를 정리해요.' },
  ][step - 1]

  return (
    <div className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{schoolName}</span><b>{studentName}</b><button className="logout-button" onClick={onLeave}>로그아웃</button></div></header>
      {masterViewLabel && <MasterViewBanner label={masterViewLabel} />}
      <main className="session-review activity-detail-page">
        <button className="back-button" type="button" onClick={() => window.history.back()}>← 3회기 활동 목록으로</button>
        <section className="review-hero staff-session-hero interview detail-hero">
          <div><p className="eyebrow">{detailContent.eyebrow} · 3회기</p><h1>{detailContent.title}</h1><h2>{detailContent.subtitle}</h2><p>{detailContent.description}</p></div>
          <div className="review-icon" aria-hidden="true">{detailContent.icon}</div>
        </section>

        {step === 1 && <section className="detail-panel">
          <div className="detail-heading"><span>3회기 흐름</span><h2>오늘은 관심 직업을 더 구체적으로 살펴봐요</h2><p>내가 좋아하는 것, 내가 가진 역량, 관심 직업을 연결한 뒤 실제 업무와 필요한 역량을 생각해 보고 AI 채용면접까지 이어갑니다.</p></div>
          <div className="activity-roadmap"><article><b>1</b><h3>2회기 돌아보기</h3><p>선호와 강점 결과를 다시 확인해요.</p></article><article><b>2</b><h3>역량 연결하기</h3><p>경험 속 행동과 역량을 찾아요.</p></article><article><b>3</b><h3>업무 예상하기</h3><p>관심 직업의 실제 일을 떠올려요.</p></article><article><b>4</b><h3>AI 면접</h3><p>지원자 역할로 면접을 경험해요.</p></article></div>
          <div className="mentor-note"><b>기억해요</b><p>AI 가상면접은 직업정보 Q&A가 아니라 희망 직업에 지원했다고 가정하는 채용면접 시뮬레이션이에요.</p></div>
        </section>}

        {step === 2 && <section className="detail-panel">
          <div className="detail-heading"><span>업무와 역량 연결</span><h2>관심 직업에 필요한 핵심 역량을 예상해요</h2><p>선택한 직업이 어떤 일을 할지 먼저 자유롭게 생각하고, 그 일을 잘하려면 어떤 태도와 능력이 필요할지 정리해 봅니다.</p></div>
          <div className="reflection-fields">
            <label>내가 더 알아보고 싶은 직업<input placeholder="예: 로봇공학자, 간호사, 행정직 공무원" /></label>
            <label>이 직업이 할 것 같은 일<textarea placeholder="떠오르는 업무를 자유롭게 적어 보세요." /></label>
            <label>그 일을 잘하기 위해 필요할 것 같은 역량<textarea placeholder="예: 관찰력, 소통, 끈기, 문제해결력" /></label>
          </div>
          <button type="button" className="disabled-save" disabled>저장 기능 준비 중</button>
        </section>}

        {step === 3 && <AiInterviewActivity schoolName={schoolName} displayName={studentName} />}

        {step === 4 && <section className="detail-panel">
          <div className="detail-heading"><span>마무리 기록</span><h2>면접을 통해 새롭게 알게 된 나를 정리해요</h2><p>잘 말한 부분과 더 준비하고 싶은 부분을 짧게 남기면 5회기 미래 포트폴리오로 이어갈 수 있어요.</p></div>
          <div className="reflection-fields">
            <label>오늘 내가 잘 표현한 점<textarea placeholder="면접에서 잘 말한 점이나 새롭게 발견한 강점을 적어 보세요." /></label>
            <label>다음에 더 준비하고 싶은 점<textarea placeholder="더 구체적으로 말하고 싶은 경험이나 보완할 부분을 적어 보세요." /></label>
            <label>내가 관심 직업을 위해 해 보고 싶은 작은 실천<input placeholder="예: 관련 영상 찾아보기, 멘토에게 질문하기" /></label>
          </div>
          <button type="button" className="disabled-save" disabled>저장 기능 준비 중</button>
        </section>}
      </main>
      <PartnerFooter />
    </div>
  )
}

function AiInterviewActivity({ schoolName, displayName }: { schoolName: string; displayName: string }) {
  const [phase, setPhase] = useState<'intro' | 'company' | 'application' | 'interview' | 'result'>('intro')
  const [selectedCompany, setSelectedCompany] = useState<InterviewCompany | null>(null)
  const [detailCompany, setDetailCompany] = useState<InterviewCompany | null>(null)
  const [showCustomCompany, setShowCustomCompany] = useState(false)
  const [customCompany, setCustomCompany] = useState({ name: '', fields: '', description: '', roles: '', strengths: '' })
  const [application, setApplication] = useState<InterviewApplication>(blankInterviewApplication)
  const [customRole, setCustomRole] = useState('')
  const [interviewId, setInterviewId] = useState('')
  const [turns, setTurns] = useState<InterviewTurn[]>([])
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [lastFeedback, setLastFeedback] = useState('')
  const [feedbackTone, setFeedbackTone] = useState<InterviewFeedbackTone>('neutral')
  const [currentHint, setCurrentHint] = useState({ intent: '', guide: '' })
  const [closingSummary, setClosingSummary] = useState('')
  const [suggestedStrengths, setSuggestedStrengths] = useState<string[]>([])
  const [decision, setDecision] = useState<InterviewDecision>('hold')
  const [interviewScore, setInterviewScore] = useState(0)
  const [aiSource, setAiSource] = useState<'idle' | 'openai' | 'fallback'>('idle')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')

  const runInterviewStep = async (nextTurns: InterviewTurn[], finished: boolean, mode: 'interview' | 'hint' = 'interview') => {
    if (!selectedCompany) return null
    if (!functions) throw new Error('Firebase Functions 연결이 필요합니다.')
    const normalizedApplication = { ...application, role: application.role === '직접 입력' ? customRole.trim() : application.role.trim() }
    const callable = httpsCallable<{ interviewId: string; company: string; schoolName: string; displayName: string; application: InterviewApplication; turns: InterviewTurn[]; finished: boolean; mode?: 'interview' | 'hint'; currentQuestion?: string }, InterviewStepResponse>(functions, 'runAiInterviewStep')
    const id = interviewId || `interview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    if (!interviewId) setInterviewId(id)
    const result = await callable({ interviewId: id, company: selectedCompany.name, schoolName, displayName, application: normalizedApplication, turns: nextTurns, finished, mode, currentQuestion })
    return result.data
  }

  const selectCompany = (company: InterviewCompany) => {
    setSelectedCompany(company)
    setApplication({ ...blankInterviewApplication, role: company.roles[0] })
    setCustomRole('')
    setDetailCompany(null)
    setShowCustomCompany(false)
    setPhase('application')
  }

  const createCustomCompany = () => {
    const name = customCompany.name.trim()
    const roles = customCompany.roles.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
    if (!name || roles.length === 0) {
      setError('회사명과 지원 직무를 입력해 주세요.')
      return
    }
    selectCompany({
      name,
      fields: customCompany.fields.split(/[,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 4),
      description: customCompany.description.trim() || `${name}에서 내가 관심 있는 일을 직접 정해 지원해 보는 회사예요.`,
      roles,
      strengths: customCompany.strengths.split(/[,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 6),
    })
  }

  const startInterview = async () => {
    const selectedRole = application.role === '직접 입력' ? customRole.trim() : application.role.trim()
    if (!selectedCompany || !selectedRole) {
      setError('회사와 지원 직무를 선택해 주세요.')
      return
    }
    setIsBusy(true)
    setError('')
    try {
      const result = await runInterviewStep([], false)
      if (!result?.question) throw new Error('question-missing')
      setAiSource(result.aiSource ?? 'fallback')
      setCurrentQuestion(result.question)
      setLastFeedback(result.feedback ?? '')
      setFeedbackTone(result.feedbackTone ?? 'neutral')
      setCurrentHint({ intent: '', guide: '' })
      setPhase('interview')
    } catch (caught) {
      console.error(caught)
      setError('AI 면접을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setIsBusy(false)
    }
  }

  const submitAnswer = async (finishNow = false) => {
    const trimmed = answer.trim()
    if (!trimmed || !currentQuestion) {
      setError('현재 질문에 대한 답변을 먼저 입력해 주세요.')
      return
    }
    const answeredTurns = [...turns, { question: currentQuestion, answer: trimmed, feedback: lastFeedback }]
    const shouldFinish = finishNow
    setIsBusy(true)
    setError('')
    try {
      const result = await runInterviewStep(answeredTurns, shouldFinish)
      setTurns(answeredTurns)
      setAnswer('')
      setCurrentHint({ intent: '', guide: '' })
      setLastFeedback(result?.feedback ?? '')
      setFeedbackTone(result?.feedbackTone ?? 'neutral')
      setClosingSummary(result?.closingSummary ?? '')
      setSuggestedStrengths(result?.suggestedStrengths ?? [])
      setDecision(result?.decision ?? 'hold')
      setInterviewScore(result?.score ?? 0)
      setAiSource(result?.aiSource ?? 'fallback')
      if (shouldFinish) {
        setCurrentQuestion('')
        setPhase('result')
      } else {
        setCurrentQuestion(result?.question ?? '')
      }
    } catch (caught) {
      console.error(caught)
      setError('답변을 저장하거나 다음 질문을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setIsBusy(false)
    }
  }

  const requestHint = async () => {
    if (!currentQuestion) return
    setIsBusy(true)
    setError('')
    try {
      const result = await runInterviewStep(turns, false, 'hint')
      setCurrentHint({
        intent: result?.hintIntent || '면접관은 이 질문으로 내가 직업에 대해 어떤 생각을 해 봤는지 확인하려고 해요.',
        guide: result?.hintGuide || result?.hint || '내가 왜 관심을 가졌는지, 학교나 일상에서 비슷한 일이 있었는지, 앞으로 무엇을 해 보고 싶은지 떠올려 보세요.',
      })
      setAiSource(result?.aiSource ?? 'fallback')
    } catch (caught) {
      console.error(caught)
      setError('힌트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setIsBusy(false)
    }
  }

  const resetInterview = () => {
    setPhase('intro')
    setSelectedCompany(null)
    setDetailCompany(null)
    setApplication(blankInterviewApplication)
    setCustomRole('')
    setInterviewId('')
    setTurns([])
    setCurrentQuestion('')
    setAnswer('')
    setLastFeedback('')
    setFeedbackTone('neutral')
    setCurrentHint({ intent: '', guide: '' })
    setClosingSummary('')
    setSuggestedStrengths([])
    setDecision('hold')
    setInterviewScore(0)
    setAiSource('idle')
    setError('')
  }

  return (
    <section className="ai-interview-panel">
      <div className="ai-interview-heading">
        <div className="ai-kicker"><span>AI 가상면접</span><i className={`ai-signal ${aiSource}`} aria-label={aiSource === 'openai' ? 'AI 응답 연결됨' : aiSource === 'fallback' ? '기본 질문 모드' : 'AI 대기 중'} /></div>
        <h2>희망 직업 채용면접 시뮬레이션</h2>
        <p>회사를 고르고 간단 지원서를 작성하면 AI 면접관이 지원 직무에 맞춰 질문을 이어 가요. 면접 질문과 답변은 활동 기록으로 저장됩니다.</p>
      </div>
      {phase === 'intro' && <div className="ai-step-card intro"><h3>활동 안내</h3><p>이 활동은 직업정보를 묻는 Q&A가 아니라, 내가 선택한 직업에 실제 지원했다고 가정하는 채용면접이에요. 답변은 짧아도 괜찮고, 내가 가진 경험과 역량을 내 말로 설명하는 연습이 핵심입니다.</p><div className="ai-guide-list"><span>회사 선택</span><span>간단 지원서 작성</span><span>AI 면접 진행</span><span>답변 돌아보기</span></div><button type="button" onClick={() => setPhase('company')}>회사 선택하러 가기</button></div>}
      {phase === 'company' && <div className="ai-company-stage"><div className="company-grid">{interviewCompanies.map((company) => <article className="company-card" key={company.name}><span>{company.fields.join(' · ')}</span><h3>{company.name}</h3><p>{company.description}</p><div>{company.roles.slice(0, 3).map((role) => <small key={role}>{role}</small>)}</div><div className="company-actions"><button type="button" className="secondary" onClick={() => setDetailCompany(company)}>상세보기</button><button type="button" onClick={() => selectCompany(company)}>선택하기</button></div></article>)}</div><button type="button" className="custom-company-toggle" onClick={() => { setShowCustomCompany((current) => !current); setError('') }}>지원할 회사 직접 만들기</button>{showCustomCompany && <section className="custom-company-panel"><div><span>직접 만들기</span><h3>내가 지원할 회사를 만들어요</h3><p>회사명과 지원 직무만 입력해도 면접을 시작할 수 있어요. 여러 개는 쉼표로 구분해 주세요.</p></div><label>회사명<input value={customCompany.name} onChange={(event) => setCustomCompany({ ...customCompany, name: event.target.value })} maxLength={40} placeholder="예: 예청게임즈, 예청병원, 예청군청" /></label><label>분야<input value={customCompany.fields} onChange={(event) => setCustomCompany({ ...customCompany, fields: event.target.value })} maxLength={80} placeholder="예: 게임, 디자인, 행정" /></label><label>회사 설명<textarea value={customCompany.description} onChange={(event) => setCustomCompany({ ...customCompany, description: event.target.value })} maxLength={240} placeholder="어떤 일을 하는 회사인지 짧게 적어 주세요." /></label><label>지원 직무<input value={customCompany.roles} onChange={(event) => setCustomCompany({ ...customCompany, roles: event.target.value })} maxLength={120} placeholder="예: 게임 기획자, 디자이너, 일반행정직" /></label><label>면접에서 연결할 역량<input value={customCompany.strengths} onChange={(event) => setCustomCompany({ ...customCompany, strengths: event.target.value })} maxLength={120} placeholder="예: 창의성, 소통, 책임감" /></label>{error && <p className="entry-error" role="alert">{error}</p>}<button type="button" onClick={createCustomCompany}>이 회사로 지원서 쓰기</button></section>}</div>}
      {phase === 'application' && selectedCompany && (
        <form className="ai-application-form" onSubmit={(event) => { event.preventDefault(); void startInterview() }}>
          <div className="selected-company-strip">
            <span>{selectedCompany.name}</span>
            <button type="button" onClick={() => setPhase('company')}>회사 다시 선택</button>
          </div>
          <fieldset className="role-button-field">
            <legend>지원 직무</legend>
            <div className="role-button-grid">
              {selectedCompany.roles.map((role) => (
                <button
                  type="button"
                  className={application.role === role ? 'selected' : ''}
                  onClick={() => {
                    setApplication({ ...application, role })
                    setCustomRole('')
                  }}
                  key={role}
                >
                  {role}
                </button>
              ))}
              <button type="button" className={application.role === '직접 입력' ? 'selected' : ''} onClick={() => setApplication({ ...application, role: '직접 입력' })}>
                직접 입력
              </button>
            </div>
          </fieldset>
          {application.role === '직접 입력' && <label>직무 직접 입력<input value={customRole} onChange={(event) => setCustomRole(event.target.value)} maxLength={80} placeholder="지원하고 싶은 직무를 적어 주세요." /></label>}
          <fieldset className="role-button-field">
            <legend>면접 난이도</legend>
            <div className="difficulty-button-grid">
              {(Object.keys(interviewDifficultyLabels) as InterviewDifficulty[]).map((difficulty) => (
                <button type="button" className={application.difficulty === difficulty ? 'selected' : ''} onClick={() => setApplication({ ...application, difficulty })} key={difficulty}>
                  {interviewDifficultyLabels[difficulty]}
                </button>
              ))}
            </div>
          </fieldset>
          <label>우리 회사에 지원한 이유가 무엇인가요?<textarea value={application.interestReason} onChange={(event) => setApplication({ ...application, interestReason: event.target.value })} maxLength={500} placeholder="이 회사나 이 일이 왜 궁금한지, 어떤 점이 끌렸는지 적어 주세요." /></label>
          <label>다른 사람에 비해 내가 더 잘하는 게 있나요?<textarea value={application.strengths} onChange={(event) => setApplication({ ...application, strengths: event.target.value })} maxLength={500} placeholder="꼭 대단한 능력이 아니어도 괜찮아요. 내가 조금 더 자신 있는 점을 적어 주세요." /></label>
          <label>비슷하게 해 본 일이 있나요?<textarea value={application.experience} onChange={(event) => setApplication({ ...application, experience: event.target.value })} maxLength={500} placeholder="수업, 동아리, 친구와 한 활동, 집에서 해 본 일처럼 작아도 괜찮아요. 없다면 '아직 없어요'라고 적어도 돼요." /></label>
          <label>마지막으로 하고 싶은 말<input value={application.closingLine} onChange={(event) => setApplication({ ...application, closingLine: event.target.value })} maxLength={220} placeholder="면접에서 꼭 말하고 싶은 한 문장" /></label>
          {error && <p className="entry-error" role="alert">{error}</p>}
          <button type="submit" disabled={isBusy}>{isBusy ? '첫 질문 만드는 중' : 'AI 면접 시작하기'}</button>
        </form>
      )}
      {phase === 'interview' && selectedCompany && <div className="ai-interview-room"><div className="interview-status"><span>{selectedCompany.name}</span><b>{application.role === '직접 입력' ? customRole : application.role} 면접</b><small>{turns.length > 0 ? `${turns.length}번 답변함` : '진행 중'}</small></div><div className="interview-chat-log">{turns.map((turn, index) => <article key={`${turn.question}-${index}`}><div className="chat-bubble interviewer"><span>면접관</span><p>{turn.question}</p></div><div className="chat-bubble applicant"><span>나</span><p>{turn.answer}</p></div></article>)}{currentQuestion && <div className="chat-bubble interviewer current"><span>AI 면접관</span><p>{currentQuestion}</p></div>}</div>{lastFeedback && <div className={`interview-feedback ${feedbackTone}`}><b>방금 답변 피드백</b><p>{lastFeedback}</p></div>}{(currentHint.intent || currentHint.guide) && <div className="interview-hint"><section><b>질문의 의도</b><p>{currentHint.intent}</p></section><section><b>답변 가이드</b><p>{currentHint.guide}</p></section></div>}<label>내 답변<textarea value={answer} onChange={(event) => setAnswer(event.target.value)} maxLength={1200} placeholder="지원자처럼 답변해 보세요." /></label>{error && <p className="entry-error" role="alert">{error}</p>}<div className="interview-actions"><button type="button" className="secondary" onClick={() => void submitAnswer(true)} disabled={isBusy}>{isBusy ? '결과 정리 중' : '면접 마치고 결과 보기'}</button><button type="button" className="secondary" onClick={() => void requestHint()} disabled={isBusy}>{isBusy ? '불러오는 중' : '힌트 보기'}</button><button type="button" onClick={() => void submitAnswer(false)} disabled={isBusy}>{isBusy ? '다음 질문 만드는 중' : '답변 보내기'}</button></div></div>}
      {phase === 'result' && <div className={`ai-result-card ${decision}`}><span>면접 완료</span><div className="interview-decision"><b>{decision === 'pass' ? '합격' : decision === 'hold' ? '보류' : '재도전'}</b><small>{interviewScore > 0 ? `${interviewScore}점` : '판정 완료'}</small></div><h3>{selectedCompany?.name} · {application.role === '직접 입력' ? customRole : application.role}</h3>{closingSummary ? <p>{closingSummary}</p> : <p>면접 답변이 활동 기록으로 저장됐어요. 선생님과 멘토가 이후 활동에서 함께 돌아볼 수 있습니다.</p>}<div className="score-rubric"><b>점수 기준</b><div><span>지원 이유</span><span>내 강점</span><span>경험·계획</span><span>성실한 답변</span></div><p>답변이 구체적이고 질문에 맞을수록 올라가요. 장난식 답변, 너무 짧은 답변, 질문과 상관없는 답변은 점수가 내려갑니다.</p></div>{suggestedStrengths.length > 0 && <div className="result-strengths">{suggestedStrengths.map((strength) => <b key={strength}>{strength}</b>)}</div>}<div className="interview-log-preview">{turns.map((turn, index) => <article key={`${turn.question}-${index}`}><strong>Q{index + 1}. {turn.question}</strong><p>{turn.answer}</p></article>)}</div><button type="button" onClick={resetInterview}>새 면접 시작하기</button></div>}
      {detailCompany && <div className="company-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setDetailCompany(null) }}><section className="company-modal" role="dialog" aria-modal="true"><button type="button" className="company-modal-close" onClick={() => setDetailCompany(null)} aria-label="회사 상세 닫기">×</button><span>{detailCompany.fields.join(' · ')}</span><h2>{detailCompany.name}</h2><p>{detailCompany.description}</p><h3>지원해 볼 수 있는 직무</h3><div>{detailCompany.roles.map((role) => <small key={role}>{role}</small>)}</div><h3>면접에서 연결할 역량</h3><div>{detailCompany.strengths.map((strength) => <small key={strength}>{strength}</small>)}</div><button type="button" onClick={() => selectCompany(detailCompany)}>이 회사 선택하기</button></section></div>}
    </section>
  )
}

function AdminAuctionResultsPanel() {
  const [records, setRecords] = useState<AuctionResultRecord[]>([])
  const [rooms, setRooms] = useState<AdminAuctionRoomRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [backupInfo, setBackupInfo] = useState<{ backupId: string; roomCount: number; participantCount: number; resultCount: number } | null>(null)
  const [actionState, setActionState] = useState<'idle' | 'backing-up' | 'recovering'>('idle')
  const [actionMessage, setActionMessage] = useState('')
  useEffect(() => {
    if (!db) { setError('Firebase 연결을 확인해 주세요.'); setLoading(false); return }
    const firestore = db
    Promise.all([getDocs(collection(firestore, 'auctionResults')), getDocs(collection(firestore, 'auctionRooms'))]).then(async ([resultSnapshot, roomSnapshot]) => {
      setRecords(resultSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AuctionResultRecord, 'id'>) })).sort((left, right) => (right.savedAt?.toMillis?.() ?? 0) - (left.savedAt?.toMillis?.() ?? 0)))
      const roomRecords = await Promise.all(roomSnapshot.docs.map(async (roomDocument) => {
        const participantSnapshot = await getDocs(collection(firestore, 'auctionRooms', roomDocument.id, 'participants'))
        const data = roomDocument.data() as AuctionRoom
        return { id: roomDocument.id, gameState: data.gameState, selectedJob: data.selectedJob, selectedJobs: data.selectedJobs, auctionIndex: Number(data.auctionIndex ?? 0), totalItems: Number(data.totalItems ?? 0), participants: participantSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AuctionParticipant, 'id'>) })) }
      }))
      setRooms(roomRecords)
    }).catch((loadError) => { console.error(loadError); setError('전체 경매 자료를 불러오지 못했어요.') }).finally(() => setLoading(false))
  }, [])
  if (loading) return <div className="admin-placeholder-note"><b>경매 자료 확인 중</b><p>Firebase 데이터베이스의 결과와 경매방 자료를 모두 불러오고 있어요.</p></div>
  if (error) return <p className="entry-error" role="alert">{error}</p>
  const createBackup = async () => {
    if (!functions) return
    setActionState('backing-up')
    setActionMessage('')
    try {
      const backup = httpsCallable<Record<string, never>, { backupId: string; roomCount: number; participantCount: number; resultCount: number }>(functions, 'backupAuctionData')
      const response = await backup({})
      setBackupInfo(response.data)
      setActionMessage(`백업 완료: 방 ${response.data.roomCount}개, 참여 기록 ${response.data.participantCount}건, 확정 결과 ${response.data.resultCount}건`)
    } catch (backupError) {
      console.error(backupError)
      setActionMessage('백업에 실패했어요. 복구는 진행하지 않았습니다.')
    } finally { setActionState('idle') }
  }
  const recoverResults = async () => {
    if (!functions || !db || !backupInfo) return
    setActionState('recovering')
    setActionMessage('')
    try {
      const recover = httpsCallable<{ backupId: string }, { recoveredCount: number; skippedCount: number }>(functions, 'recoverAuctionResults')
      const response = await recover({ backupId: backupInfo.backupId })
      const snapshot = await getDocs(collection(db, 'auctionResults'))
      setRecords(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<AuctionResultRecord, 'id'>) })).sort((left, right) => (right.savedAt?.toMillis?.() ?? 0) - (left.savedAt?.toMillis?.() ?? 0)))
      setActionMessage(`복구 완료: ${response.data.recoveredCount}건 복구, 기존 ${response.data.skippedCount}건 보존`)
    } catch (recoverError) {
      console.error(recoverError)
      setActionMessage('복구에 실패했어요. 생성한 백업은 그대로 보존되어 있습니다.')
    } finally { setActionState('idle') }
  }
  const roomParticipants = rooms.flatMap((room) => room.participants.filter((participant) => participant.role === 'participant'))
  const groupedResults = Array.from(records.reduce((groups, record) => {
    const roomCode = record.roomCode || '방 코드 미기록'
    const current = groups.get(roomCode) ?? []
    current.push(record)
    groups.set(roomCode, current)
    return groups
  }, new Map<string, AuctionResultRecord[]>())).map(([roomCode, participants]) => ({
    roomCode,
    participants: participants.sort((left, right) => left.displayName.localeCompare(right.displayName, 'ko')),
    latestSavedAt: Math.max(...participants.map((record) => record.savedAt?.toMillis?.() ?? 0)),
  })).sort((left, right) => right.latestSavedAt - left.latestSavedAt || left.roomCode.localeCompare(right.roomCode, 'ko'))
  const strengthBadges = (inventory: Record<string, number>) => Object.entries(inventory).length ? Object.entries(inventory).map(([strength, count]) => <span key={strength}>{strength} <b>{count >= 3 ? 'EPIC' : count === 2 ? 'RARE' : 'NORMAL'}</b></span>) : <span>보유 강점 없음</span>
  return <section className="admin-auction-results"><div className="admin-auction-recovery"><div><h3>경매 자료 안전 백업·복구</h3><p>현재 경매방과 참가자 기록, 기존 확정 결과를 먼저 백업한 뒤 중간 기록을 최종 결과로 복구합니다.</p></div><div className="admin-auction-recovery-actions"><button type="button" onClick={() => void createBackup()} disabled={actionState !== 'idle'}>{actionState === 'backing-up' ? '백업 중…' : '먼저 백업하기'}</button><button type="button" className="secondary" onClick={() => void recoverResults()} disabled={!backupInfo || actionState !== 'idle'}>{actionState === 'recovering' ? '복구 중…' : '백업본으로 복구하기'}</button></div>{actionMessage && <p className="admin-auction-action-message" role="status">{actionMessage}</p>}{backupInfo && <small>백업 ID: {backupInfo.backupId}</small>}</div><div className="admin-auction-summary"><div><small>확정 결과</small><b>{records.length}건</b></div><div><small>남아 있는 경매방</small><b>{rooms.length}개</b></div><div><small>방 내부 참가자</small><b>{roomParticipants.length}명</b></div></div><div><h3>확정 저장 결과</h3>{records.length ? <div className="admin-auction-room-groups">{groupedResults.map((group) => <article className="admin-auction-room-group" key={group.roomCode}><header><div><span>경매방</span><b>{group.roomCode}</b></div><small>참가자 결과 {group.participants.length}건</small></header><div className="admin-auction-room-results">{group.participants.map((record) => <section key={record.id}><div className="admin-auction-participant-heading"><b>{record.displayName}</b><small>{record.recovered ? `중간 기록 복구 · ${record.originalGameState || '상태 미기록'}` : record.savedAt?.toMillis ? new Date(record.savedAt.toMillis()).toLocaleString('ko-KR') : '저장 시간 미기록'}</small></div><dl><dt>선택 직업</dt><dd>{record.selectedJob || '미기록'}</dd><dt>진행 상품</dt><dd>{record.auctionIndex} / {record.totalItems}</dd><dt>남은 포인트</dt><dd>{record.balance}P</dd><dt>저장 구분</dt><dd>{record.recovered ? '복구 결과' : record.endedByHost ? '방장 종료' : '정상 종료'}</dd></dl><div className="admin-strength-list">{strengthBadges(record.inventory ?? {})}</div></section>)}</div></article>)}</div> : <div className="empty-auction-records"><b>확정 저장된 결과가 없어요.</b><p>게임이 결과 단계까지 완료되면 이곳에 저장됩니다.</p></div>}</div><div><h3>경매방 내부 복구 가능 자료</h3>{rooms.length ? <div className="admin-auction-table">{rooms.map((room) => <article key={room.id}><header><div><span>방 {room.id}</span><b>{room.gameState}</b></div><small>{room.auctionIndex} / {room.totalItems} 상품 진행</small></header><p>선택 직업: {(room.selectedJobs?.length ? room.selectedJobs.join(', ') : room.selectedJob) || '미기록'}</p><div className="admin-room-participants">{room.participants.map((participant) => <section key={participant.id}><b>{participant.nickname} {participant.role === 'host' ? '(방장)' : ''}</b><small>{participant.selectedJob || '직업 미선택'} · {participant.balance ?? 0}P</small><div className="admin-strength-list">{strengthBadges(participant.inventory ?? {})}</div></section>)}</div></article>)}</div> : <div className="empty-auction-records"><b>남아 있는 경매방 자료가 없어요.</b></div>}</div></section>
}

function AdminPage({ displayName, accountTools, sessionLocks, sessionLockBusy, sessionLockError, onToggleSessionLock, onOpenPreferenceRecords, onOpenSession, onBack, onLeave }: { displayName: string; accountTools: ReactNode; sessionLocks: SessionLocksByTarget; sessionLockBusy: string | null; sessionLockError: string; onToggleSessionLock: (sessionNumber: number, target: SessionLockTarget, unlocked: boolean) => void; onOpenPreferenceRecords: () => void; onOpenSession: (sessionNumber: number) => void; onBack: () => void; onLeave: () => void }) {
  const [activeSection, setActiveSection] = useState<AdminSectionId | null>(null)
  const adminSections = [
    { id: 'accounts' as const, title: '계정 관리', description: '학생, 교사, 멘토, 관리자(마스터) 계정과 PIN을 조회하고 정비하는 영역입니다.', items: ['학교별 학생 PIN', '교사·멘토 계정', '마스터 등급'], action: '계정 관리 열기', tone: 'blue' },
    { id: 'activities' as const, title: '활동 관리', description: '회기별 활동 공개 범위와 강점 경매장 운영 흐름을 관리하는 영역입니다.', items: ['회기 잠금 설정', '활동 화면 점검', '경매장 진행 관리'], action: '활동 관리 열기', tone: 'green' },
    { id: 'records' as const, title: '활동 기록', description: '선호 탐색과 강점 경매장 결과를 학교·참가자별로 모아 확인하는 영역입니다.', items: ['2회기 활동 결과', '강점 경매장 기록', '복구 백업 자료'], action: '활동 기록 열기', tone: 'orange' },
    { id: 'library' as const, title: '자료실', description: '핵심 자료와 운영 링크를 언제든지 저장하고 다시 꺼내 쓰는 영역입니다.', items: ['수업 자료', '운영 문서', '외부 링크'], action: '자료실 열기', tone: 'purple' },
  ]
  const sectionTitle = activeSection === 'accounts' ? '계정 관리' : activeSection === 'activities' ? '활동 관리' : activeSection === 'records' ? '활동 기록' : activeSection === 'library' ? '자료실' : ''
  return (
    <div className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>관리자(마스터)</span><b>{displayName}</b><button className="logout-button" onClick={onLeave}>로그아웃</button></div></header>
      <MasterViewBanner label="관리자 페이지로 보는 중입니다" />
      <main className="admin-page">
        <button className="back-button" type="button" onClick={activeSection ? () => setActiveSection(null) : onBack}>{activeSection ? '← 관리자 페이지로' : '← 나의 활동실로'}</button>
        <section className="admin-hero">
          <div><p className="eyebrow">MASTER CONSOLE</p><h1>{sectionTitle || '관리자 페이지'}</h1><p>{activeSection ? '관리자가 현장에서 바로 확인하고 처리할 수 있도록 기능별로 나눈 세부 화면이에요.' : '계정, 활동 업데이트, 활동 결과를 한곳에서 정리하기 위한 운영 화면이에요.'}</p></div>
          <span aria-hidden="true">↗</span>
        </section>
        {!activeSection && <section className="admin-section-grid">{adminSections.map((section) => <article className={`admin-section-card ${section.tone}`} key={section.title}><h2>{section.title}</h2><p>{section.description}</p><ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul><button type="button" onClick={() => setActiveSection(section.id)}>{section.action}</button></article>)}</section>}
        {activeSection === 'accounts' && <section className="admin-detail-panel account-admin-panel"><div className="admin-detail-heading"><span>계정 관리</span><h2>학생 PIN 관리</h2><p>학교별 학생 계정 목록을 확인하고, 없는 계정 발급이나 PIN 재발급을 처리합니다.</p></div>{accountTools}</section>}
        {activeSection === 'activities' && <section className="admin-detail-panel"><div className="admin-detail-heading"><span>활동 관리</span><h2>회기별 잠금 관리</h2><p>예산고, 광시중, 멘토의 활동 공개 여부를 각각 설정합니다. 교사는 소속 학교 설정을 따릅니다.</p></div>{sessionLockError && <p className="entry-error" role="alert">{sessionLockError}</p>}<div className="admin-session-list">{sessionTemplates.map((session) => <article key={session.number}><span>{session.number}회기</span><div><h3>{session.title}</h3><p>{session.subtitle}</p><small>대상별로 따로 잠그거나 풀 수 있어요.</small></div><div className="admin-session-targets"><button type="button" onClick={() => onOpenSession(session.number)}>활동 확인</button>{([['yesan', '예산고'], ['gwangsi', '광시중'], ['mentor', '멘토']] as const).map(([target, label]) => { const unlocked = sessionLocks[target][session.number] === true; const busyKey = `${target}-${session.number}`; return <div key={target}><b>{label}</b><button type="button" className={`session-lock-toggle ${unlocked ? 'open' : 'locked'}`} onClick={() => onToggleSessionLock(session.number, target, !unlocked)} disabled={sessionLockBusy === busyKey}>{sessionLockBusy === busyKey ? '저장 중' : unlocked ? '잠그기' : '풀기'}</button><small>{unlocked ? '공개 중' : '잠김'}</small></div> })}</div></article>)}</div><div className="admin-placeholder-note"><b>잠금 기준</b><p>예산고·광시중 학생과 교사는 각 학교 설정을 따르고, 멘토는 멘토 설정을 따릅니다. 관리자는 잠금 여부와 관계없이 활동 확인으로 들어갈 수 있습니다.</p></div></section>}
        {activeSection === 'records' && <section className="admin-detail-panel"><div className="admin-detail-heading"><span>활동 기록</span><h2>활동 결과 보기</h2><p>Firebase에 저장된 선호 탐색과 강점 경매장 결과를 확인합니다.</p></div><div className="admin-record-actions"><button type="button" onClick={onOpenPreferenceRecords}><span>2회기</span><b>선호 탐색 결과 보기</b><small>좋아·싫어 결과와 워드클라우드 확인</small></button></div><AdminAuctionResultsPanel /></section>}
        {activeSection === 'library' && <section className="admin-detail-panel"><div className="admin-detail-heading"><span>자료실</span><h2>핵심 자료 보관함</h2><p>수업 중 자주 쓰는 자료, 운영 문서, 외부 링크를 한곳에 모아 두는 관리자용 자료실입니다.</p></div><div className="admin-library-grid"><article><span>수업 자료</span><h3>회기별 진행 자료</h3><p>활동 안내, 멘토 진행안, 학생용 안내문을 회기별로 정리해 둘 자리입니다.</p><button type="button" disabled>자료 추가 준비 중</button></article><article><span>운영 문서</span><h3>계정·배포·운영 메모</h3><p>PIN 발급 이력, 배포 체크리스트, 현장 운영 메모를 저장할 수 있게 확장할 자리입니다.</p><button type="button" disabled>문서 추가 준비 중</button></article><article><span>외부 링크</span><h3>바로가기 모음</h3><p>수련관 홈페이지, 프로그램 접수, 공유 드라이브 등 자주 여는 링크를 모아둘 자리입니다.</p><div className="admin-library-links"><a href="http://www.yesanyouth.or.kr/main_sub/sub.php?folder_idx=2&folder_page_idx=69" target="_blank" rel="noreferrer">수련관 홈페이지</a><a href="http://www.yesanyouth.or.kr/edu/edu_list.php?folder_idx=2&folder_page_idx=40" target="_blank" rel="noreferrer">프로그램 접수</a></div></article></div><div className="admin-placeholder-note"><b>다음 확장</b><p>실제 업로드까지 붙일 때는 Firebase Storage 권한과 자료 메타데이터 저장 구조를 함께 설계하면 됩니다.</p></div></section>}
        {!activeSection && <section className="admin-note"><b>운영 원칙</b><p>학생 PIN은 담당자에게 조회 가능해야 하며, 마스터 코드와 Firebase 설정값은 화면·문서·코드에 노출하지 않습니다.</p></section>}
      </main>
      <PartnerFooter />
    </div>
  )
}

function App() {
  const [entered, setEntered] = useState(false)
  const [activeSession, setActiveSession] = useState<number | null>(null)
  const [activeSecondActivity, setActiveSecondActivity] = useState<number | null>(null)
  const [activeThirdActivity, setActiveThirdActivity] = useState<number | null>(null)
  const [activeGuide, setActiveGuide] = useState<GuidePage | null>(null)
  const [showMentorQuestion, setShowMentorQuestion] = useState(false)
  const [activeAdminPage, setActiveAdminPage] = useState(false)
  const [mentorProfiles, setMentorProfiles] = useState<MentorProfile[]>([])
  const [mentorQuestions, setMentorQuestions] = useState<MentorQuestion[]>([])
  const [sessionPageMode, setSessionPageMode] = useState<'activity' | 'review'>('review')
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null)
  const [school, setSchool] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [isEntering, setIsEntering] = useState(false)
  const [entryError, setEntryError] = useState('')
  const [showMasterUnlock, setShowMasterUnlock] = useState(false)
  const [masterCode, setMasterCode] = useState('')
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [showAccessQr, setShowAccessQr] = useState(false)
  const [useTeacherLogin, setUseTeacherLogin] = useState(false)
  const [needsStudentName, setNeedsStudentName] = useState(false)
  const [studentIssueSchool, setStudentIssueSchool] = useState<'yesan-high' | 'gwangsi-middle'>('yesan-high')
  const [issuedStudentPins, setIssuedStudentPins] = useState<IssuedStudentPin[]>([])
  const [managedStudentAccounts, setManagedStudentAccounts] = useState<ManagedStudentAccount[]>([])
  const [studentIssueError, setStudentIssueError] = useState('')
  const [isIssuingStudentPins, setIsIssuingStudentPins] = useState(false)
  const [sessionLocks, setSessionLocks] = useState<SessionLocksByTarget>(defaultSessionLocks)
  const [sessionLockBusy, setSessionLockBusy] = useState<string | null>(null)
  const [sessionLockError, setSessionLockError] = useState('')
  const [masterViewMode, setMasterViewMode] = useState<MasterViewMode>('mentor')
  const [adminSessionPreview, setAdminSessionPreview] = useState<number | null>(null)
  const schoolName = school === 'yesan-high' ? '예산고등학교' : school === 'gwangsi-middle' ? '광시중학교' : school === 'yesan-teacher' ? '예산고등학교' : school === 'gwangsi-teacher' ? '광시중학교' : school === 'mentor' ? '멘토' : school === 'admin' ? '관리자(마스터)' : school === 'staff' ? '멘토/관리자' : ''
  const isPinStudentMode = (school === 'yesan-high' || school === 'gwangsi-middle') && !useTeacherLogin
  const isTeacherMode = school === 'yesan-teacher' || school === 'gwangsi-teacher'
  const isMentorMode = school === 'mentor'
  const isAdminMode = school === 'admin' || school === 'staff'
  const isStaffAccount = isTeacherMode || isMentorMode || isAdminMode
  const isMasterAccount = staffRole === 'admin'
  const isMentorView = isMentorMode || (isMasterAccount && masterViewMode === 'mentor')
  const viewSchool = isMasterAccount && masterViewMode !== 'mentor' ? masterViewMode : school
  const viewSchoolName = isMasterAccount ? masterViewMode === 'yesan-high' ? '예산고등학교' : masterViewMode === 'gwangsi-middle' ? '광시중학교' : '멘토' : schoolName
  const viewDisplayName = isMasterAccount && masterViewMode !== 'mentor' ? `${name.trim()} · 학생 화면` : name.trim()
  const isMasterStudentView = isMasterAccount && masterViewMode !== 'mentor'
  const sessionLockTarget: SessionLockTarget = viewSchool === 'yesan-high' || viewSchool === 'yesan-teacher'
    ? 'yesan'
    : viewSchool === 'gwangsi-middle' || viewSchool === 'gwangsi-teacher'
      ? 'gwangsi'
      : 'mentor'
  const activeSessionLocks = sessionLocks[sessionLockTarget]
  const hiddenMentorNames = viewSchool === 'gwangsi-middle'
    ? ['이영우']
    : viewSchool === 'yesan-high'
      ? ['안지윤', '양예원']
      : []
  const visibleMentorProfiles = mentorProfiles.filter(
    (profile) => !hiddenMentorNames.includes(profile.displayName.replace(/\s/g, '')),
  )
  const masterViewLabel = isMasterAccount ? masterViewMode === 'yesan-high' ? '예산고 학생 화면으로 보는 중입니다' : masterViewMode === 'gwangsi-middle' ? '광시중 학생 화면으로 보는 중입니다' : '멘토 화면으로 보는 중입니다' : ''
  const canPreviewFutureSessions = isMasterAccount && adminSessionPreview !== null
  const completedSessionCount = viewSchool === 'yesan-high' || (isStaffAccount && !isMasterStudentView) ? 1 : 0
  const sessions: Session[] = sessionTemplates.map((session) => ({
    ...session,
    status: canPreviewFutureSessions ? 'open' : activeSessionLocks[session.number] === true ? session.number <= completedSessionCount ? 'done' : 'open' : 'locked',
  }))
  const progress = completedSessionCount * 20

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState({ cheongsajinView: 'login' }, '', '#login')
    const handleBack = (event: PopStateEvent) => {
      const view = typeof event.state?.cheongsajinView === 'string' ? event.state.cheongsajinView : 'login'
      const secondActivityMatch = /^activity-2-step-([1-4])$/.exec(view)
      const thirdActivityMatch = /^activity-3-step-([1-4])$/.exec(view)
      const sessionMatch = /^(activity|session)-(\d+)$/.exec(view)
      const guideMatch = /^guide-(program|profile|mentors|center|questions)$/.exec(view)
      if ((view === 'dashboard' || view === 'admin' || sessionMatch || secondActivityMatch || thirdActivityMatch || guideMatch) && !auth?.currentUser) {
        setActiveSession(null)
        setActiveSecondActivity(null)
        setActiveThirdActivity(null)
        setActiveGuide(null)
        setActiveAdminPage(false)
        setEntered(false)
        window.history.replaceState({ cheongsajinView: 'login' }, '', '#login')
        return
      }
      if (view === 'admin') {
        if (staffRole !== 'admin') {
          window.history.replaceState({ cheongsajinView: 'dashboard' }, '', '#dashboard')
          return
        }
        setEntered(true)
        setActiveSession(null)
        setActiveSecondActivity(null)
        setActiveThirdActivity(null)
        setActiveGuide(null)
        setAdminSessionPreview(null)
        setActiveAdminPage(true)
        return
      }
      if (secondActivityMatch) {
        setEntered(true)
        setSessionPageMode('activity')
        setActiveSession(2)
        setActiveSecondActivity(Number(secondActivityMatch[1]))
        setActiveThirdActivity(null)
        setAdminSessionPreview(null)
        setActiveAdminPage(false)
        return
      }
      if (thirdActivityMatch) {
        if (staffRole !== 'admin' && activeSessionLocks[3] !== true) {
          setActiveSession(null)
          setActiveSecondActivity(null)
          setActiveThirdActivity(null)
          setActiveGuide(null)
          window.history.replaceState({ cheongsajinView: 'dashboard' }, '', '#dashboard')
          return
        }
        setEntered(true)
        setSessionPageMode('activity')
        setActiveSession(3)
        setActiveSecondActivity(null)
        setActiveThirdActivity(Number(thirdActivityMatch[1]))
        setAdminSessionPreview(null)
        setActiveAdminPage(false)
        return
      }
      if (guideMatch) {
        setEntered(true)
        setActiveSession(null)
        setActiveSecondActivity(null)
        setActiveThirdActivity(null)
        setActiveGuide(guideMatch[1] as GuidePage)
        setAdminSessionPreview(null)
        setActiveAdminPage(false)
        return
      }
      if (sessionMatch) {
        const requestedSession = Number(sessionMatch[2])
        if (staffRole !== 'admin' && activeSessionLocks[requestedSession] !== true) {
          setActiveSession(null)
          setActiveSecondActivity(null)
          setActiveThirdActivity(null)
          setActiveGuide(null)
          window.history.replaceState({ cheongsajinView: 'dashboard' }, '', '#dashboard')
          return
        }
        setEntered(true)
        setSessionPageMode(sessionMatch[1] === 'activity' ? 'activity' : 'review')
        setActiveSession(requestedSession)
        setActiveSecondActivity(null)
        setActiveThirdActivity(null)
        setAdminSessionPreview(null)
        setActiveAdminPage(false)
        return
      }
      if (view === 'dashboard') {
        setEntered(true)
        setActiveSession(null)
        setActiveSecondActivity(null)
        setActiveThirdActivity(null)
        setActiveGuide(null)
        setAdminSessionPreview(null)
        setActiveAdminPage(false)
        return
      }
      setActiveSession(null)
      setActiveSecondActivity(null)
      setActiveThirdActivity(null)
      setActiveGuide(null)
      setActiveAdminPage(false)
      setEntered(false)
      if (auth?.currentUser) void signOut(auth)
    }
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [staffRole, activeSessionLocks])

  useEffect(() => {
    if (!auth || !db) return
    const firestore = db
    return onAuthStateChanged(auth, async (user) => {
      if (!user || entered) return
      try {
        const saved = JSON.parse(window.localStorage.getItem(savedSessionKey) ?? 'null') as { school?: string; name?: string; role?: StaffRole } | null
        if (saved?.school && saved?.name) {
          let verifiedRole: StaffRole | null = null
          if (saved.role) {
            const sessionSnapshot = await getDoc(doc(firestore, 'staffSessions', user.uid))
            const sessionData = sessionSnapshot.data()
            const expiresAt = sessionData?.expiresAt?.toMillis?.() ?? 0
            if (sessionSnapshot.exists() && expiresAt > Date.now() && sessionData?.role === saved.role) verifiedRole = saved.role
          }
          setSchool(saved.school)
          setName(saved.name)
          setStaffRole(verifiedRole)
          setPin('')
          setEntered(true)
          setActiveSession(null)
          setActiveSecondActivity(null)
          setActiveThirdActivity(null)
          setActiveGuide(null)
          setActiveAdminPage(false)
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

  useEffect(() => {
    if (!entered || !db || !auth?.currentUser || !isMentorView || !staffRole) { setMentorQuestions([]); return }
    const firestore = db
    const userId = auth.currentUser.uid
    let stopQuestions: () => void = () => {}
    let cancelled = false
    void getDoc(doc(firestore, 'staffSessions', userId)).then((sessionSnapshot) => {
      if (cancelled || !sessionSnapshot.exists()) return
      const accountNumber = String(sessionSnapshot.data().accountNumber ?? '')
      if (!accountNumber) return
      const source = staffRole === 'admin' ? collection(firestore, 'mentorQuestions') : query(collection(firestore, 'mentorQuestions'), where('mentorId', '==', accountNumber))
      stopQuestions = onSnapshot(source, (snapshot) => {
        setMentorQuestions(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<MentorQuestion, 'id'>) })).sort((left, right) => (right.createdAt?.toMillis?.() ?? 0) - (left.createdAt?.toMillis?.() ?? 0)))
      }, (error) => console.error(error))
    }).catch((error) => console.error(error))
    return () => { cancelled = true; stopQuestions() }
  }, [entered, isMentorView, staffRole])

  useEffect(() => {
    if (!entered || !db) return
    return onSnapshot(doc(db, 'system', 'sessionLocks'), (snapshot) => {
      const stored = snapshot.data()?.sessions as Record<string, boolean | Record<string, boolean>> | undefined
      const hasLegacyValues = typeof stored?.['1'] === 'boolean'
      const nextLocks: SessionLocksByTarget = {
        yesan: { ...defaultSessionLockMap },
        gwangsi: { ...defaultSessionLockMap },
        mentor: { ...defaultSessionLockMap },
      }
      ;(['yesan', 'gwangsi', 'mentor'] as const).forEach((target) => {
        const targetValues = hasLegacyValues ? stored : stored?.[target]
        if (!targetValues || typeof targetValues !== 'object') return
        Object.entries(targetValues).forEach(([key, value]) => { nextLocks[target][Number(key)] = value === true })
      })
      setSessionLocks(nextLocks)
    }, (error) => console.error(error))
  }, [entered])

  const enter = async (event: FormEvent) => {
    event.preventDefault()
    if (!school) {
      setEntryError('학교를 선택해 주세요.')
      return
    }
    if ((!isPinStudentMode || needsStudentName) && !isTeacherMode && !name.trim()) {
      setEntryError('이름을 입력해 주세요.')
      return
    }
    if (!pin.trim()) {
      setEntryError('PIN 번호를 입력해 주세요.')
      return
    }
    const staffLoginName = school === 'yesan-teacher' ? '예산고' : school === 'gwangsi-teacher' ? '광시중' : name.trim()
    const isStaff = isTeacherMode || isMentorMode || isAdminMode
    const isRegistered = testParticipants.some((participant) => participant.school === school && participant.name === name.trim() && participant.pin === pin.trim())
    const isPinTestLogin = isPinStudentMode && pin.trim() === '1'
    if (!isStaff && !isRegistered && !isPinStudentMode) {
      setEntryError('등록된 정보와 일치하지 않습니다. 학교, 이름, PIN 번호를 확인해 주세요.')
      return
    }
    if (isPinStudentMode && !isPinTestLogin && !/^\d{6}$/.test(pin.trim())) {
      setEntryError('학생 PIN은 6자리 숫자예요.')
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
        const loginResult = await loginStaff({ name: staffLoginName, pin: pin.trim() })
        if ((isTeacherMode && loginResult.data.role !== 'teacher') || (isMentorMode && loginResult.data.role !== 'mentor') || (isAdminMode && loginResult.data.role !== 'admin')) throw new Error('role-mismatch')
        const displayName = loginResult.data.displayName
        setStaffRole(loginResult.data.role)
        setName(displayName)
        window.localStorage.setItem(savedSessionKey, JSON.stringify({ school, name: displayName, role: loginResult.data.role }))
      } else if (isPinStudentMode) {
        await signInAnonymously(auth)
        if (isPinTestLogin) {
          setName('1')
          setStaffRole(null)
          window.localStorage.setItem(savedSessionKey, JSON.stringify({ school, name: '1' }))
        } else {
          if (!functions) throw new Error('Firebase Functions configuration is missing')
          const loginStudent = httpsCallable<{ school: string; pin: string; name?: string }, { needsName: boolean; displayName?: string; schoolName?: string }>(functions, 'studentLogin')
          const loginResult = await loginStudent({ school, pin: pin.trim(), name: needsStudentName ? name.trim() : undefined })
          if (loginResult.data.needsName) {
            setNeedsStudentName(true)
            setEntryError('처음 사용하는 PIN입니다. 이름을 입력해 주세요.')
            return
          }
          const displayName = loginResult.data.displayName ?? name.trim()
          setName(displayName)
          setStaffRole(null)
          window.localStorage.setItem(savedSessionKey, JSON.stringify({ school, name: displayName }))
        }
      } else {
        await signInAnonymously(auth)
        setStaffRole(null)
        window.localStorage.setItem(savedSessionKey, JSON.stringify({ school, name: name.trim() }))
      }
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
    setActiveThirdActivity(null)
    setActiveGuide(null)
    setActiveAdminPage(false)
    setAdminSessionPreview(null)
    setStaffRole(null)
    setMasterViewMode('mentor')
    setUseTeacherLogin(false)
    setNeedsStudentName(false)
    setEntered(false)
    window.history.replaceState({ cheongsajinView: 'login' }, '', '#login')
  }
  const openSession = (sessionNumber: number, mode: 'activity' | 'review') => {
    if (!canPreviewFutureSessions && activeSessionLocks[sessionNumber] !== true) return
    setSessionPageMode(mode)
    setActiveSession(sessionNumber)
    setActiveSecondActivity(null)
    setActiveThirdActivity(null)
    setAdminSessionPreview(null)
    setActiveAdminPage(false)
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
  const loadStudentPinAccounts = async () => {
    if (!functions) return
    setIsIssuingStudentPins(true)
    setStudentIssueError('')
    try {
      if (auth && !auth.currentUser) await signInAnonymously(auth)
      const listAccounts = httpsCallable<{ school: string }, { accounts: ManagedStudentAccount[] }>(functions, 'listStudentPinAccounts')
      const result = await listAccounts({ school: studentIssueSchool })
      setManagedStudentAccounts(result.data.accounts)
    } catch (error) {
      console.error(error)
      setStudentIssueError('마스터 로그인 상태 또는 Firebase 권한을 확인해 주세요.')
    } finally {
      setIsIssuingStudentPins(false)
    }
  }
  const issueStudentPins = async () => {
    if (!functions) return
    setIsIssuingStudentPins(true)
    setStudentIssueError('')
    setIssuedStudentPins([])
    try {
      if (auth && !auth.currentUser) await signInAnonymously(auth)
      const issuePins = httpsCallable<{ school: string }, { credentials: IssuedStudentPin[] }>(functions, 'bootstrapStudentAccounts')
      const result = await issuePins({ school: studentIssueSchool })
      setIssuedStudentPins(result.data.credentials)
      await loadStudentPinAccounts()
    } catch (error) {
      console.error(error)
      setStudentIssueError('마스터 로그인 상태 또는 Firebase 권한을 확인해 주세요.')
    } finally {
      setIsIssuingStudentPins(false)
    }
  }
  const resetStudentPin = async (accountId: string) => {
    if (!functions) return
    setStudentIssueError('')
    try {
      const resetPin = httpsCallable<{ accountId: string }, { account: ManagedStudentAccount }>(functions, 'resetStudentPinAccount')
      const result = await resetPin({ accountId })
      setManagedStudentAccounts((accounts) => accounts.map((account) => account.id === accountId ? result.data.account : account))
      setIssuedStudentPins([{ accountNumber: result.data.account.accountNumber, displayName: result.data.account.displayName, pin: result.data.account.currentPin }])
    } catch (error) {
      console.error(error)
      setStudentIssueError('PIN을 재발급하지 못했어요.')
    }
  }
  const resetAllStudentPins = async () => {
    if (!functions) return
    setIsIssuingStudentPins(true)
    setStudentIssueError('')
    try {
      const resetPins = httpsCallable<{ school: string }, { credentials: IssuedStudentPin[] }>(functions, 'resetStudentPinAccounts')
      const result = await resetPins({ school: studentIssueSchool })
      setIssuedStudentPins(result.data.credentials)
      await loadStudentPinAccounts()
    } catch (error) {
      console.error(error)
      setStudentIssueError('전체 PIN을 재발급하지 못했어요.')
    } finally {
      setIsIssuingStudentPins(false)
    }
  }
  const openSecondActivity = (step: number) => {
    setActiveSecondActivity(step)
    setActiveThirdActivity(null)
    const view = `activity-2-step-${step}`
    window.history.pushState({ cheongsajinView: view }, '', `#${view}`)
  }
  const openThirdActivity = (step: number) => {
    setActiveSecondActivity(null)
    setActiveThirdActivity(step)
    const view = `activity-3-step-${step}`
    window.history.pushState({ cheongsajinView: view }, '', `#${view}`)
  }
  const goDashboard = () => {
    setActiveSession(null)
    setActiveSecondActivity(null)
    setActiveThirdActivity(null)
    setActiveGuide(null)
    setAdminSessionPreview(null)
    setActiveAdminPage(false)
    window.history.pushState({ cheongsajinView: 'dashboard' }, '', '#dashboard')
  }
  const openGuide = (guide: GuidePage) => {
    setActiveGuide(guide)
    setActiveSecondActivity(null)
    setActiveThirdActivity(null)
    setAdminSessionPreview(null)
    setActiveAdminPage(false)
    window.history.pushState({ cheongsajinView: `guide-${guide}` }, '', `#guide-${guide}`)
  }
  const openAdminPage = () => {
    if (staffRole !== 'admin') return
    setActiveSession(null)
    setActiveSecondActivity(null)
    setActiveThirdActivity(null)
    setActiveGuide(null)
    setAdminSessionPreview(null)
    setActiveAdminPage(true)
    window.history.pushState({ cheongsajinView: 'admin' }, '', '#admin')
  }
  const switchMasterView = (mode: MasterViewMode) => {
    if (!isMasterAccount) return
    setMasterViewMode(mode)
    setActiveSession(null)
    setActiveSecondActivity(null)
    setActiveThirdActivity(null)
    setActiveGuide(null)
    setAdminSessionPreview(null)
    setActiveAdminPage(false)
    window.history.pushState({ cheongsajinView: 'dashboard' }, '', '#dashboard')
  }
  const openAdminActivityRecord = (step: number) => {
    setSessionPageMode('activity')
    setActiveSession(2)
    setActiveSecondActivity(step)
    setActiveThirdActivity(null)
    setActiveGuide(null)
    setAdminSessionPreview(null)
    setActiveAdminPage(false)
    window.history.pushState({ cheongsajinView: `activity-2-step-${step}` }, '', `#activity-2-step-${step}`)
  }
  const openAdminSessionPreview = (sessionNumber: number) => {
    setSessionPageMode('activity')
    setActiveSession(sessionNumber)
    setActiveSecondActivity(null)
    setActiveThirdActivity(null)
    setActiveGuide(null)
    setAdminSessionPreview(sessionNumber)
    setActiveAdminPage(false)
    window.history.pushState({ cheongsajinView: `activity-${sessionNumber}` }, '', `#activity-${sessionNumber}`)
  }
  const toggleSessionLock = async (sessionNumber: number, target: SessionLockTarget, unlocked: boolean) => {
    if (!functions) return
    setSessionLockBusy(`${target}-${sessionNumber}`)
    setSessionLockError('')
    try {
      const updateLock = httpsCallable<{ sessionNumber: number; target: SessionLockTarget; unlocked: boolean }, { sessionNumber: number; target: SessionLockTarget; unlocked: boolean }>(functions, 'updateSessionLock')
      await updateLock({ sessionNumber, target, unlocked })
      setSessionLocks((current) => ({ ...current, [target]: { ...current[target], [sessionNumber]: unlocked } }))
    } catch (error) {
      console.error(error)
      setSessionLockError('회기 잠금 상태를 저장하지 못했어요. 마스터 로그인 상태를 확인해 주세요.')
    } finally {
      setSessionLockBusy(null)
    }
  }
  const saveProfile = async (profile: ProfilePayload) => {
    if (!db || !auth?.currentUser) throw new Error('Firebase 연결이 필요합니다.')
    if (!isMasterStudentView && (isMentorMode || isAdminMode)) {
      const session = await getDoc(doc(db, 'staffSessions', auth.currentUser.uid))
      if (!session.exists()) throw new Error('멘토 권한 세션을 찾을 수 없습니다.')
      const accountNumber = String(session.data().accountNumber)
      await setDoc(doc(db, 'mentorProfiles', accountNumber), { accountNumber, displayName: name.trim(), oneLineIntro: profile.oneLineIntro.trim(), schoolMajor: profile.schoolMajor.trim(), interests: profile.interests.trim(), majorReason: profile.majorReason.trim(), careerInterests: profile.careerInterests.trim(), campusLife: profile.campusLife.trim(), strengths: profile.strengths.trim(), message: profile.message.trim(), updatedAt: serverTimestamp() }, { merge: true })
    } else {
      await setDoc(doc(db, 'studentProfiles', auth.currentUser.uid), { userId: auth.currentUser.uid, displayName: name.trim(), school, introduction: profile.introduction.trim(), interests: profile.interests.trim(), hopeJob: profile.hopeJob.trim(), updatedAt: serverTimestamp() }, { merge: true })
    }
  }
  const markMentorQuestionRead = async (question: MentorQuestion) => {
    if (!db || question.status !== 'waiting') return
    try { await updateDoc(doc(db, 'mentorQuestions', question.id), { status: 'read', readAt: serverTimestamp() }) }
    catch (error) { console.error(error) }
  }
  const answerMentorQuestion = async (question: MentorQuestion, answer: string) => {
    if (!db) throw new Error('Firebase 연결이 필요합니다.')
    await updateDoc(doc(db, 'mentorQuestions', question.id), { answer, status: 'answered', readAt: serverTimestamp(), answeredAt: serverTimestamp() })
  }
  const accountManagementTools = <div className="admin-account-tools"><label>대상 학교<select value={studentIssueSchool} onChange={(event) => { setStudentIssueSchool(event.target.value as 'yesan-high' | 'gwangsi-middle'); setManagedStudentAccounts([]); setIssuedStudentPins([]); setStudentIssueError('') }}><option value="yesan-high">예산고등학교</option><option value="gwangsi-middle">광시중학교</option></select></label><div className="pin-admin-actions"><button type="button" onClick={loadStudentPinAccounts} disabled={isIssuingStudentPins}>계정 목록 보기</button><button type="button" onClick={issueStudentPins} disabled={isIssuingStudentPins}>{isIssuingStudentPins ? '처리 중…' : '없는 계정 발급'}</button><button type="button" onClick={resetAllStudentPins} disabled={isIssuingStudentPins}>전체 PIN 재발급</button></div>{studentIssueError && <p className="entry-error" role="alert">{studentIssueError}</p>}{issuedStudentPins.length > 0 && <ol className="issued-pin-list">{issuedStudentPins.map((credential) => <li key={`${credential.accountNumber}-${credential.pin}`}><span>{credential.accountNumber}번{credential.displayName ? ` · ${credential.displayName}` : ''}</span><b>{credential.pin}</b></li>)}</ol>}{managedStudentAccounts.length > 0 && <div className="student-pin-table"><div><b>번호</b><b>이름</b><b>현재 PIN</b><b>관리</b></div>{managedStudentAccounts.map((account) => <div key={account.id}><span>{account.accountNumber}</span><span>{account.displayName || '이름 미등록'}</span><strong>{account.currentPin || '재발급 필요'}</strong><button type="button" onClick={() => resetStudentPin(account.id)}>PIN 재발급</button></div>)}</div>}</div>

  if (!entered) return (
    <div className="welcome-page">
      <button type="button" className="access-qr-button" onClick={() => setShowAccessQr(true)} aria-haspopup="dialog">▦ 접속 QR</button>
      <main className="welcome-shell">
        <section className="welcome-copy">
        <h1 className="program-title">청·사·진 <span>- 청소년의 사기진작 진로멘토링</span></h1>
        <h2 className="welcome-title"><span>내 가능성을 발견하고,</span><span><em>미래의 청사진</em>을 그려요.</span></h2>
        <p className="welcome-description">좋아하는 것과 잘하는 것을 찾고, AI와 함께 희망 직업을 탐색해 나만의 진로 포트폴리오를 완성해요.</p>
        </section>
        <section className="entry-card">
        <div className="entry-heading"><span className="entry-icon">↗</span><div><h2>활동 시작하기</h2><p>선생님께 받은 참가 정보를 입력해 주세요.</p></div></div>
        <form onSubmit={enter}>
          <label>계정 구분<select value={school} onChange={(e) => { setSchool(e.target.value); setName(''); setPin(''); setUseTeacherLogin(false); setNeedsStudentName(false); setEntryError('') }}><option value="">계정 구분을 선택하세요</option><option value="yesan-high">예산고 학생</option><option value="gwangsi-middle">광시중 학생</option><option value="yesan-teacher">예산고 교사</option><option value="gwangsi-teacher">광시중 교사</option><option value="mentor">멘토</option><option value="admin">관리자(마스터)</option></select></label>
          {(!isPinStudentMode || needsStudentName) && !isTeacherMode && <label>{needsStudentName ? '이름 등록' : '이름'}<input value={name} onChange={(e) => { setName(e.target.value); setEntryError('') }} placeholder={needsStudentName ? '이 PIN에 등록할 이름' : '이름을 입력해 주세요'} autoComplete="name" /></label>}
          {isTeacherMode && <div className="login-mode-note"><b>{school === 'yesan-teacher' ? '예산고 교사' : '광시중 교사'}</b><span>교사 계정은 이름 입력 없이 PIN으로 로그인해요.</span></div>}
          <label>PIN 번호<input value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setNeedsStudentName(false); setEntryError('') }} placeholder={isPinStudentMode ? '6자리 학생 PIN' : '6자리 PIN 번호'} maxLength={6} inputMode="numeric" type="password" autoComplete="current-password" /></label>
          <button type="submit" disabled={isEntering || !isFirebaseConfigured}>{isEntering ? '안전하게 연결하는 중…' : needsStudentName ? '이름 등록하고 로그인' : '나의 활동실로 들어가기'} {!isEntering && <span>→</span>}</button>
          {entryError && <p className="entry-error" role="alert">{entryError}</p>}
          {isAdminMode && showMasterUnlock && <div className="master-unlock"><label>관리자 잠금 해제 코드<input value={masterCode} onChange={(event) => setMasterCode(event.target.value.replace(/\D/g, ''))} type="password" inputMode="numeric" maxLength={8} placeholder="관리자 코드" /></label><button type="button" onClick={unlockStaff} disabled={isUnlocking || !masterCode}>{isUnlocking ? '잠금 해제 중…' : '잠금 바로 해제하기'}</button></div>}
        </form>
        <p className="privacy-note">🔒 입력한 정보는 활동 참여 확인에만 사용해요.</p>
        </section>
      </main>
      <PartnerFooter />
      {showAccessQr && <AccessQrModal onClose={() => setShowAccessQr(false)} />}
    </div>
  )

  if (activeAdminPage && staffRole === 'admin') return <AdminPage displayName={name.trim()} accountTools={accountManagementTools} sessionLocks={sessionLocks} sessionLockBusy={sessionLockBusy} sessionLockError={sessionLockError} onToggleSessionLock={(sessionNumber, target, unlocked) => void toggleSessionLock(sessionNumber, target, unlocked)} onOpenPreferenceRecords={() => openAdminActivityRecord(2)} onOpenSession={openAdminSessionPreview} onBack={goDashboard} onLeave={leave} />

  if (activeGuide) {
    const ownMentorProfile = mentorProfiles.find((profile) => profile.displayName === name.trim())
    return <div className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{viewSchoolName}</span><b>{viewDisplayName}</b><button className="logout-button" onClick={leave}>로그아웃</button></div></header>
      {masterViewLabel && <MasterViewBanner label={masterViewLabel} />}
      <main className="guide-detail-page">
        <button className="back-button" type="button" onClick={() => window.history.back()}>← 나의 활동실로</button>
        {activeGuide === 'program' && <><section className="guide-detail-hero blue"><span>🗺️</span><div><small>프로그램 안내</small><h1>청사진이란?</h1><p>청소년의 가능성을 발견하고 미래의 모습을 구체적으로 그려 가는 진로 멘토링 여정이에요.</p></div></section><section className="guide-content-card"><h2>청·사·진의 의미</h2><p><b>청소년의 사기진작 진로멘토링</b>의 줄임말로, 내가 좋아하는 것과 잘하는 것을 찾고 다양한 직업과 진로를 탐색하는 프로그램이에요.</p><div className="program-journey"><article><b>1</b><h3>서로 만나기</h3><p>멘토와 인사하고 진로와 직업의 의미를 알아봐요.</p></article><article><b>2</b><h3>나를 발견하기</h3><p>선호와 강점을 탐색하고 직업과 역량의 관계를 살펴봐요.</p></article><article><b>3</b><h3>진로 역량 갖추기</h3><p>관심 직업의 실제 업무를 비교하고 AI 채용면접을 경험해요.</p></article><article><b>4</b><h3>직업 탐색</h3><p>전문강사와 함께 다양한 진로와 직업 관점을 넓혀요.</p></article><article><b>5</b><h3>나만의 청사진</h3><p>Notion 미래 포트폴리오로 나의 미래를 정리해요.</p></article></div></section></>}
        {activeGuide === 'profile' && <>{isMasterStudentView || (!isMentorMode && !isAdminMode) ? <><section className="guide-detail-hero green"><span>📚</span><div><small>나의 정보와 활동</small><h1>나의 기록</h1><p>프로필을 작성하고 1회기부터 5회기까지 나의 활동 결과를 모아 봐요.</p></div></section><section className="guide-content-card"><div className="student-profile-heading"><small>나의 정보</small><h2>프로필 작성</h2><p>나를 소개하고 관심 분야와 희망 진로를 기록해요.</p></div><ProfileEditor kind="student" displayName={viewDisplayName} schoolName={viewSchoolName} onSave={saveProfile} /></section><StudentActivityRecords /></> : <><section className="guide-detail-hero green"><span>👤</span><div><small>멘토 정보</small><h1>멘토 프로필 작성</h1><p>작성한 내용은 멘토 소개 화면에 표시돼요.</p></div></section><section className="guide-content-card"><ProfileEditor kind="mentor" displayName={viewDisplayName} schoolName={viewSchoolName} existing={ownMentorProfile} onSave={saveProfile} /></section></>}</>}
        {activeGuide === 'questions' && isMentorView && <MentorQuestionPage questions={mentorQuestions} isAdmin={staffRole === 'admin'} onRead={(question) => void markMentorQuestionRead(question)} onAnswer={answerMentorQuestion} />}
        {activeGuide === 'mentors' && <><section className="guide-detail-hero orange mentor-guide-hero"><span>🤝</span><div><small>함께하는 사람</small><h1>멘토 소개</h1><p>청·사·진의 여정을 함께할 멘토들의 전공과 진로 이야기를 만나 보세요.</p></div>{(!isStaffAccount || isMasterStudentView) && <button type="button" className="mentor-question-open" onClick={() => setShowMentorQuestion((current) => !current)}>💬 멘토에게 질문하기</button>}</section>{showMentorQuestion && (!isStaffAccount || isMasterStudentView) && <MentorQuestionPanel profiles={visibleMentorProfiles} studentName={viewDisplayName} schoolName={viewSchoolName} onClose={() => setShowMentorQuestion(false)} />}<section className="guide-content-card"><div className="mentor-page-heading"><div><h2>우리의 멘토</h2><p>멘토가 프로필을 저장하면 이곳에 바로 표시돼요.</p></div>{!isMasterStudentView && (isMentorMode || isAdminMode) && <button type="button" onClick={() => openGuide('profile')}>내 멘토 프로필 작성 →</button>}</div>{visibleMentorProfiles.length ? <div className="mentor-profile-grid">{visibleMentorProfiles.map((profile) => { const schoolMajor = profile.schoolMajor || [profile.university, profile.major].filter(Boolean).join(' / '); const message = profile.message || profile.introduction; return <article key={profile.id}><small>{schoolMajor || '학교와 전공을 준비 중이에요'}</small><h2>{profile.displayName} 멘토</h2><p className="mentor-one-line">{profile.oneLineIntro || '한 줄 소개를 준비하고 있어요.'}</p><dl className="mentor-profile-details">{profile.interests && <><dt>관심 분야</dt><dd>{profile.interests}</dd></>}{profile.majorReason && <><dt>전공 선택 이유</dt><dd>{profile.majorReason}</dd></>}{profile.careerInterests && <><dt>관심 진로·직업</dt><dd>{profile.careerInterests}</dd></>}{profile.campusLife && <><dt>대학생활</dt><dd>{profile.campusLife}</dd></>}{profile.strengths && <><dt>나의 강점</dt><dd>{profile.strengths}</dd></>}{!profile.campusLife && profile.careerStory && <><dt>나의 진로 이야기</dt><dd>{profile.careerStory}</dd></>}{message && <><dt>전하고 싶은 말</dt><dd>{message}</dd></>}</dl></article> })}</div> : <div className="empty-mentor-list"><span>🤝</span><h2>멘토 소개를 준비하고 있어요</h2><p>멘토가 프로필을 작성하면 이곳에서 확인할 수 있어요.</p></div>}</section></>}
        {activeGuide === 'center' && <><section className="guide-detail-hero purple"><span>🏫</span><div><small>운영기관 안내</small><h1>예산군청소년수련관 소개</h1><p>청소년의 꿈과 끼를 펼치고, 청소년이 직접 활동을 기획하며 함께 성장하는 열린 공간이에요.</p></div></section><section className="guide-content-card center-intro"><div><span className="center-opened">2013년 12월 개관</span><h2>예산군 최초의 청소년 전용 공간</h2><p>예산군청소년수련관은 미래를 이끌어 갈 청소년을 위해 다양한 활동과 쾌적한 이용 공간을 제공하고 있어요. 청소년의 작은 목소리에도 귀 기울이며, 청소년이 함께 운영하고 기획하는 활동과 복지를 지원합니다.</p></div><div className="center-values"><article><span>🎨</span><h3>청소년활동</h3><p>연간 프로그램과 특별 프로그램, 청소년수련활동인증제 등 다양한 경험을 만나요.</p></article><article><span>🙋</span><h3>청소년참여</h3><p>청소년운영위원회, 참여위원회, 어울림마당기획단과 동아리에서 직접 목소리를 내요.</p></article><article><span>🌱</span><h3>꿈과 성장</h3><p>문화·진로·체험과 건전한 여가활동을 통해 나의 가능성과 꿈을 키워요.</p></article></div><div className="center-info"><div><b>운영시간</b><span>화~금 09:00~21:00<br />토·일 09:00~18:00</span></div><div><b>휴관일</b><span>월요일 및 공휴일</span></div><div><b>문의</b><a href="tel:041-331-8228">041-331-8228</a></div></div><div className="center-links"><a href="http://www.yesanyouth.or.kr/main_sub/sub.php?folder_idx=2&folder_page_idx=69" target="_blank" rel="noreferrer">수련관 홈페이지 ↗</a><a href="http://www.yesanyouth.or.kr/edu/edu_list.php?folder_idx=2&folder_page_idx=40" target="_blank" rel="noreferrer">프로그램 접수 ↗</a></div><div className="center-contact"><b>청·사·진 운영</b><span>예산군청소년수련관</span></div></section></>}
      </main>
      <PartnerFooter />
    </div>
  }

  if (activeSession === 3 && sessionPageMode === 'activity' && activeThirdActivity && (canPreviewFutureSessions || activeSessionLocks[3] === true)) {
    return <ThirdActivityDetail step={activeThirdActivity} schoolName={viewSchoolName} studentName={viewDisplayName} masterViewLabel={masterViewLabel} onLeave={leave} />
  }

  if (activeSession === 3 && sessionPageMode === 'activity' && (canPreviewFutureSessions || activeSessionLocks[3] === true)) {
    const sessionDate = viewSchool === 'yesan-high' ? '추후 안내' : '추후 안내'
    const sessionPlace = viewSchool === 'yesan-high' ? '예산고등학교 지정교실' : viewSchool === 'gwangsi-middle' ? '광시중학교 1층 도서관' : '학교별 활동 장소'

    return (
      <div className="app-shell">
        <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{viewSchoolName}</span><b>{viewDisplayName}</b><button className="logout-button" onClick={leave}>로그아웃</button></div></header>
        {masterViewLabel && <MasterViewBanner label={masterViewLabel} />}
        <main className="session-review">
          <button className="back-button" type="button" onClick={() => window.history.back()}>← 나의 활동실로</button>
          <section className="review-hero third-session-hero">
            <div>
              <span className="activity-badge">3회기 · 진로 역량 갖추기</span>
              <p className="eyebrow">{viewSchoolName}</p>
              <h1>관심 직업과 AI 채용면접</h1>
              <p>내 경험 속 역량을 관심 직업과 연결하고, 실제 지원자처럼 AI 면접을 경험해요.</p>
            </div>
            <div className="review-icon" aria-hidden="true">🎤</div>
          </section>
          <section className="session-info" aria-label="활동 정보">
            <div><small>참여 학교</small><b>{viewSchoolName}</b></div>
            <div><small>활동 일자</small><b>{sessionDate}</b></div>
            <div><small>활동 장소</small><b>{sessionPlace}</b></div>
            <div><small>활동 시간</small><b>총 100분</b></div>
          </section>
          <section className="review-section">
            <div className="review-section-heading"><div><p className="eyebrow">3회기 활동</p><h2>활동 내용이 여기에 들어가요</h2></div><span>4개 활동 · 진로 역량</span></div>
            <div className="placeholder-grid">
              <button type="button" className="placeholder-card" onClick={() => openThirdActivity(1)}><span>1</span><div><h3>활동 안내</h3><p>3회기의 목적과 진행 방법을 먼저 확인해요.</p></div><b>열기 →</b></button>
              <button type="button" className="placeholder-card featured" onClick={() => openThirdActivity(2)}><span>2</span><div><h3>핵심 역량 브레인스토밍</h3><strong>이 직업, 무슨 일을 할까?</strong><p>관심 직업의 업무와 필요한 역량을 먼저 예상해요.</p></div><b>활동 시작 →</b></button>
              <button type="button" className="placeholder-card featured" onClick={() => openThirdActivity(3)}><span>3</span><div><h3>AI 가상면접</h3><strong>희망 직업 채용면접</strong><p>회사를 고르고 AI 면접관과 채팅형 면접을 진행해요.</p></div><b>면접 시작 →</b></button>
              <button type="button" className="placeholder-card" onClick={() => openThirdActivity(4)}><span>4</span><div><h3>활동 마무리</h3><p>면접에서 발견한 강점과 다음 준비를 정리해요.</p></div><b>열기 →</b></button>
            </div>
          </section>
          <section className="empty-activity-note"><div aria-hidden="true">💡</div><h2>관심 직업을 내 경험과 연결해요</h2><p>카드를 눌러 활동을 순서대로 진행하세요. AI 가상면접 기록은 활동 기록으로 저장돼요.</p></section>
        </main>
        <PartnerFooter />
      </div>
    )
  }

  if (activeSession && activeSession >= 3 && activeSession <= 5 && sessionPageMode === 'activity' && (canPreviewFutureSessions || activeSessionLocks[activeSession] === true)) {
    return <StaffSessionDetail sessionNumber={activeSession} schoolName={viewSchoolName} displayName={viewDisplayName} masterViewLabel={masterViewLabel} onLeave={leave} />
  }

  if (activeSession === 1 && sessionPageMode === 'activity') {
    return (
      <div className="app-shell">
        <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{viewSchoolName}</span><b>{viewDisplayName}</b><button className="logout-button" onClick={leave}>로그아웃</button></div></header>
        {masterViewLabel && <MasterViewBanner label={masterViewLabel} />}
        <main className="session-review">
          <button className="back-button" type="button" onClick={() => window.history.back()}>← 나의 활동실로</button>
          <section className="review-hero activity-hero">
            <div>
              <span className="activity-badge">지금 할 활동 · 1회기</span>
              <p className="eyebrow">{viewSchoolName}</p>
              <h1>청사진을 위한 첫 만남</h1>
              <p>멘토와 인사하고 서로의 관심사와 경험을 나누며 진로 탐색의 첫걸음을 시작해요.</p>
            </div>
            <div className="review-icon" aria-hidden="true">👋</div>
          </section>
          <section className="session-info" aria-label="활동 정보">
            <div><small>참여 학교</small><b>{viewSchoolName}</b></div>
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
    const normalizedName = name.trim().replaceAll(' ', '')
    const viewerMode = isMasterStudentView ? 'student' : isAdminMode ? 'all' : isMentorMode ? 'mentor' : isTeacherMode || normalizedName === '예산고' || normalizedName === '광시중' ? 'school' : 'student'
    return <SecondActivityDetail step={activeSecondActivity} schoolName={viewSchoolName} studentName={viewDisplayName} viewerMode={viewerMode} masterViewLabel={masterViewLabel} onLeave={leave} onHome={goDashboard} />
  }

  if (activeSession === 2 && sessionPageMode === 'activity') {
    const sessionDate = viewSchool === 'yesan-high' ? '2026. 9. 4.(금)' : '2026. 9. 8.(화)'
    const sessionPlace = viewSchool === 'yesan-high' ? '예산고등학교 지정교실' : '광시중학교 1층 도서관'

    return (
      <div className="app-shell">
        <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{viewSchoolName}</span><b>{viewDisplayName}</b><button className="logout-button" onClick={leave}>로그아웃</button></div></header>
        {masterViewLabel && <MasterViewBanner label={masterViewLabel} />}
        <main className="session-review">
          <button className="back-button" type="button" onClick={() => window.history.back()}>← 나의 활동실로</button>
          <section className="review-hero second-session-hero">
            <div>
              <span className="activity-badge">2회기 · 활동 준비 중</span>
              <p className="eyebrow">{viewSchoolName}</p>
              <h1>선호와 강점 탐색</h1>
              <p>좋아하는 것과 싫어하는 것을 살펴보고, 나만의 강점을 발견하는 활동이에요.</p>
            </div>
            <div className="review-icon" aria-hidden="true">✨</div>
          </section>
          <section className="session-info" aria-label="활동 정보">
            <div><small>참여 학교</small><b>{viewSchoolName}</b></div>
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
    const sessionDate = viewSchool === 'yesan-high' ? '2026. 8. 28.(금)' : '2026. 9. 1.(화)'
    const sessionPlace = viewSchool === 'yesan-high' ? '예산고등학교 지정교실' : '광시중학교 1층 도서관'

    return (
      <div className="app-shell">
        <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip"><span>{viewSchoolName}</span><b>{viewDisplayName}</b><button className="logout-button" onClick={leave}>로그아웃</button></div></header>
        {masterViewLabel && <MasterViewBanner label={masterViewLabel} />}
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
            <div><small>참여 학교</small><b>{viewSchoolName}</b></div>
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
      <header className="topbar"><div className="brand"><span className="brand-mark">청</span><span>청·사·진</span></div><div className="student-chip">{staffRole === 'admin' && <div className="master-view-switch"><button className={masterViewMode === 'mentor' ? 'active' : ''} type="button" onClick={() => switchMasterView('mentor')}>멘토 화면으로 보기</button><button className={masterViewMode === 'yesan-high' ? 'active' : ''} type="button" onClick={() => switchMasterView('yesan-high')}>예산고</button><button className={masterViewMode === 'gwangsi-middle' ? 'active' : ''} type="button" onClick={() => switchMasterView('gwangsi-middle')}>광시중</button></div>}{staffRole === 'admin' && <button className="admin-entry-button" type="button" onClick={openAdminPage}>관리자 페이지 들어가기</button>}<span>{staffRole === 'admin' ? '관리자(마스터)' : schoolName}</span><b>{name.trim()}</b><button className="logout-button" onClick={leave}>로그아웃</button></div></header>
      {masterViewLabel && <MasterViewBanner label={masterViewLabel} />}
      <main className="dashboard">
        <section className={`dashboard-intro ${isMentorView ? 'has-question-action' : ''}`}>
          <div><p className="eyebrow">나의 활동실</p><h1>안녕, <em>{viewDisplayName}</em>!</h1><p>오늘도 나만의 가능성을 하나씩 발견해 볼까요?</p></div>
          {isMentorView && <button type="button" className="mentor-inbox-button" onClick={() => openGuide('questions')}><span>💬</span><div><small>학생 질문</small><b>질문 확인하기</b></div>{mentorQuestions.filter((item) => item.status === 'waiting').length > 0 && <em>{mentorQuestions.filter((item) => item.status === 'waiting').length}</em>}</button>}
          <div className="progress-card"><div className="progress-label"><span>나의 여정</span><b>{progress}%</b></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>5개 활동 중 {completedSessionCount}개 완료</small></div>
        </section>
        <section className="dashboard-guide" aria-label="청사진 안내 메뉴">
          <button type="button" onClick={() => openGuide('program')}><span className="guide-icon blue">🗺️</span><div><small>프로그램 안내</small><h2>청사진이란?</h2><p>청·사·진의 의미와 전체 활동 여정을 알아봐요.</p></div><b>→</b></button>
          <button type="button" onClick={() => openGuide('profile')}><span className="guide-icon green">{isMasterStudentView || (!isMentorMode && !isAdminMode) ? '📚' : '👤'}</span><div><small>{isMasterStudentView || (!isMentorMode && !isAdminMode) ? '나의 정보와 활동' : '멘토 정보'}</small><h2>{isMasterStudentView || (!isMentorMode && !isAdminMode) ? '나의 기록' : '멘토 프로필 작성'}</h2><p>{isMasterStudentView || (!isMentorMode && !isAdminMode) ? '프로필과 1~5회기 활동 결과를 한곳에서 확인해요.' : '멘토 소개 화면에 표시할 내 정보를 작성해요.'}</p></div><b>→</b></button>
          <button type="button" onClick={() => openGuide('mentors')}><span className="guide-icon orange">🤝</span><div><small>함께하는 사람</small><h2>멘토 소개</h2><p>이번 여정을 함께할 대학생 멘토를 만나봐요.</p></div><b>→</b></button>
          <button type="button" onClick={() => openGuide('center')}><span className="guide-icon purple">🏫</span><div><small>운영기관 안내</small><h2>예산군청소년수련관 소개</h2><p>청소년의 성장과 활동을 지원하는 공간을 알아봐요.</p></div><b>→</b></button>
        </section>
        <section>
          <div className="section-title"><div><p className="eyebrow">전체 여정</p><h2>회기별 활동</h2></div><span>활동은 순서대로 열려요</span></div>
          <div className="session-grid">{sessions.map((session) => (
            <article className={`session-card ${session.status}`} key={session.number}>
              <div className="session-top"><span className="small-icon">{session.icon}</span><span className="status">{session.status === 'done' ? '완료' : session.status === 'open' ? '진행 중' : '잠김'}</span></div>
              <small>{session.number}회기</small><h3>{session.title}</h3><p>{session.subtitle}</p>
              {session.status === 'done' ? <button type="button" className="card-action" onClick={() => openSession(session.number, 'review')}>활동 다시 보기 <span>→</span></button> : session.status === 'open' ? <button type="button" className="card-action" onClick={() => openSession(session.number, 'activity')}>활동하기 <span>→</span></button> : <div className="card-action">마스터가 잠금 해제하면 열려요 <span>🔒</span></div>}
            </article>
          ))}</div>
        </section>
      </main>
      <PartnerFooter />
    </div>
  )
}
export default App
