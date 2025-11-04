// models/Room.js
const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true }, // hashed id
  roomKey: { type: String, required: true, unique: true }, // sorted id string like A_B
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Room", roomSchema);
