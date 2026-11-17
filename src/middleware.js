// Auth middleware and shared helpers.
const { isSessionExpired } = require('./validation');

// FR-A1: staff routes require login. FR-A4 / NFR-6: 15-minute idle timeout
// enforced server-side on every authenticated request.
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  const now = Date.now();
  if (req.session.lastActivity && isSessionExpired(req.session.lastActivity, now)) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Your session expired due to inactivity. Please log in again.' });
  }
  req.session.lastActivity = now;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session.role !== role) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    next();
  };
}

// NFR-1: friendly message to the client, detailed log server-side only.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: 'Something went wrong - please try again.' });
}

module.exports = { requireAuth, requireRole, errorHandler };
