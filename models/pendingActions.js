const mongoose = require("mongoose");

const pendingActionSchema = new mongoose.Schema({
  userId: { type: String, required: true },         // The one who should receive the action
  roomId: { type: String, required: true },
  actionType: { type: String, required: true },     // e.g. "unsend", "edit", "react", etc.
  initiatorId: { type: String, required: true },    // The one who triggered the action
  messageId: { type: String, required: true },
  additionalData: { type: mongoose.Schema.Types.Mixed }, // Optional data like new content for edit
  timestamp: { type: Date, default: Date.now },
  encryptedMessage: { type: String, required: false },
  iv: { type: String, required: false }
});

module.exports = mongoose.model("PendingAction", pendingActionSchema);
