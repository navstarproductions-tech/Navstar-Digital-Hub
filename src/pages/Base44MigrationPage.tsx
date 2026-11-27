import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Database, Download, FileJson, FileUp, ShieldCheck, UploadCloud } from 'lucide-react';
import { Link } from 'react-router-dom';

const ENTITY_NAMES = ['Enrollment','FeeStructure','FeePayment','AdditionalFee','SystemUser','StaffApplication'] as const;
type EntityName = typeof ENTITY_NAMES[number];
type Bundle = { format: string; version: number; exportedAt?: string; source?: string; entities: Partial<Record<EntityName, Record<string, unknown>[]>> };
const blankBundle: Bundle = {
  format: 'navstar-base44-migration',
  version: 1,
  exportedAt: new Date().toISOString(),
  source: 'Base44',
  entities: { Enrollment: [], FeeStructure: [], FeePayment: [], AdditionalFee: [], SystemUser: [], StaffApplication: [] }
};

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}

export function Base44MigrationPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const counts = useMemo(() => Object.fromEntries(ENTITY_NAMES.map(name => [name, bundle?.entities?.[name]?.length || 0])), [bundle]);

  async function selectFile(file?: File) {
    setError(''); setResult(null); setBundle(null); setFileName('');
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Please select the single Navstar migration JSON file.');
      if (file.size > 25 * 1024 * 1024) throw new Error('The migration file is larger than 25 MB. Export a smaller JSON bundle.');
      const parsed = JSON.parse(await file.text()) as Bundle;
      if (parsed?.format !== 'navstar-base44-migration' || parsed?.version !== 1 || !parsed.entities || typeof parsed.entities !== 'object') {
        throw new Error('This file is not a supported Navstar migration bundle. Download the template and use its exact format.');
      }
      for (const name of ENTITY_NAMES) {
        const rows = parsed.entities[name];
        if (rows !== undefined && (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row)))) {
          throw new Error(name + ' must be an array of record objects.');
        }
      }
      const total = ENTITY_NAMES.reduce((sum, name) => sum + (parsed.entities[name]?.length || 0), 0);
      if (!total) throw new Error('The selected file contains no records.');
      setBundle(parsed); setFileName(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the migration file.');
    }
  }

  async function runImport() {
    if (!bundle) return;
    if (!(bundle.entities.Enrollment?.length)) {
      setError('This migration package has no student Enrollment records. Upload a complete export containing the student records as well as any fee and staff data.');
      return;
    }
    setBusy(true); setError(''); setResult(null);
    try {
      setProgress('Creating a secure one-time transfer session…');
      const tokenResponse = await fetch('/api/admin/base44-migration/token', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.token) throw new Error(tokenData.error || 'Could not start the secure import.');
      const token = tokenData.token;
      let transferred = 0;
      const total = ENTITY_NAMES.reduce((sum, name) => sum + (bundle.entities[name]?.length || 0), 0);
      for (const name of ENTITY_NAMES) {
        const rows = bundle.entities[name] || [];
        for (let offset = 0; offset < rows.length; offset += 100) {
          setProgress('Uploading ' + name + ' records (' + Math.min(offset + 100, rows.length) + ' of ' + rows.length + ')…');
          const response = await fetch('/api/admin/base44-migration/import', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityName: name, records: rows.slice(offset, offset + 100) })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not upload ' + name + ' records.');
          transferred += Number(data.received || 0);
          setProgress('Securely received ' + transferred + ' of ' + total + ' records…');
        }
      }
      setProgress('Saving student records, fees and payment history into the official database…');
      const completeResponse = await fetch('/api/admin/base44-migration/complete', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}'
      });
      const completion = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completion.error || 'Records were uploaded to the secure staging archive, but operational import did not complete. ' + (completion.detail || ''));
      setResult({ ...completion, recordsReceived: transferred, archiveOnlyStaffAccounts: bundle.entities.SystemUser?.length || 0, archiveOnlyStaffApplications: bundle.entities.StaffApplication?.length || 0 });
      setProgress('Import completed. Review the saved record totals below.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import could not be completed.');
      setProgress('');
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-800 hover:underline"><ArrowLeft className="h-4 w-4"/>Back to Admin Portal</Link>
        <header className="rounded-2xl bg-gradient-to-r from-[#09224b] to-[#075b9c] p-6 text-white shadow-lg">
          <div className="flex items-center gap-3"><Database className="h-7 w-7 text-amber-300"/><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-200">Navstar Digital Hub</p><h1 className="text-2xl font-black">Data Import & Export Centre</h1></div></div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/85">Use one JSON package for the full Base44 transfer. Download the standard format, place every exported entity array in its matching section without renaming fields, then upload that one file here. The official site validates, reads and saves the records in batches.</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-600"/><div><h2 className="font-bold">1. Download the standard file format</h2><p className="mt-1 text-sm text-slate-600">The template contains all supported sections and their exact entity names. Keep the format and field names unchanged. Put the complete records in the matching arrays; no manual field-by-field editing is required.</p></div></div>
          <button onClick={()=>downloadJson('Navstar-Base44-Migration-Template.json',blankBundle)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900 hover:bg-blue-100"><Download className="h-4 w-4"/>Download JSON template</button>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ENTITY_NAMES.map(name=><div key={name} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-sm font-bold">{name}</p><p className="text-xs text-slate-500">{name==='Enrollment'?'Student records':name==='FeeStructure'?'Course fee structures':name==='FeePayment'?'Fee payment history':name==='AdditionalFee'?'Student additional fees':name==='SystemUser'?'Staff user accounts': 'Staff applications'}</p></div>)}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><FileUp className="mt-1 h-5 w-5 shrink-0 text-blue-700"/><div><h2 className="font-bold">2. Upload the complete migration file once</h2><p className="mt-1 text-sm text-slate-600">Select the single completed JSON file. The system checks the package format and record arrays before anything is imported.</p></div></div>
          <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={event=>void selectFile(event.target.files?.[0])}/>
          <button onClick={()=>inputRef.current?.click()} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-800 px-5 py-3 text-sm font-bold text-white hover:bg-blue-900 disabled:opacity-50"><UploadCloud className="h-4 w-4"/>Choose migration JSON file</button>
          {fileName&&<p className="mt-3 break-all text-sm font-semibold text-slate-700"><FileJson className="mr-2 inline h-4 w-4"/>{fileName}</p>}
          {bundle&&<div className="mt-4 rounded-xl border border-slate-200 p-4"><h3 className="font-bold">Package validation passed</h3><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{ENTITY_NAMES.map(name=><div key={name} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{name}</p><p className="text-xl font-black tabular-nums">{counts[name]}</p></div>)}</div><p className="mt-3 text-xs text-slate-500">Total records: {ENTITY_NAMES.reduce((sum,name)=>sum+(counts[name] as number),0).toLocaleString()}</p><button onClick={()=>void runImport()} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{busy?'Importing…':'Import and save all records'}</button></div>}
          {busy&&<p role="status" className="mt-4 rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-900">{progress}</p>}
          {error&&<p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {result&&<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h3 className="font-bold text-emerald-950">Import completed</h3><p className="mt-1 text-sm text-emerald-900">Records received: {String(result.recordsReceived ?? 0)}. Student enrolments imported: {String(result.studentEnrollmentsImported ?? 0)}. Fee structures saved: {String(result.feeStructuresImported ?? 0)}. Fee payments saved: {String(result.feePaymentsImported ?? 0)}.</p><p className="mt-2 text-xs text-emerald-900">Staff accounts received for secure archive: {String(result.archiveOnlyStaffAccounts ?? 0)}. Staff applications received for secure archive: {String(result.archiveOnlyStaffApplications ?? 0)}. Staff records are preserved in the migration archive and are not yet activated as operational staff/application records.</p>{Array.isArray(result.warnings)&&result.warnings.length>0&&<ul className="mt-3 list-disc pl-5 text-xs text-amber-900">{(result.warnings as string[]).map((warning,index)=><li key={index}>{warning}</li>)}</ul>}</div>}
        </section>
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Data protection:</strong> The Base44 source is not changed or deleted. Passwords and biometric/fingerprint data are excluded from the transfer; imported student accounts require password setup. Keep the exported JSON file private because it contains personal and financial records. Do not upload it to GitHub or share it publicly.</section>
      </div>
    </main>
  );
}
