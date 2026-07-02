const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

/**
 * Generates a single ticket PDF as a Buffer.
 *
 * @param {Object} opts
 * @param {string} opts.ticketId
 * @param {number} opts.ticketNumber     - 1-based index within the order
 * @param {number} opts.totalInOrder     - total tickets in the order
 * @param {string} opts.name             - attendee name
 * @param {string} opts.email
 * @param {string} opts.ticketType       - 'General' | 'VIP'
 * @param {string} opts.orderId
 * @returns {Promise<Buffer>}
 */
const generateTicketPDF = async ({
  ticketId,
  ticketNumber,
  totalInOrder,
  name,
  email,
  ticketType,
  orderId,
}) => {
  // Generate QR code as a PNG data URL
  const qrDataUrl = await QRCode.toDataURL(ticketId, {
    width: 250,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });

  // Strip the data:image/png;base64, prefix to get raw base64
  const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
  const qrBuffer = Buffer.from(qrBase64, 'base64');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A5',           // 148 × 210 mm
      margin: 30,
      info: {
        Title: `Ticket ${ticketNumber} of ${totalInOrder} — ${process.env.EVENT_NAME}`,
        Author: process.env.EVENT_NAME,
      },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;   // ~420 pt for A5
    const accent = ticketType === 'VIP' ? '#7C3AED' : '#2563EB';

    // ── Header bar ───────────────────────────────────────────────
    doc.rect(0, 0, W, 55).fill(accent);

    doc.fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(process.env.EVENT_NAME || 'Event Ticket', 30, 12, { width: W - 60 });

    doc.fontSize(9)
      .font('Helvetica')
      .text(`Ticket ${ticketNumber} of ${totalInOrder}   •   ${ticketType.toUpperCase()}`, 30, 36, { width: W - 60 });

    // ── Event details ────────────────────────────────────────────
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Event Details', 30, 70);

    doc.fillColor('#374151').font('Helvetica').fontSize(10);
    const details = [
      ['Date', process.env.EVENT_DATE || 'TBD'],
      ['Venue', process.env.EVENT_VENUE || 'TBD'],
      ['Attendee', name],
      ['Email', email],
      ['Order ID', orderId],
    ];
    let y = 88;
    for (const [label, value] of details) {
      doc.font('Helvetica-Bold').text(`${label}:  `, 30, y, { continued: true });
      doc.font('Helvetica').text(value);
      y += 16;
    }

    // ── Divider ──────────────────────────────────────────────────
    doc.moveTo(30, y + 6).lineTo(W - 30, y + 6).strokeColor('#E5E7EB').lineWidth(1).stroke();
    y += 18;

    // ── QR Code ──────────────────────────────────────────────────
    const qrSize = 160;
    const qrX = (W - qrSize) / 2;
    doc.image(qrBuffer, qrX, y, { width: qrSize, height: qrSize });
    y += qrSize + 8;

    // ── Ticket ID ────────────────────────────────────────────────
    doc.fillColor('#6B7280').font('Courier').fontSize(8)
      .text(ticketId, 30, y, { align: 'center', width: W - 60 });
    y += 18;

    // ── Footer ───────────────────────────────────────────────────
    doc.rect(0, doc.page.height - 38, W, 38).fill('#F9FAFB');
    doc.fillColor('#6B7280').font('Helvetica').fontSize(8)
      .text(
        'Show this QR at the entrance • Valid for 1 person only • Non-transferable',
        30,
        doc.page.height - 26,
        { align: 'center', width: W - 60 }
      );

    doc.end();
  });
};

module.exports = { generateTicketPDF };
