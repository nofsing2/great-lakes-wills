// Render document models to PDF for clients without Word. Mirrors render-docx.js.
import PDFDocument from 'pdfkit';

const FONT = 'Times-Roman';
const BOLD = 'Times-Bold';
const ITALIC = 'Times-Italic';
const SIZE = 12;
const MARGIN = 72; // 1 inch

// Writes text with **bold** spans, wrapping within the current column.
function rich(pdf, text, { size = SIZE, align = 'justify', indent = 0, width, font = FONT } = {}) {
  const parts = String(text ?? '').split(/(\*\*.+?\*\*)/g).filter((x) => x !== '');
  // pdfkit drops leading spaces on continued fragments, so carry them onto the previous fragment.
  for (let i = 1; i < parts.length; i += 1) {
    const lead = parts[i].match(/^\s+/)?.[0];
    if (lead) { parts[i] = parts[i].slice(lead.length); parts[i - 1] = /^\*\*.+\*\*$/.test(parts[i - 1]) ? `**${parts[i - 1].slice(2, -2)}${lead}**` : parts[i - 1] + lead; }
  }
  if (!parts.length) { pdf.moveDown(0.5); return; }
  const x = pdf.page.margins.left + indent;
  const w = width || (pdf.page.width - pdf.page.margins.left - pdf.page.margins.right - indent);
  parts.forEach((part, i) => {
    const bold = /^\*\*.+\*\*$/.test(part);
    pdf.font(bold ? BOLD : font).fontSize(size);
    const t = bold ? part.slice(2, -2) : part;
    const opts = { width: w, align, continued: i < parts.length - 1, lineGap: 2 };
    if (i === 0) pdf.text(t, x, pdf.y, opts); else pdf.text(t, opts);
  });
}

function ensureRoom(pdf, needed) {
  if (pdf.y + needed > pdf.page.height - pdf.page.margins.bottom) pdf.addPage();
}

function block(pdf, b, { showAttorneyNotes }) {
  const left = pdf.page.margins.left;
  const width = pdf.page.width - left - pdf.page.margins.right;
  switch (b.type) {
    case 'title':
      pdf.font(BOLD).fontSize(15).text(b.text, left, pdf.y, { width, align: 'center', lineGap: 2 });
      if (b.sub) { pdf.moveDown(0.3); pdf.font(ITALIC).fontSize(11).text(b.sub, { width, align: 'center' }); }
      pdf.moveDown(1.2);
      break;
    case 'h':
      ensureRoom(pdf, 60);
      pdf.moveDown(0.6);
      pdf.font(BOLD).fontSize(SIZE).text(b.text, left, pdf.y, { width, align: 'center' });
      pdf.moveDown(0.5);
      break;
    case 'h2':
      ensureRoom(pdf, 50);
      pdf.moveDown(0.5);
      pdf.font(BOLD).fontSize(SIZE).text(b.text, left, pdf.y, { width });
      pdf.moveDown(0.3);
      break;
    case 'p':
      if (b.keep) ensureRoom(pdf, 140);
      rich(pdf, b.text, { size: b.small ? 10 : SIZE, align: String(b.text).includes('\n') ? 'left' : 'justify' });
      pdf.moveDown(0.6);
      break;
    case 'box': {
      ensureRoom(pdf, 60);
      const y0 = pdf.y;
      pdf.font(BOLD).fontSize(SIZE);
      const h = pdf.heightOfString(b.text, { width: width - 16, lineGap: 2 });
      pdf.rect(left, y0, width, h + 14).lineWidth(1).stroke();
      pdf.text(b.text, left + 8, y0 + 7, { width: width - 16, lineGap: 2 });
      pdf.y = y0 + h + 22;
      break;
    }
    case 'initial':
      ensureRoom(pdf, 30);
      pdf.font(FONT).fontSize(SIZE).text('________  ', left, pdf.y, { continued: true });
      pdf.font(ITALIC).text(`(Initials) ${b.text}`);
      pdf.moveDown(0.6);
      break;
    case 'list':
      b.items.forEach((item, i) => {
        ensureRoom(pdf, 30);
        const marker = b.plain ? '' : (b.numbered ? `${i + 1}.` : '•');
        const y = pdf.y;
        if (marker) pdf.font(FONT).fontSize(SIZE).text(marker, left + 14, y, { width: 22 });
        pdf.y = y;
        rich(pdf, item, { indent: b.plain ? 18 : 36, align: 'left' });
        pdf.moveDown(0.3);
      });
      pdf.moveDown(0.3);
      break;
    case 'sig':
      // Keep the whole signature block on one page.
      ensureRoom(pdf, Math.min(b.lines.length * 46, 600));
      b.lines.forEach((l) => {
        pdf.moveDown(1.2);
        const y = pdf.y;
        if (l.value) pdf.font(FONT).fontSize(SIZE).text(l.value, left, y - 2, { width: 300 });
        pdf.moveTo(left, y + 12).lineTo(left + 300, y + 12).lineWidth(0.7).stroke();
        pdf.font(FONT).fontSize(10).text(`${l.label}${l.date ? '          Date: ______________' : ''}`, left, y + 16, { width });
        pdf.y = y + 30;
      });
      pdf.moveDown(0.5);
      break;
    case 'pagebreak':
      pdf.addPage();
      break;
    case 'attorneyNote':
      if (showAttorneyNotes) {
        pdf.fillColor('#7a5c00');
        rich(pdf, `ATTORNEY NOTE (delete before signing): ${b.text}`, { size: 10, align: 'left', font: ITALIC });
        pdf.fillColor('black');
        pdf.moveDown(0.6);
      }
      break;
    default:
      break;
  }
}

export function renderPdf(docs, { draft = true, showAttorneyNotes = false, title = 'Estate plan' } = {}) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'LETTER', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, bufferPages: true, info: { Title: title, Creator: 'Great Lakes Wills & Estate' } });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const ranges = []; // per document: first page index, page count, footer text, initials
    docs.forEach((d, i) => {
      if (i > 0) pdf.addPage();
      const start = pdf.bufferedPageRange().start + pdf.bufferedPageRange().count - 1;
      for (const b of d.blocks) block(pdf, b, { showAttorneyNotes });
      const end = pdf.bufferedPageRange().start + pdf.bufferedPageRange().count - 1;
      ranges.push({ start, end, footer: d.footer || d.title, initials: !!d.initials });
    });

    // Footers ("Page 2 of 5") restart for each document; draft header on every page.
    for (const r of ranges) {
      const total = r.end - r.start + 1;
      for (let p = r.start; p <= r.end; p += 1) {
        pdf.switchToPage(p);
        // Writing inside the bottom margin would make pdfkit start a new page; lift the margin while drawing footers.
        const savedBottom = pdf.page.margins.bottom;
        pdf.page.margins.bottom = 0;
        const bottom = pdf.page.height - 48;
        const text = `${r.footer} — Page ${p - r.start + 1} of ${total}${r.initials ? '          Initials: ________' : ''}`;
        pdf.font(FONT).fontSize(9).fillColor('black').text(text, MARGIN, bottom, { width: pdf.page.width - MARGIN * 2, align: 'center', lineBreak: false });
        if (draft) pdf.font(BOLD).fontSize(9).fillColor('#b00020').text('DRAFT — PENDING ATTORNEY REVIEW — DO NOT SIGN', MARGIN, 36, { width: pdf.page.width - MARGIN * 2, align: 'center', lineBreak: false });
        pdf.fillColor('black');
        pdf.page.margins.bottom = savedBottom;
      }
    }
    pdf.end();
  });
}
