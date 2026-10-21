"""Optional UI regression: requires an existing Python Playwright browser setup."""
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.work' / ('keypad-' + datetime.now().strftime('%Y%m%d_%H%M%S'))
OUT.mkdir(parents=True, exist_ok=False)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def check_matrix(page, layer, offset=0):
    expected = page.evaluate('''({layer, offset}) => {
      const c = DTMFCore, digits = layer === 'ic' || offset ? 1 : 0;
      return [...c.LOW.map((_, i) => c.actualFrequencies(c.KEYS[i][0], {mode:layer, offset})[0]),
        ...c.HIGH.map((_, i) => c.actualFrequencies(c.KEYS[0][i], {mode:layer, offset})[1])]
        .map(f => f.toFixed(digits));
    }''', {'layer': layer, 'offset': offset})
    actual = page.locator('.matrix-row-label').all_text_contents() + page.locator('.matrix-col-label').all_text_contents()
    assert actual == expected, (actual, expected)
    assert page.locator('.matrix-wire').count() == 8
    assert page.locator('#keypad-wires').is_visible()
    assert page.evaluate('''() => {
      const svg = document.getElementById('keypad-wires'), texts = [...svg.querySelectorAll('text')];
      const boxes = texts.map(e => e.getBBox()), width = svg.viewBox.baseVal.width;
      return boxes.every(b => b.x >= 0 && b.y >= 0 && b.x+b.width <= width+0.01) &&
        boxes.every((a,i) => boxes.every((b,j) => i===j || a.x+a.width<=b.x || b.x+b.width<=a.x ||
          a.y+a.height<=b.y || b.y+b.height<=a.y));
    }'''), 'frequency labels overlap or leave the SVG'
    assert page.evaluate('''() => [...document.querySelectorAll('#keypad button, #xray-toggle')].every(e => {
      const r=e.getBoundingClientRect(); return r.width>=43.999 && r.height>=43.999;
    })'''), 'tap target smaller than 44px'


def press_and_check(page, key):
    position = '123A456B789C*0#D'.index(key)
    page.locator(f'[data-key="{key}"]').focus()
    page.keyboard.down(key)
    assert page.locator('.matrix-row.is-active').get_attribute('data-matrix-row') == str(position // 4)
    assert page.locator('.matrix-col.is-active').get_attribute('data-matrix-col') == str(position % 4)
    assert page.locator('.matrix-intersection').count() == 1
    assert page.evaluate('''key => {
      const shell=document.getElementById('keypad-shell').getBoundingClientRect();
      const button=[...document.querySelectorAll('[data-key]')].find(e=>e.dataset.key===key).getBoundingClientRect();
      const dot=document.querySelector('.matrix-intersection');
      return Math.abs(+dot.getAttribute('cx')-(button.left-shell.left+button.width/2))<0.1 &&
        Math.abs(+dot.getAttribute('cy')-(button.top-shell.top+button.height/2))<0.1;
    }''', key)
    page.keyboard.up(key)
    assert page.locator('#keypad-wires .is-active, .matrix-intersection').count() == 0


def geometry(page):
    return page.evaluate('''() => [...document.querySelectorAll(
      '#keypad button, #keypad-shell, .matrix-hint, .sequence-controls')].map(e => {
        const r=e.getBoundingClientRect();
        return [r.x+scrollX, r.y+scrollY, r.width, r.height];
      })''')


def same_geometry(before, after):
    assert len(before) == len(after) == 19
    assert max(abs(a-b) for ra,rb in zip(before,after) for a,b in zip(ra,rb)) <= 0.5, (before, after)


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
results = []
try:
    with sync_playwright() as p:
        for engine in [p.chromium, p.firefox]:
            for scheme in ['http', 'file']:
                url = f'http://127.0.0.1:{server.server_port}/' if scheme == 'http' else (ROOT/'index.html').as_uri()
                for width in [320, 390, 1280]:
                    browser = engine.launch()
                    context = browser.new_context(viewport={'width': width, 'height': 1000}, has_touch=True,
                        reduced_motion='reduce', **({'is_mobile': width < 600} if engine.name == 'chromium' else {}))
                    page = context.new_page()
                    errors, external = [], []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
                    page.on('request', lambda r: external.append(r.url) if r.url.startswith('https://') else None)
                    page.goto(url)
                    for lang in ['ja', 'en']:
                        if page.locator('html').get_attribute('lang') != lang:
                            page.locator('#language').click()
                        for theme in ['dark', 'light']:
                            if page.locator('html').get_attribute('data-theme') != theme:
                                page.locator('#theme').click()
                            for layer in ['ideal', 'ic']:
                                page.locator('#layer').select_option(layer)
                                check_matrix(page, layer)
                                keys = '123A456B789C*0#D' if width == 1280 and scheme == 'http' and lang == 'ja' else '5'
                                for key in keys:
                                    press_and_check(page, key)
                                for offset in [-5, 5, 0]:
                                    page.locator('#offset').evaluate('''(e, value) => {
                                      e.value=value; e.dispatchEvent(new Event('input', {bubbles:true}));
                                    }''', offset)
                                    check_matrix(page, layer, offset)
                                toggle = page.locator('#xray-toggle')
                                before = geometry(page)
                                toggle.focus()
                                page.keyboard.press('Space')
                                same_geometry(before, geometry(page))
                                assert toggle.get_attribute('aria-pressed') == 'false'
                                assert not page.locator('#keypad-wires').is_visible()
                                assert toggle.evaluate('(e) => e===document.activeElement')
                                page.locator('[data-key="5"]').focus()
                                page.keyboard.down('5')
                                assert page.locator('[data-path="row-1"].selected').count() == 1
                                page.keyboard.up('5')
                                toggle.click()
                                same_geometry(before, geometry(page))
                                assert toggle.get_attribute('aria-pressed') == 'true'
                                page.keyboard.down('5')
                                pressed = geometry(page)
                                toggle.evaluate('(e) => e.click()')
                                same_geometry(pressed, geometry(page))
                                toggle.evaluate('(e) => e.click()')
                                same_geometry(pressed, geometry(page))
                                page.keyboard.up('5')
                                check_matrix(page, layer)
                                assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
                                if engine.name == 'chromium' and scheme == 'http' and layer == 'ic':
                                    page.locator('[data-key="5"]').focus()
                                    page.keyboard.down('5')
                                    page.locator('.key-station').screenshot(path=str(OUT/f'{width}-{lang}-{theme}.png'))
                                    page.keyboard.up('5')
                                assert not errors, errors
                                assert not external, external
                                results.append([engine.name, scheme, width, lang, theme, layer])
                    browser.close()
finally:
    server.shutdown()
(OUT/'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(f'{len(results)} x-ray conditions passed: ON/OFF, 8 frequencies, intersections, offset, targets, labels; {OUT}')
