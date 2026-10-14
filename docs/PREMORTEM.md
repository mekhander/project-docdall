# PREMORTEM.md

Team: Team 11\_Docdall
Members: 박성규, 박채원, 서은아, 신정원
Merged on: 2026-09-28
Last updated: 2026-09-29

> \*\*Order matters, and here it is the entire method.\*\*
> Every member first writes their own list in `docs/premortem/<name>.md`, alone.
> Only then does the team fill in this file.
>
> If you brainstorm as a group first, the first risk named anchors everyone else, and the quiet member's risk, which is usually the real one, never gets written down.
>
> Write content in Korean or English.
> Keep the headings exactly as they are.

\---

## 1\. Individual lists

|Member|File|Written on|Causes listed|
|-|-|-|-|
|박성규|`docs/premortem/park-sunggyu.md`|2026-09-26|5|
|박채원|`docs/premortem/park-chaewon.md`|2026-09-27|5|
|서은아|`docs/premortem/seo-euna.md`|2026-09-27|5|
|신정원|`docs/premortem/shin-jeongwon.md`|2026-09-27|5|

## 2\. Read-out

Go around the table.
One cause each, in turn, until every list is exhausted.
No debating during the read-out, and nobody reads their whole list at once.
People have to feel safe saying the awkward one, so the only allowed response is writing it down.

## 3\. The merged list

Every cause from every list goes here.
Stack the repeats into one row and keep the sharpest wording, not the most diplomatic one.
Cluster by problem, never by role or department: once a cluster is called "development", half the team decides it is somebody else's problem.

Sort by how many members raised it, most first.
The repeats are your priority signal, and you get it for free.
Break ties by expected damage.

Mark a cause with **(us)** when it exists because of who is on this team, not because of the software.
At least two rows must carry that mark: skill asymmetry, time asymmetry, who will actually debug the code the artificial intelligence (AI) wrote, who has a product launch at work in November, who agrees in meetings and then goes quiet.
A premortem with no **(us)** rows is a premortem about software, not about this team.

|#|Failure cause (past tense, specific)|Problem cluster|Raised by|How many|
|-|-|-|-|-|
|1|팀에 개발자자가 없어 기술 구현/통합에 실패했다 (LLM 응답 품질·속도 문제, 백엔드·프론트를 따로 만들다 통합 실패, 앱이 끝내 작동하지 않음) **(us)**|기술 역량|박성규, 박채원, 서은아, 신정원|4|
|2|팀원들이 각자 개인 일정(회사 업무·개인사)으로 시간을 확보하지 못했고, 서로의 사정을 배려하다 아무도 대책을 세우지 않았다 **(us)**|의사결정·자원 배분 (2026-09-28 회의에서 3번과 통합)|박성규, 박채원, 서은아, 신정원|4|
|3|팀 내 리더가 없어 의견 대립·합의 지연이 있었고, 서로 배려하다 방향성을 잃었다 **(us)**|의사결정·자원 배분 (2026-09-28 회의에서 2번과 통합)|박성규, 서은아, 신정원|3|
|4|기존 서비스와 차별화 포인트가 약해, 사람들이 우리 피드백형 서비스보다 자동 작성 서비스를 원했다|서비스 차별화·검증 (2026-09-28 회의에서 5번과 통합)|박채원, 신정원|2|
|5|책을 쓰고 싶어하는 잠재 고객의 수가 팀의 예상보다 훨씬 적었다|서비스 차별화·검증 (2026-09-28 회의에서 4번과 통합)|박채원|1|
|6|데모데이 당일 서버가 작동하지 않아 서비스 데모를 보여주지 못했다|발표/기술|서은아|1|
|7|발표에서 기술 설명에 치우쳐 스토리텔링에 실패했다|발표|서은아|1|

Add rows until every individual list is used up.

## 4\. What only one person saw

Look again at every row above that a single member raised.

|Cause|Raised by|What we decided to do about it|
|-|-|-|
|잠재 고객 수가 예상보다 적었다 (#5)|박채원|책을 쓰고 싶은 의지가 있는 사람 (10명 이내) 인터뷰를 통해 AI를 통한 대필이 아닌 피드백 방식 서비스에 대한 니즈가 있는지 조사 + Wizard of Oz 방식(실제 서비스 개발 전, 사람이 수동으로 서비스를 시뮬레이션)으로 간이 체험 테스트 → 초기 검증(아이디어 레벨) 이후 베타 테스트(서비스 레벨) 순서로 진행|
|데모데이 서버 미작동 (#6)|서은아|발표 전 팀 전체가 서비스 플로우를 함께 리뷰|
|발표 스토리텔링 실패 (#7)|서은아|발표 전 팀 전체가 서비스 플로우를 함께 리뷰|

A cause only one person saw is not a weak signal.
It is usually the one the rest of the team is structurally unable to see.

## 5\. The three we act on

Pick at most three.
More than three is a list, not a plan.

The top of the merged list is where you start looking, not an automatic answer.
If a cause only one person saw is the one that would end the project, pick it.

|#|Failure cause|Early warning signal — what we would actually observe, and when|Countermeasure — the action|Owner|By when|
|-|-|-|-|-|-|
|1|팀 개발 역량 부족으로 인한 기술 구현 및 백엔드-프론트엔드 통합 실패|AI 피드백 플로우가 end-to-end 돌아가지 않음|1) 역할을 큰 틀(ex. 프론트엔드, 백엔드)에서 분담하되, 비전문가들이 각자의 영역에만 집중하면 unknown-unknown의 문제들이 발생하기 마련. 매주 함께 진행상황 리뷰하며 영역간 연계 소통. <br />2) Softr+Make, 또는 Supabase가 붙어 있는 올인원 빌더를 사용하기  <br />3) 11월부터는 역할 경계 없이 Cross-check|서은아|매주 토요일 수업 직후 30분\~1시간 미팅|
|2|의사결정 지연·자원 배분 (리더 부재 + 개인 일정으로 시간 미확보)|팀 내 의견이 1:2 또는 1:1:1로 갈리고, 모든 의견이 유의미해서 결정이 빠르게 나지 않을 때 / 미팅시간을 잡는데 모두 가능한 시간 확보가 불가할 때|미팅시간은 토요일 수업 후 30분\~1시간으로 고정. 의사결정을 할 때는 성규님이 최종 결정권을 가지고, 성규님을 제외한 3명 중 2명이 찬성하는 안으로 결정하되, 1:1:1일 때는 성규님이 타이브레이커로 최종 결정.|박성규|즉시 적용(9/28)|
|3|서비스 차별화·검증 실패 (차별화 약함 + 잠재 고객 수 과대추정)|단계별 베타테스트/인터뷰 대상자 절반 이상이 피드백형보다 자동 작성형을 선택함|책을 쓰고 싶은 의지가 있는 주변인들을 대상으로 사전 인터뷰 → 초기 시장수요 검증 후 서비스 단계별 베타 테스트 순서로 진행|신정원|10/17|

Three tests every row must pass:

* **The signal is observable.** "We notice we are falling behind" is not a signal. "Two members have not opened the project in seven days" is.
* **The countermeasure is an action, not a posture.** "열심히 하기", "우선순위 관리", and "we will be careful" are intentions. "Call three potential users and write down what they say" is an action. If it has no verb, rewrite it.
* **The owner is one named person, and there is a date.** "The team" owns nothing. A countermeasure with no date is a countermeasure with no week: it never lands on anyone's calendar.

You do not need a 1-to-5 likelihood and impact matrix, and we would rather you did not add one.
It makes every risk look equally considered whether or not it was.

Everything in section 3 that is not in this table is a risk you are knowingly leaving alone for now.
That is a decision, and it is fine.

\---

## Revision log

Any change of direction needs a new row here within one week.
A premortem that analyzes a product you no longer build is worse than none, because it reads as covered.

|Date|What changed and why|
|-|-|
|2026-09-27|Draft for consultation — Section 1 채움, Section 3 (4개 리스트 겹치는 원인 취합). Section 4·5는 병합 회의에서 확정 필요|
|2026-09-29|병합 회의(2026-09-28) — Merged on 확정, Section 3에서 2+3번·4+5번 클러스터 통합 확정, Section 4 대응 채움, Section 5 실행 3건 확정.|

\---

Method note: Gary Klein, "Performing a Project Premortem", Harvard Business Review, September 2007.

