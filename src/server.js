require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const compression = require("compression");
const cors = require("cors");
const crypto = require("crypto");

const { getContentType, listFiles } = require("./helpers");
const { initDB, logRequest, exportRequestsToJSON } = require("./logger");
const { securityHeaders } = require("./middleware");

const app = express();
const PORT = process.env.PORT || 6932;

const KERNEL_CDN = {
  baseDir: path.join(__dirname, "../assets"),
  maxFileSize: (process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024,
  maxAge: 365 * 24 * 60 * 60,
  allowedExtensions: [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".mp3",
    ".wav",
    ".ogg",
    ".mp4",
    ".webm",
    ".json",
    ".xml",
    ".css",
    ".js",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
  ],
  trustedHosts: process.env.CDN_TRUSTED_HOSTS?.split(",") || [
    "cdn-fivem.kosmici.club",
  ],
  trustedReferer: process.env.CDN_TRUSTED_REFERER || "cfx-nui-kosmici-club",
  dbPath: process.env.REQUEST_DB_PATH || path.join(__dirname, "../requests.db"),
};

// MARK: Init Local DB
const db = initDB(KERNEL_CDN.dbPath);

// MARK: Middlewaress
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(cors());
app.use(securityHeaders);

// MARK: Request logger
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  res.locals.requestId = requestId;
  const ip =
    req.headers["cf-connecting-ip"] || req.ip || req.socket.remoteAddress;

  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logRequest(db, {
      id: requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      query: JSON.stringify(req.query),
      headers: JSON.stringify(req.headers),
      body: JSON.stringify(req.body),
      status: res.statusCode,
      ip,
    });
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${
        res.statusCode
      } (${duration}ms) [ID:${requestId}] IP:${ip}`
    );
  });
  next();
});

// MARK: Health status to Status API
app.get("/health", (req, res) =>
  res.json({ success: true, status: "ok", uptime: process.uptime() })
);

// MARK: folders/files routes
app.get("/list", (req, res) => {
  const result = listFiles(KERNEL_CDN.baseDir, "");
  if (result.error)
    return res.status(result.status).json({ error: result.error });
  res.json(result.data);
});
app.get("/list/:folder", (req, res) => {
  const result = listFiles(KERNEL_CDN.baseDir, req.params.folder);
  if (result.error)
    return res.status(result.status).json({ error: result.error });
  res.json(result.data);
});

app.use((req, res, next) => {
  if (req.path.startsWith("/list") || req.path === "/health") return next();
  const requestedPath = decodeURIComponent(req.path);
  const filePath = path.join(KERNEL_CDN.baseDir, requestedPath);
  if (!filePath.startsWith(KERNEL_CDN.baseDir))
    return res.status(403).send("Access denied");
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found");

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) return res.status(400).send("Cannot serve directory");

  const ext = path.extname(filePath).toLowerCase();
  if (!KERNEL_CDN.allowedExtensions.includes(ext))
    return res.status(403).send("File type not allowed");
  if (stat.size > KERNEL_CDN.maxFileSize)
    return res.status(413).send("File too large");

  // MARK: Security
  const host = req.headers.host || "";
  const referer = req.headers.referer || "";

  // MARK: Block if host is not trusted OR referer is missing/invalid
  if (
    !KERNEL_CDN.trustedHosts.includes(host) ||
    !referer.includes(KERNEL_CDN.trustedReferer)
  ) {
    const requestId = crypto.randomUUID();
    const ip =
      req.headers["cf-connecting-ip"] || req.ip || req.socket.remoteAddress;

    logRequest(db, {
      id: requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      query: JSON.stringify(req.query),
      headers: JSON.stringify(req.headers),
      body: JSON.stringify(req.body),
      status: 403,
      ip,
    });

    return res.status(403).send("Unauthorized request");
  }

  res.setHeader("Content-Type", getContentType(ext));
  res.setHeader("Cache-Control", `public, max-age=${KERNEL_CDN.maxAge}`);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("ETag", `"${stat.size}-${stat.mtime.getTime()}"`);
  res.setHeader("Last-Modified", stat.mtime.toUTCString());

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", end - start + 1);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else fs.createReadStream(filePath).pipe(res);
});

// MARK: 404 Handler
app.use((req, res) => {
  const errorId = crypto.randomUUID();
  const ip =
    req.headers["cf-connecting-ip"] || req.ip || req.socket.remoteAddress;

  logRequest(db, {
    id: errorId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    query: JSON.stringify(req.query),
    headers: JSON.stringify(req.headers),
    body: JSON.stringify(req.body),
    status: 404,
    ip,
  });

  res.status(404).json({
    success: false,
    error: "Not found",
    path: req.originalUrl,
    errorId,
  });
});

// MARK: Error Handler
app.use((err, req, res, next) => {
  const errorId = crypto.randomUUID();
  const status = err.status || 500;
  const ip =
    req.headers["cf-connecting-ip"] || req.ip || req.socket.remoteAddress;

  logRequest(db, {
    id: errorId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    query: JSON.stringify(req.query),
    headers: JSON.stringify(req.headers),
    body: JSON.stringify(req.body),
    status,
    ip,
  });

  console.error(`[Kernel CDN] [${errorId}] ${err.stack}`);
  res.status(status).json({
    success: false,
    error: err.message || "Internal server error",
    errorId,
  });
});

// MARK: Create default folders
["vehicles", "weapons", "characters", "maps", "ui", "audio", "misc"].forEach(
  (folder) => {
    const folderPath = path.join(KERNEL_CDN.baseDir, folder);
    if (!fs.existsSync(folderPath))
      fs.mkdirSync(folderPath, { recursive: true });
  }
);

// MARK: Start server
app.listen(PORT, () =>
  console.log(`[Kernel CDN] Server running on port ${PORT}`)
);

module.exports = { app, exportRequestsToJSON: () => exportRequestsToJSON(db) };
