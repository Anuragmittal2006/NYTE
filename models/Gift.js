// models/Gift.js
const mongoose = require('mongoose');

const giftSchema = new mongoose.Schema({
  token: { type: String, unique: true, required: true },
  purchaserEmail: { type: String, required: true },
  partnerEmail: { type: String, required: true },
  planId: { type: String, required: true },
  orderId: { type: String },      // razorpay order id
  paymentId: { type: String },    // razorpay payment id
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }, // e.g. 30 days after purchase
  // claimed fields kept for audit but not used to block activation
  claimed: { type: Boolean, default: false },
  claimedAt: { type: Date, default: null },
  claimedBy: { type: String, default: null }
});

module.exports = mongoose.model('Gift', giftSchema);
