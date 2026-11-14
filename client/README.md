# Chainwise dashboard

History/performance uses `/api/performance`, with read-only receipt synchronization via `sync: true`. The opening-cost form writes only the user-entered price through `/api/opening-cost-basis`; the backend derives the wallet-scoped opening quantity/checkpoint. Changing wallet/network remounts the panel so prior account results cannot appear as the new account's history. P&L is before fees and expressed in USDC (test USDC on Sepolia); missing basis/current prices display unknown values.

Development: run the backend with `npm run server --prefix agent` from the project root, and Vite with `npm run dev --prefix client` in a separate terminal. Vite proxies `/api` to the backend PORT (default 3100), preserving the backend's CSRF checks for untrusted origins. For the built app, use http://localhost:3100/dashboard.

The News panel filters crypto financial coverage by topic and time window, displays linked search excerpts and provider source dates, and refreshes every two minutes while the tab is visible. It calls the local `/api/market-news` route; the You.com key remains on the backend. Analyze/Discuss shortcuts populate chat for user review and sending. Missing configuration, empty results, outages and cached coverage have distinct states.

See the root README. Run `npm install`, then `npm run build`; `agent/` serves `dist/` on http://localhost:3100. Root `.env.local` is used for the public WalletConnect project ID; backend API keys are never exposed as VITE variables.

`/` is the public-facing product landing page; `/dashboard` opens the portfolio, agent, and swap workspace. Both use the existing Vite SPA and backend fallback. ETH/USDC and network icons are local assets. Landing examples are illustrative, and agent prompt shortcuts populate the input without sending a request.

Network selector: Base Mainnet, Ethereum Mainnet, or Ethereum Sepolia. Proposals and history are filtered to the selected chain. Mainnet execution is locked by default on the backend; the UI cannot enable it. Every transaction requires manual Trust Wallet approval. Wallet sessions must authorize the specific chain, signing method and account.

Run permission tests with `node --experimental-strip-types --test tests/wallet-session.test.mts` on Node 22.6+. Browser wallet flows still need real-device verification.
