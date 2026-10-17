// src/pages/docs.js
// "How we protect" (guarantee cards that open a detail sheet) and the Docs
// page (sticky table of contents + long-form sections with scrollspy).
// Every number here mirrors contracts/programs/launchpad — keep them in sync.

import { CONFIG } from '../config.js';
import { solscanAccountUrl } from '../launchpad.js';

const PROGRAM_ID = CONFIG.LAUNCHPAD.programId;
const NETWORK = (CONFIG.LAUNCHPAD.cluster || 'devnet').toUpperCase();

const code = (s) => `<code class="dc-code">${s}</code>`;
const ico = (name) => `<iconify-icon icon="solar:${name}"></iconify-icon>`;

// ── Guarantees ───────────────────────────────────────────────────────────

const GUARANTEES = [
  {
    id: 'supply', n: '01', tag: 'Supply', icon: 'lock-keyhole-minimalistic-linear',
    title: 'Fixed supply',
    short: 'Mint authority is revoked in the same transaction that creates the token. Supply can never grow.',
    lead: 'Every CARPET token has exactly 1,000,000,000 units, minted once, straight into the pool vault. In the same instruction the program sets the mint authority to nobody.',
    points: [
      'The whole supply is minted to a program-owned vault — the creator never holds it.',
      'Mint authority is set to <b>None</b>, then re-checked. If it is still set, the launch reverts.',
      'There is no instruction in the program that can mint again. Not for the creator, not for the team.',
    ],
    enforced: 'create_bonding_pool · create_presale_pool',
    verify: 'Open the token mint on Solscan and check that <b>Mint Authority</b> is empty.',
    doc: 'guarantees',
  },
  {
    id: 'freeze', n: '02', tag: 'Custody', icon: 'snowflake-linear',
    title: 'No freeze authority',
    short: 'Launches are rejected unless the mint has no freeze authority. Nobody can lock tokens in your wallet.',
    lead: 'A freeze authority lets its holder stop any wallet from moving a token. It is the classic honeypot switch, so the program refuses to launch a mint that has one.',
    points: [
      'The mint must arrive with freeze authority already empty — otherwise the launch fails with MintFreezable.',
      'The check runs again after setup, so it cannot be re-added mid-transaction.',
      'Your tokens stay transferable and sellable on any venue, forever.',
    ],
    enforced: 'create_bonding_pool · create_presale_pool',
    verify: 'On Solscan the mint shows <b>Freeze Authority</b> as empty.',
    doc: 'guarantees',
  },
  {
    id: 'cap', n: '03', tag: 'Distribution', icon: 'pie-chart-2-linear',
    title: '1% wallet cap',
    short: 'Cumulative buys per wallet are capped at 1% of supply on the curve, and 1% of the target in presales.',
    lead: 'One wallet cannot sweep the curve at launch. The cap is tracked per wallet across all of its buys, not per transaction, so splitting an order does not get around it.',
    points: [
      'Bonding curve: total tokens bought by a wallet ≤ 1% of supply (10,000,000 tokens).',
      'Presale: total contribution by a wallet ≤ 1% of the raise target.',
      'Buys that would cross the cap revert with ExceedsMaxBuy / ExceedsMaxContribution.',
    ],
    note: 'A cap per wallet does not stop someone using many wallets. That is what the holder check on every token page is for.',
    enforced: 'buy_bonding · contribute_presale',
    verify: 'Try to buy more than 1% of supply from one wallet — the transaction is rejected by the program.',
    doc: 'trading',
  },
  {
    id: 'burn', n: '04', tag: 'Deflation', icon: 'fire-linear',
    title: 'Sell tax funds buyback & burn',
    short: '24% of every sell on the curve goes to a treasury that buys back and burns the token after graduation.',
    lead: 'Selling into the curve pays a 24% tax. It never leaves the pool: it sits in the token’s own treasury and is spent buying the token back on Meteora once it graduates — and every token bought is burned in the same transaction.',
    points: [
      'The tax stays inside the pool’s SOL vault, tracked as the buyback treasury.',
      'After graduation the treasury buys in fixed slices (1% of the starting treasury per round).',
      'Bought tokens land in a program vault and are burned immediately. Nobody can take them.',
    ],
    enforced: 'sell_bonding · execute_buyback',
    verify: 'Every burn is listed on the Furnace page with its transaction.',
    doc: 'buyback',
  },
  {
    id: 'lp', n: '05', tag: 'Liquidity', icon: 'safe-square-linear',
    title: 'Liquidity locked forever',
    short: 'At graduation liquidity is seeded on Meteora and the LP position is held by the program. It can’t be pulled.',
    lead: 'When a token graduates, the program creates the Meteora DAMM v2 pool itself and keeps the LP position NFT in a program-derived account. There is no instruction that withdraws liquidity.',
    points: [
      'The LP position NFT is owned by a program PDA — not the creator, not the team.',
      'Anyone can trigger graduation once the target is hit, so no token waits on a single operator.',
      'Only trading fees can be claimed from it, and they are split on-chain (creator / protocol / keeper).',
      'Trading on the new pool opens ~1 minute after graduation (150 slots), so it can’t be sniped in the block it is created.',
    ],
    enforced: 'migrate_bonding · migrate_presale · claim_lp_fees',
    verify: 'The Meteora pool’s position owner is the program’s lp_custody account.',
    doc: 'graduation',
  },
  {
    id: 'check', n: '06', tag: 'Transparency', icon: 'eye-scan-linear',
    title: 'Every token is checked',
    short: 'Creator history, snipers, bundles and wallets funded from the same source — on every token page.',
    lead: 'Contract rules can’t judge people. So every token page runs a holder check and shows the creator’s track record before you buy.',
    points: [
      '<b>Creator history</b> — how many tokens they launched and how many graduated.',
      '<b>Snipers & bundles</b> — wallets that bought in the first blocks or in the same slot.',
      '<b>Linked wallets</b> — holders funded from the same source wallet, grouped together.',
    ],
    enforced: 'CARPET indexer · token page insights',
    verify: 'Open any token and scroll to Safety and Holder check.',
    doc: 'risk-check',
  },
];

const TEAM_CANNOT = [
  'Mint new tokens or change supply',
  'Freeze, seize or move tokens in your wallet',
  'Withdraw graduated liquidity',
  'Spend a token’s buyback treasury on anything but buyback-and-burn',
  'Raise the sell tax above 24%',
  'Raise any trading, presale or graduation fee above 5%',
];
const TEAM_CAN = [
  'Pause trading and new launches, platform-wide or on one pool. Refunds and claims keep working while paused — pausing never blocks your way out.',
  'Adjust fees, only within the hard caps written into the program.',
  `Upgrade the program while on ${NETWORK === 'MAINNET' ? 'mainnet beta' : 'devnet'}. Upgrades are public on-chain.`,
];

export function protect(el) {
  const cards = GUARANTEES.map((g) => `
    <button class="pr-card" data-guarantee="${g.id}" aria-haspopup="dialog">
      <div class="pr-top"><span class="pr-n">${g.n}</span><span class="pr-tag">${g.tag}</span></div>
      <span class="pr-ico">${ico(g.icon)}</span>
      <h3>${g.title}</h3>
      <p>${g.short}</p>
      <div class="pr-foot"><span class="pr-src">${g.enforced.split(' · ')[0]}</span><span class="pr-more">Details ${ico('arrow-right-linear')}</span></div>
    </button>`).join('');

  el.innerHTML = `
    <section class="pg-hero">
      <div class="pg-kicker">SAFETY MODEL</div>
      <h1 class="pg-title">How we <em>protect</em> you</h1>
      <p class="pg-sub">Six rules enforced by the CARPET program on every launch. Not policy, not promises — code that runs on-chain and that anyone can verify.</p>
    </section>
    <div class="pr-verify">
      <div class="pr-v-item"><span>Program</span><a href="${solscanAccountUrl(PROGRAM_ID)}" target="_blank" rel="noopener">${PROGRAM_ID.slice(0, 6)}…${PROGRAM_ID.slice(-6)} ${ico('arrow-right-up-linear')}</a></div>
      <div class="pr-v-item"><span>Network</span><b>${NETWORK}</b></div>
      <div class="pr-v-item"><span>Framework</span><b>Anchor · Meteora DAMM v2</b></div>
      <button class="pr-v-doc" data-doc="guarantees">${ico('book-2-linear')} Read the docs</button>
    </div>
    <div class="pr-grid">${cards}</div>
    <section class="pr-power">
      <div class="pr-power-head">
        <div class="pg-kicker">ADMIN POWERS</div>
        <h2>What the team can and can’t do</h2>
        <p>Every privileged action is listed here. Anything not on the right-hand list doesn’t exist in the program.</p>
      </div>
      <div class="pr-power-grid">
        <div class="pr-col no"><h4>${ico('close-circle-linear')} Cannot</h4><ul>${TEAM_CANNOT.map((t) => `<li>${t}</li>`).join('')}</ul></div>
        <div class="pr-col yes"><h4>${ico('info-circle-linear')} Can</h4><ul>${TEAM_CAN.map((t) => `<li>${t}</li>`).join('')}</ul></div>
      </div>
    </section>
    <div class="pr-cta">
      <button class="pg-btn" onclick="openLaunch()">+ Launch a token</button>
      <button class="pg-btn ghost" data-doc="overview">Read the docs</button>
    </div>`;
}

function guaranteeSheet(g) {
  return `
    <div class="gs-backdrop" data-close></div>
    <div class="gs-panel" role="dialog" aria-modal="true" aria-labelledby="gs-title">
      <button class="gs-x" data-close aria-label="Close">${ico('close-circle-linear')}</button>
      <div class="gs-kick"><span>${g.n}</span>${g.tag}</div>
      <div class="gs-head"><span class="pr-ico lg">${ico(g.icon)}</span><h2 id="gs-title">${g.title}</h2></div>
      <p class="gs-lead">${g.lead}</p>
      <div class="gs-sec">How it works</div>
      <ul class="gs-list">${g.points.map((p) => `<li>${p}</li>`).join('')}</ul>
      ${g.note ? `<div class="dc-call warn">${ico('danger-triangle-linear')}<p>${g.note}</p></div>` : ''}
      <div class="gs-grid">
        <div><div class="gs-sec">Enforced by</div><div class="gs-code">${g.enforced.split(' · ').map(code).join(' ')}</div></div>
        <div><div class="gs-sec">Verify it yourself</div><p class="gs-p">${g.verify}</p></div>
      </div>
      <div class="gs-actions">
        <button class="pg-btn" data-doc="${g.doc}">${ico('book-2-linear')} Read in docs</button>
        <a class="pg-btn ghost" href="${solscanAccountUrl(PROGRAM_ID)}" target="_blank" rel="noopener">View program</a>
      </div>
    </div>`;
}

let sheetEl = null;
function closeSheet() {
  if (!sheetEl) return;
  sheetEl.classList.remove('on');
  const el = sheetEl; sheetEl = null;
  setTimeout(() => el.remove(), 220);
  document.removeEventListener('keydown', onSheetKey);
}
function onSheetKey(e) { if (e.key === 'Escape') closeSheet(); }
function openSheet(id) {
  const g = GUARANTEES.find((x) => x.id === id);
  if (!g) return;
  closeSheet();
  sheetEl = document.createElement('div');
  sheetEl.className = 'gs';
  sheetEl.innerHTML = guaranteeSheet(g);
  document.body.appendChild(sheetEl);
  requestAnimationFrame(() => sheetEl?.classList.add('on'));
  sheetEl.querySelector('.gs-x').focus();
  document.addEventListener('keydown', onSheetKey);
  sheetEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closeSheet();
    const d = e.target.closest('[data-doc]');
    if (d) { closeSheet(); openDocs(d.dataset.doc); }
  });
}

// ── Docs ─────────────────────────────────────────────────────────────────

const flow = (parts) => `
  <div class="dc-flow">
    <div class="dc-flow-bar">${parts.map(([pct, , tone]) => `<span class="${tone}" style="flex:${pct}"></span>`).join('')}</div>
    <div class="dc-flow-legend">${parts.map(([pct, label, tone]) => `<div><i class="${tone}"></i><b>${pct}%</b><span>${label}</span></div>`).join('')}</div>
  </div>`;
const steps = (items) => `<ol class="dc-steps">${items.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ol>`;
const call = (tone, icon, html) => `<div class="dc-call ${tone}">${ico(icon)}<p>${html}</p></div>`;
const table = (head, rows) => `
  <div class="dc-table"><table>
    <thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
const cards = (items) => `<div class="dc-cards">${items.map(([icon, t, d, link]) => `
  <button class="dc-card" ${link ? `data-doc="${link}"` : ''}>${ico(icon)}<b>${t}</b><span>${d}</span></button>`).join('')}</div>`;
const faq = (items) => `<div class="dc-faq">${items.map(([q, a]) => `<details><summary>${q}${ico('alt-arrow-down-linear')}</summary><p>${a}</p></details>`).join('')}</div>`;

const DOCS = [
  { group: 'Getting started', items: [
    { id: 'overview', title: 'What is CARPET', body: `
      <p class="dc-lead">CARPET is a Solana launchpad. Anyone can launch a token in under a minute; every launch follows the same on-chain rules, and every token that reaches its target graduates to a real Meteora pool with locked liquidity.</p>
      <p>Two things make it different from a typical launchpad. First, the safety rules — fixed supply, no freeze, a 1% wallet cap and locked liquidity — are enforced by the program, not by moderation. Second, selling into the curve funds that token’s own buyback treasury, which buys and burns the token after it graduates.</p>
      ${cards([
        ['rocket-2-linear', 'Launch a token', 'Bonding curve or presale, in two steps.', 'bonding'],
        ['chart-2-linear', 'Trade', 'Buy and sell on the curve, then on Meteora.', 'trading'],
        ['shield-check-linear', 'Safety model', 'What the program guarantees.', 'guarantees'],
        ['hand-money-linear', 'Earn as a creator', 'Fees from every trade, forever.', 'creator-rewards'],
      ])}
      ${call('info', 'info-circle-linear', `CARPET is currently live on <b>${NETWORK}</b>. Use a devnet wallet with test SOL while the program is in beta.`)}` },
    { id: 'quickstart', title: 'Quickstart', body: `
      <p>Buying your first token takes four steps.</p>
      ${steps([
        ['Connect a wallet', 'Phantom, Solflare and Backpack are supported. Press Connect in the top right.'],
        ['Pick a token', 'Browse Trending on Home or the Red Carpet — tokens closest to graduation.'],
        ['Check it', 'Read the Safety and Holder check cards on the token page before you buy.'],
        ['Buy', 'Enter an amount in SOL, review the slippage and confirm in your wallet.'],
      ])}
      ${call('tip', 'lightbulb-minimalistic-linear', 'Prices are shown in USD first. The SOL amount you pay is always shown next to it before you confirm.')}` },
    { id: 'modes', title: 'Launch modes', body: `
      <p>Every token starts in one of two modes. The mode is chosen at launch and can’t be changed.</p>
      ${table(['', 'Bonding curve', 'Presale'], [
        ['Price discovery', 'Continuous — price rises with every buy', 'Fixed — everyone gets the same price'],
        ['Selling before graduation', 'Yes, with 24% sell tax', 'No — refund if the target is missed'],
        ['Target', '100 SOL', '100 – 10,000 SOL, set by creator'],
        ['Creator allocation', 'None', 'Up to 50% of supply (20% default)'],
        ['After graduation', 'Meteora pool + buyback', 'Meteora pool + scheduled buyback'],
      ])}` },
  ] },
  { group: 'Launching', items: [
    { id: 'bonding', title: 'Bonding curve launch', body: `
      <p>A bonding curve is a pricing formula that sells tokens straight from a pool. CARPET uses a constant-product curve with virtual reserves — the same model pump.fun popularised — so price rises smoothly as SOL comes in.</p>
      ${table(['Parameter', 'Value'], [
        ['Total supply', '1,000,000,000 tokens (6 decimals)'],
        ['Virtual SOL reserve', '30 SOL'],
        ['Graduation target', '100 SOL raised in the curve'],
        ['Max per wallet', '1% of supply, cumulative'],
        ['Creator pre-mine', 'None — the creator buys on the curve like everyone else'],
      ])}
      <h3>How a launch works</h3>
      ${steps([
        ['Fill in identity', 'Name, ticker, image and socials. The image and metadata are pinned to IPFS.'],
        ['Sign once', 'One transaction mints the supply into the pool vault and revokes mint authority.'],
        ['Trading opens', 'The token appears in New immediately and anyone can buy.'],
        ['Graduate', 'At 100 SOL the curve closes and liquidity moves to Meteora.'],
      ])}` },
    { id: 'presale', title: 'Presale launch', body: `
      <p>A presale collects SOL up to a target before any trading starts. Everyone who joins gets tokens at the same price, pro-rata to what they put in.</p>
      ${table(['Parameter', 'Value'], [
        ['Raise target', '100 – 10,000 SOL'],
        ['Duration', 'Set by the creator (24 hours by default)'],
        ['Max per wallet', '1% of the target'],
        ['Entry fee', '1% of each contribution'],
        ['Creator allocation', '0 – 50% of supply (20% default), vesting linearly over 30 days from graduation'],
        ['Liquidity', '20% of SOL raised, paired at the presale price'],
      ])}
      <h3>If the target is reached</h3>
      <p>Anyone can trigger graduation. The SOL raised is split on-chain:</p>
      ${flow([[59, 'Buyback treasury', 'c1'], [20, 'Meteora liquidity', 'c2'], [20, 'Creator', 'c3'], [1, 'Platform', 'c4']])}
      <p>The pool opens at exactly the price contributors paid: the program seeds only as many tokens as that price needs and burns the rest of the 20% liquidity reserve. Contributors then claim their tokens from the Presales page.</p>
      <h3>If the target is missed</h3>
      <p>After the end time every contributor can refund their contribution in full from the same page. The 1% entry fee is not refunded.</p>
      <h3>Buyback schedule</h3>
      <p>The creator picks the schedule at launch:</p>
      ${table(['Mode', 'Rounds', 'Each round', 'Duration'], [
        ['Regular', '6', '⅙ of the treasury, every 4 h', '24 hours'],
        ['Extreme', '12', '1⁄12 of the treasury, every 30 min', '6 hours'],
      ])}` },
    { id: 'checklist', title: 'Before you launch', body: `
      <ul class="dc-check">
        <li>Use a square image, at least 512 × 512 — PNG, JPG, GIF or WEBP up to 4 MB.</li>
        <li>Tickers are up to 8 characters, names up to 32.</li>
        <li>Add your X and Telegram links — buyers check them before anything else.</li>
        <li>Keep a little SOL for Solana rent and network fees on top of your first buy.</li>
        <li>Name, ticker and image are permanent once launched — check them twice.</li>
      </ul>` },
  ] },
  { group: 'Trading', items: [
    { id: 'trading', title: 'Buying and selling', body: `
      <p>On the curve you trade against the pool, not another person, so there is always liquidity. Every trade is a single transaction signed by your wallet.</p>
      ${table(['', 'Buy', 'Sell'], [
        ['Creator fee', '0.5%', '0.5%'],
        ['Platform fee', '0.5%', '0.5%'],
        ['Buyback tax', '—', '24%'],
        ['<b>Total</b>', '<b>1%</b>', '<b>25%</b>'],
      ])}
      ${call('warn', 'danger-triangle-linear', 'Selling on the curve is expensive by design: the 24% tax rewards holders who stay to graduation. After graduation there is no sell tax — only Meteora pool fees.')}
      <h3>Slippage</h3>
      <p>Every buy and sell carries a minimum amount out. If the price moves past your slippage before the transaction lands, the program rejects it and you keep your funds. The default is 3%.</p>` },
    { id: 'graduation', title: 'Graduation', body: `
      <p>When a bonding curve reaches 100 SOL it closes for good and the token moves to an open market on Meteora DAMM v2. Curve proceeds are split on-chain:</p>
      ${flow([[80, 'Meteora liquidity', 'c2'], [19, 'Buyback treasury', 'c1'], [1, 'Platform', 'c4']])}
      <p>All sell tax collected on the curve is added to the buyback treasury on top of its 19% share.</p>
      <p>The Meteora pool opens at the same price the curve ended on, so nobody who bought late is underwater the moment it graduates.</p>
      ${steps([
        ['Pool is created', 'The program creates the Meteora pool with 80% of the SOL and exactly enough tokens to open at the curve’s last price. Leftover tokens are burned.'],
        ['LP is locked', 'The position NFT is held by a program account. There is no withdraw instruction.'],
        ['Fair start', 'Trading opens 150 slots (~1 minute) later, so the pool can’t be sniped in the block it is created.'],
        ['Buyback starts', 'The treasury begins buying and burning the token on the new pool.'],
      ])}` },
  ] },
  { group: 'Economics', items: [
    { id: 'fees', title: 'Fees', body: `
      <p>All fees are set in the program’s global config and capped in code. Current values:</p>
      ${table(['Action', 'Fee', 'Goes to', 'Hard cap'], [
        ['Buy on curve', '1%', '0.5% creator · 0.5% platform', '5% each'],
        ['Sell on curve', '1% + 24% tax', 'creator · platform · buyback', 'Tax ≤ 24%'],
        ['Presale contribution', '1%', 'Platform', '5%'],
        ['Graduation', '1% of SOL raised', 'Platform', '5%'],
        ['Meteora trading (after)', 'Pool fee', '70% creator · 29.5% protocol · 0.5% keeper', '—'],
        ['Launching', 'Free', 'You pay only Solana rent', '—'],
      ])}` },
    { id: 'buyback', title: 'Buyback & burn', body: `
      <p>Each graduated token has its own treasury, held by the program. It can be spent one way only: buying the token on its Meteora pool and burning what it buys, in the same transaction.</p>
      ${table(['', 'Bonding tokens', 'Presale tokens'], [
        ['Funded by', '24% sell tax + 19% of curve SOL', '59% of SOL raised'],
        ['Round size', '1% of starting treasury', 'Equal slices — the whole treasury is spent'],
        ['Cadence', 'Rounds at least ~4 s apart, run by the keeper', 'Every 4 h or 30 min'],
        ['Tokens bought', 'Burned', 'Burned'],
      ])}
      <p>Rounds are fixed slices of the starting treasury, so every round buys the same SOL amount instead of shrinking over time. Every burn shows up on the Furnace page with a link to its transaction.</p>` },
    { id: 'creator-rewards', title: 'Creator rewards', body: `
      <p>Creators earn from their token for as long as it trades.</p>
      ${cards([
        ['graph-up-linear', '0.5% of every trade', 'Paid to your wallet in the same transaction, on the curve.'],
        ['water-linear', '70% of LP fees', 'After graduation, from the locked Meteora position.'],
        ['gift-linear', 'Presale allocation', '20% of SOL raised, plus your tokens vesting over 30 days.'],
      ])}
      <p>Claim LP fees and presale allocations from the Rewards page. The Creators leaderboard ranks creators by graduations and volume.</p>` },
  ] },
  { group: 'Safety', items: [
    { id: 'guarantees', title: 'On-chain guarantees', body: `
      <p>These rules are checked by the program on every launch. A transaction that breaks any of them is rejected.</p>
      <div class="dc-guar">${GUARANTEES.slice(0, 5).map((g) => `
        <button class="dc-guar-row" data-guarantee="${g.id}">
          <span class="pr-ico">${ico(g.icon)}</span>
          <span><b>${g.title}</b><small>${g.short}</small></span>
          ${code(g.enforced.split(' · ')[0])}
        </button>`).join('')}</div>` },
    { id: 'admin', title: 'Admin powers', body: `
      <p>The program has an admin key and a separate pause key. Their powers are deliberately narrow.</p>
      <div class="pr-power-grid">
        <div class="pr-col no"><h4>${ico('close-circle-linear')} Cannot</h4><ul>${TEAM_CANNOT.map((t) => `<li>${t}</li>`).join('')}</ul></div>
        <div class="pr-col yes"><h4>${ico('info-circle-linear')} Can</h4><ul>${TEAM_CAN.map((t) => `<li>${t}</li>`).join('')}</ul></div>
      </div>
      <p>Admin rotation is two-step: a new admin must be proposed and then accept, so the key can’t be handed to a wrong address by mistake.</p>` },
    { id: 'risk-check', title: 'Reading a token page', body: `
      <p>The program guarantees the rules. It can’t guarantee a token is good. Before buying, read the insight cards on the token page:</p>
      ${table(['Card', 'What it tells you', 'Red flag'], [
        ['Verdict', 'One-line summary of all checks', '“Check before buying” or “High risk”'],
        ['Creator', 'Tokens launched and graduated by this wallet', 'Many launches, none graduated'],
        ['Snipers', 'Wallets that bought in the first blocks', 'Snipers holding a large share'],
        ['Bundles', 'Buys landed in the same slot', 'Several wallets bought together'],
        ['Linked wallets', 'Holders funded by the same source', 'One group holding >10%'],
      ])}
      ${call('warn', 'danger-triangle-linear', 'Memecoins are high risk. Only trade what you can afford to lose.')}` },
  ] },
  { group: 'Reference', items: [
    { id: 'contracts', title: 'Contracts', body: `
      ${table(['Name', 'Address'], [
        ['CARPET launchpad', `<a class="dc-addr" href="${solscanAccountUrl(PROGRAM_ID)}" target="_blank" rel="noopener">${PROGRAM_ID}</a>`],
        ['Meteora DAMM v2', `<a class="dc-addr" href="${solscanAccountUrl('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG')}" target="_blank" rel="noopener">cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG</a>`],
        ['Network', NETWORK],
      ])}
      <p>The program is written in Anchor. Per-token accounts are program-derived from the mint: ${code('bonding_pool')}, ${code('presale_pool')}, ${code('buyback')}, ${code('lp_custody')}.</p>` },
    { id: 'glossary', title: 'Glossary', body: `
      <dl class="dc-dl">
        <dt>Bonding curve</dt><dd>A pool that prices a token by formula; price rises as supply is bought.</dd>
        <dt>Graduation</dt><dd>The moment a token hits its target and moves to a Meteora pool.</dd>
        <dt>Mint authority</dt><dd>The key allowed to create new tokens. Revoked on every CARPET launch.</dd>
        <dt>Freeze authority</dt><dd>The key allowed to lock a wallet’s tokens. Must be empty to launch.</dd>
        <dt>LP position</dt><dd>Ownership of a liquidity pool deposit. Held by the program, never withdrawn.</dd>
        <dt>Buyback treasury</dt><dd>SOL owned by a token’s pool, spent only on buying and burning it.</dd>
        <dt>Keeper</dt><dd>An automated wallet that runs buybacks and fee harvests on schedule.</dd>
        <dt>Slippage</dt><dd>How far price may move before your trade is rejected.</dd>
      </dl>` },
    { id: 'faq', title: 'FAQ', body: faq([
      ['Is launching free?', 'Yes. There is no launch fee — you only pay Solana rent for the new token accounts and the network fee.'],
      ['Why is the sell tax 24%?', 'It turns early sellers into fuel for holders: every sell funds the token’s buyback treasury, which buys and burns after graduation. Once a token graduates there is no sell tax.'],
      ['Can a creator rug?', 'They can’t mint, freeze or pull liquidity — the program doesn’t allow it. They can still sell their own tokens like anyone else, which is why the holder check exists.'],
      ['What happens to my presale SOL if it fails?', 'If the target isn’t reached by the end time, you refund your contribution in full from the Presales page. Only the 1% entry fee is kept.'],
      ['Where do I see burns?', 'On the Furnace page — every buyback, the amount burned and the transaction.'],
      ['Can I trade a graduated token elsewhere?', 'Yes. It’s a standard SPL token in a Meteora pool, so Jupiter and any Solana wallet can trade it.'],
    ]) },
  ] },
];

const FLAT = DOCS.flatMap((g) => g.items.map((it) => ({ ...it, group: g.group })));
let pendingSection = null;
let spy = null;

export function docs(el) {
  const toc = DOCS.map((g) => `
    <div class="dc-toc-g"><div class="dc-toc-h">${g.group}</div>
      ${g.items.map((it) => `<a href="#${it.id}" class="dc-toc-a" data-doc="${it.id}">${it.title}</a>`).join('')}
    </div>`).join('');
  const sections = FLAT.map((it) => `
      <section class="dc-sec" id="doc-${it.id}" data-sec="${it.id}">
        <div class="dc-eyebrow">${it.group}</div>
        <h2>${it.title}</h2>
        ${it.body}
      </section>`).join('');

  el.innerHTML = `
    <section class="pg-hero dc-hero">
      <div class="pg-kicker">DOCUMENTATION</div>
      <h1 class="pg-title">CARPET <em>docs</em></h1>
      <p class="pg-sub">How launches, trading, graduation and buybacks work — with every number taken straight from the program.</p>
      <div class="dc-search">${ico('magnifer-linear')}<input type="search" placeholder="Search the docs" aria-label="Search the docs"><kbd>/</kbd></div>
    </section>
    <div class="dc-layout">
      <nav class="dc-toc" aria-label="Docs">${toc}</nav>
      <article class="dc-body">${sections}<div class="dc-none" hidden>No sections match your search.</div></article>
    </div>`;

  delete el.dataset.activeDoc;
  bindDocs(el);
  const target = pendingSection || (location.hash && location.hash.slice(1));
  pendingSection = null;
  if (target && FLAT.some((x) => x.id === target)) {
    // Stop the browser restoring an old scroll position over the deep link.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    setTimeout(() => scrollToSection(el, target, false), 60);
  }
}

function scrollToSection(root, id, smooth = true) {
  const sec = root.querySelector(`#doc-${id}`);
  if (!sec) return;
  const y = sec.getBoundingClientRect().top + window.scrollY - stickyOffset(root);
  const scroller = document.scrollingElement;
  scroller.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' });
  history.replaceState(null, '', `?view=docs#${id}`);
  setActive(root, id);
}
// Header height differs between desktop and the two-row mobile header; on
// mobile the TOC is a sticky chip row under it.
function stickyOffset(root) {
  const hdr = document.getElementById('hdr')?.getBoundingClientRect().height || 60;
  const toc = window.innerWidth <= 768 ? root.querySelector('.dc-toc')?.getBoundingClientRect().height || 0 : 0;
  return hdr + toc + 20;
}
function setActive(root, id) {
  if (!id || root.dataset.activeDoc === id) return;
  root.dataset.activeDoc = id;
  root.querySelectorAll('.dc-toc-a').forEach((a) => {
    const on = a.dataset.doc === id;
    a.classList.toggle('on', on);
    if (on && window.innerWidth <= 768) a.parentElement.parentElement.scrollTo({ left: a.offsetLeft - 16, behavior: 'smooth' });
  });
}

function bindDocs(root) {
  root.style.setProperty('--dc-top', `${document.getElementById('hdr')?.getBoundingClientRect().height || 60}px`);
  // Scrollspy: the active section is the last one whose top has passed the sticky header.
  if (spy) window.removeEventListener('scroll', spy);
  let ticking = false;
  spy = () => {
    if (!root.isConnected || root.dataset.page !== 'docs') { window.removeEventListener('scroll', spy); spy = null; return; }
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const line = stickyOffset(root) + 8;
      let cur = null;
      root.querySelectorAll('.dc-sec:not([hidden])').forEach((sec) => { if (sec.getBoundingClientRect().top <= line) cur = sec; });
      setActive(root, (cur || root.querySelector('.dc-sec:not([hidden])'))?.dataset.sec);
    });
  };
  window.addEventListener('scroll', spy, { passive: true });
  spy();

  const input = root.querySelector('.dc-search input');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let any = false;
    root.querySelectorAll('.dc-sec').forEach((s) => {
      const hit = !q || s.textContent.toLowerCase().includes(q);
      s.hidden = !hit; any ||= hit;
      root.querySelector(`.dc-toc-a[data-doc="${s.dataset.sec}"]`)?.classList.toggle('dim', !hit);
    });
    root.querySelector('.dc-none').hidden = any;
  });
  const onSlash = (e) => {
    if (!root.isConnected || root.dataset.page !== 'docs') return document.removeEventListener('keydown', onSlash);
    if (e.key === '/' && !/input|textarea/i.test(document.activeElement?.tagName)) { e.preventDefault(); input.focus(); }
  };
  document.addEventListener('keydown', onSlash);
}

// One delegated handler on the page container (bound once from pages.js).
export function handleDocsClick(e, root) {
  const g = e.target.closest('[data-guarantee]');
  if (g) { openSheet(g.dataset.guarantee); return true; }
  const d = e.target.closest('[data-doc]');
  if (d) {
    e.preventDefault();
    if (root.dataset.page === 'docs') scrollToSection(root, d.dataset.doc);
    else openDocs(d.dataset.doc);
    return true;
  }
  return false;
}

export function openDocs(section) {
  pendingSection = section || null;
  window.scrollTo(0, 0);
  window.setView?.('docs');
}
