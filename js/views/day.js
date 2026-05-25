// Day view: edit ALL registrations for a date on a single page.
//
// Each registration becomes an editable card. User can add more via
// "+ Legg til prosjekt", delete individual cards, and save everything
// via a single "Lagre alle" button. Day totals shown at the bottom.

(function (global) {
  const { el, mount, toast, openModal, closeModal, confirmModal } = global.Timebok.dom;
  const { t, getLang } = global.Timebok.i18n;
  const { db, storage } = global.Timebok.data;
  const { get: getState } = global.Timebok.state;
  const { CODES, getCode, isTravelZoneCode, travelZoneCodeId, TRAVEL_ZONES, resolveCodeName } = global.Timebok.codes;
  const { refreshGlobal } = global.Timebok.state;
  const { calcRegistration, calcDayTravel, sumDayReceipts } = global.Timebok.calc;
  const { fromISODate, toISODate, addDays, formatHours, formatMoney, sameDay, parseNum, displayNum } = global.Timebok.dateUtils;
  const { navigate } = global.Timebok.router;
  const { openClockPicker } = global.Timebok.clockPicker;
  const openTimePicker = openClockPicker;
  function setTopbar(opts) { global.Timebok.chrome.setTopbar(opts); }

  // ---- Wheel-field component ----
  // Third arg can be a formatter (legacy) or an opts object { formatter, placeholder }.
  function wheelField(initial, opener, opts) {
    if (typeof opts === 'function') opts = { formatter: opts };
    opts = opts || {};
    const formatter = opts.formatter || ((v) => v);
    const placeholder = opts.placeholder || 'Velg';
    let value = initial == null ? '' : initial;
    const valueSpan = el('span', { class: 'wheel-field-value' });
    const btn = el('button', { type: 'button', class: 'wheel-field' }, [
      valueSpan,
      el('span', { class: 'wheel-field-caret' }, '▾'),
    ]);
    function refresh() {
      if (value === '' || value == null) {
        valueSpan.textContent = placeholder;
        valueSpan.classList.add('is-placeholder');
      } else {
        valueSpan.textContent = formatter(value);
        valueSpan.classList.remove('is-placeholder');
      }
    }
    refresh();
    btn.addEventListener('click', async () => {
      const picked = await opener(value);
      if (picked == null) return; // Cancel
      if (picked !== value) {
        value = picked;
        refresh();
      }
      // Always fire change so consumers can recompute even when value
      // didn't actually change (e.g. user opens picker, clicks OK).
      btn.dispatchEvent(new Event('change'));
    });
    Object.defineProperty(btn, 'value', {
      get() { return value; },
      set(v) { value = v == null ? '' : v; refresh(); },
    });
    return btn;
  }

  // Validation result: null if valid, otherwise { fields, message }
  //
  // The card is valid when:
  //   - at least one code has hours > 0 (or an amount > 0 for variable codes),
  //     AND
  //   - if any of those codes need a project (i.e. lack noProject), a project
  //     is selected.
  function validateDraft(d) {
    const codes = (d.codes || []).filter((c) => !c.auto);
    const codesWithValue = codes.filter((c) => {
      const def = getCode(c.codeId);
      if (!def) return false;
      if (def.type === 'A' || (def.type === 'B' && def.meta === 'hourlyAddon') || def.noProject) {
        return (Number(c.hours) || 0) > 0;
      }
      if (def.id === 'km-godtgjorelse') return (Number(c.km) || 0) > 0;
      if (def.type === 'C') return (Number(c.amount) || 0) > 0;
      return false; // flat / auto / marker without entry
    });

    const fields = {};
    const missing = [];

    if (codesWithValue.length === 0) {
      return { fields, message: 'Legg til en tilleggskode med timer/beløp' };
    }

    const needsProject = codesWithValue.some((c) => {
      const def = getCode(c.codeId);
      return def && !def.noProject;
    });
    if (needsProject && !d.projectId) {
      fields.projectId = true;
      missing.push('prosjekt');
    }

    if (missing.length === 0) return null;
    return { fields, message: 'Mangler: ' + missing.join(', ') };
  }

  // Legacy-hours migration is the calc.js version — same idempotent helper
  // used by every consumer (week, period, exports).
  const migrateLegacyHours = global.Timebok.calc.migrateLegacyHours;

  // ---- New empty registration ----
  // Empty card has no codes. "Ordinære timer" is auto-added the moment the
  // user picks a project (see readForm) — most common case is a normal
  // workday, so we don't make the user click +Legg til kode for it.
  function newEmptyReg(date) {
    const profile = getState().profile || {};
    return {
      date,
      projectId: '',
      transport: profile.defaultTransport || 'firmaBil',
      travelZone: '',
      codes: [],
      receipts: [],
    };
  }

  // ---- Main render ----
  async function renderDay(ctx) {
    const root = document.getElementById('view');
    document.getElementById('topbar').hidden = false;
    const state = getState();
    const dateISO = ctx.match.date;

    mount(root, el('div', { class: 'muted' }, t('common.loading')));

    const [existing, dayReceiptsInitial] = await Promise.all([
      db.listRegistrations(state.user.id, { from: dateISO, to: dateISO }),
      db.getDayReceipts(state.user.id, dateISO),
    ]);

    // Mutable list of drafts. If there are no registrations yet, start with one empty.
    const drafts = existing.length
      ? existing.map((r) => {
          const d = migrateLegacyHours(Object.assign(newEmptyReg(dateISO), r));
          // Migration: legacy regs without noTravel-field men med travelZone
          // skal vise pseudo-raden. Sett til eksplisitt false.
          if (d.noTravel === undefined && d.travelZone) d.noTravel = false;
          return d;
        })
      : [newEmptyReg(dateISO)];

    // Day-level receipts (merged with any legacy receipts found on registrations
    // for one-time migration so users don't lose data).
    let dayReceipts = dayReceiptsInitial.slice();
    for (const r of drafts) {
      if (r.receipts && r.receipts.length) {
        dayReceipts = dayReceipts.concat(r.receipts);
        r.receipts = [];
      }
    }

    const cardsContainer = el('div', { class: 'reg-cards' });
    const receiptsContainer = el('div', { class: 'mt-2' });
    const totalsBox = el('div', { class: 'card day-totals-card' });

    function renderTotals() {
      const lang = getLang();
      const dayTravel = calcDayTravel(drafts, state.profile, state.rates);
      let totalHours = 0, totalWage = 0;
      for (const d of drafts) {
        const c = calcRegistration(d, state.profile, state.rates);
        for (const cb of c.codeBreakdown) if (cb.hours) totalHours += cb.hours;
        totalWage += c.wage;
      }
      const totalReceipts = sumDayReceipts(dayReceipts);
      const profileStyle = (state.profile && state.profile.companyStyle) || 'firesafe';
      const styleLabel = profileStyle === 'damsgard' ? 'Damsgård' : 'Firesafe';
      totalsBox.innerHTML = '';
      totalsBox.appendChild(el('div', {}, [
        el('div', { class: 'totals-card-head' }, [
          el('h3', { class: 'card-title' }, 'Dagens totaler'),
          el('span', { class: 'totals-style-badge', title: 'Reisegodtgjørelse-stil fra profil — endre på Profilside' }, styleLabel),
        ]),
        // Samme felt og rekkefølge som dag-kort i periodevisning, så bruker
        // mentalt mapper "én dag = ett kort" på tvers av visningene.
        el('div', { class: 'period-day-grid mt-2' }, [
          periodStatItem('Timer', formatHours(totalHours, lang)),
          periodStatItem('Lønn', 'kr ' + formatMoney(totalWage, lang)),
          periodStatItem('Reise', 'kr ' + formatMoney(dayTravel, lang)),
          periodStatItem('Kvitt.', 'kr ' + formatMoney(totalReceipts, lang)),
          periodStatItem('Sum', 'kr ' + formatMoney(totalWage + dayTravel + totalReceipts, lang)),
        ]),
      ]));
    }

    function periodStatItem(label, value) {
      return el('div', { class: 'period-stat' }, [
        el('div', { class: 'period-stat-label' }, label),
        el('div', { class: 'period-stat-value' }, value),
      ]);
    }

    function rebuildCards() {
      cardsContainer.innerHTML = '';
      drafts.forEach((d, i) => {
        cardsContainer.appendChild(buildRegCard(d, i, drafts, {
          onUpdate: () => {
            renderTotals();
            if (cardsContainer._markDirty) cardsContainer._markDirty();
          },
          onDelete: () => deleteDraft(i),
        }));
      });
      renderTotals();
    }

    async function deleteDraft(i) {
      const d = drafts[i];
      const ok = await confirmModal(t('common.delete'), t('day.deleteConfirm'), { okLabel: t('common.delete'), danger: true });
      if (!ok) return;
      if (d.id) {
        await db.deleteRegistration(state.user.id, d.id);
      }
      drafts.splice(i, 1);
      if (drafts.length === 0) drafts.push(newEmptyReg(dateISO));
      rebuildCards();
      toast(t('toast.deleted'));
    }

    const addBtn = el('button', {
      type: 'button', class: 'btn btn-secondary btn-block',
      onclick: () => {
        const r = newEmptyReg(dateISO);
        // Only one lunch per day is normal — if any existing card already has
        // lunch on its Ordinære timer, drop the default on the new card.
        const lunchTaken = drafts.some((d) => (d.codes || []).some((c) => Number(c.lunchMinutes) > 0));
        if (lunchTaken) {
          for (const c of r.codes || []) if (c.lunchMinutes) c.lunchMinutes = 0;
        }
        drafts.push(r);
        rebuildCards();
        markDirty();
      },
    }, '+ Legg til prosjekt');

    function renderReceipts() {
      receiptsContainer.innerHTML = '';
      for (let i = 0; i < dayReceipts.length; i++) {
        receiptsContainer.appendChild(buildReceiptRow(dayReceipts[i], i, dayReceipts, {
          onUpdate: () => { renderTotals(); markDirty(); }, // no DOM rebuild → keeps focus
          onRemove: () => { renderReceipts(); renderTotals(); markDirty(); },
        }));
      }
    }
    renderReceipts();

    const receiptsCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { class: 'card-title' }, t('day.receipts')),
        el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => {
          dayReceipts.push({ amount: 0, description: '', file: null });
          renderReceipts();
          renderTotals();
          markDirty();
        } }, '+ ' + t('day.addReceipt')),
      ]),
      receiptsContainer,
    ]);

    // ---- Manual save + dirty tracking ----
    let saving = false;
    let dirty = false;

    function markDirty() {
      dirty = true;
      updateSaveBtnState();
    }

    async function saveAll() {
      if (saving) return;
      saving = true;
      let invalidCount = 0;
      try {
        for (const d of drafts) {
          if (isDraftSaveable(d)) {
            const id = await db.saveRegistration(state.user.id, d);
            if (!d.id) d.id = id;
          } else {
            invalidCount++;
            if (d.id) {
              await db.deleteRegistration(state.user.id, d.id);
              delete d.id;
            }
          }
        }
        await db.saveDayReceipts(state.user.id, dateISO, dayReceipts);
        dirty = false;
        updateSaveBtnState();
      } catch (e) {
        console.error(e);
        toast(t('toast.error'));
      } finally {
        saving = false;
      }
    }

    function isDraftSaveable(d) {
      return validateDraft(d) === null;
    }

    // Cards call this from onUpdate — just marks dirty, no auto-save.
    cardsContainer._markDirty = markDirty;

    // ---- Day navigation with unsaved warning ----
    const today = new Date();
    const curDate = fromISODate(dateISO);

    // Three-way prompt: cancel / discard / save. Returns 'cancel' when the
    // user backs out, otherwise resolves once it is safe to navigate away.
    async function confirmLeaveIfDirty() {
      if (!dirty) return 'proceed';
      const choice = await new Promise((resolve) => {
        const panel = el('div', {}, [
          el('h2', { class: 'modal-title' }, 'Ulagrede endringer'),
          el('p', { class: 'muted' }, 'Du har endringer som ikke er lagret. Hva vil du gjøre?'),
          el('div', { class: 'modal-actions leave-actions' }, [
            el('button', { class: 'btn btn-secondary', onclick: () => { closeModal(); resolve('cancel'); } }, 'Avbryt'),
            el('button', { class: 'btn btn-danger', onclick: () => { closeModal(); resolve('discard'); } }, 'Forkast'),
            el('button', { class: 'btn', onclick: () => { closeModal(); resolve('save'); } }, 'Lagre'),
          ]),
        ]);
        openModal(panel);
      });
      if (choice === 'cancel') return 'cancel';
      if (choice === 'save') {
        await saveAll();
        // If saveAll could not flush (validation failed, network error, …)
        // dirty stays true — bail out so the user can fix the data first.
        if (dirty) return 'cancel';
      }
      // 'discard' or successful 'save'.
      dirty = false;
      return 'proceed';
    }

    async function goToDay(d) {
      if ((await confirmLeaveIfDirty()) === 'cancel') return;
      navigate('/day/' + toISODate(d));
    }

    const isToday = sameDay(curDate, today);

    // Lagre-button lives in the sticky bottom bar below the day stack.
    const saveBtn = el('button', {
      type: 'button', class: 'btn save-btn',
      onclick: saveAll,
    }, 'Alt er lagret');
    function updateSaveBtnState() {
      saveBtn.disabled = !dirty;
      saveBtn.textContent = dirty ? 'Lagre endringer' : 'Alt er lagret';
      saveBtn.classList.toggle('is-dirty', dirty);
    }
    updateSaveBtnState();

    // Year is omitted when the date falls in the current calendar year —
    // implicit context, frees up width on narrow screens.
    const sameYear = curDate.getFullYear() === new Date().getFullYear();
    const yearSuffix = sameYear ? '' : ' ' + curDate.getFullYear();
    setTopbar({
      title: t('weekday.short.' + curDate.getDay()) + ' ' + curDate.getDate() + '. ' + t('month.' + curDate.getMonth()) + yearSuffix,
      leftIcon: global.Timebok.chrome.ICONS.weekGrid,
      leftAction: async () => {
        if ((await confirmLeaveIfDirty()) === 'cancel') return;
        navigate('/week');
      },
      leftTitle: 'Ukeoversikt',
      prev: () => goToDay(addDays(curDate, -1)),
      prevTitle: 'Forrige dag',
      next: () => goToDay(addDays(curDate, 1)),
      nextTitle: 'Neste dag',
      onTitleClick: isToday ? null : () => goToDay(today),
      isCurrent: isToday,
    });

    rebuildCards();

    // Save action lives in a sticky bottom bar so it's always reachable on
    // long days without competing for space in the topbar.
    const bottomBar = el('div', { class: 'day-bottom-bar' }, [saveBtn]);

    mount(root, el('div', { class: 'day-stack' }, [
      cardsContainer,
      addBtn,
      receiptsCard,
      totalsBox,
      bottomBar,
    ]));
    document.querySelectorAll('.saved-indicator.floating').forEach((n) => n.remove());

    // Bind beforeunload + intercept hashchange for route-away warning.
    const onBeforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onBeforeUnload);

    let prevHash = location.hash;
    const onHashChange = async (e) => {
      if (!dirty) { prevHash = location.hash; return; }
      // Restore hash, ask user, then act on choice.
      const targetHash = location.hash;
      history.replaceState(null, '', prevHash);
      if ((await confirmLeaveIfDirty()) === 'cancel') return;
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('hashchange', onHashChange);
      location.hash = targetHash;
    };
    window.addEventListener('hashchange', onHashChange);
  }

  // ---- One registration card (editable) ----
  function buildRegCard(draft, index, allDrafts, cb) {
    const state = getState();

    // Project select. A dedicated + button next to it opens a quick-create
    // modal — clearer than burying the action inside a long dropdown.
    function buildProjectOptions() {
      // Empty option is selectable so the user can clear a wrongly-picked
      // project (selecting it again sets projectId='').
      return [el('option', { value: '' }, t('day.selectProject'))]
        .concat(state.projects.map((p) => el('option', { value: p.id }, p.name)));
    }
    const projectSelect = el('select', { required: true }, buildProjectOptions());
    projectSelect.value = draft.projectId || '';

    const newProjectBtn = el('button', {
      type: 'button',
      class: 'btn btn-secondary project-add-btn',
      title: 'Nytt prosjekt',
      onclick: async () => {
        const created = await openProjectModal();
        if (created) {
          await refreshGlobal();
          projectSelect.innerHTML = '';
          buildProjectOptions().forEach((o) => projectSelect.appendChild(o));
          projectSelect.value = created.id;
          update();
        }
      },
    }, '+');

    // Transport + Avstand vises ikke lenger som egne felt på toppen —
    // de er nå en "Reisegodtgjørelse"-pseudo-kode i kode-listen, behandlet
    // konsistent med Ordinære timer (auto-lagt til når prosjekt velges).
    // Default-transport kommer fra profil; default-zone fra prosjekt.

    const codesContainer = el('div');

    function readForm() {
      const prevProjectId = draft.projectId;
      const newProjectId = projectSelect.value;

      // If project changed, inherit its travelZone as the default distance
      // (user can then override via the Reisegodtgjørelse code row).
      if (newProjectId !== prevProjectId) {
        const proj = (state.projects || []).find((p) => p.id === newProjectId);
        const defaultZone = (proj && proj.travelZone) || '';
        draft.travelZone = defaultZone;
        if (!draft.transport) {
          draft.transport = (state.profile && state.profile.defaultTransport) || 'firmaBil';
        }
      }

      draft.projectId = newProjectId;
      const opt = projectSelect.selectedOptions[0];
      // Lagre kun reelt prosjektnavn — ikke placeholder-teksten ("Ingen
      // prosjekt", "Velg prosjekt", "— Velg prosjekt —" osv.) som ville
      // dukket opp som "navn" i ukeoversikt.
      draft.projectName = (opt && newProjectId) ? opt.text : '';

      // First time a project is picked, auto-add the user's configured
      // auto-codes. Defaults til Ordinære timer + Reisegodtgjørelse.
      if (!prevProjectId && newProjectId) {
        const autoCodes = Array.isArray(state.profile && state.profile.autoCodes)
          ? state.profile.autoCodes
          : ['ordinaere-timer', 'reisegodtgjorelse'];
        for (const codeId of autoCodes) {
          if (codeId === 'reisegodtgjorelse') {
            draft.noTravel = false;
          } else if (!draft.codes.some((c) => c.codeId === codeId)) {
            const def = getCode(codeId);
            if (!def) continue;
            const entry = { codeId };
            const isHourBased = def.type === 'A'
              || (def.type === 'B' && def.meta === 'hourlyAddon')
              || !!def.noProject;
            if (isHourBased) {
              entry.hours = 0;
              if (codeId === 'ordinaere-timer') entry.lunchMinutes = 30;
            }
            if (codeId === 'km-godtgjorelse') entry.km = 0;
            if (def.type === 'C') entry.amount = 0;
            draft.codes.push(entry);
          }
        }
        // If reisegodtgjorelse NOT in autoCodes, mark noTravel so the pseudo-
        // row stays hidden until user adds it via picker.
        if (!autoCodes.includes('reisegodtgjorelse')) {
          draft.noTravel = true;
        }
      }

      applyTravelCode();
    }

    // Auto-add Oppm. tillegg code based on selected transport + travelZone.
    // The zone comes from the registration (which inherits the project default
    // but is user-overridable). Auto-added entries are tagged auto:true.
    // Hvis brukeren har fjernet Reisegodtgjørelse-raden (noTravel), legg
    // ingenting til.
    function applyTravelCode() {
      draft.codes = draft.codes.filter((c) => !c.auto);
      if (draft.noTravel) return;
      if (!draft.travelZone) return;
      const transport = draft.transport || (state.profile && state.profile.defaultTransport) || 'firmaBil';
      const codeId = travelZoneCodeId(transport, draft.travelZone);
      if (!codeId) return;
      if (draft.codes.some((c) => c.codeId === codeId)) return;
      draft.codes.push({ codeId, auto: true });
    }

    // Track signature of codes array so we only rebuild the codes DOM when
    // entries are added/removed (preserves focus during input typing).
    // Sig must include any state renderCodes reads — including projectId
    // (controls pseudo-row visibility) and noTravel (controls reise pseudo-
    // row hide/show). Otherwise toggling reise alone wouldn't trigger a
    // re-render since draft.codes might be unchanged.
    function codesSig() {
      const ids = (draft.codes || []).map((c) => c.codeId + (c.auto ? '*' : '')).join('|');
      return ids + '|p:' + (draft.projectId || '') + '|nt:' + (draft.noTravel ? '1' : '0');
    }
    let lastCodesSig = codesSig();
    function update() {
      readForm();
      const sig = codesSig();
      if (sig !== lastCodesSig) {
        renderCodes();
        lastCodesSig = sig;
      }
      validateCard();
      cb.onUpdate();
    }

    // Validation node shown under the project picker when something is wrong.
    const validationMsg = el('div', { class: 'field-error', hidden: true });

    function validateCard() {
      const result = validateDraft(draft);
      const fields = result ? result.fields : {};

      projectSelect.classList.toggle('has-error', !!fields.projectId);

      if (result) {
        validationMsg.textContent = result.message;
        validationMsg.hidden = false;
      } else {
        validationMsg.hidden = true;
      }
    }

    function renderCodes() {
      codesContainer.innerHTML = '';
      // Reisegodtgjørelse pseudo-rad er 3-state via noTravel:
      //   undefined → aldri lagt til (ny card uten prosjektvalg) → skjult
      //   false     → aktiv (lagt til via autoCodes/picker) → vist
      //   true      → eksplisitt fjernet av bruker → skjult
      // Når bruker deselecter prosjekt forblir noTravel = false, så raden
      // blir værende — konsistent med Ordinære timer.
      if (draft.noTravel === false) {
        codesContainer.appendChild(buildTravelPseudoRow(draft, update));
      }
      for (let i = 0; i < draft.codes.length; i++) {
        if (draft.codes[i].auto) continue;
        codesContainer.appendChild(buildCodeRow(draft.codes[i], i, draft, update));
      }
    }

    projectSelect.addEventListener('change', update);

    // Seed transport/travelZone from profile/project if registration didn't
    // already have them.
    if (!draft.transport) {
      draft.transport = (state.profile && state.profile.defaultTransport) || 'firmaBil';
    }
    if (!draft.travelZone && draft.projectId) {
      const proj = (state.projects || []).find((p) => p.id === draft.projectId);
      if (proj && proj.travelZone) draft.travelZone = proj.travelZone;
    }
    // Always sync the auto-added travel code to current transport + zone on
    // initial render (in case a saved draft lost the code).
    applyTravelCode();
    renderCodes();
    validateCard();

    const isOnlyCard = allDrafts.length === 1;
    const cardDelBtn = el('button', {
      type: 'button',
      class: 'receipt-del-icon' + (isOnlyCard ? ' field-disabled' : ''),
      title: isOnlyCard ? 'Kan ikke slette siste prosjekt' : t('common.delete'),
      disabled: isOnlyCard,
      onclick: isOnlyCard ? null : cb.onDelete,
      html: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6 L18 18 M6 18 L18 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>',
    });

    const projectLabel = el('label', { class: 'req' }, t('day.project'));

    return el('div', { class: 'card reg-card' }, [
      el('div', { class: 'form-group' }, [
        el('div', { class: 'receipt-field-head' }, [
          projectLabel,
          cardDelBtn,
        ]),
        el('div', { class: 'project-picker' }, [projectSelect, newProjectBtn]),
        validationMsg,
      ]),

      el('div', { class: 'reg-section' }, [
        el('div', { class: 'card-head' }, [
          el('h4', { class: 'reg-section-title' }, t('day.codes')),
          el('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => openCodePicker(draft, update) },
            '+ ' + t('day.addCode')),
        ]),
        codesContainer,
      ]),

    ]);
  }

  // Reisegodtgjørelse pseudo-rad: layout matcher Ordinære timer — navn +
  // delete-knapp på topp, deretter felter med labels i et grid under.
  function buildTravelPseudoRow(draft, update) {
    const nameNode = el('div', { class: 'code-name-wrap' }, [
      el('span', { class: 'code-name', title: 'Reisegodtgjørelse' }, 'Reisegodtgjørelse'),
    ]);

    const transportSel = el('select', { class: 'code-input' }, [
      el('option', { value: 'firmaBil' }, 'Firma'),
      el('option', { value: 'privatBil' }, 'Privat'),
    ]);
    transportSel.value = draft.transport || 'firmaBil';

    const zoneSel = el('select', { class: 'code-input' }, [el('option', { value: '' }, '0-7,5 km')].concat(
      TRAVEL_ZONES.map((z) => el('option', { value: z }, z + ' km'))
    ));
    zoneSel.value = draft.travelZone || '';

    transportSel.addEventListener('change', () => { draft.transport = transportSel.value; update(); });
    zoneSel.addEventListener('change', () => { draft.travelZone = zoneSel.value; update(); });

    const delBtn = el('button', {
      type: 'button', class: 'icon-btn code-del', title: t('common.delete'),
      onclick: () => {
        draft.noTravel = true;
        draft.travelZone = '';
        update();
      },
    }, '×');

    return el('div', { class: 'code-row code-row-time' }, [
      el('div', { class: 'code-row-top' }, [nameNode, delBtn]),
      el('div', { class: 'code-row-time-grid code-row-time-grid-2' }, [
        el('div', { class: 'code-field' }, [
          el('span', { class: 'code-field-label' }, 'Transport'), transportSel,
        ]),
        el('div', { class: 'code-field' }, [
          el('span', { class: 'code-field-label' }, 'Avstand'), zoneSel,
        ]),
      ]),
    ]);
  }

  function buildCodeRow(codeEntry, index, draft, update) {
    const def = getCode(codeEntry.codeId);
    if (!def) return el('div', {});

    const delBtn = el('button', {
      type: 'button', class: 'icon-btn code-del', title: t('common.delete'),
      onclick: () => { draft.codes.splice(index, 1); update(); },
    }, '×');

    const rates = (getState().rates) || {};
    const displayName = resolveCodeName(def.id, rates);
    const nameNode = el('div', { class: 'code-name-wrap' }, [
      el('span', { class: 'code-name', title: displayName }, displayName),
    ]);

    // Hour-based codes (Type A + Type B hourlyAddon + every substitute code
    // like Ferie/Sykemelding/Offentlig fridag) get start/slutt pickers.
    // Hours are derived from end - start.
    const isHourBased = def.type === 'A'
      || (def.type === 'B' && def.meta === 'hourlyAddon')
      || !!def.noProject;

    if (isHourBased) {
      const startBtn = wheelField(codeEntry.start || '',
        (v) => openTimePicker(v || '08:00', { title: 'Start (' + displayName + ')' }),
        { placeholder: 'Velg' });
      const endBtn = wheelField(codeEntry.end || '',
        (v) => openTimePicker(v || '16:00', { title: 'Slutt (' + displayName + ')' }),
        { placeholder: 'Velg' });

      const hoursIn = el('input', {
        type: 'text', inputmode: 'decimal', placeholder: '0',
        value: displayNum(codeEntry.hours || ''),
        class: 'code-input',
      });
      const lunchIn = el('input', {
        type: 'text', inputmode: 'decimal', placeholder: '0',
        value: displayNum((Number(codeEntry.lunchMinutes) || 0) / 60),
        class: 'code-input',
      });

      let manualHours = !!(codeEntry.hours && (!codeEntry.start || !codeEntry.end));

      function syncMode() {
        startBtn.disabled = manualHours;
        endBtn.disabled = manualHours;
        lunchIn.disabled = manualHours;
        startBtn.classList.toggle('field-disabled', manualHours);
        endBtn.classList.toggle('field-disabled', manualHours);
        lunchIn.classList.toggle('field-disabled', manualHours);
      }

      function recalcFromTimes() {
        codeEntry.start = startBtn.value;
        codeEntry.end = endBtn.value;
        codeEntry.lunchMinutes = Math.round(parseNum(lunchIn.value) * 60);
        if (codeEntry.start && codeEntry.end) {
          const diff = global.Timebok.dateUtils.diffMinutes(codeEntry.start, codeEntry.end);
          codeEntry.hours = Math.max(0, Math.round((diff / 60) * 100) / 100);
          hoursIn.value = displayNum(codeEntry.hours);
        }
        manualHours = false;
        syncMode();
        update();
      }
      startBtn.addEventListener('change', recalcFromTimes);
      endBtn.addEventListener('change', recalcFromTimes);
      lunchIn.addEventListener('input', recalcFromTimes);
      hoursIn.addEventListener('input', () => {
        codeEntry.hours = parseNum(hoursIn.value);
        manualHours = codeEntry.hours > 0;
        syncMode();
        update();
      });
      syncMode();

      return el('div', { class: 'code-row code-row-time' }, [
        el('div', { class: 'code-row-top' }, [nameNode, delBtn]),
        el('div', { class: 'code-row-time-grid' }, [
          el('div', { class: 'code-field' }, [
            el('span', { class: 'code-field-label' }, 'Start'), startBtn,
          ]),
          el('div', { class: 'code-field' }, [
            el('span', { class: 'code-field-label' }, 'Slutt'), endBtn,
          ]),
          el('div', { class: 'code-field' }, [
            el('span', { class: 'code-field-label' }, 'Lunsj'), lunchIn,
          ]),
          el('div', { class: 'code-field' }, [
            el('span', { class: 'code-field-label' }, 'Timer'), hoursIn,
          ]),
        ]),
      ]);
    }

    // Non-time codes (km, variable amount, marker) — single inline input.
    let inputNode = null;
    if (def.type === 'B' && def.id === 'km-godtgjorelse') {
      const inp = el('input', { type: 'text', inputmode: 'decimal', value: displayNum(codeEntry.km || 0), class: 'code-input' });
      inp.addEventListener('input', () => { codeEntry.km = parseNum(inp.value); update(); });
      inputNode = labeledInput('km', inp);
    } else if (def.type === 'C') {
      const inp = el('input', { type: 'text', inputmode: 'decimal', value: displayNum(codeEntry.amount || 0), class: 'code-input' });
      inp.addEventListener('input', () => { codeEntry.amount = parseNum(inp.value); update(); });
      inputNode = labeledInput('kr', inp);
    }

    return el('div', { class: 'code-row' + (inputNode ? '' : ' code-row-compact') }, [
      nameNode, inputNode, delBtn,
    ]);
  }

  function labeledInput(unit, input) {
    return el('div', { class: 'code-input-wrap' }, [
      input,
      el('span', { class: 'code-unit' }, unit),
    ]);
  }

  function buildReceiptRow(rec, index, list, cb) {
    const update = cb.onUpdate;
    const onRemove = cb.onRemove;
    const desc = el('textarea', {
      rows: 1, placeholder: t('common.description'),
      class: 'receipt-desc',
    });
    desc.value = rec.description || '';
    function autoSize() {
      desc.style.height = 'auto';
      desc.style.height = desc.scrollHeight + 'px';
    }
    desc.addEventListener('input', () => { rec.description = desc.value; autoSize(); update(); });
    requestAnimationFrame(autoSize);

    const amt = el('input', {
      type: 'text', inputmode: 'decimal',
      value: displayNum(rec.amount), placeholder: '0', class: 'receipt-amt',
    });
    amt.addEventListener('input', () => { rec.amount = parseNum(amt.value); update(); });

    const currencySel = el('select', { class: 'receipt-currency' }, [
      el('option', { value: 'NOK' }, 'NOK'),
      el('option', { value: 'USD' }, 'USD'),
      el('option', { value: 'EUR' }, 'EUR'),
      el('option', { value: 'GBP' }, 'GBP'),
    ]);
    currencySel.value = rec.currency || 'NOK';
    currencySel.addEventListener('change', () => { rec.currency = currencySel.value; update(); });

    const fileIn = el('input', { type: 'file', accept: 'image/*,application/pdf', class: 'receipt-file-input' });
    const fileText = el('span', { class: 'receipt-file-text' }, rec.file ? rec.file.name : '+ Fil');
    const fileClear = el('button', {
      type: 'button', class: 'receipt-file-clear', title: 'Fjern fil', hidden: !rec.file,
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        rec.file = null;
        fileIn.value = '';
        fileText.textContent = '+ Fil';
        fileClear.hidden = true;
        fileLabel.classList.remove('has-file');
        update();
      },
    }, '×');
    const fileLabel = el('label', { class: 'receipt-file-label' + (rec.file ? ' has-file' : '') }, [fileIn, fileText, fileClear]);
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0];
      if (!f) return;
      const state = getState();
      try {
        const meta = await storage.uploadReceipt(state.user.id, f);
        rec.file = meta;
        fileText.textContent = meta.name;
        fileLabel.classList.add('has-file');
        fileClear.hidden = false;
        update();
        toast(t('toast.saved'));
      } catch (e) {
        console.error(e);
        toast(t('toast.error'));
      }
    });

    const delBtn = el('button', {
      type: 'button', class: 'receipt-del-icon', title: t('common.delete'),
      onclick: async () => {
        const ok = await confirmModal(t('common.delete'), 'Slette denne kvitteringen?', { okLabel: t('common.delete'), danger: true });
        if (!ok) return;
        list.splice(index, 1);
        onRemove();
      },
      html: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6 L18 18 M6 18 L18 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>',
    });

    return el('div', { class: 'receipt-row' }, [
      el('div', { class: 'receipt-field' }, [
        el('div', { class: 'receipt-field-head' }, [
          el('label', { class: 'receipt-field-label' }, 'Beskrivelse'),
          delBtn,
        ]),
        desc,
      ]),
      el('div', { class: 'receipt-row-2' }, [
        el('div', { class: 'receipt-field receipt-field-currency' }, [
          el('label', { class: 'receipt-field-label' }, 'Valuta'),
          currencySel,
        ]),
        el('div', { class: 'receipt-field receipt-field-amt' }, [
          el('label', { class: 'receipt-field-label' }, 'Beløp'),
          amt,
        ]),
        el('div', { class: 'receipt-field receipt-field-file' }, [
          el('label', { class: 'receipt-field-label' }, 'Vedlegg'),
          fileLabel,
        ]),
      ]),
    ]);
  }

  // Same purpose-mapping som admin bruker. Hver kode plasseres i én av fire
  // bruks-grupper. Holdt nær picker-koden for å unngå avhengigheter.
  const PICKER_PURPOSE = {
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
    'bastillegg':               'tillegg',
    'smusstillegg-1':           'tillegg',
    'tilhengertillegg':         'tillegg',
    'passasjertillegg':         'tillegg',
    'utenbystillegg-fagarb':    'tillegg',
    'utenbystillegg-u-fagbrev': 'tillegg',
    'tarifftillegg-a121':       'tillegg',
    'opplaeringstillegg-ks':    'tillegg',
    'km-godtgjorelse':          'reise',
    'reiseutgifter-bom':        'reise',
    'restakkord-belop':         'reise',
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
  const PICKER_GROUPS = [
    { key: 'reise',   label: 'Reise og refusjon' },
    { key: 'arbeid',  label: 'Arbeid og overtid' },
    { key: 'tillegg', label: 'Tillegg per arbeidet time' },
    { key: 'fravaer', label: 'Fravær' },
  ];

  function openCodePicker(draft, update) {
    const grouped = { arbeid: [], tillegg: [], reise: [], fravaer: [] };
    // Filter ut Oppm-zone-koder (auto-håndtert via Reisegodtgjørelse) — alt
    // annet er valgbart.
    for (const c of CODES) {
      if (isTravelZoneCode(c)) continue;
      const p = PICKER_PURPOSE[c.id] || 'arbeid';
      if (grouped[p]) grouped[p].push(c);
    }

    const pickerRates = (getState().rates) || {};
    const list = el('div', { class: 'code-list' });

    const groupHeader = (label) => el('div', { class: 'code-group-header' }, label);

    // Reisegodtgjørelse-entry — vises i picker når den IKKE allerede er
    // synlig på kortet (pseudo-raden viser kun når projectId && !noTravel).
    const reiseAlreadyVisible = !!draft.projectId && !draft.noTravel;
    if (!reiseAlreadyVisible) {
      const reiseItem = el('div', { class: 'code-item' }, [
        el('div', {}, [el('span', { class: 'code-name' }, 'Reisegodtgjørelse')]),
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, '+'),
      ]);
      reiseItem.addEventListener('click', () => {
        draft.noTravel = false;
        if (!draft.travelZone) {
          const proj = (getState().projects || []).find((p) => p.id === draft.projectId);
          if (proj && proj.travelZone) draft.travelZone = proj.travelZone;
        }
        closeModal();
        update();
      });
      list.appendChild(groupHeader('Reise og refusjon'));
      list.appendChild(reiseItem);
    }

    for (const g of PICKER_GROUPS) {
      const codes = grouped[g.key];
      if (!codes || !codes.length) continue;
      // Hopp over "Reise og refusjon"-headeren hvis vi allerede skrev den
      // sammen med Reisegodtgjørelse-entry over.
      if (!(g.key === 'reise' && !reiseAlreadyVisible)) {
        list.appendChild(groupHeader(g.label));
      }
      for (const c of codes) {
        const item = el('div', { class: 'code-item' }, [
          el('div', {}, [el('span', { class: 'code-name' }, resolveCodeName(c.id, pickerRates))]),
          el('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, '+'),
        ]);
        item.addEventListener('click', () => {
          const entry = { codeId: c.id };
          const isHourBased = c.type === 'A'
            || (c.type === 'B' && c.meta === 'hourlyAddon')
            || !!c.noProject;
          if (isHourBased) entry.hours = 0;
          if (c.id === 'km-godtgjorelse') entry.km = 0;
          if (c.type === 'C') entry.amount = 0;
          draft.codes.push(entry);
          closeModal();
          update();
        });
        list.appendChild(item);
      }
    }

    const panel = el('div', {}, [
      el('h2', { class: 'modal-title' }, t('day.addCode')),
      list,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn btn-secondary', onclick: closeModal }, t('common.close')),
      ]),
    ]);
    openModal(panel);
  }

  // Quick-create modal for adding a project on the fly. Resolves with the
  // new project { id, name, travelZone } or null on cancel.
  function openProjectModal() {
    return new Promise((resolve) => {
      const nameIn = el('input', { type: 'text', placeholder: 'Prosjektnavn', autofocus: true });
      const zoneSel = el('select', {}, [el('option', { value: '' }, '0–7,5 km')].concat(
        TRAVEL_ZONES.map((z) => el('option', { value: z }, z + ' km'))
      ));

      async function save() {
        const name = nameIn.value.trim();
        if (!name) { nameIn.focus(); return; }
        const newProject = {
          id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name,
          travelZone: zoneSel.value || '',
        };
        const state = getState();
        const next = state.projects.slice();
        next.push(newProject);
        await db.saveProjects(next);
        closeModal();
        resolve(newProject);
      }

      const panel = el('div', {}, [
        el('h2', { class: 'modal-title' }, 'Nytt prosjekt'),
        el('div', { class: 'form-group' }, [
          el('label', {}, 'Prosjektnavn *'),
          nameIn,
        ]),
        el('div', { class: 'form-group' }, [
          el('label', {}, 'Reiseavstand (valgfritt)'),
          zoneSel,
        ]),
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { closeModal(); resolve(null); } }, t('common.cancel')),
          el('button', { class: 'btn', type: 'button', onclick: save }, t('common.save')),
        ]),
      ]);

      openModal(panel);
      setTimeout(() => nameIn.focus(), 0);
    });
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.views = global.Timebok.views || {};
  global.Timebok.views.day = { renderDay };
})(window);
