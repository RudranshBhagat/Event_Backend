const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');
const { sendMultiTicketEmail } = require('../services/emailService');

/**
 * GET /api/recover-ticket?email=user@example.com
 * Looks up all paid tickets for this email and re-sends the multi-ticket email.
 */
router.get('/', async (req, res) => {
  try {
    const email = (req.query.email || '').toLowerCase().trim();

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

    // ── Find all paid tickets for this email ──────────────────────
    const tickets = await Ticket.find({ email, paymentStatus: 'paid' }).sort({ createdAt: 1 });

    if (tickets.length > 0) {
      // Find the most recent paid order for display context
      const order = await Order.findOne({ email, paymentStatus: 'paid' }).sort({ createdAt: -1 });

      if (order) {
        // Re-send all ticket IDs from the tickets found (handles multiple orders too)
        const ticketIds = tickets.map((t) => t.ticketId);
        await sendMultiTicketEmail(order, ticketIds);
      }

      return res.json({
        success: true,
        found: true,
        resent: true,
        quantity: tickets.length,
        message: `We've resent your ${tickets.length} ticket${tickets.length > 1 ? 's' : ''} to ${email}`,
      });
    }

    // ── Edge case: paid order but no tickets generated yet ────────
    const pendingOrder = await Order.findOne({
      email,
      paymentStatus: 'paid',
      $expr: { $eq: [{ $size: '$ticketIds' }, 0] },
    });

    if (pendingOrder) {
      return res.status(202).json({
        success: false,
        found: false,
        message: 'We found your payment but tickets are still being generated. Please wait a moment and try again.',
      });
    }

    // ── Not found ─────────────────────────────────────────────────
    return res.json({
      success: true,
      found: false,
      message: 'No tickets found for this email. Please check the address or contact support.',
    });
  } catch (err) {
    console.error('Recover ticket error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

module.exports = router;
