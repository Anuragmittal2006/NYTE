const express = require('express');
const passport = require('passport');
const router = express.Router();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const collection = require("../models/User");

// @desc Auth with Google
// @route GET /auth/google
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
}));

// @desc Google auth callback
// @route GET /auth/google/callback
router.get('/google/callback', passport.authenticate('google', {
  failureRedirect: '/',
}), async(req, res) => {
  const email = req.user.email;
   const check = await collection.findOne({ email });
  
   if (!check) {
      await collection.insertOne({
        email,
        name: req.user.displayName,
        subscription: "free", // default plan
        createdAt: new Date()
      });
    }
     const plan = check?.subscription || "free";

                    const token = jwt.sign({ email, plan }, 'your_jwt_secret', { expiresIn: '3d' });
                    res.cookie('token', token, { httpOnly: true, maxAge: 3 * 24 * 60 * 60 * 1000 }); // 3 days
  // On success, redirect to dashboard or homepage
  res.redirect('/dashboard');
});

// @desc Logout user
// @route /auth/logout
router.get('/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/');  // Redirect to home or login page after logout
  });
});




module.exports = router;

