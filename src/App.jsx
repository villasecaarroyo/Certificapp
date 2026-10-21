import { useEffect, useMemo, useState } from 'react';
import Editor from './components/Editor.jsx';
import { StepType, StepEvent } from './components/Steps.jsx';
import StepPeople from './components/StepPeople.jsx';
import StepGenerate from './components/StepGenerate.jsx';
import GitHubConnect, { useGitHub } from './components/GitHubConnect.jsx';
import { History, Settings, HelpContent } from './components/panels.jsx';
import { Modal } from './components/ui.jsx';
import { useLabelMaps } from './components/TextBox.jsx';
import { makePreset, DEFAULT_EVENT, DEFAULT_SETTINGS, SAMPLE_DATASET } from './lib/presets.js';
import { autoMap } from './lib/fields.js';
import { previewVarsFor } from './lib/issue.js';
import { useLocalState, useSessionState, useCustomFonts, useUndoable } from './lib/browser.js';
import { loadToken, publishRegistry } from './lib/github.js';

const STEPS = [
  { label: 'Modelo', title: 'Elegir modelo' },
  { label: 'Evento', title: 'Evento, logo y firmas' },
  { label: 'Diseño', title: 'Ajustar diseño' },
  { label: 'Personas', title: 'Lista de personas' },
  { label: 'Generar', title: 'Revisar y generar' },
];

export default function App() {
  const [view, setView] = useLocalState('certifica.view', 0);
  const [rawTemplate, setRawTemplate, saveErr] = useLocalState('certifica.template', () => makePreset('certificado'));
  const tpl = useUndoable([rawTemplate, setRawTemplate]);
  const [event, setEvent] = useLocalState('certifica.event', DEFAULT_EVENT);
  const [rawSettings, setSettings] = useLocalState('certifica.settings', DEFAULT_SETTINGS);
  const [registry, setRegistry] = useLocalState('certifica.registry', []);
  const [dirty, setDirty] = useLocalState('certifica.registryDirty', false);
  const [dataset, setDataset] = useSessionState('certifica.dataset', SAMPLE_DATASET);
  const [mapping, setMapping] = useSessionState('certifica.mapping', () => autoMap(SAMPLE_DATASET.columns));
  const [rowIndex, setRowIndex] = useState(0);
  const [modal, setModal] = useState(null);
  const [qrState, setQrState] = useState({ status: 'idle', message: '' });
  useCustomFonts(rawTemplate.fonts);

  // Diseños guardados con la versión anterior: la primera imagen pasa a ser el logo.
  useEffect(() => {
    const els = rawTemplate.elements || [];
    if (!els.some((e) => e.role === 'logo')) {
      const first = els.find((e) => e.type === 'image');
      if (first) setRawTemplate((t) => ({ ...t, elements: t.elements.map((e) => (e.id === first.id ? { ...e, role: 'logo' } : e)) }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const settings = useMemo(() => ({
    ...DEFAULT_SETTINGS, ...rawSettings,
    emailjs: { ...DEFAULT_SETTINGS.emailjs, ...rawSettings.emailjs },
    github: { ...DEFAULT_SETTINGS.github, ...rawSettings.github },
  }), [rawSettings]);
  const gh = useGitHub(settings);

  const rows = dataset.rows;
  const idx = Math.min(rowIndex, Math.max(0, rows.length - 1));
  const previewVars = useMemo(
    () => previewVarsFor({ event, row: rows[idx] || {}, mapping, settings, docLabel: rawTemplate.docLabel }),
    [event, rows, idx, mapping, settings, rawTemplate.docLabel],
  );
  const maps = useLabelMaps(dataset.columns, mapping);
  const rowNav = { index: idx, total: rows.length, setIndex: setRowIndex, label: previewVars.nombre };

  const goTo = (v) => { setView(v === 'config' ? 'config' : v); window.scrollTo({ top: 0 }); };
  useEffect(() => { if (typeof view === 'number' && (view < 0 || view >= STEPS.length)) setView(0); }, [view, setView]);

  // Verificación QR: publica el registro en GitHub
  const connected = !!settings.github.connected && !!loadToken();
  const publish = async (records = registry, repoOverride = {}) => {
    const token = loadToken();
    if (!token) { setQrState({ status: 'error', message: 'La conexión con GitHub se cerró. Vuelve a conectar para activar los códigos QR.' }); return; }
    setQrState({ status: 'publishing', message: '' });
    try {
      const merged = await publishRegistry({ ...gh, ...repoOverride, token, records, level: settings.publicLevel, institucion: event.institucion });
      setRegistry(merged);
      setDirty(false);
      setQrState({ status: 'ok', message: '' });
    } catch (e) {
      setQrState({ status: 'error', message: e.message });
    }
  };
  const qr = {
    connected, ...qrState, pending: dirty && registry.length > 0,
    publish, openConnect: () => setModal('github'),
  };
  const setRegistryDirty = (v) => { setRegistry(v); setDirty(true); };

  const resetAll = () => {
    try { ['certifica.template', 'certifica.event', 'certifica.settings', 'certifica.view'].forEach((k) => localStorage.removeItem(k)); sessionStorage.clear(); } catch { /* */ }
    window.location.reload();
  };

  const step = typeof view === 'number' ? view : -1;
  const logo = rawTemplate.elements.find((e) => e.type === 'image' && e.role === 'logo');
  const done = [true, !!(event.evento && event.institucion), false, !dataset.sample && rows.length > 0 && !!mapping.nombre, false];
  const hints = {
    1: [!event.evento && 'Falta el nombre del evento.', logo && !logo.src && 'Aún no subiste el logo (puedes hacerlo después).'].filter(Boolean),
    3: [dataset.sample && 'La lista tiene personas de ejemplo. Reemplázalas por las tuyas.', rows.length && !mapping.nombre && 'Indica qué columna tiene el nombre.'].filter(Boolean),
  }[step] || [];

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => goTo(0)} aria-label="Ir al inicio">
          <span className="logo" aria-hidden>✓</span>
          <span className="brand-text"><strong>Certificapp</strong><span>Certificados y documentos académicos</span></span>
        </button>
        <nav className="topnav">
          <button className={view === 'historial' ? 'active' : ''} onClick={() => goTo('historial')}>
            Historial{qr.pending && <span className="dot" title="Hay códigos QR por activar" />}
          </button>
          <button className={view === 'config' ? 'active' : ''} onClick={() => goTo('config')}>Configuración</button>
          <button onClick={() => setModal('help')}>Ayuda</button>
        </nav>
      </header>

      <nav className="stepper" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <button key={s.label} className={`${step === i ? 'current' : ''}${done[i] && step !== i ? ' done' : ''}`} onClick={() => goTo(i)} aria-current={step === i ? 'step' : undefined}>
            <span className="num">{done[i] && step !== i ? '✓' : i + 1}</span>
            <span className="lbl">{s.label}</span>
          </button>
        ))}
      </nav>

      {saveErr && <div className="banner warn page-banner">{saveErr}</div>}

      <main>
        {step === 0 && <StepType template={rawTemplate} setTemplate={tpl.set} vars={previewVars} />}
        {step === 1 && <StepEvent event={event} setEvent={setEvent} template={rawTemplate} setTemplate={tpl.set} vars={previewVars} />}
        {step === 2 && (
          <section className="step-wrap wide">
            <header className="step-head">
              <h1>Ajustar el diseño</h1>
              <p>Cambia textos, tamaños y posiciones. Si el modelo ya te sirve, puedes saltarte este paso.</p>
            </header>
            <Editor template={rawTemplate} setTemplate={tpl.set} undo={tpl.undo} redo={tpl.redo} canUndo={tpl.canUndo} canRedo={tpl.canRedo}
              vars={previewVars} maps={maps} rowNav={rowNav} />
          </section>
        )}
        {step === 3 && (
          <StepPeople dataset={dataset} setDataset={setDataset} mapping={mapping} setMapping={setMapping}
            onView={(i, go = true) => { setRowIndex(i); if (go) goTo(4); }} />
        )}
        {step === 4 && (
          <StepGenerate template={rawTemplate} event={event} dataset={dataset} mapping={mapping} settings={settings} setSettings={setSettings}
            registry={registry} setRegistry={setRegistryDirty} rowIndex={idx} setRowIndex={setRowIndex} previewVars={previewVars} qr={qr} goTo={goTo} />
        )}
        {view === 'historial' && <History registry={registry} setRegistry={setRegistry} settings={settings} event={event} qr={qr} markDirty={() => setDirty(true)} />}
        {view === 'config' && <Settings settings={settings} setSettings={setSettings} qr={qr} resetAll={resetAll} />}
      </main>

      {step >= 0 && (
        <footer className="wizard-nav">
          <div className="wizard-inner">
            {step > 0 ? <button className="btn" onClick={() => goTo(step - 1)}>← Atrás</button> : <span />}
            <div className="wizard-hints">{hints.map((h) => <span key={h}>{h}</span>)}</div>
            {step < STEPS.length - 1
              ? <button className="btn primary" onClick={() => goTo(step + 1)}>Siguiente: {STEPS[step + 1].title} →</button>
              : <span />}
          </div>
        </footer>
      )}

      {modal === 'help' && <Modal title="Ayuda" onClose={() => setModal(null)}><HelpContent /></Modal>}
      {modal === 'github' && (
        <Modal title="Activar la verificación de los códigos QR" onClose={() => setModal(null)}>
          <GitHubConnect settings={settings} setSettings={setSettings}
            onDone={(repoInfo) => { setModal(null); if (registry.length) publish(registry, repoInfo); }} />
        </Modal>
      )}
    </div>
  );
}
