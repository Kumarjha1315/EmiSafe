/**
 * api.js — Shared fetch wrapper for EmiSafe client
 * Automatically injects auth token and handles errors.
 */

const API_BASE = (typeof window !== 'undefined' && window.EMISAFE_API_URL) ? window.EMISAFE_API_URL : '/api';

function getToken() {
  return sessionStorage.getItem('emisafe_token') || localStorage.getItem('emisafe_responder_token');
}

async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  // Remove Content-Type for FormData (multipart)
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({ error: 'Invalid server response' }));

  if (!response.ok) {
    const err = new Error(data.error || `HTTP ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ─── Convenience methods ──────────────────────────────────────────────────

const api = {
  get: (url, opts = {}) => apiFetch(url, { ...opts, method: 'GET' }),
  post: (url, body, opts = {}) => apiFetch(url, { ...opts, method: 'POST', body: JSON.stringify(body) }),
  postForm: (url, formData) => apiFetch(url, { method: 'POST', body: formData }),
  patch: (url, body, opts = {}) => apiFetch(url, { ...opts, method: 'PATCH', body: JSON.stringify(body) }),
  delete: (url, opts = {}) => apiFetch(url, { ...opts, method: 'DELETE' }),
};

// ─── Toast notification system ────────────────────────────────────────────

function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '🚨', info: 'ℹ️', warning: '⚠️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Utility helpers ──────────────────────────────────────────────────────

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getCategoryIcon(cat) {
  const icons = { Police: '🚔', Fire: '🔥', Ambulance: '🚑', Disaster: '⚠️' };
  return icons[cat] || '🚨';
}

function getStatusClass(status) {
  const map = {
    'Received': 'received',
    'En Route': 'enroute',
    'On Scene': 'onscene',
    'Resolved': 'resolved',
    'Available': 'available',
    'Busy': 'busy',
    'Offline': 'offline',
    'Pending': 'pending',
  };
  return map[status] || 'received';
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateETA(distanceKm, avgSpeedKmh = 50) {
  const mins = Math.round((distanceKm / avgSpeedKmh) * 60);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
