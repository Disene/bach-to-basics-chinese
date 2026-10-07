<p align="center">
  <a href="https://github.com/Disene/bach-to-basics-chinese">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark-mode.png">
      <img alt="Bach to Basics" src="docs/logo.png" width="340">
    </picture>
  </a>
</p>

<p align="center">
  <a href="README.md">简体中文</a> · <strong>English</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-7c3aed"></a>
  <a href="https://github.com/Disene/bach-to-basics-chinese/issues"><img alt="Issues" src="https://img.shields.io/github/issues/Disene/bach-to-basics-chinese"></a>
  <a href="https://github.com/gigliof/bach-to-basics"><img alt="Upstream" src="https://img.shields.io/badge/upstream-gigliof%2Fbach--to--basics-64748b"></a>
</p>

# Bach to Basics — Simplified Chinese Fork

This repository is a Simplified Chinese fork of [gigliof/bach-to-basics](https://github.com/gigliof/bach-to-basics). The original MIT license and upstream attribution are preserved.

The fork keeps the upstream structure as much as possible while adding a **Simplified Chinese UI**, reproducible Docker deployment, and fixes discovered through real piano-practice use across MIDI input, wait mode, fingering, sheet music, and sustain.

> If you want the original English UI, use the upstream project. This fork intentionally does not add runtime language switching yet, which keeps maintenance and upstream synchronization simpler.

## Features

- **MIDI / MusicXML / PDF / audio import**
- **Falling notes**
- **Interactive 88-key piano**
- **Rendered sheet music with playback following**
- **A/B loop**
- **Wait mode**
- **Speed trainer**
- **Metronome**
- **Transposition**
- **Per-hand volume**
- **Automatic fingering**
- **Hardware MIDI input**
- **CC64 sustain pedal**
- **5 sampled instrument choices**
- **Dark / light mode**
- **MIDI / MusicXML / PDF / MP3 export**

## Improvements in this fork

- **Simplified Chinese localization** for the main UI, settings, import/export flows, MIDI, visible errors, PWA metadata, and common backend errors.
- **Hardware MIDI fix** so a connected MIDI keyboard produces sound and participates in wait-mode matching.
- **Wait-mode fixes** so playback pauses at the real note onset and correctly handles chords, transposition, and per-hand waiting.
- **Fingering fixes** for single-track MIDI mapping, asynchronous MusicXML generation, and lookahead-cached notes.
- **Sheet-music fixes** for alphaTab + Vite production integration, multi-track piano rendering, and stale lazy-chunk recovery after deployment.
- **CC64 sustain support** for live hardware pedal state/audio sustain and source-MIDI pedal playback/visualization.
- **Docker / development improvements** with Node 22, pnpm 9, and configurable `FRONTEND_PORT`.
- **Settings polish** including a responsive instrument selector, clearer sustain controls, and visible failure messages.

## Verified workflows

| Workflow | Status |
| --- | --- |
| MIDI import / playback / falling notes | ✅ Manually verified |
| Hardware MIDI keyboard audio | ✅ Manually verified |
| Wait mode | ✅ Manually verified |
| Automatic fingering | ✅ Manually verified |
| Sheet-music rendering | ✅ Manually verified |
| Live CC64 pedal state and sustain | ✅ Manually verified |
| Source-MIDI CC64 playback / markers | ✅ Manually verified |
| Instrument switching and settings layout | ✅ Manually verified |
| Docker deployment | ✅ Manually verified |

## Quick start

### Docker (recommended)

Requires Docker Desktop or Docker Engine + Compose.

```bash
git clone https://github.com/Disene/bach-to-basics-chinese.git
cd bach-to-basics-chinese
cp .env.example .env
docker compose up -d --build
```

Open:

```text
http://localhost:5173
```

If port 5173 is unavailable or reserved on Windows, set this in `.env`:

```env
FRONTEND_PORT=51722
```

Then open:

```text
http://localhost:51722
```

> Use either `localhost` or `127.0.0.1` consistently. PWA / Service Worker storage treats them as different origins.

### Native development

Requirements:

- Node.js 22+
- pnpm 9
- Python 3.11 / 3.12
- Official Audiveris installer only for staff-notation PDF recognition; modern installers include their Java runtime

```bash
npm i -g pnpm@9
pnpm install
pnpm backend:setup
pnpm dev
```

The frontend defaults to `http://localhost:5173`; the backend runs on `http://localhost:8000`.

## MIDI and sustain pedal

After connecting a MIDI keyboard:

1. Choose it from the MIDI device selector in the top-right corner.
2. Hardware input drives audio, the on-screen keyboard, and wait mode.
3. **CC64 sustain pedal** input is supported.
4. The header shows the live pedal state: raised / down.
5. If an imported MIDI contains CC64, the settings panel reports detected pedal ranges and can show source-pedal markers and sustain ghosts.

> Web MIDI requires HTTPS in production. iOS Safari currently does not support Web MIDI.

## Fingering

The fork supports:

- finger digits 1–5 on piano keys;
- optional finger digits on falling notes;
- automatic fingering through [pianoplayer](https://github.com/marcomusy/pianoplayer);
- preservation of editorial MusicXML fingerings as anchors for regeneration.

## Optional backend features

### PDF import: Audiveris

PDF → MusicXML requires [Audiveris](https://github.com/Audiveris/audiveris).

An optional Docker build-time installation path is available: set `INSTALL_AUDIVERIS=1` in `.env` and rebuild the backend. The build downloads a pinned official complete package and verifies its SHA-256. The default is `0`, preserving the lightweight deployment.

**This new path still needs a real Docker build and OMR validation; it is not covered by the previously verified workflows above.** See [Audiveris installation](docs/AUDIVERIS.md) for architecture support, commands, and verification boundaries.

The existing `backend/bin/audiveris.jar` mount remains a legacy option. Do not copy only the main JAR out of a modern distribution. Installing on the Windows host does not install it in the container. This path targets conventional staff notation, not numbered-notation-only PDFs.

### PDF export: LilyPond

PDF export requires [LilyPond](https://lilypond.org/).

MIDI and MusicXML export continue to work without it.

### Audio-to-MIDI: Basic Pitch

Audio transcription uses [Basic Pitch](https://github.com/spotify/basic-pitch) after installing the optional transcription dependencies.

## Public deployment

For public hosting:

- use HTTPS;
- configure exact `ALLOWED_ORIGINS`;
- keep rate limiting enabled;
- put the app behind access control / SSO / a controlled reverse proxy.

The backend supports `BACKEND_API_KEY` and `REQUIRE_AUTH=1`, but the bundled browser UI does not inject `X-API-Key` by itself. Do not enable a backend-only API key unless your proxy/client supplies it.

## Upstream synchronization

Upstream project:

https://github.com/gigliof/bach-to-basics

This fork tries to keep reusable changes separable so upstream updates remain easy to merge and general fixes can be contributed back.

## Contributing

Issues and pull requests are welcome. General fixes and features that benefit all users should preferably be contributed upstream as well.

See [CONTRIBUTING.md](CONTRIBUTING.md) before development.

## License

MIT License. See [LICENSE](LICENSE).

Original upstream authorship and copyright notices are preserved.
