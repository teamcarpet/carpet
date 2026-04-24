// src/bubble/data/transformer.js
// Converts raw fetcher output into { nodes, links } ready for d3-force.
//
// Node size scales with bps of supply (sqrt for visual comfort).
// Links aggregate multiple transfers between the same pair of addresses.

const MIN_RADIUS = 6;
const MAX_RADIUS = 48;

/**
 * @param {object} raw — output of fetchBubbleData
 * @returns {{ nodes: Array, links: Array, meta: object }}
 */
export function buildGraph(raw) {
  const { holders, edges, labels, totalSupply } = raw;

  // Union of addresses that should appear as nodes:
  //   top-N holders + any address seen in edges
  const nodeMap = new Map();

  // Seed nodes from holders (they carry bps).
  for (const h of holders) {
    nodeMap.set(h.address, {
      id: h.address,
      address: h.address,
      bps: h.bps,
      amount: h.amount,
      uiAmount: h.uiAmount,
      category: labels[h.address]?.category || 'wallet',
      label: labels[h.address]?.name || null,
    });
  }
  // Add any edge endpoints not yet in map (bps=0, they're transient senders/receivers).
  for (const e of edges) {
    for (const addr of [e.from, e.to]) {
      if (!addr || nodeMap.has(addr)) continue;
      nodeMap.set(addr, {
        id: addr,
        address: addr,
        bps: 0,
        amount: 0,
        uiAmount: 0,
        category: labels[addr]?.category || 'wallet',
        label: labels[addr]?.name || null,
      });
    }
  }

  // Compute radius using square-root scaling on bps.
  // Sqrt compresses the outliers so one whale doesn't swallow the screen.
  const bpsValues = [...nodeMap.values()].map(n => n.bps);
  const maxBps = Math.max(1, ...bpsValues);
  for (const n of nodeMap.values()) {
    const t = n.bps / maxBps;                       // 0..1
    n.radius = MIN_RADIUS + Math.sqrt(t) * (MAX_RADIUS - MIN_RADIUS);
  }

  // Aggregate edges: one link per (from,to) pair with summed amount + count.
  const linkMap = new Map();
  for (const e of edges) {
    if (!e.from || !e.to || e.from === e.to) continue;
    const key = `${e.from}→${e.to}`;
    const existing = linkMap.get(key);
    if (existing) {
      existing.amount += e.amount;
      existing.count  += 1;
      if (e.blockTime && e.blockTime > existing.lastBlockTime) {
        existing.lastBlockTime = e.blockTime;
        existing.lastSignature = e.signature;
      }
    } else {
      linkMap.set(key, {
        source: e.from,
        target: e.to,
        amount: e.amount,
        count: 1,
        lastBlockTime: e.blockTime || 0,
        lastSignature: e.signature,
      });
    }
  }

  // Link width uses log(amount). Cap at a reasonable max.
  const links = [...linkMap.values()];
  const maxAmount = Math.max(1, ...links.map(l => l.amount));
  for (const l of links) {
    const t = Math.log(1 + l.amount) / Math.log(1 + maxAmount);
    l.width = 0.5 + t * 3;   // 0.5..3.5 px
    l.opacity = 0.25 + t * 0.55;
  }

  return {
    nodes: [...nodeMap.values()],
    links,
    meta: {
      totalSupply,
      holderCount: holders.length,
      nodeCount: nodeMap.size,
      linkCount: links.length,
      fetchedAt: raw.fetchedAt,
    },
  };
}

/**
 * Build the "flows" summary for a single node — used by the info panel.
 * @param {string} address
 * @param {Array} links — output of buildGraph.links
 * @returns {{ inflows, outflows, totalIn, totalOut }}
 */
export function buildNodeFlows(address, links) {
  const inflows = [];
  const outflows = [];
  let totalIn = 0, totalOut = 0;
  for (const l of links) {
    if (l.target === address || l.target.id === address) {
      inflows.push(l);
      totalIn += l.amount;
    } else if (l.source === address || l.source.id === address) {
      outflows.push(l);
      totalOut += l.amount;
    }
  }
  inflows.sort((a, b) => b.amount - a.amount);
  outflows.sort((a, b) => b.amount - a.amount);
  return { inflows, outflows, totalIn, totalOut };
}
