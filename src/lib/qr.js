import QRCode from 'qrcode';

// Devuelve la matriz del QR como franjas horizontales para dibujarla en vector (PDF y SVG).
export function qrRects(text, ecl = 'M') {
  const qr = QRCode.create(text, { errorCorrectionLevel: ecl });
  const n = qr.modules.size;
  const rects = [];
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (qr.modules.get(r, c)) {
        const s = c;
        while (c < n && qr.modules.get(r, c)) c++;
        rects.push([s, r, c - s]);
      } else c++;
    }
  }
  return { n, rects };
}
