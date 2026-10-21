import { useMemo, useState } from 'react';
import { mergeRecords, readRegistry, recordsToCsv, buildPublicRegistry } from '../lib/registry.js';
import { downloadText } from '../lib/browser.js';
import { verifyUrl, resolveBaseUrl } from '../lib/issue.js';
import { forgetToken } from '../lib/github.js';
import { Field, FileButton } from './ui.jsx';
import { QrStatus } from './StepGenerate.jsx';
import { useGitHub } from './GitHubConnect.jsx';

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/* ───────── Historial ───────── */
export function History({ registry, setRegistry, settings, event, qr, markDirty }) {
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [revoking, setRevoking] = useState(null);
  const [reason, setReason] = useState('');

  const list = useMemo(() => {
    const s = q.toLowerCase();
    return [...registry].reverse().filter((r) => !s || [r.nombre, r.folio, r.codigo, r.evento, r.tipo].some((v) => String(v || '').toLowerCase().includes(s)));
  }, [registry, q]);

  const revoke = (id) => {
    setRegistry((rs) => rs.map((r) => (r.id === id ? { ...r, estado: 'revocado', revocado: new Date().toISOString(), motivo: reason.trim() } : r)));
    setRevoking(null); setReason(''); markDirty();
  };
  const restore = (id) => {
    setRegistry((rs) => rs.map((r) => (r.id === id ? { ...r, estado: 'vigente', revocado: undefined, motivo: undefined } : r)));
    markDirty();
  };
  const importFile = async (file) => {
    try {
      const recs = readRegistry(JSON.parse(await file.text()));
      setRegistry((rs) => mergeRecords(rs, recs));
      setMsg(`Se recuperaron ${recs.length} registros del archivo.`);
    } catch { setMsg('Ese archivo no es una copia del historial.'); }
  };

  return (
    <section className="step-wrap wide">
      <header className="step-head">
        <h1>Historial de documentos</h1>
        <p>Todos los documentos que has generado. Desde aquí puedes comprobar cómo se ven al escanear su QR o anular uno emitido por error.</p>
      </header>

      <div className="card">
        <h2>Estado de los códigos QR</h2>
        <QrStatus qr={qr} />
      </div>

      <div className="card">
        <div className="row between">
          <h2>{registry.length} documentos</h2>
          <input placeholder="Buscar por nombre, folio o código…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en el historial" />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Folio</th><th>Nombre</th><th>Documento</th><th>Evento</th><th>Fecha</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {list.slice(0, 500).map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{r.folio}</td>
                  <td>{r.nombre}</td>
                  <td>{String(r.tipo || '').replace(/_/g, ' ')}</td>
                  <td>{r.evento}</td>
                  <td className="nowrap">{fmt(r.emitido)}</td>
                  <td>{r.estado === 'revocado' ? <span className="pill bad">Anulado</span> : <span className="pill ok">Válido</span>}</td>
                  <td className="nowrap">
                    {revoking === r.id ? (
                      <span className="row">
                        <input placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo de la anulación" />
                        <button className="btn danger solid small" onClick={() => revoke(r.id)}>Anular</button>
                        <button className="btn ghost small" onClick={() => setRevoking(null)}>Cancelar</button>
                      </span>
                    ) : (
                      <>
                        <a className="btn small" href={verifyUrl(settings.baseUrl, r.id)} target="_blank" rel="noreferrer">Ver verificación</a>
                        {r.estado === 'revocado'
                          ? <button className="btn ghost small" onClick={() => restore(r.id)}>Reactivar</button>
                          : <button className="btn ghost small" onClick={() => { setRevoking(r.id); setReason(''); }}>Anular</button>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={7} className="muted">Todavía no has generado documentos.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted small">Al anular un documento, quien escanee su QR verá que ya no es válido (después de activar los cambios).</p>
      </div>

      <details className="card more">
        <summary>Copias de respaldo y exportación</summary>
        <p className="muted small">El historial se guarda en este navegador. Descarga una copia de vez en cuando, sobre todo si cambias de computador.</p>
        <div className="row wrap">
          <button className="btn" onClick={() => downloadText(recordsToCsv(registry), 'historial_documentos.csv', 'text/csv')}>Descargar lista para Excel</button>
          <button className="btn" onClick={() => downloadText(JSON.stringify(registry), 'respaldo_historial.json')}>Descargar copia de respaldo</button>
          <FileButton accept=".json,application/json" onFile={importFile}>Recuperar desde una copia</FileButton>
          <button className="btn ghost" onClick={() => downloadText(JSON.stringify(buildPublicRegistry(registry, settings.publicLevel, { institucion: event.institucion }), null, 2), 'registry.json')}>Descargar registry.json (publicación manual)</button>
        </div>
        {msg && <p className="note">{msg}</p>}
      </details>
    </section>
  );
}

/* ───────── Configuración ───────── */
const LEVELS = [
  ['nombre', 'Nombre de la persona y su rol', 'Recomendado. Permite comprobar que el documento corresponde a quien lo presenta.'],
  ['completo', 'Nombre, rol y parte del RUT', 'Se muestran solo los dos primeros y los dos últimos caracteres (ej.: 12.•••.•••-5).'],
  ['minimo', 'Solo el tipo de documento y el evento', 'Máxima privacidad: no se publica ningún dato personal.'],
];

export function Settings({ settings, setSettings, qr, resetAll }) {
  const gh = useGitHub(settings);
  const [askReset, setAskReset] = useState(false);
  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  const setE = (k, v) => setSettings((s) => ({ ...s, emailjs: { ...s.emailjs, [k]: v } }));
  const next = `${settings.folioPrefix || ''}${String(settings.nextFolio || 1).padStart(4, '0')}`;

  return (
    <section className="step-wrap">
      <header className="step-head">
        <h1>Configuración</h1>
        <p>Se ajusta una vez y queda guardada en este navegador.</p>
      </header>

      <div className="card">
        <h2>Verificación con código QR</h2>
        {qr.connected ? (
          <>
            <p className="banner ok small">Conectado a GitHub ({gh.owner}/{gh.repo}). Los códigos QR se activan solos cada vez que generas documentos.</p>
            <div className="row wrap">
              <button className="btn" onClick={() => qr.publish()}>Actualizar ahora</button>
              <button className="btn ghost" onClick={() => { forgetToken(); setSettings((s) => ({ ...s, github: { ...s.github, connected: false } })); }}>Desconectar</button>
            </div>
          </>
        ) : (
          <>
            <p>Sin conectar. Los documentos se generan igual, pero sus códigos QR no funcionarán hasta que actives la verificación.</p>
            <button className="btn primary" onClick={qr.openConnect}>Activar verificación</button>
          </>
        )}
        <h3>¿Qué se muestra al escanear el QR?</h3>
        <div className="radio-cards">
          {LEVELS.map(([k, t, d]) => (
            <label key={k} className={`radio-card${settings.publicLevel === k ? ' on' : ''}`}>
              <input type="radio" checked={settings.publicLevel === k} onChange={() => set('publicLevel', k)} />
              <span><strong>{t}</strong><br /><span className="muted small">{d}</span></span>
            </label>
          ))}
        </div>
        <p className="muted small">La página de verificación es pública. Publica solo los datos que tengas autorización para mostrar (Ley 19.628 y Ley 21.719 sobre protección de datos personales).</p>
      </div>

      <div className="card">
        <h2>Numeración de los documentos</h2>
        <p className="muted">Cada documento recibe un número de folio correlativo.</p>
        <div className="grid2">
          <Field label="Texto antes del número"><input value={settings.folioPrefix} onChange={(e) => set('folioPrefix', e.target.value)} /></Field>
          <Field label="Próximo número"><input type="number" min={1} value={settings.nextFolio} onChange={(e) => set('nextFolio', Number(e.target.value) || 1)} /></Field>
        </div>
        <p className="note small">El próximo documento será el <strong>{next}</strong>.</p>
      </div>

      <div className="card">
        <h2>Envío por correo</h2>
        <p className="muted">La aplicación usa EmailJS, un servicio gratuito para enviar correos desde tu cuenta (Gmail, Outlook u otra). Se configura una vez:</p>
        <ol className="steps-list">
          <li>Crea una cuenta gratuita en <a href="https://www.emailjs.com/" target="_blank" rel="noreferrer">emailjs.com</a>.</li>
          <li>En <em>Email Services</em>, pulsa <em>Add New Service</em>, elige tu correo y conéctalo. Copia el <strong>Service ID</strong>.</li>
          <li>En <em>Email Templates</em>, crea una plantilla. En «To Email» escribe <code>{'{{to_email}}'}</code>, en «Subject» <code>{'{{asunto}}'}</code> y en el contenido <code>{'{{mensaje}}'}</code>. Para adjuntar el PDF, en la pestaña <em>Attachments</em> agrega un <em>Variable Attachment</em> con el nombre <code>certificado</code>. Guarda y copia el <strong>Template ID</strong>.</li>
          <li>En <em>Account</em>, copia tu <strong>Public Key</strong>.</li>
        </ol>
        <div className="grid3">
          <Field label="Service ID"><input value={settings.emailjs.serviceId} onChange={(e) => setE('serviceId', e.target.value.trim())} /></Field>
          <Field label="Template ID"><input value={settings.emailjs.templateId} onChange={(e) => setE('templateId', e.target.value.trim())} /></Field>
          <Field label="Public Key"><input value={settings.emailjs.publicKey} onChange={(e) => setE('publicKey', e.target.value.trim())} /></Field>
        </div>
        <Field label="Asunto del correo"><input value={settings.emailjs.subject} onChange={(e) => setE('subject', e.target.value)} /></Field>
        <Field label="Mensaje" hint="Los textos entre llaves dobles se reemplazan por los datos de cada persona: {{nombre}}, {{evento}}, {{url_verificacion}}, {{codigo}}.">
          <textarea rows={6} value={settings.emailjs.message} onChange={(e) => setE('message', e.target.value)} />
        </Field>
        <label className="check"><input type="checkbox" checked={settings.emailjs.attach} onChange={(e) => setE('attach', e.target.checked)} />Adjuntar el PDF al correo</label>
        <p className="muted small">El plan gratuito de EmailJS admite unos 200 correos al mes y adjuntos pequeños. Si el diseño tiene una imagen de fondo pesada, desmarca el adjunto: el correo llevará el enlace de verificación.</p>
      </div>

      <details className="card more">
        <summary>Opciones avanzadas</summary>
        <Field label="Dirección pública de la aplicación" hint={`Si la dejas vacía se usa la dirección actual (${resolveBaseUrl('')}). Los códigos QR apuntan a esta dirección.`}>
          <input placeholder="https://usuario.github.io/repositorio/" value={settings.baseUrl} onChange={(e) => set('baseUrl', e.target.value.trim())} />
        </Field>
        <Field label="Nombre de los archivos PDF" hint="Ejemplo: {{tipo_documento}}_{{nombre}} produce Certificado_Juan_Perez.pdf">
          <input value={settings.fileNamePattern} onChange={(e) => set('fileNamePattern', e.target.value)} />
        </Field>
        <h3>Empezar de cero</h3>
        <p className="muted small">Borra el diseño, los datos del evento y la configuración de este navegador. El historial de documentos se conserva.</p>
        {askReset ? (
          <div className="row">
            <button className="btn danger solid" onClick={resetAll}>Sí, borrar y empezar de cero</button>
            <button className="btn ghost" onClick={() => setAskReset(false)}>Cancelar</button>
          </div>
        ) : <button className="btn danger" onClick={() => setAskReset(true)}>Empezar de cero</button>}
      </details>
    </section>
  );
}

/* ───────── Ayuda ───────── */
export function HelpContent() {
  const faq = [
    ['¿Cómo funciona, en resumen?', 'Eliges un modelo, escribes los datos del evento, subes el logo y las firmas, cargas la lista de personas y generas. La aplicación crea un PDF para cada persona, con su nombre, un número de folio y un código QR único.'],
    ['¿Para qué sirve el código QR?', 'Quien recibe el documento (o un tercero, como otra universidad) puede escanearlo con el teléfono y ver una página que confirma que el documento es auténtico y fue emitido por tu institución. Si alguien altera el PDF, la página igual muestra los datos originales.'],
    ['¿Dónde quedan los datos de las personas?', 'En tu navegador. La aplicación no tiene servidor: la lista de personas no se envía a ninguna parte. Solo se publica, para la verificación, lo que elijas en Configuración (por defecto, el nombre y el rol).'],
    ['¿Cómo cambio un texto del documento?', 'En el paso «Diseño», edita los textos en la columna de la derecha o haz clic sobre el texto en el documento. Los datos entre llaves, como {Nombre}, se completan solos.'],
    ['Un nombre muy largo no cabe', 'La letra se achica sola para que el nombre quepa en una línea. Usa «Ver el nombre más largo» en el último paso para revisarlo. Si queda muy chico, en «Diseño» haz el recuadro del nombre más ancho.'],
    ['Me equivoqué en un documento ya emitido', 'Corrige el dato en la lista, genera de nuevo solo para esa persona y, en «Historial», anula el documento equivocado.'],
    ['¿Puedo usarla en otro computador?', 'Sí. En «Diseño» → «Guardar o cargar este diseño», guarda el diseño en un archivo; en «Historial», descarga una copia de respaldo. En el otro computador, carga ambos archivos.'],
    ['¿Cómo deshago un cambio?', 'Con el botón «Deshacer» del paso «Diseño», o con Ctrl+Z (Cmd+Z en Mac).'],
  ];
  return (
    <div className="faq">
      {faq.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
