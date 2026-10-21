// Render a document model to HTML (used for the in-browser preview and the attorney view).

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

export function renderDocHtml(d, { showAttorneyNotes = false } = {}) {
  const out = [`<article class="legal-doc" data-type="${esc(d.type)}">`];
  for (const b of d.blocks) {
    switch (b.type) {
      case 'title': out.push(`<header class="ld-title"><h1>${inline(b.text)}</h1>${b.sub ? `<p class="ld-sub">${inline(b.sub)}</p>` : ''}</header>`); break;
      case 'h': out.push(`<h2 class="ld-h">${inline(b.text)}</h2>`); break;
      case 'h2': out.push(`<h3 class="ld-h2">${inline(b.text)}</h3>`); break;
      case 'p': out.push(`<p class="ld-p${b.small ? ' ld-small' : ''}${String(b.text).includes('\n') ? ' ld-left' : ''}">${inline(b.text)}</p>`); break;
      case 'box': out.push(`<div class="ld-box">${inline(b.text)}</div>`); break;
      case 'initial': out.push(`<p class="ld-initial"><span class="ld-initial-line"></span> ${inline(b.text)}</p>`); break;
      case 'list': {
        const tag = b.numbered ? 'ol' : 'ul';
        out.push(`<${tag} class="ld-list${b.plain ? ' ld-plain' : ''}">${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${tag}>`);
        break;
      }
      case 'sig':
        out.push(`<div class="ld-sig">${b.lines.map((l) => `<div class="ld-sigline"><div class="ld-sigrule">${l.value ? `<span>${inline(l.value)}</span>` : ''}</div><div class="ld-siglabel">${inline(l.label)}${l.date ? '<span class="ld-date">Date: ____________</span>' : ''}</div></div>`).join('')}</div>`);
        break;
      case 'pagebreak': out.push('<hr class="ld-break">'); break;
      case 'attorneyNote': if (showAttorneyNotes) out.push(`<aside class="ld-note"><strong>Attorney note:</strong> ${inline(b.text)}</aside>`); break;
      default: break;
    }
  }
  if (d.initials) out.push('<p class="ld-footer-preview">Each page footer: “Initials ______”</p>');
  out.push('</article>');
  return out.join('\n');
}
