// Lightweight reactive state for the current session.
(function (global) {
  const { db } = global.Timebok.data;

  const state = {
    user: null,
    profile: null,
    projects: [],
    rates: {},
  };

  const listeners = new Set();

  function get() { return state; }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit() { listeners.forEach((fn) => fn(state)); }

  async function loadAll(user) {
    state.user = user;
    if (!user) {
      state.profile = null;
      state.projects = [];
      state.rates = {};
      emit();
      return;
    }
    const [profile, gl] = await Promise.all([db.getProfile(user.id), db.getGlobal()]);
    state.profile = profile || null;
    state.projects = gl.projects || [];
    state.rates = gl.rates || {};
    emit();
  }

  async function refreshGlobal() {
    const g = await db.getGlobal();
    state.projects = g.projects || [];
    state.rates = g.rates || {};
    emit();
  }

  async function refreshProfile() {
    if (!state.user) return;
    state.profile = await db.getProfile(state.user.id);
    emit();
  }

  function isAdmin() {
    return !!(state.profile && state.profile.role === 'admin');
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.state = { get, subscribe, loadAll, refreshGlobal, refreshProfile, isAdmin };
})(window);
