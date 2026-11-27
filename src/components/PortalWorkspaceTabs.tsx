import { useState } from 'react';
import { LearningPage } from '@/pages/LearningPage';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, CircleDollarSign, FileText, GraduationCap, Headphones, ShieldCheck, Users, Wallet } from 'lucide-react';

type Role='student'|'tutor'|'admissions'|'principal'|'finance'|'admin'|'customer';
type Enrollment={id:string;full_name:string;course_id:string;course_title?:string;phone?:string;status:string;payment_status:string;created_at:string;course_fee?:number;admission_fee?:number;amount_paid?:number};
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
  {id:'timetable',label:'Timetable',title:'Teaching timetable',description:'Open your assigned teaching timetable and class schedule.',href:'/learning',icon:CalendarDays},
  {id:'online-classes',label:'Online Classes',title:'Online classes',description:'Open online learning sessions and course activities.',href:'/learning',icon:BookOpen},
  {id:'student-profiles',label:'Student Profiles',title:'Student profiles',description:'View learner information available through your assigned course rosters.',href:'/learning',icon:Users},
  {id:'mark-attendance',label:'Mark Attendance',title:'Mark attendance',description:'Open attendance tools for your assigned classes.',href:'/learning',icon:CalendarDays},
  {id:'student-notes',label:'Student Notes',title:'Student notes',description:'Open learner notes and academic support records.',href:'/learning',icon:FileText},
  {id:'grade-assignments',label:'Grade Assignments',title:'Grade assignments',description:'Review and grade submitted course assignments.',href:'/learning',icon:FileText},
  {id:'results-entry',label:'Results Entry',title:'Results entry',description:'Open the authorised results and assessment workspace.',href:'/learning',icon:GraduationCap},
  {id:'exams',label:'Set Exams',title:'Set examinations',description:'Open examination management for assigned courses.',href:'/learning',icon:FileText},
  {id:'messages',label:'Student Chat & Messages',title:'Student communication',description:'Open the approved communication workspace.',href:'/learning',icon:Headphones},
  {id:'reports',label:'Reports',title:'Teaching reports',description:'Review available teaching and learner progress reports.',href:'/learning',icon:FileText},
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
  {id:'fee-structures',label:'Fee Structures',title:'Fee structures',description:'Review approved student fee structures in the central administration workspace.',href:'/admin',icon:FileText},
  {id:'invoices',label:'Create Invoices',title:'Student invoices',description:'Open the central finance workspace for authorised student billing.',href:'/admin',icon:FileText},
  {id:'scholarships',label:'Discounts & Scholarships',title:'Discounts and scholarships',description:'Review authorised scholarship and fee adjustment records.',href:'/admin',icon:GraduationCap},
  {id:'cash-payments',label:'Cash Payments',title:'Cash payments',description:'Review recorded cash payments in the authorised finance register.',href:'/admin',icon:Wallet},
  {id:'mpesa-payments',label:'M-Pesa Payments',title:'M-Pesa payments',description:'Review verified M-Pesa payments and receipts.',icon:CircleDollarSign},
  {id:'bank-payments',label:'Bank Payments',title:'Bank payments',description:'Review bank payment records in the authorised finance register.',href:'/admin',icon:CircleDollarSign},
  {id:'pending-payments',label:'Pending Payments',title:'Pending payments',description:'Review payment records awaiting confirmation.',href:'/admin',icon:Wallet},
  {id:'paid-students',label:'Paid Students',title:'Paid student accounts',description:'Review fully paid student fee accounts.',href:'/admin',icon:Users},
  {id:'unpaid-students',label:'Unpaid Students',title:'Unpaid student accounts',description:'Review student accounts with outstanding fees.',href:'/admin',icon:Users},
  {id:'defaulters',label:'Defaulters',title:'Fee defaulters',description:'Review overdue fee balances and follow-up records.',href:'/admin',icon:Users},
  {id:'installments',label:'Installment Plans',title:'Installment plans',description:'Review student fee installment arrangements.',href:'/admin',icon:FileText},
  {id:'receipts',label:'Receipts Centre',title:'Receipts centre',description:'Review issued payment receipts and verification records.',href:'/admin',icon:FileText},
  {id:'expenses',label:'Expense Management',title:'Expense management',description:'Open authorised expense records and approvals.',href:'/admin',icon:Wallet},
  {id:'payroll',label:'Payroll & Payslips',title:'Payroll',description:'Open authorised staff payroll and payslip records.',href:'/admin',icon:Users},
  {id:'accounting',label:'Accounting & Statements',title:'Accounting',description:'Review financial statements and accounting reports.',href:'/admin',icon:FileText},
  {id:'banking',label:'Bank Accounts',title:'Bank accounts',description:'Review institution banking and reconciliation records.',href:'/admin',icon:CircleDollarSign},
  {id:'daily-reports',label:'Daily / Monthly / Annual Reports',title:'Financial reports',description:'Open daily, monthly and annual financial reporting.',href:'/admin',icon:FileText},
  {id:'inventory',label:'Inventory',title:'Inventory',description:'Open the central inventory workspace.',href:'/admin',icon:BookOpen},
  {id:'settings',label:'Finance Settings',title:'Finance settings',description:'Finance settings are controlled by authorised administrators.',href:'/admin',icon:CircleDollarSign},
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


const extraTabs:Partial<Record<Role,Tab[]>>={
 student:[
  {id:'academic',label:'Academic Records',title:'Academic records',description:'Open academic records and updates.',href:'/learning',icon:GraduationCap},
  {id:'projects',label:'Projects',title:'Projects',description:'View and submit project work.',href:'/learning',icon:FileText},
  {id:'ai',label:'Navstar AI',title:'Student chat assistant',description:'Open the Navstar learning assistant.',href:'/ai',icon:BookOpen},
  {id:'profile',label:'My Profile',title:'Student profile',description:'Manage personal account details.',href:'/my-account',icon:Users}
 ],
 tutor:[
  {id:'student-profiles',label:'Student Profiles',title:'Student profiles',description:'View learners in assigned course rosters.',href:'/learning',icon:Users},
  {id:'mark-attendance',label:'Mark Attendance',title:'Mark attendance',description:'Open attendance tools for assigned classes.',href:'/learning',icon:CalendarDays},
  {id:'student-notes',label:'Student Notes',title:'Student notes',description:'Open learner notes and support records.',href:'/learning',icon:FileText},
  {id:'upload-notes',label:'Upload Notes',title:'Upload learning materials',description:'Open the tutor learning-material workspace.',href:'/learning',icon:BookOpen},
  {id:'grade-assignments',label:'Grade Assignments',title:'Grade assignments',description:'Review and grade learner submissions.',href:'/learning',icon:FileText},
  {id:'ai-grading',label:'AI Grading',title:'AI grading',description:'Open AI-assisted assessment tools.',href:'/learning',icon:BookOpen},
  {id:'results-entry',label:'Results Entry',title:'Results entry',description:'Open authorised results entry.',href:'/learning',icon:GraduationCap},
  {id:'exams',label:'Set Exams',title:'Set examinations',description:'Open examination management.',href:'/learning',icon:FileText},
  {id:'modules',label:'Course Modules',title:'Course modules',description:'Manage course module content.',href:'/learning',icon:BookOpen},
  {id:'certificates',label:'Cert Recommendation',title:'Certificate recommendations',description:'Review certificate recommendations.',href:'/learning',icon:GraduationCap},
  {id:'cv',label:'My CV Builder',title:'My CV builder',description:'Create and maintain your tutor CV.',href:'/my-account',icon:FileText}
 ],
 finance:[
  {id:'fee-structures',label:'Fee Structures',title:'Fee structures',description:'Review approved student fee structures.',href:'/admin',icon:FileText},
  {id:'invoices',label:'Create Invoices',title:'Student invoices',description:'Open authorised student billing.',href:'/admin',icon:FileText},
  {id:'scholarships',label:'Discounts & Scholarships',title:'Discounts and scholarships',description:'Review scholarships and fee adjustments.',href:'/admin',icon:GraduationCap},
  {id:'cash-payments',label:'Cash Payments',title:'Cash payments',description:'Review recorded cash payments.',href:'/admin',icon:Wallet},
  {id:'mpesa-payments',label:'M-Pesa Payments',title:'M-Pesa payments',description:'Review verified M-Pesa payments.',href:'/admin',icon:CircleDollarSign},
  {id:'bank-payments',label:'Bank Payments',title:'Bank payments',description:'Review bank payment records.',href:'/admin',icon:CircleDollarSign},
  {id:'pending-payments',label:'Pending Payments',title:'Pending payments',description:'Review payments awaiting confirmation.',href:'/admin',icon:Wallet},
  {id:'paid-students',label:'Paid Students',title:'Paid student accounts',description:'Review fully paid student fee accounts.',href:'/admin',icon:Users},
  {id:'unpaid-students',label:'Unpaid Students',title:'Unpaid student accounts',description:'Review student accounts with balances.',href:'/admin',icon:Users},
  {id:'defaulters',label:'Defaulters',title:'Fee defaulters',description:'Review overdue fee balances.',href:'/admin',icon:Users},
  {id:'installments',label:'Installment Plans',title:'Installment plans',description:'Review student fee instalments.',href:'/admin',icon:FileText},
  {id:'receipts',label:'All Receipts',title:'Receipts centre',description:'Review issued payment receipts.',href:'/admin',icon:FileText},
  {id:'generate-receipt',label:'Generate Receipt',title:'Generate receipt',description:'Open the authorised receipt workflow.',href:'/admin',icon:FileText},
  {id:'verify-receipt',label:'Receipt Verification',title:'Receipt verification',description:'Verify issued receipts.',href:'/admin',icon:ShieldCheck},
  {id:'documents',label:'Fee Documents',title:'Fee documents',description:'Open published fee documents.',href:'/admin',icon:FileText},
  {id:'expenses',label:'All Expenses',title:'Expense management',description:'Review authorised expense records.',href:'/admin',icon:Wallet},
  {id:'add-expense',label:'Add Expense',title:'Add expense',description:'Open the authorised expense-entry workflow.',href:'/admin',icon:Wallet},
  {id:'approve-expense',label:'Approve Expenses',title:'Approve expenses',description:'Review expenses awaiting approval.',href:'/admin',icon:CheckCircle2},
  {id:'payslips',label:'Payslips',title:'Payslips',description:'Review authorised staff payslips.',href:'/admin',icon:FileText},
  {id:'deductions',label:'Deductions',title:'Payroll deductions',description:'Review payroll deductions.',href:'/admin',icon:FileText},
  {id:'income-stmt',label:'Income Statement',title:'Income statement',description:'Open financial statements.',href:'/admin',icon:FileText},
  {id:'balance',label:'Balance Sheet',title:'Balance sheet',description:'Open financial statements.',href:'/admin',icon:FileText},
  {id:'cashflow',label:'Cash Flow',title:'Cash flow',description:'Open financial statements.',href:'/admin',icon:FileText},
  {id:'banking',label:'Bank Accounts',title:'Bank accounts',description:'Review institution banking records.',href:'/admin',icon:CircleDollarSign},
  {id:'reconcile',label:'Reconciliation',title:'Payment reconciliation',description:'Compare provider receipts with internal records.',href:'/admin',icon:CircleDollarSign},
  {id:'daily-reports',label:'Daily Revenue',title:'Daily revenue',description:'Open daily financial reporting.',href:'/admin',icon:FileText},
  {id:'monthly-reports',label:'Monthly Revenue',title:'Monthly revenue',description:'Open monthly financial reporting.',href:'/admin',icon:FileText},
  {id:'annual-reports',label:'Annual Revenue',title:'Annual revenue',description:'Open annual financial reporting.',href:'/admin',icon:FileText},
  {id:'profit-loss',label:'Profit & Loss',title:'Profit and loss',description:'Open financial reporting.',href:'/admin',icon:FileText},
  {id:'inventory',label:'Inventory',title:'Inventory',description:'Open the central inventory workspace.',href:'/admin',icon:BookOpen},
  {id:'settings',label:'Settings',title:'Finance settings',description:'Settings are controlled by authorised administrators.',href:'/admin',icon:CircleDollarSign}
 ]
};
type NavGroup={id:string;label:string;items:string[]};
const navGroups:Partial<Record<Role,NavGroup[]>>={
 student:[
  {id:'home',label:'Home',items:['overview','applications','notifications']},
  {id:'academics',label:'Academics',items:['academic','courses']},
  {id:'assignments',label:'Assignments',items:['assignments','projects']},
  {id:'finance',label:'Finance',items:['fees']},
  {id:'chat',label:'Chat',items:['support','ai']},
  {id:'settings',label:'Settings',items:['profile']}
 ],
 tutor:[
  {id:'dashboard',label:'Dashboard',items:['overview']},
  {id:'classes',label:'Class Management',items:['classes','timetable','online-classes']},
  {id:'students',label:'Students',items:['student-profiles','mark-attendance','attendance','student-notes']},
  {id:'materials',label:'Learning Materials',items:['upload-notes','resources']},
  {id:'assessments',label:'Assessments',items:['assignments','grade-assignments','ai-grading','results-entry','exams']},
  {id:'modules',label:'Course Modules',items:['modules']},
  {id:'communication',label:'Communication',items:['messages']},
  {id:'certificates',label:'Cert Recommendation',items:['certificates']},
  {id:'cv',label:'My CV Builder',items:['cv']},
  {id:'reports',label:'Reports',items:['reports']}
 ],
 finance:[
  {id:'dashboard',label:'Dashboard',items:['overview']},
  {id:'billing',label:'Student Billing',items:['fee-structures','invoices','scholarships']},
  {id:'payments',label:'Payments',items:['payments','cashouts','cash-payments','mpesa-payments','bank-payments','pending-payments']},
  {id:'fees',label:'Fee Tracking',items:['fees','paid-students','unpaid-students','defaulters','installments']},
  {id:'receipts',label:'Receipts Center',items:['receipts','generate-receipt','verify-receipt']},
  {id:'documents',label:'Fee Documents',items:['documents']},
  {id:'expenses',label:'Expense Management',items:['expenses','add-expense','approve-expense']},
  {id:'payroll',label:'Payroll',items:['payroll','payslips','deductions']},
  {id:'accounting',label:'Accounting',items:['accounting','income-stmt','balance','cashflow']},
  {id:'banking',label:'Banking',items:['banking','reconcile']},
  {id:'reports',label:'Reports & Analytics',items:['reports','daily-reports','monthly-reports','annual-reports','profit-loss']},
  {id:'inventory',label:'Inventory',items:['inventory']},
  {id:'settings',label:'Settings',items:['settings']}
 ]
};

export function PortalWorkspaceTabs({role,name,enrollments,overview,payments,cashouts,onPay,payingId=''}:Props){
 const [active,setActive]=useState('overview');
 const tabs=[...(tabSets[role]||tabSets.student),...(extraTabs[role]||[])];
 const groups=(navGroups[role]||tabs.map(tab=>({id:tab.id,label:tab.label,items:[tab.id]}))).slice();
 if(role==='tutor'||role==='finance')groups.sort((a,b)=>a.id==='dashboard'?-1:b.id==='dashboard'?1:a.label.localeCompare(b.label));
 const current=tabs.find(tab=>tab.id===active)||tabs[0];
 const currentGroup=groups.find(group=>group.items.includes(active))||groups[0];
 const visibleGroupTabs=(currentGroup?.items||[]).map(id=>tabs.find(tab=>tab.id===id)).filter((tab):tab is Tab=>Boolean(tab)).sort((a,b)=>a.label.localeCompare(b.label));
 const embeddedLearning=(role==='tutor'&&['classes','resources','assignments','progress'].includes(active))||(role==='student'&&['courses','assignments'].includes(active));
 const accentByRole:Record<Role,string>={student:'bg-blue-800',tutor:'bg-blue-800',admissions:'bg-blue-800',principal:'bg-blue-800',finance:'bg-blue-800',admin:'bg-blue-800',customer:'bg-blue-800'};
 const activeAccent=accentByRole[role]||'bg-blue-800';
 const myEnrollments=enrollments;
 const unpaid=myEnrollments.filter(item=>item.payment_status!=='paid');
 const applications=myEnrollments;
 const metricRows: Array<[string,string|number]> = role==='student'
  ? [['My applications',applications.length],['Awaiting payment',unpaid.length],['Approved courses',applications.filter(item=>item.status==='accepted').length],['Paid enrolments',applications.filter(item=>item.payment_status==='paid').length]]
  : role==='finance'
   ? [['Verified payments',payments.length],['Cashout requests',cashouts.length],['Verified collections',`KSh ${(overview?.verifiedPayments||0).toLocaleString()}`],['Verified donations',`KSh ${(overview?.verifiedDonations||0).toLocaleString()}`]]
   : [['Students',overview?.students??'—'],['Applications',overview?.applications??'—'],['Active courses',overview?.courses??'—'],['Verified payments',`KSh ${(overview?.verifiedPayments||0).toLocaleString()}`]];
 return <section className="w-full min-w-0 space-y-5">
  <div className="sticky top-0 z-30 space-y-2 rounded-2xl border border-blue-100 bg-white/95 p-2 shadow-lg backdrop-blur-xl">
   <nav aria-label={role+' portal categories'} className="flex w-full gap-1.5 overflow-x-auto">
    {groups.map(group=><button key={group.id} type="button" onClick={()=>setActive(group.items[0])} aria-current={currentGroup?.id===group.id?'page':undefined} className={'shrink-0 rounded-xl px-3 py-2.5 text-xs font-extrabold transition sm:text-sm '+(currentGroup?.id===group.id?activeAccent+' text-white shadow-md':'text-slate-600 hover:bg-slate-50')}>{group.label}</button>)}
   </nav>
   {visibleGroupTabs.length>1&&<nav aria-label={(currentGroup?.label||role)+' sections'} className="flex w-full gap-1.5 overflow-x-auto border-t border-slate-100 pt-2">
    {visibleGroupTabs.map(tab=>{const Icon=tab.icon;return <button key={tab.id} type="button" onClick={()=>setActive(tab.id)} aria-current={active===tab.id?'page':undefined} className={'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition '+(active===tab.id?'bg-blue-50 text-blue-900 ring-1 ring-blue-100':'text-slate-500 hover:bg-slate-50 hover:text-slate-900')}><Icon className="h-3.5 w-3.5"/>{tab.label}</button>;})}
   </nav>}
  </div>
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
   <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-800">{role} portal · {name}</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">{current.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{current.description}</p></div>{current.href&&!embeddedLearning&&<Link to={current.href} className={"inline-flex items-center gap-2 rounded-lg " + activeAccent + " px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"}>Open workspace <ArrowRight className="h-4 w-4"/></Link>}</div>
   {embeddedLearning&&<div className="mt-5 min-w-0"><LearningPage section={active}/></div>}
   {active==='overview'&&<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricRows.map(([label,value])=><div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>)}</div>}
   {active==='fees'&&role==='student'&&<div className="mt-5 space-y-3">{unpaid.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><p className="font-bold text-slate-950">{item.course_title||item.course_id}</p><p className="mt-1 text-xs text-slate-500">Application {item.id} · {item.payment_status}</p><p className="mt-2 text-xs text-slate-600">Paid: <strong>KSh {Number(item.amount_paid||0).toLocaleString('en-KE')}</strong> · Balance: <strong>KSh {Math.max(0,Number(item.course_fee||0)-Number(item.amount_paid||0)).toLocaleString('en-KE')}</strong></p></div><button type="button" onClick={()=>onPay?.(item)} disabled={!onPay||payingId===item.id} className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-bold text-white hover:bg-blue-900 disabled:opacity-60">{payingId===item.id?'Sending prompt…':'Pay fees · M-Pesa'}</button></div>)}{unpaid.length===0&&<p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">No unpaid enrolments are listed for this account.</p>}</div>}
   {active==='applications'&&<div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Applicant</th><th className="p-3">Course</th><th className="p-3">Application</th><th className="p-3">Payment</th></tr></thead><tbody>{applications.map(item=><tr key={item.id} className="border-t"><td className="p-3 font-semibold">{item.full_name}</td><td className="p-3">{item.course_id}</td><td className="p-3">{item.status}</td><td className="p-3">{item.payment_status}</td></tr>)}{applications.length===0&&<tr><td colSpan={4} className="p-5 text-center text-slate-500">No application records are available for this account.</td></tr>}</tbody></table></div>}
   {active==='review'&&role==='admissions'&&<div className="mt-5 space-y-2">{enrollments.filter(item=>['submitted','under_review'].includes(item.status)).map(item=><div key={item.id} className="rounded-lg border p-3"><p className="font-semibold">{item.full_name}</p><p className="text-xs text-slate-500">{item.course_id} · {item.status}</p></div>)}{enrollments.filter(item=>['submitted','under_review'].includes(item.status)).length===0&&<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No applications are awaiting review in the records available to this portal.</p>}</div>}
   {active==='admissions'&&role==='principal'&&<div className="mt-5 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Applicant</th><th className="p-3">Course</th><th className="p-3">Status</th><th className="p-3">Payment</th></tr></thead><tbody>{enrollments.map(item=><tr key={item.id} className="border-t"><td className="p-3 font-semibold">{item.full_name}</td><td className="p-3">{item.course_id}</td><td className="p-3">{item.status}</td><td className="p-3">{item.payment_status}</td></tr>)}{enrollments.length===0&&<tr><td colSpan={4} className="p-5 text-center text-slate-500">No admissions records are available.</td></tr>}</tbody></table></div>}
   {active==='finance'&&role==='principal'&&<div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs text-emerald-800">Verified payments</p><p className="mt-1 text-2xl font-black text-emerald-950">KSh ${(overview?.verifiedPayments||0).toLocaleString()}</p></div><div className="rounded-xl bg-blue-50 p-4"><p className="text-xs text-blue-800">Verified donations</p><p className="mt-1 text-2xl font-black text-blue-950">KSh ${(overview?.verifiedDonations||0).toLocaleString()}</p></div></div>}
   {active==='payments'&&role==='finance'&&<div className="mt-5 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Payer</th><th className="p-3">Purpose</th><th className="p-3">Receipt</th><th className="p-3">Amount</th><th className="p-3">Date</th></tr></thead><tbody>{payments.map(item=><tr key={item.id} className="border-t"><td className="p-3">{item.payer_name}</td><td className="p-3">{item.description}</td><td className="p-3">{item.receipt_number||item.mpesa_receipt||'—'}</td><td className="p-3 font-bold">KSh {Number(item.amount).toLocaleString()}</td><td className="p-3">{item.updated_at}</td></tr>)}{payments.length===0&&<tr><td colSpan={5} className="p-5 text-center text-slate-500">No verified payments available.</td></tr>}</tbody></table></div>}
   {active==='cashouts'&&role==='finance'&&<div className="mt-5 space-y-2">{cashouts.map(item=><div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3"><div><p className="font-bold">{item.reference}</p><p className="text-xs text-slate-500">{item.requested_by} · {item.status}</p></div><strong>KSh {Number(item.amount).toLocaleString()}</strong></div>)}{cashouts.length===0&&<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No cashout requests available.</p>}</div>}
   {!embeddedLearning&&active!=='overview'&&active!=='fees'&&active!=='applications'&&active!=='review'&&active!=='payments'&&active!=='cashouts'&&<div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4"><p className="text-sm font-semibold text-blue-950">{current.title}</p><p className="mt-1 text-sm leading-6 text-blue-900">{current.description}</p>{current.href&&<Link to={current.href} className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-blue-800 underline">Continue to connected Navstar workspace <ArrowRight className="h-4 w-4"/></Link>}</div>}
  </div>
 </section>;
}
