/* curió · página de artigo com endereço próprio (/artigos/<slug>).
   Entrega o mesmo index.html do site, mas já com título, descrição, imagem de compartilhamento
   e o texto do artigo prontos no HTML. Assim o Google, prévias de link e leitores sem JavaScript
   conseguem ler o artigo. Depois o site carrega normalmente por cima. */
const { read, load, sbFetch, esc, origin } = require('./_lib');

const FIELDS = 'slug,title,subtitle,display_title,display_subtitle,cover_url,tags,reading_minutes,published_at,author_name,author_photo_url,content';

async function getArticle(slug) {
  const q = s => `articles?select=${s}&status=eq.published&slug=eq.${encodeURIComponent(slug)}&limit=1`;
  try { return (await sbFetch(q(FIELDS + ',author_url')))[0] || null; }
  catch (e) { if (e.status === 400) return (await sbFetch(q(FIELDS)))[0] || null; throw e; }
}

const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Recife' }); };

function headTags(a, url, site) {
  const { R } = load();
  const title = a.title || 'Artigo';
  const desc = a.subtitle || a.display_subtitle || 'Um artigo da Curió, plataforma brasileira de aprendizado de design.';
  const img = R && a.cover_url ? R.safeUrl(a.cover_url) : '';
  const ld = {
    '@context': 'https://schema.org', '@type': 'Article', headline: title, description: desc, inLanguage: 'pt-BR',
    mainEntityOfPage: url, url, datePublished: a.published_at || undefined,
    author: a.author_name ? { '@type': 'Person', name: a.author_name, url: (R && a.author_url && R.safeUrl(a.author_url)) || undefined } : undefined,
    publisher: { '@type': 'Organization', name: 'Curió', url: site + '/' }, image: img || undefined,
    keywords: Array.isArray(a.tags) && a.tags.length ? a.tags.join(', ') : undefined
  };
  return [
    `<title>${esc(title)} · Curió</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="Curió">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    img ? `<meta property="og:image" content="${esc(img)}">` : '',
    a.published_at ? `<meta property="article:published_time" content="${esc(a.published_at)}">` : '',
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
  ].filter(Boolean).join('\n');
}

function bodyHTML(a) {
  const { R } = load();
  const tag = (Array.isArray(a.tags) && a.tags[0]) || 'Artigo';
  const body = R ? R.toHTML(a.content || { type: 'doc', content: [] }) : '';
  return `<article class="view page article bg-50" data-prerender>
    <a class="art-back" href="/#artigos" data-back>Voltar</a>
    <header class="page-head"><h1>${esc(a.title)}</h1>${a.subtitle ? `<p class="page-desc">${esc(a.subtitle)}</p>` : ''}</header>
    <p class="art-meta">${esc(tag)} · ${a.reading_minutes || 1} min de leitura${a.published_at ? ` · <time datetime="${esc(a.published_at)}">Publicado em ${fmtDate(a.published_at)}</time>` : ''}</p>
    ${a.author_name ? `<p class="art-byline"><span>Por <b>${esc(a.author_name)}</b></span></p>` : ''}
    <div class="art-read"><div class="rich">${body}</div></div>
  </article>`;
}

module.exports = async (req, res) => {
  const slug = String((req.query && req.query.slug) || '').toLowerCase();
  let tpl = read('index.html');
  let a = null;
  if (/^[a-z0-9-]{1,160}$/.test(slug)) {
    try { a = await getArticle(slug); } catch (e) { a = undefined; }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!a) {
    // Não achou (ou o banco não respondeu): entrega o site normal; ele mesmo mostra o que der.
    res.statusCode = a === null ? 404 : 200;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    if (a === null) tpl = tpl.replace('<head>', '<head>\n<meta name="robots" content="noindex">');
    return res.end(tpl);
  }
  const site = origin(req), url = `${site}/artigos/${a.slug}`;
  tpl = tpl
    .replace(/<meta name="description"[^>]*>\s*/, '')
    .replace(/<title>[^<]*<\/title>/, headTags(a, url, site))
    .replace('<main id="app" aria-live="polite"></main>',
      `<main id="app" aria-live="polite">${bodyHTML(a)}</main>\n<script type="application/json" id="curio-pre">${JSON.stringify({ slug: a.slug, content: a.content || null }).replace(/</g, '\\u003c')}</script>`);
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  res.end(tpl);
};
