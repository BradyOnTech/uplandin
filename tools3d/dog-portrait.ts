/**
 * Renders the menu dog preview for review and for the static fallback
 * portraits in public/art/menus3d/dogs/<breed>-<style>.webp.
 * ?breed=gsp|english-setter&coat=&style=smooth|faceted&pose=stand|point|trot|run&compare=1&backdrop=1
 */
import { createDogPreview, type PreviewBreed, type PreviewPose } from '../src/three/dogPreview';
import { resolveCoatFor } from '../src/game/dogCoats';
import type { DogStyle } from '../src/three/dogs/dogStyle';

const params = new URLSearchParams(location.search);
const breed = (params.get('breed') === 'english-setter' ? 'english-setter' : 'gsp') as PreviewBreed;
const coat = resolveCoatFor(breed, params.get('coat'));
const style = (params.get('style') === 'faceted' ? 'faceted' : 'smooth') as DogStyle;
if (params.has('backdrop')) document.body.classList.add('backdrop');
const preview = createDogPreview(document.getElementById('stage')!, {
  quality: 'high', autoRotate: params.has('rotate'), ground: !params.has('noground'),
  onReady: () => { setTimeout(() => Object.assign(window, { dogPortraitReady: true }), 400); },
});
preview.show(params.has('compare')
  ? [{ breed, coat, style: 'smooth' }, { breed, coat, style: 'faceted' }]
  : [{ breed, coat, style }]);
preview.setPose((params.get('pose') ?? 'stand') as PreviewPose);
