// The commit-msg hook (prek.toml): a commit's subject is a conventional commit of at most 72 characters (AGENTS.md).
// fixup! and squash! commits pass: they are folded into another commit before it lands.
import { readFileSync } from 'node:fs';

const MAX = 72;
const TYPES = 'feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert';
// The first line git keeps: it drops blank and comment lines after this hook runs.
const subject = readFileSync(process.argv[2], 'utf8').split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '';
const length = [...subject].length;   // characters, not bytes: subjects hold … and the like
let problem = null;
if (/^(?:fixup|squash|amend)! /.test(subject)) problem = null;
else if (!new RegExp(`^(?:${TYPES})(?:\\([^)]+\\))?!?: \\S`).test(subject)) problem = `it does not start with a type (${TYPES.replaceAll('|', ', ')}), then ": "`;
else if (length > MAX) problem = `it is ${length} characters long, over ${MAX}`;
if (problem) {
  console.error(`The commit subject was refused, because ${problem}:\n  ${subject}`);
  process.exit(1);
}
