const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true,
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
  city: {
    type: String,
    trim: true,
    default: null,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
  },
  pricePerTicket: {
    type: Number,
    required: true,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending',
    index: true,
  },
  upiTransactionId: {
    type: String,
    default: null,
  },
  ticketIds: [
    {
      type: String,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.model('Order', orderSchema);
