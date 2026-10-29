# Docdall 소재 인터뷰 (박채원, P0)

다정한 AI 편집자와 채팅하면 기획서 카드(필요성·목적, 타깃 독자, 독자의 변화, 차별점, 톤·문체)가 작가의 말로 채워지는 프로토타입이다. 칸은 루브릭 문서의 핵심 5개 차원이다.
스펙: `docs/specs/park-chaewon-interview.md`

## 실행

1. Node.js 22 이상이 필요하다. (Node 24에서 만들었다.)
2. 이 폴더에 `.env` 파일을 만들고 한 줄을 적는다. `.env.example`을 복사하면 된다.
   ```
   GEMINI_API_KEY=여기에_키
   ```
   키는 GitHub에 올리지 않는다. `.env`는 루트 `.gitignore`에 들어 있다.
3. 서버를 켠다.
   ```
   node --env-file=.env server.js
   ```
4. 브라우저에서 http://localhost:3000 을 연다.

## 시험

- 규칙(코드) 시험, AI 없이: `node --test`
- 실제 AI 한 번 호출: `node --env-file=.env try-ai.mjs "작가의 답"`
- 쓸 수 있는 모델 이름 보기: `node --env-file=.env list-models.mjs`

## 구조

- `logic.js`: 다음에 무엇을 할지 정하는 규칙. AI를 부르지 않는다.
- `gemini.js`: Gemini 호출과 프롬프트. 한 턴에 한 번 부르고, 30초가 넘으면 실패로 친다.
- `server.js`: 화면과 `/api/turn`. 서버에 대화를 저장하지 않는다.
- `public/index.html`: 채팅 화면과 기획서 카드.
