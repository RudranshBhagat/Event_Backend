const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const { generateTicketPDF } = require('./ticketService');

// ── Transporter ───────────────────────────────────────────────────────────────
// const createTransporter = () =>
//   nodemailer.createTransport({
//     service: 'gmail',
//     auth: {
//       user: process.env.GMAIL_USER,
//       pass: process.env.GMAIL_APP_PASS,
//     },
//   });

const createTransporter = () =>
  nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS,
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    logger: true,
    debug: true,
  });

// ── HTML builder ─────────────────────────────────────────────────────────────
const buildMultiTicketEmailHTML = async (order, ticketIds) => {
  // Generate inline QR data URLs for each ticket
  const qrImages = await Promise.all(
    ticketIds.map((id) =>
      QRCode.toDataURL(id, { width: 180, margin: 2 })
    )
  );

  const ticketRows = ticketIds
    .map(
      (id, i) => `
      <div style="border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:16px;text-align:center;background:#F9FAFB;">
        <p style="margin:0 0 4px;font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">
          Ticket ${i + 1} of ${ticketIds.length}
        </p>
        <img src="${qrImages[i]}" alt="QR Code" width="160" style="display:block;margin:12px auto;" />
        <p style="margin:6px 0 0;font-size:11px;font-family:monospace;color:#374151;">${id}</p>
      </div>`
    )
    .join('');

  const accentColor = order.ticketType === 'VIP' ? '#7C3AED' : '#2563EB';
  const totalFormatted = `₹${(order.totalAmount || 0).toLocaleString('en-IN')}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr><td style="background:${accentColor};padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:24px;">🎉 You're In! &times;${ticketIds.length}</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,.85);font-size:14px;">${process.env.EVENT_NAME}</p>
        </td></tr>

        <!-- Booking summary -->
        <tr><td style="padding:24px 32px;">
          <h2 style="margin:0 0 16px;font-size:16px;color:#111827;">Booking Summary</h2>
          <table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;color:#374151;">
            <tr style="border-bottom:1px solid #F3F4F6;">
              <td style="font-weight:600;">Name</td><td>${order.name}</td>
            </tr>
            <tr style="border-bottom:1px solid #F3F4F6;">
              <td style="font-weight:600;">Ticket Type</td><td>${order.ticketType}</td>
            </tr>
            <tr style="border-bottom:1px solid #F3F4F6;">
              <td style="font-weight:600;">Quantity</td><td>${ticketIds.length} ticket${ticketIds.length > 1 ? 's' : ''}</td>
            </tr>
            <tr style="border-bottom:1px solid #F3F4F6;">
              <td style="font-weight:600;">Price Each</td><td>₹${order.pricePerTicket?.toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td style="font-weight:700;color:${accentColor};font-size:16px;">Total Paid</td>
              <td style="font-weight:700;color:${accentColor};font-size:16px;">${totalFormatted}</td>
            </tr>
          </table>
        </td></tr>

        <!-- QR Codes -->
        <tr><td style="padding:0 32px 24px;">
          <h2 style="margin:0 0 16px;font-size:16px;color:#111827;">
            Your ${ticketIds.length} Ticket${ticketIds.length > 1 ? 's' : ''}
          </h2>
          <p style="margin:0 0 16px;font-size:13px;color:#6B7280;">
            Each person should show their <strong>own</strong> QR at the entrance.
            Full PDF tickets are attached to this email.
          </p>
          ${ticketRows}
        </td></tr>

        <!-- Event details -->
        <tr><td style="background:#F9FAFB;padding:20px 32px;">
          <p style="margin:0;font-size:13px;color:#374151;">
            📅 <strong>Date:</strong> ${process.env.EVENT_DATE || 'TBD'}<br/>
            📍 <strong>Venue:</strong> ${process.env.EVENT_VENUE || 'TBD'}
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;text-align:center;font-size:12px;color:#9CA3AF;">
          Questions? Email us at
          <a href="mailto:${process.env.SUPPORT_EMAIL}" style="color:${accentColor};">${process.env.SUPPORT_EMAIL}</a><br/>
          <span style="font-size:11px;">Please check spam if you don't see the attachments within 2 minutes.</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

// ── Main send function ────────────────────────────────────────────────────────
const sendMultiTicketEmail = async (order, ticketIds) => {
  try {
    const transporter = createTransporter();

    // Build one PDF attachment per ticket
    const attachments = await Promise.all(
      ticketIds.map(async (ticketId, i) => {
        const pdfBuffer = await generateTicketPDF({
          ticketId,
          ticketNumber: i + 1,
          totalInOrder: ticketIds.length,
          name: order.name,
          email: order.email,
          ticketType: order.ticketType,
          orderId: order.orderId,
        });
        return {
          filename: `ticket-${i + 1}-of-${ticketIds.length}-${ticketId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        };
      })
    );

    const html = await buildMultiTicketEmailHTML(order, ticketIds);

    await transporter.sendMail({
      from: `"${process.env.EVENT_NAME}" <${process.env.GMAIL_USER}>`,
      to: order.email,
      subject: `🎟️ Your ${ticketIds.length} Ticket${ticketIds.length > 1 ? 's' : ''} for ${process.env.EVENT_NAME}`,
      html,
      attachments,
    });

    console.log(`✅ Email sent to ${order.email} with ${ticketIds.length} ticket(s).`);
  } catch (err) {
    // Non-fatal — log and continue
    console.error(`❌ Email send failed for ${order.email}:`, err.message);
  }
};

module.exports = { sendMultiTicketEmail };
