const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const c = require('../dtmf-core.js');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const measurement = JSON.parse(read('docs/measurements.json'));
const split = line => line.split('|').slice(1, -1).map(x => x.trim());
const numbers = text => [...text.replace(/−/g, '-').matchAll(/[+-]?\d+(?:\.\d+)?/g)].map(m => Number(m[0]));

for (const file of ['README.md', 'README.en.md']) {
  test(`${file}: metadata, headings, sources and phrasing`, () => {
    const text = read(file), meta = text.match(/^<!--\r?\n---\r?\n([\s\S]+?)\r?\n---\r?\n-->/);
    assert.ok(meta);
    for (const [key, value] of Object.entries({ id: 'day121', slug: 'dtmfusion', hub: 'true' })) {
      assert.match(meta[1], new RegExp(`^${key}: ${value}$`, 'm'));
    }
    assert.match(meta[1], /repo_url: "https:\/\/github.com\/ipusiron\/dtmfusion"/);
    assert.match(meta[1], /demo_url: "https:\/\/ipusiron.github.io\/dtmfusion\/"/);
    for (const key of ['category_ja', 'category_en', 'tags']) {
      assert.match(meta[1], new RegExp(`${key}:\\r?\\n  - `));
    }
    assert.match(meta[1], /category_ja:\r?\n  - 通信技術\r?\n  - プライバシー/);
    assert.match(meta[1], /category_en:\r?\n  - Communication Technologies\r?\n  - Privacy/);
    assert.equal([...text.matchAll(/^## /gm)].length, 22);
    assert.equal([...text.matchAll(/https:\/\/img.shields.io\//g)].length, 5);
    assert.ok(text.includes('852.27') && text.includes('852.4'));
    for (const url of ['T-REC-Q.23-198811-I/en', 'T-REC-Q.24-198811-I/en', 'analog_gisanshi.pdf',
      'bstj-39-01-pages-235-255.pdf', 'v3-0_nov_2018.pdf', 'mic-gain-logger/', 'airborne-tone-link/']) {
      assert.ok(text.includes(url), url);
    }
    assert.doesNotMatch(text, /盗聴できる|乗っ取り|不正発信|照合|突き合わせ|効く|走る|全て|分かる|既に|無い|インターフェース/);
    for (const section of text.split(/^## /m)) assert.ok((section.match(/\*\*/g) || []).length <= 4);
  });

  test(`${file}: six background sections retain their sources and book links`, () => {
    const text = read(file), ja = file === 'README.md';
    const headings = ja ? [
      '☎️ 電話機とDTMF音の関係', '🕰️ DTMF音の歴史', '📞 今でもDTMF音を使って通話できるか',
      '🧩 応用手法', '🔊 エアギャップの秘密通信路への可能性', '🌏 海外と日本の違い'
    ] : [
      '☎️ Telephone sets and DTMF', '🕰️ History of DTMF', '📞 Can DTMF still be used for calls?',
      '🧩 Applications', '🔊 Potential for covert channels across air gaps', '🌏 Differences between Japan and other systems'
    ];
    const sources = [
      'https://www.rfc-editor.org/rfc/rfc4733',
      'https://www.itu.int/rec/T-REC-Q.23-198811-I/en',
      'https://www.ntt-west.co.jp/news/2509/250929a.html',
      'https://www.ntt-west.co.jp/gisanshi/analog/pdf/analog_gisanshi_06_02.pdf',
      'https://www.itu.int/rec/T-REC-Q.24-198811-I/en',
      'https://www.ntt-west.co.jp/denwa/charge/basic/basic.html'
    ];
    const sections = text.split(/^## /m), positions = [];
    for (const [i, heading] of headings.entries()) {
      const matches = sections.filter(section => section.split(/\r?\n/)[0] === heading);
      assert.equal(matches.length, 1, heading);
      assert.ok(matches[0].includes(sources[i]), heading);
      positions.push(sections.indexOf(matches[0]));
      if (i === 4) {
        for (const url of ['https://akademeia.info/?page_id=53554', 'https://akademeia.info/?page_id=53563',
          'https://ipusiron.github.io/airborne-tone-link/', 'https://ipusiron.github.io/mic-gain-logger/']) {
          assert.ok(matches[0].includes(`](${url})`), url);
        }
      }
    }
    assert.ok(positions.every((position, i) => !i || position === positions[i - 1] + 1));
  });

  test(`${file}: theoretical throughput bounds recalculate from sixteen symbols and source cycles`, () => {
    const text = read(file);
    const rows = text.split('\n').filter(line => /^\| (AT&T|日本 \/ NTT|Japan \/ NTT) \|/.test(line)).map(split);
    assert.equal(rows.length, 2);
    for (const [i, row] of rows.entries()) {
      const [, bits, cycle, calculated, approximate] = row;
      const profile = c.PROFILES[i === 0 ? 'ATT' : 'NTT'];
      assert.equal(+bits, Math.log2(c.KEYS.join('').length));
      assert.equal(+cycle, profile.cycle);
      const rate = +bits / (+cycle / 1000);
      assert.equal(+calculated, +rate.toFixed(2));
      assert.equal(+approximate, Math.round(rate));
    }
    assert.deepEqual(rows.map(row => +row[4]), [43, 33]);
    assert.match(text, file === 'README.md' ? /計算上の上限であり、実測の転送速度ではありません/ :
      /calculated upper bounds[\s\S]*not measured transfer rates/);
  });

  test(`${file}: residential monthly price table preserves the dated source values`, () => {
    const text = read(file);
    const rows = text.split('\n').filter(line => /^\| ([123]級取扱所|Class [123]) \|/.test(line)).map(split);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(row => row.slice(1).map(cell => Number(cell.replace(/[^0-9]/g, '')))),
      [[1980, 1815], [1980, 1925], [2090, 2090]]);
    assert.match(text, file === 'README.md' ? /2026年10月確認/ : /checked October 2026/);
    assert.doesNotMatch(text, /税込|tax[- ]inclusive|including tax/i);
  });

  test(`${file}: four examples recalculate`, () => {
    const rows = read(file).split('\n').filter(line => /^\| E\d /.test(line)).map(split);
    assert.equal(rows.length, 4);
    for (const [id, mode, profile, key, offset, twist, low, high, output] of rows) {
      const o = { mode, offset: +offset, twist: +twist };
      assert.deepEqual(c.actualFrequencies(key, o).map(f => +f.toFixed(2)), [+low, +high], id);
      const wave = c.sequence(key, 48000, o);
      assert.equal(c.decode(wave.samples, 48000, profile).text, output === '—' ? '' : output, id);
    }
  });

  test(`${file}: windows and four source-specific rows`, () => {
    const text = read(file);
    const windows = text.split('\n').filter(line => /^\| (8000|44100|48000) \|/.test(line)).map(split);
    assert.equal(windows.length, 3);
    for (const [rate, n, resolution] of windows) {
      assert.equal(c.windowLength(+rate), +n);
      assert.equal(+(rate / n).toFixed(2), +resolution);
    }
    const rows = text.split('\n').filter(line => /^\| (Q\.23 \/|Q\.24 A-1 \/|NTT[^|]+\/)/.test(line)).map(split);
    assert.equal(rows.length, 4);
    assert.deepEqual(numbers(rows[0].slice(1).join(' ')), [1.8]);
    for (const [i, profile] of [[1, 'NTT'], [2, 'ATT']]) {
      const p = c.PROFILES[profile];
      assert.deepEqual(numbers(rows[i].slice(1).join(' ')), [p.accept, p.reject, 40, p.short, p.pause, p.cycle, p.min, p.max]);
    }
    assert.deepEqual(numbers(rows[3].slice(1).join(' ')), [1.5, 50, 30, 120, 0, 5]);
  });

  test(`${file}: measured ranges agree with evidence and endpoints`, () => {
    const rows = read(file).split('\n').filter(line => /^\| (ideal|ic) \|/.test(line)).map(split);
    assert.equal(rows.length, 4);
    for (const [mode, profile, all, any] of rows) {
      const range = numbers(all), union = numbers(any);
      for (const rate of [8000, 44100, 48000]) {
        const evidence = measurement.conditions.find(x => x.mode === mode && x.profile === profile && x.rate === rate);
        assert.deepEqual(evidence.all, range); assert.deepEqual(evidence.any, union);
        for (const offset of range) {
          for (const key of c.KEYS.join('')) {
            assert.equal(c.decode(c.sequence(key, rate, { mode, offset }).samples, rate, profile).text, key);
          }
        }
        for (const offset of [range[0] - 0.1, range[1] + 0.1]) {
          const accepted = [...c.KEYS.join('')].filter(key =>
            c.decode(c.sequence(key, rate, { mode, offset }).samples, rate, profile).text === key);
          assert.ok(accepted.length < 16, `${mode}/${profile}/${rate}/${offset}`);
        }
      }
    }
  });

  test(`${file}: local links, image limits and complete annotated tree`, () => {
    const text = read(file);
    const tree = text.match(/```text\n(dtmfusion\/[\s\S]+?)```/)[1];
    for (const line of tree.trimEnd().split('\n')) assert.match(line, /\s+# \S/);
    function walk(dir, relative = '') {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['.git', '.work', 'backups', 'logs', '__pycache__'].includes(entry.name)) continue;
        if (entry.isDirectory()) walk(path.join(dir, entry.name), `${relative}${entry.name}/`);
        else assert.ok(tree.includes(`${entry.name} `), `${relative}${entry.name}`);
      }
    }
    walk(root);
    for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
      if (!m[1].startsWith('https://')) assert.ok(fs.existsSync(path.join(root, m[1].split('#')[0])), m[1]);
    }
    const images = fs.readdirSync(path.join(root, 'assets'));
    assert.equal(images.length, 16);
    for (const name of images) {
      const data = fs.readFileSync(path.join(root, 'assets', name));
      assert.ok(data.length < 300 * 1024);
      assert.equal(data.readUInt32BE(16), 1120); assert.equal(data.readUInt32BE(20), 900);
    }
  });
}

test('README languages retain the same section order and measurement coverage', () => {
  const headings = file => [...read(file).matchAll(/^## (\S+) /gm)].map(m => m[1]);
  assert.deepEqual(headings('README.md'), headings('README.en.md'));
  assert.equal(measurement.count, 16 * 101 * 2 * 2 * 3);
  assert.equal(measurement.wrong, 0); assert.equal(measurement.conditions.length, 12);
  assert.equal(measurement.offline.length, 12); assert.equal(measurement.windowTrials.length, 6);
  assert.ok(measurement.offline.every(row => row.text === c.KEYS.join('')));
});
