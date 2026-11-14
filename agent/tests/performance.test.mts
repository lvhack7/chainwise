import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolDeclarations } from '../tools.mts';
import { toolInputWithContext } from '../chat-context.mts';
const wallet='0x0000000000000000000000000000000000001234';
test('history and performance tools inherit the active wallet and reject account/network overrides',()=>{
  for(const name of ['get_trade_history','get_portfolio_performance']){
    assert.ok(toolDeclarations.some(t=>t.name===name));
    const context={wallet,network:'base' as const,walletSource:'connected' as const};
    assert.deepEqual(toolInputWithContext(name,{},context),{wallet,network:'base'});
    assert.throws(()=>toolInputWithContext(name,{network:'sepolia'},context));
    assert.throws(()=>toolInputWithContext(name,{}, {...context,wallet:null,walletSource:'none'}));
  }
  assert.ok(!toolDeclarations.some(t=>t.name==='set_opening_cost_basis'),'the model cannot invent or edit acquisition costs');
});
