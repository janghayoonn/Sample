// 오선지 악보 그리기 (VexFlow)
// 입력 데이터 → 마디 나누기(theory.js) → 줄 바꿈 계산 → SVG로 그리기

import {
  Accidental,
  BarlineType,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  StaveTie,
  Voice,
} from 'vexflow/bravura';
import { diatonicIndex, layoutMeasures, measureTicks, spell } from '../music/theory.js';

const PAD_X = 12;
const CLEF_EXTRA = 64; // 줄 첫 마디: 높은음자리표 자리
const TIME_EXTRA = 30; // 첫 마디: 박자표 자리
const TOP_LINE = 38; // 오선 맨 윗줄(F5)의 흰건반 번호
const BOTTOM_LINE = 30; // 오선 맨 아랫줄(E4)

export async function waitForMusicFont() {
  try {
    await document.fonts.load('30px Bravura');
  } catch {
    /* 글꼴을 못 불러와도 그리기는 시도합니다 */
  }
}

function naturalWidth(measure) {
  if (!measure.items.length) return 240;
  return Math.max(150, 56 + measure.items.length * 40);
}

/** 화면 너비에 맞춰 마디를 줄로 나눕니다 */
function breakLines(measures, available) {
  const lines = [];
  let line = [];
  let used = 0;
  measures.forEach((m, i) => {
    const extra = (line.length === 0 ? CLEF_EXTRA : 0) + (i === 0 ? TIME_EXTRA : 0);
    const w = naturalWidth(m) + extra;
    if (line.length && used + w > available) {
      lines.push(line);
      line = [];
      used = 0;
    }
    const w2 = naturalWidth(m) + CLEF_EXTRA * (line.length === 0) + TIME_EXTRA * (i === 0);
    line.push({ measure: m, index: i, width: w2 });
    used += w2;
  });
  if (line.length) lines.push(line);

  // 마지막 줄을 뺀 나머지 줄은 가로로 꽉 채우기
  lines.forEach((ln, li) => {
    const sum = ln.reduce((s, x) => s + x.width, 0);
    const isLast = li === lines.length - 1;
    const scale = isLast ? Math.min(1.25, available / sum) : available / sum;
    ln.forEach((x) => (x.width = Math.floor(x.width * scale)));
  });
  return lines;
}

function makeNote(item, accidentalState, color) {
  const { chunk } = item;
  let note;
  if (item.type === 'rest') {
    note = new StaveNote({ keys: ['b/4'], duration: `${chunk.vf}r`, dots: chunk.dots });
  } else {
    const { letter, sharp, octave } = spell(item.midi);
    note = new StaveNote({
      keys: [`${letter.toLowerCase()}${sharp ? '#' : ''}/${octave}`],
      duration: chunk.vf,
      dots: chunk.dots,
      autoStem: true,
      clef: 'treble',
    });
    // 같은 마디 안에서 이미 붙은 #은 다시 쓰지 않고, 원래 음으로 돌아올 땐 제자리표(♮)
    const slot = `${letter}${octave}`;
    const current = accidentalState.get(slot) ?? false;
    if (!item.continuation) {
      if (sharp && !current) note.addModifier(new Accidental('#'), 0);
      if (!sharp && current) note.addModifier(new Accidental('n'), 0);
      accidentalState.set(slot, sharp);
    }
  }
  if (chunk.dots) Dot.buildAndAttach([note], { all: true });
  if (color) note.setStyle({ fillStyle: color, strokeStyle: color });
  return note;
}

/**
 * @param {HTMLElement} el 악보를 넣을 칸
 * @param {object} score 악보 데이터
 * @param {{ highlight?: number, accent: string }} options highlight = 강조할 음표 번호
 * @returns {{ positions: Map<number, {top:number,bottom:number}> }} 음표 번호별 세로 위치 (자동 스크롤용)
 */
export function renderScore(el, score, { highlight = -1, accent = '#e8590c' } = {}) {
  const width = Math.max(300, el.clientWidth);
  const available = width - PAD_X * 2;
  const mt = measureTicks(score.timeSignature);
  const measures = layoutMeasures(score.melody, score.timeSignature);
  const lines = breakLines(measures, available);
  const timeSpec = `${score.timeSignature.beats}/${score.timeSignature.beatValue}`;

  el.innerHTML = '';
  const renderer = new Renderer(el, Renderer.Backends.SVG);
  const ctx = renderer.getContext();

  const positions = new Map();
  const drawn = []; // { item, note, line }
  let cursor = 4;

  lines.forEach((line, lineIndex) => {
    // 이 줄에서 가장 높은/낮은 음을 보고 줄 간격을 넉넉히 잡습니다 (덧줄 대비)
    let hi = TOP_LINE;
    let lo = BOTTOM_LINE;
    line.forEach(({ measure }) =>
      measure.items.forEach((it) => {
        if (it.type !== 'note') return;
        const d = diatonicIndex(it.midi);
        hi = Math.max(hi, d);
        lo = Math.min(lo, d);
      }),
    );
    const staveY = cursor + Math.max(0, (hi - TOP_LINE) * 5 - 22);
    const staffTop = staveY + 40;
    const staffBottom = staveY + 80;
    const lowestY = staffTop + (TOP_LINE - lo) * 5 + 14;
    cursor = Math.max(staffBottom + 34, lowestY + 26);

    let x = PAD_X;
    line.forEach(({ measure, index, width: w }, posInLine) => {
      const stave = new Stave(x, staveY, w);
      if (posInLine === 0) stave.addClef('treble');
      if (index === 0) stave.addTimeSignature(timeSpec);
      if (index === measures.length - 1) stave.setEndBarType(BarlineType.END);
      stave.setContext(ctx).draw();
      x += w;

      if (!measure.items.length) return;

      const accidentalState = new Map();
      const notes = measure.items.map((item) => {
        const color = item.index === highlight ? accent : null;
        const note = makeNote(item, accidentalState, color);
        drawn.push({ item, note, line: lineIndex });
        return note;
      });

      const beams = Beam.generateBeams(notes.filter((n) => !n.isRest()));
      const voice = new Voice({ numBeats: score.timeSignature.beats, beatValue: score.timeSignature.beatValue });
      voice.setMode(Voice.Mode.SOFT);
      voice.addTickables(notes);

      // 덜 찬 마디는 채운 만큼만 가로로 펼칩니다
      const span = stave.getNoteEndX() - stave.getNoteStartX() - 16;
      new Formatter().joinVoices([voice]).format([voice], Math.max(30, span * Math.min(1, measure.used / mt)));
      voice.draw(ctx, stave);
      beams.forEach((b) => {
        if (notes.some((n, i) => measure.items[i].index === highlight && b.getNotes().includes(n))) {
          b.setStyle({ fillStyle: accent, strokeStyle: accent });
        }
        b.setContext(ctx).draw();
      });

      measure.items.forEach((item) => {
        const p = positions.get(item.index);
        if (!p) positions.set(item.index, { top: staveY, bottom: cursor });
      });
    });
  });

  // 붙임줄: 같은 음을 나눈 조각끼리 잇기 (줄이 바뀌면 양쪽 끝에 반쪽씩)
  for (let i = 1; i < drawn.length; i++) {
    const a = drawn[i - 1];
    const b = drawn[i];
    if (a.item.index !== b.item.index || a.item.type !== 'note') continue;
    const tie = (opts) => new StaveTie({ firstIndexes: [0], lastIndexes: [0], ...opts }).setContext(ctx).draw();
    if (a.line === b.line) tie({ firstNote: a.note, lastNote: b.note });
    else {
      tie({ firstNote: a.note });
      tie({ lastNote: b.note });
    }
  }

  renderer.resize(width, cursor + 6);
  return { positions };
}
