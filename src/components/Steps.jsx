import { useMemo, useState } from 'react';
import { buildScene } from '../lib/scene.js';
import { browserMeasure, fileToImage } from '../lib/browser.js';
import { DOC_TYPES, switchPreset, arrangeSignatures, newSignature } from '../lib/presets.js';
import { SceneSVG } from './SceneSVG.jsx';
import { Field, ImagePicker } from './ui.jsx';

/* ───────── Paso 1: qué documento ───────── */
export function StepType({ template, setTemplate, vars }) {
  const [pending, setPending] = useState(null);
  const thumbs = useMemo(() => DOC_TYPES.map((d) => {
    const t = d.key === template.docType ? template : switchPreset(d.key, template);
    return { ...d, scene: buildScene(t, vars, browserMeasure) };
  }), [template, vars]);

  const choose = (key) => {
    if (key === template.docType) return;
    setPending(key);
  };
  const apply = () => { setTemplate(switchPreset(pending, template)); setPending(null); };

  return (
    <section className="step-wrap">
      <header className="step-head">
        <h1>¿Qué quieres crear?</h1>
        <p>Elige un modelo. En los pasos siguientes pondrás los datos de tu evento, el logo, las firmas y la lista de personas. Todo se puede modificar después.</p>
      </header>
      <div className="type-grid">
        {thumbs.map((d) => (
          <button key={d.key} className={`type-card${template.docType === d.key ? ' on' : ''}`} onClick={() => choose(d.key)} aria-pressed={template.docType === d.key}>
            <div className="type-thumb"><SceneSVG scene={d.scene} width={d.scene.W > d.scene.H ? 260 : 150} /></div>
            <strong>{d.label}</strong>
            <span>{d.desc}</span>
            {template.docType === d.key && <em className="pill">Seleccionado</em>}
          </button>
        ))}
      </div>
      {pending && (
        <div className="confirm">
          <p>Cambiar a «{DOC_TYPES.find((d) => d.key === pending).label}» reemplaza los textos y la ubicación de los elementos del diseño actual. Se conservan el logo, las firmas y los datos del evento.</p>
          <div className="row">
            <button className="btn primary" onClick={apply}>Cambiar de modelo</button>
            <button className="btn ghost" onClick={() => setPending(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ───────── Paso 2: evento, logo y firmas ───────── */
const MAIN_FIELDS = [
  ['institucion', 'Institución que emite', 'Universidad de Santiago de Chile'],
  ['unidad', 'Facultad, departamento o centro', 'Facultad de Humanidades'],
  ['evento', 'Nombre del evento', 'IV Congreso de Estudios Políticos'],
  ['fecha', 'Fecha, tal como debe leerse', 'los días 12 y 13 de noviembre de 2026'],
  ['lugar', 'Lugar', 'el Aula Magna del Campus Central'],
  ['ciudad', 'Ciudad', 'Santiago'],
  ['duracion_horas', 'Duración en horas', '16'],
  ['modalidad', 'Modalidad', 'presencial, en línea o híbrida'],
];

export function StepEvent({ event, setEvent, template, setTemplate, vars }) {
  const scene = useMemo(() => buildScene(template, vars, browserMeasure), [template, vars]);
  const [err, setErr] = useState('');
  const set = (k, v) => setEvent((e) => ({ ...e, [k]: v }));
  const extra = event.extra || [];
  const setExtra = (list) => setEvent((e) => ({ ...e, extra: list }));

  const logo = template.elements.find((e) => e.type === 'image' && e.role === 'logo');
  const sigs = template.elements.filter((e) => e.type === 'signature');
  const updateEl = (id, patch) => setTemplate((t) => ({ ...t, elements: t.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const pick = async (id, file) => {
    setErr('');
    try { const img = await fileToImage(file); updateEl(id, { src: img.src, natW: img.w, natH: img.h }); }
    catch (e) { setErr(e.message); }
  };
  const addSig = () => setTemplate((t) => arrangeSignatures({ ...t, elements: [...t.elements, newSignature(t)] }));
  const removeSig = (id) => setTemplate((t) => arrangeSignatures({ ...t, elements: t.elements.filter((e) => e.id !== id) }));

  return (
    <section className="step-wrap wide">
      <header className="step-head">
        <h1>Datos del evento</h1>
        <p>Estos datos son iguales para todas las personas y aparecen automáticamente en los documentos. Escríbelos como quieres que se lean.</p>
      </header>
      <div className="event-layout">
      <div className="event-main">

      <div className="card">
        <h2>Información general</h2>
        <div className="form-grid">
          {MAIN_FIELDS.map(([k, label, ph]) => (
            <Field key={k} label={label}>
              <input value={event[k] || ''} placeholder={`Ej.: ${ph}`} onChange={(e) => set(k, e.target.value)} />
            </Field>
          ))}
        </div>
        <details className="more">
          <summary>Agregar otros datos (por ejemplo, número de resolución)</summary>
          <p className="muted small">Cada dato que agregues podrás insertarlo en los textos del documento desde «Insertar dato automático».</p>
          {extra.map((x, i) => (
            <div className="row wrap" key={i}>
              <input placeholder="Nombre del dato (ej.: Resolución)" value={x.key} onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, key: e.target.value } : y)))} />
              <input placeholder="Valor (ej.: N.º 1234/2026)" className="grow" value={x.value} onChange={(e) => setExtra(extra.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} />
              <button className="btn ghost small" onClick={() => setExtra(extra.filter((_, j) => j !== i))}>Quitar</button>
            </div>
          ))}
          <button className="btn" onClick={() => setExtra([...extra, { key: '', value: '' }])}>+ Agregar dato</button>
        </details>
      </div>

      <div className="card">
        <h2>Logo</h2>
        {logo
          ? <ImagePicker src={logo.src} onPick={(f) => pick(logo.id, f)} onClear={() => updateEl(logo.id, { src: null })} label="Subir el logo de la institución"
              hint="Mejor en PNG con fondo transparente o en SVG. Si tienes varios logos, únelos en una sola imagen o agrega otro en el paso «Diseño»." checker />
          : <p className="muted">Este modelo no tiene espacio para logo. Puedes agregar uno en el paso «Diseño».</p>}
      </div>

      {template.docType !== 'credencial' && (
        <div className="card">
          <h2>Firmas</h2>
          <p className="muted">Sube la imagen de cada firma (escaneada o fotografiada sobre papel blanco). Si no tienes la imagen, deja el espacio vacío: se imprimirá solo la línea con el nombre y el cargo.</p>
          <div className="sig-grid">
            {sigs.map((s, i) => (
              <div key={s.id} className="sig-card">
                <div className="row between"><strong>Firma {i + 1}</strong>
                  <button className="btn ghost small" onClick={() => removeSig(s.id)}>Quitar firma</button>
                </div>
                <ImagePicker src={s.src} onPick={(f) => pick(s.id, f)} onClear={() => updateEl(s.id, { src: null })} label="Subir imagen de la firma" checker />
                <Field label="Nombre"><input value={s.name || ''} onChange={(e) => updateEl(s.id, { name: e.target.value })} /></Field>
                <Field label="Cargo (puedes usar dos líneas)"><textarea rows={2} value={s.title || ''} onChange={(e) => updateEl(s.id, { title: e.target.value })} /></Field>
              </div>
            ))}
          </div>
          {sigs.length < 4 && <button className="btn" onClick={addSig}>+ Agregar otra firma</button>}
          {err && <p className="error">{err}</p>}
        </div>
      )}
      </div>
      <aside className="live card">
        <strong>Así se ve</strong>
        <div className="preview-box"><SceneSVG scene={scene} width={scene.W > scene.H ? 330 : 240} /></div>
        <span className="muted small">Con los datos de {vars.nombre || 'una persona de ejemplo'}.</span>
      </aside>
      </div>
    </section>
  );
}
