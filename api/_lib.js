/* curió · utilitários das funções da Vercel (páginas de artigo e sitemap). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = f => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
let cached;

/* Lê config.js e curio-render.js do próprio site, num sandbox, sem duplicar código. */
function load() {
  if (cached) return cached;
  const sb = { window: {}, URL };
  vm.createContext(sb);
  vm.runInContext(read('config.js'), sb);
  let R = null;
  try { vm.runInContext(read('curio-render.js'), sb); R = sb.window.CurioRender; } catch (e) { /* sem renderizador */ }
  const cfg = sb.window.CURIO_CONFIG || {};
  cached = { url: String(cfg.supabaseUrl || '').replace(/\/$/, ''), key: cfg.supabaseAnonKey || '', R };
  return cached;
}

async function sbFetch(query) {
  const { url, key } = load();
  if (!url || !key) throw new Error('Supabase não configurado');
  const r = await fetch(`${url}/rest/v1/${query}`, { headers: { apikey: key } });
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
  return r.json();
}

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const origin = req => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'curiodesign.com.br';
  return `https://${host}`;
};

module.exports = { read, load, sbFetch, esc, origin };
