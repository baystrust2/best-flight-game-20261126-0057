// Sky Courier — all sound is synthesized in WebAudio: engine drone, wind,
// ring chimes, touchdown thump and alarms. No audio files are loaded.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windSrc = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned sawtooth oscillators through a lowpass.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55.7;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filt);
      engineOsc2.connect(filt);
      filt.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped filtered noise.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      const windFilt = ctx.createBiquadFilter();
      windFilt.type = 'bandpass';
      windFilt.frequency.value = 500;
      windFilt.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilt);
      windFilt.connect(windGain);
      windGain.connect(master);
      windSrc.start();
      started = true;
    } catch {
      ctx = null;
    }
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  return {
    get muted() {
      return muted;
    },
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    // Called every frame with flight state: engine note follows throttle,
    // wind follows airspeed.
    update(throttle, speed, airborne) {
      if (!ctx || !started) return;
      const t = ctx.currentTime;
      const rpm = 42 + throttle * 58 + speed * 0.12;
      engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(rpm * 1.013 + 0.6, t, 0.08);
      engineGain.gain.setTargetAtTime(airborne ? 0.05 + throttle * 0.11 : 0.03, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.16, speed * 0.0016), t, 0.15);
    },
    ring() {
      blip(880, 0.35, 'sine', 0.32);
      blip(1318, 0.5, 'sine', 0.22, 0.07);
    },
    click() {
      blip(1200, 0.06, 'square', 0.12);
    },
    thump() {
      blip(70, 0.22, 'sine', 0.5);
      blip(140, 0.12, 'triangle', 0.2, 0.02);
    },
    crash() {
      blip(55, 0.7, 'sawtooth', 0.4);
      blip(38, 0.9, 'sine', 0.4, 0.05);
    },
    alarm() {
      blip(660, 0.12, 'square', 0.14);
      blip(660, 0.12, 'square', 0.14, 0.18);
    },
    fanfare() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.5, 'triangle', 0.25, i * 0.12));
    },
  };
}
