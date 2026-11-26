/* curió · sitemap.xml com a página inicial e todos os artigos publicados. */
const { sbFetch, esc, origin } = require('./_lib');

module.exports = async (req, res) => {
  const site = origin(req);
  let rows = [];
  try { rows = await sbFetch('articles?select=slug,updated_at,published_at&status=eq.published&order=published_at.desc'); } catch (e) { rows = []; }
  const urls = [`<url><loc>${site}/</loc></url>`].concat(rows.filter(r => r.slug).map(r =>
    `<url><loc>${esc(`${site}/artigos/${r.slug}`)}</loc>${(r.updated_at || r.published_at) ? `<lastmod>${esc(String(r.updated_at || r.published_at).slice(0, 10))}</lastmod>` : ''}</url>`));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
};
