import { createSession } from '../../_shared/auth.js';
import { error } from '../../_shared/http.js';

const cookie='navstar_google_state';
const safeNext=(role)=>role==='student'?'/student-portal':role==='admin'?'/admin':role==='principal'?'/portals/principal':role==='tutor'?'/portals/tutor':role==='finance'?'/portals/finance':'/student-portal';
export async function onRequestGet({request,env}){
 const url=new URL(request.url),callback=url.searchParams.get('callback')==='1';
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)return error('Google sign-in is not configured. The administrator must add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Cloudflare secrets.',503);
 const redirectUri=new URL('/api/auth/google?callback=1',url.origin).toString();
 if(!callback){
  const state=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
  const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  target.searchParams.set('client_id',env.GOOGLE_CLIENT_ID);target.searchParams.set('redirect_uri',redirectUri);target.searchParams.set('response_type','code');target.searchParams.set('scope','openid email profile');target.searchParams.set('state',state);target.searchParams.set('prompt','select_account');
  return new Response(null,{status:302,headers:{Location:target.toString(),'Set-Cookie':cookie+'='+state+'; Path=/api/auth/google; Max-Age=600; HttpOnly; Secure; SameSite=Lax'}});
 }
 const state=url.searchParams.get('state')||'',saved=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookie+'='))?.slice(cookie.length+1)||'';
 const clear=cookie+'=; Path=/api/auth/google; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
 if(!state||!saved||state!==saved||!url.searchParams.get('code'))return new Response(null,{status:302,headers:{Location:'/login?google=state-error', 'Set-Cookie':clear}});
 try{
  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:url.searchParams.get('code'),client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:'authorization_code'})});
  const tokenData=await tokenResponse.json();if(!tokenResponse.ok||!tokenData.id_token)throw new Error('Google could not verify this sign-in.');
  const verify=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(tokenData.id_token));const identity=await verify.json();
  if(!verify.ok||identity.aud!==env.GOOGLE_CLIENT_ID||identity.email_verified!=='true'||!identity.sub||!identity.email)throw new Error('Google account verification failed.');
  const user=await env.DB.prepare('SELECT id,email,role,google_sub,status FROM users WHERE lower(email)=lower(?) LIMIT 1').bind(identity.email).first();
  if(!user||user.status!=='active')return new Response(null,{status:302,headers:{Location:'/login?google=account-not-found','Set-Cookie':clear}});
  if(user.google_sub&&user.google_sub!==identity.sub)return new Response(null,{status:302,headers:{Location:'/login?google=account-link-conflict','Set-Cookie':clear}});
  await env.DB.prepare('UPDATE users SET google_sub=? WHERE id=? AND (google_sub IS NULL OR google_sub=?)').bind(identity.sub,user.id,identity.sub).run();
  const session=await createSession(env,user.id);
  const headers=new Headers({Location:safeNext(user.role),'Cache-Control':'no-store'});headers.append('Set-Cookie',session);headers.append('Set-Cookie',clear);return new Response(null,{status:302,headers});
 }catch(e){return new Response(null,{status:302,headers:{Location:'/login?google=failed','Set-Cookie':clear}});}
}
