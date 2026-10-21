const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../dtmf-core.js');

for (const profile of ['NTT', 'ATT']) {
  test(`Frequency exact decision boundaries: ${profile}`, () => {
    const p = core.PROFILES[profile];
    for (const sign of [-1, 1]) {
      for (const [value, expected] of [[p.accept, 'inside'], [p.accept + 0.01, 'boundary'],
        [p.reject - 0.01, 'boundary'], [p.reject, 'outside'], [p.reject + 0.01, 'outside']]) {
        assert.equal(core.frequencyStatus(sign * value, profile), expected);
      }
    }
  });
  for (const rate of [8000, 44100, 48000]) {
    test(`Frequency synthesized boundaries: ${profile}/${rate}`, () => {
      const p = core.PROFILES[profile];
      for (const key of core.KEYS.join('')) for (const sign of [-1, 1]) {
        for (const [offset, expected] of [[p.accept, key], [p.accept + 0.1, '?'],
          [p.reject - 0.1, '?'], [p.reject, ''], [p.reject + 0.1, '']]) {
          const wave = core.sequence(key, rate, { offset: sign * offset });
          const result = core.decode(wave.samples, rate, profile);
          assert.equal(result.text, expected, `${sign * offset}%: ${JSON.stringify(result.results)}`);
          assert.ok(result.results[0].estimates.length === 2);
        }
      }
    });
  }
}

for (const mode of ['ideal', 'ic']) for (const profile of ['NTT', 'ATT']) for (const rate of [8000, 44100, 48000]) {
  test(`Regression: no wrong keys across ±5%: ${mode}/${profile}/${rate}`, () => {
    for (let step = -50; step <= 50; step++) {
      for (const key of core.KEYS.join('')) {
        const wave = core.sequence(key, rate, { mode, offset: step / 10 });
        const result = core.decode(wave.samples, rate, profile);
        assert.ok(result.text === key || result.text === '' || result.text === '?',
          `${key} offset=${step / 10}: ${JSON.stringify(result.results)}`);
        for (const decision of result.results) {
          if (decision.symbol && decision.symbol !== '?') assert.ok(decision.deviation <= core.PROFILES[profile].accept);
          if (decision.deviation >= core.PROFILES[profile].reject) assert.notEqual(decision.symbol, key);
        }
      }
    }
  });
}
