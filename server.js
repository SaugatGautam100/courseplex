
// server.js
const express = require('express');
const next = require('next');
const path = require('path');

// Determine if the environment is development or production.
// On cPanel, NODE_ENV will be 'production' when you run the start script.
const dev = process.env.NODE_ENV !== 'production';

// Create a Next.js app instance. The `{ dev }` object ensures Next.js
// runs in the correct mode.
const app = next({ dev });

// Get the request handler from the Next.js app.
const handle = app.getRequestHandler();

// cPanel's Phusion Passenger will provide the PORT via an environment variable.
// Fallback to 3000 for local testing (e.g., running `npm start` on your computer).
const port = process.env.PORT || 3000;

app.prepare().then(() => {
  // Create a new Express server.
  const server = express();

  // The main Next.js handler.
  // This rule says: for ANY request ('*'), pass it to the Next.js handler.
  // Next.js will then correctly route it to your pages, API routes, etc.
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  // Start the Express server and listen on the port provided by cPanel.
  server.listen(port, (err) => {
    if (err) throw err;
    // This log is helpful for local testing but won't be the primary URL on cPanel.
    console.log(`> Ready on http://localhost:${port}`);
  });
});