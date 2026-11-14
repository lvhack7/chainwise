import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachProposal, visibleChatProposals } from '../src/chat-proposals.ts';

test('chat keeps each persisted proposal on its own response and deduplicates retries', () => {
  const rows = [{ role: 'Agent', text: 'Ready', proposalIds: ['a'] }, { role: 'You', text: 'Swap' }, { role: 'Agent', text: '' }];
  const updated = attachProposal(attachProposal(rows, 2, 'b'), 2, 'b');
  assert.deepEqual(updated[0].proposalIds, ['a']);
  assert.deepEqual(updated[2].proposalIds, ['b']);
});

test('only the selected wallet and network proposals can be shown in chat', () => {
  const trades = [{id:'a',input:{wallet:'0xABC',network:'base'}},{id:'b',input:{wallet:'0xDEF',network:'base'}},{id:'c',input:{wallet:'0xABC',network:'mainnet'}}];
  assert.deepEqual(visibleChatProposals(['a','b','c'], trades, '0xabc', 'base').map(t=>t.id), ['a']);
  assert.deepEqual(visibleChatProposals(['a'], trades, '', 'base'), []);
});
