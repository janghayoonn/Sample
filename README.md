# 멜로디 스케치

피아노 건반으로 멜로디를 입력하면 오선지 악보를 만들고, '악보 연주' 버튼으로 그 악보를 피아노로 연주해 주는 웹앱.

## 켜는 법
- `시작하기.command` 더블클릭 → 크롬에서 http://localhost:5180 이 열립니다.
- 또는 터미널에서 `npm install` 후 `npm run dev`

## 사용법 (단축키)
| 동작 | 마우스 | 키보드 |
|---|---|---|
| 음 입력 | 건반 클릭 | A S D F G H J K L ; ' (흰 건반), W E T Y U O P ] (검은 건반) |
| 음표 길이 | 온/2분/4분/8분 버튼 | 1 2 3 4 |
| 쉼표 | 쉼표 버튼 | R |
| 마지막 음 지우기 | 지우기 버튼 | Backspace |
| 옥타브 이동 | ‹ › 버튼 | Z / X |
| 악보 연주 / 정지 | 악보 연주 버튼 | Space |

키보드는 물리 키 위치로 읽기 때문에 한글 입력 상태에서도 동작합니다.
악보는 브라우저에 자동 저장되어 새로고침해도 남아 있습니다.

## 2중주
악보 데이터에는 윗성부 `melody`(높은음자리표)와 아랫성부 `part2`(낮은음자리표)가 있습니다. `part2`가 비어 있지 않으면 두 오선이 함께 그려지고, 연주·MIDI(트랙 2개)에도 함께 반영됩니다. 건반 입력은 아직 윗성부에만 들어갑니다.

## 폴더 구조
```
src/
  main.js              모든 부품을 연결하는 시작점
  style.css            디자인 (포인트 컬러: --accent)
  music/theory.js      음 이름, 음표 길이, 마디 나누기
  music/score.js       악보 데이터 (멜로디 + 나중에 쓸 chords, lyrics 칸)
  audio/piano.js       피아노 소리 (Tone.js Sampler)
  audio/player.js      '악보 연주' 예약/정지
  notation/render.js   오선지 그리기 (VexFlow)
  ui/keyboard.js       화면 건반 + 컴퓨터 키보드
  export/midi.js       MIDI 내보내기
public/samples/piano   피아노 녹음 파일
```

## 나중에 붙일 기능과 들어갈 자리
- 코드 진행 입력 → `score.chords` 데이터 + 화면 입력 UI
- 피아노 반주 생성 → `src/music/accompaniment.js` 새로 만들고 `audio/player.js`에서 함께 예약
- MusicXML 내보내기 → `src/export/musicxml.js` (theory.js의 `layoutMeasures` 재사용)
- 가사 주제 → Claude API로 가사·코드 진행 생성 → API 키를 숨기기 위해 작은 서버(`server/`)가 필요
- 1분 분량 곡 완성 → 위 기능들을 묶는 단계

## 사용한 라이브러리
- [Tone.js](https://tonejs.github.io/) — 소리 재생, 연주 타이밍
- [VexFlow 5](https://www.vexflow.com/) — 오선지 악보 그리기
- [@tonejs/midi](https://github.com/Tonejs/Midi) — MIDI 파일 만들기
- [Vite](https://vite.dev/) — 개발용 서버
- 피아노 소리: Salamander Grand Piano (Alexander Holm, CC BY 3.0)
