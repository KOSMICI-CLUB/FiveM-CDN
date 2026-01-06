const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

function initDB(dbPath) {
  if (!fs.existsSync(path.dirname(dbPath)))
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err)
      console.error("[Kernel CDN] | Failed to open request DB:", err.message);
  });

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        method TEXT,
        path TEXT,
        query TEXT,
        headers TEXT,
        body TEXT,
        status INTEGER,
        ip TEXT
      )
    `);
  });

  return db;
}

function logRequest(db, data) {
  const { id, timestamp, method, path, query, headers, body, status, ip } =
    data;
  db.run(
    `INSERT INTO requests (id, timestamp, method, path, query, headers, body, status, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, timestamp, method, path, query, headers, body, status, ip],
    (err) => {
      if (err)
        console.error("[Kernel CDN] Failed to log request:", err.message);
    }
  );
}

function exportRequestsToJSON(
  db,
  outputPath = path.join(__dirname, "../requests.json")
) {
  db.all(`SELECT * FROM requests ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err)
      return console.error(
        "[Kernel CDN] | Failed to export requests:",
        err.message
      );
    fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2));
    console.log("[Kernel CDN] Requests exported to", outputPath);
  });
}

module.exports = { initDB, logRequest, exportRequestsToJSON };
