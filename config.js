const mongoose = require("mongoose");
const connect = mongoose.connect("mongodb://localhost:27017/user");

//check database connected or not

connect.then(() =>{
    console.log("database connected");
})
.catch(() => {
    console.log("database cannot be coonected");

});


//create a schema

const LoginSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    
    },

    password: {
        type: String,
        required: true,
    },

    email: {
        type: String,
        required: true,
    },

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
})


const collection = new mongoose.model("user",LoginSchema);


module.exports = collection;
