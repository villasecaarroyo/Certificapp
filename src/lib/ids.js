export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const shortId = () => uuid().slice(0, 8);

export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function shortCode(hash) {
  const s = hash.slice(0, 12).toUpperCase();
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

// Enmascara un RUT/DNI para publicarlo: 12.345.678-5 → 12.•••.•••-5
export function maskDoc(doc) {
  const s = String(doc || '').trim();
  if (!s) return '';
  if (s.length <= 4) return '•'.repeat(s.length);
  return s.slice(0, 2) + s.slice(2, -2).replace(/[0-9A-Za-z]/g, '•') + s.slice(-2);
}
