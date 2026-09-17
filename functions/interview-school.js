// School-specific language only: scoring, topic selection and completion remain in index.js.
export const getInterviewSchool = (schoolName = '') => schoolName === '광시중학교'
  ? { isMiddle: true, version: 'gwangsi-middle', defaultDifficulty: 'veryEasy' }
  : { isMiddle: false, version: 'yesan-high', defaultDifficulty: 'easy' }

export const getMiddleSchoolGuide = (mode = 'interview') => `광시중학교 중학생용 추가 지침입니다. 앞의 공통 지침과 표현 수준이 충돌하면 이 지침을 우선하세요.
질문 영역과 순서, 평가 기준, 종료 조건은 공통 지침을 그대로 따르세요.
모든 난이도에서 질문은 한 번에 한 가지만 짧게 물으세요. 전문 지식, 경력, 전문 프로젝트, 복잡한 계획을 요구하지 마세요.
학교 수업, 친구, 동아리, 가정처럼 익숙한 상황을 사용하세요. 경험이 없어도 생각으로 답할 수 있어야 합니다.
질문·힌트·피드백·종료 요약·추천 강점은 중학생이 이해할 수 있는 쉬운 한국어로 작성하세요.
어려운 용어는 쉬운 말로 바꾸거나 바로 뜻을 설명하세요. 직무는 맡은 일, 역량은 일을 해낼 수 있는 힘, 협업은 함께하기, 의사소통은 서로 듣고 말하기로 표현하세요.
지원 동기는 그 일을 해 보고 싶은 이유, 상황 판단은 무슨 일이 생겼을 때 어떻게 할지 생각하기로 풀어 쓰세요.
성장 계획은 학교나 집에서 해 볼 수 있는 작은 일 하나만 물으세요. 복잡한 실천 계획이나 전문 지식을 요구하지 마세요.
피드백은 잘한 점이나 더 해 볼 점 하나를 짧게 말하세요. 보류는 답변을 조금 더 보완해 보자는 연습 결과라는 뜻을 설명하세요.
${mode === 'hint' ? '힌트도 한 번에 작은 단계 하나씩 안내하세요. 답안을 대신 써 주지 말고, 학교나 집에서 떠올릴 수 있는 생각을 짚어 주세요.' : '질문에 여러 요구를 묶거나 이유와 방법을 동시에 묻지 마세요. 회사와 희망 직업에 지원하는 면접 연습이라는 맥락은 유지하세요.'}`

export const adaptMiddleFallback = ({ schoolName, base, mode, company, role, turns = [], finished, nextTopic }) => {
  if (!getInterviewSchool(schoolName).isMiddle) return base
  if (mode === 'hint') return {
    ...base,
    hint: '질문에서 묻는 한 가지를 골라 내 생각을 말해 보세요.',
    hintIntent: '이 질문은 내가 어떤 생각을 하는지 알아보려는 거예요.',
    hintGuide: '먼저 질문에서 묻는 말을 찾아보세요. 학교나 집에서 떠오르는 생각 하나를 골라 짧게 말해 보세요. 해 본 일이 없어도 괜찮아요.',
  }
  const strengths = ['서로 듣고 말하기', '맡은 일 끝까지 하기', '함께 힘 모으기']
  if (finished) return {
    ...base,
    feedback: base.decision === 'retry' ? '질문에서 묻는 것에 맞춰 내 생각을 한 문장 더 말해 보세요.' : '내 생각을 말했어요. 다음에는 왜 그렇게 생각하는지 덧붙여 보세요.',
    closingSummary: base.decision === 'pass'
      ? `${company}의 ${role} 면접 연습에서 합격했어요. 관심과 내 생각을 잘 전했어요.`
      : base.decision === 'hold'
        ? `${company}의 ${role} 면접 연습 결과는 보류예요. 답변을 조금 더 보완해 보자는 뜻이에요. 내 생각의 이유를 한 문장 더 말해 보세요.`
        : `${company}의 ${role} 면접 연습은 다시 해 보면 좋아요. 질문을 읽고 내 생각을 짧게 말하는 것부터 시작해 보세요.`,
    suggestedStrengths: strengths,
  }
  const questions = {
    motivation: `${role} 일을 해 보고 싶은 이유는 무엇인가요?`,
    jobUnderstanding: nextTopic?.isFollowUp ? `${role}가 하는 일 중 가장 중요하다고 생각하는 일은 무엇인가요?` : `${role}는 어떤 일을 하는 사람인가요?`,
    strength: nextTopic?.isFollowUp ? `그 잘하는 점을 ${role} 일에 어떻게 써 보고 싶나요?` : '내가 잘하는 점 한 가지는 무엇인가요?',
    situationalJudgment: nextTopic?.isFollowUp ? '그 행동을 먼저 하려는 이유는 무엇인가요?' : '학교에서 함께 할 일이 잘 풀리지 않으면 먼저 무엇을 해 볼까요?',
    collaboration: nextTopic?.isFollowUp ? '친구와 생각이 계속 다르면 어떻게 해 볼까요?' : '친구와 함께 일할 때 친구의 생각을 어떻게 들어 볼까요?',
    growthPlan: `${role} 일을 알아보려고 학교나 집에서 해 볼 작은 일은 무엇인가요?`,
    closing: '마지막으로 면접관에게 하고 싶은 말은 무엇인가요?',
  }
  return {
    ...base,
    question: questions[nextTopic?.topic] ?? questions.closing,
    feedback: turns.length ? base.feedbackTone === 'bad' ? '질문에서 묻는 것에 맞춰 내 생각을 짧게 말해 보세요.' : '내 생각을 말했어요. 왜 그렇게 생각하는지 덧붙이면 더 잘 전할 수 있어요.' : '',
    suggestedStrengths: strengths.slice(0, base.suggestedStrengths.length),
  }
}
