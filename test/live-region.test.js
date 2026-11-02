const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function loadSetLiveText() {
  const match = read('app.js').match(/function setLiveText\(el, text\) \{[\s\S]*?\n  \}/);
  assert.ok(match, 'setLiveText is defined in app.js');
  return new Function(`${match[0]}; return setLiveText;`)();
}

test('setLiveText writes only when the text changes', () => {
  const setLiveText = loadSetLiveText();
  let writes = 0, value = '—';
  const el = { get textContent() { return value; }, set textContent(text) { writes++; value = text; } };
  assert.equal(setLiveText(el, '—'), false);
  for (let i = 0; i < 100; i++) setLiveText(el, '12');
  assert.equal(writes, 1);
  assert.equal(setLiveText(el, '123'), true);
  assert.equal(value, '123');
  assert.equal(writes, 2);
});

test('visual readouts are not live; spoken copies are separate and deduplicated', () => {
  const html = read('index.html'), app = read('app.js');
  assert.match(html, /<output id="decoded" class="decoded" aria-live="off">/);
  assert.match(html, /<output id="active-key" aria-live="off">/);
  assert.match(html, /<p id="decoded-live" class="visually-hidden" aria-live="polite">/);
  assert.match(read('style.css'), /\.visually-hidden \{/);
  assert.match(app, /output\.setAttribute\('aria-live', 'off'\)/);
  assert.match(app, /setAttribute\('aria-valuetext', text\)/);
  assert.match(app, /const LIVE_GAP_MS = 1500;/);
  for (const id of ['status', 'decoded', 'decoded-live', 'active-key']) {
    assert.doesNotMatch(app, new RegExp(`\\$\\('${id}'\\)\\.textContent\\s*=`), id);
  }
  assert.doesNotMatch(app, /\$\(key \+ '-value'\)\.textContent\s*=/);
});
