// A tiny document model shared by the HTML preview and the DOCX renderer.
// Inline **bold** is supported inside text.

export const title = (text, sub) => ({ type: 'title', text, sub });
export const h = (text) => ({ type: 'h', text });
export const h2 = (text) => ({ type: 'h2', text });
export const p = (text, opts = {}) => ({ type: 'p', text, ...opts });
export const list = (items, opts = {}) => ({ type: 'list', items: items.filter(Boolean), ...opts });
export const initial = (text) => ({ type: 'initial', text });
export const pageBreak = () => ({ type: 'pagebreak' });
export const box = (text) => ({ type: 'box', text });
// Signature block: lines = [{ label, value? }]
export const sig = (lines, opts = {}) => ({ type: 'sig', lines, ...opts });
// Attorney-only drafting note; never printed in the client's final documents.
export const attorneyNote = (text) => ({ type: 'attorneyNote', text });

export function doc(meta, blocks) {
  return { ...meta, blocks: blocks.flat().filter(Boolean) };
}

// Numbered sections inside an article: sec('1.1', 'Heading', 'text…')
export const sec = (num, heading, text) => p(`**${num} ${heading}.** ${text}`);
