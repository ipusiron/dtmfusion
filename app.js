/* DTMFusion - MIT (c) 2026 IPUSIRON. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), dictionaries = DTMFMessages;
  const stored = key => { try { return localStorage.getItem('dtmfusion.' + key); } catch (_) { return null; } };
  let language = stored('language') === 'en' ? 'en' : 'ja';
  let theme = stored('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const core = DTMFCore, audio = DTMFAudio.create();
  let statusKey = 'ready', lastPlayed = null, activeKey = null, heldKey = null, micActive = false;
  let previewKey = '5', xray = true;
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
    updateControls(); renderResult(); renderLessons(); drawScope(activeKey); showStatus(statusKey);
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
    const key = activeKey || previewKey, o = settings();
    $('active-frequency').textContent = core.actualFrequencies(key, o).map(f => f.toFixed(o.mode === 'ic' || o.offset ? 1 : 0)).join(' + ') + ' Hz';
    $('standards').replaceChildren();
    for (const [name, row] of Object.entries(core.standards(o, key).rows)) {
      const el = node('div', undefined, 'standard-row');
      el.append(node('strong', `${t(name)}: ${t(row.status)}`));
      el.append(node('p', Object.entries(row.fields).map(([field, state]) => `${t(field)} ${t(state)}`).join(' / ')));
      $('standards').append(el);
    }
    drawCircuit(); drawKeyMatrix();
  }
  function svgNode(tag, attributes = {}, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function drawKeyMatrix() {
    const svg = $('keypad-wires'), cfg = settings(), digits = cfg.mode === 'ic' || cfg.offset ? 1 : 0;
    $('xray-toggle').setAttribute('aria-pressed', String(xray));
    $('xray-state').textContent = xray ? 'ON' : 'OFF';
    $('keypad-shell').classList.toggle('xray-on', xray); svg.toggleAttribute('hidden', !xray);
    const buttons = [...$('keypad').querySelectorAll('button')];
    buttons.forEach(button => {
      const pair = core.actualFrequencies(button.dataset.key, cfg).map(f => f.toFixed(digits));
      button.setAttribute('aria-label', `${button.dataset.key}: ${pair.join(' + ')} Hz`);
    });
    svg.replaceChildren();
    if (!xray) return;
    const bounds = $('keypad-shell').getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    svg.append(svgNode('text', { x: 24, y: 25 }, 'Hz'));
    const centers = buttons.map(button => {
      const r = button.getBoundingClientRect();
      return { x: r.left - bounds.left + r.width / 2, y: r.top - bounds.top + r.height / 2 };
    });
    const info = activeKey ? core.keyInfo(activeKey, cfg.mode) : null;
    for (let i = 0; i < 4; i++) {
      const y = centers[i * 4].y, x = centers[i].x;
      const row = info && info.row === i ? ' is-active' : '', col = info && info.col === i ? ' is-active' : '';
      svg.append(svgNode('line', { x1: 45, x2: bounds.width, y1: y, y2: y,
        class: `matrix-wire matrix-row${row}`, 'data-matrix-row': i }));
      svg.append(svgNode('line', { x1: x, x2: x, y1: 34, y2: bounds.height,
        class: `matrix-wire matrix-col${col}`, 'data-matrix-col': i }));
      const low = core.actualFrequencies(core.KEYS[i][0], cfg)[0].toFixed(digits);
      const high = core.actualFrequencies(core.KEYS[0][i], cfg)[1].toFixed(digits);
      svg.append(svgNode('text', { x: 42, y: y + 4, class: `matrix-row-label${row}` }, low));
      svg.append(svgNode('text', { x, y: 25, class: `matrix-col-label${col}` }, high));
    }
    if (info) {
      const center = centers[info.row * 4 + info.col];
      svg.append(svgNode('circle', { cx: center.x, cy: center.y, r: 19, class: 'matrix-intersection' }));
    }
  }
  function drawCircuit() {
    const small = $('circuit').clientWidth < 430, width = small ? 300 : 620;
    const lowX = small ? 8 : 30, highX = small ? 162 : 370, boxW = small ? 130 : 220;
    const left = lowX + boxW / 2, right = highX + boxW / 2, middle = width / 2;
    const ic = $('layer').value === 'ic', height = ic ? 540 : 365;
    const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, class: 'circuit-svg', role: 'img', 'aria-label': t('layer') });
    const live = Boolean(activeKey), info = core.keyInfo(activeKey || previewKey, ic ? 'ic' : 'ideal');
    function text(x, y, content, cls) { svg.append(svgNode('text', { x, y, class: cls || '' }, content)); }
    function box(x, y, w, lines, selected = live, h = 62) {
      svg.append(svgNode('rect', { x, y, width: w, height: h, rx: 5, class: `chip${selected ? ' selected-node' : ''}` }));
      lines.forEach((line, i) => text(x + w / 2, y + 22 + i * 18, line));
      if (selected) svg.append(svgNode('circle', { cx: x + 7, cy: y + 7, r: 2.5, class: 'active-dot' }));
    }
    function wire(points, selected, role = 'signal') {
      svg.append(svgNode('polyline', { points, class: `wire${selected ? ' selected' : ''}`, 'data-path': role }));
    }
    function arrow(x, from, to, selected) {
      wire(`${x},${from} ${x},${to - 16}`, selected);
      svg.append(svgNode('polygon', { points: `${x - 4},${to - 16} ${x + 4},${to - 16} ${x},${to - 8}`,
        class: selected ? 'selected-arrow' : 'arrow' }));
    }
    const top = ic ? 105 : 20;
    if (ic) {
      box(middle - 116, 8, 232, [t('crystal')], live, 40);
      wire(`${middle},48 ${middle},67 ${lowX + 3},67 ${lowX + 3},${top + 64}`, live, 'clock-low');
      wire(`${middle},67 ${highX + boxW - 3},67 ${highX + boxW - 3},${top + 64}`, live, 'clock-high');
    }
    text(left, top, t('row')); text(right, top, t('col'));
    for (let i = 0; i < 4; i++) {
      const lx = lowX + boxW * (i + 0.5) / 4, hx = highX + boxW * (i + 0.5) / 4;
      const ls = live && info.row === i, hs = live && info.col === i;
      text(lx, top + 23, `R${i + 1}`, 'small-text'); text(hx, top + 23, `C${i + 1}`, 'small-text');
      wire(`${lx},${top + 31} ${lx},${top + 44} ${left},${top + 44} ${left},${top + 59}`, ls, `row-${i}`);
      wire(`${hx},${top + 31} ${hx},${top + 44} ${right},${top + 44} ${right},${top + 59}`, hs, `col-${i}`);
    }
    const y = top + 64;
    if (ic) {
      box(lowX, y, boxW, [t('counter'), `${t('counter2')} N≈${core.DIVISORS[info.row]}`]);
      box(highX, y, boxW, [t('counter'), `${t('counter2')} N≈${core.DIVISORS[info.col + 4]}`]);
      arrow(left, y + 62, y + 92, live); arrow(right, y + 62, y + 92, live);
      box(lowX, y + 92, boxW, [t('dac'), t('steps')]);
      box(highX, y + 92, boxW, [t('dac'), t('steps')]);
      text(left, y + 175, `${info.low.toFixed(1)} Hz`, 'small-text');
      text(right, y + 175, `${info.high.toFixed(1)} Hz`, 'small-text');
    } else {
      box(lowX, y, boxW, [t('oscLow'), `${info.low} Hz`]);
      box(highX, y, boxW, [t('oscHigh'), `${info.high} Hz`]);
    }
    const join = ic ? y + 196 : y + 108, base = ic ? y + 179 : y + 62;
    wire(`${left},${base} ${left},${join} ${middle},${join}`, live);
    wire(`${right},${base} ${right},${join} ${middle},${join}`, live);
    arrow(middle, join, join + 32, live);
    box(middle - 76, join + 32, 152, [t('mixer'), `H − L = ${$('twist').value} dB`], live, 55);
    arrow(middle, join + 87, join + 118, live);
    box(middle - 105, join + 118, 210, [ic ? t('emitter') : t('out')], live, 40);
    $('circuit').replaceChildren(svg);
    $('circuit-note').textContent = t(ic ? 'icNote' : 'idealNote') + (ic ? ' ' + t('estimate') + ' ' + t('icModel') : '');
  }
  function drawScope(key) {
    const chosen = key || previewKey, cfg = settings(), rate = 48000;
    const samples = core.toneSamples(chosen, rate, { ...cfg, toneMs: 200 });
    const frequencies = core.actualFrequencies(chosen, cfg).map(f => f.toFixed(1)).join(' + ');
    $('scope-key').textContent = `${t('currentPreview')} ${chosen} / ${frequencies} Hz`;
    function grid(svg) {
      svg.replaceChildren();
      for (let x = 0; x <= 520; x += 52) svg.append(svgNode('line', { x1: x, x2: x, y1: 0, y2: 200, class: 'grid' }));
      for (let y = 0; y <= 200; y += 40) svg.append(svgNode('line', { x1: 0, x2: 520, y1: y, y2: y, class: 'grid' }));
    }
    grid($('waveform')); grid($('spectrum'));
    const count = 576, start = 480;
    const points = Array.from({ length: count }, (_, i) => `${i * 520 / (count - 1)},${100 - samples[start + i] / core.MAX_GAIN * 88}`);
    $('waveform').append(svgNode('polyline', { points: points.join(' '), class: 'trace' }));
    const frame = samples.subarray(480, 480 + core.windowLength(rate)), values = [];
    for (let f = 600; f <= 1750; f += 4) values.push([f, core.goertzel(frame, f, rate)]);
    const max = Math.max(...values.map(x => x[1]), 1e-12);
    for (const f of core.FREQUENCIES) {
      const x = (f - 600) / 1150 * 520;
      $('spectrum').append(svgNode('line', { x1: x, x2: x, y1: 8, y2: 192, class: 'grid', 'stroke-dasharray': '3 4' }));
    }
    $('spectrum').append(svgNode('polyline', { points: values.map(([f, p]) =>
      `${(f - 600) / 1150 * 520},${190 - 175 * p / max}`).join(' '), class: 'trace' }));
    $('ic-zoom').hidden = cfg.mode !== 'ic';
    if (cfg.mode === 'ic') {
      const svg = $('staircase'); svg.replaceChildren();
      const pts = [];
      for (let i = 0; i < 28; i++) {
        const y = 90 - 70 * Math.sin(2 * Math.PI * i / 28);
        pts.push(`${10 + i * 780 / 28},${y}`, `${10 + (i + 1) * 780 / 28},${y}`);
      }
      svg.append(svgNode('polyline', { points: pts.join(' '), class: 'trace' }));
    }
    samples.fill(0);
  }
  function highlight(key) {
    if (key) previewKey = key;
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
        const deviations = r.estimates.map(e => `${e.deviation >= 0 ? '+' : ''}${e.deviation.toFixed(2)}%`).join(' / ');
        $('decisions').append(node('li', `${r.symbol || '×'} · ${t(r.reason)} · ${r.duration.toFixed(1)} ms · ` +
          `${t('confidence')} ${Math.round(r.confidence * 100)}% · ${t('estimatedDeviation')}: ${deviations || '—'}`));
      }
    }
    const powers = result && result.last ? result.last.powers : core.FREQUENCIES.map(() => 0);
    $('powers').replaceChildren();
    core.FREQUENCIES.forEach((f, i) => {
      const el = node('label', undefined, 'power'), meter = node('meter');
      const db = Math.max(-120, Math.min(0, 10 * Math.log10(Math.max(powers[i], 1e-12))));
      meter.min = -60; meter.max = 0; meter.value = Math.max(-60, db);
      meter.setAttribute('aria-label', `${f} Hz`);
      meter.setAttribute('aria-valuetext', `${Math.round(db)} dB`);
      meter.setAttribute('aria-describedby', 'power-scale');
      el.append(node('span', `${f} Hz`), meter, node('span', `${Math.round(db)} dB`));
      $('powers').append(el);
    });
  }
  const sources = {
    Q23: 'https://www.itu.int/rec/T-REC-Q.23-198811-I/en',
    Q24: 'https://www.itu.int/rec/T-REC-Q.24-198811-I/en',
    JP: 'https://flets.com/denwa/gisanshi/pdf/analog_gisanshi.pdf',
    IC: 'https://pf.unikeyic.com/datasheet/43/7d/d1e0/437dd1e00336b1f0b5169f5d864a3432.pdf',
    Schenker: 'https://www.repeater-builder.com/tech-info/dtmf/pdfs/bstj-39-01-pages-235-255.pdf',
    AUTOVON: 'https://www.telephonecollectors.info/index.php/browse/document-repository/catalogs-manuals/' +
      'bell-system-we/bell-labs-record/11826-68apr-blr-p106-autovon/file',
    secondary: 'https://www.cryptomuseum.com/phone/autovon/index.htm',
    PCI: 'https://listings.pcisecuritystandards.org/documents/Protecting_Telephone_Based_Payment_Card_Data_v3-0_nov_2018.pdf',
    day120: 'https://ipusiron.github.io/airborne-tone-link/', day041: 'https://ipusiron.github.io/mic-gain-logger/'
  };
  function table(headers, rows) {
    const wrap = node('div', undefined, 'table-wrap'), el = node('table'), head = node('thead'), tr = node('tr');
    headers.forEach(h => { const th = node('th', h); th.scope = 'col'; tr.append(th); }); head.append(tr); el.append(head);
    const body = node('tbody');
    rows.forEach(row => { const line = node('tr'); row.forEach(v => line.append(node('td', String(v)))); body.append(line); });
    el.append(body); wrap.append(el); return wrap;
  }
  function sourceLink(name, label, evidence) {
    const p = node('p'), link = node('a', label, 'source-link');
    link.href = sources[name]; link.target = '_blank'; link.rel = 'noopener noreferrer';
    p.append(node('span', t(evidence) + ' · ', 'evidence'), link); return p;
  }
  function renderLessons() {
    const opened = [...$('lesson-content').querySelectorAll('details')].map(d => d.open);
    $('lesson-content').replaceChildren();
    const bodies = [];
    for (let i = 1; i <= 6; i++) {
      const detail = node('details'), body = node('div', undefined, 'lesson-body');
      detail.id = `lesson-${i}`; detail.open = Boolean(opened[i - 1]);
      detail.append(node('summary', t(`lesson${i}`)), body); $('lesson-content').append(detail); bodies.push(body);
    }
    const para = (i, key) => bodies[i - 1].append(node('p', t(key)));
    para(1, 'lesson1Text');
    bodies[0].append(table(['Hz', ...core.HIGH.map(x => `${x} Hz`)], core.LOW.map((f, i) => [`${f} Hz`, ...core.KEYS[i]])),
      sourceLink('Q23', 'ITU-T Q.23 (11/1988), §5–8', 'primary'));
    para(2, 'lesson2Text'); bodies[1].append(table([t('ratioHeader')], [[t('ratioValue')]]),
      sourceLink('Schenker', 'Schenker, BSTJ 39(1), 1960, pp.235–255', 'paper'));
    para(2, 'standardsText');
    bodies[1].append(table([t('source'), t('freqHeader'), t('timeHeader'), t('twistHeader')], [
      [t('Q23'), t('q23Freq'), t('q23Time'), t('q23Twist')],
      [t('NTT'), t('nttFreq'), t('nttTime'), '−5…+5 dB'],
      [t('ATT'), t('attFreq'), t('attTime'), '−8…+4 dB'], [t('JP'), t('jpFreq'), t('jpTime'), t('jpTwist')]
    ]), sourceLink('Q24', 'ITU-T Q.24 (11/1988), Annex A, Table A-1', 'primary'),
    sourceLink('JP', 'NTT 6.2 (2025-07), p.14, 3.3.7', 'primary'));
    para(3, 'lesson3Text'); para(3, 'estimate');
    bodies[2].append(table([t('nominal'), t('tableI'), t('divider'), t('calculated')],
      core.FREQUENCIES.map((f, i) => [f, core.IC[i].toFixed(1), core.DIVISORS[i], (3579545 / (28 * core.DIVISORS[i])).toFixed(2)])),
      sourceLink('IC', 'TP5089, TL/H/5057, Table I / Functional Description', 'primary'));
    para(3, 'autovonText');
    bodies[2].append(table([t('priority'), 'AUTOVON'], [['FO', 'Flash Override'], ['F', 'Flash'], ['I', 'Immediate'],
      ['P', 'Priority'], ['—', t('noButton')]]), sourceLink('AUTOVON', 'J. W. Gorgas, Bell Labs Record, 1968-04', 'primary'),
    sourceLink('secondary', 'Crypto Museum / AUTOVON', 'secondary'));
    para(4, 'lesson4Text'); para(4, 'frequencyRule'); para(4, 'decoderLimits'); para(4, 'decoderCaveat');
    bodies[3].append(table([t('rateHeader'), t('windowHeader'), t('resolutionHeader')],
      [8000, 44100, 48000].map(rate => [rate + ' Hz', core.windowLength(rate), (rate / core.windowLength(rate)).toFixed(2) + ' Hz'])),
      sourceLink('Q24', 'ITU-T Q.24 / receiver requirements', 'primary'));
    para(5, 'lesson5Text'); para(5, 'paymentText');
    bodies[4].append(table([t('method'), t('effect')], [['Suppression', t('suppression')], ['Masking', t('masking')],
      [t('pauseRecording'), t('exclude')]]), sourceLink('PCI', 'PCI SSC v3.0 (2018-11), §4–6 / Appendix D.2', 'industry'));
    para(6, 'relatedText');
    bodies[5].append(table([t('relatedName'), t('relatedRole')], [['Day120 Airborne Tone Link', t('day120Role')],
      ['Day041 Mic Gain Logger', t('day041Role')]]), sourceLink('day120', 'Day120 Airborne Tone Link', 'primary'),
    sourceLink('day041', 'Day041 Mic Gain Logger', 'primary'));
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
    const button = node('button'); button.append(node('span', key, 'key-symbol'));
    button.type = 'button'; button.dataset.key = key;
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
    stopPlayback(); $('twist').value = $('layer').value === 'ic' ? '2.7' : '2'; updateControls(); drawScope();
  });
  $('xray-toggle').addEventListener('click', () => { xray = !xray; drawKeyMatrix(); });
  $('play').addEventListener('click', play); $('stop').addEventListener('click', stopAll);
  $('direct').addEventListener('click', direct); $('wav').addEventListener('change', readWav);
  $('export').addEventListener('click', exportWav); $('mic').addEventListener('click', listen);
  $('mic-stop').addEventListener('click', () => { audio.stopMic(); micActive = false;
    $('profile').disabled = false; $('mic').disabled = false; showStatus('stopped'); });
  $('clear').addEventListener('click', () => { stopAll(); result = lastPlayed = null; renderResult(); showStatus('cleared'); });
  window.addEventListener('resize', () => { drawCircuit(); drawKeyMatrix(); });
  window.addEventListener('blur', stopAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
  window.addEventListener('pagehide', () => audio.close());
  audio.onInterrupted(key => { stopAll(); showStatus(key); });
  translate();
}());
