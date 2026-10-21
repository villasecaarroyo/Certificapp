import { useRef } from 'react';

export function Field({ label, children, hint, wide }) {
  return (
    <label className={`field${wide ? ' wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Num({ label, value, onChange, step = 0.5, min, max }) {
  return (
    <label className="num">
      <span>{label}</span>
      <input type="number" step={step} min={min} max={max} value={Number.isFinite(value) ? Math.round(value * 100) / 100 : ''}
        onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))} />
    </label>
  );
}

export function Color({ label, value, onChange, allowNone }) {
  return (
    <label className="color">
      <span>{label}</span>
      <span className="color-row">
        <input type="color" value={value || '#000000'} disabled={allowNone && !value} onChange={(e) => onChange(e.target.value)} />
        {allowNone && (
          <label className="check small"><input type="checkbox" checked={!value} onChange={(e) => onChange(e.target.checked ? null : '#1f3a5f')} />ninguno</label>
        )}
      </span>
    </label>
  );
}

export function FileButton({ accept, onFile, children, className = 'btn', multiple }) {
  const ref = useRef();
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current.click()}>{children}</button>
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) onFile(multiple ? files : files[0]); }} />
    </>
  );
}

export function RowNav({ index, total, setIndex, label }) {
  if (!total) return <span className="muted">Sin participantes cargados</span>;
  return (
    <div className="rownav">
      <button className="btn icon" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index <= 0} aria-label="Anterior">‹</button>
      <input type="number" min={1} max={total} value={index + 1} onChange={(e) => setIndex(Math.min(total - 1, Math.max(0, Number(e.target.value) - 1)))} />
      <span className="muted">de {total}</span>
      <button className="btn icon" onClick={() => setIndex(Math.min(total - 1, index + 1))} disabled={index >= total - 1} aria-label="Siguiente">›</button>
      {label && <span className="rownav-label" title={label}>{label}</span>}
    </div>
  );
}

export function Progress({ value, max, label }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="progress">
      <div className="progress-bar"><div style={{ width: `${pct}%` }} /></div>
      <span>{label} · {value}/{max}</span>
    </div>
  );
}
