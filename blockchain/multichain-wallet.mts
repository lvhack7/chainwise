import { formatUnits, isAddress } from 'viem';

// These are explicitly requested networks; this list does not imply coverage of
// every chain supported by a provider. Portfolio API batches at most five.
export const EVM_NETWORKS = ['eth-mainnet', 'base-mainnet', 'polygon-mainnet', 'arb-mainnet', 'opt-mainnet', 'bnb-mainnet', 'avax-mainnet', 'linea-mainnet'] as const;
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function validSolana(address: string) {
  if (address.length < 32 || address.length > 44 || [...address].some(c => !alphabet.includes(c))) return false;
  let value = 0n;
  for (const c of address) value = value * 58n + BigInt(alphabet.indexOf(c));
  let bytes = 0; while (value) { value >>= 8n; bytes++; }
  return bytes + (address.match(/^1*/)?.[0].length ?? 0) === 32;
}

type Options = { apiKey?: string; fetch?: typeof fetch };
export async function getMultichainWallet(input: unknown, options: Options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid wallet input');
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => !['evmAddress', 'solanaAddress', 'extraNetworks'].includes(key))) throw new Error('Invalid wallet input');
  if (typeof data.evmAddress !== 'string' || typeof data.solanaAddress !== 'string') throw new Error('Invalid wallet input');
  const evm = data.evmAddress.trim(), solana = data.solanaAddress.trim();
  if (!evm && !solana) throw new Error('Invalid wallet: provide at least one public address');
  if (evm && !isAddress(evm)) throw new Error('Invalid EVM wallet address');
  if (solana && !validSolana(solana)) throw new Error('Invalid Solana wallet address');
  if (data.extraNetworks !== undefined && (!Array.isArray(data.extraNetworks) || data.extraNetworks.length > 20 || data.extraNetworks.some((item: unknown) => typeof item !== 'string' || !/^[a-z0-9-]{1,40}-mainnet$/.test(item) || item === 'sol-mainnet'))) throw new Error('Invalid additional EVM network');
  const key = (options.apiKey ?? process.env.ALCHEMY_API_KEY ?? '').trim();
  if (!key) return { status: 'unconfigured', message: 'Set ALCHEMY_API_KEY in the backend environment.', tokens: [], networks: [], warnings: [] };
  const groups: { address: string; networks: string[] }[] = [];
  if (evm) {
    const networks = [...new Set<string>([...EVM_NETWORKS, ...((data.extraNetworks ?? []) as string[])])];
    for (let index = 0; index < networks.length; index += 5) groups.push({ address: evm, networks: networks.slice(index, index + 5) });
  }
  if (solana) groups.push({ address: solana, networks: ['sol-mainnet'] });
  const tokens: { network: string; tokenAddress: string | null; symbol: string | null; name: string | null; balance: string | null; rawBalance: string | null; priceUsd: string | null; priceUpdatedAt: string | null; metadataIncomplete: boolean }[] = [];
  const warnings: string[] = [];
  await Promise.all(groups.map(async group => {
    let pageKey: string | undefined;
    try {
      for (let page = 0; page < 10; page++) {
        const response = await (options.fetch ?? fetch)(`https://api.g.alchemy.com/data/v1/${encodeURIComponent(key)}/assets/tokens/by-address`, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ addresses: [group], withMetadata: true, withPrices: true, includeNativeTokens: true, includeErc20Tokens: true, ...(pageKey ? { pageKey } : {}) }) });
        if (!response.ok) throw new Error('Provider unavailable');
        const result = await response.json();
        if (!Array.isArray(result?.data?.tokens)) throw new Error('Invalid provider response');
        if (result.error) {
          const failed = result.error.partialErrors;
          if (Array.isArray(failed) && failed.length) for (const entry of failed) warnings.push(`${group.networks.includes(entry.network) ? entry.network : 'A requested network'} could not be fully loaded.`);
          else warnings.push(`Some results for ${group.networks.join(', ')} may be incomplete.`);
        }
        for (const token of result.data.tokens) {
          if (!group.networks.includes(token.network) || typeof token.tokenBalance !== 'string' || !/^0x[0-9a-f]+$/i.test(token.tokenBalance)) { warnings.push('A token had invalid balance data and was omitted.'); continue; }
          const raw = BigInt(token.tokenBalance); if (raw === 0n) continue;
          const decimals = token.tokenMetadata?.decimals;
          const validDecimals = Number.isInteger(decimals) && decimals >= 0 && decimals <= 255;
          const price = Array.isArray(token.tokenPrices) ? token.tokenPrices.find((p: { currency?: string; value?: unknown }) => p.currency?.toLowerCase() === 'usd' && typeof p.value === 'string' && /^\d+(\.\d+)?$/.test(p.value)) : undefined;
          tokens.push({ network: token.network, tokenAddress: typeof token.tokenAddress === 'string' ? token.tokenAddress : null, symbol: typeof token.tokenMetadata?.symbol === 'string' ? token.tokenMetadata.symbol.slice(0, 32) : null, name: typeof token.tokenMetadata?.name === 'string' ? token.tokenMetadata.name.slice(0, 100) : null, rawBalance: raw.toString(), balance: validDecimals ? formatUnits(raw, decimals) : null, priceUsd: price?.value ?? null, priceUpdatedAt: typeof price?.lastUpdatedAt === 'string' ? price.lastUpdatedAt : null, metadataIncomplete: Boolean(token.error) || !validDecimals });
        }
        pageKey = result.data.pageKey || undefined;
        if (!pageKey) return;
      }
      warnings.push(`More results are available for ${group.networks.join(', ')}; the page limit was reached.`);
    } catch { warnings.push(`Could not load all results for ${group.networks.join(', ')}.`); }
  }));
  return { status: warnings.length ? 'partial' : 'ok', provider: 'Alchemy', observedAt: new Date().toISOString(), networks: groups.flatMap(group => group.networks), tokens, warnings: [...new Set(warnings)] };
}
