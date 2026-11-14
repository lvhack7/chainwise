import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposalIdForChat } from '../chat-proposals.mts';

test('only saved preparation results produce a chat proposal event', () => {
  const id = 'a'.repeat(64);
  assert.equal(proposalIdForChat('prepare_trade', { id }), id);
  assert.equal(proposalIdForChat('quote_swap', { id }), undefined);
  assert.equal(proposalIdForChat('prepare_trade', { id: 'fake' }), undefined);
  assert.equal(proposalIdForChat('prepare_trade', null), undefined);
});
