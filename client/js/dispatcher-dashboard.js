/**
 * dispatcher-dashboard.js — Live operations dashboard for dispatcher
 */

let dashMap = null;
let incidentMarkers = {};
let responderMarkers = {};
let allIncidents = [];
let allResponders = [];
let wsClient = null;
let activeFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  initMap();
  loadAll();
  connectWebSocket();
  initFilters();
  initLogout();

  // Refresh every 60 seconds as fallback
  setInterval(loadAll, 60000);
});

function checkAuth() {
  const token = sessionStorage.getItem('emisafe_token');
  if (!token) {
    location.href = '/dispatcher/login.html';
  }
}

function initLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    sessionStorage.removeItem('emisafe_token');
    location.href = '/dispatcher/login.html';
  });
}

function initMap() {
  dashMap = L.map('dash-map', { center: [20.5937, 78.9629], zoom: 5 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19,
  }).addTo(dashMap);
}

async function loadAll() {
  await Promise.all([loadIncidents(), loadResponders()]);
  updateKPICounters();
}

async function loadIncidents() {
  try {
    allIncidents = await api.get('/incidents');
    renderIncidentList();
    renderMapMarkers();
  } catch (err) {
    if (err.status === 401) {
      location.href = '/dispatcher/login.html';
    }
    showToast('Failed to load incidents.', 'error');
  }
}

async function loadResponders() {
  try {
    allResponders = await api.get('/responders');
    renderResponderDirectory();
    renderPendingQueue();
  } catch (err) {
    showToast('Failed to load responders.', 'error');
  }
}

function updateKPICounters() {
  const active    = allIncidents.filter(i => ['Received','En Route','On Scene'].includes(i.status)).length;
  const resolved  = allIncidents.filter(i => i.status === 'Resolved').length;
  const available = allResponders.filter(r => r.status === 'Available').length;

  document.getElementById('kpi-total').textContent    = allIncidents.length;
  document.getElementById('kpi-active').textContent   = active;
  document.getElementById('kpi-resolved').textContent = resolved;
  document.getElementById('kpi-available').textContent = available;
  document.getElementById('kpi-enroute').textContent  = allIncidents.filter(i => i.status === 'En Route').length;
}

function initFilters() {
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderIncidentList();
    });
  });
}

function renderIncidentList() {
  const list = document.getElementById('incident-list');
  let filtered = allIncidents;

  if (activeFilter !== 'all') {
    if (activeFilter === 'active') {
      filtered = allIncidents.filter(i => ['Received', 'En Route', 'On Scene'].includes(i.status));
    } else {
      filtered = allIncidents.filter(i => i.status.toLowerCase().replace(' ', '-') === activeFilter || i.status === activeFilter);
    }
  }

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><span>📭</span><p>No incidents in this category</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(incident => `
    <div class="incident-card" id="inc-card-${incident._id}" data-id="${incident._id}">
      <div class="incident-card-header">
        <span class="incident-icon">${getCategoryIcon(incident.category)}</span>
        <div class="incident-meta">
          <span class="incident-report-id font-mono text-xs">${incident.reportId}</span>
          <span class="badge badge-${getStatusClass(incident.status)}">${incident.status}</span>
        </div>
        <span class="incident-time text-xs text-muted">${timeAgo(incident.createdAt)}</span>
      </div>
      <div class="incident-desc text-sm text-secondary">${incident.description.substring(0, 100)}${incident.description.length > 100 ? '…' : ''}</div>
      <div class="incident-reporter text-xs text-muted">
        👤 ${incident.reporterName} · 📞 ${incident.reporterPhone}
      </div>
      ${incident.assignedResponder ? `
        <div class="incident-responder">
          <span class="pulse-dot teal" style="width:6px;height:6px"></span>
          <span class="text-xs" style="color:var(--teal)">${incident.assignedResponder.fullName}</span>
        </div>` : ''}
      <div class="incident-actions">
        <button class="btn btn-secondary btn-sm" onclick="focusIncident('${incident._id}')">🗺 Map</button>
        ${['Received', 'En Route', 'On Scene'].includes(incident.status) ? `
          <button class="btn btn-primary btn-sm" onclick="openAssignModal('${incident._id}')">⚡ Assign</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="viewAuditLog('${incident._id}')">📋 Log</button>
      </div>
    </div>
  `).join('');
}

function renderMapMarkers() {
  // Clear old markers
  Object.values(incidentMarkers).forEach(m => m.remove());
  incidentMarkers = {};

  allIncidents.forEach(incident => {
    const { lat, lng } = incident.location;
    if (!lat || !lng) return;

    const catColors = { Police: '#3B82F6', Fire: '#E63946', Ambulance: '#06D6A0', Disaster: '#F4A261' };
    const color = catColors[incident.category] || '#E63946';

    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:32px;height:32px;border-radius:50%;
        background:${color};border:2px solid rgba(255,255,255,0.8);
        box-shadow:0 0 12px ${color}66;
        display:flex;align-items:center;justify-content:center;font-size:13px;
        cursor:pointer;
      ">${getCategoryIcon(incident.category)}</div>`,
      iconSize: [32, 32], iconAnchor: [16, 16],
    });

    const marker = L.marker([lat, lng], { icon }).addTo(dashMap);
    marker.bindPopup(`
      <div style="font-family:sans-serif;min-width:180px;">
        <b>${incident.category} — ${incident.reportId}</b><br/>
        <span style="color:#888;font-size:12px">${incident.status}</span><br/>
        <span style="font-size:12px">${incident.description.substring(0,80)}…</span>
      </div>
    `);
    marker.on('click', () => focusIncident(incident._id));
    incidentMarkers[incident._id] = marker;
  });
}

function renderResponderDirectory() {
  const dir = document.getElementById('responder-directory');
  const active = allResponders.filter(r => r.status !== 'Pending');

  if (active.length === 0) {
    dir.innerHTML = '<div class="empty-state"><span>👤</span><p>No active responders</p></div>';
    return;
  }

  dir.innerHTML = active.map(r => `
    <div class="responder-item">
      <div class="responder-avatar">${r.department === 'Police' ? '🚔' : r.department === 'Fire' ? '🚒' : r.department === 'Ambulance' ? '🚑' : '⚠️'}</div>
      <div class="responder-info">
        <div class="responder-name text-sm">${r.fullName}</div>
        <div class="responder-meta text-xs text-muted">${r.department} · ${r.badgeId}</div>
      </div>
      <span class="badge badge-${getStatusClass(r.status)}">${r.status}</span>
    </div>
  `).join('');

  // Update responder map markers
  Object.values(responderMarkers).forEach(m => m.remove());
  responderMarkers = {};

  active.filter(r => r.currentLocation?.lat).forEach(r => {
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:28px;height:28px;border-radius:50%;
        background:#2EC4B6;border:2px solid rgba(255,255,255,0.8);
        box-shadow:0 0 10px rgba(46,196,182,0.5);
        display:flex;align-items:center;justify-content:center;font-size:12px;
      ">🚒</div>`,
      iconSize: [28, 28], iconAnchor: [14, 14],
    });
    const m = L.marker([r.currentLocation.lat, r.currentLocation.lng], { icon })
      .addTo(dashMap)
      .bindPopup(`<b>${r.fullName}</b><br/>${r.department} · ${r.status}`);
    responderMarkers[r._id] = m;
  });
}

function renderPendingQueue() {
  const queue = document.getElementById('pending-queue');
  const pending = allResponders.filter(r => r.status === 'Pending');
  const badge = document.getElementById('pending-badge');
  if (badge) badge.textContent = pending.length || '';

  if (pending.length === 0) {
    queue.innerHTML = '<div class="empty-state"><span>✅</span><p>No pending registrations</p></div>';
    return;
  }

  queue.innerHTML = pending.map(r => `
    <div class="pending-card">
      <div class="pending-info">
        <div class="pending-name">${r.fullName}</div>
        <div class="text-xs text-muted">${r.department} · Badge: ${r.badgeId} · ${r.yearsOfExperience}yr exp</div>
        <div class="text-xs text-muted">📧 ${r.email} · 📞 ${r.phone}</div>
      </div>
      <div class="pending-actions">
        <button class="btn btn-teal btn-sm" onclick="approveResponder('${r._id}')">✓ Approve</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="rejectResponder('${r._id}')">✕</button>
      </div>
    </div>
  `).join('');
}

function focusIncident(id) {
  const incident = allIncidents.find(i => i._id === id);
  if (!incident) return;
  dashMap.setView([incident.location.lat, incident.location.lng], 15);
  incidentMarkers[id]?.openPopup();

  // Highlight card
  document.querySelectorAll('.incident-card').forEach(c => c.classList.remove('highlighted'));
  document.getElementById(`inc-card-${id}`)?.classList.add('highlighted');
}

// ─── Assign Modal ────────────────────────────────────────────────────────────

function openAssignModal(incidentId) {
  const incident = allIncidents.find(i => i._id === incidentId);
  if (!incident) return;

  const available = allRespononders => allRespononders.filter(r => ['Available', 'Pending'].includes(r.status));
  const opts = allResponders.filter(r => ['Available', 'Pending'].includes(r.status));

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'assign-modal';
  overlay.innerHTML = `
    <div class="modal">
      <h3 class="display-md" style="margin-bottom:var(--space-2)">Assign Responder</h3>
      <p class="text-sm text-secondary" style="margin-bottom:var(--space-6)">
        Incident: <span class="font-mono" style="color:var(--teal)">${incident.reportId}</span> · ${incident.category}
      </p>
      ${opts.length === 0 ? '<p class="text-secondary">No available responders at the moment.</p>' : `
        <div class="responder-select-list">
          ${opts.map(r => `
            <label class="responder-select-item">
              <input type="radio" name="responder-sel" value="${r._id}" />
              <div class="responder-select-info">
                <span class="responder-name">${r.fullName}</span>
                <span class="text-xs text-muted">${r.department} · ${r.badgeId} · ${r.yearsOfExperience}yr exp</span>
                ${r.status === 'Pending' ? '<span class="badge badge-pending">Will be verified on assign</span>' : ''}
              </div>
            </label>
          `).join('')}
        </div>
      `}
      <div class="flex gap-3" style="margin-top:var(--space-6)">
        <button class="btn btn-primary btn-full" id="confirm-assign-btn" ${opts.length === 0 ? 'disabled' : ''}>
          ⚡ Confirm Assignment
        </button>
        <button class="btn btn-secondary" onclick="document.getElementById('assign-modal').remove()">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('confirm-assign-btn')?.addEventListener('click', async () => {
    const sel = overlay.querySelector('input[name="responder-sel"]:checked');
    if (!sel) { showToast('Please select a responder.', 'warning'); return; }
    await assignResponder(incidentId, sel.value);
    overlay.remove();
  });
}

async function assignResponder(incidentId, responderId) {
  try {
    await api.patch(`/incidents/${incidentId}/assign`, { responderId });
    showToast('Responder assigned successfully!', 'success');
    await loadAll();
  } catch (err) {
    showToast(err.message || 'Assignment failed.', 'error');
  }
}

async function approveResponder(id) {
  try {
    await api.patch(`/responders/${id}/status`, { status: 'Available' });
    showToast('Responder approved!', 'success');
    await loadResponders();
  } catch (err) {
    showToast('Failed to approve responder.', 'error');
  }
}

async function rejectResponder(id) {
  try {
    await api.delete(`/responders/${id}`);
    showToast('Responder registration removed.', 'info');
    await loadResponders();
  } catch (err) {
    showToast('Failed to remove responder.', 'error');
  }
}

function viewAuditLog(incidentId) {
  const incident = allIncidents.find(i => i._id === incidentId);
  if (!incident) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:600px;max-height:80vh;overflow-y:auto;">
      <h3 style="margin-bottom:var(--space-4)">📋 Audit Log — ${incident.reportId}</h3>
      <div class="audit-timeline">
        ${(incident.auditLog || []).map(entry => `
          <div class="audit-entry">
            <div class="audit-dot"></div>
            <div class="audit-content">
              <div class="audit-action text-sm">${entry.action}</div>
              <div class="audit-meta text-xs text-muted">
                ${entry.actor} · ${entry.actorRole} · ${formatDateTime(entry.timestamp)}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-secondary btn-full" style="margin-top:var(--space-6)" onclick="this.closest('.modal-overlay').remove()">Close</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

function connectWebSocket() {
  wsClient = new EmiSafeWS((msg) => {
    if (msg.type === 'new_incident') {
      showToast(`🚨 New ${msg.data.category} incident reported!`, 'warning', 6000);
      loadIncidents();
    }
    if (msg.type === 'incident_update') {
      const idx = allIncidents.findIndex(i => i._id === msg.data._id);
      if (idx !== -1) allIncidents[idx] = msg.data;
      else allIncidents.unshift(msg.data);
      renderIncidentList();
      renderMapMarkers();
      updateKPICounters();
    }
    if (msg.type === 'new_responder') {
      showToast(`👤 New responder registration: ${msg.data.fullName}`, 'info', 6000);
      loadResponders();
    }
    if (msg.type === 'responder_location' && responderMarkers[msg.data.responderId]) {
      responderMarkers[msg.data.responderId].setLatLng([msg.data.lat, msg.data.lng]);
    }
  });
}
