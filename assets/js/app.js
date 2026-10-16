/* ==========================================================================
   app.js — hash router, navigation and app bootstrap
   ========================================================================== */
(function (global) {
  'use strict';

  const { $, $$, toast } = global.UI;
  const S = global.Store;
  const Views = global.Views;

  const ROUTES = {
    dashboard: 'dashboard',
    documents: 'documents',
    clients: 'clients',
    services: 'services',
    settings: 'settings',
    document: 'document'
  };

  /* ------------------------------- routing ------------------------------- */
  function parse() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    if (!parts.length) return { name: 'dashboard', params: {} };
    const head = parts[0];
    if (head === 'new') return { name: 'document', params: { type: parts[1] === 'bill' ? 'bill' : 'quotation' } };
    if (head === 'edit') return { name: 'document', params: { id: parts[1] || '' } };
    if (ROUTES[head]) return { name: ROUTES[head], params: {} };
    return { name: 'dashboard', params: {} };
  }

  function setActiveNav(route) {
    let key = route.name;
    if (route.name === 'document') {
      if (route.params.id) {
        const d = S.getDocument(route.params.id);
        key = d && d.type === 'bill' ? 'new-bill' : 'new-quotation';
      } else {
        key = route.params.type === 'bill' ? 'new-bill' : 'new-quotation';
      }
    }
    $$('#mainNav .nav-item').forEach((a) => {
      a.classList.toggle('active', a.getAttribute('data-view') === key);
    });
  }

  function render() {
    const route = parse();
    const view = Views[route.name] || Views.dashboard;
    const section = $('#view-' + route.name);
    if (!section) { location.hash = '#/dashboard'; return; }

    // swap visible section
    $$('.view').forEach((v) => v.classList.remove('active'));
    section.classList.add('active');

    setActiveNav(route);

    // header
    if (route.name !== 'document') {
      $('#pageTitle').textContent = view.title || '';
      $('#pageSubtitle').textContent = view.subtitle || '';
    }
    const actions = $('#topbarActions');
    actions.innerHTML = (typeof view.actions === 'function') ? (view.actions(route.params) || '') : '';

    try {
      view.mount(route.params || {});
    } catch (err) {
      console.error('[app] view failed to mount:', err);
      toast('Something went wrong while opening this page. Check the browser console.', 'err', 5000);
    }

    if (route.name === 'document') {
      const badge = $('#editorBadge');
      const d = global.Editor.doc;
      if (badge && d) badge.textContent = d.status || 'Draft';
    }

    // close the mobile drawer
    closeDrawer();
    window.scrollTo(0, 0);
    $('#content').scrollTop = 0;
  }

  /* ------------------------------- chrome -------------------------------- */
  function refreshCounts() {
    const n = S.documents.length;
    const c = S.clients.length;
    const nd = $('#navDocCount');
    const nc = $('#navClientCount');
    if (nd) nd.textContent = n;
    if (nc) nc.textContent = c;
  }

  function refreshConn() {
    const conn = global.Mailer.connectionLabel();
    const box = $('#connState');
    const txt = $('#connText');
    if (!box) return;
    box.classList.toggle('ok', conn.ok);
    if (txt) txt.textContent = conn.ok ? 'Connected' : 'Not configured';
  }

  function openDrawer() {
    $('#sidebar').classList.add('open');
    if (!$('.backdrop')) {
      const bd = global.UI.el('div', { class: 'backdrop', id: 'drawerBackdrop' });
      bd.addEventListener('click', closeDrawer);
      document.body.appendChild(bd);
    }
  }
  function closeDrawer() {
    const sb = $('#sidebar');
    if (sb) sb.classList.remove('open');
    const bd = $('.backdrop');
    if (bd) bd.remove();
  }

  /* -------------------------------- boot --------------------------------- */
  function boot() {
    // drawer
    const menu = $('#menuBtn');
    if (menu) menu.addEventListener('click', () => {
      const sb = $('#sidebar');
      if (sb.classList.contains('open')) closeDrawer(); else openDrawer();
    });

    // email panel
    $('#emailPanelClose').addEventListener('click', () => global.closeEmailPanel());
    $('#emailPanelCancel').addEventListener('click', () => global.closeEmailPanel());
    $('#emailPanelSend').addEventListener('click', () => global.Editor.sendEmail());
    $('#emailPanel').addEventListener('click', (e) => {
      if (e.target === $('#emailPanel')) global.closeEmailPanel();
    });

    // modal backdrop
    $('#modalBackdrop').addEventListener('click', (e) => {
      if (e.target === $('#modalBackdrop')) global.UI.closeModal();
    });

    // keys
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('#emailPanel').hidden) global.closeEmailPanel();
        else if (!$('#modalBackdrop').hidden) global.UI.closeModal();
        else closeDrawer();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if ($('#view-document').classList.contains('active')) {
          e.preventDefault();
          global.Editor.save({ announce: true });
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        if ($('#view-document').classList.contains('active')) {
          e.preventDefault();
          global.Editor.print();
        }
      }
    });

    window.addEventListener('hashchange', render);

    refreshCounts();
    refreshConn();

    if (!location.hash) {
      location.replace('#/dashboard');
      return;
    }
    render();
  }

  global.App = { render, refreshCounts, refreshConn, parse };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
