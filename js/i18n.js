// Simple i18n: dictionary lookup + persistent language selection.
(function (global) {
  const DICT = {
    nb: {
      'app.title': 'Timebok',
      'nav.week': 'Uke', 'nav.period': 'Periode', 'nav.admin': 'Admin',
      'nav.profile': 'Profil', 'nav.logout': 'Logg ut',

      'common.save': 'Lagre', 'common.cancel': 'Avbryt', 'common.delete': 'Slett',
      'common.edit': 'Endre', 'common.add': 'Legg til', 'common.close': 'Lukk',
      'common.yes': 'Ja', 'common.no': 'Nei', 'common.confirm': 'Bekreft',
      'common.loading': 'Laster …', 'common.amount': 'Beløp (kr)',
      'common.description': 'Beskrivelse', 'common.kr': 'kr',
      'common.hours': 'timer', 'common.minutes': 'min',
      'common.from': 'Fra', 'common.to': 'Til',
      'common.required': 'Påkrevd', 'common.optional': 'Valgfritt', 'common.total': 'Totalt',

      'login.title': 'Logg inn',
      'login.subtitle': 'Registrer timer, reise og kvitteringer',
      'login.email': 'E-post', 'login.password': 'Passord', 'login.submit': 'Logg inn',
      'login.error': 'Innlogging feilet. Sjekk e-post og passord.',
      'login.localMode': 'Lokal modus (Firebase ikke konfigurert)',

      'week.title': 'Uke', 'week.thisWeek': 'Denne uken',
      'week.prev': 'Forrige uke', 'week.next': 'Neste uke',
      'week.summary': 'Ukesammendrag',
      'week.totalHours': 'Totale timer', 'week.totalWage': 'Totallønn',
      'week.totalTravel': 'Reisegodtgjørelse', 'week.totalReceipts': 'Kvitteringer',
      'week.noRegistrations': 'Ingen registreringer',
      'week.addRegistration': 'Ny registrering',
      'week.weekNumber': 'Uke {w}, {y}',

      'day.title': 'Dagsregistrering',
      'day.project': 'Prosjekt', 'day.selectProject': 'Ingen prosjekt',
      'day.start': 'Start', 'day.end': 'Slutt',
      'day.lunchUnpaid': 'Ubetalt lunsj', 'day.lunchMinutes': 'Lunsjpause (min)',
      'day.workHours': 'Arbeidstimer',
      'day.codes': 'Tilleggskoder', 'day.addCode': 'Legg til kode',
      'day.receipts': 'Kvitteringer', 'day.addReceipt': 'Legg til kvittering',
      'day.attachment': 'Vedlegg',
      'day.kmAmount': 'Antall km',
      'day.transportType': 'Transporttype', 'day.distanceZone': 'Avstand',
      'day.firmaBil': 'Firma', 'day.privatBil': 'Privat',
      'day.codeAmount': 'Beløp (kr)', 'day.codeHours': 'Timer',
      'day.deleteConfirm': 'Slette denne registreringen?',

      'period.title': 'Periodevisning',
      'period.from': 'Fra dato', 'period.to': 'Til dato',
      'period.generate': 'Vis periode',
      'period.exportPdf': 'Eksporter PDF', 'period.exportExcel': 'Eksporter Excel',
      'period.breakdown': 'Detaljer', 'period.totals': 'Totaler',
      'period.noData': 'Ingen registreringer i perioden.',

      'admin.title': 'Admin',
      'admin.projects': 'Prosjekter', 'admin.projectName': 'Prosjektnavn',
      'admin.addProject': 'Nytt prosjekt',
      'admin.rates': 'Satser', 'admin.kmRate': 'Km-godtgjørelse (kr/km)',
      'admin.travelRates': 'Reisegodtgjørelse', 'admin.fixedCodes': 'Faste kode-satser',
      'admin.codeRate': 'Sats (kr)', 'admin.users': 'Brukere',

      'profile.title': 'Profil', 'profile.name': 'Navn', 'profile.email': 'E-post',
      'profile.hourlyRate': 'Timesats (kr)', 'profile.companyStyle': 'Bedrift (reisegodtgjørelse-stil)',
      'profile.styleFiresafe': 'Firesafe', 'profile.styleDamsgard': 'Damsgård Brannsikring',
      'profile.role': 'Rolle', 'profile.roleAdmin': 'Administrator', 'profile.roleUser': 'Bruker',

      'weekday.0': 'Søndag', 'weekday.1': 'Mandag', 'weekday.2': 'Tirsdag',
      'weekday.3': 'Onsdag', 'weekday.4': 'Torsdag', 'weekday.5': 'Fredag', 'weekday.6': 'Lørdag',
      'weekday.short.0': 'Søn', 'weekday.short.1': 'Man', 'weekday.short.2': 'Tir',
      'weekday.short.3': 'Ons', 'weekday.short.4': 'Tor', 'weekday.short.5': 'Fre', 'weekday.short.6': 'Lør',
      'month.0': 'januar', 'month.1': 'februar', 'month.2': 'mars',
      'month.3': 'april', 'month.4': 'mai', 'month.5': 'juni',
      'month.6': 'juli', 'month.7': 'august', 'month.8': 'september',
      'month.9': 'oktober', 'month.10': 'november', 'month.11': 'desember',
      'month.short.0': 'jan', 'month.short.1': 'feb', 'month.short.2': 'mar',
      'month.short.3': 'apr', 'month.short.4': 'mai', 'month.short.5': 'jun',
      'month.short.6': 'jul', 'month.short.7': 'aug', 'month.short.8': 'sep',
      'month.short.9': 'okt', 'month.short.10': 'nov', 'month.short.11': 'des',

      'toast.saved': 'Lagret', 'toast.deleted': 'Slettet', 'toast.error': 'Noe gikk galt',
    },

    en: {
      'app.title': 'Timebok',
      'nav.week': 'Week', 'nav.period': 'Period', 'nav.admin': 'Admin',
      'nav.profile': 'Profile', 'nav.logout': 'Log out',

      'common.save': 'Save', 'common.cancel': 'Cancel', 'common.delete': 'Delete',
      'common.edit': 'Edit', 'common.add': 'Add', 'common.close': 'Close',
      'common.yes': 'Yes', 'common.no': 'No', 'common.confirm': 'Confirm',
      'common.loading': 'Loading …', 'common.amount': 'Amount (kr)',
      'common.description': 'Description', 'common.kr': 'kr',
      'common.hours': 'hours', 'common.minutes': 'min',
      'common.from': 'From', 'common.to': 'To',
      'common.required': 'Required', 'common.optional': 'Optional', 'common.total': 'Total',

      'login.title': 'Sign in',
      'login.subtitle': 'Register hours, travel and receipts',
      'login.email': 'Email', 'login.password': 'Password', 'login.submit': 'Sign in',
      'login.error': 'Sign-in failed. Check email and password.',
      'login.localMode': 'Local mode (Firebase not configured)',

      'week.title': 'Week', 'week.thisWeek': 'This week',
      'week.prev': 'Previous week', 'week.next': 'Next week',
      'week.summary': 'Week summary',
      'week.totalHours': 'Total hours', 'week.totalWage': 'Total wage',
      'week.totalTravel': 'Travel comp.', 'week.totalReceipts': 'Receipts',
      'week.noRegistrations': 'No registrations',
      'week.addRegistration': 'New registration',
      'week.weekNumber': 'Week {w}, {y}',

      'day.title': 'Day registration',
      'day.project': 'Project', 'day.selectProject': 'No project',
      'day.start': 'Start', 'day.end': 'End',
      'day.lunchUnpaid': 'Unpaid lunch', 'day.lunchMinutes': 'Lunch break (min)',
      'day.workHours': 'Work hours',
      'day.codes': 'Codes', 'day.addCode': 'Add code',
      'day.receipts': 'Receipts', 'day.addReceipt': 'Add receipt',
      'day.attachment': 'Attachment',
      'day.kmAmount': 'Kilometers',
      'day.transportType': 'Transport', 'day.distanceZone': 'Distance',
      'day.firmaBil': 'Company', 'day.privatBil': 'Private',
      'day.codeAmount': 'Amount (kr)', 'day.codeHours': 'Hours',
      'day.deleteConfirm': 'Delete this registration?',

      'period.title': 'Period report',
      'period.from': 'From date', 'period.to': 'To date',
      'period.generate': 'Show period',
      'period.exportPdf': 'Export PDF', 'period.exportExcel': 'Export Excel',
      'period.breakdown': 'Breakdown', 'period.totals': 'Totals',
      'period.noData': 'No registrations in period.',

      'admin.title': 'Admin',
      'admin.projects': 'Projects', 'admin.projectName': 'Project name',
      'admin.addProject': 'New project',
      'admin.rates': 'Rates', 'admin.kmRate': 'Km rate (kr/km)',
      'admin.travelRates': 'Travel rates', 'admin.fixedCodes': 'Fixed code rates',
      'admin.codeRate': 'Rate (kr)', 'admin.users': 'Users',

      'profile.title': 'Profile', 'profile.name': 'Name', 'profile.email': 'Email',
      'profile.hourlyRate': 'Hourly rate (kr)', 'profile.companyStyle': 'Employer (travel-pay style)',
      'profile.styleFiresafe': 'Firesafe', 'profile.styleDamsgard': 'Damsgård Brannsikring',
      'profile.role': 'Role', 'profile.roleAdmin': 'Administrator', 'profile.roleUser': 'User',

      'weekday.0': 'Sunday', 'weekday.1': 'Monday', 'weekday.2': 'Tuesday',
      'weekday.3': 'Wednesday', 'weekday.4': 'Thursday', 'weekday.5': 'Friday', 'weekday.6': 'Saturday',
      'weekday.short.0': 'Sun', 'weekday.short.1': 'Mon', 'weekday.short.2': 'Tue',
      'weekday.short.3': 'Wed', 'weekday.short.4': 'Thu', 'weekday.short.5': 'Fri', 'weekday.short.6': 'Sat',
      'month.0': 'January', 'month.1': 'February', 'month.2': 'March',
      'month.3': 'April', 'month.4': 'May', 'month.5': 'June',
      'month.6': 'July', 'month.7': 'August', 'month.8': 'September',
      'month.9': 'October', 'month.10': 'November', 'month.11': 'December',
      'month.short.0': 'Jan', 'month.short.1': 'Feb', 'month.short.2': 'Mar',
      'month.short.3': 'Apr', 'month.short.4': 'May', 'month.short.5': 'Jun',
      'month.short.6': 'Jul', 'month.short.7': 'Aug', 'month.short.8': 'Sep',
      'month.short.9': 'Oct', 'month.short.10': 'Nov', 'month.short.11': 'Dec',

      'toast.saved': 'Saved', 'toast.deleted': 'Deleted', 'toast.error': 'Something went wrong',
    },
  };

  let currentLang = localStorage.getItem('timebok.lang') || 'nb';
  const listeners = new Set();

  function t(key, vars) {
    let str = (DICT[currentLang] && DICT[currentLang][key]) || DICT.nb[key] || key;
    if (vars) {
      for (const k in vars) str = str.split('{' + k + '}').join(String(vars[k]));
    }
    return str;
  }

  function getLang() { return currentLang; }

  function setLang(lang) {
    if (!DICT[lang]) return;
    currentLang = lang;
    localStorage.setItem('timebok.lang', lang);
    document.documentElement.lang = lang;
    applyTranslations(document);
    listeners.forEach((fn) => fn(lang));
  }

  function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function applyTranslations(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
  }

  document.documentElement.lang = currentLang;

  global.Timebok = global.Timebok || {};
  global.Timebok.i18n = { t, getLang, setLang, onLangChange, applyTranslations };
})(window);
