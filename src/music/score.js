// 악보 데이터 한 곳에서 관리하기
// 화면(악보, 건반)과 기능(연주, MIDI)은 모두 이 데이터를 읽기만 합니다.
// 나중에 코드 진행·가사·반주를 붙일 때도 이 객체에 칸을 추가하면 됩니다.

import { DURATIONS } from './theory.js';

const STORAGE_KEY = 'melody-sketch:score:v1';

function emptyScore() {
  return {
    version: 1,
    title: '',
    timeSignature: { beats: 4, beatValue: 4 },
    bpm: 100,
    // 멜로디: { type: 'note', midi: 60, duration: 'quarter' } 또는 { type: 'rest', duration: 'half' }
    melody: [],
    // 나중에 쓸 자리 (지금은 비어 있음)
    chords: [], // 예: [{ measure: 0, beat: 0, symbol: 'C' }]
    lyrics: [], // 예: [{ index: 0, text: '사' }]
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.melody)) return null;
    data.melody = data.melody.filter((ev) => DURATIONS[ev.duration]);
    return { ...emptyScore(), ...data };
  } catch {
    return null;
  }
}

export function createScore() {
  let state = load() ?? emptyScore();
  const listeners = new Set();

  function commit(next, change) {
    state = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 저장 공간을 못 쓰는 환경이면 조용히 넘어갑니다 */
    }
    listeners.forEach((fn) => fn(state, change));
  }

  return {
    get: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    addNote(midi, duration) {
      commit({ ...state, melody: [...state.melody, { type: 'note', midi, duration }] }, 'add');
    },
    addRest(duration) {
      commit({ ...state, melody: [...state.melody, { type: 'rest', duration }] }, 'add');
    },
    removeLast() {
      if (!state.melody.length) return;
      commit({ ...state, melody: state.melody.slice(0, -1) }, 'remove');
    },
    clear() {
      commit({ ...state, melody: [], chords: [], lyrics: [] }, 'clear');
    },
    setBpm(bpm) {
      commit({ ...state, bpm }, 'bpm');
    },
  };
}
