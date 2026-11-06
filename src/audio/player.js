// '악보 연주' 기능: 악보 데이터를 시간표로 바꿔 순서대로 피아노로 칩니다.
// 나중에 반주 트랙이 생기면 play() 안에서 같은 방식으로 함께 예약하면 됩니다.

import * as Tone from 'tone';
import { PPQ, toTimeline, totalTicks } from '../music/theory.js';

export function createPlayer(piano) {
  const transport = Tone.getTransport();
  const draw = Tone.getDraw();
  transport.PPQ = PPQ;

  let playing = false;
  let handlers = {};

  function stop() {
    const wasPlaying = playing;
    playing = false;
    transport.stop();
    transport.cancel(0);
    piano.releaseAll();
    if (wasPlaying) handlers.onEnd?.();
  }

  async function play(score, { onStep, onEnd } = {}) {
    if (playing) stop();
    await piano.unlock();
    await piano.ready;
    if (!score.melody.length) return;

    handlers = { onStep, onEnd };
    transport.cancel(0);
    transport.position = 0;
    transport.bpm.value = score.bpm;

    for (const ev of toTimeline(score.melody)) {
      transport.schedule((time) => {
        if (ev.midi != null) {
          // 다음 음과 살짝 떨어지도록 길이의 95%만 누릅니다
          const seconds = Tone.Ticks(ev.ticks).toSeconds() * 0.95;
          piano.play(ev.midi, seconds, time);
        }
        draw.schedule(() => playing && onStep?.(ev), time);
      }, `${ev.start}i`);
    }

    transport.schedule((time) => {
      draw.schedule(() => playing && stop(), time + 0.3);
    }, `${totalTicks(score.melody)}i`);

    playing = true;
    transport.start('+0.08');
  }

  return {
    play,
    stop,
    isPlaying: () => playing,
    setBpm(bpm) {
      transport.bpm.value = bpm;
    },
  };
}
