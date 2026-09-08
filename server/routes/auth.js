const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

/**
 * POST /api/auth/dispatcher-login
 * Validates fixed dispatcher credentials from env and returns a JWT.
 */
router.post('/dispatcher-login', (req, res) => {
  const { loginId, password } = req.body;

  if (!loginId || !password) {
    return res.status(400).json({ error: 'Login ID and password are required.' });
  }

  if (
    loginId !== process.env.DISPATCHER_ID ||
    password !== process.env.DISPATCHER_PASS
  ) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = jwt.sign(
    { role: 'dispatcher', id: loginId },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({ token, role: 'dispatcher', loginId });
});

/**
 * POST /api/auth/responder-login
 * Field responder lookup by badgeId + email; returns a short-lived token.
 */
router.post('/responder-login', async (req, res) => {
  const Responder = require('../models/Responder');
  const { badgeId, email } = req.body;

  if (!badgeId || !email) {
    return res.status(400).json({ error: 'Badge ID and email are required.' });
  }

  try {
    const responder = await Responder.findOne({
      badgeId: badgeId.trim(),
      email: email.trim().toLowerCase(),
    }).populate('assignedIncident');

    if (!responder) {
      return res.status(404).json({ error: 'No responder found with these credentials.' });
    }

    const token = jwt.sign(
      { role: 'responder', id: responder._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, role: 'responder', responder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
