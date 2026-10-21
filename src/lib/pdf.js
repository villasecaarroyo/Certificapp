import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildScene } from './scene.js';

const STD = {
  helvetica: { r: StandardFonts.Helvetica, b: StandardFonts.HelveticaBold, i: StandardFonts.HelveticaOblique, bi: StandardFonts.HelveticaBoldOblique },
  times: { r: StandardFonts.TimesRoman, b: StandardFonts.TimesRomanBold, i: StandardFonts.TimesRomanItalic, bi: StandardFonts.TimesRomanBoldItalic },
  courier: { r: StandardFonts.Courier, b: StandardFonts.CourierBold, i: StandardFonts.CourierOblique, bi: StandardFonts.CourierBoldOblique },
};

export function dataUrlToBytes(url) {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function color(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function familiesUsed(t) {
  const s = new Set(['helvetica']);
  for (const e of t.elements || []) if (e.type === 'text' || e.type === 'signature') s.add(e.font || 'helvetica');
  return [...s];
}

function canEncode(font, ch) {
  try { font.widthOfTextAtSize(ch, 10); return true; } catch { return false; }
}

export function applyMeta(doc, m = {}) {
  if (m.title) doc.setTitle(m.title, { showInWindowTitleBar: true });
  if (m.author) doc.setAuthor(m.author);
  if (m.subject) doc.setSubject(m.subject);
  if (m.keywords) doc.setKeywords(m.keywords.filter(Boolean));
  doc.setCreator('Certifica — emisor de documentos académicos');
  doc.setProducer('Certifica (pdf-lib)');
  doc.setLanguage('es-CL');
}

export async function createPdfRenderer(template) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const customs = new Map((template.fonts || []).map((f) => [f.name, f]));
  const fonts = {};
  for (const fam of familiesUsed(template)) {
    if (customs.has(fam)) {
      const f = await doc.embedFont(dataUrlToBytes(customs.get(fam).data), { subset: true });
      fonts[fam] = { r: f, b: f, i: f, bi: f };
    } else {
      const m = STD[fam] || STD.helvetica;
      fonts[fam] = { r: await doc.embedFont(m.r), b: await doc.embedFont(m.b), i: await doc.embedFont(m.i), bi: await doc.embedFont(m.bi) };
    }
  }
  const fontFor = (family, bold, italic) => {
    const f = fonts[family] || fonts.helvetica;
    return bold && italic ? f.bi : bold ? f.b : italic ? f.i : f.r;
  };
  const measure = (t, s, st) => fontFor(st.family, st.bold, st.italic).widthOfTextAtSize(t, s);

  // Las fuentes estándar del PDF usan WinAnsi: se reemplazan caracteres no representables.
  const ok = new Map();
  const sanitize = (text, family) => {
    const font = (fonts[family] || fonts.helvetica).r;
    let out = '';
    for (const ch of text) {
      if (ch === '\n') { out += ch; continue; }
      const key = family + ch;
      let good = ok.get(key);
      if (good === undefined) { good = canEncode(font, ch); ok.set(key, good); }
      if (good) { out += ch; continue; }
      if (/\s/.test(ch)) { out += ' '; continue; }
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base && base !== ch && canEncode(font, base) ? base : '?';
    }
    return out;
  };

  const imgs = new Map();
  const image = async (src) => {
    if (!imgs.has(src)) {
      const bytes = dataUrlToBytes(src);
      imgs.set(src, src.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes));
    }
    return imgs.get(src);
  };

  async function addPage(vars) {
    const scene = buildScene(template, vars, measure, { sanitize });
    const H = scene.H;
    const page = doc.addPage([scene.W, scene.H]);
    for (const p of scene.prims) {
      if (p.kind === 'image') {
        page.drawImage(await image(p.src), { x: p.x, y: H - p.y - p.h, width: p.w, height: p.h, opacity: p.opacity });
      } else if (p.kind === 'text') {
        page.drawText(p.text, { x: p.x, y: H - p.y, size: p.size, font: fontFor(p.family, p.bold, p.italic), color: color(p.color), opacity: p.opacity });
      } else if (p.kind === 'rect') {
        const o = { x: p.x, y: H - p.y - p.h, width: p.w, height: p.h, opacity: p.opacity };
        if (p.fill) o.color = color(p.fill);
        if (p.stroke && p.strokeWidth) { o.borderColor = color(p.stroke); o.borderWidth = p.strokeWidth; o.borderOpacity = p.opacity; }
        if (o.color || o.borderColor) page.drawRectangle(o);
      } else if (p.kind === 'qr') {
        const mod = p.size / (p.n + 2 * p.margin);
        if (p.bg) page.drawRectangle({ x: p.x, y: H - p.y - p.size, width: p.size, height: p.size, color: color(p.bg), opacity: p.opacity });
        const c = color(p.color);
        for (const [col, row, len] of p.rects) {
          page.drawRectangle({
            x: p.x + (col + p.margin) * mod, y: H - (p.y + (row + p.margin + 1) * mod),
            width: len * mod + 0.03, height: mod + 0.03, color: c, opacity: p.opacity,
          });
        }
      }
    }
  }

  return { doc, addPage, setMeta: (m) => applyMeta(doc, m), save: () => doc.save() };
}

export async function renderPdf(template, varsList, meta) {
  const r = await createPdfRenderer(template);
  for (const v of varsList) await r.addPage(v);
  r.setMeta(meta);
  return r.save();
}
