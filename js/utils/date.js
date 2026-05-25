// ISO week + date helpers. Norwegian week starts Monday.
(function (global) {
  function pad2(n) { return String(n).padStart(2, '0'); }

  function toISODate(d) {
    if (typeof d === 'string') return d;
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function fromISODate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  function getISOWeekYear(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    return d.getUTCFullYear();
  }

  function startOfWeek(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function endOfWeek(date) {
    const d = startOfWeek(date);
    d.setDate(d.getDate() + 6);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  function addWeeks(date, n) { return addDays(date, n * 7); }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  function parseTime(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  function formatTime(minutes) {
    if (minutes == null) return '';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${pad2(h)}:${pad2(m)}`;
  }

  function diffMinutes(startHHMM, endHHMM) {
    const s = parseTime(startHHMM);
    let e = parseTime(endHHMM);
    if (s == null || e == null) return 0;
    if (e < s) e += 24 * 60;
    return e - s;
  }

  function formatHours(hours, locale = 'nb-NO') {
    return (hours || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatMoney(amount, locale = 'nb-NO') {
    return (amount || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Parse a number string that may use either '.' or ',' as decimal separator
  // (Norwegian standard is ','). Returns 0 for empty/invalid input.
  function parseNum(s) {
    if (s == null || s === '') return 0;
    const n = Number(String(s).replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  // Display a JS number with Norwegian decimal comma (no trailing zeros).
  function displayNum(n) {
    if (n == null || n === '') return '';
    return String(n).replace('.', ',');
  }

  // Norwegian date format: dd.mm.yyyy. Accepts ISO string or Date.
  function formatDateNo(d) {
    if (!d) return '';
    const date = typeof d === 'string' ? fromISODate(d) : d;
    return pad2(date.getDate()) + '.' + pad2(date.getMonth() + 1) + '.' + date.getFullYear();
  }
  // Parse dd.mm.yyyy (or dd-mm-yyyy / dd/mm/yyyy) → ISO string yyyy-mm-dd.
  // Returns '' if not parseable.
  function parseDateNo(s) {
    if (!s) return '';
    const m = String(s).trim().match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
    if (!m) return '';
    const d = Number(m[1]); const mo = Number(m[2]); let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900 || y > 2100) return '';
    return y + '-' + pad2(mo) + '-' + pad2(d);
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.dateUtils = {
    pad2, toISODate, fromISODate, getISOWeek, getISOWeekYear,
    startOfWeek, endOfWeek, addDays, addWeeks, sameDay,
    parseTime, formatTime, diffMinutes, formatHours, formatMoney, parseNum, displayNum, formatDateNo, parseDateNo,
  };
})(window);
