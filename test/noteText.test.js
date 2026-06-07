import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDocBlocks } from '../utils/noteText.js';

const minimalValid = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'hello' }],
    },
  ],
};

test('isValidDocBlocks accepts a minimal TipTap doc', () => {
  assert.equal(isValidDocBlocks(minimalValid), true);
});

test('isValidDocBlocks rejects non-doc root', () => {
  assert.equal(isValidDocBlocks({ type: 'paragraph' }), false);
});

test('isValidDocBlocks rejects unknown block type', () => {
  const bad = {
    type: 'doc',
    content: [{ type: 'unknownWidget', content: [] }],
  };
  assert.equal(isValidDocBlocks(bad), false);
});

test('isValidDocBlocks rejects excessive depth', () => {
  const leaf = { type: 'paragraph', content: [{ type: 'text', text: 'x' }] };
  let node = leaf;
  for (let i = 0; i < 100; i += 1) {
    node = { type: 'blockquote', content: [node] };
  }
  assert.equal(isValidDocBlocks({ type: 'doc', content: [node] }), false);
});
