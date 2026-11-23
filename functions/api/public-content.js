import { getSession } from '../_shared/auth.js';
import { error,json,safeString } from '../_shared/http.js';
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Public content is not configured.',503);
 const type=safeString(new URL(request.url).searchParams.get('type'),10);
 if(!['news','event'].includes(type))return error('Choose news or event content.');
 const user=await getSession(request,env);
 const audiences=['public'];
 if(user?.role==='student')audiences.push('student');
 else if(user&&['admin','principal','tutor','finance','admissions'].includes(user.role))audiences.push('staff');
 const placeholders=audiences.map(()=>'?').join(',');
 const result=await env.DB.prepare("SELECT slug,title,summary,body,venue,starts_at AS startsAt,ends_at AS endsAt,published_at AS publishedAt,audience FROM institution_posts WHERE post_type=? AND status='published' AND audience IN ("+placeholders+") ORDER BY COALESCE(starts_at,published_at,created_at) DESC LIMIT 100").bind(type,...audiences).all();
 return json({posts:result.results||[]});
}
