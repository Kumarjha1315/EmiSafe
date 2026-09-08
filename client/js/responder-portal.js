/**
 * responder-portal.js — Field responder portal logic
 */

let responderData = null;
let incidentData = null;
let portalMap = null;
let incidentMarker = null;
let locationTimer = null;
let wsClient = null;

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('emisafe_responder_token');
  if (token) {
    showPortal();
  } else {
    showLogin();
  }

  initLoginForm();
  initLogout();
});

function showLogin() {
  document.getElementById('login-section').classList.remove('hidden');
  document.getElementById('portal-section').classList.add('hidden');
}

function showPortal() {
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('portal-section').classList.remove('hidden');

  const stored = JSON.parse(localStorage.getItem('emisafe_responder_data') || 'null');
  if (stored) {
    responderData = stored;
    renderPortal();
  }
}

function initLoginForm() {
  const form = document.getElementById('responder-login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const badgeId = form.badgeId.value.trim();
    const email   = form.email.value.trim().toLowerCase();
    const btn     = document.getElementById('login-btn');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Logging in…';

    try {
      const data = await api.post('/auth/responder-login', { badgeId, email });
      localStorage.setItem('emisafe_responder_token', data.token);
      localStorage.setItem('emisafe_responder_data', JSON.stringify(data.responder));
      responderData = data.responder;

      if (responderData.status === 'Pending') {
        showPendingState();
        return;
      }

      showPortal();
      renderPortal();
    } catch (err) {
      showToast(err.message || 'Login failed. Check your Badge ID and email.', 'error');
      btn.disabled = false;
      btn.innerHTML = '🔐 Access Portal';
    }
  });
}

function initLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('emisafe_responder_token');
    localStorage.removeItem('emisafe_responder_data');
    if (locationTimer) clearInterval(locationTimer);
    if (wsClient) wsClient.close();
    showLogin();
  });
}

function showPendingState() {
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('pending-section')?.classList.remove('hidden');
}

async function renderPortal() {
  if (!responderData) return;

  // Update header
  document.getElementById('resp-name-header').textContent = responderData.fullName;
  document.getElementById('resp-dept-header').textContent = responderData.department;
  const statusBadge = document.getElementById('resp-status-badge');
  statusBadge.className = `badge badge-${getStatusClass(responderData.status)}`;
  statusBadge.textContent = responderData.status;

  // Refresh from server
  await refreshResponderData();

  // Start location sharing
  startLocationSharing();

  // Connect WebSocket
  connectWebSocket();

  // Init map
  if (!portalMap) initMap();
}

async function refreshResponderData() {
  try {
    // Re-login to get fresh data
    const stored = JSON.parse(localStorage.getItem('emisafe_responder_data'));
    if (!stored) return;

    // Use the stored token to check assigned incident
    const token = localStorage.getItem('emisafe_responder_token');
    if (!token) return;

    // Fetch current responder state from login endpoint
    if (responderData.assignedIncident) {
      try {
        incidentData = await api.get(`/incidents/${responderData.assignedIncident.reportId || responderData.assignedIncident}/public`);
        renderAssignedIncident();
      } catch (e) {
        renderNoAssignment();
      }
    } else {
      renderNoAssignment();
    }
  } catch (e) {
    console.error('Refresh error:', e);
  }
}

function initMap() {
  portalMap = L.map('portal-map', { center: [20.5937, 78.9629], zoom: 5 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19,
  }).addTo(portalMap);
}

function renderAssignedIncident() {
  if (!incidentData) return;

  const panel = document.getElementById('incident-panel');
  const noAssign = document.getElementById('no-assignment');
  panel.classList.remove('hidden');
  noAssign.classList.add('hidden');

  document.getElementById('inc-id').textContent       = incidentData.reportId;
  document.getElementById('inc-cat').textContent      = `${getCategoryIcon(incidentData.category)} ${incidentData.category}`;
  document.getElementById('inc-desc').textContent     = incidentData.description;
  document.getElementById('inc-reporter').textContent = incidentData.reporterName;
  document.getElementById('inc-phone').textContent    = incidentData.reporterPhone;
  document.getElementById('inc-address').textContent  = incidentData.location.address || `${incidentData.location.lat.toFixed(4)}, ${incidentData.location.lng.toFixed(4)}`;

  const statusBadge = document.getElementById('inc-status');
  statusBadge.className = `badge badge-${getStatusClass(incidentData.status)}`;
  statusBadge.textContent = incidentData.status;

  // Map
  const { lat, lng } = incidentData.location;
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:36px;height:36px;border-radius:50%;background:#E63946;border:3px solid #fff;box-shadow:0 0 20px rgba(230,57,70,0.5);display:flex;align-items:center;justify-content:center;font-size:14px;">${getCategoryIcon(incidentData.category)}</div>`,
    iconSize: [36, 36], iconAnchor: [18, 18],
  });

  if (incidentMarker) {
    incidentMarker.setLatLng([lat, lng]);
  } else if (portalMap) {
    incidentMarker = L.marker([lat, lng], { icon }).addTo(portalMap)
      .bindPopup(`<b>${incidentData.category}</b><br/>${incidentData.location.address}`);
  }

  if (portalMap) portalMap.setView([lat, lng], 14);

  // Navigation link
  document.getElementById('nav-link').href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

  // Status buttons
  renderStatusButtons(incidentData.status);
}

function renderNoAssignment() {
  document.getElementById('incident-panel').classList.add('hidden');
  document.getElementById('no-assignment').classList.remove('hidden');
}

function renderStatusButtons(currentStatus) {
  const container = document.getElementById('status-buttons');
  const flow = ['Received', 'En Route', 'On Scene', 'Resolved'];
  const currentIdx = flow.indexOf(currentStatus);

  container.innerHTML = flow.map((status, i) => {
    const isNext = i === currentIdx + 1;
    const isPast = i <= currentIdx;
    return `
      <button
        class="btn ${isNext ? 'btn-primary' : 'btn-secondary'} btn-full status-btn"
        data-status="${status}"
        ${!isNext ? 'disabled' : ''}
        style="${isPast ? 'opacity:0.4;' : ''}"
        onclick="updateStatus('${status}')"
      >
        ${isPast ? '✓' : isNext ? '▶' : '○'} ${status}
      </button>
    `;
  }).join('');
}

async function updateStatus(newStatus) {
  if (!incidentData || !responderData) return;
  const btn = document.querySelector(`[data-status="${newStatus}"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Updating…`; }

  try {
    const updated = await api.patch(`/incidents/${incidentData._id}/status`, {
      status: newStatus,
      actor: responderData.fullName,
      actorRole: 'Responder',
    });
    incidentData = updated;
    showToast(`Status updated: ${newStatus}`, 'success');
    renderStatusButtons(newStatus);

    const statusBadge = document.getElementById('inc-status');
    statusBadge.className = `badge badge-${getStatusClass(newStatus)}`;
    statusBadge.textContent = newStatus;

    if (newStatus === 'Resolved') {
      setTimeout(() => {
        renderNoAssignment();
        document.getElementById('incident-panel').classList.add('hidden');
        document.getElementById('no-assignment').classList.remove('hidden');
      }, 2000);
    }
  } catch (err) {
    showToast(err.message || 'Failed to update status.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = `▶ ${newStatus}`; }
  }
}

function startLocationSharing() {
  if (!navigator.geolocation || !responderData?._id) return;

  const shareLocation = () => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      try {
        await api.patch(`/responders/${responderData._id}/location`, { lat, lng });
        if (wsClient) wsClient.send({ type: 'responder_location', data: { responderId: responderData._id, lat, lng } });
      } catch (e) { /* silent */ }
    }, () => {}, { enableHighAccuracy: true });
  };

  shareLocation();
  locationTimer = setInterval(shareLocation, 15000); // every 15 seconds
}

function connectWebSocket() {
  wsClient = new EmiSafeWS((msg) => {
    if (msg.type === 'incident_update' && incidentData && msg.data?._id === incidentData._id) {
      incidentData = msg.data;
      renderAssignedIncident();
    }
    // New assignment notification
    if (msg.type === 'incident_update' && !incidentData && msg.data?.assignedResponder?._id === responderData?._id) {
      incidentData = msg.data;
      renderAssignedIncident();
      showToast('📋 New incident assigned to you!', 'info', 6000);
    }
  });
}
