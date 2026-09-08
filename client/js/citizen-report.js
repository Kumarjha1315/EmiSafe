/**
 * citizen-report.js — Handles the citizen incident report form
 */

let leafletMap = null;
let locationMarker = null;
let capturedLat = null;
let capturedLng = null;

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initGeolocation();
  initFileUpload();
  initForm();
  initCategoryCards();
});

function initMap() {
  leafletMap = L.map('location-map', {
    center: [20.5937, 78.9629], // Default: India center
    zoom: 5,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(leafletMap);

  // Allow manual click to set location
  leafletMap.on('click', (e) => {
    setLocation(e.latlng.lat, e.latlng.lng);
  });
}

function initGeolocation() {
  const btn = document.getElementById('get-location-btn');
  const statusEl = document.getElementById('location-status');

  btn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showLocationStatus('error', 'Geolocation is not supported by your browser.');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Locating…';
    showLocationStatus('info', 'Requesting GPS location…');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btn.disabled = false;
        btn.innerHTML = '📍 Use My Location';
        setLocation(pos.coords.latitude, pos.coords.longitude);
        showLocationStatus('success', `Location captured (±${Math.round(pos.coords.accuracy)}m accuracy)`);
      },
      (err) => {
        btn.disabled = false;
        btn.innerHTML = '📍 Use My Location';
        const msgs = {
          1: 'Permission denied. Please click the map to set your location manually.',
          2: 'Unable to determine location. Please click the map.',
          3: 'Location request timed out. Please try again.',
        };
        showLocationStatus('error', msgs[err.code] || 'Geolocation error.');
      },
      { timeout: 10000, maximumAge: 30000, enableHighAccuracy: true }
    );
  });
}

function setLocation(lat, lng) {
  capturedLat = lat;
  capturedLng = lng;

  const icon = L.divIcon({
    className: '',
    html: `<div style="
      width:36px;height:36px;border-radius:50%;
      background:#E63946;border:3px solid #fff;
      box-shadow:0 0 20px rgba(230,57,70,0.6);
      display:flex;align-items:center;justify-content:center;
      font-size:14px;color:#fff;font-weight:bold;
    ">📍</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

  if (locationMarker) {
    locationMarker.setLatLng([lat, lng]);
  } else {
    locationMarker = L.marker([lat, lng], { icon }).addTo(leafletMap);
  }

  leafletMap.setView([lat, lng], 16);

  // Reverse geocode
  fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
    .then((r) => r.json())
    .then((data) => {
      const addr = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const addrEl = document.getElementById('address-display');
      if (addrEl) addrEl.textContent = addr;
      document.getElementById('hidden-address').value = addr;
    })
    .catch(() => {
      const addrEl = document.getElementById('address-display');
      if (addrEl) addrEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    });

  document.getElementById('hidden-lat').value = lat;
  document.getElementById('hidden-lng').value = lng;
}

function showLocationStatus(type, msg) {
  const el = document.getElementById('location-status');
  if (!el) return;
  el.className = `location-status location-status--${type}`;
  el.textContent = msg;
  el.style.display = 'block';
}

function initFileUpload() {
  const input = document.getElementById('media-input');
  const preview = document.getElementById('media-preview');
  const dropzone = document.getElementById('media-dropzone');

  ['dragenter', 'dragover'].forEach((e) => dropzone.addEventListener(e, (ev) => {
    ev.preventDefault();
    dropzone.classList.add('drag-over');
  }));

  ['dragleave', 'drop'].forEach((e) => dropzone.addEventListener(e, () => {
    dropzone.classList.remove('drag-over');
  }));

  dropzone.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const file = ev.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      input.files = ev.dataTransfer.files;
      showPreview(file);
    }
  });

  dropzone.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    if (input.files[0]) showPreview(input.files[0]);
  });

  function showPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.innerHTML = `
        <div class="media-preview-inner">
          <img src="${e.target.result}" alt="Preview" />
          <button class="media-remove-btn" id="remove-media">✕</button>
        </div>`;
      preview.style.display = 'block';
      dropzone.style.display = 'none';

      document.getElementById('remove-media').addEventListener('click', () => {
        input.value = '';
        preview.style.display = 'none';
        preview.innerHTML = '';
        dropzone.style.display = 'flex';
      });
    };
    reader.readAsDataURL(file);
  }
}

function initCategoryCards() {
  const cards = document.querySelectorAll('.category-card');
  cards.forEach((card) => {
    card.addEventListener('click', () => {
      cards.forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      card.querySelector('input[type="radio"]').checked = true;
    });
  });
}

function initForm() {
  const form = document.getElementById('report-form');
  const submitBtn = document.getElementById('submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate
    const category = form.querySelector('input[name="category"]:checked');
    if (!category) {
      showToast('Please select an emergency category.', 'error');
      return;
    }
    if (!capturedLat || !capturedLng) {
      showToast('Please capture your location using GPS or click the map.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('category', category.value);
    formData.append('description', form.description.value.trim());
    formData.append('lat', capturedLat);
    formData.append('lng', capturedLng);
    formData.append('address', document.getElementById('hidden-address').value);
    formData.append('reporterName', form.reporterName.value.trim());
    formData.append('reporterPhone', form.reporterPhone.value.trim());

    const mediaInput = document.getElementById('media-input');
    if (mediaInput.files[0]) formData.append('media', mediaInput.files[0]);

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Submitting…';

    try {
      const data = await api.postForm('/incidents', formData);
      showSuccess(data.reportId);

      // Save to localStorage
      const history = JSON.parse(localStorage.getItem('emisafe_reports') || '[]');
      history.unshift({ reportId: data.reportId, date: new Date().toISOString() });
      localStorage.setItem('emisafe_reports', JSON.stringify(history.slice(0, 10)));
    } catch (err) {
      showToast(err.message || 'Failed to submit report. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '🚨 Submit Emergency Report';
    }
  });
}

function showSuccess(reportId) {
  document.getElementById('report-form-section').classList.add('hidden');
  const successEl = document.getElementById('success-section');
  successEl.classList.remove('hidden');
  document.getElementById('report-id-display').textContent = reportId;

  // Copy button
  document.getElementById('copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(reportId).then(() => {
      showToast('Report ID copied to clipboard!', 'success');
    });
  });
}
