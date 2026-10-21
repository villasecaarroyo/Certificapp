// Convierte una plantilla + variables en primitivas de dibujo (imagen, texto, rectángulo, QR).
// El editor las pinta en SVG y el generador las escribe en PDF: misma geometría en ambos.
import { layoutText } from './richtext.js';
import { fill } from './fields.js';
import { qrRects } from './qr.js';
import { pageDims } from './page.js';

function fitImage(src, nw, nh, box, mode = 'contain', opacity = 1, valign = 'middle') {
  if (!nw || !nh || mode === 'stretch') return { kind: 'image', src, x: box.x, y: box.y, w: box.w, h: box.h, opacity };
  const s = mode === 'cover' ? Math.max(box.w / nw, box.h / nh) : Math.min(box.w / nw, box.h / nh);
  const w = nw * s, h = nh * s;
  const y = valign === 'bottom' ? box.y + box.h - h : valign === 'top' ? box.y : box.y + (box.h - h) / 2;
  return { kind: 'image', src, x: box.x + (box.w - w) / 2, y, w, h, opacity };
}

function emitText(prims, lay, box, st, elId) {
  const L = lay.size * st.lineHeight;
  const total = lay.lines.length * L;
  const top = box.y + (st.valign === 'middle' ? (box.h - total) / 2 : st.valign === 'bottom' ? box.h - total : 0);
  lay.lines.forEach((line, i) => {
    const baseline = top + i * L + L / 2 + 0.34 * lay.size;
    let offset = 0, extra = 0;
    if (st.align === 'center') offset = (box.w - line.width) / 2;
    else if (st.align === 'right') offset = box.w - line.width;
    else if (st.align === 'justify' && !line.last && line.words.length > 1) extra = Math.max(0, (box.w - line.width) / (line.words.length - 1));
    line.words.forEach((w, wi) => {
      for (const seg of w.segs) {
        prims.push({
          kind: 'text', text: seg.text, x: box.x + offset + w.x + seg.dx + extra * wi, y: baseline,
          size: lay.size, family: st.family, bold: st.bold || seg.bold, italic: st.italic || seg.italic,
          color: st.color, opacity: st.opacity, elId,
        });
      }
    });
  });
}

export function buildScene(template, vars, measure, opts = {}) {
  const [W, H] = pageDims(template.page);
  const prims = [];
  const san = opts.sanitize || ((t) => t);
  const bg = template.background;
  if (bg?.src) prims.push(fitImage(bg.src, bg.w, bg.h, { x: 0, y: 0, w: W, h: H }, bg.fit || 'cover', bg.opacity ?? 1));

  for (const el of template.elements || []) {
    if (el.hidden) continue;
    const op = el.opacity ?? 1;
    try {
      if (el.type === 'rect') {
        prims.push({ kind: 'rect', x: el.x, y: el.y, w: el.w, h: el.h, fill: el.fill || null, stroke: el.stroke || null, strokeWidth: el.strokeWidth || 0, opacity: op, elId: el.id });
      } else if (el.type === 'image') {
        if (el.src) prims.push({ ...fitImage(el.src, el.natW, el.natH, el, el.fit || 'contain', op), elId: el.id });
      } else if (el.type === 'text') {
        const family = el.font || 'helvetica';
        let text = fill(el.text, vars);
        if (el.uppercase) text = text.toLocaleUpperCase('es');
        text = san(text, family);
        if (!text) continue;
        const bold = !!el.bold, italic = !!el.italic;
        const lineHeight = el.lineHeight || 1.2;
        const lay = layoutText(text, {
          width: el.w, height: el.h, size: el.size || 12, minSize: el.minSize, lineHeight, fit: el.fit || 'shrink',
          measure: (t, s, seg) => measure(t, s, { family, bold: bold || seg.bold, italic: italic || seg.italic }),
        });
        emitText(prims, lay, el, { family, bold, italic, align: el.align || 'left', valign: el.valign || 'top', lineHeight, color: el.color || '#000000', opacity: op }, el.id);
      } else if (el.type === 'signature') {
        const family = el.font || 'helvetica';
        const ns = el.size || 10, ts = ns * 0.9, lh = 1.25;
        const color = el.color || '#000000';
        const name = san(fill(el.name || '', vars), family);
        const title = san(fill(el.title || '', vars), family);
        const mk = (b) => (t, s, seg) => measure(t, s, { family, bold: b || seg.bold, italic: seg.italic });
        const nameLay = name ? layoutText(name, { width: el.w, height: ns * lh, size: ns, lineHeight: lh, fit: 'single', measure: mk(true) }) : null;
        const titleLay = title ? layoutText(title, { width: el.w, height: ts * lh * 3, size: ts, lineHeight: lh, fit: 'shrink', measure: mk(false) }) : null;
        const nameH = nameLay ? nameLay.lines.length * nameLay.size * lh : 0;
        const titleH = titleLay ? titleLay.lines.length * titleLay.size * lh : 0;
        const imgH = Math.max(0, el.h - nameH - titleH - 4);
        if (el.src && imgH > 2) prims.push({ ...fitImage(el.src, el.natW, el.natH, { x: el.x, y: el.y, w: el.w, h: imgH }, 'contain', op, 'bottom'), elId: el.id });
        if (el.line !== false) prims.push({ kind: 'rect', x: el.x + el.w * 0.08, y: el.y + imgH + 1, w: el.w * 0.84, h: 0.6, fill: color, opacity: op, elId: el.id });
        let cy = el.y + imgH + 3;
        const st = { family, italic: false, align: 'center', valign: 'top', lineHeight: lh, color, opacity: op };
        if (nameLay) { emitText(prims, nameLay, { x: el.x, y: cy, w: el.w, h: nameH }, { ...st, bold: true }, el.id); cy += nameH; }
        if (titleLay) emitText(prims, titleLay, { x: el.x, y: cy, w: el.w, h: titleH }, { ...st, bold: false }, el.id);
      } else if (el.type === 'qr') {
        const content = fill(el.content || '{{url_verificacion}}', vars);
        if (!content) continue;
        const { n, rects } = qrRects(content, el.ecl || 'M');
        prims.push({ kind: 'qr', x: el.x, y: el.y, size: Math.min(el.w, el.h), n, rects, margin: el.margin ?? 1, color: el.color || '#000000', bg: el.bg === false ? null : '#ffffff', opacity: op, elId: el.id });
      }
    } catch (e) {
      if (opts.strict) throw e;
      console.warn('Elemento omitido', el, e);
    }
  }
  return { W, H, prims };
}
