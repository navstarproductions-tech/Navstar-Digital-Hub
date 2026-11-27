import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Database, Download, FileJson, FileUp, RefreshCw, Search, ShieldCheck, UploadCloud } from 'lucide-react';
import { Link } from 'react-router-dom';

const ENTITY_NAMES = ['Course','CourseUnit','ModuleAssignment','Enrollment','FeeStructure','FeePayment','AdditionalFee','Exam','ExamQuestion','ExamAttempt','StudentResult','Assignment','AssignmentSubmission','ExamSettings','SystemSettings','GradingSystem','MarksApproval','MarksConflict','SystemUser','StaffApplication'] as const;
type Bundle = { format?: string; version?: number; exportedAt?: string; source?: string; entities: Record<string, Record<string, unknown>[]> };
const blankBundle: Bundle = {
  format: 'navstar-base44-migration',
  version: 1,
  exportedAt: new Date().toISOString(),
  source: 'Base44',
  entities: { Course: [], CourseUnit: [], ModuleAssignment: [], Enrollment: [], FeeStructure: [], FeePayment: [], AdditionalFee: [], Exam: [], ExamQuestion: [], ExamAttempt: [], StudentResult: [], Assignment: [], AssignmentSubmission: [], ExamSettings: [], SystemSettings: [], GradingSystem: [], MarksApproval: [], MarksConflict: [], SystemUser: [], StaffApplication: [] }
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
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [previewEntity, setPreviewEntity] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [archive, setArchive] = useState<{batch?: {id?:string;createdAt?: string;completed?: boolean;recordsReceived?: number;savedRecords?:number}; batches?: {id:string;createdAt:string;completed:boolean;recordsReceived:number;savedRecords:number}[]; entities?: {entityName:string;count:number}[]; records?: {entityName:string;sourceId:string;createdAt?:string;updatedAt?:string;importedAt?:string;data:Record<string,unknown>}[]; truncated?:boolean;nextOffset?:number|null;offset?:number} | null>(null);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [archiveError, setArchiveError] = useState('');

  const entityNames = useMemo(() => Object.keys(bundle?.entities || {}).sort((a,b)=>a.localeCompare(b)), [bundle]);
  const counts = useMemo(() => Object.fromEntries(entityNames.map(name => [name, bundle?.entities?.[name]?.length || 0])), [bundle, entityNames]);
  const selectedCount = selectedEntities.reduce((sum, name) => sum + (bundle?.entities?.[name]?.length || 0), 0);
  const hasAcademicArchive = (archive?.entities || []).some(item => ['Enrollment','FeeStructure','FeePayment','AdditionalFee','Course','CourseUnit','ModuleAssignment','SystemUser','Exam','ExamQuestion','ExamAttempt','StudentResult','Assignment','AssignmentSubmission','ExamSettings','SystemSettings','GradingSystem','MarksApproval','MarksConflict','StaffApplication'].includes(item.entityName) && item.count > 0);
  const visibleArchiveRecords = useMemo(() => {
    const records = archive?.records || [];
    const query = archiveSearch.trim().toLowerCase();
    if (!query) return records;
    return records.filter(record => [
      record.entityName,
      record.sourceId,
      JSON.stringify(record.data || {})
    ].join(' ').toLowerCase().includes(query));
  }, [archive, archiveSearch]);

  async function selectFile(file?: File) {
    setError(''); setResult(null); setBundle(null); setFileName(''); setSelectedEntities([]); setPreviewEntity('');
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Please select the single Navstar migration JSON file.');
      if (file.size > 100 * 1024 * 1024) throw new Error('The migration JSON is larger than 100 MB. Split the export into smaller JSON files to avoid browser memory limits.');
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      const candidateValue = raw.entities && typeof raw.entities === 'object' ? raw.entities : raw.data && typeof raw.data === 'object' ? raw.data : raw;
      const candidate = (Array.isArray(candidateValue) ? Object.fromEntries(candidateValue.filter(item => item && typeof item === 'object').map(item => { const entry=item as Record<string,unknown>; return [String(entry.entityName||entry.entity_name||entry.name||''), entry.records||entry.items||entry.data]; })) : candidateValue) as Record<string, unknown>;
      const normalized: Record<string, Record<string, unknown>[]> = {};
      for (const [entityName, value] of Object.entries(candidate)) {
        if (['format','version','exportedAt','exported_at','source','metadata','schema'].includes(entityName)) continue;
        if (Array.isArray(value)) {
          if (value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw new Error('Entity "' + entityName + '" contains a value that is not a record object. No records have been uploaded.');
          }
          normalized[entityName] = value as Record<string, unknown>[];
        } else if (value && typeof value === 'object' && (Array.isArray((value as Record<string, unknown>).items) || Array.isArray((value as Record<string, unknown>).records) || Array.isArray((value as Record<string, unknown>).data))) {
          const group=value as Record<string, unknown>;
          const rows=(group.items||group.records||group.data) as unknown[];
          if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Entity "' + entityName + '" contains invalid records.');
          normalized[entityName] = rows as Record<string, unknown>[];
        } else if (!['format','version','exportedAt','exported_at','source','metadata','schema','createdAt','created_at'].includes(entityName)) {
          throw new Error('The export contains "' + entityName + '" but its structure is not a record array. Nothing has been uploaded. This entity must be exported as an array of records.');
        }
      }
      const total = Object.values(normalized).reduce((sum, rows) => sum + rows.length, 0);
      if (!Object.keys(normalized).length || !total) throw new Error('No entity arrays containing records were found. Upload the Base44 JSON export (not a PDF, CSV or ZIP file).');
      const parsed: Bundle = { format: 'navstar-base44-migration', version: 1, exportedAt: String(raw.exportedAt || raw.exported_at || new Date().toISOString()), source: 'Base44', entities: normalized };
      setBundle(parsed); setFileName(file.name); setSelectedEntities(Object.keys(normalized)); setPreviewEntity(Object.keys(normalized).sort()[0] || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the migration file.');
    }
  }

  async function loadArchive(batchId?: string) {
    setArchiveError('');
    try {
      const query = batchId ? '?batch=' + encodeURIComponent(batchId) : '';
      const response = await fetch('/api/admin/base44-migration/archive' + query, { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the saved archive.');
      setArchive(data);
      setSelectedBatch(data.batch?.id || '');
    } catch (cause) {
      setArchiveError(cause instanceof Error ? cause.message : 'Could not load the saved archive.');
    }
  }

  async function loadMoreArchive() {
    if (!archive?.batch?.id || archive.nextOffset == null) return;
    setArchiveError('');
    try {
      const query = '?batch=' + encodeURIComponent(archive.batch.id) + '&offset=' + archive.nextOffset + '&limit=500';
      const response = await fetch('/api/admin/base44-migration/archive' + query, { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load more archived records.');
      setArchive(previous => previous ? { ...data, records: [...(previous.records || []), ...(data.records || [])] } : data);
    } catch (cause) {
      setArchiveError(cause instanceof Error ? cause.message : 'Could not load more archived records.');
    }
  }

  async function importArchivedAcademic() {
    if (!selectedBatch || !hasAcademicArchive) return;
    setBusy(true); setArchiveError(''); setError(''); setResult(null);
    try {
      setProgress('Opening a secure session to connect the saved academic records…');
      const tokenResponse = await fetch('/api/admin/base44-migration/token', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const tokenData = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokenData.token) throw new Error(tokenData.error || 'Could not start the secure academic import.');
      setProgress('Replaying the complete archive into the official student, finance, staff, recruitment and academic modules…');
      const response = await fetch('/api/admin/base44-migration/complete', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Authorization': 'Bearer ' + tokenData.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: selectedBatch, archiveReplay: true })
      });
      const completion = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error([completion.error || 'Saved academic records could not be connected.', completion.detail || '', completion.progress ? JSON.stringify(completion.progress) : ''].filter(Boolean).join(' · '));
      setResult({ ...completion, recordsReceived: archive?.batch?.savedRecords || 0, detectedEntities: (archive?.entities || []).filter(x => ['Enrollment','FeeStructure','FeePayment','AdditionalFee','Course','CourseUnit','ModuleAssignment','SystemUser','StaffApplication','Exam','ExamQuestion','ExamAttempt','StudentResult','Assignment','AssignmentSubmission','ExamSettings','SystemSettings','GradingSystem','MarksApproval','MarksConflict'].includes(x.entityName)).length });
      await loadArchive(selectedBatch);
      setProgress('Saved system records have been processed. Refresh the relevant portals to view the connected records.');
    } catch (cause) {
      setArchiveError(cause instanceof Error ? cause.message : 'Could not import the saved academic records.');
      setProgress('');
    } finally { setBusy(false); }
  }

  async function runImport() {
    if (!bundle) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setProgress('Creating a secure one-time transfer session…');
      const tokenResponse = await fetch('/api/admin/base44-migration/token', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.token) throw new Error(tokenData.error || 'Could not start the secure import.');
      const token = tokenData.token;
      let transferred = 0;
      let skippedExisting = 0;
      const names = selectedEntities.filter(name => (bundle.entities[name] || []).length > 0);
      if (!names.length) throw new Error('Select at least one entity to import.');
      const total = names.reduce((sum, name) => sum + (bundle.entities[name]?.length || 0), 0);
      for (const name of names) {
        const rows = bundle.entities[name] || [];
        for (let offset = 0; offset < rows.length; offset += 100) {
          setProgress('Uploading ' + name + ' records (' + Math.min(offset + 100, rows.length) + ' of ' + rows.length + ')…');
          const response = await fetch('/api/admin/base44-migration/import', {
            method: 'POST', credentials: 'same-origin', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityName: name, records: rows.slice(offset, offset + 100) })
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Could not upload ' + name + ' records (HTTP ' + response.status + ').');
          transferred += Number(data.received || 0);
          skippedExisting += Number(data.skipped || 0);
          setProgress('Securely received ' + transferred + ' of ' + total + ' records…');
        }
      }
      setProgress('Connecting courses, modules, exams, question banks, student marks, assignments and fee records to the official database…');
      const completeResponse = await fetch('/api/admin/base44-migration/complete', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}'
      });
      const completion = await completeResponse.json().catch(() => ({}));
      if (!completeResponse.ok) { const detail = [completion.detail, completion.progress ? 'Import progress: ' + JSON.stringify(completion.progress) : ''].filter(Boolean).join('\\n'); throw new Error([completion.error || 'Operational import did not complete.', detail].filter(Boolean).join('\\n')); }
      setResult({ ...completion, recordsReceived: transferred, skippedExisting, detectedEntities: names.length, detectedEntityNames: names });
      await loadArchive('');
      setProgress('Import completed. Review the saved record totals below.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The import could not be completed.';
      setError(message === 'Failed to fetch' ? 'Network request failed before the server returned a response. Open this page on navstardigitalhub.co.ke (not an editor preview), confirm your admin session is active, and check that the latest Cloudflare deployment is live. No successful import is being reported.' : message);
      setProgress('');
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-800 hover:underline"><ArrowLeft className="h-4 w-4"/>Back to Admin Portal</Link>
        <header className="rounded-2xl bg-gradient-to-r from-[#09224b] to-[#075b9c] p-6 text-white shadow-lg">
          <div className="flex items-center gap-3"><Database className="h-7 w-7 text-amber-300"/><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-200">Navstar Digital Hub</p><h1 className="text-2xl font-black">Data Import & Export Centre</h1></div></div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/85">Upload your Base44 JSON export. The centre detects every entity array it can read, including entities not yet connected to live modules, and archives all records in batches. Student, fee, examination, question-bank, assignment and academic-result records are connected to their corresponding official modules where a safe course, module and student match exists.</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-600"/><div><h2 className="font-bold">1. Download the standard file format</h2><p className="mt-1 text-sm text-slate-600">This is an optional example format only. You can upload a Base44 JSON export directly; the system detects entity arrays automatically and does not require you to rename fields.</p></div></div>
          <button onClick={()=>downloadJson('Navstar-Base44-Migration-Template.json',blankBundle)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900 hover:bg-blue-100"><Download className="h-4 w-4"/>Download JSON template</button>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ENTITY_NAMES.map(name=><div key={name} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-sm font-bold">{name}</p><p className="text-xs text-slate-500">{name==='Enrollment'?'Student records':name==='FeeStructure'?'Course fee structures':name==='FeePayment'?'Fee payment history':name==='AdditionalFee'?'Student additional fees':name==='Exam'?'Examination papers':name==='ExamQuestion'?'Exam question bank':name==='ExamAttempt'?'Student exam attempts and marks':name==='StudentResult'?'Module-level student results':name==='Assignment'?'Assignments and question sets':name==='AssignmentSubmission'?'Student assignment submissions':name==='Course'?'Course identity mapping':name==='CourseUnit'?'Module identity mapping':name==='ModuleAssignment'?'Tutor-to-module allocations':name==='ExamSettings'?'Exam security and display settings':name==='SystemSettings'?'Marks and grading configuration':name==='GradingSystem'?'Official grade bands and classifications':name==='MarksApproval'?'Marks approval history':name==='MarksConflict'?'Marks conflict history':name==='SystemUser'?'Staff user accounts':'Staff applications'}</p></div>)}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><FileUp className="mt-1 h-5 w-5 shrink-0 text-blue-700"/><div><h2 className="font-bold">2. Upload the complete migration file once</h2><p className="mt-1 text-sm text-slate-600">Select the single completed JSON file. The system checks the package format and record arrays before anything is imported.</p></div></div>
          <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={event=>void selectFile(event.target.files?.[0])}/>
          <button onClick={()=>inputRef.current?.click()} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-800 px-5 py-3 text-sm font-bold text-white hover:bg-blue-900 disabled:opacity-50"><UploadCloud className="h-4 w-4"/>Choose migration JSON file</button>
          {fileName&&<p className="mt-3 break-all text-sm font-semibold text-slate-700"><FileJson className="mr-2 inline h-4 w-4"/>{fileName}</p>}
          {bundle&&<div className="mt-4 rounded-xl border border-slate-200 p-4"><h3 className="font-bold">Export contents detected</h3><p className="mt-1 text-sm text-slate-600">{entityNames.length} entities and {entityNames.reduce((sum,name)=>sum+(counts[name] as number),0).toLocaleString()} total records detected. Tick only the data groups you want to import. Existing matching records will be skipped rather than duplicated.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>setSelectedEntities(entityNames)} className="rounded-lg border px-3 py-1.5 text-xs font-bold">Select all</button><button type="button" onClick={()=>setSelectedEntities([])} className="rounded-lg border px-3 py-1.5 text-xs font-bold">Clear selection</button></div><div className="mt-3 space-y-2">{entityNames.map(name=><div key={name} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><label className="flex min-w-0 items-center gap-3"><input type="checkbox" checked={selectedEntities.includes(name)} onChange={event=>setSelectedEntities(current=>event.target.checked?[...current,name]:current.filter(item=>item!==name))} className="h-4 w-4"/><span className="break-all text-sm font-semibold">{name}</span><span className="text-xs text-slate-500">{counts[name]} records</span></label><button type="button" onClick={()=>setPreviewEntity(current=>current===name?'':name)} className="text-xs font-bold text-blue-800 underline">{previewEntity===name?'Hide records':'Preview records'}</button>{previewEntity===name&&<pre className="max-h-72 w-full overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(bundle.entities[name],null,2)}</pre>}</div>)}</div><p className="mt-3 text-sm font-bold">Selected: {selectedEntities.length} entities · {selectedCount.toLocaleString()} records</p><button onClick={()=>void runImport()} disabled={busy||selectedCount===0} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{busy?'Importing…':'Import selected data'}</button></div>}
          {busy&&<p role="status" className="mt-4 rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-900">{progress}</p>}
          {error&&<p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {result&&<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h3 className="font-bold text-emerald-950">Import completed</h3><p className="mt-1 text-sm text-emerald-900">Source records in package: {String(result.recordsReceived ?? result.stagedRecordsProcessed ?? 0)}. Repeated archive rows skipped during upload: {String(result.skippedExisting ?? 0)}. Student enrolments imported or matched: {String(result.studentEnrollmentsImported ?? 0)}. Student records needing identity review: {String(result.skippedStudents ?? 0)}. Previous-system admission numbers restored: {String(result.admissionNumbersUpdated ?? 0)}. Admission-number conflicts: {String(result.admissionNumberConflicts ?? 0)}. Modules linked: {String(result.modulesImported ?? 0)}. Modules skipped: {String(result.modulesSkipped ?? 0)}. Exams imported: {String(result.examsImported ?? 0)}. Existing exams matched: {String(result.examsAlreadyPresent ?? 0)}. Exams skipped: {String(result.examsSkipped ?? 0)}. Historical exams recovered from attempt records: {String(result.examsRecoveredFromAttempts ?? 0)}. Legacy question placeholders preserving original responses: {String(result.legacyQuestionsRecovered ?? 0)}. Exam questions imported: {String(result.questionsImported ?? 0)}. Existing questions matched: {String(result.questionsAlreadyPresent ?? 0)}. Questions skipped: {String(result.questionsSkipped ?? 0)}. Exam attempts imported: {String(result.examAttemptsImported ?? 0)}. Existing attempts skipped as duplicates: {String(result.examAttemptsAlreadyPresent ?? 0)}. Attempts needing manual identity/course matching: {String(result.examAttemptsSkipped ?? 0)}. Approval records restored: {String(result.examApprovalsImported ?? 0)}. Tutor module allocations restored: {String(result.moduleAssignmentsImported ?? 0)}. Existing allocations matched: {String(result.moduleAssignmentsAlreadyPresent ?? 0)}. Allocations skipped: {String(result.moduleAssignmentsSkipped ?? 0)}. Assignments imported: {String(result.assignmentsImported ?? 0)}. Assignment submissions imported: {String(result.assignmentSubmissionsImported ?? 0)}. Submissions skipped: {String(result.assignmentSubmissionsSkipped ?? 0)}. Student module results imported: {String(result.studentResultsImported ?? 0)}. Results skipped: {String(result.studentResultsSkipped ?? 0)}. Marks conflicts queued for review: {String(result.marksConflictsImported ?? 0)}. Conflicts skipped: {String(result.marksConflictsSkipped ?? 0)}. Staff applications connected to Recruitment: {String(result.staffApplicationsImported ?? 0)}. Existing staff applications skipped as duplicates: {String(result.staffApplicationsAlreadyPresent ?? 0)}. Staff applications needing correction: {String(result.staffApplicationsSkipped ?? 0)}. Staff portal accounts created: {String(result.systemUsersImported ?? 0)}. Existing staff accounts linked: {String(result.systemUsersAlreadyPresent ?? 0)}. Unsupported or unmatched staff accounts skipped: {String(result.systemUsersSkipped ?? 0)}. All staged records processed: {String(result.stagedRecordsProcessed ?? 0)}. Approved fee structures saved: {String(result.feeStructuresImported ?? 0)}. Fee structures not activated: {String(result.feeStructuresSkipped ?? 0)}. Fee payments saved: {String(result.feePaymentsImported ?? 0)}. Additional fees saved: {String(result.additionalFeesImported ?? 0)}.</p><p className="mt-2 text-xs text-emerald-900">All detected entities: {String(result.detectedEntities ?? 0)}. New records archived from this upload: {String(result.recordsReceived ?? 0)}. Additional entities are preserved in the archive even when no live module mapping exists.</p>{Array.isArray(result.warnings)&&result.warnings.length>0&&<ul className="mt-3 list-disc pl-5 text-xs text-amber-900">{(result.warnings as string[]).map((warning,index)=><li key={index}>{warning}</li>)}</ul>}</div>}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-bold">3. View and manage permanently saved records</h2><p className="mt-1 text-sm text-slate-600">Browse saved migration packages, see how many records were stored for each entity, search original records, and reopen any package.</p></div>
            <button onClick={()=>void loadArchive('')} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold hover:bg-slate-50"><RefreshCw className="h-4 w-4"/>Refresh archive</button>
          </div>
          {archiveError&&<p role="alert" className="mt-3 text-sm text-rose-700">{archiveError}</p>}
          {archive&&<>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block text-xs font-bold text-slate-600">SAVED MIGRATION PACKAGE
                <select value={selectedBatch} onChange={event=>{setSelectedBatch(event.target.value);void loadArchive(event.target.value);}} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900">
                  {(archive.batches||[]).map(batch=><option key={batch.id} value={batch.id}>{new Date(batch.createdAt).toLocaleString()} · {batch.savedRecords} saved records{batch.completed?' · completed':''}</option>)}
                </select>
              </label>
              <div className="rounded-lg bg-slate-50 px-4 py-2 text-sm"><span className="text-slate-500">Persisted records</span><p className="text-xl font-black tabular-nums">{archive.batch?.savedRecords ?? 0}</p></div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Package date: {archive.batch?.createdAt ? new Date(archive.batch.createdAt).toLocaleString() : 'No saved package'} · Received: {archive.batch?.recordsReceived ?? 0} · Saved in archive: {archive.batch?.savedRecords ?? 0} · Status: {archive.batch?.completed?'Import completed':'Not marked complete'}</p>
            {hasAcademicArchive&&<div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-blue-950">Connect the complete saved system package</p><p className="mt-1 text-xs text-blue-900">Import the complete saved package: students, admission numbers, approved fees and payments, courses, modules, tutor allocations, exams, questions, attempts, assignments, marks, staff accounts and recruitment records. Existing matches are protected against duplicates.</p></div><button type="button" onClick={()=>void importArchivedAcademic()} disabled={busy} className="rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy?'Connecting…':'Import archived system data'}</button></div></div>}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {(archive.entities||[]).map(item=><div key={item.entityName} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">{item.entityName}</p><p className="text-xl font-black tabular-nums">{item.count}</p><p className="text-[11px] text-slate-500">records saved</p></div>)}
              {(!archive.entities||archive.entities.length===0)&&<p className="col-span-full rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This package has no saved records. Choose another package above or upload and complete the migration.</p>}
            </div>
            <div className="mt-4">
              <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={archiveSearch} onChange={event=>setArchiveSearch(event.target.value)} placeholder="Search by student name, entity, source ID or any saved detail…" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm"/></label>
              <p className="mt-2 text-xs text-slate-500">Showing {visibleArchiveRecords.length} of {(archive.records||[]).length} loaded records.</p>
            </div>
            <div className="mt-3 max-h-[38rem] space-y-2 overflow-auto">
              {visibleArchiveRecords.map((record,index)=>{
                const data=record.data||{};
                const displayName=String(data.student_name||data.full_name||data.name||data.applicant_name||data.staff_name||data.email||record.sourceId);
                const detailPairs=Object.entries(data).filter(([key,value])=>value!==null&&value!==undefined&&typeof value!=='object'&&String(value).trim()!=='').slice(0,8);
                return <details key={record.entityName+'-'+record.sourceId} className="rounded-lg border border-slate-200 p-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-bold text-slate-900">{displayName}</p><p className="mt-0.5 text-xs text-slate-500">{record.entityName} · Source ID: {record.sourceId}</p></div><span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800">View original details</span></div>
                    {detailPairs.length>0&&<p className="mt-2 line-clamp-2 text-xs text-slate-600">{detailPairs.map(([key,value])=>key.replace(/_/g,' ')+': '+String(value)).join(' · ')}</p>}
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>Created: {record.createdAt||'Not supplied'}</span><span>Updated: {record.updatedAt||'Not supplied'}</span><span>Archived: {record.importedAt||'Not supplied'}</span></div>
                  <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(record.data,null,2)}</pre>
                </details>;
              })}
              {visibleArchiveRecords.length===0&&archive.records?.length>0&&<p className="p-4 text-center text-sm text-slate-500">No records match your search.</p>}
            </div>
            {archive.nextOffset!=null&&<button onClick={()=>void loadMoreArchive()} className="mt-3 w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900 hover:bg-blue-100">Load next 500 records ({Math.max(0,(archive.batch?.savedRecords||0)-(archive.records||[]).length).toLocaleString()} remaining)</button>}
            {archive.nextOffset==null&&archive.batch?.savedRecords!=null&&archive.batch.savedRecords>0&&<p className="mt-3 text-center text-xs font-semibold text-emerald-700">All {archive.batch.savedRecords.toLocaleString()} saved records in this package are loaded.</p>}
          </>}
        </section>
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Data protection:</strong> The Base44 source is not changed or deleted. Passwords and biometric/fingerprint data are excluded from the transfer; imported student accounts require password setup. Keep the exported JSON file private because it contains personal and financial records. Do not upload it to GitHub or share it publicly.</section>
      </div>
    </main>
  );
}
