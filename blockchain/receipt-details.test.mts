import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, custom, encodeFunctionResult, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { receiptDetails } from './receipt-details.mts';
test('Base paid fees include L1 and historical operator components and remain incomplete if a component is missing',async()=>{
  const client=createPublicClient({chain:base,transport:custom({request:async({method,params})=>{
    if(method==='eth_getBlockByNumber'){assert.equal(params?.[0],'0x64');return {number:'0x64',timestamp:'0x64'};}
    if(method==='eth_call'){assert.equal(params?.[1],'0x64');return encodeFunctionResult({abi:parseAbi(['function getOperatorFee(uint256 gasUsed) view returns(uint256)']),functionName:'getOperatorFee',result:10n});}
    throw new Error('Unexpected RPC '+method);
  }})});
  const receipt={blockNumber:100n,gasUsed:100n,effectiveGasPrice:2n,transactionIndex:4,l1Fee:30n};
  const complete=await receiptDetails(client,receipt,'base');
  assert.equal(complete.networkFeeWei,'240');
  assert.equal(complete.feeComplete,true);
  assert.equal(complete.executedAt,'1970-01-01T00:01:40.000Z');
  const partial=await receiptDetails(client,{...receipt,l1Fee:null},'base');
  assert.equal(partial.networkFeeWei,null);
  assert.equal(partial.knownFeeWei,'210');
  assert.equal(partial.feeComplete,false);
});
