# HW6 진행 현황 — 박성규

기준일: 2026-10-29 (한국 시간)
제출 마감: 2026-10-29 23:59
팀 저장소: https://github.com/mekhander/project-docdall

## 완료한 일

- [x] 팀 저장소를 노트북에서 확보하고 작업 경로 확인.
- [x] Docdall WhyTree 슬라이드 작성 및 docs/whytree/park-sunggyu.md 변환. 원문 노드와 들여쓰기 계층 유지.
- [x] Matt Pocock 원본 grill-me 기반 한국어 문답으로 ‘계속해서 리마인드’ 기능 구체화.
- [x] docs/specs/park-sunggyu-reminder.md 작성. 대상, WhyTree 연결, 사용자 흐름, 우선순위, 범위, 외부 AI 미연결 및 실패 처리, 직접 확인 항목 정리.
- [x] prototypes/park-sunggyu/에 P0 프로토타입 구현. 두 Telegram 역할 대화방, 브라우저 일정 안내, 고정 시간 Telegram 일정 안내, 확인 후 전체 일정 조정 및 예약 갱신.
- [x] 핵심 동작 사용자 확인: Telegram 메시지·Windows Chrome 팝업 수신, 일정 변경과 팬 안내, 빈도 변경 및 실패·복구 절차. 상세 근거와 한계는 MANUAL_CHECKS.md 참고.
- [x] 자동 시험 14개 통과. 자동 시험과 사용자 확인은 별도로 기록.
- [x] 구현 중 변경 사항을 명세서에 반영. 브라우저 앱 알림함과 Windows 시스템 팝업 구분, Telegram 고정 일정 안내 추가.
- [x] 제출 대상 소스 및 로컬 Git 이력 12개 커밋의 일반적인 비밀키 패턴 검사에서 발견 없음. .env와 개인 상태 데이터 Git 제외 확인.

## 게시 및 제출 체크리스트

- [x] 본인 GitHub 계정과 커밋 작성자 확인.
- [x] 최신 main 가져오기. 충돌이 있으면 본인 변경을 보존하며 해결.
- [x] 푸시 직전 최신 파일과 Git 이력 비밀정보 검사 재확인.
- [x] 본인 WhyTree Markdown, 명세서, prototypes/park-sunggyu/만 커밋. 슬라이드 PPTX는 이번 허용 커밋 경로에 포함되지 않으므로 제외.
- [x] main에 푸시하고 원격 파일·커밋 확인. 강제 푸시와 비밀키 차단 우회 금지. 이번 과제는 PR 불필요.
- [x] GitHub 제출 링크 정리.
- [ ] GitHub 게시 후 kardens.io HW6 writing invitation에 아래 네 주제의 회고 작성·제출.

## 회고에 답할 내용

1. WhyTree: 놀라웠던 노드와 그 노드에 이른 Why Up/How Down 질문, 슬라이드와 AI 변환의 차이 및 수정 사항. 실제 확인한 경험만 작성.
2. grill-me: 암묵적인 생각을 결정하게 만든 질문, 추천안을 수용하거나 거절한 실제 사례.
3. 명세서: P0와 P1/P2로 나눈 이유, 가장 정하기 어려웠던 부분.
4. 구현 후 변화: 명세서 또는 WhyTree에서 바꾼 부분의 실제 줄 번호, 처음 실패한 확인과 배운 점. 브라우저 안의 안내 메시지와 Windows 실제 팝업이 달랐던 경험 활용 가능.

## 상태 해석

로컬 구현과 핵심 동작 확인은 완료했다. GitHub main에 게시 완료(기능 커밋 894a3e9, 계정 mekhander). kardens 회고 제출은 아직 완료하지 않았다. 장기적인 하루 1회 발송·빈도 복귀와 실제 집필 지속 효과는 추후 관찰 대상이다. 회고는 사용자의 실제 경험을 바탕으로 작성하며 AI가 경험을 대신 만들어내지 않는다.


## GitHub 제출 링크

- WhyTree: https://github.com/mekhander/project-docdall/blob/main/docs/whytree/park-sunggyu.md
- 명세서: https://github.com/mekhander/project-docdall/blob/main/docs/specs/park-sunggyu-reminder.md
- 프로토타입: https://github.com/mekhander/project-docdall/tree/main/prototypes/park-sunggyu
- 구현 커밋: https://github.com/mekhander/project-docdall/commit/894a3e9


회고 초안 파일은 사용자 요청으로 삭제했다. kardens 회고는 사용자가 본인의 경험과 표현으로 작성·제출한다. 일반 삭제이므로 이전 Git 커밋에는 파일 내용이 남는다.
