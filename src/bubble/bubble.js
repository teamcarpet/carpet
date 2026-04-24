// src/bubble/bubble.js
// Entry point for the Bubble Map feature.
// Public API:
//   - mountBubbleView(container) — mounts the search view inside container,
//     transparently swaps to graph view on token pick, and restores on back.
//   - unmountBubbleView(container) — cleans everything up.
//
// Usage from main.js:
//   import { mountBubbleView } from './bubble/bubble.js';
//   setView('bubble') → mountBubbleView(document.getElementById('bubble-view'));

import { SearchView } from './search-view.js';
import { GraphView }  from './graph-view.js';

let current = null;  // either SearchView or GraphView
let hostEl  = null;

export function mountBubbleView(container) {
  hostEl = container;
  container.innerHTML = '';        // reset any legacy markup
  container.classList.add('bm-root');
  _showSearch();
}

export function unmountBubbleView() {
  if (current?.destroy) current.destroy();
  current = null;
  if (hostEl) {
    hostEl.innerHTML = '';
    hostEl.classList.remove('bm-root');
    hostEl = null;
  }
}

function _showSearch() {
  if (current?.destroy) current.destroy();
  current = new SearchView(hostEl, {
    onPick: (mint) => _showGraph(mint),
  });
}

function _showGraph(mint) {
  if (current?.destroy) current.destroy();
  current = new GraphView(hostEl, {
    mint,
    onBack: () => _showSearch(),
  });
}
