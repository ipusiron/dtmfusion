const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../dtmf-core.js');
for (const mode of ['ideal', 'ic']) for (const profile of ['NTT', 'ATT']) {
  test(`WAV 16 keys ${mode}/${profile}`, () => {
    const wave = c.sequence('123A456B789C*0#D', 48000, { mode });
    const pcm = c.decodeWav(c.encodeWav(wave.samples, wave.rate));
    assert.equal(c.decode(pcm.samples, pcm.rate, profile).text, wave.keys);
    assert.equal(pcm.channels, 1);
  });
}
test('WAV malformed headers, oversized duration, nonfinite samples', () => {
  assert.throws(() => c.decodeWav(new ArrayBuffer(44)));
  const buffer = c.encodeWav(c.sequence('1').samples, 48000);
  new DataView(buffer).setUint32(24, 1, true);
  assert.throws(() => c.decodeWav(buffer));
  assert.throws(() => c.encodeWav(new Float32Array([NaN]), 48000));
});
