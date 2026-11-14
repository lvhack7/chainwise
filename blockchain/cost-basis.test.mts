import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCostBasisStore } from './cost-basis.mts';
const wallet='0x0000000000000000000000000000000000001234';

test('opening cost survives a fresh store instance and remains isolated by wallet and chain',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'defi-basis-')),url=pathToFileURL(dir+'/');
  try{
    const store=createCostBasisStore(url);
    await store.save({wallet,network:'base',priceUsdc:'2000',openingEth:'1',startTradeId:'a'.repeat(64),asOfBlock:'100'});
    const restarted=createCostBasisStore(url);
    assert.equal((await restarted.read(wallet,'base'))?.priceUsdc,'2000');
    assert.equal((await restarted.read(wallet,'base'))?.source,'user_reported');
    assert.equal(await restarted.read(wallet,'sepolia'),null);
    assert.equal(await restarted.read('0x0000000000000000000000000000000000005678','base'),null);
  }finally{await rm(dir,{recursive:true,force:true});}
});
