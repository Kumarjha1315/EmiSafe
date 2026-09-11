const express = require('express');
const { db } = require('../config/db');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// All analytics routes require dispatcher auth
router.use(authMiddleware);

/**
 * GET /api/analytics/summary
 * KPI scorecards: total, active, resolved, avg response time, available responders.
 */
router.get('/summary', async (req, res) => {
  try {
    const incSnapshot = await db.collection('incidents').get();
    const respSnapshot = await db.collection('responders').get();

    const incidents = incSnapshot.docs.map((doc) => doc.data());
    const responders = respSnapshot.docs.map((doc) => doc.data());

    const totalIncidents = incidents.length;
    const activeIncidents = incidents.filter((i) =>
      ['Received', 'En Route', 'On Scene'].includes(i.status)
    ).length;
    const resolvedIncidents = incidents.filter((i) => i.status === 'Resolved').length;

    const availableResponders = responders.filter((r) => r.status === 'Available').length;
    const totalResponders = responders.filter((r) => r.status !== 'Pending').length;

    // Average response time (dispatchedAt -> arrivedAt) in minutes
    let totalResponseMs = 0;
    let responseCount = 0;
    incidents.forEach((i) => {
      if (i.dispatchedAt && i.arrivedAt) {
        const diff = new Date(i.arrivedAt) - new Date(i.dispatchedAt);
        if (diff >= 0) {
          totalResponseMs += diff;
          responseCount++;
        }
      }
    });
    const avgResponseTime = responseCount > 0 ? Math.round(totalResponseMs / responseCount / 60000) : 0;

    res.json({
      totalIncidents,
      activeIncidents,
      resolvedIncidents,
      avgResponseTime,
      availableResponders,
      totalResponders,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch summary.' });
  }
});

/**
 * GET /api/analytics/by-type
 * Pie chart data: incident count per category.
 */
router.get('/by-type', async (req, res) => {
  try {
    const snapshot = await db.collection('incidents').get();
    const counts = {};

    snapshot.docs.forEach((doc) => {
      const cat = doc.data().category || 'Uncategorized';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const result = Object.keys(counts).map((cat) => ({
      category: cat,
      count: counts[cat],
    }));
    result.sort((a, b) => b.count - a.count);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch type breakdown.' });
  }
});

/**
 * GET /api/analytics/by-status
 * Donut chart data: incident count per status.
 */
router.get('/by-status', async (req, res) => {
  try {
    const snapshot = await db.collection('incidents').get();
    const counts = {};

    snapshot.docs.forEach((doc) => {
      const status = doc.data().status || 'Received';
      counts[status] = (counts[status] || 0) + 1;
    });

    const result = Object.keys(counts).map((st) => ({
      status: st,
      count: counts[st],
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch status breakdown.' });
  }
});

/**
 * GET /api/analytics/activity
 * Line chart: incident volume per day for the past 30 days.
 */
router.get('/activity', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const snapshot = await db.collection('incidents').get();

    const counts = {};
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const createdAt = new Date(data.createdAt);
      if (createdAt >= thirtyDaysAgo) {
        const dateStr = createdAt.toISOString().split('T')[0];
        counts[dateStr] = (counts[dateStr] || 0) + 1;
      }
    });

    const result = Object.keys(counts)
      .sort()
      .map((date) => ({ date, count: counts[date] }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch activity data.' });
  }
});

/**
 * GET /api/analytics/response-times
 * Double bar chart: avg dispatch time & avg field arrival time per category.
 */
router.get('/response-times', async (req, res) => {
  try {
    const snapshot = await db.collection('incidents').get();
    const stats = {};

    snapshot.docs.forEach((doc) => {
      const i = doc.data();
      const cat = i.category || 'Other';
      if (!stats[cat]) {
        stats[cat] = { dispatchSum: 0, dispatchCount: 0, arrivalSum: 0, arrivalCount: 0 };
      }

      if (i.dispatchedAt && i.createdAt) {
        const dispDiff = new Date(i.dispatchedAt) - new Date(i.createdAt);
        if (dispDiff >= 0) {
          stats[cat].dispatchSum += dispDiff;
          stats[cat].dispatchCount++;
        }
      }

      if (i.arrivedAt && i.dispatchedAt) {
        const arrDiff = new Date(i.arrivedAt) - new Date(i.dispatchedAt);
        if (arrDiff >= 0) {
          stats[cat].arrivalSum += arrDiff;
          stats[cat].arrivalCount++;
        }
      }
    });

    const result = Object.keys(stats).map((cat) => {
      const s = stats[cat];
      return {
        category: cat,
        avgDispatchMinutes: s.dispatchCount ? Math.round(s.dispatchSum / s.dispatchCount / 60000) : 0,
        avgArrivalMinutes: s.arrivalCount ? Math.round(s.arrivalSum / s.arrivalCount / 60000) : 0,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch response time data.' });
  }
});

/**
 * GET /api/analytics/heatmap
 * All incident coordinates for heatmap overlay.
 */
router.get('/heatmap', async (req, res) => {
  try {
    const snapshot = await db.collection('incidents').get();
    const result = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (data.location && data.location.lat && data.location.lng) {
          return {
            lat: data.location.lat,
            lng: data.location.lng,
            category: data.category,
            status: data.status,
          };
        }
        return null;
      })
      .filter(Boolean);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch heatmap data.' });
  }
});

/**
 * GET /api/analytics/responder-performance
 * Leaderboard: responders sorted by completed incidents.
 */
router.get('/responder-performance', async (req, res) => {
  try {
    const snapshot = await db.collection('responders').get();
    const responders = snapshot.docs
      .map((doc) => ({ id: doc.id, _id: doc.id, ...doc.data() }))
      .filter((r) => r.status !== 'Pending');

    responders.sort((a, b) => (b.completedIncidents || 0) - (a.completedIncidents || 0));

    const result = responders.slice(0, 20).map((r) => ({
      id: r.id,
      fullName: r.fullName,
      department: r.department,
      badgeId: r.badgeId,
      status: r.status,
      completedIncidents: r.completedIncidents || 0,
      avgResponseTime:
        r.completedIncidents > 0
          ? Math.round((r.totalResponseTimeMinutes || 0) / r.completedIncidents)
          : 0,
      yearsOfExperience: r.yearsOfExperience || 0,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch responder performance.' });
  }
});

module.exports = router;
