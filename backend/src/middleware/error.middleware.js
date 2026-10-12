module.exports = function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const status = Number.isInteger(error.status) ? error.status : 500;
  const message = status < 500 ? error.message : 'An unexpected server error occurred.';

  if (status >= 500) {
    console.error('Request failed with an internal server error.');
  }

  return res.status(status).json({
    success: false,
    error: { message },
  });
};
