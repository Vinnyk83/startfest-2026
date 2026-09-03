// Vercel serverless entry point — wraps the Express app from server.js.
// server.js only calls app.listen() when run directly (`node server.js`),
// so requiring it here for Vercel's Node runtime is safe.
module.exports = require('../server');
