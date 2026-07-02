# Event Ticketing Backend — Setup Guide

## What's In This Backend

```
backend/
├── server.js                  ← Express entry point
├── db.js                      ← MongoDB connection
├── package.json
├── .env.example               ← Copy this to .env and fill in values
├── models/
│   ├── Order.js               ← Order schema (1 per purchase)
│   └── Ticket.js              ← Ticket schema (N per order)
├── routes/
│   ├── register.js            ← POST /api/register
│   ├── payment.js             ← POST /api/verify-payment
│   ├── tickets.js             ← GET /api/order/:id/tickets + download
│   ├── recover.js             ← GET /api/recover-ticket
│   └── admin.js               ← POST /api/validate-ticket + stats + list
├── services/
│   ├── ticketService.js       ← PDFKit ticket generator
│   └── emailService.js        ← Nodemailer multi-ticket email
└── middleware/
    └── adminAuth.js           ← Bearer token guard for admin routes
```

---

## Step 1 — Prerequisites

Install these on your machine before anything else:

- **Node.js 18+** → https://nodejs.org  
  Check: `node -v`
- **npm** (comes with Node)  
  Check: `npm -v`
- **MongoDB Atlas account** (free tier is fine) → https://cloud.mongodb.com  
  OR local MongoDB → https://www.mongodb.com/try/download/community
- **Git** (optional but recommended)

---

## Step 2 — Install Dependencies

```bash
cd backend
npm install
```

This installs: express, mongoose, nodemailer, pdfkit, qrcode, razorpay, archiver, cors, dotenv, nodemon.

---

## Step 3 — Set Up MongoDB Atlas (Free)

1. Go to https://cloud.mongodb.com and create a free account.
2. Click **Create a deployment** → choose **M0 Free** tier.
3. Choose a cloud provider (any) and region closest to you.
4. Set a **username** and **password** — save these securely.
5. Under **Network Access** → **Add IP Address** → click **Allow Access from Anywhere** (0.0.0.0/0) for now.  
   *(You can restrict this later once deployed.)*
6. Click **Connect** on your cluster → **Connect your application** → copy the connection string.  
   It looks like: `mongodb+srv://youruser:yourpass@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority`
7. Replace `<password>` with your actual password, and add a database name:  
   `mongodb+srv://youruser:yourpass@cluster0.abc123.mongodb.net/eventdb`

---

## Step 4 — Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
PORT=5000
MONGODB_URI=mongodb+srv://youruser:yourpass@cluster0.abc123.mongodb.net/eventdb

# Leave Razorpay blank for now — development mock mode will activate
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# Gmail — see Step 5 below
GMAIL_USER=youremail@gmail.com
GMAIL_APP_PASS=

# Admin token — make this a long random string, e.g. run:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMIN_SECRET_TOKEN=paste_your_random_string_here

# Your event info
EVENT_NAME=My Awesome Event
EVENT_DATE=December 31, 2025
EVENT_VENUE=City Convention Centre, Mumbai
EVENT_PRICE_GENERAL=500
EVENT_PRICE_VIP=1200
MAX_TICKETS_PER_ORDER=10

SUPPORT_EMAIL=support@yourevent.com
```

---

## Step 5 — Set Up Gmail App Password (for emails)

Gmail requires an **App Password** — not your regular Gmail password.

1. Go to your Google Account → **Security**.
2. Make sure **2-Step Verification** is ON.
3. Search for **App passwords** (or go to https://myaccount.google.com/apppasswords).
4. App name: `Event Ticketing` → click **Create**.
5. Copy the 16-character password (spaces don't matter).
6. Paste it as `GMAIL_APP_PASS` in your `.env`.

> **Note:** Emails will work without this during development — the server just logs a warning.  
> Set it up before you go live.

---

## Step 6 — Run the Server

### Development (auto-restarts on file changes)
```bash
npm run dev
```

### Production
```bash
npm start
```

You should see:
```
✅ MongoDB connected: cluster0.abc123.mongodb.net
🚀 Server running on port 5000
   Health: http://localhost:5000/health
```

Test it:
```bash
curl http://localhost:5000/health
# → {"status":"ok","timestamp":"..."}
```

---

## Step 7 — Test All Endpoints (No Razorpay Keys Needed)

Use these `curl` commands or import into Postman/Insomnia.

### Register an order (creates 3 tickets)
```bash
curl -X POST http://localhost:5000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Priya Sharma",
    "email": "priya@example.com",
    "phone": "9876543210",
    "ticketType": "General",
    "city": "Mumbai",
    "quantity": 3
  }'
```
Save the `orderId` from the response.

### Simulate payment verification (mock mode — no Razorpay key needed)
```bash
curl -X POST http://localhost:5000/api/verify-payment \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-XXXXX-YYYY",
    "mock": true
  }'
```
This creates 3 Ticket documents and (if email is configured) sends the email.

### Get all tickets for an order
```bash
curl http://localhost:5000/api/order/ORD-XXXXX-YYYY/tickets
```

### Download ZIP of all PDFs
```bash
curl -o tickets.zip http://localhost:5000/api/order/ORD-XXXXX-YYYY/download
```
Open `tickets.zip` — you'll find 3 PDFs inside.

### Recover tickets by email
```bash
curl "http://localhost:5000/api/recover-ticket?email=priya@example.com"
```

### Validate a ticket at the gate
Replace `YOUR_ADMIN_TOKEN` with the value from your `.env`:
```bash
curl -X POST http://localhost:5000/api/validate-ticket \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"ticketId": "EVT-PRIY-YYYY-1-XXXXX", "adminName": "Gate A"}'
```
First scan → `{ "valid": true, ... }`  
Second scan of same ticket → `{ "valid": false, "code": "ALREADY_USED", ... }`

### Admin stats
```bash
curl http://localhost:5000/api/admin/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### All tickets (with filters)
```bash
# All tickets
curl "http://localhost:5000/api/admin/all-tickets" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Only checked-in tickets
curl "http://localhost:5000/api/admin/all-tickets?used=true" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Search by name
curl "http://localhost:5000/api/admin/all-tickets?search=Priya" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## Step 8 — Add Razorpay (When Ready)

1. Go to https://dashboard.razorpay.com → Sign up (free).
2. In **Test Mode**, go to **Settings → API Keys → Generate Key**.
3. Add to `.env`:
   ```env
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   ```
4. Restart the server. The mock mode auto-disables when keys are present.
5. Test card: `4111 1111 1111 1111` | any future date | any CVV | OTP: `1234`
6. Test UPI: `success@razorpay`

---

## Step 9 — Deploy to Railway

1. Push your `backend/` folder to a GitHub repo.
2. Go to https://railway.app → **New Project** → **Deploy from GitHub repo**.
3. Select your repo. Railway auto-detects Node.js.
4. Go to **Variables** tab → add all your `.env` values.
5. Add `PORT=5000` (Railway exposes a `PORT` env var automatically too — both work).
6. Click **Deploy**. Railway gives you a URL like `https://your-app.railway.app`.
7. Test: `curl https://your-app.railway.app/health`

> **CORS:** Once you know your Vercel frontend URL, set `FRONTEND_URL=https://your-app.vercel.app` in Railway's Variables tab. This restricts CORS to your frontend only.

---

## API Reference

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/register` | None | Create order, returns Razorpay order details |
| POST | `/api/verify-payment` | None | Verify payment, generate N tickets, send email |
| GET | `/api/order/:orderId/tickets` | None | All tickets for an order (Thank You page) |
| GET | `/api/order/:orderId/download` | None | ZIP of N PDFs |
| GET | `/api/ticket/:ticketId` | None | Single ticket details |
| GET | `/api/recover-ticket?email=` | None | Re-send tickets by email |
| POST | `/api/validate-ticket` | Bearer token | Gate scan — marks ticket used |
| GET | `/api/admin/stats` | Bearer token | Live attendance counts |
| GET | `/api/admin/all-tickets` | Bearer token | Paginated ticket list with filters |

---

## Common Issues

**MongoDB connection fails**  
→ Check your IP is whitelisted in Atlas Network Access (0.0.0.0/0 for dev).  
→ Check the password in the URI has no special characters (URL-encode them if needed).

**Email not sending**  
→ Make sure 2FA is on in your Google account, and you used an App Password (not your real password).  
→ The server won't crash if email fails — it just logs the error.

**"Razorpay keys not set — using mock order ID"**  
→ This is expected in development. Add keys when you're ready to take real payments.

**ZIP download is empty**  
→ Make sure the order is `paymentStatus: 'paid'`. Run the verify-payment step first.
