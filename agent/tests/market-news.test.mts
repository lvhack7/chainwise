import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTool, toolDeclarations } from '../tools.mts';
import { toolStage } from '../progress.mts';

test('the managed agent can request crypto news without a wallet or blockchain RPC', async () => {
  const declaration = toolDeclarations.find(tool => tool.name === 'get_market_news');
  assert.ok(declaration, 'get_market_news is declared for ZooWork');
  const original = process.env.YDC_API_KEY;
  delete process.env.YDC_API_KEY;
  try {
    const result = await handleTool('get_market_news', { topic: 'stablecoins' }, 'news-test', { network: 'base', wallet: null, walletSource: 'none' });
    assert.ok('provider' in result);
    assert.equal(result.provider, 'You.com Search');
    assert.equal(result.status, 'unconfigured');
    assert.equal(result.topic, 'stablecoins');
    assert.equal(result.tradingAuthority, 'none');
    assert.equal(toolStage('get_market_news'), 'Reading crypto market news');
  } finally { if (original === undefined) delete process.env.YDC_API_KEY; else process.env.YDC_API_KEY = original; }
});
