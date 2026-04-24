// src/bubble/render/forces.js
// d3-force simulation tuned for token holder graphs.
//
// Key parameters:
// - charge: repulsion scaled by radius squared → bigger nodes push harder
// - collide: hard collision at radius + 2px padding → no overlaps
// - link: distance grows with combined radii + log(amount) → high-volume pairs pull closer
// - center: gentle gravity toward origin
// - alpha decay set slow so the graph keeps settling as user interacts

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3-force@3/+esm';

export function createSimulation(nodes, links, { onTick } = {}) {
  const sim = d3.forceSimulation(nodes)
    .force('charge',  d3.forceManyBody().strength(n => -30 - n.radius * 8))
    .force('collide', d3.forceCollide().radius(n => n.radius + 2).iterations(2))
    .force('link',    d3.forceLink(links)
      .id(n => n.id)
      .distance(l => {
        const r = (l.source.radius || 10) + (l.target.radius || 10);
        return r + 60 - Math.min(40, Math.log10(1 + l.amount) * 4);
      })
      .strength(0.35)
    )
    .force('x', d3.forceX(0).strength(0.04))
    .force('y', d3.forceY(0).strength(0.04))
    .alphaDecay(0.015)
    .velocityDecay(0.4);

  if (onTick) sim.on('tick', onTick);
  return sim;
}

// Gently reheat the sim — called after pan/zoom or node drag.
export function reheat(sim, alpha = 0.3) {
  sim.alpha(alpha).restart();
}
