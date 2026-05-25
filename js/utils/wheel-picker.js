// Click-to-select list picker.
// Exposes: Timebok.wheelPicker.openTimePicker(hhmm), openMinutesPicker(min, opts).
// Returns a Promise that resolves with the picked value or null on cancel.
(function (global) {
  const { el, openModal, closeModal } = global.Timebok.dom;

  const ITEM_HEIGHT = 44; // matches CSS .wp-item height

  function pad2(n) { return String(n).padStart(2, '0'); }

  function buildColumn(values, initialValue) {
    let selectedIdx = Math.max(0, values.indexOf(initialValue));

    const items = values.map((v, i) => {
      const node = el('div', { class: 'wp-item' + (i === selectedIdx ? ' active' : '') }, v);
      node.addEventListener('click', () => setIndex(i));
      return node;
    });

    const column = el('div', { class: 'wp-column' }, items);

    function setIndex(idx) {
      idx = Math.max(0, Math.min(values.length - 1, idx));
      if (idx === selectedIdx) return;
      items[selectedIdx].classList.remove('active');
      selectedIdx = idx;
      items[selectedIdx].classList.add('active');
    }

    function getValue() { return values[selectedIdx]; }

    function init() {
      // Scroll selected into view without animation. Aim to put it near the
      // top, but allow normal scroll within bounds.
      column.style.scrollBehavior = 'auto';
      column.scrollTop = selectedIdx * ITEM_HEIGHT;
      requestAnimationFrame(() => { column.style.scrollBehavior = 'smooth'; });
    }

    return { node: column, getValue, setIndex, init };
  }

  function openWheelPicker(opts) {
    return new Promise((resolve) => {
      const built = opts.columns.map((c) => buildColumn(c.values, c.initial));

      const labels = opts.columns.map((c) => c.label || '');
      const hasLabels = labels.some((l) => l);
      const labelNodes = [];
      if (hasLabels) {
        labels.forEach((lbl, i) => {
          if (i > 0 && opts.separator) labelNodes.push(el('div', { class: 'wp-label-sep' }, ''));
          labelNodes.push(el('div', { class: 'wp-label' }, lbl));
        });
      }

      const colNodes = [];
      built.forEach((b, i) => {
        if (i > 0 && opts.separator) colNodes.push(el('div', { class: 'wp-sep' }, opts.separator));
        colNodes.push(b.node);
      });

      function commit() {
        const values = built.map((b) => b.getValue());
        closeModal();
        resolve(values);
      }
      function cancel() { closeModal(); resolve(null); }

      function onKey(e) {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
      }

      const quickButtons = (opts.quickPicks || []).map((q) =>
        el('button', {
          type: 'button', class: 'btn btn-secondary',
          onclick: () => {
            if (q.clearAll) {
              // Resolve with a sentinel that callers interpret as "clear".
              closeModal();
              resolve(['__clear__']);
              return;
            }
            if (built.length === 1) {
              built[0].setIndex(opts.columns[0].values.indexOf(String(q.value)));
            }
            commit();
          },
        }, q.label)
      );

      const panel = el('div', { class: 'wp-modal', onkeydown: onKey, tabindex: '-1' }, [
        opts.title ? el('h2', { class: 'modal-title wp-title' }, opts.title) : null,
        hasLabels ? el('div', { class: 'wp-labels' }, labelNodes) : null,
        el('div', { class: 'wp-wheel' }, [
          el('div', { class: 'wp-cols' }, colNodes),
        ]),
        el('div', { class: 'modal-actions wp-actions' }, [
          el('button', { class: 'btn btn-secondary', type: 'button', onclick: cancel }, 'Avbryt'),
        ].concat(quickButtons).concat([
          el('button', { class: 'btn', type: 'button', onclick: commit }, 'OK'),
        ])),
      ]);

      openModal(panel);
      requestAnimationFrame(() => built.forEach((b) => b.init()));
      setTimeout(() => panel.focus && panel.focus(), 0);
    });
  }

  function openTimePicker(currentHHMM, opts) {
    opts = opts || {};
    const minuteStep = opts.minuteStep || 5;
    const parts = (currentHHMM || '07:00').split(':').map(Number);
    const hh = parts[0] || 0;
    const mm = parts[1] || 0;

    const hours = [];
    for (let i = 0; i < 24; i++) hours.push(pad2(i));
    const minutes = [];
    for (let i = 0; i < 60; i += minuteStep) minutes.push(pad2(i));

    const initialMin = pad2(Math.round(mm / minuteStep) * minuteStep % 60);

    return openWheelPicker({
      title: opts.title || 'Velg tidspunkt',
      separator: ':',
      columns: [
        { values: hours, initial: pad2(hh), label: 'Timer' },
        { values: minutes, initial: initialMin, label: 'Minutter' },
      ],
      // Special sentinel: returning '__clear__' tells caller to empty the field.
      quickPicks: opts.allowClear ? [{ label: 'Tøm', value: '__clear__', clearAll: true }] : null,
    }).then((r) => {
      if (r === null) return null;
      if (r[0] === '__clear__') return '';
      return r.join(':');
    });
  }

  function openMinutesPicker(currentMin, opts) {
    opts = opts || {};
    const max = opts.max != null ? opts.max : 120;
    const step = opts.step || 5;
    const values = [];
    for (let i = 0; i <= max; i += step) values.push(String(i));
    const initial = String(Math.max(0, Math.min(max, Math.round((Number(currentMin) || 0) / step) * step)));

    return openWheelPicker({
      title: opts.title || 'Velg minutter',
      separator: '',
      columns: [{ values, initial, label: 'Minutter' }],
      quickPicks: opts.quickPicks,
    }).then((r) => (r ? Number(r[0]) : null));
  }

  // Hours+minutes duration picker. Initial/result are decimal hours
  // (e.g. 7.5 = 7h 30m). Quarter-hour granularity.
  function openHoursPicker(currentHours, opts) {
    opts = opts || {};
    const total = Math.max(0, Math.min(24, Number(currentHours) || 0));
    const wholeHours = Math.floor(total);
    const minutes = Math.round((total - wholeHours) * 60 / 15) * 15;

    const hourValues = [];
    for (let i = 0; i <= 24; i++) hourValues.push(pad2(i));
    const minValues = ['00', '15', '30', '45'];

    return openWheelPicker({
      title: opts.title || 'Velg timer',
      separator: ':',
      columns: [
        { values: hourValues, initial: pad2(wholeHours), label: 'Timer' },
        { values: minValues, initial: pad2(minutes >= 60 ? 0 : minutes), label: 'Minutter' },
      ],
    }).then((r) => {
      if (!r) return null;
      return Number(r[0]) + Number(r[1]) / 60;
    });
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.wheelPicker = { openTimePicker, openMinutesPicker, openHoursPicker };
})(window);
