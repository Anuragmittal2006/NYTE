const mongoose = require("mongoose");

const CoupleSchema = new mongoose.Schema({
  user1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  user2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  since: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ["pending", "active"],
    default: "pending"
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  code: {
    type: String // optional, for future code-based linking
  }
});

module.exports = mongoose.model("Couple", CoupleSchema);
