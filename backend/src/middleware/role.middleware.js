module.exports = function requireRole(...allowedRoles) {
  return function checkRole(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { message: 'Authentication required.' } });
    }

    if (!allowedRoles.some((role) => req.user.roles.includes(role))) {
      return res.status(403).json({ success: false, error: { message: 'You do not have permission to manage staff accounts.' } });
    }

    return next();
  };
};
