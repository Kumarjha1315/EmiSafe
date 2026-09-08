const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const AuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actor: { type: String, default: 'System' },
    actorRole: {
      type: String,
      enum: ['Citizen', 'Dispatcher', 'Responder', 'System'],
      default: 'System',
    },
    previousStatus: { type: String, default: null },
    newStatus: { type: String, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const IncidentSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      unique: true,
      default: () => 'EMI-' + uuidv4().substring(0, 8).toUpperCase(),
    },
    category: {
      type: String,
      enum: ['Police', 'Fire', 'Ambulance', 'Disaster'],
      required: true,
    },
    description: { type: String, required: true },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      address: { type: String, default: '' },
    },
    reporterName: { type: String, required: true },
    reporterPhone: { type: String, required: true },
    mediaUrl: { type: String, default: null },
    status: {
      type: String,
      enum: ['Received', 'En Route', 'On Scene', 'Resolved'],
      default: 'Received',
    },
    assignedResponder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Responder',
      default: null,
    },
    dispatchedAt: { type: Date, default: null },
    arrivedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    auditLog: [AuditLogSchema],
  },
  { timestamps: true }
);

// Virtual: response time in minutes (dispatch to arrival)
IncidentSchema.virtual('responseTimeMinutes').get(function () {
  if (this.dispatchedAt && this.arrivedAt) {
    return Math.round((this.arrivedAt - this.dispatchedAt) / 60000);
  }
  return null;
});

IncidentSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Incident', IncidentSchema);
