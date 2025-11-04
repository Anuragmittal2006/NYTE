require('dotenv').config();

module.exports = {
  mongoURI: process.env.MONGO_URI,
  googleClientID: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackURL: process.env.GOOGLE_CALLBACK_URL,
  sessionSecret: process.env.SESSION_SECRET,
};