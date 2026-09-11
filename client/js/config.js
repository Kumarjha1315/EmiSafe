/**
 * config.js — Production environment configuration for EmiSafe
 */

// Production live Render API backend URL
window.EMISAFE_API_URL = 'https://emisafe.onrender.com/api';

if (!window.EMISAFE_WS_URL) {
    window.EMISAFE_WS_URL = 'wss://emisafe.onrender.com';
}
