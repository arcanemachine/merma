// The diagram file, as the server has it: polled every second, with a callback whenever its text changes.

/**
 * @param {string} file the file's absolute path
 * @param {object} hooks
 * @param {(text: string) => void | Promise<void>} hooks.onText the file's text changed (or was read for the first time)
 * @param {(message: string) => void} hooks.onError the file could not be read
 */
export function createSource(file, { onText, onError }) {
  const q = encodeURIComponent(file);
  let text = null;
  let timer = null;

  async function poll() {
    try {
      const res = await fetch('/source?f=' + q, { cache: 'no-store' });
      const body = await res.text();
      if (!res.ok) { onError(body); return; }
      if (body === text) return;
      text = body;
      await onText(body);
    } catch (e) {
      onError('Server unreachable: ' + (e.message || e));
    }
  }

  return {
    get text() { return text; },
    poll,
    start() { poll(); if (!timer) timer = setInterval(poll, 1000); },
    stop() { clearInterval(timer); timer = null; },
    async hostPath() { return (await fetch('/hostpath?f=' + q)).text(); },
  };
}
