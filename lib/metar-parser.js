function parseMetar(raw) {
  const data = {
    station: null, time: null, auto: false,
    wind: null, visibility: null,
    weather: [], clouds: [],
    temperature: null, dewpoint: null,
    altimeter: null,
  };

  const str    = raw.replace(/\s+RMK\b.*$/, '');
  const tokens = str.trim().split(/\s+/);
  let i = 0;

  if (tokens[i] === 'METAR' || tokens[i] === 'SPECI') i++;

  if (/^[A-Z][A-Z0-9]{2,3}$/.test(tokens[i])) data.station = tokens[i++];

  if (/^\d{6}Z$/.test(tokens[i])) {
    const t = tokens[i++];
    data.time = { day: +t.slice(0,2), hour: +t.slice(2,4), min: +t.slice(4,6) };
  }

  while (/^(AUTO|COR|NIL)$/.test(tokens[i])) {
    if (tokens[i] === 'AUTO') data.auto = true;
    i++;
  }

  if (i < tokens.length && /^(VRB|\d{3})\d{2,3}(G\d{2,3})?(KT|MPS)$/.test(tokens[i])) {
    const w    = tokens[i++];
    const mps  = w.endsWith('MPS');
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
    if (i < tokens.length && /^\d{3}V\d{3}$/.test(tokens[i])) {
      const [from, to] = tokens[i++].split('V');
      data.wind.varFrom = from;
      data.wind.varTo   = to;
    }
  }

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

  if (i < tokens.length && tokens[i] === 'CAVOK') {
    data.visibility = { miles: 10 };
    data.clouds = [{ coverage: 'CLR' }];
    i++;
  }

  while (i < tokens.length && isWxToken(tokens[i])) data.weather.push(tokens[i++]);

  while (i < tokens.length && isSkyToken(tokens[i])) {
    const t = tokens[i++];
    if (/^(CLR|SKC|NSC|NCD)$/.test(t)) {
      data.clouds.push({ coverage: 'CLR' });
    } else {
      const m = t.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/);
      if (m) data.clouds.push({ coverage: m[1], altitude: +m[2] * 100, type: m[3] || null });
    }
  }

  if (i < tokens.length && /^M?\d+\/M?\d+$/.test(tokens[i])) {
    const [ts, ds] = tokens[i++].split('/');
    data.temperature = ts.startsWith('M') ? -parseInt(ts.slice(1)) : +ts;
    data.dewpoint    = ds.startsWith('M') ? -parseInt(ds.slice(1)) : +ds;
  }

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

if (typeof module !== 'undefined') {
  module.exports = { parseMetar, isWxToken, isSkyToken };
}
