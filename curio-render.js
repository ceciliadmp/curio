/* curió · renderizador de artigos
   Transforma o JSON estruturado do editor (formato ProseMirror/TipTap) em HTML seguro.
   Só nós e marcas conhecidos viram HTML; todo texto é escapado e todo link é validado.
   Usado pelo site (index.html) e pelo admin (pré-visualização). */
(function (root) {
  'use strict';

  var WORDS_PER_MINUTE = 200;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Only http(s) and mailto links survive. */
  function safeUrl(u, allowMail) {
    try {
      var url = new URL(String(u || '').trim());
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
      if (allowMail && url.protocol === 'mailto:') return url.href;
    } catch (e) { /* invalid */ }
    return '';
  }

  /* Images may also be inline data URIs (demo mode / pasted images before upload). */
  function safeImg(u) {
    if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+\/=]+$/i.test(String(u || ''))) return String(u);
    return safeUrl(u);
  }

  /* ---------- embeds: video and rich embeds from a pasted URL ---------- */
  function embedInfo(raw) {
    var href = safeUrl(raw);
    if (!href) return null;
    var u = new URL(href), host = u.hostname.replace(/^www\./, ''), p = u.pathname, m;

    if (host === 'youtu.be' && (m = p.match(/^\/([\w-]{6,})/)))
      return { kind: 'video', provider: 'YouTube', url: href, src: 'https://www.youtube-nocookie.com/embed/' + m[1] };
    if (/(^|\.)youtube\.com$/.test(host)) {
      var id = u.searchParams.get('v') || ((m = p.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)) && m[1]);
      if (id && /^[\w-]+$/.test(id)) return { kind: 'video', provider: 'YouTube', url: href, src: 'https://www.youtube-nocookie.com/embed/' + id };
    }
    if (/(^|\.)vimeo\.com$/.test(host) && (m = p.match(/\/(\d{5,})/)))
      return { kind: 'video', provider: 'Vimeo', url: href, src: 'https://player.vimeo.com/video/' + m[1] };
    if ((host === 'twitter.com' || host === 'x.com') && (m = p.match(/\/status\/(\d+)/)))
      return { kind: 'rich', provider: 'X (Twitter)', url: href, src: 'https://platform.twitter.com/embed/Tweet.html?dnt=true&id=' + m[1], height: 560 };
    if (host === 'instagram.com' && (m = p.match(/^\/(p|reel|tv)\/([\w-]+)/)))
      return { kind: 'rich', provider: 'Instagram', url: href, src: 'https://www.instagram.com/' + m[1] + '/' + m[2] + '/embed', height: 640 };
    if (host === 'gist.github.com' && (m = p.match(/^\/([\w-]+)\/([0-9a-f]+)/i)))
      return { kind: 'rich', provider: 'GitHub Gist', url: href, height: 380,
        srcdoc: '<!doctype html><base target="_blank"><style>body{margin:0}</style><script src="https://gist.github.com/' + m[1] + '/' + m[2] + '.js"><\/script>' };
    if (host === 'codepen.io' && (m = p.match(/^\/([\w-]+)\/(?:pen|full|details)\/(\w+)/)))
      return { kind: 'rich', provider: 'CodePen', url: href, src: 'https://codepen.io/' + m[1] + '/embed/' + m[2] + '?default-tab=result', height: 420 };
    if (host === 'open.spotify.com' && (m = p.match(/^\/(?:intl-\w+\/)?(track|album|playlist|episode|show|artist)\/(\w+)/)))
      return { kind: 'rich', provider: 'Spotify', url: href, src: 'https://open.spotify.com/embed/' + m[1] + '/' + m[2],
        height: (m[1] === 'track' || m[1] === 'episode') ? 152 : 352 };
    return { kind: 'link', provider: host, url: href };
  }

  function embedHTML(raw) {
    var e = embedInfo(raw);
    if (!e) return '';
    if (e.kind === 'video')
      return '<div class="embed embed-video"><iframe src="' + esc(e.src) + '" title="Vídeo do ' + esc(e.provider) + '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
    if (e.kind === 'rich') {
      var src = e.srcdoc ? ' srcdoc="' + esc(e.srcdoc) + '" sandbox="allow-scripts allow-popups"' : ' src="' + esc(e.src) + '"';
      return '<div class="embed embed-rich"><iframe' + src + ' title="Conteúdo do ' + esc(e.provider) + '" loading="lazy" style="height:' + (+e.height || 400) + 'px" allow="encrypted-media; clipboard-write; fullscreen"></iframe></div>';
    }
    return '<a class="embed embed-link" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer"><span class="embed-link-host">' + esc(e.provider) + '</span><span class="embed-link-url">' + esc(e.url) + '</span></a>';
  }

  /* ---------- JSON → HTML ---------- */
  function marks(text, ms) {
    var out = esc(text);
    (ms || []).forEach(function (m) {
      if (m.type === 'bold') out = '<strong>' + out + '</strong>';
      else if (m.type === 'italic') out = '<em>' + out + '</em>';
      else if (m.type === 'link') {
        var href = safeUrl(m.attrs && m.attrs.href, true);
        if (href) out = '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + out + '</a>';
      }
    });
    return out;
  }

  function inline(nodes) {
    return (nodes || []).map(function (n) {
      if (n.type === 'text') return marks(n.text, n.marks);
      if (n.type === 'hardBreak') return '<br>';
      return '';
    }).join('');
  }

  var LAYOUTS = { normal: 1, outset: 1, full: 1 };

  function block(n) {
    var a = n.attrs || {};
    switch (n.type) {
      case 'paragraph': return '<p>' + inline(n.content) + '</p>';
      case 'heading': var l = a.level === 3 ? 3 : 2; return '<h' + l + '>' + inline(n.content) + '</h' + l + '>';
      case 'pullQuote': return '<blockquote class="pull-quote"><p>' + inline(n.content) + '</p></blockquote>';
      case 'horizontalRule': return '<hr class="divider">';
      case 'bulletList': return '<ul>' + (n.content || []).map(block).join('') + '</ul>';
      case 'orderedList': return '<ol>' + (n.content || []).map(block).join('') + '</ol>';
      case 'listItem': return '<li>' + (n.content || []).map(block).join('') + '</li>';
      case 'figure':
        var src = safeImg(a.src);
        if (!src) return '';
        var layout = LAYOUTS[a.layout] ? a.layout : 'normal';
        return '<figure class="fig fig--' + layout + '"><img src="' + esc(src) + '" alt="' + esc(a.alt) + '" loading="lazy">' +
          (a.caption ? '<figcaption>' + esc(a.caption) + '</figcaption>' : '') + '</figure>';
      case 'embed': return embedHTML(a.url);
      default: return '';
    }
  }

  function toHTML(doc) {
    if (!doc || doc.type !== 'doc') return '';
    return (doc.content || []).map(block).join('\n');
  }

  /* ---------- reading time ---------- */
  function textOf(n) {
    if (!n) return '';
    if (n.type === 'text') return n.text || '';
    var own = (n.type === 'figure' && n.attrs && n.attrs.caption) ? n.attrs.caption + ' ' : '';
    return own + (n.content || []).map(textOf).join(' ');
  }
  function wordCount(doc, title, subtitle) {
    var t = [title || '', subtitle || '', textOf(doc)].join(' ').trim();
    return t ? t.split(/\s+/).filter(Boolean).length : 0;
  }
  function readingMinutes(words) { return Math.max(1, Math.ceil((words || 0) / WORDS_PER_MINUTE)); }

  /* Image sources in document order (for choosing a cover). */
  function images(doc) {
    var out = [];
    (function walk(n) {
      if (!n) return;
      if (n.type === 'figure' && n.attrs && safeImg(n.attrs.src)) out.push(n.attrs.src);
      (n.content || []).forEach(walk);
    })(doc);
    return out;
  }

  function slugify(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'artigo';
  }

  root.CurioRender = { esc: esc, safeUrl: safeUrl, safeImg: safeImg, embedInfo: embedInfo, embedHTML: embedHTML, toHTML: toHTML,
    wordCount: wordCount, readingMinutes: readingMinutes, images: images, slugify: slugify };
})(typeof window !== 'undefined' ? window : globalThis);
