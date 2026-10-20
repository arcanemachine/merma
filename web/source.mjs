// The diagram file, as the server has it: polled every second, with a callback whenever its text changes, and saved
// with the version it was based on, so a save never overwrites a change made in the meantime.

/**
 * @param {string} file the file's absolute path
 * @param {object} hooks
 * @param {(text: string) => void | Promise<void>} hooks.onText the file's text changed (or was read for the first time)
 * @param {(message: string) => void} hooks.onError the file could not be read
 */
export function createSource(file, { onText, onError }) {
  const q = encodeURIComponent(file);
  let text = null;
  let version = null;
  let timer = null;
  let saves = 0;   // bumped as a save starts and ends, so a poll that overlaps one is dropped

  async function poll() {
    const started = saves;
    try {
      const res = await fetch('/source?f=' + q, { cache: 'no-store' });
      const body = await res.text();
      if (started !== saves) return;
      if (!res.ok) { onError(body); return; }
      version = res.headers.get('ETag');
      if (body === text) return;
      text = body;
      await onText(body);
    } catch (e) {
      onError('Server unreachable: ' + (e.message || e));
    }
  }

  /**
   * Save `next` over `base`, the version the edit was made from (from snapshot(), taken when the edit began). The
   * caller passes it rather than this reading the latest, because a poll can bring in a newer version while the edit
   * is being checked; saving over that one would throw away the change it brought. On a conflict (the file changed
   * since), the new version is fetched and passed to onText as usual.
   * @returns {Promise<{ ok: true } | { ok: false, conflict?: boolean, message: string }>}
   */
  async function save(next, base) {
    saves++;
    try {
      let res;
      try {
        res = await fetch('/edit?f=' + q, {
          method: 'POST',
          headers: { 'If-Match': base, 'Content-Type': 'text/plain; charset=utf-8' },
          body: next,
        });
      } catch {
        return { ok: false, message: 'server unreachable.' };
      }
      if (res.status === 409) {
        text = null;
        queueMicrotask(poll);
        return { ok: false, conflict: true, message: 'the file changed since this page last read it.' };
      }
      if (!res.ok) return { ok: false, message: await res.text() };
      version = res.headers.get('ETag');
      text = next;
      return { ok: true };
    } finally {
      saves++;
    }
  }

  return {
    get text() { return text; },
    get version() { return version; },
    /** The text and its version together, as one consistent pair to base an edit on. */
    snapshot: () => ({ text, version }),
    poll,
    save,
    start() { poll(); if (!timer) timer = setInterval(poll, 1000); },
    stop() { clearInterval(timer); timer = null; },
    async hostPath() { return (await fetch('/hostpath?f=' + q)).text(); },
  };
}
