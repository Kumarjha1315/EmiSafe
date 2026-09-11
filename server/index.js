require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const incidentRoutes = require('./routes/incidents');
const responderRoutes = require('./routes/responders');
const analyticsRoutes = require('./routes/analytics');
const { initSocketHandler } = require('./ws/socketHandler');

const app = express();
const server = http.createServer(app);

// ─── Database ───────────────────────────────────────────────────────────────
connectDB();

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static Files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../client')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── WebSocket ──────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });
app.set('wss', wss);
initSocketHandler(wss);

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/responders', responderRoutes);
app.use('/api/analytics', analyticsRoutes);

// ─── SPA Fallback ───────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ─── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('  🚨 ╔══════════════════════════════════════╗');
  console.log('     ║   EmiSafe — Emergency Dispatch       ║');
  console.log(`     ║   Server: http://localhost:${PORT}      ║`);
  console.log('     ║   WebSocket: ws://localhost:' + PORT + '      ║');
  console.log('  🚨 ╚══════════════════════════════════════╝');
  console.log('');
});

// ─── Export ─────────────────────────────────────────────────────────────────
module.exports = app;
