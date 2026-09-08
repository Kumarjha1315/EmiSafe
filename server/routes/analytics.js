const express = require('express');
const Incident = require('../models/Incident');
const Responder = require('../models/Responder');
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
    const [totalIncidents, activeIncidents, resolvedIncidents, availableResponders, totalResponders] =
      await Promise.all([
        Incident.countDocuments(),
        Incident.countDocuments({ status: { $in: ['Received', 'En Route', 'On Scene'] } }),
        Incident.countDocuments({ status: 'Resolved' }),
        Responder.countDocuments({ status: 'Available' }),
        Responder.countDocuments({ status: { $ne: 'Pending' } }),
      ]);

    // Average response time (dispatchedAt → arrivedAt) in minutes
    const rtAgg = await Incident.aggregate([
      { $match: { dispatchedAt: { $ne: null }, arrivedAt: { $ne: null } } },
      {
        $group: {
          _id: null,
          avgMs: { $avg: { $subtract: ['$arrivedAt', '$dispatchedAt'] } },
        },
      },
    ]);
    const avgResponseTime = rtAgg.length ? Math.round(rtAgg[0].avgMs / 60000) : 0;

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
    const data = await Incident.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    res.json(data.map((d) => ({ category: d._id, count: d.count })));
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
    const data = await Incident.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    res.json(data.map((d) => ({ status: d._id, count: d.count })));
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
    const data = await Incident.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.json(data.map((d) => ({ date: d._id, count: d.count })));
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
    const data = await Incident.aggregate([
      { $match: { dispatchedAt: { $ne: null } } },
      {
        $group: {
          _id: '$category',
          avgDispatchTime: {
            $avg: { $subtract: ['$dispatchedAt', '$createdAt'] },
          },
          avgArrivalTime: {
            $avg: {
              $cond: [
                { $ne: ['$arrivedAt', null] },
                { $subtract: ['$arrivedAt', '$dispatchedAt'] },
                null,
              ],
            },
          },
        },
      },
    ]);
    res.json(
      data.map((d) => ({
        category: d._id,
        avgDispatchMinutes: Math.round((d.avgDispatchTime || 0) / 60000),
        avgArrivalMinutes: Math.round((d.avgArrivalTime || 0) / 60000),
      }))
    );
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
    const incidents = await Incident.find({}, 'location category status');
    res.json(
      incidents.map((i) => ({
        lat: i.location.lat,
        lng: i.location.lng,
        category: i.category,
        status: i.status,
      }))
    );
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
    const responders = await Responder.find({ status: { $ne: 'Pending' } })
      .sort({ completedIncidents: -1 })
      .limit(20)
      .lean();

    res.json(
      responders.map((r) => ({
        id: r._id,
        fullName: r.fullName,
        department: r.department,
        badgeId: r.badgeId,
        status: r.status,
        completedIncidents: r.completedIncidents,
        avgResponseTime:
          r.completedIncidents > 0
            ? Math.round(r.totalResponseTimeMinutes / r.completedIncidents)
            : 0,
        yearsOfExperience: r.yearsOfExperience,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch responder performance.' });
  }
});

module.exports = router;
