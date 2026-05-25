(function (global) {
  const { el, mount } = global.Timebok.dom;
  const { t, getLang, setLang } = global.Timebok.i18n;
  const { auth, getMode } = global.Timebok.data;

  function renderLogin() {
    const root = document.getElementById('view');
    document.getElementById('topbar').hidden = true;
    document.getElementById('drawer').hidden = true;

    const errBox = el('div', { class: 'small', style: { color: 'var(--c-danger)', marginBottom: '8px', minHeight: '18px' } });
    const langSel = el('select', { class: 'lang-select', style: { width: '100%' } }, [
      el('option', { value: 'nb' }, 'Norsk'),
      el('option', { value: 'en' }, 'English'),
    ]);
    langSel.value = getLang();
    langSel.addEventListener('change', () => { setLang(langSel.value); renderLogin(); });

    async function handleSignIn(method) {
      errBox.textContent = '';
      try {
        if (method === 'google') await auth.signInWithGoogle();
        else if (method === 'microsoft') await auth.signInWithMicrosoft();
      } catch (err) {
        errBox.textContent = t('login.error');
        console.error(err);
      }
    }

    const googleIcon = el('span', { class: 'btn-google-icon', html:
      '<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">'
      + '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>'
      + '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>'
      + '<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>'
      + '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>'
      + '</svg>',
    });

    const googleBtn = el('button', {
      type: 'button',
      class: 'btn btn-google btn-block',
      onclick: () => handleSignIn('google'),
    }, [googleIcon, ' Logg inn med Google']);

    const oauthSection = getMode() === 'firebase'
      ? el('div', {}, [googleBtn, errBox])
      : null;

    const node = el('div', { class: 'auth-wrap' }, [
      el('div', { class: 'auth-card' }, [
        el('div', { class: 'auth-brand' }, [
          el('img', { src: 'assets/icons/icon.svg', alt: 'Timebok' }),
          el('h1', {}, 'Timebok'),
          el('p', {}, t('login.subtitle')),
        ]),
        oauthSection,
        el('div', { class: 'mt-4', style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
          el('label', { class: 'small muted', style: { flex: '1' } }, 'Språk / Language'),
          langSel,
        ]),
        getMode() === 'local'
          ? el('div', { class: 'mt-3', style: { borderTop: '1px dashed var(--c-border)', paddingTop: '16px' } }, [
              el('p', { class: 'small muted', style: { textAlign: 'center', margin: '0 0 8px' } }, t('login.localMode')),
              el('button', {
                type: 'button',
                class: 'btn btn-secondary btn-block',
                onclick: async () => {
                  const cfg = window.TimebokConfig || {};
                  const email = cfg.ADMIN_EMAIL || 'admin@test.local';
                  await auth.signIn(email, 'test');
                },
              }, 'Hopp over – logg inn som test-admin'),
            ])
          : null,
      ]),
    ]);

    mount(root, node);
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.views = global.Timebok.views || {};
  global.Timebok.views.login = { renderLogin };
})(window);
