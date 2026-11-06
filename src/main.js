// 앱의 시작점: 각 부품(악보 데이터, 피아노 소리, 건반, 악보 그리기, 연주, MIDI)을 서로 연결합니다.

import './style.css';
import { createScore } from './music/score.js';
import { DURATIONS, midiToName, solfegeOf, octaveOf, eventTicks } from './music/theory.js';
import { createPiano } from './audio/piano.js';
import { createPlayer } from './audio/player.js';
import { createKeyboard, MIN_START, MAX_START } from './ui/keyboard.js';
import { renderScore, waitForMusicFont } from './notation/render.js';
import { downloadMidi } from './export/midi.js';

const $ = (id) => document.getElementById(id);
const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

const score = createScore();
const piano = createPiano();
const player = createPlayer(piano);

let duration = 'quarter';
let highlight = { 1: -1, 2: -1 }; // 성부별 강조할 음표 번호 (연주 중이면 현재 음, 아니면 방금 넣은 음)
let fontReady = false;

/* ---------- 상태 메시지 ---------- */
const statusEl = $('status');
let statusTimer;
function say(text, sticky = false) {
  statusEl.textContent = text;
  clearTimeout(statusTimer);
  if (!sticky) statusTimer = setTimeout(() => (statusEl.textContent = summary()), 2600);
}
function summary() {
  const { melody } = score.get();
  if (!melody.length) return '';
  const part2 = score.get().part2 ?? [];
  const sum = (list) => list.reduce((s, ev) => s + eventTicks(ev), 0);
  const bars = Math.ceil(Math.max(sum(melody), sum(part2)) / 1920);
  const notes = melody.filter((ev) => ev.type === 'note').length;
  return `${bars}마디 · 음표 ${notes}개 · 쉼표 ${melody.length - notes}개${part2.length ? ' · 2중주' : ''}`;
}
piano.ready.then(() => say('준비 완료. 건반을 눌러 보세요.'));

/* ---------- 악보 그리기 ---------- */
const scoreEl = $('score');
const paperEl = $('paper');
function draw({ scrollTo = 'none' } = {}) {
  if (!fontReady) return;
  const state = score.get();
  const { positions } = renderScore(scoreEl, state, { highlight, accent });
  $('empty-hint').hidden = state.melody.length > 0;
  const target = positions.get(`1:${highlight[1]}`) ?? positions.get(`2:${highlight[2]}`);
  if (scrollTo === 'end') paperEl.scrollTop = paperEl.scrollHeight;
  else if (scrollTo === 'highlight' && target) {
    const view = { top: paperEl.scrollTop, bottom: paperEl.scrollTop + paperEl.clientHeight };
    if (target.top < view.top || target.bottom > view.bottom) paperEl.scrollTop = target.top - 8;
  }
}

waitForMusicFont().then(() => {
  fontReady = true;
  highlight = { 1: score.get().melody.length - 1, 2: -1 };
  draw({ scrollTo: 'end' });
  renderDurationButtons();
});

let resizeTimer;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => draw(), 80);
}).observe(paperEl);

score.subscribe((state, change) => {
  if (change === 'bpm') return;
  if (player.isPlaying()) player.stop();
  highlight = { 1: state.melody.length - 1, 2: -1 };
  draw({ scrollTo: 'end' });
  updateButtons();
  statusEl.textContent = summary();
});

/* ---------- 음표 길이 선택 ---------- */
const durationsEl = $('durations');
const DURATION_KEYS = ['whole', 'half', 'quarter', 'eighth'];
function renderDurationButtons() {
  durationsEl.innerHTML = DURATION_KEYS.map(
    (key, i) => `
      <button type="button" role="radio" data-duration="${key}" aria-checked="${key === duration}">
        <span class="glyph" aria-hidden="true">${DURATIONS[key].glyph}</span>
        <span class="label">${DURATIONS[key].label}</span><kbd>${i + 1}</kbd>
      </button>`,
  ).join('');
  $('rest-glyph').textContent = DURATIONS[duration].restGlyph;
}
renderDurationButtons();
function setDuration(key) {
  duration = key;
  renderDurationButtons();
}
durationsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-duration]');
  if (btn) setDuration(btn.dataset.duration);
});

/* ---------- 건반 ---------- */
const recordEl = $('record');
const keyboard = createKeyboard($('keyboard'), {
  async onPress(midi) {
    if (!piano.isLoaded()) {
      say('피아노 소리를 아직 불러오는 중이에요. 잠시만요…', true);
      return;
    }
    await piano.unlock();
    piano.noteOn(midi);
    if (recordEl.checked) score.addNote(midi, duration);
    say(`${solfegeOf(midi)} (${midiToName(midi)}) · ${DURATIONS[duration].label}`);
  },
  onRelease(midi) {
    piano.noteOff(midi);
  },
});

function updateRange() {
  const { start, end } = keyboard.getRange();
  $('range').textContent = `건반 범위 C${octaveOf(start)} – C${octaveOf(end)}`;
  $('oct-down').disabled = start <= MIN_START;
  $('oct-up').disabled = start >= MAX_START;
}
function shiftOctave(dir) {
  if (keyboard.shift(dir)) updateRange();
}
$('oct-down').addEventListener('click', () => shiftOctave(-1));
$('oct-up').addEventListener('click', () => shiftOctave(1));

// 휴대폰처럼 좁은 화면에서는 1옥타브만 크게 보여 줍니다
const narrow = window.matchMedia('(max-width: 720px)');
const applyWidth = () => {
  keyboard.setOctaves(narrow.matches ? 1 : 2);
  updateRange();
};
narrow.addEventListener('change', applyWidth);
applyWidth();

/* ---------- 쉼표 · 지우기 ---------- */
function addRest() {
  score.addRest(duration);
  say(`${DURATIONS[duration].label} 길이의 쉼표를 넣었어요.`);
}
function undo() {
  if (score.get().melody.length) {
    score.removeLast();
    say('마지막 음을 지웠어요.');
  }
}
function clearAll() {
  if (!score.get().melody.length) return;
  if (confirm('악보를 모두 지울까요? 되돌릴 수 없어요.')) {
    score.clear();
    say('악보를 모두 지웠어요.');
  }
}
$('rest').addEventListener('click', addRest);
$('undo').addEventListener('click', undo);
$('clear').addEventListener('click', clearAll);

/* ---------- 빠르기(BPM) ---------- */
const bpmEl = $('bpm');
bpmEl.value = score.get().bpm;
function setBpm(value) {
  const bpm = Math.min(220, Math.max(40, Math.round(Number(value) || 100)));
  bpmEl.value = bpm;
  player.setBpm(bpm);
  score.setBpm(bpm);
}
$('bpm-down').addEventListener('click', () => setBpm(score.get().bpm - 5));
$('bpm-up').addEventListener('click', () => setBpm(score.get().bpm + 5));
bpmEl.addEventListener('change', () => setBpm(bpmEl.value));
bpmEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') bpmEl.blur();
});

/* ---------- 악보 연주 ---------- */
const playBtn = $('play');
function updateButtons() {
  const has = score.get().melody.length > 0;
  const playing = player.isPlaying();
  playBtn.classList.toggle('is-playing', playing);
  $('play-label').textContent = playing ? '정지' : '악보 연주';
  playBtn.disabled = !has && !playing;
  $('midi').disabled = ![...score.get().melody, ...(score.get().part2 ?? [])].some((ev) => ev.type === 'note');
  $('undo').disabled = !has;
  $('clear').disabled = !has;
}
updateButtons();

async function togglePlay() {
  if (player.isPlaying()) {
    player.stop();
    return;
  }
  if (!score.get().melody.length) return;
  if (!piano.isLoaded()) say('피아노 소리를 불러오는 중이라 조금 뒤에 시작해요…', true);
  await player.play(score.get(), {
    onStep(ev) {
      highlight = { ...highlight, [ev.part]: ev.index };
      draw({ scrollTo: 'highlight' });
      if (ev.part === 1 && ev.midi != null) keyboard.flash(ev.midi, 180);
    },
    onEnd() {
      highlight = { 1: score.get().melody.length - 1, 2: -1 };
      draw();
      updateButtons();
      statusEl.textContent = summary();
    },
  });
  updateButtons();
  if (player.isPlaying()) say('연주 중… 정지하려면 버튼이나 스페이스바를 누르세요.', true);
}
playBtn.addEventListener('click', togglePlay);

/* ---------- MIDI 저장 ---------- */
$('midi').addEventListener('click', () => {
  downloadMidi(score.get());
  say('MIDI 파일을 다운로드 폴더에 저장했어요.');
});

/* ---------- 컴퓨터 키보드 단축키 ---------- */
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches('input[type="number"], textarea')) return;
  if (keyboard.handleKeyDown(e)) {
    e.preventDefault();
    return;
  }
  if (e.repeat && e.code !== 'Backspace') return;
  const digit = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
  if (digit !== undefined) setDuration(DURATION_KEYS[digit]);
  else if (e.code === 'KeyR') addRest();
  else if (e.code === 'Backspace') undo();
  else if (e.code === 'KeyZ') shiftOctave(-1);
  else if (e.code === 'KeyX') shiftOctave(1);
  else if (e.code === 'Space') togglePlay();
  else return;
  e.preventDefault();
});
window.addEventListener('keyup', (e) => keyboard.handleKeyUp(e));
window.addEventListener('blur', () => keyboard.releaseAllHeld());
