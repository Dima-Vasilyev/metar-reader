# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Node.js web application that lets users type an airport code and receive a plain-English weather report decoded from live METAR data.

## Commands

```bash
npm install      # Install dependencies (requires Node 18+)
npm start        # Start the server → http://localhost:3000
```

## Architecture

**`index.js`** — Express server (port 3000). Serves `public/` as static files and exposes one proxy endpoint:
- `GET /api/metar/:id` — fetches raw METAR text from `aviationweather.gov` and forwards it. The proxy exists solely to avoid browser CORS restrictions.

**`public/app.js`** — All client-side logic:
- `parseMetar(raw)` — tokenises the raw METAR string and extracts structured fields (station, time, wind, visibility, weather phenomena, cloud layers, temp/dewpoint, altimeter).
- `renderWeather(parsed, raw)` — builds the weather card HTML and inserts it into the DOM.
- Helper functions convert units (C→F, knots→mph), calculate humidity (Magnus formula), heat index / wind chill, and map degree bearings to cardinal directions.

**`public/style.css`** — Dark-theme stylesheet. No framework.

## Data source

`https://aviationweather.gov/api/data/metar?ids=<ICAO>` — returns raw METAR text. The app takes the first line when multiple results are returned. An empty response means the airport code is unknown or has no active METAR station.
