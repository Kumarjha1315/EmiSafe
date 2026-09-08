const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Incident = require('../models/Incident');
const Responder = require('../models/Responder');
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

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

    const incident = new Incident({
      category,
      description,
      location: { lat: parseFloat(lat), lng: parseFloat(lng), address: address || '' },
      reporterName,
      reporterPhone,
      mediaUrl: req.file ? `/uploads/${req.file.filename}` : null,
      auditLog: [
        {
          action: 'Incident reported by citizen',
          actor: reporterName,
          actorRole: 'Citizen',
          newStatus: 'Received',
        },
      ],
    });

    await incident.save();

    // Broadcast new incident to dispatcher
    broadcast({ type: 'new_incident', data: incident });

    res.status(201).json({ reportId: incident.reportId, incidentId: incident._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create incident.' });
  }
});

/**
 * GET /api/incidents/:reportId/public
 * Public citizen tracking lookup by reportId (not MongoDB _id).
 */
router.get('/:reportId/public', async (req, res) => {
  try {
    const incident = await Incident.findOne({ reportId: req.params.reportId })
      .populate('assignedResponder', 'fullName department currentLocation status');

    if (!incident) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

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
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;

    const incidents = await Incident.find(filter)
      .populate('assignedResponder', 'fullName department currentLocation status badgeId')
      .sort({ createdAt: -1 });

    res.json(incidents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/**
 * GET /api/incidents/:id
 * Get a single incident by MongoDB _id (dispatcher).
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id)
      .populate('assignedResponder');
    if (!incident) return res.status(404).json({ error: 'Incident not found.' });
    res.json(incident);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/**
 * PATCH /api/incidents/:id/assign
 * Dispatcher assigns (and optionally auto-verifies) a responder to an incident.
 */
router.patch('/:id/assign', authMiddleware, async (req, res) => {
  try {
    const { responderId } = req.body;
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found.' });

    const responder = await Responder.findById(responderId);
    if (!responder) return res.status(404).json({ error: 'Responder not found.' });

    // If responder is pending, auto-verify upon assignment
    if (responder.status === 'Pending') {
      responder.status = 'Available';
    }

    // Release previous assignment if any
    if (responder.assignedIncident) {
      await Incident.findByIdAndUpdate(responder.assignedIncident, {
        assignedResponder: null,
        status: 'Received',
      });
    }

    responder.status = 'Busy';
    responder.assignedIncident = incident._id;
    await responder.save();

    incident.assignedResponder = responder._id;
    incident.status = 'En Route';
    incident.dispatchedAt = new Date();
    incident.auditLog.push({
      action: `Responder ${responder.fullName} (${responder.badgeId}) assigned`,
      actor: 'Dispatcher',
      actorRole: 'Dispatcher',
      previousStatus: incident.status,
      newStatus: 'En Route',
    });
    await incident.save();

    const populated = await Incident.findById(incident._id).populate('assignedResponder');
    broadcast({ type: 'incident_update', data: populated });

    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign responder.' });
  }
});

/**
 * PATCH /api/incidents/:id/status
 * Update incident status (used by responder portal or dispatcher).
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, actor, actorRole } = req.body;
    const validStatuses = ['Received', 'En Route', 'On Scene', 'Resolved'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found.' });

    const previousStatus = incident.status;
    incident.status = status;

    // Timestamp tracking
    if (status === 'On Scene' && !incident.arrivedAt) incident.arrivedAt = new Date();
    if (status === 'Resolved' && !incident.resolvedAt) {
      incident.resolvedAt = new Date();
      // Update responder stats
      if (incident.assignedResponder) {
        const responder = await Responder.findById(incident.assignedResponder);
        if (responder) {
          responder.status = 'Available';
          responder.assignedIncident = null;
          responder.completedIncidents += 1;
          if (incident.dispatchedAt && incident.arrivedAt) {
            responder.totalResponseTimeMinutes += Math.round(
              (incident.arrivedAt - incident.dispatchedAt) / 60000
            );
          }
          await responder.save();
        }
      }
    }

    incident.auditLog.push({
      action: `Status changed to ${status}`,
      actor: actor || 'System',
      actorRole: actorRole || 'System',
      previousStatus,
      newStatus: status,
    });

    await incident.save();
    const populated = await Incident.findById(incident._id).populate('assignedResponder');
    broadcast({ type: 'incident_update', data: populated });

    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

module.exports = router;
