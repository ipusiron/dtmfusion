/* DTMFusion - MIT (c) 2026 IPUSIRON. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), dictionaries = DTMFMessages;
  let language = 'ja', theme = 'dark';
  try {
    if (localStorage.getItem('dtmfusion.language') === 'en') language = 'en';
    if (localStorage.getItem('dtmfusion.theme') === 'light') theme = 'light';
  } catch (_) { /* Preferences are optional. */ }
  const core = DTMFCore, audio = DTMFAudio.create();
  let statusKey = 'ready', lastPlayed = null, activeKey = null, heldKey = null, micActive = false;
  let result = null, animation = 0, playTimeline = null, operation = 0;
  const t = key => dictionaries[language][key] || key;
  function save() {
    try { localStorage.setItem('dtmfusion.language', language); localStorage.setItem('dtmfusion.theme', theme); }
    catch (_) { /* Private browsing may disable storage. */ }
  }
  function translate() {
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.label)); });
    $('language').textContent = language === 'ja' ? 'EN' : '日';
    updateControls(); renderResult(); showStatus(statusKey);
  }
  $('theme').addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; translate(); save(); });
  $('language').addEventListener('click', () => { language = language === 'ja' ? 'en' : 'ja'; translate(); save(); });
  $('help').addEventListener('click', () => $('help-dialog').showModal());
  $('close-help').addEventListener('click', () => $('help-dialog').close());

  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function showStatus(key) { statusKey = key; $('status').textContent = t(key); }
  function settings() {
    return core.options({ mode: $('layer').value, twist: Number($('twist').value), offset: Number($('offset').value),
      toneMs: Number($('toneMs').value), pauseMs: Number($('pauseMs').value) });
  }
  function updateControls() {
    for (const [key, unit] of [['twist', 'dB'], ['offset', '%'], ['toneMs', 'ms'], ['pauseMs', 'ms']]) {
      $(key + '-value').textContent = `${$(key).value} ${unit}`;
    }
    const key = activeKey || '1', o = settings();
    $('active-frequency').textContent = core.actualFrequencies(key, o).map(f => f.toFixed(o.mode === 'ic' || o.offset ? 1 : 0)).join(' + ') + ' Hz';
    $('standards').replaceChildren();
    for (const [name, row] of Object.entries(core.standards(o, key).rows)) {
      const el = node('div', undefined, 'standard-row');
      el.append(node('strong', `${t(name)}: ${t(row.status)}`));
      el.append(node('p', Object.entries(row.fields).map(([field, state]) => `${t(field)} ${t(state)}`).join(' / ')));
      $('standards').append(el);
    }
    drawCircuit();
  }
  function drawCircuit() { /* The two source-based layers are added in stage 1c. */ }
  function drawScope() { /* Waveform and spectrum are added in stage 1c. */ }
  function highlight(key) {
    activeKey = key;
    $('active-key').textContent = key || '—';
    document.querySelectorAll('[data-key]').forEach(el => {
      const active = el.dataset.key === key;
      el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active));
    });
    updateControls(); drawScope(key);
  }
  function renderResult() {
    $('decoded').textContent = result && result.text || '—';
    $('decisions').replaceChildren();
    if (result) {
      for (const r of result.results.slice(-64)) {
        $('decisions').append(node('li', `${r.symbol || '×'} · ${t(r.reason)} · ${r.duration.toFixed(1)} ms · ` +
          `${t('confidence')} ${Math.round(r.confidence * 100)}%`));
      }
    }
    const powers = result && result.last ? result.last.powers : core.FREQUENCIES.map(() => 0);
    $('powers').replaceChildren();
    core.FREQUENCIES.forEach((f, i) => {
      const el = node('label', undefined, 'power'), meter = node('meter');
      meter.min = -120; meter.max = 0;
      meter.value = Math.max(-120, 10 * Math.log10(Math.max(powers[i], 1e-12)));
      meter.setAttribute('aria-label', `${f} Hz`);
      el.append(node('span', `${f} Hz`), meter, node('span', `${Math.round(meter.value)} dB`));
      $('powers').append(el);
    });
  }
  function stopPlayback() {
    operation++; heldKey = null; playTimeline = null;
    cancelAnimationFrame(animation); audio.stopTone(); highlight(null);
  }
  function fail(error) { if (error.message !== 'cancelled') showStatus(error.message in dictionaries.en ? error.message : 'noAudio'); }
  async function startHold(key) {
    if (heldKey === key) return;
    stopPlayback(); heldKey = key; const token = operation;
    lastPlayed = { keys: key, settings: settings() };
    highlight(key); showStatus('playing');
    try { await audio.hold(key, lastPlayed.settings, () => { stopPlayback(); showStatus('stopped'); }); }
    catch (error) { if (token === operation) { stopPlayback(); fail(error); } }
  }
  function release(key) {
    if (heldKey === key) { stopPlayback(); showStatus(micActive ? 'listening' : 'stopped'); }
  }
  async function play() {
    stopPlayback();
    const keys = core.sanitize($('number').value);
    if (!keys) { showStatus('emptyInput'); return; }
    const token = operation, cfg = settings(); lastPlayed = { keys, settings: cfg };
    try {
      playTimeline = await audio.play(keys, cfg, () => { stopPlayback(); showStatus(micActive ? 'listening' : 'stopped'); });
      if (token !== operation) return;
      showStatus('playing');
      function frame() {
        if (!playTimeline || token !== operation) return;
        const now = audio.time() - playTimeline.start;
        const item = playTimeline.timeline.find(x => now >= x.start && now < x.end);
        const key = item ? item.key : null;
        if (key !== activeKey) highlight(key);
        animation = requestAnimationFrame(frame);
      }
      frame();
    } catch (error) { fail(error); }
  }
  function direct() {
    const chosen = lastPlayed || { keys: $('number').value, settings: settings() };
    const wave = core.sequence(chosen.keys, 48000, chosen.settings);
    if (!wave.keys) { showStatus('emptyInput'); return; }
    result = core.decode(wave.samples, wave.rate, $('profile').value);
    wave.samples.fill(0); renderResult(); showStatus(result.text ? 'accepted' : 'noneDetected');
  }
  async function readWav() {
    const file = $('wav').files[0]; $('wav').value = '';
    if (!file) return;
    stopPlayback(); audio.stopMic(); micActive = false;
    $('profile').disabled = false; $('mic').disabled = false;
    const token = operation;
    let pcm = null;
    try {
      if (file.size > core.MAX_WAV_BYTES) throw new Error('invalidWav');
      const bytes = await file.arrayBuffer();
      if (token !== operation) return;
      pcm = core.decodeWav(bytes);
      result = core.decode(pcm.samples, pcm.rate, $('profile').value);
      renderResult(); showStatus(result.text ? 'accepted' : 'noneDetected');
    } catch (error) { fail(error); }
    finally { if (pcm) pcm.samples.fill(0); }
  }
  function exportWav() {
    const wave = core.sequence($('number').value, 48000, settings());
    if (!wave.keys) { showStatus('emptyInput'); return; }
    const blob = new Blob([core.encodeWav(wave.samples, wave.rate)], { type: 'audio/wav' });
    wave.samples.fill(0);
    const url = URL.createObjectURL(blob), link = node('a');
    link.href = url; link.download = 'dtmfusion.wav'; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); showStatus('saved');
  }
  async function listen() {
    if (micActive) return;
    micActive = true; $('profile').disabled = true; $('mic').disabled = true;
    result = null; renderResult(); showStatus('permission');
    try {
      const info = await audio.microphone($('profile').value, value => { result = value; renderResult(); }, key => {
        micActive = false; $('profile').disabled = false; $('mic').disabled = false; showStatus(key);
      });
      if (!micActive) return;
      const labels = [['ec', 'echoCancellation'], ['ns', 'noiseSuppression'], ['agc', 'autoGainControl']];
      $('environment').textContent = `${t('micSettings')}: ${info.rate} Hz / ` + labels.map(([name, field]) =>
        `${t(name)}: ${t(info.settings[field] === true ? 'on' : info.settings[field] === false ? 'off' : 'unreported')}`).join(' / ');
      showStatus('listening');
    } catch (error) { micActive = false; $('profile').disabled = false; $('mic').disabled = false; fail(error); }
  }
  function stopAll() {
    stopPlayback(); audio.stopMic(); micActive = false;
    $('profile').disabled = false; $('mic').disabled = false; showStatus('stopped');
  }
  for (const key of core.KEYS.join('')) {
    const button = node('button', key); button.type = 'button'; button.dataset.key = key;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); button.focus(); button.setPointerCapture(e.pointerId); startHold(key);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => release(key));
    button.addEventListener('keydown', e => {
      if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); if (!e.repeat) startHold(key); }
    });
    button.addEventListener('keyup', e => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); release(key); } });
    $('keypad').append(button);
  }
  for (const [key, min, max, step, value] of [['twist', -10, 10, 0.1, 2], ['offset', -5, 5, 0.1, 0],
    ['toneMs', 10, 200, 1, 80], ['pauseMs', 10, 200, 1, 60]]) {
    const el = node('div'), label = node('label'), output = node('output'), input = node('input');
    label.htmlFor = key; label.dataset.i18n = key; output.id = key + '-value'; output.htmlFor = key;
    Object.assign(input, { id: key, type: 'range', min, max, step, value });
    input.addEventListener('input', () => { stopPlayback(); updateControls(); });
    el.append(label, input, output); $('settings').append(el);
  }
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || $('help-dialog').open ||
      e.target.closest('input,select,textarea')) return;
    const key = e.key.toUpperCase();
    if (key.length === 1 && core.KEYS.join('').includes(key)) { e.preventDefault(); startHold(key); }
  });
  document.addEventListener('keyup', e => release(e.key.toUpperCase()));
  $('number').addEventListener('input', () => {
    const clean = core.sanitize($('number').value);
    if (clean !== $('number').value) showStatus('removed');
    $('number').value = clean;
  });
  $('layer').addEventListener('change', () => {
    stopPlayback(); $('twist').value = $('layer').value === 'ic' ? '2.7' : '2'; updateControls();
  });
  $('play').addEventListener('click', play); $('stop').addEventListener('click', stopAll);
  $('direct').addEventListener('click', direct); $('wav').addEventListener('change', readWav);
  $('export').addEventListener('click', exportWav); $('mic').addEventListener('click', listen);
  $('mic-stop').addEventListener('click', () => { audio.stopMic(); micActive = false;
    $('profile').disabled = false; $('mic').disabled = false; showStatus('stopped'); });
  $('clear').addEventListener('click', () => { stopAll(); result = lastPlayed = null; renderResult(); showStatus('cleared'); });
  window.addEventListener('blur', stopAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
  window.addEventListener('pagehide', () => audio.close());
  audio.onInterrupted(key => { stopAll(); showStatus(key); });
  translate();
}());
