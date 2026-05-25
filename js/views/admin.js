(function (global) {
  const { el, mount, toast, confirmModal } = global.Timebok.dom;
  const { t } = global.Timebok.i18n;
  const { db } = global.Timebok.data;
  const { get: getState, refreshGlobal, isAdmin } = global.Timebok.state;
  const { TRAVEL_ZONES, CODES, isTravelZoneCode, resolveCodeFlags, resolveWageFactor, resolveCodeIsOrg, resolveCodePremiumPct, resolveOrgPremiumAddOn, resolveCodeName, getCodeKind } = global.Timebok.codes;
  const { normalizeRates } = global.Timebok.calc;
  const { parseNum, displayNum } = global.Timebok.dateUtils;
  function setTopbar(opts) { global.Timebok.chrome.setTopbar(opts); }

  let activeTab = 'projects';

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
    return el('div', {}, [
      sectionHeader(t('admin.travelRates')),
      renderTravel(),
      sectionHeader('Alle tilleggskoder'),
      renderAllCodes(),
    ]);
  }

  function sectionHeader(label) {
    return el('h3', { class: 'section-header' }, label);
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
    const rates = getState().rates || {};
    const inputs = { firmaBil: {}, privatBil: {} };
    // Editing-state: which stil sine satser viser/redigerer vi nå?
    // Defaulter til admins egen profil-stil.
    let editStyle = (getState().profile && getState().profile.companyStyle) || 'firesafe';

    // Per-style toggle. Bytter hvilke satser som vises i tabellen og
    // hvilken bucket scheduleSave skriver til.
    function styleBtn(value, label) {
      return el('button', { type: 'button', class: 'style-toggle-btn', 'data-style': value, onclick: () => {
        if (editStyle === value) return;
        editStyle = value;
        updateToggle();
        loadRatesIntoInputs();
      } }, label);
    }
    const btnFiresafe = styleBtn('firesafe', 'Firesafe');
    const btnDamsgard = styleBtn('damsgard', 'Damsgård');
    function updateToggle() {
      btnFiresafe.classList.toggle('active', editStyle === 'firesafe');
      btnDamsgard.classList.toggle('active', editStyle === 'damsgard');
    }
    updateToggle();
    const styleToggle = el('div', { class: 'style-toggle' }, [btnFiresafe, btnDamsgard]);

    const headerRow = el('div', { class: 'travel-row travel-row-head' }, [
      el('div', {}, 'Avstand'),
      el('div', { class: 'travel-col-head' }, 'Firma'),
      el('div', { class: 'travel-col-head' }, 'Privat'),
    ]);

    function loadRatesIntoInputs() {
      const r = normalizeRates(getState().rates || {}, { companyStyle: editStyle });
      for (const z of TRAVEL_ZONES) {
        if (inputs.firmaBil[z]) inputs.firmaBil[z].value = displayNum(r.travelRates.firmaBil[z]);
        if (inputs.privatBil[z]) inputs.privatBil[z].value = displayNum(r.travelRates.privatBil[z]);
      }
    }

    // Initial load with profile-default style.
    const r0 = normalizeRates(rates, { companyStyle: editStyle });
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

    const flagsBlock = el('div', { class: 'travel-flags-row' }, [
      el('div', { class: 'travel-flags-label' }, 'Felles for alle oppm. tillegg'),
      el('div', { class: 'code-flags' }, [
        el('label', { class: 'code-flag', title: 'Genererer lønn' }, [lnAll, el('span', {}, 'Lønn')]),
        el('label', { class: 'code-flag', title: 'Tas med i feriepengegrunnlag' }, [fpAll, el('span', {}, 'Ferie')]),
        el('label', { class: 'code-flag', title: 'Inngår i skattepliktig grunnlag' }, [txAll, el('span', {}, 'Skatt')]),
        el('label', { class: 'code-flag', title: 'Vises i Reise-total (visuelt — kan dobbeltføres med Lønn)' },
          [reAll, el('span', {}, 'Reise')]),
        el('label', { class: 'code-flag', title: 'Organisert tariff (informativt for reise — påvirker ikke beregningen)' },
          [orgAll, el('span', {}, 'Org')]),
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
        const cur = (getState().rates) || {};
        const codeFlags = Object.assign({}, cur.codeFlags || {});
        const codeOrg = Object.assign({}, cur.codeOrg || {});
        const shared = { wage: lnAll.checked, vacationPay: fpAll.checked, taxable: txAll.checked, travel: reAll.checked };
        for (const c of CODES) {
          if (isTravelZoneCode(c)) {
            codeFlags[c.id] = Object.assign({}, codeFlags[c.id] || {}, shared);
            codeOrg[c.id] = orgAll.checked;
          }
        }
        // Per-style save: kun bucket for valgt editStyle endres. Legacy
        // `travelRates` beholdes for backward-compat (calc.js fall-backs til
        // den om en stil-bucket mangler).
        const travelRatesByStyle = Object.assign({}, cur.travelRatesByStyle || {});
        travelRatesByStyle[editStyle] = next;
        await db.saveRates({ travelRatesByStyle, codeFlags, codeOrg });
        await refreshGlobal();
      }, 500);
    }
    for (const tr of ['firmaBil', 'privatBil']) {
      for (const z of TRAVEL_ZONES) inputs[tr][z].addEventListener('input', scheduleSave);
    }
    [lnAll, fpAll, txAll, reAll, orgAll].forEach((cb) => cb.addEventListener('change', scheduleSave));

    return el('div', { class: 'card' }, [
      el('p', { class: 'small muted', style: { margin: '0 0 8px' } },
        'Velg hvilken bedrifts-stil du redigerer satser for. Hver stil har sine egne priser.'),
      styleToggle,
      el('div', { class: 'travel-table mt-2' }, [headerRow].concat(zoneRows)),
      flagsBlock,
    ]);
  }

  function renderAllCodes() {
    // Two views of the same data:
    //   rates  — raw rates from state. Resolver helpers read overrides from
    //            this (codeFlags, codeOrg, wageFactors, codePremiumPct,
    //            orgPremiumAddOn) — normalizeRates() does not include them.
    //   r      — normalized travel/km/fixedCodes (defaults merged in).
    const rates = getState().rates || {};
    const r = normalizeRates(rates);
    const editableInputs = {};

    // Km-godtgjørelse is a Type B fixed rate.
    const kmInput = el('input', { type: 'text', inputmode: 'decimal', value: displayNum(r.kmRate) });

    // ---- Per-code inputs (collected across all groups) ----
    const flagInputs = {};
    const orgInputs = {};
    const nameInputs = {};
    const wageFactorInputs = {};
    const premiumPctInputs = {};

    function codeFlagBoxes(c, opts) {
      opts = opts || {};
      const flags = resolveCodeFlags(c.id, rates);
      const allDisabled = !!opts.disableAll;
      const reDisabled = allDisabled || !!opts.disableReise;
      const orgDisabled = allDisabled || !!opts.disableOrg;
      const mkBox = (checked, disabled) => {
        const attrs = { type: 'checkbox', checked };
        if (disabled) attrs.disabled = true;
        return el('input', attrs);
      };
      const ln = mkBox(flags.wage, allDisabled);
      const fp = mkBox(flags.vacationPay, allDisabled);
      const tx = mkBox(flags.taxable, allDisabled);
      const re = mkBox(flags.travel, reDisabled);
      flagInputs[c.id] = { ln, fp, tx, re };
      const org = mkBox(resolveCodeIsOrg(c.id, rates), orgDisabled);
      orgInputs[c.id] = org;
      const rateOnlyTitle = 'Ikke aktuell — dette er en sats/modifikator, ikke et beløp. Flagging skjer på selve OT/kode-radene.';
      const flagLabel = (cb, label, disabled, title) => el(
        'label',
        { class: 'code-flag' + (disabled ? ' is-disabled' : ''), title: title || '' },
        [cb, el('span', {}, label)]
      );
      return el('div', { class: 'code-flags' }, [
        flagLabel(ln, 'Lønn',  allDisabled, allDisabled ? rateOnlyTitle : 'Genererer lønn'),
        flagLabel(fp, 'Ferie', allDisabled, allDisabled ? rateOnlyTitle : 'Tas med i feriepengegrunnlag'),
        flagLabel(tx, 'Skatt', allDisabled, allDisabled ? rateOnlyTitle : 'Inngår i skattepliktig grunnlag'),
        flagLabel(re, 'Reise', reDisabled, reDisabled
          ? (allDisabled ? rateOnlyTitle : 'Ikke aktuell — dette er en global sats, ikke en registrert post')
          : 'Vises i Reise-total (visuelt — kan dobbeltføres med Lønn)'),
        flagLabel(org, 'Org', orgDisabled, orgDisabled
          ? (allDisabled ? rateOnlyTitle : 'Ikke aktuell — Org-flagget driver kun OT-premie-beregningen på faktiske OT-koder')
          : 'Organisert tariff — bruker globalt Org-tillegg på premie-beregningen (kun aktiv for overtid-koder)'),
      ]);
    }

    function codeRow(c, opts) {
      opts = opts || {};
      const nameIn = el('input', {
        type: 'text',
        value: resolveCodeName(c.id, rates),
        class: 'code-name-input',
        'aria-label': 'Navn for ' + c.id,
      });
      nameInputs[c.id] = nameIn;
      // ReadOnly rows (variable, marker) have no value input — put their
      // descriptive text in the wide unit slot so it doesn't wrap inside
      // the narrow 90px input column.
      const isReadOnly = !opts.input;
      const infoText = isReadOnly ? (opts.readOnly || '') : (opts.unit || '');
      return el('div', { class: 'rate-row rate-row-with-flags' + (isReadOnly ? ' rate-row-readonly' : '') }, [
        el('div', { class: 'rate-row-name' }, [nameIn]),
        el('div', { class: 'rate-row-info' }, [
          el('div', { class: 'rate-row-unit' }, infoText),
        ]),
        isReadOnly ? null : el('div', { class: 'rate-row-input' }, opts.input),
        codeFlagBoxes(c),
      ]);
    }

    // ---- Editor builders per kind ----
    function factorInput(c) {
      const factor = resolveWageFactor(c.id, rates);
      const inp = el('input', {
        type: 'text', inputmode: 'decimal',
        value: displayNum(factor),
        'aria-label': 'Lønnsfaktor for ' + c.id,
      });
      wageFactorInputs[c.id] = inp;
      return inp;
    }
    function premiumPctInput(c) {
      const pct = resolveCodePremiumPct(c.id, rates);
      const inp = el('input', {
        type: 'text', inputmode: 'decimal',
        value: displayNum(Math.round(pct * 100 * 100) / 100),
        'aria-label': 'Premie-prosent for ' + c.id,
      });
      premiumPctInputs[c.id] = inp;
      return inp;
    }
    function fixedCodeInput(c) {
      const val = r.fixedCodes[c.id] != null ? r.fixedCodes[c.id] : 0;
      const inp = el('input', { type: 'text', inputmode: 'decimal', value: displayNum(val) });
      editableInputs[c.id] = inp;
      return inp;
    }

    // ---- Purpose-based grouping ----
    // Each code is placed in a user-facing purpose group (arbeid / tillegg /
    // reise / fravær). The editor for each row is picked from the code's
    // calculation kind (wageFactor / overtime / hourlyAddon / flat / km /
    // variable / marker). Oppm.-zone codes live in the travel-rates table.
    const groupDefs = [
      { key: 'arbeid',  title: 'Arbeid og overtid' },
      { key: 'tillegg', title: 'Tillegg per arbeidet time' },
      { key: 'reise',   title: 'Reise og refusjon' },
      { key: 'fravaer', title: 'Fravær' },
    ];

    // code id → purpose group. Codes not listed default to 'arbeid'.
    const purposeOf = {
      // arbeid og overtid
      'ordinaere-timer':          'arbeid',
      'ordinaere-timer-btb':      'arbeid',
      'overtid-50':               'arbeid',
      'overtid-50-org':           'arbeid',
      'overtid-100':              'arbeid',
      'overtid-100-org':          'arbeid',
      'reisetid':                 'arbeid',
      'akkordtimer':              'arbeid',
      'kurs-oppl-mote':           'arbeid',
      'tillitsvalgt-verneombud':  'arbeid',
      'vedlikehold-ikke-prosjekt':'arbeid',
      'overtidsmat-u12':          'arbeid',
      'overtidsmat-o12':          'arbeid',
      // tillegg
      'bastillegg':               'tillegg',
      'smusstillegg-1':           'tillegg',
      'tilhengertillegg':         'tillegg',
      'passasjertillegg':         'tillegg',
      'utenbystillegg-fagarb':    'tillegg',
      'utenbystillegg-u-fagbrev': 'tillegg',
      'tarifftillegg-a121':       'tillegg',
      'opplaeringstillegg-ks':    'tillegg',
      // reise og refusjon
      'km-godtgjorelse':          'reise',
      'reiseutgifter-bom':        'reise',
      'restakkord-belop':         'reise',
      // fravær
      'permisjon-lonn-org':       'fravaer',
      'permisjon-lonn-uorg':      'fravaer',
      'fri-arb-avtale':           'fravaer',
      'ferie':                    'fravaer',
      'sykemelding':              'fravaer',
      'egenmelding':              'fravaer',
      'barns-sykdom':             'fravaer',
      'offentlig-fridag':         'fravaer',
      'permisjon-uten-lonn':      'fravaer',
    };

    // editor kind → {unit, readOnly, renderInput}. One row's editor type is
    // independent of which purpose group it's rendered under.
    const editorByKind = {
      wageFactor:  { unit: 'Timesats × faktor',       renderInput: factorInput },
      overtime:    { unit: 'Premie-% (av timelønn)',  renderInput: premiumPctInput },
      hourlyAddon: { unit: 'kr/time',                 renderInput: fixedCodeInput },
      flat:        { unit: 'kr per registrering',     renderInput: fixedCodeInput },
      km:          { unit: 'kr/km',                   renderInput: () => kmInput },
      variable:    { readOnly: 'Skrives inn per registrering' },
      marker:      { readOnly: 'Markering (ingen lønn)' },
    };

    const groupedRows = groupDefs.map((g) => ({ ...g, rows: [] }));
    for (const c of CODES) {
      const k = getCodeKind(c);
      if (k === 'zone') continue; // Oppm. tillegg lives in Reisegodtgjørelse table.
      const purpose = purposeOf[c.id] || 'arbeid';
      const target = groupedRows.find((g) => g.key === purpose);
      if (!target) continue;
      const ed = editorByKind[k] || {};
      const opts = { unit: ed.unit, readOnly: ed.readOnly };
      if (ed.renderInput) opts.input = ed.renderInput(c);
      target.rows.push(codeRow(c, opts));
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
    const orgAddOnInput = el('input', {
      type: 'text', inputmode: 'decimal',
      value: displayNum(resolveOrgPremiumAddOn(rates)),
      'aria-label': 'Org-tillegg per OT-time',
    });
    const trekkSection = el('div', { class: 'card', style: { marginBottom: '12px' } }, [
      el('h3', { class: 'card-title mb-2' }, 'Trekk og sosiale poster'),
      el('div', { class: 'rate-row rate-row-with-flags' }, [
        el('div', { class: 'rate-row-name' }, 'Feriepenger'),
        el('div', { class: 'rate-row-info' }, [
          el('div', { class: 'rate-row-unit' }, '% av feriepengegrunnlag'),
        ]),
        el('div', { class: 'rate-row-input' }, vacationPayInput),
        codeFlagBoxes({ id: 'rate.feriepenger' }, { disableAll: true }),
      ]),
      el('div', { class: 'rate-row rate-row-with-flags' }, [
        el('div', { class: 'rate-row-name' }, 'Fagforening'),
        el('div', { class: 'rate-row-info' }, [
          el('div', { class: 'rate-row-unit' }, '% av feriepengegrunnlag'),
        ]),
        el('div', { class: 'rate-row-input' }, unionDuesInput),
        codeFlagBoxes({ id: 'rate.fagforening' }, { disableAll: true }),
      ]),
      el('div', { class: 'rate-row rate-row-with-flags' }, [
        el('div', { class: 'rate-row-name' }, 'Forsikring'),
        el('div', { class: 'rate-row-info' }, [
          el('div', { class: 'rate-row-unit' }, 'kr/mnd — flagg styrer hvilke totaler det går inn i'),
        ]),
        el('div', { class: 'rate-row-input' }, insuranceInput),
        codeFlagBoxes({ id: 'rate.forsikring' }, { disableOrg: true, disableReise: true }),
      ]),
      el('div', { class: 'rate-row rate-row-with-flags' }, [
        el('div', { class: 'rate-row-name' }, 'Org-tillegg per 100% OT'),
        el('div', { class: 'rate-row-info' }, [
          el('div', { class: 'rate-row-unit' }, 'kr/t (skalerer × premie-%: OT-50 = halvparten)'),
        ]),
        el('div', { class: 'rate-row-input' }, orgAddOnInput),
        codeFlagBoxes({ id: 'rate.orgaddon' }, { disableAll: true }),
      ]),
    ]);

    // Debounced auto-save on any editable input or flag change.
    let saveTimer = null;
    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const cur = (getState().rates) || {};
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
        const wageFactors = Object.assign({}, cur.wageFactors || {});
        for (const id in wageFactorInputs) {
          const parsed = parseNum(wageFactorInputs[id].value);
          if (isFinite(parsed) && parsed > 0) wageFactors[id] = parsed;
        }
        const codePremiumPct = Object.assign({}, cur.codePremiumPct || {});
        for (const id in premiumPctInputs) {
          const parsed = parseNum(premiumPctInputs[id].value);
          if (isFinite(parsed) && parsed >= 0) codePremiumPct[id] = parsed / 100;
        }
        const codeNames = Object.assign({}, cur.codeNames || {});
        for (const id in nameInputs) {
          const v = (nameInputs[id].value || '').trim();
          if (v) codeNames[id] = v; else delete codeNames[id];
        }
        const orgPremiumAddOn = parseNum(orgAddOnInput.value);
        const vacPct = parseNum(vacationPayInput.value);
        const uniPct = parseNum(unionDuesInput.value);
        const insVal = parseNum(insuranceInput.value);
        await db.saveRates({
          kmRate: parseNum(kmInput.value),
          fixedCodes: next,
          codeFlags, codeOrg,
          wageFactors, codePremiumPct, codeNames,
          orgPremiumAddOn: isFinite(orgPremiumAddOn) ? orgPremiumAddOn : 0,
          vacationPayRate: isFinite(vacPct) ? vacPct / 100 : 0.12,
          unionDuesRate:   isFinite(uniPct) ? uniPct / 100 : 0.018,
          monthlyInsurance: isFinite(insVal) ? insVal : 99.33,
        });
        await refreshGlobal();
      }, 500);
    }
    kmInput.addEventListener('input', scheduleSave);
    for (const id in editableInputs) editableInputs[id].addEventListener('input', scheduleSave);
    for (const id in wageFactorInputs) wageFactorInputs[id].addEventListener('input', scheduleSave);
    for (const id in premiumPctInputs) premiumPctInputs[id].addEventListener('input', scheduleSave);
    for (const id in nameInputs) nameInputs[id].addEventListener('input', scheduleSave);
    for (const id in orgInputs) orgInputs[id].addEventListener('change', scheduleSave);
    orgAddOnInput.addEventListener('input', scheduleSave);
    vacationPayInput.addEventListener('input', scheduleSave);
    unionDuesInput.addEventListener('input', scheduleSave);
    insuranceInput.addEventListener('input', scheduleSave);
    for (const id in flagInputs) {
      flagInputs[id].ln.addEventListener('change', scheduleSave);
      flagInputs[id].fp.addEventListener('change', scheduleSave);
      flagInputs[id].tx.addEventListener('change', scheduleSave);
      flagInputs[id].re.addEventListener('change', scheduleSave);
    }

    return el('div', {}, [
      trekkSection,
      ...groupedRows.filter((g) => g.rows.length).map(groupBlock),
    ]);
  }

  function groupBlock(g) {
    return el('div', { class: 'card code-group' }, [
      el('div', { class: 'code-group-title' }, g.title),
      g.intro ? el('p', { class: 'small muted code-group-intro' }, g.intro) : null,
      el('div', { class: 'rate-rows' }, g.rows),
    ]);
  }

  function genId() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.views = global.Timebok.views || {};
  global.Timebok.views.admin = { renderAdmin };
})(window);
