# Chainwise

ZooWork treasury agent, viem/Uniswap v3 tools, and a React dashboard with manual Trust Wallet / WalletConnect approval.

## Networks and pricing

- **Base Mainnet (`base`, 8453):** native ETH and Circle USDC. CoinGecko ETH/USD and USDC/USD for valuation and risk checks; real Uniswap v3 direct-pool quotes for swaps. Base L1 data, L2 execution and operator fee estimates are included in a conservative gas budget.
- **Ethereum Mainnet (`mainnet`, 1):** separate Ethereum contracts/RPC, CoinGecko valuation and Uniswap quotes.
- **Ethereum Sepolia (`sepolia`, 11155111):** retained for testing, with test USDC pool pricing. No real financial value.

Select a network in the dashboard before refreshing the portfolio or preparing a proposal. Wallet permissions, RPC chain ID, contract addresses, proposals, transaction requests and receipt tracking are bound to that chain. Existing proposals without a network are treated as legacy Sepolia proposals. Base Mainnet is not Base Sepolia.

## Run locally

Use Node.js 22.6+. Keep backend credentials in root `.env.local`; use `.env.example` as the list of settings. Install dependencies with `npm install` in `agent/`, `blockchain/`, and `client/`. From `client/` run `npm run build`. From `agent/` run `npm run server`, then open **http://localhost:3100**. Stop the CLI first; the backend and CLI share a process lock. Use Ctrl+C for clean shutdown. After a crash, startup automatically recovers a runtime lock only when its recorded process is confirmed dead. Live, inaccessible or malformed owner records are preserved. Normal exits and startup exceptions clean up their own locks. A rare interrupted recovery can leave `.runtime.lock.recovery`; confirm all agent processes are stopped before removing that file.

The landing page is at `/`; **Open dashboard** goes to `/dashboard`. The sidebar links to separate Overview, History, News, Agent, Swaps, and Wallets pages. Browser back/forward and direct links are supported, while the connected wallet and conversation remain available during dashboard navigation. Landing-page examples are labeled as product previews and do not show live balances. Agent prompt shortcuts fill the message box; sending is a separate action.

When the agent prepares a trade, its persisted proposal appears in that chat response for review and manual Trust Wallet approval. Refreshing or continuing a confirmed USDC allowance attaches the replacement to the conversation. The same wallet, network, execution-lock, fresh validation, and on-chain receipt checks apply as on the Swaps page. Chat messages are in-memory; saved proposals remain available on Swaps after a page reload.

The Wallets page can discover fungible assets using Alchemy's Portfolio API. Set `ALCHEMY_API_KEY` in root `.env.local` and restart the backend. Enter a separate Solana public address when needed; WalletConnect's Ethereum session does not supply it. The default EVM scan covers Ethereum, Base, Polygon, Arbitrum, Optimism, BNB Chain, Avalanche and Linea; additional Alchemy-supported mainnet identifiers can be entered in the page. The display reports partial failures and missing metadata, and does not include NFTs or automatically scan every existing chain. Provider token data and prices are informational and are not used for swap validation. Balances are retrieved when you select Load assets.

Required for Base read-only analysis and validation:

```dotenv
ZOOWORK_API_KEY=your_project_key
VITE_WALLETCONNECT_PROJECT_ID=your_reown_project_id
BASE_RPC_URL=https://mainnet.base.org
COINGECKO_API_KEY=your_demo_api_key
ENABLE_BASE_MAINNET_EXECUTION=false
ENABLE_ETHEREUM_MAINNET_EXECUTION=false
MAX_TRADE_USD=100
MAX_GAS_USD=5
```

The public Base RPC is rate-limited; a provider endpoint can be substituted. Set `ETHEREUM_RPC_URL` to use Ethereum Mainnet and `SEPOLIA_RPC_URL` to retain testnet functionality. CoinGecko uses its Demo API header; stale (>5 minutes), invalid or missing prices cause validation to reject. USDC is valued at its fetched market price, not an assumed dollar peg. No key or RPC credential is sent to the browser. Only `VITE_` variables enter the client build.

## Execution is locked by default

Both real-money execution flags default to false. Portfolio reads, quotes, proposals and validations remain available. The backend refuses to release a mainnet transaction while its flag is false, even if a proposal passed validation. There is no agent tool or HTTP endpoint to enable execution.

Only after testing and reviewing the resulting proposal, an operator can explicitly set `ENABLE_BASE_MAINNET_EXECUTION=true` locally and restart the backend. Ethereum Mainnet has its own separate flag. Reload the dashboard and prepare a fresh proposal. Every swap **and USDC approval transaction** still requires manual wallet confirmation. Connecting the wallet or enabling the flag never sends a transaction by itself.

Users choose swap amounts and any rebalance targets in chat. There is no mandatory allocation ratio; expected allocations are informational. Validation controls: maximum 5% quote deviation from valuation prices; slippage ≤100 bps; quote age ≤30 seconds and 15 Base blocks (3 Ethereum/Sepolia blocks); configurable notional and gas USD limits. Reserve after spending and estimated gas: 0.0001 ETH on Base, 0.005 ETH on Ethereum/Sepolia. All-in Base fee estimation must succeed. Gas budgets include a 20% margin and conservatively add Base's all-in estimate to the max-fee execution budget. Actual fees and market state can change.

## Wallet approval and verification

Use **Connect wallet** to scan the QR code with Trust Wallet, or **Use extension**, and approve the session for the selected network. The session must explicitly grant the chain's account and `eth_sendTransaction`. “Request network access” requests a switch and checks the actual updated session; a local provider chain change alone never enables trading. A wallet that omits the selected chain cannot sign for it.

The agent automatically uses the connected wallet and selected network. Ask **“How much ETH do I have, and what is it worth?”** without typing an address. A manually entered address is used for read-only viewing when no wallet is connected. Each chat turn supplies fresh context; account/network changes replace the previous context, and disconnecting clears the active address. The context does not grant transaction permission.

ETH → USDC uses native ETH and refunds unused ETH. USDC → ETH requires an exact-amount allowance to that chain's router; first approve that allowance, wait for its receipt, then validate a fresh swap. WETH is unwrapped to ETH for the wallet. Allowances are never unlimited.

For USDC → ETH, the calculator checks the selected wallet's on-chain router allowance. If it covers the input, **Review swap** reuses it. Otherwise **Review USDC approval** prepares an exact-amount approval. After confirmation, the approval card's **Review USDC → ETH swap** button creates a separately validated swap for the same amount; repeated clicks return the same proposal. Approval does not exchange tokens. Both transactions require separate wallet confirmations. The continuation refuses unconfirmed approvals, ordinary swaps, and a different wallet. An allowance smaller than the full USDC balance covers only the approved amount.

Router simulation uses the quote's block so an exact output comparison uses the same pool state. Gas estimation still checks current state. Freshness, minimum output, and validation before wallet release remain enforced.

Before release to the wallet, the backend obtains a fresh quote on the reviewed pool and simulates again, preserving the exact reviewed minimum output and chain/sender/target/value. Small price changes above that floor can pass. Quotes still must satisfy the 30-second freshness check; proposals have a five-minute review window and transactions receive a fresh five-minute router deadline at release. A proposal can be released only once. Expired proposals or quotes below the reviewed floor require a replacement: **Refresh quote** supersedes the unreleased proposal, and the user must review and select **Review & sign** again. Refresh never releases a transaction. If a wallet response is uncertain, inspect Trust Wallet and recover with its original hash instead of submitting a duplicate. Trading uses direct v3 pools at four fee tiers, not an exhaustive multi-hop route search.

Receipt verification checks sender, chain, target, calldata and ETH value, verifies the selected pool's actual input via Swap logs, checks received USDC or WETH withdrawal evidence, and reads native/token balances at the receipt block. Two observed confirmations and successful balance reads are required for `confirmed`; incomplete verification remains pending or failed. This is not a guarantee of irreversible chain finality. Records persist in `blockchain/.trades/`; keep them and the ZooWork session state for recovery.

## Swap calculations

The Swaps panel accepts an ETH or USDC amount and shows actual Uniswap output, the effective rate, the slippage minimum, and the included pool fee. CoinGecko prices provide USD reference values; they do not determine swap output. Calculations need no wallet and create no trade records. Input changes trigger a debounced quote request. Quotes expire after 30 seconds and require manual refresh; outdated responses cannot replace a calculation for another amount, direction, slippage, or chain.

Review swap runs full wallet-based validation and obtains network fees. Gas is separate from quoted output. In chat, ask “How much USDC would I get for 0.001 ETH?” or “Calculate 5 USDC to ETH at 50 bps slippage.” A hypothetical calculation does not prepare a transaction.

## Agent tools and checks

### Persistent trade memory and performance

**History** shows verified buys/sells, receipt execution dates, actual token amounts, execution rates, realized P&L and network fees. Records live in `blockchain/.trades/` across backend restarts and ZooWork sessions, scoped by wallet and network and deduplicated by transaction hash. `get_trade_history` reads this journal; `get_portfolio_performance` combines it with current balances and market prices. Both inherit the active dashboard wallet/network. Pending/unverified proposals do not count as completed trades. Approvals and reverts have fees but are not buys or sales.

New receipt verification stores on-chain block time, transaction index, actual pool input, actual received amounts, and paid fee metadata. Existing records remain readable; **Sync history** fills missing dates/fees from receipts, up to five records per request. Synchronization never signs, broadcasts, or changes confirmed status on an RPC failure. Base fees use receipt execution cost and L1 fee plus the operator fee read at that historical block; unavailable components remain explicitly incomplete. [Ethereum receipt reference](https://ethereum.github.io/execution-apis/api/methods/eth_getTransactionReceipt/), [viem receipt action](https://viem.sh/docs/actions/public/getTransactionReceipt).

Performance uses **moving-average ETH acquisition cost in USDC**, with integer arithmetic. A buy adds actual USDC spent and ETH received to inventory. A sale retires its proportional average cost; gross realized P&L is proceeds minus that cost. Gross unrealized P&L marks the remaining inventory against the current USDC/ETH reference. Lifetime average buy price and current holding average are separate figures. Network fees are listed separately, so these are **gross trading P&L before fees**, not net account returns or historical USD profit. USDC USD depegs, external trades and tax-lot accounting are outside this measure; Sepolia uses test USDC.

Pre-existing ETH and untracked deposits have unknown acquisition cost. Full average entry/realized/unrealized P&L remain null where that missing basis matters. Known-inventory partial amounts are labeled separately. The **Opening cost basis** form lets the user supply their actual average price for the ETH held before the first recorded transaction (or before future tracking begins for a wallet without records). That input is stored locally in ignored `blockchain/.cost-basis/` files, with user-reported provenance and a history checkpoint; the agent has no tool to write or invent it. Adding earlier history invalidates an incompatible checkpoint. Gas/outgoing balance changes retire cost proportionally without fabricating sale proceeds; untracked incoming ETH adds unknown basis. Ambiguous ordering or unverified receipts prevent complete P&L claims. Current RPC/price failures keep history readable and current mark-to-market unavailable.

Try: “When did I last trade?”, “What is my average ETH entry price?”, “Show my realized and unrealized P&L”, or “Use my recent trades, cost basis, news and current prices to assess my portfolio.” Restart the backend after deploying this update, then use **Sync history** for older records.

`get_market_news` and the dashboard's **News** panel share a You.com crypto news feed. Add `YDC_API_KEY` to the root `.env.local`, then restart the backend. Until configured, they return an explicit setup status; no articles are fabricated. The existing ZooWork model is retained, and a You.com MCP connection is not required for this direct REST integration.

Select All crypto, Bitcoin, Ethereum, Base, DeFi, Stablecoins, or Security, with a day/week window. The panel refreshes every two minutes while visible. **Analyze news** and article **Discuss** buttons fill the agent input; click Send to request analysis. The agent uses cited news alongside fresh balances and quotes when discussing a user-requested trade. News never signs or authorizes a transaction, changes risk limits, or replaces manual Trust Wallet approval.

Example prompts: “Summarize Ethereum news relevant to my ETH/USDC portfolio” or “Assess the latest Ethereum news and whether swapping 0.001 ETH to USDC fits my request. Explain the risks and prepare a proposal for my review if appropriate.” Headlines and search excerpts are reported evidence, not verified full-article readings or price forecasts. Unknown source dates and cached/outage states are disclosed.

Implementation choices ([You.com Search reference](https://you.com/docs/api-reference/search/v1-search)):

| Decision | Choice | Why | Status |
| --- | --- | --- | --- |
| Transport | Backend `POST https://ydc-index.io/v1/search` | Existing TypeScript host can call REST directly | Decided |
| Credentials | `YDC_API_KEY` in root `.env.local`; server-side only | No key in tool arguments, browser code or logs | Operator will add key; live verification pending |
| Model-controlled fields | `topic` enum and `freshness: day/week` only | Host controls queries, source domains and request size | Decided |
| Retrieval | 10 results, English, financial/crypto/official-project source allowlist, highlights capped at 1,024 tokens | Bounded, attributable evidence | Defaulted |
| Refresh and budget | Shared 120-second cache, one concurrent request per topic/window, 60 provider requests per backend/hour | Dashboard and agent reuse results and bound consumption | Defaulted |
| Failure behavior | 15-second provider timeout; failure cooldown ≥30 seconds; cached fallback ≤15 minutes, labeled stale | Outages cannot masquerade as fresh reporting | Defaulted |
| Trade behavior | Existing validation, exact user-selected amounts, execution flags and wallet approval | News informs proposals without granting transaction permission | Decided |

`blockchain/market-news.mts` owns retrieval, normalization and caching. `POST /api/market-news` serves the dashboard. The provider's `page_age` is labeled a source date and may represent an update rather than publication; results without it remain explicitly undated. There is no push stream, sentiment-scoring engine or autonomous news-triggered execution. Acceptance coverage uses provider fixtures for citations, deduplication, dates, unsafe URLs, cache/in-flight reuse, missing credentials, outages, budgets and wallet-free tool dispatch. Live provider and hosted-agent behavior must be checked after the key is configured.

The agent exposes `get_portfolio`, `analyze_portfolio`, `calculate_swap`, `quote_swap`, `propose_rebalance`, `validate_swap`, `prepare_trade`, and `get_trade_status`. Dashboard tool calls inherit the active wallet and selected network; mismatched inputs are rejected. Wallet-specific CLI calls require wallet/network inputs; quote calculations require a network but no wallet. Old `*_sepolia_*` tool names remain bound to Sepolia and are rejected under a different dashboard network. SDK 0.14.0 is retained; the agent uses documented lifecycle, cursor streaming, custom-tool declaration and resolution methods. Dashboard context and question are sent in one `user.message`: live checks found the deployment's `system.message` write returns HTTP 502. Delivery keys persist for safe retries.

Run `node --experimental-strip-types --test agent/tests/*.test.mts client/tests/*.test.mts blockchain/*.test.mts` from the root. The TypeScript check and dashboard build cover the integration. Context tests cover wallet defaults, account/network changes, disconnects, stale inputs and CLI behavior. Base tests mock RPC and prices, including both directions, approvals, fee oracle calls, wrong-chain rejection, price/gas limits, default execution lock, receipt logs and resulting balances. No real-money transaction has been submitted by this coding agent. Live RPC/market verification and a fork integration test must be distinguished from these offline tests.

Verified deployment sources: [Uniswap Base](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments), [Uniswap Ethereum](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments), [Circle USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses), [Base network details](https://docs.base.org/get-started/connect-to-base), [CoinGecko Demo](https://docs.coingecko.com/demo/reference/simple-price).

Mobile QR pairing now requires the selected network explicitly (for example, Base 8453), with `eth_sendTransaction`. A restored session that only approves another network is disconnected before requesting a fresh pairing. “Pair again for Base Mainnet” lets the user explicitly replace an old mainnet-only session. A wallet returning different-chain permissions is rejected; valid sessions for the selected chain are reused. Changing networks never authorizes a transaction.
# XDC AI wallet (read-only)

For headless XDC AI access, create an API key in the XDC AI account dashboard. Enter it in the dashboard XDC AI wallet card to verify and connect it for the current backend session. It is held in backend memory and must be re-entered after restart. Alternatively, put `XDC_AI_API_KEY=xdcai_...` in the root `.env.local` to load it on startup. Disconnect disables either source until a dashboard reconnect or backend restart; it does not revoke the key at XDC AI. Keep it private: XDC AI keys may also carry payment permissions, although this application exposes only wallet reads and marketplace discovery. Restart the backend after changing the file. Ask the agent “What is my XDC AI wallet balance?” or “Find DeFi services in the XDC AI marketplace.” The XDC AI account is separate from the connected Base wallet. This integration does not add XDC to the network selector, transfer funds, pay for services, or execute XDC trades.
