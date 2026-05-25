// Tiny DOM helpers.
(function (global) {
  function el(tag, props, children) {
    props = props || {};
    const node = document.createElement(tag);
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') node.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') node.innerHTML = v;
      else if (k in node && typeof node[k] !== 'function' && k !== 'list') node[k] = v;
      else node.setAttribute(k, v);
    }
    if (children != null) appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    const list = Array.isArray(children) ? children : [children];
    for (const c of list) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) appendChildren(node, c);
      else if (c instanceof Node) node.appendChild(c);
      else node.appendChild(document.createTextNode(String(c)));
    }
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function mount(target, node) {
    clear(target);
    target.appendChild(node);
    // For full-page mounts to #view, jump back to the top — new pages should
    // always start scrolled to top regardless of where the previous page was.
    if (target && target.id === 'view') {
      window.scrollTo(0, 0);
      requestAnimationFrame(() => window.scrollTo(0, 0));
    }
  }

  let _toastTimer = null;
  function toast(message, timeout) {
    timeout = timeout || 2200;
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = message;
    t.hidden = false;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => (t.hidden = true), timeout);
  }

  function openModal(content) {
    const m = document.getElementById('modal');
    const panel = document.getElementById('modalPanel');
    clear(panel);
    panel.appendChild(content);
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    // Reset scroll on the panel and any inner scrollable lists so the user
    // always sees the top of the modal. Wheel-picker columns are set after
    // openModal via their own init(), so don't reset those.
    panel.scrollTop = 0;
    panel.querySelectorAll('.code-list, .table-wrap, .data-list').forEach((n) => { n.scrollTop = 0; });
  }

  function closeModal() {
    document.getElementById('modal').hidden = true;
    document.body.style.overflow = '';
  }

  function confirmModal(title, message, opts) {
    opts = opts || {};
    const okLabel = opts.okLabel || 'OK';
    const danger = !!opts.danger;
    return new Promise((resolve) => {
      const panel = el('div', {}, [
        el('h2', { class: 'modal-title' }, title),
        el('p', { class: 'muted' }, message),
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'btn btn-secondary', onclick: () => { closeModal(); resolve(false); } }, 'Avbryt'),
          el('button', {
            class: 'btn ' + (danger ? 'btn-danger' : ''),
            onclick: () => { closeModal(); resolve(true); },
          }, okLabel),
        ]),
      ]);
      openModal(panel);
    });
  }

  let _dismissBound = false;
  function bindDismissers() {
    if (_dismissBound) return;
    _dismissBound = true;
    document.addEventListener('click', (e) => {
      const tgt = e.target;
      if (tgt && tgt.matches && tgt.matches('[data-close-modal]')) closeModal();
      if (tgt && tgt.matches && tgt.matches('[data-close-drawer]')) {
        document.getElementById('drawer').hidden = true;
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.getElementById('drawer').hidden = true;
      }
    });
  }

  global.Timebok = global.Timebok || {};
  global.Timebok.dom = { el, clear, mount, toast, openModal, closeModal, confirmModal, bindDismissers };
})(window);
