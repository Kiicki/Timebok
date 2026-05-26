// Data layer: unified API over Firebase (when configured) and localStorage.
// Falls back to localStorage so the app works from file:// with no setup.
(function (global) {
  const cfg = global.TimebokConfig || {};
  // Firebase støtter ikke OAuth-popup over file:// — Google avviser med
  // auth/unauthorized-domain. Når brukeren dobbeltklikker index.html lokalt
  // (file://) tvinger vi lokal-modus så test-admin-knappen funker som
  // dokumentert i README. Firebase-modus brukes som normalt på http(s)://.
  const isFileProtocol = (global.location && global.location.protocol === 'file:');
  const FIREBASE_ENABLED = !!cfg.ENABLED && !isFileProtocol;
  const ADMIN_EMAIL = cfg.ADMIN_EMAIL || '';

  const LS = {
    user: 'timebok.user',
    profilePrefix: 'timebok.profile.',
    regsPrefix: 'timebok.regs.',
    receiptsPrefix: 'timebok.receipts.',
    global: 'timebok.global',
  };

  let mode = 'local';
  let fb = null;
  const authListeners = new Set();
  let currentUser = null;

  async function initData() {
    if (FIREBASE_ENABLED) {
      try {
        await initFirebase();
        mode = 'firebase';
      } catch (e) {
        console.warn('Firebase init failed, falling back to local mode:', e);
        mode = 'local';
      }
    }
    if (mode === 'local') initLocal();
    return { mode };
  }

  function getMode() { return mode; }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function initFirebase() {
    // Use Firebase compat SDK (works as classic scripts).
    await loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
    await Promise.all([
      loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js'),
      loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js'),
      loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage-compat.js'),
    ]);
    const firebase = global.firebase;
    firebase.initializeApp(cfg.FIREBASE_CONFIG);
    fb = {
      auth: firebase.auth(),
      db: firebase.firestore(),
      storage: firebase.storage(),
    };

    fb.auth.onAuthStateChanged(async (u) => {
      if (u) {
        const ref = fb.db.collection('users').doc(u.uid);
        const snap = await ref.get();
        if (!snap.exists) {
          const isAdmin = (u.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();
          await ref.set({
            name: u.displayName || u.email,
            email: u.email,
            hourlyRate: 0,
            role: isAdmin ? 'admin' : 'user',
            companyStyle: 'firesafe',
            createdAt: Date.now(),
          });
        }
        currentUser = { id: u.uid, email: u.email };
      } else {
        currentUser = null;
      }
      authListeners.forEach((fn) => fn(currentUser));
    });
  }

  function initLocal() {
    const raw = localStorage.getItem(LS.user);
    if (raw) {
      try { currentUser = JSON.parse(raw); } catch (e) { currentUser = null; }
    }
    if (!localStorage.getItem(LS.global)) {
      localStorage.setItem(LS.global, JSON.stringify({ projects: [], rates: {} }));
    }
    setTimeout(() => authListeners.forEach((fn) => fn(currentUser)), 0);
  }

  const auth = {
    current() { return currentUser; },
    onChange(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },

    async signInWithGoogle() {
      if (mode !== 'firebase') throw new Error('Google sign-in requires Firebase mode');
      const provider = new firebase.auth.GoogleAuthProvider();
      await fb.auth.signInWithPopup(provider);
    },

    async signInWithMicrosoft() {
      if (mode !== 'firebase') throw new Error('Microsoft sign-in requires Firebase mode');
      const provider = new firebase.auth.OAuthProvider('microsoft.com');
      // Common-tenant lar både personlige Microsoft-kontoer og Azure AD logge inn.
      provider.setCustomParameters({ tenant: 'common' });
      await fb.auth.signInWithPopup(provider);
    },

    async signIn(email, password) {
      // Local-mode only. Firebase uses signInWithGoogle() exclusively — adding
      // an email/password path here would let anyone create a Firebase admin
      // account simply by signing in with ADMIN_EMAIL.
      if (mode === 'firebase') throw new Error('Use signInWithGoogle in Firebase mode');
      const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      const id = 'local-' + btoa(email).replace(/=+$/, '');
      currentUser = { id, email };
      localStorage.setItem(LS.user, JSON.stringify(currentUser));
      const key = LS.profilePrefix + id;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify({
          name: email.split('@')[0],
          email,
          hourlyRate: 0,
          role: isAdmin ? 'admin' : 'user',
          companyStyle: 'firesafe',
          createdAt: Date.now(),
        }));
      }
      authListeners.forEach((fn) => fn(currentUser));
    },

    async signOut() {
      if (mode === 'firebase') {
        await fb.auth.signOut();
        return;
      }
      currentUser = null;
      localStorage.removeItem(LS.user);
      authListeners.forEach((fn) => fn(null));
    },
  };

  const db = {
    async getProfile(userId) {
      if (mode === 'firebase') {
        const snap = await fb.db.collection('users').doc(userId).get();
        return snap.exists ? snap.data() : null;
      }
      const raw = localStorage.getItem(LS.profilePrefix + userId);
      return raw ? JSON.parse(raw) : null;
    },

    async saveProfile(userId, partial) {
      if (mode === 'firebase') {
        await fb.db.collection('users').doc(userId).set(partial, { merge: true });
        return;
      }
      const key = LS.profilePrefix + userId;
      const existing = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify(Object.assign(existing, partial)));
    },

    async listRegistrations(userId, opts) {
      const from = opts && opts.from;
      const to = opts && opts.to;
      if (mode === 'firebase') {
        let q = fb.db.collection('users').doc(userId).collection('registrations');
        if (from) q = q.where('date', '>=', from).where('date', '<=', to || from);
        const snap = await q.orderBy('date').get();
        return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      }
      const raw = localStorage.getItem(LS.regsPrefix + userId);
      let regs = raw ? JSON.parse(raw) : [];
      if (from) regs = regs.filter((r) => r.date >= from && r.date <= (to || from));
      regs.sort((a, b) => a.date.localeCompare(b.date));
      return regs;
    },

    async saveRegistration(userId, reg) {
      if (mode === 'firebase') {
        const col = fb.db.collection('users').doc(userId).collection('registrations');
        if (reg.id) {
          const id = reg.id;
          const data = Object.assign({}, reg); delete data.id;
          await col.doc(id).set(data);
          return id;
        }
        const ref = await col.add(reg);
        return ref.id;
      }
      const key = LS.regsPrefix + userId;
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      if (reg.id) {
        const idx = list.findIndex((r) => r.id === reg.id);
        if (idx >= 0) list[idx] = reg; else list.push(reg);
      } else {
        reg.id = 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        list.push(reg);
      }
      localStorage.setItem(key, JSON.stringify(list));
      return reg.id;
    },

    async deleteRegistration(userId, regId) {
      if (mode === 'firebase') {
        await fb.db.collection('users').doc(userId).collection('registrations').doc(regId).delete();
        return;
      }
      const key = LS.regsPrefix + userId;
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify(list.filter((r) => r.id !== regId)));
    },

    // Day-level receipts. Returns Map<dateISO, receipts[]>.
    async listDayReceipts(userId, opts) {
      const from = opts && opts.from;
      const to = opts && opts.to;
      if (mode === 'firebase') {
        const snap = await fb.db.collection('users').doc(userId).collection('dayReceipts').get();
        const m = new Map();
        snap.docs.forEach((d) => {
          const date = d.id;
          if (from && (date < from || date > (to || from))) return;
          m.set(date, (d.data().items || []));
        });
        return m;
      }
      const raw = localStorage.getItem(LS.receiptsPrefix + userId);
      const all = raw ? JSON.parse(raw) : {};
      const m = new Map();
      for (const date in all) {
        if (from && (date < from || date > (to || from))) continue;
        m.set(date, all[date] || []);
      }
      return m;
    },

    async getDayReceipts(userId, date) {
      const m = await this.listDayReceipts(userId, { from: date, to: date });
      return m.get(date) || [];
    },

    async saveDayReceipts(userId, date, items) {
      if (mode === 'firebase') {
        await fb.db.collection('users').doc(userId).collection('dayReceipts').doc(date).set({ items });
        return;
      }
      const raw = localStorage.getItem(LS.receiptsPrefix + userId);
      const all = raw ? JSON.parse(raw) : {};
      if (items && items.length) all[date] = items;
      else delete all[date];
      localStorage.setItem(LS.receiptsPrefix + userId, JSON.stringify(all));
    },

    async getGlobal() {
      if (mode === 'firebase') {
        const [p, r] = await Promise.all([
          fb.db.collection('global').doc('projects').get(),
          fb.db.collection('global').doc('rates').get(),
        ]);
        return {
          projects: p.exists ? (p.data().items || []) : [],
          rates: r.exists ? r.data() : {},
        };
      }
      const raw = localStorage.getItem(LS.global);
      return raw ? JSON.parse(raw) : { projects: [], rates: {} };
    },

    async saveProjects(projects) {
      if (mode === 'firebase') {
        await fb.db.collection('global').doc('projects').set({ items: projects });
        return;
      }
      const g = JSON.parse(localStorage.getItem(LS.global) || '{}');
      g.projects = projects;
      localStorage.setItem(LS.global, JSON.stringify(g));
    },

    async saveRates(rates) {
      if (mode === 'firebase') {
        await fb.db.collection('global').doc('rates').set(rates, { merge: true });
        return;
      }
      const g = JSON.parse(localStorage.getItem(LS.global) || '{}');
      g.rates = Object.assign({}, g.rates || {}, rates);
      localStorage.setItem(LS.global, JSON.stringify(g));
    },
  };

  const storage = {
    async uploadReceipt(userId, file) {
      if (mode === 'firebase') {
        const path = 'receipts/' + userId + '/' + Date.now() + '_' + file.name;
        const ref = fb.storage.ref(path);
        await ref.put(file);
        const url = await ref.getDownloadURL();
        return { url, name: file.name, size: file.size, path };
      }
      // Local mode: store as data URL.
      const url = await fileToDataUrl(file);
      return { url, name: file.name, size: file.size };
    },
  };

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.data = { initData, getMode, auth, db, storage };
})(window);
