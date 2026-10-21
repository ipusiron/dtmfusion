const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../dtmf-core.js');
const keys = '123A456B789C*0#D';
for (const [i, key] of [...keys].entries()) {
  test(`A mapping ${key}`, () => {
    assert.deepEqual(c.keyInfo(key), { key, row: Math.floor(i / 4), col: i % 4,
      low: c.LOW[Math.floor(i / 4)], high: c.HIGH[i % 4] });
  });
}
test('A sanitizer and invalid input', () => {
  assert.equal(c.sanitize(' 1a-2b?*#💡9Z'), '1A2B*#9');
  assert.equal(c.sanitize('1'.repeat(40)).length, 32);
  assert.equal(c.sanitize(null), '');
  assert.throws(() => c.keyInfo('X'));
  assert.throws(() => c.options({ offset: NaN }));
  assert.throws(() => c.toneSamples('1', 1000));
});
for (const mode of ['ideal', 'ic']) {
  for (const key of keys) {
    test(`B gain and ramps ${mode} ${key}`, () => {
      for (const twist of [-10, 2, 10]) {
        const samples = c.toneSamples(key, 48000, { mode, twist });
        assert.equal(samples[0], 0); assert.equal(samples.at(-1), 0);
        assert.ok(samples.every(x => Math.abs(x) <= c.MAX_GAIN + 1e-8));
      }
    });
    for (const profile of ['NTT', 'ATT']) {
      test(`C round trip ${mode} ${profile} ${key}`, () => {
        for (const rate of [8000, 44100, 48000]) {
          assert.equal(c.decode(c.sequence(key, rate, { mode }).samples, rate, profile).text, key);
        }
      });
    }
  }
}
test('B two fundamentals dominate the other six nominal frequencies', () => {
  for (const key of keys) {
    const samples = c.toneSamples(key, 48000, { toneMs: 200 });
    const power = c.FREQUENCIES.map(f => c.goertzel(samples, f, 48000));
    const k = c.keyInfo(key), wanted = Math.min(power[k.row], power[k.col + 4]);
    for (let i = 0; i < 8; i++) if (i !== k.row && i !== k.col + 4) assert.ok(power[i] < wanted / 1000);
  }
});
for (const profile of ['NTT', 'ATT']) {
  test(`C timing boundaries ${profile}`, () => {
    const p = c.PROFILES[profile];
    for (const [ms, expected] of [[10, ''], [p.short, ''], [p.short + 1, '?'], [39, '?'], [40, '5'], [80, '5']]) {
      assert.equal(c.decode(c.sequence('5', 48000, { toneMs: ms }).samples, 48000, profile).text, expected, `${ms}ms`);
    }
    for (const [pauseMs, expected] of [[0, '5'], [p.pause - 1, '5'], [p.pause, '55']]) {
      assert.equal(c.decode(c.sequence('55', 48000, { pauseMs }).samples, 48000, profile).text, expected);
    }
  });
  test(`C twist acceptance and rejection ${profile}`, () => {
    const p = c.PROFILES[profile];
    for (const [twist, expected] of [[p.min, '5'], [p.max, '5'], [p.min - 1, ''], [p.max + 1, '']]) {
      assert.equal(c.decode(c.sequence('5', 48000, { twist }).samples, 48000, profile).text, expected, `${twist}dB`);
    }
  });
  test(`C frequency offset and deterministic noise ${profile}`, () => {
    assert.equal(c.decode(c.sequence(keys, 48000).samples, 48000, profile).text, keys);
    assert.equal(c.decode(c.sequence('5', 48000, { offset: 5 }).samples, 48000, profile).text, '');
    let seed = 3;
    const noise = new Float32Array(48000);
    for (let i = 0; i < noise.length; i++) { seed = (1664525 * seed + 1013904223) >>> 0; noise[i] = (seed / 2 ** 32 - 0.5) * 0.02; }
    assert.equal(c.decode(noise, 48000, profile).text, '');
  });
}
test('C NTT interruption up to 10ms is bridged', () => {
  const tone = c.toneSamples('5', 48000, { toneMs: 40 });
  const samples = new Float32Array(2400);
  samples.set(tone.subarray(0, 960)); samples.set(tone.subarray(960), 1440);
  assert.equal(c.decode(samples, 48000, 'NTT').text, '5');
});
test('C zero input and chunked input', () => {
  assert.equal(c.decode(new Float32Array(4800), 48000).text, '');
  const wave = c.sequence(keys).samples, d = c.createDecoder(48000);
  for (let i = 0; i < wave.length; i += 731) d.push(wave.subarray(i, i + 731));
  assert.equal(d.flush().text, keys);
});
for (const [profile, accept, reject] of [['NTT', 1.8, 3], ['ATT', 1.5, 3.5]]) {
  test(`C2 frequency boundaries ${profile}`, () => {
    for (const sign of [-1, 1]) {
      for (const [offset, expected] of [[accept, 'inside'], [accept + 0.01, 'boundary'], [reject - 0.01, 'boundary'], [reject, 'outside']]) {
        assert.equal(c.standards({ offset: sign * offset }).rows[profile].fields.frequency, expected);
      }
    }
  });
  test(`C2 time, twist, pause and cycle boundaries ${profile}`, () => {
    const p = c.PROFILES[profile];
    assert.equal(c.standards({ toneMs: 40 }).rows[profile].fields.duration, 'inside');
    assert.equal(c.standards({ toneMs: p.short }).rows[profile].fields.duration, 'outside');
    assert.equal(c.standards({ toneMs: p.short + 1 }).rows[profile].fields.duration, 'boundary');
    for (const [pauseMs, expected] of [[p.pause, 'inside'], [p.pause - 1, 'outside']]) {
      assert.equal(c.standards({ pauseMs }).rows[profile].fields.pause, expected);
    }
    for (const twist of [p.min, p.max]) assert.equal(c.standards({ twist }).rows[profile].fields.twist, 'inside');
    assert.equal(c.standards({ toneMs: 60, pauseMs: p.cycle - 60 }).rows[profile].fields.cycle, 'inside');
    assert.equal(c.standards({ toneMs: 60, pauseMs: p.cycle - 61 }).rows[profile].fields.cycle, 'outside');
  });
}
test('C2 Q23 and Japanese sender limits', () => {
  assert.equal(c.standards({ offset: 1.8 }).rows.Q23.status, 'inside');
  assert.equal(c.standards({ offset: 1.8001 }).rows.Q23.status, 'outside');
  assert.equal(c.standards({ offset: 1.5, twist: 0, toneMs: 50, pauseMs: 70 }).rows.JP.status, 'inside');
  assert.equal(c.standards({ twist: -0.01 }).rows.JP.status, 'outside');
  assert.equal(c.standards({}, 'A').rows.JP.status, 'outside');
  assert.ok(Object.values(c.standards().rows).every(r => r.status === 'inside'));
});
test('C3 divider estimates are distinct from Table I frequencies', () => {
  c.DIVISORS.forEach((n, i) => assert.ok(Math.abs(3579545 / (28 * n) - c.IC[i]) < (i === 2 ? 0.14 : 0.06)));
  assert.equal((3579545 / (28 * 150)).toFixed(2), '852.27');
  assert.equal(c.keyInfo('7', 'ic').low, 852.4);
  assert.equal(c.options({ mode: 'ic' }).twist, 2.7);
  assert.equal(c.windowLength(8000), 205); assert.equal(c.windowLength(48000), 1229);
});
