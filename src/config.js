export const CONFIG = {
  solanaRpc: import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  // Public RPC used for read-only data when the primary RPC rate-limits us.
  publicRpc: (import.meta.env.VITE_LAUNCHPAD_CLUSTER || 'devnet') === 'mainnet'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com',
  pinataGateway: import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud',
  livekitUrl: import.meta.env.VITE_LIVEKIT_URL || '',
  // Uploads + LiveKit tokens: same-origin /api (Vercel Functions in api/,
  // proxied to server/index.js in local dev). Secrets live only server-side.
  appServerUrl: import.meta.env.VITE_APP_SERVER_URL || '/api',
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  wsServerUrl: import.meta.env.VITE_WS_SERVER_URL || 'ws://localhost:3001',
  apiServerUrl: import.meta.env.VITE_API_SERVER_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000',
  jupiterApiUrl: import.meta.env.VITE_JUPITER_API_URL || 'https://lite-api.jup.ag/swap/v1',
  platformName: import.meta.env.VITE_PLATFORM_NAME || 'CARPET',
  platformFeeBps: Number(import.meta.env.VITE_PLATFORM_FEE_BPS) || 100,
  feeWallet: import.meta.env.VITE_FEE_WALLET || '',
  // Max price movement accepted between quote and execution (300 = 3%).
  slippageBps: Number(import.meta.env.VITE_SLIPPAGE_BPS) || 300,

  // Launchpad program
  LAUNCHPAD: {
    programId: import.meta.env.VITE_LAUNCHPAD_PROGRAM_ID || '2coG61UUvuEscPVsdrWY4Vj4E1QYMstajAuhXs5nsH3s',
    cluster: import.meta.env.VITE_LAUNCHPAD_CLUSTER || 'devnet',
    meteoraPoolConfig: import.meta.env.VITE_METEORA_POOL_CONFIG || '3KLdspUofc75aaEAJdBo1o6D6cyzXJVtGB8PgpWJEiaR',
  },

  // Well-known Solana token mints
  MINTS: {
    SOL:  'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    WIF:  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  },
};
