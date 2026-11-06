// 피아노 소리: 실제 그랜드 피아노 녹음(Salamander Grand Piano)을 씁니다.
// 녹음 파일은 public/samples/piano 폴더에 들어 있어 인터넷 없이도 소리가 납니다.

import * as Tone from 'tone';
import { midiToName } from '../music/theory.js';

function sampleUrls() {
  const urls = {};
  for (let octave = 1; octave <= 7; octave++) {
    for (const note of ['C', 'D#', 'F#', 'A']) {
      urls[`${note}${octave}`] = `${note.replace('#', 's')}${octave}.mp3`;
    }
  }
  urls.C8 = 'C8.mp3';
  return urls;
}

export function createPiano() {
  let loaded = false;
  let resolveReady;
  const ready = new Promise((resolve) => (resolveReady = resolve));

  const sampler = new Tone.Sampler({
    urls: sampleUrls(),
    baseUrl: `${import.meta.env.BASE_URL}samples/piano/`,
    release: 1.2,
    onload: () => {
      loaded = true;
      resolveReady();
    },
  }).toDestination();
  sampler.volume.value = -3;

  return {
    sampler,
    ready,
    isLoaded: () => loaded,
    /** 브라우저는 사용자가 한 번 클릭/키 입력을 해야 소리를 켜 줍니다 */
    async unlock() {
      if (Tone.getContext().state !== 'running') await Tone.start();
    },
    noteOn(midi, velocity = 0.75) {
      if (!loaded) return;
      sampler.triggerAttack(midiToName(midi), Tone.now(), velocity);
    },
    noteOff(midi) {
      if (!loaded) return;
      sampler.triggerRelease(midiToName(midi), Tone.now());
    },
    play(midi, seconds, time, velocity = 0.75) {
      if (!loaded) return;
      sampler.triggerAttackRelease(midiToName(midi), seconds, time, velocity);
    },
    releaseAll() {
      sampler.releaseAll();
    },
  };
}
