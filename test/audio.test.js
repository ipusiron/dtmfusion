const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../audio-io.js');
function setup(pending = false) {
  const timers = new Map(), sources = [], contexts = [], requests = [];
  let release, id = 0, stopped = 0;
  const track = new EventTarget();
  Object.assign(track, { muted: false, readyState: 'live', getSettings: () => ({ echoCancellation: false }),
    stop() { stopped++; this.readyState = 'ended'; } });
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const simple = () => ({ connect() {}, disconnect() { this.disconnected = true; } });
  class Context extends EventTarget {
    constructor() { super(); this.sampleRate = 48000; this.state = 'running'; this.currentTime = 0; contexts.push(this); }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; }
    createMediaStreamSource() { return simple(); }
    createAnalyser() { return { ...simple(), getFloatTimeDomainData(data) { data.fill(0); } }; }
    createBuffer(channels, count) { return { count, copyToChannel(samples) { this.samples = samples.slice(); } }; }
    createGain() { return { ...simple(), gain: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} } }; }
    createBufferSource() {
      const source = new EventTarget(); Object.assign(source, simple(), { start() {}, stop() { this.stopped = true; } });
      sources.push(source); return source;
    }
  }
  const host = { AudioContext: Context, setTimeout(fn, ms) { timers.set(++id, { fn, ms }); return id; },
    clearTimeout(key) { timers.delete(key); }, navigator: { audioSession: { type: 'auto' }, mediaDevices: {
      getSupportedConstraints: () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: true }),
      getUserMedia(request) { requests.push(request); return pending ? new Promise(r => { release = r; }) : Promise.resolve(stream); }
    } } };
  return { audio: create(host), host, timers, contexts, sources, requests, track, release: () => release(stream), stopped: () => stopped };
}
test('Audio is created only after user action; buffer playback and stop ramp', async () => {
  const f = setup(); assert.equal(f.contexts.length, 0);
  await f.audio.play('5', {}); assert.equal(f.sources.length, 1); assert.equal(f.requests.length, 0);
  assert.equal(f.sources[0].buffer.count, 6720);
  f.audio.stopTone(); assert.ok(f.sources[0].stopped);
  f.sources[0].dispatchEvent(new Event('ended')); assert.equal(f.sources[0].buffer, null);
  await f.audio.close(); assert.equal(f.contexts[0].state, 'closed');
});
test('Microphone constraints, concurrent playback session and stop all tracks', async () => {
  const f = setup(); await f.audio.microphone('NTT', () => {});
  assert.equal(f.requests[0].audio.echoCancellation.ideal, false);
  assert.equal(f.requests[0].audio.noiseSuppression.ideal, false);
  assert.equal(f.requests[0].audio.autoGainControl.ideal, false);
  await f.audio.play('5', {}); assert.equal(f.host.navigator.audioSession.type, 'play-and-record');
  f.audio.stop(); assert.equal(f.stopped(), 1); assert.equal(f.timers.size, 0);
});
test('Stop while permission is pending prevents a late live stream', async () => {
  const f = setup(true), promise = f.audio.microphone('NTT', () => {});
  await new Promise(r => setImmediate(r)); f.audio.stop(); f.release();
  await assert.rejects(promise, /cancelled/); assert.equal(f.stopped(), 1); assert.equal(f.timers.size, 0);
});
for (const event of ['mute', 'ended']) test(`Microphone ${event} releases tracks`, async () => {
  const f = setup(); let reason;
  await f.audio.microphone('NTT', () => {}, key => { reason = key; });
  f.track.dispatchEvent(new Event(event)); assert.equal(reason, 'inputInterrupted'); assert.equal(f.stopped(), 1);
});
test('Microphone auto stop is scheduled at exactly 60 seconds', async () => {
  const f = setup(); let reason;
  await f.audio.microphone('NTT', () => {}, key => { reason = key; });
  const deadline = [...f.timers.values()].find(x => x.ms === 60000); assert.ok(deadline);
  deadline.fn(); assert.equal(reason, 'autoStopped'); assert.equal(f.stopped(), 1);
});
test('Context interruption stops output and input', async () => {
  const f = setup(); let reason; f.audio.onInterrupted(key => { reason = key; });
  await f.audio.microphone('NTT', () => {}); await f.audio.play('1', {});
  f.contexts[0].state = 'suspended'; f.contexts[0].dispatchEvent(new Event('statechange'));
  assert.equal(reason, 'audioInterrupted'); assert.equal(f.stopped(), 1); assert.ok(f.sources[0].stopped);
});
