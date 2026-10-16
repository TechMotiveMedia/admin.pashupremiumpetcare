/* ==========================================================================
   render.js — builds the printable / emailable document sheet
   ========================================================================== */
(function (global) {
  'use strict';

  const { esc, escBr, safeUrl } = global.UI;

  const KIND = { quotation: 'Quotation', bill: 'Tax Invoice' };

  function statusOf(doc) {
    return doc.status || 'Draft';
  }

  /** Render the full A4-style sheet markup for a document. */
  function sheet(doc, opts) {
    const o = opts || {};
    const S = global.Store;
    const s = S.settings;
    const b = s.business;
    const t = S.totals(doc);
    const type = doc.type === 'bill' ? 'bill' : 'quotation';
    const isBill = type === 'bill';
    const status = statusOf(doc);

    /* ---- header ---- */
    const contactBits = [];
    if (b.address) contactBits.push(esc(b.address));
    if (b.phone) contactBits.push('☎ ' + esc(b.phone));
    if (b.email) contactBits.push('✉ ' + esc(b.email));
    if (b.website) contactBits.push('⌘ ' + esc(b.website));
    if (b.gstin) contactBits.push('GSTIN: ' + esc(b.gstin));

    /* ---- items rows ---- */
    let rows = '';
    if (!t.items.length) {
      rows = `<tr><td colspan="6" style="padding:26px;text-align:center;color:#A4917B;font-size:12.4px">
        No services added yet — pick from the price list on the left.</td></tr>`;
    } else {
      t.items.forEach((it, i) => {
        rows += `<tr>
          <td class="idx">${i + 1}</td>
          <td class="svc">${esc(it.description || '—')}${it.note ? '<small>' + escBr(it.note) + '</small>' : ''}</td>
          <td class="c">${esc(it.unit || '—')}</td>
          <td class="c">${S.num(it.qty)}</td>
          <td class="r">${S.num(it.rate)}</td>
          <td class="r">${S.num(it.amount)}</td>
        </tr>`;
      });
    }

    /* ---- totals ---- */
    let totals = `<div class="tr"><span>Subtotal</span><b>${S.num(t.subtotal)}</b></div>`;
    if (t.discount > 0) {
      const label = doc.discountType === 'percent'
        ? `Discount (${S.num(doc.discountValue)}%)`
        : 'Discount';
      totals += `<div class="tr discounted"><span>${esc(label)}</span><b>− ${S.num(t.discount)}</b></div>`;
    }
    if (t.tax > 0) {
      totals += `<div class="tr"><span>${esc(doc.taxLabel || 'Tax')} @ ${S.num(doc.taxRate)}%</span><b>${S.num(t.tax)}</b></div>`;
    }
    totals += `<div class="tr grand"><span>Total payable</span><b>₹${S.num(t.total)}</b></div>`;
    if (isBill && (t.paid > 0 || t.balance !== t.total)) {
      totals += `<div class="tr"><span>Amount received</span><b>${S.num(t.paid)}</b></div>`;
      totals += `<div class="tr balance"><span>Balance due</span><b>₹${S.num(Math.max(0, t.balance))}</b></div>`;
    }

    /* ---- dates block ---- */
    const dateRow = (label, value) =>
      `<div class="dr"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;

    let dates = dateRow('Date', S.prettyDate(doc.date));
    if (!isBill && doc.validUntil) dates += dateRow('Valid until', S.prettyDate(doc.validUntil));
    if (isBill && doc.dueDate) dates += dateRow('Due date', S.prettyDate(doc.dueDate));

    /* ---- notes / terms ---- */
    let notes = '';
    const terms = (doc.terms || []).filter((x) => String(x).trim());
    if (doc.notes || terms.length) {
      notes = '<div class="sh-notes">';
      if (doc.notes) {
        notes += `<div class="sh-note"><div class="lbl">Note</div><p>${escBr(doc.notes)}</p></div>`;
      }
      if (terms.length) {
        notes += `<div class="sh-note"><div class="lbl">Terms &amp; conditions</div><ol>${
          terms.map((x) => `<li>${esc(x)}</li>`).join('')
        }</ol></div>`;
      }
      notes += '</div>';
    }

    /* ---- client / pet ---- */
    const petBits = [];
    if (doc.petName) petBits.push('🐾 ' + esc(doc.petName));
    if (doc.petInfo) petBits.push(esc(doc.petInfo));

    const clientBlock = doc.clientName || doc.clientEmail || doc.clientPhone
      ? `<div class="name">${esc(doc.clientName || 'Client')}</div>
         <div class="line">${[
            doc.clientPhone ? '☎ ' + esc(doc.clientPhone) : '',
            doc.clientEmail ? '✉ ' + esc(doc.clientEmail) : '',
            doc.clientAddress ? '⌂ ' + esc(doc.clientAddress) : ''
          ].filter(Boolean).join('<br>') || '&nbsp;'}
         </div>
         ${petBits.length ? `<div class="pet">${petBits.join(' · ')}</div>` : ''}`
      : `<div class="name" style="color:#A4917B">Client details</div>
         <div class="line" style="color:#A4917B">Fill in the client panel on the left.</div>`;

    /* ---- assemble ---- */
    return `
    <div class="sh-top">
      <div class="sh-logo">🐾</div>
      <div class="sh-biz">
        <h2>${esc(b.name || 'Pashu Premium Pet Care Services')}</h2>
        ${b.tagline ? `<div class="tag">${esc(b.tagline)}</div>` : ''}
        <div class="meta">${contactBits.map((x) => '<b>' + x + '</b>').join(' &nbsp;·&nbsp; ')}</div>
      </div>
      <div class="sh-doc">
        <div class="kind">${isBill ? 'Invoice' : 'Quotation'}</div>
        <div class="no">${esc(doc.number || '—')}</div>
        <div class="status ${esc(status.toLowerCase().replace(/\s+/g, '-'))}">${esc(status)}</div>
      </div>
    </div>

    <div class="sh-body">
      <div class="sh-parties">
        <div class="sh-party to">
          <div class="sh-label">${isBill ? 'Billed to' : 'Prepared for'}</div>
          ${clientBlock}
        </div>
        <div class="sh-dates">
          <div class="sh-label">Reference</div>
          ${dates}
        </div>
      </div>

      <table class="sh-table">
        <thead>
          <tr>
            <th style="width:26px"></th>
            <th>Service / description</th>
            <th class="c" style="width:96px">Unit</th>
            <th class="c" style="width:82px">No. of days</th>
            <th class="r" style="width:92px">Rate (₹)</th>
            <th class="r" style="width:104px">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="sh-bottom">
        <div class="sh-words">
          <div class="lbl">Amount in words</div>
          <div class="val">${esc(S.amountInWords(t.total))}</div>
        </div>
        <div class="sh-totals">${totals}</div>
      </div>
      ${notes}
      <div class="sh-sign">
        <div class="box">
          <div class="rule"></div>
          <strong>${esc(b.name || 'Pashu Premium Pet Care')}</strong>
          <span>Authorised signatory</span>
        </div>
      </div>
    </div>

    <div class="sh-foot">
      <div class="thanks">${isBill
        ? 'Thank you for your business — we are grateful for your trust.'
        : 'We look forward to caring for your companion.'}</div>
      <div class="fc">
        ${[b.phone ? '<b>' + esc(b.phone) + '</b>' : '', b.website ? esc(b.website) : '']
          .filter(Boolean).join(' &nbsp;·&nbsp; ')}
        ${doc.number ? ' &nbsp;·&nbsp; Ref ' + esc(doc.number) : ''}
      </div>
    </div>`;
  }

  /** Plain-text summary used in email bodies. */
  function plainText(doc) {
    const S = global.Store;
    const t = S.totals(doc);
    const isBill = doc.type === 'bill';
    const lines = [];
    lines.push(`${isBill ? 'Invoice' : 'Quotation'} ${doc.number}`);
    lines.push(`Date: ${S.prettyDate(doc.date)}`);
    if (!isBill && doc.validUntil) lines.push(`Valid until: ${S.prettyDate(doc.validUntil)}`);
    if (isBill && doc.dueDate) lines.push(`Due date: ${S.prettyDate(doc.dueDate)}`);
    lines.push('');
    lines.push('Services:');
    t.items.forEach((it, i) => {
      lines.push(`${i + 1}. ${it.description || '-'} — ${S.num(it.qty)} ${it.unit || ''} × ₹${S.num(it.rate)} = ₹${S.num(it.amount)}`);
    });
    lines.push('');
    lines.push(`Subtotal: ₹${S.num(t.subtotal)}`);
    if (t.discount > 0) lines.push(`Discount: -₹${S.num(t.discount)}`);
    if (t.tax > 0) lines.push(`${doc.taxLabel || 'Tax'} @ ${S.num(doc.taxRate)}%: ₹${S.num(t.tax)}`);
    lines.push(`Total: ₹${S.num(t.total)}`);
    if (isBill) lines.push(`Balance due: ₹${S.num(Math.max(0, t.balance))}`);
    lines.push('');
    lines.push('In words: ' + S.amountInWords(t.total));
    return lines.join('\n');
  }

  /** Compact HTML item list for the email template {{items_html}}. */
  function itemsHtml(doc) {
    const S = global.Store;
    const t = S.totals(doc);
    const rows = t.items.map((it) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #F0E6D8;font-size:14px;color:#241710">${esc(it.description || '—')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #F0E6D8;font-size:14px;color:#7E6A55;text-align:center">${S.num(it.qty)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #F0E6D8;font-size:14px;color:#241710;text-align:right">₹${S.num(it.rate)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #F0E6D8;font-size:14px;color:#241710;text-align:right;font-weight:600">₹${S.num(it.amount)}</td>
      </tr>`).join('');
    return `<table style="width:100%;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif">
      <thead><tr>
        <th style="text-align:left;padding:8px 10px;background:#4B7B43;color:#fff;font-size:11px;letter-spacing:.06em;text-transform:uppercase">Service</th>
        <th style="text-align:center;padding:8px 10px;background:#4B7B43;color:#fff;font-size:11px;letter-spacing:.06em;text-transform:uppercase">No. of days</th>
        <th style="text-align:right;padding:8px 10px;background:#4B7B43;color:#fff;font-size:11px;letter-spacing:.06em;text-transform:uppercase">Rate</th>
        <th style="text-align:right;padding:8px 10px;background:#4B7B43;color:#fff;font-size:11px;letter-spacing:.06em;text-transform:uppercase">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  global.Render = { sheet, plainText, itemsHtml, KIND };
})(window);
