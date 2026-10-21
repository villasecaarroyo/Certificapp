import Papa from 'papaparse';

function cellToString(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toLocaleDateString('es-CL');
  return String(v).trim();
}

function fromMatrix(matrix, fileName) {
  const clean = matrix.filter((r) => r.some((c) => cellToString(c) !== ''));
  if (!clean.length) throw new Error('El archivo no contiene filas con datos.');
  const header = clean[0].map((h, i) => cellToString(h) || `Columna ${i + 1}`);
  const seen = {};
  const columns = header.map((h) => { seen[h] = (seen[h] || 0) + 1; return seen[h] > 1 ? `${h} (${seen[h]})` : h; });
  const rows = clean.slice(1).map((r) => Object.fromEntries(columns.map((c, i) => [c, cellToString(r[i])])));
  return { fileName, columns, rows };
}

export async function parseFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser');
    return fromMatrix(await readSheet(file), file.name);
  }
  if (['xls', 'ods', 'numbers'].includes(ext)) {
    throw new Error('Formato no soportado directamente. Guarda la planilla como .xlsx o .csv e inténtalo de nuevo.');
  }
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf); // CSV guardado por Excel en español
  const res = Papa.parse(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  if (res.errors?.length && !res.data?.length) throw new Error(res.errors[0].message);
  return fromMatrix(res.data, file.name);
}
