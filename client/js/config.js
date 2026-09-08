/**
 * config.js — Production environment configuration for EmiSafe
 * 
 * If your Node.js backend is hosted separately (e.g. on Render, Railway, or Fly.io),
 * specify the URLs below:
 * 
 * window.EMISAFE_API_URL = 'https://your-emisafe-backend.onrender.com/api';
 * window.EMISAFE_WS_URL  = 'wss://your-emisafe-backend.onrender.com';
 */

// Default relative paths when hosted together or using Netlify proxy redirects
if (!window.EMISAFE_API_URL) {
    // Uncomment and update if using external backend URL:
    // window.EMISAFE_API_URL = 'https://your-backend-domain.com/api';
}

if (!window.EMISAFE_WS_URL) {
    // Uncomment and update if using external WebSocket URL:
    // window.EMISAFE_WS_URL = 'wss://your-backend-domain.com';
}
