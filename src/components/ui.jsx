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

export function ImagePicker({ src, onPick, onClear, label = 'Subir imagen', hint, error, checker }) {
  const ref = useRef();
  return (
    <div className="imgpick">
      <button type="button" className={`imgpick-box${src ? ' has' : ''}${checker ? ' checker' : ''}`} onClick={() => ref.current.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onPick(f); }}>
        {src ? <img src={src} alt="" /> : <span><strong>{label}</strong><br />o arrastra el archivo aquí</span>}
      </button>
      <input ref={ref} type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp"
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onPick(f); }} />
      <div className="imgpick-actions">
        {src && <button type="button" className="btn small" onClick={() => ref.current.click()}>Cambiar</button>}
        {src && onClear && <button type="button" className="btn ghost small" onClick={onClear}>Quitar</button>}
      </div>
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="error small">{error}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Cerrar">Cerrar</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({ text, confirmLabel = 'Sí, continuar', onConfirm, onCancel, danger }) {
  return (
    <div className="confirm">
      <p>{text}</p>
      <div className="row">
        <button className={`btn ${danger ? 'danger solid' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        <button className="btn ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
