// Import necessary modules
const express = require('express');
const path = require('path');
const ngrok = require('ngrok');  // Import ngrok to expose the local server
const app = express();
const port = 3001;  // You can change the port if needed

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Default route to serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'test.html'));
});

// Start the server
app.listen(port, async () => {
    console.log(`Server is running at http://localhost:${port}`);

    // Start ngrok to expose the server
    try {
        const url = await ngrok.connect(port);  // Get the ngrok public URL
        console.log(`ngrok tunnel opened at: ${url}`);
    } catch (err) {
        console.error('Error starting ngrok:', err);
    }
});
