const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const webpush = require("web-push");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const ngrok = require("ngrok");
const port = process.env.PORT || 3000;
const cron = require("node-cron");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const collection = require("./models/User");
const { name } = require("ejs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const multer = require("multer");
const { set } = require("mongoose");
const mongoose = require("mongoose");
const { initGridFS } = require("./models/gridfs");
const { getGridFSBucket } = require("./models/gridfs");
const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;
const session = require("express-session");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const User = require("./models/User");
const TempMessage = require("./models/tempmsg");
const KeyModel = require("./models/KeyModel"); // Import your schema
const keys = require("./config/keys");
const { register } = require("module");
const Couple = require("./models/Couples"); // path adjust kar lena
const Room = require("./models/Room");
const Gift = require("./models/Gift");
const PendingAction = require("./models/pendingActions");
const PushSubscription = require("./models/PushSubscription");
const Razorpay = require('razorpay');
require("dotenv").config();
const axios = require("axios");


// Create Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(bodyParser.json());

const publicKey = "BOq8m1fzuY9sF2N7K8d_CDydiUj0Kzih-x0sNkI33Fc4jOSBl4lF3INpIcfyNcCiTrWXKWM2eWR1QqAM8iJjZSc";
const privateKey = "pNbvRnXEjraZOAvdZAH2JBcMsS5rJJCz0P0Ibxz_SHY";

webpush.setVapidDetails(
  "mailto:MITTALANURAG2006@GAMIL.COM",
  publicKey,
  privateKey
);

let subscriptions = [];

app.post("/subscribe", async(req, res) => {
   const { userId, subscription } = req.body;

  if (!userId || !subscription) {
    return res.status(400).json({ message: "Missing userId or subscription" });
  }

  try {
    // Upsert: update if exists, else insert
    await PushSubscription.findOneAndUpdate(
      { userId },
      { subscription },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: "Push subscription saved." });
  } catch (err) {
    console.error("Subscription save error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/notify", (req, res) => {
  const { title, message, roomId } = req.body;
  const payload = JSON.stringify({ title, message, roomId });

  Promise.all(
    subscriptions.map((sub) =>
      webpush.sendNotification(sub, payload).catch((err) => {
        console.error("Push failed:", err);
      })
    )
  )
    .then(() => res.status(200).json({ message: "Push Sent" }))
    .catch(() => res.sendStatus(500));
});
app.use(
  session({
    secret: "keyssessionSecret",
    resave: false,
    saveUninitialized: false,
  })
);
// Set view engine to EJS
app.set("view engine", "ejs");
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname));

app.use(express.static(path.join(__dirname, "views")));

const users = []; // In-memory user storage, replace with a database in production

app.post("/register", async (req, res) => {
  const normalizedEmail = req.body.email.toLowerCase();
  const registrationTime = new Date(); // Current date and time
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048, // Key size
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const data = {
    email: normalizedEmail,
    password: req.body.password,
    isVerified: false, // New field to track if the user is verified
    verificationToken: crypto.randomBytes(32).toString("hex"),
    registrationTime: registrationTime, // Token for email verification
    privateKey: privateKey,
    publicKey: publicKey,
  };
  const captchaResponse = req.body["g-recaptcha-response"];
  if (!captchaResponse) {
    return res.render("register", {
      errorMessage: "Please complete the CAPTCHA.",
    });
  }

  // Google reCAPTCHA verification
  const secretKey = "6LfElHAqAAAAADZLBoDDjcHDv6c1sD_qgyzW1u2m";
  const verificationURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captchaResponse}`;

  const existingUser = await collection.findOne({ email: normalizedEmail });

  if (existingUser) {
    return res.render("register", { errorMessage: "User already exist" });
  } else {
    const response = await fetch(verificationURL, { method: "POST" });
    const code = await response.json();

    if (!code.success) {
      return res.render("register", {
        errorMessage: "CAPTCHA verification failed.",
      });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(data.password, saltRounds);

    data.password = hashedPassword;
    const userData = await collection.insertMany(data);
    // Send verification email
    const verificationUrl = `http://localhost:3000/verify-email?token=${data.verificationToken}`;
    const verificationLink = `http://yourdomain.com/email-sent?token=${data.verificationToken}`;
    const mailOptions = {
      from: process.env.EMAIL_USER, // Sender address
      to: normalizedEmail, // List of receivers
      subject: "Verify your email address", // Subject line
      html: `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <div style="text-align: center; padding-bottom: 20px;">
                    <img src="https://www.google.com/url?sa=i&url=https%3A%2F%2Fwww.freepik.com%2Ffree-photos-vectors%2Flogo-png&psig=AOvVaw3Z-citK4ZmoYwfPxmxW0sx&ust=1729851567189000&source=images&cd=vfe&opi=89978449&ved=0CBQQjRxqFwoTCIirp7LlpokDFQAAAAAdAAAAABAE" alt="Your Company" style="width: 150px;">
                </div>
        
                <div style="text-align: center; background-color: #f4f4f4; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #007BFF;">Verify Your Email Address</h2>
                    <p style="font-size: 16px;">Thank you for signing up with us! Please confirm your email address by clicking the button below.</p>
                    <a href="${verificationUrl}" style="background-color: #007BFF; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">Verify Email</a>
                </div>
        
                <p style="font-size: 14px; padding-top: 20px;">
                    If you did not request this, please ignore this email. This link will expire in 24 hours.
                </p>
        
                <div style="text-align: center; padding-top: 20px; color: #888;">
                    <p>&copy; ${new Date().getFullYear()} Your Company. All Rights Reserved.</p>
                    <p><a href="https://yourcompany.com/privacy-policy" style="color: #007BFF; text-decoration: none;">Privacy Policy</a> | <a href="https://yourcompany.com/contact" style="color: #007BFF; text-decoration: none;">Contact Us</a></p>
                </div>
            </div>
            `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
      } else {
        res.render("email-sent", { userEmail: normalizedEmail });
      }
    });
  }
}),
  // Express route to check the verification status
  app.get("/check-verification-status", async (req, res) => {
    const normalizedEmail = req.query.email.toLowerCase(); // Email as query parameter
    try {
      const user = await collection.findOne({ email: normalizedEmail });

      res.json({ isVerified: user && user.isVerified });
    } catch (error) {
      console.error("Error checking verification status:", error);
      res.status(500).json({ error: "Error checking verification status" });
    }
  });

// Route to render the choose-username page
app.get("/choose-username", (req, res) => {
  const email = req.query.email;
  req.session.email = email;

  res.render("choose-username"); // Renders the username selection page
});
app.post("/choose-username", async (req, res) => {
  const username = req.body.username.trim();
  const email = req.session.email; // session se email le rahe hain
  const loginInput = req.session.loginInput;

  try {
    // Pehle check karein ke username pehle se exist na kare
    const existingUser = await collection.findOne({ name: username });

    if (existingUser) {
      return res.render("choose-username", {
        errorMessage: "Username is already taken",
      });
    }
    if (/\s/.test(username) || username === "") {
      return res.render("choose-username", {
        errorMessage: "Username cannot contain spaces or be empty",
      });
    }
    // Email ke hisaab se user dhoondhna aur username ko update karna
    const result = await collection.updateOne(
      { $or: [{ email: email }, { email: loginInput }] },
      { $set: { name: username } }
    );

    if (result.modifiedCount === 1) {
      const jwtToken = jwt.sign({ email: email }, "your_jwt_secret", {
        expiresIn: "3d",
      });
      res.cookie("token", jwtToken, {
        httpOnly: true,
        maxAge: 3 * 24 * 60 * 60 * 1000,
      });
      // Agar username successful update ho jaye toh dashboard pe redirect karein
      res.redirect("/dashboard");
    } else {
      // Agar email ka user nahi mila ya update nahi hua
      res.render("choose-username", {
        errorMessage: "User not found or update failed",
      });
    }
  } catch (error) {
    // Error ko handle karna aur error message bhejna
    console.error("Error updating username:", error);
    res
      .status(500)
      .render("choose-username", { errorMessage: "Server error occurred" });
  }
});

// Save chosen username to database after form submission
app.get("/check-username", async (req, res) => {
  const username = req.query.username;

  // Check if the username is at least 3 characters long
  if (username.length < 3) {
    return res.json({ available: false });
  }

  // Check if the username already exists in the database
  const existingUser = await collection.findOne({ name: username });

  if (existingUser) {
    return res.json({ available: false }); // Username is taken
  } else {
    return res.json({ available: true }); // Username is available
  }
});

app.post("/login", async (req, res) => {
  try {
      const { loginInput } = req.body;

    // Agar email hai to lowercase mein convert karo
    const query = loginInput.includes("@")
      ? { email: loginInput.toLowerCase() }
      : { name: loginInput };

    const check = await collection.findOne({
      $or: [query],
    });
  
    if (!check) {
      return res.render("login", { errorMessage: "User not found" });
    }

    if (!check.isVerified) {
      return res.render("login", {
        errorMessage2: "Please verify your email before login.",
      });
    }
    // Check if account is locked
    if (check.lockoutUntil && check.lockoutUntil > Date.now()) {
      const lockoutTimeLeft = Math.ceil(
        (check.lockoutUntil - Date.now()) / 60000
      );
      return res
        .status(403)
        .json({
          message: `Account is locked. Try again in ${lockoutTimeLeft} minutes.`,
        });
    }
    const isPasswordMatch = await bcrypt.compare(
      req.body.password,
      check.password
    );
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCKOUT_DURATION = 10 * 1000; // 30 minutes in milliseconds

    if (!isPasswordMatch) {
      // Increment failed login attempts
      check.failedLoginAttempts = (check.failedLoginAttempts || 0) + 1;

      await check.save();
      // Lock the account if max attempts are exceeded
      if (check.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        check.lockoutUntil = Date.now() + LOCKOUT_DURATION;
        await check.save();

        return res
          .status(403)
          .json({
            message: `Account locked due to too many failed login attempts. Try again later.`,
          });
      }
      return res.render("login", { errorMessage: "Incorrect password" });
    }
    check.failedLoginAttempts = 0;
    check.lockoutUntil = null;
    await check.save();

    if (!check.name) {
      req.session.loginInput = loginInput;

      return res.status(400).send(`
                <html>
                <head>
                    <title>Username Required</title>
                    <style>
                        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; }
                        .message { padding: 20px; background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 5px; text-align: center; }
                        button { margin-top: 10px; padding: 10px 20px; }
                    </style>
                </head>
                <body>
                    <div class="message">
                        <h2>Username Required</h2>
                        <p>It looks like you haven't chosen a username yet. This isn't a good thing!</p>
                        <button>
    <a href="/choose-username?email=${encodeURIComponent(
      loginInput
    )}" style="text-decoration: none; color: inherit;">Choose Username</a>
</button>
 </div>
                </body>
                </html>
            `);
    }

    const email = check.email;
    const plan = check.subscription;
    const token = jwt.sign({ email, plan }, "your_jwt_secret", { expiresIn: "3d" });

    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 3 * 24 * 60 * 60 * 1000,
    }); // 3 days

    const resetToken = crypto.randomBytes(20).toString("hex");
    await collection.updateOne(
      { _id: check._id },
      {
        $set: {
          resetPassword2Token: resetToken,
          resetPassword2Expires: Date.now() + 3600000, // 1 hour from now
        },
      }
    );
    const resetLink = `http://localhost:3000/reset-password2/${resetToken}`;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    const mailOptions = {
      to: check.email,
      from: process.env.EMAIL_USER,
      subject: "Login Detected",
      text: `Hello,\n\nWe noticed a login to your account. If this was you, please ignore this email. If you did not log in, click the following link to reset your password: \n\n ${resetLink}`,
    };
    transporter.sendMail(mailOptions, (err) => {
      if (err) {
        console.error("Error sending email:", err);
        return res.status(500).send("Error sending login notification email");
      }
    });
    // Render the dashboard and pass the user data
    res.render("dashboard", { user: check });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).send("Internal server error");
  }
});

const authenticateJWT = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).send("Access denied");

  jwt.verify(token, "your_jwt_secret", (err, user) => {
    if (err) return res.status(403).send("Invalid token");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    req.user = user;
    next();
  });
};

app.get("/protected", authenticateJWT, async (req, res) => {
   const { email, plan } = req.user; 
  console.log("plan:", plan); // ab directly aayega
  const user = await User.findOne({ email: email });
  res.render("dashboard", { user: user });
});
// reuse your authenticateJWT middleware
app.get("/api/check-plan", authenticateJWT, (req, res) => {
  const plan = req.user?.plan || "free";
  console.log("checking to hui")
  return res.json({ allowed: plan === "premium", plan });
});

app.get("/reset-password2/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const user = await collection.findOne({
      resetPassword2Token: token,
      resetPassword2Expires: { $gt: Date.now() }, // Check if token is not expired
    });

    if (!user) {
      return res.send("Password reset token is invalid or has expired.");
    }

    // Render the password reset form with the token
    res.render("reset-password", { token });
  } catch (err) {
    console.error("Error loading password reset page:", err);
    res.status(500).send("An error occurred.");
  }
});

// Handle the password reset form submission (POST)
app.post("/reset-password2/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    const user = await collection.findOne({
      resetPassword2Token: token,
      resetPassword2Expires: { $gt: Date.now() }, // Check if token is still valid
    });

    if (!user) {
      return res.send("Password reset token is invalid or has expired.");
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password and remove the reset token fields
    await collection.updateOne(
      { _id: user._id },
      {
        $set: { password: hashedPassword },
        $unset: { resetPassword2Token: "", resetPassword2Expires: "" }, // Clear token fields
      }
    );

    res.send(
      "Your password has been successfully updated. You can now log in."
    );
  } catch (err) {
    console.error("Error during password reset:", err);
    res
      .status(500)
      .send("An error occurred during the password reset process.");
  }
});

const transporter = nodemailer.createTransport({
  service: "gmail", // You can use other services like Yahoo, Outlook, etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.get("/verify-email", async (req, res) => {
  const { token } = req.query; // Get token from the URL

  try {
    // Find the user with the matching verification token
    const user = await collection.findOne({ verificationToken: token });

    if (!user) {
      return res.send("Invalid or expired token");
    }

    // Update the user's isVerified status to true and remove the verificationToken
    const updateResult = await collection.updateOne(
      { _id: user._id }, // Find the user by _id
      { $set: { isVerified: true }, $unset: { verificationToken: "" } } // Update the field
    );

    if (updateResult.modifiedCount === 1) {
      const token = jwt.sign({ email: user.email }, "your_jwt_secret", {
        expiresIn: "3d",
      });

      // Set the cookie and redirect immediately, avoiding multiple responses
      res.cookie("token", token, {
        httpOnly: true,
        maxAge: 3 * 24 * 60 * 60 * 1000,
      }); // 3 days

      res.send(`
        <html>
        <head>
            <title>Verification Success</title>
            <style>
                body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; }
                .message { padding: 20px; background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; border-radius: 5px; text-align: center; }
                button { margin-top: 10px; padding: 10px 20px; }
            </style>
        </head>
        <body>
            <div class="message">
                <h2>Verification Successful!</h2>
                <p>You can now proceed to the main page.</p>
            </div>
        </body>
        </html>
    `);
    } else {
      res.send("Email verification failed. Please try again.");
    }
  } catch (error) {
    console.error("Error during email verification: ", error);
    res.status(500).send("An error occurred. Please try again.");
  }
});

app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await collection.findOne({ email });

    if (!user) {
      return res.status(400).send("User with that email does not exist");
    }

    // Generate a reset token
    const token = crypto.randomBytes(20).toString("hex");

    // Set the reset token and expiration in the database
    await collection.updateOne(
      { _id: user._id },
      {
        $set: {
          resetPasswordToken: token,
          resetPasswordExpires: Date.now() + 3600000, // 1 hour from now
        },
      }
    );

    // Create the reset link
    const resetLink = `http://localhost:3000/reset-password/${token}`;

    // Send the reset link via email (use your existing nodemailer setup)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      to: user.email,
      from: process.env.EMAIL_USER,
      subject: "Password Reset",
      text: `You are receiving this because you requested a password reset. Please click the following link to reset your password: \n\n ${resetLink}`,
    };

    transporter.sendMail(mailOptions, (err, response) => {
      if (err) {
        console.error("Error sending email:", err);
        res.status(500).send("Error sending reset email");
      } else {
        res.status(200).send("Password reset link sent to your email.");
      }
    });
  } catch (err) {
    console.error("Error during password reset request:", err);
    res.status(500).send("Error processing password reset request");
  }
});

app.get("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  try {
    const user = await collection.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }, // Check if token has expired
    });

    if (!user) {
      return res
        .status(400)
        .send("Password reset token is invalid or has expired");
    }

    // Serve the reset password page (you can use an HTML file)
    res.render("reset-password", { token: token });
  } catch (err) {
    console.error("Error during password reset:", err);
    res.status(500).send("Error processing password reset");
  }
});

app.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const user = await collection.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .send("Password reset token is invalid or has expired");
    }

    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update the user's password and remove the reset token/expiry
    await collection.updateOne(
      { _id: user._id },
      {
        $set: { password: hashedPassword },
        $unset: { resetPasswordToken: "", resetPasswordExpires: "" }, // Remove token and expiration
      }
    );

    res.send("Password updated successfully!");
  } catch (err) {
    console.error("Error updating password:", err);
    res.status(500).send("Error resetting password");
  }
});

// Step 1: Create an endpoint to generate and send magic link
app.post("/send-magic-link", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await collection.findOne({ email });

    if (!user) {
      return res.status(400).send("User not found");
    }

    // Generate a magic token (JWT) valid for a short period, e.g., 15 minutes
    const token = jwt.sign({ email: user.email }, "your_jwt_secret", {
      expiresIn: "15m",
    });

    // Magic link with the token
    const magicLink = `http://localhost:3000/magic-login/${token}`;

    // Send magic link via email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      to: user.email,
      from: process.env.EMAIL_USER,
      subject: "Your Magic Login Link",
      text: `Click the following link to log in: \n\n ${magicLink}`,
    };

    transporter.sendMail(mailOptions, (err, response) => {
      if (err) {
        console.error("Error sending email:", err);
        return res.status(500).send("Error sending magic link");
      } else {
        res.status(200).send("Magic login link sent to your email");
      }
    });
  } catch (err) {
    console.error("Error during magic link request:", err);
    res.status(500).send("Error generating magic link");
  }
});

app.get("/magic-login/:token", async (req, res) => {
  const { token } = req.params;

  try {
    // Verify the token
    const decoded = jwt.verify(token, "your_jwt_secret");

    // Find the user by email
    const user = await collection.findOne({ email: decoded.email });

    if (!user) {
      return res.status(400).send("Invalid or expired magic link");
    }

    // Create a session or token for logged-in state (same as your normal login)
    const loginToken = jwt.sign({ email: user.email }, "your_jwt_secret", {
      expiresIn: "3d",
    });
    res.cookie("token", loginToken, {
      httpOnly: true,
      maxAge: 3 * 24 * 60 * 60 * 1000,
    }); // 3 days

    return res.redirect("/dashboard");
  } catch (err) {
    console.error("Error verifying magic link:", err);
    res.status(400).send("Invalid or expired magic link");
  }
});

// Connect to MongoDB
mongoose
  .connect(keys.mongoURI, {})
  .then((conn) => {
    console.log("MongoDB Connected");

    // 🔥 Initialize GridFS after successful DB connection
    initGridFS(conn.connection); // IMPORTANT
  })
  .catch((err) => console.error(err));


  const router = express.Router();
  const storage = multer.memoryStorage(); // Store file in RAM temporarily
  const upload = multer({ storage });
  const { ObjectId } = require("mongodb");

 app.post("/upload", upload.single("file"), async (req, res) => {
    const bucket = getGridFSBucket(); // Assume it uses global db
    const fileId = new ObjectId(); // Generate fileId manually

    const uploadStream = bucket.openUploadStreamWithId(fileId, req.file.originalname, {
        contentType: req.file.mimetype
    });

    uploadStream.end(req.file.buffer);

    uploadStream.on("finish", () => {
        // File is saved, now send the known ID back
        return res.json({ fileId }); // Because we already had the ObjectId
    });

    uploadStream.on("error", (err) => {
        return res.status(500).json({ error: "Upload failed", details: err.message });
    });
});
app.get("/api/get-encrypted-file/:fileId", async (req, res) => {
    const bucket = getGridFSBucket();
    const fileId = new ObjectId(req.params.fileId);

    try {
        const downloadStream = bucket.openDownloadStream(fileId);

        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", "inline");

        downloadStream.pipe(res);

        // Handle streaming error
        downloadStream.on("error", (err) => {
            console.error("Download error:", err);
            if (!res.headersSent) {
                res.status(404).json({ error: "File not found" });
            } else {
                res.end();
            }
        });

        // After the response has fully been sent to client
        res.on("finish", async () => {
            console.log(`File ${fileId} successfully sent. Deleting from GridFS...`);
            try {
                await bucket.delete(fileId);
                console.log(`File ${fileId} deleted from GridFS.`);
            } catch (err) {
                console.error(`Error deleting file ${fileId}:`, err);
            }
        });

        // Optional: Log if the connection was closed early
        res.on("close", () => {
            if (!res.writableEnded) {
                console.warn(`Download connection closed before fully sending file ${fileId}. No deletion attempted.`);
            }
        });

    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Express session middleware

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new GoogleStrategy(
    {
      clientID: keys.googleClientID,
      clientSecret: keys.googleClientSecret,
      callbackURL: keys.googleCallbackURL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if the user exists with Google ID
        let existingUser = await User.findOne({ googleId: profile.id });

        if (existingUser) {
          return done(null, existingUser); // User already logged in with Google
        }

        // Check if the email already exists with another auth type (like email/password)
        const email = profile.emails[0].value;
        existingUser = await User.findOne({ email });

        if (existingUser) {
          // Update the existing account to link Google authentication
          existingUser.googleId = profile.id;
          existingUser.authType = "google";
          await existingUser.save();
          return done(null, existingUser); // User account linked with Google
        }
        const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
          modulusLength: 2048, // Key size
          publicKeyEncoding: { type: "spki", format: "pem" },
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        // If no user exists, create a new one
        const newUser = new User({
          googleId: profile.id,
          name: profile.displayName,
          email,
          authType: "google",
          privateKey: privateKey,
          publicKey: publicKey,
        });

        await newUser.save();
        done(null, newUser);
      } catch (error) {
        done(error, null);
      }
    }
  )
);

// Serialize and Deserialize user
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id); // No callback, using promise with async/await
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FB_APP_ID, // Facebook App ID
      clientSecret: process.env.FB_APP_SECRET, // Facebook App Secret
      callbackURL: "http://localhost:3000/auth/facebook/callback",
      profileFields: ["id", "emails", "name"], // Requesting name and email fields from Facebook
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Find or create the user in the database
        const existingUser = await collection.findOne({
          email: profile.emails[0].value.toLowerCase(),
        });
        if (existingUser) {
          return done(null, existingUser); // User exists, log them in
        } else {
          const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
            modulusLength: 2048, // Key size
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
          });
          // Create a new user if they don’t exist
          const newUser = {
            name: `${profile.name.givenName} ${profile.name.familyName}`,
            email: profile.emails[0].value.toLowerCase(),
            facebookId: profile.id,
            subscription: "free", // Default subscription
            authType: "facebook",
            privateKey: privateKey,
            publicKey: publicKey,
          };
          const savedUser = await collection.insertMany(newUser);
          return done(null, savedUser);
        }
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

// Multer config for file upload

// Profile update route
app.post(
  "/update-profile",
  upload.single("profilePhoto"),
  authenticateJWT,
  async (req, res) => {
    const { name, dob, bio } = req.body;
    let updatedData = { name, dob, bio };
    const userEmail = req.user?.email;
    // Server-side word limit check
    const maxWords = 50; // Set your word limit here
    const wordCount = bio.trim().split(/\s+/).length;

    if (wordCount > maxWords) {
      return res.status(400).send(`Bio cannot exceed ${maxWords} words.`);
    }
    if (!userEmail) {
      throw new Error("User email not found");
    }
    // If a new profile photo was uploaded
    if (req.file) {
      updatedData.profilePhoto = "/uploads/" + req.file.filename; // Store file path
    }

    try {
      await User.updateOne(
        { email: userEmail }, // Assuming user info from session/middleware
        { $set: updatedData }
      );
      res.redirect("/dashboard"); // Redirect back to dashboard after updating
    } catch (err) {
      console.error("Error updating profile:", err);
      res.status(500).send("Server Error");
    }
  }
);

// Schedule the task to run every hour
cron.schedule("0 * * * *", async () => {
  const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
  try {
    const result = await collection.deleteMany({
      isVerified: false,
      registrationTime: { $lt: cutoffDate },
    });
    console.log(`${result.deletedCount} unverified user(s) deleted.`);
  } catch (error) {
    console.error("Error deleting unverified users:", error);
  }
});
cron.schedule("0 0 * * *", async () => {
  const cutoffTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000; // 7 din purane

  try {
    const result = await TempMessage.deleteMany({
      timestamp: { $lt: cutoffTimestamp },
    });

    console.log(`${result.deletedCount} temporary message(s) deleted.`);
  } catch (error) {
    console.error("Error deleting temporary messages:", error);
  }
});

app.get("/api/searchUsers", async (req, res) => {
  const username = req.query.username;
  const page = parseInt(req.query.page) || 1;
  const limit = 10;

  if (!username) {
    return res.status(400).send("Username is required");
  }

  try {
    const users = await User.find({
      $or: [
        { email: { $regex: username, $options: "i" } },
        { name: { $regex: username, $options: "i" } },
      ],
    })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("name profilePhoto _id"); // Include _id temporarily

    if (users.length > 0) {
      res.json(users);
    } else {
      res.json({ message: "No users found" });
    }
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).send("Internal server error");
  }
});
const secretKey = "abcdefghijklmnopqrstuvwxyz123456";
// Function to encrypt the userId
function encryptUserId(userId) {
  const iv = crypto.randomBytes(16); // Initialization vector for added security
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(secretKey, "utf8"),
    iv
  );
  let encrypted = cipher.update(userId, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`; // Return IV + encrypted data
}

// API Endpoint to encrypt userId
app.get("/api/encryptUserId", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).send("User ID is required");
  }

  try {
    // Encrypt the userId
    const encryptedUserId = encryptUserId(userId);
    res.json({ encryptedUserId });
  } catch (error) {
    console.error("Error encrypting user ID:", error);
    res.status(500).send("Internal server error");
  }
});

// Function to decrypt userId
function decryptUserId(encryptedUserId) {
  const [ivHex, encryptedData] = encryptedUserId.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(secretKey, "utf8"),
    Buffer.from(ivHex, "hex")
  );
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted; // Returns the original userId
}

// User profile route with encrypted userId in the URL
app.get("/userProfile/:encryptedUserId", authenticateJWT, async (req, res) => {
  const { encryptedUserId } = req.params;

  try {
    // Decrypt the userId
    const userId = decryptUserId(encryptedUserId);

    // Fetch the user profile based on decrypted userId
    const user = await User.findById(userId).select("name email profilePhoto bio");
    const loginInput = req.user?.email || req.user?.username;

    
    // Email hai to lowercase mein convert karo
    const query = loginInput?.includes("@")
      ? { email: loginInput.toLowerCase() }
      : { name: loginInput };
    
    const sender = await User.findOne({
      $or: [query],
    });
    
  

 

    if (user && sender) {
      res.render("userProfile", { user, sender }); // Render user profile page
    } else {
      res.status(404).send("User not found");
    }
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).send("Internal server error");
  }
});

// Use a strong, 32-character key

// Encrypt Room ID
function encryptRoomId(senderId, receiverId) {
  const data = `${senderId}_${receiverId}`;
  const iv = crypto.randomBytes(16); // Initialization vector for added security

  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(secretKey, "utf8"),
    iv
  );
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`; // Include IV with encrypted data
}

// Decrypt Room ID
function decryptRoomId(encryptedRoomId) {
  const [ivHex, encryptedData] = encryptedRoomId.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(secretKey, "utf8"),
    Buffer.from(ivHex, "hex")
  );
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted; // Returns "senderId_receiverId"
}
// Example Usage
app.post("/generate-room", async (req, res) => {
  const { senderId, receiverId } = req.body;

  if (!senderId || !receiverId) return res.status(400).json({ error: "Missing sender or receiver ID" });

  const sortedIds = [senderId, receiverId].sort();
  const roomKey = sortedIds.join("_");

  // hash roomKey for roomId
  const crypto = require("crypto");
  const roomId = crypto.createHash("sha256").update(roomKey).digest("hex");

  let room = await Room.findOne({ roomKey });

  if (!room) {
    room = await Room.create({
      roomId,
      roomKey,
      users: sortedIds,
    });
  }

  res.json({ roomId });
});


function cleanPEM(pem) {
  return pem
    .replace(/-----BEGIN [^-]+-----/, "") // Remove header
    .replace(/-----END [^-]+-----/, "") // Remove footer
    .replace(/\s+/g, ""); // Remove line breaks and spaces
}

app.get("/chat", authenticateJWT, async (req, res) => {
  const loginInput = req.user?.email || req.session?.user?.email || req.user?.username || req.session?.user?.username;
 

  // Email hai to lowercase mein convert karo
  const query = loginInput?.includes("@")
    ? { email: loginInput.toLowerCase() }
    : { name: loginInput };

    const user = await User.findOne({
      $or: [query],
    });
  const { roomId } = req.query;

  if (!roomId) return res.status(400).send("Room ID is missing");

  try {
    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).send("Chat room not found");

    const currentUserId = user._id.toString();
    if (!room.users.includes(currentUserId)) {
      return res.status(403).send("Unauthorized access to this chat");
    }

    // Get both user objects
    const [user1, user2] = await Promise.all([
      User.findById(room.users[0]),
      User.findById(room.users[1]),
    ]);

 
    if (!user1 || !user2) return res.status(404).send("Users not found");

    // Identify sender and receiver
    const sender = user1._id.toString() === currentUserId ? user1 : user2;
    const receiver = sender._id.toString() === user1._id.toString() ? user2 : user1;

    const cleanedPublicKey = receiver.publicKey ? cleanPEM(receiver.publicKey) : null;
    const cleanedPrivateKey = sender.privateKey ? cleanPEM(sender.privateKey) : null;

    res.render("chat", {
      senderId: sender._id.toString(),
      receiverId: receiver._id.toString(),
      receiverName: receiver.name,
      senderName: sender.name,
      receiverProfilePhoto: receiver.profilePhoto || "default-profile.png",
      receiverPublicKey: cleanedPublicKey,
      plan: sender.subscription
    });
  } catch (error) {
    console.error("Room ID Decryption Error:", error.message);
    res.status(400).send("Invalid Room ID");
  }
});

app.post("/api/sendFriendRequest", authenticateJWT, async (req, res) => {
  const receiverId = req.session.receiverId;
  const senderId = req.user?.email;

  try {
    const sender = await User.findOne({
      $or: [{ email: senderId }, { name: senderId }],
    });
    const receiver = await User.findById(receiverId);

    if (sender._id.equals(receiver._id)) {
      return res
        .status(400)
        .json({ message: "Cannot send a friend request to yourself" });
    }

    // Check if the request already exists
    if (
      receiver.receivedRequests.some((req) => req.userId.equals(sender._id))
    ) {
      return res.status(400).json({ message: "Friend request already sent" });
    }

    sender.sentRequests.push({ userId: receiverId });
    receiver.receivedRequests.push({ userId: sender.id });

    await sender.save();
    await receiver.save();

    const receiverSocketId = onlineUsers[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("friendRequestNotification", {
        id: sender._id,
        name: sender.name,
        profilePhoto: sender.profilePhoto || "/default-avatar.png",
      });
    }

    res.status(200).json({ message: "Friend request sent successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Route to cancel a friend request
app.post("/api/cancelFriendRequest", authenticateJWT, async (req, res) => {
  const receiverId = req.session.receiverId;
  const senderId = req.user?.email;

  try {
    const sender = await User.findOne({
      $or: [{ email: senderId }, { name: senderId }],
    });
    const receiver = await User.findById(receiverId);

    if (!sender || !receiver)
      return res.status(404).json({ message: "User not found" });

    receiver.receivedRequests = receiver.receivedRequests.filter(
      (req) => !req.userId.equals(sender._id)
    );
    sender.sentRequests = sender.sentRequests.filter(
      (req) => !req.userId.equals(receiverId)
    );
    await receiver.save();
    await sender.save();

    res.status(200).json({ message: "Friend request canceled successfully" });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// Route to check friend request status
app.post("/api/checkFriendRequestStatus", authenticateJWT, async (req, res) => {
  const { receiverId } = req.body;
  if (!receiverId) {
    return res.status(400).send("Receiver ID not found in session.");
  }
  const senderId = req.user?.email;

  try {
    const sender = await User.findOne({
      $or: [{ email: senderId }, { name: senderId }],
    });
    const receiver = await User.findById(receiverId);

    if (!sender || !receiver)
      return res.status(404).json({ message: "User not found" });
    // Check if they are friends
    const areFriends = receiver.friends.some((friendId) =>
      friendId.equals(sender._id)
    );
    if (areFriends) {
      return res.status(200).json({ requestStatus: "friends" });
    }

    // Check if there’s a pending request
    const requestExists = receiver.receivedRequests.some((req) =>
      req.userId.equals(sender._id)
    );
    if (requestExists) {
      return res.status(200).json({ requestStatus: "pending" });
    }

    res.status(200).json({ requestStatus: "none" });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/handleFriendRequest", authenticateJWT, async (req, res) => {
  const { requestId, action } = req.body;
  const email = req.user?.email;

  try {
    const user = await User.findOne({
      $or: [{ email: email }, { name: email }],
    });
    const requestIndex = user.receivedRequests.findIndex((req) =>
      req.userId.equals(requestId)
    );

    if (requestIndex === -1) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    if (action === "accept") {
      user.friends.push(user.receivedRequests[requestIndex].userId); // Add to friends list
      await User.findByIdAndUpdate(requestId, { $push: { friends: user._id } }); // Add user to sender's friends list
    }

    // Remove the friend request (whether accepted or deleted)
    user.receivedRequests.splice(requestIndex, 1);
    await user.save();

    res
      .status(200)
      .json({ message: `Friend request ${action}ed successfully` });
  } catch (error) {
    console.error("Error handling friend request:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/getFriendRequests", authenticateJWT, async (req, res) => {
  const email = req.user?.email;
  try {
    const user = await User.findOne({
      $or: [{ email: email }, { name: email }],
    }).populate("receivedRequests.userId", "name profilePhoto");

    const friendRequests = user.receivedRequests.map((request) => ({
      id: request.userId._id,
      name: request.userId.name,
      profilePhoto: request.userId.profilePhoto || "/default-avatar.png",
    }));

    res.status(200).json(friendRequests);
  } catch (error) {
    console.error("Error fetching friend requests:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Backend endpoint to get friends list
app.get("/api/getFriends", authenticateJWT, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user?.email }).populate(
      "friends",
      "name profilePhoto"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ friends: user.friends });
  } catch (error) {
    console.error("Error fetching friends:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/removeFriends", authenticateJWT, async (req, res) => {
  const userEmail = req.user?.email;
  const receiverId = req.session.receiverId;

  try {
    const user = await User.findOne({
      $or: [{ email: userEmail }, { name: userEmail }],
    });
    const friend = await User.findById(receiverId);

    // Check if the user and friend exist
    if (!user || !friend) {
      return res.status(404).json({ message: "User or friend not found" });
    }

    // Remove the friend from each other's friend lists
    user.friends = user.friends.filter((f) => !f.equals(friend._id));
    friend.friends = friend.friends.filter((f) => !f.equals(user._id));

    await user.save();
    await friend.save();
    res.status(200).json({ message: "Friend removed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/delete-account", authenticateJWT, async (req, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      throw new Error("User email not found");
    }
    // Delete the user's account
    await User.deleteOne({ email: userEmail });

    // Optionally, log the user out
    res.redirect("/logout");
  } catch (err) {
    console.error("Error deleting account:", err);
    res.status(500).send("Server Error");
  }
});

// Route to initiate Facebook authentication
app.get(
  "/auth/facebook",
  passport.authenticate("facebook", { scope: ["email"] })
);

// Facebook callback route
app.get(
  "/auth/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/login" }),
  (req, res) => {
    const email = req.user.email;
    const token = jwt.sign({ email }, "your_jwt_secret", { expiresIn: "3d" });
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 3 * 24 * 60 * 60 * 1000,
    }); // 3 days
    // Successful authentication, redirect to dashboard.
    res.redirect("/dashboard");
  }
);

// Auth Routes
app.use("/auth", require("./routes/auth"));

// Serve room.html for dynamic room URLs
app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "room.html"));
});

// Serve index.html for any other route
app.get("/", (req, res) => {
  res.render("index");
});
app.get("/test", (req, res) => {
  res.render("test");
});
app.get("/room", (req, res) => {
  res.render("room");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/register", (req, res) => {
  res.render("register");
});
app.get("/forgot-password", (req, res) => {
  res.render("forgot-password");
});
app.get("/magic-link", (req, res) => {
  res.render("magiclink", { responseMessage: "" });
});

app.get("/dashboard", authenticateJWT, async (req, res) => {
  const email = req.user ? req.user.email : req.session.user.email; // Get email from session or JWT
  const user = await User.findOne({ email: email });

  if (user) {
    res.render("dashboard", { user: user });
  } else {
    res.status(404).send("User not found");
  }
});
app.get("/account-info", authenticateJWT, async (req, res) => {
  const email = req.user ? req.user.email : req.session.user.email; // Get email from session or JWT
  const user = await User.findOne({ $or: [{ email: email }, { name: email }] });
 // Find all gifts where logged-in user is the purchaser
    const gifts = await Gift.find({ purchaserEmail: email })
      .sort({ createdAt: -1 })
      .lean(); // lean() so we get plain objects and can add fields easily

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    // Map gifts to include computed fields for frontend convenience
    const mappedGifts = (gifts || []).map(g => {
      return {
        _id: g._id,
        token: g.token,
        partnerEmail: g.partnerEmail || '',
        purchaserEmail: g.purchaserEmail || '',
        createdAt: g.createdAt,
        expiresAt: g.expiresAt || null,
        status: (g.expiresAt && new Date() > new Date(g.expiresAt)) ? 'expired' : 'active',
        link: `${baseUrl.replace(/\/$/, '')}/gift/${g.token}`
      };
    });
  if (user) {
    res.render("account-info", { user: user, gifts: mappedGifts});
  } else {
    res.status(404).send("User not found");
  }
});
const PLANS = {
  week_user:   { id: "week_user", name: "1 Week (You)", amountINR: 40 },
  month_user:  { id: "month_user", name: "1 Month (You)", amountINR: 119 },
  month_both:  { id: "month_both", name: "1 Month (Both)", amountINR: 199 },
  qtr_user:    { id: "qtr_user", name: "3 Months (You)", amountINR: 299 },
  qtr_both:    { id: "qtr_both", name: "3 Months (Both)", amountINR: 549 }
};

app.get("/premium", authenticateJWT, async (req, res) => {
  const { email, plan } = req.user;

  const plans = [
    {
      id: "week",
      name: "1 Week",
      userPrice: "₹40 only for you",
      bothPrice: null,
      features: ["Ad-free experience", "Basic customization", "Priority support"],
    },
    {
      id: "month",
      name: "1 Month",
      userPrice: "₹119 (You)",
      bothPrice: "₹199 (Both)",
      features: ["Everything in 1 Week", "Sync wallpapers", "Exclusive stickers", "Faster updates"],
    },
    {
      id: "qtr",
      name: "3 Months",
      userPrice: "₹299 (You)",
      bothPrice: "₹549 (Both)",
      features: ["All 1 Month features", "Secret chat+", "Remote logout (Disintegrate Room)", "Unlimited customization"],
    },
  ];

  res.render("premium", { email, plan, plans, razorpayKeyId: process.env.RAZORPAY_KEY_ID });
});


app.get("/setting", authenticateJWT, async (req, res) => {
  const email = req.user ? req.user.email : req.session.user.email;
  const user = await User.findOne({ email: email });
  res.render("setting", { user: user });
});

app.get("/logout", (req, res) => {
  res.clearCookie("token"); // Clear the token cookie
  res.render("login"); // Redirect to home page or login page
});
app.get("/forceLogout", (req, res) => {
  res.clearCookie("token"); // Clear the token cookie
  const randomSites = [
    "https://www.bbc.com/news",
    "https://www.wikipedia.org",
    "https://edition.cnn.com",
    "https://www.thehindu.com"
];
const randomSite = randomSites[Math.floor(Math.random() * randomSites.length)];
res.redirect(randomSite);
});
// Function to encrypt a message with AES
function encryptMessage(message, aesKey) {
  const iv = crypto.randomBytes(16); // Random Initialization Vector (IV)
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(aesKey, "hex"),
    iv
  );
  let encryptedMessage = cipher.update(message, "utf8", "base64");
  encryptedMessage += cipher.final("base64");
  return { encryptedMessage, iv: iv.toString("hex") }; // Return both encrypted message and IV
}

// Function to encrypt AES key using RSA (receiver's public key)
function encryptAESKeyWithRSA(aesKey, publicKey) {
  const encryptedKey = crypto.publicEncrypt(
    publicKey, // Receiver's public key
    Buffer.from(aesKey, "hex")
  );
  return encryptedKey.toString("base64"); // Return Base64 encoded encrypted AES key
}

app.post("/saveKey", async (req, res) => {
  const { aesKey, roomId, senderId } = req.body;

  try {
    await KeyModel.findOneAndUpdate(
      { roomId, senderId },
      { aesKey, timestamp: new Date() },
      { upsert: true }
    );
    res.status(200).send({ message: "Key saved successfully" });
  } catch (error) {
    console.error("Error saving AES key:", error);
    res.status(500).send({ message: "Failed to save key" });
  }
});
app.post("/getKey", async (req, res) => {
  const { roomId, senderId } = req.body;
  try {
    // Retrieve AES key for the given room and receiver
    const keyEntry = await KeyModel.findOne({ roomId, senderId });

    if (keyEntry) {
      res.status(200).send({ aesKey: keyEntry.aesKey });
    } else {
      res.status(404).send({ message: "AES key not found." });
    }
  } catch (error) {
    console.error("Error fetching AES key from MongoDB:", error);
    res.status(500).send({ message: "Internal server error." });
  }
});
app.post("/sendDirectHTTP", async(req, res) => {
  console.log("http request aayi");
  const msg = req.body;
   if (connectedUsers[msg.receiverId]) {
      const { socketId, roomId: receiverRoom } = connectedUsers[msg.receiverId];
 io.to(socketId).emit("receiveMessageDirectly", msg);

  res.sendStatus(200);
} else {
    // Receiver is offline, save message temporarily
      saveTempMessage(msg, msg.senderId, msg.timestamp);

     const userSub = await PushSubscription.findOne({ userId: msg.receiverId });
if (userSub && userSub.subscription && userSub.subscription.endpoint) {
  const payload = JSON.stringify({
    title: "New Message",
    body: "You received a new message",
    roomId: msg.roomId,
  });

  await webpush.sendNotification(userSub.subscription, payload);
}



}
});


app.post("/sendRSAHTTP", async(req, res) => {
  console.log("http request aayi");
  const msg = req.body;
     if (connectedUsers[msg.receiverId]) {
      const { socketId, roomId: receiverRoom } = connectedUsers[msg.receiverId];
    io.to(socketId).emit("receiveMessageWithRsa", msg);

  res.sendStatus(200);
} else {
    // Receiver is offline, save message temporarily
      saveTempMessage(msg, msg.senderId, msg.timestamp);

     const userSub = await PushSubscription.findOne({ userId: msg.receiverId });
if (userSub && userSub.subscription && userSub.subscription.endpoint) {
  const payload = JSON.stringify({
    title: "New Message",
    body: "You received a new message",
    roomId: msg.roomId,
  });

  await webpush.sendNotification(userSub.subscription, payload);
}



}
});
  const saveTempMessage = (messagePayload, senderId, timestamp) => {
    const newMessage = new TempMessage(messagePayload);
    newMessage
      .save()
      .then(() => {
        console.log("Message saved temporarily");
        if (connectedUsers[senderId]) {
          io.to(connectedUsers[senderId].socketId).emit("updateMessageStatus", {
            roomId: messagePayload.roomId,
            messageId: timestamp,
            status: "sent",
          });
        }
      })
      .catch((err) => console.error("Error saving message:", err));
  };
let connectedUsers = {};
io.on("connection", (socket) => {
  socket.on("joinRoom", async ({ userId, roomId }) => {
    socket.join(roomId);
    socket.join(userId);
    connectedUsers[userId] = { socketId: socket.id, roomId };
   await TempMessage.find({ receiverId: userId, roomId: roomId })
      .then((messages) => {
        if (messages.length > 0) {
          const rsaMessage = messages.find((msg) => msg.encryptedAESKey);
          const directMessages = messages.filter((msg) => !msg.encryptedAESKey);
          if (rsaMessage) {
            io.to(socket.id).emit("receiveMessageWithRsa", rsaMessage);
            socket.on("aesKeySaved", () => {
              directMessages.forEach((message) => {
                io.to(socket.id).emit("receiveMessageDirectly", message);

                if (connectedUsers[message.senderId]) {
                  io.to(connectedUsers[message.senderId].socketId).emit(
                    "updateMessageStatus",
                    {
                      roomId: message.roomId,
                      messageId: message.timestamp,
                      status: "seen",
                    }
                  );
                }
              });
              TempMessage.deleteMany({ receiverId: userId, roomId: roomId })
                .then(() =>
                  console.log(
                    `Messages for room ${roomId} cleared from DB after sending to receiver`
                  )
                )
                .catch((err) =>
                  console.error("Error clearing messages from DB:", err)
                );
            });
          } else {
            // If no RSA message, directly send messages as usual
            directMessages.forEach((message) => {
              io.to(socket.id).emit("receiveMessageDirectly", message);

              if (connectedUsers[message.senderId]) {
                io.to(connectedUsers[message.senderId].socketId).emit(
                  "updateMessageStatus",
                  {
                    roomId: message.roomId,
                    messageId: message.timestamp,
                    status: "seen",
                  }
                );
              }
            });

            // Clear messages for that room after sending
            TempMessage.deleteMany({ receiverId: userId, roomId: roomId })
              .then(() =>
                console.log(
                  `Messages for room ${roomId} cleared from DB after sending to receiver`
                )
              )
              .catch((err) =>
                console.error("Error clearing messages from DB:", err)
              );
          }
        }
      })
      .catch((err) => console.error("Error fetching messages from DB:", err));
        const actions = await PendingAction.find({ userId, roomId });
  for (const action of actions) {
    io.to(socket.id).emit("processPendingAction", action);
    await PendingAction.deleteOne({ _id: action._id }); // Remove after sending
  }
  io.to(socket.id).emit("processPendingAction", { actionType: "none" });
  });

  socket.on("getStatus", (receiverId, callback) => {
    if (connectedUsers[receiverId]) {
      callback("online"); // User is online
    } else {
      callback("offline"); // User is offline
    }
  });
  socket.on("sendMessageWithRsa", async (data) => {
    const {
      roomId,
      senderId,
      receiverId,
      encryptedMessage,
      encryptedAESKey,
      timestamp,
      iv,
    } = data;

    const messagePayload = {
      roomId,
      senderId,
      receiverId,
      encryptedMessage,
      encryptedAESKey,
      timestamp,
      iv,
    };

    // Check if receiver is connected
    if (connectedUsers[receiverId]) {
      const { socketId, roomId: receiverRoom } = connectedUsers[receiverId];
    io.to(socketId).emit("receiveMessageWithRsa", messagePayload);

      // Check if receiver is in the same room
    
    } else {
      // Receiver is offline, save message temporarily
      saveTempMessage(messagePayload, senderId, timestamp);
       const userSub = await PushSubscription.findOne({ userId: receiverId });
if (userSub && userSub.subscription && userSub.subscription.endpoint) {
  const payload = JSON.stringify({
    title: "New Message",
    body: "You received a new message",
    roomId,
  });

  await webpush.sendNotification(userSub.subscription, payload);
}
    }
  });

  socket.on("sendMessageDirectly", async (data) => {
    const { roomId, senderId, receiverId, encryptedMessage, timestamp, iv } =
      data;

    const messagePayload = {
      roomId,
      senderId,
      receiverId,
      encryptedMessage,
      timestamp,
      iv,
    };

    // Check if receiver is connected
    if (connectedUsers[receiverId]) {
      const { socketId, roomId: receiverRoom } = connectedUsers[receiverId];
 io.to(socketId).emit("receiveMessageDirectly", messagePayload);

   
      // Check if receiver is in the same room
    
    } else {
      // Receiver is offline, save message temporarily
      saveTempMessage(messagePayload, senderId, timestamp);

     const userSub = await PushSubscription.findOne({ userId: receiverId });
if (userSub && userSub.subscription && userSub.subscription.endpoint) {
  const payload = JSON.stringify({
    title: "New Message",
    body: "You received a new message",
    roomId,
  });

  await webpush.sendNotification(userSub.subscription, payload);
}



    }
  });
  const saveTempMessage = (messagePayload, senderId, timestamp) => {
    const newMessage = new TempMessage(messagePayload);
    newMessage
      .save()
      .then(() => {
        console.log("Message saved temporarily");
        if (connectedUsers[senderId]) {
          io.to(connectedUsers[senderId].socketId).emit("updateMessageStatus", {
            roomId: messagePayload.roomId,
            messageId: timestamp,
            status: "sent",
          });
        }
      })
      .catch((err) => console.error("Error saving message:", err));
  };
  const savePendingAction = async (actionPayload) => {
  try {
    const action = new PendingAction(actionPayload);
    await action.save();
    console.log(`[PENDING_ACTION] Saved ${actionPayload.actionType} for user ${actionPayload.userId}`);
  } catch (err) {
    console.error("[PENDING_ACTION] Error saving:", err);
  }
};

  socket.on("disconnect", () => {
    for (let userId in connectedUsers) {
      if (connectedUsers[userId].socketId === socket.id) {
        delete connectedUsers[userId];
        break;
      }
    }
  });
  `   `;

  function isPartner(from, to) {
    // You might already have a collection like:
    // couples: [ { user1: id1, user2: id2 } ]
    return Couple.findOne({
      $or: [
        { user1: from, user2: to },
        { user1: to, user2: from },
      ],
    });
  }
  
socket.on("callUser", ({ to, from, name, type, offer }) => {
  io.to(to).emit("incomingCall", { from, name, type, offer });
});

socket.on("callAccepted", ({ from, to, answer }) => {
    console.log(`✅ Call accepted: ${to} accepted call from ${from}`);
    io.to(to).emit("callAccepted", { answer });
});

socket.on("ice-candidate", ({ to, candidate }) => {
  io.to(to).emit("ice-candidate", { candidate });
});

socket.on("callRejected", ({ from, to }) => {
    console.log(`❌ Call rejected: ${to} rejected call from ${from}`);
    io.to(to).emit("callRejected");
});

socket.on("endCall", ({ from, to }) => {
    console.log(`❌ Call ended: ${from} ended the call`);
    io.to(to).emit("callEnded");
});
socket.on("sendIMissYou", ({ from, to }) => {
  console.log(`💌 'I Miss You' sent from ${from} to ${to}`);
  io.to(to).emit("receiveIMissYou", { from });
});
socket.on("vanishUser", ({ from, to }) => {
    console.log(`💣 Vanish Mode triggered by ${from} for ${to}`);
    io.to(to).emit("forceLogout");
});
socket.on("triggerDisintegrate", async ({ from, to }) => {
  const targetUser = await User.findOne({ _id: to });

  if (!targetUser || !targetUser.disintegratePermission) return;

  const allowed = targetUser.disintegratePermission;

  if (
    allowed === "no-one" ||
    (allowed === "partner-only" && !isPartner(from, to))
  ) {
    io.to(from).emit("disintegrateDenied", { reason: "Not allowed" });
    return;
  }

  // 🔥 Proceed with disintegrate
  io.to(to).emit("forceLogout");
});
socket.on("unsendMessage", async (data) => {
  const { roomId, senderId, receiverId, messageId } = data;

  try {
    const receiverSession = connectedUsers[receiverId];
    const isReceiverOnline = receiverSession && receiverSession.roomId === roomId;

    const actionPayload = {
      userId: receiverId,
      roomId,
      initiatorId: senderId,
      messageId,
      actionType: "unsend"
    };

    if (isReceiverOnline) {
      // 🟢 Case 1: Receiver is online — emit directly
      const receiverSocketId = receiverSession.socketId;
      io.to(receiverSocketId).emit("deleteMessage", {
        roomId,
        messageId
      });
      console.log("[UNSEND] Receiver online — deleteMessage sent via socket");
    } else {
      // 🔴 Case 2: Receiver is offline — now check in TempMessage
      const deleted = await TempMessage.deleteOne({ roomId, timestamp: messageId });

    if (deleted.deletedCount !== 1) {
  await savePendingAction(actionPayload);
}
    }

  } catch (err) {
    console.error("[UNSEND] Error in unsendMessage:", err);
  }
});

socket.on("editMessage", async (data) => {
  const { roomId, senderId, receiverId, messageId, encryptedMessage, iv } = data;
  try {
    const receiverSession = connectedUsers[receiverId];
    const isReceiverOnline = receiverSession && receiverSession.roomId === roomId;

    const actionPayload = {
      userId: receiverId,
      roomId,
      initiatorId: senderId,
      messageId,
      actionType: "edit",
      encryptedMessage,
      iv
    };

    if (isReceiverOnline) {
      // 🟢 Receiver online — send edit command
      const receiverSocketId = receiverSession.socketId;
      io.to(receiverSocketId).emit("editMessageReceive", {
        roomId,
        messageId,
        encryptedMessage,
        iv
      });
      console.log("[EDIT] Receiver online — editMessage sent via socket");
    } else {
      // 🔴 Receiver offline — try to edit TempMessage
      const updated = await TempMessage.updateOne(
        { roomId, timestamp: messageId },
        { $set: { encryptedMessage: encryptedMessage, edited: true, iv: iv } }
      );

      if (updated.modifiedCount !== 1) {
        // TempMessage not found — save pending action
        await savePendingAction(actionPayload);
      }
    }
  } catch (err) {
    console.error("[EDIT] Error in editMessage:", err);
  }
});
socket.on("sendFile", (data) => {// Just log for now

    const { receiverId } = data;

    if (connectedUsers[receiverId]) {
        const { socketId } = connectedUsers[receiverId];
        io.to(socketId).emit("receiveFile", data);
    } else {
        console.log("Receiver not connected");
    }
});

});

app.post("/encryptAESKey", async (req, res) => {
  try {
    const { aesKey, receiverId } = req.body;
    // Fetch Receiver's Public Key
    const receiver = await User.findById(receiverId);

    const receiverPublicKey = receiver.publicKey;

    // Decode AES Key from Base64
    const aesKeyBuffer = Buffer.from(aesKey, "base64");
    // Encrypt AES Key with RSA Public Key
    const encryptedKey = crypto.publicEncrypt(
      {
        key: receiverPublicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      aesKeyBuffer
    );
    // Return Encrypted AES Key as Base64
    res.json({ encryptedAESKey: encryptedKey.toString("base64") });
  } catch (error) {
    console.error("Error in /encryptAESKey:", error);
    res.status(500).send("Encryption failed");
  }
});

app.post("/decryptAESKey", async (req, res) => {
  try {
    const { encryptedAESKey, receiverId } = req.body;

    // Fetch Sender's Private Key from Database
    const receiver = await User.findById(receiverId);
    const receiverPrivateKey = receiver.privateKey;
    // Decode Encrypted AES Key from Base64
    const encryptedKeyBuffer = Buffer.from(encryptedAESKey, "base64");

    // Decrypt AES Key with RSA Private Key
    const decryptedKey = crypto.privateDecrypt(
      {
        key: receiverPrivateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      encryptedKeyBuffer
    );
    // Encode Decrypted Key as Base64
    const decryptedAESKey = decryptedKey.toString("base64");
    // Send Decrypted AES Key to Frontend
    res.json({ decryptedAESKey });
  } catch (error) {
    console.error("Error in /decryptAESKey:", error);
    res.status(500).send("Decryption failed");
  }
});

app.post("/api/partner/request", authenticateJWT, async (req, res) => {
  const { partnerInput } = req.body;
  const user = req.user?.email || req.session?.user?.email || req.user?.username || req.session?.user?.username;


  const query = partnerInput.includes("@")
  ? { email: partnerInput.toLowerCase() }
  : { name: partnerInput };

const partner = await collection.findOne({
  $or: [query],
});
  if (!partner) return res.status(404).json({ message: "Partner not found." });
  
  const query2 = user.includes("@")
  ? { email: user.toLowerCase() }
  : { name: user };

const sender = await collection.findOne({
  $or: [query2],
});
  if (!sender) return res.status(404).json({ message: "Partner not found." });
  if (sender._id.equals(partner._id)) return res.status(400).json({ message: "You can't pair with yourself." });

  // Check if already paired
  const existing = await Couple.findOne({
    $or: [
      { user1: sender._id, user2: partner._id },
      { user1: partner._id, user2: sender._id}
    ]
  });

  if (existing) return res.status(400).json({ message: "Pairing already exists." });

  // Save pairing request
  await Couple.create({
    user1: sender._id,
    user2: partner._id,
    since: new Date().toISOString(),
    status: "pending",
    requestedBy: sender._id
  });

  res.json({ message: "Pairing request sent!" });
});
app.post("/api/settings/disintegrate-permission", authenticateJWT, async(req, res) => {
  const user = req.user?.email || req.session?.user?.email || req.user?.username || req.session?.user?.username;

  const { value } = req.body;
  const query2 = user.includes("@")
  ? { email: user.toLowerCase() }
  : { name: user };

const sender = await collection.findOne({
  $or: [query2],
});
  // Update user setting in DB (MongoDB etc.)
  await User.updateOne({ _id: sender._id }, { $set: { disintegratePermission: value } });


  res.sendStatus(200);
});


app.post('/check-partner', authenticateJWT, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ exists: false, message: "Email required" });

  try {
    const user = await User.findOne({ email });
    if (user) {
      return res.json({ exists: true });
    } else {
      return res.json({ exists: false, message: "User not found" });
    }
  } catch (err) {
    console.error("check-partner error", err);
    return res.status(500).json({ exists: false, message: "Server error" });
  }
});


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

app.post('/create-order', authenticateJWT, async (req, res) => {
  try {
    const { planId, partnerEmail  } = req.body;
    const plan = PLANS[planId];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    const amountPaise = plan.amountINR * 100; // Razorpay expects paise
    const orderOptions = {
      amount: amountPaise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1
    };

    const order = await razorpay.orders.create(orderOptions);
    return res.json({ order, planId, amountINR: plan.amountINR, partnerEmail  });
  } catch (err) {
    console.error('create-order error', err);
    return res.status(500).json({ error: 'Could not create order' });
  }
});

// 3) Verify payment (called from frontend after checkout success)
app.post('/verify-payment', authenticateJWT, async (req, res) => {
  /*
    Expecting body: {
      razorpay_order_id, razorpay_payment_id, razorpay_signature, planId
    }
  */
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, partnerEmail  } = req.body;
  const purchaserEmail = req.user.email;

  // verify signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret) === signature
  const generated_signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + '|' + razorpay_payment_id)
    .digest('hex');

  if (generated_signature !== razorpay_signature) {
    console.warn('Signature mismatch', { generated_signature, razorpay_signature });
    return res.status(400).json({ success: false, message: 'Invalid signature' });
  }

  // Signature valid: update user plan in DB
  try {
    const now = new Date();
    const update = { subscription: planId, planUpdatedAt: now };
    const user = await User.findOneAndUpdate({email: purchaserEmail }, update, { new: true, upsert: true });
 let giftToken = null;
    if (planId.endsWith("_both") && partnerEmail) {
      await User.findOneAndUpdate(
        { email: partnerEmail },
        { subscription: planId, planUpdatedAt: now },
        { new: true, upsert: true }
      );
        giftToken = crypto.randomBytes(20).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await Gift.create({
        token: giftToken,
        purchaserEmail,
        partnerEmail,
        planId,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        expiresAt
      });

    }
    
    // Set a cookie client-side or server-side. We'll set a secure cookie server-side too:
    // cookie options - adjust secure/samesite in prod


 const token = jwt.sign(
  { email: user.email, plan: user.subscription },
  "your_jwt_secret",
  { expiresIn: "3d" }
);

// Purani token cookie overwrite kardo
res.cookie("token", token, {
  httpOnly: true,       // security ke liye true hi rakho
  maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
  sameSite: "Lax"
});
 
   let redirectUrl = '/payment-success';
    if (giftToken) {
      // include token + partnerEmail for nice rendering
      const origin = process.env.APP_ORIGIN || '';
      // we'll add query params and frontend will navigate to them
      redirectUrl = `/payment-success?gift=${giftToken}&partner=${encodeURIComponent(partnerEmail)}`;
    }

    return res.json({ success: true, redirectUrl });
} catch (err) {
    console.error('DB update error', err);
    return res.status(500).json({ success: false, message: 'DB update failed' });
  }
});

// optional: webhook endpoint (safer for production) - verify signature via header 'x-razorpay-signature'
app.post('/razorpay-webhook', express.raw({ type: '*/*' }), (req, res) => {
  // implement if you want server-to-server confirmation
  res.status(200).send('ok');
});
app.get('/payment-success', authenticateJWT, async (req, res) => {
  const { email } = req.user;
  const giftToken = req.query.gift || null;
  const partnerEmail = req.query.partner || null;

  res.render('payment-success', {
    email,
    plan: req.user.subscription || req.user.plan || 'premium',
    giftToken,
    partnerEmail,
    appOrigin: process.env.APP_ORIGIN || ''
  });
});

app.get('/gift/:token', authenticateJWT, async (req, res) => {
  const token = req.params.token;
  try {
    const gift = await Gift.findOne({ token });
    if (!gift) return res.status(404).send('Invalid gift link.');

    // Expiry check (optional)
    if (new Date() > gift.expiresAt) {
      return res.render('gift-view', { status: 'expired', gift: null });
    }

    const currentEmail = req.user.email.toLowerCase();
    const partnerEmail = (gift.partnerEmail || '').toLowerCase();
    const purchaserEmail = (gift.purchaserEmail || '').toLowerCase();

    // Allow only purchaser or partner
    if (currentEmail !== partnerEmail && currentEmail !== purchaserEmail) {
      return res.status(403).send('Not authorized to view this gift.');
    }

    const isPartner = currentEmail === partnerEmail;
    const isPurchaser = currentEmail === purchaserEmail;

    return res.render('gift-view', {
      gift,
      status: 'active',
      isPartner,
      isPurchaser,
      currentEmail
    });

  } catch (err) {
    console.error('gift view error', err);
    return res.status(500).send('Server error');
  }
});
// Google Image Search API
app.get("/api/search", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json({ results: [] });

    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(
      q
    )}&cx=${process.env.CX_ID}&key=${process.env.API_KEY}&searchType=image`;

    const { data } = await axios.get(url);

    const results = (data.items || []).map((item) => ({
      url: item.link,
      thumb: item.image.thumbnailLink,
      context: item.image.contextLink,
    }));
console.log("we got the results")
    res.json({ results });
  } catch (err) {
    console.error("Search error:", err.response?.data || err.message);
    res.status(500).json({ error: "Search failed" });
  }
});
// Start the server
server.listen(port, '0.0.0.0', async () => {
  console.log("Server running on http://localhost:3000", port);
  // Start ngrok to expose the server
  try {
   
    console.log(`ngrok tunnel opened at: `);
  } catch (err) {
    console.error("Error starting ngrok:", err);
  }
});
