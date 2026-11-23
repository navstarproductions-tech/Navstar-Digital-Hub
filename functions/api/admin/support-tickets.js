import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Support desk is not configured.',503);
 const access=await requireRole(request,env,['admin','principal','admissions','finance','tutor']);if(access.response)return access.response;
 const rows=await env.DB.prepare('SELECT t.*,t.ticket_number AS ticketNumber,t.requester_type AS requesterType,t.requester_user_id AS requesterUserId,t.customer_id AS customerId,t.requester_name AS requesterName,t.requester_email AS requesterEmail,t.admin_response AS adminResponse,t.assigned_to AS assignedTo,t.created_at AS createdAt,t.updated_at AS updatedAt,t.resolved_at AS resolvedAt,u.name AS assigneeName FROM support_tickets t LEFT JOIN users u ON u.id=t.assigned_to ORDER BY CASE t.priority WHEN \'high\' THEN 0 WHEN \'normal\' THEN 1 ELSE 2 END,CASE t.status WHEN \'open\' THEN 0 WHEN \'in_progress\' THEN 1 ELSE 2 END,t.created_at DESC LIMIT 500').all();
 return json({tickets:rows.results||[]});
}
export async function onRequestPatch({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Support desk is not configured.',503);
 const access=await requireRole(request,env,['admin','principal','admissions','finance','tutor']);if(access.response)return access.response;
 let body;try{body=await readJson(request,12000)}catch{return error('Invalid support ticket update.');}
 const id=safeString(body.id,80),status=safeString(body.status,20),adminResponse=safeString(body.adminResponse,5000),assignedTo=safeString(body.assignedTo,80);
 if(!id||!['open','in_progress','resolved','closed'].includes(status))return error('Choose a valid ticket status.');
 if(assignedTo){const assignee=await env.DB.prepare("SELECT id FROM users WHERE id=? AND status='active' AND role IN ('admin','principal','admissions','finance','tutor')").bind(assignedTo).first();if(!assignee)return error('The selected assignee is not an active staff account.');}
 const ticket=await env.DB.prepare('SELECT id,requester_user_id AS requesterUserId,ticket_number AS ticketNumber,subject FROM support_tickets WHERE id=?').bind(id).first();
 if(!ticket)return error('Support ticket not found.',404);
 await env.DB.batch([
  env.DB.prepare("UPDATE support_tickets SET status=?,admin_response=?,assigned_to=?,updated_at=CURRENT_TIMESTAMP,resolved_at=CASE WHEN ? IN ('resolved','closed') THEN COALESCE(resolved_at,CURRENT_TIMESTAMP) ELSE NULL END WHERE id=?").bind(status,adminResponse,assignedTo||null,status,id),
  env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'support_ticket_updated','support_ticket',id),
  ...(ticket.requesterUserId?[env.DB.prepare('INSERT INTO notifications(id,user_id,title,message) VALUES(?,?,?,?)').bind(uuid(),ticket.requesterUserId,'Support ticket update',ticket.ticketNumber+' · '+ticket.subject+' is now '+status+'. '+(adminResponse||''))]:[])
 ]);
 return json({saved:true,status});
}
