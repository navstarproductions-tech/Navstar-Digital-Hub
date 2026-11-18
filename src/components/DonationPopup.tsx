import { FormEvent, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Download, HeartHandshake, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatEATDateTime } from '@/lib/datetime';
import { downloadReceiptHtmlPdf } from '@/lib/receipt-pdf';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const amounts = [200, 500, 1000, 2500];
type ApiResult = { id?: string; reference?: string; error?: string; message?: string };
type PaymentStatus = { payment?: { status?: string; receipt_number?: string; internal_receipt_number?: string; result_description?: string; amount?: number; callback_phone?: string; transaction_date?: string; reference?: string } };
type DonationReceipt = { reference: string; navstarReceipt: string; mpesaCode: string; amount: number; phone: string; date: string };

async function apiJson<T>(response: Response, label: string): Promise<T> {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error(label + ' returned an unexpected response. Please contact Navstar support.');
  return await response.json() as T;
}

function escapeReceiptHtml(value: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, character => entities[character] || character);
}

function printDonationReceipt(receipt: DonationReceipt, money: (value: number) => string): void {
  const generatedAt = formatEATDateTime(new Date().toISOString());
  const receivedAt = formatEATDateTime(receipt.date);
  const serial = escapeReceiptHtml(receipt.navstarReceipt || receipt.reference);
  const mpesa = escapeReceiptHtml(receipt.mpesaCode);
  const reference = escapeReceiptHtml(receipt.reference);
  const phone = escapeReceiptHtml(receipt.phone);
  const amount = escapeReceiptHtml(money(receipt.amount));
  const qrPayload = encodeURIComponent(['NAVSTAR DIGITAL HUB','OFFICIAL DONATION RECEIPT','Receipt: '+receipt.navstarReceipt,'M-Pesa: '+receipt.mpesaCode,'Amount: KES '+receipt.amount,'Status: SAFARICOM CONFIRMED','Received: '+receivedAt].join(' | '));
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=190x190&margin=8&data=' + qrPayload;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Navstar-Donation-Receipt-${serial}</title>
  <style>
  *{box-sizing:border-box}body{margin:0;background:#eaf0f8;color:#13243a;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{width:100%;max-width:780px;margin:24px auto;background:#fff;box-shadow:0 12px 40px #0b285022;overflow:hidden}
  .letterhead{display:flex;align-items:center;justify-content:space-between;gap:22px;padding:25px 30px;background:linear-gradient(120deg,#061b3b,#0b4387 62%,#087b83);color:#fff;border-bottom:5px solid #e5b84b}
  .brand{display:flex;align-items:center;gap:16px;min-width:0}.logo-wrap{width:104px;height:84px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#fff;border-radius:12px;padding:7px}.logo-wrap img{max-width:100%;max-height:100%;object-fit:contain}
  .brand h1{font-size:21px;letter-spacing:.04em;margin:0;font-weight:900}.motto{margin:7px 0 0;color:#f6d77d;font-size:11px;letter-spacing:.18em;font-weight:800}
  .contacts{margin-top:9px;color:#e4efff;font-size:10px;line-height:1.65}.receipt-label{text-align:right;min-width:180px}.receipt-label .overline{font-size:10px;letter-spacing:.2em;font-weight:800;color:#c9e5ff}.receipt-label h2{font-size:22px;margin:7px 0 9px}.serial{display:inline-block;border:2px solid #fecaca;background:#fff1f2;color:#b91c1c;padding:8px 12px;border-radius:8px;font-weight:900;font-size:15px;letter-spacing:.04em}.generated{margin-top:9px;color:#e0edff;font-size:10px}
  .content{padding:28px 32px}.status{display:inline-flex;padding:7px 12px;border-radius:99px;background:#dcfce7;color:#166534;font-size:10px;font-weight:900;letter-spacing:.1em}
  .details{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px}.detail-box{border:1px solid #dce6f1;border-radius:12px;padding:16px}.section-title{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#55708e;font-weight:900;margin:0 0 9px}.value{font-size:13px;font-weight:800;color:#102a4b;overflow-wrap:anywhere}.sub{font-size:11px;color:#61748b;margin-top:7px;line-height:1.6}
  .amount-panel{margin-top:22px;padding:21px 24px;border-radius:14px;background:linear-gradient(110deg,#eaf3ff,#e9fbf5);border:1px solid #b9d7f5;display:flex;align-items:center;justify-content:space-between;gap:18px}.amount-panel span{display:block;font-size:10px;letter-spacing:.17em;font-weight:900;color:#315477}.amount-panel strong{font-size:30px;letter-spacing:-.03em;color:#075b49}.amount-panel small{font-size:10px;color:#53718b}
  .confirmation{margin-top:18px;border-left:4px solid #0d9488;background:#f0fdfa;padding:14px 16px;font-size:11px;line-height:1.7;color:#24485b}
  .qr-row{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:22px;padding-top:18px;border-top:1px solid #e2eaf3}.qr-copy{font-size:11px;line-height:1.7;color:#5a7087;max-width:400px}.qr{width:116px;height:116px;object-fit:contain;border:1px solid #d9e3ed;border-radius:8px;padding:5px;background:#fff}.footer{margin-top:22px;padding-top:14px;border-top:2px solid #0b4387;display:flex;justify-content:space-between;gap:12px;font-size:10px;color:#65788e}.footer strong{color:#173b65}
  .appreciation{page-break-before:always;break-before:page;padding:35px 38px;min-height:900px}.appreciation-head{padding:22px;background:linear-gradient(120deg,#061b3b,#0b4387);color:#fff;border-bottom:4px solid #e5b84b}.appreciation-head h1{font-size:22px;margin:0}.appreciation-head p{margin:7px 0 0;color:#f6d77d;font-size:11px;letter-spacing:.15em;font-weight:800}.letter-body{font-size:13px;line-height:1.9;color:#334b65}.letter-body h2{color:#0b4387;font-size:20px;margin:32px 0 20px}.letter-body p{margin:14px 0}.signoff{margin-top:38px;font-weight:800;color:#0b315e}
  @page{size:A4;margin:12mm}@media print{body{background:#fff}.sheet{max-width:none;margin:0;box-shadow:none;overflow:visible}.content{padding:24px 28px}.letterhead{padding:20px 24px}.appreciation{min-height:0;padding:26px 30px}.appreciation{page-break-before:always}.qr-row{break-inside:avoid}}
  @media(max-width:620px){.letterhead{align-items:flex-start;flex-direction:column}.receipt-label{text-align:left}.details{grid-template-columns:1fr}.amount-panel{align-items:flex-start;flex-direction:column}.content{padding:20px}.brand h1{font-size:17px}}
  </style></head><body>
  <article class="sheet"><header class="letterhead">
   <div class="brand"><div class="logo-wrap"><img src="/Navstar_Official_Logo.jpg" alt="Navstar Digital Hub official logo"></div><div><h1>NAVSTAR DIGITAL HUB</h1><p class="motto">HOME OF TECHNOCRATS</p><div class="contacts">0797 688 576 · 0706 637 485<br>navstardigitalhub@gmail.com · P.O. Box 546-50200, Bungoma, Kenya</div></div></div>
   <div class="receipt-label"><div class="overline">OFFICIAL DIGITAL DOCUMENT</div><h2>DONATION RECEIPT</h2><div class="serial">SERIAL: ${serial}</div><div class="generated">Generated: ${escapeReceiptHtml(generatedAt)}</div></div>
  </header><div class="content">
   <span class="status">✓ PAYMENT RECEIVED · SAFARICOM CONFIRMED</span>
   <div class="details"><section class="detail-box"><p class="section-title">Received from</p><div class="value">Valued Supporter</div><p class="sub">M-Pesa phone: ${phone}</p></section>
   <section class="detail-box"><p class="section-title">Payment details</p><div class="value">Safaricom M-Pesa</div><p class="sub">Date received: ${escapeReceiptHtml(receivedAt)}<br>Donation reference: ${reference}<br>M-Pesa transaction code: ${mpesa}</p></section></div>
   <section class="amount-panel"><div><span>AMOUNT RECEIVED</span><small>Confirmed donation · Kenya Shillings</small></div><strong>${amount}</strong></section>
   <div class="confirmation"><strong>Payment confirmation</strong><br>This digital receipt confirms that the donation shown above was received after confirmation from Safaricom M-Pesa. The Navstar serial number is separate from the Safaricom transaction code.</div>
   <div class="qr-row"><div class="qr-copy"><strong>Digital receipt QR code</strong><br>Scan to read the receipt reference, Safaricom transaction code, amount and confirmed payment status. Keep this receipt for your records.<br><br><strong>NAVSTAR DIGITAL HUB · HOME OF TECHNOCRATS</strong></div><img class="qr" src="${qrUrl}" alt="QR code for this confirmed donation receipt"></div>
   <footer class="footer"><div><strong>Thank you for supporting digital learning.</strong><br>Electronically generated by Navstar Digital Hub.</div><div style="text-align:right">Official receipt · No physical signature required<br>Generated in East Africa Time (EAT)</div></footer>
  </div></article>
  <article class="sheet appreciation"><header class="appreciation-head"><h1>NAVSTAR DIGITAL HUB</h1><p>HOME OF TECHNOCRATS · LETTER OF APPRECIATION</p></header><div class="letter-body"><h2>Thank you for your generosity</h2><p>Date: ${escapeReceiptHtml(formatEATDateTime(new Date().toISOString()))}</p><p>Dear Valued Supporter,</p><p>On behalf of Navstar Digital Hub, we sincerely thank you for your generous contribution of <strong>${amount}</strong>. Your donation was confirmed by Safaricom M-Pesa and recorded under receipt number <strong>${serial}</strong>.</p><p>Your support strengthens our mission to widen access to digital knowledge and practical technology. Contributions help us work towards learning resources, supervised computer access, skills development, innovation activities and digital assistance for people who need an opportunity to learn, create and participate in the digital world.</p><p>We value every contribution, regardless of its size. Your kindness encourages us to keep building a community where technology is a tool for opportunity, creativity and positive change. We undertake to handle support responsibly and direct it towards the stated community and learning objectives of Navstar Digital Hub.</p><p>Please keep this letter and the attached receipt as your record of appreciation and payment confirmation. We are grateful that you chose to be part of this journey.</p><p class="signoff">With sincere gratitude,<br><br>MANAGEMENT<br>NAVSTAR DIGITAL HUB<br>HOME OF TECHNOCRATS</p><p>Email: navstardigitalhub@gmail.com<br>Tel: +254 797 688 576 / +254 706 637 485</p></div></article>
  </body></html>`;
  void downloadReceiptHtmlPdf(html, `Navstar-Donation-Receipt-${serial}.pdf`).catch(error => window.alert(error instanceof Error ? error.message : 'The PDF could not be downloaded.'));
}


export function DonationPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState(500);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<DonationReceipt | null>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!receipt) return;
    setFading(false);
    const fadeTimer = window.setTimeout(() => setFading(true), 28000);
    const closeTimer = window.setTimeout(onClose, 29000);
    return () => { window.clearTimeout(fadeTimer); window.clearTimeout(closeTimer); };
  }, [receipt, onClose]);

  useEffect(() => {
    if (!open) { setReceipt(null); setMessage(''); setFading(false); }
  }, [open]);

  const donate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPhone = phone.replace(/[\s-]/g, '');
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(normalizedPhone)) { setMessage('Please enter a valid Kenyan M-Pesa number.'); return; }
    if (!Number.isInteger(amount) || amount < 1 || amount > 150000) { setMessage('Enter an amount between KSh 1 and KSh 150,000.'); return; }
    setLoading(true); setMessage('Registering your donation securely…'); setReceipt(null);
    try {
      const donationResponse = await fetch('/api/donations', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ phone: normalizedPhone, amount }) });
      const donation = await apiJson<ApiResult>(donationResponse, 'Donation service');
      if (!donationResponse.ok || !donation.id) throw new Error(donation.error || 'Your donation could not be registered.');
      setMessage('Donation reference ' + (donation.reference || donation.id) + ' created. Preparing your M-Pesa prompt…');
      const pushResponse = await fetch('/api/payments/stk-push', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ phone: normalizedPhone, amount, purpose: 'donation', reference: donation.id }) });
      const payment = await apiJson<ApiResult>(pushResponse, 'M-Pesa service');
      if (!pushResponse.ok || !payment.id) throw new Error(payment.error || 'The M-Pesa prompt could not be started.');
      setMessage('Processing… Please check your phone and enter your M-Pesa PIN on the official Safaricom prompt.');
      for (let attempt = 0; attempt < 36; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 5000));
        const statusResponse = await fetch('/api/payments/stk-push?reference=' + encodeURIComponent(payment.id), { headers: { Accept: 'application/json' } });
        if (!statusResponse.ok) continue;
        const statusData = await apiJson<PaymentStatus>(statusResponse, 'Payment status');
        const current = statusData.payment;
        if (current?.status === 'paid' && current.receipt_number) {
          setReceipt({
            reference: current.reference || payment.reference || donation.reference || donation.id,
            navstarReceipt: current.internal_receipt_number || current.reference || payment.reference || donation.reference || donation.id,
            mpesaCode: current.receipt_number,
            amount: Number(current.amount || amount),
            phone: current.callback_phone || normalizedPhone,
            date: current.transaction_date || new Date().toISOString(),
          });
          setMessage('Received. Your donation has been confirmed by Safaricom.');
          return;
        }
        if (current?.status === 'failed') throw new Error(current.result_description || 'M-Pesa did not complete this payment. You may try again.');
      }
      setMessage('Your payment is still awaiting Safaricom confirmation. Please keep reference ' + (payment.reference || donation.reference || donation.id) + ' and check again shortly.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'We could not complete the donation. Please try again.');
    } finally { setLoading(false); }
  };

  const downloadDocuments = () => { if (receipt) printDonationReceipt(receipt, money); };
  const money = (value: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value);

  return <AnimatePresence>
    {open && <motion.div className="donation-overlay fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-blue-950/75 p-3 backdrop-blur-sm sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: fading ? 0 : 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} onMouseDown={event => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <motion.section role="dialog" aria-modal="true" aria-labelledby="donation-title" className="donation-screen relative my-auto w-full max-w-xl overflow-hidden rounded-3xl border border-green-300/50 bg-white shadow-2xl" initial={{ y: 24, scale: .97 }} animate={{ y: 0, scale: fading ? .98 : 1 }} exit={{ y: 18, opacity: 0 }} transition={{ duration: .35 }}>
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-green-800 px-6 py-7 text-white sm:px-8">
          <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-amber-300/15 blur-2xl"/>
          <button type="button" onClick={onClose} disabled={loading} aria-label="Close donation window" className="absolute right-4 top-4 rounded-full border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-40"><X className="h-4 w-4"/></button>
          <div className="flex items-center gap-3"><span className="rounded-2xl border border-amber-300/40 bg-amber-300/15 p-3 text-amber-200"><HeartHandshake className="h-7 w-7"/></span><div><p className="text-[10px] font-black tracking-[.25em] text-amber-200">HOME OF TECHNOCRATS</p><h2 id="donation-title" className="mt-1 text-2xl font-black sm:text-3xl">Support Navstar</h2></div></div>
          <p className="mt-4 max-w-md text-sm leading-6 text-blue-100">Your generosity helps widen access to digital skills, learning resources and practical technology support in our community.</p>
        </div>
        {!receipt ? <form onSubmit={donate} className="space-y-5 p-6 sm:p-8">
          <div><p className="text-sm font-bold text-slate-900">Choose your contribution</p><div className="mt-3 grid grid-cols-4 gap-2">{amounts.map(value => <button key={value} type="button" onClick={() => setAmount(value)} aria-pressed={amount === value} className={'rounded-xl border px-2 py-3 text-sm font-extrabold transition '+(amount === value ? 'border-amber-400 bg-amber-50 text-blue-950 ring-2 ring-amber-300' : 'border-slate-200 text-slate-700 hover:border-green-400')}>{value.toLocaleString()}</button>)}</div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="donation-popup-amount">Amount (KSh)</Label><Input id="donation-popup-amount" className="!h-12 !w-full !border-2 !border-slate-400 !bg-white !px-4 !text-base !font-bold !text-slate-950 placeholder:!text-slate-500 shadow-sm focus-visible:!border-blue-700 focus-visible:!bg-white focus-visible:!text-slate-950 focus-visible:!ring-2 focus-visible:!ring-blue-200" type="number" min="1" max="150000" value={amount} onChange={event => setAmount(event.target.value === "" ? 0 : Number(event.target.value))} required/></div><div className="space-y-2"><Label htmlFor="donation-popup-phone">M-Pesa phone number</Label><Input id="donation-popup-phone" className="!h-12 !w-full !border-2 !border-slate-400 !bg-white !px-4 !text-base !font-bold !text-slate-950 placeholder:!font-normal placeholder:!text-slate-500 shadow-sm focus-visible:!border-blue-700 focus-visible:!bg-white focus-visible:!text-slate-950 focus-visible:!ring-2 focus-visible:!ring-blue-200" autoComplete="tel" inputMode="tel" placeholder="07xx xxx xxx" value={phone} onChange={event => setPhone(event.target.value)} required/></div></div>
          <Button type="submit" disabled={loading || amount < 1} className="h-12 w-full rounded-xl bg-blue-800 text-base font-extrabold text-white hover:bg-blue-950">{loading ? <><LoaderCircle className="mr-2 h-5 w-5 animate-spin"/>Processing donation…</> : 'Donate KSh '+amount.toLocaleString()+' with M-Pesa'}</Button>
          {message && <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">{loading && <LoaderCircle className="mt-1 h-4 w-4 shrink-0 animate-spin"/>}<span>{message}</span></div>}
          <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-700"/>Your donation is marked received only after Safaricom confirms it. Enter your PIN only on the official M-Pesa prompt on your phone.</p>
        </form> : <div className="p-6 sm:p-8">
          <div className="text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700"><CheckCircle2 className="h-9 w-9"/></span><p className="mt-4 text-xs font-black tracking-[.2em] text-green-700">PAYMENT CONFIRMED</p><h3 className="mt-2 text-2xl font-black text-blue-950">Donation received. Thank you!</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">Safaricom has confirmed your contribution. Your generosity helps make digital opportunity more accessible.</p></div>
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-green-900">Amount received</span><strong className="text-xl font-black text-green-900">{money(receipt.amount)}</strong></div><dl className="mt-3 grid grid-cols-2 gap-2 border-t border-green-200 pt-3 text-xs"><dt className="text-slate-600">Donation reference</dt><dd className="text-right font-bold text-slate-900">{receipt.reference}</dd><dt className="text-slate-600">Navstar receipt</dt><dd className="text-right font-bold text-slate-900">{receipt.navstarReceipt}</dd><dt className="text-slate-600">M-Pesa transaction code</dt><dd className="text-right font-bold tracking-wide text-slate-900">{receipt.mpesaCode}</dd><dt className="text-slate-600">Phone</dt><dd className="text-right font-semibold text-slate-900">{receipt.phone}</dd><dt className="text-slate-600">Date received</dt><dd className="text-right font-semibold text-slate-900">{formatEATDateTime(receipt.date)}</dd><dt className="text-slate-600">Status</dt><dd className="text-right font-black text-green-800">RECEIVED</dd></dl></div>
          <blockquote className="mt-5 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 text-center text-sm italic leading-6 text-amber-950">“No act of kindness, no matter how small, is ever wasted.”</blockquote>
          <Button onClick={downloadDocuments} className="mt-5 h-12 w-full rounded-xl bg-blue-900 font-bold hover:bg-blue-950"><Download className="mr-2 h-4 w-4"/>Download official PDF receipt</Button>
          <p className="mt-3 text-center text-xs text-slate-500">Your download includes the full branded receipt and the letter of appreciation.</p>
          <button type="button" onClick={onClose} className="mt-3 w-full rounded-xl border border-green-300 px-4 py-3 text-sm font-bold text-green-900 hover:bg-green-50">Close</button>
        </div>}
      </motion.section>
      <style>{'@media print { @page { size: A4; margin: 16mm; } body * { visibility: hidden !important; } .donation-print, .donation-print * { visibility: visible !important; } .donation-print { display: block !important; position: absolute; inset: 0; width: 100%; } .donation-print .break-before-page { break-before: page; page-break-before: always; } }'}</style>
    </motion.div>}
  </AnimatePresence>;
}
