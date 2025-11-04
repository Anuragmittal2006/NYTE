const mongoose = require('mongoose');


const tempMessageSchema = new mongoose.Schema({
    senderId: String,
    receiverId: String,
    messageText: String,
    timestamp: Number,
    chatId: String, // To track the chat between sender and receiver
    roomId: String,
  encryptedMessage: String,
  encryptedAESKey: String,
iv: String,  });
  
  const TempMessage = mongoose.model('TempMessage', tempMessageSchema);
  
  module.exports = TempMessage;