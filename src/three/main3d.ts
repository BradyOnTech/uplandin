import './field.css';

// Keep the loading interface available even when graphics creation fails before
// the engine and its lifecycle interface can be constructed.
void import('./boot3d').catch((error: unknown) => {
  document.body.classList.remove('capture');
  document.getElementById('field-overlay')!.hidden = false;
  document.getElementById('loading-progress')!.hidden = true;
  document.getElementById('enter-field')!.hidden = true;
  document.getElementById('field-instructions')!.hidden = true;
  document.getElementById('field-options')!.hidden = true;
  const status = document.getElementById('loading-status')!;
  status.hidden = false;
  status.textContent = 'The 3D field could not start. Reload to try again. If it keeps happening, check that your browser has graphics acceleration enabled.';
  const retry = document.getElementById('retry-field') as HTMLButtonElement;
  retry.hidden = false;
  retry.addEventListener('click', () => location.reload(), { once: true });
  retry.focus();
  console.error('Field startup failed', error);
});
