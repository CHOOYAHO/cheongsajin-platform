export const strengthDictionary = [
  '문제해결능력', '논리적 사고', '창의성', '판단력', '분석력', '관찰력',
  '의사소통능력', '공감능력', '협업능력', '설득력', '갈등조정능력', '친화력',
  '책임감', '실행력', '계획성', '꼼꼼함', '집중력', '끈기',
  '리더십', '도전정신', '자기주도성', '적응력',
  '수리능력', '언어능력', '정보활용능력', '디지털 활용능력',
  '신체능력', '손재주', '공간지각능력', '위기대처능력',
] as const

export type StrengthName = typeof strengthDictionary[number]
export type Importance = 'core' | 'related' | 'lower'
export type JobStrengthProfile = Record<Importance, StrengthName[]>

// 중요도는 직업 적합도에만 쓰며, 출품 횟수나 참가자의 카드 등급과 연결하지 않는다.
export const jobStrengthProfiles: Record<string, JobStrengthProfile> = {
  '의사': {
    core: ['판단력', '분석력', '관찰력', '책임감'],
    related: ['의사소통능력', '공감능력', '문제해결능력', '집중력'],
    lower: ['리더십', '적응력', '정보활용능력'],
  },
  '소방관': {
    core: ['위기대처능력', '판단력', '신체능력', '협업능력'],
    related: ['책임감', '공간지각능력', '문제해결능력', '집중력'],
    lower: ['의사소통능력', '적응력', '손재주'],
  },
  '교사': {
    core: ['의사소통능력', '공감능력', '책임감', '갈등조정능력'],
    related: ['계획성', '관찰력', '리더십', '언어능력'],
    lower: ['창의성', '적응력', '정보활용능력'],
  },
  '경찰관': {
    core: ['판단력', '위기대처능력', '책임감', '관찰력'],
    related: ['의사소통능력', '갈등조정능력', '신체능력', '협업능력'],
    lower: ['분석력', '적응력', '설득력'],
  },
  '유튜브 크리에이터': {
    core: ['창의성', '의사소통능력', '디지털 활용능력', '자기주도성'],
    related: ['실행력', '계획성', '언어능력', '정보활용능력'],
    lower: ['분석력', '적응력', '끈기'],
  },
  '게임 개발자': {
    core: ['문제해결능력', '논리적 사고', '창의성', '디지털 활용능력'],
    related: ['협업능력', '집중력', '분석력', '끈기'],
    lower: ['의사소통능력', '계획성', '적응력'],
  },
  '요리사': {
    core: ['손재주', '꼼꼼함', '집중력', '위기대처능력'],
    related: ['계획성', '창의성', '협업능력', '신체능력'],
    lower: ['관찰력', '적응력', '실행력'],
  },
  '간호사': {
    core: ['관찰력', '책임감', '공감능력', '위기대처능력'],
    related: ['의사소통능력', '협업능력', '꼼꼼함', '판단력'],
    lower: ['적응력', '집중력', '갈등조정능력'],
  },
}

export const auctionJobs = Object.keys(jobStrengthProfiles)

export function createAuctionDeck(job: string, itemCount: number) {
  const profile = jobStrengthProfiles[job] ?? jobStrengthProfiles['소방관']
  const candidates = [...profile.core, ...profile.related, ...profile.lower]
  const deck = Array.from({ length: itemCount }, (_, index) => candidates[index % candidates.length])
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]]
  }
  return deck
}
