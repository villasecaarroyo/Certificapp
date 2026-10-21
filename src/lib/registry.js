import Papa from 'papaparse';

export const PUBLIC_LEVELS = {
  completo: 'Nombre, rol y documento enmascarado',
  nombre: 'Nombre y rol (sin documento)',
  minimo: 'Solo datos del documento (sin datos personales)',
};

export function toPublic(r, level = 'nombre') {
  const base = {
    id: r.id, codigo: r.codigo, folio: r.folio, hash: r.hash, archivo_sha256: r.archivo_sha256,
    tipo: r.tipo, evento: r.evento, institucion: r.institucion, fecha_evento: r.fecha_evento,
    emitido: r.emitido, estado: r.estado || 'vigente',
  };
  if (r.estado === 'revocado') { base.revocado = r.revocado; if (r.motivo) base.motivo = r.motivo; }
  if (level === 'minimo') return base;
  const out = { ...base, nombre: r.nombre, rol: r.rol, horas: r.horas };
  if (level === 'completo') out.documento = r.documento;
  return out;
}

export function buildPublicRegistry(records, level, meta = {}) {
  return {
    version: 1,
    generado: new Date().toISOString(),
    institucion: meta.institucion || '',
    nivel_publicacion: level,
    total: records.length,
    registros: records.map((r) => toPublic(r, level)),
  };
}

export function readRegistry(json) {
  if (Array.isArray(json)) return json;
  return json?.registros || json?.records || [];
}

export function mergeRecords(local, incoming) {
  const m = new Map(local.map((r) => [r.id, r]));
  for (const r of incoming) if (r?.id && !m.has(r.id)) m.set(r.id, r);
  return [...m.values()].sort((a, b) => String(a.emitido || '').localeCompare(String(b.emitido || '')));
}

export function recordsToCsv(records) {
  const cols = ['folio', 'codigo', 'id', 'tipo', 'nombre', 'documento', 'rol', 'evento', 'institucion', 'fecha_evento', 'horas', 'emitido', 'estado', 'revocado', 'motivo', 'hash', 'archivo_sha256'];
  return '﻿' + Papa.unparse({ fields: cols, data: records.map((r) => cols.map((c) => r[c] ?? '')) });
}
