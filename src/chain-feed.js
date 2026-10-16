// Fallback token feed read straight from the program when the indexer API is
// unreachable. Returns rows shaped like the indexer's /tokens response so they
// go through the same mergeIndexedTokens() path.

import { PublicKey } from '@solana/web3.js';
import { getConnection, getReadOnlyProgram } from './launchpad.js';

const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const LAMPORTS_PER_SOL = 1e9;

function metadataPda(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  )[0];
}

// Metaplex Metadata: key(1) update_authority(32) mint(32) name(4+32) symbol(4+10) uri(4+200)
function readBorshString(data, offset) {
  const len = data.readUInt32LE(offset);
  const raw = data.subarray(offset + 4, offset + 4 + len).toString('utf8');
  return { value: raw.replace(/\0/g, '').trim(), next: offset + 4 + len };
}

function parseMetadata(data) {
  if (!data || data.length < 70) return {};
  try {
    const name = readBorshString(data, 65);
    const symbol = readBorshString(data, name.next);
    return { name: name.value, ticker: symbol.value };
  } catch { return {}; }
}

export async function fetchChainTokens() {
  const program = getReadOnlyProgram();
  const [bonding, presale] = await Promise.all([
    program.account.bondingCurvePool.all(),
    program.account.presalePool.all().catch(() => []),
  ]);
  const pools = [
    ...bonding.map(p => ({ ...p, poolType: 'bonding' })),
    ...presale.map(p => ({ ...p, poolType: 'presale' })),
  ];
  if (!pools.length) return [];

  const conn = getConnection();
  const metas = [];
  for (let i = 0; i < pools.length; i += 100) {
    const batch = pools.slice(i, i + 100).map(p => metadataPda(p.account.mint));
    metas.push(...await conn.getMultipleAccountsInfo(batch));
  }

  return pools.map((p, i) => {
    const a = p.account;
    const meta = parseMetadata(metas[i]?.data);
    const raised = Number(a.realSolReserves ?? a.currentRaised ?? 0);
    const target = Number(a.migrationTarget ?? 0);
    return {
      mint: a.mint.toBase58(),
      // Tokens launched without Metaplex metadata still need something to show.
      name: meta.name || 'Unnamed token',
      ticker: meta.ticker || a.mint.toBase58().slice(0, 4).toUpperCase(),
      creator: a.creator.toBase58(),
      poolType: p.poolType,
      poolAddress: p.publicKey.toBase58(),
      isMigrated: Boolean(a.isMigrated),
      prog: target ? Math.min(100, Math.round((raised / target) * 1000) / 10) : 0,
      raisedSol: raised / LAMPORTS_PER_SOL,
    };
  });
}
