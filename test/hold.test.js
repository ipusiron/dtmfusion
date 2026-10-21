const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../dtmf-core.js');

function loop(key, rate, settings) {
  const iterator = core.holdTone(key, rate, settings);
  let next, yields = 0;
  do { next = iterator.next(); yields++; } while (!next.done);
  return { ...next.value, yields };
}

for (const rate of [8000, 44100, 48000, 96000]) {
  for (const mode of ['ideal', 'ic']) {
    test(`Held ${mode} loops: all keys, offsets and twists at ${rate} Hz`, () => {
      for (const offset of [-5, -1.8, 0, 1.8, 5]) {
        for (const twist of [-10, mode === 'ic' ? 2.7 : 2, 10]) {
          for (const key of core.KEYS.join('')) {
            const result = loop(key, rate, { mode, offset, twist });
            const { samples, seconds, seam, maxStep } = result;
            assert.ok(seconds >= 0.5 && seconds <= 2, `${mode} ${key} ${offset}: ${seconds}`);
            if (mode === 'ideal' && offset === 0) assert.equal(seconds, 1);
            assert.ok(result.yields > 1, 'preparation yields between bounded chunks');
            let measuredMax = 0, peak = 0;
            for (let i = 0; i < samples.length; i++) {
              peak = Math.max(peak, Math.abs(samples[i]));
              if (i) measuredMax = Math.max(measuredMax, Math.abs(samples[i] - samples[i - 1]));
            }
            assert.equal(seam, Math.abs(samples[0] - samples.at(-1)));
            assert.equal(maxStep, measuredMax);
            assert.ok(seam <= maxStep + 1e-7, `${mode} ${key} ${offset}: seam ${seam} > ${maxStep}`);
            assert.ok(peak <= core.MAX_GAIN + 1e-7, `peak ${peak}`);
          }
        }
      }
    });
  }
}

test('Loop samples preserve nominal/IC waveform and do not fade at each seam', () => {
  for (const mode of ['ideal', 'ic']) {
    const { samples } = loop('5', 48000, { mode });
    const reference = core.toneSamples('5', 48000, { mode }, 0.1);
    assert.deepEqual(samples.slice(480, 4000), reference.slice(480, 4000));
    const [a, b] = core.actualFrequencies('5', { mode });
    const frame = samples.subarray(1000, 1000 + core.windowLength(48000));
    assert.ok(core.goertzel(frame, a, 48000) > 0.001);
    assert.ok(core.goertzel(frame, b, 48000) > 0.001);
    assert.ok(samples.slice(-96).some(x => Math.abs(x) > 0.1));
  }
});
