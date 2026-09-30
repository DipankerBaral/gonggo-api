// Express 4 doesn't catch errors thrown in async functions, so a failed
// database call would hang the request. This wrapper passes them to the
// error handler in app.js instead, which returns a 500.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
