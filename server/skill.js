// The agent skill (skill/SKILL.md), stamped as it is printed with the merma version it came from and a hash of its
// text, so a saved copy can be told apart from the skill of the merma in use.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FILE = new URL('../skill/SKILL.md', import.meta.url);
const PACKAGE = new URL('../package.json', import.meta.url);
export const STAMP = '<!-- merma skill stamp -->';

/**
 * The hash of a skill's own text: not the stamp line, nor the Custom rules a user adds to a saved copy. Line endings
 * are made the same first, so a Windows checkout gets the same hash.
 */
export function hashOf(/** @type {string} */ text) {
  const own = text.replace(/\r\n?/g, '\n').split('\n## Custom rules\n')[0]
    .split('\n').filter((line) => line !== STAMP && !/^This skill is from merma /.test(line)).join('\n').trimEnd();
  return createHash('sha256').update(own).digest('hex').slice(0, 8);
}

/** What `merma skill` prints: the skill with its stamp line filled in. */
export function stamped(text = readFileSync(FILE, 'utf8'), version = JSON.parse(readFileSync(PACKAGE, 'utf8')).version) {
  return text.replace(STAMP, `This skill is from merma ${version} (skill ${hashOf(text)}).`);
}
