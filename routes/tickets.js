const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');
const { generateTicketPDF } = require('../services/ticketService');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/order/:orderId/tickets
// Returns all tickets for an order (used by Thank You page)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/order/:orderId/tickets', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const tickets = await Ticket.find({ orderId }).sort({ ticketNumber: 1 });

    return res.json({
      success: true,
      orderId: order.orderId,
      name: order.name,
      email: order.email,
      ticketType: order.ticketType,
      quantity: order.quantity,
      totalAmount: order.totalAmount,
      pricePerTicket: order.pricePerTicket,
      paymentStatus: order.paymentStatus,
      tickets: tickets.map((t) => ({
        ticketId: t.ticketId,
        ticketNumber: t.ticketNumber,
        totalInOrder: t.totalInOrder,
        ticketType: t.ticketType,
        used: t.used,
        usedAt: t.usedAt,
      })),
    });
  } catch (err) {
    console.error('Get order tickets error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ticket/:ticketId
// Returns single ticket details
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ticket/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await Ticket.findOne({ ticketId });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found.' });
    }

    return res.json({
      success: true,
      ticketId: ticket.ticketId,
      orderId: ticket.orderId,
      ticketNumber: ticket.ticketNumber,
      totalInOrder: ticket.totalInOrder,
      name: ticket.name,
      email: ticket.email,
      ticketType: ticket.ticketType,
      paymentStatus: ticket.paymentStatus,
      used: ticket.used,
      usedAt: ticket.usedAt,
    });
  } catch (err) {
    console.error('Get ticket error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/order/:orderId/download
// Streams a ZIP file containing one PDF per ticket
// ─────────────────────────────────────────────────────────────────────────────
router.get('/order/:orderId/download', async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId, paymentStatus: 'paid' });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Paid order not found.' });
    }

    const tickets = await Ticket.find({ orderId }).sort({ ticketNumber: 1 });
    if (!tickets.length) {
      return res.status(404).json({ success: false, message: 'No tickets found for this order.' });
    }

    // Set headers for ZIP download
    const safeEventName = (process.env.EVENT_NAME || 'tickets').replace(/\s+/g, '-');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeEventName}-${orderId}.zip"`
    );

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      console.error('Archiver error:', err);
      // Headers already sent, just destroy
      res.destroy();
    });

    archive.pipe(res);

    // Generate each PDF and append to archive
    for (const ticket of tickets) {
      const pdfBuffer = await generateTicketPDF({
        ticketId: ticket.ticketId,
        ticketNumber: ticket.ticketNumber,
        totalInOrder: ticket.totalInOrder,
        name: ticket.name,
        email: ticket.email,
        ticketType: ticket.ticketType,
        orderId,
      });

      archive.append(pdfBuffer, {
        name: `ticket-${ticket.ticketNumber}-of-${ticket.totalInOrder}-${ticket.ticketId}.pdf`,
      });
    }

    await archive.finalize();
  } catch (err) {
    console.error('Download error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to generate tickets.' });
    }
  }
});

/**
 * POST /api/submit-upi-payment
 * Body: { name, email, phone, city, ticketType, quantity, upiTransactionId }
 * Registers the order using the UPI Transaction ID as the Order ID.
 */
router.post('/submit-upi-payment', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      city,
      ticketType,
      quantity,
      upiTransactionId,
    } = req.body;

    // 1. Basic validation
    if (!name || !email || !phone || !ticketType || !quantity || !upiTransactionId) {
      return res.status(400).json({ success: false, message: 'Missing required order or payment details.' });
    }

    const cleanUpiTxnId = upiTransactionId.trim();
    if (!/^\d{12}$/.test(cleanUpiTxnId)) {
      return res.status(400).json({ success: false, message: 'Enter a valid 12-digit UPI Transaction ID / UTR.' });
    }

    const cleanPhone = phone.trim();
    if (!/^\d{10}$/.test(cleanPhone)) {
      return res.status(400).json({ success: false, message: 'Enter a valid 10-digit phone number.' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 10) {
      return res.status(400).json({ success: false, message: 'Quantity must be between 1 and 10.' });
    }

    // 2. Prevent duplicate submissions using UTR as orderId
    const existingOrder = await Order.findOne({ orderId: cleanUpiTxnId });
    if (existingOrder) {
      return res.status(400).json({ success: false, message: 'This transaction ID has already been submitted.' });
    }

    // 3. Pricing calculations
    const pricePerTicket = ticketType === 'VIP'
      ? parseInt(process.env.EVENT_PRICE_VIP || '1000', 10)
      : parseInt(process.env.EVENT_PRICE_GENERAL || '500', 10);
    const totalAmount = pricePerTicket * qty;

    // 4. Create database Order document (orderId is the UTR)
    const order = await Order.create({
      orderId: cleanUpiTxnId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: cleanPhone,
      city: city ? city.trim() : null,
      quantity: qty,
      pricePerTicket,
      totalAmount,
      paymentStatus: 'pending',
      upiTransactionId: cleanUpiTxnId,
      ticketIds: [],
    });

    return res.json({
      success: true,
      message: 'UPI payment reference submitted successfully. We will verify and process your tickets.',
      orderId: order.orderId,
    });
  } catch (err) {
    console.error('Submit UPI payment and create order error:', err);
    return res.status(500).json({ success: false, message: 'Server error while submitting payment details.' });
  }
});

module.exports = router;
