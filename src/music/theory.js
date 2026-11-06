// 음악 이론 도우미: 음 이름, 음표 길이, 마디 나누기
// 시간 단위는 MIDI와 같은 "틱(tick)"을 씁니다. 4분음표 1개 = 480틱.

export const PPQ = 480;

export const DURATIONS = {
  whole: { ticks: PPQ * 4, label: '온음표', glyph: '', restGlyph: '' },
  half: { ticks: PPQ * 2, label: '2분음표', glyph: '', restGlyph: '' },
  quarter: { ticks: PPQ, label: '4분음표', glyph: '', restGlyph: '' },
  eighth: { ticks: PPQ / 2, label: '8분음표', glyph: '', restGlyph: '' },
};

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SOLFEGE = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'];
const LETTER_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

export const isBlackKey = (midi) => SHARP_NAMES[midi % 12].length > 1;
export const octaveOf = (midi) => Math.floor(midi / 12) - 1;
export const midiToName = (midi) => `${SHARP_NAMES[midi % 12]}${octaveOf(midi)}`;
export const solfegeOf = (midi) => SOLFEGE[midi % 12];

/** 검은 건반은 항상 샵(#)으로 표기 */
export function spell(midi) {
  const name = SHARP_NAMES[midi % 12];
  return { letter: name[0], sharp: name.length > 1, octave: octaveOf(midi) };
}

/** 오선 위 높이 계산용: 글자(C~B)와 옥타브로 만든 "흰 건반 번호" */
export function diatonicIndex(midi) {
  const { letter, octave } = spell(midi);
  return octave * 7 + LETTER_INDEX[letter];
}

export function measureTicks(ts) {
  return ts.beats * ((PPQ * 4) / ts.beatValue);
}

export const eventTicks = (ev) => DURATIONS[ev.duration].ticks;

/** 악보로 그릴 수 있는 길이 조각 (점음표 포함), 긴 것부터 */
const CHUNKS = [
  { ticks: 1920, vf: 'w', dots: 0 },
  { ticks: 1440, vf: 'h', dots: 1 },
  { ticks: 960, vf: 'h', dots: 0 },
  { ticks: 720, vf: 'q', dots: 1 },
  { ticks: 480, vf: 'q', dots: 0 },
  { ticks: 360, vf: '8', dots: 1 },
  { ticks: 240, vf: '8', dots: 0 },
  { ticks: 120, vf: '16', dots: 0 },
];

export function splitTicks(ticks) {
  const out = [];
  let left = ticks;
  for (const c of CHUNKS) {
    while (left >= c.ticks) {
      out.push(c);
      left -= c.ticks;
    }
  }
  return out;
}

/**
 * 멜로디(입력한 순서대로의 음표 목록)를 시간표로 바꿉니다.
 * 연주와 MIDI 내보내기가 이 결과를 함께 씁니다.
 */
export function toTimeline(melody) {
  let start = 0;
  return melody.map((ev, index) => {
    const ticks = eventTicks(ev);
    const item = { index, start, ticks, midi: ev.type === 'note' ? ev.midi : null };
    start += ticks;
    return item;
  });
}

export const totalTicks = (melody) => melody.reduce((sum, ev) => sum + eventTicks(ev), 0);

/**
 * 멜로디를 마디 단위로 나눕니다.
 * 마디를 넘치는 음은 두 조각으로 나누고 붙임줄(tie)로 이어 줍니다.
 * 마지막 마디가 꽉 차면 다음에 입력할 빈 마디를 하나 더 만듭니다.
 */
export function layoutMeasures(melody, ts) {
  const mt = measureTicks(ts);
  const measures = [{ items: [], used: 0 }];

  melody.forEach((ev, index) => {
    let remaining = eventTicks(ev);
    let continuation = false;
    while (remaining > 0) {
      let m = measures[measures.length - 1];
      if (m.used >= mt) {
        m = { items: [], used: 0 };
        measures.push(m);
      }
      const take = Math.min(remaining, mt - m.used);
      for (const chunk of splitTicks(take)) {
        m.items.push({ index, type: ev.type, midi: ev.midi, chunk, continuation });
        continuation = true;
      }
      m.used += take;
      remaining -= take;
    }
  });

  if (measures[measures.length - 1].used >= mt) measures.push({ items: [], used: 0 });
  return measures;
}
