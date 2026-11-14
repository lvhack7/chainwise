import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePerformance, getPortfolioPerformance } from './performance.mts';
import type { HistoryEntry } from './trade-history.mts';
import { setOpeningCostBasis } from './performance.mts';
import { createCostBasisStore } from './cost-basis.mts';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const entry=(kind:'buy'|'sell'|'approval',ethAmount:string,usdcAmount:string,block='1'):HistoryEntry=>({id:block,hash:'0x'+block.padStart(64,'0'),kind,blockNumber:block,transactionIndex:0,executedAt:'2026-11-14T12:00:00Z',ethAmount,usdcAmount,beforeEth:null,afterEth:null,feeEth:'0',knownFeeEth:'0'});

test('moving average and realized/unrealized trading P&L use actual fills and exact decimal arithmetic',()=>{
  const result=calculatePerformance([{...entry('buy','0.1','200'),beforeEth:'0'},entry('buy','0.1','240','2'),entry('sell','0.05','130','3')],{balanceEth:'0.15',priceUsdcPerEth:'2500'});
  assert.equal(result.averageEntryUsdc,'2200');
  assert.equal(result.realizedPnlUsdc,'20');
  assert.equal(result.unrealizedPnlUsdc,'45');
  assert.equal(result.remainingCostUsdc,'330');
  assert.equal(result.averageBuyUsdc,'2200');
  assert.equal(result.pnlBasis,'gross_eth_trading_in_usdc_before_network_fees');
});

test('pre-existing ETH never receives a zero cost basis; an explicit opening price enables full P&L',()=>{
  const sales=[{...entry('sell','0.2','600'),beforeEth:'1'}];
  const unknown=calculatePerformance(sales,{balanceEth:'0.8',priceUsdcPerEth:'2500'});
  assert.equal(unknown.realizedPnlUsdc,null);
  assert.equal(unknown.averageEntryUsdc,null);
  assert.equal(unknown.unrealizedPnlUsdc,null);
  assert.equal(unknown.unknownBasisEth,'0.8');
  const known=calculatePerformance(sales,{balanceEth:'0.8',priceUsdcPerEth:'2500',opening:{eth:'1',priceUsdc:'2000'}});
  assert.equal(known.realizedPnlUsdc,'200');
  assert.equal(known.unrealizedPnlUsdc,'400');
  assert.equal(known.averageEntryUsdc,'2000');
});

test('history remains readable when prices or RPC are unavailable; live P&L stays unknown',async()=>{
  const wallet='0x0000000000000000000000000000000000001234';
  const result=await getPortfolioPerformance({wallet,network:'base'},{
    history:async()=>({wallet,network:'base',source:'verified_local_trade_records',coverage:'app trades',entries:[{...entry('buy','1','2000'),beforeEth:'0'}],metadataRemaining:0,syncFailures:0,unverifiedCount:0}),
    portfolio:async()=>{throw new Error('private RPC details');},pricing:async()=>{throw new Error('private API details');},
  });
  assert.equal(result.status,'partial');
  assert.equal(result.summary.averageBuyUsdc,'2000');
  assert.equal(result.summary.unrealizedPnlUsdc,null);
  assert.equal(result.currentBalanceEth,null);
  assert.equal(result.history.entries.length,1);
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('unverified transactions prevent complete profit claims even when balances and prices are available',async()=>{
  const wallet='0x0000000000000000000000000000000000001234';
  const date=new Date().toISOString();
  const result=await getPortfolioPerformance({wallet,network:'base'},{
    history:async()=>({wallet,network:'base',source:'verified_local_trade_records',coverage:'app trades',entries:[{...entry('buy','1','2000'),beforeEth:'0'}],metadataRemaining:0,syncFailures:0,unverifiedCount:1}),
    portfolio:async()=>({native:{balance:'1'},blockNumber:'2'}),
    pricing:async()=>({source:'fixture',currency:'USD',usdcPerEth:'2500',ethUsd:'2500',usdcUsd:'1',observedAt:date,ethUpdatedAt:date,usdcUpdatedAt:date}),
  });
  assert.equal(result.summary.realizedPnlUsdc,null);
  assert.equal(result.summary.unrealizedPnlUsdc,null);
  assert.match(result.warnings.join(' '),/verif/i);
  assert.equal(result.summary.trackedRealizedPnlUsdc,null);
});

test('gas-only approvals and balance reconciliation do not create buys or artificial gains',()=>{
  const trades=[{...entry('buy','1','2000'),beforeEth:'0',feeEth:'0.01',afterEth:'0.99'},{...entry('approval','0','0','2'),beforeEth:'0.99',feeEth:'0.01',afterEth:'0.98'},entry('sell','0.48','1440','3')];
  const result=calculatePerformance(trades,{balanceEth:'0.5',priceUsdcPerEth:'2500'});
  assert.equal(result.averageEntryUsdc,'2000');
  assert.equal(result.averageBuyUsdc,'2000');
  assert.equal(result.realizedPnlUsdc,'480');
  assert.equal(result.unrealizedPnlUsdc,'250');
  const deposit=calculatePerformance([{...entry('buy','1','2000'),beforeEth:'0'}],{balanceEth:'2',priceUsdcPerEth:'2500'});
  assert.equal(deposit.unknownBasisEth,'1');
  assert.equal(deposit.unrealizedPnlUsdc,null);
  assert.equal(deposit.trackedUnrealizedPnlUsdc,'500');
});

test('losses retain their signs instead of being rounded into gains or zero',()=>{
  const result=calculatePerformance([{...entry('buy','0.2','440'),beforeEth:'0'},entry('sell','0.1','200','2')],{balanceEth:'0.1',priceUsdcPerEth:'2100'});
  assert.equal(result.realizedPnlUsdc,'-20');
  assert.equal(result.unrealizedPnlUsdc,'-10');
});

test('user-reported opening cost applies only to its wallet history checkpoint',async()=>{
  const root=await mkdtemp(join(tmpdir(),'defi-checkpoint-')),wallet='0x0000000000000000000000000000000000001234';
  let firstId='a'.repeat(64);
  const date=new Date().toISOString();
  const deps:NonNullable<Parameters<typeof getPortfolioPerformance>[1]>={store:createCostBasisStore(pathToFileURL(root+'/')),history:async()=>({wallet,network:'base' as const,source:'verified_local_trade_records',coverage:'app trades',entries:[{...entry('sell','0.2','600'),id:firstId,beforeEth:'1'}],metadataRemaining:0,syncFailures:0,unverifiedCount:0}),portfolio:async()=>({native:{balance:'0.8'},blockNumber:'2'}),pricing:async()=>({source:'fixture',currency:'USD' as const,usdcPerEth:'2500',ethUsd:'2500',usdcUsd:'1',observedAt:date,ethUpdatedAt:date,usdcUpdatedAt:date})};
  try{
    await setOpeningCostBasis({wallet,network:'base',priceUsdc:'2000'},deps);
    const matched=await getPortfolioPerformance({wallet,network:'base'},deps);
    assert.equal(matched.openingBasisApplied,true);
    assert.equal(matched.summary.realizedPnlUsdc,'200');
    await assert.rejects(setOpeningCostBasis({wallet,network:'base',priceUsdc:'-1'},deps));
    firstId='b'.repeat(64);
    const changed=await getPortfolioPerformance({wallet,network:'base'},deps);
    assert.equal(changed.openingBasisApplied,false);
    assert.equal(changed.summary.realizedPnlUsdc,null);
  }finally{await rm(root,{recursive:true,force:true});}
});
