const input      = document.getElementById('airportInput');
const searchBtn  = document.getElementById('searchBtn');
const resultDiv  = document.getElementById('result');
const errorDiv   = document.getElementById('error');
const acDropdown = document.getElementById('autocomplete');

searchBtn.addEventListener('click', doSearch);
input.addEventListener('keydown', onInputKey);
input.addEventListener('input',   onInputChange);
document.addEventListener('click', e => { if (!e.target.closest('.input-wrapper')) closeDropdown(); });

input.focus();

// ─── Autocomplete ─────────────────────────────────────────────────────────────

let acDebounce = null;
let acCursor   = -1;
let acResults  = [];

function onInputChange() {
  clearTimeout(acDebounce);
  acCursor = -1;
  const q = input.value.trim();
  if (q.length < 2) { closeDropdown(); return; }
  acDebounce = setTimeout(() => fetchSuggestions(q), 180);
}

function onInputKey(e) {
  if (e.key === 'ArrowDown')  { e.preventDefault(); moveCursor(1);  return; }
  if (e.key === 'ArrowUp')    { e.preventDefault(); moveCursor(-1); return; }
  if (e.key === 'Escape')     { closeDropdown(); return; }
  if (e.key === 'Enter') {
    if (acCursor >= 0 && acResults[acCursor]) {
      pickSuggestion(acResults[acCursor]);
    } else {
      doSearch();
    }
  }
}

async function fetchSuggestions(q) {
  try {
    const res = await fetch(`/api/airports/search?q=${encodeURIComponent(q)}`);
    acResults = await res.json();
    renderDropdown();
  } catch { closeDropdown(); }
}

function renderDropdown() {
  if (!acResults.length) { closeDropdown(); return; }
  acDropdown.innerHTML = acResults.map((a, i) => `
    <div class="ac-item" data-i="${i}">
      <span class="ac-icao">${a.icao}</span>
      <span class="ac-name">${a.name}</span>
      <span class="ac-loc">${[a.city, a.country].filter(Boolean).join(', ')}</span>
    </div>`).join('');
  acDropdown.querySelectorAll('.ac-item').forEach(el =>
    el.addEventListener('click', () => pickSuggestion(acResults[+el.dataset.i]))
  );
  acDropdown.classList.remove('hidden');
}

function moveCursor(dir) {
  const items = acDropdown.querySelectorAll('.ac-item');
  if (!items.length) return;
  items[acCursor]?.classList.remove('ac-active');
  acCursor = (acCursor + dir + items.length) % items.length;
  items[acCursor]?.classList.add('ac-active');
  items[acCursor]?.scrollIntoView({ block: 'nearest' });
}

function pickSuggestion(airport) {
  input.value = airport.icao;
  closeDropdown();
  doSearch();
}

function closeDropdown() {
  acDropdown.classList.add('hidden');
  acResults = [];
  acCursor  = -1;
}

// ─── Search flow ─────────────────────────────────────────────────────────────

async function doSearch() {
  closeDropdown();
  const code = input.value.trim().toUpperCase();
  if (!code || !/^[A-Z0-9]{3,4}$/.test(code)) {
    showError('Enter or select a valid ICAO airport code (e.g. KPDX, EGLL, RJTT).');
    return;
  }

  setLoading(code);
  searchBtn.disabled = true;

  try {
    const [metarRes, airportRes] = await Promise.all([
      fetch(`/api/metar/${code}`),
      fetch(`/api/airport/${code}`),
    ]);

    const text = await metarRes.text();
    if (!metarRes.ok) {
      let msg = 'Failed to fetch weather data.';
      try { msg = JSON.parse(text).error; } catch { /* use default */ }
      throw new Error(msg);
    }

    const airport = airportRes.ok ? await airportRes.json().catch(() => ({})) : {};
    const raw     = text.trim().split('\n')[0].trim();
    const parsed  = parseMetar(raw);
    renderWeather(parsed, raw, airport);
  } catch (err) {
    showError(err.message);
  } finally {
    searchBtn.disabled = false;
  }
}

function setLoading(code) {
  errorDiv.classList.add('hidden');
  resultDiv.classList.remove('hidden');
  resultDiv.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Fetching weather for ${code}…</p>
    </div>`;
}

function showError(msg) {
  resultDiv.classList.add('hidden');
  errorDiv.classList.remove('hidden');
  errorDiv.innerHTML = `<div class="error-card">⚠️ ${msg}</div>`;
}

// ─── METAR parser ─────────────────────────────────────────────────────────────

function parseMetar(raw) {
  const data = {
    station: null, time: null, auto: false,
    wind: null, visibility: null,
    weather: [], clouds: [],
    temperature: null, dewpoint: null,
    altimeter: null,
  };

  // Strip remarks section
  const str    = raw.replace(/\s+RMK\b.*$/, '');
  const tokens = str.trim().split(/\s+/);
  let i = 0;

  // Skip report type prefix that some responses include
  if (tokens[i] === 'METAR' || tokens[i] === 'SPECI') i++;

  // Station ID (3–4 char alphanumeric, leading letter)
  if (/^[A-Z][A-Z0-9]{2,3}$/.test(tokens[i])) data.station = tokens[i++];

  // Time: DDHHMM Z
  if (/^\d{6}Z$/.test(tokens[i])) {
    const t = tokens[i++];
    data.time = { day: +t.slice(0,2), hour: +t.slice(2,4), min: +t.slice(4,6) };
  }

  // Modifier flags
  while (/^(AUTO|COR|NIL)$/.test(tokens[i])) {
    if (tokens[i] === 'AUTO') data.auto = true;
    i++;
  }

  // Wind: (VRB|ddd)(ss)(Ggg)?(KT|MPS)
  if (i < tokens.length && /^(VRB|\d{3})\d{2,3}(G\d{2,3})?(KT|MPS)$/.test(tokens[i])) {
    const w   = tokens[i++];
    const mps = w.endsWith('MPS');
    const core = w.replace(/(KT|MPS)$/, '');
    const m    = core.match(/^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?$/);
    if (m) {
      const toKt = mps ? 1.944 : 1;
      data.wind = {
        dir:   m[1],
        speed: Math.round(+m[2] * toKt),
        gust:  m[3] ? Math.round(+m[3] * toKt) : null,
      };
    }
    // Variable sector e.g. 220V300
    if (i < tokens.length && /^\d{3}V\d{3}$/.test(tokens[i])) {
      const [from, to] = tokens[i++].split('V');
      data.wind.varFrom = from;
      data.wind.varTo   = to;
    }
  }

  // Visibility
  // "1 1/2SM" spans two tokens
  if (i < tokens.length && /^\d$/.test(tokens[i]) && /^\d\/\dSM$/.test(tokens[i+1])) {
    const whole = +tokens[i++];
    const [n, d] = tokens[i++].replace('SM','').split('/');
    data.visibility = { miles: whole + +n / +d };
  } else if (i < tokens.length && /^M?\d+\/\d+SM$/.test(tokens[i])) {
    const t  = tokens[i++];
    const lt = t.startsWith('M');
    const [n, d] = t.replace(/^M/,'').replace('SM','').split('/');
    data.visibility = { miles: +n / +d, lessThan: lt };
  } else if (i < tokens.length && /^\d+SM$/.test(tokens[i])) {
    data.visibility = { miles: +tokens[i++].replace('SM','') };
  } else if (i < tokens.length && (/^\d{4}$/.test(tokens[i]) || tokens[i] === '9999')) {
    const m = +tokens[i++];
    data.visibility = { miles: m >= 9999 ? 10 : +(m / 1609.34).toFixed(1), meters: m };
  }

  // CAVOK (Ceiling And Visibility OK — visibility ≥10 km, no significant cloud)
  if (i < tokens.length && tokens[i] === 'CAVOK') {
    data.visibility = { miles: 10 };
    data.clouds = [{ coverage: 'CLR' }];
    i++;
  }

  // Weather phenomena (may be multiple)
  while (i < tokens.length && isWxToken(tokens[i])) data.weather.push(tokens[i++]);

  // Sky conditions (may be multiple layers)
  while (i < tokens.length && isSkyToken(tokens[i])) {
    const t = tokens[i++];
    if (/^(CLR|SKC|NSC|NCD)$/.test(t)) {
      data.clouds.push({ coverage: 'CLR' });
    } else {
      const m = t.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/);
      if (m) data.clouds.push({ coverage: m[1], altitude: +m[2] * 100, type: m[3] || null });
    }
  }

  // Temperature / dewpoint  e.g. 19/11  M02/M08
  if (i < tokens.length && /^M?\d+\/M?\d+$/.test(tokens[i])) {
    const [ts, ds] = tokens[i++].split('/');
    data.temperature = ts.startsWith('M') ? -parseInt(ts.slice(1)) : +ts;
    data.dewpoint    = ds.startsWith('M') ? -parseInt(ds.slice(1)) : +ds;
  }

  // Altimeter
  if (i < tokens.length && /^A\d{4}$/.test(tokens[i])) {
    data.altimeter = { inhg: +tokens[i++].slice(1) / 100 };
  } else if (i < tokens.length && /^Q\d{4}$/.test(tokens[i])) {
    const hpa = +tokens[i++].slice(1);
    data.altimeter = { hpa, inhg: +(hpa / 33.864).toFixed(2) };
  }

  return data;
}

function isWxToken(t) {
  return /^(VC|[-+])?((MI|PR|BC|DR|BL|SH|TS|FZ)+)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)+(VC)?$/.test(t);
}

function isSkyToken(t) {
  return /^(FEW|SCT|BKN|OVC|VV)\d{3}(CB|TCU)?$/.test(t) || /^(CLR|SKC|NSC|NCD)$/.test(t);
}

// ─── Unit helpers ─────────────────────────────────────────────────────────────

function cToF(c) { return Math.round(c * 9 / 5 + 32); }
function ktToMph(kt) { return Math.round(kt * 1.15078); }

function humidity(tempC, dewC) {
  const a = 17.625, b = 243.04;
  return Math.round(100 * Math.exp(a * dewC / (b + dewC)) / Math.exp(a * tempC / (b + tempC)));
}

function feelsLike(tempF, windMph, rh) {
  if (tempF <= 50 && windMph > 3) {
    const v = Math.pow(windMph, 0.16);
    return Math.round(35.74 + 0.6215 * tempF - 35.75 * v + 0.4275 * tempF * v);
  }
  if (tempF >= 80 && rh > 40) {
    const T = tempF, R = rh;
    return Math.round(
      -42.379 + 2.04901523*T + 10.14333127*R - 0.22475541*T*R
      - 0.00683783*T*T - 0.05481717*R*R + 0.00122874*T*T*R
      + 0.00085282*T*R*R - 0.00000199*T*T*R*R
    );
  }
  return null;
}

function localTime(time, timezone) {
  try {
    const now = new Date();
    let year = now.getUTCFullYear(), month = now.getUTCMonth();
    // If METAR day is ahead of today, it's from last month
    if (time.day > now.getUTCDate() + 1) {
      month--; if (month < 0) { month = 11; year--; }
    }
    const d = new Date(Date.UTC(year, month, time.day, time.hour, time.min));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: 'numeric', minute: '2-digit',
      hour12: true, timeZoneName: 'short',
    }).format(d);
  } catch { return null; }
}

function degToCardinal(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(+deg / 45) % 8];
}

// ─── Sky condition ────────────────────────────────────────────────────────────

function skyInfo(clouds) {
  if (!clouds.length) return { label: 'Clear skies', emoji: '☀️' };
  const rank = { CLR: 0, FEW: 1, SCT: 2, BKN: 3, OVC: 4, VV: 5 };
  const worst = clouds.reduce((a, b) => (rank[b.coverage] > rank[a.coverage] ? b : a));
  if (clouds.some(c => c.type === 'CB'))  return { label: 'Thunderstorm activity',    emoji: '⛈️' };
  if (clouds.some(c => c.type === 'TCU')) return { label: 'Developing thunderstorms', emoji: '🌩️' };
  return {
    CLR: { label: 'Clear skies',    emoji: '☀️' },
    FEW: { label: 'Mostly clear',   emoji: '🌤️' },
    SCT: { label: 'Partly cloudy',  emoji: '⛅' },
    BKN: { label: 'Mostly cloudy',  emoji: '🌥️' },
    OVC: { label: 'Overcast',       emoji: '☁️' },
    VV:  { label: 'Sky obscured',   emoji: '🌫️' },
  }[worst.coverage] || { label: 'Unknown', emoji: '🌡️' };
}

// ─── Weather phenomena ────────────────────────────────────────────────────────

const WX_DESCRIPTORS = {
  MI: 'Shallow', PR: 'Partial', BC: 'Patches of', DR: 'Drifting',
  BL: 'Blowing', SH: 'Shower', TS: 'Thunderstorm with', FZ: 'Freezing',
};

const WX_PHENOMENA = {
  DZ: 'Drizzle',  RA: 'Rain',       SN: 'Snow',       SG: 'Snow grains',
  IC: 'Ice crystals', PL: 'Ice pellets', GR: 'Hail',  GS: 'Small hail',
  UP: 'Unknown precipitation',
  BR: 'Mist',     FG: 'Fog',        FU: 'Smoke',      VA: 'Volcanic ash',
  DU: 'Dust',     SA: 'Sand',       HZ: 'Haze',       PO: 'Dust whirls',
  SQ: 'Squalls',  FC: 'Funnel cloud', SS: 'Sandstorm', DS: 'Dust storm',
};

function wxToText(wx) {
  let intensity = '';
  let s = wx;
  if (s.startsWith('-'))  { intensity = 'Light ';  s = s.slice(1); }
  else if (s.startsWith('+')) { intensity = 'Heavy '; s = s.slice(1); }
  const vcPrefix = s.startsWith('VC') ? (s = s.slice(2), true) : false;

  let desc = '', phenom = '';
  for (const [code, name] of Object.entries(WX_DESCRIPTORS)) {
    if (s.startsWith(code)) { desc = name + ' '; s = s.slice(code.length); break; }
  }
  for (const [code, name] of Object.entries(WX_PHENOMENA)) {
    if (s.includes(code)) { phenom += (phenom ? ' and ' : '') + name; s = s.replace(code, ''); }
  }

  const vicinity = vcPrefix ? ' in the vicinity' : '';
  return (`${intensity}${desc}${phenom}${vicinity}`).trim();
}

function wxEmoji(wxList) {
  const s = wxList.join(' ');
  if (s.includes('TS'))                             return '⛈️';
  if (s.match(/[+]?(SN|SG|PL|GS|GR)/))             return '❄️';
  if (s.match(/[+]?RA/) || s.includes('DZ'))        return '🌧️';
  if (s.includes('FG') || s.includes('BR'))         return '🌫️';
  if (s.includes('HZ') || s.includes('FU') || s.includes('DU') || s.includes('SA')) return '😶‍🌫️';
  return null;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderWeather(d, raw, airport = {}) {
  const sky  = skyInfo(d.clouds);
  const icon = wxEmoji(d.weather) || sky.emoji;

  const tempF = d.temperature !== null ? cToF(d.temperature) : null;
  const rh    = (d.temperature !== null && d.dewpoint !== null) ? humidity(d.temperature, d.dewpoint) : null;
  const fl    = (tempF !== null && d.wind !== null && rh !== null)
    ? feelsLike(tempF, ktToMph(d.wind.speed), rh)
    : null;

  // Wind description
  let windDesc = 'Unknown';
  if (d.wind) {
    if (d.wind.speed === 0) {
      windDesc = 'Calm';
    } else if (d.wind.dir === 'VRB') {
      windDesc = `Variable at ${ktToMph(d.wind.speed)} mph`;
    } else {
      const card = degToCardinal(d.wind.dir);
      windDesc = `${card} at ${ktToMph(d.wind.speed)} mph`;
      if (d.wind.gust)   windDesc += `, gusting to ${ktToMph(d.wind.gust)} mph`;
      if (d.wind.varFrom) windDesc += ` (variable ${degToCardinal(d.wind.varFrom)}–${degToCardinal(d.wind.varTo)})`;
    }
  }

  // Visibility description
  let visDesc = 'Unknown';
  if (d.visibility) {
    const { miles, lessThan } = d.visibility;
    if (lessThan)   visDesc = `Less than ${miles} mile`;
    else if (miles >= 10) visDesc = '10+ miles';
    else if (miles === 1) visDesc = '1 mile';
    else            visDesc = `${miles} miles`;
  }

  // Cloud layers
  const COVERAGE = { FEW: 'Few clouds', SCT: 'Scattered', BKN: 'Mostly cloudy', OVC: 'Overcast', VV: 'Sky obscured', CLR: 'Clear' };
  const cloudsDesc = d.clouds.length === 0 ? 'Clear'
    : d.clouds.map(c => {
        if (c.coverage === 'CLR') return 'Clear';
        const base = COVERAGE[c.coverage] || c.coverage;
        const alt  = c.altitude ? ` at ${c.altitude.toLocaleString()} ft` : '';
        const type = c.type === 'CB' ? ' (cumulonimbus)' : c.type === 'TCU' ? ' (towering cumulus)' : '';
        return `${base}${alt}${type}`;
      }).join('; ');

  // Header: airport name + location
  const airportName  = airport.name || null;
  const locationParts = [airport.site, airport.state || airport.country, d.station].filter(Boolean);
  const locationStr   = locationParts.join(' · ') || d.station || null;

  // Time label: local time + UTC
  let timeLabel = '';
  if (d.time) {
    const hh  = String(d.time.hour).padStart(2,'0');
    const mm  = String(d.time.min).padStart(2,'0');
    const utc = `${hh}:${mm} UTC`;
    const local = airport.timezone ? localTime(d.time, airport.timezone) : null;
    timeLabel = local ? `${local}  ·  ${utc}` : utc;
  }

  const detailItems = [
    { label: 'Wind',        value: windDesc },
    { label: 'Visibility',  value: visDesc },
    { label: 'Humidity',    value: rh !== null ? `${rh}%` : 'Unknown' },
    { label: 'Pressure',    value: d.altimeter ? `${d.altimeter.inhg.toFixed(2)} inHg` : 'Unknown' },
    { label: 'Dewpoint',    value: d.dewpoint !== null ? `${cToF(d.dewpoint)}°F (${d.dewpoint}°C)` : 'Unknown' },
    { label: 'Cloud cover', value: cloudsDesc },
  ];

  const wxChipsHTML = d.weather.length
    ? `<div class="wx-alerts">${d.weather.map(w => `<div class="wx-chip">${wxToText(w)}</div>`).join('')}</div>`
    : '';

  const feelsHTML = fl !== null && fl !== tempF
    ? `<div class="feels-like">Feels like ${fl}°F</div>`
    : '';

  resultDiv.classList.remove('hidden');
  errorDiv.classList.add('hidden');
  resultDiv.innerHTML = `
    <div class="weather-card">
      <div class="card-header">
        <div>
          <div class="airport-row">
            <span class="airport-name">${airportName || d.station || 'Unknown Airport'}</span>
            ${d.auto ? '<span class="badge">Auto</span>' : ''}
          </div>
          ${locationStr ? `<div class="airport-location">${locationStr}</div>` : ''}
          <div class="report-time">${timeLabel}</div>
        </div>
        <div class="condition-icon">${icon}</div>
      </div>

      <div class="card-body">
        <div class="main-row">
          <div>
            <div class="temperature">${tempF !== null ? tempF + '°F' : '—'}</div>
            ${feelsHTML}
          </div>
          <div>
            <div class="sky-label">${sky.label}</div>
            ${d.temperature !== null ? `<div class="temp-c">${d.temperature}°C</div>` : ''}
          </div>
        </div>

        ${wxChipsHTML}

        <div class="details-grid">
          ${detailItems.map(item => `
            <div class="detail-item">
              <div class="detail-label">${item.label}</div>
              <div class="detail-value">${item.value}</div>
            </div>`).join('')}
        </div>

        <div class="raw-section">
          <div class="raw-label">Raw METAR</div>
          <div class="raw-metar">${raw}</div>
        </div>
      </div>
    </div>`;
}
