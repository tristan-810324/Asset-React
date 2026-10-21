const authService = require('./auth.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const registerBorrower = asyncHandler(async (req, res) => {
  const result = await authService.registerBorrower({
    name: req.body?.name,
    email: req.body?.email,
    password: req.body?.password,
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, data: result });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    email: req.body?.email,
    password: req.body?.password,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: result });
});

const verifyEmailOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyEmailOtp({
    challengeId: req.body?.challengeId,
    otp: req.body?.otp,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: result });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset({ email: req.body?.email, ipAddress: req.ip });
  res.json({ success: true, data: result });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyPasswordResetOtp({
    challengeId: req.body?.challengeId,
    otp: req.body?.otp,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: result });
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword({
    resetToken: req.body?.resetToken,
    password: req.body?.password,
    ipAddress: req.ip,
  });
  res.json({ success: true, data: result });
});

const currentUser = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

module.exports = { registerBorrower, login, verifyEmailOtp, forgotPassword, verifyOtp, resetPassword, currentUser };
