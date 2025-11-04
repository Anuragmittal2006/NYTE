const mongoose = require("mongoose");


const pushSubscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  subscription: { type: Object, required: true },
});

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);