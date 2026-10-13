const jwt = require('jsonwebtoken');
const env = require('../config/env');
const authRepository = require('../modules/auth/auth.repository');

module.exports = async function authenticate(req, res, next) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, error: { message: 'Authentication required.' } });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, { issuer: 'dyci-gso' });
    const user = await authRepository.getSessionUser(payload.sub);

    if (!user || !user.is_active || !user.email_verified_at || user.token_version !== payload.ver) {
      return res.status(401).json({ success: false, error: { message: 'Authentication required.' } });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: await authRepository.getUserRoles(user.id),
    };
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'NotBeforeError') {
      return res.status(401).json({ success: false, error: { message: 'Authentication required.' } });
    }
    return next(error);
  }
};
