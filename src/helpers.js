const fs = require("fs");
const path = require("path");

function getContentType(ext) {
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".json": "application/json",
    ".xml": "application/xml",
    ".css": "text/css",
    ".js": "application/javascript",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
  };
  return map[ext] || "application/octet-stream";
}

function listFiles(baseDir, folder) {
  const targetPath = path.join(baseDir, folder);
  if (!targetPath.startsWith(baseDir))
    return { error: "Access denied", status: 403 };
  if (!fs.existsSync(targetPath))
    return { error: "Folder not found", status: 404 };

  try {
    const items = fs.readdirSync(targetPath, { withFileTypes: true });
    return {
      data: items.map((i) => ({
        name: i.name,
        type: i.isDirectory() ? "directory" : "file",
        path: `/${folder}${folder ? "/" : ""}${i.name}`,
      })),
      status: 200,
    };
  } catch (err) {
    return { error: "Failed to read directory", status: 500 };
  }
}

module.exports = { getContentType, listFiles };
