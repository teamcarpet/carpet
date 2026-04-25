// src/token-detail/components/chat-panel.js
// Token chat panel. Placeholder — real chat needs wallet-gated auth + backend.
// Structured so that when backend is ready, only the _send / _connect methods
// need implementation.

export class ChatPanel {
  constructor(host, { mint }) {
    this.host = host;
    this.mint = mint;
    this._render();
    this.host.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="join"]')) this._join();
    });
  }

  _render() {
    this.host.innerHTML = `
      <div class="td-card td-chat">
        <div class="td-chat-head">
          <div class="td-chat-title">Token chat</div>
          <div class="td-chat-status">0 online</div>
        </div>
        <div class="td-chat-empty">
          <div>Connect wallet to chat</div>
          <small>Only holders can post messages</small>
          <button class="td-chat-join" data-act="join">Join chat</button>
        </div>
      </div>
    `;
  }

  _join() {
    // Hook into wallet connect flow via global bridge.
    // main.js should expose window._app.walletClick.
    if (window._app?.walletClick) {
      window._app.walletClick(new Event('click'));
    }
  }

  destroy() { this.host.innerHTML = ''; }
}
