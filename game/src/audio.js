// Sound, all synthesised with WebAudio: no audio files, no network. The
// context is created on the first user gesture (browsers block sound before
// one), every effect is a short oscillator or noise burst, and a quiet bass
// loop plays while the game runs. In screenshot mode nothing ever gestures,
// so this file stays silent there and never throws.

const MUSIC_NOTES = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
const NOTE_STEP = 0.42;

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let musicTimer = 0;
  let musicIndex = 0;
  let muted = false;
  let musicOn = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** Call from a user gesture (start button, key press) to unlock sound. */
  function unlock() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
    startMusic();
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!context || muted) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, context.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + dur);
      gain.gain.setValueAtTime(vol || 0.2, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(context.currentTime + dur + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(dur, vol, filterFreq) {
    if (!context || muted) return;
    try {
      const len = Math.max(1, Math.floor(context.sampleRate * dur));
      const buffer = context.createBuffer(1, len, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = context.createGain();
      gain.gain.value = vol || 0.3;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function startMusic() {
    if (musicOn || !context) return;
    musicOn = true;
    musicIndex = 0;
    function schedule() {
      if (!musicOn) return;
      if (!muted) {
        const freq = MUSIC_NOTES[musicIndex % MUSIC_NOTES.length];
        tone(freq, NOTE_STEP * 0.9, 'triangle', 0.10);
        if (musicIndex % 2 === 0) tone(freq * 2, 0.08, 'sine', 0.05);
      }
      musicIndex += 1;
      musicTimer = window.setTimeout(schedule, NOTE_STEP * 1000);
    }
    schedule();
  }

  function setEngine(speedRatio) {
    if (!context) return;
    try {
      if (!engineOsc) {
        engineOsc = context.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 60;
        engineGain = context.createGain();
        engineGain.gain.value = 0;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const target = muted ? 0 : speedRatio * 0.06;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + speedRatio * 130, context.currentTime, 0.1);
    } catch {
      // Ignore.
    }
  }

  function setSiren(on) {
    if (!context) return;
    try {
      if (on && !sirenOsc) {
        sirenOsc = context.createOscillator();
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 700;
        sirenLfo = context.createOscillator();
        sirenLfo.type = 'sine';
        sirenLfo.frequency.value = 0.9;
        const lfoGain = context.createGain();
        lfoGain.gain.value = 260;
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenGain = context.createGain();
        sirenGain.gain.value = muted ? 0 : 0.045;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenLfo.start();
      } else if (!on && sirenOsc) {
        sirenOsc.stop();
        sirenLfo.stop();
        sirenOsc = null;
        sirenLfo = null;
        sirenGain = null;
      }
      if (sirenGain) sirenGain.gain.value = muted ? 0 : 0.045;
    } catch {
      // Ignore.
    }
  }

  return {
    unlock,
    shoot() {
      noise(0.14, 0.35, 2600);
      tone(180, 0.08, 'square', 0.12, 60);
    },
    enemyShoot() {
      noise(0.1, 0.14, 1800);
    },
    punch() {
      noise(0.09, 0.3, 500);
      tone(90, 0.1, 'sine', 0.25, 45);
    },
    hit() {
      tone(140, 0.12, 'sawtooth', 0.18, 70);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.18);
      window.setTimeout(() => tone(1320, 0.12, 'sine', 0.18), 70);
    },
    crash() {
      noise(0.25, 0.4, 700);
    },
    horn() {
      tone(370, 0.18, 'square', 0.1);
      tone(466, 0.18, 'square', 0.08);
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => tone(f, 0.22, 'triangle', 0.2), i * 110));
    },
    busted() {
      [392, 311, 233].forEach((f, i) => window.setTimeout(() => tone(f, 0.3, 'sawtooth', 0.16), i * 160));
    },
    setEngine,
    setSiren,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
