import { useMemo, useState } from 'react';
import { EVENT_FIELDS, CANONICAL_FIELDS, autoMap, normalizeKey } from '../lib/fields.js';
import { parseFile } from '../lib/data.js';
import { PUBLIC_LEVELS, buildPublicRegistry, mergeRecords, readRegistry, recordsToCsv } from '../lib/registry.js';
import { downloadText, publishToGitHub } from '../lib/browser.js';
import { resolveBaseUrl, verifyUrl } from '../lib/issue.js';
import { Field, FileButton } from './ui.jsx';

/* ───────────── Evento ───────────── */
export function EventPanel({ event, setEvent }) {
  const set = (k, v) => setEvent((e) => ({ ...e, [k]: v }));
  const extra = event.extra || [];
  const setExtra = (list) => setEvent((e) => ({ ...e, extra: list }));
  return (
    <section className="panel">
      <h2>Datos de la instancia</h2>
      <p className="lead">Estos valores son comunes a todos los documentos del lote. Si la planilla trae una columna con el mismo dato (por ejemplo, horas), prevalece el valor de cada fila.</p>
      <div className="form-grid">
        {EVENT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={`{{${f.key}}}`}>
            <input value={event[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />
          </Field>
        ))}
      </div>
      <h3>Campos adicionales</h3>
      <p className="muted">Crea variables propias para esta instancia, como resolución, código del curso o número de sesión.</p>
      {extra.map((x, i) => (
        <div className="row" key={i}>
          <input placeholder="nombre_variable" value={x.key} onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, key: e.target.value } : y)))} />
          <input placeholder="valor" className="grow" value={x.value} onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} />
          <code className="muted">{`{{${normalizeKey(x.key) || '…'}}}`}</code>
          <button className="btn ghost small" onClick={() => setExtra(extra.filter((_, j) => j !== i))}>Quitar</button>
        </div>
      ))}
      <button className="btn" onClick={() => setExtra([...extra, { key: '', value: '' }])}>Añadir campo</button>
    </section>
  );
}

/* ───────────── Participantes ───────────── */
export function DataPanel({ dataset, setDataset, mapping, setMapping, onView }) {
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  const [manual, setManual] = useState({});
  const [filter, setFilter] = useState('');

  const load = async (file) => {
    setErr('');
    try {
      const ds = await parseFile(file);
      setDataset(ds);
      setMapping(autoMap(ds.columns));
    } catch (e) { setErr(e.message); }
  };

  const addManual = () => {
    if (!manual.nombre?.trim()) { setErr('El nombre es obligatorio para agregar un participante.'); return; }
    setErr('');
    const cols = [...dataset.columns];
    const map = { ...mapping };
    const row = {};
    for (const f of CANONICAL_FIELDS) {
      const v = (manual[f.key] || '').trim();
      if (!v && !map[f.key]) continue;
      let col = map[f.key];
      if (!col) { col = f.label; map[f.key] = col; }
      if (!cols.includes(col)) cols.push(col);
      row[col] = v;
    }
    setDataset({ ...dataset, columns: cols, rows: [...dataset.rows, row] });
    setMapping(map);
    setManual({});
    onView(dataset.rows.length, false);
  };

  const nameCol = mapping.nombre;
  const visible = useMemo(() => dataset.rows.map((r, i) => [r, i]).filter(([r]) =>
    !filter || Object.values(r).some((v) => String(v).toLowerCase().includes(filter.toLowerCase()))).slice(0, 300), [dataset.rows, filter]);
  const missingName = nameCol ? dataset.rows.filter((r) => !String(r[nameCol] || '').trim()).length : dataset.rows.length;

  return (
    <section className="panel">
      <h2>Participantes</h2>
      <div className={`dropzone${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}>
        <p><strong>Arrastra aquí una planilla CSV o Excel (.xlsx)</strong></p>
        <p className="muted">La primera fila debe contener los encabezados. Los datos se procesan solo en este navegador.</p>
        <div className="row center">
          <FileButton accept=".csv,.tsv,.txt,.xlsx,text/csv" onFile={load} className="btn primary">Elegir archivo</FileButton>
          <a className="btn ghost" href="./ejemplo_participantes.csv" download>Descargar planilla de ejemplo</a>
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      <p className="muted">Fuente actual: <strong>{dataset.fileName}</strong> · {dataset.rows.length} filas · {dataset.columns.length} columnas</p>

      <h3>Mapeo de columnas</h3>
      <p className="muted">Se detecta automáticamente por el nombre del encabezado. Revisa y corrige si es necesario.</p>
      <div className="map-grid">
        {CANONICAL_FIELDS.map((f) => (
          <label key={f.key} className="map-row">
            <span><code>{`{{${f.key}}}`}</code> {f.label}</span>
            <select value={mapping[f.key] || ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })}>
              <option value="">(sin asignar)</option>
              {dataset.columns.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        ))}
      </div>
      {missingName > 0 && <p className="warn">{nameCol ? `${missingName} fila(s) no tienen nombre.` : 'No hay columna asignada al nombre.'} Revisa el mapeo antes de emitir.</p>}

      <h3>Agregar participante manualmente</h3>
      <p className="muted">Útil para emisiones individuales o para completar un lote.</p>
      <div className="form-grid compact">
        {CANONICAL_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <input value={manual[f.key] || ''} onChange={(e) => setManual({ ...manual, [f.key]: e.target.value })} />
          </Field>
        ))}
      </div>
      <button className="btn primary" onClick={addManual}>Agregar a la lista</button>

      <div className="row between table-head">
        <h3>Datos cargados</h3>
        <div className="row">
          <input placeholder="Buscar…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="btn ghost" onClick={() => { if (confirm('¿Vaciar la lista de participantes?')) { setDataset({ fileName: '(vacío)', columns: dataset.columns, rows: [] }); } }}>Vaciar lista</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th>{dataset.columns.map((c) => <th key={c}>{c}</th>)}<th /></tr></thead>
          <tbody>
            {visible.map(([r, i]) => (
              <tr key={i}>
                <td>{i + 1}</td>
                {dataset.columns.map((c) => <td key={c}>{r[c]}</td>)}
                <td className="nowrap">
                  <button className="btn small" onClick={() => onView(i)}>Ver</button>
                  <button className="btn ghost small" onClick={() => setDataset({ ...dataset, rows: dataset.rows.filter((_, j) => j !== i) })} aria-label="Quitar fila">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {dataset.rows.length > 300 && <p className="muted small">Se muestran las primeras 300 coincidencias.</p>}
      </div>
    </section>
  );
}

/* ───────────── Registro ───────────── */
export function RegistryPanel({ registry, setRegistry, settings, event }) {
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem('certifica.gh') || ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const s = q.toLowerCase();
    return [...registry].reverse().filter((r) => !s || [r.nombre, r.folio, r.codigo, r.evento, r.id].some((v) => String(v || '').toLowerCase().includes(s)));
  }, [registry, q]);
  const publicJson = () => JSON.stringify(buildPublicRegistry(registry, settings.publicLevel, { institucion: event.institucion }), null, 2);

  const setEstado = (id, revoke) => {
    let motivo = '';
    if (revoke) { motivo = prompt('Motivo de la revocación (opcional):') ?? null; if (motivo === null) return; }
    setRegistry((rs) => rs.map((r) => (r.id === id ? (revoke ? { ...r, estado: 'revocado', revocado: new Date().toISOString(), motivo } : { ...r, estado: 'vigente', revocado: undefined, motivo: undefined }) : r)));
  };
  const importFile = async (file) => {
    try {
      const recs = readRegistry(JSON.parse(await file.text()));
      setRegistry((rs) => mergeRecords(rs, recs));
      setMsg(`Se incorporaron los registros del archivo (${recs.length} leídos).`);
    } catch (e) { setMsg(`No se pudo leer el archivo: ${e.message}`); }
  };
  const loadPublished = async () => {
    try {
      const r = await fetch('./registry.json', { cache: 'no-store' });
      if (!r.ok) throw new Error(`respuesta ${r.status}`);
      const recs = readRegistry(await r.json());
      setRegistry((rs) => mergeRecords(rs, recs));
      setMsg(`Registro publicado leído: ${recs.length} documentos.`);
    } catch (e) { setMsg(`No se pudo leer el registro publicado (${e.message}).`); }
  };
  const publish = async () => {
    const gh = settings.github || {};
    if (!gh.owner || !gh.repo || !token) { setMsg('Completa usuario, repositorio y token en Ajustes y en el campo de abajo.'); return; }
    setBusy(true); setMsg('');
    try {
      try { sessionStorage.setItem('certifica.gh', token); } catch { /* */ }
      await publishToGitHub({ ...gh, token, content: publicJson(), message: `Registro de verificación: ${registry.length} documentos` });
      setMsg('Registro publicado en GitHub. El portal de verificación se actualizará cuando termine el despliegue (normalmente 1 a 2 minutos).');
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };

  return (
    <section className="panel">
      <h2>Registro de emisión</h2>
      <p className="lead">
        Cada documento emitido queda anotado aquí con su ID, folio, código y huella SHA-256 del archivo. Para que los QR funcionen, publica el registro en <code>public/registry.json</code> del repositorio. Nivel de publicación actual: <strong>{PUBLIC_LEVELS[settings.publicLevel]}</strong> (se cambia en Ajustes).
      </p>
      <div className="stats">
        <div><strong>{registry.length}</strong><span>emitidos</span></div>
        <div><strong>{registry.filter((r) => r.estado === 'revocado').length}</strong><span>revocados</span></div>
        <div><strong>{new Set(registry.map((r) => r.evento)).size}</strong><span>instancias</span></div>
      </div>
      <div className="row wrap">
        <button className="btn primary" onClick={() => downloadText(publicJson(), 'registry.json')}>Descargar registry.json</button>
        <button className="btn" onClick={() => downloadText(recordsToCsv(registry), 'registro_emision.csv', 'text/csv')}>Exportar CSV completo</button>
        <FileButton accept=".json,application/json" onFile={importFile}>Importar registro</FileButton>
        <button className="btn" onClick={loadPublished}>Sincronizar con el registro publicado</button>
        <button className="btn danger ghost" onClick={() => { if (confirm('Esto borra el registro guardado en este navegador. ¿Exportaste una copia?')) setRegistry([]); }}>Vaciar registro local</button>
      </div>

      <details className="box">
        <summary>Publicar directamente en GitHub</summary>
        <p className="muted small">
          Requiere un token de acceso de grano fino con permiso «Contents: Read and write» solo sobre este repositorio. El token se guarda únicamente en esta pestaña y se borra al cerrarla. Repositorio configurado: <code>{settings.github?.owner || '—'}/{settings.github?.repo || '—'}</code>, rama <code>{settings.github?.branch || 'main'}</code>.
        </p>
        <div className="row">
          <input type="password" className="grow" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          <button className="btn primary" disabled={busy} onClick={publish}>{busy ? 'Publicando…' : 'Publicar registro'}</button>
        </div>
      </details>
      {msg && <p className="note">{msg}</p>}

      <div className="row between table-head">
        <h3>Documentos</h3>
        <input placeholder="Buscar por nombre, folio o código…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Folio</th><th>Nombre</th><th>Tipo</th><th>Evento</th><th>Emitido</th><th>Código</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.slice(0, 500).map((r) => (
              <tr key={r.id} className={r.estado === 'revocado' ? 'revoked' : ''}>
                <td className="nowrap">{r.folio}</td>
                <td>{r.nombre || <span className="muted">(no publicado)</span>}</td>
                <td>{r.tipo}</td>
                <td>{r.evento}</td>
                <td className="nowrap">{r.emitido ? new Date(r.emitido).toLocaleString('es-CL') : ''}</td>
                <td className="nowrap"><code>{r.codigo}</code></td>
                <td>{r.estado === 'revocado' ? 'Revocado' : 'Vigente'}</td>
                <td className="nowrap">
                  <a className="btn small" href={verifyUrl(settings.baseUrl, r.id)} target="_blank" rel="noreferrer">Verificar</a>
                  {r.estado === 'revocado'
                    ? <button className="btn ghost small" onClick={() => setEstado(r.id, false)}>Reactivar</button>
                    : <button className="btn ghost small" onClick={() => setEstado(r.id, true)}>Revocar</button>}
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={8} className="muted">Aún no hay documentos emitidos.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ───────────── Ajustes ───────────── */
export function SettingsPanel({ settings, setSettings }) {
  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  const setE = (k, v) => setSettings((s) => ({ ...s, emailjs: { ...s.emailjs, [k]: v } }));
  const setG = (k, v) => setSettings((s) => ({ ...s, github: { ...s.github, [k]: v } }));
  return (
    <section className="panel">
      <h2>Ajustes</h2>
      <h3>Verificación</h3>
      <div className="form-grid">
        <Field label="URL pública de la aplicación" hint={`Vacío usa la dirección actual: ${resolveBaseUrl('')}. Los QR apuntarán a …/verify/?id=`}>
          <input placeholder="https://tu-usuario.github.io/certifica/" value={settings.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} />
        </Field>
        <Field label="Datos publicados en el registro" hint="Ley 19.628 y Ley 21.719: publica solo lo necesario para verificar.">
          <select value={settings.publicLevel} onChange={(e) => set('publicLevel', e.target.value)}>
            {Object.entries(PUBLIC_LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <h3>Folios y archivos</h3>
      <div className="form-grid">
        <Field label="Prefijo del folio"><input value={settings.folioPrefix} onChange={(e) => set('folioPrefix', e.target.value)} /></Field>
        <Field label="Próximo número de folio"><input type="number" min={1} value={settings.nextFolio} onChange={(e) => set('nextFolio', Number(e.target.value) || 1)} /></Field>
        <Field label="Patrón de nombre de archivo" hint="Ejemplo: {{tipo_documento}}_{{nombre}} produce Certificado_Juan_Perez.pdf">
          <input value={settings.fileNamePattern} onChange={(e) => set('fileNamePattern', e.target.value)} />
        </Field>
      </div>
      <h3>Envío por correo (EmailJS)</h3>
      <p className="muted">
        EmailJS permite enviar desde el navegador sin servidor propio. Crea un servicio y una plantilla en emailjs.com con las variables <code>{'{{to_email}}'}</code>, <code>{'{{to_name}}'}</code>, <code>{'{{asunto}}'}</code> y <code>{'{{mensaje}}'}</code>. Para adjuntar el PDF, agrega en la plantilla un adjunto de tipo «Variable Attachment» con el parámetro <code>certificado</code>. El plan gratuito limita el tamaño de cada envío, por lo que con fondos pesados conviene enviar solo el enlace de verificación.
      </p>
      <div className="form-grid">
        <Field label="Service ID"><input value={settings.emailjs.serviceId} onChange={(e) => setE('serviceId', e.target.value)} /></Field>
        <Field label="Template ID"><input value={settings.emailjs.templateId} onChange={(e) => setE('templateId', e.target.value)} /></Field>
        <Field label="Public key"><input value={settings.emailjs.publicKey} onChange={(e) => setE('publicKey', e.target.value)} /></Field>
        <Field label="Asunto"><input value={settings.emailjs.subject} onChange={(e) => setE('subject', e.target.value)} /></Field>
        <Field label="Mensaje" wide><textarea rows={6} value={settings.emailjs.message} onChange={(e) => setE('message', e.target.value)} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={settings.emailjs.attach} onChange={(e) => setE('attach', e.target.checked)} />Adjuntar el PDF (si se desmarca, se envía solo el enlace de verificación)</label>
      <h3>Repositorio de GitHub</h3>
      <p className="muted">Opcional. Permite publicar el registro desde la pestaña Registro sin editar archivos a mano.</p>
      <div className="form-grid">
        <Field label="Usuario u organización"><input value={settings.github.owner} onChange={(e) => setG('owner', e.target.value)} /></Field>
        <Field label="Repositorio"><input value={settings.github.repo} onChange={(e) => setG('repo', e.target.value)} /></Field>
        <Field label="Rama"><input value={settings.github.branch} onChange={(e) => setG('branch', e.target.value)} /></Field>
        <Field label="Ruta del registro"><input value={settings.github.path} onChange={(e) => setG('path', e.target.value)} /></Field>
      </div>
    </section>
  );
}
