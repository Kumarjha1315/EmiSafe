const express = require('express');
const jwt = require('jsonwebtoken');
const { db } = require('../config/db');

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
    process.env.JWT_SECRET || 'emisafe_secret_key',
    { expiresIn: '12h' }
  );

  res.json({ token, role: 'dispatcher', loginId });
});

/**
 * POST /api/auth/responder-login
 * Field responder lookup by badgeId + email in Firestore; returns a short-lived token.
 */
router.post('/responder-login', async (req, res) => {
  const { badgeId, email } = req.body;

  if (!badgeId || !email) {
    return res.status(400).json({ error: 'Badge ID and email are required.' });
  }

  try {
    const snapshot = await db
      .collection('responders')
      .where('badgeId', '==', badgeId.trim())
      .where('email', '==', email.trim().toLowerCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'No responder found with these credentials.' });
    }

    const doc = snapshot.docs[0];
    const responderData = doc.data();
    const responder = { id: doc.id, _id: doc.id, ...responderData };

    if (responder.assignedIncident) {
      const incDoc = await db.collection('incidents').doc(responder.assignedIncident).get();
      if (incDoc.exists) {
        responder.assignedIncident = { id: incDoc.id, _id: incDoc.id, ...incDoc.data() };
      }
    }

    const token = jwt.sign(
      { role: 'responder', id: responder.id },
      process.env.JWT_SECRET || 'emisafe_secret_key',
      { expiresIn: '24h' }
    );

    res.json({ token, role: 'responder', responder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
