import { useEffect, useMemo, useRef, useState } from 'react';
import { renderPdf } from '../lib/pdf.js';
import { issueDocuments } from '../lib/issue.js';
import { safeFileName } from '../lib/fields.js';
import { buildPublicRegistry, recordsToCsv } from '../lib/registry.js';
import { buildZip, downloadBlob, sendEmailJS } from '../lib/browser.js';
import { RowNav, Progress } from './ui.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default function IssuePanel({ template, event, dataset, mapping, settings, setSettings, setRegistry, rowIndex, setRowIndex, previewVars }) {
  const rows = dataset.rows;
  const nameCol = mapping.nombre;
  const emailCol = mapping.email;
  const [pdfUrl, setPdfUrl] = useState(null);
  const [previewErr, setPreviewErr] = useState('');
  const [scope, setScope] = useState('all');
  const [range, setRange] = useState({ from: 1, to: rows.length || 1 });
  const [outZip, setOutZip] = useState(true);
  const [outMerged, setOutMerged] = useState(true);
  const [sendMail, setSendMail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null);
  const cancel = useRef(false);

  useEffect(() => setRange({ from: 1, to: rows.length || 1 }), [rows.length]);

  const emailReady = settings.emailjs.serviceId && settings.emailjs.templateId && settings.emailjs.publicKey;

  // Vista previa real en PDF (mismo motor que la emisión)
  useEffect(() => {
    let off = false;
    const t = setTimeout(async () => {
      try {
        const bytes = await renderPdf(template, [previewVars], { title: 'Vista previa' });
        if (off) return;
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        setPdfUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
        setPreviewErr('');
      } catch (e) { if (!off) setPreviewErr(e.message); }
    }, 350);
    return () => { off = true; clearTimeout(t); };
  }, [template, previewVars]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const longest = useMemo(() => {
    if (!nameCol || !rows.length) return -1;
    let best = 0;
    rows.forEach((r, i) => { if (String(r[nameCol] || '').length > String(rows[best][nameCol] || '').length) best = i; });
    return best;
  }, [rows, nameCol]);

  const selection = useMemo(() => {
    if (scope === 'one') return rows.length ? [rowIndex] : [];
    if (scope === 'range') {
      const a = Math.max(1, Math.min(range.from, range.to)), b = Math.min(rows.length, Math.max(range.from, range.to));
      return Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a - 1 + k);
    }
    return rows.map((_, i) => i);
  }, [scope, range, rows, rowIndex]);

  const addLog = (m, kind = '') => setLog((l) => [...l, { m, kind }]);

  async function emit() {
    if (!selection.length) return;
    const sel = selection.map((i) => rows[i]);
    const noName = sel.filter((r) => !nameCol || !String(r[nameCol] || '').trim()).length;
    if (noName && !confirm(`${noName} documento(s) quedarían sin nombre. ¿Emitir de todas formas?`)) return;
    setBusy(true); setResult(null); setLog([]); cancel.current = false;
    try {
      const res = await issueDocuments({
        template, event, rows: sel, mapping, settings,
        onProgress: (label, i, n) => setProg({ label, i, n }),
        shouldCancel: () => cancel.current,
      });
      setRegistry((r) => [...r, ...res.items.map((x) => x.record)]);
      setSettings((s) => ({ ...s, nextFolio: res.nextFolio }));
      addLog(`Emitidos ${res.items.length} documentos (folios ${res.items[0].record.folio} a ${res.items.at(-1).record.folio}).`, 'ok');

      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const baseName = `${safeFileName(event.evento) || 'documentos'}_${safeFileName(template.docLabel) || 'doc'}_${stamp}`;
      const out = {};
      if (res.items.length === 1) out.single = { blob: new Blob([res.items[0].bytes], { type: 'application/pdf' }), name: res.items[0].fileName };
      if (outZip && res.items.length > 1) {
        setProg({ label: 'Comprimiendo ZIP', i: 0, n: 1 });
        const records = res.items.map((x) => x.record);
        out.zip = {
          blob: await buildZip(res.items, {
            'registro_lote.csv': recordsToCsv(records),
            'registro_lote_publico.json': JSON.stringify(buildPublicRegistry(records, settings.publicLevel, { institucion: event.institucion }), null, 2),
          }),
          name: `${baseName}.zip`,
        };
      }
      if (outMerged && res.items.length > 1) out.merged = { blob: new Blob([res.mergedBytes], { type: 'application/pdf' }), name: `${baseName}_imprenta.pdf` };
      setResult(out);

      if (sendMail && emailReady) {
        let ok = 0, fail = 0;
        for (let i = 0; i < res.items.length; i++) {
          if (cancel.current) { addLog('Envío de correos detenido.', 'warn'); break; }
          const it = res.items[i];
          setProg({ label: 'Enviando correos', i: i + 1, n: res.items.length });
          if (!EMAIL_RE.test(it.vars.email || '')) { addLog(`Sin correo válido: ${it.vars.nombre || it.fileName}`, 'warn'); fail++; continue; }
          try { await sendEmailJS(settings.emailjs, it); ok++; addLog(`Enviado a ${it.vars.email}`, 'ok'); }
          catch (e) { fail++; addLog(`Error con ${it.vars.email}: ${e?.text || e?.message || e}`, 'error'); }
          await wait(1100);
        }
        addLog(`Correo: ${ok} enviados, ${fail} con problemas.`, fail ? 'warn' : 'ok');
      }
      addLog('Recuerda publicar el registro actualizado (pestaña Registro) para que los QR verifiquen.', 'warn');
    } catch (e) {
      addLog(e.message, 'error');
    } finally {
      setBusy(false); setProg(null);
    }
  }

  return (
    <section className="issue">
      <div className="issue-preview">
        <div className="row between">
          <h2>Vista previa real</h2>
          <div className="row">
            <button className="btn small" disabled={longest < 0} onClick={() => setRowIndex(longest)}>Ir al nombre más largo</button>
            {pdfUrl && <a className="btn small" href={pdfUrl} target="_blank" rel="noreferrer">Abrir en pestaña</a>}
          </div>
        </div>
        <RowNav index={rowIndex} total={rows.length} setIndex={setRowIndex} label={previewVars.nombre} />
        {previewErr && <p className="error">No se pudo generar la vista previa: {previewErr}</p>}
        <div className="pdf-frame">
          {pdfUrl ? <iframe title="Vista previa PDF" src={`${pdfUrl}#toolbar=0&view=Fit`} /> : <p className="muted">Generando…</p>}
        </div>
        <p className="muted small">Este es el PDF definitivo para la fila seleccionada, salvo el ID, el folio y el código, que se asignan al emitir.</p>
      </div>

      <div className="issue-side panel">
        <h2>Emitir</h2>
        <fieldset>
          <legend>Qué emitir</legend>
          <label className="radio"><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />Todo el lote ({rows.length})</label>
          <label className="radio"><input type="radio" checked={scope === 'one'} onChange={() => setScope('one')} />Solo la fila en vista previa (emisión individual)</label>
          <label className="radio"><input type="radio" checked={scope === 'range'} onChange={() => setScope('range')} />Un rango de filas</label>
          {scope === 'range' && (
            <div className="row">
              desde <input type="number" min={1} max={rows.length} value={range.from} onChange={(e) => setRange({ ...range, from: Number(e.target.value) })} />
              hasta <input type="number" min={1} max={rows.length} value={range.to} onChange={(e) => setRange({ ...range, to: Number(e.target.value) })} />
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend>Formato de salida</legend>
          <label className="check"><input type="checkbox" checked={outZip} onChange={(e) => setOutZip(e.target.checked)} />ZIP con un PDF por persona, más el registro del lote</label>
          <label className="check"><input type="checkbox" checked={outMerged} onChange={(e) => setOutMerged(e.target.checked)} />PDF único multipágina para imprenta</label>
          <p className="muted small">La emisión individual entrega directamente un solo PDF.</p>
        </fieldset>
        <fieldset>
          <legend>Distribución</legend>
          <label className="check">
            <input type="checkbox" checked={sendMail} disabled={!emailReady || !emailCol} onChange={(e) => setSendMail(e.target.checked)} />
            Enviar por correo con EmailJS {settings.emailjs.attach ? '(con PDF adjunto)' : '(solo enlace)'}
          </label>
          {!emailReady && <p className="muted small">Configura EmailJS en Ajustes para activar el envío.</p>}
          {emailReady && !emailCol && <p className="muted small">Asigna la columna de correo en Participantes.</p>}
        </fieldset>
        <div className="row">
          <button className="btn primary big" disabled={busy || !selection.length} onClick={emit}>
            {busy ? 'Emitiendo…' : `Emitir ${selection.length} documento${selection.length === 1 ? '' : 's'}`}
          </button>
          {busy && <button className="btn danger ghost" onClick={() => { cancel.current = true; }}>Cancelar</button>}
        </div>
        {prog && <Progress value={prog.i} max={prog.n} label={prog.label} />}

        {result && (
          <div className="downloads">
            <h3>Descargas</h3>
            {result.single && <button className="btn primary" onClick={() => downloadBlob(result.single.blob, result.single.name)}>Descargar {result.single.name}</button>}
            {result.zip && <button className="btn primary" onClick={() => downloadBlob(result.zip.blob, result.zip.name)}>Descargar ZIP ({result.zip.blob.size > 1e6 ? `${(result.zip.blob.size / 1e6).toFixed(1)} MB` : `${Math.ceil(result.zip.blob.size / 1e3)} KB`})</button>}
            {result.merged && <button className="btn" onClick={() => downloadBlob(result.merged.blob, result.merged.name)}>Descargar PDF de imprenta</button>}
          </div>
        )}
        {!!log.length && <ul className="log">{log.map((l, i) => <li key={i} className={l.kind}>{l.m}</li>)}</ul>}
      </div>
    </section>
  );
}
