function securityHeaders(req, res, next) {
  res.setHeader("X-Powered-By", "Kernel Core Framework");
  res.setHeader("X-Kernel-Version", "2.0.3");
  res.setHeader("X-Kernel-Name", "Kernel Core CDN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
}

module.exports = { securityHeaders };
