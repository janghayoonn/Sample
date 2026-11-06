# 프로젝트 북 아카이브

각 프로젝트를 한 권의 책으로 정리하는 아카이브 사이트입니다.

## 켜는 법
- Finder에서 `시작하기.command` 파일을 더블클릭하세요. 브라우저가 자동으로 열립니다.
- 또는 터미널에서 이 폴더로 이동한 뒤 `npm start`

## 주소
- 열람 (공유용): http://localhost:3000
- 책 한 권 열람: http://localhost:3000/b/책아이디
- 편집 (나만): http://localhost:3000/edit

## 편집 비밀번호
- 처음 `/edit` 에 들어가면 비밀번호를 정하는 화면이 나옵니다. 한 번 정하면 그 다음부터는 로그인 화면이 나옵니다.
- 로그인은 30일 동안 유지됩니다. 열람 화면은 비밀번호 없이 누구나 볼 수 있습니다.
- 비밀번호를 잊었다면: 사이트를 끄고 `data/auth.json` 파일을 지운 뒤 다시 켜면 새로 정할 수 있습니다.
- 인터넷에 올릴 때는 `ADMIN_PASSWORD` 설정값으로 비밀번호를 정합니다 (이 값이 있으면 위 방식보다 우선).

## 인터넷(Vercel)에 올리기
- GitHub 저장소를 Vercel에 연결하면 자동으로 올라갑니다. 이후 GitHub에 올릴 때마다 자동 반영됩니다.
- Vercel 프로젝트의 Storage 메뉴에서 두 가지를 만들어 연결해야 합니다.
  - **Blob** (이미지 보관, 접근 방식 Public)
  - **Upstash Redis** (책 정보 보관, 무료 플랜)
- 연결 후 Redeploy → 사이트 주소 뒤에 `/edit` 를 붙여 들어가 편집 비밀번호를 정하세요.
- 선택 설정값: `ADMIN_PASSWORD`(편집 비밀번호를 설정값으로 정할 때)
- 큰 이미지는 올리기 전에 브라우저에서 자동으로 약 4MB 이하로 줄여서 올립니다.

## 저장 위치
- 책 정보: `data/db.json`
- 이미지: `data/uploads/`
- `data` 폴더를 통째로 복사해 두면 백업이 됩니다.

## 파일 구성
- `server.js` — 데이터를 저장하고 화면을 보내주는 서버
- `storage.js` — 저장 위치 (내 컴퓨터 / Vercel 저장소)
- `api/index.js`, `vercel.json` — Vercel에서 실행하기 위한 설정
- `public/index.html` — 열람 홈 (책 목록)
- `public/book.html` — 책 열람 (펼쳐보기 + 축소판)
- `private/login.html` — 편집 로그인 / 비밀번호 정하기
- `private/edit.html` — 편집 홈 (새 책 만들기)
- `private/editor.html` — 책 편집 (정보, 내지 추가, 이미지 조절)
- `public/style.css`, `public/common.js` — 공통 디자인과 도구
