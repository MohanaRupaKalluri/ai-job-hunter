import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ResumeDoc = {
  name: string;
  contact: { email?: string; phone?: string; location?: string; links?: string[] };
  summary: string;
  skills: string[];
  experience: { title: string; company: string; period: string; bullets: string[] }[];
  education: { school: string; degree: string; period: string }[];
};

export async function resumeToDocx(r: ResumeDoc): Promise<Uint8Array> {
  const sec = (title: string) =>
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: title, bold: true })] });
  const para = (text: string) => new Paragraph({ children: [new TextRun(text)] });
  const bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 } });

  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: r.name, bold: true })] }),
    para(
      [r.contact.email, r.contact.phone, r.contact.location, ...(r.contact.links ?? [])]
        .filter(Boolean)
        .join("  •  "),
    ),
    sec("Summary"),
    para(r.summary),
    sec("Skills"),
    para(r.skills.join(" • ")),
    sec("Experience"),
  ];
  for (const e of r.experience) {
    children.push(new Paragraph({ children: [new TextRun({ text: `${e.title} — ${e.company}`, bold: true })] }));
    children.push(para(e.period));
    for (const b of e.bullets) children.push(bullet(b));
  }
  children.push(sec("Education"));
  for (const ed of r.education) {
    children.push(new Paragraph({ children: [new TextRun({ text: `${ed.degree}, ${ed.school}`, bold: true })] }));
    children.push(para(ed.period));
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf);
}

export async function textToPdf(title: string, body: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  const width = 612;
  const height = 792;
  const lineHeight = 14;
  const maxWidth = width - margin * 2;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const drawLine = (text: string, useFont = font, size = 11) => {
    if (y < margin + lineHeight) {
      page = pdf.addPage([width, height]);
      y = height - margin;
    }
    page.drawText(text, { x: margin, y, size, font: useFont, color: rgb(0.1, 0.1, 0.12) });
    y -= lineHeight;
  };

  const wrap = (text: string, useFont = font, size = 11): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (useFont.widthOfTextAtSize(test, size) > maxWidth) {
        if (line) lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };

  drawLine(title, bold, 16);
  y -= 6;
  for (const raw of body.split(/\r?\n/)) {
    if (!raw.trim()) {
      y -= lineHeight / 2;
      continue;
    }
    const isHeading = /^#{1,3}\s+/.test(raw);
    const text = raw.replace(/^#{1,3}\s+/, "").replace(/^[-*]\s+/, "• ");
    const useFont = isHeading ? bold : font;
    const size = isHeading ? 13 : 11;
    for (const line of wrap(text, useFont, size)) drawLine(line, useFont, size);
    if (isHeading) y -= 4;
  }

  return await pdf.save();
}

// ATS-friendly compact resume PDF. Renders the structured ResumeDoc directly
// instead of going through plain text → that lets us control spacing, keep
// the education block together, and keep most resumes on one page. When the
// first pass overflows, we automatically retry with tighter typography so
// resumes don't bleed onto a nearly-empty second page.
export async function resumeToPdf(r: ResumeDoc): Promise<Uint8Array> {
  const passes = [
    { margin: 40, fontSize: 10, lineHeight: 12, sectionGap: 6, headerSize: 18, sectionSize: 11 },
    { margin: 36, fontSize: 9.5, lineHeight: 11, sectionGap: 5, headerSize: 16, sectionSize: 10.5 },
    { margin: 32, fontSize: 9, lineHeight: 10.5, sectionGap: 4, headerSize: 15, sectionSize: 10 },
  ];
  let last: { bytes: Uint8Array; pages: number } | null = null;
  for (const pass of passes) {
    const out = await renderResumePdf(r, pass);
    last = out;
    if (out.pages <= 1) return out.bytes;
  }
  return last!.bytes;
}

type RenderOpts = {
  margin: number;
  fontSize: number;
  lineHeight: number;
  sectionGap: number;
  headerSize: number;
  sectionSize: number;
};

async function renderResumePdf(r: ResumeDoc, opts: RenderOpts): Promise<{ bytes: Uint8Array; pages: number }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { margin, lineHeight, sectionGap, fontSize, headerSize, sectionSize } = opts;
  const width = 612;
  const height = 792;
  const maxWidth = width - margin * 2;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const newPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
  };
  const ensure = (needed: number) => {
    if (y - needed < margin) newPage();
  };
  const wrap = (text: string, f = font, size = fontSize): string[] => {
    const words = (text ?? "").split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (f.widthOfTextAtSize(test, size) > maxWidth) {
        if (line) lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };
  const draw = (text: string, f = font, size = fontSize) => {
    ensure(lineHeight);
    page.drawText(text, { x: margin, y: y - size, size, font: f, color: rgb(0.1, 0.1, 0.12) });
    y -= lineHeight;
  };
  const para = (text: string, f = font, size = fontSize) => {
    for (const ln of wrap(text, f, size)) draw(ln, f, size);
  };
  const heading = (text: string) => {
    ensure(lineHeight + sectionGap);
    y -= 2;
    page.drawText(text.toUpperCase(), { x: margin, y: y - sectionSize, size: sectionSize, font: bold, color: rgb(0.1, 0.1, 0.12) });
    y -= lineHeight + 1;
    page.drawLine({
      start: { x: margin, y: y + 4 },
      end: { x: width - margin, y: y + 4 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.75),
    });
    y -= sectionGap;
  };

  // Header
  ensure(headerSize + 10);
  page.drawText(r.name || "", { x: margin, y: y - headerSize, size: headerSize, font: bold, color: rgb(0.1, 0.1, 0.12) });
  y -= headerSize + 4;
  const contactLine = [r.contact.email, r.contact.phone, r.contact.location, ...(r.contact.links ?? [])]
    .filter(Boolean)
    .join("  •  ");
  if (contactLine) {
    const cSize = Math.max(8, fontSize - 1);
    page.drawText(contactLine, { x: margin, y: y - cSize, size: cSize, font, color: rgb(0.35, 0.35, 0.4) });
    y -= cSize + 5;
  }

  if (r.summary?.trim()) {
    heading("Summary");
    para(r.summary);
  }
  if (r.skills?.length) {
    heading("Skills");
    para(r.skills.join(" • "));
  }
  if (r.experience?.length) {
    heading("Experience");
    for (const e of r.experience) {
      ensure(lineHeight * 2 + e.bullets.length * lineHeight);
      draw(`${e.title} — ${e.company}`, bold, fontSize);
      draw(e.period, font, Math.max(8, fontSize - 1));
      for (const b of e.bullets) para(`• ${b}`);
      y -= 2;
    }
  }
  if (r.education?.length) {
    // Keep education entries on the same page when possible.
    const eduHeight = lineHeight + sectionGap + r.education.length * (lineHeight * 2 + 2);
    if (y - eduHeight < margin) newPage();
    heading("Education");
    for (const ed of r.education) {
      draw(`${ed.degree}, ${ed.school}`, bold, fontSize);
      draw(ed.period, font, Math.max(8, fontSize - 1));
      y -= 2;
    }
  }

  const bytes = await pdf.save();
  return { bytes, pages: pdf.getPageCount() };
}

export function resumeToPlainText(r: ResumeDoc): string {
  const lines: string[] = [];
  lines.push(`# ${r.name}`);
  lines.push(
    [r.contact.email, r.contact.phone, r.contact.location, ...(r.contact.links ?? [])].filter(Boolean).join(" • "),
  );
  lines.push("");
  lines.push("## Summary");
  lines.push(r.summary);
  lines.push("");
  lines.push("## Skills");
  lines.push(r.skills.join(" • "));
  lines.push("");
  lines.push("## Experience");
  for (const e of r.experience) {
    lines.push(`### ${e.title} — ${e.company}`);
    lines.push(e.period);
    for (const b of e.bullets) lines.push(`- ${b}`);
    lines.push("");
  }
  lines.push("## Education");
  for (const ed of r.education) {
    lines.push(`### ${ed.degree}, ${ed.school}`);
    lines.push(ed.period);
  }
  return lines.join("\n");
}