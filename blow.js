// Decides whether the mic is hearing someone blow.
// A blow is loud, weighted toward low frequencies, noisy rather than tonal,
// and sustained for about 0.3 seconds.
class BlowDetector {
  static FFT_SIZE = 4096;
  static MIN_THRESHOLD = 0.02;  // quietest RMS that can count as a blow
  static FLOOR_MULTIPLE = 3;    // how far above room noise a blow must be
  static FULL_SCALE_DB = 18;    // dB above threshold that counts as full strength
  static MIN_LOW_RATIO = 0.1;   // share of energy below 1500 Hz; rejects "shhh"
  static MIN_NOISINESS = 0.2;   // flatness of the spectrum; rejects voices and music
  static HOLD_SECONDS = 0.3;
  static CALIBRATE_SECONDS = 0.5;
  static NOISY_ROOM_FLOOR = 0.06;
  static SILENT_RMS = 0.0002;
  static SILENT_SECONDS = 2;

  constructor() {
    this.reading = { strength: 0, rms: 0, lowRatio: 0, noisiness: 0, floor: 0, threshold: 0, candidate: false, noisyRoom: false, silent: false };
    this.held = 0;
    this.strength = 0;
    this.elapsed = 0;
    this.calibration = [];
    this.floor = 0;
    this.silentFor = 0;
  }

  // Call from a user gesture so the audio context is allowed to start.
  async start() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
    this.ctx = new AudioCtx();
    this.ctx.resume();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      this.ctx.close();
      throw err;
    }
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = BlowDetector.FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0;
    // Not connected to the speakers, so the mic is never played back.
    this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
    this.spectrum = new Float32Array(this.analyser.frequencyBinCount);
    this.samples = new Float32Array(this.analyser.fftSize);
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.stream = this.ctx = this.analyser = null;
  }

  update(dt) {
    if (!this.analyser) return this.reading;
    this.analyser.getFloatTimeDomainData(this.samples);
    this.analyser.getFloatFrequencyData(this.spectrum);

    const rms = Math.sqrt(this.samples.reduce((sum, s) => sum + s * s, 0) / this.samples.length);
    this.elapsed += dt;
    this.silentFor = rms < BlowDetector.SILENT_RMS ? this.silentFor + dt : 0;

    if (this.elapsed < BlowDetector.CALIBRATE_SECONDS) {
      this.calibration.push(rms);
      const sorted = [...this.calibration].sort((a, b) => a - b);
      this.floor = sorted[sorted.length >> 1];
      return this.reading;
    }

    const threshold = Math.max(BlowDetector.MIN_THRESHOLD, this.floor * BlowDetector.FLOOR_MULTIPLE);
    const { lowRatio, noisiness } = this.analyzeSpectrum();
    const candidate = rms > threshold && lowRatio > BlowDetector.MIN_LOW_RATIO && noisiness > BlowDetector.MIN_NOISINESS;

    // Follow room noise: drop quickly, rise slowly so a blow barely moves it.
    const tau = rms < this.floor ? 0.3 : candidate ? 10 : 3;
    this.floor += (rms - this.floor) * Math.min(1, dt / tau);

    this.held = candidate
      ? Math.min(BlowDetector.HOLD_SECONDS + 0.2, this.held + dt)
      : Math.max(0, this.held - dt * 1.5);

    const db = 20 * Math.log10(Math.max(rms, 1e-6) / threshold);
    const target = candidate && this.held >= BlowDetector.HOLD_SECONDS
      ? Math.min(1, Math.max(0, db / BlowDetector.FULL_SCALE_DB))
      : 0;
    this.strength += (target - this.strength) * Math.min(1, dt / (target > this.strength ? 0.05 : 0.15));

    this.reading = {
      strength: this.strength, rms, lowRatio, noisiness, floor: this.floor, threshold, candidate,
      noisyRoom: this.floor > BlowDetector.NOISY_ROOM_FLOOR,
      silent: this.silentFor > BlowDetector.SILENT_SECONDS,
    };
    return this.reading;
  }

  analyzeSpectrum() {
    const hzPerBin = this.ctx.sampleRate / BlowDetector.FFT_SIZE;
    const bin = (hz) => Math.min(this.spectrum.length - 1, Math.round(hz / hzPerBin));
    const power = (db) => 10 ** (Math.max(db, -140) / 10);

    let low = 0, total = 0;
    for (let i = bin(30); i <= bin(8000); i++) {
      const p = power(this.spectrum[i]);
      total += p;
      if (i <= bin(1500)) low += p;
    }

    return { lowRatio: total > 0 ? low / total : 0, noisiness: this.flatness(bin(80), bin(1000)) };
  }

  // Spectral flatness after removing the overall downward slope, so a low
  // rumble scores as noisy. Random noise lands near 0.5, harmonics well below.
  flatness(from, to) {
    const n = to - from + 1;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = from; i <= to; i++) {
      const x = Math.log(i), y = Math.max(this.spectrum[i], -140);
      sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
    const offset = (sy - slope * sx) / n;

    let logSum = 0, sum = 0;
    for (let i = from; i <= to; i++) {
      const residual = Math.max(this.spectrum[i], -140) - (slope * Math.log(i) + offset);
      const p = 10 ** (residual / 10);
      logSum += Math.log(p);
      sum += p;
    }
    return sum > 0 ? Math.exp(logSum / n) / (sum / n) : 0;
  }
}
