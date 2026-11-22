import { getCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';
export async function onRequestGet({env}){
 if(!env.DB)return error('Community service is not configured.',503);
 const result=await env.DB.prepare(`SELECT p.id,p.title,p.body,p.created_at AS createdAt,c.full_name AS author,
 (SELECT COUNT(*) FROM forum_comments x WHERE x.post_id=p.id AND x.status='published' AND x.moderation_status='approved') AS commentCount,
 (SELECT COUNT(*) FROM forum_reactions r WHERE r.post_id=p.id) AS reactionCount,
 p.category,p.featured
 FROM forum_posts p JOIN customer_accounts c ON c.id=p.customer_id WHERE p.status='published' AND p.moderation_status='approved' ORDER BY p.created_at DESC LIMIT 50`).all();
 return json({posts:result.results||[]});
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Community service is not configured.',503);
 const customer=await getCustomerSession(request,env);if(!customer)return error('Sign in to publish a forum post.',401);
 let body;try{body=await readJson(request,12000)}catch{return error('Invalid post.')}
 const title=safeString(body.title,140),content=safeString(body.body,5000),category=['campus','forum','news'].includes(body.category)?body.category:'forum';
 if(title.length<4||content.length<10)return error('A title of at least 4 characters and a post of at least 10 characters are required.');
 const id=uuid();await env.DB.prepare('INSERT INTO forum_posts (id,customer_id,title,body,category,moderation_status) VALUES (?,?,?,?,?,'pending')').bind(id,customer.id,title,content,category).run();
 return json({id,title,body:content,author:customer.fullName,category,moderationStatus:'pending',commentCount:0,reactionCount:0},201);
}
