// Render document models to Word (.docx) so the attorney can edit and the client can print.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, Packer, PageBreak, PageNumber, Paragraph, TabStopType, TextRun,
} from 'docx';

const FONT = 'Times New Roman';
const SIZE = 24; // 12pt

function runs(text, base = {}) {
  const out = [];
  String(text ?? '').split('\n').forEach((line, li) => {
    const parts = line.split(/(\*\*.+?\*\*)/g).filter((x) => x !== '');
    parts.forEach((part, pi) => {
      const bold = /^\*\*.+\*\*$/.test(part);
      out.push(new TextRun({ text: bold ? part.slice(2, -2) : part, bold: bold || base.bold, size: base.size || SIZE, font: FONT, break: li > 0 && pi === 0 ? 1 : undefined, italics: base.italics }));
    });
    if (!parts.length && li > 0) out.push(new TextRun({ text: '', break: 1 }));
  });
  return out;
}

function blockToParagraphs(b, { showAttorneyNotes }) {
  const sp = { after: 160, line: 276 };
  switch (b.type) {
    case 'title':
      return [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: b.sub ? 80 : 320 }, children: runs(b.text, { bold: true, size: 30 }) }),
        ...(b.sub ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: runs(b.sub, { size: 22, italics: true }) })] : []),
      ];
    case 'h':
      return [new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 240, after: 160 }, children: runs(b.text, { bold: true }) })];
    case 'h2':
      return [new Paragraph({ keepNext: true, spacing: { before: 200, after: 100 }, children: runs(b.text, { bold: true }) })];
    case 'p':
      return [new Paragraph({ alignment: String(b.text).includes('\n') ? AlignmentType.LEFT : AlignmentType.JUSTIFIED, spacing: sp, keepNext: !!b.keep, children: runs(b.text, b.small ? { size: 20 } : {}) })];
    case 'box': {
      const border = { style: BorderStyle.SINGLE, size: 8, color: '000000', space: 6 };
      return [new Paragraph({ spacing: { before: 120, after: 200 }, border: { top: border, bottom: border, left: border, right: border }, children: runs(b.text, { bold: true }) })];
    }
    case 'initial':
      return [new Paragraph({ spacing: sp, children: [new TextRun({ text: '________  ', font: FONT, size: SIZE }), ...runs(`(Initials) ${b.text}`, { italics: true })] })];
    case 'list':
      return b.items.map((item, i) => new Paragraph({
        spacing: { after: 100 },
        indent: b.plain ? { left: 360 } : { left: 720, hanging: 360 },
        children: b.plain ? runs(item) : [new TextRun({ text: b.numbered ? `${i + 1}.\t` : '•\t', font: FONT, size: SIZE }), ...runs(item)],
        tabStops: [{ type: TabStopType.LEFT, position: 720 }],
      }));
    case 'sig':
      // Keep a whole signature block on one page.
      return b.lines.flatMap((l, i) => [
        new Paragraph({ spacing: { before: 280, after: 0 }, keepNext: true, children: [new TextRun({ text: l.value ? `${l.value}` : '', font: FONT, size: SIZE })] }),
        new Paragraph({ keepNext: true, spacing: { after: 0 }, border: { top: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } }, indent: { right: 3600 }, children: [] }),
        new Paragraph({ keepNext: i < b.lines.length - 1, spacing: { after: 40 }, children: runs(`${l.label}${l.date ? '          Date: ______________' : ''}`, { size: 20 }) }),
      ]);
    case 'pagebreak':
      return [new Paragraph({ children: [new PageBreak()] })];
    case 'attorneyNote':
      return showAttorneyNotes ? [new Paragraph({ spacing: sp, shading: { fill: 'FFF4CC' }, children: runs(`ATTORNEY NOTE (delete before signing): ${b.text}`, { italics: true, size: 20 }) })] : [];
    default:
      return [];
  }
}

function section(d, { draft, showAttorneyNotes }) {
  const footerRuns = [
    new TextRun({ text: `${d.footer || d.title} — Page `, font: FONT, size: 18 }),
    new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18 }),
    new TextRun({ text: ' of ', font: FONT, size: 18 }),
    new TextRun({ children: [PageNumber.TOTAL_PAGES_IN_SECTION], font: FONT, size: 18 }),
  ];
  if (d.initials) footerRuns.push(new TextRun({ text: '          Initials: ________', font: FONT, size: 18 }));
  return {
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, pageNumbers: { start: 1 } } },
    headers: draft ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'DRAFT — PENDING ATTORNEY REVIEW — DO NOT SIGN', bold: true, color: 'B00020', font: FONT, size: 18 })] })] }) } : undefined,
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: footerRuns })] }) },
    children: d.blocks.flatMap((b) => blockToParagraphs(b, { showAttorneyNotes })),
  };
}

// docs: array of document models. Each becomes its own section (own page numbering).
export async function renderDocx(docs, { draft = true, showAttorneyNotes = false, title = 'Estate plan' } = {}) {
  const document = new Document({
    title,
    creator: 'Great Lakes Wills & Estate',
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: docs.map((d) => section(d, { draft, showAttorneyNotes })),
  });
  return Packer.toBuffer(document);
}
