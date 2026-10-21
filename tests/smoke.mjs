// Prueba de humo del motor: genera documentos con cada plantilla y verifica huellas y estructura.
import { writeFileSync, mkdirSync } from 'node:fs';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { makePreset, DEFAULT_EVENT, SAMPLE_DATASET, DEFAULT_SETTINGS } from '../src/lib/presets.js';
import { autoMap } from '../src/lib/fields.js';
import { issueDocuments } from '../src/lib/issue.js';
import { sha256Hex } from '../src/lib/ids.js';

const out = new URL('./out/', import.meta.url);
mkdirSync(out, { recursive: true });
const fakeLogo = await QRCode.toDataURL('logo', { width: 240, margin: 0 });
const mapping = autoMap(SAMPLE_DATASET.columns);
console.log('mapeo', mapping);
const settings = { ...DEFAULT_SETTINGS, baseUrl: 'https://usuario.github.io/certifica' };

for (const key of ['certificado', 'invitacion', 'aceptacion', 'credencial']) {
  const t = makePreset(key);
  for (const el of t.elements) if (el.type === 'image' || el.type === 'signature') { el.src = fakeLogo; el.natW = 240; el.natH = 240; }
  const t0 = Date.now();
  const res = await issueDocuments({ template: t, event: DEFAULT_EVENT, rows: SAMPLE_DATASET.rows, mapping, settings });
  writeFileSync(new URL(`${key}.pdf`, out), res.mergedBytes);
  for (const it of res.items) {
    if (await sha256Hex(it.bytes) !== it.record.archivo_sha256) throw new Error('hash no coincide');
    const d = await PDFDocument.load(it.bytes);
    if (!d.getSubject().includes(it.record.id)) throw new Error('metadatos sin ID');
  }
  console.log(key, `${Date.now() - t0} ms`, res.items.map((i) => `${i.fileName} ${i.record.folio} ${i.record.codigo} ${i.record.documento}`));
}
console.log('OK');
