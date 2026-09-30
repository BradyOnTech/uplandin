/**
 * Small CSS swatches for coat choices, drawn from the same palette the 3D
 * dogs use so a chip reads like the dog it selects.
 */
import { germanShorthairedPointerAppearance, isGspCoatId } from './germanShorthairedPointer';
import { englishSetterAppearance, isEnglishSetterCoatId } from './englishSetter';

const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;

/** A CSS `background` value for a round coat chip. */
export function coatSwatch(coatId: string): string {
  if (isGspCoatId(coatId)) {
    const a = germanShorthairedPointerAppearance(coatId), base = hex(a.ground), mark = hex(a.primary);
    if (a.pattern === 'solid') return `radial-gradient(circle at 35% 30%, ${hex(0x7a4c3e)}, ${mark} 55%, ${hex(a.primaryDeep)})`;
    if (a.pattern === 'patched') return `radial-gradient(circle at 30% 32%, ${mark} 0 28%, transparent 29%), radial-gradient(circle at 76% 70%, ${mark} 0 22%, transparent 23%), radial-gradient(circle at 50% 50%, ${base}, ${hex(a.groundDim)})`;
    return `radial-gradient(circle at 28% 30%, ${mark} 0 24%, transparent 25%), radial-gradient(${mark} 1.2px, transparent 1.6px) 0 0 / 5px 5px, radial-gradient(circle at 50% 50%, ${base}, ${hex(a.groundDim)})`;
  }
  if (isEnglishSetterCoatId(coatId)) {
    const a = englishSetterAppearance(coatId), base = hex(a.ground), mark = hex(a.primary);
    const tan = a.tanPoint ? `radial-gradient(circle at 66% 72%, ${hex(a.tanPoint)} 0 14%, transparent 15%), ` : '';
    return `${tan}radial-gradient(circle at 30% 30%, ${mark} 0 26%, transparent 27%), radial-gradient(${mark} 1px, transparent 1.5px) 1px 2px / 6px 6px, radial-gradient(circle at 50% 50%, ${base}, ${hex(a.groundDim)})`;
  }
  return 'radial-gradient(circle, #cfc6b0, #8d8570)';
}
