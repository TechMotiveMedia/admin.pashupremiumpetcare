/* ==========================================================================
   ui.js — small DOM helpers, toasts, modals, confirm dialogs
   ========================================================================== */
(function (global) {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const el = (tag, attrs, html) => {
    const node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      if (k === 'class') node.className = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    if (html !== undefined && html !== null) node.innerHTML = html;
    return node;
  };

  /** Escape untrusted text before putting it into innerHTML. */
  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /** Escape + convert newlines to <br>. */
  const escBr = (s) => esc(s).replace(/\n/g, '<br>');

  const safeUrl = (u) => {
    const v = String(u || '').trim();
    if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
    return '';
  };

  /* ------------------------------- toasts -------------------------------- */
  let toastWrap = null;
  function toast(message, kind, ms) {
    toastWrap = toastWrap || $('#toastWrap');
    if (!toastWrap) return;
    const icons = { ok: '✓', err: '!', warn: '!', info: 'i' };
    const k = kind || 'ok';
    const node = el('div', { class: 'toast ' + k },
      `<span class="t-ico">${icons[k] || '✓'}</span><span>${esc(message)}</span>`);
    toastWrap.appendChild(node);
    setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 240);
    }, ms || 3600);
    return node;
  }

  /* ------------------------------- modals -------------------------------- */
  const backdrop = () => $('#modalBackdrop');
  const modalBox = () => $('#modal');

  function openModal(html, onMount) {
    const bd = backdrop();
    const box = modalBox();
    box.innerHTML = html;
    bd.hidden = false;
    if (typeof onMount === 'function') onMount(box);
    // focus first focusable input
    const first = box.querySelector('input,select,textarea,button');
    if (first) setTimeout(() => first.focus(), 40);
    return box;
  }
  function closeModal() {
    const bd = backdrop();
    if (!bd) return;
    bd.hidden = true;
    modalBox().innerHTML = '';
  }

  function confirmDialog(opts) {
    const o = Object.assign({
      title: 'Are you sure?', body: '', ok: 'Confirm', cancel: 'Cancel', danger: false
    }, opts || {});
    return new Promise((resolve) => {
      openModal(
        `<div class="modal-head"><h3>${esc(o.title)}</h3>
           <button class="icon-btn" data-act="x" aria-label="Close">✕</button></div>
         <div class="modal-body"><p style="font-size:13.6px;line-height:1.6;color:var(--ink-700)">${escBr(o.body)}</p></div>
         <div class="modal-foot">
           <button class="btn btn-ghost" data-act="cancel">${esc(o.cancel)}</button>
           <button class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(o.ok)}</button>
         </div>`,
        (box) => {
          box.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]');
            if (!act) return;
            const a = act.getAttribute('data-act');
            if (a === 'ok') { closeModal(); resolve(true); }
            else if (a === 'cancel' || a === 'x') { closeModal(); resolve(false); }
          });
        }
      );
    });
  }

  /* ------------------------------ clipboard ------------------------------ */
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard', 'ok', 1800);
      return true;
    } catch (e) {
      try {
        const ta = el('textarea', { style: 'position:fixed;left:-9999px' });
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        toast('Copied to clipboard', 'ok', 1800);
        return true;
      } catch (e2) {
        toast('Could not copy automatically', 'err');
        return false;
      }
    }
  }

  /* -------------------------------- files -------------------------------- */
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = el('input', { type: 'file', accept: accept || '', style: 'display:none' });
      document.body.appendChild(input);
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        input.remove();
        resolve(f || null);
      });
      input.click();
    });
  }

  /* ------------------------------- status -------------------------------- */
  function statusClass(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'paid' || s === 'accepted' || s === 'available') return 'green';
    if (s === 'sent') return 'orange';
    if (s === 'partially paid') return 'warm';
    if (s === 'unpaid' || s === 'declined' || s === 'overdue' || s === 'cancelled') return 'red';
    if (s === 'expired') return 'warm';
    return 'grey';
  }

  global.UI = {
    $, $$, el, esc, escBr, safeUrl, toast,
    openModal, closeModal, confirm: confirmDialog,
    copy, download, pickFile, statusClass
  };
  global.$ = $;
  global.$$ = $$;
})(window);
