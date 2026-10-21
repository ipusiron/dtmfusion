const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
test('D CSP, classic scripts, semantics and no inline handlers', () => {
  const html = read('index.html');
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'"]) {
    assert.ok(html.includes(directive));
  }
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.doesNotMatch(html, /\sstyle=|\son\w+=|type="module"|frame-ancestors/);
  assert.match(html, /<dialog /); assert.match(html, /<noscript>/);
});
test('D dictionaries have identical keys and all HTML keys exist', () => {
  const m = require('../messages.js');
  assert.deepEqual(Object.keys(m.ja).sort(), Object.keys(m.en).sort());
  for (const match of read('index.html').matchAll(/data-(?:i18n|label)="([^"]+)"/g)) assert.ok(m.ja[match[1]], match[1]);
});
test('D application contains no forbidden APIs or phrasing', () => {
  for (const name of fs.readdirSync(root).filter(n => /\.(js|html|css)$/.test(n))) {
    assert.doesNotMatch(read(name), /Worklet|WASM|fetch\s*\(|innerHTML|盗聴できる|乗っ取り|不正発信|照合|突き合わせ|効く|走る/);
  }
});

test('The page and READMEs use the Day121 heading without Lab branding', () => {
  assert.match(read('index.html'), /DAY121 · KEY \/ TONE \/ CIRCUIT/);
  for (const file of ['index.html', 'README.md', 'README.en.md']) assert.doesNotMatch(read(file), /\b(?:Lab|LAB)\b/);
  for (const dictionary of Object.values(require('../messages.js'))) {
    for (const value of Object.values(dictionary)) assert.doesNotMatch(value, /\b(?:Lab|LAB)\b/);
  }
});

test('Repository ignore rules do not contain local work folders', () => {
  const patterns = read('.gitignore').split(/\r?\n/).map(line => line.trim());
  for (const name of ['backups', 'logs', '.work']) {
    assert.ok(!patterns.some(pattern => pattern.replace(/^\//, '').replace(/\/$/, '') === name), name);
  }
});
test('format and source readability', () => {
  const files = [...fs.readdirSync(root).filter(n => /\.(js|css|html)$/.test(n)),
    ...fs.readdirSync(__dirname).filter(n => n.endsWith('.js')).map(n => `test/${n}`)];
  for (const name of files) {
    const max = name.endsWith('.html') ? 250 : 160;
    read(name).split('\n').forEach((line, i) => assert.ok(line.length <= max, `${name}:${i + 1} (${line.length})`));
  }
  assert.ok(read('dtmf-core.js').split('\n').length > 180);
  assert.ok(read('style.css').split('\n').length > 65);
});
test('contrast: both themes text >=4.5 and borders/focus >=3', () => {
  const css = read('style.css');
  function lum(hex) {
    const rgb = hex.match(/[0-9a-f]{2}/gi).map(s => parseInt(s, 16) / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }
  for (const block of css.matchAll(/:root[^{}]*\{([^}]+)\}/g)) {
    const colors = Object.fromEntries([...block[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
    for (const fg of ['fg', 'muted', 'neon', 'phosphor', 'focus', 'border']) {
      for (const bg of ['bg', 'surface', 'inset']) {
        const a = lum(colors[fg]), b = lum(colors[bg]), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        assert.ok(ratio >= (['focus', 'border'].includes(fg) ? 3 : 4.5), `${fg}/${bg}: ${ratio}`);
      }
    }
  }
});
