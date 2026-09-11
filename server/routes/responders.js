const express = require('express');
const { db } = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');
const { broadcast } = require('../ws/socketHandler');

const router = express.Router();

/**
 * Helper: Populate assignedIncident object onto responder.
 */
async function populateResponder(respData, respId) {
  const responder = { id: respId, _id: respId, ...respData };
  if (responder.assignedIncident) {
    if (typeof responder.assignedIncident === 'string') {
      const incDoc = await db.collection('incidents').doc(responder.assignedIncident).get();
      if (incDoc.exists) {
        const incData = incDoc.data();
        responder.assignedIncident = {
          id: incDoc.id,
          _id: incDoc.id,
          reportId: incData.reportId,
          category: incData.category,
          status: incData.status,
        };
      }
    }
  }
  return responder;
}

// ─── PUBLIC ────────────────────────────────────────────────────────────────

/**
 * POST /api/responders/register
 * Field responder self-registration. Status defaults to 'Pending'.
 */
router.post('/register', async (req, res) => {
  try {
    const { department, fullName, badgeId, email, phone, yearsOfExperience } = req.body;

    if (!department || !fullName || !badgeId || !email || !phone || yearsOfExperience === undefined) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const badgeCheck = await db
      .collection('responders')
      .where('badgeId', '==', badgeId.trim())
      .limit(1)
      .get();

    const emailCheck = await db
      .collection('responders')
      .where('email', '==', email.trim().toLowerCase())
      .limit(1)
      .get();

    if (!badgeCheck.empty || !emailCheck.empty) {
      return res.status(409).json({ error: 'Badge ID or email already registered.' });
    }

    const now = new Date().toISOString();
    const responderData = {
      department,
      fullName: fullName.trim(),
      badgeId: badgeId.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      yearsOfExperience: parseInt(yearsOfExperience),
      status: 'Pending',
      currentLocation: { lat: null, lng: null },
      assignedIncident: null,
      completedIncidents: 0,
      totalResponseTimeMinutes: 0,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('responders').add(responderData);
    const responder = { id: docRef.id, _id: docRef.id, ...responderData };

    // Notify dispatcher of new registration
    broadcast({ type: 'new_responder', data: responder });

    res.status(201).json({ message: 'Registration successful. Awaiting dispatcher verification.', responder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

/**
 * PATCH /api/responders/:id/location
 * Field responder publishes live GPS location.
 */
router.patch('/:id/location', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const respRef = db.collection('responders').doc(req.params.id);
    const doc = await respRef.get();

    if (!doc.exists) return res.status(404).json({ error: 'Responder not found.' });

    const now = new Date().toISOString();
    await respRef.update({
      currentLocation: { lat: parseFloat(lat), lng: parseFloat(lng) },
      updatedAt: now,
    });

    const rData = doc.data();
    broadcast({
      type: 'responder_location',
      data: { responderId: req.params.id, lat, lng, incidentId: rData.assignedIncident },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update location.' });
  }
});

// ─── DISPATCHER PROTECTED ──────────────────────────────────────────────────

/**
 * GET /api/responders
 * List all responders (dispatcher).
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    let query = db.collection('responders');
    if (req.query.status) query = query.where('status', '==', req.query.status);
    if (req.query.department) query = query.where('department', '==', req.query.department);

    const snapshot = await query.get();
    let responders = await Promise.all(
      snapshot.docs.map((doc) => populateResponder(doc.data(), doc.id))
    );

    // Sort descending by createdAt
    responders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(responders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/**
 * PATCH /api/responders/:id/status
 * Update responder operational status (dispatcher).
 */
router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['Pending', 'Available', 'Busy', 'Offline'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const respRef = db.collection('responders').doc(req.params.id);
    const doc = await respRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Responder not found.' });

    const now = new Date().toISOString();
    await respRef.update({ status, updatedAt: now });

    const updatedDoc = await respRef.get();
    const responder = await populateResponder(updatedDoc.data(), req.params.id);

    broadcast({ type: 'responder_update', data: responder });
    res.json(responder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

/**
 * DELETE /api/responders/:id
 * Remove a responder (dispatcher).
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await db.collection('responders').doc(req.params.id).delete();
    res.json({ message: 'Responder removed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete responder.' });
  }
});

module.exports = router;
