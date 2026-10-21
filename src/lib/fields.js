// Campos dinámicos, mapeo automático de columnas y sustitución de variables.

export const CANONICAL_FIELDS = [
  { key: 'nombre', label: 'Nombre completo', aliases: ['nombre', 'nombre completo', 'nombres', 'name', 'full name', 'participante', 'asistente', 'nombre y apellido', 'nombre y apellidos', 'nombre apellido'] },
  { key: 'rut_dni', label: 'RUT / DNI / pasaporte', aliases: ['rut', 'run', 'dni', 'documento', 'pasaporte', 'cedula', 'cedula de identidad', 'identificacion', 'rut dni', 'n documento', 'numero de documento', 'curp', 'cpf'] },
  { key: 'email', label: 'Correo electrónico', aliases: ['email', 'e mail', 'correo', 'mail', 'correo electronico', 'email address'] },
  { key: 'rol', label: 'Rol o calidad', aliases: ['rol', 'role', 'calidad', 'en calidad de', 'participacion', 'tipo participacion', 'tipo de participacion', 'categoria'] },
  { key: 'tratamiento', label: 'Tratamiento (Dr., Dra., Mg.)', aliases: ['tratamiento', 'grado', 'titulo academico', 'saludo'] },
  { key: 'afiliacion', label: 'Institución del participante', aliases: ['afiliacion', 'filiacion', 'institucion', 'universidad', 'organizacion', 'affiliation', 'institucion de origen'] },
  { key: 'titulo_trabajo', label: 'Título de ponencia o trabajo', aliases: ['titulo', 'ponencia', 'trabajo', 'titulo ponencia', 'titulo de la ponencia', 'titulo trabajo', 'paper', 'resumen titulo'] },
  { key: 'mesa', label: 'Mesa, panel o sesión', aliases: ['mesa', 'panel', 'sesion', 'simposio', 'eje', 'eje tematico'] },
  { key: 'duracion_horas', label: 'Duración en horas', aliases: ['horas', 'duracion', 'duracion horas', 'hrs', 'carga horaria'] },
  { key: 'nota', label: 'Calificación', aliases: ['nota', 'calificacion', 'evaluacion', 'grade'] },
];

export const EVENT_FIELDS = [
  { key: 'institucion', label: 'Institución emisora' },
  { key: 'unidad', label: 'Unidad, facultad o departamento' },
  { key: 'tipo_actividad', label: 'Tipo de actividad (congreso, seminario, jornada…)' },
  { key: 'evento', label: 'Nombre de la instancia o evento' },
  { key: 'edicion', label: 'Edición (por ejemplo, IV)' },
  { key: 'fecha', label: 'Fecha del evento, redactada' },
  { key: 'lugar', label: 'Lugar o sede' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'modalidad', label: 'Modalidad' },
  { key: 'duracion_horas', label: 'Duración en horas (por defecto)' },
];

export const SYSTEM_FIELDS = [
  { key: 'id', label: 'ID único (UUID v4)' },
  { key: 'codigo', label: 'Código corto de verificación' },
  { key: 'folio', label: 'Folio correlativo' },
  { key: 'hash', label: 'Huella SHA-256' },
  { key: 'fecha_emision', label: 'Fecha de emisión' },
  { key: 'url_verificacion', label: 'URL de verificación' },
  { key: 'tipo_documento', label: 'Tipo de documento' },
];

export function normalizeKey(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const str = (v) => (v == null ? '' : String(v).trim());

export function autoMap(columns) {
  const mapping = {};
  const used = new Set();
  const norm = columns.map((c) => [c, normalizeKey(c)]);
  // Primera pasada: coincidencias exactas. Segunda: coincidencias parciales.
  for (const pass of ['exact', 'partial']) {
    for (const f of CANONICAL_FIELDS) {
      if (mapping[f.key]) continue;
      const aliases = [f.key, ...f.aliases].map(normalizeKey);
      const hit = norm.find(([c, n]) => !used.has(c) && (pass === 'exact'
        ? aliases.includes(n)
        : aliases.some((a) => a.length > 3 && n.includes(a))));
      if (hit) { mapping[f.key] = hit[0]; used.add(hit[0]); }
    }
  }
  return mapping;
}

export function buildVars({ event = {}, row = {}, mapping = {}, system = {} }) {
  const v = {};
  for (const [k, val] of Object.entries(row)) v[normalizeKey(k)] = str(val);
  for (const f of EVENT_FIELDS) v[f.key] = str(event[f.key]);
  for (const x of event.extra || []) if (x.key) v[normalizeKey(x.key)] = str(x.value);
  for (const f of CANONICAL_FIELDS) {
    const col = mapping[f.key];
    const val = col ? str(row[col]) : '';
    if (val) v[f.key] = val;
    else if (!(f.key in v)) v[f.key] = '';
  }
  return Object.assign(v, system);
}

const VAR_RE = /\{\{\s*([A-Za-z0-9_]+)\s*(?:\|\s*([a-z]+)\s*)?\}\}/g;

function lookup(vars, k) {
  const v = vars[k];
  if (v !== undefined && v !== null) return String(v);
  const v2 = vars[normalizeKey(k)];
  return v2 == null ? '' : String(v2);
}

function applyFilter(val, f) {
  if (!f) return val;
  if (f === 'upper' || f === 'mayus') return val.toLocaleUpperCase('es');
  if (f === 'lower' || f === 'minus') return val.toLocaleLowerCase('es');
  if (f === 'title' || f === 'titulo') {
    const small = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'van', 'von', 'da', 'do', 'dos']);
    return val.toLocaleLowerCase('es').split(/(\s+)/).map((w, i) =>
      (i > 0 && small.has(w)) ? w : w.charAt(0).toLocaleUpperCase('es') + w.slice(1)).join('');
  }
  return val;
}

// Sintaxis: {{variable}}, {{variable|upper}}, [[texto opcional con {{variable}}]]
// Un bloque [[ ]] desaparece completo si alguna variable dentro está vacía.
export function fill(text, vars) {
  if (!text) return '';
  let out = String(text).replace(/\[\[([\s\S]*?)\]\]/g, (_, inner) => {
    let empty = false;
    const r = inner.replace(VAR_RE, (m, k, f) => {
      const val = lookup(vars, k);
      if (!val) empty = true;
      return applyFilter(val, f);
    });
    return empty ? '' : r;
  });
  out = out.replace(VAR_RE, (m, k, f) => applyFilter(lookup(vars, k), f));
  return out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/ +([,.;:)])/g, '$1').trim();
}

export function formatDate(d) {
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function safeFileName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 120);
}

export function allVariables(columns = [], event = {}, mapping = {}) {
  const list = [];
  const seen = new Set();
  const push = (key, label, group) => { if (!seen.has(key)) { seen.add(key); list.push({ key, label, group }); } };
  CANONICAL_FIELDS.forEach((f) => push(f.key, f.label, 'Participante'));
  EVENT_FIELDS.forEach((f) => push(f.key, f.label, 'Evento'));
  (event.extra || []).forEach((x) => x.key && push(normalizeKey(x.key), x.key, 'Evento'));
  SYSTEM_FIELDS.forEach((f) => push(f.key, f.label, 'Sistema'));
  const mapped = new Set(Object.values(mapping));
  columns.forEach((c) => { if (!mapped.has(c)) push(normalizeKey(c), c, 'Columnas del archivo'); });
  return list;
}

// Etiquetas cortas para los botones «Insertar dato» del editor de textos.
export const INSERT_CHIPS = [
  { group: 'De cada persona', items: [
    ['nombre', 'Nombre'], ['rut_dni', 'RUT o DNI'], ['rol', 'Rol'], ['tratamiento', 'Tratamiento (Dr., Dra.)'],
    ['afiliacion', 'Su institución'], ['titulo_trabajo', 'Título de ponencia'], ['mesa', 'Mesa o panel'], ['duracion_horas', 'Horas'],
  ] },
  { group: 'Del evento', items: [
    ['evento', 'Nombre del evento'], ['institucion', 'Institución'], ['unidad', 'Facultad o unidad'], ['fecha', 'Fecha'],
    ['lugar', 'Lugar'], ['ciudad', 'Ciudad'], ['modalidad', 'Modalidad'],
  ] },
  { group: 'Automáticos', items: [
    ['fecha_emision', 'Fecha de hoy'], ['folio', 'N.º de folio'], ['codigo', 'Código de verificación'],
  ] },
];

const CHIP_LABEL = Object.fromEntries(INSERT_CHIPS.flatMap((g) => g.items));
// Muestra «{{nombre}}» como «[Nombre]» para que el texto sea legible por cualquier persona.
export function friendlyText(text) {
  return String(text || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*(?:\|[a-z]+)?\s*\}\}/g, (m, k) => `[${CHIP_LABEL[k] || k}]`);
}
