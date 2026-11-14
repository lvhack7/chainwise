import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHistory } from './trade-history.mts';
const wallet='0x0000000000000000000000000000000000001234';
const trade = { id:'a', hash:'0x'+'1'.repeat(64), status:'confirmed', input:{wallet,network:'base'}, validation:{kind:'swap',transaction:{chainId:8453,from:wallet},quote:{tokenIn:'USDC',tokenOut:'ETH',amountIn:'2000',amountOut:'1.1'},balancesBefore:{native:{rawBalance:'0'}}}, result:{receiptStatus:'success',inputVerified:true,outputVerified:true,wethUnwrappedRaw:'1000000000000000000',blockNumber:'100',transactionIndex:2,executedAt:'2026-11-14T12:00:00Z',networkFeeWei:'1000000000000',knownFeeWei:'1000000000000',feeComplete:true,portfolio:{native:{rawBalance:'999999000000000000'}}} };

test('history uses verified actual fills, deduplicates transaction hashes and scopes wallet and chain',()=>{
  const history=normalizeHistory([trade,{...trade,id:'duplicate'},{...trade,id:'other',input:{wallet,network:'sepolia'}}],wallet,'base');
  assert.equal(history.length,1);
  assert.equal(history[0].kind,'buy');
  assert.equal(history[0].ethAmount,'1');
  assert.equal(history[0].usdcAmount,'2000');
  assert.equal(history[0].executedAt,'2026-11-14T12:00:00Z');
  assert.equal(history[0].feeEth,'0.000001');
  assert.deepEqual(normalizeHistory([trade], '0x0000000000000000000000000000000000005678','base'),[]);
  assert.deepEqual(normalizeHistory([{...trade,status:'prepared'}],wallet,'base'),[]);
  assert.deepEqual(normalizeHistory([{...trade,result:{...trade.result,outputVerified:false}}],wallet,'base'),[]);
});
