import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString } from '../../_shared/http.js';
const roles=['admin','principal'];
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Community database is not configured.',503);
 const access=await requireRole(request,env,roles);if(access.response)return access.response;
 const [posts,comments,published]=await Promise.all([
  env.DB.prepare("SELECT p.id,p.title,p.body,p.category,p.image_url AS imageUrl,p.created_at AS createdAt,c.full_name AS author FROM forum_posts p JOIN customer_accounts c ON c.id=p.customer_id WHERE p.moderation_status='pending' ORDER BY p.created_at ASC LIMIT 100").all(),
  env.DB.prepare("SELECT c.id,c.post_id AS postId,c.body,c.created_at AS createdAt,a.full_name AS author,p.title AS postTitle FROM forum_comments c JOIN customer_accounts a ON a.id=c.customer_id JOIN forum_posts p ON p.id=c.post_id WHERE c.moderation_status='pending' ORDER BY c.created_at ASC LIMIT 150").all(),
  env.DB.prepare("SELECT p.id,p.title,p.body,p.category,p.featured,p.created_at AS createdAt,c.full_name AS author FROM forum_posts p JOIN customer_accounts c ON c.id=p.customer_id WHERE p.status='published' AND p.moderation_status='approved' ORDER BY p.created_at DESC LIMIT 60").all()
 ]);
 return json({posts:posts.results||[],comments:comments.results||[],published:published.results||[]});
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Community database is not configured.',503);
 const access=await requireRole(request,env,roles);if(access.response)return access.response;
 let body;try{body=await readJson(request,4000)}catch{return error('Invalid moderation request.')}
 const type=safeString(body.type,12),id=safeString(body.id,80),action=safeString(body.action,16);
 if(!id||!['post','comment'].includes(type)||!['approve','reject','feature','unfeature'].includes(action))return error('Choose a valid item and moderation action.');
 if(type==='post'&&(action==='feature'||action==='unfeature')){
  await env.DB.prepare('UPDATE forum_posts SET featured=? WHERE id=? AND status=\'published\' AND moderation_status=\'approved\'').bind(action==='feature'?1:0,id).run();
 }else{
  const status=action==='approve'?'approved':'rejected',table=type==='post'?'forum_posts':'forum_comments';
  await env.DB.prepare(`UPDATE ${table} SET moderation_status=? WHERE id=?`).bind(status,id).run();
 }
 return json({saved:true,type,id,action});
}
