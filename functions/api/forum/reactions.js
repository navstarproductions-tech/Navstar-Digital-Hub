import { getCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 const customer=await getCustomerSession(request,env);if(!customer)return error('Sign in to react to a discussion.',401);
 let body;try{body=await readJson(request,2048)}catch{return error('Invalid reaction.')}
 const postId=safeString(body.postId,80),reaction=safeString(body.reaction,16);
 if(!['like','helpful','celebrate'].includes(reaction))return error('Choose a supported reaction.');
 const post=await env.DB.prepare("SELECT id FROM forum_posts WHERE id=? AND status='published'").bind(postId).first();if(!post)return error('This discussion is unavailable.',404);
 const existing=await env.DB.prepare('SELECT id FROM forum_reactions WHERE post_id=? AND customer_id=? AND reaction=?').bind(postId,customer.id,reaction).first();
 if(existing)await env.DB.prepare('DELETE FROM forum_reactions WHERE id=?').bind(existing.id).run();
 else await env.DB.prepare('INSERT INTO forum_reactions (id,post_id,customer_id,reaction) VALUES (?,?,?,?)').bind(uuid(),postId,customer.id,reaction).run();
 const count=await env.DB.prepare('SELECT COUNT(*) AS count FROM forum_reactions WHERE post_id=?').bind(postId).first();
 return json({active:!existing,reactionCount:Number(count?.count||0)});
}
