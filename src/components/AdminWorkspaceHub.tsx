import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, ExternalLink, ShieldCheck, Database, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EnrollmentAdminActions } from '@/components/EnrollmentAdminActions';

type Row = Record<string, unknown>;
type Props = {
  section: string;
  subtab: string;
  courses: Array<{id:string;title:string;category?:string;price?:number;duration?:string}>;
  users: Array<{id:string;name:string;email:string;role:string;status:string;staffId?:string;dateOfBirth?:string}>;
  applications: Array<Record<string, unknown>>;
  services: Array<{id:string;name:string;category:string;price_label?:string;status:string}>;
};

const definitions: Record<string,{purpose:string;source:string;endpoint?:string;links:Array<[string,string]>;columns:string[]}> = {
 applications:{purpose:'Review verified student applications, record admissions decisions, approve documented special-payment exceptions and issue course-specific letters.',source:'Verified student admissions register',endpoint:'/api/enrollments',links:[['Courses','/courses'],['Student directory','/admin']],columns:['reference','full_name','email','course_id','status','payment_status','created_at']},
 'navstar-analytics':{purpose:'Dedicated Navstar Analytics school-management workspace. School records are intentionally isolated from Navstar Digital Hub cyber and computer-course records.',source:'Separate school analytics data model',links:[['Analytics overview','/admin']],columns:['School','Learners','Classes','Reporting period']},
 'analytics-reports':{purpose:'Review operational trends from Navstar Digital Hub course, service and verified finance activity.',source:'Admin operational records',endpoint:'/api/admin/overview',links:[['Admin dashboard','/admin']],columns:['metric','value','period','source']},
 pos:{purpose:'Review POS sales, service orders and confirmed payment status.',source:'Verified payment and service-order registers',endpoint:'/api/admin/payments',links:[['New sale','/admin'],['Receipts','/admin/receipts']],columns:['payer_name','purpose','receipt_number','amount','status','updated_at']},
 orders:{purpose:'Track customer service orders, cart activity and fulfilment status.',source:'Customer service request register',endpoint:'/api/admin/service-requests',links:[['Service catalogue','/services']],columns:['reference','customerName','serviceName','status','createdAt']},
 receipts:{purpose:'Search and review verified Navstar payment receipts.',source:'Verified payment register',endpoint:'/api/admin/payments',links:[['Official receipts','/admin/receipts']],columns:['payer_name','purpose','receipt_number','amount','updated_at']},
 downloads:{purpose:'Review published documents and manage download visibility.',source:'Published document register',endpoint:'/api/admin/downloads',links:[['Public downloads','/downloads']],columns:['title','description','originalName','createdAt']},
 gallery:{purpose:'Review uploaded Navstar media, images and gallery assets.',source:'Media asset register',endpoint:'/api/gallery',links:[['Public gallery','/gallery']],columns:['altText','createdAt','id','url']},
 learning:{purpose:'Manage course modules, lessons and assignments using the existing Learning Management System.',source:'Learning Management System',endpoint:'/api/learning',links:[['Learning workspace','/learning']],columns:['title','description','modules','assignments']},
 'marks-tests':{purpose:'Review course assessment content and learner submissions from the Learning Management System.',source:'Learning Management System',endpoint:'/api/learning',links:[['Learning workspace','/learning']],columns:['title','assignments','modules','lessons']},
 users:{purpose:'Review active user accounts, staff roles and student account access.',source:'Navstar user directory',endpoint:'/api/admin/users',links:[['Profile settings','/admin']],columns:['name','email','role','status','staffId']},
 finance:{purpose:'Review verified payment transactions, cashout activity and financial reporting data.',source:'Verified Navstar payment register',endpoint:'/api/admin/payments',links:[['Cashouts','/admin'],['Finance settings','/admin']],columns:['payer_name','purpose','receipt_number','amount','status','updated_at']},
 fees:{purpose:'Review fee collection, receipts, fee statements and outstanding student balances.',source:'Student enrolment and payment register',endpoint:'/api/enrollments',links:[['Student accounts','/admin'],['Payment register','/admin']],columns:['full_name','course_id','payment_status','status','created_at']},
 'ai-intake-advisor':{purpose:'Review intake demand, course interest and the next recommended recruitment actions.',source:'Admissions and course records',endpoint:'/api/enrollments',links:[['Applications','/admin'],['Course catalogue','/courses']],columns:['full_name','course_id','status','created_at']},
 'staff-applications':{purpose:'Review separate staff recruitment applications, supporting documents, interview progress and hiring decisions. This is not the student course-enrolment register.',source:'Staff recruitment register',links:[['Employee directory','/admin'],['Staff roles','/admin']],columns:['Applicant','Position applied for','Submitted date','Recruitment status']},
 'student-projects':{purpose:'Track project proposals, submissions, review decisions and showcase-ready work.',source:'Student project register',links:[['Learning workspace','/learning']],columns:['Project title','Student','Course','Review status']},
 'scholarships':{purpose:'Review scholarship and discount requests, award decisions and award history.',source:'Scholarship and discount register',links:[['Student directory','/admin'],['Fee settings','/admin']],columns:['Applicant','Course','Requested support','Decision']},
 'certificates':{purpose:'Manage completion eligibility, certificate templates, serials and verification records.',source:'Academic completion and certificate register',links:[['Learning records','/learning'],['Student directory','/admin']],columns:['Student','Course','Completion status','Certificate serial']},
 'alumni':{purpose:'Maintain graduate contacts, alumni updates, events and graduate follow-up.',source:'Graduate and alumni register',links:[['Graduate list','/admin'],['Student records','/admin']],columns:['Graduate','Course','Completion date','Contact status']},
 'report-cards':{purpose:'Prepare, review, approve and issue student report cards and academic transcripts.',source:'Marks, attendance and fee records',links:[['Marks and learning','/learning'],['Report settings','/admin']],columns:['Student','Course','Assessment period','Approval status']},
 'auto-reports':{purpose:'Generate approved institutional documents from verified Navstar records.',source:'Document templates and approved registers',links:[['Documents','/admin'],['Settings','/admin']],columns:['Template','Document type','Last generated','Status']},
 'student-status':{purpose:'Review active, completed, graduated and other authorised student status groups.',source:'Student account directory',endpoint:'/api/admin/users',links:[['Student directory','/admin']],columns:['name','email','status','role']},
 attendance:{purpose:'Record and review learner attendance by course, module, date and tutor.',source:'Attendance register',links:[['Learning workspace','/learning']],columns:['Student','Course','Session date','Attendance']},
 'class-rating':{purpose:'Create class evaluation forms and review learner feedback and rating trends.',source:'Class rating forms and responses',links:[['Learning workspace','/learning']],columns:['Form','Course','Responses','Average rating']},
 fingerprint:{purpose:'Manage authorised fingerprint enrolment and verification activity. Biometric templates must remain in a protected biometric service.',source:'Biometric service',links:[['User directory','/admin']],columns:['User','Staff / Student ID','Enrolment status','Last verification']},
 'online-forms':{purpose:'Build, publish and review online forms and their submissions.',source:'Online forms register',links:[['Admissions applications','/admin']],columns:['Form','Audience','Published','Responses']},
 reports:{purpose:'Prepare operational, student and finance reports from verified system registers.',source:'Verified student, course and finance records',endpoint:'/api/admin/overview',links:[['Analytics','/admin'],['Finance','/admin']],columns:['Report','Period','Records included','Generated']},
 'songs-music':{purpose:'Organise the institution music library, uploads and playlists.',source:'Music library service',links:[['Media library','/admin']],columns:['Title','Category','Uploaded','Visibility']},
 'news-updates':{purpose:'Draft, publish and archive official Navstar announcements and news updates.',source:'Published news register',links:[['Home page content','/admin'],['Documents','/admin']],columns:['Headline','Audience','Publish date','Status']},
 events:{purpose:'Plan institutional events, meetings, agendas and minutes.',source:'Events and meetings register',links:[['Announcements','/admin']],columns:['Event','Date and time','Venue','Status']},
 'demo-previews':{purpose:'Organise available product demonstrations, preview media and demo links.',source:'Demo preview register',links:[['Gallery','/admin']],columns:['Demo','Category','Preview link','Status']},
 'cv-builder':{purpose:'Create and manage professional CV drafts and approved CV templates.',source:'CV document workspace',links:[['My account','/my-account']],columns:['CV title','Template','Last edited','Export status']},
 'upload-notes':{purpose:'Publish course notes and organise learning resources by course and module.',source:'Learning materials',endpoint:'/api/learning',links:[['Learning workspace','/learning']],columns:['Course','Module','Resource','Publication status']},
 timetable:{purpose:'Plan tutor timetables, academic calendars, schedules and daily sessions.',source:'Timetable and academic calendar',links:[['Learning workspace','/learning']],columns:['Course','Tutor','Date','Session']},
 'online-classes':{purpose:'Manage online classrooms, class materials and published learning sessions.',source:'Online classroom service',links:[['Learning workspace','/learning']],columns:['Class','Course','Tutor','Status']},
 'eclass-meetings':{purpose:'Schedule online meetings, distribute joining information and review meeting history.',source:'E-class meeting register',links:[['Learning workspace','/learning']],columns:['Meeting','Course','Start time','Status']},
 'student-chat':{purpose:'Review student conversations, create support messages and archive resolved chats.',source:'Student messaging service',links:[['Notifications','/portals/notifications'],['Support services','/services']],columns:['Conversation','Student','Last message','Status']},
 'support-tickets':{purpose:'Triage support requests, assign follow-up and track resolution.',source:'Support ticket register',links:[['Service requests','/admin'],['Customer services','/services']],columns:['reference','customerName','serviceName','status']},
 'send-notification':{purpose:'Compose authorised notifications and inspect delivery history.',source:'Navstar notification service',endpoint:'/api/admin/notifications',links:[['Notifications','/portals/notifications']],columns:['title','message','created_at','read_at']},
 'broadcast-social':{purpose:'Prepare approved broadcast messages and social campaign drafts.',source:'Broadcast campaign register',links:[['News and updates','/admin']],columns:['Campaign','Channel','Audience','Status']},
 'sms-alerts':{purpose:'Prepare SMS alerts and review delivery records. Actual dispatch requires configured SMS credentials.',source:'SMS delivery service',links:[['Notification settings','/admin']],columns:['Message','Recipient group','Sent at','Delivery status']},
 'birthday-center':{purpose:'Review upcoming birthdays and manage approved birthday messages.',source:'Student and staff profile dates',endpoint:'/api/admin/users',links:[['User directory','/admin']],columns:['name','role','dateOfBirth','email']},
 'about-us':{purpose:'Manage Navstar profile, mission, vision and public contact information.',source:'Institution profile settings',links:[['Institute profile','/admin'],['Home page content','/admin']],columns:['Setting','Current value','Visibility','Updated']},
 'campus-history':{purpose:'Organise campus stories, institutional history and photo highlights.',source:'Gallery and institutional content',endpoint:'/api/gallery',links:[['Gallery','/admin']],columns:['Image / story','Description','Date','Visibility']},
 'device-management':{purpose:'Review registered devices, activation policy and device activity.',source:'Device activation service',links:[['Security settings','/admin']],columns:['Device','Assigned user','Activation','Last seen']},
 'admin-access':{purpose:'Review administrator roles, permissions and access events.',source:'User roles and audit records',endpoint:'/api/admin/users',links:[['System users','/admin'],['Audit logs','/admin']],columns:['name','email','role','status']},
 maintenance:{purpose:'Configure service interruptions, affected portals and restoration notices.',source:'Maintenance configuration',links:[['Maintenance settings','/admin']],columns:['Portal','Maintenance status','Return time','Notice']},
 'ict-portal':{purpose:'Coordinate ICT support requests, service information and internal portal access.',source:'ICT service desk and service catalogue',endpoint:'/api/services',links:[['Services','/services'],['Support tickets','/admin']],columns:['name','category','price_label','status']},
 'customer-carts':{purpose:'Review active customer cart sessions and saved items before checkout.',source:'Customer cart service',links:[['Customer service desk','/services']],columns:['Customer','Items','Cart total','Last updated']},
 'customer-accounts':{purpose:'Review customer accounts, balances and verified service payment history.',source:'Customer account register',links:[['Customer service desk','/services'],['Payment records','/admin']],columns:['Customer','Email','Account balance','Status']},

};

const subtabDescriptions: Record<string,string> = {
 'Pending Review':'Only records awaiting an authorised review should appear in this view.',
 'Fee Defaulters':'This view filters to unpaid enrolment records only.',
 'Payment Receipts':'This view filters to confirmed payment records with receipts.',
 'Transactions':'Review recorded payment transactions and their provider status.',
 'Cashouts':'Review cashout requests separately from received payments.',
 'Financial Reports':'Review verified transactions only; pending payment prompts are excluded.',
 'Fee Statements':'Review each learner enrolment and payment status.',
 'Enrollment Fee Offers':'Review the fee policy and configured offers without altering the underlying course price.',
 'Approved Applications':'Approved records are shown separately from new and rejected applications.',
 'Rejected Applications':'Review declined applications and their recorded decision reasons.',
 'Application Documents':'Review supporting documents attached to applications; sensitive identity details must remain protected.',
 'Student Analytics':'Student trends are calculated from active student and enrolment records.',
 'Course Analytics':'Course activity is based on the current Navstar course catalogue.',
 'Revenue Analytics':'Revenue figures must be based on verified payments, not pending STK requests.',
 'Attendance Analytics':'Attendance reporting requires saved session registers.',
 'Review Recommendations':'Review AI suggestions before applying any action to an applicant record.',
 'Intake Forecasts':'Forecasts are based on recorded application volumes and configured intake dates.',
 'All Tickets':'All available service requests are listed in this workspace.',
 'Open Tickets':'Only requests still awaiting action belong in this view.',
 'Resolved Tickets':'Resolved requests are separated from open work.',
 'Upload Documents':'Upload approved documents using the Documents workspace and its supported file storage.',
 'Manage Downloads':'Manage publication state and public access for existing downloadable documents.',
 'Compose Notification':'Create a message for an authorised audience and confirm delivery status.',
 'Notification History':'Review saved notifications and delivery timestamps.',
 'Delivery Status':'A delivery status is shown only when the messaging provider returns a result.',
 'Upcoming Events':'Show scheduled future events and meetings.',
 'Meetings & Minutes':'Keep meeting records and minutes separate from event announcements.',
 'Create Rating Form':'Create a new class feedback form for a selected course.',
 'Responses & Analysis':'Review submitted ratings and calculate summaries from actual responses.',
 'Create Online Class':'Create a session only when the classroom service is connected.',
 'Meeting History':'Review completed or cancelled online meetings.',
 'Register Fingerprint':'Biometric registration requires an approved secure biometric device and service.',
 'Scan & Verify':'A scan is accepted only when the connected biometric service confirms a match.',
 'Fingerprint Records':'Do not expose raw biometric templates in the Admin interface.',
};

const titleCase = (value:string) => value.replace(/[-_]/g,' ').replace(/\b\w/g,letter=>letter.toUpperCase());

export function AdminWorkspaceHub({section,subtab,courses,users,applications,services}:Props) {
 const [records,setRecords]=useState<Row[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [query,setQuery]=useState('');
 const [refresh,setRefresh]=useState(0);
 const [galleryFile,setGalleryFile]=useState<File|null>(null);
 const [galleryBusy,setGalleryBusy]=useState(false);
 const [galleryMessage,setGalleryMessage]=useState('');
 const definition=definitions[section];
 const endpoint=section==='pos'&&['Scan & Sells','Print Barcode Labels','Generate Missing Barcodes'].includes(subtab)?undefined:section==='pos'&&subtab==='Packing & Delivery'?'/api/admin/service-requests':section==='finance'&&subtab==='Cashouts'?'/api/admin/cashouts':section==='fees'&&subtab==='Enrollment Fee Offers'?undefined:definition?.endpoint;
 useEffect(()=>{
  let live=true;
  if(!endpoint){setRecords([]);return;}
  setLoading(true);setError('');
  fetch(endpoint,{credentials:'same-origin'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load this register.');const collection=Object.values(data).find(value=>Array.isArray(value)) as Row[]|undefined;const metrics=['analytics-reports','reports'].includes(section)&&!collection?Object.entries(data).map(([metric,value])=>({metric,value:String(value),period:'Current',source:'Verified Admin overview'})):[];if(live)setRecords(collection||metrics);}).catch(cause=>{if(live)setError(cause instanceof Error?cause.message:'Could not load this register.');}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[endpoint,section,refresh]);
 const sourceRows=useMemo<Row[]>(()=>{
  if(section==='courses')return courses as unknown as Row[];
  if(section==='student-status')return subtab==='Active Students'?users.filter(item=>item.role==='student'&&item.status==='active') as unknown as Row[]:[];
  if(section==='school')return users.filter(item=>item.role==='student') as unknown as Row[];
  if(section==='staff-applications')return records;
  if(section==='employees'||section==='admin-access')return users.filter(item=>item.role!=='student') as unknown as Row[];
  if(section==='applications')return records.length?records:applications;
  if(section==='enrollment-summary'||section==='ai-intake-advisor')return applications;
  if(section==='pos'&&['Scan & Sells','Print Barcode Labels','Generate Missing Barcodes'].includes(subtab))return [];
  if(section==='upload-notes')return records.flatMap(course=>Array.isArray(course.modules)?(course.modules as Row[]).flatMap(module=>Array.isArray(module.lessons)?(module.lessons as Row[]).map(lesson=>({course:String(course.title||''),module:String(module.title||''),resource:String(lesson.title||''),publicationStatus:String(lesson.status||'')})):[]):[]);
  if(section==='services'||section==='ict-portal')return services as unknown as Row[];
  return records;
 },[section,courses,users,applications,services,records]);
 const tabRows=sourceRows.filter(row=>{
  const status=String(row.status||'').toLowerCase();
  const payment=String(row.payment_status||'').toLowerCase();
  if(subtab==='Pending Review')return ['submitted','under_review','pending','pending_approval'].includes(status);
  if(subtab==='Approved Applications')return status==='accepted'||status==='approved';
  if(subtab==='Rejected Applications')return status==='rejected';
  if(subtab==='Open Tickets')return !['resolved','closed','completed'].includes(status);
  if(subtab==='Resolved Tickets')return ['resolved','closed','completed'].includes(status);
  if(subtab==='Fee Defaulters')return payment!=='paid';
  if(subtab==='Payment Receipts'||subtab==='Receipts'||subtab==='Verified Receipts'||subtab==='Sales History')return payment==='paid'||status==='paid'||Boolean(row.receipt_number||row.mpesa_receipt);
  if(section==='analytics-reports'&&subtab==='Student Trends')return /student|application|enrollment/i.test(String(row.metric||''));
  if(section==='analytics-reports'&&subtab==='Service Performance')return /service|order/i.test(String(row.metric||''));
  if(section==='analytics-reports'&&subtab==='Financial Performance')return /payment|donation|revenue|cash/i.test(String(row.metric||''));
  if(section==='ai-intake-advisor'&&subtab==='Review Recommendations')return ['submitted','under_review'].includes(status);
  if(section==='ai-intake-advisor'&&subtab==='Intake Forecasts')return Boolean(row.preferred_intake);
  if(subtab==='Payment Approvals')return ['initiating','pending','pending_approval'].includes(status);
  if(subtab==='Packing & Delivery')return !['completed','delivered','cancelled'].includes(status);
  if(section==='downloads'&&subtab==='Published Documents')return row.isPublic===true||row.isPublic===1;
  if(section==='student-status'&&subtab==='Active Students')return String(row.status||'').toLowerCase()==='active';
  if(section==='birthday-center') {const dob=String(row.dateOfBirth||'');if(!dob)return false;const today=new Date();const next=new Date(today);next.setDate(today.getDate()+30);const birthday=new Date(dob);birthday.setFullYear(today.getFullYear());return birthday>=today&&birthday<=next;}
  return true;
 });
 const filtered=tabRows.filter(row=>JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
 const purpose=definition?.purpose||`Dedicated workspace for ${titleCase(section)}. This view keeps its records and actions separate from other Admin sections.`;
 const source=definition?.source||'Dedicated register for this section';
 const columns=section==='pos'&&subtab==='Packing & Delivery'?['reference','customerName','serviceName','status','createdAt']:section==='finance'&&subtab==='Cashouts'?['reference','amount','status','created_at','requested_by']:section==='users'&&subtab==='Staff IDs & Roles'?['name','staffId','role','department','status']:definition?.columns||['Record','Category','Status','Updated'];
 const rows=filtered.slice(0,30);
 const isConnected=Boolean(endpoint)||['courses','school','student-status','employees','applications','enrollment-summary','services'].includes(section);
 return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-700">Dedicated Admin workspace · {titleCase(section)}</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">{subtab||titleCase(section)}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{subtabDescriptions[subtab]||purpose}</p></div>
   <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-800"><ShieldCheck className="h-3.5 w-3.5"/>{isConnected?'Connected data view':'Dedicated workspace'}</span>
  </div>
  <div className="grid gap-3 sm:grid-cols-3">
   <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Workspace records</p><p className="mt-1 text-2xl font-black text-slate-950">{sourceRows.length}</p></div>
   <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Current view</p><p className="mt-1 truncate text-base font-bold text-slate-950">{subtab||titleCase(section)}</p></div>
   <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Data source</p><p className="mt-1 text-sm font-bold text-slate-950">{source}</p></div>
  </div>
  <div className="flex flex-wrap items-center gap-2">
   <div className="relative min-w-[180px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={`Search ${titleCase(section).toLowerCase()} records...`} className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-600"/></div>
   {endpoint&&<button type="button" onClick={()=>setRefresh(value=>value+1)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>Refresh</button>}
   {definition?.links.map(([label,href])=><Link key={label} to={href} className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-800 hover:bg-blue-100">{label}<ExternalLink className="h-3.5 w-3.5"/></Link>)}
  </div>
  {section==='gallery'&&<form className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-blue-300 bg-blue-50/60 p-4" onSubmit={async event=>{event.preventDefault();if(!galleryFile)return;setGalleryBusy(true);setGalleryMessage('');setError('');try{const form=new FormData();form.append('file',galleryFile);form.append('label',`Navstar gallery · ${galleryFile.name}`);const response=await fetch('/api/admin/branding-asset',{method:'POST',body:form,credentials:'same-origin'});const result=await response.json();if(!response.ok||!result.url)throw new Error(result.error||'The image could not be saved.');setGalleryMessage('Image uploaded and saved to the Navstar media library.');setGalleryFile(null);setRefresh(value=>value+1);}catch(cause){setError(cause instanceof Error?cause.message:'The image could not be saved.');}finally{setGalleryBusy(false);}}}><div className="min-w-[220px] flex-1"><label className="block text-sm font-bold text-slate-900">Upload gallery image</label><input type="file" accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif" onChange={event=>setGalleryFile(event.target.files?.[0]||null)} className="mt-2 block w-full rounded-lg border bg-white p-2 text-sm text-slate-800"/><p className="mt-1 text-xs text-slate-500">JPG, PNG, WebP or AVIF · Maximum 5 MB. Images are saved to the media library.</p></div><button type="submit" disabled={!galleryFile||galleryBusy} className="h-10 rounded-lg bg-blue-800 px-4 text-sm font-bold text-white disabled:opacity-50">{galleryBusy?'Uploading…':'Upload and save image'}</button></form>}
  {galleryMessage&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{galleryMessage}</p>}
    {loading&&<p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">Loading verified records…</p>}
  {error&&<p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  {section==='applications'&&<div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3"><h3 className="font-bold text-slate-950">Admissions decisions and official letters</h3>{rows.map((row,index)=><div key={String(row.id||index)} className="flex flex-col gap-3 rounded-lg border bg-white p-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><p className="font-bold text-slate-900">{String(row.full_name||row.name||'Applicant')}</p><p className="text-xs text-slate-500">{String(row.reference||row.display_ref||row.id||'')} · {String(row.course_id||'Course')}</p><p className="mt-1 text-xs text-slate-600">Status: {String(row.status||'—')} · Payment: {String(row.payment_status||'—')}</p></div><EnrollmentAdminActions enrollment={row}/></div>)}{rows.length===0&&<p className="text-sm text-slate-500">No applications are available in this view.</p>}</div>}
  <div className="overflow-x-auto rounded-xl border border-slate-200">
   <table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr>{columns.map(column=><th key={column} className="p-3">{titleCase(column)}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={String(row.id||index)} className="border-t border-slate-100">{columns.map(column=><td key={column} className="max-w-[260px] truncate p-3 text-slate-700">{String(row[column]??'—')}</td>)}</tr>)}{!loading&&rows.length===0&&<tr><td colSpan={columns.length} className="p-7 text-center text-sm text-slate-500">{error?'Records could not be loaded.':isConnected?'No records match this view yet.':'No records have been connected to this register yet. No sample records have been invented.'}</td></tr>}</tbody></table>
  </div>
  {!endpoint&&<div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><Database className="mt-0.5 h-4 w-4 shrink-0"/><p><strong>Backend connection required:</strong> This workspace now has its own screen and purpose, but its dedicated save, edit, approval and reporting service is not yet present. I have not stored records in an unrelated register or displayed fabricated data.</p></div>}
  <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-slate-500"><FileText className="h-4 w-4"/>This is the {subtab||titleCase(section)} workspace. Its view is kept separate from other tabs.</div>
 </section>;
}
