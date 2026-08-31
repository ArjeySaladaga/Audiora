# Audiora
Audiora is an offline music player.
A sleek, dark-themed desktop music player built with Electron, vanilla JavaScript, HTML, and CSS.

## Features

- Add individual audio files or an entire folder (recursive scan) to your library
- Drag & drop files straight onto the window
- Play / pause / next / previous, shuffle, and repeat (off → all → one)
- Seek bar with live time display, volume control
- Live frequency-bar audio visualizer (Web Audio API)
- Search/filter your library instantly
- Library, volume, shuffle, and repeat settings persist between launches
- Keyboard shortcuts:
  - `Space` — play / pause
  - `←` / `→` — seek back / forward 5s
  - `↑` / `↓` — volume up / down

Supported formats: MP3, WAV, OGG, M4A, FLAC, AAC, OPUS (whatever your OS's Chromium build can decode).

## Getting started

```bash
cd audiora
npm install
npm start
```

## Building a distributable

```bash
npm run dist
```

This uses `electron-builder` to produce a packaged app for your current platform (see the `build` field in `package.json` to configure mac/win/linux targets).

## Project structure

```
audiora/
├── main.js          # Electron main process (window, dialogs, folder scanning)
├── preload.js        # Secure bridge exposing a minimal API to the renderer
├── package.json
└── src/
    ├── index.html     # App layout
    ├── css/styles.css # Dark theme styling
    └── js/renderer.js # Player logic, playlist, visualizer
```

## Notes

- The app uses `contextIsolation` with no Node integration in the renderer, and a `preload.js` bridge for filesystem dialogs — the renderer never touches `fs` directly.
- Track titles/artists are inferred from filenames formatted as `Artist - Title.ext`; otherwise the filename is used as the title.
