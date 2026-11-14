import { formatUnits, parseUnits, isAddress, getAddress } from 'viem';
import { listTrades, syncTradeDetails } from './execution.mts';
import { networkConfig, networkName, type Network } from './networks.mts';

export type HistoryEntry = {
  id: string; hash: string; kind: 'buy'|'sell'|'approval'|'reverted'; blockNumber: string; transactionIndex: number|null; executedAt: string|null;
  ethAmount: string; usdcAmount: string; beforeEth: string|null; afterEth: string|null; feeEth: string|null; knownFeeEth: string|null;
  executionPriceUsdc?:string|null;
};
const object = (v: unknown): Record<string,unknown> => v && typeof v==='object' && !Array.isArray(v) ? v as Record<string,unknown> : {};
const raw = (v: unknown) => typeof v==='string' && /^\d{1,78}$/.test(v) ? BigInt(v) : null;
const amount = (v: unknown, decimals: number) => { if(typeof v!=='string'||v.length>80||!/^(0|[1-9]\d*)(\.\d+)?$/.test(v)||(v.split('.')[1]?.length??0)>decimals)return null;return parseUnits(v,decimals); };
const eth = (v: unknown) => { const n=raw(v);return n===null?null:formatUnits(n,18); };
export function historyScope(input: unknown, extra: string[] = []) {
  const v=object(input);
  if(Object.keys(v).some(k=>!['wallet','network',...extra].includes(k))||typeof v.wallet!=='string'||!isAddress(v.wallet)||v.network===undefined)throw new Error('Invalid history wallet or input');
  return {wallet:getAddress(v.wallet),network:networkName(v.network),value:v};
}
export function normalizeHistory(records: unknown[], wallet: string, network: Network): HistoryEntry[] {
  const unique=new Map<string,HistoryEntry>();
  for(const source of records){
    const t=object(source), input=object(t.input), v=object(t.validation), tx=object(v.transaction), r=object(t.result), q=object(v.quote);
    if((input.network??'sepolia')!==network||String(input.wallet).toLowerCase()!==wallet.toLowerCase()||tx.chainId!==networkConfig(network).chain.id||String(tx.from).toLowerCase()!==wallet.toLowerCase()||typeof t.hash!=='string'||!/^0x[\da-fA-F]{64}$/.test(t.hash)||raw(r.blockNumber)===null)continue;
    if(t.status!=='confirmed'&&t.status!=='reverted')continue;
    const reverted=t.status==='reverted', approval=v.kind==='usdc_approval', buy=q.tokenIn==='USDC'&&q.tokenOut==='ETH', sell=q.tokenIn==='ETH'&&q.tokenOut==='USDC';
    if(reverted&&r.receiptStatus!=='reverted')continue;
    if(!reverted&&(r.receiptStatus!=='success'||r.inputVerified!==true||r.outputVerified!==true))continue;
    if(!reverted&&!approval&&!buy&&!sell)continue;
    const incoming=approval||reverted?0n:amount(q.amountIn,buy?6:18), output=approval||reverted?0n:raw(buy?r.wethUnwrappedRaw:r.usdcReceivedRaw);
    if(incoming===null||output===null||!approval&&!reverted&&(incoming<=0n||output<=0n))continue;
    if(!approval&&!reverted&&r.poolInputRaw!==undefined&&raw(r.poolInputRaw)!==incoming)continue;
    const entry:HistoryEntry={id:String(t.id),hash:t.hash,kind:reverted?'reverted':approval?'approval':buy?'buy':'sell',blockNumber:String(r.blockNumber),transactionIndex:typeof r.transactionIndex==='number'?r.transactionIndex:null,executedAt:typeof r.executedAt==='string'&&Number.isFinite(Date.parse(r.executedAt))?r.executedAt:null,ethAmount:formatUnits(buy?output:incoming,18),usdcAmount:formatUnits(buy?incoming:output,6),beforeEth:eth(object(object(v.balancesBefore).native).rawBalance),afterEth:eth(object(object(r.portfolio).native).rawBalance),feeEth:eth(r.networkFeeWei),knownFeeEth:eth(r.knownFeeWei??r.networkFeeWei)};
    const key=t.hash.toLowerCase(), previous=unique.get(key);
    entry.executionPriceUsdc=approval||reverted?null:formatUnits(parseUnits(entry.usdcAmount,8)*10n**18n/parseUnits(entry.ethAmount,18),8);
    if(!previous||(!previous.executedAt&&entry.executedAt)||(!previous.feeEth&&entry.feeEth))unique.set(key,entry);
  }
  return [...unique.values()].sort((a,b)=>BigInt(a.blockNumber)<BigInt(b.blockNumber)?-1:BigInt(a.blockNumber)>BigInt(b.blockNumber)?1:(a.transactionIndex??0)-(b.transactionIndex??0));
}
export async function getTradeHistory(input: unknown) {
  const {wallet,network,value}=historyScope(input,['sync']);
  if(value.sync!==undefined&&typeof value.sync!=='boolean')throw new Error('Invalid history sync flag');
  let records=await listTrades(),entries=normalizeHistory(records,wallet,network), syncFailures=0;
  if(value.sync){
    const started=Date.now();
    const missing=entries.filter(e=>!e.executedAt||e.knownFeeEth===null),partialFees=entries.filter(e=>e.executedAt&&e.knownFeeEth!==null&&e.feeEth===null);
    for(const entry of [...missing,...partialFees].slice(0,5)){
      if(Date.now()-started>30000)break;
      try{await syncTradeDetails(entry.id);}catch{syncFailures++;}
    }
    records=await listTrades();entries=normalizeHistory(records,wallet,network);
  }
  const verified=new Set(entries.map(e=>e.hash.toLowerCase()));
  const unverifiedCount=new Set(records.filter(t=>{const input=object(t.input);return (input.network??'sepolia')===network&&String(input.wallet).toLowerCase()===wallet.toLowerCase()&&t.hash&&!verified.has(t.hash.toLowerCase())&&['submitted','verification_pending','verification_failed'].includes(t.status);}).map(t=>t.hash)).size;
  return {wallet,network,source:'verified_local_trade_records',coverage:'Transactions tracked by this app; external wallet trades are not imported.',entries,metadataRemaining:entries.filter(e=>!e.executedAt||e.knownFeeEth===null).length,syncFailures,unverifiedCount};
}
