const express = require('express');
const Responder = require('../models/Responder');
const authMiddleware = require('../middleware/authMiddleware');
const { broadcast } = require('../ws/socketHandler');

const router = express.Router();

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

    const existing = await Responder.findOne({ $or: [{ badgeId }, { email: email.toLowerCase() }] });
    if (existing) {
      return res.status(409).json({ error: 'Badge ID or email already registered.' });
    }

    const responder = new Responder({
      department,
      fullName,
      badgeId,
      email,
      phone,
      yearsOfExperience: parseInt(yearsOfExperience),
    });

    await responder.save();

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
 * Field responder publishes their live GPS location.
 */
router.patch('/:id/location', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const responder = await Responder.findByIdAndUpdate(
      req.params.id,
      { currentLocation: { lat, lng } },
      { new: true }
    );
    if (!responder) return res.status(404).json({ error: 'Responder not found.' });

    broadcast({
      type: 'responder_location',
      data: { responderId: responder._id, lat, lng, incidentId: responder.assignedIncident },
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
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.department) filter.department = req.query.department;

    const responders = await Responder.find(filter)
      .populate('assignedIncident', 'reportId category status')
      .sort({ createdAt: -1 });

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

    const responder = await Responder.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!responder) return res.status(404).json({ error: 'Responder not found.' });

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
    await Responder.findByIdAndDelete(req.params.id);
    res.json({ message: 'Responder removed.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete responder.' });
  }
});

module.exports = router;
