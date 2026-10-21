const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../audio-io.js');
function setup(pending = false) {
  const timers = new Map(), sources = [], contexts = [], requests = [], buffers = [], gains = [];
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
    createBuffer(channels, count) {
      const buffer = { count, copyToChannel(samples) { this.samples = samples.slice(); } };
      buffers.push(buffer); return buffer;
    }
    createGain() {
      const events = [], gain = { value: 1,
        cancelScheduledValues(t) { events.push(['cancel', t]); },
        setValueAtTime(v, t) { events.push(['set', v, t]); },
        linearRampToValueAtTime(v, t) { events.push(['ramp', v, t]); } };
      gains.push(events); return { ...simple(), gain };
    }
    createBufferSource() {
      const source = new EventTarget();
      Object.assign(source, simple(), { start(t) { this.startTime = t; },
        stop(t) { this.stopped = true; this.stopTime = t; } });
      sources.push(source); return source;
    }
  }
  const host = { AudioContext: Context, setTimeout(fn, ms) { timers.set(++id, { fn, ms }); return id; },
    clearTimeout(key) { timers.delete(key); }, navigator: { audioSession: { type: 'auto' }, mediaDevices: {
      getSupportedConstraints: () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: true }),
      getUserMedia(request) { requests.push(request); return pending ? new Promise(r => { release = r; }) : Promise.resolve(stream); }
    } } };
  return { audio: create(host), host, timers, contexts, sources, requests, track, buffers, gains,
    release: () => release(stream), stopped: () => stopped };
}
async function drain(f) {
  await new Promise(r => setImmediate(r));
  let ticks = 0;
  while ([...f.timers.values()].some(t => t.ms === 0)) {
    assert.ok(++ticks < 5000, 'preparation completes');
    const [id, timer] = [...f.timers.entries()].find(([, t]) => t.ms === 0);
    f.timers.delete(id); timer.fn(); await Promise.resolve();
  }
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

test('Held keys reuse prepared buffers and one context; setting/rate changes replace the bank', async () => {
  const f = setup(); await f.audio.prepareHold({}); await drain(f);
  assert.equal(f.buffers.length, 16);
  await f.audio.hold('5', {}); const buffer = f.sources.at(-1).buffer;
  f.audio.stopTone(); await f.audio.hold('5', {});
  assert.ok(f.sources.at(-1).startTime >= f.sources[0].stopTime, 'release and attack must not overlap');
  assert.equal(f.sources.at(-1).buffer, buffer); assert.equal(f.buffers.length, 16);
  await f.audio.hold('D', {}); assert.equal(f.buffers.length, 16);
  await f.audio.prepareHold({ offset: 1 }); await drain(f);
  await f.audio.hold('5', { offset: 1 }); assert.notEqual(f.sources.at(-1).buffer, buffer);
  assert.equal(f.buffers.length, 32); assert.equal(f.contexts.length, 1);
  f.contexts[0].sampleRate = 44100;
  await f.audio.prepareHold({ offset: 1 }); await drain(f);
  assert.equal(f.buffers.length, 48);
  await f.audio.close(); assert.equal(f.timers.size, 0);
});

test('Held loops fade in/out and stop at 60 seconds with an independent timer', async () => {
  const f = setup(); let ended = 0;
  const pending = f.audio.hold('5', {}, () => ended++); await drain(f); await pending;
  const source = f.sources[0];
  assert.equal(source.loop, true); assert.equal(source.buffer.count, 48000);
  assert.equal(source.startTime, 0); assert.equal(source.stopTime, 60);
  assert.deepEqual(f.gains[0].slice(0, 4), [['set', 0, 0], ['ramp', 1, 0.002],
    ['set', 1, 59.994], ['ramp', 0, 60]]);
  [...f.timers.values()].find(t => t.ms === 60000).fn();
  assert.equal(ended, 1); assert.equal(f.timers.size, 0);
  assert.deepEqual(f.gains[0].at(-1), ['ramp', 0, 0.006]);
  source.dispatchEvent(new Event('ended')); assert.equal(ended, 1);
  assert.equal(source.buffer, null);
});

test('Release during cold preparation cannot start a late tone', async () => {
  const f = setup(), pending = f.audio.hold('1', {});
  const rejected = assert.rejects(pending, /cancelled/);
  await Promise.resolve(); f.audio.stopTone(); await drain(f); await rejected;
  assert.equal(f.sources.length, 0);
});

test('Changing settings or closing during preparation cancels obsolete buffers', async () => {
  const f = setup(), pending = f.audio.hold('1', {});
  const rejected = assert.rejects(pending, /cancelled/);
  await Promise.resolve(); await f.audio.prepareHold({ mode: 'ic' });
  await drain(f); await rejected; assert.equal(f.sources.length, 0);
  const next = f.audio.hold('2', { offset: 1 });
  const closed = assert.rejects(next, /cancelled/);
  await Promise.resolve(); await f.audio.close(); await drain(f); await closed;
  assert.equal(f.timers.size, 0); assert.equal(f.sources.length, 0);
});

test('A context suspended during cold preparation cannot start a late source', async () => {
  const f = setup(), pending = f.audio.hold('1', {});
  const rejected = assert.rejects(pending, /cancelled/);
  await Promise.resolve(); f.contexts[0].state = 'suspended';
  await drain(f); await rejected; assert.equal(f.sources.length, 0);
});
