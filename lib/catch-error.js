// wrapper for async middleware. Eliminates need to try/catch every async route
const catchError = handler => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

module.exports = catchError;