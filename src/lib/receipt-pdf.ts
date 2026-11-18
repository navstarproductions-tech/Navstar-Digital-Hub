type Html2PdfFactory = () => {
  set(options: Record<string, unknown>): { from(element: HTMLElement): { save(): Promise<void> } };
};
declare global { interface Window { html2pdf?: Html2PdfFactory } }

let html2PdfLoader: Promise<Html2PdfFactory> | null = null;
const PDF_RENDERER_SOURCES = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
];

function loadScript(src: string): Promise<Html2PdfFactory> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error('The PDF renderer took too long to load.'));
    }, 12000);
    script.src = src;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.html2pdf) resolve(window.html2pdf);
      else reject(new Error('The PDF renderer loaded but did not initialise.'));
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('This PDF renderer source is unavailable.'));
    };
    document.head.appendChild(script);
  });
}

function loadHtml2Pdf(): Promise<Html2PdfFactory> {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  if (!html2PdfLoader) {
    html2PdfLoader = (async () => {
      let lastError: unknown;
      for (const source of PDF_RENDERER_SOURCES) {
        try { return await loadScript(source); }
        catch (error) { lastError = error; }
      }
      throw lastError instanceof Error
        ? new Error('PDF download could not start. The PDF component could not be reached. Refresh the page and try again.')
        : new Error('PDF download could not start. Please refresh the page and try again.');
    })().catch(error => {
      html2PdfLoader = null;
      throw error;
    });
  }
  return html2PdfLoader;
}

function waitForImages(root: ParentNode, timeoutMs = 7000): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  return Promise.all(images.map(img => new Promise<void>(resolve => {
    if (img.complete) { resolve(); return; }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      img.removeEventListener('load', finish);
      img.removeEventListener('error', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
  }))).then(() => undefined);
}


/**
 * html2canvas cannot parse oklch() CSS colors. Resolve styles in the browser,
 * inline them on the export clone, and remove stylesheets from its isolated
 * document so the renderer only sees resolved computed values.
 */
function inlineComputedStyles(source: HTMLElement, clone: HTMLElement) {
  const sourceNodes = [source, ...Array.from(source.querySelectorAll<HTMLElement>('*'))];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
  sourceNodes.forEach((node, index) => {
    const target = cloneNodes[index];
    if (!target) return;
    const computed = window.getComputedStyle(node);
    for (let i = 0; i < computed.length; i += 1) {
      const property = computed.item(i);
      const value = computed.getPropertyValue(property);
      if (value) target.style.setProperty(property, value, computed.getPropertyPriority(property));
    }
  });
}

function removeExternalStylesheets(doc: Document) {
  doc.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => node.remove());
}

function pdfOptions(filename: string) {
  return {
    margin: 0,
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false, scrollX: 0, scrollY: 0, onclone: (doc: Document) => removeExternalStylesheets(doc) },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  };
}

export async function downloadReceiptElementPdf(element: HTMLElement, filename: string) {
  const html2pdf = await loadHtml2Pdf();
  const clone = element.cloneNode(true) as HTMLElement;
  inlineComputedStyles(element, clone);
  clone.style.width = '794px';
  clone.style.maxWidth = 'none';
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  clone.querySelectorAll<HTMLElement>('.print\\:hidden').forEach(node => node.remove());
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1;overflow:visible;';
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    await waitForImages(clone);
    await html2pdf().set(pdfOptions(filename)).from(clone).save();
  } finally { holder.remove(); }
}

export async function downloadReceiptHtmlPdf(html: string, filename: string) {
  const html2pdf = await loadHtml2Pdf();
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;';
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error('Could not prepare the receipt for PDF download.');
    const withBase = html.replace(/<head([^>]*)>/i, '<head$1><base href="' + window.location.origin + '/">');
    const frameLoaded = new Promise<void>(resolve => {
      if (doc.readyState === 'complete') resolve();
      else {
        frame.onload = () => resolve();
        window.setTimeout(resolve, 8000);
      }
    });
    doc.open();
    doc.write(withBase);
    doc.close();
    await frameLoaded;
    if (doc.fonts?.ready) await Promise.race([doc.fonts.ready.then(() => undefined), new Promise<void>(resolve => window.setTimeout(resolve, 4000))]);
    await waitForImages(doc, 7000);
    const content = doc.querySelector('body');
    if (!content) throw new Error('Receipt content could not be prepared for PDF download.');
    const exportClone = content.cloneNode(true) as HTMLElement;
    inlineComputedStyles(content as HTMLElement, exportClone);
    await html2pdf().set(pdfOptions(filename)).from(exportClone).save();
  } finally { frame.remove(); }
}
