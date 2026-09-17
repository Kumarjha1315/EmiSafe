/**
 * citizen-track.js — Live incident tracking for citizens
 */

let trackMap = null;
let incidentMarker = null;
let responderMarker = null;
let currentIncident = null;
let wsClient = null;

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initHistory();
  initSearch();

  // Auto-load if reportId in URL param
  const params = new URLSearchParams(location.search);
  const rid = params.get('id');
  if (rid) {
    document.getElementById('report-id-input').value = rid;
    loadIncident(rid);
  }
});

function initMap() {
  trackMap = L.map('track-map', { center: [20.5937, 78.9629], zoom: 5 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(trackMap);
}

function initHistory() {
  const raw = JSON.parse(localStorage.getItem('emisafe_reports') || '[]');
  const history = raw.filter(
    (item) => item && item.reportId && item.reportId !== 'undefined' && item.reportId !== 'null'
  );
  localStorage.setItem('emisafe_reports', JSON.stringify(history));

  const list = document.getElementById('history-list');
  if (!list) return;

  if (history.length === 0) {
    list.innerHTML = '<li class="history-empty">No previous reports found.</li>';
    return;
  }

  list.innerHTML = history
    .map(
      (item) => `
      <li class="history-item" data-id="${item.reportId}">
        <span class="history-id font-mono">${item.reportId}</span>
        <span class="history-date text-xs text-muted">${timeAgo(item.date)}</span>
      </li>`
    )
    .join('');

  list.querySelectorAll('.history-item').forEach((el) => {
    el.addEventListener('click', () => {
      document.getElementById('report-id-input').value = el.dataset.id;
      loadIncident(el.dataset.id);
    });
  });
}


function initSearch() {
  const form = document.getElementById('track-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const rid = document.getElementById('report-id-input').value.trim().toUpperCase();
    if (!rid) return;
    loadIncident(rid);
    history.replaceState(null, '', `?id=${rid}`);
  });
}

async function loadIncident(reportId) {
  const resultsEl = document.getElementById('track-results');
  const emptyEl = document.getElementById('track-empty');
  const loadingEl = document.getElementById('track-loading');

  loadingEl.classList.remove('hidden');
  resultsEl.classList.add('hidden');
  emptyEl.classList.add('hidden');

  try {
    const incident = await api.get(`/incidents/${reportId}/public`);
    currentIncident = incident;
    loadingEl.classList.add('hidden');
    resultsEl.classList.remove('hidden');
    renderIncident(incident);
    connectWebSocket(reportId);
  } catch (err) {
    loadingEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    document.getElementById('track-error-msg').textContent =
      err.status === 404
        ? `No incident found with Report ID "${reportId}". Please check and try again.`
        : 'Failed to load incident. Please try again.';
  }
}

function renderIncident(incident) {
  // Category & meta
  document.getElementById('inc-category').textContent = `${getCategoryIcon(incident.category)} ${incident.category}`;
  document.getElementById('inc-report-id').textContent = incident.reportId;
  document.getElementById('inc-time').textContent = formatDateTime(incident.createdAt);
  document.getElementById('inc-description').textContent = incident.description;

  // Status badge
  const statusEl = document.getElementById('inc-status-badge');
  const sc = getStatusClass(incident.status);
  statusEl.className = `badge badge-${sc}`;
  statusEl.textContent = incident.status;

  // Stepper
  updateStepper(incident.status);

  // Map
  updateMap(incident);

  // Responder info
  updateResponderInfo(incident);
}

function updateStepper(status) {
  const stages = ['Received', 'En Route', 'On Scene', 'Resolved'];
  const currentIdx = stages.indexOf(status);

  stages.forEach((stage, i) => {
    const stepEl = document.getElementById(`step-${stage.replace(' ', '-').toLowerCase()}`);
    if (!stepEl) return;
    stepEl.classList.remove('active', 'completed');
    if (i < currentIdx) stepEl.classList.add('completed');
    else if (i === currentIdx) stepEl.classList.add('active');

    const connEl = document.getElementById(`connector-${i}`);
    if (connEl) connEl.classList.toggle('active', i < currentIdx);
  });
}

function updateMap(incident) {
  const { lat, lng } = incident.location;

  const incidentIcon = L.divIcon({
    className: '',
    html: `<div style="
      width:40px;height:40px;border-radius:50%;
      background:#E63946;border:3px solid rgba(255,255,255,0.9);
      box-shadow:0 0 0 6px rgba(230,57,70,0.3),0 4px 16px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;font-size:16px;
    ">${getCategoryIcon(incident.category)}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

  if (incidentMarker) {
    incidentMarker.setLatLng([lat, lng]);
  } else {
    incidentMarker = L.marker([lat, lng], { icon: incidentIcon })
      .addTo(trackMap)
      .bindPopup(`<b>${incident.category} Emergency</b><br/>${incident.location.address || 'Incident Site'}`);
  }

  if (incident.assignedResponder?.currentLocation?.lat) {
    const rl = incident.assignedResponder.currentLocation;
    updateResponderMarker(rl.lat, rl.lng, incident.assignedResponder.fullName);

    const dist = haversineDistance(rl.lat, rl.lng, lat, lng);
    document.getElementById('eta-distance').textContent = `${dist.toFixed(1)} km`;
    document.getElementById('eta-time').textContent = estimateETA(dist);

    const bounds = L.latLngBounds([[lat, lng], [rl.lat, rl.lng]]);
    trackMap.fitBounds(bounds, { padding: [60, 60] });
  } else {
    trackMap.setView([lat, lng], 15);
  }
}

function updateResponderMarker(lat, lng, name) {
  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width:36px;height:36px;border-radius:50%;
      background:#2EC4B6;border:3px solid rgba(255,255,255,0.9);
      box-shadow:0 0 0 6px rgba(46,196,182,0.3),0 4px 16px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;font-size:14px;
    ">🚒</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

  if (responderMarker) {
    responderMarker.setLatLng([lat, lng]);
  } else {
    responderMarker = L.marker([lat, lng], { icon })
      .addTo(trackMap)
      .bindPopup(`<b>Responder: ${name || 'En Route'}</b>`);
  }
}

function updateResponderInfo(incident) {
  const panel = document.getElementById('responder-panel');
  if (incident.assignedResponder) {
    panel.classList.remove('hidden');
    document.getElementById('resp-name').textContent = incident.assignedResponder.fullName || '—';
    document.getElementById('resp-dept').textContent = incident.assignedResponder.department || '—';
  } else {
    panel.classList.add('hidden');
  }
}

function connectWebSocket(reportId) {
  if (wsClient) wsClient.close();

  wsClient = new EmiSafeWS((msg) => {
    if (msg.type === 'incident_update' && msg.data?.reportId === reportId) {
      currentIncident = msg.data;
      renderIncident(msg.data);
      showToast(`Status updated: ${msg.data.status}`, 'info', 3000);
    }

    if (msg.type === 'responder_location' &&
      currentIncident?.assignedResponder &&
      msg.data?.responderId === currentIncident.assignedResponder._id) {
      updateResponderMarker(msg.data.lat, msg.data.lng, currentIncident.assignedResponder.fullName);

      const dist = haversineDistance(
        msg.data.lat, msg.data.lng,
        currentIncident.location.lat, currentIncident.location.lng
      );
      document.getElementById('eta-distance').textContent = `${dist.toFixed(1)} km`;
      document.getElementById('eta-time').textContent = estimateETA(dist);
    }
  });
}
