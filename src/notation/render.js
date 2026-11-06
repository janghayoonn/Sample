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
  StaveConnector,
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
const BASS_TOP = 26; // 낮은음자리표 맨 윗줄(A3)
const BASS_BOTTOM = 18; // 낮은음자리표 맨 아랫줄(G2)

export async function waitForMusicFont() {
  try {
    await document.fonts.load('30px Bravura');
  } catch {
    /* 글꼴을 못 불러와도 그리기는 시도합니다 */
  }
}

function naturalWidth(count) {
  if (!count) return 240;
  return Math.max(150, 56 + count * 40);
}

/** 화면 너비에 맞춰 마디를 줄로 나눕니다 (counts[i] = i번째 마디에서 가장 많은 음표 수) */
function breakLines(counts, available) {
  const lines = [];
  let line = [];
  let used = 0;
  counts.forEach((count, i) => {
    const base = naturalWidth(count);
    const w = base + (line.length === 0 ? CLEF_EXTRA : 0) + (i === 0 ? TIME_EXTRA : 0);
    if (line.length && used + w > available) {
      lines.push(line);
      line = [];
      used = 0;
    }
    const w2 = base + (line.length === 0 ? CLEF_EXTRA : 0) + (i === 0 ? TIME_EXTRA : 0);
    line.push({ index: i, width: w2 });
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

function makeNote(item, accidentalState, color, clef) {
  const { chunk } = item;
  let note;
  if (item.type === 'rest') {
    note = new StaveNote({
      keys: [clef === 'bass' ? 'd/3' : 'b/4'],
      duration: `${chunk.vf}r`,
      dots: chunk.dots,
      clef,
    });
  } else {
    const { letter, sharp, octave } = spell(item.midi);
    note = new StaveNote({
      keys: [`${letter.toLowerCase()}${sharp ? '#' : ''}/${octave}`],
      duration: chunk.vf,
      dots: chunk.dots,
      autoStem: true,
      clef,
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

/** 이 줄에 들어갈 음들의 가장 높은/낮은 위치 (덧줄이 들어갈 공간 계산용) */
function extent(line, measuresOfPart, low, high) {
  let hi = high;
  let lo = low;
  line.forEach(({ index }) =>
    (measuresOfPart[index]?.items ?? []).forEach((it) => {
      if (it.type !== 'note') return;
      const d = diatonicIndex(it.midi);
      hi = Math.max(hi, d);
      lo = Math.min(lo, d);
    }),
  );
  return { hi, lo };
}

/**
 * @param {HTMLElement} el 악보를 넣을 칸
 * @param {object} score 악보 데이터 (melody = 윗성부, part2 = 아랫성부)
 * @param {{ highlight?: {1:number,2:number}, accent: string }} options 강조할 음표 번호 (성부별)
 * @returns {{ positions: Map<string, {top:number,bottom:number}> }} "성부:음표번호" → 세로 위치 (자동 스크롤용)
 */
export function renderScore(el, score, { highlight = {}, accent = '#e8590c' } = {}) {
  const width = Math.max(300, el.clientWidth);
  const available = width - PAD_X * 2;
  const mt = measureTicks(score.timeSignature);
  const duet = (score.part2?.length ?? 0) > 0;
  const m1 = layoutMeasures(score.melody, score.timeSignature);
  const m2 = duet ? layoutMeasures(score.part2, score.timeSignature) : [];
  const total = Math.max(m1.length, m2.length);
  const empty = { items: [], used: 0 };
  const measureOf = (list, i) => list[i] ?? empty;

  const counts = Array.from({ length: total }, (_, i) =>
    Math.max(measureOf(m1, i).items.length, measureOf(m2, i).items.length),
  );
  const lines = breakLines(counts, available);
  const timeSpec = `${score.timeSignature.beats}/${score.timeSignature.beatValue}`;

  el.innerHTML = '';
  const renderer = new Renderer(el, Renderer.Backends.SVG);
  const ctx = renderer.getContext();

  const positions = new Map();
  const drawn = { 1: [], 2: [] }; // { item, note, line }
  const colorOf = (part, item) => (item.index === highlight[part] ? accent : null);
  let cursor = 4;

  lines.forEach((line, lineIndex) => {
    const lineTop = cursor;
    // 윗성부(높은음자리표): 덧줄이 들어갈 공간까지 계산
    const e1 = extent(line, m1, BOTTOM_LINE, TOP_LINE);
    const y1 = cursor + Math.max(0, (e1.hi - TOP_LINE) * 5 - 22);
    const top1 = y1 + 40;
    const bottom1 = y1 + 80;
    const lowest1 = top1 + (TOP_LINE - e1.lo) * 5 + 14;
    cursor = Math.max(bottom1 + 34, lowest1 + 26);

    // 아랫성부(낮은음자리표)
    let y2 = 0;
    if (duet) {
      const e2 = extent(line, m2, BASS_BOTTOM, BASS_TOP);
      const top2 = Math.max(bottom1 + 30, lowest1 + 8) + Math.max(0, (e2.hi - BASS_TOP) * 5);
      y2 = top2 - 40;
      const lowest2 = top2 + (BASS_TOP - e2.lo) * 5 + 14;
      cursor = Math.max(y2 + 80 + 34, lowest2 + 26);
    }

    let x = PAD_X;
    line.forEach(({ index, width: w }, posInLine) => {
      const isFirstOfLine = posInLine === 0;
      const isLastMeasure = index === total - 1;
      const stave1 = new Stave(x, y1, w);
      const stave2 = duet ? new Stave(x, y2, w) : null;
      [
        [stave1, 'treble'],
        [stave2, 'bass'],
      ].forEach(([st, clef]) => {
        if (!st) return;
        if (isFirstOfLine) st.addClef(clef);
        if (index === 0) st.addTimeSignature(timeSpec);
        if (isLastMeasure) st.setEndBarType(BarlineType.END);
        st.setContext(ctx).draw();
      });

      if (duet) {
        const connect = (type) => new StaveConnector(stave1, stave2).setType(type).setContext(ctx).draw();
        if (isFirstOfLine) {
          connect('brace');
          connect('singleLeft');
        }
        connect(isLastMeasure ? 'boldDoubleRight' : 'singleRight');
      }
      x += w;

      // 두 성부를 한 번에 정렬해서, 같은 박자의 음이 위아래로 나란히 서게 합니다
      const parts = [
        { part: 1, clef: 'treble', stave: stave1, measure: measureOf(m1, index) },
        ...(duet ? [{ part: 2, clef: 'bass', stave: stave2, measure: measureOf(m2, index) }] : []),
      ].filter((p) => p.measure.items.length);
      if (!parts.length) return;

      const formatter = new Formatter();
      const voices = parts.map((p) => {
        const accidentalState = new Map();
        p.notes = p.measure.items.map((item) => {
          const note = makeNote(item, accidentalState, colorOf(p.part, item), p.clef);
          drawn[p.part].push({ item, note, line: lineIndex });
          return note;
        });
        const voice = new Voice({ numBeats: score.timeSignature.beats, beatValue: score.timeSignature.beatValue });
        voice.setMode(Voice.Mode.SOFT);
        voice.addTickables(p.notes);
        formatter.joinVoices([voice]);
        return voice;
      });

      // 덜 찬 마디는 채운 만큼만 가로로 펼칩니다
      const span = stave1.getNoteEndX() - stave1.getNoteStartX() - 16;
      const used = Math.max(...parts.map((p) => p.measure.used));
      formatter.format(voices, Math.max(30, span * Math.min(1, used / mt)));

      parts.forEach((p, k) => {
        voices[k].draw(ctx, p.stave);
        Beam.generateBeams(p.notes.filter((n) => !n.isRest())).forEach((b) => {
          const lit = p.notes.some((n, i) => p.measure.items[i].index === highlight[p.part] && b.getNotes().includes(n));
          if (lit) b.setStyle({ fillStyle: accent, strokeStyle: accent });
          b.setContext(ctx).draw();
        });
        p.measure.items.forEach((item) => {
          const key = `${p.part}:${item.index}`;
          if (!positions.has(key)) positions.set(key, { top: lineTop, bottom: cursor });
        });
      });
    });
  });

  // 붙임줄: 같은 음을 나눈 조각끼리 잇기 (줄이 바뀌면 양쪽 끝에 반쪽씩)
  [1, 2].forEach((part) => {
    const list = drawn[part];
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      if (a.item.index !== b.item.index || a.item.type !== 'note') continue;
      const tie = (opts) => new StaveTie({ firstIndexes: [0], lastIndexes: [0], ...opts }).setContext(ctx).draw();
      if (a.line === b.line) tie({ firstNote: a.note, lastNote: b.note });
      else {
        tie({ firstNote: a.note });
        tie({ lastNote: b.note });
      }
    }
  });

  renderer.resize(width, cursor + 6);
  return { positions };
}
