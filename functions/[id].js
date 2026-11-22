function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
export async function onRequest({request,env,params,next}){
 const id=String(params.id||'').slice(0,80);
 if(!id||!env.DB)return next();
 const post=await env.DB.prepare(`SELECT p.id,p.title,p.body,p.image_url AS imageUrl
  FROM forum_posts p
  WHERE p.id=? AND p.status='published' AND p.moderation_status='approved'`).bind(id).first();
 if(!post)return next();
 const origin=new URL(request.url).origin;
 const asset=await env.ASSETS.fetch(new URL('/index.html',request.url));if(!asset.ok)return asset;
 let html=await asset.text();
 const title=escapeHtml(post.title+' | Navstar Digital Hub');
 const description=escapeHtml(String(post.body||'').replace(/\\s+/g,' ').slice(0,240));
 const url=origin+'/'+encodeURIComponent(post.id);
 const image=origin+(post.imageUrl||'/Navstar_Official_Logo.jpg');
 const meta=`
 <title>${title}</title><meta name="description" content="${description}">
 <link rel="canonical" href="${escapeHtml(url)}">
 <meta property="og:type" content="article"><meta property="og:site_name" content="Navstar Digital Hub">
 <meta property="og:title" content="${title}"><meta property="og:description" content="${description}">
 <meta property="og:url" content="${escapeHtml(url)}"><meta property="og:image" content="${escapeHtml(image)}">
 <meta property="og:image:secure_url" content="${escapeHtml(image)}"><meta property="og:image:alt" content="${title}">
 <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}">
 <meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${escapeHtml(image)}">
 `;
 const titleStart=html.toLowerCase().indexOf('<title>');
 const titleEnd=titleStart>=0?html.toLowerCase().indexOf('</title>',titleStart):-1;
 if(titleStart>=0&&titleEnd>=0)html=html.slice(0,titleStart)+html.slice(titleEnd+8);
 html=html.replace('</head>',meta+'</head>');
 return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
}
