const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/lib', express.static(path.join(__dirname, 'lib')));

app.get('/api/metar/:id', async (req, res) => {
  const id = req.params.id.toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid airport code. Use a 3–4 character ICAO code (e.g. KPDX, EGLL).' });
  }
  try {
    const response = await fetch(`https://aviationweather.gov/api/data/metar?ids=${id}`);
    if (!response.ok) {
      return res.status(502).json({ error: 'Weather service returned an error. Try again shortly.' });
    }
    const text = await response.text();
    if (!text.trim()) {
      return res.status(404).json({ error: `No METAR found for "${id}". Check that it is a valid ICAO airport code.` });
    }
    res.type('text').send(text.trim());
  } catch {
    res.status(500).json({ error: 'Unable to reach the weather service. Check your connection.' });
  }
});

app.get('/api/airport/:id', async (req, res) => {
  const id = req.params.id.toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid airport code.' });
  }
  try {
    const response = await fetch(`https://aviationweather.gov/api/data/airport?ids=${id}`);
    if (!response.ok) return res.status(502).json({});
    const text = await response.text();
    res.json(parseAirportText(text));
  } catch {
    res.status(500).json({});
  }
});

const STATE_TZ = {
  // Eastern
  CT:'America/New_York', DC:'America/New_York', DE:'America/New_York',
  FL:'America/New_York', GA:'America/New_York', IN:'America/Indiana/Indianapolis',
  KY:'America/New_York', MA:'America/New_York', MD:'America/New_York',
  ME:'America/New_York', MI:'America/Detroit',  NC:'America/New_York',
  NH:'America/New_York', NJ:'America/New_York', NY:'America/New_York',
  OH:'America/New_York', PA:'America/New_York', RI:'America/New_York',
  SC:'America/New_York', TN:'America/Chicago',  VA:'America/New_York',
  VT:'America/New_York', WV:'America/New_York',
  // Central
  AL:'America/Chicago',  AR:'America/Chicago',  IA:'America/Chicago',
  IL:'America/Chicago',  KS:'America/Chicago',  LA:'America/Chicago',
  MN:'America/Chicago',  MO:'America/Chicago',  MS:'America/Chicago',
  ND:'America/Chicago',  NE:'America/Chicago',  OK:'America/Chicago',
  SD:'America/Chicago',  TX:'America/Chicago',  WI:'America/Chicago',
  // Mountain
  CO:'America/Denver',   ID:'America/Boise',    MT:'America/Denver',
  NM:'America/Denver',   UT:'America/Denver',   WY:'America/Denver',
  // Pacific
  CA:'America/Los_Angeles', NV:'America/Los_Angeles',
  OR:'America/Los_Angeles', WA:'America/Los_Angeles',
  // Special US
  AZ:'America/Phoenix',  AK:'America/Anchorage', HI:'Pacific/Honolulu',
  // Canada
  AB:'America/Edmonton', BC:'America/Vancouver', MB:'America/Winnipeg',
  NB:'America/Moncton',  NL:'America/St_Johns',  NS:'America/Halifax',
  ON:'America/Toronto',  QC:'America/Toronto',   SK:'America/Regina',
  YT:'America/Whitehorse',
};

function parseAirportText(text) {
  const get = (key) => {
    const m = text.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  };

  const rawName = get('Name');
  let name = null, site = null;
  if (rawName) {
    const slash = rawName.indexOf('/');
    const airportPart = slash !== -1 ? rawName.slice(slash + 1) : rawName;
    const cityPart    = slash !== -1 ? rawName.slice(0, slash) : null;
    name = toTitleCase(expandAbbreviations(airportPart));
    site = cityPart ? toTitleCase(cityPart) : null;
  }

  const state = get('State');
  return {
    name,
    site,
    state,
    country:  get('Country'),
    iata:     get('IATA'),
    timezone: STATE_TZ[state] || null,
  };
}

function expandAbbreviations(s) {
  return s
    .replace(/\bINTL\b/g, 'International')
    .replace(/\bREGNL?\b/g, 'Regional')
    .replace(/\bMUNI\b/g, 'Municipal')
    .replace(/\bEXEC\b/g, 'Executive')
    .replace(/\bMEML\b/g, 'Memorial')
    .replace(/\bARPT?\b/g, 'Airport')
    .replace(/\bFLD\b/g, 'Field')
    .replace(/\bSTA\b/g, 'Station');
}

function toTitleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Airport search ───────────────────────────────────────────────────────────

let airportCache = null;

async function loadAirports() {
  if (airportCache) return airportCache;
  const res  = await fetch('https://davidmegginson.github.io/ourairports-data/airports.csv');
  const text = await res.text();
  const lines = text.trim().split('\n');
  const headers = parseCSVLine(lines[0]);

  airportCache = lines.slice(1)
    .map(line => {
      const vals = parseCSVLine(line);
      const obj  = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    })
    .filter(a => (a.type === 'large_airport' || a.type === 'medium_airport') && /^[A-Z]{1}[A-Z0-9]{2,3}$/.test(a.ident))
    .map(a => ({
      icao:    a.ident,
      iata:    a.iata_code,
      name:    a.name,
      city:    a.municipality,
      country: a.iso_country,
    }));

  return airportCache;
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"')            { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else                      { cur += c; }
  }
  result.push(cur);
  return result;
}

app.get('/api/airports/search', async (req, res) => {
  const q = (req.query.q || '').trim().toUpperCase();
  if (q.length < 2) return res.json([]);
  try {
    const airports = await loadAirports();
    const exact    = [], prefix = [], contains = [];
    for (const a of airports) {
      const nameUp = a.name.toUpperCase();
      const cityUp = a.city.toUpperCase();
      if (a.icao === q || a.iata === q)                              exact.push(a);
      else if (a.icao.startsWith(q) || a.iata.startsWith(q))        prefix.push(a);
      else if (nameUp.includes(q) || cityUp.includes(q))            contains.push(a);
      if (exact.length + prefix.length + contains.length >= 40) break;
    }
    res.json([...exact, ...prefix, ...contains].slice(0, 8));
  } catch (err) {
    console.error('Airport search error:', err.message);
    res.json([]);
  }
});

// Kick off airport data load in the background at startup
loadAirports().catch(err => console.warn('Airport data failed to load:', err.message));

app.listen(PORT, () => console.log(`METAR Reader → http://localhost:${PORT}`));
