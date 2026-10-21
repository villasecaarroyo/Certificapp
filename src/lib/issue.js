// Emisión de lotes: asigna ID, folio y huellas, compone un PDF multipágina y lo separa en archivos individuales.
import { PDFDocument } from 'pdf-lib';
import { buildVars, fill, formatDate, safeFileName } from './fields.js';
import { uuid, sha256Hex, shortCode, maskDoc } from './ids.js';
import { createPdfRenderer, applyMeta } from './pdf.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

export function resolveBaseUrl(base) {
  const b = String(base || '').trim();
  if (b) return b.endsWith('/') ? b : `${b}/`;
  if (typeof window !== 'undefined') return `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}`;
  return './';
}

export function verifyUrl(base, id) {
  return `${resolveBaseUrl(base)}verify/?id=${encodeURIComponent(id)}`;
}

export function previewVarsFor({ event, row, mapping, settings, docLabel }) {
  return buildVars({
    event, row, mapping,
    system: {
      tipo_documento: docLabel || 'Documento',
      id: '00000000-VISTA-PREVIA',
      folio: `${settings.folioPrefix || ''}${String(settings.nextFolio || 1).padStart(4, '0')}`,
      codigo: 'XXXX-XXXX-XXXX',
      hash: '0'.repeat(64),
      fecha_emision: formatDate(new Date()),
      url_verificacion: verifyUrl(settings.baseUrl, 'VISTA-PREVIA'),
    },
  });
}

export async function issueDocuments({ template, event, rows, mapping, settings, onProgress, shouldCancel }) {
  let folioNum = Number(settings.nextFolio) || 1;
  const docLabel = template.docLabel || 'Documento';
  const n = rows.length;
  const check = () => { if (shouldCancel?.()) throw new Error('Emisión cancelada. No se registró ningún documento.'); };

  // 1. Identificadores y variables
  const prepared = [];
  for (const row of rows) {
    check();
    const id = uuid();
    const folio = `${settings.folioPrefix || ''}${String(folioNum).padStart(4, '0')}`;
    folioNum++;
    const emitted = new Date();
    const base = buildVars({ event, row, mapping, system: { tipo_documento: docLabel } });
    const core = {
      id, folio, tipo: docLabel, nombre: base.nombre, documento: base.rut_dni, rol: base.rol,
      evento: base.evento, institucion: base.institucion, fecha: base.fecha, emitido: emitted.toISOString(),
    };
    const hash = await sha256Hex(JSON.stringify(core));
    const codigo = shortCode(hash);
    const vars = { ...base, id, folio, hash, codigo, fecha_emision: formatDate(emitted), url_verificacion: verifyUrl(settings.baseUrl, id) };
    const record = {
      id, codigo, folio, hash, tipo: docLabel, nombre: vars.nombre, documento: maskDoc(vars.rut_dni), rol: vars.rol,
      evento: vars.evento, institucion: vars.institucion, fecha_evento: vars.fecha, horas: vars.duracion_horas,
      emitido: core.emitido, estado: 'vigente',
    };
    prepared.push({ vars, record });
  }

  // 2. PDF multipágina (imágenes y fuentes se incrustan una sola vez)
  const renderer = await createPdfRenderer(template);
  for (let i = 0; i < n; i++) {
    check();
    await renderer.addPage(prepared[i].vars);
    onProgress?.('Componiendo páginas', i + 1, n);
    if (i % 8 === 7) await tick();
  }
  renderer.setMeta({
    title: `${docLabel} — ${event.evento || ''}`.trim(),
    author: event.institucion,
    subject: `${n} documento(s) emitidos con Certifica`,
  });
  const mergedBytes = await renderer.save();

  // 3. Archivos individuales con metadatos y huella del archivo
  const src = await PDFDocument.load(mergedBytes);
  const names = new Map();
  const items = [];
  for (let i = 0; i < n; i++) {
    check();
    const { vars, record } = prepared[i];
    const single = await PDFDocument.create();
    const [pg] = await single.copyPages(src, [i]);
    single.addPage(pg);
    applyMeta(single, {
      title: `${docLabel} — ${vars.nombre}`,
      author: vars.institucion,
      subject: `ID ${vars.id} · Código ${vars.codigo} · Folio ${vars.folio}`,
      keywords: [vars.id, vars.codigo, vars.folio],
    });
    const bytes = await single.save();
    record.archivo_sha256 = await sha256Hex(bytes);
    let fname = safeFileName(fill(settings.fileNamePattern || '{{tipo_documento}}_{{nombre}}', vars)) || `documento_${i + 1}`;
    const count = names.get(fname) || 0;
    names.set(fname, count + 1);
    if (count) fname = `${fname}_${count + 1}`;
    items.push({ record, bytes, vars, fileName: `${fname}.pdf`, email: vars.email });
    onProgress?.('Generando archivos individuales', i + 1, n);
    if (i % 8 === 7) await tick();
  }
  return { items, mergedBytes, nextFolio: folioNum };
}
