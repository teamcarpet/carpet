// src/token-detail/components/mobile-cta.js
// Mobile-only: fixed bottom CTA bar + slide-up bottom sheet for trading.
//
// Behaviour:
//   - On viewports ≤ 768px: renders a fixed 2-button Buy/Sell bar at bottom.
//   - Tapping either button opens the trade panel as a bottom sheet.
//   - Sheet can be dismissed via overlay tap, drag handle, or swipe down.
//   - On wider viewports: renders nothing; desktop trade panel stays in the right column.
//
// The actual TradePanel instance is shared with desktop — we just move its
// host DOM element into the sheet when mobile is active. Same component,
// same onTrade callback, no duplication.

const MOBILE_BREAKPOINT = 768;

export class MobileCta {
  constructor({ tradePanel, onOpenSide }) {
    // tradePanel: the TradePanel instance (has .host, .setSide method could be added)
    this.tradePanel = tradePanel;
    this.onOpenSide = onOpenSide;
    this.isOpen = false;
    this._build();
    this._attach();
  }

  _isMobile() {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  }

  _build() {
    // CTA bar — always present, hidden on desktop via CSS
    this.ctaBar = document.createElement('div');
    this.ctaBar.className = 'td-mobile-cta';
    this.ctaBar.innerHTML = `
      <button class="cta-buy"  data-act="open-trade" data-side="buy">Buy</button>
      <button class="cta-sell" data-act="open-trade" data-side="sell">Sell</button>
    `;

    // Sheet overlay (dark backdrop)
    this.overlay = document.createElement('div');
    this.overlay.className = 'td-sheet-overlay';

    // Sheet body
    this.sheet = document.createElement('div');
    this.sheet.className = 'td-sheet';
    this.sheet.innerHTML = `
      <div class="td-sheet-handle" data-act="close"></div>
      <div class="td-sheet-body" id="td-sheet-body"></div>
    `;

    document.body.appendChild(this.ctaBar);
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.sheet);
  }

  _attach() {
    this.ctaBar.addEventListener('click', (e) => {
      const side = e.target.closest('[data-side]')?.dataset.side;
      if (side) this.open(side);
    });

    this.overlay.addEventListener('click', () => this.close());

    this.sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="close"]')) this.close();
    });

    // Swipe-down to close
    let startY = 0;
    let currentY = 0;
    let dragging = false;

    this.sheet.addEventListener('touchstart', (e) => {
      if (!e.target.closest('.td-sheet-handle')) return;
      startY = e.touches[0].clientY;
      dragging = true;
    }, { passive: true });

    this.sheet.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      currentY = e.touches[0].clientY;
      const delta = Math.max(0, currentY - startY);
      this.sheet.style.transform = `translateY(${delta}px)`;
    }, { passive: true });

    this.sheet.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      const delta = currentY - startY;
      if (delta > 80) {
        this.close();
      } else {
        this.sheet.style.transform = '';
      }
    });
  }

  open(side) {
    if (!this._isMobile()) return;  // desktop doesn't use this

    // Move the trade panel host into the sheet body
    const sheetBody = document.getElementById('td-sheet-body');
    const tradeHost = this.tradePanel?.host;
    if (sheetBody && tradeHost && tradeHost.parentNode !== sheetBody) {
      sheetBody.appendChild(tradeHost);
    }

    // Pre-select the side user tapped
    if (this.tradePanel && this.tradePanel.side !== side) {
      this.tradePanel.side = side;
      this.tradePanel._render?.();
    }

    this.overlay.classList.add('open');
    requestAnimationFrame(() => this.sheet.classList.add('open'));
    this.isOpen = true;
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.sheet.classList.remove('open');
    this.overlay.classList.remove('open');
    this.sheet.style.transform = '';
    this.isOpen = false;
    document.body.style.overflow = '';
  }

  destroy() {
    this.close();
    this.ctaBar?.remove();
    this.overlay?.remove();
    this.sheet?.remove();
  }
}
