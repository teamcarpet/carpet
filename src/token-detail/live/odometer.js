// src/token-detail/live/odometer.js
// Rolling-digit number: each digit is a 0–9 column that slides to its value,
// so only the digits that actually changed move (Robinhood-style ticker).

export class Odometer {
  constructor(el) {
    this.el = el;
    this.el.classList.add('od');
    this.text = '';
  }

  set(text) {
    if (text === this.text) return;
    const prev = this.text;
    this.text = text;

    // Rebuild the column layout only when the shape changes (length or the
    // position of separators); otherwise slide the existing columns.
    const shape = (s) => s.replace(/\d/g, '0');
    if (shape(prev) !== shape(text)) this._build(text);

    const cells = this.el.children;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (!/\d/.test(ch)) continue;
      const strip = cells[i]?.firstElementChild;
      if (strip) strip.style.transform = `translateY(${-Number(ch) * 10}%)`;
    }
  }

  _build(text) {
    this.el.textContent = '';
    for (const ch of text) {
      const cell = document.createElement('span');
      if (/\d/.test(ch)) {
        cell.className = 'od-digit';
        const strip = document.createElement('span');
        strip.className = 'od-strip';
        for (let d = 0; d < 10; d++) {
          const digit = document.createElement('span');
          digit.textContent = String(d);
          strip.appendChild(digit);
        }
        cell.appendChild(strip);
      } else {
        // Subscript zero-count in prices like 0.0₇412 stays small and low.
        cell.className = /[₀-₉]/.test(ch) ? 'od-char od-sub' : 'od-char';
        cell.textContent = ch;
      }
      this.el.appendChild(cell);
    }
  }
}
