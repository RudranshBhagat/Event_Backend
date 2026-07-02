const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const Ticket = require('../models/Ticket');
const Order = require('../models/Order');
const { sendMultiTicketEmail } = require('../services/emailService');

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/validate-ticket
// Gate scanning endpoint — atomically marks ticket as used
// Body: { ticketId, adminName? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/validate-ticket', adminAuth, async (req, res) => {
  try {
    const { ticketId, adminName = 'Gate' } = req.body;

    if (!ticketId || typeof ticketId !== 'string') {
      return res.status(400).json({ valid: false, code: 'BAD_REQUEST', reason: 'ticketId is required.' });
    }

    const ticket = await Ticket.findOne({ ticketId: ticketId.trim().toUpperCase() })
      .catch(() => Ticket.findOne({ ticketId: ticketId.trim() })); // fallback without case change

    // Try case-insensitive lookup
    const foundTicket = await Ticket.findOne({
      ticketId: { $regex: new RegExp(`^${ticketId.trim()}$`, 'i') },
    });

    if (!foundTicket) {
      return res.json({
        valid: false,
        code: 'NOT_FOUND',
        reason: 'Ticket not found. Please check the QR code.',
      });
    }

    if (foundTicket.paymentStatus !== 'paid') {
      return res.json({
        valid: false,
        code: 'UNPAID',
        reason: 'Payment was not completed for this ticket.',
        attendeeName: foundTicket.name,
      });
    }

    // ── Already used — increment scan count and return context ────
    if (foundTicket.used) {
      await Ticket.updateOne({ ticketId: foundTicket.ticketId }, { $inc: { scanCount: 1 } });

      return res.json({
        valid: false,
        code: 'ALREADY_USED',
        reason: 'This ticket has already been used for entry.',
        attendeeName: foundTicket.name,
        ticketType: foundTicket.ticketType,
        ticketNumber: foundTicket.ticketNumber,
        totalInOrder: foundTicket.totalInOrder,
        usedAt: foundTicket.usedAt,
        checkedInBy: foundTicket.checkedInBy,
      });
    }

    // ── Atomic update — prevents race conditions at multiple gates ─
    const updated = await Ticket.findOneAndUpdate(
      { ticketId: foundTicket.ticketId, used: false },
      {
        $set: {
          used: true,
          usedAt: new Date(),
          checkedInBy: adminName,
        },
        $inc: { scanCount: 1 },
      },
      { new: true }
    );

    if (!updated) {
      // Another gate scanned the same ticket at the same moment
      const refreshed = await Ticket.findOne({ ticketId: foundTicket.ticketId });
      return res.json({
        valid: false,
        code: 'RACE_CONDITION',
        reason: 'This ticket was just scanned at another gate.',
        attendeeName: foundTicket.name,
        ticketNumber: foundTicket.ticketNumber,
        totalInOrder: foundTicket.totalInOrder,
        usedAt: refreshed?.usedAt,
      });
    }

    return res.json({
      valid: true,
      attendeeName: updated.name,
      ticketType: updated.ticketType,
      ticketNumber: updated.ticketNumber,
      totalInOrder: updated.totalInOrder,
      checkedInAt: updated.usedAt.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
  } catch (err) {
    console.error('Validate ticket error:', err);
    return res.status(500).json({ valid: false, code: 'SERVER_ERROR', reason: 'Server error. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/stats
// Live attendance dashboard numbers
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [totalTickets, checkedIn, totalOrders, generalSold, vipSold] = await Promise.all([
      Ticket.countDocuments({ paymentStatus: 'paid' }),
      Ticket.countDocuments({ paymentStatus: 'paid', used: true }),
      Order.countDocuments({ paymentStatus: 'paid' }),
      Ticket.countDocuments({ paymentStatus: 'paid', ticketType: 'General' }),
      Ticket.countDocuments({ paymentStatus: 'paid', ticketType: 'VIP' }),
    ]);

    return res.json({
      success: true,
      totalTickets,
      checkedIn,
      remaining: totalTickets - checkedIn,
      totalOrders,
      generalSold,
      vipSold,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/all-tickets
// Paginated list with filters
// Query params: page, limit, used, ticketType, search (name/email/ticketId)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/all-tickets', adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10));
    const skip = (page - 1) * limit;

    const filter = { paymentStatus: 'paid' };

    if (req.query.used === 'true') filter.used = true;
    else if (req.query.used === 'false') filter.used = false;

    if (req.query.ticketType) filter.ticketType = req.query.ticketType;

    if (req.query.search) {
      const s = req.query.search.trim();
      filter.$or = [
        { ticketId: { $regex: s, $options: 'i' } },
        { name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { orderId: { $regex: s, $options: 'i' } },
      ];
    }

    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v'),
      Ticket.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      tickets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('All tickets error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/pending-upi
// Returns all orders with a upiTransactionId in 'pending' status
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pending-upi', adminAuth, async (req, res) => {
  try {
    const orders = await Order.find({
      upiTransactionId: { $ne: null },
      paymentStatus: 'pending',
    }).sort({ createdAt: -1 });

    return res.json({ success: true, orders });
  } catch (err) {
    console.error('Pending UPI orders error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/approve-upi
// Approves a pending UPI order, generates Ticket documents, and emails tickets
// ─────────────────────────────────────────────────────────────────────────────
router.post('/approve-upi', adminAuth, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'OrderId is required.' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already marked as paid.' });
    }

    // Generate Tickets
    const ticketIds = [];
    for (let i = 0; i < order.quantity; i++) {
      const ticketId = generateTicketId(order.name, orderId, i);

      await Ticket.create({
        ticketId,
        orderId,
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

    // Update Order
    order.paymentStatus = 'paid';
    order.ticketIds = ticketIds;
    await order.save();

    // Send email (fire and forget)
    sendMultiTicketEmail(order, ticketIds).catch((err) =>
      console.error('Email error during UPI approval (non-fatal):', err.message)
    );

    return res.json({ success: true, message: 'Order approved and tickets generated successfully.', ticketIds });
  } catch (err) {
    console.error('Approve UPI error:', err);
    return res.status(500).json({ success: false, message: 'Server error during approval.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/reject-upi
// Rejects a pending UPI order (marks failed)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reject-upi', adminAuth, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'OrderId is required.' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already marked as paid.' });
    }

    order.paymentStatus = 'failed';
    await order.save();

    return res.json({ success: true, message: 'Order payment rejected.' });
  } catch (err) {
    console.error('Reject UPI error:', err);
    return res.status(500).json({ success: false, message: 'Server error during rejection.' });
  }
});

module.exports = router;
