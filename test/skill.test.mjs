import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hashOf, STAMP, stamped } from '../server/skill.js';

const BIN = new URL('../bin/merma.js', import.meta.url).pathname;
const SKILL = readFileSync(new URL('../skill/SKILL.md', import.meta.url), 'utf8');
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

test('merma skill prints the skill, stamped with the version and the hash of its text', () => {
  const r = spawnSync(process.execPath, [BIN, 'skill']);
  assert.equal(r.status, 0);
  const out = String(r.stdout);
  assert.equal(out, SKILL.replace(STAMP, `This skill is from merma ${VERSION} (skill ${hashOf(SKILL)}).`));
  assert.match(out, /^---\nname: merma\n/, 'the frontmatter comes first, as a skill needs');
  assert.equal(String(r.stderr), '', 'the hint is for a terminal only, so a redirect saves the skill alone');
});

test('a saved copy has the hash of the skill it came from, whatever its Custom rules and line endings', () => {
  const saved = stamped(SKILL, '9.9.9');
  assert.equal(hashOf(saved), hashOf(SKILL), 'the stamp line is not part of the hash');
  const custom = saved.replace('No custom rules have been added yet.', '- Always serve from /srv/diagrams.');
  assert.equal(hashOf(custom), hashOf(SKILL), 'the Custom rules are the user\'s, not the skill\'s');
  assert.equal(hashOf(saved.replaceAll('\n', '\r\n')), hashOf(SKILL));
  assert.notEqual(hashOf(SKILL.replace('merma shows', 'merma draws')), hashOf(SKILL), 'a change to the text is a new hash');
});
