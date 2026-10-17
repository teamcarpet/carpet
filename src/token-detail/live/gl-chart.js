// src/token-detail/live/gl-chart.js
// GPU price line for the token page (WebGL2, no dependencies).
//
//   • one-pass glow line: the fragment shader knows each pixel's distance from
//     the centre line and paints a crisp core plus a soft gaussian halo
//   • gradient area fill that fades into the background
//   • time-continuous scrolling — x is computed from wall-clock time every
//     frame, so the line glides left instead of stepping
//   • eased y-range, eased head value, flash + expanding ring on each trade
//   • Canvas2D fallback with the same API when WebGL2 is unavailable
//
// The chart pulls data every frame from `source(nowMs)`:
//   { points: [{ t, v }], windowMs, ref }  (points sorted by t, last = head)

import { monotoneSample } from './smooth.js';

const COLORS = {
  up:      [0 / 255, 229 / 255, 160 / 255],
  down:    [255 / 255, 45 / 255, 45 / 255],
  neutral: [238 / 255, 240 / 255, 245 / 255],
};

const LINE_VS = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in float aAcross;
layout(location=2) in float aAlong;
uniform vec2 uRes;
out float vAcross;
out float vAlong;
void main() {
  vAcross = aAcross;
  vAlong = aAlong;
  vec2 clip = aPos / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
in float vAcross;
in float vAlong;
uniform float uHalf;      // half width of the mesh in px (core + glow room)
uniform float uCore;      // half width of the solid core in px
uniform vec3 uColor;
uniform vec3 uHeadColor;
uniform float uFlash;
out vec4 outColor;
void main() {
  float d = abs(vAcross) * uHalf;
  float core = 1.0 - smoothstep(uCore - 0.75, uCore + 0.75, d);
  float glow = exp(-pow(d / (uCore * 3.2), 2.0)) * 0.55;
  float fadeIn = smoothstep(0.0, 0.06, vAlong);
  float head = smoothstep(0.82, 1.0, vAlong) * uFlash;
  vec3 col = mix(uColor, uHeadColor, head);
  float a = max(core, glow) * fadeIn;
  col += head * core * 0.35;
  outColor = vec4(col * a, a);
}`;

const AREA_VS = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in float aDepth;
layout(location=2) in float aAlong;
uniform vec2 uRes;
out float vDepth;
out float vAlong;
void main() {
  vDepth = aDepth;
  vAlong = aAlong;
  vec2 clip = aPos / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const AREA_FS = `#version 300 es
precision highp float;
in float vDepth;
in float vAlong;
uniform vec3 uColor;
uniform float uStrength;
out vec4 outColor;
void main() {
  float a = uStrength * pow(1.0 - clamp(vDepth, 0.0, 1.0), 2.2) * smoothstep(0.0, 0.08, vAlong);
  outColor = vec4(uColor * a, a);
}`;

const DOT_VS = `#version 300 es
layout(location=0) in vec2 aPos;
uniform vec2 uRes;
uniform float uSize;
void main() {
  vec2 clip = aPos / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = uSize;
}`;

const DOT_FS = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uSize;
uniform float uRing;      // 0..1 progress of the expanding ring
uniform float uPulse;     // idle breathing 0..1
out vec4 outColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * uSize;     // px from centre
  float dotR = 4.5 + uPulse * 0.8;
  float dot = 1.0 - smoothstep(dotR - 0.8, dotR + 0.8, r);
  float centre = 1.0 - smoothstep(1.4, 2.4, r);
  float halo = exp(-pow(r / (dotR * 2.4), 2.0)) * 0.45;
  float ringR = mix(dotR, uSize * 0.48, uRing);
  float ring = (1.0 - smoothstep(0.0, 1.6, abs(r - ringR))) * (1.0 - uRing) * step(0.001, uRing);
  vec3 col = mix(uColor, vec3(1.0), centre * 0.85);
  float a = max(max(dot, halo), ring * 0.9);
  outColor = vec4(col * a, a);
}`;

const DASH_FS = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uDpr;
out vec4 outColor;
void main() {
  float on = step(0.5, fract(gl_FragCoord.x / (8.0 * uDpr)));
  float a = 0.28 * on;
  outColor = vec4(uColor * a, a);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const uniforms = {};
  const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const { name } = gl.getActiveUniform(p, i);
    uniforms[name] = gl.getUniformLocation(p, name);
  }
  return { p, u: uniforms };
}

const lerp = (a, b, k) => a + (b - a) * k;
const ease = (dt, speed) => 1 - Math.exp(-dt * speed);

// ── Shared geometry: data → smoothed pixel polyline ─────────────────────────
class Geometry {
  constructor() {
    this.yMin = null;
    this.yMax = null;
    this.head = null;
  }

  // Returns { xs, ys, refY, headX, headY } in device pixels.
  compute(data, now, w, h, dt, pad) {
    const { points, windowMs } = data;
    const t0 = now - windowMs;

    // Eased head value so the line "reaches" for a new price instead of jumping.
    const target = points[points.length - 1].v;
    this.head = this.head == null ? target : lerp(this.head, target, ease(dt, 14));

    let lo = Infinity, hi = -Infinity;
    for (const p of points) { if (p.t >= t0 - windowMs * 0.05) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); } }
    if (data.ref != null) { lo = Math.min(lo, data.ref); hi = Math.max(hi, data.ref); }
    if (!Number.isFinite(lo)) { lo = hi = target; }
    let span = hi - lo;
    const minSpan = Math.abs(target) * 0.02 || 1e-12;
    if (span < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; span = minSpan; }
    lo -= span * 0.14;
    hi += span * 0.14;
    const k = ease(dt, 6);
    this.yMin = this.yMin == null ? lo : lerp(this.yMin, lo, k);
    this.yMax = this.yMax == null ? hi : lerp(this.yMax, hi, k);

    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const X = (t) => pad.l + ((t - t0) / windowMs) * plotW;
    const Y = (v) => pad.t + (1 - (v - this.yMin) / (this.yMax - this.yMin || 1)) * plotH;

    const rawX = [];
    const rawY = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const v = i === points.length - 1 ? this.head : p.v;
      rawX.push(X(Math.max(p.t, t0 - windowMs * 0.05)));
      rawY.push(Y(v));
    }
    const { x: xs, y: ys } = monotoneSample(rawX, rawY, 6);
    return {
      xs, ys,
      refY: data.ref != null ? Y(data.ref) : null,
      headX: xs[xs.length - 1],
      headY: ys[ys.length - 1],
      toValue: (py) => this.yMin + (1 - (py - pad.t) / plotH) * (this.yMax - this.yMin),
      toTime: (px) => t0 + ((px - pad.l) / plotW) * windowMs,
      X, Y,
    };
  }
}

// ── WebGL2 renderer ─────────────────────────────────────────────────────────
class GLRenderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true, alpha: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.line = program(gl, LINE_VS, LINE_FS);
    this.area = program(gl, AREA_VS, AREA_FS);
    this.dot = program(gl, DOT_VS, DOT_FS);
    this.dash = program(gl, DOT_VS.replace('gl_PointSize = uSize;', ''), DASH_FS);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  _upload(data, layout) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    const stride = layout.reduce((s, n) => s + n, 0) * 4;
    let off = 0;
    for (let i = 0; i < 3; i++) {
      if (i < layout.length) {
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, layout[i], gl.FLOAT, false, stride, off);
        off += layout[i] * 4;
      } else {
        gl.disableVertexAttribArray(i);
      }
    }
  }

  draw(g, s, w, h, dpr) {
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const { xs, ys } = g;
    const n = xs.length;
    if (n < 2) return;

    // Area: strip between the line and the bottom edge.
    const area = new Float32Array(n * 2 * 4);
    for (let i = 0; i < n; i++) {
      const along = i / (n - 1);
      area.set([xs[i], ys[i], 0, along, xs[i], h, 1, along], i * 8);
    }
    this._upload(area, [2, 1, 1]);
    gl.useProgram(this.area.p);
    gl.uniform2f(this.area.u.uRes, w, h);
    gl.uniform3fv(this.area.u.uColor, s.color);
    gl.uniform1f(this.area.u.uStrength, 0.22 + s.flash * 0.08);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, n * 2);

    // Reference (dashed) line at the window's opening value.
    if (g.refY != null) {
      const y0 = g.refY - 0.5 * dpr, y1 = g.refY + 0.5 * dpr;
      this._upload(new Float32Array([0, y0, w, y0, 0, y1, w, y1]), [2]);
      gl.useProgram(this.dash.p);
      gl.uniform2f(this.dash.u.uRes, w, h);
      gl.uniform3fv(this.dash.u.uColor, COLORS.neutral);
      gl.uniform1f(this.dash.u.uDpr, dpr);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Glow line: a strip `half` px each side of the centre line.
    const core = 1.6 * dpr;
    const half = core * 7;
    const line = new Float32Array(n * 2 * 4);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = xs[b] - xs[a], ty = ys[b] - ys[a];
      const len = Math.hypot(tx, ty) || 1;
      tx /= len; ty /= len;
      const nx = -ty * half, ny = tx * half;
      const along = i / (n - 1);
      line.set([xs[i] + nx, ys[i] + ny, 1, along, xs[i] - nx, ys[i] - ny, -1, along], i * 8);
    }
    this._upload(line, [2, 1, 1]);
    gl.useProgram(this.line.p);
    gl.uniform2f(this.line.u.uRes, w, h);
    gl.uniform1f(this.line.u.uHalf, half);
    gl.uniform1f(this.line.u.uCore, core);
    gl.uniform3fv(this.line.u.uColor, s.color);
    gl.uniform3fv(this.line.u.uHeadColor, s.headColor);
    gl.uniform1f(this.line.u.uFlash, s.flash);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, n * 2);

    // Head dot with ring.
    const size = 64 * dpr;
    this._upload(new Float32Array([g.headX, g.headY]), [2]);
    gl.useProgram(this.dot.p);
    gl.uniform2f(this.dot.u.uRes, w, h);
    gl.uniform1f(this.dot.u.uSize, size);
    gl.uniform3fv(this.dot.u.uColor, s.flash > 0.02 ? s.headColor : s.color);
    gl.uniform1f(this.dot.u.uRing, s.ring);
    gl.uniform1f(this.dot.u.uPulse, s.pulse);
    gl.drawArrays(gl.POINTS, 0, 1);
  }

  destroy() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

// ── Canvas2D fallback ───────────────────────────────────────────────────────
class CanvasRenderer {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
  }

  draw(g, s, w, h, dpr) {
    const c = this.ctx;
    c.clearRect(0, 0, w, h);
    const { xs, ys } = g;
    if (xs.length < 2) return;
    const rgb = (col, a) => `rgba(${col.map(v => Math.round(v * 255)).join(',')},${a})`;

    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, rgb(s.color, 0.22));
    grad.addColorStop(1, rgb(s.color, 0));
    c.beginPath();
    c.moveTo(xs[0], h);
    for (let i = 0; i < xs.length; i++) c.lineTo(xs[i], ys[i]);
    c.lineTo(xs[xs.length - 1], h);
    c.closePath();
    c.fillStyle = grad;
    c.fill();

    if (g.refY != null) {
      c.setLineDash([4 * dpr, 4 * dpr]);
      c.strokeStyle = rgb(COLORS.neutral, 0.28);
      c.lineWidth = dpr;
      c.beginPath(); c.moveTo(0, g.refY); c.lineTo(w, g.refY); c.stroke();
      c.setLineDash([]);
    }

    c.beginPath();
    c.moveTo(xs[0], ys[0]);
    for (let i = 1; i < xs.length; i++) c.lineTo(xs[i], ys[i]);
    c.strokeStyle = rgb(s.color, 1);
    c.lineWidth = 3.2 * dpr;
    c.shadowColor = rgb(s.color, 0.7);
    c.shadowBlur = 14 * dpr;
    c.stroke();
    c.shadowBlur = 0;

    const head = s.flash > 0.02 ? s.headColor : s.color;
    if (s.ring > 0) {
      c.beginPath();
      c.arc(g.headX, g.headY, (5 + s.ring * 22) * dpr, 0, Math.PI * 2);
      c.strokeStyle = rgb(head, 1 - s.ring);
      c.lineWidth = 1.5 * dpr;
      c.stroke();
    }
    c.beginPath();
    c.arc(g.headX, g.headY, 4.5 * dpr, 0, Math.PI * 2);
    c.fillStyle = rgb(head, 1);
    c.shadowColor = rgb(head, 0.8);
    c.shadowBlur = 12 * dpr;
    c.fill();
    c.shadowBlur = 0;
  }

  destroy() {}
}

// ── Public chart ────────────────────────────────────────────────────────────
export function createLiveChart(canvas, { source, onScrub } = {}) {
  let renderer;
  try { renderer = new GLRenderer(canvas); } catch { renderer = new CanvasRenderer(canvas); }

  const geometry = new Geometry();
  const style = {
    color: COLORS.neutral.slice(),
    targetColor: COLORS.neutral,
    headColor: COLORS.up,
    flash: 0,
    ring: 0,
    pulse: 0,
  };
  let raf = 0, last = 0, visible = true, onScreen = true, w = 0, h = 0, dpr = 1;
  let scrubX = null, lastGeom = null;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const frame = (ts) => {
    raf = 0;
    const dt = last ? Math.min((ts - last) / 1000, 0.1) : 0.016;
    last = ts;
    const data = source?.(Date.now());
    if (data?.points?.length) {
      const k = ease(dt, 5);
      for (let i = 0; i < 3; i++) style.color[i] = lerp(style.color[i], style.targetColor[i], k);
      style.flash = Math.max(0, style.flash - dt * 1.1);
      style.ring = style.ring > 0 ? Math.min(1, style.ring + dt * 1.6) : 0;
      if (style.ring >= 1) style.ring = 0;
      style.pulse = (Math.sin(ts / 520) + 1) / 2;

      const pad = { l: 0, r: 22 * dpr, t: 18 * dpr, b: 10 * dpr };
      lastGeom = geometry.compute(data, Date.now(), w, h, dt, pad);
      renderer.draw(lastGeom, style, w, h, dpr);
      if (scrubX != null) emitScrub();
    }
    if (visible && onScreen) raf = requestAnimationFrame(frame);
  };

  const start = () => { if (!raf && visible && onScreen) { last = 0; raf = requestAnimationFrame(frame); } };
  const onVisibility = () => { visible = !document.hidden; start(); };
  document.addEventListener('visibilitychange', onVisibility);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; start(); });
  io.observe(canvas);

  // ── Scrub (mouse / touch) ────────────────────────────────────────────────
  function emitScrub() {
    if (!lastGeom || scrubX == null) return;
    const { xs, ys } = lastGeom;
    const px = Math.min(Math.max(scrubX * dpr, xs[0]), xs[xs.length - 1]);
    let i = 1;
    while (i < xs.length - 1 && xs[i] < px) i++;
    const f = (px - xs[i - 1]) / ((xs[i] - xs[i - 1]) || 1);
    const py = ys[i - 1] + (ys[i] - ys[i - 1]) * Math.min(Math.max(f, 0), 1);
    onScrub?.({ x: px / dpr, y: py / dpr, value: lastGeom.toValue(py), time: lastGeom.toTime(px) });
  }
  const onMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    scrubX = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
    emitScrub();
  };
  const onLeave = () => { scrubX = null; onScrub?.(null); };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') onLeave(); });
  canvas.addEventListener('pointercancel', onLeave);

  start();

  return {
    /** Snap the axes after a scale jump (price ↔ market cap, new step). */
    resetRange() { geometry.yMin = geometry.yMax = geometry.head = null; start(); },
    /** Overall line colour: 1 up, -1 down, 0 flat. */
    setTone(dir) { style.targetColor = dir > 0 ? COLORS.up : dir < 0 ? COLORS.down : COLORS.neutral; },
    /** A trade landed: flash the head in the trade's colour and fire a ring. */
    pulse(side, strength = 1) {
      style.headColor = side === 'buy' ? COLORS.up : COLORS.down;
      style.flash = Math.min(1, 0.6 + 0.4 * strength);
      style.ring = 0.001;
      start();
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.destroy();
    },
  };
}
