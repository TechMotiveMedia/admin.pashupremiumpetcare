/* ==========================================================================
   email.js — EmailJS integration
   The three IDs live in Settings and are stored in localStorage.
   ========================================================================== */
(function (global) {
  'use strict';

  const S = global.Store;

  /* Variables handed to the EmailJS template. */
  const VARIABLES = [
    ['to_email', 'Client email address (put this in the template “To” field)'],
    ['to_name', 'Client name'],
    ['cc_email', 'Business email — use in the template “Cc” field'],
    ['from_name', 'Your business name'],
    ['reply_to', 'Your business email — use in “Reply To”'],
    ['subject', 'Email subject line'],
    ['message', 'The message typed in the send panel'],
    ['doc_type', 'quotation or bill'],
    ['doc_title', 'Quotation / Tax Invoice'],
    ['doc_number', 'e.g. PPPC-QTN-2026-0001'],
    ['doc_date', 'Document date'],
    ['due_or_valid', 'Due date or validity date'],
    ['status', 'Draft / Sent / Paid / Accepted …'],
    ['client_name', 'Client name'],
    ['client_email', 'Client email'],
    ['client_phone', 'Client phone'],
    ['client_address', 'Client area / address'],
    ['pet_name', 'Pet name'],
    ['pet_info', 'Breed / age'],
    ['items_html', 'Ready-made HTML table of all line items'],
    ['items_text', 'Plain-text list of line items'],
    ['items_count', 'Number of line items'],
    ['subtotal', 'Subtotal, formatted e.g. 12,500.00'],
    ['discount_line', 'Discount, formatted (0.00 when none)'],
    ['tax_line', 'Tax amount, formatted (0.00 when none)'],
    ['tax_label', 'e.g. GST'],
    ['tax_rate', 'Tax percentage'],
    ['total', 'Grand total, formatted'],
    ['total_raw', 'Grand total as a plain number'],
    ['balance_due', 'Balance outstanding, formatted'],
    ['amount_in_words', 'Total written out in words'],
    ['notes', 'Note to client'],
    ['terms_text', 'Terms, one per line'],
    ['business_name', 'Your business name'],
    ['business_phone', 'Your phone'],
    ['business_email', 'Your email'],
    ['business_address', 'Your address'],
    ['business_website', 'Website / Instagram'],
    ['gstin', 'GSTIN if set'],
    ['sent_at', 'Timestamp of sending']
  ];

  const SAMPLE_TEMPLATE = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;background:#ffffff">

  <div style="background:#3D2A1C;color:#ffffff;padding:22px 26px">
    <div style="font-size:20px;font-weight:bold">{{business_name}}</div>
    <div style="font-size:12px;color:#F3C89B;letter-spacing:1px;text-transform:uppercase;margin-top:4px">
      {{doc_title}}
    </div>
  </div>

  <div style="padding:26px">
    <p style="font-size:15px;color:#241710">Dear {{to_name}},</p>
    <p style="font-size:14px;color:#57432F;line-height:1.6">{{message}}</p>

    <table style="width:100%;font-size:14px;margin:18px 0;border-collapse:collapse">
      <tr><td style="padding:4px 0;color:#7E6A55">Document</td>
          <td style="padding:4px 0;text-align:right;font-weight:bold">{{doc_number}}</td></tr>
      <tr><td style="padding:4px 0;color:#7E6A55">Date</td>
          <td style="padding:4px 0;text-align:right">{{doc_date}}</td></tr>
      <tr><td style="padding:4px 0;color:#7E6A55">Valid / due</td>
          <td style="padding:4px 0;text-align:right">{{due_or_valid}}</td></tr>
    </table>

    {{items_html}}

    <table style="width:100%;font-size:14px;margin-top:14px;border-collapse:collapse">
      <tr><td style="padding:4px 0;color:#7E6A55">Subtotal</td>
          <td style="padding:4px 0;text-align:right">₹{{subtotal}}</td></tr>
      <tr><td style="padding:4px 0;color:#7E6A55">Discount</td>
          <td style="padding:4px 0;text-align:right">-₹{{discount_line}}</td></tr>
      <tr><td style="padding:4px 0;color:#7E6A55">{{tax_label}} ({{tax_rate}}%)</td>
          <td style="padding:4px 0;text-align:right">₹{{tax_line}}</td></tr>
      <tr><td style="padding:10px 0;font-size:16px;font-weight:bold;border-top:2px solid #C45C1A">Total</td>
          <td style="padding:10px 0;font-size:16px;font-weight:bold;text-align:right;border-top:2px solid #C45C1A">₹{{total}}</td></tr>
    </table>

    <p style="font-size:12px;color:#7E6A55;margin-top:8px">{{amount_in_words}}</p>
    <p style="font-size:13px;color:#57432F;line-height:1.6;margin-top:14px">{{notes}}</p>
    <p style="font-size:12px;color:#7E6A55;white-space:pre-line;margin-top:10px">{{terms_text}}</p>
  </div>

  <div style="background:#FAF4E9;padding:16px 26px;font-size:12px;color:#7E6A55;text-align:center">
    {{business_name}} &middot; {{business_phone}}<br>{{business_address}}
  </div>
</div>`;

  /* ------------------------------ connection ----------------------------- */
  function config() {
    return S.settings.emailjs || {};
  }

  function isConfigured() {
    const c = config();
    return !!(c.publicKey && c.serviceId && c.templateId && global.emailjs);
  }

  function connectionLabel() {
    if (!global.emailjs) return { ok: false, text: 'EmailJS library not loaded' };
    const c = config();
    if (!c.publicKey) return { ok: false, text: 'Add your public key' };
    if (!c.serviceId) return { ok: false, text: 'Add your service ID' };
    if (!c.templateId) return { ok: false, text: 'Add your template ID' };
    return { ok: true, text: 'Ready to send' };
  }

  function init() {
    const c = config();
    if (!global.emailjs) throw new Error('EmailJS library did not load. Check your internet connection and reload the page.');
    if (!c.publicKey) throw new Error('Add your EmailJS public key in Settings first.');
    global.emailjs.init({ publicKey: c.publicKey });
    return global.emailjs;
  }

  /* -------------------------------- params ------------------------------- */
  function buildParams(doc, overrides) {
    const o = overrides || {};
    const t = S.totals(doc);
    const b = S.settings.business || {};
    const isBill = doc.type === 'bill';
    const terms = (doc.terms || []).filter((x) => String(x).trim());

    return {
      to_email: o.to || doc.clientEmail || '',
      to_name: o.name || doc.clientName || 'Pet Parent',
      cc_email: S.settings.emailjs.ccEmail || b.email || '',
      from_name: b.name || 'Pashu Premium Pet Care Services',
      reply_to: b.email || '',
      subject: o.subject || `${isBill ? 'Invoice' : 'Quotation'} ${doc.number} from ${b.name || 'Pashu Premium Pet Care'}`,
      message: o.message || '',

      doc_type: doc.type,
      doc_title: isBill ? 'Tax Invoice' : 'Quotation',
      doc_number: doc.number || '',
      doc_date: S.prettyDate(doc.date),
      due_or_valid: S.prettyDate(isBill ? doc.dueDate : doc.validUntil) || '—',
      status: doc.status || 'Draft',

      client_name: doc.clientName || '',
      client_email: doc.clientEmail || '',
      client_phone: doc.clientPhone || '',
      client_address: doc.clientAddress || '',
      pet_name: doc.petName || '',
      pet_info: doc.petInfo || '',

      items_html: global.Render.itemsHtml(doc),
      items_text: global.Render.plainText(doc),
      items_count: String(t.items.length),

      subtotal: S.num(t.subtotal),
      discount_line: S.num(t.discount),
      tax_line: S.num(t.tax),
      tax_label: doc.taxLabel || 'GST',
      tax_rate: S.num(doc.taxRate),
      total: S.num(t.total),
      total_raw: String(t.total),
      balance_due: S.num(Math.max(0, t.balance)),
      amount_in_words: S.amountInWords(t.total),

      notes: doc.notes || '',
      terms_text: terms.join('\n'),

      business_name: b.name || '',
      business_phone: b.phone || '',
      business_email: b.email || '',
      business_address: b.address || '',
      business_website: b.website || '',
      gstin: b.gstin || '',

      sent_at: new Date().toLocaleString('en-IN')
    };
  }

  /* --------------------------------- send -------------------------------- */
  function friendlyError(err) {
    const status = err && (err.status || err.statusCode);
    const text = (err && (err.text || err.message)) || '';
    if (status === 400) return 'EmailJS rejected the request (400). Usually a template variable mismatch or a wrong Template ID. Details: ' + text;
    if (status === 401 || status === 403) return 'EmailJS authentication failed (' + status + '). Check your public key.';
    if (status === 402) return 'EmailJS quota reached or the plan is inactive (402). Details: ' + text;
    if (status === 412) return 'Gmail connection problem (412). Re-connect the email service in your EmailJS dashboard.';
    if (status === 429) return 'Too many requests (429). Wait a minute and try again.';
    if (status === 0 || err instanceof TypeError) return 'Network error — could not reach EmailJS. Check the internet connection, or if you opened this page from a file:// path, the browser may be blocking the request.';
    return (text || 'Email could not be sent. Check the EmailJS settings and try again.');
  }

  /**
   * Send a document email.
   * @returns {Promise<{sent:string[], copies:number}>}
   */
  async function sendDocument(doc, overrides) {
    const emailjs = init();
    const c = config();
    const params = buildParams(doc, overrides);
    const results = { sent: [], copies: 0 };

    const clientEmail = (params.to_email || '').trim();
    if (!clientEmail) throw new Error('No client email address. Add one in the client panel before sending.');

    await emailjs.send(c.serviceId, c.templateId, params, { publicKey: c.publicKey });
    results.sent.push(clientEmail);

    const cc = (c.ccEmail || '').trim();
    const businessEmail = (global.Store.settings.business.email || '').trim();
    const copyTo = cc || businessEmail;

    if (c.sendCopy && copyTo && copyTo.toLowerCase() !== clientEmail.toLowerCase()) {
      const copyParams = Object.assign({}, params, {
        to_email: copyTo,
        to_name: S.settings.business.name || 'Pashu Premium Pet Care',
        subject: '[Copy] ' + params.subject
      });
      try {
        await emailjs.send(c.serviceId, c.templateId, copyParams, { publicKey: c.publicKey });
        results.sent.push(copyTo);
        results.copies = 1;
      } catch (e) {
        // Client copy already delivered — report the copy failure without failing the whole send.
        results.copyError = friendlyError(e);
      }
    }
    return results;
  }

  /** Minimal send used by the “Send test email” button. */
  async function sendTest(to) {
    const emailjs = init();
    const c = config();
    const b = S.settings.business || {};
    const params = {
      to_email: to,
      to_name: 'Test recipient',
      cc_email: c.ccEmail || '',
      from_name: b.name || 'Pashu Premium Pet Care',
      reply_to: b.email || '',
      subject: 'Test email from your Pashu admin console',
      message: 'Your EmailJS connection is working correctly. Quotations and bills will arrive in this format.',
      doc_type: 'test',
      doc_title: 'Connection test',
      doc_number: 'TEST-0001',
      doc_date: new Date().toLocaleDateString('en-IN'),
      due_or_valid: '—',
      status: 'Test',
      client_name: 'Test recipient',
      client_email: to,
      client_phone: '',
      client_address: '',
      pet_name: '',
      pet_info: '',
      items_html: '<table style="width:100%;border-collapse:collapse;font-family:Arial"><tr><td style="padding:8px;border-bottom:1px solid #ddd">Sample service</td><td style="padding:8px;text-align:right">1</td><td style="padding:8px;text-align:right">₹100.00</td></tr></table>',
      items_text: '1. Sample service — ₹100.00',
      items_count: '1',
      subtotal: '100.00',
      discount_line: '0.00',
      tax_line: '0.00',
      tax_label: 'GST',
      tax_rate: '0.00',
      total: '100.00',
      total_raw: '100',
      balance_due: '0.00',
      amount_in_words: 'one hundred rupees only',
      notes: 'This is a test message.',
      terms_text: '',
      business_name: b.name || '',
      business_phone: b.phone || '',
      business_email: b.email || '',
      business_address: b.address || '',
      business_website: b.website || '',
      gstin: b.gstin || '',
      sent_at: new Date().toLocaleString('en-IN')
    };
    return emailjs.send(c.serviceId, c.templateId, params, { publicKey: c.publicKey });
  }

  global.Mailer = {
    VARIABLES, SAMPLE_TEMPLATE,
    config, isConfigured, connectionLabel, init,
    buildParams, sendDocument, sendTest, friendlyError
  };
})(window);
