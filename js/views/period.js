(function (global) {
  const { el, mount, toast } = global.Timebok.dom;
  const { t, getLang } = global.Timebok.i18n;
  const { db } = global.Timebok.data;
  const { get: getState } = global.Timebok.state;
  const { aggregate, calcRegistration, calcDayTravel, groupByDate, toNOK } = global.Timebok.calc;
  function setTopbar(opts) { global.Timebok.chrome.setTopbar(opts); }
  const { fromISODate, toISODate, formatHours, formatMoney, formatDateNo, parseDateNo } = global.Timebok.dateUtils;

  let lastResult = null;

  // Norwegian-formatted date field with a hidden native <input type="date">
  // for the platform's calendar picker. Display is ALWAYS dd.mm.yyyy
  // regardless of browser/device locale (the visible field is plain text;
  // the date input only drives the picker).
  function dateField(initialISO) {
    const textIn = el('input', {
      type: 'text', inputmode: 'numeric', placeholder: 'dd.mm.åååå',
      value: initialISO ? formatDateNo(initialISO) : '',
      class: 'date-field-text',
    });
    const native = el('input', {
      type: 'date', value: initialISO || '',
      class: 'date-field-native',
      tabindex: '-1', 'aria-hidden': 'true',
    });
    const icon = el('button', {
      type: 'button', class: 'date-field-icon',
      'aria-label': 'Velg dato', title: 'Velg dato',
      html: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 18H5V8h14v13z"/></svg>',
    });
    icon.addEventListener('click', () => {
      try {
        if (typeof native.showPicker === 'function') { native.showPicker(); return; }
      } catch (e) { /* showPicker may throw outside user-activation contexts */ }
      native.focus(); native.click();
    });
    native.addEventListener('change', () => {
      if (native.value) textIn.value = formatDateNo(native.value);
    });
    textIn.addEventListener('input', () => {
      const iso = parseDateNo(textIn.value);
      if (iso) native.value = iso;
    });
    const wrap = el('div', { class: 'date-field' }, [textIn, icon, native]);
    return {
      node: wrap,
      get value() { return textIn.value; },
      setFromDate(date) {
        native.value = toISODate(date);
        textIn.value = formatDateNo(date);
      },
    };
  }

  // Pay-period boundaries per company: Damsgård 26–25, Firesafe 11–10.
  // Returns [from, to] for the most recent period whose end-date is today or
  // earlier. When today equals the end-date, the period is treated as
  // complete (the user is on the last day and the data is in for the period).
  function payPeriodForStyle(style) {
    const t = new Date();
    const y = t.getFullYear(), m = t.getMonth(), d = t.getDate();
    const startDay = style === 'damsgard' ? 26 : 11;
    const endDay = startDay - 1;
    if (d >= endDay) {
      // Period that ended this month (or ends today).
      return [new Date(y, m - 1, startDay), new Date(y, m, endDay)];
    }
    // Period that ended last month is the latest complete one.
    return [new Date(y, m - 2, startDay), new Date(y, m - 1, endDay)];
  }

  async function renderPeriod() {
    const root = document.getElementById('view');
    document.getElementById('topbar').hidden = false;
    setTopbar({
      title: t('period.title'),
      leftIcon: global.Timebok.chrome.ICONS.arrowBack,
      leftAction: () => global.Timebok.router.navigate('/week'),
      leftTitle: 'Tilbake',
    });

    // Stilen styres av profilen — én sannhetskilde, ingen lokal toggle.
    // Vil bruker se andre stilens tall: bytt i Profil. Stilen vises som en
    // badge over totalene så det er tydelig hvilke regler som brukes.
    const currentStyle = (getState().profile && getState().profile.companyStyle) || 'firesafe';

    const [defaultFrom, defaultTo] = payPeriodForStyle(currentStyle);
    const fromField = dateField(toISODate(defaultFrom));
    const toField = dateField(toISODate(defaultTo));
    const resultBox = el('div', { class: 'mt-3' });

    const showBtn = el('button', { class: 'btn' }, t('period.generate'));
    const pdfBtn = el('button', { class: 'btn btn-secondary', disabled: true }, t('period.exportPdf'));
    const xlsxBtn = el('button', { class: 'btn btn-secondary', disabled: true }, t('period.exportExcel'));

    async function run() {
      const from = parseDateNo(fromField.value);
      const to = parseDateNo(toField.value);
      if (!from || !to) return;
      resultBox.innerHTML = '';
      resultBox.appendChild(el('div', { class: 'muted' }, t('common.loading')));
      const state = getState();
      // YTD range: Jan 1 of the period's year through the period's end date.
      // Matches "Akkumulert totalt"-kolonnen på lønnsslippen.
      const periodEnd = new Date(to + 'T00:00:00');
      const ytdFrom = new Date(periodEnd.getFullYear(), 0, 1);
      const ytdFromIso = toISODate(ytdFrom);
      const [regs, dayReceipts, ytdRegs, ytdDayReceipts] = await Promise.all([
        db.listRegistrations(state.user.id, { from, to }),
        db.listDayReceipts(state.user.id, { from, to }),
        db.listRegistrations(state.user.id, { from: ytdFromIso, to }),
        db.listDayReceipts(state.user.id, { from: ytdFromIso, to }),
      ]);
      // Local style override — profile is unchanged.
      // periodMonths is derived inside aggregate() from unique pay periods
      // with data, so both periode + YTD are identical when data overlaps.
      const profileForCalc = Object.assign({}, state.profile || {}, { companyStyle: currentStyle });
      const summary = aggregate(regs, profileForCalc, state.rates, dayReceipts);
      const ytdSummary = aggregate(ytdRegs, profileForCalc, state.rates, ytdDayReceipts);
      lastResult = { from, to, regs, dayReceipts, summary, ytdSummary, currentStyle };
      pdfBtn.disabled = false;
      xlsxBtn.disabled = false;
      if (exportBar) exportBar.hidden = false;
      resultBox.innerHTML = '';
      resultBox.appendChild(renderResult(lastResult));
    }

    showBtn.addEventListener('click', run);
    pdfBtn.addEventListener('click', async () => {
      if (!lastResult) return;
      try {
        await global.Timebok.exportPdf.exportPDF(lastResult, getState());
      } catch (e) {
        console.error(e);
        toast(t('toast.error'));
      }
    });
    xlsxBtn.addEventListener('click', async () => {
      if (!lastResult) return;
      try {
        await global.Timebok.exportExcel.exportExcel(lastResult, getState());
      } catch (e) {
        console.error(e);
        toast(t('toast.error'));
      }
    });
    // Note: export modules also read result.dayReceipts when present.

    // Full-width primary action so the form has a single clear CTA.
    showBtn.classList.add('btn-block');
    // Export buttons live in their own bar below the result (only relevant
    // once a period has been generated).
    pdfBtn.classList.add('btn-block');
    xlsxBtn.classList.add('btn-block');
    const exportBar = el('div', { class: 'period-export-bar', hidden: true }, [pdfBtn, xlsxBtn]);

    const node = el('div', {}, [
      el('div', { class: 'card' }, [
        el('div', { class: 'form-row cols-2' }, [
          el('div', { class: 'form-group' }, [el('label', {}, t('period.from')), fromField.node]),
          el('div', { class: 'form-group' }, [el('label', {}, t('period.to')), toField.node]),
        ]),
        el('div', { class: 'mt-3' }, [showBtn]),
      ]),
      resultBox,
      exportBar,
    ]);

    mount(root, node);
    run();
  }

  function renderResult(result) {
    const { from, to, regs, dayReceipts, summary, ytdSummary, currentStyle } = result;
    const styleLabel = currentStyle === 'damsgard' ? 'Damsgård' : 'Firesafe';
    const state = getState();
    const lang = getLang();
    if (!regs.length && (!dayReceipts || dayReceipts.size === 0)) return el('div', { class: 'card muted' }, t('period.noData'));

    const byDate = groupByDate(regs);
    const allDates = new Set(byDate.keys());
    if (dayReceipts) dayReceipts.forEach((_, d) => allDates.add(d));
    const sortedDates = Array.from(allDates).sort();

    const dayCards = sortedDates.map((d) => {
      const dayRegs = byDate.get(d) || [];
      const dayTravel = calcDayTravel(dayRegs, state.profile, state.rates);
      let dayHours = 0, dayWage = 0, dayReceiptsTotal = 0;
      for (const r of dayRegs) {
        const c = calcRegistration(r, state.profile, state.rates);
        for (const cb of c.codeBreakdown) if (cb.hours) dayHours += cb.hours;
        dayWage += c.wage;
        dayReceiptsTotal += c.receipts;
      }
      const dayRcs = dayReceipts ? (dayReceipts.get(d) || []) : [];
      for (const rc of dayRcs) dayReceiptsTotal += toNOK(rc.amount, rc.currency);
      const dateObj = fromISODate(d);
      const projects = Array.from(new Set(dayRegs.map((r) => projectName(r)))).join(', ') || '—';

      return el('div', { class: 'period-day' }, [
        el('div', { class: 'period-day-head' }, [
          el('div', { class: 'period-day-date' }, [
            el('strong', {}, formatDateNo(dateObj)),
            el('span', { class: 'period-day-weekday' }, t('weekday.short.' + dateObj.getDay())),
          ]),
          el('div', { class: 'period-day-proj' }, projects),
        ]),
        el('div', { class: 'period-day-grid' }, [
          statItem('Timer', formatHours(dayHours, lang)),
          statItem('Lønn', 'kr ' + formatMoney(dayWage, lang)),
          statItem('Reise', 'kr ' + formatMoney(dayTravel, lang)),
          statItem('Kvitt.', 'kr ' + formatMoney(dayReceiptsTotal, lang)),
          statItem('Sum', 'kr ' + formatMoney(dayWage + dayTravel + dayReceiptsTotal, lang)),
        ]),
      ]);
    });

    // 3-column layout: Label | Perioden | Hittil i år. "kr" lives in the
    // header so values are just numbers — much more compact and aligned.
    const pct = (rate) => (Math.round((rate || 0) * 1000) / 10).toString().replace('.', ',');
    const vacPct = Math.round((summary.vacationPayRate || 0) * 100);
    const unionPct = pct(summary.unionDuesRate);
    const num = (v, neg) => (neg && v ? '-' : '') + formatMoney(v || 0, lang);
    function tRow(label, periodVal, ytdVal, opts) {
      opts = opts || {};
      const cls = 'totals-row'
        + (opts.primary ? ' is-primary' : '')
        + (opts.info ? ' is-info' : '');
      return el('div', { class: cls }, [
        el('div', { class: 'totals-row-label' }, label),
        el('div', { class: 'totals-row-period' }, num(periodVal, opts.negative)),
        el('div', { class: 'totals-row-ytd' }, num(ytdVal, opts.negative)),
      ]);
    }
    const ytd = ytdSummary || {};
    const ytdEnd = fromISODate(to);
    const totalsCard = el('div', { class: 'card period-totals-card' }, [
      el('div', { class: 'totals-card-head' }, [
        el('h3', { class: 'card-title' }, 'Periode-totaler'),
        el('span', { class: 'totals-style-badge', title: 'Reisegodtgjørelse-stil fra profil — endre på Profilside' }, styleLabel),
      ]),
      el('div', { class: 'totals-table mt-2' }, [
        el('div', { class: 'totals-row totals-header' }, [
          el('div', { class: 'totals-row-label' }, 'Beløp i kr'),
          el('div', { class: 'totals-row-period' }, 'Perioden'),
          el('div', { class: 'totals-row-ytd', title: '01.01 – ' + formatDateNo(ytdEnd) }, 'Akkumulert'),
        ]),
        tRow('Bruttolønn', summary.totalWage, ytd.totalWage),
        tRow('Feriepengegrunnlag', summary.vacationPayBasis, ytd.vacationPayBasis),
        tRow('Feriepenger ' + vacPct + '%', summary.vacationPayAccrued, ytd.vacationPayAccrued),
        tRow('Grunnlag tabelltrekk', summary.taxBasisAfterDues, ytd.taxBasisAfterDues),
        tRow('Fagforening ' + unionPct + '%', summary.unionDues, ytd.unionDues, { negative: true }),
        tRow('Forsikring', summary.insuranceTotal, ytd.insuranceTotal, { info: true }),
        tRow('Reise', summary.totalTravel, ytd.totalTravel, { info: true }),
        tRow('Kvitteringer', summary.totalReceipts, ytd.totalReceipts, { info: true }),
      ]),
    ]);

    // Code breakdown as stacked rows (no wide table)
    const codeRows = summary.codeTotals
      .filter((c) => c.amount > 0 || c.hours > 0)
      .sort((a, b) => b.amount - a.amount);

    const codeBreakdown = codeRows.length ? el('div', { class: 'card mt-3' }, [
      el('h3', { class: 'card-title mb-3' }, t('period.breakdown')),
      el('div', { class: 'code-breakdown' }, codeRows.map((c) =>
        el('div', { class: 'code-breakdown-row' }, [
          el('div', { class: 'code-breakdown-name' }, c.name),
          el('div', { class: 'code-breakdown-meta' }, [
            c.hours ? formatHours(c.hours, lang) + ' t · ' : '',
            c.count + ' stk',
          ]),
          el('div', { class: 'code-breakdown-amount' }, 'kr ' + formatMoney(c.amount, lang)),
        ])
      )),
    ]) : null;

    return el('div', {}, [
      totalsCard,
      el('div', { class: 'period-days mt-3' }, dayCards),
      codeBreakdown,
    ]);
  }

  function statItem(label, value, primary) {
    return el('div', { class: 'period-stat' + (primary ? ' is-primary' : '') }, [
      el('span', { class: 'period-stat-label' }, label),
      el('span', { class: 'period-stat-value' }, value),
    ]);
  }

  function projectName(reg) {
    const state = getState();
    const p = (state.projects || []).find((x) => x.id === reg.projectId);
    return p ? p.name : (reg.projectName || '—');
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.views = global.Timebok.views || {};
  global.Timebok.views.period = { renderPeriod };
})(window);
