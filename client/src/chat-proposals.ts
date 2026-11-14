export type ChatRow = { role: string; text: string; proposalIds?: string[] }
export function attachProposal(rows: ChatRow[], index: number, id: string): ChatRow[] {
  return rows.map((row, i) => i === index && row.role === 'Agent' ? { ...row, proposalIds: [...new Set([...(row.proposalIds ?? []), id])] } : row)
}
export function visibleChatProposals<T extends { id: string; input?: { wallet?: string; network?: string } }>(ids: string[], trades: T[], wallet: string, network: string): T[] {
  if (!wallet) return []
  return ids.flatMap(id => {
    const trade = trades.find(t => t.id === id && t.input?.wallet?.toLowerCase() === wallet.toLowerCase() && (t.input?.network ?? 'sepolia') === network)
    return trade ? [trade] : []
  })
}
