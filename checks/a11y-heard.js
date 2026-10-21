// What a screen reader would say, from Guidepup's virtual screen reader (checks/README.md, "Accessibility"). It models
// a screen reader from the page's roles, names and live regions; it is not VoiceOver or NVDA.
// The first run starts listening and returns "listening"; the next returns what was announced since (live regions, as
// "polite: …" or "assertive: …") and stops. With a selector, it instead reads that element from the top, item by item.
async (from) => {
  const { virtual } = await import('https://cdn.jsdelivr.net/npm/@guidepup/virtual-screen-reader@0.33.0/lib/esm/index.browser.js');
  if (from) {
    await virtual.start({ container: from });
    for (let i = 0; i < 200 && (await virtual.lastSpokenPhrase()) !== `end of ${from.localName}`; i++) await virtual.next();
    const read = await virtual.spokenPhraseLog();
    await virtual.stop();
    return JSON.stringify(read);
  }
  if (!window.__listening) {
    await virtual.start({ container: document.body });
    await virtual.clearSpokenPhraseLog();
    window.__listening = true;
    return 'listening';
  }
  const heard = await virtual.spokenPhraseLog();
  await virtual.stop();
  window.__listening = false;
  return JSON.stringify(heard);
}
