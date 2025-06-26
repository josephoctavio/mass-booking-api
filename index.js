// index.js

require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const crypto    = require('crypto');
const cors      = require('cors');
const nodemailer = require('nodemailer');

const Booking    = require('./models/Booking');

const app  = express();
const PORT = process.env.PORT || 5000;

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== Connect to MongoDB =====
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ===== Set up Gmail transporter =====
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,      // your Gmail address
    pass: process.env.GMAIL_PASS       // your app password
  }
});

// ===== 1. Create a new booking =====
app.post('/api/bookings', async (req, res) => {
  try {
    const { paymentId, ...rest } = req.body;
    const refId = rest.refId || paymentId;
    const newBooking = new Booking({ refId, paymentId, ...rest });
    await newBooking.save();
    return res.status(201).json(newBooking);
  } catch (error) {
    console.error('Error creating booking:', error);
    return res.status(400).json({ message: error.message });
  }
});

// ===== 2. Paystack webhook endpoint =====
app.post('/api/bookings/webhook/paystack', async (req, res) => {
  const event = req.body;

  // OPTIONAL: verify signature with PAYSTACK_SECRET_WEBHOOK
  // const signature = req.headers['x-paystack-signature'];
  // const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_WEBHOOK)
  //                        .update(JSON.stringify(req.body)).digest('hex');
  // if (signature !== expected) return res.status(400).send('Invalid signature');

  if (event.event === 'charge.success') {
    const reference = event.data.reference;
    try {
      // 1) Update booking status
      const booking = await Booking.findOneAndUpdate(
        { paymentId: reference },
        { status: 'paid' },
        { new: true }
      );

      if (booking) {
        console.log(`Booking ${booking._id} updated to paid.`);

        // 2) Send confirmation email via Gmail
        const mailOptions = {
          from: `"St. Catherine Parish" <${process.env.GMAIL_USER}>`,
          to: booking.email,
          subject: 'Your Mass Booking is Confirmed',
          text: `
Hi ${booking.name},

We have received your payment of ₦${booking.amount} for your mass booking on ${new Date(booking.startDate).toLocaleDateString()}${booking.endDate ? ' to ' + new Date(booking.endDate).toLocaleDateString() : ''} at ${booking.time}.

Thank you for your booking! We will notify you of any further updates.

God bless,
St. Catherine Parish
          `,
          html: `
<p>Hi <strong>${booking.name}</strong>,</p>
<p>We have received your payment of <strong>₦${booking.amount}</strong> for your mass booking on <strong>${new Date(booking.startDate).toLocaleDateString()}</strong>${booking.endDate ? ' to <strong>' + new Date(booking.endDate).toLocaleDateString() + '</strong>' : ''} at <strong>${booking.time}</strong>.</p>
<p>Thank you for your booking! We will notify you of any further updates.</p>
<p>God bless,<br/>St. Catherine Parish</p>
          `,
        };

        try {
          await transporter.sendMail(mailOptions);
          console.log(`Confirmation email sent to ${booking.email}`);
        } catch (mailErr) {
          console.error('Error sending email:', mailErr);
        }
      } else {
        console.log(`No booking found with paymentId ${reference}.`);
      }
    } catch (err) {
      console.error('Error updating booking status:', err);
    }
  }

  // Acknowledge receipt
  res.status(200).send('Webhook received');
});

// ===== 3. List bookings =====
app.get('/api/bookings', async (req, res) => {
  const { status } = req.query;
  try {
    const filter   = status ? { status } : {};
    const bookings = await Booking.find(filter).sort({ createdAt: -1 });
    return res.json(bookings);
  } catch (err) {
    console.error('Error fetching bookings:', err);
    return res.status(500).json({ message: err.message });
  }
});

// ===== Start Server =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
