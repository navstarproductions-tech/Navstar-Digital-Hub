import { getCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';
const stickers=['❤️','😂','👏','🔥','🎉','💡','🙌','😮','💯','🤝'];
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Community service is not configured.',503);
 const customer=await getCustomerSession(request,env);if(!customer)return error('Sign in to react to a discussion.',401);
 let body;try{body=await readJson(request,2048)}catch{return error('Invalid reaction.')}
 const postId=safeString(body.postId,80),reaction=safeString(body.reaction,16),sticker=safeString(body.sticker,8);
 const post=await env.DB.prepare("SELECT id FROM forum_posts WHERE id=? AND status='published' AND moderation_status='approved'").bind(postId).first();if(!post)return error('This discussion is unavailable.',404);
 if(sticker){
  if(!stickers.includes(sticker))return error('Choose a supported sticker.');
  const existing=await env.DB.prepare('SELECT id FROM forum_sticker_reactions WHERE post_id=? AND customer_id=? AND sticker=?').bind(postId,customer.id,sticker).first();
  if(existing)await env.DB.prepare('DELETE FROM forum_sticker_reactions WHERE id=?').bind(existing.id).run();
  else await env.DB.prepare('INSERT INTO forum_sticker_reactions(id,post_id,customer_id,sticker) VALUES(?,?,?,?)').bind(uuid(),postId,customer.id,sticker).run();
 }else{
  if(!['like','helpful','celebrate'].includes(reaction))return error('Choose a supported reaction.');
  const existing=await env.DB.prepare('SELECT id FROM forum_reactions WHERE post_id=? AND customer_id=? AND reaction=?').bind(postId,customer.id,reaction).first();
  if(existing)await env.DB.prepare('DELETE FROM forum_reactions WHERE id=?').bind(existing.id).run();
  else await env.DB.prepare('INSERT INTO forum_reactions (id,post_id,customer_id,reaction) VALUES (?,?,?,?)').bind(uuid(),postId,customer.id,reaction).run();
 }
 const [standard,stickerCount]=await Promise.all([
  env.DB.prepare('SELECT COUNT(*) AS count FROM forum_reactions WHERE post_id=?').bind(postId).first(),
  env.DB.prepare('SELECT COUNT(*) AS count FROM forum_sticker_reactions WHERE post_id=?').bind(postId).first()
 ]);
 return json({active:true,reactionCount:Number(standard?.count||0)+Number(stickerCount?.count||0)});
}
