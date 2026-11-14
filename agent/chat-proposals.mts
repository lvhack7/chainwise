// Emit only IDs produced by application-owned preparation tools, never model text.
export function proposalIdForChat(name: string | undefined, result: unknown): string | undefined {
  if (!name || !['prepare_trade', 'prepare_sepolia_trade', 'prepare_sepolia_usdc_trade'].includes(name) || !result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string' || !/^[a-f0-9]{64}$/.test(result.id)) return;
  return result.id;
}
