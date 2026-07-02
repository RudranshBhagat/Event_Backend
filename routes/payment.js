const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');
const { sendMultiTicketEmail } = require('../services/emailService');

/**
 * Generate a unique ticket ID.
 * Format: EVT-<NAME4>-<ORDER4>-<NUM>-<TS>
 */
const generateTicketId = (name, orderId, index) => {
  const namePart = name
    .replace(/\s+/g, '')
    .slice(0, 4)
    .toUpperCase()
    .padEnd(4, 'X');
  const orderPart = orderId.slice(-4).toUpperCase();
  const tsPart = Date.now().toString(36).toUpperCase();
  return `EVT-${namePart}-${orderPart}-${index + 1}-${tsPart}`;
};

/**
 * POST /api/verify-payment
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId }
 *
 * For development (no Razorpay keys): Body can contain { orderId, mock: true }
 * which skips signature verification.
 */
router.post('/', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
      mock,
    } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required.' });
    }

    // ── Fetch order ───────────────────────────────────────────────
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (order.paymentStatus === 'paid') {
      // Already processed — return existing ticketIds (idempotent)
      return res.json({ success: true, orderId, ticketIds: order.ticketIds });
    }

    // ── Signature verification ────────────────────────────────────
    const isDev = mock === true && !process.env.RAZORPAY_KEY_SECRET;

    if (!isDev) {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Payment verification fields missing.' });
      }

      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        await Order.findOneAndUpdate({ orderId }, { paymentStatus: 'failed' });
        return res.status(400).json({ success: false, message: 'Payment signature verification failed.' });
      }
    } else {
      console.warn('⚠️  Mock payment verification — skipping Razorpay signature check.');
    }

    const paymentId = razorpay_payment_id || `mock_pay_${Date.now()}`;

    // ── Create one Ticket document per quantity ───────────────────
    const ticketIds = [];

    for (let i = 0; i < order.quantity; i++) {
      const ticketId = generateTicketId(order.name, orderId, i);

      await Ticket.create({
        ticketId,
        orderId,
        razorpayPaymentId: paymentId,
        ticketNumber: i + 1,
        totalInOrder: order.quantity,
        name: order.name,
        email: order.email,
        phone: order.phone,
        ticketType: order.ticketType,
        paymentStatus: 'paid',
        used: false,
        scanCount: 0,
      });

      ticketIds.push(ticketId);
    }

    // ── Update order ──────────────────────────────────────────────
    await Order.findOneAndUpdate(
      { orderId },
      {
        paymentStatus: 'paid',
        ticketIds,
        razorpayPaymentId: paymentId,
      }
    );

    // ── Send email (fire and forget) ──────────────────────────────
    sendMultiTicketEmail(order, ticketIds).catch((err) =>
      console.error('Email error (non-fatal):', err.message)
    );

    return res.json({ success: true, orderId, ticketIds });
  } catch (err) {
    console.error('Verify payment error:', err);
    return res.status(500).json({ success: false, message: 'Server error during payment verification.' });
  }
});

module.exports = router;
