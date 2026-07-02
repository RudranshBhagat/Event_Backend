const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  orderId: {
    type: String,
    required: true,
    index: true,
  },
  ticketNumber: {
    type: Number,
    required: true, // 1, 2, 3... within the order
  },
  totalInOrder: {
    type: Number,
    required: true, // total tickets in this order
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  ticketType: {
    type: String,
    enum: ['General', 'VIP'],
    default: 'General',
  },
  paymentStatus: {
    type: String,
    enum: ['paid', 'pending'],
    default: 'paid',
    index: true,
  },

  // ── Attendance tracking ──────────────────────────────────────
  used: {
    type: Boolean,
    default: false,
    index: true,
  },
  usedAt: {
    type: Date,
    default: null,
  },
  checkedInBy: {
    type: String,
    default: null,
  },
  scanCount: {
    type: Number,
    default: 0,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Ticket', ticketSchema);
