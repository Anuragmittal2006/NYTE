const mongoose = require('mongoose');

const KeySchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    senderId: { type: String, required: true },
    aesKey: { type: String, required: true },
    timestamp: { type: Date, default: Date.now, expires: 86400 }, // TTL for 1 day
});

module.exports = mongoose.model('Key', KeySchema);
