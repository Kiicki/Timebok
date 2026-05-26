(function (global) {
  const { el, mount, toast, confirmModal, openModal, closeModal } = global.Timebok.dom;
  const { t } = global.Timebok.i18n;
  const { db } = global.Timebok.data;
  const { get: getState, refreshGlobal, isAdmin } = global.Timebok.state;
  const { TRAVEL_ZONES, CODES, isTravelZoneCode, resolveCodeFlags, resolveWageFactor, resolveCodeIsOrg, resolveCodePremiumPct, resolveOvertidsgrunnlag, resolveCodeName, getCodeKind } = global.Timebok.codes;
  const { normalizeRates } = global.Timebok.calc;
  const { parseNum, displayNum, formatDateNo, fromISODate, toISODate } = global.Timebok.dateUtils;
  function setTopbar(opts) { global.Timebok.chrome.setTopbar(opts); }

  let activeTab = 'projects';
  // Hvilken tariff-versjon admin redigerer akkurat nå. Default = nyeste
  // (første i state.tariffs som er sortert desc på validFrom).
  let selectedTariffId = null;

  // Predefinerte tariff-maler — alle felt brukeren er sikker på er fylt inn
  // fra protokoll. Felter satt til 0 betyr "ikke i mellomoppgjør / må fylles
  // manuelt fra base-avtalen". "Importer mal..."-knappen i admin gir ett-
  // klikks-installasjon av en valgt mal.
  //
  // For å legge til flere tariffer: push en ny post med id, name, validFrom
  // (+ valgfri validTo) og rate-feltene som er kjent. Endringer rører ikke
  // eksisterende tariffer i basen — bare når brukeren eksplisitt klikker
  // importer-knappen for malen.
  const TARIFF_TEMPLATES = [
    {
      id: 't_fob_byggfag_2024_2026',
      name: 'Fellesoverenskomsten for byggfag 2024-2026',
      validFrom: '2024-04-01',
      validTo: '2026-03-31',
      overtidsgrunnlag: 314.69,         // FOB § 2-3
      kmRate: 0,
      monthlyInsurance: 0,
      vacationPayRate: 0.12,
      unionDuesRate: 0.018,
      travelRates: {
        firmaBil:  { '7,5-15':  70.70, '15-30': 118.40, '30-45': 141.50, '45-60': 165.20, '60-75': 189.70 },
        privatBil: { '7,5-15': 114.60, '15-30': 189.90, '30-45': 223.20, '45-60': 255.70, '60-75': 290.40 },
      },
      fixedCodes: {
        'bastillegg':               8.15,   // § 2-4 pkt 1
        'smusstillegg-1':           4.89,   // § 2-4 pkt 2
        'overtidsmat-u12':        107.00,   // § 2-5
        'overtidsmat-o12':          0,
        'tilhengertillegg':         0,
        'passasjertillegg':         0,
        'utenbystillegg-fagarb':    0,
        'utenbystillegg-u-fagbrev': 0,
        'tarifftillegg-a121':       0,
        'opplaeringstillegg-ks':    0,
      },
    },
    {
      id: 't_fob_byggfag_2025_mello',
      name: 'Fellesoverenskomsten for byggfag – Mellomoppgjør 2025',
      validFrom: '2025-04-30',
      validTo: null,
      // Mellomoppgjør mellom Fellesforbundet og NHO Byggenæringen, vedtatt
      // 30.04.2025. Arver alt fra forrige tariff (typisk FOB 2024-2026) og
      // overskriver bare det protokollen faktisk endrer. Ved import søkes
      // forrige tariff opp automatisk (nyeste tariff med validFrom < 2025-04-30).
      basedOnPreviousTariff: true,
      // Det protokollen ENDRER:
      overtidsgrunnlag: 332.31,         // § 2-3
      travelRates: {                     // § 7-1
        firmaBil:  { '7,5-15':  74.70, '15-30': 125.00, '30-45': 149.40, '45-60': 174.50, '60-75': 200.30 },
        privatBil: { '7,5-15': 119.10, '15-30': 197.50, '30-45': 232.20, '45-60': 266.20, '60-75': 302.40 },
      },
      // Alt annet (bastillegg, smusstillegg, overtidsmat, feriepenger,
      // fagforening osv.) arves fra forrige tariff — INGEN behov for å
      // liste dem her.
    },
    {
      id: 't_fob_byggfag_2026_2028',
      name: 'Fellesoverenskomsten for byggfag 2026-2028',
      // Protokoll: "Alle nye satser gjelder fra 01.04.2026. Unntak: § 6 og
      // § 7 (skifttillegg + reisesatser) gjelder fra 12.05.2026."
      // Vi bruker hovedikrafttredelsen 01.04.2026 — den lille 5-ukers gapen
      // for reisesatser er minimal i praksis, men den nøyaktige bruker kan
      // splitte i to tariffer manuelt om nødvendig.
      validFrom: '2026-04-01',
      validTo: '2028-03-31',
      basedOnPreviousTariff: true,
      overtidsgrunnlag: 347.60,         // § 2-3 (samme som § 6-3.2)
      travelRates: {                     // § 7-1
        firmaBil:  { '7,5-15':  76.00, '15-30': 127.30, '30-45': 152.10, '45-60': 177.60, '60-75': 203.90 },
        privatBil: { '7,5-15': 122.20, '15-30': 202.60, '30-45': 238.20, '45-60': 273.00, '60-75': 310.10 },
      },
      fixedCodes: {
        'overtidsmat-u12': 114.00,       // § 2-5 Matpenger ved overtid
      },
      // Alt annet (bastillegg, smusstillegg, feriepenger, fagforening osv.)
      // arves fra forrige tariff.
    },
  ];

  // Slår sammen en template som "arver" inn på en eksisterende base-tariff.
  // Reglene for merge er bevisst eksplisitte så det er forutsigbart hva som
  // arves vs overskrives:
  //   - id / name / validFrom / validTo: kommer fra template (identifiserer
  //     den nye tariffen)
  //   - top-level numeriske felt (overtidsgrunnlag, kmRate, monthlyInsurance,
  //     vacationPayRate, unionDuesRate): template overskriver hvis satt
  //   - travelRates per transporttype (firmaBil / privatBil): template
  //     overskriver HELE bucket'en for den transporttypen, base beholdes
  //     for andre transporttyper hvis ikke template spesifiserer dem
  //   - fixedCodes / codeFlags / codeOrg / codeNames / wageFactors /
  //     codePremiumPct: per-nøkkel merge — base beholdes, template
  //     overskriver kun de nøklene som er satt
  function mergeTemplateOntoBase(base, template) {
    const result = JSON.parse(JSON.stringify(base || {}));
    result.id = template.id;
    result.name = template.name;
    result.validFrom = template.validFrom;
    result.validTo = template.validTo !== undefined ? template.validTo : (base && base.validTo) || null;
    // Fjern eventuell arv-markør fra forrige tariff så det ikke "smitter".
    delete result.basedOnPreviousTariff;

    const scalarKeys = ['overtidsgrunnlag', 'kmRate', 'monthlyInsurance', 'vacationPayRate', 'unionDuesRate'];
    for (const k of scalarKeys) {
      if (template[k] !== undefined) result[k] = template[k];
    }

    if (template.travelRates) {
      result.travelRates = Object.assign({}, result.travelRates || {});
      if (template.travelRates.firmaBil)  result.travelRates.firmaBil  = Object.assign({}, template.travelRates.firmaBil);
      if (template.travelRates.privatBil) result.travelRates.privatBil = Object.assign({}, template.travelRates.privatBil);
    }

    const mergedKeys = ['fixedCodes', 'codeFlags', 'codeOrg', 'codeNames', 'wageFactors', 'codePremiumPct'];
    for (const k of mergedKeys) {
      if (template[k]) {
        result[k] = Object.assign({}, result[k] || {}, template[k]);
      }
    }

    return result;
  }

  // Finn tariffen som er nærmest forrige før template.validFrom — denne
  // brukes som base når en mellomoppgjør-mal importeres. Filtrerer bort
  // template'en selv så vi ikke baserer den på sin egen forrige versjon
  // ved re-import.
  function findPreviousTariff(templateId, beforeISO) {
    const list = (getState().tariffs) || [];
    return list
      .filter((t) => t.id !== templateId && t.validFrom && t.validFrom < beforeISO)
      .sort((a, b) => String(b.validFrom).localeCompare(String(a.validFrom)))[0] || null;
  }

  function ensureSelectedTariffId() {
    const list = (getState().tariffs) || [];
    if (!list.length) { selectedTariffId = null; return null; }
    if (selectedTariffId && list.some((t) => t.id === selectedTariffId)) return selectedTariffId;
    selectedTariffId = list[0].id;
    return selectedTariffId;
  }

  function getSelectedTariff() {
    ensureSelectedTariffId();
    const list = (getState().tariffs) || [];
    return list.find((t) => t.id === selectedTariffId) || {};
  }

  // Skriver oppdaterte felt INN i den valgte tariffen og lagrer hele
  // tariff-arrayet tilbake til Firestore via db.saveRates({ tariffs }).
  async function saveSelectedTariff(updates) {
    ensureSelectedTariffId();
    const list = ((getState().tariffs) || []).slice();
    const idx = list.findIndex((t) => t.id === selectedTariffId);
    if (idx < 0) return;
    list[idx] = Object.assign({}, list[idx], updates);
    list.sort((a, b) => String(b.validFrom || '').localeCompare(String(a.validFrom || '')));
    await db.saveRates({ tariffs: list });
    await refreshGlobal();
  }

  // Kort label for dropdown-options: navn + effektiv periode.
  // Den effektive perioden tar hensyn til når NESTE tariff overtok, ikke
  // bare den formelle validTo i protokollen. Slik unngår vi å si at en
  // tariff "gjelder til 2026" når en nyere har overtatt allerede i 2025.
  function tariffLabel(t) {
    const period = getEffectivePeriod(t, (getState().tariffs) || []);
    const fromPretty = period.from ? formatDateNo(period.from) : '—';
    const toPretty = period.to ? ' – ' + formatDateNo(period.to) : '';
    return (t.name || 'Uten navn') + ' · ' + fromPretty + toPretty;
  }

  // Effektiv periode for en tariff: hva som faktisk styrer beregningene.
  // Hvis det finnes en nyere tariff (validFrom > denne sin validFrom) som
  // har "overtatt", returneres den dagen FØR neste validFrom som effektiv
  // to-dato. Ellers brukes tariffens formelle validTo (eller null hvis
  // åpen i øvre ende).
  function getEffectivePeriod(tariff, allTariffs) {
    if (!tariff || !tariff.validFrom) return { from: null, to: null, replacedBy: null };
    const later = (allTariffs || [])
      .filter((t) => t.id !== tariff.id && t.validFrom && t.validFrom > tariff.validFrom)
      .sort((a, b) => String(a.validFrom).localeCompare(String(b.validFrom)));
    const next = later[0] || null;
    if (next) {
      return { from: tariff.validFrom, to: isoDayBefore(next.validFrom), replacedBy: next };
    }
    return { from: tariff.validFrom, to: tariff.validTo || null, replacedBy: null };
  }

  function isoDayBefore(iso) {
    const d = fromISODate(iso);
    d.setDate(d.getDate() - 1);
    return toISODate(d);
  }

  // En tariff er "aktiv i dag" hvis dagens dato er innenfor [validFrom, validTo].
  // validTo er valgfri — uten satt validTo regnes tariffen som åpen i øvre ende.
  function isTariffActiveOnDate(tariff, dateISO) {
    if (!tariff || !tariff.validFrom) return false;
    if (tariff.validFrom > dateISO) return false;
    if (tariff.validTo && tariff.validTo < dateISO) return false;
    return true;
  }

  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function genTariffId() {
    return 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Auto-expanding textarea for tariff-navn. Vokser med innholdet, krymper
  // når brukeren sletter tekst. Hindrer Enter fra å legge inn newline (navn
  // skal være på én eller flere linjer, men ikke ha eksplisitte linjeskift).
  function makeNameTextarea(initialValue) {
    const ta = el('textarea', {
      rows: 1,
      placeholder: 'F.eks. "Tariff 2027"',
      class: 'tariff-modal-input tariff-name-input',
    });
    ta.value = initialValue || '';
    function autoSize() {
      ta.style.height = 'auto';
      ta.style.height = (ta.scrollHeight + 2) + 'px';
    }
    ta.addEventListener('input', autoSize);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        ta.blur();
      }
    });
    // Vent til elementet er i DOM før vi måler scrollHeight.
    requestAnimationFrame(autoSize);
    setTimeout(autoSize, 50); // fallback for openModal-overgangen
    return ta;
  }

  // Tariff-velger som vises øverst i Satser-fanen. onChange kalles når
  // bruker bytter tariff i dropdown'en eller når en ny tariff opprettes/
  // slettes, slik at hovedinnholdet (renderTravel/renderAllCodes) kan
  // re-rendre med riktig tariff.
  function renderTariffSelector(onChange) {
    ensureSelectedTariffId();
    const list = (getState().tariffs) || [];
    const today = todayIso();

    // Finn ID for "aktiv i dag" så vi kan vise det som en egen badge
    // i stedet for å trange-presse det inn i selve dropdown-teksten.
    // Respekterer validTo: en utløpt tariff regnes ikke som aktiv selv
    // om den har nyeste validFrom blant kandidatene.
    let activeId = null;
    for (const t2 of list) {
      if (!isTariffActiveOnDate(t2, today)) continue;
      if (!activeId || t2.validFrom > (list.find((x) => x.id === activeId).validFrom || '')) {
        activeId = t2.id;
      }
    }

    // Trigger-knapp som åpner en modal med tariff-liste. Bruker modal i
    // stedet for inline-popup fordi:
    //   1) Lange tariff-navn kan wrappe naturlig i modal-listen
    //   2) Konsekvent med kode-velger og andre pickers i app-en
    //   3) Unngår at popup duplikerer trigger-utseendet visuelt
    const selectedTariff = list.find((tf) => tf.id === selectedTariffId) || list[0] || {};
    const selectedPrefix = selectedTariff.id === activeId ? '● ' : '';
    const trigger = el('button', {
      type: 'button', class: 'tariff-picker-trigger',
      onclick: () => openTariffPickerModal(activeId, onChange),
    }, [
      el('span', { class: 'tariff-picker-label' },
        selectedPrefix + tariffLabel(selectedTariff)),
      el('span', { class: 'tariff-picker-caret', 'aria-hidden': 'true' }, '▾'),
    ]);

    // Knapp-labels er holdt korte så alle 4 (+ Slett når relevant) får
    // plass på én rad på mobile bredder (360px). title-attribute gir full
    // forklaring ved hover/tap-and-hold.
    const newBtn = el('button', {
      type: 'button', class: 'btn btn-secondary btn-sm',
      onclick: () => openNewTariffModal(onChange),
      title: 'Opprett ny tariff fra bunnen av',
    }, '+ Ny');

    const importBtn = el('button', {
      type: 'button', class: 'btn btn-secondary btn-sm',
      onclick: () => openImportTariffModal(onChange),
      title: 'Sett inn satser fra en kjent tariff-mal',
    }, 'Importer');

    const editBtn = el('button', {
      type: 'button', class: 'btn btn-secondary btn-sm',
      onclick: () => openEditTariffModal(onChange),
      disabled: !list.length,
      title: 'Endre navn og gyldig-fra-dato',
    }, 'Rediger');

    // Slett-knappen vises kun når det finnes mer enn én tariff — vi vil
    // aldri ende uten satser overhodet.
    const delBtn = list.length > 1 ? el('button', {
      type: 'button', class: 'btn btn-secondary btn-sm tariff-delete-btn',
      onclick: async () => {
        const current = getSelectedTariff();
        const ok = await confirmModal('Slett tariff', 'Slette "' + (current.name || 'tariff') + '"? Registreringer som brukte denne vil falle tilbake til nærmest forrige tariff.', { okLabel: 'Slett', danger: true });
        if (!ok) return;
        const next = ((getState().tariffs) || []).filter((t) => t.id !== selectedTariffId);
        await db.saveRates({ tariffs: next });
        selectedTariffId = null;
        await refreshGlobal();
        toast(t('toast.deleted'));
        onChange();
      },
      title: 'Slett valgt tariff',
    }, 'Slett') : null;

    // Layout: label over selectet (ikke ved siden av), så lange tariff-
    // navn får hele bredden. Aktiv-badge under viser hvilken tariff som
    // gjelder i dag selv om brukeren har valgt en annen i dropdown'en.
    const isViewingActive = selectedTariff && selectedTariff.id === activeId;
    const badge = activeId ? el('span', { class: 'tariff-active-badge' + (isViewingActive ? '' : ' tariff-active-badge-other') },
      isViewingActive
        ? '● Aktiv i dag'
        : '● Aktiv i dag: ' + tariffLabel(list.find((x) => x.id === activeId) || {})
    ) : null;

    return el('div', { class: 'tariff-selector-wrap' }, [
      el('div', { class: 'tariff-selector-label' }, 'Tariff'),
      trigger,
      badge,
      el('div', { class: 'tariff-selector-actions' }, [newBtn, importBtn, editBtn, delBtn]),
      el('p', { class: 'small muted tariff-selector-help' },
        'Gamle registreringer beregnes alltid med tariffen som var aktiv da. Endringer her påvirker kun registreringer fra "gyldig fra"-datoen og fremover.'),
    ]);
  }

  // Modal-basert tariff-picker. Brukes av trigger-knappen i renderTariffSelector.
  function openTariffPickerModal(activeId, onSelected) {
    const list = (getState().tariffs) || [];
    const listNode = el('div', { class: 'tariff-modal-list' });
    list.forEach((tariff) => {
      const isSelected = tariff.id === selectedTariffId;
      const isActive = tariff.id === activeId;
      const period = getEffectivePeriod(tariff, list);
      const meta = (period.from ? formatDateNo(period.from) : '—')
        + (period.to ? ' – ' + formatDateNo(period.to) : '');
      // Hvis en nyere tariff overtok før den formelle validTo, vis det
      // som tilleggsinfo så bruker forstår hvorfor effektiv-til er
      // tidligere enn det som står i tariff-protokollen.
      const replacedByName = period.replacedBy
        ? (period.replacedBy.name || 'nyere tariff')
        : null;
      const item = el('button', {
        type: 'button',
        class: 'tariff-modal-item' + (isSelected ? ' is-selected' : ''),
      }, [
        el('div', { class: 'tariff-modal-item-main' }, [
          el('div', { class: 'tariff-modal-item-name' }, tariff.name || 'Uten navn'),
          el('div', { class: 'tariff-modal-item-meta' }, meta),
          replacedByName ? el('div', { class: 'tariff-modal-item-note' },
            'Erstattet av: ' + replacedByName) : null,
        ]),
        isActive ? el('span', { class: 'tariff-modal-item-badge' }, 'Aktiv i dag') : null,
      ]);
      item.addEventListener('click', () => {
        selectedTariffId = tariff.id;
        closeModal();
        onSelected();
      });
      listNode.appendChild(item);
    });

    const panel = el('div', {}, [
      el('h2', { class: 'modal-title' }, 'Velg tariff'),
      el('p', { class: 'small muted', style: { margin: '0 0 12px' } },
        'Du redigerer satsene til tariffen du velger her.'),
      listNode,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: closeModal },
          t('common.close')),
      ]),
    ]);
    openModal(panel);
  }

  // Rediger navn, gyldig-fra og gyldig-til på valgt tariff. Satsene
  // endres ikke her — det gjøres i tabellene under. validTo er valgfritt;
  // en tariff uten validTo regnes som "åpen i øvre ende" (gjelder til en
  // nyere tariff overtar via sin validFrom).
  function openEditTariffModal(onSaved) {
    const cur = getSelectedTariff();
    if (!cur || !cur.id) return;

    const nameIn = makeNameTextarea(cur.name || '');
    const validFromIn = el('input', {
      type: 'date', value: cur.validFrom || todayIso(),
      class: 'tariff-modal-input',
    });
    const validToIn = el('input', {
      type: 'date', value: cur.validTo || '',
      class: 'tariff-modal-input',
    });

    async function save() {
      const name = (nameIn.value || '').trim();
      if (!name) { nameIn.focus(); return; }
      const validFrom = validFromIn.value;
      if (!validFrom) { validFromIn.focus(); return; }
      const validTo = validToIn.value || null;
      if (validTo && validTo < validFrom) {
        toast('Gyldig til må være etter gyldig fra');
        validToIn.focus();
        return;
      }
      await saveSelectedTariff({ name, validFrom, validTo });
      closeModal();
      toast(t('toast.saved'));
      onSaved();
    }

    const panel = el('div', {}, [
      el('h2', { class: 'modal-title' }, 'Rediger tariff'),
      el('div', { class: 'form-group' }, [
        el('label', {}, 'Navn *'), nameIn,
      ]),
      el('div', { class: 'form-group' }, [
        el('label', {}, 'Gyldig fra *'), validFromIn,
      ]),
      el('div', { class: 'form-group' }, [
        el('label', {}, 'Gyldig til'), validToIn,
        el('p', { class: 'small muted', style: { margin: '4px 0 0' } },
          'Valgfritt. La stå tom hvis tariffen skal gjelde til en nyere overtar.'),
      ]),
      el('p', { class: 'small muted', style: { margin: '0 0 12px' } },
        'Selve satsene redigerer du i tabellene under.'),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => closeModal() }, t('common.cancel')),
        el('button', { class: 'btn', type: 'button', onclick: save }, t('common.save')),
      ]),
    ]);
    openModal(panel);
    setTimeout(() => nameIn.focus(), 0);
  }

  // Setter inn (eller overskriver) en mal-tariff i listen. Brukes av
  // "Importer mal..."-modalen.
  //
  // Hvis malen har basedOnPreviousTariff:true (typisk mellomoppgjør) blir
  // satser arvet fra forrige tariff i lista og bare det malen spesifiserer
  // overstyres. Slik blir bastillegg, smusstillegg osv. korrekt med inn på
  // mellomoppgjør-tariffen uten at jeg trenger å duplisere disse verdiene
  // i hver mal.
  async function importTariffTemplate(template, onImported) {
    const list = ((getState().tariffs) || []).slice();
    const exists = list.some((t) => t.id === template.id);

    let basedOn = null;
    let finalTariff;
    if (template.basedOnPreviousTariff) {
      basedOn = findPreviousTariff(template.id, template.validFrom);
      if (basedOn) {
        finalTariff = mergeTemplateOntoBase(basedOn, template);
      } else {
        // Ingen forrige tariff å arve fra — importér malen som den er.
        // Brukeren ser i admin at noen felt mangler, og kan fylle inn.
        finalTariff = JSON.parse(JSON.stringify(template));
        delete finalTariff.basedOnPreviousTariff;
      }
    } else {
      finalTariff = JSON.parse(JSON.stringify(template));
    }

    let message;
    if (exists) {
      message = '"' + template.name + '" finnes allerede og vil bli overskrevet.';
    } else if (template.basedOnPreviousTariff && basedOn) {
      message = 'Importerer "' + template.name + '". Arver satser fra forrige tariff "'
        + (basedOn.name || basedOn.id) + '" og overskriver bare det mellomoppgjøret endrer.';
    } else if (template.basedOnPreviousTariff && !basedOn) {
      message = 'Importerer "' + template.name + '". Ingen tidligere tariff å arve fra — kun spesifiserte felt blir satt.';
    } else {
      message = 'Legge til "' + template.name + '"?';
    }
    const ok = await confirmModal(
      exists ? 'Overskrive tariff?' : 'Importer tariff?',
      message,
      { okLabel: exists ? 'Overskrive' : 'Importer', danger: exists }
    );
    if (!ok) return;

    const next = list.filter((t) => t.id !== template.id);
    next.push(finalTariff);
    next.sort((a, b) => String(b.validFrom || '').localeCompare(String(a.validFrom || '')));
    await db.saveRates({ tariffs: next });
    selectedTariffId = finalTariff.id;
    await refreshGlobal();
    toast(exists ? 'Tariff overskrevet' : 'Tariff importert');
    onImported();
  }

  function openImportTariffModal(onImported) {
    const listNode = el('div', { class: 'tariff-modal-list' });
    TARIFF_TEMPLATES.forEach((tpl) => {
      const existingIds = ((getState().tariffs) || []).map((t) => t.id);
      const alreadyImported = existingIds.includes(tpl.id);
      const meta = (tpl.validFrom ? formatDateNo(tpl.validFrom) : '—')
        + (tpl.validTo ? ' – ' + formatDateNo(tpl.validTo) : '')
        + (alreadyImported ? ' · allerede importert' : '');
      const item = el('button', {
        type: 'button',
        class: 'tariff-modal-item' + (alreadyImported ? ' is-imported' : ''),
      }, [
        el('div', { class: 'tariff-modal-item-main' }, [
          el('div', { class: 'tariff-modal-item-name' }, tpl.name),
          el('div', { class: 'tariff-modal-item-meta' }, meta),
        ]),
      ]);
      item.addEventListener('click', () => {
        closeModal();
        importTariffTemplate(tpl, onImported);
      });
      listNode.appendChild(item);
    });

    const panel = el('div', {}, [
      el('h2', { class: 'modal-title' }, 'Importer tariff-mal'),
      el('p', { class: 'small muted', style: { margin: '0 0 12px' } },
        'Velg en mal for å sette inn standardsatsene. Du kan redigere satsene etterpå.'),
      listNode,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: closeModal },
          t('common.close')),
      ]),
    ]);
    openModal(panel);
  }

  function openNewTariffModal(onCreated) {
    const sourceTariff = getSelectedTariff();
    const nameIn = makeNameTextarea('');
    const validFromIn = el('input', {
      type: 'date', value: todayIso(), class: 'tariff-modal-input',
    });
    const validToIn = el('input', {
      type: 'date', value: '', class: 'tariff-modal-input',
    });

    async function create() {
      const name = (nameIn.value || '').trim();
      if (!name) { nameIn.focus(); return; }
      const validFrom = validFromIn.value;
      if (!validFrom) { validFromIn.focus(); return; }
      const validTo = validToIn.value || null;
      if (validTo && validTo < validFrom) {
        toast('Gyldig til må være etter gyldig fra');
        validToIn.focus();
        return;
      }

      // Sørg for at validTo overskrives selv om kilde-tariffen hadde en.
      const newTariff = Object.assign({}, sourceTariff, {
        id: genTariffId(),
        name,
        validFrom,
        validTo,
      });
      const next = ((getState().tariffs) || []).slice();
      next.push(newTariff);
      next.sort((a, b) => String(b.validFrom || '').localeCompare(String(a.validFrom || '')));
      await db.saveRates({ tariffs: next });
      selectedTariffId = newTariff.id;
      await refreshGlobal();
      closeModal();
      toast('Ny tariff opprettet');
      onCreated();
    }

    const panel = el('div', {}, [
      el('h2', { class: 'modal-title' }, 'Ny tariff'),
      el('p', { class: 'small muted', style: { margin: '0 0 12px' } },
        'Kopierer alle satser fra "' + (sourceTariff.name || 'gjeldende tariff') + '". Du redigerer den nye etterpå.'),
      el('div', { class: 'form-group' }, [
        el('label', {}, 'Navn *'), nameIn,
      ]),
      el('div', { class: 'form-group' }, [
        el('label', {}, 'Gyldig fra *'),
        validFromIn,
      ]),
      el('div', { class: 'form-group' }, [
        el('label', {}, 'Gyldig til'),
        validToIn,
        el('p', { class: 'small muted', style: { margin: '4px 0 0' } },
          'Valgfritt. La stå tom hvis tariffen skal gjelde til en nyere overtar.'),
      ]),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => closeModal() }, 'Avbryt'),
        el('button', { class: 'btn', type: 'button', onclick: create }, 'Opprett'),
      ]),
    ]);
    openModal(panel);
    setTimeout(() => nameIn.focus(), 0);
  }

  async function renderAdmin() {
    const root = document.getElementById('view');
    document.getElementById('topbar').hidden = false;
    setTopbar({
      title: t('admin.title'),
      leftIcon: global.Timebok.chrome.ICONS.arrowBack,
      leftAction: () => global.Timebok.router.navigate('/week'),
      leftTitle: 'Tilbake',
    });

    if (!isAdmin()) {
      mount(root, el('div', { class: 'card' }, [
        el('h2', {}, 'Tilgang nektet'),
        el('p', { class: 'muted' }, 'Du må være administrator for å åpne dette panelet.'),
      ]));
      return;
    }

    const tabs = el('div', { class: 'tabs' }, [
      tabButton('projects', t('admin.projects')),
      tabButton('rates', t('admin.rates')),
    ]);

    const body = el('div', {});
    function refresh() { body.innerHTML = ''; body.appendChild(renderTab(activeTab)); }

    function tabButton(id, label) {
      const b = el('button', { class: 'tab' + (activeTab === id ? ' active' : '') }, label);
      b.addEventListener('click', () => {
        activeTab = id;
        tabs.querySelectorAll('.tab').forEach((tb) => tb.classList.remove('active'));
        b.classList.add('active');
        refresh();
      });
      return b;
    }

    mount(root, el('div', {}, [tabs, body]));
    refresh();
  }

  function renderTab(id) {
    if (id === 'projects') return renderProjects();
    if (id === 'rates') return renderAllRates();
    return el('div', {});
  }

  function renderAllRates() {
    // Re-rendrer hele Satser-fanen når brukeren bytter tariff (eller oppretter/
    // sletter) så alle felt viser verdier fra valgt tariff. Reisegodtgjørelse-
    // tabellen ligger nå INNE i Reise-gruppen som bygges av renderAllCodes(),
    // så den er ikke en separat seksjon her.
    const wrap = el('div', {});
    function build() {
      wrap.innerHTML = '';
      wrap.appendChild(renderTariffSelector(build));
      wrap.appendChild(renderAllCodes());
    }
    build();
    return wrap;
  }

  function renderProjects() {
    const state = getState();
    const list = state.projects.slice();

    // ---- New-project form ----
    const nameIn = el('input', { type: 'text', placeholder: t('admin.projectName') });
    const newZoneSel = el('select', {}, [el('option', { value: '' }, '0–7,5 km')].concat(
      TRAVEL_ZONES.map((z) => el('option', { value: z }, z + ' km'))
    ));
    const addBtn = el('button', { class: 'btn btn-block', onclick: async () => {
      const name = nameIn.value.trim();
      if (!name) return;
      list.push({ id: genId(), name, travelZone: newZoneSel.value || '' });
      await db.saveProjects(list);
      await refreshGlobal();
      nameIn.value = '';
      newZoneSel.value = '';
      toast(t('toast.saved'));
      renderAdmin();
    } }, '+ ' + t('admin.addProject'));

    const newCard = el('div', { class: 'card' }, [
      el('div', { class: 'form-row cols-2' }, [
        el('div', { class: 'form-group' }, [
          el('label', {}, t('admin.projectName')),
          nameIn,
        ]),
        el('div', { class: 'form-group' }, [
          el('label', {}, 'Reiseavstand'),
          newZoneSel,
        ]),
      ]),
      addBtn,
    ]);

    // ---- Existing project cards ----
    const cards = list.map((p, i) => buildProjectCard(p, i, list));

    return el('div', {}, [
      newCard,
      list.length
        ? el('div', { class: 'card mt-3 project-list' }, [
            el('div', { class: 'project-list-body' }, cards),
          ])
        : el('div', { class: 'card muted mt-3' }, 'Ingen prosjekter.'),
    ]);
  }

  function buildProjectCard(p, index, list) {
    const nameIn = el('input', { type: 'text', value: p.name });
    const zoneSel = el('select', {}, [el('option', { value: '' }, '0–7,5 km')].concat(
      TRAVEL_ZONES.map((z) => el('option', { value: z }, z + ' km'))
    ));
    zoneSel.value = p.travelZone || '';

    // Debounced auto-save when fields change.
    let saveTimer = null;
    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        list[index] = Object.assign({}, list[index], {
          name: nameIn.value.trim(),
          travelZone: zoneSel.value || '',
        });
        await db.saveProjects(list);
        await refreshGlobal();
      }, 500);
    }
    nameIn.addEventListener('input', scheduleSave);
    zoneSel.addEventListener('change', scheduleSave);

    const delBtn = el('button', {
      type: 'button', class: 'icon-btn project-row-del', title: t('common.delete'),
      onclick: async () => {
        const ok = await confirmModal(t('common.delete'), 'Slette "' + p.name + '"?', { okLabel: t('common.delete'), danger: true });
        if (!ok) return;
        clearTimeout(saveTimer);
        list.splice(index, 1);
        await db.saveProjects(list);
        await refreshGlobal();
        renderAdmin();
      },
      html: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6 L18 18 M6 18 L18 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>',
    });

    return el('div', { class: 'project-row' }, [
      nameIn,
      zoneSel,
      delBtn,
    ]);
  }

  function renderTravel() {
    const rates = getSelectedTariff();
    const inputs = { firmaBil: {}, privatBil: {} };

    const headerRow = el('div', { class: 'travel-row travel-row-head' }, [
      el('div', {}, 'Avstand'),
      el('div', { class: 'travel-col-head' }, 'Firma'),
      el('div', { class: 'travel-col-head' }, 'Privat'),
    ]);

    // Begge bedrifts-stiler bruker samme satser — stilen styrer kun HVORDAN
    // de summeres (Firesafe: første+siste×0,5; Damsgård: høyeste×1), ikke
    // tabell-verdiene selv.
    const r0 = normalizeRates(rates, { companyStyle: 'firesafe' });
    const zoneRows = TRAVEL_ZONES.map((z) => {
      const fbIn = el('input', { type: 'text', inputmode: 'decimal', value: displayNum(r0.travelRates.firmaBil[z]), class: 'travel-input' });
      const pbIn = el('input', { type: 'text', inputmode: 'decimal', value: displayNum(r0.travelRates.privatBil[z]), class: 'travel-input' });
      inputs.firmaBil[z] = fbIn;
      inputs.privatBil[z] = pbIn;
      return el('div', { class: 'travel-row' }, [
        el('div', { class: 'travel-zone-label' }, z + ' km'),
        fbIn,
        pbIn,
      ]);
    });

    // Shared flags: one setting applied to ALL 10 oppm. tillegg codes.
    // Use the firmaBil 7,5-15 code as the "source of truth" for the current
    // shared value; changes write to all travel-zone codes.
    const sample = resolveCodeFlags('oppm-fs-7-15', rates);
    const lnAll = el('input', { type: 'checkbox', checked: sample.wage });
    const fpAll = el('input', { type: 'checkbox', checked: sample.vacationPay });
    const txAll = el('input', { type: 'checkbox', checked: sample.taxable });
    const reAll = el('input', { type: 'checkbox', checked: sample.travel });
    const orgAll = el('input', { type: 'checkbox', checked: resolveCodeIsOrg('oppm-fs-7-15', rates) });

    const flagChip = (input, label, title) => el('label', {
      class: 'flag-chip', title: title || '',
    }, [input, el('span', {}, label)]);

    const flagsBlock = el('div', { class: 'travel-flags-row' }, [
      el('div', { class: 'travel-flags-label' }, 'Felles for alle oppm. tillegg'),
      el('div', { class: 'flag-chips' }, [
        flagChip(lnAll, 'Lønn', 'Genererer lønn'),
        flagChip(fpAll, 'Ferie', 'Tas med i feriepengegrunnlag'),
        flagChip(txAll, 'Skatt', 'Inngår i skattepliktig grunnlag'),
        flagChip(reAll, 'Reise', 'Vises i Reise-total'),
        flagChip(orgAll, 'Org', 'Organisert tariff (informativt for reise)'),
      ]),
    ]);

    let saveTimer = null;
    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const next = { firmaBil: {}, privatBil: {} };
        for (const tr of ['firmaBil', 'privatBil']) {
          for (const z of TRAVEL_ZONES) next[tr][z] = parseNum(inputs[tr][z].value);
        }
        // Propagate the shared flags + Org status to every travel-zone code.
        const cur = getSelectedTariff();
        const codeFlags = Object.assign({}, cur.codeFlags || {});
        const codeOrg = Object.assign({}, cur.codeOrg || {});
        const shared = { wage: lnAll.checked, vacationPay: fpAll.checked, taxable: txAll.checked, travel: reAll.checked };
        for (const c of CODES) {
          if (isTravelZoneCode(c)) {
            codeFlags[c.id] = Object.assign({}, codeFlags[c.id] || {}, shared);
            codeOrg[c.id] = orgAll.checked;
          }
        }
        // Felles satser for begge stiler — lagres på valgt tariff.
        await saveSelectedTariff({ travelRates: next, codeFlags, codeOrg });
      }, 500);
    }
    for (const tr of ['firmaBil', 'privatBil']) {
      for (const z of TRAVEL_ZONES) inputs[tr][z].addEventListener('input', scheduleSave);
    }
    [lnAll, fpAll, txAll, reAll, orgAll].forEach((cb) => cb.addEventListener('change', scheduleSave));

    // Returnerer en array som limes inn i Reise-gruppe-cardet i renderAllCodes.
    // Ingen ytre wrapper-card her — det leveres av group-cardet.
    return [
      el('div', { class: 'travel-table' }, [headerRow].concat(zoneRows)),
      flagsBlock,
    ];
  }

  function renderAllCodes() {
    // Two views of the same data:
    //   rates  — raw rates fra den valgte tariffen. Resolver helpers leser
    //            overrides (codeFlags, codeOrg, codeNames) direkte fra dette.
    //   r      — normalized travel/km/fixedCodes (defaults merged in).
    //
    // wageFactor og premie-% IKKE redigeres lenger via admin-UI — de er fast
    // bestemt av tariff/lov (1× timesats for Ordinære timer, 50/100% for
    // overtid). Eksisterende overrides i rates.wageFactors / rates.codePremiumPct
    // beholdes ved lagring (de merges inn uendret) men er ikke synlige i UI.
    const rates = getSelectedTariff();
    const r = normalizeRates(rates);
    const editableInputs = {};

    // Km-godtgjørelse is a Type B fixed rate.
    const kmInput = el('input', { type: 'text', inputmode: 'decimal', value: displayNum(r.kmRate) });

    // ---- Per-code inputs (collected across all groups) ----
    const flagInputs = {};
    const orgInputs = {};

    // Flag-chips: hver chip er en label med en skjult checkbox. CSS bruker
    // :has(input:checked) for å style den "på". Returnerer null hvis ALT er
    // disabled (meta-rate-rader uten meningsfulle flagg — da slipper vi
    // visuell støy fra 5 grå checkboxes).
    function codeFlagBoxes(c, opts) {
      opts = opts || {};
      const allDisabled = !!opts.disableAll;
      if (allDisabled) return null;

      const flags = resolveCodeFlags(c.id, rates);
      const reDisabled = !!opts.disableReise;
      const orgDisabled = !!opts.disableOrg;

      const mkCheck = (checked, disabled) => {
        const attrs = { type: 'checkbox', checked };
        if (disabled) attrs.disabled = true;
        return el('input', attrs);
      };
      const ln = mkCheck(flags.wage, false);
      const fp = mkCheck(flags.vacationPay, false);
      const tx = mkCheck(flags.taxable, false);
      const re = mkCheck(flags.travel, reDisabled);
      const org = mkCheck(resolveCodeIsOrg(c.id, rates), orgDisabled);

      flagInputs[c.id] = { ln, fp, tx, re };
      orgInputs[c.id] = org;

      const chip = (input, label, disabled, title) => el('label', {
        class: 'flag-chip' + (disabled ? ' is-disabled' : ''),
        title: title || '',
      }, [input, el('span', {}, label)]);

      return el('div', { class: 'flag-chips' }, [
        chip(ln, 'Lønn',  false, 'Genererer lønn'),
        chip(fp, 'Ferie', false, 'Tas med i feriepengegrunnlag'),
        chip(tx, 'Skatt', false, 'Inngår i skattepliktig grunnlag'),
        chip(re, 'Reise', reDisabled,
          reDisabled ? 'Ikke aktuell — global sats, ikke en registrert post'
                     : 'Vises i Reise-total (visuelt — kan dobbeltføres med Lønn)'),
        chip(org, 'Org',  orgDisabled,
          orgDisabled ? 'Ikke aktuell — Org-flagget gjelder kun for overtid-koder'
                      : 'Organisert tariff — bruker overtidsgrunnlag på OT-premien'),
      ]);
    }

    // Bygger én rate-rad:
    //   Editable:  [Navn] ──── [Input] [suffix]
    //              [chips]
    //   Read-only: [Navn]
    //              [Formel-tekst]
    //              [chips]
    //   Meta-rate (Feriepenger osv.):
    //              [Navn] ──── [Input] [%]
    //              [Beskrivelse]
    //              (ingen chips)
    function codeRow(c, opts) {
      opts = opts || {};
      const name = resolveCodeName(c.id, rates);
      const isReadOnly = !opts.input;

      const head = el('div', { class: 'rate-row-head' }, [
        el('span', { class: 'rate-row-name' }, name),
        isReadOnly ? null : el('div', { class: 'rate-row-value' }, [
          opts.input,
          opts.unit ? el('span', { class: 'rate-row-suffix' }, opts.unit) : null,
        ]),
      ]);

      const desc = isReadOnly && opts.readOnly
        ? el('div', { class: 'rate-row-formula' }, opts.readOnly)
        : (opts.description ? el('div', { class: 'rate-row-desc' }, opts.description) : null);

      const chips = codeFlagBoxes(c, opts.flagOpts);

      return el('div', { class: 'rate-row' + (isReadOnly ? ' is-readonly' : '') },
        [head, desc, chips].filter(Boolean));
    }

    // Bygger en meta-rate-rad (Feriepenger, Fagforening, Forsikring, Overtidsgrunnlag).
    // Identisk struktur som codeRow() men uten å gå gjennom code-katalogen —
    // tar nøkkel, navn, input, suffix og evt. flagOpts som parametre.
    function metaRow(opts) {
      const head = el('div', { class: 'rate-row-head' }, [
        el('span', { class: 'rate-row-name' }, opts.name),
        el('div', { class: 'rate-row-value' }, [
          opts.input,
          opts.suffix ? el('span', { class: 'rate-row-suffix' }, opts.suffix) : null,
        ]),
      ]);
      const desc = opts.description
        ? el('div', { class: 'rate-row-desc' }, opts.description)
        : null;
      const chips = opts.id ? codeFlagBoxes({ id: opts.id }, opts.flagOpts) : null;
      return el('div', { class: 'rate-row' }, [head, desc, chips].filter(Boolean));
    }

    // ---- Editor builder (kun for satser som faktisk endres med tariff) ----
    function fixedCodeInput(c) {
      const val = r.fixedCodes[c.id] != null ? r.fixedCodes[c.id] : 0;
      const inp = el('input', { type: 'text', inputmode: 'decimal', value: displayNum(val) });
      editableInputs[c.id] = inp;
      return inp;
    }

    // For hver kode: bestem om raden har sats-input eller bare info-tekst.
    // Lønnskoder med wageFactor 1.0 og overtidskoder med fast premie er
    // hardkodet av tariff/lov og vises som ren info — ingen redigerbar sats.
    function rowOptsFor(c) {
      const k = getCodeKind(c);
      if (k === 'wageFactor') {
        return { readOnly: 'Lønn × 1 (fast i tariff)' };
      }
      if (k === 'overtime') {
        const pct = resolveCodePremiumPct(c.id, rates);
        const isOrg = resolveCodeIsOrg(c.id, rates);
        const pctInt = Math.round(pct * 100);
        return isOrg
          ? { readOnly: 'Timesats + ' + pctInt + '% × overtidsgrunnlag (fast i tariff)' }
          : { readOnly: 'Timesats × ' + displayNum(1 + pct) + ' (fast i tariff)' };
      }
      if (k === 'hourlyAddon') return { unit: 'kr/time',             input: fixedCodeInput(c) };
      if (k === 'flat')        return { unit: 'kr per registrering', input: fixedCodeInput(c) };
      if (k === 'km')          return { unit: 'kr/km',               input: kmInput };
      if (k === 'variable')    return { readOnly: 'Skrives inn per registrering' };
      if (k === 'marker')      return { readOnly: 'Markering (ingen lønn)' };
      return {};
    }

    // ---- Grupperinger ----
    // Skiller mellom satser admin redigerer aktivt (tariff-bestemte) og
    // koder med faste regler (lønn × 1 / OT premie 50/100% / fravær). Sistnevnte
    // vises som info, og admin kan kun justere flagg (Lønn / Ferie / Skatt /
    // Reise) for å styre hvordan beløpet inngår i totalene. Oppm.-soner ligger
    // separat i Reisegodtgjørelse-tabellen og ekskluderes her.
    const groupDefs = [
      {
        key: 'reise',
        title: 'Reise',
        intro: 'Oppmøtetillegg (tabellen under) + km-godtgjørelse og reiseutgifter.',
        codeIds: ['km-godtgjorelse', 'reiseutgifter-bom'],
        // Spesial-rendering: legger reisegodtgjørelse-tabellen ØVERST i gruppe-
        // cardet (over rate-radene). Tabellen håndteres av renderTravel().
        prependContent: 'travel_table',
      },
      {
        key: 'tariff_addons',
        title: 'Tariff-bestemte tillegg',
        intro: 'Satsene endres med tariff-versjonen. Bytt tariff i velgeren over for å se historiske satser.',
        codeIds: [
          'bastillegg', 'smusstillegg-1', 'tilhengertillegg', 'passasjertillegg',
          'utenbystillegg-fagarb', 'utenbystillegg-u-fagbrev',
          'tarifftillegg-a121', 'opplaeringstillegg-ks',
          'overtidsmat-u12', 'overtidsmat-o12',
        ],
      },
      {
        key: 'variable',
        title: 'Variable beløp',
        intro: 'Beløp skrives inn per registrering — ingen fast sats lagres her.',
        codeIds: ['restakkord-belop'],
      },
      {
        key: 'work',
        title: 'Arbeid og overtid',
        intro: 'Faste lønnsregler fra tariff/lov — satsene kan ikke redigeres. Flagg styrer hvordan beløpet havner i totalene (Lønn / Ferie / Skatt / Reise).',
        codeIds: [
          'ordinaere-timer', 'reisetid', 'akkordtimer', 'kurs-oppl-mote',
          'tillitsvalgt-verneombud', 'vedlikehold-ikke-prosjekt',
          'overtid-50', 'overtid-50-org', 'overtid-100', 'overtid-100-org',
        ],
      },
      {
        key: 'absence',
        title: 'Fravær',
        intro: 'Lønnsbehandling fastsatt av tariff/lov. Flagg styrer hvordan beløpet inngår i totalene.',
        codeIds: [
          'permisjon-lonn-org', 'permisjon-lonn-uorg', 'fri-arb-avtale',
          'ferie', 'sykemelding', 'egenmelding', 'barns-sykdom',
          'offentlig-fridag', 'permisjon-uten-lonn',
        ],
      },
    ];

    const groupedRows = groupDefs.map((g) => ({ ...g, rows: [] }));
    const codeIdToGroup = new Map();
    for (const g of groupedRows) {
      for (const id of g.codeIds) codeIdToGroup.set(id, g);
    }
    for (const c of CODES) {
      if (getCodeKind(c) === 'zone') continue; // Oppm. tillegg lives in Reisegodtgjørelse table.
      const target = codeIdToGroup.get(c.id);
      if (!target) continue;
      target.rows.push(codeRow(c, rowOptsFor(c)));
    }

    // ---- Trekk, sosiale poster og tariff-tillegg ----
    // Drives the Periode-totaler (matches the right-hand column of the Visma
    // payslip). Org-tillegg is folded in here so all rate-config lives in one
    // place; admin can adjust if union/tariff changes.
    const vacRate = (rates && rates.vacationPayRate != null) ? rates.vacationPayRate : 0.12;
    const uniRate = (rates && rates.unionDuesRate != null) ? rates.unionDuesRate : 0.018;
    const insAmt  = (rates && rates.monthlyInsurance != null) ? rates.monthlyInsurance : 99.33;
    const vacationPayInput = el('input', {
      type: 'text', inputmode: 'decimal',
      value: displayNum(Math.round(vacRate * 1000) / 10),
      'aria-label': 'Feriepenger-prosent',
    });
    const unionDuesInput = el('input', {
      type: 'text', inputmode: 'decimal',
      value: displayNum(Math.round(uniRate * 10000) / 100),
      'aria-label': 'Fagforening-prosent',
    });
    const insuranceInput = el('input', {
      type: 'text', inputmode: 'decimal',
      value: displayNum(insAmt),
      'aria-label': 'Innberetningspliktig forsikring per måned',
    });
    const overtidsgrunnlagInput = el('input', {
      type: 'text', inputmode: 'decimal',
      value: displayNum(resolveOvertidsgrunnlag(rates)),
      'aria-label': 'Overtidsgrunnlag per OT-time',
    });
    const trekkSection = el('section', { class: 'card code-group' }, [
      el('h3', { class: 'code-group-title' }, 'Trekk og sosiale poster'),
      el('div', { class: 'rate-rows' }, [
        metaRow({
          id: 'rate.feriepenger',
          name: 'Feriepenger',
          input: vacationPayInput,
          suffix: '%',
          description: 'av feriepengegrunnlag',
          flagOpts: { disableAll: true },
        }),
        metaRow({
          id: 'rate.fagforening',
          name: 'Fagforening',
          input: unionDuesInput,
          suffix: '%',
          description: 'av feriepengegrunnlag',
          flagOpts: { disableAll: true },
        }),
        metaRow({
          id: 'rate.forsikring',
          name: 'Forsikring',
          input: insuranceInput,
          suffix: 'kr/mnd',
          description: 'Flagg styrer hvilke totaler det går inn i',
          flagOpts: { disableOrg: true, disableReise: true },
        }),
        metaRow({
          id: 'rate.overtidsgrunnlag',
          name: 'Overtidsgrunnlag',
          input: overtidsgrunnlagInput,
          suffix: 'kr/t',
          description: 'Base for Org-OT: timesats + grunnlag × premie-%',
          flagOpts: { disableAll: true },
        }),
      ]),
    ]);

    // Debounced auto-save on any editable input or flag change.
    let saveTimer = null;
    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const cur = getSelectedTariff();
        const next = {};
        for (const id in editableInputs) next[id] = parseNum(editableInputs[id].value);
        // Merge with existing so we don't wipe oppm-code flags managed in
        // the Reisegodtgjørelse table.
        const codeFlags = Object.assign({}, cur.codeFlags || {});
        for (const id in flagInputs) {
          codeFlags[id] = {
            wage: flagInputs[id].ln.checked,
            vacationPay: flagInputs[id].fp.checked,
            taxable: flagInputs[id].tx.checked,
            travel: flagInputs[id].re.checked,
          };
        }
        const codeOrg = Object.assign({}, cur.codeOrg || {});
        for (const id in orgInputs) codeOrg[id] = orgInputs[id].checked;
        // wageFactors / codePremiumPct / codeNames beholdes uendret — UI
        // tillater ikke lenger redigering av disse, men eksisterende
        // tariff-overrides skal ikke nullstilles ved save.
        const wageFactors = Object.assign({}, cur.wageFactors || {});
        const codePremiumPct = Object.assign({}, cur.codePremiumPct || {});
        const codeNames = Object.assign({}, cur.codeNames || {});
        const overtidsgrunnlag = parseNum(overtidsgrunnlagInput.value);
        const vacPct = parseNum(vacationPayInput.value);
        const uniPct = parseNum(unionDuesInput.value);
        const insVal = parseNum(insuranceInput.value);
        await saveSelectedTariff({
          kmRate: parseNum(kmInput.value),
          fixedCodes: next,
          codeFlags, codeOrg,
          wageFactors, codePremiumPct, codeNames,
          overtidsgrunnlag: isFinite(overtidsgrunnlag) ? overtidsgrunnlag : 332.31,
          vacationPayRate: isFinite(vacPct) ? vacPct / 100 : 0.12,
          unionDuesRate:   isFinite(uniPct) ? uniPct / 100 : 0.018,
          monthlyInsurance: isFinite(insVal) ? insVal : 99.33,
        });
      }, 500);
    }
    kmInput.addEventListener('input', scheduleSave);
    for (const id in editableInputs) editableInputs[id].addEventListener('input', scheduleSave);
    for (const id in orgInputs) orgInputs[id].addEventListener('change', scheduleSave);
    overtidsgrunnlagInput.addEventListener('input', scheduleSave);
    vacationPayInput.addEventListener('input', scheduleSave);
    unionDuesInput.addEventListener('input', scheduleSave);
    insuranceInput.addEventListener('input', scheduleSave);
    for (const id in flagInputs) {
      flagInputs[id].ln.addEventListener('change', scheduleSave);
      flagInputs[id].fp.addEventListener('change', scheduleSave);
      flagInputs[id].tx.addEventListener('change', scheduleSave);
      flagInputs[id].re.addEventListener('change', scheduleSave);
    }

    // Bygger ett card per gruppe. Spesial-handling: Reise-gruppen får
    // reisegodtgjørelse-tabellen lagt øverst (over km/reiseutgifter-radene).
    function renderGroupCard(g) {
      const children = [
        el('div', { class: 'code-group-title' }, g.title),
        g.intro ? el('p', { class: 'small muted code-group-intro' }, g.intro) : null,
      ];
      if (g.prependContent === 'travel_table') {
        // renderTravel returnerer nå en array av nodes (tabell + felles-flagg).
        const travelNodes = renderTravel();
        travelNodes.forEach((n) => children.push(n));
      }
      if (g.rows.length) {
        children.push(el('div', {
          class: 'rate-rows' + (g.prependContent ? ' rate-rows-after-block' : ''),
        }, g.rows));
      }
      return el('section', { class: 'card code-group' }, children.filter(Boolean));
    }

    return el('div', {}, [
      trekkSection,
      ...groupedRows.filter((g) => g.rows.length || g.prependContent).map(renderGroupCard),
    ]);
  }

  function genId() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.views = global.Timebok.views || {};
  global.Timebok.views.admin = { renderAdmin };
})(window);
