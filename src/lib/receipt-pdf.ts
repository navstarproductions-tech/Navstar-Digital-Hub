type Html2PdfFactory = () => {
  set(options: Record<string, unknown>): { from(element: HTMLElement): { save(): Promise<void> } };
};
declare global { interface Window { html2pdf?: Html2PdfFactory } }

let html2PdfLoader: Promise<Html2PdfFactory> | null = null;
function loadHtml2Pdf(): Promise<Html2PdfFactory> {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  if (!html2PdfLoader) html2PdfLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.async = true;
    script.onload = () => window.html2pdf ? resolve(window.html2pdf) : reject(new Error('PDF renderer did not initialise.'));
    script.onerror = () => reject(new Error('Could not load the PDF renderer. Check your internet connection and try again.'));
    document.head.appendChild(script);
  });
  return html2PdfLoader;
}

const pdfOptions = (filename: string) => ({
  margin: 0,
  filename,
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false, scrollX: 0, scrollY: 0 },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak: { mode: ['css', 'legacy'] },
});

export async function downloadReceiptElementPdf(element: HTMLElement, filename: string) {
  const html2pdf = await loadHtml2Pdf();
  const clone = element.cloneNode(true) as HTMLElement;
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
    const images = Array.from(clone.querySelectorAll('img'));
    await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => {
      img.onload = () => resolve(); img.onerror = () => resolve();
    })));
    await html2pdf().set(pdfOptions(filename)).from(clone).save();
  } finally { holder.remove(); }
}

export async function downloadReceiptHtmlPdf(html: string, filename: string) {
  const html2pdf = await loadHtml2Pdf();
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden;';
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error('Could not prepare the receipt for PDF download.');
    const withBase = html.replace(/<head([^>]*)>/i, '<head$1><base href="' + window.location.origin + '/">');
    doc.open(); doc.write(withBase); doc.close();
    await new Promise<void>(resolve => {
      if (doc.readyState === 'complete') resolve();
      else frame.onload = () => resolve();
    });
    if (doc.fonts?.ready) await doc.fonts.ready;
    const images = Array.from(doc.images);
    await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => {
      img.onload = () => resolve(); img.onerror = () => resolve();
    })));
    const content = doc.querySelector('body');
    if (!content) throw new Error('Receipt content could not be prepared.');
    await html2pdf().set(pdfOptions(filename)).from(content as unknown as HTMLElement).save();
  } finally { frame.remove(); }
}
