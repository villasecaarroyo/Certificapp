import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PDFDocument } from 'pdf-lib';
import { readRegistry } from './lib/registry.js';
import { sha256Hex } from './lib/ids.js';
import './styles.css';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' }) : '');

function Verify() {
  const params = new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(params.get('id') || params.get('codigo') || '');
  const [input, setInput] = useState(query);
  const [reg, setReg] = useState(null);
  const [err, setErr] = useState('');
  const [fileRes, setFileRes] = useState(null);

  useEffect(() => {
    fetch('../registry.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setReg)
      .catch(() => setErr('No fue posible cargar el registro público de documentos.'));
  }, []);

  const records = useMemo(() => (reg ? readRegistry(reg) : []), [reg]);
  const found = useMemo(() => {
    const q = query.trim();
    if (!q || !reg) return null;
    const n = norm(q);
    return records.find((r) => r.id?.toLowerCase() === q.toLowerCase() || norm(r.codigo) === n || norm(r.folio) === n) || false;
  }, [query, records, reg]);

  const submit = (e) => {
    e.preventDefault();
    setQuery(input);
    setFileRes(null);
    const url = new URL(window.location.href);
    url.search = input.trim() ? `?id=${encodeURIComponent(input.trim())}` : '';
    window.history.replaceState(null, '', url);
  };

  const checkFile = async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = await sha256Hex(bytes);
    const match = records.find((r) => r.archivo_sha256 === hash);
    let claimed = null;
    try {
      const d = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
      claimed = UUID_RE.exec(`${d.getSubject() || ''} ${d.getKeywords() || ''}`)?.[0] || null;
    } catch { /* no es un PDF legible */ }
    setFileRes({ match: !!match, claimed, name: file.name });
    const target = match?.id || claimed;
    if (target) { setQuery(target); setInput(target); }
  };

  const revoked = found && found.estado === 'revocado';

  return (
    <div className="verify">
      <header className="verify-head">
        <span className="logo" aria-hidden>✓</span>
        <div>
          <h1>Verificación de documentos</h1>
          {reg?.institucion && <p>{reg.institucion}</p>}
        </div>
      </header>

      <form className="verify-form" onSubmit={submit}>
        <label htmlFor="q">Escribe el código que aparece bajo el QR, o el número de folio</label>
        <div className="row">
          <input id="q" className="grow" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ej.: 31FB-2939-A0C4" />
          <button className="btn primary">Verificar</button>
        </div>
      </form>

      {err && <div className="result bad"><h2>Registro no disponible</h2><p>{err}</p></div>}
      {!err && !reg && <p className="muted">Cargando registro…</p>}

      {found === false && (
        <div className="result bad">
          <h2>Documento no encontrado</h2>
          <p>No existe un documento emitido con ese identificador. Revisa que el código esté bien escrito; si el documento es reciente, es posible que el registro aún no se haya publicado.</p>
        </div>
      )}

      {found && (
        <div className={`result ${revoked ? 'bad' : 'good'}`}>
          <h2>{revoked ? 'Documento revocado' : 'Documento válido'}</h2>
          <p>{revoked
            ? `Este documento fue emitido, pero la institución lo revocó el ${fmt(found.revocado)}${found.motivo ? `. Motivo: ${found.motivo}` : ''}.`
            : 'Este documento figura en el registro oficial de emisión.'}</p>
          <dl>
            {found.nombre && <><dt>Nombre</dt><dd>{found.nombre}</dd></>}
            {found.documento && <><dt>Documento de identidad</dt><dd>{found.documento}</dd></>}
            <dt>Tipo</dt><dd>{String(found.tipo || '').replace(/_/g, ' ')}</dd>
            {found.rol && <><dt>Calidad</dt><dd>{found.rol}</dd></>}
            <dt>Instancia</dt><dd>{found.evento}</dd>
            {found.institucion && <><dt>Institución</dt><dd>{found.institucion}</dd></>}
            {found.fecha_evento && <><dt>Fecha del evento</dt><dd>{found.fecha_evento}</dd></>}
            {found.horas && <><dt>Duración</dt><dd>{found.horas} horas</dd></>}
            <dt>Folio</dt><dd>{found.folio}</dd>
            <dt>Código</dt><dd><code>{found.codigo}</code></dd>
            <dt>Emitido</dt><dd>{fmt(found.emitido)}</dd>
          </dl>
          <details className="more">
            <summary>Datos técnicos</summary>
            <p className="small">Identificador: <code>{found.id}</code></p>
            <p className="small">Huella SHA-256: <code className="hash">{found.hash}</code></p>
          </details>
        </div>
      )}

      <section className="verify-file">
        <h3>¿Recibiste el documento en PDF? Comprueba que no fue modificado</h3>
        <p className="muted">Selecciona el archivo. Se revisa aquí mismo, sin subirlo a ningún lado, y se compara con el original emitido.</p>
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) checkFile(f); }} />
        {fileRes && (
          fileRes.match
            ? <p className="ok-text">«{fileRes.name}» es idéntico al archivo original emitido.</p>
            : <p className="warn-text">
                «{fileRes.name}» no coincide byte a byte con ningún archivo emitido.
                {fileRes.claimed ? ' El archivo declara corresponder al documento consultado arriba, pero pudo ser editado, re-guardado o reimpreso como PDF.' : ' Tampoco contiene un identificador reconocible.'}
                {' '}Una impresión o una copia escaneada no conserva la huella; en esos casos, verifica con el código QR.
              </p>
        )}
      </section>
      <footer className="foot">Verificación pública basada en el registro que publica la institución emisora.</footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><Verify /></StrictMode>);
