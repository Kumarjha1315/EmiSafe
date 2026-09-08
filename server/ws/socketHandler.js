const WebSocket = require('ws');

let wssInstance = null;

const initSocketHandler = (wss) => {
  wssInstance = wss;

  wss.on('connection', (ws, req) => {
    console.log(`🔌 WebSocket client connected. Total: ${wss.clients.size}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData);
        // Handle responder location updates from field responders
        if (msg.type === 'responder_location') {
          broadcast({
            type: 'responder_location',
            data: msg.data,
          }, ws);
        }
      } catch (e) {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      console.log(`🔌 WebSocket client disconnected. Total: ${wss.clients.size}`);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });

    // Send welcome / heartbeat ack
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'connected', message: 'EmiSafe real-time channel active' }));
    }
  });

  // Heartbeat ping every 30 seconds
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));
};

/**
 * Broadcast a JSON payload to all (or specific subset of) connected clients.
 * @param {object} payload - The message object
 * @param {WebSocket} [excludeClient] - Optional client to skip (the sender)
 */
const broadcast = (payload, excludeClient = null) => {
  if (!wssInstance) return;
  const msg = JSON.stringify(payload);
  wssInstance.clients.forEach((client) => {
    if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
};

module.exports = { initSocketHandler, broadcast };
