"""Theme priority and power display regression with an existing Python Playwright setup."""
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json, re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'.work'/('interface-' + datetime.now().strftime('%Y%m%d_%H%M%S'))
OUT.mkdir(parents=True, exist_ok=False)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def power_fixture(page, powers, expected):
    # Inject a decoder result to test the display independently of the signal detector.
    page.evaluate('powers => { window.testPowers = powers; }', powers)
    page.locator('#direct').click()
    actual = page.locator('.power').evaluate_all('''rows => rows.map(row => {
      const m=row.querySelector('meter');
      return {db:row.lastElementChild.textContent, min:m.min, max:m.max,
        value:m.value, accessible:m.getAttribute('aria-valuetext')};
    })''')
    assert len(actual) == 8
    for row, db in zip(actual, expected):
        assert row['db'] == f'{db} dB' and row['accessible'] == row['db'], row
        assert (row['min'], row['max']) == (-60, 0)
        assert abs(row['value'] - max(-60, db)) < 0.001, row
    return [(row['value'] + 60) / 60 for row in actual]


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
results = []
try:
    with sync_playwright() as p:
        for engine in [p.chromium, p.firefox]:
            for scheme in ['http', 'file']:
                browser = engine.launch()
                url = f'http://127.0.0.1:{server.server_port}/' if scheme == 'http' else (ROOT/'index.html').as_uri()
                for device in ['light', 'dark']:
                    for stored in [None, 'light', 'dark', 'blocked']:
                        context = browser.new_context(viewport={'width':320, 'height':1000}, color_scheme=device,
                            has_touch=True, reduced_motion='reduce', **({'is_mobile':True} if engine.name=='chromium' else {}))
                        context.add_init_script('''let testedCore;
                          Object.defineProperty(window, 'DTMFCore', {get:()=>testedCore, set(core) {
                            testedCore={...core, decode(...args) {
                              return window.testPowers ? {text:'5', results:[], last:{powers:window.testPowers}} : core.decode(...args);
                            }};
                          }});''')
                        if stored == 'blocked':
                            context.add_init_script('''Object.defineProperty(window, 'localStorage', {
                              get() { throw new DOMException('Blocked', 'SecurityError'); }
                            });''')
                        elif stored:
                            context.add_init_script('''if (!localStorage.getItem('dtmfusion.theme')) {
                              localStorage.setItem('dtmfusion.theme', ''' + json.dumps(stored) + ''');
                            }''')
                        page = context.new_page()
                        errors = []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.goto(url)
                        expected = device if stored in [None, 'blocked'] else stored
                        assert page.locator('html').get_attribute('data-theme') == expected, (device, stored)
                        assert page.locator('.masthead .eyebrow').inner_text() == 'DAY121 · KEY / TONE / CIRCUIT'
                        for lang in ['ja', 'en']:
                            if page.locator('html').get_attribute('lang') != lang:
                                page.locator('#language').click()
                            assert not re.search(r'\b(?:Lab|LAB)\b', page.locator('body').inner_text())
                            db = [-55, -25, -58, -54, -56, -23, -57, -53]
                            fractions = power_fixture(page, [10**(n/10) for n in db], db)
                            assert sum(value > 0.5 for value in fractions) == 2
                            assert max(value for i, value in enumerate(fractions) if i not in [1,5]) < 0.17
                            power_fixture(page, [0,1e-12,1e-9,1e-6,1e-3,1,10,1e-20], [-120,-120,-90,-60,-30,0,0,-120])
                            for width in [320, 1280]:
                                page.set_viewport_size({'width':width, 'height':1000})
                                assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
                        page.locator('#theme').click()
                        toggled = 'dark' if expected == 'light' else 'light'
                        assert page.locator('html').get_attribute('data-theme') == toggled
                        page.reload()
                        assert page.locator('html').get_attribute('data-theme') == (device if stored == 'blocked' else toggled)
                        assert not errors, errors
                        results.append([engine.name, scheme, device, stored])
                        context.close()
                browser.close()
finally:
    server.shutdown()
(OUT/'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(f'{len(results)} theme/storage conditions passed; bilingual branding, power values/ranges and 320/1280px passed; {OUT}')
