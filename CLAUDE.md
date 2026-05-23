# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Node.js web application that lets users type an ICAO airport code and receive a plain-English weather report decoded from live METAR data.

## Commands

```bash
npm install      # Install dependencies (requires Node 18+)
npm start        # Start dev server → http://localhost:3000
npm test         # Run Jest unit tests
```

No build step — the server serves static files directly from `public/`.

## Architecture

```
index.js            # Express server entry point
lib/
  metar-parser.js   # Pure METAR parsing logic (no DOM, no HTTP)
public/
  index.html        # Single-page UI
  app.js            # Browser-side rendering and fetch logic
  style.css         # Dark-theme styles (no framework)
test/
  metar-parser.test.js  # Jest unit tests for the parser
```

**`index.js`** — Express server (port 3000). Serves `public/` as static files and exposes one proxy endpoint:
- `GET /api/metar/:id` — fetches raw METAR text from `aviationweather.gov` and forwards it. The proxy exists solely to avoid browser CORS restrictions.

**`lib/metar-parser.js`** — Pure parsing logic shared by the server and tests:
- `parseMetar(raw)` — tokenises the raw METAR string and returns a structured object with fields: `station`, `time`, `wind`, `visibility`, `weather`, `clouds`, `temp`, `dewpoint`, `altimeter`.

**`public/app.js`** — All browser-side logic:
- Calls `/api/metar/:id`, passes the response to `parseMetar`, and calls `renderWeather`.
- `renderWeather(parsed, raw)` — builds the weather card HTML and inserts it into the DOM.
- Unit converters: C→F, knots→mph, Magnus-formula humidity, heat index/wind chill, bearing→cardinal direction.

## Data source

`https://aviationweather.gov/api/data/metar?ids=<ICAO>` returns raw METAR text. The app uses the first line when multiple results are returned. An empty response means the code is unknown or has no active station.

## Code style

- Plain JavaScript (ES2020+) — no TypeScript, no transpilation.
- CommonJS (`require`/`module.exports`) on the server; plain `<script>` tags in the browser.
- No linter configured — follow the style of surrounding code.
- Prefer `const`, use `let` only when reassignment is necessary.
- No semicolons are **not** enforced — match the file you're editing.

## Testing

Tests live in `test/` alongside the module they cover and use Jest. Run with `npm test`.

- Unit-test pure functions in `lib/` directly.
- Do **not** mock the METAR parser in tests — test against real METAR strings.
- Avoid testing `public/app.js` DOM logic; keep rendering logic thin so the parser stays testable.

## Common gotchas

- The parser receives the **raw METAR string** as a single line; strip trailing whitespace before passing it.
- METAR fields are space-delimited but some tokens span multiple segments (e.g., wind gusts `27015G25KT`). Tokenise with `.split(' ')` rather than trying to parse character offsets.
- Altimeter is in inches of mercury (`A2992`) in US METARs and hectopascals (`Q1013`) elsewhere — the parser handles both.
- `aviationweather.gov` occasionally returns HTTP 200 with an empty body for unknown station codes; treat an empty body as "not found".
