require("dotenv").config();
const path = require("path");
const { initDB, exportRequestsToJSON } = require("./logger");

const dbPath =
  process.env.REQUEST_DB_PATH || path.join(__dirname, "../requests.db");

const db = initDB(dbPath);

exportRequestsToJSON(db);

db.close((err) => {
  if (err) console.error("[Kernel CDN] | Error closing DB:", err.message);
  else console.log("[Kernel CDN] | DB closed after export.");
});
