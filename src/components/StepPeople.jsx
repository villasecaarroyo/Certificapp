import { useMemo, useState } from 'react';
import { CANONICAL_FIELDS, autoMap } from '../lib/fields.js';
import { parseFile } from '../lib/data.js';
import { downloadText } from '../lib/browser.js';
import { Field, FileButton } from './ui.jsx';

const MAIN = ['nombre', 'rut_dni', 'email', 'rol'];
const QUESTIONS = {
  nombre: '¿Qué columna tiene el nombre completo?',
  rut_dni: '¿Y el RUT, DNI o pasaporte?',
  email: '¿Y el correo electrónico?',
  rol: '¿Y el rol (asistente, expositor, organizador…)?',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TEMPLATE_CSV = '﻿Nombre completo;RUT;Correo;Rol;Institución;Título ponencia;Mesa;Horas\n'
  + 'María José Fernández Valenzuela;12.345.678-5;mjfernandez@ejemplo.cl;Expositora;Universidad del Norte;Coaliciones de gobierno en América Latina;Mesa 3;16\n'
  + 'Juan Pérez Soto;9.876.543-2;jperez@ejemplo.cl;Asistente;Universidad de Ejemplo;;;12\n';

export default function StepPeople({ dataset, setDataset, mapping, setMapping, onView }) {
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState({});
  const [filter, setFilter] = useState('');
  const [askClear, setAskClear] = useState(false);

  const load = async (file) => {
    setErr('');
    try {
      const ds = await parseFile(file);
      if (!ds.rows.length) throw new Error('La planilla tiene encabezados, pero ninguna fila con personas.');
      setDataset(ds);
      setMapping(autoMap(ds.columns));
    } catch (e) { setErr(`No se pudo leer «${file.name}». ${e.message}`); }
  };

  const addManual = () => {
    if (!manual.nombre?.trim()) { setErr('Escribe al menos el nombre de la persona.'); return; }
    setErr('');
    const base = dataset.sample ? { fileName: 'Lista escrita a mano', columns: [], rows: [] } : dataset;
    const map = dataset.sample ? {} : { ...mapping };
    const cols = [...base.columns];
    const row = {};
    for (const f of CANONICAL_FIELDS) {
      const v = (manual[f.key] || '').trim();
      if (!v && !map[f.key]) continue;
      let col = map[f.key];
      if (!col) { col = f.label; map[f.key] = col; }
      if (!cols.includes(col)) cols.push(col);
      row[col] = v;
    }
    setDataset({ ...base, sample: false, columns: cols, rows: [...base.rows, row] });
    setMapping(map);
    setManual({});
    onView(base.rows.length, false);
  };

  const editCell = (i, col, v) => setDataset({ ...dataset, rows: dataset.rows.map((r, j) => (j === i ? { ...r, [col]: v } : r)) });
  const removeRow = (i) => setDataset({ ...dataset, rows: dataset.rows.filter((_, j) => j !== i) });

  const stats = useMemo(() => {
    const n = dataset.rows.length;
    const nm = mapping.nombre, em = mapping.email;
    const noName = nm ? dataset.rows.filter((r) => !String(r[nm] || '').trim()).length : n;
    const badMail = em ? dataset.rows.filter((r) => String(r[em] || '').trim() && !EMAIL_RE.test(String(r[em]).trim())).length : 0;
    return { n, noName, badMail, hasName: !!nm };
  }, [dataset, mapping]);

  const visible = useMemo(() => dataset.rows.map((r, i) => [r, i]).filter(([r]) =>
    !filter || Object.values(r).some((v) => String(v).toLowerCase().includes(filter.toLowerCase()))).slice(0, 200), [dataset.rows, filter]);
  const sampleOf = (col) => (col ? dataset.rows.find((r) => String(r[col] || '').trim())?.[col] : '');

  return (
    <section className="step-wrap">
      <header className="step-head">
        <h1>¿A quiénes se les entrega?</h1>
        <p>Sube una planilla con una fila por persona, o escribe los datos a mano si son pocas. Los datos se quedan en este computador; no se envían a ningún lado.</p>
      </header>

      {dataset.sample && (
        <div className="banner info">
          Estás viendo <strong>personas de ejemplo</strong> para que puedas probar. Reemplázalas subiendo tu planilla o agregando personas.
        </div>
      )}

      <div className="choice-grid">
        <div className={`choice${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}>
          <h2>Subir una planilla</h2>
          <p className="muted">Excel (.xlsx) o CSV. La primera fila debe tener los títulos de las columnas, como «Nombre» o «Correo». También puedes arrastrar el archivo hasta aquí.</p>
          <div className="row wrap">
            <FileButton accept=".csv,.tsv,.txt,.xlsx,text/csv" onFile={load} className="btn primary">Elegir planilla</FileButton>
            <button className="btn ghost" onClick={() => downloadText(TEMPLATE_CSV, 'planilla_participantes.csv', 'text/csv')}>Descargar planilla modelo</button>
          </div>
        </div>
        <div className="choice">
          <h2>Escribir a mano</h2>
          <p className="muted">Útil para una sola persona o para completar una lista. Puedes agregar tantas como necesites.</p>
          <button className="btn primary" onClick={() => setAdding(true)}>+ Agregar persona</button>
        </div>
      </div>
      {err && <p className="error">{err}</p>}

      {adding && (
        <div className="card">
          <h2>Nueva persona</h2>
          <div className="form-grid compact">
            {CANONICAL_FIELDS.map((f) => (
              <Field key={f.key} label={f.label + (f.key === 'nombre' ? ' *' : '')}>
                <input value={manual[f.key] || ''} onChange={(e) => setManual({ ...manual, [f.key]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') addManual(); }} />
              </Field>
            ))}
          </div>
          <div className="row">
            <button className="btn primary" onClick={addManual}>Agregar a la lista</button>
            <button className="btn ghost" onClick={() => { setAdding(false); setManual({}); }}>Cerrar</button>
          </div>
        </div>
      )}

      {!dataset.sample && dataset.columns.length > 0 && (
        <div className="card">
          <h2>Revisa las columnas</h2>
          <p className="muted">La aplicación adivinó qué columna corresponde a cada dato. Si algo no calza, corrígelo aquí.</p>
          <div className="map-list">
            {MAIN.map((k) => (
              <MapRow key={k} label={QUESTIONS[k]} value={mapping[k]} columns={dataset.columns} sample={sampleOf(mapping[k])}
                onChange={(v) => setMapping({ ...mapping, [k]: v || undefined })} />
            ))}
          </div>
          <details className="more">
            <summary>Otras columnas (institución, ponencia, horas…)</summary>
            <div className="map-list">
              {CANONICAL_FIELDS.filter((f) => !MAIN.includes(f.key)).map((f) => (
                <MapRow key={f.key} label={f.label} value={mapping[f.key]} columns={dataset.columns} sample={sampleOf(mapping[f.key])}
                  onChange={(v) => setMapping({ ...mapping, [f.key]: v || undefined })} />
              ))}
            </div>
          </details>
        </div>
      )}

      <div className="card">
        <div className="row between">
          <h2>Lista de personas</h2>
          <div className="row wrap">
            <input placeholder="Buscar en la lista…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Buscar en la lista" />
            {stats.n > 0 && <button className="btn ghost" onClick={() => setAskClear(true)}>Vaciar lista</button>}
          </div>
        </div>
        <div className="status-row">
          <span className="pill ok">{stats.n} {stats.n === 1 ? 'persona' : 'personas'}</span>
          {!stats.hasName && stats.n > 0 && <span className="pill bad">Falta indicar la columna del nombre</span>}
          {stats.hasName && stats.noName > 0 && <span className="pill bad">{stats.noName} sin nombre</span>}
          {stats.badMail > 0 && <span className="pill warn">{stats.badMail} con correo mal escrito</span>}
        </div>
        {askClear && (
          <div className="confirm">
            <p>¿Quitar a todas las personas de la lista? Los documentos ya generados no se ven afectados.</p>
            <div className="row">
              <button className="btn danger solid" onClick={() => { setDataset({ fileName: 'Lista vacía', columns: dataset.sample ? [] : dataset.columns, rows: [] }); setAskClear(false); }}>Vaciar lista</button>
              <button className="btn ghost" onClick={() => setAskClear(false)}>Cancelar</button>
            </div>
          </div>
        )}
        {stats.n > 0 ? (
          <div className="table-wrap">
            <table className="edit-table">
              <thead><tr><th>#</th>{dataset.columns.map((c) => <th key={c}>{c}</th>)}<th /></tr></thead>
              <tbody>
                {visible.map(([r, i]) => (
                  <tr key={i}>
                    <td className="muted">{i + 1}</td>
                    {dataset.columns.map((c) => (
                      <td key={c}><input value={r[c] ?? ''} onChange={(e) => editCell(i, c, e.target.value)} aria-label={`${c}, fila ${i + 1}`} /></td>
                    ))}
                    <td className="nowrap">
                      <button className="btn small" onClick={() => onView(i)}>Ver documento</button>
                      <button className="btn ghost small" onClick={() => removeRow(i)} aria-label={`Quitar fila ${i + 1}`}>Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">Todavía no hay personas en la lista.</p>}
        {dataset.rows.length > 200 && <p className="muted small">Se muestran 200 filas. Usa el buscador para encontrar a alguien.</p>}
        <p className="muted small">Puedes corregir cualquier dato escribiendo directamente en la tabla.</p>
      </div>
    </section>
  );
}

function MapRow({ label, value, columns, sample, onChange }) {
  return (
    <label className="map-row">
      <span className="map-q">{label}</span>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Ninguna —</option>
        {columns.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <span className="map-sample">{value ? (sample ? `Ej.: ${sample}` : 'Columna vacía') : ''}</span>
    </label>
  );
}
