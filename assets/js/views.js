/* ==========================================================================
   views.js — every screen: dashboard, editor, documents, clients, services,
   settings. Each view exposes { title, subtitle, actions, mount }.
   ========================================================================== */
(function (global) {
  'use strict';

  const { $, $$, el, esc, escBr, toast, openModal, closeModal, confirm: askConfirm, copy, download, pickFile, statusClass } = global.UI;
  const S = global.Store;

  const UNITS = ['per session', 'per visit', 'per walk', 'per day', 'per night', 'per half day',
    'per hour', 'per consultation', 'per plan', 'per item', 'per pack', 'per trip', 'per case', 'per month', 'per pet'];

  const PACKAGES = [
    {
      id: 'trial-walk',
      name: 'Trial Walk Pack',
      desc: 'Five 30-minute walks — a gentle way to start a walking routine.',
      items: [
        { name: 'Dog Walking (30 min)', qty: 5, unit: 'per walk' }
      ]
    },
    {
      id: 'weekend-boarding',
      name: 'Weekend Homestay',
      desc: 'Two nights of home-style boarding at Bibwewadi with daily walks.',
      items: [
        { name: 'Homestay for Pets (Bibwewadi)', qty: 2, unit: 'per night' },
        { name: 'Dog Walking (30 min)', qty: 4, unit: 'per walk' }
      ]
    },
    {
      id: 'training-starter',
      name: 'Training Starter',
      desc: 'Four home training sessions plus a nutrition consultation.',
      items: [
        { name: 'Dog Training — Home Session', qty: 4, unit: 'per session' },
        { name: 'Canine Nutrition Consultation', qty: 1, unit: 'per consultation' }
      ]
    },
    {
      id: 'full-care-day',
      name: 'Full Day Care',
      desc: 'Day boarding with a walk and a drop-in visit for busy workdays.',
      items: [
        { name: 'Day Boarding', qty: 1, unit: 'per day' },
        { name: 'Dog Walking (30 min)', qty: 2, unit: 'per walk' },
        { name: 'Pet Sitting — Drop-in Visit', qty: 1, unit: 'per visit' }
      ]
    },
    {
      id: 'holistic-wellness',
      name: 'Holistic Wellness',
      desc: 'Reiki healing with Bach flower remedies for emotional balance.',
      items: [
        { name: 'Reiki Healing for Animals', qty: 2, unit: 'per session' },
        { name: 'Bach Flower Remedies', qty: 1, unit: 'per consultation' }
      ]
    }
  ];

  function priceFor(name) {
    const svc = S.services.find((s) => (s.name || '').toLowerCase() === String(name).toLowerCase());
    return svc ? S.toNum(svc.price) : 0;
  }

  /* =======================================================================
     DOCUMENT EDITOR
     ======================================================================= */
  const Editor = {
    doc: null,
    isNew: true,
    attached: true,
    zoom: 1,
    peeked: '',
    bound: false,

    blank(type) {
      const d = S.settings.defaults;
      const today = S.TODAY();
      return {
        id: S.uid(),
        type: type,
        number: '',
        date: today,
        validUntil: type === 'quotation' ? S.addDays(today, d.validityDays) : '',
        dueDate: type === 'bill' ? S.addDays(today, 7) : '',
        status: 'Draft',
        clientId: null,
        clientName: '', clientEmail: '', clientPhone: '', clientAddress: '',
        petName: '', petInfo: '',
        items: [{ id: S.uid(), description: '', unit: '', qty: 1, rate: 0, note: '' }],
        discountType: 'amount', discountValue: 0,
        taxRate: d.taxRate, taxLabel: d.taxLabel,
        amountPaid: 0,
        notes: d.note, terms: (d.terms || []).slice(),
        createdAt: Date.now(), updatedAt: Date.now(), sentAt: null
      };
    },

    /** opts.detached = the doc is being used outside the editor screen (e.g. emailing
     *  straight from the documents table) so the form must not be read back. */
    load(doc, isNew, opts) {
      Editor.doc = doc;
      Editor.isNew = !!isNew;
      Editor.attached = !(opts && opts.detached);
      Editor.zoom = 1;
      Editor.bindOnce();
      if (Editor.attached) Editor.hydrate();
      else Editor.renderPreview();
    },

    bindOnce() {
      if (Editor.bound) return;
      Editor.bound = true;
      const form = $('#docForm');

      form.addEventListener('input', (e) => {
        if (e.target.closest('.item')) return;        // handled by delegated listener
        Editor.readForm();
        Editor.paint();
      });
      form.addEventListener('change', (e) => {
        if (e.target.id === 'docType') return;
        Editor.readForm();
        Editor.paint();
      });

      // item edits (delegated so rows can be rebuilt freely)
      $('#itemsWrap').addEventListener('input', () => { Editor.readForm(); Editor.paint(); });

      $('#itemsWrap').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-del]');
        if (!btn) return;
        const idx = parseInt(btn.getAttribute('data-del'), 10);
        Editor.readForm();
        Editor.doc.items.splice(idx, 1);
        if (!Editor.doc.items.length) {
          Editor.doc.items.push({ id: S.uid(), description: '', unit: '', qty: 1, rate: 0 });
        }
        Editor.paint();
      });

      $('#addItem').addEventListener('click', () => {
        Editor.readForm();
        Editor.doc.items.push({ id: S.uid(), description: '', unit: '', qty: 1, rate: 0 });
        Editor.paint();
        const rows = $$('#itemsWrap .item');
        const last = rows[rows.length - 1];
        if (last) { const inp = last.querySelector('input'); if (inp) inp.focus(); }
      });

      $('#quickService').addEventListener('change', (e) => {
        const id = e.target.value;
        e.target.value = '';
        if (!id) return;
        if (id.startsWith('pkg:')) {
          const pkg = PACKAGES.find((p) => p.id === id.slice(4));
          if (!pkg) return;
          Editor.readForm();
          pkg.items.forEach((it) => {
            Editor.doc.items.push({
              id: S.uid(), description: it.name, unit: it.unit || '', qty: it.qty || 1, rate: priceFor(it.name)
            });
          });
          Editor.paint();
          toast(pkg.name + ' added', 'ok');
          return;
        }
        const svc = S.services.find((s) => s.id === id);
        if (!svc) return;
        Editor.readForm();
        Editor.doc.items.push({
          id: S.uid(), description: svc.name, unit: svc.unit || '', qty: 1, rate: S.toNum(svc.price)
        });
        Editor.paint();
      });

      $('#pickClient').addEventListener('click', () => Editor.pickClient());
      $('#docForm').addEventListener('submit', (e) => { e.preventDefault(); Editor.save({ announce: true }); });
      $('#saveDraftBtn').addEventListener('click', () => Editor.save({ announce: true }));
      $('#emailBtn').addEventListener('click', () => Editor.openEmail());
      $('#printBtn').addEventListener('click', () => Editor.download());
      $('#payReceivedBtn').addEventListener('click', () => Editor.paymentReceived());
      $('#approveBtn').addEventListener('click', () => Editor.approve());
      $('#zoomIn').addEventListener('click', () => Editor.setZoom(Editor.zoom + 0.1));
      $('#zoomOut').addEventListener('click', () => Editor.setZoom(Editor.zoom - 0.1));
    },

    hydrate() {
      const d = Editor.doc;
      $('#docId').value = d.id;
      $('#docType').value = d.type;
      $('#docNumber').value = d.number || (Editor.isNew ? (Editor.peeked = S.peekNumber(d.type)) : '');
      $('#docDate').value = d.date || S.TODAY();
      $('#docValid').value = d.validUntil || '';
      $('#docDue').value = d.dueDate || '';
      $('#cliName').value = d.clientName || '';
      $('#cliPhone').value = d.clientPhone || '';
      $('#cliEmail').value = d.clientEmail || '';
      $('#cliAddress').value = d.clientAddress || '';
      $('#petName').value = d.petName || '';
      $('#petInfo').value = d.petInfo || '';
      $('#discValue').value = d.discountValue || 0;
      $('#discType').value = d.discountType || 'amount';
      $('#taxRate').value = d.taxRate || 0;
      $('#taxLabel').value = d.taxLabel || 'GST';
      $('#amountPaid').value = d.amountPaid || 0;
      $('#docNotes').value = d.notes || '';
      $('#docTerms').value = (d.terms || []).join('\n');

      const isBill = d.type === 'bill';
      $('#wrapValid').hidden = isBill;
      $('#wrapDue').hidden = !isBill;
      $('#wrapPaid').hidden = !isBill;

      const dlBtn = $('#printBtn');
      if (dlBtn) {
        dlBtn.innerHTML = '⤓ Download ' + (isBill ? 'Bill' : 'Quotation');
        dlBtn.title = 'Download this ' + (isBill ? 'bill' : 'quotation') + ' as a PDF';
      }

      const prBtn = $('#payReceivedBtn');
      const apBtn = $('#approveBtn');
      if (prBtn) {
        prBtn.hidden = isBill;
        const converted = !isBill && d.convertedBillId && S.getDocument(d.convertedBillId);
        prBtn.innerHTML = converted ? '→ Open the paid bill' : '✓ Payment received · convert to bill';
      }
      if (apBtn) {
        apBtn.hidden = !isBill;
        apBtn.innerHTML = (isBill && S.scheduleForBill(d.id)) ? '✓ Reschedule service' : '✓ Approve &amp; schedule';
      }

      // status options
      const sel = $('#docStatus');
      sel.innerHTML = S.statuses(d.type).map((s) =>
        `<option value="${esc(s)}"${s === (d.status || 'Draft') ? ' selected' : ''}>${esc(s)}</option>`).join('');

      // datalists
      $('#serviceNames').innerHTML = S.services.map((s) => `<option value="${esc(s.name)}"></option>`).join('');
      $('#clientNames').innerHTML = S.clients.map((c) => `<option value="${esc(c.name)}"></option>`).join('');
      let unitList = $('#unitList');
      if (!unitList) {
        unitList = el('datalist', { id: 'unitList' });
        document.body.appendChild(unitList);
      }
      unitList.innerHTML = UNITS.map((u) => `<option value="${esc(u)}"></option>`).join('');

      // quick service dropdown
      $('#quickService').innerHTML =
        '<option value="">＋ Add from price list…</option>' +
        '<optgroup label="Services">' +
        S.services.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}${s.price ? ' — ₹' + S.num(s.price) : ''}</option>`).join('') +
        '</optgroup>' +
        '<optgroup label="Packages">' +
        PACKAGES.map((p) => `<option value="pkg:${esc(p.id)}">${esc(p.name)}</option>`).join('') +
        '</optgroup>';

      Editor.paint();
    },

    /** Push the DOM form state into Editor.doc */
    readForm() {
      const d = Editor.doc;
      if (!d || Editor.attached === false) return;
      d.number = $('#docNumber').value.trim();
      d.date = $('#docDate').value;
      d.validUntil = $('#docValid').value;
      d.dueDate = $('#docDue').value;
      d.status = $('#docStatus').value;
      d.clientName = $('#cliName').value.trim();
      d.clientPhone = $('#cliPhone').value.trim();
      d.clientEmail = $('#cliEmail').value.trim();
      d.clientAddress = $('#cliAddress').value.trim();
      d.petName = $('#petName').value.trim();
      d.petInfo = $('#petInfo').value.trim();
      d.discountValue = S.toNum($('#discValue').value);
      d.discountType = $('#discType').value;
      d.taxRate = S.toNum($('#taxRate').value);
      d.taxLabel = $('#taxLabel').value.trim() || 'GST';
      d.amountPaid = S.toNum($('#amountPaid').value);
      d.notes = $('#docNotes').value;
      d.terms = $('#docTerms').value.split('\n').map((x) => x.trim()).filter(Boolean);

      d.items = $$('#itemsWrap .item').map((row) => ({
        id: row.getAttribute('data-id') || S.uid(),
        description: (row.querySelector('[data-f="description"]') || {}).value || '',
        unit: (row.querySelector('[data-f="unit"]') || {}).value || '',
        qty: S.toNum((row.querySelector('[data-f="qty"]') || {}).value),
        rate: S.toNum((row.querySelector('[data-f="rate"]') || {}).value),
        note: (row.querySelector('[data-f="note"]') || {}).value || ''
      }));
      d.updatedAt = Date.now();
    },

    /** Re-render item rows + preview. */
    paint() {
      if (Editor.attached !== false) Editor.renderItems();
      Editor.renderPreview();
    },

    renderItems() {
      const d = Editor.doc;
      const wrap = $('#itemsWrap');
      wrap.innerHTML = d.items.map((it, i) => `
        <div class="item" data-idx="${i}" data-id="${esc(it.id || '')}">
          <label class="field item-desc">
            <span>Service / description</span>
            <input type="text" data-f="description" list="serviceNames" value="${esc(it.description)}" placeholder="e.g. Homestay for Pets — 2 nights" />
          </label>
          <label class="field">
            <span>Unit</span>
            <input type="text" data-f="unit" list="unitList" value="${esc(it.unit)}" placeholder="per night" />
          </label>
          <label class="field">
            <span>No. of days</span>
            <input type="number" data-f="qty" min="0" step="1" value="${esc(it.qty)}" />
          </label>
          <label class="field">
            <span>Rate ₹</span>
            <input type="number" data-f="rate" min="0" step="0.01" value="${esc(it.rate)}" />
          </label>
          <div class="amount-cell">
            <span>Amount</span>
            <div class="amount-val">${S.num(S.toNum(it.qty) * S.toNum(it.rate))}</div>
          </div>
          <button type="button" class="mini danger del" data-del="${i}" title="Remove line">✕</button>
        </div>`).join('');

      const t = S.totals(d);
      let foot = $('#itemsFoot');
      if (!foot) {
        foot = el('div', { class: 'items-foot', id: 'itemsFoot' });
        wrap.parentNode.insertBefore(foot, wrap.nextSibling);
      }
      foot.innerHTML = `<span>${d.items.length} line${d.items.length === 1 ? '' : 's'}</span>
        <span>Subtotal <b style="color:var(--ink-900)">${S.money(t.subtotal)}</b></span>`;
    },

    renderPreview() {
      const sheet = $('#sheet');
      if (sheet) sheet.innerHTML = global.Render.sheet(Editor.doc);
      Editor.applyZoom();
    },

    setZoom(z) {
      Editor.zoom = Math.min(1.3, Math.max(0.45, Math.round(z * 100) / 100));
      Editor.applyZoom();
    },

    applyZoom() {
      const holder = $('#sheetHolder');
      const inner = $('#sheet');
      if (!holder || !inner) return;
      holder.style.transform = 'scale(' + Editor.zoom + ')';
      // pull up the blank space left behind when scaled below 100 %
      holder.style.marginBottom = Editor.zoom < 1
        ? -(inner.offsetHeight * (1 - Editor.zoom)) + 'px'
        : '0px';
      const lbl = $('#zoomLabel');
      if (lbl) lbl.textContent = Math.round(Editor.zoom * 100) + '%';
    },

    pickClient() {
      const clients = S.clients;
      if (!clients.length) {
        toast('No saved clients yet — they appear here once you save a document.', 'info');
        return;
      }
      openModal(
        `<div class="modal-head"><h3>Pick a saved client</h3>
           <button class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
         <div class="modal-body">
           <div class="pick-list">
             ${clients.map((c) => `
               <button type="button" class="pick" data-client="${esc(c.id)}">
                 <span class="lr-ico">${esc((c.name || '?').charAt(0).toUpperCase())}</span>
                 <span class="pm">
                   <strong>${esc(c.name)}</strong>
                   <small>${esc([c.phone, c.email, (c.pets || []).map((p) => p.name).join(', ')].filter(Boolean).join(' · ') || 'No contact details')}</small>
                 </span>
               </button>`).join('')}
           </div>
         </div>`,
        (box) => {
          box.addEventListener('click', (e) => {
            const b = e.target.closest('[data-client]');
            const close = e.target.closest('[data-act="close"]');
            if (close) return closeModal();
            if (!b) return;
            const c = S.getClient(b.getAttribute('data-client'));
            if (!c) return;
            Editor.readForm();
            Editor.doc.clientId = c.id;
            Editor.doc.clientName = c.name || '';
            Editor.doc.clientPhone = c.phone || '';
            Editor.doc.clientEmail = c.email || '';
            Editor.doc.clientAddress = c.address || '';
            if (c.pets && c.pets.length) {
              Editor.doc.petName = c.pets[0].name || '';
              Editor.doc.petInfo = c.pets[0].info || '';
            }
            closeModal();
            $('#cliName').value = Editor.doc.clientName;
            $('#cliPhone').value = Editor.doc.clientPhone;
            $('#cliEmail').value = Editor.doc.clientEmail;
            $('#cliAddress').value = Editor.doc.clientAddress;
            $('#petName').value = Editor.doc.petName;
            $('#petInfo').value = Editor.doc.petInfo;
            Editor.renderPreview();
            toast('Client details filled in', 'ok');
          });
        }
      );
    },

    validate() {
      Editor.readForm();
      const d = Editor.doc;
      const problems = [];
      if (!d.clientName) problems.push('client name');
      if (!d.clientEmail) problems.push('client email');
      const usable = d.items.filter((it) => String(it.description).trim());
      if (!usable.length) problems.push('at least one service line');
      if (!d.date) problems.push('document date');
      return problems;
    },

    save(opts) {
      const o = opts || {};
      const problems = Editor.validate();
      const hard = problems.filter((p) => p !== 'client email');
      if (hard.length) {
        toast('Please add: ' + hard.join(', ') + '.', 'err', 4200);
        return null;
      }
      const d = Editor.doc;
      if (Editor.isNew) {
        if (!d.number || d.number === Editor.peeked) {
          d.number = S.nextNumber(d.type);
          S.bumpCounter(d.type);
        }
        Editor.isNew = false;
      }
      d.savedAt = Date.now();
      d.updatedAt = Date.now();
      S.saveDocument(d);
      const c = S.upsertClient({
        name: d.clientName, email: d.clientEmail, phone: d.clientPhone,
        address: d.clientAddress, petName: d.petName, petInfo: d.petInfo
      });
      if (c) d.clientId = c.id;

      global.App.refreshCounts();
      if (o.announce) toast(`${d.type === 'bill' ? 'Bill' : 'Quotation'} ${d.number} saved`, 'ok');
      if (o.goToDocuments) location.hash = '#/documents';
      return d;
    },

    print() {
      const problems = Editor.validate();
      if (problems.filter((p) => p !== 'client email').length) {
        toast('Please add: ' + problems.filter((p) => p !== 'client email').join(', ') + '.', 'err');
        return;
      }
      const area = $('#printArea');
      area.innerHTML = '<div class="sheet">' + $('#sheet').innerHTML + '</div>';
      const cleanup = () => { area.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
      window.addEventListener('afterprint', cleanup);
      setTimeout(() => { window.print(); setTimeout(cleanup, 800); }, 60);
    },

    /** Save the current document straight to a PDF file (no print dialog). */
    async download() {
      const problems = Editor.validate();
      if (problems.filter((p) => p !== 'client email').length) {
        toast('Please add: ' + problems.filter((p) => p !== 'client email').join(', ') + '.', 'err');
        return;
      }
      const isBill = Editor.doc.type === 'bill';
      const btn = $('#printBtn');
      const original = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = 'Preparing PDF…'; }
      try {
        await global.Pdf.downloadDoc(Editor.doc);
        toast((isBill ? 'Bill' : 'Quotation') + ' PDF downloaded', 'ok');
      } catch (err) {
        console.error(err);
        toast('Could not build the PDF directly — opening the print dialog instead.', 'warn', 5200);
        Editor.print();
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
      }
    },

    /** Quotation: record that payment arrived — create a paid bill from it. */
    async paymentReceived() {
      const d = Editor.doc;
      if (!d || d.type !== 'quotation') return;
      if (d.convertedBillId && S.getDocument(d.convertedBillId)) {
        location.hash = '#/edit/' + d.convertedBillId;
        return;
      }
      const ok = await askConfirm({
        title: 'Convert to a bill?',
        body: 'A new bill will be created from this quotation, marked Paid in full, and this quotation will be set to Accepted. You will be taken to the new bill.',
        ok: 'Create paid bill'
      });
      if (!ok) return;
      const saved = Editor.save({});
      if (!saved) return;
      const bill = S.billFromQuotation(saved.id);
      if (!bill) { toast('Could not create the bill.', 'err'); return; }
      global.App.refreshCounts();
      toast('Bill ' + bill.number + ' created · marked Paid', 'ok', 4600);
      location.hash = '#/edit/' + bill.id;
    },

    /** Bill: approve it and book the service on the calendar. */
    async approve() {
      const d = Editor.doc;
      if (!d || d.type !== 'bill') return;
      const saved = Editor.save({});
      if (!saved) return;
      const existing = S.scheduleForBill(saved.id);
      const picked = await scheduleDialog({
        title: existing ? 'Reschedule service' : 'Approve & schedule service',
        date: (existing && existing.date) || saved.dueDate || S.TODAY(),
        time: (existing && existing.time) || '10:00',
        note: (existing && existing.note) || ''
      });
      if (!picked) return;
      if (saved.status === 'Draft') saved.status = 'Unpaid';
      saved.approvedAt = Date.now();
      saved.updatedAt = Date.now();
      S.saveDocument(saved);
      const entry = S.scheduleBill(saved, picked);
      $('#docStatus').value = saved.status;
      Editor.renderPreview();
      global.App.refreshCounts();
      toast('Scheduled for ' + S.prettyDate(entry.date) + (entry.time ? ' at ' + entry.time : ''), 'ok', 4600);
    },

    openEmail() {
      const problems = Editor.validate();
      if (problems.filter((p) => p !== 'client email').length) {
        toast('Please add: ' + problems.filter((p) => p !== 'client email').join(', ') + '.', 'err');
        return;
      }
      if (!Editor.doc.clientEmail) {
        toast('Client email is required to send. Add it in the client panel.', 'err', 4200);
        return;
      }

      const saved = Editor.save({});
      const d = Editor.doc;
      const conn = global.Mailer.connectionLabel();
      const isBill = d.type === 'bill';

      $('#mailTo').value = d.clientEmail || '';
      $('#mailName').value = d.clientName || '';
      $('#mailSubject').value = `${isBill ? 'Invoice' : 'Quotation'} ${d.number} — ${S.settings.business.name}`;
      $('#mailMessage').value = isBill
        ? `Dear ${d.clientName || 'Pet Parent'},\n\nPlease find the details of your invoice ${d.number} below. The total payable is ${S.money(S.totals(d).total)}.\n\nThank you for trusting us with your pet's care.`
        : `Dear ${d.clientName || 'Pet Parent'},\n\nThank you for your interest. Please find our quotation ${d.number} below, valid until ${S.prettyDate(d.validUntil)}.\n\nWe would be happy to answer any questions.`;

      const note = $('#mailPreviewNote');
      if (!conn.ok) {
        note.className = 'mail-preview-note err';
        note.innerHTML = `<b>EmailJS is not connected.</b> ${esc(conn.text)}. ` +
          `<a href="#/settings" id="goSettings">Open Settings</a> to add your IDs — the document is already saved, so you can send it later.`;
      } else {
        note.className = 'mail-preview-note';
        const c = S.settings.emailjs;
        note.innerHTML = `Sending through <b>${esc(c.serviceId)}</b> / <b>${esc(c.templateId)}</b>.` +
          (c.sendCopy && (c.ccEmail || S.settings.business.email)
            ? ` A copy will also go to <b>${esc(c.ccEmail || S.settings.business.email)}</b>.`
            : ' A copy is not being sent to your own inbox.');
      }

      $('#emailPanel').hidden = false;
      $('#goSettings') && $('#goSettings').addEventListener('click', () => { closeEmailPanel(); });
    },

    async sendEmail() {
      const btn = $('#emailPanelSend');
      const to = $('#mailTo').value.trim();
      const name = $('#mailName').value.trim();
      const subject = $('#mailSubject').value.trim();
      const message = $('#mailMessage').value;

      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        toast('Enter a valid client email address.', 'err');
        return;
      }
      if (!global.Mailer.isConfigured()) {
        toast('EmailJS is not configured yet. Open Settings and add your IDs.', 'err', 4500);
        return;
      }

      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = 'Sending…';
      const d = Editor.save({}) || Editor.doc;

      try {
        const res = await global.Mailer.sendDocument(d, { to: to, name: name, subject: subject, message: message });
        d.sentAt = Date.now();
        if (d.type === 'quotation' && d.status === 'Draft') d.status = 'Sent';
        if (d.type === 'bill' && d.status === 'Draft') d.status = 'Unpaid';
        S.saveDocument(d);
        $('#docStatus').value = d.status;
        closeEmailPanel();
        toast('Email sent to ' + res.sent.join(' and '), 'ok', 4600);
        if (res.copyError) toast('Your copy could not be sent: ' + res.copyError, 'warn', 6000);
        global.App.refreshCounts();
      } catch (err) {
        console.error(err);
        toast(global.Mailer.friendlyError(err), 'err', 7000);
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }
  };

  function closeEmailPanel() {
    const p = $('#emailPanel');
    if (p) p.hidden = true;
  }

  /** Ask for the service date/time/note when approving a bill. Resolves to the values or null. */
  function scheduleDialog(opts) {
    const o = Object.assign({ title: 'Schedule service', date: '', time: '', note: '' }, opts || {});
    return new Promise((resolve) => {
      const bd = $('#modalBackdrop');
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        bd.removeEventListener('click', onBackdrop);
        closeModal();
        resolve(val);
      };
      const onBackdrop = (ev) => { if (ev.target === bd) finish(null); };

      openModal(
        `<div class="modal-head"><h3>${esc(o.title)}</h3>
           <button class="icon-btn" data-act="x" aria-label="Close">✕</button></div>
         <div class="modal-body">
           <p class="hint" style="margin-bottom:14px">Pick when this service should happen. It will be added to the Calendar.</p>
           <div class="field-row">
             <label class="field"><span>Service date <i class="req">*</i></span>
               <input type="date" id="schDate" value="${esc(o.date)}" /></label>
             <label class="field"><span>Start time</span>
               <input type="time" id="schTime" value="${esc(o.time)}" /></label>
           </div>
           <label class="field"><span>Note for the visit</span>
             <textarea id="schNote" rows="2" placeholder="e.g. Pick up Bruno at 9 am">${esc(o.note)}</textarea></label>
         </div>
         <div class="modal-foot">
           <button class="btn btn-ghost" data-act="cancel">Cancel</button>
           <button class="btn btn-primary" data-act="ok">Schedule service</button>
         </div>`,
        (box) => {
          box.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]');
            if (!act) return;
            const a = act.getAttribute('data-act');
            if (a === 'ok') {
              const date = $('#schDate').value;
              if (!date) { toast('Please choose a service date.', 'err'); return; }
              finish({ date: date, time: $('#schTime').value, note: $('#schNote').value.trim() });
            } else {
              finish(null);
            }
          });
        }
      );
      bd.addEventListener('click', onBackdrop);
    });
  }

  /* =======================================================================
     VIEWS
     ======================================================================= */
  const Views = {};

  /* ------------------------------ dashboard ----------------------------- */
  Views.dashboard = {
    title: 'Dashboard',
    subtitle: 'Overview of your practice',
    actions() {
      return `<a class="btn btn-ghost btn-sm" href="#/documents">All documents</a>
              <a class="btn btn-primary btn-sm" href="#/new/quotation">＋ New quotation</a>`;
    },
    mount() {
      const st = S.stats();
      const b = S.settings.business;

      const card = (cls, icon, label, value, sub) => `
        <div class="stat ${cls}">
          <div class="st-ico">${icon}</div>
          <div class="st-label">${esc(label)}</div>
          <div class="st-value">${value}</div>
          <div class="st-sub">${esc(sub)}</div>
        </div>`;

      $('#statGrid').innerHTML =
        card('', '📄', 'Quotations', st.quotes, st.accepted + ' accepted · ' + st.conversion + '% win rate') +
        card('brown', '🧾', 'Bills raised', st.bills, 'This month ' + S.money(st.thisMonth)) +
        card('green', '💰', 'Collected', S.money(st.collected), 'Billed ' + S.money(st.billed)) +
        card('cream', '⏳', 'Outstanding', S.money(st.outstanding), st.sent + ' documents emailed');

      /* recent */
      const recent = S.documents.slice().sort((a, b2) => (b2.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 6);
      $('#recentDocs').innerHTML = recent.length
        ? recent.map((d) => `
            <div class="list-row click" data-open="${esc(d.id)}">
              <div class="lr-ico ${d.type === 'bill' ? 'bill' : ''}">${d.type === 'bill' ? '🧾' : '📄'}</div>
              <div class="lr-main">
                <strong>${esc(d.clientName || 'Untitled')}</strong>
                <small>${esc(d.number || 'No number')} · ${esc(S.prettyDate(d.date))} · ${S.relTime(d.updatedAt)}</small>
              </div>
              <span class="badge ${statusClass(d.status)}">${esc(d.status)}</span>
              <span class="lr-amt">${S.money(S.totals(d).total)}</span>
            </div>`).join('')
        : `<div class="empty" style="padding:26px 0"><div class="empty-emoji">🍃</div>
             <h3>Nothing here yet</h3><p>Your latest quotations and bills will show up in this list.</p></div>`;

      /* setup prompt */
      const conn = global.Mailer.connectionLabel();
      const note = $('#setupNote');
      if (!conn.ok) {
        note.className = 'mini-note';
        note.innerHTML = `<b>One step left:</b> connect EmailJS so you can email documents straight to clients. ${esc(conn.text)}. <a href="#/settings" style="font-weight:700">Open Settings →</a>`;
      } else if (!b.phone || !b.email) {
        note.className = 'mini-note';
        note.innerHTML = `<b>Almost there:</b> add your business phone and email in <a href="#/settings" style="font-weight:700">Settings</a> so they appear on every document.`;
      } else {
        note.className = 'mini-note good';
        note.innerHTML = `<b>You're all set.</b> EmailJS is connected and your business profile is complete. Create a quotation or bill to get started.`;
      }

      /* money breakdown */
      const quoteOpen = S.documents.filter((d) => d.type === 'quotation' && d.status !== 'Declined' && d.status !== 'Expired');
      const quoteValue = quoteOpen.reduce((s, d) => s + S.totals(d).total, 0);
      $('#moneyBreak').innerHTML = `
        <div class="mb-row"><span><i class="mb-dot" style="background:var(--orange-500)"></i>Open quotations</span><span>${S.money(quoteValue)}</span></div>
        <div class="mb-row"><span><i class="mb-dot" style="background:var(--brown-500)"></i>Invoiced</span><span>${S.money(st.billed)}</span></div>
        <div class="mb-row"><span><i class="mb-dot" style="background:var(--green-500)"></i>Collected</span><span>${S.money(st.collected)}</span></div>
        <div class="mb-row"><span><i class="mb-dot" style="background:var(--danger)"></i>Outstanding</span><span>${S.money(st.outstanding)}</span></div>
        <div class="mb-row"><span>Total value on the books</span><span>${S.money(quoteValue + st.billed)}</span></div>`;

      /* top services */
      const top = S.topServices(6);
      $('#topServices').innerHTML = top.length
        ? top.map((s) => {
            const max = top[0].count || 1;
            return `<div class="list-row" style="flex-direction:column;align-items:stretch;gap:0">
              <div style="display:flex;gap:12px;align-items:center">
                <div class="lr-main"><strong>${esc(s.name)}</strong><small>${s.count} line${s.count === 1 ? '' : 's'} · ${S.money(s.value)}</small></div>
              </div>
              <div class="lr-bar"><i style="width:${Math.round((s.count / max) * 100)}%"></i></div>
            </div>`;
          }).join('')
        : `<div class="empty" style="padding:26px 0"><div class="empty-emoji">🐕</div>
             <h3>No service history</h3><p>Once you raise documents, your most-quoted services appear here.</p></div>`;

      $('#recentDocs').onclick = (e) => {
        const row = e.target.closest('[data-open]');
        if (row) location.hash = '#/edit/' + row.getAttribute('data-open');
      };
    }
  };

  /* ------------------------------ editor -------------------------------- */
  Views.document = {
    title: 'New document',
    subtitle: '',
    actions() {
      return `<span class="badge grey" id="editorBadge">Draft</span>`;
    },
    mount(params) {
      let doc, isNew;
      if (params.id) {
        doc = S.getDocument(params.id);
        if (!doc) { toast('That document no longer exists.', 'err'); location.hash = '#/documents'; return; }
        isNew = false;
      } else {
        const type = params.type === 'bill' ? 'bill' : 'quotation';
        doc = Editor.blank(type);
        isNew = true;
      }
      Editor.load(doc, isNew);

      const isBill = doc.type === 'bill';
      $('#pageTitle').textContent = isNew
        ? (isBill ? 'New bill' : 'New quotation')
        : (isBill ? 'Edit bill ' : 'Edit quotation ') + (doc.number || '');
      $('#pageSubtitle').textContent = isBill
        ? 'Invoice a client for services delivered'
        : 'Price a package and send it for approval';
      const badge = $('#editorBadge');
      if (badge) badge.textContent = doc.status || 'Draft';
    }
  };

  /* ------------------------------ documents ----------------------------- */
  const DocList = {
    type: '', status: '', q: '', sort: 'new',

    render() {
      let list = S.documents.slice();
      if (DocList.type) list = list.filter((d) => d.type === DocList.type);
      if (DocList.status) list = list.filter((d) => (d.status || 'Draft') === DocList.status);
      if (DocList.q) {
        const q = DocList.q.toLowerCase();
        list = list.filter((d) =>
          [d.number, d.clientName, d.clientEmail, d.clientPhone, d.petName,
            (d.items || []).map((i) => i.description).join(' ')]
            .join(' ').toLowerCase().includes(q));
      }
      if (DocList.sort === 'new') list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || 0) - (a.updatedAt || 0));
      if (DocList.sort === 'old') list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      if (DocList.sort === 'high') list.sort((a, b) => S.totals(b).total - S.totals(a).total);

      const body = $('#docsBody');
      $('#docsEmpty').hidden = list.length > 0;
      $('#docsTable').style.display = list.length ? '' : 'none';

      body.innerHTML = list.map((d) => {
        const t = S.totals(d);
        return `<tr>
          <td><span class="cell-main">${esc(d.number || '—')}</span>
              <div class="cell-sub">${d.sentAt ? 'emailed ' + esc(S.relTime(d.sentAt)) : 'not emailed yet'}</div></td>
          <td><span class="badge-plain ${d.type === 'bill' ? 'b' : 'q'}">${d.type === 'bill' ? 'BILL' : 'QUOTE'}</span></td>
          <td><span class="cell-main">${esc(d.clientName || '—')}</span>
              <div class="cell-sub">${esc(d.clientPhone || d.clientEmail || '')}</div></td>
          <td>${esc(S.prettyDate(d.date))}</td>
          <td class="ta-r num">${S.money(t.total)}${d.type === 'bill' && t.balance > 0 && t.balance !== t.total ? `<div class="cell-sub">due ${S.money(t.balance)}</div>` : ''}</td>
          <td><span class="badge ${statusClass(d.status)}">${esc(d.status || 'Draft')}</span></td>
          <td>
            <div class="row-acts">
              <button class="mini" data-act="open" data-id="${esc(d.id)}" title="Open">✎</button>
              <button class="mini" data-act="download" data-id="${esc(d.id)}" title="Download PDF">⤓</button>
              <button class="mini" data-act="email" data-id="${esc(d.id)}" title="Email">✉</button>
              <button class="mini" data-act="dup" data-id="${esc(d.id)}" title="Duplicate">⧉</button>
              <button class="mini danger" data-act="del" data-id="${esc(d.id)}" title="Delete">🗑</button>
            </div>
          </td>
        </tr>`;
      }).join('');
    },

    statusOptions(type) {
      const base = ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired', 'Unpaid', 'Partially Paid', 'Paid', 'Cancelled'];
      return base;
    }
  };

  Views.documents = {
    title: 'Documents',
    subtitle: 'Every quotation and bill you have created',
    actions() {
      return `<a class="btn btn-ghost btn-sm" href="#/new/bill">🧾 New bill</a>
              <a class="btn btn-primary btn-sm" href="#/new/quotation">＋ New quotation</a>`;
    },
    mount() {
      const selStatus = $('#docFilterStatus');
      selStatus.innerHTML = '<option value="">All statuses</option>' +
        DocList.statusOptions().map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');

      $('#docSearch').oninput = (e) => { DocList.q = e.target.value; DocList.render(); };
      $('#docFilterType').onchange = (e) => { DocList.type = e.target.value; DocList.render(); };
      selStatus.onchange = (e) => { DocList.status = e.target.value; DocList.render(); };
      $('#docSort').onchange = (e) => { DocList.sort = e.target.value; DocList.render(); };

      $('#docsBody').onclick = async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        const doc = S.getDocument(id);
        if (!doc) return;

        if (act === 'open') location.hash = '#/edit/' + id;
        else if (act === 'download') {
          const original = btn.innerHTML;
          btn.disabled = true;
          btn.innerHTML = '…';
          global.Pdf.downloadDoc(doc)
            .then(() => toast((doc.type === 'bill' ? 'Bill' : 'Quotation') + ' PDF downloaded', 'ok'))
            .catch((err) => {
              console.error(err);
              toast('Could not build the PDF directly — opening the print dialog instead.', 'warn', 5200);
              const area = $('#printArea');
              area.innerHTML = '<div class="sheet">' + global.Render.sheet(doc) + '</div>';
              const cleanup = () => { area.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
              window.addEventListener('afterprint', cleanup);
              setTimeout(() => { window.print(); setTimeout(cleanup, 800); }, 60);
            })
            .finally(() => { btn.disabled = false; btn.innerHTML = original; });
        } else if (act === 'email') {
          Editor.load(doc, false, { detached: true });
          Editor.openEmail();
        } else if (act === 'dup') {
          const copy = S.duplicateDocument(id);
          DocList.render();
          global.App.refreshCounts();
          toast('Duplicated as ' + copy.number, 'ok');
        } else if (act === 'del') {
          const ok = await askConfirm({
            title: 'Delete ' + doc.number + '?',
            body: 'This removes the document from your records. It cannot be undone.',
            ok: 'Delete', danger: true
          });
          if (ok) {
            S.removeDocument(id);
            DocList.render();
            global.App.refreshCounts();
            toast('Document deleted', 'ok');
          }
        }
      };

      DocList.render();
    }
  };

  /* ------------------------------ calendar ------------------------------ */
  const Cal = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    shift(delta) {
      const d = new Date(Cal.year, Cal.month + delta, 1);
      Cal.year = d.getFullYear();
      Cal.month = d.getMonth();
    },
    goto(year, month) { Cal.year = year; Cal.month = month; },
    render() {
      const wrap = $('#calGrid');
      if (!wrap) return;
      const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      $('#calWeekdays').innerHTML = WD.map((d) => `<span>${d}</span>`).join('');
      $('#calLabel').textContent = new Date(Cal.year, Cal.month, 1)
        .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

      const all = S.schedules;
      const hasAny = all.length > 0;
      $('#calEmpty').hidden = hasAny;
      $('#calWeekdays').hidden = !hasAny;
      wrap.hidden = !hasAny;
      if (!hasAny) return;

      const byDate = {};
      all.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });

      const startOffset = new Date(Cal.year, Cal.month, 1).getDay();
      const daysInMonth = new Date(Cal.year, Cal.month + 1, 0).getDate();
      const pad = (n) => String(n).padStart(2, '0');
      const todayKey = S.TODAY();

      let cells = '';
      for (let i = 0; i < startOffset; i++) cells += '<div class="cal-cell blank"></div>';
      for (let day = 1; day <= daysInMonth; day++) {
        const key = Cal.year + '-' + pad(Cal.month + 1) + '-' + pad(day);
        const items = byDate[key] || [];
        const chips = items.map((s) => {
          const who = s.clientName || s.petName || 'Service';
          const tip = [s.time, who, s.petName, s.billNumber].filter(Boolean).join(' · ');
          return `<button type="button" class="cal-chip" data-sch="${esc(s.billId)}" title="${esc(tip)}">
            ${s.time ? `<b>${esc(s.time)}</b>` : ''}<span>${esc(who)}</span>
            ${s.petName ? `<i>${esc(s.petName)}</i>` : ''}
          </button>`;
        }).join('');
        cells += `<div class="cal-cell${key === todayKey ? ' today' : ''}${items.length ? ' has' : ''}">
          <span class="cal-day">${day}</span>
          <div class="cal-items">${chips}</div>
        </div>`;
      }
      const trail = (7 - ((startOffset + daysInMonth) % 7)) % 7;
      for (let i = 0; i < trail; i++) cells += '<div class="cal-cell blank"></div>';
      wrap.innerHTML = cells;
    }
  };

  Views.calendar = {
    title: 'Calendar',
    subtitle: 'Approved services booked from your bills',
    actions() {
      return `<a class="btn btn-ghost btn-sm" href="#/documents">All documents</a>
              <a class="btn btn-primary btn-sm" href="#/new/bill">＋ New bill</a>`;
    },
    mount() {
      Cal.render();
      $('#calPrev').onclick = () => { Cal.shift(-1); Cal.render(); };
      $('#calNext').onclick = () => { Cal.shift(1); Cal.render(); };
      $('#calToday').onclick = () => { const n = new Date(); Cal.goto(n.getFullYear(), n.getMonth()); Cal.render(); };
      $('#calGrid').onclick = (e) => {
        const chip = e.target.closest('[data-sch]');
        if (chip) location.hash = '#/edit/' + chip.getAttribute('data-sch');
      };
    }
  };

  /* ------------------------------ clients ------------------------------- */
  Views.clients = {
    title: 'Clients',
    subtitle: 'Everyone you have quoted or billed',
    actions() {
      return `<a class="btn btn-primary btn-sm" href="#/new/quotation">＋ New quotation</a>`;
    },
    mount() {
      let q = '';
      const render = () => {
        let list = S.clients.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        if (q) {
          const s = q.toLowerCase();
          list = list.filter((c) => [c.name, c.phone, c.email, c.address, (c.pets || []).map((p) => p.name).join(' ')]
            .join(' ').toLowerCase().includes(s));
        }
        $('#clientsEmpty').hidden = list.length > 0;
        $('#clientsBody').innerHTML = list.map((c) => {
          const docs = S.clientDocs(c.id);
          const billed = docs.filter((d) => d.type === 'bill').reduce((s, d) => s + S.totals(d).total, 0);
          return `<tr>
            <td><span class="cell-main">${esc(c.name)}</span>
                <div class="cell-sub">${esc(c.address || S.relTime(c.updatedAt))}</div></td>
            <td>${esc(c.phone || '—')}</td>
            <td>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</td>
            <td>${(c.pets || []).length ? (c.pets || []).map((p) => `<span class="badge grey">${esc(p.name)}</span>`).join(' ') : '—'}</td>
            <td class="ta-r num">${docs.length}</td>
            <td class="ta-r num">${billed ? S.money(billed) : '—'}</td>
            <td>
              <div class="row-acts">
                <button class="mini" data-act="quote" data-id="${esc(c.id)}" title="New quotation">📄</button>
                <button class="mini" data-act="bill" data-id="${esc(c.id)}" title="New bill">🧾</button>
                <button class="mini" data-act="edit" data-id="${esc(c.id)}" title="Edit">✎</button>
                <button class="mini danger" data-act="del" data-id="${esc(c.id)}" title="Delete">🗑</button>
              </div>
            </td>
          </tr>`;
        }).join('');
      };

      $('#cliSearch').oninput = (e) => { q = e.target.value; render(); };

      $('#exportClients').onclick = () => {
        const rows = [['Name', 'Phone', 'Email', 'Address', 'Pets']].concat(
          S.clients.map((c) => [c.name, c.phone, c.email, c.address, (c.pets || []).map((p) => p.name).join(' | ')])
        );
        const csv = rows.map((r) => r.map((v) => '"' + String(v || '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
        download('pashu-clients-' + S.TODAY() + '.csv', csv, 'text/csv');
        toast('Client list exported', 'ok');
      };

      $('#clientsBody').onclick = async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        const c = S.getClient(id);
        if (!c) return;

        if (act === 'quote' || act === 'bill') {
          const doc = Editor.blank(act === 'bill' ? 'bill' : 'quotation');
          doc.clientId = c.id;
          doc.clientName = c.name || '';
          doc.clientPhone = c.phone || '';
          doc.clientEmail = c.email || '';
          doc.clientAddress = c.address || '';
          if (c.pets && c.pets.length) { doc.petName = c.pets[0].name || ''; doc.petInfo = c.pets[0].info || ''; }
          S.saveDocument(doc);
          location.hash = '#/edit/' + doc.id;
        } else if (act === 'edit') {
          openModal(
            `<div class="modal-head"><h3>Edit client</h3>
               <button class="icon-btn" data-act="x">✕</button></div>
             <div class="modal-body">
               <div class="field-row">
                 <label class="field"><span>Name</span><input id="ecName" value="${esc(c.name)}"></label>
                 <label class="field"><span>Phone</span><input id="ecPhone" value="${esc(c.phone)}"></label>
               </div>
               <label class="field" style="margin-bottom:14px"><span>Email</span><input id="ecEmail" value="${esc(c.email)}"></label>
               <label class="field"><span>Address / area</span><input id="ecAddress" value="${esc(c.address)}"></label>
             </div>
             <div class="modal-foot">
               <button class="btn btn-ghost" data-act="x">Cancel</button>
               <button class="btn btn-primary" data-act="save">Save client</button>
             </div>`,
            (box) => {
              box.addEventListener('click', (ev) => {
                const a = ev.target.closest('[data-act]');
                if (!a) return;
                const act2 = a.getAttribute('data-act');
                if (act2 === 'x') return closeModal();
                if (act2 === 'save') {
                  c.name = $('#ecName').value.trim() || c.name;
                  c.phone = $('#ecPhone').value.trim();
                  c.email = $('#ecEmail').value.trim();
                  c.address = $('#ecAddress').value.trim();
                  c.updatedAt = Date.now();
                  S.write(S.KEY.clients, S.clients);
                  closeModal();
                  render();
                  toast('Client updated', 'ok');
                }
              });
            }
          );
        } else if (act === 'del') {
          const docs = S.clientDocs(id);
          const ok = await askConfirm({
            title: 'Delete ' + c.name + '?',
            body: docs.length
              ? `This client has ${docs.length} document(s). The documents will stay but will no longer be linked to a client record.`
              : 'This removes the client record. It cannot be undone.',
            ok: 'Delete', danger: true
          });
          if (ok) { S.removeClient(id); render(); global.App.refreshCounts(); toast('Client deleted', 'ok'); }
        }
      };

      render();
    }
  };

  /* ------------------------------ services ------------------------------ */
  Views.services = {
    title: 'Services & prices',
    subtitle: 'Your service menu and one-tap packages',
    actions() {
      return `<a class="btn btn-ghost btn-sm" href="#/new/quotation">＋ Use in a quotation</a>`;
    },
    mount() {
      const renderServices = () => {
        $('#serviceList').innerHTML = S.services.map((s) => `
          <div class="svc-row" data-id="${esc(s.id)}">
            <div class="grow">
              <input type="text" data-f="name" value="${esc(s.name)}" placeholder="Service name" />
              <div class="cat">${esc(s.category || 'General')}</div>
            </div>
            <input type="text" data-f="unit" value="${esc(s.unit)}" placeholder="per day" list="unitList" />
            <div class="money"><input type="number" data-f="price" value="${S.toNum(s.price)}" min="0" step="0.01" /></div>
            <button class="mini danger" data-del="${esc(s.id)}" title="Remove">✕</button>
          </div>`).join('') +
          `<p class="hint" style="margin:10px 0 0">${S.services.length} services · rates are saved as you type.</p>`;
      };

      // datalist of units for this view
      let unitList = $('#unitList');
      if (!unitList) { unitList = el('datalist', { id: 'unitList' }); document.body.appendChild(unitList); }
      unitList.innerHTML = UNITS.map((u) => `<option value="${esc(u)}"></option>`).join('');

      $('#serviceList').oninput = (e) => {
        const row = e.target.closest('.svc-row');
        if (!row) return;
        const svc = S.services.find((s) => s.id === row.getAttribute('data-id'));
        if (!svc) return;
        const f = e.target.getAttribute('data-f');
        if (f === 'price') svc.price = S.toNum(e.target.value);
        else if (f === 'name') svc.name = e.target.value;
        else if (f === 'unit') svc.unit = e.target.value;
        S.write(S.KEY.services, S.services);
        if (f === 'name') {
          const cat = row.querySelector('.cat');
          if (cat) cat.textContent = svc.category || 'General';
        }
      };

      $('#serviceList').onclick = async (e) => {
        const btn = e.target.closest('[data-del]');
        if (!btn) return;
        const ok = await askConfirm({ title: 'Remove service?', body: 'Existing documents keep their lines — this only removes it from the pick list.', ok: 'Remove', danger: true });
        if (ok) { S.removeService(btn.getAttribute('data-del')); renderServices(); toast('Service removed', 'ok'); }
      };

      $('#addService').onclick = () => {
        S.saveService({ name: 'New service', category: 'General', unit: 'per session', price: 0 });
        renderServices();
        const rows = $$('#serviceList .svc-row');
        const last = rows[rows.length - 1];
        if (last) { const inp = last.querySelector('[data-f="name"]'); if (inp) { inp.focus(); inp.select(); } }
      };

      renderServices();

      /* packages */
      $('#packages').innerHTML = PACKAGES.map((p) => `
        <div class="pkg">
          <h4>${esc(p.name)}</h4>
          <p>${esc(p.desc)}</p>
          <div class="pkg-list">
            ${p.items.map((i) => `<span class="chip">${esc(i.name)} × ${esc(i.qty)}</span>`).join('')}
          </div>
          <button class="btn btn-primary btn-sm" data-pkg="${esc(p.id)}">Use in a new quotation</button>
        </div>`).join('');

      $('#packages').onclick = (e) => {
        const btn = e.target.closest('[data-pkg]');
        if (!btn) return;
        const pkg = PACKAGES.find((p) => p.id === btn.getAttribute('data-pkg'));
        if (!pkg) return;
        const doc = Editor.blank('quotation');
        doc.items = pkg.items.map((i) => ({
          id: S.uid(), description: i.name, unit: i.unit || '', qty: i.qty || 1, rate: priceFor(i.name)
        }));
        doc.notes = pkg.name + ' — ' + pkg.desc + '\n' + (S.settings.defaults.note || '');
        S.saveDocument(doc);
        location.hash = '#/edit/' + doc.id;
      };
    }
  };

  /* ------------------------------ settings ------------------------------ */
  Views.settings = {
    title: 'Settings',
    subtitle: 'Business profile, EmailJS and defaults',
    actions() { return ''; },
    mount() {
      const s = S.settings;
      const b = s.business, e = s.emailjs, n = s.numbering, d = s.defaults;

      const set = (id, val) => { const node = $(id); if (node) node.value = val === undefined || val === null ? '' : val; };
      set('#setName', b.name); set('#setTagline', b.tagline); set('#setPhone', b.phone);
      set('#setEmail', b.email); set('#setAddress', b.address); set('#setSite', b.website);
      set('#setGstin', b.gstin); set('#setTerms', (d.terms || []).join('\n'));

      set('#setPublicKey', e.publicKey); set('#setServiceId', e.serviceId);
      set('#setTemplateId', e.templateId); set('#setCcEmail', e.ccEmail);
      $('#setSendCopy').checked = e.sendCopy !== false;

      set('#setQPrefix', n.qPrefix); set('#setBPrefix', n.bPrefix);
      set('#setQNext', n.qNext); set('#setBNext', n.bNext);
      set('#setTax', d.taxRate); set('#setValidity', d.validityDays); set('#setNote', d.note);

      /* variable list */
      $('#varGrid').innerHTML = global.Mailer.VARIABLES
        .map(([name, desc]) => `<code data-copy="{{${esc(name)}}}" title="${esc(desc)}">{{${esc(name)}}}</code>`).join('');
      $('#varGrid').onclick = (ev) => {
        const c = ev.target.closest('[data-copy]');
        if (c) copy(c.getAttribute('data-copy'));
      };
      $('#sampleTpl').value = global.Mailer.SAMPLE_TEMPLATE;

      /* business save */
      $('#saveBusiness').onclick = () => {
        S.saveSettings({
          business: {
            name: $('#setName').value.trim(), tagline: $('#setTagline').value.trim(),
            phone: $('#setPhone').value.trim(), email: $('#setEmail').value.trim(),
            address: $('#setAddress').value.trim(), website: $('#setSite').value.trim(),
            gstin: $('#setGstin').value.trim()
          },
          defaults: {
            terms: $('#setTerms').value.split('\n').map((x) => x.trim()).filter(Boolean)
          }
        });
        global.App.refreshConn();
        toast('Business profile saved', 'ok');
      };

      /* email save */
      $('#saveEmail').onclick = () => {
        S.saveSettings({
          emailjs: {
            publicKey: $('#setPublicKey').value.trim(),
            serviceId: $('#setServiceId').value.trim(),
            templateId: $('#setTemplateId').value.trim(),
            ccEmail: $('#setCcEmail').value.trim(),
            sendCopy: $('#setSendCopy').checked
          }
        });
        global.App.refreshConn();
        const conn = global.Mailer.connectionLabel();
        toast(conn.ok ? 'EmailJS connected — ready to send' : 'Saved. ' + conn.text, conn.ok ? 'ok' : 'warn', 4200);
      };

      /* test email */
      $('#testEmail').onclick = async () => {
        const out = $('#testResult');
        // save first so the config used is the one on screen
        $('#saveEmail').click();
        if (!global.Mailer.isConfigured()) {
          out.className = 'test-result err';
          out.textContent = global.Mailer.connectionLabel().text;
          return;
        }
        const target = $('#setCcEmail').value.trim() || $('#setEmail').value.trim();
        if (!target) {
          out.className = 'test-result err';
          out.textContent = 'Add a business email above to receive the test.';
          return;
        }
        out.className = 'test-result';
        out.textContent = 'Sending…';
        try {
          await global.Mailer.sendTest(target);
          out.className = 'test-result ok';
          out.textContent = 'Sent to ' + target + ' ✓';
          toast('Test email sent to ' + target, 'ok');
        } catch (err) {
          console.error(err);
          out.className = 'test-result err';
          out.textContent = global.Mailer.friendlyError(err);
        }
      };

      /* numbering save */
      $('#saveNumbering').onclick = () => {
        S.saveSettings({
          numbering: {
            qPrefix: $('#setQPrefix').value.trim() || 'PPPC-QTN',
            bPrefix: $('#setBPrefix').value.trim() || 'PPPC-INV',
            qNext: Math.max(1, parseInt($('#setQNext').value, 10) || 1),
            bNext: Math.max(1, parseInt($('#setBNext').value, 10) || 1)
          },
          defaults: {
            taxRate: S.toNum($('#setTax').value),
            validityDays: Math.max(1, parseInt($('#setValidity').value, 10) || 15),
            note: $('#setNote').value
          }
        });
        toast('Numbering and defaults saved', 'ok');
      };

      /* copy template */
      $('#copyTpl').onclick = () => copy($('#sampleTpl').value);
      $('#copyVars').onclick = () => copy(global.Mailer.VARIABLES.map(([n2]) => '{{' + n2 + '}}').join('\n'));

      /* data */
      $('#exportAll').onclick = () => {
        download('pashu-backup-' + S.TODAY() + '.json', JSON.stringify(S.exportAll(), null, 2));
        toast('Backup downloaded', 'ok');
      };
      $('#importFile').onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        const ok = await askConfirm({
          title: 'Import backup?',
          body: 'Your current documents, clients and settings will be replaced by the contents of the file.',
          ok: 'Import', danger: true
        });
        if (!ok) return;
        try {
          const text = await file.text();
          S.importAll(JSON.parse(text));
          global.App.refreshCounts();
          global.App.refreshConn();
          global.App.render();
          toast('Backup imported', 'ok');
        } catch (err) {
          console.error(err);
          toast('That file could not be read as a Pashu backup.', 'err');
        }
      };
      $('#clearDocs').onclick = async () => {
        const ok = await askConfirm({ title: 'Clear all documents?', body: 'Every quotation, bill and calendar booking will be deleted. Clients and settings are kept.', ok: 'Clear documents', danger: true });
        if (ok) { S.clearDocuments(); global.App.refreshCounts(); toast('All documents cleared', 'ok'); }
      };
      $('#factoryReset').onclick = async () => {
        const ok = await askConfirm({
          title: 'Factory reset?',
          body: 'Everything — documents, clients, services and settings — will be erased and the app will return to its original state.',
          ok: 'Erase everything', danger: true
        });
        if (ok) {
          S.factoryReset();
          global.App.refreshCounts();
          global.App.refreshConn();
          global.App.render();
          toast('Factory reset complete', 'ok');
        }
      };
    }
  };

  global.Views = Views;
  global.Editor = Editor;
  global.closeEmailPanel = closeEmailPanel;
  global.PACKAGES = PACKAGES;
})(window);
