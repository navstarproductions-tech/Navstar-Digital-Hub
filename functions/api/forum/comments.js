import { getCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Community service is not configured.',503);
 const url=new URL(request.url),postId=safeString(url.searchParams.get('postId'),80);
 if(!postId)return error('Post reference is required.');
 const result=await env.DB.prepare("SELECT c.id,c.body,c.created_at AS createdAt,a.full_name AS author FROM forum_comments c JOIN customer_accounts a ON a.id=c.customer_id WHERE c.post_id=? AND c.status='published' AND c.moderation_status='approved' ORDER BY c.created_at ASC LIMIT 100").bind(postId).all();
 return json({comments:result.results||[]});
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 const customer=await getCustomerSession(request,env);if(!customer)return error('Sign in to comment.',401);
 let body;try{body=await readJson(request,6000)}catch{return error('Invalid comment.')}
 const postId=safeString(body.postId,80),content=safeString(body.body,2000);
 if(content.length<2)return error('Write a comment before submitting.');
 const post=await env.DB.prepare("SELECT id FROM forum_posts WHERE id=? AND status='published' AND moderation_status='approved'").bind(postId).first();if(!post)return error('This discussion is unavailable.',404);
 const id=uuid();await env.DB.prepare('INSERT INTO forum_comments (id,post_id,customer_id,body,moderation_status) VALUES (?,?,?,?,'pending')').bind(id,postId,customer.id,content).run();
 return json({id,postId,body:content,author:customer.fullName,moderationStatus:'pending'},201);
}
