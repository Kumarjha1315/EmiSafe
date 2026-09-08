const mongoose = require('mongoose');

const ResponderSchema = new mongoose.Schema(
  {
    department: {
      type: String,
      enum: ['Police', 'Fire', 'Ambulance', 'Disaster'],
      required: true,
    },
    fullName: { type: String, required: true, trim: true },
    badgeId: { type: String, required: true, unique: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, required: true, trim: true },
    yearsOfExperience: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['Pending', 'Available', 'Busy', 'Offline'],
      default: 'Pending',
    },
    currentLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    assignedIncident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
      default: null,
    },
    completedIncidents: { type: Number, default: 0 },
    totalResponseTimeMinutes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Virtual: average response time
ResponderSchema.virtual('avgResponseTime').get(function () {
  if (this.completedIncidents === 0) return 0;
  return Math.round(this.totalResponseTimeMinutes / this.completedIncidents);
});

ResponderSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Responder', ResponderSchema);
