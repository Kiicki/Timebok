// Minimal hash-based router.
(function (global) {
  const routes = new Map();
  let defaultRoute = '/week';
  let started = false;

  function route(path, handler) { routes.set(path, handler); }
  function setDefault(path) { defaultRoute = path; }

  function navigate(path) {
    if (location.hash !== '#' + path) location.hash = path;
    else handle();
  }

  function start() {
    if (!started) {
      window.addEventListener('hashchange', handle);
      started = true;
    }
    handle();
  }

  function handle() {
    const raw = location.hash.replace(/^#/, '') || defaultRoute;
    const parts = raw.split('?');
    const path = parts[0];
    const params = new URLSearchParams(parts[1] || '');
    let handler = routes.get(path);
    let match = null;

    if (!handler) {
      for (const [pattern, h] of routes) {
        const re = new RegExp('^' + pattern.replace(/:[^/]+/g, '([^/]+)') + '$');
        const m = path.match(re);
        if (m) {
          handler = h;
          const keys = (pattern.match(/:[^/]+/g) || []).map((k) => k.slice(1));
          match = {};
          keys.forEach((k, i) => { match[k] = decodeURIComponent(m[i + 1]); });
          break;
        }
      }
    }
    if (!handler) { navigate(defaultRoute); return; }
    // Always show new pages from the top.
    window.scrollTo(0, 0);
    handler({ params, match: match || {} });
  }

  function currentPath() {
    return (location.hash || '').replace(/^#/, '').split('?')[0] || defaultRoute;
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.router = { route, setDefault, navigate, start, currentPath };
})(window);
