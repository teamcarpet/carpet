export const CONFIG = {
  solanaRpc: import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  pinataJwt: import.meta.env.VITE_PINATA_JWT || '',
  pinataGateway: import.meta.env.VITE_PINATA_GATEWAY || 'https://gateway.pinata.cloud',
  livekitUrl: import.meta.env.VITE_LIVEKIT_URL || '',
  livekitApiKey: import.meta.env.VITE_LIVEKIT_API_KEY || '',
  wsServerUrl: import.meta.env.VITE_WS_SERVER_URL || 'ws://localhost:3001',
  jupiterApiUrl: import.meta.env.VITE_JUPITER_API_URL || 'https://quote-api.jup.ag/v6',
  platformName: import.meta.env.VITE_PLATFORM_NAME || 'CARPET',
  platformFeeBps: Number(import.meta.env.VITE_PLATFORM_FEE_BPS) || 100,
  feeWallet: import.meta.env.VITE_FEE_WALLET || '',

  // Well-known Solana token mints
  MINTS: {
    SOL:  'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    WIF:  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  },
};
