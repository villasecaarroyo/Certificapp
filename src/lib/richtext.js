// Maquetación de texto con **negrita**, *cursiva*, saltos de línea, ajuste y reducción automática.
// La misma función se usa en la vista previa (medición con canvas) y en el PDF (métricas de pdf-lib).

export function parseRuns(text) {
  const runs = [];
  let bold = false, italic = false, buf = '';
  const flush = () => { if (buf) runs.push({ text: buf, bold, italic }); buf = ''; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '*') { buf += '*'; i++; continue; }
    if (ch === '*' && text[i + 1] === '*') { flush(); bold = !bold; i++; continue; }
    if (ch === '*') { flush(); italic = !italic; continue; }
    buf += ch;
  }
  flush();
  return runs;
}

function toItems(text) {
  const items = [];
  let word = null;
  for (const run of parseRuns(text)) {
    for (const part of run.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        word = null;
        const n = (part.match(/\n/g) || []).length;
        if (n) for (let k = 0; k < n; k++) items.push({ br: true });
        else items.push({ space: true, bold: run.bold, italic: run.italic });
      } else {
        if (!word) { word = { segs: [] }; items.push(word); }
        word.segs.push({ text: part, bold: run.bold, italic: run.italic });
      }
    }
  }
  return items;
}

function breakLines(items, maxW, size, measure) {
  const newLine = () => ({ words: [], width: 0, last: false });
  const lines = [];
  let line = newLine();
  let pending = 0;
  for (const it of items) {
    if (it.br) { line.last = true; lines.push(line); line = newLine(); pending = 0; continue; }
    if (it.space) { if (line.words.length) pending = measure(' ', size, it); continue; }
    let x = 0;
    const segs = it.segs.map((s) => {
      const seg = { text: s.text, bold: s.bold, italic: s.italic, dx: x };
      x += measure(s.text, size, s);
      return seg;
    });
    if (line.words.length && line.width + pending + x > maxW) { lines.push(line); line = newLine(); pending = 0; }
    const wx = line.words.length ? line.width + pending : 0;
    line.words.push({ x: wx, w: x, segs });
    line.width = wx + x;
    pending = 0;
  }
  line.last = true;
  lines.push(line);
  return lines;
}

// fit: 'single' (una línea, reduce hasta caber), 'shrink' (ajusta y reduce para caber en la caja), 'wrap' (solo ajusta)
export function layoutText(text, { width, height, size, minSize, lineHeight = 1.2, fit = 'shrink', measure }) {
  const items = toItems(text);
  const min = Math.min(size, minSize || Math.max(5, size * 0.45));
  if (fit === 'wrap') return { size, lines: breakLines(items, width, size, measure) };
  let s = size;
  for (;;) {
    const lines = breakLines(items, fit === 'single' ? Infinity : width, s, measure);
    const widthOk = lines.every((l) => l.width <= width + 0.01);
    const heightOk = fit === 'single' || lines.length * s * lineHeight <= height + 0.01;
    if ((widthOk && heightOk) || s <= min) return { size: s, lines };
    s = Math.max(min, s - (s > 14 ? 0.5 : 0.25));
  }
}
