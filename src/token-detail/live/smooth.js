// Monotone cubic interpolation (Fritsch–Carlson). Smooth like a spline, but
// never overshoots between two points — a price line must not show values
// that were never traded.

export function monotoneSample(xs, ys, perSegment = 8) {
  const n = xs.length;
  if (n < 3) return { x: xs.slice(), y: ys.slice() };

  const dx = new Float64Array(n - 1);
  const slope = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i] || 1e-9;
    slope[i] = (ys[i + 1] - ys[i]) / dx[i];
  }

  const m = new Float64Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }

  const outX = [];
  const outY = [];
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      outX.push(xs[i] + t * h);
      outY.push(h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1]);
    }
  }
  outX.push(xs[n - 1]);
  outY.push(ys[n - 1]);
  return { x: outX, y: outY };
}
