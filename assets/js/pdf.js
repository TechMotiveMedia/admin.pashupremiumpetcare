/* ==========================================================================
   pdf.js — turns a rendered document sheet into a directly-downloadable PDF.
   Loads html2pdf.js (html2canvas + jsPDF) on demand so the app still opens
   instantly and works offline for everything except the actual download.
   ========================================================================== */
(function (global) {
  'use strict';

  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  let libPromise = null;

  /** Load the html2pdf bundle once, on first use. */
  function load() {
    if (global.html2pdf) return Promise.resolve();
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CDN;
      s.async = true;
      s.onload = () => (global.html2pdf ? resolve() : reject(new Error('The PDF library failed to initialise.')));
      s.onerror = () => reject(new Error('Could not load the PDF library. Check your internet connection.'));
      document.head.appendChild(s);
    });
    return libPromise;
  }

  function slug(s) {
    return String(s || '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /** A tidy, human-readable file name such as Quotation_Q-2026-0001_Rohan-Deshpande.pdf */
  function fileName(doc) {
    const type = doc.type === 'bill' ? 'Bill' : 'Quotation';
    const parts = [type];
    if (doc.number) parts.push(slug(doc.number));
    if (doc.clientName) parts.push(slug(doc.clientName));
    return parts.join('_') + '.pdf';
  }

  /** Wait for any images (e.g. the logo) inside the sheet to finish loading. */
  function imagesReady(root) {
    const imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
    return Promise.all(imgs.map((img) => (img.complete
      ? Promise.resolve()
      : new Promise((res) => { img.onload = img.onerror = () => res(); }))));
  }

  /** Build the sheet off-screen, rasterise it, and trigger the download. */
  async function downloadDoc(doc) {
    await load();
    const holder = document.createElement('div');
    holder.className = 'pdf-export';
    holder.innerHTML = '<div class="sheet">' + global.Render.sheet(doc) + '</div>';
    document.body.appendChild(holder);
    try {
      const sheet = holder.querySelector('.sheet');
      await imagesReady(sheet);
      await global.html2pdf().set({
        margin: 0,
        filename: fileName(doc),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2, useCORS: true, backgroundColor: '#ffffff',
          windowWidth: 794, scrollX: 0, scrollY: 0, logging: false
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      }).from(sheet).save();
    } finally {
      holder.remove();
    }
  }

  global.Pdf = { load, downloadDoc, fileName };
})(window);
