// Calculation engine for registrations, wages, and travel compensation.
(function (global) {
  const { getCode, isTravelZoneCode, travelZoneCodeId, DEFAULT_TRAVEL_RATES, DEFAULT_KM_RATE, DEFAULT_FIXED_CODE_RATES, resolveCodeFlags, resolveWageFactor, resolveCodeIsOrg, resolveCodePremiumPct, resolveOvertidsgrunnlag, resolveCodeName } = global.Timebok.codes;
  const { diffMinutes } = global.Timebok.dateUtils;

  // Idempotent in-memory migration of legacy registrations that stored hours
  // directly on the registration (reg.hours/start/end) before every paid hour
  // moved into code entries. Folds the legacy fields into an "Ordinære timer"
  // code so every consumer (week, period, exports) sees the same shape as
  // the day-view editor.
  function migrateLegacyHours(reg) {
    if (!reg) return reg;
    const hasOrdinary = (reg.codes || []).some((c) => c.codeId === 'ordinaere-timer');
    const legacyHours = Number(reg.hours) || 0;
    const hasTimes = reg.start && reg.end;
    if (hasOrdinary || (!legacyHours && !hasTimes)) {
      delete reg.hours; delete reg.start; delete reg.end;
      delete reg.lunchMinutes; delete reg.lunchUnpaid;
      return reg;
    }
    let hours = legacyHours;
    const lunchMinutes = Number(reg.lunchMinutes) || 0;
    if (!hours && hasTimes) {
      const mins = diffMinutes(reg.start, reg.end);
      hours = Math.max(0, Math.round(((mins - lunchMinutes) / 60) * 100) / 100);
    }
    reg.codes = reg.codes || [];
    reg.codes.unshift({ codeId: 'ordinaere-timer', hours, lunchMinutes });
    delete reg.hours; delete reg.start; delete reg.end;
    delete reg.lunchMinutes; delete reg.lunchUnpaid;
    return reg;
  }

  function normalizeRates(rates, profile) {
    // Travel rates er felles for begge bedrifts-stiler. Stilen styrer kun
    // hvordan satsene aggregeres per dag (Firesafe: første+siste×0,5;
    // Damsgård: høyeste×1) i calcDayTravel/calcDayZoneEntries, ikke verdiene.
    //
    // Resolution order: rates.travelRates → legacy rates.travelRatesByStyle
    // (én-gangs migrering hvis admin ikke har lagret siden vi fjernet stil-
    // toggle) → DEFAULT_TRAVEL_RATES.
    const style = (profile && profile.companyStyle) || 'firesafe';
    const legacyByStyle = rates && rates.travelRatesByStyle
      && (rates.travelRatesByStyle[style] || rates.travelRatesByStyle.firesafe || rates.travelRatesByStyle.damsgard);
    const tr = (rates && rates.travelRates) || legacyByStyle || {};
    return {
      kmRate: (rates && rates.kmRate != null) ? rates.kmRate : DEFAULT_KM_RATE,
      travelRates: {
        firmaBil: Object.assign({}, DEFAULT_TRAVEL_RATES.firmaBil, tr.firmaBil || {}),
        privatBil: Object.assign({}, DEFAULT_TRAVEL_RATES.privatBil, tr.privatBil || {}),
      },
      fixedCodes: Object.assign({}, DEFAULT_FIXED_CODE_RATES, (rates && rates.fixedCodes) || {}),
    };
  }

  function calcRegistration(reg, profile, rates) {
    migrateLegacyHours(reg);
    const r = normalizeRates(rates, profile);
    const hourlyRate = Number(profile && profile.hourlyRate) || 0;
    const workHours = 0;

    let wage = 0;
    let receipts = 0;
    const codeBreakdown = [];
    const hoursByType = { ordinary: 0, overtime: 0, other: 0 };

    for (const c of reg.codes || []) {
      const def = getCode(c.codeId);
      if (!def) continue;

      // Auto-added oppm-tillegg-koder speiler reg.travelZone — calcDayZoneEntries
      // (kalt fra aggregate) eier firesafe-vektet kalkulasjon. Hvis vi prosesserer
      // dem her igjen, blir alt dobbelt-tellet (literal sum vs firesafe-vektet).
      if (c.auto && isTravelZoneCode(def)) continue;

      // Resolve flags once per code — Lønn / Feriepenger / Skattbar / Org.
      // wage is gated on flags.wage for EVERY code type; that way admin's
      // Lønn-huk is the single source of truth for what counts as lønn.
      const flags = resolveCodeFlags(def.id, rates);

      let amount = 0;
      let hours = 0;
      let extra = {};

      if (def.type === 'A') {
        hours = Number(c.hours) || 0;
        let isOvertime;
        if (def.premium) {
          // Per OT-time:
          //   Org:     timelønn + overtidsgrunnlag × premie-%
          //   Ikke-org: timelønn × (1 + premie-%)
          //
          // Eks. med timelønn 320 og grunnlag 332,31:
          //   OT-50 Org   → 320 + 332,31 × 0,5 = 486,155 kr/t
          //   OT-100 Org  → 320 + 332,31 × 1,0 = 652,31 kr/t
          //   OT-50       → 320 × 1,5          = 480 kr/t
          //   OT-100      → 320 × 2,0          = 640 kr/t
          const premiumPct = resolveCodePremiumPct(def.id, rates);
          const isOrg = resolveCodeIsOrg(def.id, rates);
          const perHour = isOrg
            ? hourlyRate + resolveOvertidsgrunnlag(rates) * premiumPct
            : hourlyRate * (1 + premiumPct);
          amount = hours * perHour;
          isOvertime = premiumPct > 0;
        } else {
          const factor = resolveWageFactor(def.id, rates);
          amount = hours * hourlyRate * factor;
          isOvertime = factor > 1;
        }
        if (isOvertime) hoursByType.overtime += hours;
        else if (def.id === 'ordinaere-timer') hoursByType.ordinary += hours;
        else hoursByType.other += hours;
      } else if (def.type === 'B') {
        if (def.id === 'km-godtgjorelse') {
          const km = Number(c.km) || 0;
          amount = km * r.kmRate;
          extra = { km, rate: r.kmRate };
        } else if (isTravelZoneCode(def)) {
          const transport = def.meta.transport;
          const zone = def.meta.zone;
          const rate = (r.travelRates[transport] && r.travelRates[transport][zone]) || 0;
          amount = rate;
          extra = { transport, zone, rate };
        } else if (def.meta === 'hourlyAddon') {
          hours = Number(c.hours) || 0;
          const rate = r.fixedCodes[def.id] || 0;
          amount = hours * rate;
          extra = { rate };
        } else if (def.meta === 'flat') {
          const rate = r.fixedCodes[def.id] || 0;
          amount = rate;
          extra = { rate };
        }
      } else if (def.type === 'C') {
        amount = Number(c.amount) || 0;
      } else if (def.type === 'D') {
        hours = Number(c.hours) || 0;
        const factor = flags.wage ? resolveWageFactor(def.id, rates) : 0;
        amount = hours * hourlyRate * factor;
        if (hours > 0) hoursByType.other += hours;
      }

      // Single gate for every code: Lønn-huk decides if the amount counts
      // toward lønn. Travel-classified codes (km, oppm.-sone, reiseutgifter)
      // would normally go to Reise — calcDayTravel skips them when Lønn is
      // checked so the same amount isn't counted twice.
      if (flags.wage && amount > 0) wage += amount;

      codeBreakdown.push(Object.assign({
        codeId: def.id,
        name: resolveCodeName(def.id, rates),
        type: def.type,
        hours,
        amount,
      }, extra));
    }

    // Note: reg.travelZone (oppm.-sone) is intentionally NOT folded into wage
    // here. Firesafe-stil requires day-level knowledge (first + last × 0.5
    // for multi-project days), so aggregate() owns the firesafe-weighted
    // contribution to Lønn / Ferie / Skatt — matching the lønnsslipp where
    // each oppm.-line has fractional "Antall" (e.g. 14,5 × 125,00).

    for (const rc of reg.receipts || []) receipts += toNOK(rc.amount, rc.currency);

    return { workHours, wage, receipts, hoursByType, codeBreakdown };
  }

  function calcDayTravel(dayRegs, profile, rates) {
    const r = normalizeRates(rates, profile);
    let kmTotal = 0;
    const zoneLines = [];

    for (const reg of dayRegs) {
      migrateLegacyHours(reg);
      // Every registration contributes one travel line — even with no zone
      // (rate 0). Firesafe rule applies to all lines (first + last × 0.5).
      // The Reise-flag on the matching travel-zone code decides if it counts
      // as travel — independent of Lønn. (Reise-total is visuelt og kan
      // dobbeltføres med Lønn-total.)
      const transport = reg.transport || 'firmaBil';
      const zone = reg.travelZone || '';
      const zoneRate = zone ? ((r.travelRates[transport] && r.travelRates[transport][zone]) || 0) : 0;
      const zoneCodeId = zone ? travelZoneCodeId(transport, zone) : null;
      const zoneFlags = zoneCodeId ? resolveCodeFlags(zoneCodeId, rates) : { travel: false };
      if (zoneFlags.travel) {
        zoneLines.push({ rate: zoneRate });
      } else {
        zoneLines.push({ rate: 0 }); // still preserves first/last ordering
      }

      // Km-godtgjørelse + Reiseutgifter/bompasseringer telles i Reise-totalen
      // når Reise-flagget er på — uavhengig av Lønn (kan vises begge steder).
      for (const c of reg.codes || []) {
        const def = getCode(c.codeId);
        if (!def) continue;
        const f = resolveCodeFlags(def.id, rates);
        if (!f.travel) continue;
        if (def.id === 'km-godtgjorelse') {
          kmTotal += (Number(c.km) || 0) * r.kmRate;
        } else if (def.id === 'reiseutgifter-bom') {
          kmTotal += Number(c.amount) || 0;
        }
      }
    }

    const style = (profile && profile.companyStyle) || 'firesafe';
    let zoneTotal = 0;

    if (zoneLines.length === 0) {
      zoneTotal = 0;
    } else if (style === 'damsgard') {
      zoneTotal = Math.max.apply(null, zoneLines.map((l) => l.rate));
    } else {
      if (zoneLines.length === 1) {
        zoneTotal = zoneLines[0].rate;
      } else {
        const first = zoneLines[0].rate;
        const last = zoneLines[zoneLines.length - 1].rate;
        zoneTotal = first * 0.5 + last * 0.5;
      }
    }

    return kmTotal + zoneTotal;
  }

  // Compute the firesafe/damsgard-weighted oppm.-sone amounts for a day,
  // returning per-registration entries with their weight (1 / 0.5 / 0) and
  // weighted amount. Used by aggregate() to route oppm into wage/vacation/
  // taxable totals at the SAME weighting the lønnsslipp uses (the "Antall"
  // column on the payslip is fractional for exactly this reason).
  function calcDayZoneEntries(dayRegs, profile, rates) {
    const r = normalizeRates(rates, profile);
    const style = (profile && profile.companyStyle) || 'firesafe';
    const lines = [];
    for (const reg of dayRegs) {
      const transport = reg.transport || 'firmaBil';
      const zone = reg.travelZone || '';
      const rate = zone ? ((r.travelRates[transport] && r.travelRates[transport][zone]) || 0) : 0;
      const codeId = zone ? travelZoneCodeId(transport, zone) : null;
      lines.push({ codeId, transport, zone, rate, weight: 0, amount: 0 });
    }
    if (lines.length === 0) return [];
    if (style === 'damsgard') {
      // Only the highest-rate line counts, full × 1.
      let bestIdx = 0;
      for (let i = 1; i < lines.length; i++) if (lines[i].rate > lines[bestIdx].rate) bestIdx = i;
      lines[bestIdx].weight = 1;
    } else if (lines.length === 1) {
      lines[0].weight = 1;
    } else {
      // Firesafe: first + last × 0.5, middle ignored.
      lines[0].weight = 0.5;
      lines[lines.length - 1].weight = 0.5;
    }
    for (const l of lines) l.amount = l.rate * l.weight;
    return lines;
  }

  function groupByDate(regs) {
    const map = new Map();
    for (const r of regs) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date).push(r);
    }
    return map;
  }

  // Slå opp tariff-versjonen som gjelder for en gitt dato. Lista er sortert
  // NYESTE først (validFrom desc), så første treff med validFrom <= dato er
  // riktig versjon. Fallback: eldste tariff hvis datoen er før alle versjoner.
  function resolveTariffForDate(tariffs, dateISO) {
    if (!Array.isArray(tariffs) || tariffs.length === 0) return {};
    for (const t of tariffs) {
      if (!t.validFrom || String(t.validFrom) <= String(dateISO)) return t;
    }
    return tariffs[tariffs.length - 1];
  }

  // Aksepter enten en tariff-liste eller en enkelt rates-objekt for bakover-
  // kompatibilitet. En liste detekteres via Array.isArray.
  function ratesFor(ratesOrTariffs, dateISO) {
    if (Array.isArray(ratesOrTariffs)) {
      return resolveTariffForDate(ratesOrTariffs, dateISO);
    }
    return ratesOrTariffs || {};
  }

  // aggregate(regs, profile, ratesOrTariffs, dayReceipts?, opts?)
  // ratesOrTariffs: enten en tariff-liste (foretrukket) eller et enkelt
  //   rates-objekt (for bakover-kompat). Når det er en liste resolves riktig
  //   tariff per dag basert på registreringens dato.
  // dayReceipts: optional Map<dateISO, receipts[]> for day-level receipts.
  // opts.periodMonths: optional number of months in the period — used to
  //   apply monthlyInsurance (innberetningspliktig forsikring kr/mnd) which
  //   counts as Lønn + Skattbar but NOT in Feriepenger and NOT in actual
  //   payout. When omitted, no insurance is added.
  function aggregate(regs, profile, ratesOrTariffs, dayReceipts, opts) {
    const byDate = groupByDate(regs);
    let totalWage = 0;
    let totalTravel = 0;
    let totalReceipts = 0;
    let vacationPayBasis = 0;
    let taxableTotal = 0;
    let vacationPayAccrued = 0;
    let unionDues = 0;
    const hoursByType = { ordinary: 0, overtime: 0, other: 0 };
    const codeTotals = new Map();

    for (const [date, dayRegs] of byDate) {
      // Hver dag bruker den tariffen som var aktiv på den datoen — slik blir
      // gamle registreringer alltid beregnet med tariffene som gjaldt da.
      const rates = ratesFor(ratesOrTariffs, date);
      const vacRate = (rates && rates.vacationPayRate != null) ? rates.vacationPayRate : 0.12;
      const uniRate = (rates && rates.unionDuesRate != null) ? rates.unionDuesRate : 0.018;

      const dayTravel = calcDayTravel(dayRegs, profile, rates);
      totalTravel += dayTravel;
      // Travel reimbursements are typically NOT in vacation pay and NOT taxable.
      // (We don't include them in vacationPayBasis / taxableTotal here.)
      for (const reg of dayRegs) {
        const c = calcRegistration(reg, profile, rates);
        totalWage += c.wage;
        totalReceipts += c.receipts;
        hoursByType.ordinary += c.hoursByType.ordinary;
        hoursByType.overtime += c.hoursByType.overtime;
        hoursByType.other += c.hoursByType.other;

        // Vacation-pay / taxable basis is now purely a function of code rows.
        for (const cb of c.codeBreakdown) {
          const acc = codeTotals.get(cb.codeId) || { name: cb.name, hours: 0, amount: 0, count: 0 };
          acc.hours += cb.hours || 0;
          acc.amount += cb.amount || 0;
          acc.count += 1;
          codeTotals.set(cb.codeId, acc);

          const flags = resolveCodeFlags(cb.codeId, rates);
          const amt = cb.amount || 0;
          if (flags.vacationPay) {
            vacationPayBasis += amt;
            // Beregn opptjent feriepenger og fagforening per registrering med
            // den tariffens prosent — slik blir tall korrekte selv om
            // prosenten endres mellom tariff-versjoner i samme periode.
            vacationPayAccrued += amt * vacRate;
            unionDues += amt * uniRate;
          }
          if (flags.taxable) taxableTotal += amt;
        }
      }

      // Oppm.-soner: route firesafe/damsgard-weighted amounts to Lønn /
      // Ferie / Skatt totals AND the code breakdown so display matches
      // lønnsslipp (where "Antall" is the firesafe-weighted count).
      const zoneEntries = calcDayZoneEntries(dayRegs, profile, rates);
      for (const ze of zoneEntries) {
        if (!ze.codeId || ze.amount === 0) continue;
        const zFlags = resolveCodeFlags(ze.codeId, rates);
        if (zFlags.wage) totalWage += ze.amount;
        if (zFlags.vacationPay) {
          vacationPayBasis += ze.amount;
          vacationPayAccrued += ze.amount * vacRate;
          unionDues += ze.amount * uniRate;
        }
        if (zFlags.taxable) taxableTotal += ze.amount;
        const acc = codeTotals.get(ze.codeId) || { name: resolveCodeName(ze.codeId, rates), hours: 0, amount: 0, count: 0 };
        acc.amount += ze.amount;
        acc.count += ze.weight; // fractional — matches lønnsslippens "Antall"
        codeTotals.set(ze.codeId, acc);
      }
    }

    // Day-level receipts (preferred location going forward).
    if (dayReceipts && typeof dayReceipts.forEach === 'function') {
      dayReceipts.forEach((items) => {
        for (const r of items || []) totalReceipts += toNOK(r.amount, r.currency);
      });
    }

    const totalHours = hoursByType.ordinary + hoursByType.overtime + hoursByType.other;

    // Insurance count = unique pay periods that actually have registrations.
    // Pay-period boundary depends on companyStyle (Firesafe 11–10, Damsgård
    // 26–25). This makes perioden + YTD give identical totals when the data
    // is the same — only the COUNT OF PAY PERIODS WITH DATA matters, not the
    // calendar months in the selected range.
    const ppStart = ((profile && profile.companyStyle) === 'damsgard') ? 26 : 11;
    const periodsWithData = new Set();
    for (const reg of regs) {
      if (!reg || !reg.date) continue;
      const [py, pm, pd] = String(reg.date).split('-').map(Number);
      // Day >= start → pay period starts this month; else last month.
      let ppY = py, ppM = pm;
      if (pd < ppStart) {
        if (ppM === 1) { ppY -= 1; ppM = 12; } else { ppM -= 1; }
      }
      periodsWithData.add(ppY + '-' + String(ppM).padStart(2, '0'));
    }
    // Backwards-compat: if caller explicitly passed periodMonths use that,
    // otherwise derive from data.
    const periodMonths = (opts && opts.periodMonths != null) ? Number(opts.periodMonths) : periodsWithData.size;

    // Forsikring per lønnsperiode: bruk tariffen som var aktiv den siste
    // dagen i lønnsperioden. Defaults når ingen periode-data finnes.
    let insuranceTotal = 0;
    let displayInsuranceMonthly = 99.33;
    if (periodsWithData.size > 0) {
      const sortedPeriods = Array.from(periodsWithData).sort();
      for (const pp of sortedPeriods) {
        const [py, pm] = pp.split('-').map(Number);
        // Lønnsperiode pp = py-pm starter på ppStart-dag i den måneden.
        // Slutter på (ppStart-1) i neste måned. Bruk den siste dagen som
        // peilepunkt for tariff-lookup.
        const endY = pm === 12 ? py + 1 : py;
        const endM = pm === 12 ? 1 : pm + 1;
        const endDay = ppStart - 1;
        const endIso = endY + '-' + String(endM).padStart(2, '0') + '-' + String(endDay).padStart(2, '0');
        const rates = ratesFor(ratesOrTariffs, endIso);
        const monthly = (rates && rates.monthlyInsurance != null) ? Number(rates.monthlyInsurance) : 99.33;
        insuranceTotal += monthly;
      }
      const lastRates = ratesFor(ratesOrTariffs, sortedPeriods[sortedPeriods.length - 1] + '-28');
      displayInsuranceMonthly = (lastRates && lastRates.monthlyInsurance != null) ? Number(lastRates.monthlyInsurance) : 99.33;
    } else {
      // Ingen data — bruk siste tariff i lista for display-verdier.
      const fallback = Array.isArray(ratesOrTariffs) ? (ratesOrTariffs[0] || {}) : (ratesOrTariffs || {});
      displayInsuranceMonthly = (fallback.monthlyInsurance != null) ? Number(fallback.monthlyInsurance) : 99.33;
      insuranceTotal = displayInsuranceMonthly * periodMonths;
    }

    // Display-prosenter i totals-tabellen: vis NYESTE tariffs satser. Selve
    // tallene over er regnet per-dag med rett tariff, men etiketten ("Feriepenger 12%")
    // skal vise current rate så bruker vet hvilken sats som nå gjelder.
    const displayTariff = Array.isArray(ratesOrTariffs) ? (ratesOrTariffs[0] || {}) : (ratesOrTariffs || {});
    const vacationPayRate = (displayTariff.vacationPayRate != null) ? displayTariff.vacationPayRate : 0.12;
    const unionDuesRate = (displayTariff.unionDuesRate != null) ? displayTariff.unionDuesRate : 0.018;

    // Insurance: admin flags decide which totals it joins (default Lønn ✓,
    // Skatt ✓, Ferie ✗, Reise ✗ — matches lønnsslipp). User can override
    // via "Forsikring" rad i admin → 5 flagg. Bruker siste tariff for flag.
    const insFlags = resolveCodeFlags('rate.forsikring', displayTariff);
    const grossWithInsurance = totalWage + (insFlags.wage ? insuranceTotal : 0);
    const taxableWithInsurance = taxableTotal + (insFlags.taxable ? insuranceTotal : 0);
    const vacationPayBasisAdj = vacationPayBasis + (insFlags.vacationPay ? insuranceTotal : 0);
    const travelWithInsurance = totalTravel + (insFlags.travel ? insuranceTotal : 0);

    if (insFlags.vacationPay && insuranceTotal > 0) {
      vacationPayAccrued += insuranceTotal * vacationPayRate;
      unionDues += insuranceTotal * unionDuesRate;
    }
    const taxBasisAfterDues = Math.max(0, grossWithInsurance - unionDues);

    return {
      totalHours,
      totalWage: grossWithInsurance,
      totalWageWithoutInsurance: totalWage,
      insuranceTotal, monthlyInsurance: displayInsuranceMonthly, periodMonths,
      totalTravel: travelWithInsurance, totalReceipts,
      vacationPayBasis: vacationPayBasisAdj, taxableTotal: taxableWithInsurance,
      vacationPayAccrued, vacationPayRate,
      unionDues, unionDuesRate,
      taxBasisAfterDues,
      hoursByType,
      codeTotals: Array.from(codeTotals.entries()).map(([id, v]) => Object.assign({ id }, v)),
    };
  }

  // Approximate exchange rates → NOK (May 2026 ballpark).
  // Admin-tunable later if needed.
  const FX_TO_NOK = { NOK: 1, USD: 10.5, EUR: 11.5, GBP: 13.5 };

  function toNOK(amount, currency) {
    const rate = FX_TO_NOK[currency || 'NOK'] || 1;
    return (Number(amount) || 0) * rate;
  }

  function sumDayReceipts(items) {
    let s = 0;
    for (const r of items || []) s += toNOK(r.amount, r.currency);
    return s;
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.calc = {
    normalizeRates, calcRegistration, calcDayTravel, groupByDate, aggregate, sumDayReceipts,
    migrateLegacyHours, toNOK, resolveTariffForDate,
  };
})(window);
