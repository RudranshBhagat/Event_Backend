const { BrevoClient } = require("@getbrevo/brevo");
const QRCode = require("qrcode");
const { generateTicketPDF } = require("./ticketService");

// -----------------------------------------------------------------------------
// Brevo Client
// -----------------------------------------------------------------------------

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

// -----------------------------------------------------------------------------
// HTML Builder
// -----------------------------------------------------------------------------

const buildMultiTicketEmailHTML = async (order, ticketIds) => {
  const qrImages = await Promise.all(
    ticketIds.map((id) =>
      QRCode.toDataURL(id, {
        width: 180,
        margin: 2,
      })
    )
  );

  const ticketRows = ticketIds
    .map(
      (id, i) => `
<div style="border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:16px;text-align:center;background:#F9FAFB;">
    <p style="margin:0 0 4px;font-size:12px;color:#6B7280;font-weight:600;text-transform:uppercase;">
        Ticket ${i + 1} of ${ticketIds.length}
    </p>

    <img
        src="${qrImages[i]}"
        width="160"
        alt="QR Code"
        style="display:block;margin:12px auto;"
    />

    <p style="margin-top:8px;font-size:11px;font-family:monospace;">
        ${id}
    </p>
</div>
`
    )
    .join("");

  const accentColor =
    order.ticketType === "VIP" ? "#7C3AED" : "#2563EB";

  const totalFormatted = `₹${(
    order.totalAmount || 0
  ).toLocaleString("en-IN")}`;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>

<body style="background:#F3F4F6;font-family:Arial,sans-serif;padding:20px;">

<table width="100%" cellpadding="0" cellspacing="0">

<tr>

<td align="center">

<table width="600" style="background:white;border-radius:12px;overflow:hidden;">

<tr>

<td style="background:${accentColor};padding:28px;text-align:center;">

<h1 style="color:white;margin:0;">
🎉 You're In!
</h1>

<p style="color:white;">
${process.env.EVENT_NAME}
</p>

</td>

</tr>

<tr>

<td style="padding:25px;">

<h2>Booking Summary</h2>

<table width="100%">

<tr>

<td><b>Name</b></td>

<td>${order.name}</td>

</tr>

<tr>

<td><b>Ticket Type</b></td>

<td>${order.ticketType}</td>

</tr>

<tr>

<td><b>Quantity</b></td>

<td>${ticketIds.length}</td>

</tr>

<tr>

<td><b>Price Each</b></td>

<td>₹${order.pricePerTicket.toLocaleString("en-IN")}</td>

</tr>

<tr>

<td style="color:${accentColor};"><b>Total Paid</b></td>

<td style="color:${accentColor};"><b>${totalFormatted}</b></td>

</tr>

</table>

</td>

</tr>

<tr>

<td style="padding:25px;">

<h2>Your Tickets</h2>

<p>
Each attendee should present their own QR code at the entrance.
Your PDF tickets are attached below.
</p>

${ticketRows}

</td>

</tr>

<tr>

<td style="background:#F9FAFB;padding:20px;">

<p>

📅 <b>Date:</b> ${process.env.EVENT_DATE}

<br>

📍 <b>Venue:</b> ${process.env.EVENT_VENUE}

</p>

</td>

</tr>

<tr>

<td style="padding:20px;text-align:center;font-size:12px;color:#888;">

Need help?

<br>

${process.env.SUPPORT_EMAIL}

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
`;
};

// -----------------------------------------------------------------------------
// Send Email
// -----------------------------------------------------------------------------

const sendMultiTicketEmail = async (order, ticketIds) => {
  try {
    const attachments = await Promise.all(
      ticketIds.map(async (ticketId, index) => {
        const pdfBuffer = await generateTicketPDF({
          ticketId,
          ticketNumber: index + 1,
          totalInOrder: ticketIds.length,
          name: order.name,
          email: order.email,
          ticketType: order.ticketType,
          orderId: order.orderId,
        });

        return {
          name: `ticket-${index + 1}-of-${ticketIds.length}.pdf`,
          content: pdfBuffer.toString("base64"),
        };
      })
    );

    const html = await buildMultiTicketEmailHTML(
      order,
      ticketIds
    );

    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender: {
        name: process.env.SENDER_NAME,
        email: process.env.SENDER_EMAIL,
      },
      to: [
        {
          email: order.email,
          name: order.name,
        },
      ],
      subject: `🎟️ Your ${ticketIds.length} Ticket${
        ticketIds.length > 1 ? "s" : ""
      } for ${process.env.EVENT_NAME}`,
      htmlContent: html,
      attachment: attachments,
    });

    console.log("✅ Email sent successfully");
    console.log(response);
  } catch (error) {
    console.error("❌ Email send failed");

    if (error.response && error.response.body) {
      console.error(error.response.body);
    } else {
      console.error(error.message);
    }
  }
};

module.exports = {
  sendMultiTicketEmail,
};