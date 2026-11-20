import { getSession } from '../../_shared/auth.js';
import { error, json } from '../../_shared/http.js';

export async function onRequestGet({request,env}){
 if(!env.DB)return error('Student statement service is not configured.',503);
 const user=await getSession(request,env);
 if(!user)return error('Sign in to download your fee statement.',401);
 if(user.role!=='student'&&!['admin','finance','principal','admissions'].includes(user.role))return error('This account cannot access fee statements.',403);
 const url=new URL(request.url),requestedEmail=url.searchParams.get('email')||'';
 if(user.role==='student'&&requestedEmail&&requestedEmail.toLowerCase()!==user.email.toLowerCase())return error('You can only download your own fee statement.',403);
 const email=user.role==='student'?user.email:requestedEmail;
 if(!email)return error('A student email is required.',400);
 const enrollments=(await env.DB.prepare("SELECT e.id,e.display_ref,e.admission_number,e.preferred_intake,e.status,e.full_name,c.title AS course_title,CASE WHEN EXISTS(SELECT 1 FROM enrollment_fee_items sf WHERE sf.enrollment_id=e.id) THEN (SELECT COALESCE(SUM(sf.amount),0) FROM enrollment_fee_items sf WHERE sf.enrollment_id=e.id) ELSE c.price END AS course_fee,COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.purpose='enrollment' AND p.reference_id=e.id AND p.status='paid'),0) AS amount_paid FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE lower(e.email)=lower(?) ORDER BY e.created_at").bind(email).all()).results||[];
 if(!enrollments.length)return json({statement:{studentName:user.name,email,enrollments:[],payments:[],totals:{billed:0,paid:0,balance:0}}});
 const payments=(await env.DB.prepare("SELECT p.id,p.amount,p.status,p.phone,p.receipt_number AS mpesa_receipt,p.internal_receipt_number AS navstar_receipt,p.display_reference,p.transaction_date,p.created_at,e.display_ref,e.admission_number,c.title AS course_title FROM payments p JOIN enrollments e ON p.purpose='enrollment' AND e.id=p.reference_id JOIN courses c ON c.id=e.course_id WHERE lower(e.email)=lower(?) ORDER BY COALESCE(p.transaction_date,p.created_at),p.created_at").bind(email).all()).results||[];
 const billed=enrollments.reduce((n,e)=>n+Number(e.course_fee||0),0),paid=enrollments.reduce((n,e)=>n+Number(e.amount_paid||0),0);
 return json({statement:{studentName:enrollments[0].full_name||user.name,email,enrollments,payments,totals:{billed,paid,balance:Math.max(0,billed-paid)}}});
}
