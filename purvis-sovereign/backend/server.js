// /backend/server.js
// PURVIS SOVEREIGN CORE — Express bootstrap.
// Mounts /api/* routes and (when run standalone) serves the /frontend folder.

const path = require("path");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const runRoutes = require("./routes/run");

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));

// Guaranteed entrypoint for free-platform deploy systems (Render, Railway,
// Fly.io, Replit, etc.) — gives them a 200 response on "/" so the app is
// detected as healthy and never shows a blank screen.
app.get("/", (req, res) => {
  res.json({ status: "running" });
});

// All API routes are prefixed with /api (required for proper ingress routing).
app.use("/api", runRoutes);

// When this file is run directly (npm start), also serve the static frontend.
// In Emergent, the FastAPI proxy in /app/backend/server.py forwards /api/* here,
// and React on port 3000 serves the UI. Both modes work.
const frontendDir = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendDir));

const PORT = process.env.PORT || 8002;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`[PURVIS] Sovereign Core listening on 0.0.0.0:${PORT}`);
  });
}

module.exports = app;
