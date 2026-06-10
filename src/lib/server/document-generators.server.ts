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