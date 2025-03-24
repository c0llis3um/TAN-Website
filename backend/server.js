// backend/server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config(); // Load environment variables from .env file

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for frontend-backend communication
app.use(express.json());

// Endpoint to serve the API key
app.get('/api/key', (req, res) => {
    const apiKey = process.env.XUMM_API_KEY; // Get API key from environment variables
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not found' });
    }
    res.json({ apiKey });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});