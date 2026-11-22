import { getCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json,readJson,safeString } from '../../_shared/http.js';
const postId=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),n=>'abcdefghijklmnopqrstuvwxyz0123456789'[n%36]).join('');
export async function onRequestGet({env}){
 if(!env.DB)return error('Community service is not configured.',503);
 const result=await env.DB.prepare(`SELECT p.id,p.title,p.body,p.created_at AS createdAt,c.full_name AS author,
 (SELECT COUNT(*) FROM forum_comments x WHERE x.post_id=p.id AND x.status='published' AND x.moderation_status='approved') AS commentCount,
 ((SELECT COUNT(*) FROM forum_reactions r WHERE r.post_id=p.id)+(SELECT COUNT(*) FROM forum_sticker_reactions sr WHERE sr.post_id=p.id)) AS reactionCount,
 p.category,p.featured,p.image_url AS imageUrl
 FROM forum_posts p JOIN customer_accounts c ON c.id=p.customer_id WHERE p.status='published' AND p.moderation_status='approved' ORDER BY p.featured DESC,p.created_at DESC LIMIT 80`).all();
 return json({posts:result.results||[]});
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Community service is not configured.',503);
 const customer=await getCustomerSession(request,env);if(!customer)return error('Sign in to publish a community post.',401);
 let body;try{body=await readJson(request,12000)}catch{return error('Invalid post.')}
 const title=safeString(body.title,140),content=safeString(body.body,5000),category=['campus','forum','news'].includes(body.category)?body.category:'forum',imageUrl=safeString(body.imageUrl,160);
 if(title.length<4||content.length<10)return error('A title of at least 4 characters and a post of at least 10 characters are required.');
 let imageId='';
 if(imageUrl){const prefix='/api/forum/image/';if(!imageUrl.startsWith(prefix))return error('Upload the photo again before submitting.');imageId=imageUrl.slice(prefix.length);if(!/^[A-Za-z0-9-]{8,80}$/.test(imageId))return error('Upload the photo again before submitting.');const owned=await env.DB.prepare('SELECT id FROM forum_media_assets WHERE id=? AND customer_id=?').bind(imageId,customer.id).first();if(!owned)return error('That photo is not available for this account. Please upload it again.',403);}
 let id='';
 for(let attempt=0;attempt<5;attempt++){const candidate=postId();const exists=await env.DB.prepare('SELECT id FROM forum_posts WHERE id=?').bind(candidate).first();if(!exists){id=candidate;break;}}
 if(!id)return error('Could not create a unique post link. Please try again.',503);
 await env.DB.prepare("INSERT INTO forum_posts (id,customer_id,title,body,category,moderation_status,image_url) VALUES (?,?,?,?,?,'pending',?)").bind(id,customer.id,title,content,category,imageUrl||null).run();
 return json({id,title,body:content,author:customer.fullName,category,imageUrl:imageUrl||null,moderationStatus:'pending',commentCount:0,reactionCount:0},201);
}
