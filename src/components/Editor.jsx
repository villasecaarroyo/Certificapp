import { useEffect, useMemo, useRef, useState } from 'react';
import { buildScene } from '../lib/scene.js';
import { pageDims, PAGE_SIZES } from '../lib/page.js';
import { browserMeasure, fileToImage, readFileAsDataURL, downloadText } from '../lib/browser.js';
import { DOC_TYPES, makePreset, newElement } from '../lib/presets.js';
import { shortId } from '../lib/ids.js';
import { safeFileName } from '../lib/fields.js';
import { SceneSVG } from './SceneSVG.jsx';
import { Field, Num, Color, FileButton, RowNav } from './ui.jsx';

const RAW = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? `{{${k}}}` : undefined) });
const half = (v) => Math.round(v * 2) / 2;

const TYPE_LABEL = { text: 'Texto', image: 'Imagen', signature: 'Firma', qr: 'Código QR', rect: 'Forma' };
function describe(el) {
  if (el.type === 'text') return (el.text || '').replace(/\s+/g, ' ').slice(0, 34) || 'Texto';
  if (el.type === 'rect') return el.h <= 3 ? 'Línea' : el.fill ? 'Rectángulo' : 'Marco';
  if (el.type === 'signature') return `Firma · ${el.name || ''}`;
  if (el.type === 'image') return el.label || 'Imagen';
  return TYPE_LABEL[el.type];
}

export default function Editor({ template, setTemplate, vars, varList, fontsVersion, rowNav }) {
  const [selId, setSelId] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [guide, setGuide] = useState({ v: false, h: false });
  const wrapRef = useRef(null);
  const [avail, setAvail] = useState(900);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const [W, H] = pageDims(template.page);
  const fitH = typeof window !== 'undefined' ? Math.max(320, window.innerHeight - 250) / H : Infinity;
  const scale = Math.max(0.15, Math.min((avail - 24) / W, fitH)) * zoom;
  const scene = useMemo(() => buildScene(template, showRaw ? RAW : vars, browserMeasure), [template, vars, showRaw, fontsVersion]);
  const sel = template.elements.find((e) => e.id === selId) || null;

  const update = (id, patch) => setTemplate((t) => ({ ...t, elements: t.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const remove = (id) => { setTemplate((t) => ({ ...t, elements: t.elements.filter((e) => e.id !== id) })); setSelId(null); };
  const duplicate = (id) => {
    const el = template.elements.find((e) => e.id === id);
    if (!el) return;
    const copy = { ...el, id: shortId(), x: el.x + 12, y: el.y + 12 };
    setTemplate((t) => ({ ...t, elements: [...t.elements, copy] }));
    setSelId(copy.id);
  };
  const reorder = (id, dir) => setTemplate((t) => {
    const els = [...t.elements];
    const i = els.findIndex((e) => e.id === id);
    const j = { up: i + 1, down: i - 1, top: els.length - 1, bottom: 0 }[dir];
    if (i < 0 || j < 0 || j >= els.length || i === j) return t;
    const [el] = els.splice(i, 1);
    els.splice(j, 0, el);
    return { ...t, elements: els };
  });
  const add = (type) => {
    const el = newElement(type, template.page);
    setTemplate((t) => ({ ...t, elements: [...t.elements, el] }));
    setSelId(el.id);
  };

  // Teclado: flechas mueven, Supr elimina, Ctrl/Cmd+D duplica, Esc deselecciona
  useEffect(() => {
    function onKey(e) {
      if (!selId) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const el = template.elements.find((x) => x.id === selId);
      if (!el) return;
      const s = e.shiftKey ? 10 : 1;
      const moves = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] };
      if (moves[e.key]) { update(selId, { x: el.x + moves[e.key][0], y: el.y + moves[e.key][1] }); e.preventDefault(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { remove(selId); e.preventDefault(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { duplicate(selId); e.preventDefault(); }
      else if (e.key === 'Escape') setSelId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function startDrag(e, el, mode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelId(el.id);
    const d = { mode, sx: e.clientX, sy: e.clientY, x: el.x, y: el.y, w: el.w, h: el.h, id: el.id, square: el.type === 'qr', scale };
    const onMove = (ev) => {
      const dx = (ev.clientX - d.sx) / d.scale, dy = (ev.clientY - d.sy) / d.scale;
      if (d.mode === 'move') {
        let x = half(d.x + dx), y = half(d.y + dy);
        const snapV = Math.abs(x + d.w / 2 - W / 2) < 4;
        const snapH = Math.abs(y + d.h / 2 - H / 2) < 4;
        if (snapV) x = half(W / 2 - d.w / 2);
        if (snapH) y = half(H / 2 - d.h / 2);
        setGuide({ v: snapV, h: snapH });
        update(d.id, { x, y });
      } else {
        let w = Math.max(6, half(d.w + dx)), h = Math.max(1, half(d.h + dy));
        if (d.square) { const s = Math.max(w, h); w = s; h = s; }
        update(d.id, { w, h });
      }
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); setGuide({ v: false, h: false }); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  return (
    <div className="editor">
      <div className="editor-main">
        <div className="toolbar">
          <div className="tool-group">
            <span className="tool-label">Añadir</span>
            <button className="btn" onClick={() => add('text')}>Texto</button>
            <button className="btn" onClick={() => add('variable')}>Variable</button>
            <button className="btn" onClick={() => add('image')}>Logo o imagen</button>
            <button className="btn" onClick={() => add('signature')}>Firma</button>
            <button className="btn" onClick={() => add('qr')}>QR</button>
            <button className="btn" onClick={() => add('rect')}>Rectángulo</button>
            <button className="btn" onClick={() => add('line')}>Línea</button>
          </div>
          <div className="tool-group">
            <label className="check"><input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />Ver variables</label>
            <button className="btn icon" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))} aria-label="Alejar">−</button>
            <span className="muted">{Math.round(zoom * 100)}%</span>
            <button className="btn icon" onClick={() => setZoom((z) => Math.min(3, z + 0.15))} aria-label="Acercar">+</button>
          </div>
        </div>
        <div className="rowbar">
          <span className="muted">Datos de prueba</span>
          <RowNav {...rowNav} />
        </div>
        <div className="canvas-wrap" ref={wrapRef}>
          <div className="page" style={{ width: W * scale, height: H * scale }} onPointerDown={() => setSelId(null)}>
            <SceneSVG scene={scene} width={W * scale} />
            {guide.v && <div className="guide-v" style={{ left: (W * scale) / 2 }} />}
            {guide.h && <div className="guide-h" style={{ top: (H * scale) / 2 }} />}
            {template.elements.map((el) => {
              if (el.hidden) return null;
              const hollow = el.type === 'rect' && !el.fill;
              const placeholder = (el.type === 'image' || el.type === 'signature') && !el.src;
              return (
                <div key={el.id}
                  className={`el-box${el.id === selId ? ' sel' : ''}${hollow ? ' hollow' : ''}${placeholder ? ' ph' : ''}`}
                  style={{ left: el.x * scale, top: el.y * scale, width: Math.max(4, el.w * scale), height: Math.max(4, el.h * scale) }}
                  onPointerDown={hollow ? undefined : (e) => startDrag(e, el, 'move')}
                  title={describe(el)}>
                  {hollow && ['t', 'r', 'b', 'l'].map((s) => <div key={s} className={`edge edge-${s}`} onPointerDown={(e) => startDrag(e, el, 'move')} />)}
                  {placeholder && <span>{el.type === 'signature' ? 'Firma (PNG transparente)' : el.label || 'Imagen'}</span>}
                  {el.id === selId && <div className="handle" onPointerDown={(e) => startDrag(e, el, 'resize')} />}
                </div>
              );
            })}
          </div>
        </div>
        <p className="muted small">Arrastra para mover y usa la esquina para redimensionar. Las flechas desplazan 1 pt (con Mayús, 10 pt); Supr elimina y Ctrl+D duplica.</p>
      </div>
      <aside className="editor-side">
        {sel
          ? <ElementProps key={sel.id} el={sel} update={(p) => update(sel.id, p)} remove={() => remove(sel.id)} duplicate={() => duplicate(sel.id)}
              reorder={(d) => reorder(sel.id, d)} fonts={template.fonts || []} varList={varList} onClose={() => setSelId(null)} />
          : <PageProps template={template} setTemplate={setTemplate} select={setSelId} />}
      </aside>
    </div>
  );
}

function VarPicker({ varList, onPick }) {
  const groups = [...new Set(varList.map((v) => v.group))];
  return (
    <select className="varpick" value="" onChange={(e) => { if (e.target.value) onPick(e.target.value); }}>
      <option value="">Insertar variable…</option>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {varList.filter((v) => v.group === g).map((v) => <option key={v.key} value={v.key}>{`{{${v.key}}}`} · {v.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function FontSelect({ value, onChange, fonts }) {
  return (
    <select value={value || 'helvetica'} onChange={(e) => onChange(e.target.value)}>
      <option value="helvetica">Helvetica (sans serif)</option>
      <option value="times">Times (serif)</option>
      <option value="courier">Courier (monoespaciada)</option>
      {fonts.map((f) => <option key={f.name} value={f.name}>{f.name} (personalizada)</option>)}
    </select>
  );
}

function ElementProps({ el, update, remove, duplicate, reorder, fonts, varList, onClose }) {
  const taRef = useRef();
  const [imgErr, setImgErr] = useState('');
  const insert = (field, key) => {
    const ta = taRef.current;
    const v = el[field] || '';
    const s = ta ? ta.selectionStart : v.length, e = ta ? ta.selectionEnd : v.length;
    update({ [field]: `${v.slice(0, s)}{{${key}}}${v.slice(e)}` });
  };
  const upload = async (file) => {
    setImgErr('');
    try { const img = await fileToImage(file); update({ src: img.src, natW: img.w, natH: img.h }); }
    catch (e) { setImgErr(e.message); }
  };

  return (
    <div className="props">
      <div className="props-head">
        <strong>{TYPE_LABEL[el.type]}</strong>
        <button className="btn ghost small" onClick={onClose}>Cerrar</button>
      </div>

      {el.type === 'text' && (
        <>
          <Field label="Contenido" hint="**negrita**, *cursiva*, {{variable}}, {{nombre|upper}} y [[texto opcional {{variable}}]], que se omite si la variable está vacía.">
            <textarea ref={taRef} rows={5} value={el.text} onChange={(e) => update({ text: e.target.value })} />
          </Field>
          <VarPicker varList={varList} onPick={(k) => insert('text', k)} />
          <div className="grid2">
            <Field label="Fuente"><FontSelect value={el.font} onChange={(font) => update({ font })} fonts={fonts} /></Field>
            <Color label="Color" value={el.color} onChange={(color) => update({ color })} />
            <Num label="Tamaño (pt)" value={el.size} onChange={(size) => update({ size })} />
            <Num label="Tamaño mínimo" value={el.minSize ?? Math.max(5, el.size * 0.45)} onChange={(minSize) => update({ minSize })} />
            <Num label="Interlineado" value={el.lineHeight || 1.2} step={0.05} onChange={(lineHeight) => update({ lineHeight })} />
            <Field label="Ajuste">
              <select value={el.fit || 'shrink'} onChange={(e) => update({ fit: e.target.value })}>
                <option value="single">Una línea, reducir si no cabe</option>
                <option value="shrink">Varias líneas, reducir si no cabe</option>
                <option value="wrap">Varias líneas, tamaño fijo</option>
              </select>
            </Field>
            <Field label="Alineación">
              <select value={el.align || 'left'} onChange={(e) => update({ align: e.target.value })}>
                <option value="left">Izquierda</option><option value="center">Centro</option>
                <option value="right">Derecha</option><option value="justify">Justificado</option>
              </select>
            </Field>
            <Field label="Vertical">
              <select value={el.valign || 'top'} onChange={(e) => update({ valign: e.target.value })}>
                <option value="top">Arriba</option><option value="middle">Centro</option><option value="bottom">Abajo</option>
              </select>
            </Field>
          </div>
          <div className="checks">
            <label className="check"><input type="checkbox" checked={!!el.bold} onChange={(e) => update({ bold: e.target.checked })} />Negrita</label>
            <label className="check"><input type="checkbox" checked={!!el.italic} onChange={(e) => update({ italic: e.target.checked })} />Cursiva</label>
            <label className="check"><input type="checkbox" checked={!!el.uppercase} onChange={(e) => update({ uppercase: e.target.checked })} />Mayúsculas</label>
          </div>
        </>
      )}

      {(el.type === 'image' || el.type === 'signature') && (
        <div className="stack">
          {el.src && <img className="thumb" src={el.src} alt="" />}
          <div className="row">
            <FileButton accept="image/png,image/jpeg,image/svg+xml,image/webp" onFile={upload}>{el.src ? 'Reemplazar imagen' : 'Subir imagen'}</FileButton>
            {el.src && <button className="btn ghost" onClick={() => update({ src: null, natW: null, natH: null })}>Quitar</button>}
          </div>
          {imgErr && <p className="error">{imgErr}</p>}
          {el.type === 'image' && <Field label="Etiqueta en el editor"><input value={el.label || ''} onChange={(e) => update({ label: e.target.value })} /></Field>}
        </div>
      )}

      {el.type === 'signature' && (
        <>
          <Field label="Nombre del firmante"><input value={el.name || ''} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label="Cargo (admite varias líneas y variables)">
            <textarea ref={taRef} rows={2} value={el.title || ''} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <VarPicker varList={varList} onPick={(k) => insert('title', k)} />
          <div className="grid2">
            <Field label="Fuente"><FontSelect value={el.font} onChange={(font) => update({ font })} fonts={fonts} /></Field>
            <Color label="Color" value={el.color} onChange={(color) => update({ color })} />
            <Num label="Tamaño (pt)" value={el.size || 10} onChange={(size) => update({ size })} />
          </div>
          <label className="check"><input type="checkbox" checked={el.line !== false} onChange={(e) => update({ line: e.target.checked })} />Línea de firma</label>
        </>
      )}

      {el.type === 'qr' && (
        <>
          <Field label="Contenido del QR" hint="Por defecto apunta al portal de verificación. Puedes usar otra URL o texto con variables.">
            <input value={el.content || ''} onChange={(e) => update({ content: e.target.value })} />
          </Field>
          <div className="grid2">
            <Color label="Color" value={el.color} onChange={(color) => update({ color })} />
            <Field label="Corrección de errores">
              <select value={el.ecl || 'M'} onChange={(e) => update({ ecl: e.target.value })}>
                <option value="L">Baja</option><option value="M">Media</option><option value="Q">Alta</option><option value="H">Máxima</option>
              </select>
            </Field>
            <Num label="Margen (módulos)" value={el.margin ?? 1} step={1} min={0} onChange={(margin) => update({ margin })} />
          </div>
          <label className="check"><input type="checkbox" checked={el.bg !== false} onChange={(e) => update({ bg: e.target.checked })} />Fondo blanco</label>
        </>
      )}

      {el.type === 'rect' && (
        <div className="grid2">
          <Color label="Relleno" value={el.fill} allowNone onChange={(fill) => update({ fill })} />
          <Color label="Borde" value={el.stroke} allowNone onChange={(stroke) => update({ stroke, strokeWidth: stroke ? el.strokeWidth || 1 : 0 })} />
          <Num label="Grosor del borde" value={el.strokeWidth || 0} step={0.25} min={0} onChange={(strokeWidth) => update({ strokeWidth })} />
        </div>
      )}

      <h4>Posición y tamaño (pt)</h4>
      <div className="grid4">
        <Num label="X" value={el.x} onChange={(x) => update({ x })} />
        <Num label="Y" value={el.y} onChange={(y) => update({ y })} />
        <Num label="Ancho" value={el.w} onChange={(w) => update(el.type === 'qr' ? { w, h: w } : { w })} />
        <Num label="Alto" value={el.h} onChange={(h) => update(el.type === 'qr' ? { w: h, h } : { h })} />
      </div>
      <label className="range">Opacidad
        <input type="range" min={0.05} max={1} step={0.05} value={el.opacity ?? 1} onChange={(e) => update({ opacity: Number(e.target.value) })} />
      </label>
      <div className="row wrap">
        <button className="btn small" onClick={() => reorder('top')}>Al frente</button>
        <button className="btn small" onClick={() => reorder('up')}>Subir</button>
        <button className="btn small" onClick={() => reorder('down')}>Bajar</button>
        <button className="btn small" onClick={() => reorder('bottom')}>Al fondo</button>
      </div>
      <div className="row">
        <button className="btn" onClick={duplicate}>Duplicar</button>
        <button className="btn danger" onClick={remove}>Eliminar</button>
      </div>
    </div>
  );
}

function PageProps({ template, setTemplate, select }) {
  const [preset, setPreset] = useState(template.docType || 'certificado');
  const [msg, setMsg] = useState('');
  const set = (patch) => setTemplate((t) => ({ ...t, ...patch }));

  const loadPreset = () => {
    if (!confirm('Se reemplazará el diseño actual por la plantilla base. ¿Continuar?')) return;
    const p = makePreset(preset);
    setTemplate((t) => ({ ...p, background: t.background, fonts: t.fonts }));
  };
  const uploadBg = async (file) => {
    try {
      const img = await fileToImage(file, { maxDim: 3508, background: true });
      set({ background: { src: img.src, w: img.w, h: img.h, fit: template.background?.fit || 'cover', opacity: template.background?.opacity ?? 1 } });
    } catch (e) { setMsg(e.message); }
  };
  const uploadFont = async (file) => {
    const name = safeFileName(file.name.replace(/\.[^.]+$/, '')) || 'Fuente';
    const data = await readFileAsDataURL(file);
    set({ fonts: [...(template.fonts || []).filter((f) => f.name !== name), { name, data }] });
    setMsg(`Fuente «${name}» disponible en el selector de fuentes.`);
  };
  const importJson = async (file) => {
    try {
      const t = JSON.parse(await file.text());
      if (!Array.isArray(t.elements) || !t.page) throw new Error('El archivo no es una plantilla válida.');
      setTemplate(t);
      setMsg('Plantilla importada.');
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div className="props">
      <h3>Documento</h3>
      <Field label="Plantilla base">
        <select value={preset} onChange={(e) => setPreset(e.target.value)}>
          {DOC_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      </Field>
      <button className="btn" onClick={loadPreset}>Cargar plantilla base</button>
      <Field label="Tipo de documento" hint="Se usa en {{tipo_documento}} y en el nombre de los archivos.">
        <input value={template.docLabel || ''} onChange={(e) => set({ docLabel: e.target.value })} />
      </Field>
      <div className="grid2">
        <Field label="Tamaño">
          <select value={template.page.size} onChange={(e) => set({ page: { ...template.page, size: e.target.value } })}>
            {Object.keys(PAGE_SIZES).map((k) => <option key={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Orientación">
          <select value={template.page.orientation} onChange={(e) => set({ page: { ...template.page, orientation: e.target.value } })}>
            <option value="landscape">Horizontal</option><option value="portrait">Vertical</option>
          </select>
        </Field>
      </div>

      <h4>Fondo o marca de agua</h4>
      <p className="muted small">PNG, JPG o SVG. Los SVG se rasterizan a unos 300 ppp porque el PDF no admite SVG incrustado.</p>
      <div className="row">
        <FileButton accept="image/png,image/jpeg,image/svg+xml,image/webp" onFile={uploadBg}>{template.background ? 'Reemplazar fondo' : 'Subir fondo'}</FileButton>
        {template.background && <button className="btn ghost" onClick={() => set({ background: null })}>Quitar</button>}
      </div>
      {template.background && (
        <>
          <Field label="Ajuste">
            <select value={template.background.fit} onChange={(e) => set({ background: { ...template.background, fit: e.target.value } })}>
              <option value="cover">Cubrir página</option><option value="contain">Contener</option><option value="stretch">Estirar</option>
            </select>
          </Field>
          <label className="range">Opacidad (para marca de agua)
            <input type="range" min={0.05} max={1} step={0.05} value={template.background.opacity ?? 1}
              onChange={(e) => set({ background: { ...template.background, opacity: Number(e.target.value) } })} />
          </label>
        </>
      )}

      <h4>Fuentes personalizadas</h4>
      <p className="muted small">TTF u OTF. Útil para tipografías institucionales o caracteres fuera del alfabeto latino.</p>
      <FileButton accept=".ttf,.otf,font/ttf,font/otf" onFile={uploadFont}>Subir fuente</FileButton>
      {(template.fonts || []).map((f) => (
        <div key={f.name} className="row between">
          <span>{f.name}</span>
          <button className="btn ghost small" onClick={() => set({ fonts: template.fonts.filter((x) => x.name !== f.name) })}>Quitar</button>
        </div>
      ))}

      <h4>Capas</h4>
      <ul className="layers">
        {[...template.elements].reverse().map((el) => (
          <li key={el.id}>
            <button className="layer" onClick={() => select(el.id)}>
              <span className="tag">{TYPE_LABEL[el.type]}</span>{describe(el)}
            </button>
          </li>
        ))}
        {!template.elements.length && <li className="muted">Sin elementos. Usa la barra «Añadir».</li>}
      </ul>

      <h4>Plantilla</h4>
      <div className="row wrap">
        <button className="btn" onClick={() => downloadText(JSON.stringify(template, null, 2), `plantilla_${safeFileName(template.docLabel) || 'documento'}.json`)}>Exportar JSON</button>
        <FileButton accept="application/json,.json" onFile={importJson}>Importar JSON</FileButton>
      </div>
      {msg && <p className="note">{msg}</p>}
    </div>
  );
}
