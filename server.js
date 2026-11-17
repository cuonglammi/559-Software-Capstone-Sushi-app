// Sushi Order Application - entry point.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

require('./src/db');
require('./src/seed'); // idempotent seed of test data

const { errorHandler } = require('./src/middleware');
const { IDLE_TIMEOUT_MS } = require('./src/validation');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// NFR-4: CSP headers via helmet; all scripts/styles are same-origin files.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

// NFR-5: on Render (production) the platform terminates TLS; trust the proxy
// and redirect any plain-HTTP request to HTTPS.
if (IS_PROD) {
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    if (req.secure) return next();
    res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

app.use(express.json({ limit: '100kb' }));

// NFR-6: secure session management - HttpOnly cookies, idle expiration,
// SameSite, and Secure in production.
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PROD,
      maxAge: IDLE_TIMEOUT_MS,
    },
  })
);

// API routes
app.use('/api', require('./src/routes/auth'));
app.use('/api', require('./src/routes/sessions'));
app.use('/api', require('./src/routes/menu'));
app.use('/api', require('./src/routes/kitchen'));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Table-specific customer URL, e.g. /t/12 -> customer menu for table 12.
app.get('/t/:tableNumber', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer.html'));
});

// NFR-1: friendly 404 page for anything else.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', 'error.html'));
});

app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Sushi Order Application running at http://localhost:${PORT}`);
  });
}

module.exports = app;
