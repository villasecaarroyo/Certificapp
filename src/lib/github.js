// Conexión con GitHub para publicar el registro de verificación sin salir de la aplicación.
import { bytesToBase64 } from './browser.js';
import { buildPublicRegistry, mergeRecords, readRegistry } from './registry.js';

const TOKEN_KEY = 'certifica.githubToken';

// En https://usuario.github.io/repositorio/ deduce usuario y repositorio.
export function detectRepo() {
  if (typeof window === 'undefined') return null;
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(window.location.hostname);
  if (!m) return null;
  const repo = window.location.pathname.split('/').filter(Boolean)[0];
  return { owner: m[1], repo: repo || `${m[1]}.github.io` };
}

export function tokenUrl(owner) {
  const p = new URLSearchParams({
    name: 'Certificapp',
    description: 'Permite a Certificapp publicar el registro de verificación de los códigos QR.',
    expires_in: '366',
    contents: 'write',
  });
  if (owner) p.set('target_name', owner);
  return `https://github.com/settings/personal-access-tokens/new?${p}`;
}

export function loadToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function saveToken(token, remember) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    if (remember) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
  } catch { /* sin almacenamiento */ }
}
export function forgetToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch { /* */ }
}

const headers = (token) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });

function friendly(status, context) {
  if (status === 401) return 'GitHub no reconoce la clave de acceso. Puede estar mal copiada o vencida; crea una nueva.';
  if (status === 403) return 'La clave de acceso no tiene permiso para escribir en el repositorio. Al crearla, elige este repositorio y el permiso «Contents: Read and write».';
  if (status === 404) return `No se encontró el repositorio ${context}. Revisa el usuario y el nombre del repositorio, y que la clave tenga acceso a él.`;
  if (status === 409 || status === 422) return 'Otra persona publicó al mismo tiempo. Vuelve a intentarlo.';
  return `GitHub respondió con un error (${status}). Vuelve a intentarlo en unos minutos.`;
}

export async function testConnection({ owner, repo, token }) {
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: headers(token) });
  if (!r.ok) throw new Error(friendly(r.status, `${owner}/${repo}`));
  const data = await r.json();
  if (data.permissions && !data.permissions.push) throw new Error(friendly(403));
  return data;
}

function decodeBase64Utf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Lee el registro publicado, lo combina con el local y publica el resultado.
export async function publishRegistry({ owner, repo, branch = 'main', path = 'public/registry.json', token, records, level, institucion }) {
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  let sha, remote = [];
  const g = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: headers(token), cache: 'no-store' });
  if (g.ok) {
    const j = await g.json();
    sha = j.sha;
    try { remote = readRegistry(JSON.parse(decodeBase64Utf8(j.content))); } catch { remote = []; }
  } else if (g.status !== 404) throw new Error(friendly(g.status, `${owner}/${repo}`));
  const merged = mergeRecords(records, remote);
  const json = JSON.stringify(buildPublicRegistry(merged, level, { institucion }), null, 2);
  const body = {
    message: `Registro de verificación: ${merged.length} documentos`,
    branch,
    content: bytesToBase64(new TextEncoder().encode(json)),
    ...(sha ? { sha } : {}),
  };
  const r = await fetch(api, { method: 'PUT', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(friendly(r.status, `${owner}/${repo}`));
  return merged;
}
