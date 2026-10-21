# DTMFusion development notes

Day121, slug `dtmfusion`. Vanilla classic scripts with UMD exports, MIT, no package dependencies.
The same files must work over HTTPS, localhost, and `file://`.

- `dtmf-core.js`: pure sample generation, nominal/IC tables, exact-frequency Goertzel, streaming receiver, WAV, standards.
- `audio-io.js`: AudioBuffer playback and microphone lifecycle. Never persist microphone samples.
- `app.js`: DOM, SVG circuits, plots and lessons. Use safe text/element construction.
- `messages.js`: all Japanese/English UI strings; keys must remain identical.
- `style.css`: color tokens, mobile layout and reduced motion. Keep both themes readable at 320px.
- `docs/measurements.json`: synthetic sweep and OfflineAudioContext evidence; no captured user audio.

Run `npm test` with Node 22+. Do not install dependencies. Syntax-check each JavaScript file.
Tests cover frequency sweeps at 8/44.1/48 kHz; do not relax expected results to hide failures.
Use 25.6ms Hann windows, 17 scan points (nominal ±4%, step 0.5%), interpolated deviations,
and source-specific acceptance/rejection limits. Preserve boundary `?` and rejection reasons.
The dominance ratio compares estimated peak power with nominal runner-up power; threshold 6.
Frequency averages must retain dominance and twist rejection checks.

Use `apply_patch` for source edits. Back up existing files locally before changes.
Never publish private recordings or execution logs.
Stop on denied operations rather than attempting another write mechanism.
Preserve the CSP, no inline handlers/styles, no network APIs, and only language/theme preferences.
Audio samples must use calculated AudioBuffers; no oscillator nodes. Keep combined gain ≤−12dBFS.
Do not depict estimated dividers as datasheet values or claim standards certification.

For release, verify all tests, HTTP and file browser states at 320/390/1280px, Japanese/English,
both themes and circuit layers, keyboard/dialog focus, reduced motion, and explicit WAV export.
Use Japanese commits and a normal PR merge; check push/PR/main CI, Pages and public SHA-256.
Keep README tables, translations, examples, directory trees and screenshots consistent.
