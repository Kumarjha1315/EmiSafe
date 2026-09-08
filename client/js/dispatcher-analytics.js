/**
 * dispatcher-analytics.js — Analytics dashboard with Chart.js
 */

let charts = {};

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadAllAnalytics();
  initLogout();
});

function checkAuth() {
  if (!sessionStorage.getItem('emisafe_token')) {
    location.href = '/dispatcher/login.html';
  }
}

function initLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    sessionStorage.removeItem('emisafe_token');
    location.href = '/dispatcher/login.html';
  });
}

async function loadAllAnalytics() {
  await Promise.all([
    loadSummary(),
    loadActivityChart(),
    loadTypeChart(),
    loadStatusChart(),
    loadResponseTimeChart(),
    loadHeatmap(),
    loadLeaderboard(),
  ]);
}

async function loadSummary() {
  try {
    const data = await api.get('/analytics/summary');
    document.getElementById('kpi-total').textContent       = data.totalIncidents;
    document.getElementById('kpi-active').textContent      = data.activeIncidents;
    document.getElementById('kpi-resolved').textContent    = data.resolvedIncidents;
    document.getElementById('kpi-response').textContent    = `${data.avgResponseTime} min`;
    document.getElementById('kpi-available').textContent   = `${data.availableResponders}/${data.totalResponders}`;
  } catch (e) {
    console.error('Summary load error:', e);
  }
}

async function loadActivityChart() {
  try {
    const data = await api.get('/analytics/activity');
    const ctx = document.getElementById('activity-chart').getContext('2d');

    if (charts.activity) charts.activity.destroy();

    const labels = data.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    });
    const counts = data.map(d => d.count);

    charts.activity = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Incidents',
          data: counts,
          borderColor: '#E63946',
          backgroundColor: 'rgba(230,57,70,0.1)',
          borderWidth: 2.5,
          pointBackgroundColor: '#E63946',
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8892A4', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8892A4', font: { size: 11 }, stepSize: 1 }, beginAtZero: true },
        },
      },
    });
  } catch (e) {
    console.error('Activity chart error:', e);
    showEmptyChart('activity-chart', 'No activity data available');
  }
}

async function loadTypeChart() {
  try {
    const data = await api.get('/analytics/by-type');
    const ctx = document.getElementById('type-chart').getContext('2d');

    if (charts.type) charts.type.destroy();

    const colors = {
      Police: '#3B82F6', Fire: '#E63946', Ambulance: '#06D6A0', Disaster: '#F4A261',
    };

    charts.type = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: data.map(d => d.category),
        datasets: [{
          data: data.map(d => d.count),
          backgroundColor: data.map(d => colors[d.category] || '#8B5CF6'),
          borderColor: '#0A0F1E',
          borderWidth: 3,
          hoverBorderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94A3B8', font: { size: 12 }, padding: 16, usePointStyle: true } },
        },
      },
    });
  } catch (e) {
    showEmptyChart('type-chart', 'No type data available');
  }
}

async function loadStatusChart() {
  try {
    const data = await api.get('/analytics/by-status');
    const ctx = document.getElementById('status-chart').getContext('2d');

    if (charts.status) charts.status.destroy();

    const colors = {
      'Received': '#94A3B8', 'En Route': '#F4A261', 'On Scene': '#3B82F6', 'Resolved': '#06D6A0',
    };

    charts.status = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.status),
        datasets: [{
          data: data.map(d => d.count),
          backgroundColor: data.map(d => colors[d.status] || '#8B5CF6'),
          borderColor: '#0A0F1E',
          borderWidth: 4,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94A3B8', font: { size: 12 }, padding: 16, usePointStyle: true } },
        },
      },
    });
  } catch (e) {
    showEmptyChart('status-chart', 'No status data available');
  }
}

async function loadResponseTimeChart() {
  try {
    const data = await api.get('/analytics/response-times');
    const ctx = document.getElementById('response-chart').getContext('2d');

    if (charts.response) charts.response.destroy();

    if (!data || data.length === 0) {
      showEmptyChart('response-chart', 'No response time data yet');
      return;
    }

    charts.response = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.category),
        datasets: [
          {
            label: 'Dispatch Time (min)',
            data: data.map(d => d.avgDispatchMinutes),
            backgroundColor: 'rgba(46,196,182,0.7)',
            borderColor: '#2EC4B6',
            borderWidth: 0,
            borderRadius: 6,
            barPercentage: 0.6,
          },
          {
            label: 'Arrival Time (min)',
            data: data.map(d => d.avgArrivalMinutes),
            backgroundColor: 'rgba(230,57,70,0.7)',
            borderColor: '#E63946',
            borderWidth: 0,
            borderRadius: 6,
            barPercentage: 0.6,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#94A3B8', font: { size: 12 }, usePointStyle: true } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#8892A4' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8892A4' }, beginAtZero: true },
        },
      },
    });
  } catch (e) {
    showEmptyChart('response-chart', 'No response time data available');
  }
}

let heatmapMap = null;

async function loadHeatmap() {
  try {
    const data = await api.get('/analytics/heatmap');

    if (!heatmapMap) {
      heatmapMap = L.map('heatmap-container', { center: [20.5937, 78.9629], zoom: 5 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 19,
      }).addTo(heatmapMap);
    }

    const catColors = { Police: '#3B82F6', Fire: '#E63946', Ambulance: '#06D6A0', Disaster: '#F4A261' };

    data.forEach(point => {
      if (!point.lat || !point.lng) return;
      const color = catColors[point.category] || '#E63946';
      L.circleMarker([point.lat, point.lng], {
        radius: 10,
        fillColor: color,
        fillOpacity: 0.5,
        color: color,
        weight: 1,
        opacity: 0.8,
      }).addTo(heatmapMap).bindPopup(`${point.category} — ${point.status}`);
    });
  } catch (e) {
    console.error('Heatmap error:', e);
  }
}

async function loadLeaderboard() {
  try {
    const data = await api.get('/analytics/responder-performance');
    const tbody = document.getElementById('leaderboard-body');

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px">No performance data yet</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map((r, i) => `
      <tr>
        <td><span style="font-weight:700;color:${i < 3 ? 'var(--amber)' : 'var(--text-muted)'}">#${i + 1}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span>${r.department === 'Police' ? '🚔' : r.department === 'Fire' ? '🚒' : r.department === 'Ambulance' ? '🚑' : '⚠️'}</span>
            <div>
              <div style="font-weight:600">${r.fullName}</div>
              <div class="text-xs text-muted">${r.badgeId}</div>
            </div>
          </div>
        </td>
        <td><span class="badge badge-${getStatusClass(r.department).toLowerCase()}">${r.department}</span></td>
        <td style="font-weight:700;color:var(--teal)">${r.completedIncidents}</td>
        <td style="color:var(--text-secondary)">${r.avgResponseTime > 0 ? r.avgResponseTime + ' min' : '—'}</td>
        <td><span class="badge badge-${getStatusClass(r.status)}">${r.status}</span></td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Leaderboard error:', e);
  }
}

function showEmptyChart(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const parent = canvas.parentElement;
  parent.innerHTML = `<div style="
    display:flex;align-items:center;justify-content:center;
    height:200px;color:var(--text-muted);font-size:0.875rem;
    flex-direction:column;gap:8px;
  "><span style="font-size:2rem">📊</span>${message}</div>`;
}
