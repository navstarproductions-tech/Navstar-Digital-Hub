function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
export async function onRequestGet({request,env,params}){
 const origin=new URL(request.url).origin,id=String(params.id||'').slice(0,80);
 const post=env.DB?await env.DB.prepare(`SELECT p.id,p.title,p.body,p.image_url AS imageUrl,p.category,c.full_name AS author
  FROM forum_posts p JOIN customer_accounts c ON c.id=p.customer_id
  WHERE p.id=? AND p.status='published' AND p.moderation_status='approved'`).bind(id).first():null;
 if(!post)return new Response('Community post not found.',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
 const asset=await env.ASSETS.fetch(new URL('/index.html',request.url));if(!asset.ok)return asset;
 let html=await asset.text();
 const title=escapeHtml(post.title+' | Navstar Digital Hub');
 const description=escapeHtml(String(post.body||'').replace(/\s+/g,' ').slice(0,240));
 const url=origin+'/forum/post/'+encodeURIComponent(post.id);
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
 html=html.replace(/<title>[\s\S]*?<\/title>/i,'').replace(/<meta[^>]+(?:property|name)=["'](?:og:|twitter:)[^>]*>/gi,'').replace('</head>',meta+'</head>');
 return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
}
