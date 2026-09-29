/** Pre-rendered menu art keeps preparation independent of a WebGL context. */
const properties = new Set(['quail-fields', 'chukar-ridge', 'sharptail-prairie', 'pheasant-coverts']);
export function propertyMenuArt(areaId: string): string | undefined {
  return properties.has(areaId) ? `${import.meta.env.BASE_URL}art/menus3d/${areaId}.webp` : undefined;
}
export const titleMenuArt = `${import.meta.env.BASE_URL}art/menus3d/title-landscape.webp`;
