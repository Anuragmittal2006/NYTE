const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: false,
  },
  facebookId: { type: String },
  authType: { type: String, required: true, default: 'local' },

  name: {
    type: String,
    required: false,
  },
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,

  },
  failedLoginAttempts: { type: Number, default: 0 },
  lockoutUntil: { type: Date, default: null },

  subscription: {
    type: String,
    default: 'free', // Default subscription is 'free'
  },
  planUpdatedAt: Date,
  dob: { type: Date },
  profilePhoto: { type: String },
  bio: { type: String},
  isVerified: {           // Field to track email verification
    type: Boolean,
    default: false,      // By default, it's set to false (not verified)
  },

  verificationToken: {     // Token for email verification
    type: String,
  },

  resetPasswordToken: {  // Token for resetting the password
    type: String,
  },
  resetPasswordExpires: { // Token expiration time
    type: Date,
  },
  registrationTime: { type: Date,},
  sentRequests: [
    {
        userId: mongoose.Schema.Types.ObjectId,
        status: { type: String, enum: ['Pending', 'Accepted', 'Declined'], default: 'Pending' }
    }
],
receivedRequests: [
    {
        userId: mongoose.Schema.Types.ObjectId,
        status: { type: String, enum: ['Pending', 'Accepted', 'Declined'], default: 'Pending' }
    }
],
friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
privateKey: {
  type: String,
},
publicKey: {
  type: String,

},
disintegratePermission: {
  type: String,
  enum: ["no_one", "partner_only", "everyone"],
  default: "partner_only",
},

});

module.exports = mongoose.model('User', UserSchema);


