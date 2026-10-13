# QUESTIONS.md

Team: Team 11_Docdall (박성규, 박채원, 서은아, 신정원)
Last updated: 2026-09-28

Your biggest open questions about this project.
Write this together, after the premortem merge.

At most five, most important first.
The consultation opens with question 1, so put the one you are least sure about there, not the one that is easiest to ask.

Write in Korean or English.
Keep the headings exactly as they are.

---

## What counts as an open question

- **The answer would change what you do next.** If every possible answer leaves your next two weeks the same, it is curiosity, not an open question.
- **It is specific to this project.** "Is our idea good?" cannot be answered in 30 minutes. "We assume the person in `PROJECT.md` will enter data by hand every day, and none of us has asked one. How do we test that in a week?" can.
- **You have already tried something.** Say what you think the answer is today, even if it is a guess. A question with a guess attached gets a much better answer than a bare one.

Two good places to look for questions:

- `docs/PREMORTEM.md` — a cause of failure you could not find a countermeasure for is a question.
- `docs/PROJECT.md` — the section you argued about longest, or the one where you wrote "nobody yet".

## Our questions

### 1. 책 한 권을 쓰는 데는 최소 수주 또는 수개월이 걸리는데, 한 학기 안에서 베타 테스트를 어떤 기간과 방식으로 나눠야 서비스의 핵심 가치를 검증할 수 있는가?

- **Why it matters:** PROJECT.md의 포기 기준(What would make us drop this idea)은 "테스트 사용자 5명이 2주간 사용"이다. 2주면 매일 쓰는 습관이 붙는지는 볼 수 있지만, 흩어진 글이 책 구성으로 묶이는 경험(서비스의 나머지 절반)까지는 가지 못한다. 테스트 설계가 잘못되면 가치가 있는 기능을 "효과 없음"으로 판단해 버릴 수 있다.
- **What we think today:** 베타를 단계별로 나눈다. 습관 형성은 2주 테스트로 검증하고, 구성 기능은 이미 글이 10편 이상 쌓인 사람을 대상으로 1회 세션으로 따로 검증한다. 다만 한 사람이 처음부터 구성까지 가는 전체 흐름을 한 번도 보지 않아도 되는지는 확신이 없다.
- **Who could answer it:** 본업이 따로 있는 책을 3권 이상 출간해본 사람, 책쓰기 모임/클래스 수강생 또는 운영자

### 2. 우리 팀에서는 책 한 권을 완성하는 것을 돕는 AI 기반 앱서비스를 개발하고자 하나, AI가 써주는 것이 아닌 AI가 쓰도록 도움을 주는 서비스이다. AI의 영역을 어디까지로 제한할 것이며, 실제 사용자가 AI에게서 어떤 효용을 느끼게 할 것인가? 소비자 효용 가치를 제공하는 AI를 개발하기 위해서 팀이 해야 하는 일은 무엇인가?

- **Why it matters:** 다양한 아이디어들이 산재하는 서비스가 아닌, 소비자 효용 핵심 가치를 1~2가지로 정의하고, 이를 구현하기 위해 한 학기 동안의 한정된 리소스를 배분해야 하기 때문에 중요하다.
- **What we think today:** 글을 쓰는 모티베이션을 주기 위한 AI의 리액션 기능 추가, 원하는 책의 카테고리에 맞춤형 가이드 제공, 가이드 및 응원은 해주지만 실제 작성은 사람이 직접 하도록 함.
- **Who could answer it:** 교수님

### 3. 비개발자 팀원들로 구성된 기술적 한계 내에서 LLM 가이드의 응답 품질과 속도를 만족스러운 수준으로 구현할 수 있는가?

- **Why it matters:** 가이드 피드백이 너무 느리거나(30초 이상) 대답이 모호하면 유저는 가치를 느끼기 전에 이탈한다. 복잡한 파이프라인 개발이 어렵다면 프롬프트 템플릿화, 비동기 알림 등 기술적 타협안을 신속히 확정해야 한다.
- **What we think today:** RAG나 복잡한 백엔드 구축 없이, 정교하게 설계된 프롬프트 템플릿과 노코드 워크플로우(Softr/Make/카카오톡 챗봇 등)만으로도 유저가 만족할 만한 속도와 피드백 퀄리티를 낼 수 있다.
- **Who could answer it:** LLM 서비스 파이프라인 경험이 있는 개발 멘토, 또는 초기 가이드 응답을 받아본 베타 테스터

## Where we disagree

별도 없습니다.

---

## After the consultation

Fill this in within a week of your slot.

| # | What we heard | What we will do about it | Owner | By when |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

## Revision log

| Date | What changed and why |
|---|---|
| 2026-09-28 | Draft for consultation |
