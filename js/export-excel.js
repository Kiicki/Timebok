// Excel export — loads SheetJS via CDN <script> tag on first use.
(function (global) {
  const { calcRegistration, calcDayTravel, groupByDate, resolveTariffForDate } = global.Timebok.calc;
  const { fromISODate, formatDateNo } = global.Timebok.dateUtils;

  function ratesForDate(state, dateISO) {
    if (state && Array.isArray(state.tariffs) && state.tariffs.length) {
      return resolveTariffForDate(state.tariffs, dateISO);
    }
    return (state && state.rates) || {};
  }

  let xlsxReady = null;
  function loadXlsx() {
    if (xlsxReady) return xlsxReady;
    xlsxReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = () => resolve(global.XLSX);
      s.onerror = () => reject(new Error('Failed to load SheetJS'));
      document.head.appendChild(s);
    });
    return xlsxReady;
  }

  async function exportExcel(result, state) {
    const { from, to, regs, summary } = result;
    const dayReceipts = result.dayReceipts; // Map<dateISO, items[]>
    await loadXlsx();
    const XLSX = global.XLSX;
    if (!XLSX) throw new Error('SheetJS not available (offline?)');

    const wb = XLSX.utils.book_new();

    const dayRows = [
      ['Dato', 'Ukedag', 'Prosjekt', 'Timer', 'Lønn', 'Reise', 'Kvitteringer', 'Sum'],
    ];
    const byDate = groupByDate(regs);
    const dates = Array.from(byDate.keys()).sort();
    for (const d of dates) {
      const dayRegs = byDate.get(d);
      const dayRates = ratesForDate(state, d);
      const dayTravel = calcDayTravel(dayRegs, state.profile, dayRates);
      const dayRcs = dayReceipts ? (dayReceipts.get(d) || []) : [];
      let dayRcAmount = 0;
      for (const rc of dayRcs) dayRcAmount += Number(rc.amount) || 0;
      for (let i = 0; i < dayRegs.length; i++) {
        const r = dayRegs[i];
        const c = calcRegistration(r, state.profile, dayRates);
        const dateObj = fromISODate(r.date);
        const project = projectNameFor(r, state);
        let totalHours = 0;
        for (const cb of c.codeBreakdown) if (cb.hours) totalHours += cb.hours;
        const rcThisRow = i === 0 ? (c.receipts + dayRcAmount) : c.receipts;
        dayRows.push([
          formatDateNo(dateObj),
          ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'][dateObj.getDay()],
          project,
          round2(totalHours),
          round2(c.wage),
          i === 0 ? round2(dayTravel) : 0,
          round2(rcThisRow),
          round2(c.wage + (i === 0 ? dayTravel : 0) + rcThisRow),
        ]);
      }
    }
    dayRows.push([]);
    dayRows.push(['TOTALT', '', '',
      round2(summary.totalHours),
      round2(summary.totalWage),
      round2(summary.totalTravel),
      round2(summary.totalReceipts),
      round2(summary.totalWage + summary.totalTravel + summary.totalReceipts),
    ]);

    const ws1 = XLSX.utils.aoa_to_sheet(dayRows);
    ws1['!cols'] = [{ wch: 12 }, { wch: 7 }, { wch: 24 }, { wch: 7 }, { wch: 7 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Dager');

    const codeRows = [['Kode', 'Timer', 'Antall', 'Beløp']];
    for (const c of summary.codeTotals.sort((a, b) => b.amount - a.amount)) {
      codeRows.push([c.name, round2(c.hours), c.count, round2(c.amount)]);
    }
    const ws2 = XLSX.utils.aoa_to_sheet(codeRows);
    ws2['!cols'] = [{ wch: 32 }, { wch: 8 }, { wch: 8 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Koder');

    const meta = [
      ['Navn', (state.profile && state.profile.name) || ''],
      ['E-post', (state.profile && state.profile.email) || ''],
      ['Timesats', round2(Number((state.profile && state.profile.hourlyRate) || 0))],
      ['Bedriftsstil', (state.profile && state.profile.companyStyle) || ''],
      ['Periode fra', from],
      ['Periode til', to],
      ['Generert', new Date().toISOString()],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(meta);
    ws3['!cols'] = [{ wch: 16 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Info');

    XLSX.writeFile(wb, 'timebok_' + from + '_' + to + '.xlsx');
  }

  function round2(n) { return Math.round((n || 0) * 100) / 100; }
  function projectNameFor(reg, state) {
    const p = (state.projects || []).find((x) => x.id === reg.projectId);
    return p ? p.name : (reg.projectName || '—');
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.exportExcel = { exportExcel };
})(window);
