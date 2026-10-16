/* ==========================================================================
   store.js — persistence, defaults and helpers
   All data lives in localStorage under the `pppc.` namespace.
   ========================================================================== */
(function (global) {
  'use strict';

  const NS = 'pppc.';
  const KEY = {
    settings: NS + 'settings',
    services: NS + 'services',
    documents: NS + 'documents',
    clients: NS + 'clients',
    counters: NS + 'counters',
    schedules: NS + 'schedules'
  };

  /* ------------------------------ utils --------------------------------- */
  const uid = () =>
    'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);

  const clone = (v) => JSON.parse(JSON.stringify(v));

  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return clone(fallback);
      const val = JSON.parse(raw);
      return val === null || val === undefined ? clone(fallback) : val;
    } catch (e) {
      console.warn('[store] failed reading', key, e);
      return clone(fallback);
    }
  };

  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[store] failed writing', key, e);
      if (e && e.name === 'QuotaExceededError') {
        if (global.UI) global.UI.toast('Browser storage is full. Export a backup and clear old documents.', 'err');
      }
      return false;
    }
  };

  /* ------------------------------ money --------------------------------- */
  const moneyFmt = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  /** 1234567.5 -> "12,34,567.50" (Indian grouping) */
  const num = (v) => moneyFmt.format(round2(toNum(v)));
  /** 1234567.5 -> "₹12,34,567.50" */
  const money = (v) => '₹' + num(v);
  const toNum = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;

  /* --------------------------- amount in words -------------------------- */
  const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function twoDigits(n) {
    if (n < 20) return ONES[n];
    const t = Math.floor(n / 10), o = n % 10;
    return TENS[t] + (o ? ' ' + ONES[o] : '');
  }

  /** Indian numbering system: crore / lakh / thousand / hundred */
  function amountInWords(amount) {
    let value = round2(Math.abs(amount));
    if (value === 0) return 'zero rupees only';
    const rupees = Math.floor(value);
    const paise = Math.round((value - rupees) * 100);

    const parts = [];
    const groups = [
      [10000000, 'crore'],
      [100000, 'lakh'],
      [1000, 'thousand'],
      [100, 'hundred']
    ];
    let rest = rupees;
    for (const [scale, label] of groups) {
      const count = Math.floor(rest / scale);
      if (count > 0) {
        parts.push(twoDigits(count) + ' ' + label);
        rest %= scale;
      }
    }
    if (rest > 0) parts.push(twoDigits(rest));

    let out = parts.join(' ').replace(/\s+/g, ' ').trim();
    out += rupees === 1 ? ' rupee' : ' rupees';
    if (paise > 0) out += ' and ' + twoDigits(paise) + ' paise';
    return out + ' only';
  }

  /* ------------------------------ dates --------------------------------- */
  const TODAY = () => new Date().toISOString().slice(0, 10);

  const addDays = (isoDate, days) => {
    const d = isoDate ? new Date(isoDate + 'T00:00:00') : new Date();
    d.setDate(d.getDate() + (parseInt(days, 10) || 0));
    return d.toISOString().slice(0, 10);
  };

  const prettyDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const relTime = (ts) => {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + ' hr ago';
    const days = Math.round(hrs / 24);
    if (days < 30) return days + ' day' + (days > 1 ? 's' : '') + ' ago';
    return prettyDate(new Date(ts).toISOString().slice(0, 10));
  };

  /* --------------------------- default settings -------------------------- */
  const DEFAULT_SETTINGS = {
    business: {
      name: 'Pashu Premium Pet Care Services',
      tagline: 'Holistic Pet Care · Training · Boarding · Nutrition',
      phone: '9403183091',
      email: '',
      address: 'Bibwewadi, Pune, Maharashtra',
      website: 'pashupremiumpetcare',
      gstin: ''
    },
    emailjs: { publicKey: '', serviceId: '', templateId: '', ccEmail: '', sendCopy: true },
    numbering: { qPrefix: 'PPPC-QTN', bPrefix: 'PPPC-INV', qNext: 1, bNext: 1 },
    defaults: {
      taxRate: 0,
      taxLabel: 'GST',
      validityDays: 15,
      note: 'Thank you for choosing Pashu Premium Pet Care Services. We are delighted to care for your companion.',
      terms: [
        'Quotation is valid until the date mentioned above.',
        'Rates are indicative and may vary with the final scope of service.',
        'Advance booking is confirmed on receipt of 50% of the total amount.',
        'Cancellations within 24 hours of a scheduled visit are non-refundable.'
      ]
    }
  };

  /* ---------------------------- EmailJS preset --------------------------- */
  // Shipped so a fresh browser is ready to send. Only ever put the EmailJS
  // *public* key here: this file is downloaded by the browser, so it is not a
  // secret. Never put the EmailJS *private* key / access token in it.
  // Add your Service ID here (or paste it once in Settings).
  const EMAILJS_PRESET = {
    publicKey: 'qoKF4W0c7JUp1fUOu',
    serviceId: '',
    templateId: 'template_heojep4'
  };

  /* ------------------------- default service menu ------------------------ */
  const DEFAULT_SERVICES = [
    ['Dog Training — Home Session', 'Training', 'per session'],
    ['Dog Training — Board & Train', 'Training', 'per day'],
    ['Behaviour Modification Consultation', 'Training', 'per session'],
    ['Canine Nutrition Consultation', 'Nutrition', 'per consultation'],
    ['Custom Diet Plan', 'Nutrition', 'per plan'],
    ['Pet Sitting — Drop-in Visit', 'Pet Sitting', 'per visit'],
    ['Pet Sitting — Half Day', 'Pet Sitting', 'per half day'],
    ['Pet Sitting — Full Day', 'Pet Sitting', 'per day'],
    ['Pet Sitting — Overnight', 'Pet Sitting', 'per night'],
    ['Dog Walking (30 min)', 'Walking', 'per walk'],
    ['Pet Transportation', 'Transport', 'per trip'],
    ['Homestay for Pets (Bibwewadi)', 'Boarding', 'per night'],
    ['Day Boarding', 'Boarding', 'per day'],
    ['Reiki Healing for Animals', 'Wellness', 'per session'],
    ['Bach Flower Remedies', 'Wellness', 'per consultation'],
    ['Premium Pet Products', 'Products', 'per item'],
    ['Healthy Pet Food & Treats', 'Products', 'per pack'],
    ['Adoption Support & Coordination', 'Support', 'per case'],
    ['Pre-Pet Counselling', 'Support', 'per session'],
    ['Pet-Friendly Housing Assistance', 'Support', 'per case']
  ].map(([name, category, unit]) => ({ id: uid(), name, category, unit, price: 0, active: true }));

  /* ------------------------------- state --------------------------------- */
  let state = {
    settings: read(KEY.settings, DEFAULT_SETTINGS),
    services: read(KEY.services, DEFAULT_SERVICES),
    documents: read(KEY.documents, []),
    clients: read(KEY.clients, []),
    counters: read(KEY.counters, { quotation: 0, bill: 0 }),
    schedules: read(KEY.schedules, [])
  };

  // Deep merge where values from `source` win. Used both to fill in new default
  // keys for existing users and to apply a settings patch.
  function deepMerge(target, source) {
    const out = (target && typeof target === 'object' && !Array.isArray(target))
      ? Object.assign({}, target)
      : (target === undefined ? {} : target);
    if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
    Object.keys(source).forEach((k) => {
      const sv = source[k];
      if (sv === undefined) return;
      const tv = out[k];
      if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
        out[k] = deepMerge((tv && typeof tv === 'object' && !Array.isArray(tv)) ? tv : {}, sv);
      } else {
        out[k] = Array.isArray(sv) ? sv.slice() : sv;
      }
    });
    return out;
  }

  const Store = {
    KEY, uid, read, write, clone, toNum, round2, num, money, amountInWords,
    TODAY, addDays, prettyDate, relTime,
    DEFAULT_SETTINGS,

    /* ---- settings ---- */
    get settings() { return state.settings; },
    saveSettings(patch) {
      state.settings = deepMerge(state.settings, patch || {});
      write(KEY.settings, state.settings);
      return state.settings;
    },
    /** Reset to shipped defaults merged with what the user has (used on first run). */
    normalizeSettings() {
      state.settings = deepMerge(DEFAULT_SETTINGS, state.settings);
      // Fill any EmailJS field still blank with the shipped preset. A value the
      // user has already set (or cleared to something non-empty) always wins.
      const e = state.settings.emailjs;
      Object.keys(EMAILJS_PRESET).forEach((k) => {
        if (!e[k] && EMAILJS_PRESET[k]) e[k] = EMAILJS_PRESET[k];
      });
      write(KEY.settings, state.settings);
      return state.settings;
    },

    /* ---- services ---- */
    get services() { return state.services; },
    set services(list) { state.services = list; write(KEY.services, list); },
    saveService(svc) {
      const idx = state.services.findIndex((s) => s.id === svc.id);
      if (idx >= 0) state.services[idx] = Object.assign({}, state.services[idx], svc);
      else state.services.push(Object.assign({ id: uid(), price: 0, active: true }, svc));
      write(KEY.services, state.services);
      return svc;
    },
    removeService(id) {
      state.services = state.services.filter((s) => s.id !== id);
      write(KEY.services, state.services);
    },

    /* ---- documents ---- */
    get documents() { return state.documents; },
    getDocument(id) { return state.documents.find((d) => d.id === id) || null; },
    saveDocument(doc) {
      const idx = state.documents.findIndex((d) => d.id === doc.id);
      if (idx >= 0) state.documents[idx] = doc;
      else state.documents.unshift(doc);
      write(KEY.documents, state.documents);
      return doc;
    },
    removeDocument(id) {
      state.documents = state.documents.filter((d) => d.id !== id);
      write(KEY.documents, state.documents);
      // drop any calendar booking that belonged to this document
      if (state.schedules.some((s) => s.billId === id)) {
        state.schedules = state.schedules.filter((s) => s.billId !== id);
        write(KEY.schedules, state.schedules);
      }
    },
    duplicateDocument(id) {
      const src = Store.getDocument(id);
      if (!src) return null;
      const copy = clone(src);
      copy.id = uid();
      copy.createdAt = Date.now();
      copy.updatedAt = Date.now();
      copy.number = Store.nextNumber(copy.type);
      copy.status = copy.type === 'bill' ? 'Draft' : 'Draft';
      if (copy.type === 'bill') copy.amountPaid = 0;
      state.documents.unshift(copy);
      write(KEY.documents, state.documents);
      return copy;
    },

    /* ---- numbers ---- */
    /** Returns the next document number and advances the counter. Call once per new document. */
    nextNumber(type) {
      const n = state.settings.numbering;
      const isBill = type === 'bill';
      const seq = isBill ? n.bNext : n.qNext;
      const prefix = isBill ? n.bPrefix : n.qPrefix;
      const stamp = new Date().getFullYear();
      return `${prefix}-${stamp}-${String(seq).padStart(4, '0')}`;
    },
    bumpCounter(type) {
      const n = state.settings.numbering;
      if (type === 'bill') n.bNext = (parseInt(n.bNext, 10) || 0) + 1;
      else n.qNext = (parseInt(n.qNext, 10) || 0) + 1;
      write(KEY.settings, state.settings);
    },
    /** Peek without advancing (for preview text). */
    peekNumber(type) { return Store.nextNumber(type); },

    /* ---- clients ---- */
    get clients() { return state.clients; },
    getClient(id) { return state.clients.find((c) => c.id === id) || null; },
    upsertClient(data) {
      const name = (data.name || '').trim();
      if (!name) return null;
      const email = (data.email || '').trim().toLowerCase();
      const phone = (data.phone || '').replace(/\s+/g, '');
      let c = state.clients.find((x) =>
        (email && x.email && x.email.toLowerCase() === email) ||
        (phone && x.phone && x.phone.replace(/\s+/g, '') === phone) ||
        (x.name || '').toLowerCase() === name.toLowerCase()
      );
      if (!c) {
        c = { id: uid(), name, email: data.email || '', phone: data.phone || '', address: data.address || '', pets: [], createdAt: Date.now(), updatedAt: Date.now() };
        state.clients.push(c);
      } else {
        c.name = name;
        if (data.email) c.email = data.email;
        if (data.phone) c.phone = data.phone;
        if (data.address) c.address = data.address;
        c.updatedAt = Date.now();
      }
      if (data.petName) {
        const pet = data.petName.trim();
        if (pet && !c.pets.some((p) => (p.name || '').toLowerCase() === pet.toLowerCase())) {
          c.pets.push({ name: pet, info: data.petInfo || '' });
        } else if (pet) {
          const ex = c.pets.find((p) => (p.name || '').toLowerCase() === pet.toLowerCase());
          if (ex && data.petInfo) ex.info = data.petInfo;
        }
      }
      write(KEY.clients, state.clients);
      return c;
    },
    removeClient(id) {
      state.clients = state.clients.filter((c) => c.id !== id);
      write(KEY.clients, state.clients);
    },
    clientDocs(clientId) {
      return state.documents.filter((d) => d.clientId === clientId);
    },

    /* ---- quotation → bill ---- */
    /** Create a new bill from a quotation, marked paid in full, and accept the quote. */
    billFromQuotation(quoteId) {
      const q = Store.getDocument(quoteId);
      if (!q || q.type !== 'quotation') return null;
      const t = Store.totals(q);
      const today = TODAY();
      const bill = {
        id: uid(),
        type: 'bill',
        number: Store.nextNumber('bill'),
        date: today,
        validUntil: '',
        dueDate: addDays(today, 7),
        status: 'Paid',
        clientId: q.clientId || null,
        clientName: q.clientName || '', clientEmail: q.clientEmail || '',
        clientPhone: q.clientPhone || '', clientAddress: q.clientAddress || '',
        petName: q.petName || '', petInfo: q.petInfo || '',
        items: (q.items || []).map((it) => Object.assign({}, it, { id: uid() })),
        discountType: q.discountType || 'amount',
        discountValue: toNum(q.discountValue),
        taxRate: toNum(q.taxRate),
        taxLabel: q.taxLabel || 'GST',
        amountPaid: t.total,
        notes: q.notes || '',
        terms: (q.terms || []).slice(),
        sourceQuotationId: q.id,
        sourceQuotationNumber: q.number || '',
        createdAt: Date.now(), updatedAt: Date.now(), sentAt: null
      };
      state.documents.unshift(bill);
      write(KEY.documents, state.documents);
      Store.bumpCounter('bill');

      q.status = 'Accepted';
      q.convertedBillId = bill.id;
      q.updatedAt = Date.now();
      write(KEY.documents, state.documents);
      return bill;
    },

    /* ---- schedules (calendar bookings) ---- */
    get schedules() {
      return state.schedules.slice().sort((a, b) =>
        ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
    },
    getSchedule(id) { return state.schedules.find((s) => s.id === id) || null; },
    scheduleForBill(billId) { return state.schedules.find((s) => s.billId === billId) || null; },
    saveSchedule(entry) {
      const idx = state.schedules.findIndex((s) => s.id === entry.id);
      if (idx >= 0) state.schedules[idx] = Object.assign({}, state.schedules[idx], entry);
      else state.schedules.push(Object.assign({ id: uid(), status: 'Scheduled', createdAt: Date.now() }, entry));
      write(KEY.schedules, state.schedules);
      return entry;
    },
    removeSchedule(id) {
      state.schedules = state.schedules.filter((s) => s.id !== id);
      write(KEY.schedules, state.schedules);
    },
    /** Create or update the booking for a bill (one booking per bill). */
    scheduleBill(bill, data) {
      const t = Store.totals(bill);
      const base = {
        billId: bill.id,
        billNumber: bill.number || '',
        clientId: bill.clientId || null,
        clientName: bill.clientName || '',
        clientPhone: bill.clientPhone || '',
        petName: bill.petName || '',
        petInfo: bill.petInfo || '',
        title: (bill.items || []).map((it) => it.description).filter(Boolean).slice(0, 3).join(', ') || 'Service visit',
        amount: t.total,
        date: data.date,
        time: data.time || '',
        note: data.note || '',
        status: 'Scheduled',
        updatedAt: Date.now()
      };
      const existing = Store.scheduleForBill(bill.id);
      if (existing) { Object.assign(existing, base); write(KEY.schedules, state.schedules); return existing; }
      const entry = Object.assign({ id: uid(), createdAt: Date.now() }, base);
      state.schedules.push(entry);
      write(KEY.schedules, state.schedules);
      return entry;
    },
    /** Bookings today or later, soonest first. */
    upcomingSchedules(limit) {
      const today = TODAY();
      return Store.schedules
        .filter((s) => (s.date || '') >= today && s.status !== 'Cancelled')
        .slice(0, limit || 12);
    },

    /* ---- bulk ---- */
    exportAll() {
      return {
        app: 'Pashu Premium Pet Care Admin',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: state.settings,
        services: state.services,
        documents: state.documents,
        clients: state.clients,
        schedules: state.schedules
      };
    },
    importAll(data) {
      if (!data || typeof data !== 'object') throw new Error('Not a valid backup file.');
      if (data.settings) state.settings = deepMerge(DEFAULT_SETTINGS, data.settings);
      if (Array.isArray(data.services)) state.services = data.services;
      if (Array.isArray(data.documents)) state.documents = data.documents;
      if (Array.isArray(data.clients)) state.clients = data.clients;
      if (Array.isArray(data.schedules)) state.schedules = data.schedules;
      write(KEY.settings, state.settings);
      write(KEY.services, state.services);
      write(KEY.documents, state.documents);
      write(KEY.clients, state.clients);
      write(KEY.schedules, state.schedules);
    },
    clearDocuments() {
      state.documents = [];
      state.schedules = [];
      write(KEY.documents, []);
      write(KEY.schedules, []);
    },
    factoryReset() {
      Object.values(KEY).forEach((k) => localStorage.removeItem(k));
      state = {
        settings: clone(DEFAULT_SETTINGS),
        services: clone(DEFAULT_SERVICES),
        documents: [],
        clients: [],
        counters: { quotation: 0, bill: 0 },
        schedules: []
      };
      write(KEY.settings, state.settings);
      write(KEY.services, state.services);
      write(KEY.documents, []);
      write(KEY.clients, []);
      write(KEY.schedules, []);
    },

    /* ---- derived ---- */
    totals(doc) {
      const items = (doc.items || []).map((it) => {
        const qty = toNum(it.qty);
        const rate = toNum(it.rate);
        return Object.assign({}, it, { amount: round2(qty * rate) });
      });
      const subtotal = round2(items.reduce((s, i) => s + i.amount, 0));
      let discount = doc.discountType === 'percent'
        ? round2(subtotal * toNum(doc.discountValue) / 100)
        : round2(toNum(doc.discountValue));
      if (discount > subtotal) discount = subtotal;
      const taxable = round2(subtotal - discount);
      const tax = round2(taxable * toNum(doc.taxRate) / 100);
      const total = round2(taxable + tax);
      const paid = round2(toNum(doc.amountPaid));
      return {
        items, subtotal, discount, taxable, tax, total,
        paid, balance: round2(total - paid)
      };
    },
    stats() {
      const docs = state.documents;
      const quotes = docs.filter((d) => d.type === 'quotation');
      const bills = docs.filter((d) => d.type === 'bill');
      const billed = bills.reduce((s, d) => s + Store.totals(d).total, 0);
      const collected = bills.reduce((s, d) => s + Math.min(Store.totals(d).paid, Store.totals(d).total), 0);
      const quoted = quotes.reduce((s, d) => s + Store.totals(d).total, 0);
      const outstanding = round2(bills.reduce((s, d) => s + Math.max(0, Store.totals(d).balance), 0));
      const month = new Date().toISOString().slice(0, 7);
      const thisMonth = bills
        .filter((d) => (d.date || '').slice(0, 7) === month)
        .reduce((s, d) => s + Store.totals(d).total, 0);
      const accepted = quotes.filter((q) => q.status === 'Accepted').length;
      const sent = docs.filter((d) => d.sentAt).length;
      return {
        quotes: quotes.length, bills: bills.length, total: docs.length,
        billed: round2(billed), collected: round2(collected), outstanding,
        quoted: round2(quoted), thisMonth: round2(thisMonth),
        accepted, sent,
        conversion: quotes.length ? Math.round((accepted / quotes.length) * 100) : 0
      };
    },
    topServices(limit) {
      const map = new Map();
      state.documents.forEach((d) => (d.items || []).forEach((it) => {
        const key = (it.description || '').trim();
        if (!key) return;
        const cur = map.get(key) || { name: key, count: 0, value: 0 };
        cur.count += 1;
        cur.value = round2(cur.value + toNum(it.qty) * toNum(it.rate));
        map.set(key, cur);
      }));
      return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, limit || 5);
    },
    statuses(type) {
      return type === 'bill'
        ? ['Draft', 'Unpaid', 'Partially Paid', 'Paid', 'Cancelled']
        : ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired'];
    }
  };

  // first-run normalisation
  Store.normalizeSettings();

  global.Store = Store;
})(window);
