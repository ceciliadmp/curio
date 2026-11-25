/* Curió · admin de artigos */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import FloatingMenu from '@tiptap/extension-floating-menu';
import { PullQuote, Figure, Embed, TrailingNode } from './nodes.js';
import { supabaseStore, localStore } from './store.js';

const R = window.CurioRender;
const esc = R.esc;
const cfg = window.CURIO_CONFIG || {};
const store = cfg.supabaseUrl && cfg.supabaseAnonKey ? supabaseStore(cfg.supabaseUrl, cfg.supabaseAnonKey) : localStore();
const app = document.getElementById('app');
const SAVE_DELAY = 1500;
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  video: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-3v10l-6-3"/></svg>',
  embed: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  divider: '<svg viewBox="0 0 24 24"><path d="M3 12h18"/><circle cx="12" cy="6" r=".6"/><circle cx="12" cy="18" r=".6"/></svg>',
  bold: '<b>B</b>', italic: '<i>I</i>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  quote: '<svg viewBox="0 0 24 24"><path d="M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'
};

let editor = null;
let toastTimer = 0;

function toast(msg, kind) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.innerHTML = msg; t.dataset.kind = kind || ''; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
}
const errMsg = e => (e && (e.message || e.error_description)) || 'Algo deu errado.';
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const siteUrl = slug => `${location.origin}/#artigo-${encodeURIComponent(slug)}`;

/* The last author used becomes the default for the next new article. */
const AUTHOR_KEY = 'curio-last-author';
function lastAuthor() {
  try { const a = JSON.parse(localStorage.getItem(AUTHOR_KEY)) || {}; return { author_name: a.author_name || '', author_url: a.author_url || '', author_photo_url: a.author_photo_url || null }; }
  catch (e) { return {}; }
}
function rememberAuthor(a) { try { localStorage.setItem(AUTHOR_KEY, JSON.stringify(a)); } catch (e) { /* ignore */ } }
/* Accepts "linkedin.com/in/x" or a full URL; keeps only http(s) links. */
const normUrl = v => { v = String(v || '').trim(); if (!v) return ''; if (!/^https?:\/\//i.test(v)) v = 'https://' + v; return R.safeUrl(v) || ''; };
const initials = n => String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

function destroyEditor() { if (editor) { editor.destroy(); editor = null; } }

/* ======================= routing ======================= */
async function route() {
  destroyEditor();
  document.body.classList.remove('zen');
  if (!store.demo) {
    const s = await store.session().catch(() => null);
    if (!s) return viewLogin();
    let adminErr = null;
    const ok = await store.isAdmin().catch(e => { adminErr = e; return false; });
    if (!ok) return viewNotAdmin(s, adminErr);
  }
  const h = location.hash.replace(/^#\/?/, '');
  const m = h.match(/^editar\/(.+)$/);
  if (m) return viewEditor(m[1]);
  return viewList();
}
window.addEventListener('hashchange', route);

function shell(inner, opts = {}) {
  app.innerHTML = `${store.demo ? '<div class="demo-bar">Modo demonstração: os artigos ficam só neste navegador. Preencha <code>config.js</code> com os dados do Supabase para publicar de verdade.</div>' : ''}
  <header class="ad-top">
    <a class="ad-logo" href="#/" aria-label="Artigos">${document.getElementById('logo-tpl').innerHTML}<span>admin</span></a>
    <div class="ad-top-right">${opts.right || ''}</div>
  </header>${inner}`;
}

/* ======================= login ======================= */
function viewLogin() {
  shell(`<main class="ad-login">
    <h1>Entrar no admin</h1>
    <p>Use o e-mail e a senha da sua conta de administradora.</p>
    <form id="login" novalidate>
      <label>E-mail<input name="email" type="email" autocomplete="username" required></label>
      <label>Senha<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="ad-btn" type="submit">Entrar</button>
      <p class="ad-err" role="alert"></p>
    </form></main>`);
  const f = document.getElementById('login'), err = f.querySelector('.ad-err');
  f.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Entrando…';
    try { await store.signIn(f.email.value.trim(), f.password.value); route(); }
    catch (x) { err.textContent = /invalid/i.test(errMsg(x)) ? 'E-mail ou senha incorretos.' : errMsg(x); btn.disabled = false; btn.textContent = 'Entrar'; }
  });
}

function viewNotAdmin(s, err) {
  shell(`<main class="ad-login"><h1>Sem acesso</h1><p>A conta <b>${esc(s.user.email)}</b> entrou, mas não está na lista de administradoras. Rode no Supabase a última linha de <code>supabase/schema.sql</code> com este e-mail.</p>
    ${err ? `<p class="ad-err">Detalhe técnico: ${esc(errMsg(err))}${err.code ? ` (${esc(err.code)})` : ''}</p>` : ''}
    <button class="ad-btn ghost" id="out" type="button">Sair</button></main>`);
  document.getElementById('out').onclick = async () => { await store.signOut(); route(); };
}

/* ======================= list ======================= */
async function viewList() {
  shell(`<main class="ad-list"><div class="ad-list-head"><h1>Artigos</h1><button class="ad-btn" id="new" type="button">${ICON.plus}Novo artigo</button></div>
    <div id="rows" class="ad-rows"><div class="ad-loading" role="status"><span class="ad-spin" aria-hidden="true"></span><span class="sr-only">Carregando…</span></div></div></main>`,
    { right: store.demo ? '' : '<button class="ad-btn ghost sm" id="out" type="button">Sair</button>' });
  const out = document.getElementById('out'); if (out) out.onclick = async () => { await store.signOut(); route(); };
  document.getElementById('new').onclick = async () => {
    try { const r = await store.create(lastAuthor()); location.hash = `#/editar/${r.id}`; } catch (e) { toast(errMsg(e), 'err'); }
  };
  let rows;
  try { rows = await store.list(); } catch (e) { document.getElementById('rows').innerHTML = `<p class="ad-err">Não deu pra carregar: ${esc(errMsg(e))}</p>`; return; }
  const box = document.getElementById('rows');
  if (!rows.length) { box.innerHTML = '<div class="ad-empty"><p>Nenhum artigo ainda.</p><p class="ad-muted">Clique em “Novo artigo” para começar.</p></div>'; return; }
  box.innerHTML = rows.map(r => `<article class="ad-row">
      <a class="ad-row-main" href="#/editar/${esc(r.id)}">
        <span class="ad-row-title">${esc(r.title || 'Sem título')}</span>
        <span class="ad-row-meta"><span class="chip ${r.status}">${r.status === 'published' ? 'Publicado' : 'Rascunho'}</span>
          ${r.status === 'published' && r.pending != null ? '<span class="chip pending">Alterações não publicadas</span>' : ''}
          Editado em ${fmtDate(r.updated_at)} · ${r.reading_minutes || 1} min de leitura</span>
      </a>
      <div class="ad-row-actions">
        ${r.status === 'published' && r.slug ? `<a class="ad-btn secondary sm" href="${esc(siteUrl(r.slug))}" target="_blank" rel="noopener">Abrir site</a>` : ''}
        <a class="ad-btn ghost sm" href="#/editar/${esc(r.id)}">Editar</a>
        <button class="ad-btn ghost sm danger" data-del="${esc(r.id)}" type="button">Excluir</button>
      </div></article>`).join('');
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Excluir este artigo? Isso não pode ser desfeito.')) return;
    try { await store.remove(b.dataset.del); viewList(); toast('Artigo excluído.'); } catch (e) { toast(errMsg(e), 'err'); }
  });
}

/* ======================= editor ======================= */
async function viewEditor(id) {
  let art;
  try { art = await store.get(id); } catch (e) { shell(`<main class="ad-list"><p class="ad-err">Artigo não encontrado.</p><a href="#/">Voltar</a></main>`); return; }
  document.body.classList.add('zen');
  /* a published article is edited in its draft copy; the live version only changes on "Atualizar" */
  const live = () => art.status === 'published';
  const src = live() && art.draft ? art.draft : art;
  const idleState = () => live() ? (art.draft ? 'Alterações não publicadas' : 'Publicado') : 'Rascunho';
  shell(`<main class="zen-wrap">
      <textarea class="zen-title" rows="1" placeholder="Título" aria-label="Título">${esc(src.title)}</textarea>
      <textarea class="zen-sub" rows="1" placeholder="Subtítulo (opcional)" aria-label="Subtítulo">${esc(src.subtitle)}</textarea>
      <div id="ed" class="rich zen-body"></div>
      <section class="zen-author" aria-label="Autor ou autora do artigo">
        <p class="zen-author-label">Escrito por</p>
        <div class="zen-author-row">
          <button type="button" class="author-photo" title="Escolher foto" aria-label="Escolher foto do autor ou autora"></button>
          <div class="author-fields">
            <input class="author-name" type="text" placeholder="Nome do autor ou autora" aria-label="Nome do autor ou autora" maxlength="80" value="${esc(src.author_name || '')}">
            <input class="author-loc" type="text" inputmode="url" autocomplete="off" placeholder="Site ou LinkedIn, ex.: linkedin.com/in/seu-nome" aria-label="Site ou LinkedIn do autor ou autora" maxlength="200" value="${esc((() => { try { return decodeURI(src.author_url || ''); } catch (e) { return src.author_url || ''; } })())}">
          </div>
          <button type="button" class="author-photo-rm ad-btn ghost sm" hidden>Remover foto</button>
        </div>
        <input type="file" id="author-file" accept="image/*" hidden>
      </section>
      <input type="file" id="file" accept="image/*" hidden>
    </main>
    <div id="bubble" class="bubble" role="toolbar" aria-label="Formatação"></div>
    <div id="plus" class="plus"></div>`,
    { right: `<span class="save-state" id="save-state" aria-live="polite">${idleState()}</span>
      <button class="ad-btn ghost sm danger" id="discard" type="button" ${live() && art.draft ? '' : 'hidden'}>Descartar alterações</button>
      <a class="ad-btn ghost sm" href="#/">${ICON.back}Artigos</a>
      <button class="ad-btn sm" id="publish" type="button">${art.status === 'published' ? 'Atualizar' : 'Publicar'}</button>` });

  const titleEl = app.querySelector('.zen-title'), subEl = app.querySelector('.zen-sub'), state = document.getElementById('save-state');
  const fileIn = document.getElementById('file');
  const grow = t => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  [titleEl, subEl].forEach(t => { grow(t); t.addEventListener('input', () => { grow(t); queueSave(); }); });
  titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); subEl.focus(); } });
  subEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); editor.commands.setTextSelection(1); editor.view.focus(); } });

  /* ---- author ---- */
  const nameIn = app.querySelector('.author-name'), locIn = app.querySelector('.author-loc'),
    photoBtn = app.querySelector('.author-photo'), photoRm = app.querySelector('.author-photo-rm'), authorFile = document.getElementById('author-file');
  let authorPhoto = src.author_photo_url || '';
  function paintAuthor() {
    photoBtn.innerHTML = authorPhoto ? `<img src="${esc(authorPhoto)}" alt="">` : (nameIn.value.trim() ? `<span>${esc(initials(nameIn.value))}</span>` : ICON.plus);
    photoRm.hidden = !authorPhoto;
  }
  paintAuthor();
  const authorChanged = () => { paintAuthor(); rememberAuthor({ author_name: nameIn.value.trim(), author_url: normUrl(locIn.value), author_photo_url: authorPhoto || null }); queueSave(); };
  nameIn.addEventListener('input', authorChanged);
  locIn.addEventListener('input', authorChanged);
  photoBtn.addEventListener('click', () => authorFile.click());
  photoRm.addEventListener('click', () => { authorPhoto = ''; authorChanged(); });
  authorFile.addEventListener('change', async () => {
    const f = authorFile.files[0]; authorFile.value = ''; if (!f) return;
    if (!/^image\//.test(f.type)) return;
    setState('Enviando foto…', 'busy');
    try { authorPhoto = await store.uploadImage(f, 400); authorChanged(); }
    catch (e) { toast(`Não deu pra enviar a foto: ${esc(errMsg(e))}`, 'err'); setState('Erro no envio', 'err'); }
  });

  /* ---- autosave ---- */
  let timer = 0, saving = false, pending = false, dirty = false;
  function setState(t, kind) { state.textContent = t; state.dataset.kind = kind || ''; }
  function snapshot() {
    const content = editor.getJSON(), title = titleEl.value.trim(), subtitle = subEl.value.trim();
    const word_count = R.wordCount(content, title, subtitle);
    const author = { author_name: nameIn.value.trim(), author_url: normUrl(locIn.value), author_photo_url: authorPhoto || null };
    return { title, subtitle, content, word_count, reading_minutes: R.readingMinutes(word_count), ...author };
  }
  async function flush() {
    clearTimeout(timer);
    if (!dirty) return;
    if (saving) { pending = true; return; }
    saving = true; dirty = false; setState('Salvando…', 'busy');
    try {
      const snap = snapshot();
      await store.save(art.id, snap, live());
      if (live()) { art.draft = snap; document.getElementById('discard').hidden = false; setState('Salvo · não publicado', 'ok'); }
      else setState('Salvo', 'ok');
    }
    catch (e) { dirty = true; setState('Não foi possível salvar', 'err'); toast(`Não foi possível salvar: ${esc(errMsg(e))}`, 'err'); }
    saving = false;
    if (pending) { pending = false; flush(); }
  }
  function queueSave() { dirty = true; setState('Editando…', 'busy'); clearTimeout(timer); timer = setTimeout(flush, SAVE_DELAY); }
  const leave = e => { if (dirty || saving) { flush(); e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', leave);
  window.addEventListener('hashchange', function off() { flush(); window.removeEventListener('beforeunload', leave); window.removeEventListener('hashchange', off); });

  /* ---- images ---- */
  async function addImages(files, pos) {
    const imgs = [...files].filter(f => /^image\//.test(f.type));
    for (const f of imgs) {
      if (f.size > 10 * 1024 * 1024) { toast('Imagem maior que 10 MB. Reduza e tente de novo.', 'err'); continue; }
      setState('Enviando imagem…', 'busy');
      try {
        const src = await store.uploadImage(f);
        const chain = editor.chain().focus();
        if (typeof pos === 'number') chain.insertContentAt(pos, [{ type: 'figure', attrs: { src, alt: '', caption: '', layout: 'normal' } }, { type: 'paragraph' }]).run();
        else chain.insertFigure({ src, alt: '', caption: '', layout: 'normal' }).run();
        pos = undefined;
      } catch (e) { toast(`Não deu pra enviar a imagem: ${esc(errMsg(e))}`, 'err'); setState('Erro no envio', 'err'); }
    }
  }
  fileIn.addEventListener('change', () => { if (fileIn.files.length) addImages(fileIn.files); fileIn.value = ''; closePlus(); });

  /* ---- editor ---- */
  const bubbleEl = document.getElementById('bubble'), plusEl = document.getElementById('plus');
  editor = new Editor({
    element: document.getElementById('ed'),
    content: src.content && src.content.type === 'doc' ? src.content : { type: 'doc', content: [{ type: 'paragraph' }] },
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, blockquote: false, codeBlock: false, code: false, strike: false }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        validate: href => !!R.safeUrl(href, true) }),
      Placeholder.configure({ placeholder: ({ node, editor: ed }) => node.type.name === 'heading' ? 'Título da seção' :
        (ed.state.doc.childCount <= 1 ? 'Conte sua história…' : '') , showOnlyCurrent: true, includeChildren: false }),
      PullQuote, Figure, Embed, TrailingNode,
      BubbleMenu.configure({ element: bubbleEl, tippyOptions: { duration: 120, placement: 'top', maxWidth: 'none', onHidden: () => linkMode(false) },
        shouldShow: ({ editor: ed, state, from, to }) => {
          if (from === to || !ed.isEditable) return false;
          const n = state.selection.node; if (n) return false;
          return state.doc.textBetween(from, to, ' ').trim().length > 0;
        } }),
      FloatingMenu.configure({ element: plusEl, tippyOptions: { duration: 100, placement: 'left-start', offset: [0, 12], onHidden: () => closePlus() },
        shouldShow: ({ editor: ed, state }) => {
          const { $from, empty } = state.selection;
          return ed.isFocused && empty && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0 && $from.depth === 1;
        } })
    ],
    editorProps: {
      attributes: { 'aria-label': 'Corpo do artigo', spellcheck: 'true' },
      handlePaste: (view, e) => { const fs = e.clipboardData && e.clipboardData.files; if (fs && fs.length) { addImages(fs); return true; } return false; },
      handleDrop: (view, e, slice, moved) => {
        const fs = e.dataTransfer && e.dataTransfer.files;
        if (moved || !fs || !fs.length) return false;
        e.preventDefault();
        const c = view.posAtCoords({ left: e.clientX, top: e.clientY });
        addImages(fs, c ? c.pos : undefined); return true;
      }
    },
    onUpdate: () => queueSave(),
    onSelectionUpdate: () => paintBubble()
  });

  /* ---- bubble menu ---- */
  const BTN = [
    ['bold', 'Negrito (Ctrl/Cmd+B)', ICON.bold, () => editor.chain().focus().toggleBold().run(), () => editor.isActive('bold')],
    ['italic', 'Itálico (Ctrl/Cmd+I)', ICON.italic, () => editor.chain().focus().toggleItalic().run(), () => editor.isActive('italic')],
    ['link', 'Link', ICON.link, () => linkMode(true), () => editor.isActive('link')],
    ['sep'],
    ['h2', 'Título grande', 'T', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), () => editor.isActive('heading', { level: 2 })],
    ['h3', 'Título pequeno', 't', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), () => editor.isActive('heading', { level: 3 })],
    ['quote', 'Citação de destaque', ICON.quote, () => editor.chain().focus().togglePullQuote().run(), () => editor.isActive('pullQuote')]
  ];
  bubbleEl.innerHTML = `<div class="bubble-tools">${BTN.map(b => b[0] === 'sep' ? '<span class="bsep"></span>' :
      `<button type="button" data-b="${b[0]}" title="${b[1]}" aria-label="${b[1]}" class="b-${b[0]}">${b[2]}</button>`).join('')}</div>
    <form class="bubble-link" hidden novalidate><input type="text" inputmode="url" autocomplete="off" placeholder="Cole ou digite um link e aperte Enter" aria-label="Endereço do link">
      <button type="submit" title="Aplicar link" aria-label="Aplicar link">${ICON.check}</button>
      <button type="button" data-unlink title="Remover link" aria-label="Remover link">${ICON.x}</button></form>`;
  const tools = bubbleEl.querySelector('.bubble-tools'), linkForm = bubbleEl.querySelector('.bubble-link'), linkIn = linkForm.querySelector('input');
  BTN.forEach(b => { if (b[3]) bubbleEl.querySelector(`[data-b="${b[0]}"]`).addEventListener('mousedown', e => { e.preventDefault(); b[3](); paintBubble(); }); });
  function paintBubble() { BTN.forEach(b => { if (b[4]) { const el = bubbleEl.querySelector(`[data-b="${b[0]}"]`); el.setAttribute('aria-pressed', String(!!b[4]())); } }); }
  function linkMode(on) {
    tools.hidden = on; linkForm.hidden = !on;
    if (on) { linkIn.value = editor.getAttributes('link').href || ''; setTimeout(() => linkIn.focus(), 0); }
  }
  linkForm.addEventListener('submit', e => {
    e.preventDefault();
    let v = linkIn.value.trim();
    if (v && !/^[a-z]+:/i.test(v)) v = (/@/.test(v) && !/\//.test(v) ? 'mailto:' : 'https://') + v;
    if (v && !R.safeUrl(v, true)) { linkIn.setCustomValidity('Link inválido'); linkIn.reportValidity(); return; }
    const ch = editor.chain().focus().extendMarkRange('link');
    (v ? ch.setLink({ href: v }) : ch.unsetLink()).run(); linkMode(false); paintBubble(); editor.view.focus();
  });
  linkIn.addEventListener('input', () => linkIn.setCustomValidity(''));
  linkIn.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); linkMode(false); editor.commands.focus(); } });
  linkForm.querySelector('[data-unlink]').addEventListener('click', () => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); linkMode(false); paintBubble(); });

  /* ---- "+" insert menu ---- */
  plusEl.innerHTML = `<button type="button" class="plus-toggle" aria-label="Inserir bloco" aria-expanded="false" title="Inserir">${ICON.plus}</button>
    <div class="plus-items" hidden>
      <button type="button" data-ins="image" title="Imagem" aria-label="Inserir imagem">${ICON.image}</button>
      <button type="button" data-ins="video" title="Vídeo (YouTube, Vimeo)" aria-label="Inserir vídeo">${ICON.video}</button>
      <button type="button" data-ins="embed" title="Embed (X, Instagram, Gist, CodePen, Spotify ou link)" aria-label="Inserir embed">${ICON.embed}</button>
      <button type="button" data-ins="divider" title="Divisor de seção" aria-label="Inserir divisor">${ICON.divider}</button>
    </div>
    <form class="plus-url" hidden novalidate><input type="text" inputmode="url" autocomplete="off" aria-label="Endereço"><button type="submit" aria-label="Inserir">${ICON.check}</button></form>`;
  const toggle = plusEl.querySelector('.plus-toggle'), items = plusEl.querySelector('.plus-items'), urlForm = plusEl.querySelector('.plus-url'), urlIn = urlForm.querySelector('input');
  let urlKind = '';
  function closePlus() { plusEl.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); items.hidden = true; urlForm.hidden = true; }
  toggle.addEventListener('mousedown', e => {
    e.preventDefault();
    const open = !plusEl.classList.contains('open');
    closePlus(); if (open) { plusEl.classList.add('open'); toggle.setAttribute('aria-expanded', 'true'); items.hidden = false; }
  });
  items.addEventListener('mousedown', e => {
    const b = e.target.closest('[data-ins]'); if (!b) return; e.preventDefault();
    const k = b.dataset.ins;
    if (k === 'image') { fileIn.click(); return; }
    if (k === 'divider') { editor.chain().focus().setHorizontalRule().run(); closePlus(); return; }
    urlKind = k; items.hidden = true; urlForm.hidden = false;
    urlIn.placeholder = k === 'video' ? 'Cole o link do YouTube ou Vimeo e aperte Enter' : 'Cole o link (X, Instagram, Gist, CodePen, Spotify…) e aperte Enter';
    urlIn.value = ''; setTimeout(() => urlIn.focus(), 0);
  });
  urlForm.addEventListener('submit', e => {
    e.preventDefault();
    let v = urlIn.value.trim(); if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
    const info = R.embedInfo(v);
    if (!info) { urlIn.setCustomValidity('Link inválido'); urlIn.reportValidity(); return; }
    if (urlKind === 'video' && info.kind !== 'video') { urlIn.setCustomValidity('Use um link do YouTube ou do Vimeo'); urlIn.reportValidity(); return; }
    editor.chain().focus().insertEmbed(info.url).run(); closePlus();
  });
  urlIn.addEventListener('input', () => urlIn.setCustomValidity(''));
  urlIn.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closePlus(); editor.commands.focus(); } });

  /* ---- publish ---- */
  document.getElementById('publish').addEventListener('click', async () => {
    await flush();
    if (!titleEl.value.trim()) { toast('Dê um título ao artigo antes de publicar.', 'err'); titleEl.focus(); return; }
    art = await store.get(art.id).catch(() => art);
    openPublish(art, snapshot(), updated => {
      art = updated;
      document.getElementById('publish').textContent = updated.status === 'published' ? 'Atualizar' : 'Publicar';
      document.getElementById('discard').hidden = true;
      setState(idleState(), 'ok');
    });
  });

  document.getElementById('discard').addEventListener('click', async () => {
    if (!confirm('Descartar as alterações e voltar para a versão que está no site?')) return;
    clearTimeout(timer); dirty = false;
    try { await store.discardDraft(art.id); toast('Alterações descartadas.'); route(); }
    catch (e) { toast(`Não deu pra descartar: ${esc(errMsg(e))}`, 'err'); }
  });

  if (!art.title) titleEl.focus(); else editor.commands.focus('end');
}

/* ======================= publish modal ======================= */
function openPublish(art, snap, done) {
  const imgs = R.images(snap.content);
  const st = {
    cover: art.cover_url || imgs[0] || '',
    fx: art.cover_focal_x != null ? art.cover_focal_x : 50, fy: art.cover_focal_y != null ? art.cover_focal_y : 50,
    title: art.display_title || snap.title, sub: art.display_subtitle != null && art.display_subtitle !== '' ? art.display_subtitle : snap.subtitle,
    tags: (art.tags || []).slice(0, 3)
  };
  const dlg = document.createElement('dialog');
  dlg.className = 'pub';
  dlg.setAttribute('aria-labelledby', 'pub-h');
  dlg.innerHTML = `<form method="dialog" class="pub-inner">
    <header class="pub-head"><h2 id="pub-h">${art.status === 'published' ? 'Atualizar publicação' : 'Revisar antes de publicar'}</h2>
      <button type="button" class="ad-icon" data-close aria-label="Fechar">${ICON.x}</button></header>
    <div class="pub-grid">
      <section class="pub-preview">
        <p class="pub-label">Prévia do card</p>
        <div class="pcard">
          <div class="pcard-cover" title="Clique na imagem para escolher o ponto focal"><img alt=""><span class="focal-dot"></span><span class="pcard-nocover">Sem imagem de capa</span></div>
          <div class="pcard-body"><span class="pcard-meta"></span><span class="pcard-title"></span><span class="pcard-sub"></span></div>
        </div>
        <p class="pub-hint">Clique na capa para escolher o ponto focal: é a parte da imagem que sempre aparece quando ela é cortada.</p>
      </section>
      <section class="pub-fields">
        <div class="pub-field"><span class="pub-label">Imagem de capa</span>
          <div class="cover-pick">${imgs.map(src => `<button type="button" class="cover-opt" data-src="${esc(src)}" aria-label="Usar esta imagem como capa"><img src="${esc(src)}" alt=""></button>`).join('')}
            <button type="button" class="cover-opt cover-up" aria-label="Enviar outra imagem">${ICON.plus}<span>Enviar</span></button>
            <button type="button" class="cover-opt cover-none" aria-label="Sem capa">${ICON.x}<span>Nenhuma</span></button></div>
          <input type="file" accept="image/*" hidden class="cover-file"></div>
        <label class="pub-field"><span class="pub-label">Título de exibição</span><input class="in" name="dt" maxlength="140"></label>
        <label class="pub-field"><span class="pub-label">Subtítulo de exibição</span><textarea class="in" name="ds" rows="3" maxlength="280"></textarea></label>
        <div class="pub-field"><span class="pub-label">Tags <small>(até 3)</small></span>
          <div class="tags in"><span class="tag-list"></span><input class="tag-in" placeholder="Digite e aperte Enter" aria-label="Nova tag" maxlength="32"></div></div>
        <p class="pub-hint pub-addr"></p>
      </section>
    </div>
    <footer class="pub-foot">
      ${art.status === 'published' ? '<button type="button" class="ad-btn ghost danger" data-unpub>Despublicar</button>' : ''}
      <span class="pub-spacer"></span>
      <button type="button" class="ad-btn ghost" data-close>Cancelar</button>
      <button type="button" class="ad-btn" data-go>${art.status === 'published' ? 'Atualizar publicação' : 'Publicar agora'}</button>
    </footer></form>`;
  document.body.appendChild(dlg);
  const $ = s => dlg.querySelector(s);
  const dt = $('[name=dt]'), ds = $('[name=ds]'), tagIn = $('.tag-in'), cover = $('.pcard-cover'), coverImg = cover.querySelector('img'), dot = $('.focal-dot');
  dt.value = st.title; ds.value = st.sub;
  const slug = art.slug || R.slugify(st.title);

  function paint() {
    cover.classList.toggle('has', !!st.cover);
    if (st.cover) { if (coverImg.getAttribute('src') !== st.cover) coverImg.src = st.cover; coverImg.style.objectPosition = `${st.fx}% ${st.fy}%`; }
    dot.style.left = st.fx + '%'; dot.style.top = st.fy + '%';
    $('.pcard-meta').textContent = `${st.tags[0] || 'Artigo'} · ${snap.reading_minutes} min de leitura`;
    $('.pcard-title').textContent = st.title || 'Sem título';
    $('.pcard-sub').textContent = st.sub;
    dlg.querySelectorAll('.cover-opt[data-src]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.src === st.cover)));
    $('.cover-none').setAttribute('aria-pressed', String(!st.cover));
    $('.tag-list').innerHTML = st.tags.map((t, i) => `<span class="tag">${esc(t)}<button type="button" data-tag="${i}" aria-label="Remover ${esc(t)}">${ICON.x}</button></span>`).join('');
    tagIn.disabled = st.tags.length >= 3; tagIn.placeholder = st.tags.length >= 3 ? 'Limite de 3 tags' : 'Digite e aperte Enter';
    $('.pub-addr').innerHTML = `Endereço: <code>#artigo-${esc(art.slug || R.slugify(st.title))}</code> · ${snap.word_count} palavras`;
  }
  paint();

  dt.addEventListener('input', () => { st.title = dt.value; paint(); });
  ds.addEventListener('input', () => { st.sub = ds.value; paint(); });
  cover.addEventListener('click', e => {
    if (!st.cover) return;
    const r = coverImg.getBoundingClientRect();
    st.fx = Math.round(Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100)));
    st.fy = Math.round(Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100)));
    paint();
  });
  dlg.querySelectorAll('.cover-opt[data-src]').forEach(b => b.addEventListener('click', () => { st.cover = b.dataset.src; st.fx = st.fy = 50; paint(); }));
  $('.cover-none').addEventListener('click', () => { st.cover = ''; paint(); });
  const cf = $('.cover-file');
  $('.cover-up').addEventListener('click', () => cf.click());
  cf.addEventListener('change', async () => {
    const f = cf.files[0]; cf.value = ''; if (!f) return;
    try { toast('Enviando imagem…'); st.cover = await store.uploadImage(f); st.fx = st.fy = 50; paint(); toast('Capa enviada.'); }
    catch (e) { toast(`Não deu pra enviar: ${esc(errMsg(e))}`, 'err'); }
  });
  function addTag() {
    const t = tagIn.value.replace(/,/g, ' ').trim().replace(/\s+/g, ' ');
    if (t && st.tags.length < 3 && !st.tags.some(x => x.toLowerCase() === t.toLowerCase())) st.tags.push(t);
    tagIn.value = ''; paint(); tagIn.focus();
  }
  tagIn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
    else if (e.key === 'Backspace' && !tagIn.value && st.tags.length) { st.tags.pop(); paint(); }
  });
  tagIn.addEventListener('blur', () => { if (tagIn.value.trim()) addTag(); });
  $('.tag-list').addEventListener('click', e => { const b = e.target.closest('[data-tag]'); if (b) { st.tags.splice(+b.dataset.tag, 1); paint(); } });

  const close = () => { dlg.close(); dlg.remove(); };
  dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
  $('[data-go]').addEventListener('click', async () => {
    const btn = $('[data-go]'); btn.disabled = true; btn.textContent = 'Publicando…';
    try {
      const updated = await store.publish(art.id, {
        slug, display_title: st.title.trim() || null, display_subtitle: st.sub.trim() || null,
        cover_url: st.cover || null, cover_focal_x: st.fx, cover_focal_y: st.fy, tags: st.tags,
        published_at: art.published_at || new Date().toISOString()
      });
      close(); done(updated);
      toast(store.demo ? 'Publicado no modo demonstração.' : `Publicado! <a href="${esc(siteUrl(updated.slug))}" target="_blank" rel="noopener">Ver no site</a>`, 'ok');
    } catch (e) { btn.disabled = false; btn.textContent = 'Tentar de novo'; toast(`Não deu pra publicar: ${esc(errMsg(e))}`, 'err'); }
  });
  const un = $('[data-unpub]');
  if (un) un.addEventListener('click', async () => {
    if (!confirm('Tirar este artigo do site? Ele volta a ser rascunho.')) return;
    try { const u = await store.unpublish(art.id); close(); done(u); toast('O artigo saiu do site e voltou a ser rascunho.'); }
    catch (e) { toast(errMsg(e), 'err'); }
  });
  dlg.showModal();
  dt.focus();
}

route();
