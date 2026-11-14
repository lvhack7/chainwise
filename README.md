
# Chainwise

**AI-Powered Crypto Intelligence & Portfolio Management**

Chainwise is an AI-powered crypto assistant that combines real-time market research, news sentiment analysis, XDC AI marketplace integration, portfolio analytics, and secure blockchain transactions.

By integrating **You.com** and **XDC AI**, our agent can retrieve fresh information directly from external sources, analyze market conditions, and provide data-driven insights through natural-language conversations.

## Key Features

### You.com — News & Sentiment Analysis
- Search the latest cryptocurrency and blockchain news using the You.com Search API.
- Retrieve fresh headlines, sources, and market developments directly within the AI agent.
- Analyze news sentiment to identify bullish, bearish, and mixed market signals.
- Combine recent news with portfolio data to provide contextual investment insights.

### XDC AI — Wallet & Marketplace Integration
- Connect an XDC AI wallet to retrieve account balances.
- Discover AI, DeFi, and blockchain services from the XDC AI Marketplace.
- Allow the agent to fetch current marketplace information on demand.
- Access XDC ecosystem information through natural-language queries.

### Portfolio Management & Trading
- Connect Trust Wallet using WalletConnect.
- Monitor ETH, USDC, and supported wallet assets.
- Analyze portfolio performance, transaction history, and realized/unrealized P&L.
- Calculate ETH/USDC swaps using Uniswap v3.
- Prepare and validate transactions with manual wallet approval.

## How It Works

Chainwise combines multiple data sources through a conversational AI agent:

1. **You.com API** — Retrieves current market news and information for AI-driven sentiment analysis.
2. **XDC AI API** — Provides wallet information and access to marketplace service discovery.
3. **Blockchain & Market APIs** — Supply wallet balances, token prices, and swap quotations.
4. **AI Agent** — Processes retrieved information and generates contextual responses, insights, and transaction proposals.

### Example Prompts

- "What's the latest Ethereum news? Is market sentiment bullish or bearish?"
- "Analyze my portfolio using recent news and market conditions."
- "What is my XDC AI wallet balance?"
- "Find DeFi services available on the XDC AI Marketplace."
- "How much USDC would I receive for swapping 0.01 ETH?"

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript |
| AI Agent | ZooWork SDK |
| News & Search | You.com Search API |
| Blockchain Ecosystem | XDC AI API |
| Blockchain Integration | viem, Uniswap v3 |
| Market Data | CoinGecko |
| Wallet Connection | Trust Wallet, WalletConnect |

## Getting Started

**Requirements:** Node.js 22.6+ and API credentials for the services you intend to use.

### Installation

```bash
cd agent && npm install
cd ../blockchain && npm install
cd ../client && npm install
npm run build

cd ../agent
npm run server
```

Open **http://localhost:3100** to access the application.

### Environment Variables

Create a `.env.local` file in the project root:

```env
YDC_API_KEY=your_you_com_api_key
XDC_AI_API_KEY=your_xdc_ai_api_key
ZOOWORK_API_KEY=your_agent_key
VITE_WALLETCONNECT_PROJECT_ID=your_project_id

BASE_RPC_URL=https://mainnet.base.org
COINGECKO_API_KEY=your_coingecko_api_key

ENABLE_BASE_MAINNET_EXECUTION=false
ENABLE_ETHEREUM_MAINNET_EXECUTION=false
MAX_TRADE_USD=100
MAX_GAS_USD=5
```

See `.env.example` for additional configuration options.

## Security

- All blockchain transactions require explicit wallet approval.
- Mainnet trading is disabled by default.
- Swap proposals undergo price, slippage, gas, and network validation.
- API credentials remain on the backend.
- XDC AI wallet integration is read-only; no XDC transfers or marketplace payments are executed.
- News sentiment is a qualitative AI assessment of retrieved sources, not a guaranteed market prediction.

## Vision

Chainwise aims to make decentralized finance more accessible through **AI-powered research, live market intelligence, and conversational blockchain interactions**.

By combining the search capabilities of **You.com** with the decentralized service ecosystem of **XDC AI**, Chainwise brings market information, portfolio insights, and blockchain functionality into a unified AI experience.
