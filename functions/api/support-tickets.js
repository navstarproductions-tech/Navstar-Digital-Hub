import { getSession } from '../_shared/auth.js';
import { getCustomerSession } from '../_shared/customer-auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../_shared/http.js';

async function requester(request,env){
 const user=await getSession(request,env);
 if(user?.role==='student')return {type:'student',user,customer:null,name:user.name,email:user.email};
 const customer=await getCustomerSession(request,env);
 if(customer)return {type:'customer',user:null,customer,name:customer.fullName,email:customer.email};
 return null;
}
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Support desk is not configured.',503);
 const access=await requester(request,env);if(!access)return error('Sign in to view your support tickets.',401);
 const rows=access.type==='student'
  ?await env.DB.prepare('SELECT id,ticket_number AS ticketNumber,subject,category,priority,description,status,admin_response AS adminResponse,created_at AS createdAt,updated_at AS updatedAt,resolved_at AS resolvedAt FROM support_tickets WHERE requester_user_id=? ORDER BY created_at DESC LIMIT 100').bind(access.user.id).all()
  :await env.DB.prepare('SELECT id,ticket_number AS ticketNumber,subject,category,priority,description,status,admin_response AS adminResponse,created_at AS createdAt,updated_at AS updatedAt,resolved_at AS resolvedAt FROM support_tickets WHERE customer_id=? ORDER BY created_at DESC LIMIT 100').bind(access.customer.id).all();
 return json({tickets:rows.results||[]});
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Support desk is not configured.',503);
 const access=await requester(request,env);if(!access)return error('Sign in before submitting a support ticket.',401);
 let body;try{body=await readJson(request,12000)}catch{return error('Invalid support request.');}
 const subject=safeString(body.subject,180),category=safeString(body.category,50)||'general',priority=safeString(body.priority,20)||'normal',description=safeString(body.description,8000);
 if(subject.length<4||description.length<10||!['low','normal','high'].includes(priority))return error('Enter a clear subject, description of at least 10 characters and a valid priority.');
 const id=uuid(),ticketNumber='NDH-TKT-'+id.slice(-8).toUpperCase();
 const statements=[env.DB.prepare('INSERT INTO support_tickets(id,ticket_number,requester_type,requester_user_id,customer_id,requester_name,requester_email,subject,category,priority,description) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  .bind(id,ticketNumber,access.type,access.user?.id||null,access.customer?.id||null,access.name,access.email,subject,category,priority,description)];
 const admins=await env.DB.prepare("SELECT id FROM users WHERE status='active' AND role IN ('admin','principal')").all();
 for(const admin of admins.results||[])statements.push(env.DB.prepare('INSERT INTO notifications(id,user_id,title,message) VALUES(?,?,?,?)').bind(uuid(),admin.id,'New '+access.type+' support ticket',ticketNumber+' · '+subject+' · '+access.name));
 await env.DB.batch(statements);
 return json({submitted:true,ticketNumber,message:'Your support ticket has been submitted. Keep the ticket number for follow-up.'},201);
}
