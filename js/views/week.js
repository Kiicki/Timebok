(function (global) {
  const { el, mount, toast, confirmModal } = global.Timebok.dom;
  const { t, getLang } = global.Timebok.i18n;
  const { db } = global.Timebok.data;
  const { get: getState } = global.Timebok.state;
  const { calcRegistration, calcDayTravel, aggregate, groupByDate, toNOK } = global.Timebok.calc;
  const {
    startOfWeek, endOfWeek, addDays, addWeeks, toISODate,
    getISOWeek, getISOWeekYear, sameDay, formatHours, formatMoney,
  } = global.Timebok.dateUtils;
  const { navigate } = global.Timebok.router;
  function setTopbar(opts) { global.Timebok.chrome.setTopbar(opts); }

  let cursor = startOfWeek(new Date());

  async function renderWeek() {
    const root = document.getElementById('view');
    document.getElementById('topbar').hidden = false;

    mount(root, el('div', { class: 'muted' }, t('common.loading')));

    const state = getState();
    const profile = state.profile;
    const rates = state.rates;

    const weekStart = startOfWeek(cursor);
    const weekEnd = endOfWeek(cursor);
    const from = toISODate(weekStart);
    const to = toISODate(weekEnd);
    const [regs, dayReceipts] = await Promise.all([
      db.listRegistrations(state.user.id, { from, to }),
      db.listDayReceipts(state.user.id, { from, to }),
    ]);
    const byDate = groupByDate(regs);
    const summary = aggregate(regs, profile, rates, dayReceipts);

    const lang = getLang();
    const today = new Date();

    const isCurrentWeek = sameDay(weekStart, startOfWeek(today));
    setTopbar({
      title: 'Uke ' + getISOWeek(weekStart) + ' · ' + formatRangeCompact(weekStart, weekEnd),
      leftIcon: global.Timebok.chrome.ICONS.todayCard,
      leftAction: () => navigate('/day/' + toISODate(new Date())),
      leftTitle: 'Åpne dagens registrering',
      prev: () => { cursor = addWeeks(cursor, -1); renderWeek(); },
      prevTitle: t('week.prev'),
      next: () => { cursor = addWeeks(cursor, 1); renderWeek(); },
      nextTitle: t('week.next'),
      // Tap title to jump to the current week (no-op when already there).
      onTitleClick: isCurrentWeek ? null : () => {
        cursor = startOfWeek(new Date()); renderWeek();
      },
      isCurrent: isCurrentWeek,
    });

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const iso = toISODate(d);
      const dayRegs = byDate.get(iso) || [];
      const dayRcs = dayReceipts.get(iso) || [];
      days.push(renderDayCard(d, dayRegs, dayRcs, profile, rates, lang, sameDay(d, today)));
    }

    const profileStyle = (profile && profile.companyStyle) || 'firesafe';
    const styleLabel = profileStyle === 'damsgard' ? 'Damsgård' : 'Firesafe';
    const summaryNode = el('div', { class: 'summary' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { class: 'card-title' }, t('week.summary')),
        el('span', { class: 'totals-style-badge', title: 'Reisegodtgjørelse-stil fra profil — endre på Profilside' }, styleLabel),
      ]),
      el('div', { class: 'summary-grid' }, [
        summaryItem(t('week.totalHours'), formatHours(summary.totalHours, lang) + ' ' + t('common.hours'),
          summary.hoursByType.overtime > 0
            ? formatHours(summary.hoursByType.overtime, lang) + ' ' + t('common.hours') + ' overtid'
            : null),
        summaryItem(t('week.totalWage'), 'kr ' + formatMoney(summary.totalWage, lang)),
        summaryItem(t('week.totalTravel'), 'kr ' + formatMoney(summary.totalTravel, lang)),
        summaryItem(t('week.totalReceipts'), 'kr ' + formatMoney(summary.totalReceipts, lang)),
      ]),
    ]);

    mount(root, el('div', {}, [el('div', {}, days), summaryNode]));
  }

  function renderDayCard(date, dayRegs, dayRcs, profile, rates, lang, isToday) {
    const weekday = date.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const iso = toISODate(date);
    const dayTravel = calcDayTravel(dayRegs, profile, rates);
    let dayHours = 0, dayWage = 0, dayReceipts = 0;
    for (const r of dayRegs) {
      const c = calcRegistration(r, profile, rates);
      for (const cb of c.codeBreakdown) if (cb.hours) dayHours += cb.hours;
      dayWage += c.wage;
      dayReceipts += c.receipts;
    }
    for (const rc of dayRcs || []) dayReceipts += toNOK(rc.amount, rc.currency);

    const head = el('div', { class: 'day-head' }, [
      el('div', {}, [
        el('div', { class: 'day-date' }, [
          date.getDate() + '. ' + t('month.' + date.getMonth()),
          isToday ? ' ' : null,
          isToday ? el('span', { class: 'today-badge' }, 'I dag') : null,
        ]),
        el('div', { class: 'day-weekday' }, t('weekday.' + weekday)),
      ]),
      el('div', { class: 'day-totals' }, [
        (dayRegs.length || dayRcs.length) && dayHours > 0
          ? el('span', {}, [el('strong', {}, formatHours(dayHours, lang)), ' t']) : null,
        (dayRegs.length || dayRcs.length)
          ? el('span', {}, [el('strong', {}, 'kr ' + formatMoney(dayWage + dayTravel + dayReceipts, lang))]) : null,
      ]),
    ]);

    const items = [];
    dayRegs.forEach((r) => items.push(renderRegRow(r, iso)));
    if (dayRcs && dayRcs.length) {
      items.push(renderReceiptsRow(dayRcs, lang, iso));
    }

    const regList = items.length
      ? el('div', { class: 'day-regs' }, items)
      : el('div', { class: 'empty-day' }, [
          el('span', {}, t('week.noRegistrations')),
        ]);

    // Hele kortet er klikkbart for å åpne dagen — egen "+ Ny registrering"-
    // tekst er overflødig og forvirrer brukeren (ser ut som en knapp som
    // ikke kan trykkes på separat).
    const moreBtn = null;

    const card = el('div', {
      class: 'day-card clickable' + (isWeekend ? ' weekend' : ''),
      role: 'button',
      tabindex: '0',
      onclick: (e) => {
        // Ignore clicks that originated inside a registration row's action buttons.
        if (e.target.closest('.reg-actions')) return;
        navigate('/day/' + iso);
      },
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/day/' + iso); }
      },
    }, [head, regList, moreBtn]);

    return card;
  }

  function renderReceiptsRow(rcs, lang, iso) {
    const total = rcs.reduce((s, r) => s + toNOK(r.amount, r.currency), 0);
    const desc = rcs.length === 1
      ? (rcs[0].description || 'Kvittering')
      : rcs.length + ' kvitteringer';
    return el('div', { class: 'reg-row' }, [
      el('div', { class: 'reg-row-main' }, [
        el('div', { class: 'reg-project' }, [
          el('span', { class: 'chip code-C', style: { marginRight: '6px' } }, 'Kvitt'),
          desc,
        ]),
        el('div', { class: 'reg-time' }, 'kr ' + formatMoney(total, lang)),
      ]),
    ]);
  }

  function renderRegRow(reg, iso) {
    const state = getState();
    const project = (state.projects || []).find((p) => p.id === reg.projectId);
    // projectName-resolution:
    //   - har projectId + finner prosjekt → bruk prosjektnavn
    //   - har projectId men prosjekt slettet → bruk cachet navn (men ignorer
    //     gamle placeholders som "— Velg prosjekt —")
    //   - ingen projectId → "Ingen prosjekt"
    let projectName;
    if (project) {
      projectName = project.name;
    } else if (reg.projectId) {
      const cached = (reg.projectName || '').trim();
      const isPlaceholder = !cached || /velg prosjekt|select project|^—|^-/i.test(cached);
      projectName = isPlaceholder ? 'Slettet prosjekt' : cached;
    } else {
      projectName = 'Ingen prosjekt';
    }
    const lang = getLang();
    const c = calcRegistration(reg, state.profile, state.rates);
    const hours = c.hoursByType.ordinary + c.hoursByType.overtime + c.hoursByType.other;
    const hoursStr = hours > 0 ? formatHours(hours, lang) + ' t' : '';

    // Vis alle tilleggskoder (inkl. Ordinære timer) + Reisegodtgjørelse-tag
    // så bruker ser hva som er registrert uten å åpne dagen.
    const codeChips = [];
    for (const cb of c.codeBreakdown) {
      const label = cb.name + (cb.hours ? ' ' + formatHours(cb.hours, lang) + 't' : '')
        + (cb.amount && !cb.hours ? ' kr ' + formatMoney(cb.amount, lang) : '');
      codeChips.push(el('span', { class: 'reg-code-chip' }, label));
    }
    if (reg.travelZone) {
      const transport = reg.transport === 'privatBil' ? 'Privat' : 'Firma';
      codeChips.push(el('span', { class: 'reg-code-chip reg-code-chip-travel' },
        'Reise: ' + transport + ' ' + reg.travelZone + ' km'));
    }

    return el('div', { class: 'reg-row' }, [
      el('div', { class: 'reg-row-main' }, [
        el('div', { class: 'reg-row-line' }, [
          el('div', { class: 'reg-project' }, projectName),
          el('div', { class: 'reg-time' }, hoursStr),
        ]),
        codeChips.length ? el('div', { class: 'reg-codes' }, codeChips) : null,
      ]),
      el('div', { class: 'reg-actions' }, [
        el('button', {
          class: 'icon-btn', title: t('common.edit'),
          onclick: () => navigate('/day/' + iso + '?reg=' + reg.id),
        }, '✎'),
        el('button', {
          class: 'icon-btn', title: t('common.delete'),
          onclick: async () => {
            const ok = await confirmModal(t('common.delete'), t('day.deleteConfirm'),
              { okLabel: t('common.delete'), danger: true });
            if (!ok) return;
            await db.deleteRegistration(getState().user.id, reg.id);
            toast(t('toast.deleted'));
            renderWeek();
          },
        }, '×'),
      ]),
    ]);
  }

  function summaryItem(label, value, sub) {
    return el('div', { class: 'summary-item' }, [
      el('span', { class: 'summary-label' }, label),
      el('span', { class: 'summary-value' }, value),
      sub ? el('span', { class: 'summary-sub' }, sub) : null,
    ]);
  }

  function formatRange(a, b) {
    const fmt = (d) => d.getDate() + '. ' + t('month.' + d.getMonth());
    return fmt(a) + ' – ' + fmt(b) + ' ' + b.getFullYear();
  }

  // Compact range — kept short enough to fit in the topbar without ellipsis.
  // Year is omitted when current; month names switch to 3-letter abbreviations
  // when the range spans two months (then a year transition).
  function formatRangeCompact(a, b) {
    const yA = a.getFullYear(), yB = b.getFullYear();
    const mA = a.getMonth(), mB = b.getMonth();
    const nowY = new Date().getFullYear();
    const showYear = !(yA === nowY && yB === nowY);
    if (yA === yB && mA === mB) {
      // Same month: full name fits ("25.–31. mai").
      return a.getDate() + '.–' + b.getDate() + '. ' + t('month.' + mA) + (showYear ? ' ' + yB : '');
    }
    if (yA === yB) {
      // Cross-month: short month names ("27. apr – 3. mai").
      return a.getDate() + '. ' + t('month.short.' + mA) + ' – ' + b.getDate() + '. ' + t('month.short.' + mB) + (showYear ? ' ' + yB : '');
    }
    // Cross-year: short months, both years.
    return a.getDate() + '. ' + t('month.short.' + mA) + ' ' + yA + ' – ' + b.getDate() + '. ' + t('month.short.' + mB) + ' ' + yB;
  }

  function goToWeekOf(date) { cursor = startOfWeek(date); }

  global.Timebok = global.Timebok || {};
  global.Timebok.views = global.Timebok.views || {};
  global.Timebok.views.week = { renderWeek, goToWeekOf };
})(window);
