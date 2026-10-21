import { useEffect, useMemo, useRef, useState } from 'react';
import { buildScene } from '../lib/scene.js';
import { pageDims, PAGE_SIZES } from '../lib/page.js';
import { browserMeasure, fileToImage, readFileAsDataURL, downloadText } from '../lib/browser.js';
import { newElement } from '../lib/presets.js';
import { shortId } from '../lib/ids.js';
import { safeFileName } from '../lib/fields.js';
import { SceneSVG } from './SceneSVG.jsx';
import { TextBox, TextHelp, toFriendly } from './TextBox.jsx';
import { Field, Num, Color, FileButton, RowNav, ImagePicker } from './ui.jsx';

const RAW = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? `{{${k}}}` : undefined) });
const half = (v) => Math.round(v * 2) / 2;

const TYPE_LABEL = { text: 'Texto', image: 'Imagen', signature: 'Firma', qr: 'Código QR', rect: 'Forma' };

function describe(el, maps) {
  if (el.type === 'text') return toFriendly(el.text, maps).replace(/\*|\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 48) || 'Texto';
  if (el.type === 'rect') return el.h <= 3 ? 'Línea' : el.fill ? 'Recuadro de color' : 'Marco';
  if (el.type === 'signature') return `Firma de ${el.name || '…'}`;
  if (el.type === 'image') return el.label || 'Imagen';
  return TYPE_LABEL[el.type];
}

export default function Editor({ template, setTemplate, undo, redo, canUndo, canRedo, vars, maps, rowNav }) {
  const [selId, setSelId] = useState(null);
  const [focusText, setFocusText] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [guide, setGuide] = useState({ v: false, h: false });
  const [addOpen, setAddOpen] = useState(false);
  const wrapRef = useRef(null);
  const [avail, setAvail] = useState(900);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const [W, H] = pageDims(template.page);
  const fitH = Math.max(320, window.innerHeight - 300) / H;
  const scale = Math.max(0.15, Math.min((avail - 24) / W, fitH)) * zoom;
  const scene = useMemo(() => buildScene(template, showRaw ? RAW : vars, browserMeasure), [template, vars, showRaw]);
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
    const j = dir === 'top' ? els.length - 1 : 0;
    if (i < 0 || i === j) return t;
    const [el] = els.splice(i, 1);
    els.splice(j, 0, el);
    return { ...t, elements: els };
  });
  const add = (type) => {
    const el = newElement(type, template.page);
    if (type === 'image') el.role = undefined;
    setTemplate((t) => ({ ...t, elements: [...t.elements, el] }));
    setSelId(el.id);
    setFocusText(type === 'text');
    setAddOpen(false);
  };

  useEffect(() => {
    function onKey(e) {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (!selId || typing) return;
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
    if (selId !== el.id) setFocusText(false);
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

  const phFont = Math.max(9, Math.min(13, 11 * scale));

  return (
    <div className="editor">
      <div className="editor-main">
        <div className="toolbar">
          <div className="tool-group">
            <button className="btn" onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)">↶ Deshacer</button>
            <button className="btn" onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl+Mayús+Z)">↷ Rehacer</button>
            <div className="menu-wrap">
              <button className="btn primary" onClick={() => setAddOpen((o) => !o)} aria-expanded={addOpen}>+ Agregar al documento</button>
              {addOpen && (
                <div className="menu" role="menu">
                  <button role="menuitem" onClick={() => add('text')}><strong>Texto</strong><span>Un título, una frase o un párrafo</span></button>
                  <button role="menuitem" onClick={() => add('image')}><strong>Imagen</strong><span>Un segundo logo, un sello o una ilustración</span></button>
                  <button role="menuitem" onClick={() => add('signature')}><strong>Firma</strong><span>Imagen de firma con nombre y cargo</span></button>
                  <button role="menuitem" onClick={() => add('qr')}><strong>Código QR</strong><span>Lleva a la página de verificación</span></button>
                  <button role="menuitem" onClick={() => add('line')}><strong>Línea</strong><span>Para separar secciones</span></button>
                  <button role="menuitem" onClick={() => add('rect')}><strong>Recuadro</strong><span>Un marco o una franja de color</span></button>
                </div>
              )}
            </div>
          </div>
          <div className="tool-group">
            <label className="check" title="Muestra dónde va cada dato automático en lugar de los datos de una persona">
              <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />Mostrar dónde van los datos
            </label>
            <button className="btn icon" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))} aria-label="Alejar">−</button>
            <button className="btn ghost small" onClick={() => setZoom(1)} title="Ajustar a la pantalla">{Math.round(zoom * 100)}%</button>
            <button className="btn icon" onClick={() => setZoom((z) => Math.min(3, z + 0.15))} aria-label="Acercar">+</button>
          </div>
        </div>
        <div className="rowbar">
          <span className="muted">Viendo el documento de:</span>
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
                  onDoubleClick={() => { if (el.type === 'text') setFocusText(true); }}
                  title={`${describe(el, maps)} · clic para modificar`}>
                  {hollow && ['t', 'r', 'b', 'l'].map((s) => <div key={s} className={`edge edge-${s}`} onPointerDown={(e) => startDrag(e, el, 'move')} />)}
                  {placeholder && el.type === 'image' && el.h * scale > 22 && <span style={{ fontSize: phFont }}>{el.role === 'logo' ? 'Aquí va tu logo' : 'Imagen'}</span>}
                  {el.id === selId && <div className="handle" title="Arrastra para cambiar el tamaño" onPointerDown={(e) => startDrag(e, el, 'resize')} />}
                </div>
              );
            })}
          </div>
        </div>
        <p className="muted small">Haz clic en cualquier parte del documento para modificarla. Arrástrala para moverla y usa el cuadrito azul de la esquina para cambiar su tamaño.</p>
      </div>
      <aside className="editor-side">
        {sel
          ? <ElementProps key={sel.id} el={sel} update={(p) => update(sel.id, p)} remove={() => remove(sel.id)} duplicate={() => duplicate(sel.id)}
              reorder={(d) => reorder(sel.id, d)} fonts={template.fonts || []} maps={maps} focusText={focusText} onClose={() => setSelId(null)} />
          : <Overview template={template} setTemplate={setTemplate} maps={maps} select={(id) => { setSelId(id); setFocusText(true); }} update={update} />}
      </aside>
    </div>
  );
}

function FontSelect({ value, onChange, fonts }) {
  return (
    <select value={value || 'helvetica'} onChange={(e) => onChange(e.target.value)}>
      <option value="helvetica">Moderna (Helvetica)</option>
      <option value="times">Clásica (Times)</option>
      <option value="courier">Máquina de escribir (Courier)</option>
      {fonts.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
    </select>
  );
}

function SizeButtons({ value, onChange }) {
  return (
    <div className="seg">
      <button type="button" className="btn small" onClick={() => onChange(Math.max(5, Math.round((value - 1) * 2) / 2))} aria-label="Letra más chica">A−</button>
      <span className="seg-val">{value} pt</span>
      <button type="button" className="btn small" onClick={() => onChange(Math.round((value + 1) * 2) / 2)} aria-label="Letra más grande">A+</button>
    </div>
  );
}

function AlignButtons({ value, onChange }) {
  const opts = [['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha'], ['justify', 'Justificado']];
  return (
    <div className="seg" role="group" aria-label="Alineación">
      {opts.map(([k, l]) => (
        <button type="button" key={k} className={`btn small${value === k ? ' on' : ''}`} onClick={() => onChange(k)} aria-pressed={value === k}>{l}</button>
      ))}
    </div>
  );
}

function ElementProps({ el, update, remove, duplicate, reorder, fonts, maps, focusText, onClose }) {
  const [imgErr, setImgErr] = useState('');
  const upload = async (file) => {
    setImgErr('');
    try { const img = await fileToImage(file); update({ src: img.src, natW: img.w, natH: img.h }); }
    catch (e) { setImgErr(e.message); }
  };

  return (
    <div className="props">
      <div className="props-head">
        <button className="btn ghost small" onClick={onClose}>← Volver a la lista</button>
        <strong>{TYPE_LABEL[el.type]}</strong>
      </div>

      {el.type === 'text' && (
        <>
          <TextBox value={el.text} onChange={(text) => update({ text })} maps={maps} rows={5} autoFocus={focusText} label="Texto" />
          <TextHelp />
          <div className="prop-row"><span>Tamaño de letra</span><SizeButtons value={el.size || 12} onChange={(size) => update({ size })} /></div>
          <div className="prop-row"><span>Alineación</span><AlignButtons value={el.align || 'left'} onChange={(align) => update({ align })} /></div>
          <div className="prop-row"><span>Estilo</span>
            <div className="checks">
              <label className="check"><input type="checkbox" checked={!!el.bold} onChange={(e) => update({ bold: e.target.checked })} />Negrita</label>
              <label className="check"><input type="checkbox" checked={!!el.italic} onChange={(e) => update({ italic: e.target.checked })} />Cursiva</label>
              <label className="check"><input type="checkbox" checked={!!el.uppercase} onChange={(e) => update({ uppercase: e.target.checked })} />MAYÚSCULAS</label>
            </div>
          </div>
          <div className="grid2">
            <Field label="Tipo de letra"><FontSelect value={el.font} onChange={(font) => update({ font })} fonts={fonts} /></Field>
            <Color label="Color" value={el.color} onChange={(color) => update({ color })} />
          </div>
          <details className="more">
            <summary>Más opciones de texto</summary>
            <div className="grid2">
              <Field label="Si el texto no cabe">
                <select value={el.fit || 'shrink'} onChange={(e) => update({ fit: e.target.value })}>
                  <option value="single">Mantener en una línea y achicar</option>
                  <option value="shrink">Usar varias líneas y achicar</option>
                  <option value="wrap">Usar varias líneas sin achicar</option>
                </select>
              </Field>
              <Num label="Letra mínima al achicar (pt)" value={el.minSize ?? Math.round(Math.max(5, el.size * 0.45))} onChange={(minSize) => update({ minSize })} />
              <Num label="Espacio entre líneas" value={el.lineHeight || 1.2} step={0.05} onChange={(lineHeight) => update({ lineHeight })} />
              <Field label="Posición vertical en su recuadro">
                <select value={el.valign || 'top'} onChange={(e) => update({ valign: e.target.value })}>
                  <option value="top">Arriba</option><option value="middle">Al medio</option><option value="bottom">Abajo</option>
                </select>
              </Field>
            </div>
          </details>
        </>
      )}

      {el.type === 'image' && (
        <ImagePicker src={el.src} onPick={upload} onClear={() => update({ src: null, natW: null, natH: null })}
          label={el.role === 'logo' ? 'Subir logo' : 'Subir imagen'} hint="PNG, JPG o SVG. Para logos, mejor PNG con fondo transparente." error={imgErr} checker />
      )}

      {el.type === 'signature' && (
        <>
          <ImagePicker src={el.src} onPick={upload} onClear={() => update({ src: null, natW: null, natH: null })}
            label="Subir imagen de la firma" hint="Ideal: firma escaneada en PNG con fondo transparente. También sirve una foto recortada sobre fondo blanco." error={imgErr} checker />
          <Field label="Nombre de quien firma"><input value={el.name || ''} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label="Cargo (puedes usar dos líneas)"><textarea rows={2} value={el.title || ''} onChange={(e) => update({ title: e.target.value })} /></Field>
          <div className="prop-row"><span>Tamaño de letra</span><SizeButtons value={el.size || 10} onChange={(size) => update({ size })} /></div>
          <label className="check"><input type="checkbox" checked={el.line !== false} onChange={(e) => update({ line: e.target.checked })} />Mostrar la línea de firma</label>
        </>
      )}

      {el.type === 'qr' && (
        <>
          <p className="note small">Este código lleva a la página donde cualquiera puede comprobar que el documento es auténtico. Cada persona recibe un código distinto.</p>
          <Color label="Color" value={el.color} onChange={(color) => update({ color })} />
          <details className="more">
            <summary>Usar otro enlace</summary>
            <Field label="Contenido del código" hint="Déjalo como está para la verificación. Puedes poner, por ejemplo, el enlace al programa del congreso.">
              <input value={el.content || ''} onChange={(e) => update({ content: e.target.value })} />
            </Field>
            <button className="btn small" onClick={() => update({ content: '{{url_verificacion}}' })}>Volver al enlace de verificación</button>
          </details>
        </>
      )}

      {el.type === 'rect' && (
        <div className="grid2">
          <Color label="Relleno" value={el.fill} allowNone onChange={(fill) => update({ fill })} />
          <Color label="Borde" value={el.stroke} allowNone onChange={(stroke) => update({ stroke, strokeWidth: stroke ? el.strokeWidth || 1 : 0 })} />
          {el.stroke && <Num label="Grosor del borde" value={el.strokeWidth || 0} step={0.25} min={0} onChange={(strokeWidth) => update({ strokeWidth })} />}
        </div>
      )}

      <details className="more">
        <summary>Posición exacta y transparencia</summary>
        <div className="grid4">
          <Num label="Izquierda" value={el.x} onChange={(x) => update({ x })} />
          <Num label="Arriba" value={el.y} onChange={(y) => update({ y })} />
          <Num label="Ancho" value={el.w} onChange={(w) => update(el.type === 'qr' ? { w, h: w } : { w })} />
          <Num label="Alto" value={el.h} onChange={(h) => update(el.type === 'qr' ? { w: h, h } : { h })} />
        </div>
        <p className="muted small">Medidas en puntos tipográficos (1 cm ≈ 28 pt).</p>
        <label className="range">Transparencia
          <input type="range" min={0.05} max={1} step={0.05} value={el.opacity ?? 1} onChange={(e) => update({ opacity: Number(e.target.value) })} />
        </label>
        <div className="row wrap">
          <button className="btn small" onClick={() => reorder('top')}>Traer al frente</button>
          <button className="btn small" onClick={() => reorder('bottom')}>Enviar al fondo</button>
        </div>
      </details>

      <div className="row">
        <button className="btn" onClick={duplicate}>Duplicar</button>
        <button className="btn danger" onClick={remove}>Eliminar del documento</button>
      </div>
    </div>
  );
}

function Overview({ template, setTemplate, maps, select, update }) {
  const [msg, setMsg] = useState('');
  const set = (patch) => setTemplate((t) => ({ ...t, ...patch }));
  const texts = template.elements.filter((e) => e.type === 'text');

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
    setMsg(`La tipografía «${name}» ya aparece en «Tipo de letra».`);
  };
  const importJson = async (file) => {
    try {
      const t = JSON.parse(await file.text());
      if (!Array.isArray(t.elements) || !t.page) throw new Error('Ese archivo no es un diseño guardado con esta aplicación.');
      setTemplate(t);
      setMsg('Diseño cargado.');
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div className="props">
      <h3 className="side-title">Textos del documento</h3>
      <p className="muted small">Edítalos aquí o haz clic sobre ellos en el documento. Los datos entre llaves, como {'{Nombre}'}, se completan solos para cada persona.</p>
      <div className="text-list">
        {texts.map((el) => (
          <div key={el.id} className="text-item">
            <TextBox compact value={el.text} onChange={(text) => update(el.id, { text })} maps={maps} rows={Math.min(5, Math.max(1, Math.ceil((el.text || '').length / 38)))} />
            <button className="linklike small" onClick={() => select(el.id)}>Tamaño, color y posición</button>
          </div>
        ))}
      </div>
      <TextHelp />

      <details className="more">
        <summary>Tamaño de página y fondo</summary>
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
        <span className="field-label">Fondo o marca de agua</span>
        <ImagePicker src={template.background?.src} onPick={uploadBg} onClear={() => set({ background: null })} label="Subir imagen de fondo"
          hint="Una imagen del tamaño de la página, por ejemplo el papel membretado de tu institución." />
        {template.background && (
          <label className="range">Intensidad del fondo (bájala para que sea marca de agua)
            <input type="range" min={0.05} max={1} step={0.05} value={template.background.opacity ?? 1}
              onChange={(e) => set({ background: { ...template.background, opacity: Number(e.target.value) } })} />
          </label>
        )}
      </details>

      <details className="more">
        <summary>Tipografía de la institución</summary>
        <p className="muted small">Si tu institución usa una tipografía propia, sube el archivo (.ttf u .otf) y aparecerá en «Tipo de letra».</p>
        <FileButton accept=".ttf,.otf,font/ttf,font/otf" onFile={uploadFont}>Subir tipografía</FileButton>
        {(template.fonts || []).map((f) => (
          <div key={f.name} className="row between">
            <span>{f.name}</span>
            <button className="btn ghost small" onClick={() => set({ fonts: template.fonts.filter((x) => x.name !== f.name) })}>Quitar</button>
          </div>
        ))}
      </details>

      <details className="more">
        <summary>Guardar o cargar este diseño</summary>
        <p className="muted small">Guarda el diseño como archivo para usarlo en otro computador o compartirlo con tu equipo.</p>
        <div className="row wrap">
          <button className="btn" onClick={() => downloadText(JSON.stringify(template), `diseno_${safeFileName(template.docLabel) || 'documento'}.json`)}>Guardar diseño en un archivo</button>
          <FileButton accept="application/json,.json" onFile={importJson}>Cargar un diseño</FileButton>
        </div>
      </details>
      {msg && <p className="note">{msg}</p>}
    </div>
  );
}
