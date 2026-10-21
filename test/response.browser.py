"""Held-key latency regression; existing Python Playwright / Chromium required.

--baseline records without enforcing the new limits. --url tests a deployed build.
The first press is reported separately; the following five use different keys.
"""
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from statistics import median
import argparse
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--baseline', action='store_true')
parser.add_argument('--url')
parser.add_argument('--geometry-only', action='store_true')
args = parser.parse_args()
OUT = ROOT / '.work' / ('response-' + ('before-' if args.baseline else 'after-') + datetime.now().strftime('%Y%m%d_%H%M%S'))
OUT.mkdir(parents=True, exist_ok=False)

INSTRUMENT = '''(() => {
  window.measurements = [];
  let current = null;
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function(...args) {
    if (current) { current.audio = performance.now() - current.at;
      current.loop = this.loop; current.seconds = this.buffer.duration; }
    return start.apply(this, args);
  };
  document.addEventListener('pointerdown', e => {
    const button = e.target.closest('[data-key]');
    if (!button) return;
    current = {key:button.dataset.key, at:performance.now()};
    measurements.push(current);
    const item = current;
    requestAnimationFrame(() => { item.frame = performance.now() - item.at;
      item.lit = button.classList.contains('active'); });
  }, true);
})();'''


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
results = []
geometry = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width in [320, 390, 1280]:
            for theme in ['dark', 'light']:
                page = browser.new_page(viewport={'width':width, 'height':1000}, color_scheme=theme,
                                        reduced_motion='reduce')
                page.goto(args.url or f'http://127.0.0.1:{server.server_port}/')
                states = {}
                for state in ['on', 'off']:
                    if state == 'off':
                        page.locator('#xray-toggle').click()
                    states[state] = page.evaluate('''() => {
                      const rect = e => { const r=e.getBoundingClientRect();
                        return {x:r.x+scrollX, y:r.y+scrollY, width:r.width, height:r.height}; };
                      return {keys:[...document.querySelectorAll('[data-key]')].map(rect),
                        shell:rect(document.getElementById('keypad-shell')),
                        below:rect(document.querySelector('.matrix-hint'))};
                    }''')
                    page.locator('.key-station').screenshot(path=str(OUT/f'{width}-{theme}-{state}.png'))
                delta = max(abs(a[k]-b[k]) for a,b in zip(
                    states['on']['keys']+[states['on']['shell'],states['on']['below']],
                    states['off']['keys']+[states['off']['shell'],states['off']['below']]) for k in a)
                geometry.append({'width':width, 'theme':theme, 'delta':delta, **states})
                if not args.baseline:
                    assert delta <= 0.5, geometry[-1]
                page.close()
        for mode in ([] if args.geometry_only else ['ideal', 'ic']):
            for cpu in [1, 4]:
                page = browser.new_page(viewport={'width':390, 'height':1000}, reduced_motion='reduce')
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.add_init_script(INSTRUMENT)
                page.goto(args.url or f'http://127.0.0.1:{server.server_port}/')
                # Set the initial layer without a user gesture or AudioContext startup.
                page.evaluate('''mode => { document.getElementById('layer').value=mode;
                  document.getElementById('twist').value=mode==='ic'?'2.7':'2'; }''', mode)
                cdp = page.context.new_cdp_session(page)
                cdp.send('Emulation.setCPUThrottlingRate', {'rate':cpu})
                for i, key in enumerate('55129D'):
                    button = page.locator(f'[data-key="{key}"]')
                    button.scroll_into_view_if_needed()
                    box = button.bounding_box()
                    page.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2)
                    page.mouse.down()
                    page.wait_for_function('''n => measurements.length===n &&
                      measurements[n-1].audio !== undefined && measurements[n-1].frame !== undefined''', arg=i+1)
                    page.mouse.up()
                    page.wait_for_timeout(200)
                data = page.evaluate('measurements')
                warm = data[1:]
                record = {'mode':mode, 'cpu':cpu, 'cold':data[0], 'warm':warm,
                          'medianAudio':median(x['audio'] for x in warm),
                          'medianFrame':median(x['frame'] for x in warm)}
                results.append(record)
                print(json.dumps(record), flush=True)
                assert not errors, errors
                assert all(x['lit'] for x in data), data
                if not args.baseline:
                    limit = 30 if cpu == 1 else 100
                    assert all(x['audio'] <= limit and x['frame'] <= limit for x in warm), record
                    assert all(x['loop'] and 0.5 <= x['seconds'] <= 2 for x in data), data
                page.close()
        browser.close()
finally:
    server.shutdown()
    (OUT/'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    (OUT/'geometry.json').write_text(json.dumps(geometry, indent=2), encoding='utf-8')
print(f'Latency results: {OUT}', flush=True)
