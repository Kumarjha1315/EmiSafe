const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');
const { broadcast } = require('../ws/socketHandler');

const router = express.Router();

// Multer setup — store uploads in server/uploads/
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `incident-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

/**
 * Helper: Populate assignedResponder document onto an incident object.
 */
async function populateIncident(incidentData, incidentId) {
  const incident = { id: incidentId, _id: incidentId, ...incidentData };
  if (incident.assignedResponder) {
    if (typeof incident.assignedResponder === 'string') {
      const respDoc = await db.collection('responders').doc(incident.assignedResponder).get();
      if (respDoc.exists) {
        const respData = respDoc.data();
        incident.assignedResponder = {
          id: respDoc.id,
          _id: respDoc.id,
          fullName: respData.fullName,
          department: respData.department,
          currentLocation: respData.currentLocation,
          status: respData.status,
          badgeId: respData.badgeId,
        };
      }
    }
  }
  return incident;
}

// ─── PUBLIC ────────────────────────────────────────────────────────────────

/**
 * POST /api/incidents
 * Citizen submits a new incident report.
 */
router.post('/', upload.single('media'), async (req, res) => {
  try {
    const { category, description, lat, lng, address, reporterName, reporterPhone } = req.body;

    if (!category || !description || !lat || !lng || !reporterName || !reporterPhone) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const reportId = 'EMI-' + uuidv4().substring(0, 8).toUpperCase();
    const now = new Date().toISOString();

    const incidentData = {
      reportId,
      category,
      description,
      location: { lat: parseFloat(lat), lng: parseFloat(lng), address: address || '' },
      reporterName,
      reporterPhone,
      mediaUrl: req.file ? `/uploads/${req.file.filename}` : null,
      status: 'Received',
      assignedResponder: null,
      dispatchedAt: null,
      arrivedAt: null,
      resolvedAt: null,
      auditLog: [
        {
          action: 'Incident reported by citizen',
          actor: reporterName,
          actorRole: 'Citizen',
          newStatus: 'Received',
          timestamp: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('incidents').add(incidentData);
    const incident = { id: docRef.id, _id: docRef.id, ...incidentData };

    // Broadcast new incident to dispatcher
    broadcast({ type: 'new_incident', data: incident });

    res.status(201).json({ reportId: incident.reportId, incidentId: docRef.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create incident.' });
  }
});

/**
 * GET /api/incidents/:reportId/public
 * Public citizen tracking lookup by reportId.
 */
router.get('/:reportId/public', async (req, res) => {
  try {
    const snapshot = await db
      .collection('incidents')
      .where('reportId', '==', req.params.reportId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    const doc = snapshot.docs[0];
    const incident = await populateIncident(doc.data(), doc.id);
    res.json(incident);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── DISPATCHER PROTECTED ──────────────────────────────────────────────────

/**
 * GET /api/incidents
 * List all incidents (dispatcher, optionally filtered by status).
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    let query = db.collection('incidents');
    if (req.query.status) query = query.where('status', '==', req.query.status);
    if (req.query.category) query = query.where('category', '==', req.query.category);

    const snapshot = await query.get();
    let incidents = await Promise.all(
      snapshot.docs.map((doc) => populateIncident(doc.data(), doc.id))
    );

    // Sort descending by createdAt
    incidents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(incidents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/**
 * GET /api/incidents/:id
 * Get a single incident by Firestore document ID.
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const doc = await db.collection('incidents').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Incident not found.' });

    const incident = await populateIncident(doc.data(), doc.id);
    res.json(incident);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/**
 * PATCH /api/incidents/:id/assign
 * Dispatcher assigns a responder to an incident.
 */
router.patch('/:id/assign', authMiddleware, async (req, res) => {
  try {
    const { responderId } = req.body;
    const incRef = db.collection('incidents').doc(req.params.id);
    const incDoc = await incRef.get();
    if (!incDoc.exists) return res.status(404).json({ error: 'Incident not found.' });

    const respRef = db.collection('responders').doc(responderId);
    const respDoc = await respRef.get();
    if (!respDoc.exists) return res.status(404).json({ error: 'Responder not found.' });

    const responder = respDoc.data();
    const incident = incDoc.data();
    const now = new Date().toISOString();

    // Release previous assignment if any
    if (responder.assignedIncident && responder.assignedIncident !== req.params.id) {
      await db.collection('incidents').doc(responder.assignedIncident).update({
        assignedResponder: null,
        status: 'Received',
        updatedAt: now,
      });
    }

    // Update responder status to Busy and set assignedIncident
    await respRef.update({
      status: 'Busy',
      assignedIncident: req.params.id,
      updatedAt: now,
    });

    const auditLog = incident.auditLog || [];
    auditLog.push({
      action: `Responder ${responder.fullName} (${responder.badgeId}) assigned`,
      actor: 'Dispatcher',
      actorRole: 'Dispatcher',
      previousStatus: incident.status,
      newStatus: 'En Route',
      timestamp: now,
    });

    const updatePayload = {
      assignedResponder: responderId,
      status: 'En Route',
      dispatchedAt: now,
      auditLog,
      updatedAt: now,
    };

    await incRef.update(updatePayload);

    const updatedDoc = await incRef.get();
    const populated = await populateIncident(updatedDoc.data(), req.params.id);
    broadcast({ type: 'incident_update', data: populated });

    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign responder.' });
  }
});

/**
 * PATCH /api/incidents/:id/status
 * Update incident status (responder portal or dispatcher).
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, actor, actorRole } = req.body;
    const validStatuses = ['Received', 'En Route', 'On Scene', 'Resolved'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    const incRef = db.collection('incidents').doc(req.params.id);
    const incDoc = await incRef.get();
    if (!incDoc.exists) return res.status(404).json({ error: 'Incident not found.' });

    const incident = incDoc.data();
    const previousStatus = incident.status;
    const now = new Date().toISOString();

    const updatePayload = {
      status,
      updatedAt: now,
    };

    if (status === 'On Scene' && !incident.arrivedAt) {
      updatePayload.arrivedAt = now;
    }

    if (status === 'Resolved' && !incident.resolvedAt) {
      updatePayload.resolvedAt = now;
      if (incident.assignedResponder) {
        const respRef = db.collection('responders').doc(incident.assignedResponder);
        const respDoc = await respRef.get();
        if (respDoc.exists) {
          const rData = respDoc.data();
          const completedIncidents = (rData.completedIncidents || 0) + 1;
          let addedMinutes = 0;
          if (incident.dispatchedAt && (updatePayload.arrivedAt || incident.arrivedAt)) {
            const arr = new Date(updatePayload.arrivedAt || incident.arrivedAt);
            const disp = new Date(incident.dispatchedAt);
            addedMinutes = Math.round((arr - disp) / 60000);
          }
          const totalResponseTimeMinutes = (rData.totalResponseTimeMinutes || 0) + addedMinutes;

          await respRef.update({
            status: 'Available',
            assignedIncident: null,
            completedIncidents,
            totalResponseTimeMinutes,
            updatedAt: now,
          });
        }
      }
    }

    const auditLog = incident.auditLog || [];
    auditLog.push({
      action: `Status changed to ${status}`,
      actor: actor || 'System',
      actorRole: actorRole || 'System',
      previousStatus,
      newStatus: status,
      timestamp: now,
    });
    updatePayload.auditLog = auditLog;

    await incRef.update(updatePayload);

    const updatedDoc = await incRef.get();
    const populated = await populateIncident(updatedDoc.data(), req.params.id);
    broadcast({ type: 'incident_update', data: populated });

    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

module.exports = router;
