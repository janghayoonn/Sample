// 멜로디를 MIDI 파일(.mid)로 내보내기
// 나중에 MusicXML 내보내기도 이 폴더(src/export)에 같은 모양으로 추가하면 됩니다.

import { Midi } from '@tonejs/midi';
import { PPQ, toTimeline } from '../music/theory.js';

export function scoreToMidi(score) {
  const midi = new Midi();
  midi.header.setTempo(score.bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [score.timeSignature.beats, score.timeSignature.beatValue],
  });
  midi.header.update();

  const track = midi.addTrack();
  track.name = 'Melody';
  track.instrument.number = 0; // Acoustic Grand Piano

  const scale = midi.header.ppq / PPQ;
  for (const ev of toTimeline(score.melody)) {
    if (ev.midi == null) continue;
    track.addNote({
      midi: ev.midi,
      ticks: Math.round(ev.start * scale),
      durationTicks: Math.round(ev.ticks * scale),
      velocity: 0.8,
    });
  }
  return midi.toArray();
}

export function downloadMidi(score) {
  const bytes = scoreToMidi(score);
  const blob = new Blob([bytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `melody-${stamp}.mid`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
