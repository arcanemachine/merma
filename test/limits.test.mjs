import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limitOf, limitSentence, overTextLimit, readLimits, TEXT_LIMIT_LABEL } from '../web/limits.mjs';

// Mermaid 12.2.0's own message, thrown by parse and render over maxEdges.
const EDGE_ERROR = 'Edge limit exceeded. 500 edges found, but the limit is 500.\n\nInitialize mermaid with maxEdges set to a higher number to allow more edges.';

test("Mermaid's two limit errors are told apart from a syntax error", () => {
  assert.equal(limitOf(EDGE_ERROR), 'edges');
  assert.equal(limitOf(TEXT_LIMIT_LABEL), 'text');
  assert.equal(limitOf('Parse error on line 2:\n...'), null);
});

test("a drawing is Mermaid's stand-in for a diagram over the text limit only when it is that one node", () => {
  assert.equal(overTextLimit([TEXT_LIMIT_LABEL]), true);
  assert.equal(overTextLimit([` ${TEXT_LIMIT_LABEL}\n`]), true, 'the label as drawn, with its whitespace');
  assert.equal(overTextLimit([TEXT_LIMIT_LABEL, 'Next']), false, 'a diagram that holds a node so labeled');
  assert.equal(overTextLimit(['Start']), false);
});

test('each sentence names the limit in force and the setting that raises it', () => {
  assert.equal(limitSentence('edges', {}, false),
    "The diagram has more edges than merma's limit of 500, so the last good render is shown. Start merma with MERMA_MAX_EDGES set higher.");
  assert.equal(limitSentence('edges', { maxEdges: 2000 }, true),
    "Your change was not saved, because the diagram would have more edges than merma's limit of 2,000. Start merma with MERMA_MAX_EDGES set higher.");
  assert.equal(limitSentence('text', {}, false),
    "The diagram's code is longer than merma's limit of 50,000 characters, so the last good render is shown. Start merma with MERMA_MAX_TEXT set higher.");
  assert.match(limitSentence('text', { maxTextSize: 1000000 }, false), /limit of 1,000,000 characters/);
});

test("the page's limits are the ones it was served with, and none when the server set none", () => {
  assert.deepEqual(readLimits('', ''), {});
  assert.deepEqual(readLimits('5000', '1000000'), { maxEdges: 5000, maxTextSize: 1000000 });
  assert.deepEqual(readLimits('', '80000'), { maxTextSize: 80000 });
});
