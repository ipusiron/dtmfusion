/* DTMFusion - MIT (c) 2026 IPUSIRON. Pure DSP and source-specific limits. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DTMFCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LOW = Object.freeze([697, 770, 852, 941]);
  const HIGH = Object.freeze([1209, 1336, 1477, 1633]);
  const KEYS = Object.freeze(['123A', '456B', '789C', '*0#D']);
  const IC = Object.freeze([694.8, 770.1, 852.4, 940.0, 1206.0, 1331.7, 1486.5, 1639.0]);
  const DIVISORS = Object.freeze([184, 166, 150, 136, 106, 96, 86, 78]);
  const FREQUENCIES = Object.freeze([...LOW, ...HIGH]);
  const MAX_GAIN = 10 ** (-12 / 20), RECEIVE_POWER_FLOOR = 1e-12;
  const DOMINANCE_RATIO = 6, WINDOW_SECONDS = 0.0256;
  const PROFILES = Object.freeze({
    NTT: Object.freeze({ accept: 1.8, reject: 3, short: 24, pause: 30, cycle: 120, min: -5, max: 5 }),
    ATT: Object.freeze({ accept: 1.5, reject: 3.5, short: 23, pause: 40, cycle: 93, min: -8, max: 4 })
  });
  function rateValue(rate) {
    if (!Number.isInteger(rate) || rate < 8000 || rate > 96000) throw new RangeError('invalidRate');
    return rate;
  }
  function sanitize(value) {
    return typeof value === 'string' ? value.toUpperCase().replace(/[^0-9A-D*#]/g, '').slice(0, 32) : '';
  }
  function keyInfo(key, mode = 'ideal') {
    const row = KEYS.findIndex(line => line.includes(key) && key.length === 1);
    if (row < 0) throw new RangeError('invalidKey');
    const col = KEYS[row].indexOf(key);
    const f = mode === 'ic' ? IC : FREQUENCIES;
    return { key, row, col, low: f[row], high: f[col + 4] };
  }
  function options(input = {}) {
    const o = { mode: 'ideal', offset: 0, toneMs: 80, pauseMs: 60, ...input };
    if (o.twist === undefined) o.twist = o.mode === 'ic' ? 2.7 : 2;
    if (!['ideal', 'ic'].includes(o.mode)) throw new RangeError('invalidMode');
    for (const [k, min, max] of [['twist', -10, 10], ['offset', -5, 5], ['toneMs', 10, 200], ['pauseMs', 0, 200]]) {
      if (!Number.isFinite(o[k]) || o[k] < min || o[k] > max) throw new RangeError('invalidOptions');
    }
    return o;
  }
  function actualFrequencies(key, input) {
    const o = options(input), k = keyInfo(key, o.mode), scale = 1 + o.offset / 100;
    return [k.low * scale, k.high * scale];
  }
  // Sample calculation and ramps follow Day120 toneSamples; no oscillator nodes.
  function toneSamples(key, rate, input = {}, seconds) {
    rateValue(rate);
    const o = options(input), frequencies = actualFrequencies(key, o);
    const duration = seconds === undefined ? o.toneMs / 1000 : seconds;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 60) throw new RangeError('invalidDuration');
    const count = Math.round(duration * rate), ramp = Math.min(Math.round(0.002 * rate), Math.floor(count / 2));
    const out = new Float32Array(count), ratio = 10 ** (o.twist / 20), low = MAX_GAIN / (1 + ratio);
    function wave(phase) {
      if (o.mode === 'ic') phase = Math.floor((phase % 1) * 28) / 28;
      return Math.sin(2 * Math.PI * phase);
    }
    for (let i = 0; i < count; i++) {
      const envelope = Math.max(0, Math.min(1, i / ramp, (count - 1 - i) / ramp));
      out[i] = low * (wave(frequencies[0] * i / rate) + ratio * wave(frequencies[1] * i / rate)) * envelope;
    }
    out[0] = 0; out[count - 1] = 0;
    return out;
  }
  function sequence(value, rate = 48000, input = {}) {
    rateValue(rate);
    const keys = sanitize(value), o = options(input);
    const on = Math.round(o.toneMs * rate / 1000), off = Math.round(o.pauseMs * rate / 1000);
    const samples = new Float32Array(keys.length * (on + off)), timeline = [];
    [...keys].forEach((key, i) => {
      const start = i * (on + off);
      samples.set(toneSamples(key, rate, o), start);
      timeline.push({ key, start: start / rate, end: (start + on) / rate });
    });
    return { samples, rate, keys, timeline, settings: o };
  }
  function windowLength(rate) { return Math.round(rateValue(rate) * WINDOW_SECONDS); }
  function goertzel(samples, frequency, rate, hann = true) {
    const n = samples.length;
    if (!n) return 0;
    const coefficient = 2 * Math.cos(2 * Math.PI * frequency / rate);
    let s1 = 0, s2 = 0, weight = 0;
    for (let i = 0; i < n; i++) {
      const w = hann && n > 1 ? 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)) : 1;
      const s = samples[i] * w + coefficient * s1 - s2;
      s2 = s1; s1 = s; weight += w;
    }
    return Math.max(0, s1 * s1 + s2 * s2 - coefficient * s1 * s2) * 4 / (weight * weight);
  }
  function analyze(samples, rate, profile = 'NTT') {
    const p = PROFILES[profile];
    if (!p) throw new RangeError('invalidProfile');
    const powers = FREQUENCIES.map(f => goertzel(samples, f, rate));
    const rank = start => [0, 1, 2, 3].map(i => i + start).sort((a, b) => powers[b] - powers[a]);
    const l = rank(0), h = rank(4);
    const ratio = Math.min(powers[l[0]] / Math.max(powers[l[1]], RECEIVE_POWER_FLOOR),
      powers[h[0]] / Math.max(powers[h[1]], RECEIVE_POWER_FLOOR));
    const twist = Math.round(100 * Math.log10(Math.max(powers[h[0]], RECEIVE_POWER_FLOOR) /
      Math.max(powers[l[0]], RECEIVE_POWER_FLOOR))) / 10;
    let reason = 'accepted';
    if (Math.min(powers[l[0]], powers[h[0]]) <= RECEIVE_POWER_FLOOR) reason = 'tooQuiet';
    else if (ratio < DOMINANCE_RATIO) reason = 'ambiguous';
    else if (twist < p.min || twist > p.max) reason = 'twistOutside';
    return { key: KEYS[l[0]][h[0] - 4], powers, ratio, twist, reason,
      confidence: reason === 'accepted' ? Math.min(1, Math.log10(ratio) / 2) : 0 };
  }
  function durationStatus(ms, profile) {
    if (ms >= 40 - 1e-7) return 'inside';
    return ms <= PROFILES[profile].short + 1e-7 ? 'outside' : 'boundary';
  }
  function standards(input = {}, key = '1') {
    const o = options(input), f = actualFrequencies(key, o), k = keyInfo(key);
    const deviation = Math.max(Math.abs(100 * (f[0] / k.low - 1)), Math.abs(100 * (f[1] / k.high - 1)));
    const within = (x, min, max = Infinity) => x >= min - 1e-9 && x <= max + 1e-9;
    const result = fields => ({ fields, status: Object.values(fields).includes('outside') ? 'outside' :
      Object.values(fields).includes('boundary') ? 'boundary' : 'inside' });
    const state = ok => ok ? 'inside' : 'outside';
    const rows = { Q23: result({ frequency: state(within(deviation, 0, 1.8)) }) };
    for (const name of ['NTT', 'ATT']) {
      const p = PROFILES[name];
      const frequency = within(deviation, 0, p.accept) ? 'inside' :
        deviation >= p.reject - 1e-9 ? 'outside' : 'boundary';
      rows[name] = result({ frequency, duration: durationStatus(o.toneMs, name),
        pause: state(within(o.pauseMs, p.pause)), cycle: state(within(o.toneMs + o.pauseMs, p.cycle)),
        twist: state(within(o.twist, p.min, p.max)) });
    }
    rows.JP = result({ frequency: state(within(deviation, 0, 1.5)), duration: state(within(o.toneMs, 50)),
      pause: state(within(o.pauseMs, 30)), cycle: state(within(o.toneMs + o.pauseMs, 120)),
      twist: state(within(o.twist, 0, 5)), column: state(k.col < 3) });
    return { deviation, rows };
  }
  // A bounded streaming receiver. PCM is discarded after each analysis window.
  // 1 ms energy blocks time the envelope independently of the 25.6 ms frequency window.
  function createDecoder(rate, profile = 'NTT') {
    rateValue(rate);
    const p = PROFILES[profile];
    if (!p) throw new RangeError('invalidProfile');
    const n = windowLength(rate), hop = Math.max(1, Math.round(rate / 1000));
    let ring = new Float32Array(n), pos = 0, filled = 0, blockCount = 0, blockEnergy = 0;
    let on = 0, gap = 0, elapsed = 0, candidate = null, votes = new Map(), last = null;
    let pending = 0, reasons = new Set(), results = [];
    function finish() {
      if (!on) return;
      let reason = candidate ? candidate.reason : 'tooShort';
      const duration = on * 1000 / rate, state = durationStatus(duration, profile);
      if (state === 'outside') reason = 'tooShort';
      else if (state === 'boundary') reason = 'durationBoundary';
      else if (votes.size > 1) reason = 'missingPause';
      const confidence = candidate ? 1 - (1 - candidate.confidence) ** Math.max(1, votes.get(candidate.key) || 0) : 0;
      if (reason === 'accepted' && confidence < 0.5) reason = 'lowConfidence';
      const symbol = reason === 'accepted' ? candidate.key :
        ['durationBoundary', 'missingPause', 'lowConfidence'].includes(reason) ? '?' : '';
      results.push({ symbol, key: candidate ? candidate.key : null, reason, duration,
        confidence, twist: candidate ? candidate.twist : null });
      on = gap = pending = 0; candidate = null; votes = new Map(); reasons.clear();
    }
    function frame() {
      const loud = blockEnergy / blockCount > RECEIVE_POWER_FLOOR;
      if (loud) {
        if (gap && gap * 1000 / rate <= 10 + 1e-7 && profile === 'NTT') on += gap;
        else if (gap) reasons.add('shortPause');
        gap = 0; on += blockCount; pending += blockCount;
        if (filled === n && pending >= n / 4) {
          const samples = new Float32Array(n);
          samples.set(ring.subarray(pos)); samples.set(ring.subarray(0, pos), n - pos);
          last = analyze(samples, rate, profile); samples.fill(0); pending = 0;
          if (last.reason === 'accepted') votes.set(last.key, (votes.get(last.key) || 0) + 1);
          if (!candidate || (last.reason === 'accepted' && candidate.reason !== 'accepted') || last.ratio > candidate.ratio) {
            candidate = last;
          }
        }
      } else if (on) {
        gap += blockCount;
        if (gap * 1000 / rate >= p.pause - 1e-7) finish();
      }
      elapsed += blockCount; blockCount = blockEnergy = 0;
    }
    function push(samples) {
      for (const x of samples) {
        if (!Number.isFinite(x) || Math.abs(x) > 1) throw new RangeError('invalidSamples');
        ring[pos] = x; pos = (pos + 1) % n; filled = Math.min(n, filled + 1);
        blockEnergy += x * x; blockCount++;
        if (blockCount === hop) frame();
      }
      return snapshot();
    }
    function snapshot() { return { text: results.map(r => r.symbol).join(''), results: [...results], last }; }
    function flush() {
      if (blockCount) frame();
      finish(); ring.fill(0);
      return snapshot();
    }
    return { push, flush, snapshot };
  }
  function decode(samples, rate, profile = 'NTT') {
    const decoder = createDecoder(rate, profile);
    decoder.push(samples);
    return decoder.flush();
  }
  return Object.freeze({ LOW, HIGH, KEYS, IC, DIVISORS, FREQUENCIES, MAX_GAIN, RECEIVE_POWER_FLOOR,
    DOMINANCE_RATIO, WINDOW_SECONDS, PROFILES, rateValue, sanitize, keyInfo, options, actualFrequencies,
    toneSamples, sequence, windowLength, goertzel, analyze, durationStatus, standards, createDecoder, decode });
}));
