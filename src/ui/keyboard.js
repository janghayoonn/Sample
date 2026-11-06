// 화면의 피아노 건반 + 컴퓨터 키보드 연주
// 키보드는 "글자"가 아니라 "물리 키 위치"(e.code)로 읽기 때문에 한글 입력 상태에서도 동작합니다.

import { isBlackKey, octaveOf, solfegeOf } from '../music/theory.js';

/** 건반 시작음(도)에서 몇 반음 위인지 → 컴퓨터 키 (GarageBand '키보드로 연주'와 같은 배치) */
const KEY_CODES = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8,
  KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
  Quote: 17, BracketRight: 18,
};
const CODE_LABEL = { Semicolon: ';', Quote: "'", BracketRight: ']' };
const labelOf = (code) => CODE_LABEL[code] ?? code.replace('Key', '');

export const MIN_START = 24; // C1
export const MAX_START = 84; // C6

export function createKeyboard(el, { onPress, onRelease }) {
  let start = 60; // C4
  let octaves = 2;
  const keyEls = new Map(); // midi → element
  const heldByCode = new Map(); // 컴퓨터 키 → midi
  const heldByPointer = new Map(); // 포인터 → midi

  const offsetToCode = Object.fromEntries(Object.entries(KEY_CODES).map(([c, o]) => [o, c]));

  function build() {
    el.innerHTML = '';
    keyEls.clear();
    const end = start + octaves * 12; // 마지막 도까지 포함
    const whiteCount = Array.from({ length: end - start + 1 }, (_, i) => start + i).filter(
      (m) => !isBlackKey(m),
    ).length;
    el.style.setProperty('--white-count', whiteCount);

    let whiteIndex = 0;
    for (let midi = start; midi <= end; midi++) {
      const black = isBlackKey(midi);
      const key = document.createElement('button');
      key.type = 'button';
      key.className = black ? 'key key--black' : 'key key--white';
      key.dataset.midi = midi;
      key.setAttribute('aria-label', `${solfegeOf(midi)} ${octaveOf(midi)}옥타브`);
      key.tabIndex = -1;

      const code = offsetToCode[midi - start];
      const hint = code ? `<span class="key__hint">${labelOf(code)}</span>` : '';
      if (black) {
        key.style.setProperty('--pos', whiteIndex);
        key.innerHTML = hint;
      } else {
        const octaveMark = midi % 12 === 0 ? `<span class="key__octave">C${octaveOf(midi)}</span>` : '';
        key.innerHTML = `${hint}<span class="key__name">${solfegeOf(midi)}</span>${octaveMark}`;
        whiteIndex++;
      }
      el.appendChild(key);
      keyEls.set(midi, key);
    }
  }

  function press(midi) {
    keyEls.get(midi)?.classList.add('is-down');
    onPress(midi);
  }
  function release(midi) {
    keyEls.get(midi)?.classList.remove('is-down');
    onRelease(midi);
  }

  // 마우스·터치
  el.addEventListener('pointerdown', (e) => {
    const key = e.target.closest('.key');
    if (!key) return;
    e.preventDefault();
    const midi = Number(key.dataset.midi);
    heldByPointer.set(e.pointerId, midi);
    press(midi);
  });
  const endPointer = (e) => {
    if (!heldByPointer.has(e.pointerId)) return;
    release(heldByPointer.get(e.pointerId));
    heldByPointer.delete(e.pointerId);
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  // 컴퓨터 키보드 (main.js에서 호출)
  function handleKeyDown(e) {
    if (!(e.code in KEY_CODES)) return false;
    if (e.repeat || heldByCode.has(e.code)) return true;
    const midi = start + KEY_CODES[e.code];
    heldByCode.set(e.code, midi);
    press(midi);
    return true;
  }
  function handleKeyUp(e) {
    if (!heldByCode.has(e.code)) return false;
    release(heldByCode.get(e.code));
    heldByCode.delete(e.code);
    return true;
  }
  function releaseAllHeld() {
    heldByCode.forEach((midi) => release(midi));
    heldByCode.clear();
  }

  build();

  return {
    handleKeyDown,
    handleKeyUp,
    releaseAllHeld,
    getRange: () => ({ start, end: start + octaves * 12 }),
    shift(direction) {
      const next = Math.min(MAX_START, Math.max(MIN_START, start + direction * 12));
      if (next === start) return false;
      releaseAllHeld();
      start = next;
      build();
      return true;
    },
    setOctaves(n) {
      if (n === octaves) return;
      octaves = n;
      build();
    },
    /** 악보 연주 중 해당 건반을 잠깐 빛나게 */
    flash(midi, ms) {
      const key = keyEls.get(midi);
      if (!key) return;
      key.classList.add('is-playing');
      clearTimeout(key._flashTimer);
      key._flashTimer = setTimeout(() => key.classList.remove('is-playing'), ms);
    },
  };
}
