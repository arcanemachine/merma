// The page: wires the file (source.mjs) to the view (viewer.mjs), and runs the header and footer.

import { createSource } from './source.mjs';
import { createViewer } from './viewer.mjs';

const el = (id) => document.getElementById(id);

// With no ?f=, show the scratch diagram (the server creates it if missing).
const file = new URLSearchParams(location.search).get('f') || '/tmp/mermaid-diagrams/scratch.mmd';

// A short status message that fades out. Short messages ("Copied!") start fading after 1 s; longer ones stay up
// ~70 ms a character, capped at 8 s. Then a 0.6 s fade.
let toastTimer;
function toast(message) {
  el('toast').textContent = message;
  el('toast').classList.add('show');
  clearTimeout(toastTimer);
  const ms = Math.min(8000, Math.max(1000, 70 * message.length));
  toastTimer = setTimeout(() => el('toast').classList.remove('show'), ms);
}

function showError(message) {
  el('error').textContent = message;
  el('error').style.display = message ? 'block' : 'none';
}

const viewer = createViewer({ diagram: el('diagram'), stage: el('stage') });

const source = createSource(file, {
  async onText(text) {
    const shown = await viewer.show(text);
    if (!shown.ok) { showError('Syntax error; showing the last good render.\n' + shown.error); return; }
    for (const b of ['copy-svg', 'download-svg', 'reset-view']) el(b).disabled = false;
    showError('');
    el('status').textContent = 'updated ' + new Date().toLocaleTimeString();
  },
  onError: showError,
});

// The header: the file's path, and its host path when the server knows it. Click either to copy it; localhost is a
// secure context, so the clipboard API is available.
el('path').textContent = file;
el('path').dataset.copy = file;
document.title = file.split('/').pop() + ' · merma';
source.hostPath().then((host) => {
  if (!host) return;
  el('host').textContent = 'host: ' + host;
  el('host').dataset.copy = host;
});
for (const id of ['path', 'host']) {
  el(id).title = 'Click to copy path to clipboard';
  el(id).addEventListener('click', async () => {
    const text = el(id).dataset.copy;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast('Copied!');
  });
}

// The footer. The SVG is exported as this browser drew it, with its fonts, so it can differ slightly from a
// mermaid-cli PNG.
el('reset-view').addEventListener('click', viewer.fit);
el('copy-svg').addEventListener('click', async () => {
  const markup = viewer.svgMarkup();
  if (!markup) return;
  await navigator.clipboard.writeText(markup);
  toast('SVG copied!');
});
el('download-svg').addEventListener('click', () => {
  const markup = viewer.svgMarkup();
  if (!markup) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  link.download = file.split('/').pop().replace(/\.mmd$/, '') + '.svg';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast('SVG downloaded');
});

source.start();
