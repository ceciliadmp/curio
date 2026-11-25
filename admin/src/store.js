/* Data layer: Supabase when configured, otherwise a local demo store (localStorage). */
import { createClient } from '@supabase/supabase-js';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
// Ordem fixa: pela data de publicação (ou de criação, para rascunhos). Editar não muda a posição.
const byPosition = rows => rows.sort((a, b) => String(b.published_at || b.created_at || '').localeCompare(String(a.published_at || a.created_at || '')));
const LIST_FIELDS = 'id,title,subtitle,status,slug,updated_at,published_at,reading_minutes,display_title,cover_url';
/* Published articles are edited in a separate "draft" copy, so changes only go live on "Atualizar publicação". */
const withDraft = (row, extra) => {
  const out = { ...extra };
  if (row && row.draft) Object.assign(out, row.draft, { draft: null });
  return out;
};

/* Shrinks big photos before upload (max side in px, JPEG/WebP ~82%), so pages load fast.
   GIFs (may be animated) and SVGs go up untouched. */
export async function shrinkImage(file, maxSide = 1600) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 400 * 1024) { bmp.close && bmp.close(); return file; }
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
    const type = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise(res => cv.toBlob(res, type, 0.82));
    if (!blob || blob.size >= file.size) return file;
    const ext = type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], (file.name || 'imagem').replace(/\.[^.]+$/, '') + '.' + ext, { type });
  } catch (e) { return file; }
}

function unique(base, taken) {
  let s = base, i = 2;
  while (taken.has(s)) s = `${base}-${i++}`;
  return s;
}

/* ---------- Supabase ---------- */
export function supabaseStore(url, key) {
  const sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  const must = ({ data, error }) => { if (error) throw error; return data; };

  return {
    demo: false,
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    async signIn(email, password) { must(await sb.auth.signInWithPassword({ email, password })); },
    async signOut() { await sb.auth.signOut(); },
    async isAdmin() {
      const s = await this.session(); if (!s) return false;
      const rows = must(await sb.from('admins').select('user_id').eq('user_id', s.user.id).limit(1));
      return rows.length > 0;
    },
    async list() { return byPosition(must(await sb.from('articles').select(LIST_FIELDS + ',created_at,pending:draft->>title'))); },
    async get(id) { return must(await sb.from('articles').select('*').eq('id', id).single()); },
    async create(defaults = {}) { return must(await sb.from('articles').insert({ content: EMPTY_DOC, ...defaults }).select('*').single()); },
    async save(id, patch, live) { return must(await sb.from('articles').update(live ? { draft: patch } : patch).eq('id', id).select('id,updated_at').single()); },
    async discardDraft(id) { return must(await sb.from('articles').update({ draft: null }).eq('id', id).select('*').single()); },
    async remove(id) { must(await sb.from('articles').delete().eq('id', id)); },
    async publish(id, meta) {
      const others = must(await sb.from('articles').select('slug').neq('id', id).not('slug', 'is', null));
      const slug = unique(meta.slug, new Set(others.map(r => r.slug)));
      const row = must(await sb.from('articles').select('draft').eq('id', id).single());
      return must(await sb.from('articles').update(withDraft(row, { ...meta, slug, status: 'published' })).eq('id', id).select('*').single());
    },
    async unpublish(id) {
      const row = must(await sb.from('articles').select('draft').eq('id', id).single());
      return must(await sb.from('articles').update(withDraft(row, { status: 'draft' })).eq('id', id).select('*').single());
    },
    async uploadImage(original, maxSide) {
      const file = await shrinkImage(original, maxSide);
      const s = await this.session();
      const ext = (file.name && file.name.split('.').pop() || file.type.split('/')[1] || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${s.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      must(await sb.storage.from('article-images').upload(path, file, { contentType: file.type, cacheControl: '31536000' }));
      return sb.storage.from('article-images').getPublicUrl(path).data.publicUrl;
    }
  };
}

/* ---------- Local demo ---------- */
export function localStore() {
  const KEY = 'curio-admin-demo';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const write = rows => { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) { throw new Error('O navegador não deixou salvar (armazenamento cheio ou bloqueado).'); } };
  const now = () => new Date().toISOString();
  const pick = r => ({ ...Object.fromEntries(LIST_FIELDS.split(',').map(k => [k, r[k]])), pending: r.draft ? r.draft.title : null });

  return {
    demo: true,
    async session() { return { user: { id: 'demo', email: 'demo' } }; },
    async signIn() {},
    async signOut() {},
    async isAdmin() { return true; },
    async list() { return byPosition(read()).map(pick); },
    async get(id) { const r = read().find(x => x.id === id); if (!r) throw new Error('Artigo não encontrado'); return r; },
    async create(defaults = {}) {
      const r = { author_name: '', author_url: '', author_photo_url: null, id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), title: '', subtitle: '', content: EMPTY_DOC,
        status: 'draft', slug: null, display_title: null, display_subtitle: null, cover_url: null, cover_focal_x: 50, cover_focal_y: 50,
        tags: [], word_count: 0, reading_minutes: 1, created_at: now(), updated_at: now(), published_at: null, ...defaults };
      write([r, ...read()]); return r;
    },
    async save(id, patch, live) {
      const rows = read(), r = rows.find(x => x.id === id); Object.assign(r, live ? { draft: patch } : patch, { updated_at: now() }); write(rows); return { id, updated_at: r.updated_at };
    },
    async discardDraft(id) { const rows = read(), r = rows.find(x => x.id === id); r.draft = null; write(rows); return r; },
    async remove(id) { write(read().filter(x => x.id !== id)); },
    async publish(id, meta) {
      const rows = read(), r = rows.find(x => x.id === id);
      const slug = unique(meta.slug, new Set(rows.filter(x => x.id !== id && x.slug).map(x => x.slug)));
      Object.assign(r, withDraft(r, { ...meta, slug, status: 'published', updated_at: now() })); write(rows); return r;
    },
    async unpublish(id) { const rows = read(), r = rows.find(x => x.id === id); Object.assign(r, withDraft(r, { status: 'draft', updated_at: now() })); write(rows); return r; },
    async uploadImage(original, maxSide) {
      const file = await shrinkImage(original, maxSide);
      return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
    }
  };
}
