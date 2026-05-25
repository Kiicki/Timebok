// PDF export — loads jsPDF via CDN <script> tag on first use.
(function (global) {
  const { calcRegistration, calcDayTravel, groupByDate } = global.Timebok.calc;
  const { fromISODate, formatHours, formatMoney, formatDateNo } = global.Timebok.dateUtils;

  let jsPDFReady = null;
  function loadJsPDF() {
    if (jsPDFReady) return jsPDFReady;
    jsPDFReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      s.onload = () => resolve(global.jspdf || global.jsPDF ? global.jspdf : null);
      s.onerror = () => reject(new Error('Failed to load jsPDF'));
      document.head.appendChild(s);
    });
    return jsPDFReady;
  }

  async function exportPDF(result, state) {
    const { from, to, regs, summary } = result;
    const dayReceipts = result.dayReceipts; // Map<dateISO, items[]>
    await loadJsPDF();
    const jsPDFCtor = (global.jspdf && global.jspdf.jsPDF) || global.jsPDF;
    if (!jsPDFCtor) throw new Error('jsPDF not available (offline?)');
    const doc = new jsPDFCtor({ unit: 'pt', format: 'a4' });

    const lang = 'nb-NO';
    const m = 40;
    let y = m;

    doc.setFontSize(18);
    doc.text('Timebok – periodevisning', m, y); y += 22;
    doc.setFontSize(11);
    doc.text('Navn: ' + (state.profile && state.profile.name || ''), m, y); y += 14;
    doc.text('Periode: ' + formatDateNo(from) + ' til ' + formatDateNo(to), m, y); y += 14;
    doc.text('Timesats: kr ' + formatMoney(Number(state.profile && state.profile.hourlyRate || 0), lang)
      + '  ·  Bedriftsstil: ' + ((state.profile && state.profile.companyStyle) || ''), m, y); y += 18;

    doc.setFontSize(10);
    const cols = [
      { label: 'Dato', w: 60 },
      { label: 'Ukedag', w: 40 },
      { label: 'Prosjekt', w: 130 },
      { label: 'Timer', w: 40, num: true },
      { label: 'Lønn', w: 60, num: true },
      { label: 'Reise', w: 50, num: true },
      { label: 'Kvitt.', w: 50, num: true },
      { label: 'Sum', w: 70, num: true },
    ];

    drawRow(doc, cols, cols.map((c) => c.label), m, y, true); y += 16;

    const byDate = groupByDate(regs);
    const allDates = new Set(byDate.keys());
    if (dayReceipts) dayReceipts.forEach((_, d) => allDates.add(d));
    const sortedDates = Array.from(allDates).sort();
    for (const d of sortedDates) {
      if (y > 760) { doc.addPage(); y = m; drawRow(doc, cols, cols.map((c) => c.label), m, y, true); y += 16; }
      const dayRegs = byDate.get(d) || [];
      const dayTravel = calcDayTravel(dayRegs, state.profile, state.rates);
      let dayHours = 0, dayWage = 0, dayReceiptsTot = 0;
      for (const r of dayRegs) {
        const c = calcRegistration(r, state.profile, state.rates);
        for (const cb of c.codeBreakdown) if (cb.hours) dayHours += cb.hours;
        dayWage += c.wage;
        dayReceiptsTot += c.receipts;
      }
      const dayRcs = dayReceipts ? (dayReceipts.get(d) || []) : [];
      for (const rc of dayRcs) dayReceiptsTot += Number(rc.amount) || 0;
      const dateObj = fromISODate(d);
      const projects = Array.from(new Set(dayRegs.map((r) => projectNameFor(r, state)))).join(', ');
      drawRow(doc, cols, [
        formatDateNo(dateObj),
        ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'][dateObj.getDay()],
        projects,
        formatHours(dayHours, lang),
        formatMoney(dayWage, lang),
        formatMoney(dayTravel, lang),
        formatMoney(dayReceiptsTot, lang),
        formatMoney(dayWage + dayTravel + dayReceiptsTot, lang),
      ], m, y);
      y += 14;
    }

    if (y > 720) { doc.addPage(); y = m; }
    y += 6;
    doc.setDrawColor(120);
    const totalW = cols.reduce((s, c) => s + c.w, 0);
    doc.line(m, y, m + totalW, y); y += 14;
    drawRow(doc, cols, [
      'TOTALT', '', '',
      formatHours(summary.totalHours, lang),
      formatMoney(summary.totalWage, lang),
      formatMoney(summary.totalTravel, lang),
      formatMoney(summary.totalReceipts, lang),
      formatMoney(summary.totalWage + summary.totalTravel + summary.totalReceipts, lang),
    ], m, y, true);
    y += 28;

    doc.setFontSize(12);
    doc.text('Detaljer pr. kode', m, y); y += 16;
    doc.setFontSize(10);
    const codeCols = [
      { label: 'Kode', w: 200 },
      { label: 'Timer', w: 60, num: true },
      { label: 'Antall', w: 60, num: true },
      { label: 'Beløp', w: 80, num: true },
    ];
    drawRow(doc, codeCols, codeCols.map((c) => c.label), m, y, true); y += 14;
    const sortedCodes = summary.codeTotals
      .filter((c) => c.amount > 0 || c.hours > 0)
      .sort((a, b) => b.amount - a.amount);
    for (const c of sortedCodes) {
      if (y > 780) { doc.addPage(); y = m; }
      drawRow(doc, codeCols, [
        c.name,
        c.hours ? formatHours(c.hours, lang) : '',
        String(c.count),
        formatMoney(c.amount, lang),
      ], m, y);
      y += 12;
    }

    doc.save('timebok_' + from + '_' + to + '.pdf');
  }

  function drawRow(doc, cols, values, x, y, bold) {
    if (bold) doc.setFont(undefined, 'bold'); else doc.setFont(undefined, 'normal');
    let cx = x;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const v = String(values[i] != null ? values[i] : '');
      if (c.num) doc.text(v, cx + c.w - 2, y, { align: 'right' });
      else doc.text(truncate(v, Math.floor(c.w / 5)), cx + 2, y);
      cx += c.w;
    }
    doc.setFont(undefined, 'normal');
  }

  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function projectNameFor(reg, state) {
    const p = (state.projects || []).find((x) => x.id === reg.projectId);
    return p ? p.name : (reg.projectName || '—');
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.exportPdf = { exportPDF };
})(window);
