import { createSession, hashPassword } from '../../_shared/auth.js';
import { setCustomerSession } from '../../_shared/customer-auth.js';
import { error } from '../../_shared/http.js';

const cookie='navstar_google_state';
const safeNext=(role)=>role==='student'?'/student-portal':role==='admin'?'/admin':role==='principal'?'/portals/principal':role==='tutor'?'/portals/tutor':role==='finance'?'/portals/finance':'/student-portal';
const clearState=cookie+'=; Path=/api/auth/google; Max-Age=0; HttpOnly; Secure; SameSite=Lax';

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
 if(!state||!saved||state!==saved||!url.searchParams.get('code'))return new Response(null,{status:302,headers:{Location:'/account?google=state-error','Set-Cookie':clearState}});
 try{
  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:url.searchParams.get('code'),client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri,grant_type:'authorization_code'})});
  const tokenData=await tokenResponse.json();if(!tokenResponse.ok||!tokenData.id_token)throw new Error('Google could not verify this sign-in.');
  const verify=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(tokenData.id_token));const identity=await verify.json();
  if(!verify.ok||identity.aud!==env.GOOGLE_CLIENT_ID||identity.email_verified!=='true'||!identity.sub||!identity.email)throw new Error('Google account verification failed.');
  const email=String(identity.email).trim().toLowerCase();
  if(!env.DB)throw new Error('Customer account storage is not configured.');
  let customer=await env.DB.prepare('SELECT id,full_name,email,phone,google_sub,status FROM customer_accounts WHERE lower(email)=lower(?) LIMIT 1').bind(email).first();
  if(customer&&customer.status!=='active')return new Response(null,{status:302,headers:{Location:'/account?google=account-suspended','Set-Cookie':clearState}});
  if(customer?.google_sub&&customer.google_sub!==identity.sub)return new Response(null,{status:302,headers:{Location:'/account?google=account-link-conflict','Set-Cookie':clearState}});
  if(!customer){
   const fullName=String(identity.name||email.split('@')[0]).trim().slice(0,120)||'Navstar Customer';
   const randomPassword=Array.from(crypto.getRandomValues(new Uint8Array(48)),b=>b.toString(16).padStart(2,'0')).join('');
   const credentials=await hashPassword(randomPassword),id=crypto.randomUUID();
   await env.DB.prepare('INSERT INTO customer_accounts (id,full_name,email,phone,password_hash,password_salt,google_sub) VALUES (?,?,?,NULL,?,?,?)').bind(id,fullName,email,credentials.hash,credentials.salt,identity.sub).run();
   customer={id,full_name:fullName,email,phone:null};
  }else{
   await env.DB.prepare('UPDATE customer_accounts SET google_sub=?,updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=? AND (google_sub IS NULL OR google_sub=?)').bind(identity.sub,customer.id,identity.sub).run();
  }
  const session=await setCustomerSession(env,customer.id);
  const headers=new Headers({Location:'/account?google=success','Cache-Control':'no-store'});headers.append('Set-Cookie',session);headers.append('Set-Cookie',clearState);return new Response(null,{status:302,headers});
 }catch(e){
  console.error('Public Google customer sign-in failed:',String(e?.message||e));
  return new Response(null,{status:302,headers:{Location:'/account?google=failed','Set-Cookie':clearState}});
 }
}
