// Utilidades exclusivas del navegador: medición de texto, imágenes, fuentes, descargas, correo y GitHub.
import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import { fill } from './fields.js';

const FAMILIES = {
  helvetica: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  times: '"Times New Roman", Times, "Liberation Serif", serif',
  courier: '"Courier New", Courier, "Liberation Mono", monospace',
};
export const cssFamily = (f) => FAMILIES[f] || `"CF_${f}", sans-serif`;

let ctx;
export function browserMeasure(text, size, { family, bold, italic }) {
  ctx ||= document.createElement('canvas').getContext('2d');
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${cssFamily(family)}`;
  return ctx.measureText(text).width;
}

export function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('No se pudo leer el archivo.'));
    r.readAsDataURL(file);
  });
}

function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('No se pudo interpretar la imagen.'));
    i.src = src;
  });
}

// PNG y JPG se usan tal cual. SVG, WebP o imágenes enormes se rasterizan en alta resolución.
export async function fileToImage(file, { maxDim = 2400, background = false } = {}) {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  const url = await readFileAsDataURL(file);
  const img = await loadImg(url);
  let w = img.naturalWidth || 0, h = img.naturalHeight || 0;
  if (!w || !h) { w = 1200; h = 1200; }
  const heavyPng = background && url.startsWith('data:image/png') && file.size > 1.5e6;
  if (!isSvg && /^data:image\/(png|jpeg)/.test(url) && Math.max(w, h) <= maxDim && !heavyPng) return { src: url, w, h };
  const k = isSvg ? maxDim / Math.max(w, h) : Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.round(w * k), ch = Math.round(h * k);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  const jpeg = heavyPng || file.type === 'image/jpeg' || (background && isSvg);
  if (jpeg) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, cw, ch); }
  g.drawImage(img, 0, 0, cw, ch);
  return { src: c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.9), w: cw, h: ch };
}

export function useCustomFonts(fonts) {
  const [ver, setVer] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const f of fonts || []) {
        const fam = `CF_${f.name}`;
        if ([...document.fonts].some((x) => x.family.replace(/"/g, '') === fam)) continue;
        try {
          const face = new FontFace(fam, `url(${f.data})`);
          await face.load();
          document.fonts.add(face);
        } catch (e) { console.warn('Fuente no cargada', f.name, e); }
      }
      if (alive) setVer((v) => v + 1);
    })();
    return () => { alive = false; };
  }, [fonts]);
  return ver;
}

export function useLocalState(key, init) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); if (s) return JSON.parse(s); } catch { /* sin almacenamiento */ }
    return typeof init === 'function' ? init() : init;
  });
  const [err, setErr] = useState(null);
  const t = useRef();
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify(v)); setErr(null); }
      catch { setErr('El navegador no tiene espacio para autoguardar. Exporta la plantilla como JSON o usa imágenes más livianas.'); }
    }, 400);
  }, [key, v]);
  return [v, setV, err];
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const downloadText = (text, name, type = 'application/json') => downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), name);

export async function buildZip(items, extras = {}) {
  const zip = new JSZip();
  for (const it of items) zip.file(it.fileName, it.bytes, { binary: true });
  for (const [name, content] of Object.entries(extras)) zip.file(name, content);
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export async function sendEmailJS(cfg, item) {
  const { default: emailjs } = await import('@emailjs/browser');
  const v = item.vars;
  const params = {
    to_email: v.email, to_name: v.nombre, asunto: fill(cfg.subject, v), mensaje: fill(cfg.message, v),
    evento: v.evento, institucion: v.institucion, tipo_documento: v.tipo_documento,
    url_verificacion: v.url_verificacion, codigo: v.codigo, folio: v.folio, nombre_archivo: item.fileName,
  };
  if (cfg.attach) params.certificado = `data:application/pdf;base64,${bytesToBase64(item.bytes)}`;
  return emailjs.send(cfg.serviceId, cfg.templateId, params, { publicKey: cfg.publicKey });
}

export function useSessionState(key, init) {
  const [v, setV] = useState(() => {
    try { const s = sessionStorage.getItem(key); if (s) return JSON.parse(s); } catch { /* */ }
    return typeof init === 'function' ? init() : init;
  });
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch { /* */ } }, [key, v]);
  return [v, setV];
}

// Envuelve un estado con deshacer y rehacer. Los cambios seguidos (como arrastrar) se agrupan en un solo paso.
export function useUndoable([value, setValue]) {
  const past = useRef([]);
  const future = useRef([]);
  const last = useRef(0);
  const [, force] = useState(0);
  const set = (updater) => {
    setValue((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      const now = Date.now();
      if (now - last.current > 600) { past.current.push(prev); if (past.current.length > 60) past.current.shift(); }
      last.current = now;
      future.current = [];
      return next;
    });
    force((n) => n + 1);
  };
  const undo = () => {
    if (!past.current.length) return;
    setValue((cur) => { future.current.push(cur); return past.current.pop(); });
    last.current = 0; force((n) => n + 1);
  };
  const redo = () => {
    if (!future.current.length) return;
    setValue((cur) => { past.current.push(cur); return future.current.pop(); });
    last.current = 0; force((n) => n + 1);
  };
  return { value, set, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
