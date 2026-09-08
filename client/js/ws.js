/**
 * ws.js — Shared WebSocket client with auto-reconnect
 */

class EmiSafeWS {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.socket = null;
    this.reconnectDelay = 2000;
    this.maxDelay = 30000;
    this.reconnectTimer = null;
    this.intentionallyClosed = false;
    this.connect();
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const defaultWsUrl = `${protocol}//${location.host}`;
    const wsUrl = (typeof window !== 'undefined' && window.EMISAFE_WS_URL) ? window.EMISAFE_WS_URL : defaultWsUrl;

    this.socket = new WebSocket(wsUrl);

    this.socket.addEventListener('open', () => {
      console.log('🔌 EmiSafe WebSocket connected');
      this.reconnectDelay = 2000; // Reset backoff
    });

    this.socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (typeof this.onMessage === 'function') {
          this.onMessage(data);
        }
      } catch (e) {
        console.warn('WS: Failed to parse message', e);
      }
    });

    this.socket.addEventListener('close', () => {
      if (!this.intentionallyClosed) {
        console.warn(`🔌 WebSocket closed. Reconnecting in ${this.reconnectDelay}ms…`);
        this.scheduleReconnect();
      }
    });

    this.socket.addEventListener('error', (err) => {
      console.error('WebSocket error:', err);
      this.socket.close();
    });
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxDelay);
    }, this.reconnectDelay);
  }

  send(payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  close() {
    this.intentionallyClosed = true;
    clearTimeout(this.reconnectTimer);
    if (this.socket) this.socket.close();
  }
}
