import { shortId as sid } from './ids.js';
import { pageDims } from './page.js';

const NAVY = '#1f3a5f', GOLD = '#a8843f', INK = '#222222', GREY = '#666666';

export const DOC_TYPES = [
  { key: 'certificado', label: 'Certificado (participación, asistencia, ponencia)' },
  { key: 'invitacion', label: 'Invitación académica' },
  { key: 'aceptacion', label: 'Carta de aceptación' },
  { key: 'credencial', label: 'Credencial o gafete de evento' },
  { key: 'blanco', label: 'Plantilla en blanco' },
];

const T = (o) => ({ id: sid(), type: 'text', font: 'helvetica', size: 12, color: INK, align: 'center', valign: 'top', lineHeight: 1.2, fit: 'shrink', ...o });
const IMG = (o) => ({ id: sid(), type: 'image', src: null, label: 'Logo institucional', ...o });
const SIG = (o) => ({ id: sid(), type: 'signature', src: null, name: 'Nombre Apellido', title: 'Cargo', font: 'helvetica', size: 10, color: INK, line: true, ...o });
const QR = (o) => ({ id: sid(), type: 'qr', content: '{{url_verificacion}}', color: INK, bg: true, margin: 1, ...o });
const RECT = (o) => ({ id: sid(), type: 'rect', fill: null, stroke: null, strokeWidth: 0, ...o });

function certificado() {
  const W = 841.89, H = 595.28;
  return {
    docType: 'certificado', docLabel: 'Certificado', page: { size: 'A4', orientation: 'landscape' }, background: null, fonts: [],
    elements: [
      RECT({ x: 18, y: 18, w: W - 36, h: H - 36, stroke: NAVY, strokeWidth: 2.5 }),
      RECT({ x: 26, y: 26, w: W - 52, h: H - 52, stroke: GOLD, strokeWidth: 0.8 }),
      IMG({ x: W / 2 - 60, y: 44, w: 120, h: 62 }),
      T({ x: 80, y: 114, w: W - 160, h: 20, text: '{{institucion}}', size: 13, bold: true, uppercase: true, color: NAVY, fit: 'single' }),
      T({ x: 80, y: 136, w: W - 160, h: 16, text: '{{unidad}}', size: 10.5, color: GREY, fit: 'single' }),
      T({ x: 80, y: 166, w: W - 160, h: 46, text: 'CERTIFICADO', font: 'times', size: 38, bold: true, color: NAVY, fit: 'single' }),
      T({ x: 80, y: 220, w: W - 160, h: 20, text: 'Se certifica que', font: 'times', italic: true, size: 14, fit: 'single' }),
      T({ x: 80, y: 244, w: W - 160, h: 44, text: '{{nombre}}', font: 'times', bold: true, size: 30, minSize: 16, color: NAVY, fit: 'single' }),
      T({ x: 80, y: 290, w: W - 160, h: 14, text: '[[{{rut_dni}}]]', size: 9.5, color: GREY, fit: 'single' }),
      T({ x: 110, y: 314, w: W - 220, h: 78, font: 'times', size: 14, lineHeight: 1.35,
        text: 'participó[[ en calidad de **{{rol}}**]] en el **{{evento}}**, organizado por {{institucion}}[[ y realizado en {{lugar}}]], {{fecha}}[[, con una duración de {{duracion_horas}} horas cronológicas]].' }),
      T({ x: 110, y: 394, w: W - 220, h: 30, text: '[[Ponencia «{{titulo_trabajo}}»]]', font: 'times', italic: true, size: 12, lineHeight: 1.25 }),
      SIG({ x: 150, y: 432, w: 210, h: 100, title: 'Cargo\n{{unidad}}' }),
      SIG({ x: 470, y: 432, w: 210, h: 100, title: 'Cargo\n{{institucion}}' }),
      QR({ x: W - 108, y: H - 128, w: 70, h: 70 }),
      T({ x: W - 125, y: H - 56, w: 104, h: 10, text: 'Código {{codigo}}', size: 6.5, color: GREY, fit: 'single' }),
      T({ x: 44, y: H - 50, w: 380, h: 10, text: 'Folio {{folio}} · Emitido el {{fecha_emision}} · Verificable mediante código QR', size: 7, color: GREY, align: 'left', fit: 'single' }),
    ],
  };
}

function carta(kind) {
  const W = 595.28, H = 841.89;
  const isInv = kind === 'invitacion';
  const body = isInv
    ? 'De nuestra consideración:\n\nEn nombre de {{institucion}}, tenemos el agrado de invitarle a participar[[ en calidad de **{{rol}}**]] en el **{{evento}}**, que se realizará {{fecha}}[[ en {{lugar}}]][[, {{ciudad}}]][[, en modalidad {{modalidad}}]].\n\n[[Su participación está prevista en {{mesa}}. ]]Esta instancia reúne a investigadoras e investigadores de distintas instituciones con el propósito de discutir avances recientes en el área, por lo que su contribución resulta de especial interés para el programa académico.\n\nAgradeceremos confirmar su participación respondiendo a esta invitación. Sin otro particular, le saluda atentamente,'
    : 'De nuestra consideración:\n\nPor medio de la presente, el Comité Organizador del **{{evento}}** tiene el agrado de informar que la propuesta[[ titulada **«{{titulo_trabajo}}»**]], presentada por {{nombre}}[[ ({{afiliacion}})]], ha sido **aceptada** para su presentación[[ en {{mesa}}]].\n\nEl evento se realizará {{fecha}}[[ en {{lugar}}]][[, {{ciudad}}]]. En las próximas semanas el comité comunicará el programa definitivo, la asignación horaria de cada sesión y las indicaciones para la presentación.\n\nSe extiende la presente carta a solicitud de la persona interesada, para los fines que estime convenientes.';
  return {
    docType: kind, docLabel: isInv ? 'Invitacion' : 'Carta_de_aceptacion', page: { size: 'A4', orientation: 'portrait' }, background: null, fonts: [],
    elements: [
      IMG({ x: 60, y: 48, w: 130, h: 64 }),
      T({ x: 250, y: 52, w: 285, h: 56, text: '**{{institucion}}**\n{{unidad}}', size: 9.5, align: 'right', color: NAVY, lineHeight: 1.3 }),
      RECT({ x: 60, y: 124, w: W - 120, h: 0.8, fill: GOLD }),
      T({ x: 60, y: 140, w: W - 120, h: 16, text: '{{ciudad}}, {{fecha_emision}}', size: 10.5, align: 'right', fit: 'single' }),
      T({ x: 60, y: 176, w: W - 120, h: 58, text: '[[{{tratamiento}} ]]**{{nombre}}**\n[[{{afiliacion}}\n]]Presente', size: 11, align: 'left', lineHeight: 1.35 }),
      T({ x: 60, y: 250, w: W - 120, h: 24, text: isInv ? 'INVITACIÓN' : 'CARTA DE ACEPTACIÓN', font: 'times', size: 18, bold: true, color: NAVY, fit: 'single' }),
      T({ x: 60, y: 290, w: W - 120, h: 310, text: body, size: 11.5, align: 'justify', lineHeight: 1.45, minSize: 8 }),
      SIG({ x: W / 2 - 100, y: 625, w: 200, h: 100, title: isInv ? 'Cargo\n{{institucion}}' : 'Comité Organizador\n{{evento}}' }),
      QR({ x: W - 120, y: H - 112, w: 60, h: 60 }),
      T({ x: W - 140, y: H - 48, w: 100, h: 9, text: 'Código {{codigo}}', size: 6.5, color: GREY, fit: 'single' }),
      T({ x: 60, y: H - 44, w: 360, h: 10, text: 'Folio {{folio}} · Documento verificable mediante código QR', size: 7, color: GREY, align: 'left', fit: 'single' }),
    ],
  };
}

function credencial() {
  const W = 283.46, H = 396.85;
  return {
    docType: 'credencial', docLabel: 'Credencial', page: { size: 'Credencial 10×14 cm', orientation: 'portrait' }, background: null, fonts: [],
    elements: [
      RECT({ x: 0, y: 0, w: W, h: 76, fill: NAVY }),
      IMG({ x: 16, y: 12, w: 60, h: 52, label: 'Logo' }),
      T({ x: 86, y: 12, w: W - 102, h: 52, text: '**{{evento}}**\n{{fecha}}', size: 10, color: '#ffffff', align: 'left', valign: 'middle', lineHeight: 1.25 }),
      T({ x: 18, y: 120, w: W - 36, h: 72, text: '{{nombre}}', size: 24, bold: true, color: NAVY, valign: 'middle', lineHeight: 1.1, minSize: 12 }),
      T({ x: 18, y: 196, w: W - 36, h: 34, text: '{{afiliacion}}', size: 11, color: GREY, lineHeight: 1.2 }),
      RECT({ x: 0, y: 250, w: W, h: 36, fill: GOLD }),
      T({ x: 10, y: 250, w: W - 20, h: 36, text: '{{rol}}', size: 15, bold: true, uppercase: true, color: '#ffffff', valign: 'middle', fit: 'single' }),
      QR({ x: W / 2 - 36, y: 298, w: 72, h: 72 }),
      T({ x: 18, y: 374, w: W - 36, h: 10, text: '{{codigo}}', size: 6.5, color: GREY, fit: 'single' }),
    ],
  };
}

function blanco() {
  return { docType: 'blanco', docLabel: 'Documento', page: { size: 'A4', orientation: 'landscape' }, background: null, fonts: [], elements: [] };
}

export function makePreset(key) {
  if (key === 'invitacion' || key === 'aceptacion') return carta(key);
  if (key === 'credencial') return credencial();
  if (key === 'blanco') return blanco();
  return certificado();
}

export function newElement(type, page) {
  const [W, H] = pageDims(page);
  switch (type) {
    case 'text': return T({ x: W / 2 - 150, y: H / 2 - 15, w: 300, h: 30, text: 'Texto nuevo', size: 14 });
    case 'variable': return T({ x: W / 2 - 150, y: H / 2 - 15, w: 300, h: 30, text: '{{nombre}}', size: 16, fit: 'single' });
    case 'image': return IMG({ x: W / 2 - 60, y: H / 2 - 40, w: 120, h: 80, label: 'Imagen' });
    case 'signature': return SIG({ x: W / 2 - 100, y: H / 2 - 50, w: 200, h: 100 });
    case 'qr': return QR({ x: W / 2 - 36, y: H / 2 - 36, w: 72, h: 72 });
    case 'rect': return RECT({ x: W / 2 - 100, y: H / 2 - 40, w: 200, h: 80, fill: '#eef2f7', stroke: NAVY, strokeWidth: 1 });
    case 'line': return RECT({ x: W / 2 - 150, y: H / 2, w: 300, h: 1, fill: NAVY });
    default: return null;
  }
}

export const DEFAULT_EVENT = {
  institucion: 'Universidad de Ejemplo',
  unidad: 'Facultad de Ciencias Sociales',
  tipo_actividad: 'Congreso',
  evento: 'IV Congreso de Estudios Políticos',
  edicion: 'IV',
  fecha: 'los días 12 y 13 de noviembre de 2026',
  lugar: 'el Aula Magna del Campus Central',
  ciudad: 'Santiago',
  modalidad: 'presencial',
  duracion_horas: '16',
  extra: [],
};

export const SAMPLE_DATASET = {
  fileName: 'ejemplo (incluido)',
  columns: ['Nombre completo', 'RUT', 'Correo', 'Rol', 'Institución', 'Título ponencia', 'Mesa'],
  rows: [
    { 'Nombre completo': 'María José Fernández-Ugarte de la Fuente Valenzuela', RUT: '12.345.678-5', Correo: 'mjfernandez@example.com', Rol: 'Expositora', 'Institución': 'Universidad del Norte', 'Título ponencia': 'Coaliciones de gobierno y disciplina legislativa en América Latina, 1990-2024', Mesa: 'la Mesa 3, Instituciones políticas comparadas' },
    { 'Nombre completo': 'Juan Pérez Soto', RUT: '9.876.543-2', Correo: 'jperez@example.com', Rol: 'Asistente', 'Institución': 'Universidad de Ejemplo', 'Título ponencia': '', Mesa: '' },
    { 'Nombre completo': 'Ana Lucía Núñez Ibáñez', RUT: '15.432.109-K', Correo: 'anunez@example.com', Rol: 'Organizadora', 'Institución': 'Universidad de Ejemplo', 'Título ponencia': '', Mesa: '' },
  ],
};

export const DEFAULT_SETTINGS = {
  baseUrl: '',
  folioPrefix: `CERT-${new Date().getFullYear()}-`,
  nextFolio: 1,
  publicLevel: 'nombre',
  fileNamePattern: '{{tipo_documento}}_{{nombre}}',
  emailjs: {
    serviceId: '', templateId: '', publicKey: '', attach: true,
    subject: '{{tipo_documento}} · {{evento}}',
    message: 'Estimado/a {{nombre}}:\n\nAdjuntamos su documento correspondiente al {{evento}}. Puede verificar su autenticidad en {{url_verificacion}} (código {{codigo}}).\n\nSaludos cordiales,\n{{institucion}}',
  },
  github: { owner: '', repo: '', branch: 'main', path: 'public/registry.json' },
};
