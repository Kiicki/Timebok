// Main app entry — bootstraps everything once all modules are loaded.
(function (global) {
  const { initData, auth, getMode } = global.Timebok.data;
  const { loadAll, get: getState, isAdmin } = global.Timebok.state;
  const { applyTranslations, onLangChange } = global.Timebok.i18n;
  const { bindDismissers } = global.Timebok.dom;
  const { route, start: startRouter, navigate, currentPath } = global.Timebok.router;

  // Default icons used by views via setTopbar({ leftIcon: ICONS.xxx, ... }).
  const ICONS = {
    weekGrid: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zM5 8h14v12H5V8z"/></svg>',
    todayCard: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 18H5V8h14v13zM7 11h5v5H7v-5z"/></svg>',
    arrowBack: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M15.7 4.3a1 1 0 0 1 0 1.4L9.4 12l6.3 6.3a1 1 0 1 1-1.4 1.4l-7-7a1 1 0 0 1 0-1.4l7-7a1 1 0 0 1 1.4 0z"/></svg>',
  };

  // Reset topbar to its default state (called on every route change).
  function resetTopbar() {
    const title = document.getElementById('topbarTitle');
    title.textContent = 'Timebok';
    title.classList.remove('is-clickable');
    title.onclick = null;
    const sub = document.getElementById('topbarSub');
    sub.textContent = '';
    sub.hidden = true;
    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    prev.hidden = true; prev.onclick = null; prev.title = '';
    next.hidden = true; next.onclick = null; next.title = '';
    const left = document.getElementById('backBtn');
    left.onclick = null; left.title = '';
    left.hidden = false;
    left.classList.add('invisible'); // keep slot for centering
    const topbar = document.getElementById('topbar');
    if (topbar) topbar.classList.remove('is-current');
  }
  // Each view calls setTopbar({ title, subtitle, prev, next, onTitleClick,
  //                              leftIcon, leftAction, leftTitle }).
  //   prev / next   — chevron arrows flanking the title (typically prev/next
  //                   day or week).
  //   onTitleClick  — optional handler when the user taps the title
  //                   (typically "jump to today / this week"). Subtle cursor hint.
  //   leftIcon      — SVG markup for the left-most icon (calendar / today /
  //                   back arrow, etc.). Pair with leftAction.
  //   leftAction    — handler for the left-icon button.
  function setTopbar(opts) {
    opts = opts || {};
    const title = document.getElementById('topbarTitle');
    if (opts.title) title.textContent = opts.title;

    if (typeof opts.onTitleClick === 'function') {
      title.classList.add('is-clickable');
      title.onclick = opts.onTitleClick;
    } else {
      title.classList.remove('is-clickable');
      title.onclick = null;
    }

    const sub = document.getElementById('topbarSub');
    if (opts.subtitle) {
      sub.textContent = opts.subtitle;
      sub.hidden = false;
    } else {
      sub.textContent = '';
      sub.hidden = true;
    }

    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    if (typeof opts.prev === 'function') {
      prev.hidden = false; prev.onclick = opts.prev;
      if (opts.prevTitle) prev.title = opts.prevTitle;
    } else {
      prev.hidden = true; prev.onclick = null;
    }
    if (typeof opts.next === 'function') {
      next.hidden = false; next.onclick = opts.next;
      if (opts.nextTitle) next.title = opts.nextTitle;
    } else {
      next.hidden = true; next.onclick = null;
    }

    const left = document.getElementById('backBtn');
    left.hidden = false; // slot must occupy space so title stays centered
    if (opts.leftIcon && typeof opts.leftAction === 'function') {
      left.innerHTML = opts.leftIcon;
      left.onclick = opts.leftAction;
      left.title = opts.leftTitle || '';
      left.classList.remove('invisible');
    } else {
      left.onclick = null;
      left.classList.add('invisible'); // keep slot for centering
    }

    // isCurrent: tint the topbar so user instantly sees they're on today's
    // day or this week (vs a past/future view). Off by default.
    const topbar = document.getElementById('topbar');
    if (topbar) topbar.classList.toggle('is-current', !!opts.isCurrent);
  }
  global.Timebok.chrome = { setTopbar, resetTopbar, ICONS };

  const { renderLogin } = global.Timebok.views.login;
  const { renderWeek } = global.Timebok.views.week;
  const { renderDay } = global.Timebok.views.day;
  const { renderPeriod } = global.Timebok.views.period;
  const { renderAdmin } = global.Timebok.views.admin;
  const { renderProfile } = global.Timebok.views.profile;

  route('/week', () => requireAuth(renderWeek));
  route('/period', () => requireAuth(renderPeriod));
  route('/admin', () => requireAuth(renderAdmin));
  route('/profile', () => requireAuth(renderProfile));
  route('/day/:date', (ctx) => requireAuth(() => renderDay(ctx)));
  route('/login', () => renderLogin());

  function requireAuth(fn) {
    const state = getState();
    if (!state.user) { renderLogin(); return; }
    return fn();
  }

  function setupChrome() {
    bindDismissers();
    applyTranslations(document);

    document.getElementById('menuBtn').addEventListener('click', () => {
      document.getElementById('drawer').hidden = false;
      updateDrawer();
    });

    // Reset topbar on route change so the next view starts from defaults
    // (then immediately sets its own title via setTopbar). Opening the drawer
    // does NOT trigger this — see updateDrawer().
    window.addEventListener('hashchange', resetTopbar);

    document.getElementById('logoutBtn').addEventListener('click', async (e) => {
      e.preventDefault();
      await auth.signOut();
      document.getElementById('drawer').hidden = true;
    });

    document.querySelectorAll('.drawer-list a[href^="#/"]').forEach((a) => {
      a.addEventListener('click', () => { document.getElementById('drawer').hidden = true; });
    });

    onLangChange(() => {
      applyTranslations(document);
      startRouter();
      updateDrawer();
    });
  }

  function updateDrawer() {
    const state = getState();
    const profile = state.profile;
    document.getElementById('navName').textContent = (profile && profile.name) || (state.user && state.user.email) || '—';
    document.getElementById('navEmail').textContent = (state.user && state.user.email) || '';
    const seed = ((profile && profile.name) || (state.user && state.user.email) || '?').trim();
    document.getElementById('navAvatar').textContent = seed.charAt(0).toUpperCase();

    document.querySelectorAll('.admin-only').forEach((node) => {
      node.style.display = isAdmin() ? '' : 'none';
    });

    const srcLabel = document.getElementById('dataSourceLabel');
    if (srcLabel) srcLabel.textContent = getMode() === 'firebase' ? 'Firebase' : 'Lokal modus';
  }

  // Service worker only works on http(s)://, not file://
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW reg failed', e));
    });
  }

  (async function boot() {
    setupChrome();
    await initData();

    auth.onChange(async (user) => {
      await loadAll(user);
      updateDrawer();
      if (!user) {
        renderLogin();
      } else {
        const path = currentPath();
        if (path === '/login' || !location.hash) navigate('/week');
        else startRouter();
      }
    });

    startRouter();
  })();
})(window);
