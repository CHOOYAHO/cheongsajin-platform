# 청·사·진 플랫폼 다음 Codex 인수인계

작성일: 2026-09-02

## 가장 중요한 현재 상태

- 작업 저장소: `https://github.com/CHOOYAHO/cheongsajin-platform`
- 기준 브랜치: `main`
- 원격 `origin/main` 최신 커밋: `f0b1c9e Unlock session two for staff`
- 핵심 구현 로컬 커밋: `e507b9e Synchronize strength auction gameplay`
- 인수인계 문서 커밋까지 포함해 로컬 `main`은 `origin/main`보다 2커밋 앞서 있음
- 현재 환경에 GitHub 인증이 없어 `git push origin main`이 실패함
- 현재 환경에 Firebase CLI·인증 권한이 없어 Functions와 Firestore 규칙을 배포하지 못함
- 따라서 이번 구현은 **코드와 로컬 커밋까지 완료됐지만 원격 저장소와 Firebase에는 반영되지 않은 상태**임

새 환경에서 저장소만 새로 clone하면 로컬 커밋들이 보이지 않는다. 함께 전달된 `cheongsajin-sync.patch`를 적용하거나, 이 작업공간이 유지된다면 기존 로컬 저장소에서 바로 push해야 한다.

## 이번에 완료한 변경

### 1. 멘토 프로필 한 줄 소개

- 멘토 프로필 작성 페이지의 첫 번째 항목으로 `한 줄 소개` 추가
- 기존 7개 항목은 2~8번으로 유지
- Firestore `mentorProfiles` 문서에 `oneLineIntro` 저장
- 기존 프로필에 필드가 없어도 오류 없이 빈 값으로 표시
- 멘토 소개 페이지에서 멘토 이름 아래 대표 문장으로 표시
- 기존의 `청소년들에게 해주고 싶은 말`은 상세 항목의 `전하고 싶은 말`로 표시

### 2. 강점 경매장 다중기기 동기화

클라이언트별 로컬 상태로 진행되던 경매를 Firestore 방 상태와 Cloud Functions를 기준으로 동기화하도록 변경함.

동기화 대상:

- 게임 시작과 15초 직업 투표
- 참가자별 직업 투표 저장과 최다 득표 집계
- 선택 직업과 출품 덱
- 현재 상품·현재가·최고 입찰자
- 서버 종료시각 기준 카운트다운
- 종료 2초 이내 입찰 시 5초 연장
- 입찰 금액·잔액·EPIC 보유 여부 검증
- 낙찰자 잔액 차감
- 보유 강점 NORMAL/RARE/EPIC 강화
- 유찰·낙찰 화면
- 방장 진행에 따른 다음 상품과 최종 결과 공개

추가한 Callable Functions:

- `startAuctionVote`
- `castAuctionVote`
- `finishAuctionVote`
- `placeAuctionBid`
- `settleAuctionItem`
- `advanceAuctionItem`

핵심 판정은 `functions/index.js`의 Firestore 트랜잭션에서 처리한다. 클라이언트는 Firestore 스냅샷을 구독해 화면을 갱신한다.

### 3. Firestore 규칙 강화

- 경매방 문서를 클라이언트가 직접 수정·삭제하지 못하도록 변경
- 직업 투표 문서는 Functions만 작성하도록 클라이언트 쓰기 차단
- 참가자 문서는 본인의 `connected`, `lastSeenAt`만 직접 갱신 가능
- 참가자가 잔액과 보유 강점을 임의 수정할 수 없도록 차단
- 공개 쓰기나 보안 규칙 완화는 하지 않음

## 변경 파일

- `src/App.tsx`
- `functions/index.js`
- `firestore.rules`
- `docs/HANDOFF.md`
- `docs/NEXT_CODEX_HANDOFF.md`

협력기관 로고 파일과 로고 CSS 배치는 수정하지 않았다.

## 완료한 검증

다음 검사는 모두 통과함.

```bash
pnpm build
pnpm lint
pnpm --dir functions lint
git diff --check
```

참고:

- Vite 빌드의 500kB 초과 청크 경고는 기존 구조에서 이어진 비차단 경고임
- Functions는 Node 22를 요구하지만 현재 환경은 Node 24여서 엔진 경고가 표시됨. `node --check index.js`는 통과함
- 로컬 Vite 서버는 현재 환경의 `uv_interface_addresses` 오류로 실행되지 않았음
- Python 정적 서버는 실행됐지만 클라우드 브라우저가 `127.0.0.1` 접근을 차단해 실제 PC·모바일 시각 검증은 완료하지 못함
- 새 UI는 기존 반응형 컴포넌트와 CSS 안에서 동작하며, 경매 CSS에는 850px/560px 모바일 규칙이 이미 존재함

## 다음 Codex가 해야 할 작업

### A. 변경사항 확보

같은 작업공간이 유지된다면:

```bash
cd cheongsajin-platform
git status
git log -2 --oneline
```

새 작업공간에서 원격 저장소를 clone했다면 함께 전달된 패치를 적용한다.

```bash
git switch main
git pull --ff-only origin main
git apply --index cheongsajin-sync.patch
git commit -m "Synchronize strength auction gameplay and add handoff"
```

패치를 적용한 뒤 반드시 diff를 확인한다. 기존 사용자 변경사항을 되돌리지 않는다.

### B. 로컬 재검증

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm --dir functions lint
```

가능하면 Firebase Emulator 또는 실제 테스트 프로젝트에서 방장 1명·참가자 2명 이상으로 다음 흐름을 검증한다.

1. 방 생성 및 코드 입장
2. 게임 시작 후 모든 기기에서 투표 화면 전환
3. 참가자별 투표와 방장의 마감
4. 모든 기기에서 동일한 직업·상품·현재가 표시
5. 두 참가자의 연속 입찰 충돌 처리
6. 종료 2초 이내 입찰 시 모든 기기에서 5초 연장
7. 낙찰자의 잔액과 카드 등급 동기화
8. 방장만 다음 상품 진행 가능
9. 마지막 상품 후 결과 화면 동기화
10. PC와 모바일 화면 확인

### C. Firebase 인증 확인 및 배포

먼저 인증 및 프로젝트를 확인한다.

```bash
firebase login:list
firebase use
firebase projects:list
```

대상 프로젝트가 반드시 `cheongsajin-57ffc`인지 확인한 뒤 배포한다.

```bash
firebase use cheongsajin-57ffc
firebase deploy --only functions,firestore:rules
```

Firebase 설정값, PIN 원문, 마스터 코드는 출력하거나 코드·문서에 기록하지 않는다. 기존 Secret을 변경하거나 재등록할 필요는 없다.

### D. GitHub push 및 Pages 확인

Firebase 배포와 실기기 검증이 정상인 경우:

```bash
git push origin main
```

`main` 푸시 후 GitHub Pages가 자동 배포된다. 배포 사이트에서 PC와 모바일을 다시 확인한다.

- `https://chooyaho.github.io/cheongsajin-platform/`

## 주의사항

- 기존 디자인과 하단 협력기관 로고 배치를 유지한다.
- Firestore 보안 규칙을 완화하거나 공개 쓰기를 허용하지 않는다.
- 실제 PIN, 마스터 코드, Firebase 설정값을 코드나 문서에 남기지 않는다.
- Firebase Functions를 배포하지 않은 채 프런트엔드만 배포하면 새 경매 Callable Function 호출이 실패한다.
- 가능하면 Firebase 배포 → 다중기기 확인 → GitHub push 순으로 진행한다.
- `docs/HANDOFF.md`도 이번 구현 상태에 맞게 이미 갱신돼 있다.

## 다음 Codex에게 전달할 시작 메시지

> 청·사·진 플랫폼 후속 작업이다. 저장소의 `AGENTS.md`, `docs/HANDOFF.md`, `docs/NEXT_CODEX_HANDOFF.md`를 전부 읽어라. 함께 전달된 `cheongsajin-sync.patch` 또는 기존 로컬 커밋을 확인하고, 사용자 변경사항을 되돌리지 말아라. 먼저 Firebase와 GitHub 인증 권한을 확인한 뒤, `pnpm build`, `pnpm lint`, Functions 문법 검사와 다중기기 경매 테스트를 수행하라. 대상 Firebase 프로젝트는 `cheongsajin-57ffc`이며 비밀값을 출력하거나 기록하지 말아라. 정상 확인 후 Functions와 Firestore 규칙을 배포하고 `main`에 push하여 GitHub Pages 배포까지 확인하라.
