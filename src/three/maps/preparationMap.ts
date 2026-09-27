import type { AreaConfig } from '../../game/areas';
import { createSurveyAtlas, placeSurveyLabels } from './surveyMap';

/** Public, authored property geography only. No hunt or hidden bird state. */
export function createPreparationMap(area: AreaConfig): HTMLCanvasElement {
  const { canvas } = createSurveyAtlas(area), g = canvas.getContext('2d')!;
  const position = (p: { x: number; y: number }) => ({
    x: (p.x - area.world.x) / area.world.w * canvas.width,
    y: (p.y - area.world.y) / area.world.h * canvas.height,
  });
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const trail of area.trails) {
    if (trail.points.length < 2) continue;
    g.beginPath(); trail.points.forEach((p, i) => { const v = position(p); if (i) g.lineTo(v.x, v.y); else g.moveTo(v.x, v.y); });
    g.strokeStyle = '#6a634b99'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = '#f1dfb5'; g.lineWidth = 4; g.stroke();
  }
  const landmarks = area.landmarks.filter(landmark => landmark.kind !== 'gate');
  for (const landmark of landmarks) {
    const p = position(landmark.position); g.fillStyle = landmark.kind === 'pond' ? '#497c83' : '#42523b';
    g.beginPath(); g.arc(p.x, p.y, 7, 0, Math.PI * 2); g.fill();
  }
  // Avoid label collisions. The native entry controls remain legible and
  // keyboard accessible at every size, including small phone map previews.
  g.font = '30px Georgia, serif';
  const labels = placeSurveyLabels(landmarks.map(landmark => ({
    id: landmark.id, text: landmark.name, point: position(landmark.position), width: g.measureText(landmark.name).width + 16, height: 38,
  })), { x: 12, y: 12, w: canvas.width - 24, h: canvas.height - 24 });
  for (const label of labels) {
    g.fillStyle = '#e5dfbcd9'; g.fillRect(label.box.x, label.box.y, label.box.w, label.box.h);
    g.fillStyle = '#344633'; g.fillText(label.text, label.box.x + 8, label.box.y + 28);
  }
  return canvas;
}
