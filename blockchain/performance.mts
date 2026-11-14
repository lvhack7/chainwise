import { formatUnits, parseUnits } from 'viem';
import type { HistoryEntry } from './trade-history.mts';
import { getTradeHistory, historyScope } from './trade-history.mts';
import { getPortfolio } from './portfolio.mts';
import { getPricing } from './prices.mts';
import { costBasisStore, decimal } from './cost-basis.mts';
import type { Network } from './networks.mts';

type PerformanceInput = { balanceEth: string|null; priceUsdcPerEth: string|null; opening?: { eth: string; priceUsdc: string }|null };
export function calculatePerformance(entries: HistoryEntry[], input: PerformanceInput) {
  const E=10n**18n;
  let quantity=parseUnits(input.opening?.eth??entries[0]?.beforeEth??(entries.length===0?input.balanceEth:null)??'0',18);
  let unknown=input.opening?0n:quantity, cost=input.opening?quantity*parseUnits(input.opening.priceUsdc,8)/E:0n;
  let realized=0n,bought=0n,spent=0n,unknownSold=0n;
  const tradePnl:{id:string;realizedPnlUsdc:string|null}[]=[];
  const retire=(amount:bigint)=>{if(quantity===0n)return;const known=quantity-unknown,knownOut=amount*known/quantity;cost-=known===0n?0n:cost*knownOut/known;unknown-=amount-knownOut;quantity-=amount;};
  const reconcile=(target:bigint)=>{if(target>quantity){unknown+=target-quantity;quantity=target;}else if(target<quantity)retire(quantity-target);};
  for(const trade of entries){
    if(trade.beforeEth!==null)reconcile(parseUnits(trade.beforeEth,18));
    const amount=parseUnits(trade.ethAmount,18), usdc=parseUnits(trade.usdcAmount,8);
    if(trade.kind==='buy'){quantity+=amount;cost+=usdc;bought+=amount;spent+=usdc;}
    else if(trade.kind==='sell'&&amount>0n){
      if(amount>quantity)reconcile(amount);
      const known=quantity-unknown,knownSold=amount*known/quantity,missing=amount-knownSold;
      const basis=known===0n?0n:cost*knownSold/known,profit=usdc*knownSold/amount-basis;
      realized+=profit;unknownSold+=missing;cost-=basis;unknown-=missing;quantity-=amount;
      tradePnl.push({id:trade.id,realizedPnlUsdc:missing>0n?null:formatUnits(profit,8)});
    }
    if(trade.feeEth!==null)retire(parseUnits(trade.feeEth,18)>quantity?quantity:parseUnits(trade.feeEth,18));
    if(trade.afterEth!==null)reconcile(parseUnits(trade.afterEth,18));
  }
  if(input.balanceEth!==null)reconcile(parseUnits(input.balanceEth,18));
  const price=input.priceUsdcPerEth===null?null:parseUnits(input.priceUsdcPerEth,8);
  const known=quantity-unknown,knownUnrealized=price===null?null:formatUnits(known*price/E-cost,8);
  return {pnlBasis:'gross_eth_trading_in_usdc_before_network_fees',method:'moving_average; unknown inventory and non-trade outflows allocated proportionally',averageEntryUsdc:quantity>0n&&unknown===0n?formatUnits(cost*E/quantity,8):null,knownAverageEntryUsdc:known>0n?formatUnits(cost*E/known,8):null,averageBuyUsdc:bought>0n?formatUnits(spent*E/bought,8):null,realizedPnlUsdc:unknownSold>0n?null:formatUnits(realized,8),trackedRealizedPnlUsdc:formatUnits(realized,8) as string|null,unrealizedPnlUsdc:unknown>0n?null:knownUnrealized,trackedUnrealizedPnlUsdc:knownUnrealized,remainingCostUsdc:unknown>0n?null:formatUnits(cost,8),knownCostUsdc:formatUnits(cost,8) as string|null,heldEth:formatUnits(quantity,18),unknownBasisEth:formatUnits(unknown,18),unknownSoldEth:formatUnits(unknownSold,18),tradePnl};
}

type Readers={history?:typeof getTradeHistory;portfolio?:(input:{wallet:string;network:Network;includeUsdc:boolean})=>Promise<{native:{balance:string};blockNumber:string}>;pricing?:typeof getPricing;store?:typeof costBasisStore};
export async function getPortfolioPerformance(input:unknown,deps:Readers={}){
  const {wallet,network,value}=historyScope(input,['sync']);
  const [history,portfolio,pricing,basis]=await Promise.all([
    (deps.history??getTradeHistory)({wallet,network,...(value.sync===undefined?{}:{sync:value.sync})}),
    (deps.portfolio??getPortfolio)({wallet,network,includeUsdc:true}).catch(()=>null),
    (deps.pricing??getPricing)(network).catch(()=>null),
    (deps.store??costBasisStore).read(wallet,network),
  ]);
  const first=history.entries[0];
  const basisMatches=!!basis&&(basis.startTradeId===first?.id||basis.startTradeId===null&&(!first||BigInt(first.blockNumber)>BigInt(basis.asOfBlock)));
  const summary=calculatePerformance(history.entries,{balanceEth:portfolio?.native.balance??null,priceUsdcPerEth:pricing?.usdcPerEth??null,opening:basisMatches?{eth:basis!.openingEth,priceUsdc:basis!.priceUsdc}:null});
  if(!portfolio){summary.unrealizedPnlUsdc=null;summary.trackedUnrealizedPnlUsdc=null;}
  const warnings:string[]=[];
  if(!portfolio)warnings.push('Current wallet balance unavailable; history is still readable.');
  if(!pricing)warnings.push('Current market prices unavailable; live P&L cannot be calculated.');
  if(summary.unknownBasisEth!=='0'||summary.unknownSoldEth!=='0')warnings.push('Opening holdings or external inflows have unknown cost. Full P&L is unavailable; never assume their cost is zero.');
  if(basis&&!basisMatches)warnings.push('The saved opening cost checkpoint no longer matches history; review it before using it.');
  if(history.metadataRemaining)warnings.push('Some older records need dates and fees synchronized from on-chain receipts.');
  if(history.syncFailures)warnings.push(`Could not synchronize ${history.syncFailures} receipt records; saved trade data was preserved.`);
  const ambiguous=history.entries.some((e,i)=>i>0&&e.blockNumber===history.entries[i-1].blockNumber&&(e.transactionIndex===null||history.entries[i-1].transactionIndex===null));
  if(history.unverifiedCount||ambiguous){summary.realizedPnlUsdc=null;summary.unrealizedPnlUsdc=null;summary.averageEntryUsdc=null;summary.remainingCostUsdc=null;summary.knownCostUsdc=null;summary.trackedRealizedPnlUsdc=null;summary.trackedUnrealizedPnlUsdc=null;summary.knownAverageEntryUsdc=null;summary.tradePnl=summary.tradePnl.map(row=>({...row,realizedPnlUsdc:null}));warnings.push(history.unverifiedCount?'Some submitted transactions are not fully verified. Verify their receipts before claiming complete P&L.':'Same-block execution order is unknown. Sync receipt metadata before using complete P&L.');}
  const feeMissing=history.entries.filter(e=>e.feeEth===null).length;
  if(feeMissing)warnings.push('Some actual network fee components are unavailable; displayed fee totals are lower bounds.');
  const knownFees=history.entries.reduce((sum,e)=>sum+parseUnits(e.knownFeeEth??'0',18),0n);
  return {wallet,network,status:warnings.length?'partial':'complete',currency:network==='sepolia'?'test USDC':'USDC',summary,history,openingBasis:basis,openingBasisApplied:basisMatches,openingEth:first?.beforeEth??(first?null:portfolio?.native.balance??null),currentBalanceEth:portfolio?.native.balance??null,pricing:pricing?{usdcPerEth:pricing.usdcPerEth,source:pricing.source,observedAt:pricing.observedAt}:null,fees:{knownEth:formatUnits(knownFees,18),totalEth:feeMissing?null:formatUnits(knownFees,18),incompleteCount:feeMissing},warnings,scope:'App-recorded ETH trading P&L in USDC, before network fees. External trades, stablecoin USD price changes, and tax accounting are not included.'};
}
// Only exposed by an explicit dashboard form, never as an agent-write tool.
export async function setOpeningCostBasis(input:unknown,deps:Readers={}){
  const {wallet,network,value}=historyScope(input,['priceUsdc']);
  if(!decimal(value.priceUsdc,8))throw new Error('Invalid opening price: use a non-negative USDC decimal with up to 8 places');
  const history=await (deps.history??getTradeHistory)({wallet,network}),first=history.entries[0];
  let openingEth=first?.beforeEth??null,asOfBlock=first?.blockNumber??null;
  if(first&&!openingEth)throw new Error('Invalid opening balance; verify or synchronize the first tracked transaction');
  if(!first){const portfolio=await (deps.portfolio??getPortfolio)({wallet,network,includeUsdc:true});openingEth=portfolio.native.balance;asOfBlock=portfolio.blockNumber;}
  return (deps.store??costBasisStore).save({wallet,network,priceUsdc:value.priceUsdc,openingEth:openingEth!,startTradeId:first?.id??null,asOfBlock:asOfBlock!});
}
