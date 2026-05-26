// Catalog of all addon codes from CLAUDE.md.
// Categorization (type A/B/C/D) is best-effort and can be revised during
// development. See "Åpne avklaringer" in CLAUDE.md.
//
// Types:
//   A = Auto-calculated from user hourly rate (typically overtime/travel time)
//   B = Fixed rate set by admin (km, oppmøte zones)
//   C = Variable amount entered per registration
//   D = Marker only — no amount (vacation, sick leave, etc.)
(function (global) {
  const TRAVEL_ZONES = ['7,5-15', '15-30', '30-45', '45-60', '60-75'];
  const TRAVEL_TRANSPORTS = ['firmaBil', 'privatBil'];

  const DEFAULT_TRAVEL_RATES = {
    firmaBil: {
      '7,5-15': 70.70,
      '15-30': 125.00,
      '30-45': 149.40,
      '45-60': 165.20,
      '60-75': 189.70,
    },
    privatBil: {
      '7,5-15': 114.60,
      '15-30': 197.50,
      '30-45': 232.20,
      '45-60': 255.70,
      '60-75': 290.40,
    },
  };

  const DEFAULT_KM_RATE = 5.0;

  // Overtidsgrunnlag — tariff-definert kr/t-grunnlag som brukes som base
  // for Org-overtid (i stedet for personlig timesats). For Org-OT-koder:
  //
  //   per time = timelønn + overtidsgrunnlag × premie-%
  //
  // Eksempel med timelønn 320 og grunnlag 332,31:
  //   OT-50 Org  → 320 + 332,31 × 0,5 = 486,155 kr/t (tillegg = 166,155)
  //   OT-100 Org → 320 + 332,31 × 1,0 = 652,31 kr/t (tillegg = 332,31)
  //
  // Ikke-org OT bruker fortsatt timelønn × (1 + premie-%) som vanlig.
  // Admin kan justere grunnlaget hvis tariffen endres.
  const DEFAULT_OVERTIDSGRUNNLAG = 332.31;

  const DEFAULT_FIXED_CODE_RATES = {
    'bastillegg': 10.00,
    'smusstillegg-1': 14.00,
    'tilhengertillegg': 12.00,
    'passasjertillegg': 1.00,
    'utenbystillegg-fagarb': 25.00,
    'utenbystillegg-u-fagbrev': 20.00,
    'tarifftillegg-a121': 8.00,
    'opplaeringstillegg-ks': 0,
    'overtidsmat-u12': 100.00,
    'overtidsmat-o12': 200.00,
  };

  const CODES = [
    { id: 'ordinaere-timer',              name: 'Ordinære timer',                       type: 'A', wageFactor: 1.0,  unit: 'hours' },
    { id: 'overtid-50',                   name: 'Overtid 50%',                          type: 'A', unit: 'hours', premium: true, premiumPct: 0.5 },
    { id: 'overtid-50-org',               name: 'Overtid 50% (Org.)',                   type: 'A', unit: 'hours', premium: true, premiumPct: 0.5, org: true },
    { id: 'overtid-100',                  name: 'Overtid 100%',                         type: 'A', unit: 'hours', premium: true, premiumPct: 1.0 },
    { id: 'overtid-100-org',              name: 'Overtid 100% (Org.)',                  type: 'A', unit: 'hours', premium: true, premiumPct: 1.0, org: true },
    { id: 'reisetid',                     name: 'Reisetid',                             type: 'A', wageFactor: 1.0,  unit: 'hours' },
    { id: 'akkordtimer',                  name: 'Akkordtimer',                          type: 'A', wageFactor: 1.0,  unit: 'hours' },
    { id: 'kurs-oppl-mote',               name: 'Kurs/oppl./møte',                      type: 'A', wageFactor: 1.0,  unit: 'hours', noProject: true },
    { id: 'tillitsvalgt-verneombud',      name: 'Timer Tillitsvalgt/Verneombud',        type: 'A', wageFactor: 1.0,  unit: 'hours', noProject: true },
    { id: 'vedlikehold-ikke-prosjekt',    name: 'Vedlikehold ikke prosjekt',            type: 'A', wageFactor: 1.0,  unit: 'hours', noProject: true },
    { id: 'permisjon-lonn-org',           name: 'Permisjon lønnet (Org.)',              type: 'A', wageFactor: 1.0,  unit: 'hours', noProject: true, org: true },
    { id: 'permisjon-lonn-uorg',          name: 'Permisjon lønnet (Uorg.)',             type: 'A', wageFactor: 1.0,  unit: 'hours', noProject: true },
    { id: 'fri-arb-avtale',               name: 'Fri ihht arb.avtale',                  type: 'A', wageFactor: 1.0,  unit: 'hours', noProject: true },

    { id: 'km-godtgjorelse',              name: 'Km-godtgjørelse',                      type: 'B', meta: 'km' },
    { id: 'oppm-fs-7-15',                 name: 'Oppm. tillegg FS bil 7,5-15',          type: 'B', meta: { transport: 'firmaBil', zone: '7,5-15' } },
    { id: 'oppm-fs-15-30',                name: 'Oppm. tillegg FS bil 15-30',           type: 'B', meta: { transport: 'firmaBil', zone: '15-30' } },
    { id: 'oppm-fs-30-45',                name: 'Oppm. tillegg FS bil 30-45',           type: 'B', meta: { transport: 'firmaBil', zone: '30-45' } },
    { id: 'oppm-fs-45-60',                name: 'Oppm. tillegg FS bil 45-60',           type: 'B', meta: { transport: 'firmaBil', zone: '45-60' } },
    { id: 'oppm-fs-60-75',                name: 'Oppm. tillegg FS bil 60-75',           type: 'B', meta: { transport: 'firmaBil', zone: '60-75' } },
    { id: 'oppm-priv-7-15',               name: 'Oppm. tillegg privat bil 7,5-15',      type: 'B', meta: { transport: 'privatBil', zone: '7,5-15' } },
    { id: 'oppm-priv-15-30',              name: 'Oppm. tillegg privat bil 15-30',       type: 'B', meta: { transport: 'privatBil', zone: '15-30' } },
    { id: 'oppm-priv-30-45',              name: 'Oppm. tillegg privat bil 30-45',       type: 'B', meta: { transport: 'privatBil', zone: '30-45' } },
    { id: 'oppm-priv-45-60',              name: 'Oppm. tillegg privat bil 45-60',       type: 'B', meta: { transport: 'privatBil', zone: '45-60' } },
    { id: 'oppm-priv-60-75',              name: 'Oppm. tillegg privat bil 60-75',       type: 'B', meta: { transport: 'privatBil', zone: '60-75' } },
    { id: 'bastillegg',                   name: 'Bastillegg',                           type: 'B', meta: 'hourlyAddon' },
    { id: 'smusstillegg-1',               name: 'Smusstillegg 1 – ElogIT',              type: 'B', meta: 'hourlyAddon' },
    { id: 'tilhengertillegg',             name: 'Tilhengertillegg',                     type: 'B', meta: 'hourlyAddon' },
    { id: 'passasjertillegg',             name: 'Passasjertillegg',                     type: 'B', meta: 'hourlyAddon' },
    { id: 'utenbystillegg-fagarb',        name: 'Utenbystillegg fagarb.ElogIT',         type: 'B', meta: 'hourlyAddon' },
    { id: 'utenbystillegg-u-fagbrev',     name: 'Utenbystillegg u/fagbrev ElogIT',      type: 'B', meta: 'hourlyAddon' },
    { id: 'tarifftillegg-a121',           name: 'Tarifftillegg - prosjekt A121',        type: 'B', meta: 'hourlyAddon' },
    { id: 'overtidsmat-u12',              name: 'Overtidsmat<12 T',                     type: 'B', meta: 'flat' },
    { id: 'overtidsmat-o12',              name: 'Overtidsmat>12 T',                     type: 'B', meta: 'flat' },
    { id: 'opplaeringstillegg-ks',        name: 'Opplæringstillegg K&S Variabel',       type: 'B', meta: 'hourlyAddon' },

    { id: 'reiseutgifter-bom',            name: 'Reiseutgifter/bompasseringer',         type: 'C' },
    { id: 'restakkord-belop',             name: 'Restakkord beløp',                     type: 'C' },

    { id: 'ferie',                        name: 'Ferie',                                type: 'D', noProject: true },
    { id: 'sykemelding',                  name: 'Sykemelding',                          type: 'D', noProject: true },
    { id: 'egenmelding',                  name: 'Egenmelding',                          type: 'D', noProject: true },
    { id: 'barns-sykdom',                 name: 'Barns sykdom',                         type: 'D', noProject: true },
    { id: 'permisjon-uten-lonn',          name: 'Permisjon uten lønn',                  type: 'D', noProject: true },
    { id: 'offentlig-fridag',             name: 'Offentlig fridag',                     type: 'D', noProject: true },
  ];

  const CODE_INDEX = Object.fromEntries(CODES.map((c) => [c.id, c]));
  function getCode(id) { return CODE_INDEX[id]; }

  function isTravelZoneCode(code) {
    return code && code.type === 'B' && code.meta && typeof code.meta === 'object' && code.meta.zone;
  }

  // A code owns the day's hours when it doesn't belong to a project (Kurs,
  // Ferie, Sykemelding, Offentlig fridag, etc.). On such days the project's
  // Start/Slutt/Lunsj/Timer must be hidden to avoid double-counting wages.
  // This piggybacks on the existing `noProject` flag — by definition a code
  // that can stand alone without a project is also a substitute for project
  // hours.
  function isSubstituteCode(codeOrId) {
    const c = typeof codeOrId === 'string' ? getCode(codeOrId) : codeOrId;
    return !!(c && c.noProject);
  }
  function hasSubstituteCode(reg) {
    return !!(reg && reg.codes && reg.codes.some((c) => isSubstituteCode(c.codeId)));
  }

  // Find the Oppm. tillegg code id for a given transport + zone.
  function travelZoneCodeId(transport, zone) {
    for (const c of CODES) {
      if (isTravelZoneCode(c) && c.meta.transport === transport && c.meta.zone === zone) return c.id;
    }
    return null;
  }

  // Default flags per code:
  //   - wage:         er dette en lønnsutbetaling? (vs. refusjon/markør)
  //   - vacationPay:  inngår i feriepengegrunnlaget?
  //   - taxable:      skal det trekkes skatt på beløpet?
  //   - travel:       skal beløpet vises i "Reise"-total? (visuelt — kan
  //                   dobbelføres med wage; brukerens lønnsslipp har ikke
  //                   denne kategorien, men appen viser den for oversikt)
  //
  // Sensible Norwegian-payroll defaults; admin can override per code.
  function defaultCodeFlags(codeId) {
    // Synthetic "rate.*" IDs let admin flag derived totals (forsikring,
    // feriepenger, fagforening, org-tillegg). They reuse the same 5-flag
    // system as real codes so the user has one consistent model. Some flags
    // may not actively drive calculation — they're shown for visual
    // consistency and future-proofing.
    if (codeId === 'rate.forsikring') {
      // Innberetningspliktig forsikring → Lønn + Skatt (ikke Ferie/Reise/Org).
      return { wage: true, vacationPay: false, taxable: true, travel: false };
    }
    if (codeId === 'rate.feriepenger') {
      // Opptjent feriepenger → utbetales neste år som Ferie + Skatt.
      return { wage: false, vacationPay: true, taxable: true, travel: false };
    }
    if (codeId === 'rate.fagforening') {
      // Trekk fra skattegrunnlag (fradragsberettiget).
      return { wage: false, vacationPay: false, taxable: true, travel: false };
    }
    if (codeId === 'rate.overtidsgrunnlag') {
      // Overtidsgrunnlag inngår som del av Org-OT-lønn → Lønn + Ferie + Skatt.
      return { wage: true, vacationPay: true, taxable: true, travel: false };
    }
    const c = getCode(codeId);
    if (!c) return { wage: false, vacationPay: false, taxable: false, travel: false };

    // Travel reimbursements: shown under Reise. By default also wage=true
    // since user's payslip treats Oppm./km as wage — admin can toggle off.
    if (c.id === 'km-godtgjorelse' || isTravelZoneCode(c) || c.id === 'reiseutgifter-bom') {
      return { wage: true, vacationPay: true, taxable: true, travel: true };
    }
    // Overtime food allowance: refusjon, ikke lønn.
    if (c.id === 'overtidsmat-u12' || c.id === 'overtidsmat-o12') {
      return { wage: false, vacationPay: false, taxable: false, travel: false };
    }
    // Sick pay / parental: PAID (wage), taxable, but NOT in vacation pay.
    if (c.id === 'sykemelding' || c.id === 'egenmelding' || c.id === 'barns-sykdom') {
      return { wage: true, vacationPay: false, taxable: true, travel: false };
    }
    // Permisjon uten lønn: not paid at all.
    if (c.id === 'permisjon-uten-lonn') {
      return { wage: false, vacationPay: false, taxable: false, travel: false };
    }
    // Ferie: paid via feriepenger from previous year — not in this year's basis.
    if (c.id === 'ferie') {
      return { wage: true, vacationPay: false, taxable: true, travel: false };
    }
    // Offentlig fridag: paid, in vacation pay, taxable.
    if (c.id === 'offentlig-fridag') {
      return { wage: true, vacationPay: true, taxable: true, travel: false };
    }

    // Default: regular wages, overtime, hourly addons → paid + in vacation pay + taxable.
    return { wage: true, vacationPay: true, taxable: true, travel: false };
  }

  // Merge defaults with admin overrides stored in rates.codeFlags.
  function resolveCodeFlags(codeId, rates) {
    const def = defaultCodeFlags(codeId);
    const override = rates && rates.codeFlags && rates.codeFlags[codeId];
    if (!override) return def;
    return {
      wage: override.wage !== undefined ? !!override.wage : def.wage,
      vacationPay: override.vacationPay !== undefined ? !!override.vacationPay : def.vacationPay,
      taxable: override.taxable !== undefined ? !!override.taxable : def.taxable,
      travel: override.travel !== undefined ? !!override.travel : def.travel,
    };
  }

  // Per-code wage multiplier (Type A non-premium: hours × hourlyRate × wageFactor).
  // Defaults from CODES; admin can override per code in rates.wageFactors so
  // tariff-specific factors can be tuned without touching code.
  function resolveWageFactor(codeId, rates) {
    const def = getCode(codeId);
    const baseDefault = def && def.wageFactor != null ? Number(def.wageFactor) : 1;
    const override = rates && rates.wageFactors && rates.wageFactors[codeId];
    return override != null && override !== '' && isFinite(Number(override))
      ? Number(override)
      : baseDefault;
  }

  // "Org" status of a code (= is it covered by the organized-worker tariff
  // add-on?). Default from CODES; admin can toggle per code so new tariff
  // codes added later can opt in or out without code changes.
  function resolveCodeIsOrg(codeId, rates) {
    const def = getCode(codeId);
    const baseDefault = !!(def && def.org);
    const override = rates && rates.codeOrg && rates.codeOrg[codeId];
    return override !== undefined ? !!override : baseDefault;
  }

  // Premium percent for OT-style codes (0.5 = 50% premium, 1.0 = 100%).
  // Editable per code; defaults to the code definition.
  function resolveCodePremiumPct(codeId, rates) {
    const def = getCode(codeId);
    const baseDefault = def && def.premiumPct != null ? Number(def.premiumPct) : 0;
    const override = rates && rates.codePremiumPct && rates.codePremiumPct[codeId];
    return override != null && override !== '' && isFinite(Number(override))
      ? Number(override)
      : baseDefault;
  }

  // Overtidsgrunnlag — tariff-base for Org-OT-koder (kr/t).
  // Whole-company setting — admin tunes once to match the tariff.
  function resolveOvertidsgrunnlag(rates) {
    const override = rates && rates.overtidsgrunnlag;
    return override != null && override !== '' && isFinite(Number(override))
      ? Number(override)
      : DEFAULT_OVERTIDSGRUNNLAG;
  }

  // Display name — admin can rename codes (e.g. shorten "Permisjon lønnet (Uorg.)"
  // to "Permisjon (ikke org)") without losing the underlying id.
  function resolveCodeName(codeId, rates) {
    const def = getCode(codeId);
    const override = rates && rates.codeNames && rates.codeNames[codeId];
    if (override && String(override).trim()) return String(override).trim();
    return (def && def.name) || codeId;
  }

  // Behaviour-based grouping for admin display. Built-ins are tagged via the
  // code definition itself (type/meta/premium/wage-flag); custom codes added
  // later just need to map to one of these kinds.
  //   wageFactor:  timer × timesats × faktor (Ord, Reisetid, Kurs, Ferie, …)
  //   overtime:    premie-% (Overtid 50/100, m/u Org)
  //   hourlyAddon: kr/t lagt på hver registrert time (Bastillegg, …)
  //   flat:        fast kr per registrering (Overtidsmat)
  //   km:          per kilometer
  //   variable:    bruker skriver inn beløp (Reiseutgifter, Restakkord)
  //   marker:      ingen lønn — kun visning (Permisjon uten lønn)
  //   zone:        oppm. tillegg, håndteres i Reisegodtgjørelse-tabellen
  function getCodeKind(code) {
    if (!code) return 'marker';
    if (code.type === 'A') return code.premium ? 'overtime' : 'wageFactor';
    if (code.type === 'B') {
      if (code.id === 'km-godtgjorelse') return 'km';
      if (isTravelZoneCode(code)) return 'zone';
      if (code.meta === 'hourlyAddon') return 'hourlyAddon';
      if (code.meta === 'flat') return 'flat';
    }
    if (code.type === 'C') return 'variable';
    if (code.type === 'D') {
      const def = defaultCodeFlags(code.id);
      return def.wage ? 'wageFactor' : 'marker';
    }
    return 'marker';
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.codes = {
    CODES, getCode, isTravelZoneCode, travelZoneCodeId,
    isSubstituteCode, hasSubstituteCode,
    TRAVEL_ZONES, TRAVEL_TRANSPORTS,
    DEFAULT_TRAVEL_RATES, DEFAULT_KM_RATE, DEFAULT_FIXED_CODE_RATES, DEFAULT_OVERTIDSGRUNNLAG,
    defaultCodeFlags, resolveCodeFlags, resolveWageFactor,
    resolveCodeIsOrg, resolveCodePremiumPct, resolveOvertidsgrunnlag,
    resolveCodeName, getCodeKind,
  };
})(window);
