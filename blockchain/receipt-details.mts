import { type Client, parseAbi } from 'viem';
import { getBlock, readContract } from 'viem/actions';
import { base } from 'viem/chains';
import type { Network } from './networks.mts';

type Receipt = { blockNumber: bigint; blockHash?: string; gasUsed: bigint; effectiveGasPrice: bigint; transactionIndex: number; l1Fee?:bigint|null };
export async function receiptDetails(client: Client, receipt: Receipt, network: Network) {
  const [block, operator] = await Promise.all([
    getBlock(client, { blockNumber: receipt.blockNumber }).catch(() => null),
    network === 'base' ? readContract(client, { address: base.contracts.gasPriceOracle.address, abi: parseAbi(['function getOperatorFee(uint256 gasUsed) view returns (uint256)']), functionName: 'getOperatorFee', args: [receipt.gasUsed], blockNumber: receipt.blockNumber }).catch(() => null) : Promise.resolve(0n),
  ]);
  const l2 = typeof receipt.effectiveGasPrice === 'bigint' ? receipt.gasUsed * receipt.effectiveGasPrice : null;
  const rawL1 = receipt.l1Fee;
  const l1 = network === 'base' ? typeof rawL1 === 'bigint' ? rawL1 : null : 0n;
  const complete = l2 !== null && l1 !== null && operator !== null;
  const subtotal = (l2 ?? 0n) + (l1 ?? 0n) + (operator ?? 0n);
  const date=block&&typeof block.timestamp==='bigint'&&(!receipt.blockHash||!block.hash||block.hash===receipt.blockHash)?new Date(Number(block.timestamp)*1000):null;
  return {
    executedAt: date&&Number.isFinite(date.getTime())?date.toISOString():null,
    transactionIndex: receipt.transactionIndex, networkFeeWei: complete ? subtotal.toString() : null,
    knownFeeWei: subtotal.toString(), feeComplete: complete, feeSource: network==='base'?'receipt_and_historical_oracle':'receipt',
  };
}
