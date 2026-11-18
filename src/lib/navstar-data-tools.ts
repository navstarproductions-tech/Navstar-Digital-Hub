export type ExportCell = string | number | boolean | null | undefined;
export type ExportRow = Record<string, ExportCell>;

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
const csvCell = (value: ExportCell) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"' && quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell.trim()); cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCsvTemplate(filename: string, headers: string[], sample: string[] = []) {
  const content = [headers, ...(sample.length ? [sample] : [])].map(row => row.map(csvCell).join(',')).join('\r\n');
  saveBlob(filename, new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }));
}

export function exportBrandedData(format: 'excel' | 'word' | 'pdf', title: string, headers: string[], rows: ExportRow[]) {
  const stamp = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }).format(new Date());
  const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'navstar-records';
  if (format === 'excel') {
    const content = [headers, ...rows.map(row => headers.map(header => row[header] ?? ''))].map(row => row.map(csvCell).join(',')).join('\r\n');
    saveBlob(safeName + '-navstar.csv', new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }));
    return;
  }
  const table = '<table><thead><tr>' + headers.map(header => '<th>' + escapeHtml(header) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(row => '<tr>' + headers.map(header => '<td>' + escapeHtml(row[header]) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title><style>' +
    'body{font-family:Arial,sans-serif;color:#172033;padding:28px}header{border-bottom:5px solid #d4a72c;padding-bottom:16px;margin-bottom:22px}h1{margin:0;color:#0b2854;font-size:23px}p{color:#536176;font-size:11px}table{border-collapse:collapse;width:100%;font-size:10px}th{background:#0b2854;color:#fff;text-align:left}th,td{border:1px solid #d8dee8;padding:8px;vertical-align:top}tr:nth-child(even){background:#f3f6fa}.motto{letter-spacing:2px;color:#b8860b;font-weight:bold;font-size:10px}' +
    '</style></head><body><header><div class="motto">NAVSTAR DIGITAL HUB · HOME OF TECHNOCRATS</div><h1>' + escapeHtml(title) + '</h1><p>Official system register · Generated ' + escapeHtml(stamp) + '</p></header>' + table + '<p>Prepared by Navstar Digital Hub. Verify records against the live system before making official decisions.</p></body></html>';
  if (format === 'word') {
    saveBlob(safeName + '-navstar.doc', new Blob([html], { type: 'application/msword;charset=utf-8' }));
    return;
  }
  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) { throw new Error('Allow pop-ups to create the branded PDF printout.'); }
  printWindow.document.open(); printWindow.document.write(html); printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 350);
}
