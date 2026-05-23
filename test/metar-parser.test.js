const { parseMetar } = require('../lib/metar-parser');

// ─── Full METAR ───────────────────────────────────────────────────────────────

describe('full METAR', () => {
  const result = parseMetar('KPDX 210253Z 33009G15KT 10SM FEW047 BKN250 19/09 A3009 RMK AO2');

  test('parses station', () => expect(result.station).toBe('KPDX'));
  test('parses time',    () => expect(result.time).toEqual({ day: 21, hour: 2, min: 53 }));
  test('parses wind direction', () => expect(result.wind.dir).toBe('330'));
  test('parses wind speed',     () => expect(result.wind.speed).toBe(9));
  test('parses wind gust',      () => expect(result.wind.gust).toBe(15));
  test('parses visibility',     () => expect(result.visibility.miles).toBe(10));
  test('parses cloud layers',   () => expect(result.clouds).toEqual([
    { coverage: 'FEW', altitude: 4700, type: null },
    { coverage: 'BKN', altitude: 25000, type: null },
  ]));
  test('parses temperature',  () => expect(result.temperature).toBe(19));
  test('parses dewpoint',     () => expect(result.dewpoint).toBe(9));
  test('parses altimeter',    () => expect(result.altimeter.inhg).toBe(30.09));
  test('strips RMK section',  () => expect(result.altimeter.inhg).not.toBeNull());
});

// ─── METAR / SPECI prefix ─────────────────────────────────────────────────────

describe('report type prefix', () => {
  test('strips METAR prefix', () => {
    const r = parseMetar('METAR KPDX 210253Z 00000KT 10SM CLR 15/05 A3000');
    expect(r.station).toBe('KPDX');
  });

  test('strips SPECI prefix', () => {
    const r = parseMetar('SPECI KLAX 210300Z 00000KT 10SM CLR 20/10 A2990');
    expect(r.station).toBe('KLAX');
  });
});

// ─── Wind variations ──────────────────────────────────────────────────────────

describe('wind', () => {
  test('calm wind (00000KT)', () => {
    const r = parseMetar('KPDX 210253Z 00000KT 10SM CLR 15/05 A3000');
    expect(r.wind.speed).toBe(0);
    expect(r.wind.dir).toBe('000');
  });

  test('variable wind (VRB)', () => {
    const r = parseMetar('KPDX 210253Z VRB05KT 10SM CLR 15/05 A3000');
    expect(r.wind.dir).toBe('VRB');
    expect(r.wind.speed).toBe(5);
  });

  test('wind with gusts', () => {
    const r = parseMetar('KPDX 210253Z 27025G40KT 10SM CLR 15/05 A3000');
    expect(r.wind.speed).toBe(25);
    expect(r.wind.gust).toBe(40);
  });

  test('wind without gusts has null gust', () => {
    const r = parseMetar('KPDX 210253Z 18010KT 10SM CLR 15/05 A3000');
    expect(r.wind.gust).toBeNull();
  });

  test('variable wind sector (220V300)', () => {
    const r = parseMetar('KPDX 210253Z 25012KT 220V300 10SM CLR 15/05 A3000');
    expect(r.wind.varFrom).toBe('220');
    expect(r.wind.varTo).toBe('300');
  });

  test('MPS wind converted to knots', () => {
    const r = parseMetar('EGLL 210253Z 27010MPS 9999 CLR 15/05 Q1013');
    expect(r.wind.speed).toBe(19); // 10 * 1.944 rounded
  });
});

// ─── Visibility ───────────────────────────────────────────────────────────────

describe('visibility', () => {
  test('whole statute miles', () => {
    const r = parseMetar('KPDX 210253Z 00000KT 7SM CLR 15/05 A3000');
    expect(r.visibility.miles).toBe(7);
  });

  test('10SM reported as 10', () => {
    const r = parseMetar('KPDX 210253Z 00000KT 10SM CLR 15/05 A3000');
    expect(r.visibility.miles).toBe(10);
  });

  test('fractional visibility (1/2SM)', () => {
    const r = parseMetar('KPDX 210253Z 00000KT 1/2SM FG 05/04 A2990');
    expect(r.visibility.miles).toBe(0.5);
  });

  test('less-than visibility (M1/4SM)', () => {
    const r = parseMetar('KPDX 210253Z 00000KT M1/4SM FG 05/04 A2990');
    expect(r.visibility.miles).toBe(0.25);
    expect(r.visibility.lessThan).toBe(true);
  });

  test('mixed fractional visibility (1 1/2SM)', () => {
    const r = parseMetar('KPDX 210253Z 00000KT 1 1/2SM BR 10/09 A2995');
    expect(r.visibility.miles).toBe(1.5);
  });

  test('metric 9999 = 10 miles', () => {
    const r = parseMetar('EGLL 210253Z 27010KT 9999 CLR 15/05 Q1013');
    expect(r.visibility.miles).toBe(10);
    expect(r.visibility.meters).toBe(9999);
  });

  test('metric meters < 9999', () => {
    const r = parseMetar('EGLL 210253Z 27010KT 0800 FG 05/04 Q1010');
    expect(r.visibility.meters).toBe(800);
    expect(r.visibility.miles).toBe(0.5);
  });
});

// ─── Weather phenomena ────────────────────────────────────────────────────────

describe('weather phenomena', () => {
  test('single phenomenon (rain)', () => {
    const r = parseMetar('KPDX 210253Z 18010KT 5SM RA SCT030 15/12 A2990');
    expect(r.weather).toContain('RA');
  });

  test('light rain (-RA)', () => {
    const r = parseMetar('KPDX 210253Z 18010KT 5SM -RA SCT030 15/12 A2990');
    expect(r.weather).toContain('-RA');
  });

  test('heavy snow (+SN)', () => {
    const r = parseMetar('KPDX 210253Z 00000KT 1SM +SN OVC010 M02/M04 A2970');
    expect(r.weather).toContain('+SN');
  });

  test('thunderstorm with rain (TSRA)', () => {
    const r = parseMetar('KPDX 210253Z 23015KT 3SM TSRA BKN030CB 20/18 A2980');
    expect(r.weather).toContain('TSRA');
  });

  test('freezing fog (FZFG)', () => {
    const r = parseMetar('KPDX 210253Z 00000KT M1/4SM FZFG OVC001 M03/M04 A2990');
    expect(r.weather).toContain('FZFG');
  });

  test('multiple phenomena', () => {
    const r = parseMetar('KPDX 210253Z 18010KT 2SM -RA BR OVC010 12/11 A2985');
    expect(r.weather).toContain('-RA');
    expect(r.weather).toContain('BR');
  });

  test('no phenomena returns empty array', () => {
    const r = parseMetar('KPDX 210253Z 18010KT 10SM CLR 15/05 A3000');
    expect(r.weather).toHaveLength(0);
  });
});

// ─── Sky conditions ───────────────────────────────────────────────────────────

describe('sky conditions', () => {
  test('CLR', () => {
    const r = parseMetar('KPDX 210253Z 00000KT 10SM CLR 15/05 A3000');
    expect(r.clouds).toEqual([{ coverage: 'CLR' }]);
  });

  test('SKC treated as CLR', () => {
    const r = parseMetar('KPDX 210253Z 00000KT 10SM SKC 15/05 A3000');
    expect(r.clouds[0].coverage).toBe('CLR');
  });

  test('OVC with altitude', () => {
    const r = parseMetar('KPDX 210253Z 18010KT 3SM OVC008 10/09 A2990');
    expect(r.clouds[0]).toEqual({ coverage: 'OVC', altitude: 800, type: null });
  });

  test('multiple cloud layers', () => {
    const r = parseMetar('KPDX 210253Z 18010KT 10SM FEW020 SCT060 BKN120 15/05 A3000');
    expect(r.clouds).toHaveLength(3);
    expect(r.clouds[0].coverage).toBe('FEW');
    expect(r.clouds[1].coverage).toBe('SCT');
    expect(r.clouds[2].coverage).toBe('BKN');
  });

  test('cumulonimbus (CB) flag', () => {
    const r = parseMetar('KPDX 210253Z 23015KT 5SM BKN030CB 20/18 A2980');
    expect(r.clouds[0].type).toBe('CB');
  });

  test('towering cumulus (TCU) flag', () => {
    const r = parseMetar('KPDX 210253Z 23015KT 5SM SCT025TCU 20/18 A2980');
    expect(r.clouds[0].type).toBe('TCU');
  });

  test('CAVOK sets CLR and 10 mile visibility', () => {
    const r = parseMetar('EGLL 210253Z 27010KT CAVOK 15/05 Q1013');
    expect(r.visibility.miles).toBe(10);
    expect(r.clouds[0].coverage).toBe('CLR');
  });
});

// ─── Temperature ──────────────────────────────────────────────────────────────

describe('temperature and dewpoint', () => {
  test('positive temp and dewpoint', () => {
    const r = parseMetar('KPDX 210253Z 00000KT 10SM CLR 19/11 A3000');
    expect(r.temperature).toBe(19);
    expect(r.dewpoint).toBe(11);
  });

  test('negative temperature (M prefix)', () => {
    const r = parseMetar('KPDX 210253Z 00000KT 10SM CLR M05/M10 A2990');
    expect(r.temperature).toBe(-5);
    expect(r.dewpoint).toBe(-10);
  });

  test('mixed negative temp and positive dewpoint', () => {
    const r = parseMetar('KPDX 210253Z 00000KT 10SM CLR M02/00 A2990');
    expect(r.temperature).toBe(-2);
    expect(r.dewpoint).toBe(0);
  });
});

// ─── Altimeter ────────────────────────────────────────────────────────────────

describe('altimeter', () => {
  test('inches of mercury (A prefix)', () => {
    const r = parseMetar('KPDX 210253Z 00000KT 10SM CLR 15/05 A3009');
    expect(r.altimeter.inhg).toBe(30.09);
  });

  test('QNH in hPa (Q prefix)', () => {
    const r = parseMetar('EGLL 210253Z 27010KT 9999 CLR 15/05 Q1013');
    expect(r.altimeter.hpa).toBe(1013);
    expect(r.altimeter.inhg).toBe(29.91);
  });
});

// ─── Modifiers ────────────────────────────────────────────────────────────────

describe('modifiers', () => {
  test('AUTO flag', () => {
    const r = parseMetar('KPDX 210253Z AUTO 18010KT 10SM CLR 15/05 A3000');
    expect(r.auto).toBe(true);
  });

  test('no AUTO flag defaults to false', () => {
    const r = parseMetar('KPDX 210253Z 18010KT 10SM CLR 15/05 A3000');
    expect(r.auto).toBe(false);
  });

  test('RMK section is stripped', () => {
    const r = parseMetar('KPDX 210253Z 18010KT 10SM CLR 15/05 A3000 RMK AO2 SLP190 T01500050');
    expect(r.altimeter.inhg).toBe(30.00);
    expect(r.temperature).toBe(15);
  });
});
