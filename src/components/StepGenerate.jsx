import { useMemo, useRef, useState } from 'react';
import { renderPdf } from '../lib/pdf.js';
import { buildScene } from '../lib/scene.js';
import { issueDocuments } from '../lib/issue.js';
import { safeFileName } from '../lib/fields.js';
import { buildPublicRegistry, recordsToCsv } from '../lib/registry.js';
import { browserMeasure, buildZip, downloadBlob, sendEmailJS } from '../lib/browser.js';
import { SceneSVG } from './SceneSVG.jsx';
import { RowNav, Progress } from './ui.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isLocal = () => typeof window !== 'undefined' && (window.location.protocol === 'file:' || /^(localhost|127\.)/.test(window.location.hostname));
const kb = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.ceil(n / 1e3))} KB`);

export default function StepGenerate({ template, event, dataset, mapping, settings, setSettings, registry, setRegistry, rowIndex, setRowIndex, previewVars, qr, goTo }) {
  const rows = dataset.rows;
  const nameCol = mapping.nombre;
  const [scope, setScope] = useState('all');
  const [outZip, setOutZip] = useState(true);
  const [outMerged, setOutMerged] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [confirmSample, setConfirmSample] = useState(false);
  const [mail, setMail] = useState(null);
  const cancel = useRef(false);

  const scene = useMemo(() => buildScene(template, previewVars, browserMeasure), [template, previewVars]);
  const W = Math.min(820, scene.W > scene.H ? 820 : 560);

  const longest = useMemo(() => {
    if (!nameCol || !rows.length) return -1;
    let best = 0;
    rows.forEach((r, i) => { if (String(r[nameCol] || '').length > String(rows[best][nameCol] || '').length) best = i; });
    return best;
  }, [rows, nameCol]);

  const selection = scope === 'one' ? (rows.length ? [rowIndex] : []) : rows.map((_, i) => i);
  const docWord = (template.docLabel || 'documento').replace(/_/g, ' ').toLowerCase();
  const plural = (n) => (n === 1 ? docWord : docWord.endsWith('n') ? `${docWord}es` : `${docWord}s`);
  const emailReady = settings.emailjs.serviceId && settings.emailjs.templateId && settings.emailjs.publicKey;

  const openPdf = async () => {
    const w = window.open('', '_blank');
    const bytes = await renderPdf(template, [previewVars], { title: 'Vista previa' });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (w) w.location.href = url; else downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'vista_previa.pdf');
  };

  async function emit(force = false) {
    if (!selection.length) return;
    if (dataset.sample && !force) { setConfirmSample(true); return; }
    setConfirmSample(false);
    setBusy(true); setResult(null); setError(''); setMail(null); cancel.current = false;
    try {
      const sel = selection.map((i) => rows[i]);
      const res = await issueDocuments({
        template, event, rows: sel, mapping, settings,
        onProgress: (label, i, n) => setProg({ label: label === 'Componiendo páginas' ? 'Preparando páginas' : 'Creando archivos', i, n }),
        shouldCancel: () => cancel.current,
      });
      const records = res.items.map((x) => x.record);
      const all = [...registry, ...records];
      setRegistry(all);
      setSettings((s) => ({ ...s, nextFolio: res.nextFolio }));

      const stamp = new Date().toISOString().slice(0, 10);
      const baseName = `${safeFileName(event.evento) || 'documentos'}_${safeFileName(template.docLabel) || 'doc'}_${stamp}`;
      const out = { items: res.items, count: res.items.length, first: records[0].folio, last: records.at(-1).folio };
      if (res.items.length === 1) out.single = { blob: new Blob([res.items[0].bytes], { type: 'application/pdf' }), name: res.items[0].fileName };
      else {
        if (outZip) {
          setProg({ label: 'Comprimiendo', i: 1, n: 1 });
          out.zip = {
            blob: await buildZip(res.items, {
              'lista_de_documentos.csv': recordsToCsv(records),
              'registro_lote.json': JSON.stringify(buildPublicRegistry(records, settings.publicLevel, { institucion: event.institucion }), null, 2),
            }),
            name: `${baseName}.zip`,
          };
        }
        if (outMerged) out.merged = { blob: new Blob([res.mergedBytes], { type: 'application/pdf' }), name: `${baseName}_para_imprimir.pdf` };
      }
      setResult(out);
      if (qr.connected) qr.publish(all);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false); setProg(null);
    }
  }

  async function sendMail() {
    const items = result.items;
    let ok = 0; const fails = [];
    cancel.current = false;
    setMail({ running: true, ok: 0, fails: [] });
    for (let i = 0; i < items.length; i++) {
      if (cancel.current) break;
      const it = items[i];
      setProg({ label: 'Enviando correos', i: i + 1, n: items.length });
      if (!EMAIL_RE.test(String(it.vars.email || '').trim())) { fails.push(`${it.vars.nombre || it.fileName}: sin correo válido`); continue; }
      try { await sendEmailJS(settings.emailjs, it); ok++; }
      catch (e) { fails.push(`${it.vars.nombre}: ${e?.text || e?.message || 'error al enviar'}`); }
      setMail({ running: true, ok, fails: [...fails] });
      await wait(1100);
    }
    setProg(null);
    setMail({ running: false, ok, fails });
  }

  return (
    <section className="step-wrap wide">
      <header className="step-head">
        <h1>Revisar y generar</h1>
        <p>Revisa cómo queda el documento de cada persona. Cuando esté todo bien, genera los archivos.</p>
      </header>

      <div className="gen">
        <div className="card gen-preview">
          <div className="row between">
            <RowNav index={rowIndex} total={rows.length} setIndex={setRowIndex} label={previewVars.nombre} />
            <div className="row wrap">
              <button className="btn small" disabled={longest < 0} onClick={() => setRowIndex(longest)} title="Revisa que el nombre más largo quepa bien">Ver el nombre más largo</button>
              <button className="btn small" onClick={openPdf}>Abrir como PDF</button>
            </div>
          </div>
          <div className="preview-box"><SceneSVG scene={scene} width={W} /></div>
          <p className="muted small">El código QR y el número de folio definitivos se asignan al generar.</p>
        </div>

        <div className="card gen-side">
          {!result && (
            <>
              <h2>Generar</h2>
              <div className="radio-cards">
                <label className={`radio-card${scope === 'all' ? ' on' : ''}`}>
                  <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
                  <span><strong>Para todas las personas</strong><br /><span className="muted">{rows.length} {plural(rows.length)}</span></span>
                </label>
                <label className={`radio-card${scope === 'one' ? ' on' : ''}`}>
                  <input type="radio" checked={scope === 'one'} onChange={() => setScope('one')} disabled={!rows.length} />
                  <span><strong>Solo para esta persona</strong><br /><span className="muted">{previewVars.nombre || '—'}</span></span>
                </label>
              </div>
              {scope === 'all' && rows.length > 1 && (
                <details className="more">
                  <summary>¿Qué archivos quieres recibir?</summary>
                  <label className="check"><input type="checkbox" checked={outZip} onChange={(e) => setOutZip(e.target.checked)} />Un archivo por persona (en una carpeta comprimida .zip)</label>
                  <label className="check"><input type="checkbox" checked={outMerged} onChange={(e) => setOutMerged(e.target.checked)} />Todos juntos en un solo PDF, listo para imprimir</label>
                </details>
              )}
              {isLocal() && !settings.baseUrl && (
                <p className="banner warn small">Estás usando la versión de prueba en tu computador. Los documentos se generan bien, pero sus códigos QR no llevarán a ninguna página.</p>
              )}
              {confirmSample ? (
                <div className="confirm">
                  <p>La lista tiene <strong>personas de ejemplo</strong>. ¿Generar igualmente, solo para probar?</p>
                  <div className="row wrap">
                    <button className="btn primary" onClick={() => emit(true)}>Sí, es una prueba</button>
                    <button className="btn ghost" onClick={() => goTo(3)}>Ir a cargar mi lista</button>
                  </div>
                </div>
              ) : (
                <button className="btn primary big block" disabled={busy || !selection.length} onClick={() => emit()}>
                  {busy ? 'Generando…' : `Generar ${selection.length} ${plural(selection.length)}`}
                </button>
              )}
              {busy && <button className="btn ghost block" onClick={() => { cancel.current = true; }}>Cancelar</button>}
              {prog && <Progress value={prog.i} max={prog.n} label={prog.label} />}
              {error && <p className="error">{error}</p>}
            </>
          )}

          {result && (
            <div className="done">
              <div className="done-head">
                <span className="done-icon" aria-hidden>✓</span>
                <div>
                  <h2>{result.count === 1 ? 'Documento listo' : `${result.count} documentos listos`}</h2>
                  <p className="muted small">Folio{result.count > 1 ? `s ${result.first} a ${result.last}` : ` ${result.first}`}</p>
                </div>
              </div>

              <h3>1. Descarga</h3>
              <div className="stack">
                {result.single && <button className="btn primary block" onClick={() => downloadBlob(result.single.blob, result.single.name)}>Descargar PDF</button>}
                {result.zip && <button className="btn primary block" onClick={() => downloadBlob(result.zip.blob, result.zip.name)}>Descargar un PDF por persona (.zip, {kb(result.zip.blob.size)})</button>}
                {result.merged && <button className="btn block" onClick={() => downloadBlob(result.merged.blob, result.merged.name)}>Descargar todo en un PDF para imprimir</button>}
              </div>

              <h3>2. Códigos QR</h3>
              <QrStatus qr={qr} />

              <h3>3. Envío por correo <span className="muted small">(opcional)</span></h3>
              {!emailReady && <p className="muted small">Para enviar cada documento a su destinatario, configura el correo en <button className="linklike" onClick={() => goTo('config')}>Configuración</button>.</p>}
              {emailReady && !mapping.email && <p className="muted small">La lista no tiene una columna de correo. Indícala en el paso «Personas».</p>}
              {emailReady && mapping.email && !mail && <button className="btn block" onClick={sendMail}>Enviar a cada persona por correo</button>}
              {mail && (
                <div className="stack">
                  {mail.running && <button className="btn ghost" onClick={() => { cancel.current = true; }}>Detener envío</button>}
                  {prog && <Progress value={prog.i} max={prog.n} label={prog.label} />}
                  <p className={mail.fails.length ? 'banner warn small' : 'banner ok small'}>{mail.running ? 'Enviando…' : 'Envío terminado.'} {mail.ok} enviados{mail.fails.length ? `, ${mail.fails.length} con problemas` : ''}.</p>
                  {!!mail.fails.length && <ul className="small fails">{mail.fails.map((f, i) => <li key={i}>{f}</li>)}</ul>}
                </div>
              )}

              <button className="btn ghost block" onClick={() => setResult(null)}>Generar otros documentos</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function QrStatus({ qr }) {
  if (!qr.connected) {
    return (
      <div className="banner warn small">
        <p>Los códigos QR todavía <strong>no funcionan</strong>: falta activar la verificación (se hace una sola vez).</p>
        <button className="btn primary small" onClick={qr.openConnect}>Activar verificación</button>
      </div>
    );
  }
  if (qr.status === 'publishing') return <p className="banner info small">Activando los códigos QR…</p>;
  if (qr.status === 'error') {
    return (
      <div className="banner bad small">
        <p>{qr.message}</p>
        <div className="row wrap">
          <button className="btn small" onClick={() => qr.publish()}>Reintentar</button>
          <button className="btn ghost small" onClick={qr.openConnect}>Volver a conectar</button>
        </div>
      </div>
    );
  }
  if (qr.status === 'ok') return <p className="banner ok small">Listo. Los códigos QR funcionarán en uno o dos minutos, que es lo que tarda GitHub en actualizar la página.</p>;
  if (qr.pending) {
    return (
      <div className="banner warn small">
        <p>Hay documentos cuyos códigos QR aún no están activos.</p>
        <button className="btn primary small" onClick={() => qr.publish()}>Activar ahora</button>
      </div>
    );
  }
  return <p className="banner ok small">Los códigos QR están activos.</p>;
}
