<!--
---
id: day121
slug: dtmfusion

title: "DTMFusion"

subtitle_ja: "電話の音を鳴らし、回路で見て、番号へ戻す"
subtitle_en: "Play telephone tones, trace the circuit, recover the digits"

description_ja: "DTMFの2音を透かし回路・波形・Goertzel解析で学ぶ教材。理想波とTP5089の教育用モデル、規格別の周波数偏差判定を備えます。"
description_en: "Learn DTMF through transparent circuits, waveforms and Goertzel analysis, with ideal tones, a TP5089 teaching model and frequency-offset decisions."

category_ja:
  - 通信技術
  - プライバシー
category_en:
  - Communication Technologies
  - Privacy

difficulty: 2

tags:
  - dtmf
  - goertzel
  - web-audio
  - side-channel
  - electronics

repo_url: "https://github.com/ipusiron/dtmfusion"
demo_url: "https://ipusiron.github.io/dtmfusion/"

hub: true
---
-->

# DTMFusion - Play telephone tones, trace the circuit, recover the digits

![GitHub Repo stars](https://img.shields.io/github/stars/ipusiron/dtmfusion?style=social)
![GitHub forks](https://img.shields.io/github/forks/ipusiron/dtmfusion?style=social)
![GitHub last commit](https://img.shields.io/github/last-commit/ipusiron/dtmfusion)
![GitHub license](https://img.shields.io/github/license/ipusiron/dtmfusion)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue?logo=github)](https://ipusiron.github.io/dtmfusion/)

**Day121 - Security Tools 200 Built with Generative AI**

DTMFusion is an educational tool for playing a telephone key as two tones, tracing their circuit paths, and recovering the digits from sound.
Switch between ideal tones and a TP5089 teaching model, and compare source-specific limits with the decoder's decisions.
The lessons also explain the acoustic side channel created when tones remain in a recording.

[日本語](README.md) / English

## 🌐 Demo

👉 **[Open DTMFusion](https://ipusiron.github.io/dtmfusion/)**

No installation is needed. You can also save the files and open `index.html` directly.
Microphone access requires browser permission. HTTPS or localhost is recommended; microphone behavior on `file://` varies by browser.
Lower the device volume before playing tones, and consider nearby people and pets.

## 📸 Screenshots

![Key 5 routes its row and column into two oscillators and a mixer](assets/block-en-dark.png)

Thick dashed paths and dots identify the selected signal route.

![TP5089 crystal, counters, converters and mixer](assets/ic-en-dark.png)

The IC layer distinguishes Table I frequencies from estimated divider values.

![Recovered 123 with estimated frequency deviations](assets/decode-en-dark.png)

Results include digits, reasons, and estimated low/high frequency deviations.

![Frequency matrix and cited lessons](assets/lesson-en-dark.png)

Six lessons distinguish primary evidence, calculations, and secondary accounts.
Light versions: [block](assets/block-en-light.png) / [IC](assets/ic-en-light.png) / [decode](assets/decode-en-light.png) / [lessons](assets/lesson-en-light.png). Japanese screenshots appear in the [Japanese README](README.md#-スクリーンショット).

## ✨ Features

- Sixteen keys in a 4×4 matrix; screen and keyboard input plays while held, for up to 60 seconds
- Sequences of up to 32 characters; defaults of 80 ms tone, 60 ms pause, and high group +2 dB
- Level difference −10 to +10 dB, frequency offset −5 to +5%, and tone/pause lengths 10–200 ms
- Two circuit layers, waveform, spectrum, and enlarged 28-step IC waveform
- Three decoder inputs: regenerate the last tone, load a WAV, or use the microphone; NTT/AT&T profiles
- Estimated frequency offset, `?` for boundaries, rejection reasons, and eight power meters
- Explicit WAV export, Japanese/English, dark/light themes, and reduced motion

## 📐 Screen layout

The page proceeds from key and circuit to waveform/spectrum, decoding, and lessons. On narrow screens the circuit appears below the keypad.
Waveform and spectrum are previews generated from the selected key and settings, not microphone measurements. The waveform spans 12 ms and the spectrum 600–1750 Hz.
Use the decoder's power meters and decisions to inspect microphone or WAV analysis.

## 📖 Usage

1. Hold key 5 and follow its 770 Hz and 1336 Hz paths. Release it to stop the tone.
2. Select the IC layer and follow the crystal, counters, converters, and mixer. The initial level difference changes to +2.7 dB.
3. Enter a sequence. Input other than 0–9, A–D, * and # is removed as you type.
4. Adjust the controls and inspect the source-specific limits. Direct decoding regenerates the most recently played key or sequence with its settings; before any playback it uses the input field.
5. Load a WAV or start the microphone. Microphone analysis stops after 60 seconds and releases resources on stop, page exit, or input interruption.
6. Save the current sequence as a PCM 16-bit WAV with the export button. Saving is never automatic.

WAV input supports PCM 16/24/32-bit or float32, one or two channels, 8–96 kHz, at most 60 seconds and 24 MiB. Stereo channels are averaged.
Loaded audio is released after decoding. Microphone samples pass through a short analysis window and are discarded; only displayed decisions remain.

## 🎯 Use cases

Ways of using this tool in particular

- In an information theory class, trace key 5 backward from 770 Hz + 1336 Hz (E1). Eight frequencies encode 4×4 = 16 combinations. This is not a voice classifier.
- Electronics learners can change ideal key 5 into the IC model's 770.1 Hz + 1331.7 Hz (E2), separating nominal values, Table I values, and divider estimates. This is not a transistor or voltage simulation.
- For a quality-control lesson, compare key 5 at +2%, which yields `?` (E3), with +3%, which is rejected (E4). This separates a specified boundary from an estimated measurement; it is not product certification.
- Puzzle designers can export `123` to WAV and recover the same sequence to demonstrate sound as symbols. The encoding does not keep the digits secret.

The tool also supports classroom or home study, research into older electronics, and discussion of information retained in recordings.
Microphone results depend on the room, speakers, and device audio processing.

These examples use 48 kHz, 80 ms tones, and 60 ms pauses. `—` means rejection without appending a digit. Tests recalculate both language versions.

| ID | mode | profile | key | offset % | twist dB | low Hz | high Hz | result |
|---|---|---|---|---|---|---|---|---|
| E1 | ideal | NTT | 5 | 0 | 2 | 770 | 1336 | 5 |
| E2 | ic | NTT | 5 | 0 | 2.7 | 770.1 | 1331.7 | 5 |
| E3 | ideal | NTT | 5 | 2 | 2 | 785.4 | 1362.72 | ? |
| E4 | ideal | NTT | 5 | 3 | 2 | 793.1 | 1376.08 | — |

## 🔬 Standards and measurements

Sending and receiving requirements are separate. The 40 ms / 23 ms values belong to the AT&T column of Q.24 Table A-1, not a universal ITU-T requirement.
Level difference means high minus low. This table covers the parameters used here, not every requirement in each source.

| Source | Frequency deviation | Tone duration | Pause | Cycle | Level difference |
|---|---|---|---|---|---|
| Q.23 / sender | ≤1.8% | Not specified | Not specified | Not specified | Not standardized |
| Q.24 A-1 / NTT receiver | Operate≤1.8%, reject≥3.0% | Operate≥40ms, reject≤24ms | ≥30ms | ≥120ms | −5…+5dB |
| Q.24 A-1 / AT&T receiver | Operate≤1.5%, reject≥3.5% | Operate≥40ms, reject≤23ms | ≥40ms | ≥93ms | −8…+4dB |
| NTT reference / terminal sender | ≤1.5% | ≥50ms | ≥30ms | ≥120ms | 0…+5dB |

Sources: [Q.23 (1988)](https://www.itu.int/rec/T-REC-Q.23-198811-I/en), [Q.24 (1988), Annex A](https://www.itu.int/rec/T-REC-Q.24-198811-I/en), and [NTT East v6.2 (July 2025), p.14](https://flets.com/denwa/gisanshi/pdf/analog_gisanshi.pdf). The NTT terminal table excludes the 1633 Hz column.

Analysis uses a 25.6 ms Hann window and exact-frequency Goertzel coefficients, without rounding to integer bins. Candidates selected from eight nominal frequencies are rescanned at 17 points over ±4% in 0.5% increments.
Log-power interpolation estimates each peak. Windows for the same key are averaged, and deviation decisions are rounded to 0.01%. This is the display/decision increment, not an accuracy guarantee.
Estimated peak power must be at least six times the nominal runner-up in each group. Estimated level difference is rounded to 0.1 dB.

| rate Hz | N | rate/N Hz |
|---|---|---|
| 8000 | 205 | 39.02 |
| 44100 | 1129 | 39.06 |
| 48000 | 1229 | 39.06 |

At 48 kHz, across all 16 keys at zero added offset, minimum dominance ratios were ideal/IC 27.11/27.10 with 20 ms windows, 1293.56/1261.38 with 25.6 ms, and 1413.24/1295.65 with 32 ms.
The 25.6 ms window was selected; threshold 6 leaves room for windows near tone edges and interruptions. This teaching setting does not guarantee a false-positive rate for arbitrary audio.

Synthetic measurements on 2026-10-21 gave the ranges below. Results were identical at 8, 44.1, and 48 kHz.
The axis is the offset added by the control. IC Table I frequencies already differ from nominal, so the control value is not the total standards deviation.

| mode | profile | All 16 keys accepted (%) | At least one key accepted (%) |
|---|---|---|---|
| ideal | NTT | -1.8 … +1.8 | -1.8 … +1.8 |
| ideal | ATT | -1.5 … +1.5 | -1.5 … +1.5 |
| ic | NTT | -1.4 … +1.1 | -1.8 … +2.1 |
| ic | ATT | -1.1 … +0.8 | -1.5 … +1.8 |

The ±5% sweep at 0.1% increments covered 16 keys × 2 waveforms × 2 profiles × 3 rates: 19,392 inputs and zero wrong-key outputs.
An absolute estimated deviation of at least 3.0% (NTT) or 3.5% (AT&T) is rejected as frequency offset. Above 1.8% / 1.5% and below the corresponding rejection limit, the result is the boundary symbol `?`.
Regression tests cover the exact operation and rejection limits and adjacent 0.1% points for all 16 ideal keys at all three rates.
See the [measurement data](docs/measurements.json). Receiver cycle time and second-harmonic checks against voice false positives are not implemented.
The standards panel calculates from control settings; the decoder estimates from sound. They are separate decisions.

## 📚 Circuit and lesson sources

- [TP5089 datasheet](https://pf.unikeyic.com/datasheet/43/7d/d1e0/437dd1e00336b1f0b5169f5d864a3432.pdf): primary-source mirror. The diagram shows the 3.579545 MHz crystal, programmable counters, ratioed-capacitor converters, mixer, and emitter follower. Audio uses Table I frequencies.
- Divider N = 184/166/150/136 and 106/96/86/78 is a calculation, not a datasheet value. 3579545/(28×150) gives 852.27 Hz, whereas Table I gives 852.4 Hz. The 28-step sine is an educational model, not a simulation of component values, voltages, or transients.
- [Schenker (1960)](https://www.repeater-builder.com/tech-info/dtmf/pdfs/bstj-39-01-pages-235-255.pdf): primary technical paper. Adjacent ratio 21:19, inter-group factor 1.5, and avoidance of vowel harmonic ratios. The 1960 proposal's high group was 1094/1209/1336/1477 Hz, without 1633 Hz.
- [Gorgas, Bell Labs Record (April 1968)](https://www.telephonecollectors.info/index.php/browse/document-repository/catalogs-manuals/bell-system-we/bell-labs-record/11826-68apr-blr-p106-autovon/file): primary source for AUTOVON's FO/F/I/P buttons and Routine without a button. Association with the 1633 Hz column comes from secondary sources such as [Crypto Museum](https://www.cryptomuseum.com/phone/autovon/index.htm).
- [PCI SSC v3.0 (November 2018)](https://listings.pcisecuritystandards.org/documents/Protecting_Telephone_Based_Payment_Card_Data_v3-0_nov_2018.pdf): primary industry source. Lessons discuss SAD (sensitive authentication data), suppression, masking, and DTMF bleed as described in the 2018 edition. SAD is not equated with all card-number data, and this is not a current compliance assessment.

## 🔄 Prior work

[DTMF_Codec](https://github.com/unfantasmaenelsistema/DTMF_Codec) already provides 16-key generation, WAV export, and file/microphone decoding.
This comparison reflects research on 2026-10-21; lack of documentation does not prove a feature is absent.

| Aspect | DTMF_Codec | DTMFusion |
|---|---|---|
| Generate and decode | 25 ms Goertzel window, ±1.5%, twist checks | 25.6 ms window, offset estimation, NTT/AT&T selection |
| Presentation | Tables and buttons; no transparent-circuit description found | Matrix→two tones→sum and TP5089 layers with selected paths |
| Context and language | CTF-oriented, Spanish/English | Side channels, source-specific limits, circuit history; Japanese/English |

## 🔒 Safeguards and limitations

Generation and analysis run locally. Audio and digits are not transmitted. Microphone input is not recorded or saved; WAV export requires an explicit action.
Only language and theme preferences are stored. Generated combined amplitude stays at or below −12 dBFS, with 2 ms ramps at both ends. dBFS does not measure acoustic sound pressure from the device.

The CSP remains as follows, with no additions for WAV export:

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; connect-src 'none'
```

There are no inline scripts, event handlers, style attributes, external libraries, or external fonts. Safe DOM operations insert text, and `referrer=no-referrer` is set.
Tests check text contrast in both themes. Paths and decisions use cues beyond color, and reduced motion uses static emphasis.

This is not a standards-compliant receiver; confidence is not a statistical probability of correctness. Physical speaker-to-microphone tests, separate devices/telephones, and physical Safari devices remain untested.
Firefox same-device loopback processing and iOS audio-route changes can affect results.
The author, IPUSIRON, writes technical books in the security field and does not encourage misuse.

## 🔗 Related tools

- [Day120 Airborne Tone Link](https://ipusiron.github.io/airborne-tone-link/): represents one byte with two tones, extending the same idea to another code. Its audio generation and lifecycle handling served as implementation references (same author's MIT code).
- [Day041 Mic Gain Logger](https://ipusiron.github.io/mic-gain-logger/): monitors microphone frequency bands and helps study room and device input conditions.

## 🧪 Tests

Use Node.js 22 or newer. No packages need to be installed.

```sh
npm test
node --test test/frequency.test.js
```

GitHub Actions checks syntax and tests on push and pull_request. Coverage includes mappings, 16-key round trips, gain, timing, noise, frequency offset, WAV, audio cleanup, CSP, dictionaries, contrast, and README calculations.
Browser checks cover 96 combinations of HTTP/`file://`, Chromium/Firefox, 320/390/1280 px, Japanese/English, dark/light, and both circuit layers.
OfflineAudioContext covers 12 combinations of three rates, two waveforms, and two profiles. A generated WAV supplied to a fake microphone recovers `123*#`. These are not substitutes for physical acoustic tests.

## 📁 Directory structure

```text
dtmfusion/                     # Tool files
├── .github/                   # GitHub configuration
│   └── workflows/             # CI
│       └── test.yml           # Node 22 syntax and tests
├── .gitattributes             # Line-ending rules
├── .gitignore                 # Excludes work files and backups
├── index.html                 # Single-page interface and CSP
├── style.css                  # Themes and responsive layout
├── messages.js                # Japanese and English text
├── dtmf-core.js               # Pure synthesis, analysis and limits
├── audio-io.js                # Playback, microphone and cleanup
├── app.js                     # DOM, circuits, plots and lessons
├── package.json               # Dependency-free test command
├── LICENSE                    # MIT License
├── CLAUDE.md                  # Development and verification notes
├── README.md                  # Japanese guide
├── README.en.md               # English guide
├── docs/                      # Measurement results
│   └── measurements.json      # Full-condition ranges and windows
├── assets/                    # Screenshots from the application
│   ├── block-ja-dark.png      # Block diagram, Japanese, dark
│   ├── block-ja-light.png     # Block diagram, Japanese, light
│   ├── block-en-dark.png      # Block diagram, English, dark
│   ├── block-en-light.png     # Block diagram, English, light
│   ├── ic-ja-dark.png         # IC layer, Japanese, dark
│   ├── ic-ja-light.png        # IC layer, Japanese, light
│   ├── ic-en-dark.png         # IC layer, English, dark
│   ├── ic-en-light.png        # IC layer, English, light
│   ├── decode-ja-dark.png     # Decoder, Japanese, dark
│   ├── decode-ja-light.png    # Decoder, Japanese, light
│   ├── decode-en-dark.png     # Decoder, English, dark
│   ├── decode-en-light.png    # Decoder, English, light
│   ├── lesson-ja-dark.png     # Lessons, Japanese, dark
│   ├── lesson-ja-light.png    # Lessons, Japanese, light
│   ├── lesson-en-dark.png     # Lessons, English, dark
│   └── lesson-en-light.png    # Lessons, English, light
└── test/                      # node:test suite
    ├── core.test.js           # Mapping, synthesis, decoding and limits
    ├── frequency.test.js      # Offset and wrong-key regressions
    ├── audio.test.js          # Audio resource cleanup
    ├── wav.test.js            # WAV and invalid input
    ├── structure.test.js      # CSP, dictionaries, colors and format
    └── readme.test.js         # README tables, structure and images
```

## 💻 Requirements

Use a browser with Web Audio API support. Chromium and Firefox have been checked over HTTP and `file://`. HTTPS or localhost is recommended for microphone access.
For local HTTP, run this in the tool directory and open `http://127.0.0.1:8000/`:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

## 📄 License

MIT License; see [LICENSE](LICENSE). There are no external package dependencies.
The educational diagrams were drawn from the functional structures described by their sources.

## 🛠️ About this tool

This tool is part of the Security Tools 200 Built with Generative AI project.
With AI assistance, the project creates and publishes security-related tools over 100 days.

For project details and other tools, see:

🔗 [Security Tools 200 Built with Generative AI](https://akademeia.info/?page_id=44607)
