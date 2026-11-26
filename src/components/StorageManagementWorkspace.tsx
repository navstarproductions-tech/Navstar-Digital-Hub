import { useCallback,useEffect,useState } from 'react';
import { Button } from '@/components/ui/button';
import { uploadNavstarFile, type NavstarStorageModule } from '@/lib/storage';

type StorageOverview={
 provider:string;bucketName:string;bucketPrivate:boolean;bucketConnected:boolean;connectionMessage:string;
 credentialsConfigured:boolean;totalFiles:number;totalBytes:number;deletedFiles:number;activeUploadIntents:number;
 byModule:{module:string;files:number;bytes:number}[];legacyStorage:{mediaAssets:number;employeeDocuments:number;forumMediaAssets:number};
 billingNote:string;error?:string;
};
type StorageSettings={maxUploadMb:number;maxMediaMb:number;downloadUrlExpirySeconds:number;storageAlertGb:number;retentionDays:number;allowedExtensions:string[]};
type StoredFile={id:string;originalName:string;extension:string;mimeType:string;sizeBytes:number;module:string;recordId?:string|null;ownerId?:string|null;uploadedBy?:string;visibility:string;status:string;description?:string;createdAt:string;deletedAt?:string|null};
const modules:NavstarStorageModule[]=['students','employees','courses','course-notes','assignments','projects','certificates','transcripts','report-cards','applications','scholarships','cyber-services','customer-uploads','photography','gallery','music','institutional-documents','generated-reports'];
const bytes=(value:number)=>value>=1024*1024?(value/1024/1024).toFixed(2)+' MB':value>=1024?(value/1024).toFixed(1)+' KB':value+' B';
export function StorageManagementWorkspace(){
 const [overview,setOverview]=useState<StorageOverview|null>(null),[files,setFiles]=useState<StoredFile[]>([]),[storageSettings,setStorageSettings]=useState<StorageSettings|null>(null),[supportedExtensions,setSupportedExtensions]=useState<string[]>([]);
 const [query,setQuery]=useState(''),[module,setModule]=useState(''),[status,setStatus]=useState('active'),[page,setPage]=useState(1),[total,setTotal]=useState(0);
 const [uploadModule,setUploadModule]=useState<NavstarStorageModule>('institutional-documents'),[progress,setProgress]=useState<number|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[savingSettings,setSavingSettings]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const [a,b,d]=await Promise.all([
    fetch('/api/storage/overview',{credentials:'same-origin',cache:'no-store'}),
    fetch('/api/storage/files?'+new URLSearchParams({q:query,module,status,page:String(page)}),{credentials:'same-origin',cache:'no-store'}),
    fetch('/api/storage/settings',{credentials:'same-origin',cache:'no-store'})
   ]);
   const [x,y,z]=await Promise.all([a.json(),b.json(),d.json()]);
   if(!a.ok)throw new Error(x.error||'Storage overview could not be loaded.');
   if(!b.ok)throw new Error(y.error||'Stored files could not be loaded.');
   if(!d.ok)throw new Error(z.error||'Storage settings could not be loaded.');
   setOverview(x);setFiles(y.files||[]);setTotal(Number(y.total||0));setStorageSettings(z.settings||null);setSupportedExtensions(z.supportedExtensions||[]);
  }catch(cause){setError(cause instanceof Error?cause.message:'Storage records could not be loaded.');}
  finally{setLoading(false);}
 },[query,module,status,page]);
 useEffect(()=>{void load()},[load]);
 const saveSettings=async()=>{
  if(!storageSettings)return;setSavingSettings(true);setError('');setNotice('');
  try{const response=await fetch('/api/storage/settings',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(storageSettings)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Storage settings could not be saved.');setStorageSettings(result.settings);setNotice('Storage settings saved. New upload and download requests will use these limits.');}
  catch(cause){setError(cause instanceof Error?cause.message:'Storage settings could not be saved.');}
  finally{setSavingSettings(false);}
 };
 const openFile=async(file:StoredFile)=>{
  setBusy(file.id);setError('');
  try{const response=await fetch('/api/storage/files/'+encodeURIComponent(file.id),{credentials:'same-origin',cache:'no-store'});const result=await response.json();if(!response.ok||!result.downloadUrl)throw new Error(result.error||'A secure download link could not be created.');window.open(result.downloadUrl,'_blank','noopener,noreferrer');}
  catch(cause){setError(cause instanceof Error?cause.message:'The file could not be opened.');}
  finally{setBusy('');}
 };
 const remove=async(file:StoredFile)=>{
  if(!window.confirm('Move "'+file.originalName+'" to the deleted-files register? The R2 object will be retained for recovery.'))return;
  setBusy(file.id);setError('');setNotice('');
  try{const response=await fetch('/api/storage/files/'+encodeURIComponent(file.id),{method:'DELETE',credentials:'same-origin'});const result=await response.json();if(!response.ok)throw new Error(result.error||'The file could not be deleted.');setNotice('File moved to deleted records. The original R2 object has been retained.');await load();}
  catch(cause){setError(cause instanceof Error?cause.message:'The file could not be deleted.');}
  finally{setBusy('');}
 };
 const restore=async(file:StoredFile)=>{
  setBusy(file.id);setError('');setNotice('');
  try{const response=await fetch('/api/storage/files/'+encodeURIComponent(file.id),{method:'POST',credentials:'same-origin'});const result=await response.json();if(!response.ok)throw new Error(result.error||'The file could not be restored.');setNotice('File restored successfully.');await load();}
  catch(cause){setError(cause instanceof Error?cause.message:'The file could not be restored.');}
  finally{setBusy('');}
 };
 const upload=async(file?:File)=>{
  if(!file)return;setBusy('upload');setProgress(0);setError('');setNotice('');
  try{const saved=await uploadNavstarFile(file,{module:uploadModule,onProgress:setProgress});setNotice(saved.originalName+' uploaded and verified in private R2 storage.');await load();}
  catch(cause){setError(cause instanceof Error?cause.message:'Upload failed. Please retry.');}
  finally{setBusy('');setProgress(null);}
 };
 return <div className="space-y-5 text-slate-900">
  <header className="rounded-2xl bg-gradient-to-r from-[#071a35] via-blue-950 to-[#075b68] p-5 text-white">
   <p className="text-[10px] font-black uppercase tracking-[.24em] text-cyan-200">NAVSTAR ICT · PRIVATE CLOUD STORAGE</p>
   <h2 className="mt-1 text-2xl font-black">Storage Management</h2>
   <p className="mt-1 max-w-3xl text-sm text-blue-100">Central file storage for student, employee, academic, cyber-service and institutional records. Private files are served only through short-lived, authorized links.</p>
   <div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">{overview?.provider||'Cloudflare R2'}</span><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">{overview?.bucketName||'navstar-digital-hub-storage'}</span><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">{overview?.bucketPrivate?'Private bucket':'Private by design'}</span></div>
  </header>
  {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  {notice&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   {[['Files registered',overview?.totalFiles??'—'],['Metadata storage estimate',overview?bytes(overview.totalBytes):'—'],['Deleted / recoverable',overview?.deletedFiles??'—'],['Active upload requests',overview?.activeUploadIntents??'—']].map(([label,value])=><article key={String(label)} className="rounded-xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></article>)}
  </section>
  <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
   <article className="rounded-2xl border bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-black">R2 connection</h3><p className="mt-1 text-xs text-slate-500">Credentials are checked server-side and never displayed.</p></div><span className={'rounded-full px-3 py-1 text-xs font-bold '+(overview?.bucketConnected?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-900')}>{overview?.bucketConnected?'Connected':'Not connected'}</span></div>
    <p className="mt-3 text-sm text-slate-700">{overview?.connectionMessage||'Checking private bucket connection…'}</p>
    <p className="mt-2 text-xs text-slate-500">Server credentials: {overview?.credentialsConfigured?'configured':'missing'} · Existing legacy buckets remain active during migration.</p>
    {overview&&!overview.bucketConnected&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Create the private bucket and add the R2 credentials in Cloudflare Pages settings before enabling uploads. Do not paste secrets into this page.</p>}
   </article>
   <article className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-black">Upload a file</h3><p className="mt-1 text-xs text-slate-500">The browser uploads directly to R2 using a short-lived signed URL. Metadata is saved only after server verification.</p><label className="mt-3 block text-xs font-bold">Destination module<select value={uploadModule} onChange={e=>setUploadModule(e.target.value as NavstarStorageModule)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm font-normal">{modules.map(item=><option key={item} value={item}>{item.replace(/-/g,' ')}</option>)}</select></label><label className="mt-3 block text-xs font-bold">Choose file<input type="file" disabled={busy==='upload'||!overview?.bucketConnected} onChange={e=>{void upload(e.target.files?.[0]);e.currentTarget.value='';}} className="mt-1 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-blue-900 file:px-3 file:py-2 file:font-bold file:text-white"/></label>{progress!==null&&<div className="mt-3"><div className="flex justify-between text-xs"><span>Upload progress</span><strong>{progress}%</strong></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-700 transition-all" style={{width:progress+'%'}}/></div></div>}</article>
  </section>
  <section className="rounded-2xl border bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-black">File manager</h3><p className="mt-1 text-xs text-slate-500">{total.toLocaleString()} file record(s) · Search, filter, preview, download, soft-delete and restore.</p></div><Button size="sm" variant="outline" disabled={loading} onClick={()=>void load()}>Refresh</Button></div>
   <div className="mt-4 grid gap-2 sm:grid-cols-3"><input value={query} onChange={e=>{setPage(1);setQuery(e.target.value)}} placeholder="Search filename or description" className="h-10 rounded-lg border px-3 text-sm"/><select value={module} onChange={e=>{setPage(1);setModule(e.target.value)}} className="h-10 rounded-lg border bg-white px-3 text-sm"><option value="">All modules</option>{modules.map(item=><option key={item} value={item}>{item.replace(/-/g,' ')}</option>)}</select><select value={status} onChange={e=>{setPage(1);setStatus(e.target.value)}} className="h-10 rounded-lg border bg-white px-3 text-sm"><option value="active">Active files</option><option value="deleted">Deleted / recoverable</option><option value="quarantined">Quarantined</option><option value="all">All statuses</option></select></div>
   <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">File</th><th className="p-3">Module</th><th className="p-3">Type / size</th><th className="p-3">Visibility</th><th className="p-3">Uploaded</th><th className="p-3">Actions</th></tr></thead><tbody>{files.map(file=><tr key={file.id} className="border-t"><td className="p-3"><p className="font-semibold">{file.originalName}</p><p className="mt-1 text-[11px] text-slate-400">{file.id}</p></td><td className="p-3 capitalize">{file.module.replace(/-/g,' ')}</td><td className="p-3"><p>{file.mimeType}</p><p className="text-xs text-slate-500">{bytes(file.sizeBytes)}</p></td><td className="p-3 capitalize">{file.visibility}</td><td className="p-3 text-xs text-slate-500">{new Date(file.createdAt).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'})}</td><td className="p-3"><div className="flex gap-2">{file.status==='deleted'?<Button size="sm" variant="outline" disabled={busy===file.id} onClick={()=>void restore(file)}>Restore</Button>:<><Button size="sm" variant="outline" disabled={busy===file.id} onClick={()=>void openFile(file)}>Preview / Download</Button><Button size="sm" variant="outline" disabled={busy===file.id} onClick={()=>void remove(file)}>Delete</Button></>}</div></td></tr>)}{!loading&&!files.length&&<tr><td colSpan={6} className="p-8 text-center text-sm text-slate-500">No files match the selected filters.</td></tr>}</tbody></table></div>
   <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500"><span>Page {page} · {Math.max(1,Math.ceil(total/50))}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page<=1||loading} onClick={()=>setPage(value=>value-1)}>Previous</Button><Button size="sm" variant="outline" disabled={page>=Math.ceil(total/50)||loading} onClick={()=>setPage(value=>value+1)}>Next</Button></div></div>
  </section>
  <section className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-black">Storage usage by module</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{(overview?.byModule||[]).map(row=><div key={row.module} className="rounded-lg bg-slate-50 p-3"><div className="flex justify-between gap-2 text-sm"><strong className="capitalize">{row.module.replace(/-/g,' ')}</strong><span>{bytes(row.bytes)}</span></div><p className="mt-1 text-xs text-slate-500">{row.files} file(s)</p></div>)}</div><p className="mt-3 text-xs leading-5 text-slate-500">{overview?.billingNote}</p><div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><strong>Legacy storage not yet migrated:</strong> {overview?.legacyStorage.mediaAssets||0} media asset(s), {overview?.legacyStorage.employeeDocuments||0} employee document(s), and {overview?.legacyStorage.forumMediaAssets||0} forum image(s) remain in their existing buckets. They have not been moved or deleted.</div></section>
  <section className="rounded-2xl border bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">Storage settings</h3><p className="mt-1 text-xs text-slate-500">Control future uploads and signed-link expiry. Existing files are not altered.</p></div><Button disabled={savingSettings||!storageSettings} onClick={()=>void saveSettings()}>{savingSettings?'Saving…':'Save storage settings'}</Button></div>
   {storageSettings&&<><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    <label className="text-xs font-bold">Max standard upload (MB)<input type="number" min="1" max="100" value={storageSettings.maxUploadMb} onChange={e=>setStorageSettings(s=>s?{...s,maxUploadMb:Number(e.target.value)}:s)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"/></label>
    <label className="text-xs font-bold">Max audio/video (MB)<input type="number" min="1" max="500" value={storageSettings.maxMediaMb} onChange={e=>setStorageSettings(s=>s?{...s,maxMediaMb:Number(e.target.value)}:s)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"/></label>
    <label className="text-xs font-bold">Download link expiry (seconds)<input type="number" min="60" max="900" value={storageSettings.downloadUrlExpirySeconds} onChange={e=>setStorageSettings(s=>s?{...s,downloadUrlExpirySeconds:Number(e.target.value)}:s)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"/></label>
    <label className="text-xs font-bold">Usage alert threshold (GB)<input type="number" min="1" max="10000" value={storageSettings.storageAlertGb} onChange={e=>setStorageSettings(s=>s?{...s,storageAlertGb:Number(e.target.value)}:s)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"/></label>
    <label className="text-xs font-bold">Retention policy (days)<input type="number" min="0" max="3650" value={storageSettings.retentionDays} onChange={e=>setStorageSettings(s=>s?{...s,retentionDays:Number(e.target.value)}:s)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"/></label>
   </div><div className="mt-4"><p className="text-xs font-bold">Allowed file extensions</p><div className="mt-2 flex flex-wrap gap-2">{supportedExtensions.map(ext=><label key={ext} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"><input type="checkbox" checked={storageSettings.allowedExtensions.includes(ext)} onChange={e=>setStorageSettings(s=>s?{...s,allowedExtensions:e.target.checked?[...s.allowedExtensions,ext]:s.allowedExtensions.filter(x=>x!==ext)}:s)}/>{ext}</label>)}</div></div><p className="mt-3 text-xs leading-5 text-slate-500">Retention is a policy setting only. The current release never automatically deletes files; deleted files remain recoverable until a separately approved retention and purge workflow is implemented.</p></>}
  </section>
 </div>;
}
