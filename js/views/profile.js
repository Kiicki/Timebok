(function (global) {
  const { el, mount, toast } = global.Timebok.dom;
  const { t, getLang, setLang } = global.Timebok.i18n;
  const { db } = global.Timebok.data;
  const { get: getState, refreshProfile, isAdmin, getLatestTariff } = global.Timebok.state;
  const { parseNum, displayNum } = global.Timebok.dateUtils;
  const { CODES, isTravelZoneCode, resolveCodeName } = global.Timebok.codes;
  function setTopbar(opts) { global.Timebok.chrome.setTopbar(opts); }

  // Default auto-codes when profile doesn't have an explicit setting yet
  // (matches the historic hardcoded behavior).
  const DEFAULT_AUTO_CODES = ['ordinaere-timer', 'reisegodtgjorelse'];

  // Special pseudo-code IDs that aren't in CODES but can be auto-added
  // (currently just Reisegodtgjørelse).
  const PSEUDO_AUTO_CODES = [
    { id: 'reisegodtgjorelse', name: 'Reisegodtgjørelse', purpose: 'reise' },
  ];

  // Codes that don't make sense to auto-add (markører, oppm-soner) are
  // filtered out from the auto-fyll picker so the list stays focused.
  function autoFillCandidates(rates) {
    const out = [];
    for (const p of PSEUDO_AUTO_CODES) out.push({ id: p.id, name: p.name, purpose: p.purpose });
    for (const c of CODES) {
      if (isTravelZoneCode(c)) continue;
      out.push({ id: c.id, name: resolveCodeName(c.id, rates), purpose: codePurpose(c.id) });
    }
    return out;
  }

  const PURPOSE_OF = {
    'ordinaere-timer': 'arbeid',
    'overtid-50': 'arbeid', 'overtid-50-org': 'arbeid',
    'overtid-100': 'arbeid', 'overtid-100-org': 'arbeid',
    'reisetid': 'arbeid', 'akkordtimer': 'arbeid', 'kurs-oppl-mote': 'arbeid',
    'tillitsvalgt-verneombud': 'arbeid', 'vedlikehold-ikke-prosjekt': 'arbeid',
    'overtidsmat-u12': 'arbeid', 'overtidsmat-o12': 'arbeid',
    'bastillegg': 'tillegg', 'smusstillegg-1': 'tillegg', 'tilhengertillegg': 'tillegg',
    'passasjertillegg': 'tillegg', 'utenbystillegg-fagarb': 'tillegg',
    'utenbystillegg-u-fagbrev': 'tillegg', 'tarifftillegg-a121': 'tillegg',
    'opplaeringstillegg-ks': 'tillegg',
    'km-godtgjorelse': 'reise', 'reiseutgifter-bom': 'reise', 'restakkord-belop': 'reise',
    'permisjon-lonn-org': 'fravaer', 'permisjon-lonn-uorg': 'fravaer',
    'fri-arb-avtale': 'fravaer', 'ferie': 'fravaer', 'sykemelding': 'fravaer',
    'egenmelding': 'fravaer', 'barns-sykdom': 'fravaer', 'offentlig-fridag': 'fravaer',
    'permisjon-uten-lonn': 'fravaer',
  };
  const PURPOSE_GROUPS = [
    { key: 'reise',   label: 'Reise og refusjon' },
    { key: 'arbeid',  label: 'Arbeid og overtid' },
    { key: 'tillegg', label: 'Tillegg per arbeidet time' },
    { key: 'fravaer', label: 'Fravær' },
  ];
  function codePurpose(codeId) { return PURPOSE_OF[codeId] || 'arbeid'; }

  async function renderProfile() {
    const root = document.getElementById('view');
    document.getElementById('topbar').hidden = false;
    setTopbar({
      title: t('profile.title'),
      leftIcon: global.Timebok.chrome.ICONS.arrowBack,
      leftAction: () => global.Timebok.router.navigate('/week'),
      leftTitle: 'Tilbake',
    });

    const state = getState();
    const p = state.profile || {};

    const nameIn = el('input', { type: 'text', value: p.name || '' });
    const rateIn = el('input', { type: 'text', inputmode: 'decimal', value: displayNum(p.hourlyRate || 0) });
    if (!isAdmin()) rateIn.disabled = true;

    const styleSel = el('select', {}, [
      el('option', { value: 'firesafe' }, t('profile.styleFiresafe')),
      el('option', { value: 'damsgard' }, t('profile.styleDamsgard')),
    ]);
    styleSel.value = p.companyStyle || 'firesafe';

    const transportSel = el('select', {}, [
      el('option', { value: 'firmaBil' }, t('day.firmaBil')),
      el('option', { value: 'privatBil' }, t('day.privatBil')),
    ]);
    transportSel.value = p.defaultTransport || 'firmaBil';

    const langSel = el('select', {}, [
      el('option', { value: 'nb' }, 'Norsk'),
      el('option', { value: 'en' }, 'English'),
    ]);
    langSel.value = getLang();
    langSel.addEventListener('change', () => {
      setLang(langSel.value);
      toast(t('toast.saved'));
    });

    // ---- Auto-fyll-tilleggskoder ----
    // Bygges som checkboxer gruppert etter purpose. Settes som
    // profile.autoCodes når brukeren trykker Lagre. Bruker nyeste tariffs
    // navn for visning av kodene (siden vi viser et generelt valg, ikke
    // datert).
    const rates = getLatestTariff() || {};
    const currentAuto = Array.isArray(p.autoCodes) ? p.autoCodes : DEFAULT_AUTO_CODES;
    const autoSet = new Set(currentAuto);
    const autoCheckboxes = {};
    const candidates = autoFillCandidates(rates);
    const candidatesByPurpose = {};
    for (const g of PURPOSE_GROUPS) candidatesByPurpose[g.key] = [];
    for (const c of candidates) {
      const p2 = c.purpose || 'arbeid';
      if (candidatesByPurpose[p2]) candidatesByPurpose[p2].push(c);
    }
    function autoGroupBlock(g) {
      const items = candidatesByPurpose[g.key] || [];
      if (!items.length) return null;
      return el('div', { class: 'auto-codes-group' }, [
        el('div', { class: 'auto-codes-group-title' }, g.label),
        el('div', { class: 'auto-codes-list' }, items.map((c) => {
          const cb = el('input', { type: 'checkbox', checked: autoSet.has(c.id) });
          autoCheckboxes[c.id] = cb;
          return el('label', { class: 'auto-code-item' }, [cb, el('span', {}, c.name)]);
        })),
      ]);
    }
    const autoCodesSection = el('div', { class: 'form-group' }, [
      el('label', {}, 'Auto-fyll når prosjekt velges'),
      el('p', { class: 'small muted', style: { margin: '0 0 8px' } },
        'Disse tilleggskodene legges automatisk til på hver ny registrering når du velger et prosjekt.'),
      el('div', { class: 'auto-codes-wrap' }, PURPOSE_GROUPS.map(autoGroupBlock).filter(Boolean)),
    ]);

    const node = el('div', {}, [
      el('div', { class: 'card' }, [
        el('div', { class: 'form-group' }, [el('label', {}, t('profile.name')), nameIn]),
        el('div', { class: 'form-group' }, [
          el('label', {}, t('profile.email')),
          el('input', { type: 'email', value: p.email || '', disabled: true }),
        ]),
        el('div', { class: 'form-group' }, [
          el('label', {}, t('profile.hourlyRate')),
          rateIn,
        ]),
        el('div', { class: 'form-group' }, [
          el('label', {}, t('profile.companyStyle')),
          styleSel,
          el('p', { class: 'small muted', style: { margin: '4px 0 0' } },
            'Firesafe: flere prosjekter på samme dag → første + siste reise × 0,5 (midten ignoreres). Damsgård Brannsikring: kun den høyeste reise-linjen × 1.'),
        ]),
        el('div', { class: 'form-group' }, [
          el('label', {}, 'Transport – standard'),
          transportSel,
        ]),
        autoCodesSection,
        el('div', { class: 'form-group' }, [
          el('label', {}, 'Språk / Language'),
          langSel,
        ]),
        el('div', { class: 'form-group' }, [
          el('label', {}, t('profile.role')),
          el('div', {}, [
            el('span', { class: 'badge' }, isAdmin() ? t('profile.roleAdmin') : t('profile.roleUser')),
          ]),
        ]),
        el('button', { class: 'btn', onclick: async () => {
          const autoCodes = [];
          for (const id in autoCheckboxes) {
            if (autoCheckboxes[id].checked) autoCodes.push(id);
          }
          const partial = {
            name: nameIn.value,
            companyStyle: styleSel.value,
            defaultTransport: transportSel.value,
            autoCodes,
          };
          if (isAdmin()) partial.hourlyRate = parseNum(rateIn.value);
          await db.saveProfile(state.user.id, partial);
          await refreshProfile();
          toast(t('toast.saved'));
        } }, t('common.save')),
      ]),
    ]);

    mount(root, node);
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.views = global.Timebok.views || {};
  global.Timebok.views.profile = { renderProfile };
})(window);
