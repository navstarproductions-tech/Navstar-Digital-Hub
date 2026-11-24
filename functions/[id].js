function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

// This dynamic route exists only to provide social-preview HTML for public
// forum posts that use short, single-segment URLs (/:id). It must never
// interfere with the homepage, application routes, or static files.
export async function onRequest({ request, env, params, next }) {
  const url = new URL(request.url);
  const id = String(params?.id || '').trim();

  // Only resolve public forum links on safe read-only requests.
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();
  if (!id || id.length > 80 || id.includes('/') || id.startsWith('.')) return next();

  // Leave known application entry points and file-like paths to Pages assets
  // and the React router. The forum IDs are opaque IDs, not file names.
  const reserved = new Set([
    'index.html', 'login', 'courses', 'about', 'gallery', 'enrollment',
    'staff-application', 'learning', 'services', 'ai', 'pay', 'donations',
    'portals', 'student-portal', 'student-recovery', 'account', 'my-account',
    'campus-life', 'admissions-letters', 'analytics', 'forum', 'music',
    'change-password', 'set-password', 'setup', 'admin', 'admin-reset',
    'news', 'events', 'fee-structure', 'favicon.ico', 'robots.txt',
    'sitemap.xml', 'manifest.json',
  ]);
  if (reserved.has(id.toLowerCase()) || /\.[a-z0-9]{1,8}$/i.test(id)) return next();

  if (!env.DB || !env.ASSETS) return next();

  try {
    const post = await env.DB.prepare(`
      SELECT p.id, p.title, p.body, p.image_url AS imageUrl
      FROM forum_posts p
      WHERE p.id = ?
        AND p.status = 'published'
        AND p.moderation_status = 'approved'
    `).bind(id).first();

    if (!post) return next();

    const asset = await env.ASSETS.fetch(new URL('/index.html', url.origin));
    if (!asset.ok) {
      console.error('Forum preview could not load application shell:', asset.status, id);
      return next();
    }

    let html = await asset.text();
    const title = escapeHtml(post.title + ' | Navstar Digital Hub');
    const description = escapeHtml(String(post.body || '').replace(/\s+/g, ' ').slice(0, 240));
    const canonical = url.origin + '/' + encodeURIComponent(post.id);
    const image = post.imageUrl
      ? new URL(post.imageUrl, url.origin).href
      : new URL('/Navstar_Official_Logo.jpg', url.origin).href;

    const meta = `
      <title>${title}</title>
      <meta name="description" content="${description}">
      <link rel="canonical" href="${escapeHtml(canonical)}">
      <meta property="og:type" content="article">
      <meta property="og:site_name" content="Navstar Digital Hub">
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${description}">
      <meta property="og:url" content="${escapeHtml(canonical)}">
      <meta property="og:image" content="${escapeHtml(image)}">
      <meta property="og:image:secure_url" content="${escapeHtml(image)}">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="${title}">
      <meta name="twitter:description" content="${description}">
      <meta name="twitter:image" content="${escapeHtml(image)}">
    `;

    html = html.replace(/<title>[\s\S]*?<\/title>/i, '');
    html = html.replace('</head>', meta + '</head>');
    return new Response(request.method === 'HEAD' ? null : html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    // A forum preview lookup must not take down the public application.
    console.error('Forum preview lookup failed; falling back to app routing:', id, String(error?.stack || error));
    return next();
  }
}
