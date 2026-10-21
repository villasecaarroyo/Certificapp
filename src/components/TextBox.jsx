import { useMemo, useRef, useState, useEffect } from 'react';
import { INSERT_CHIPS, normalizeKey } from '../lib/fields.js';

// Editor de texto sin códigos: los datos automáticos se muestran como {Nombre}, {Fecha}, etc.
export function useLabelMaps(columns = [], mapping = {}) {
  return useMemo(() => {
    const keyToLabel = new Map();
    const labelToKey = new Map();
    const groups = INSERT_CHIPS.map((g) => ({ group: g.group, items: [...g.items] }));
    for (const g of INSERT_CHIPS) for (const [k, l] of g.items) { keyToLabel.set(k, l); labelToKey.set(l.toLowerCase(), k); }
    const mapped = new Set(Object.values(mapping));
    const extra = columns.filter((c) => !mapped.has(c)).map((c) => [normalizeKey(c), c]);
    if (extra.length) groups.push({ group: 'Otras columnas de tu planilla', items: extra });
    for (const [k, l] of extra) { if (!keyToLabel.has(k)) keyToLabel.set(k, l); labelToKey.set(l.toLowerCase(), k); }
    return { keyToLabel, labelToKey, groups };
  }, [columns, mapping]);
}

export function toFriendly(text, maps) {
  return String(text || '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*(?:\|[a-z]+)?\s*\}\}/g, (m, k) => `{${maps.keyToLabel.get(k) || k}}`);
}

export function fromFriendly(text, maps) {
  return String(text || '').replace(/\{\{[^{}]*\}\}|\{([^{}\n]+)\}/g, (m, label) => {
    if (label === undefined) return m; // ya está en formato {{clave}}
    const t = label.trim();
    const key = maps.labelToKey.get(t.toLowerCase()) || (maps.keyToLabel.has(normalizeKey(t)) ? normalizeKey(t) : null);
    return key ? `{{${key}}}` : m;
  });
}

export function TextBox({ value, onChange, maps, rows = 4, autoFocus, label, compact }) {
  const ref = useRef();
  const [draft, setDraft] = useState(() => toFriendly(value, maps));
  const [open, setOpen] = useState(false);
  const own = useRef(value);

  // Si el valor cambia desde fuera (deshacer, otra plantilla), se actualiza el borrador.
  useEffect(() => {
    if (value !== own.current) { own.current = value; setDraft(toFriendly(value, maps)); }
  }, [value, maps]);
  useEffect(() => { if (autoFocus && ref.current) { ref.current.focus(); ref.current.select(); } }, [autoFocus]);

  const commit = (txt) => {
    setDraft(txt);
    const raw = fromFriendly(txt, maps);
    own.current = raw;
    onChange(raw);
  };
  // wrap: envuelve la selección (negrita, cursiva); si no, la reemplaza (datos automáticos)
  const insertAt = (before, after = '', wrap = true) => {
    const ta = ref.current;
    const s = ta ? ta.selectionStart : draft.length, e = ta ? ta.selectionEnd : draft.length;
    const sel = wrap ? draft.slice(s, e) : '';
    const next = draft.slice(0, s) + before + sel + after + draft.slice(e);
    commit(next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      const pos = s + before.length + sel.length + (sel ? after.length : 0);
      ta.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className={`textbox${compact ? ' compact' : ''}${open ? ' open' : ''}`}>
      {label && <span className="field-label">{label}</span>}
      <textarea ref={ref} rows={rows} value={draft} onChange={(e) => commit(e.target.value)} spellCheck lang="es" />
      <div className="textbox-tools">
        <button type="button" className="btn small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Cerrar datos' : '+ Insertar dato automático'}
        </button>
        <button type="button" className="btn small" title="Negrita: selecciona palabras y pulsa aquí" onClick={() => insertAt('**', '**')}><strong>N</strong></button>
        <button type="button" className="btn small" title="Cursiva: selecciona palabras y pulsa aquí" onClick={() => insertAt('*', '*')}><em>C</em></button>
      </div>
      {open && (
        <div className="chips">
          {maps.groups.map((g) => (
            <div key={g.group} className="chip-group">
              <span className="chip-title">{g.group}</span>
              <div className="chip-row">
                {g.items.map(([k, l]) => (
                  <button type="button" key={k} className="chip" onClick={() => insertAt(`{${l}}`, '', false)}>{l}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TextHelp() {
  return (
    <details className="help-inline">
      <summary>¿Cómo funcionan los textos?</summary>
      <ul>
        <li>Lo que está entre llaves, como <code>{'{Nombre}'}</code>, se reemplaza por el dato de cada persona o del evento.</li>
        <li>Para resaltar, selecciona palabras y pulsa <strong>N</strong> (negrita) o <em>C</em> (cursiva). Verás asteriscos alrededor: así se marca el formato.</li>
        <li>Lo que está entre dobles corchetes, como <code>[[con una duración de {'{Horas}'} horas]]</code>, solo aparece si la persona tiene ese dato. Si no lo tiene, la frase completa se omite.</li>
        <li>Si un nombre es muy largo, la letra se achica sola para que quepa.</li>
      </ul>
    </details>
  );
}
