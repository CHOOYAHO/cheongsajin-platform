import test from 'node:test'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getInterviewSchool, getMiddleSchoolGuide, adaptMiddleFallback } from './interview-school.js'

test('school defaults and stored versions match only Gwangsi', () => {
  assert.deepEqual(getInterviewSchool('광시중학교'), { isMiddle: true, version: 'gwangsi-middle', defaultDifficulty: 'veryEasy' })
  for (const school of ['예산고등학교', '멘토', '', undefined]) {
    assert.deepEqual(getInterviewSchool(school), { isMiddle: false, version: 'yesan-high', defaultDifficulty: 'easy' })
  }
})

test('Yesan fallback is preserved verbatim in interview and hint modes', () => {
  const base = { question: '기존 질문', hint: '기존 힌트', decision: 'retry', score: 0 }
  for (const mode of ['hint', 'interview']) {
    assert.equal(adaptMiddleFallback({ schoolName: '예산고등학교', base, mode }), base)
  }
})

test('middle fallback covers every topic and follow-up with one short question', () => {
  const base = { questionTopic: 'strength', feedbackTone: 'good', score: 0, decision: 'hold', suggestedStrengths: ['a', 'b'], aiSource: 'fallback' }
  for (const topic of ['motivation', 'jobUnderstanding', 'strength', 'situationalJudgment', 'collaboration', 'growthPlan', 'closing']) {
    for (const isFollowUp of [false, true]) {
      const result = adaptMiddleFallback({ schoolName: '광시중학교', base, role: '디자이너', company: '연습회사', turns: [{ answer: '내 생각' }], nextTopic: { topic, isFollowUp } })
      assert.equal((result.question.match(/\?/g) || []).length, 1)
      assert.ok(result.question.length < 90)
      assert.doesNotMatch(result.question, /경력|프로젝트|전문 지식|실천 계획/)
      for (const key of ['score', 'decision', 'feedbackTone', 'aiSource', 'questionTopic']) assert.equal(result[key], base[key])
    }
  }
})

test('middle hint and completion simplify words without changing any score or decision', () => {
  const base = { question: '지금 질문', score: 0, decision: 'retry', suggestedStrengths: [] }
  const hint = adaptMiddleFallback({ schoolName: '광시중학교', base, mode: 'hint' })
  assert.equal(hint.question, base.question)
  assert.match(hint.hintGuide, /학교나 집/)
  for (const decision of ['pass', 'hold', 'retry']) {
    const result = adaptMiddleFallback({ schoolName: '광시중학교', base: { ...base, decision }, finished: true, role: '디자이너', company: '연습회사' })
    assert.equal(result.score, 0)
    assert.equal(result.decision, decision)
    if (decision === 'hold') assert.match(result.closingSummary, /보완해 보자는 뜻/)
  }
  assert.match(getMiddleSchoolGuide('hint'), /한 번에 한 가지만/)
  assert.match(getMiddleSchoolGuide(), /전문 지식, 경력, 전문 프로젝트, 복잡한 계획을 요구하지/)
})

test('original Yesan prompts, scoring and question flow remain unchanged', () => {
  const before = readFileSync(new URL('../backups/interview-school-before-split-02d4e77.js.txt', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  const after = readFileSync(new URL('./index.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  const section = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
  for (const [start, end] of [
    ['const getDifficultyGuide', 'const sanitizeInterviewTurns'],
    ['const interviewQuestionFlow', 'const callInterviewAi'],
    ['const prompt =', "const response = await fetch"],
  ]) {
    const current = section(after, start, end).replace(/  try \{\n\s*$/, '  ')
    assert.equal(current, section(before, start, end))
  }
})


test('callable AI path branches on missing key, HTTP failure and thrown network errors', async () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
  const core = source.slice(source.indexOf('const parseInterviewJson'), source.indexOf('export const runAiInterviewStep'))
  for (const schoolName of ['광시중학교', '예산고등학교']) {
    for (const failure of ['missing-key', 'http-error', 'network-error']) {
      const context = vm.createContext({
        getInterviewSchool, getMiddleSchoolGuide, adaptMiddleFallback,
        sanitizeText: (value, max = 800) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max),
        openaiApiKey: { value: () => failure === 'missing-key' ? '' : 'unit-test-placeholder' },
        fetch: async () => { if (failure === 'network-error') throw new Error('simulated outage'); return { ok: false } },
      })
      vm.runInContext(core + '\nthis.run = callInterviewAi; this.application = sanitizeInterviewApplication;', context)
      const application = context.application({ role: '디자이너' }, schoolName)
      assert.equal(application.difficulty, schoolName === '광시중학교' ? 'veryEasy' : 'easy')
      const args = { schoolName, company: '연습회사', role: '디자이너', application, turns: [], finished: false, nextTopic: { topic: 'motivation' } }
      const question = await context.run(args)
      assert.equal(question.aiSource, 'fallback')
      assert.equal(question.question, schoolName === '광시중학교' ? '디자이너 일을 해 보고 싶은 이유는 무엇인가요?' : '연습회사의 디자이너에 지원한 이유를 말씀해 주세요.')
      const hint = await context.run({ ...args, mode: 'hint', currentQuestion: question.question })
      assert.equal(hint.aiSource, 'fallback')
      assert.ok(hint.hintIntent && hint.hintGuide)
      const finished = await context.run({ ...args, finished: true, turns: [{ question: question.question, answer: '야', topic: 'motivation' }] })
      assert.equal(finished.score, 0)
      assert.equal(finished.decision, 'retry')
    }
  }
})


test('actual mentor component hides unfinished verdicts and displays completed zero scores and full details', async () => {
  const { default: ts } = await import('typescript')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const jsx = await import('react/jsx-runtime')
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const component = source.slice(source.indexOf('function MentorInterviewResult('), source.indexOf('function MentorThirdResultsPage('))
  const compiled = ts.transpileModule('export ' + component, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const context = vm.createContext({ exports: {}, require: () => jsx, interviewDifficultyLabels: { easy: '쉬움' } })
  vm.runInContext(compiled, context)
  const record = { id: 'test', status: 'inProgress', decision: 'pass', score: 99, lastQuestion: '현재 질문 확인', application: { role: '디자이너', difficulty: 'easy', interestReason: '지원 이유 확인', strengths: '강점 확인', experience: '준비 확인', closingLine: '마지막 말 확인' }, turns: [{ question: '질문 확인', answer: '답변 확인', feedback: '피드백 확인', answerScore: 0 }], closingSummary: '완료 요약 확인', suggestedStrengths: ['추천 강점 확인'] }
  const render = (data) => renderToStaticMarkup(createElement(context.exports.MentorInterviewResult, { record: data }))
  const ongoing = render(record)
  assert.match(ongoing, /진행 중/)
  assert.doesNotMatch(ongoing, /합격|99점|완료 요약 확인/)
  for (const content of ['현재 질문 확인', '지원 이유 확인', '강점 확인', '준비 확인', '마지막 말 확인', '질문 확인', '답변 확인', '피드백 확인', '답변 0점', '추천 강점 확인']) assert.ok(ongoing.includes(content), content)
  const completed = render({ ...record, status: 'completed', decision: 'retry', score: 0 })
  assert.match(completed, /재도전/)
  assert.match(completed, /<p>0점<\/p>/)
  assert.match(completed, /완료 요약 확인/)
  assert.doesNotMatch(completed, /현재 질문 확인/)
})
