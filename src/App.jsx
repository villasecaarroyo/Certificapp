import { useMemo, useState } from 'react';
import Editor from './components/Editor.jsx';
import IssuePanel from './components/IssuePanel.jsx';
import { EventPanel, DataPanel, RegistryPanel, SettingsPanel } from './components/panels.jsx';
import { makePreset, DEFAULT_EVENT, DEFAULT_SETTINGS, SAMPLE_DATASET } from './lib/presets.js';
import { autoMap, allVariables } from './lib/fields.js';
import { previewVarsFor } from './lib/issue.js';
import { useLocalState, useCustomFonts } from './lib/browser.js';

const TABS = [
  ['diseno', 'Diseño'],
  ['evento', 'Evento'],
  ['datos', 'Participantes'],
  ['emitir', 'Vista previa y emisión'],
  ['registro', 'Registro'],
  ['ajustes', 'Ajustes'],
];

export default function App() {
  const [tab, setTab] = useState('diseno');
  const [template, setTemplate, saveErr] = useLocalState('certifica.template', () => makePreset('certificado'));
  const [event, setEvent] = useLocalState('certifica.event', DEFAULT_EVENT);
  const [rawSettings, setSettings] = useLocalState('certifica.settings', DEFAULT_SETTINGS);
  const [registry, setRegistry] = useLocalState('certifica.registry', []);
  // Los datos de participantes no se guardan en el navegador: viven solo durante la sesión.
  const [dataset, setDataset] = useState(SAMPLE_DATASET);
  const [mapping, setMapping] = useState(() => autoMap(SAMPLE_DATASET.columns));
  const [rowIndex, setRowIndex] = useState(0);
  const fontsVersion = useCustomFonts(template.fonts);

  const settings = useMemo(() => ({
    ...DEFAULT_SETTINGS, ...rawSettings,
    emailjs: { ...DEFAULT_SETTINGS.emailjs, ...rawSettings.emailjs },
    github: { ...DEFAULT_SETTINGS.github, ...rawSettings.github },
  }), [rawSettings]);

  const rows = dataset.rows;
  const idx = Math.min(rowIndex, Math.max(0, rows.length - 1));
  const previewVars = useMemo(
    () => previewVarsFor({ event, row: rows[idx] || {}, mapping, settings, docLabel: template.docLabel }),
    [event, rows, idx, mapping, settings, template.docLabel],
  );
  const varList = useMemo(() => allVariables(dataset.columns, event, mapping), [dataset.columns, event, mapping]);
  const rowNav = { index: idx, total: rows.length, setIndex: setRowIndex, label: previewVars.nombre };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>✓</span>
          <div><strong>Certifica</strong><span>Certificados, invitaciones y credenciales verificables</span></div>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map(([k, label], i) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {i < 5 && <span className="step">{i + 1}</span>}{label}
            </button>
          ))}
        </nav>
        <a className="verify-link" href="./verify/" target="_blank" rel="noreferrer">Portal de verificación ↗</a>
      </header>
      {saveErr && <div className="banner warn">{saveErr}</div>}
      <main>
        {tab === 'diseno' && <Editor template={template} setTemplate={setTemplate} vars={previewVars} varList={varList} fontsVersion={fontsVersion} rowNav={rowNav} />}
        {tab === 'evento' && <EventPanel event={event} setEvent={setEvent} />}
        {tab === 'datos' && (
          <DataPanel dataset={dataset} setDataset={setDataset} mapping={mapping} setMapping={setMapping}
            onView={(i, go = true) => { setRowIndex(i); if (go) setTab('emitir'); }} />
        )}
        {tab === 'emitir' && (
          <IssuePanel template={template} event={event} dataset={dataset} mapping={mapping} settings={settings} setSettings={setSettings}
            setRegistry={setRegistry} rowIndex={idx} setRowIndex={setRowIndex} previewVars={previewVars} />
        )}
        {tab === 'registro' && <RegistryPanel registry={registry} setRegistry={setRegistry} settings={settings} event={event} />}
        {tab === 'ajustes' && <SettingsPanel settings={settings} setSettings={setSettings} />}
      </main>
      <footer className="foot">Todo el procesamiento ocurre en este navegador. Los datos de participantes no se envían a ningún servidor, salvo los correos que decidas enviar con EmailJS.</footer>
    </div>
  );
}
