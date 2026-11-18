import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, CircleDollarSign, FileText, GraduationCap, Headphones, Users, Wallet } from 'lucide-react';

type Role='student'|'tutor'|'admissions'|'principal'|'finance'|'admin'|'customer';
type Enrollment={id:string;full_name:string;course_id:string;phone?:string;status:string;payment_status:string;created_at:string};
type Overview={students:number;applications:number;verifiedPayments:number;verifiedDonations:number;courses:number;services:number};
type Payment={id:string;purpose:string;receipt_number?:string;mpesa_receipt?:string;amount:number;payer_name:string;description:string;status:string;updated_at:string};
type Cashout={id:string;reference:string;amount:number;status:string;created_at:string;requested_by:string};
type Props={role:Role;name:string;enrollments:Enrollment[];overview:Overview|null;payments:Payment[];cashouts:Cashout[];onPay?:(item:Enrollment)=>void;payingId?:string};
type Tab={id:string;label:string;title:string;description:string;href?:string;icon:typeof BookOpen};
const tabSets:Record<Role,Tab[]> = {
 student:[
  {id:'overview',label:'Overview',title:'My student dashboard',description:'Your learning, applications and fee activity in one place.',icon:GraduationCap},
  {id:'courses',label:'My Courses',title:'Enrolled courses and learning',description:'Open your approved courses, modules, lessons and learning resources.',href:'/learning',icon:BookOpen},
  {id:'assignments',label:'Assignments',title:'Assignments and assessments',description:'View published assignments, submit your work and track feedback.',href:'/learning',icon:FileText},
  {id:'fees',label:'Fees & Payments',title:'My fee account',description:'Review your application fee status and request an M-Pesa prompt for an unpaid enrolment.',icon:Wallet},
  {id:'applications',label:'Applications',title:'My applications',description:'Track your course applications and Admissions decisions.',icon:FileText},
  {id:'support',label:'Student support',title:'Help and support',description:'Contact Navstar for account, course and payment assistance.',href:'/services',icon:Headphones},
 ],
 tutor:[
  {id:'overview',label:'Overview',title:'Tutor dashboard',description:'Your teaching workspace and assigned course activity.',icon:GraduationCap},
  {id:'classes',label:'My Classes',title:'Assigned classes',description:'Open course rosters and course content assigned to your tutor account.',href:'/learning',icon:Users},
  {id:'resources',label:'Learning Materials',title:'Modules and learning materials',description:'Review published modules, lessons and teaching resources.',href:'/learning',icon:BookOpen},
  {id:'assignments',label:'Assignments',title:'Assignments and submissions',description:'Review course assignments and learner submissions available to your account.',href:'/learning',icon:FileText},
  {id:'attendance',label:'Attendance',title:'Class attendance',description:'Attendance tools are available here when the attendance register is connected to your assigned classes.',icon:CalendarDays},
  {id:'progress',label:'Student Progress',title:'Learner progress',description:'Review course progress and assessment activity from your assigned learning workspace.',href:'/learning',icon:GraduationCap},
  {id:'profile',label:'My Profile',title:'Tutor profile',description:'Update your account and contact information.',href:'/my-account',icon:Users},
 ],
 admissions:[
  {id:'overview',label:'Overview',title:'Admissions dashboard',description:'Review application activity and admissions workload.',icon:GraduationCap},
  {id:'applications',label:'Applications',title:'All applications',description:'Review submitted applications and current admission statuses.',icon:FileText},
  {id:'review',label:'Pending Review',title:'Applications awaiting review',description:'Focus on applications submitted or awaiting an Admissions decision.',icon:Users},
  {id:'intakes',label:'Courses & Intakes',title:'Course catalogue and intakes',description:'Check active course information and direct applicants to the right programme.',href:'/courses',icon:BookOpen},
  {id:'letters',label:'Letters & Documents',title:'Admission documents',description:'Prepare approved offer, admission and acceptance documents through the authorised document workflow.',href:'/admin',icon:FileText},
  {id:'enquiries',label:'Enquiries & Support',title:'Applicant enquiries',description:'Respond to applicant questions and direct them to the correct service.',href:'/services',icon:Headphones},
 ],
 principal:[
  {id:'overview',label:'Overview',title:'Institution overview',description:'Review high-level academic and operational activity.',icon:GraduationCap},
  {id:'academics',label:'Academics',title:'Academic programmes',description:'Review active courses, learning content and academic delivery.',href:'/courses',icon:BookOpen},
  {id:'staff',label:'Staff',title:'Staff coordination',description:'Review staff accounts and role assignments through authorised Admin records.',href:'/admin',icon:Users},
  {id:'admissions',label:'Admissions',title:'Admissions overview',description:'Monitor applications and admission progress.',icon:FileText},
  {id:'finance',label:'Finance Summary',title:'Verified finance summary',description:'View verified payments and donation totals. Pending prompts are not counted as income.',icon:CircleDollarSign},
  {id:'reports',label:'Reports',title:'Institutional reports',description:'Review available operational and academic summaries.',href:'/admin',icon:FileText},
 ],
 finance:[
  {id:'overview',label:'Overview',title:'Finance dashboard',description:'Verified collections, donations, payment records and cashout workload.',icon:Wallet},
  {id:'payments',label:'Payments',title:'Verified payment register',description:'Review confirmed payment transactions and receipts.',icon:CircleDollarSign},
  {id:'cashouts',label:'Cashouts',title:'Cashout requests',description:'Review cashout requests and their approval status.',icon:Wallet},
  {id:'fees',label:'Fee Accounts',title:'Student fee accounts',description:'Review fee collection and balances using the authorised finance register.',icon:FileText},
  {id:'reports',label:'Financial Reports',title:'Finance reports',description:'Use verified payment and cashout records for reporting.',icon:FileText},
  {id:'reconciliation',label:'Reconciliation',title:'Payment reconciliation',description:'Compare verified provider receipts against internal payment records.',icon:CircleDollarSign},
 ],
 admin:[
  {id:'overview',label:'Overview',title:'Admin dashboard',description:'Open the full Navstar administration workspace.',href:'/admin',icon:GraduationCap},
  {id:'users',label:'Users & Staff',title:'User and staff management',description:'Manage authorised accounts, roles and student records.',href:'/admin',icon:Users},
  {id:'courses',label:'Courses & Learning',title:'Courses and learning management',description:'Manage course catalogues, modules, lessons and assignments.',href:'/admin',icon:BookOpen},
  {id:'finance',label:'Finance',title:'Finance administration',description:'Manage verified payments, fees and reports.',href:'/admin',icon:CircleDollarSign},
  {id:'documents',label:'Documents',title:'Documents and downloads',description:'Publish approved institutional documents.',href:'/admin',icon:FileText},
 ],
 customer:[
  {id:'overview',label:'Overview',title:'Customer service desk',description:'Browse services and request support.',href:'/services',icon:Headphones},
  {id:'services',label:'Services',title:'Navstar services',description:'Browse available digital and cyber services.',href:'/services',icon:BookOpen},
  {id:'orders',label:'My Orders',title:'Service requests',description:'Review service requests linked to your customer account.',href:'/services',icon:FileText},
  {id:'profile',label:'My Account',title:'Customer profile',description:'Manage your account details.',href:'/my-account',icon:Users},
 ],
};

export function PortalWorkspaceTabs({role,name,enrollments,overview,payments,cashouts,onPay,payingId=''}:Props){
 const [active,setActive]=useState('overview');
 const tabs=tabSets[role]||tabSets.student;
 const current=tabs.find(tab=>tab.id===active)||tabs[0];
 const myEnrollments=enrollments;
 const unpaid=myEnrollments.filter(item=>item.payment_status!=='paid');
 const applications=role==='student'?myEnrollments:myEnrollments;
 return <section className="space-y-5">
  <nav aria-label={`${role} portal sections`} className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
   {tabs.map(tab=>{const Icon=tab.icon;return <button key={tab.id} type="button" onClick={()=>setActive(tab.id)} aria-current={active===tab.id?'page':undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition sm:text-sm ${active===tab.id?'bg-blue-800 text-white shadow-md':'text-slate-600 hover:bg-blue-50 hover:text-blue-800'}`}><Icon className="h-4 w-4"/>{tab.label}</button>;})}
  </nav>
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
   <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-700">{role} portal · {name}</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">{current.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{current.description}</p></div>{current.href&&<Link to={current.href} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-900">Open workspace <ArrowRight className="h-4 w-4"/></Link>}</div>
   {active==='overview'&&<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {role==='student'?[[ 'My applications',applications.length ],['Awaiting payment',unpaid.length],['Approved courses',applications.filter(item=>item.status==='accepted').length],['Paid enrolments',applications.filter(item=>item.payment_status==='paid').length]]:role==='finance'?[[ 'Verified payments',payments.length ],['Cashout requests',cashouts.length],['Verified collections',`KSh ${(overview?.verifiedPayments||0).toLocaleString()}`],['Verified donations',`KSh ${(overview?.verifiedDonations||0).toLocaleString()}`]]:[[ 'Students',overview?.students??'—'],['Applications',overview?.applications??'—'],['Active courses',overview?.courses??'—'],['Verified payments',`KSh ${(overview?.verifiedPayments||0).toLocaleString()}`]].map(([label,value])=><div key={String(label)} className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>)}
   </div>}
   {active==='fees'&&role==='student'&&<div className="mt-5 space-y-3">{unpaid.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><p className="font-bold text-slate-950">{item.course_id}</p><p className="mt-1 text-xs text-slate-500">Application {item.id} · {item.payment_status}</p></div><button type="button" onClick={()=>onPay?.(item)} disabled={!onPay||payingId===item.id} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{payingId===item.id?'Sending prompt…':'Pay fees · M-Pesa'}</button></div>)}{unpaid.length===0&&<p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">No unpaid enrolments are listed for this account.</p>}</div>}
   {active==='applications'&&<div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Applicant</th><th className="p-3">Course</th><th className="p-3">Application</th><th className="p-3">Payment</th></tr></thead><tbody>{applications.map(item=><tr key={item.id} className="border-t"><td className="p-3 font-semibold">{item.full_name}</td><td className="p-3">{item.course_id}</td><td className="p-3">{item.status}</td><td className="p-3">{item.payment_status}</td></tr>)}{applications.length===0&&<tr><td colSpan={4} className="p-5 text-center text-slate-500">No application records are available for this account.</td></tr>}</tbody></table></div>}
   {active==='review'&&role==='admissions'&&<div className="mt-5 space-y-2">{enrollments.filter(item=>['submitted','under_review'].includes(item.status)).map(item=><div key={item.id} className="rounded-lg border p-3"><p className="font-semibold">{item.full_name}</p><p className="text-xs text-slate-500">{item.course_id} · {item.status}</p></div>)}{enrollments.filter(item=>['submitted','under_review'].includes(item.status)).length===0&&<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No applications are awaiting review in the records available to this portal.</p>}</div>}
   {active==='payments'&&role==='finance'&&<div className="mt-5 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Payer</th><th className="p-3">Purpose</th><th className="p-3">Receipt</th><th className="p-3">Amount</th><th className="p-3">Date</th></tr></thead><tbody>{payments.map(item=><tr key={item.id} className="border-t"><td className="p-3">{item.payer_name}</td><td className="p-3">{item.description}</td><td className="p-3">{item.receipt_number||item.mpesa_receipt||'—'}</td><td className="p-3 font-bold">KSh {Number(item.amount).toLocaleString()}</td><td className="p-3">{item.updated_at}</td></tr>)}{payments.length===0&&<tr><td colSpan={5} className="p-5 text-center text-slate-500">No verified payments available.</td></tr>}</tbody></table></div>}
   {active==='cashouts'&&role==='finance'&&<div className="mt-5 space-y-2">{cashouts.map(item=><div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3"><div><p className="font-bold">{item.reference}</p><p className="text-xs text-slate-500">{item.requested_by} · {item.status}</p></div><strong>KSh {Number(item.amount).toLocaleString()}</strong></div>)}{cashouts.length===0&&<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No cashout requests available.</p>}</div>}
   {active!=='overview'&&active!=='fees'&&active!=='applications'&&active!=='review'&&active!=='payments'&&active!=='cashouts'&&<div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4"><p className="text-sm font-semibold text-blue-950">{current.title}</p><p className="mt-1 text-sm leading-6 text-blue-900">{current.description}</p>{current.href&&<Link to={current.href} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-blue-800 underline">Continue to connected Navstar workspace <ArrowRight className="h-4 w-4"/></Link>}</div>}
  </div>
 </section>;
}
