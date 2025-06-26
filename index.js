// index.js

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const crypto   = require('crypto');
const cors     = require('cors');

const Booking  = require('./models/Booking');

const app  = express();
const PORT = process.env.PORT || 5000;

// ===== Middleware =====
app.use(cors());
app.use(express.json());  // parses JSON bodies

// ===== Connect to MongoDB =====
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// ===== 1. Create a new booking =====
// POST /api/bookings
app.post('/api/bookings', async (req, res) => {
  try {
    const { paymentId, ...rest } = req.body;
    const refId = rest.refId || paymentId;
    const newBooking = new Booking({
      refId,
      paymentId,
      ...rest
    });
    await newBooking.save();
    return res.status(201).json(newBooking);
  } catch (error) {
    console.error('Error creating booking:', error);
    return res.status(400).json({ message: error.message });
  }
});

// ===== 2. Paystack webhook endpoint =====
// POST /api/bookings/webhook/paystack
app.post('/api/bookings/webhook/paystack', async (req, res) => {
  const event = req.body;

  // OPTIONAL: verify Paystack signature
  // const signature = req.headers['x-paystack-signature'];
  // const expected = crypto
  //   .createHmac('sha512', process.env.PAYSTACK_SECRET_WEBHOOK)
  //   .update(JSON.stringify(req.body))
  //   .digest('hex');
  // if (signature !== expected) {
  //   console.warn('Invalid Paystack signature:', signature);
  //   return res.status(400).send('Invalid signature');
  // }

  if (event.event === 'charge.success') {
    const reference = event.data.reference;
    try {
      const booking = await Booking.findOneAndUpdate(
        { paymentId: reference },
        { status: 'paid' },
        { new: true }
      );
      if (booking) {
        console.log(`Booking ${booking._id} updated to paid.`);
      } else {
        console.log(`No booking found with paymentId ${reference}.`);
      }
    } catch (err) {
      console.error('Error updating booking status:', err);
    }
  }

  // Acknowledge receipt
  return res.status(200).send('Webhook received');
});

// ===== 3. List bookings (optionally filter by status) =====
// GET /api/bookings?status=pending
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
