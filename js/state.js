// Lightweight reactive state for the current session.
(function (global) {
  const { db } = global.Timebok.data;

  const state = {
    user: null,
    profile: null,
    projects: [],
    // tariffs: ordnet liste over alle tariff-versjoner, NYESTE først.
    // Hver tariff har { id, name, validFrom, ...rate-felt (kmRate, travelRates,
    // fixedCodes, codeFlags, codeOrg, codeNames, wageFactors, codePremiumPct,
    // overtidsgrunnlag, vacationPayRate, unionDuesRate, monthlyInsurance) }.
    tariffs: [],
  };

  const listeners = new Set();

  function get() { return state; }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit() { listeners.forEach((fn) => fn(state)); }

  // Returner tariff-objektet som gjelder for en gitt dato (ISO yyyy-mm-dd).
  // Strategi: ta nyeste tariff hvor validFrom <= dato. Fallbacks: hvis ingen
  // tariff dekker (datoen er før den eldste validFrom), bruk den eldste vi
  // har — bedre å regne med noe enn å returnere tomt og falle helt tilbake
  // til defaults.
  function getRatesForDate(dateISO) {
    const list = state.tariffs || [];
    if (!list.length) return {};
    for (const t of list) {
      if (!t.validFrom || String(t.validFrom) <= String(dateISO)) return t;
    }
    return list[list.length - 1];
  }

  // Nyeste tariff (først i den sorterte lista). Brukes for visningsverdier
  // som ikke knyttes til en spesifikk dato (f.eks. når admin redigerer som
  // standard, eller når periode-totalene viser "Feriepenger %"-etiketten).
  function getLatestTariff() {
    return (state.tariffs && state.tariffs[0]) || {};
  }

  // Liste over UNIKE tariffer som ble brukt over et sett av datoer. Sortert
  // etter validFrom (eldste først) så "FOB 2024-2026 + Mellomoppgjør 2025"
  // leses i kronologisk rekkefølge. Brukes i transparens-tekst på Uke- og
  // Periode-visning så bruker ser hvilke tariffer som styrte beregningene.
  function listTariffsForDates(dateISOs) {
    const seen = new Set();
    const result = [];
    for (const date of dateISOs || []) {
      const t = getRatesForDate(date);
      if (!t || !t.id) continue;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      result.push(t);
    }
    result.sort((a, b) => String(a.validFrom || '').localeCompare(String(b.validFrom || '')));
    return result;
  }

  // Felter som regnes som "tariff-data" og kopieres ved migrering av en
  // gammel global/rates-doc. Holdt på ett sted så det er enkelt å utvide
  // når nye satser legges til.
  const TARIFF_FIELDS = [
    'kmRate', 'travelRates', 'travelRatesByStyle', 'fixedCodes',
    'codeFlags', 'codeOrg', 'codeNames', 'wageFactors', 'codePremiumPct',
    'overtidsgrunnlag', 'orgPremiumAddOn',
    'vacationPayRate', 'unionDuesRate', 'monthlyInsurance',
  ];

  function buildInitialTariff(rates) {
    const initial = {
      id: 'initial',
      name: 'Initiell tariff',
      validFrom: '2020-01-01',
    };
    if (rates) {
      for (const key of TARIFF_FIELDS) {
        if (rates[key] !== undefined) initial[key] = rates[key];
      }
    }
    return initial;
  }

  function sortTariffsDesc(list) {
    return list.slice().sort((a, b) =>
      String(b.validFrom || '').localeCompare(String(a.validFrom || ''))
    );
  }

  async function applyGlobal(gl) {
    state.projects = gl.projects || [];
    const rates = gl.rates || {};
    let tariffs = Array.isArray(rates.tariffs) ? rates.tariffs : null;
    if (!tariffs || !tariffs.length) {
      // Migrering: gammel datastruktur hadde rate-feltene direkte på rates-
      // doc-en. Pakk dem inn i en "Initiell tariff" så all gammel data
      // fortsatt beregnes med samme verdier. Admin lagrer tilbake første
      // gang de er logget inn (regler tillater kun admin skriv).
      tariffs = [buildInitialTariff(rates)];
      if (isAdmin()) {
        try {
          await db.saveRates({ tariffs });
        } catch (e) {
          console.warn('Tariff-migrering kunne ikke lagres:', e);
        }
      }
    }
    state.tariffs = sortTariffsDesc(tariffs);
  }

  async function loadAll(user) {
    state.user = user;
    if (!user) {
      state.profile = null;
      state.projects = [];
      state.tariffs = [];
      emit();
      return;
    }
    const [profile, gl] = await Promise.all([db.getProfile(user.id), db.getGlobal()]);
    state.profile = profile || null;
    await applyGlobal(gl);
    emit();
  }

  async function refreshGlobal() {
    const gl = await db.getGlobal();
    await applyGlobal(gl);
    emit();
  }

  async function refreshProfile() {
    if (!state.user) return;
    state.profile = await db.getProfile(state.user.id);
    emit();
  }

  function isAdmin() {
    return !!(state.profile && state.profile.role === 'admin');
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.state = {
    get, subscribe, loadAll, refreshGlobal, refreshProfile, isAdmin,
    getRatesForDate, getLatestTariff, listTariffsForDates,
  };
})(window);
