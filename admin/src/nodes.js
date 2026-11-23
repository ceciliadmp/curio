/* Custom editor blocks: pull quote, figure (image + layout + caption + alt), embed (video / rich / link). */
import { Node, Extension, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const R = () => window.CurioRender;

export const PullQuote = Node.create({
  name: 'pullQuote',
  group: 'block',
  content: 'inline*',
  defining: true,
  parseHTML() { return [{ tag: 'blockquote.pull-quote', contentElement: 'p' }, { tag: 'p.pull-quote' }]; },
  renderHTML({ HTMLAttributes }) { return ['blockquote', mergeAttributes(HTMLAttributes, { class: 'pull-quote' }), ['p', 0]]; },
  addCommands() {
    return {
      togglePullQuote: () => ({ editor, commands }) =>
        editor.isActive('pullQuote') ? commands.setParagraph() : commands.setNode('pullQuote')
    };
  }
});

const LAYOUTS = [
  ['normal', 'Largura do texto', '<svg viewBox="0 0 24 24"><rect x="7" y="6" width="10" height="12" rx="1.5"/></svg>'],
  ['outset', 'Largura expandida', '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1.5"/></svg>'],
  ['full', 'Largura total da tela', '<svg viewBox="0 0 24 24"><rect x="1" y="6" width="22" height="12" rx="1"/></svg>']
];

export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  atom: true,
  /* not draggable: Safari and Firefox block typing in inputs inside draggable elements (the caption) */
  draggable: false,
  selectable: true,
  addAttributes() {
    return { src: { default: null }, alt: { default: '' }, caption: { default: '' }, layout: { default: 'normal' } };
  },
  parseHTML() {
    return [{
      tag: 'figure',
      getAttrs: el => {
        const img = el.querySelector('img'); if (!img) return false;
        const lay = (el.className.match(/fig--(normal|outset|full)/) || [])[1] || 'normal';
        return { src: img.getAttribute('src'), alt: img.getAttribute('alt') || '', caption: (el.querySelector('figcaption') || {}).textContent || '', layout: lay };
      }
    }];
  },
  renderHTML({ node }) {
    const a = node.attrs, kids = [['img', { src: a.src, alt: a.alt }]];
    if (a.caption) kids.push(['figcaption', a.caption]);
    return ['figure', { class: `fig fig--${a.layout}` }, ...kids];
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let cur = node;
      const dom = document.createElement('figure');
      dom.className = 'fig ed-fig';
      dom.innerHTML = `
        <div class="ed-fig-bar" contenteditable="false">
          ${LAYOUTS.map(([k, label, ic]) => `<button type="button" data-layout="${k}" title="${label}" aria-label="${label}">${ic}</button>`).join('')}
          <span class="ed-fig-sep"></span>
          <button type="button" data-alt title="Texto alternativo (acessibilidade e SEO)">Alt</button>
          <button type="button" data-del title="Remover imagem" aria-label="Remover imagem"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
        <div class="ed-fig-alt" contenteditable="false" hidden>
          <label>Texto alternativo <input type="text" placeholder="Descreva a imagem para quem não pode vê-la"></label>
        </div>
        <img alt="" draggable="false">
        <div class="ed-fig-capwrap" contenteditable="false"><textarea class="ed-fig-cap" rows="1" placeholder="Escreva uma legenda (opcional)" aria-label="Legenda da imagem"></textarea></div>`;
      const img = dom.querySelector('img'), cap = dom.querySelector('.ed-fig-cap'),
        altBox = dom.querySelector('.ed-fig-alt'), altIn = altBox.querySelector('input');

      /* the caption wraps: grow the textarea to fit its text */
      const growCap = () => { cap.style.height = 'auto'; cap.style.height = cap.scrollHeight + 'px'; };
      const set = attrs => {
        const pos = getPos(); if (typeof pos !== 'number') return;
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, ...attrs }));
      };
      const paint = () => {
        const a = cur.attrs;
        dom.className = `fig ed-fig fig--${a.layout}` + (a.src ? '' : ' is-loading');
        if (a.src && img.getAttribute('src') !== a.src) img.src = a.src;
        img.alt = a.alt || '';
        if (document.activeElement !== cap) cap.value = a.caption || '';
        growCap(); requestAnimationFrame(growCap);
        if (document.activeElement !== altIn) altIn.value = a.alt || '';
        dom.querySelectorAll('[data-layout]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layout === a.layout)));
        dom.querySelector('[data-alt]').classList.toggle('has', !!a.alt);
      };
      paint();

      dom.querySelectorAll('[data-layout]').forEach(b => b.addEventListener('click', () => set({ layout: b.dataset.layout })));
      dom.querySelector('[data-alt]').addEventListener('click', () => { altBox.hidden = !altBox.hidden; if (!altBox.hidden) altIn.focus(); });
      dom.querySelector('[data-del]').addEventListener('click', () => {
        const pos = getPos(); if (typeof pos === 'number') editor.chain().focus().deleteRange({ from: pos, to: pos + cur.nodeSize }).run();
      });
      cap.addEventListener('input', () => { growCap(); set({ caption: cap.value.replace(/\n/g, ' ') }); });
      altIn.addEventListener('input', () => set({ alt: altIn.value }));
      [cap, altIn].forEach(i => i.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); const pos = getPos(); editor.chain().focus().setTextSelection(pos + cur.nodeSize).run(); }
        e.stopPropagation();
      }));
      img.addEventListener('click', () => { const pos = getPos(); if (typeof pos === 'number') editor.commands.setNodeSelection(pos); });

      return {
        dom,
        update(n) { if (n.type.name !== 'figure') return false; cur = n; paint(); return true; },
        selectNode() { dom.classList.add('is-selected'); },
        deselectNode() { dom.classList.remove('is-selected'); altBox.hidden = true; },
        stopEvent(e) { return !!(e.target.closest && e.target.closest('input,textarea,button,label')); },
        ignoreMutation() { return true; }
      };
    };
  },
  addCommands() {
    return { insertFigure: attrs => ({ commands }) => commands.insertContent([{ type: this.name, attrs }, { type: 'paragraph' }]) };
  }
});

export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() { return { url: { default: '' } }; },
  parseHTML() { return [{ tag: 'div[data-embed-url]', getAttrs: el => ({ url: el.getAttribute('data-embed-url') }) }]; },
  renderHTML({ node }) { return ['div', { 'data-embed-url': node.attrs.url }]; },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'ed-embed';
      const info = R().embedInfo(node.attrs.url);
      dom.innerHTML = `<div class="ed-embed-head" contenteditable="false"><span>${R().esc(info ? info.provider : 'Link')}</span>
        <button type="button" title="Remover" aria-label="Remover embed"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        <div class="ed-embed-body">${R().embedHTML(node.attrs.url)}</div>`;
      dom.querySelector('button').addEventListener('click', () => {
        const pos = getPos(); if (typeof pos === 'number') editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
      });
      dom.addEventListener('mousedown', e => {
        if (e.target.closest('button')) return;
        const pos = getPos(); if (typeof pos === 'number') { e.preventDefault(); editor.commands.setNodeSelection(pos); }
      });
      return {
        dom,
        selectNode() { dom.classList.add('is-selected'); },
        deselectNode() { dom.classList.remove('is-selected'); },
        stopEvent(e) { return !!(e.target.closest && e.target.closest('button')); },
        ignoreMutation() { return true; }
      };
    };
  },
  addCommands() {
    return { insertEmbed: url => ({ commands }) => commands.insertContent([{ type: this.name, attrs: { url } }, { type: 'paragraph' }]) };
  }
});

/* Keeps an empty paragraph at the end of the document, so there is always a place to type
   after an image, embed or divider (and the "+" menu can appear there). */
export const TrailingNode = Extension.create({
  name: 'trailingNode',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('trailingNode'),
      appendTransaction: (_trs, _old, state) => {
        const last = state.doc.lastChild;
        if (last && last.type.name === 'paragraph') return null;
        return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
      }
    })];
  }
});
