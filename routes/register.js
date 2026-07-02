const express = require('express');
const router = express.Router();
const Order = require('../models/Order');

// ── Helper: generate a short human-readable order ID ─────────────────────────
const generateOrderId = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${ts}-${rand}`;
};

/**
 * POST /api/register
 * Body: { name, email, phone, ticketType, city, quantity }
 * Returns: { orderId, razorpayOrderId, totalAmount, quantity, ticketType, pricePerTicket }
 */
router.post('/', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This registration route is deprecated. Registration is now handled via the /submit-upi-payment route upon UTR submission.',
  });
});

module.exports = router;
