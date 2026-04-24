// src/bubble/render/zoom.js
// d3-zoom glue for a Canvas-based graph.
//
// d3-zoom was built with SVG in mind but works perfectly with any element —
// we just read the resulting transform and push it into the Canvas renderer.

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3-zoom@3/+esm';
import { select } from 'https://cdn.jsdelivr.net/npm/d3-selection@3/+esm';
import 'https://cdn.jsdelivr.net/npm/d3-transition@3/+esm'; 

export function attachZoom(canvas, renderer) {
  const zoom = d3.zoom()
    .scaleExtent([0.2, 5])
    .filter(event => {
      // Allow wheel, drag on empty space, touch. Disable double-click-to-zoom
      // — we reserve dblclick for "focus node".
      if (event.type === 'dblclick') return false;
      return !event.ctrlKey && !event.button;
    })
    .on('zoom', event => {
      renderer.setTransform(event.transform);
    });

  const sel = select(canvas).call(zoom);

  // Programmatic controls used by +/- buttons and "reset view" link.
  return {
    zoomIn:   () => sel.transition().duration(180).call(zoom.scaleBy, 1.35),
    zoomOut:  () => sel.transition().duration(180).call(zoom.scaleBy, 1 / 1.35),
    reset:    () => sel.transition().duration(260).call(zoom.transform, d3.zoomIdentity),
    focusOn:  (x, y, k = 1.6) => {
      sel.transition().duration(320).call(
        zoom.transform,
        d3.zoomIdentity.translate(-x * k, -y * k).scale(k)
      );
    },
    destroy: () => sel.on('.zoom', null),
  };
}
