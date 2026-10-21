// Tamaños en puntos tipográficos (1 pt = 1/72 de pulgada).
export const PAGE_SIZES = {
  A4: [595.28, 841.89],
  Carta: [612, 792],
  Oficio: [612, 936],
  A5: [419.53, 595.28],
  A6: [297.64, 419.53],
  'Credencial 10×14 cm': [283.46, 396.85],
};

export function pageDims(page = {}) {
  const [a, b] = PAGE_SIZES[page.size] || PAGE_SIZES.A4;
  return page.orientation === 'landscape' ? [Math.max(a, b), Math.min(a, b)] : [Math.min(a, b), Math.max(a, b)];
}
