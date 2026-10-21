/* DTMFusion - MIT (c) 2026 IPUSIRON.
 * Context, cancellation, constraints and mute cleanup adapted from Day120 audio-io.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dtmf-core.js'));
  else root.DTMFAudio = factory(root.DTMFCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';
  function create(host = globalThis) {
    const nav = host.navigator || {};
    let context = null, source = null, gain = null, stream = null, track = null, analyser = null, input = null;
    let generation = 0, micGeneration = 0, timer = null, deadline = null, handler = null, releaseAt = 0;
    let decoder = null, callback = () => {}, interrupted = () => {}, playbackEnd = () => {};
    let holdDeadline = null, preparation = null, cacheKey = '', priority = null;
    let workChannel = null, nextStep = null, workQueued = false;
    const holdCache = new Map();
    function session(mic) {
      if (nav.audioSession) {
        try { nav.audioSession.type = mic ? 'play-and-record' : 'playback'; } catch (_) { /* Optional API. */ }
      }
    }
    async function open() {
      const Audio = host.AudioContext || host.webkitAudioContext;
      if (!Audio) throw new Error('noAudio');
      if (!context || context.state === 'closed') {
        context = new Audio();
        releaseAt = 0;
        const opened = context;
        context.addEventListener('statechange', () => {
          if (context === opened && context.state !== 'running' && (source || stream)) {
            stop(); interrupted('audioInterrupted');
          }
        });
      }
      session(Boolean(stream));
      if (context.state !== 'running') await context.resume();
      return context;
    }
    function stopTone() {
      generation++;
      host.clearTimeout(holdDeadline); holdDeadline = null;
      const old = source, oldGain = gain;
      source = gain = null;
      if (old) {
        try {
          releaseAt = context.currentTime + 0.006;
          oldGain.gain.cancelScheduledValues(context.currentTime);
          oldGain.gain.setValueAtTime(oldGain.gain.value, context.currentTime);
          oldGain.gain.linearRampToValueAtTime(0, releaseAt);
          old.stop(releaseAt);
        } catch (_) { old.disconnect(); oldGain.disconnect(); }
      }
    }
    function makeBuffer(samples) {
      const buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.copyToChannel(samples, 0);
      return buffer;
    }
    function emit(buffer, onEnd = () => {}, loop = false) {
      source = context.createBufferSource(); gain = context.createGain();
      source.buffer = buffer; source.loop = loop; source.connect(gain); gain.connect(context.destination);
      const node = source, g = gain;
      node.addEventListener('ended', () => {
        node.disconnect(); g.disconnect(); node.buffer = null;
        if (source === node) {
          source = gain = null; host.clearTimeout(holdDeadline); holdDeadline = null; onEnd();
        }
      });
      // Finish the previous release before the new attack so voices cannot exceed the gain ceiling together.
      const start = Math.max(context.currentTime, releaseAt);
      if (loop) {
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(1, start + 0.002);
        g.gain.setValueAtTime(1, start + 60 - 0.006);
        g.gain.linearRampToValueAtTime(0, start + 60);
      }
      node.start(start);
      if (loop) {
        node.stop(start + 60);
        holdDeadline = host.setTimeout(() => {
          if (source === node) { stopTone(); onEnd(); }
        }, 60000);
      }
      return start;
    }
    async function play(keys, settings, onEnd) {
      stopTone(); const token = generation;
      await open(); if (token !== generation) throw new Error('cancelled');
      const wave = core.sequence(keys, context.sampleRate, settings);
      if (!wave.keys) throw new Error('emptyInput');
      const start = emit(makeBuffer(wave.samples), onEnd);
      wave.samples.fill(0);
      return { rate: context.sampleRate, start, timeline: wave.timeline };
    }
    function clearPreparation() {
      host.clearTimeout(preparation); preparation = null;
      nextStep = null;
      for (const job of holdCache.values()) if (!job.buffer) job.resolve(null);
      holdCache.clear(); cacheKey = ''; priority = null;
    }
    function schedulePreparation(step) {
      if (!host.MessageChannel) { preparation = host.setTimeout(step, 0); return; }
      if (!workChannel) {
        workChannel = new host.MessageChannel();
        workChannel.port1.onmessage = () => {
          workQueued = false;
          const task = nextStep; nextStep = null;
          if (task) task();
        };
      }
      nextStep = step;
      if (!workQueued) { workQueued = true; workChannel.port2.postMessage(null); }
    }
    function prepareBank(settings) {
      const cfg = core.options(settings), id = JSON.stringify([context.sampleRate, cfg]);
      if (cacheKey === id) return;
      clearPreparation(); cacheKey = id;
      for (const key of core.KEYS.join('')) {
        const job = { iterator: core.holdTone(key, context.sampleRate, cfg), buffer: null };
        job.promise = new Promise(resolve => { job.resolve = resolve; });
        holdCache.set(key, job);
      }
      function step() {
        preparation = null;
        const next = holdCache.get(priority);
        const job = next && next.iterator ? next : [...holdCache.values()].find(item => item.iterator);
        if (!job) return;
        try {
          const result = job.iterator.next();
          if (result.done) {
            job.buffer = makeBuffer(result.value.samples); result.value.samples.fill(0);
            job.iterator = null; job.resolve(job.buffer);
          }
        } catch (error) { job.iterator = null; job.error = error; job.resolve(null); }
        schedulePreparation(step);
      }
      // The first key can be painted before any cold buffer generation starts.
      const queue = () => { if (cacheKey === id) schedulePreparation(step); };
      if (host.requestAnimationFrame) host.requestAnimationFrame(queue); else queue();
    }
    async function prepareHold(settings) {
      const opened = await open();
      if (opened === context) prepareBank(settings);
    }
    async function hold(key, settings, onEnd) {
      stopTone(); const token = generation;
      await open(); if (token !== generation) throw new Error('cancelled');
      core.keyInfo(key); prepareBank(settings); priority = key;
      const job = holdCache.get(key), buffer = job.buffer || await job.promise;
      if (token !== generation || !buffer || context.state !== 'running') throw job.error || new Error('cancelled');
      emit(buffer, onEnd, true);
      return context.sampleRate;
    }
    function stopMic() {
      micGeneration++;
      host.clearTimeout(timer); host.clearTimeout(deadline); timer = deadline = null;
      if (track && handler) { track.removeEventListener('mute', handler); track.removeEventListener('ended', handler); }
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (input) input.disconnect(); if (analyser) analyser.disconnect();
      stream = track = input = analyser = handler = null;
      if (decoder) { callback(decoder.flush()); decoder = null; }
      session(false);
    }
    async function microphone(profile, onResult, onEnd = () => {}) {
      stopMic(); const token = micGeneration;
      if (!nav.mediaDevices || !nav.mediaDevices.getUserMedia) throw new Error('noMicrophone');
      await open();
      if (token !== micGeneration) throw new Error('cancelled');
      session(true);
      const supported = nav.mediaDevices.getSupportedConstraints ? nav.mediaDevices.getSupportedConstraints() : null;
      const audio = {};
      for (const [name, value] of Object.entries({ echoCancellation: false, noiseSuppression: false,
        autoGainControl: false, voiceIsolation: false, channelCount: 1 })) {
        if (!supported || supported[name]) audio[name] = { ideal: value };
      }
      let opened;
      try { opened = await nav.mediaDevices.getUserMedia({ audio, video: false }); }
      catch (_) { session(false); throw new Error('microphoneError'); }
      if (token !== micGeneration) { opened.getTracks().forEach(t => t.stop()); throw new Error('cancelled'); }
      stream = opened; track = stream.getAudioTracks()[0];
      try {
        if (!track || track.muted || track.readyState === 'ended') throw new Error('inputInterrupted');
        handler = () => { stopMic(); onEnd('inputInterrupted'); };
        track.addEventListener('mute', handler); track.addEventListener('ended', handler);
        input = context.createMediaStreamSource(stream); analyser = context.createAnalyser();
        analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0; input.connect(analyser);
        decoder = core.createDecoder(context.sampleRate, profile); callback = onResult;
        const data = new Float32Array(analyser.fftSize);
        let previous = Math.round(context.currentTime * context.sampleRate);
        function poll() {
          if (token !== micGeneration) return;
          const end = Math.round(context.currentTime * context.sampleRate), count = end - previous;
          if (count > data.length || context.state !== 'running') { stopMic(); onEnd('audioInterrupted'); return; }
          if (count > 0) {
            analyser.getFloatTimeDomainData(data);
            callback(decoder.push(data.subarray(data.length - count)));
            data.fill(0); previous = end;
          }
          timer = host.setTimeout(poll, 8);
        }
        timer = host.setTimeout(poll, 8);
        deadline = host.setTimeout(() => { stopMic(); onEnd('autoStopped'); }, 60000);
        const settings = track.getSettings ? track.getSettings() : {};
        return { rate: context.sampleRate, settings, session: nav.audioSession ? nav.audioSession.type : 'unreported' };
      } catch (error) { stopMic(); throw error; }
    }
    function stop() { stopTone(); stopMic(); }
    async function close() {
      stop(); clearPreparation(); const old = context; context = null;
      if (workChannel) { workChannel.port1.close(); workChannel.port2.close(); workChannel = null; workQueued = false; }
      if (old && old.state !== 'closed') { try { await old.close(); } catch (_) { /* Page is closing. */ } }
    }
    return { play, hold, prepareHold, microphone, stopTone, stopMic, stop, close,
      time: () => context ? context.currentTime : 0, onInterrupted: fn => { interrupted = fn; } };
  }
  return Object.freeze({ create });
}));
