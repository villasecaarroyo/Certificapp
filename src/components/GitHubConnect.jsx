import { useState } from 'react';
import { detectRepo, tokenUrl, testConnection, saveToken } from '../lib/github.js';
import { Field } from './ui.jsx';

export function useGitHub(settings) {
  const auto = detectRepo();
  const owner = settings.github.owner || auto?.owner || '';
  const repo = settings.github.repo || auto?.repo || '';
  return { owner, repo, branch: settings.github.branch || 'main', path: settings.github.path || 'public/registry.json' };
}

export default function GitHubConnect({ settings, setSettings, onDone }) {
  const gh = useGitHub(settings);
  const [owner, setOwner] = useState(gh.owner);
  const [repo, setRepo] = useState(gh.repo);
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editRepo, setEditRepo] = useState(!gh.owner || !gh.repo);

  const connect = async () => {
    setErr('');
    const t = token.trim();
    if (!owner || !repo) { setErr('Indica tu usuario de GitHub y el nombre del repositorio.'); setEditRepo(true); return; }
    if (!t) { setErr('Pega la clave de acceso que copiaste en GitHub.'); return; }
    setBusy(true);
    try {
      await testConnection({ owner, repo, token: t });
      saveToken(t, remember);
      setSettings((s) => ({ ...s, github: { ...s.github, owner, repo, connected: true } }));
      onDone?.({ owner, repo });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="gh">
      <p>Para que los códigos QR funcionen, la aplicación tiene que guardar la lista de documentos emitidos en tu cuenta de GitHub. Esto se configura <strong>una sola vez</strong> y toma unos dos minutos.</p>
      <ol className="steps-list">
        <li>
          <strong>Abre GitHub para crear una clave de acceso.</strong>
          <a className="btn primary" href={tokenUrl(owner)} target="_blank" rel="noreferrer">Abrir GitHub ↗</a>
        </li>
        <li>
          <strong>En la página que se abre:</strong>
          <ul>
            <li>En <em>Repository access</em>, marca <em>Only select repositories</em> y elige <strong>{repo || 'tu repositorio'}</strong>.</li>
            <li>El permiso <em>Contents: Read and write</em> ya viene marcado. No cambies nada más.</li>
            <li>Baja hasta el final y pulsa el botón verde <em>Generate token</em>.</li>
          </ul>
        </li>
        <li>
          <strong>Copia la clave que aparece</strong> (empieza con <code>github_pat_</code>) y pégala aquí:
          <input type="password" className="token-input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" autoComplete="off" aria-label="Clave de acceso de GitHub" />
          <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Recordar en este computador</label>
          <span className="hint">Si este computador lo usan otras personas, desmárcalo: la clave se olvidará al cerrar la pestaña.</span>
        </li>
      </ol>
      {editRepo ? (
        <div className="grid2">
          <Field label="Tu usuario de GitHub"><input value={owner} onChange={(e) => setOwner(e.target.value.trim())} /></Field>
          <Field label="Nombre del repositorio"><input value={repo} onChange={(e) => setRepo(e.target.value.trim())} /></Field>
        </div>
      ) : (
        <p className="muted small">Repositorio: <strong>{owner}/{repo}</strong> · <button className="linklike" onClick={() => setEditRepo(true)}>cambiar</button></p>
      )}
      {err && <p className="error">{err}</p>}
      <button className="btn primary big" onClick={connect} disabled={busy}>{busy ? 'Comprobando…' : 'Conectar'}</button>
    </div>
  );
}
