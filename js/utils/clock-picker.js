// Material-style circular clock picker.
// Hours: outer ring 0–11, inner ring 12–23.
// Minutes: single ring with 5-min increments.
// Two-stage flow: pick hour → auto-switch to minute → OK.
(function (global) {
  const { el, openModal, closeModal } = global.Timebok.dom;

  const SIZE = 280;
  const CENTER = SIZE / 2;
  const R_OUTER = 120;
  const R_INNER = 78;
  const R_MIN = 120;
  const ITEM_R = 18;

  function pad2(n) { return String(n).padStart(2, '0'); }

  function openClockPicker(currentHHMM, opts) {
    opts = opts || {};
    const parts = (currentHHMM || '07:00').split(':').map(Number);
    let pickedHour = parts[0] || 0;
    let pickedMin = (Math.round((parts[1] || 0) / 5) * 5) % 60;

    return new Promise((resolve) => {
      let mode = 'hours'; // 'hours' or 'minutes'

      const hourDisplay = el('button', { class: 'clock-display-part', type: 'button' }, pad2(pickedHour));
      const minDisplay = el('button', { class: 'clock-display-part', type: 'button' }, pad2(pickedMin));
      const display = el('div', { class: 'clock-display' }, [
        hourDisplay,
        el('span', { class: 'clock-display-sep' }, ':'),
        minDisplay,
      ]);

      const dialContainer = el('div', { class: 'clock-dial-wrap' });

      function renderDial() {
        dialContainer.innerHTML = '';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 ' + SIZE + ' ' + SIZE);
        svg.setAttribute('width', '100%');
        svg.setAttribute('class', 'clock-dial');

        // Background circle
        const bg = circle(CENTER, CENTER, R_OUTER + ITEM_R + 4, { fill: 'var(--c-surface-2)' });
        svg.appendChild(bg);

        if (mode === 'hours') {
          drawRing(svg, R_OUTER, 12, (i) => i, pickedHour);          // 0..11 outer
          drawRing(svg, R_INNER, 12, (i) => i + 12, pickedHour);     // 12..23 inner
        } else {
          drawRing(svg, R_MIN, 12, (i) => i * 5, pickedMin);         // 0..55 step 5
        }

        // Hand from center to selected value
        const selected = mode === 'hours' ? pickedHour : pickedMin;
        let handR;
        if (mode === 'hours') {
          handR = selected >= 12 ? R_INNER : R_OUTER;
          var angleIdx = selected >= 12 ? selected - 12 : selected;
        } else {
          handR = R_MIN;
          var angleIdx = selected / 5;
        }
        const handAngle = (angleIdx / 12) * 2 * Math.PI - Math.PI / 2;
        const handX = CENTER + handR * Math.cos(handAngle);
        const handY = CENTER + handR * Math.sin(handAngle);

        // Line + selector dot
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', CENTER); line.setAttribute('y1', CENTER);
        line.setAttribute('x2', handX); line.setAttribute('y2', handY);
        line.setAttribute('stroke', 'var(--c-primary)');
        line.setAttribute('stroke-width', '2');
        svg.appendChild(line);

        const sel = circle(handX, handY, ITEM_R, { fill: 'var(--c-primary)' });
        sel.setAttribute('class', 'clock-selected-dot');
        svg.appendChild(sel);

        // Center dot
        svg.appendChild(circle(CENTER, CENTER, 4, { fill: 'var(--c-primary)' }));

        // Numbers (drawn after the hand so they appear on top, with selected white)
        if (mode === 'hours') {
          drawNumbers(svg, R_OUTER, 12, (i) => i, pickedHour);
          drawNumbers(svg, R_INNER, 12, (i) => i + 12, pickedHour);
        } else {
          drawNumbers(svg, R_MIN, 12, (i) => i * 5, pickedMin);
        }

        dialContainer.appendChild(svg);
      }

      function drawRing(svg, r, count, mapVal, currentVal) {
        for (let i = 0; i < count; i++) {
          const v = mapVal(i);
          const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
          const x = CENTER + r * Math.cos(angle);
          const y = CENTER + r * Math.sin(angle);
          const isSel = v === currentVal;
          // Hit-area circle (transparent for click)
          const hit = circle(x, y, ITEM_R, { fill: 'transparent', cursor: 'pointer' });
          hit.style.pointerEvents = 'auto';
          hit.addEventListener('click', () => selectValue(v));
          svg.appendChild(hit);
        }
      }

      function drawNumbers(svg, r, count, mapVal, currentVal) {
        for (let i = 0; i < count; i++) {
          const v = mapVal(i);
          const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
          const x = CENTER + r * Math.cos(angle);
          const y = CENTER + r * Math.sin(angle);
          const isSel = v === currentVal;
          const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          txt.setAttribute('x', x); txt.setAttribute('y', y);
          txt.setAttribute('text-anchor', 'middle');
          txt.setAttribute('dominant-baseline', 'central');
          txt.setAttribute('fill', isSel ? '#fff' : 'var(--c-text)');
          txt.setAttribute('font-size', r === R_INNER ? '13' : '15');
          txt.setAttribute('font-weight', isSel ? '700' : '500');
          txt.style.pointerEvents = 'none';
          txt.textContent = pad2(v);
          svg.appendChild(txt);
        }
      }

      function selectValue(v) {
        if (mode === 'hours') {
          pickedHour = v;
          hourDisplay.textContent = pad2(v);
          // Auto-switch to minutes after picking hour
          mode = 'minutes';
          updateMode();
        } else {
          pickedMin = v;
          minDisplay.textContent = pad2(v);
        }
        renderDial();
      }

      function updateMode() {
        hourDisplay.classList.toggle('active', mode === 'hours');
        minDisplay.classList.toggle('active', mode === 'minutes');
      }

      hourDisplay.addEventListener('click', () => { mode = 'hours'; updateMode(); renderDial(); });
      minDisplay.addEventListener('click', () => { mode = 'minutes'; updateMode(); renderDial(); });

      function commit() {
        closeModal();
        resolve(pad2(pickedHour) + ':' + pad2(pickedMin));
      }
      function cancel() { closeModal(); resolve(null); }

      const panel = el('div', { class: 'clock-modal' }, [
        opts.title ? el('h2', { class: 'modal-title clock-title' }, opts.title) : null,
        display,
        dialContainer,
        el('div', { class: 'modal-actions wp-actions' }, [
          el('button', { class: 'btn btn-secondary', type: 'button', onclick: cancel }, 'Avbryt'),
          el('button', { class: 'btn', type: 'button', onclick: commit }, 'OK'),
        ]),
      ]);

      openModal(panel);
      updateMode();
      renderDial();
    });
  }

  function circle(cx, cy, r, attrs) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
    for (const k in attrs) c.setAttribute(k, attrs[k]);
    return c;
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.clockPicker = { openClockPicker };
})(window);
