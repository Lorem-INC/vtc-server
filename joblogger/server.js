const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();

// ==============================
// CONFIG (EARLY)
// ==============================

const PORT = process.env.PORT || 5000;
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, "data.json");

console.log(`[STARTUP] PORT: ${PORT}`);
console.log(`[STARTUP] DATA_DIR: ${DATA_DIR}`);
console.log(`[STARTUP] NODE_ENV: ${process.env.NODE_ENV || "development"}`);
console.log(`[STARTUP] All env vars:`, Object.keys(process.env).filter(key => key.includes('PORT') || key.includes('NODE') || key.includes('RAILWAY')));

// ==============================
// MIDDLEWARE
// ==============================

app.use(cors());
app.use(express.json());

// ==============================
// ERROR HANDLERS
// ==============================

// Catch all uncaught errors
process.on("uncaughtException", (err) => {
  console.error(`[FATAL ERROR] ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(`[UNHANDLED REJECTION] ${reason}`);
});

// ==============================
// INITIALIZE DATA DIRECTORY (DEFENSIVE)
// ==============================

let dataDirReady = false;
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[STARTUP] Created data directory: ${DATA_DIR}`);
    dataDirReady = true;
  } else {
    console.log(`[STARTUP] Data directory exists: ${DATA_DIR}`);
    dataDirReady = true;
  }
} catch (err) {
  console.error(`[STARTUP] Failed to create/access data directory: ${err.message}`);
  console.warn(`[STARTUP] Will run in memory-only mode`);
  dataDirReady = false;
}

// ==============================
// SAFE DATA HANDLING
// ==============================

function loadData() {
  if (!dataDirReady) {
    console.log(`[DATA] Memory-only mode: returning empty data`);
    return {};
  }

  try {
    if (!fs.existsSync(DATA_FILE)) {
      console.log(`[DATA] Creating new data file: ${DATA_FILE}`);
      fs.writeFileSync(DATA_FILE, JSON.stringify({}));
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    console.log(`[DATA] Loaded data with ${Object.keys(data).length} drivers`);
    return data;
  } catch (err) {
    console.error(`[DATA] Load error: ${err.message}`);
    return {};
  }
}

function saveData(data) {
  if (!dataDirReady) {
    console.log(`[DATA] Memory-only mode: skipping save`);
    return;
  }

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`[DATA] Saved data for ${Object.keys(data).length} drivers`);
  } catch (err) {
    console.error(`[DATA] Save error: ${err.message}`);
  }
}

// ==============================
// ROOT TEST
// ==============================

app.get("/", (req, res) => {
  res.json({ 
    status: "API is running ✅",
    port: PORT,
    nodeEnv: process.env.NODE_ENV || "development",
    dataFile: DATA_FILE,
    timestamp: new Date().toISOString()
  });
});

// ==============================
// HEALTH CHECK (NO FILE I/O)
// ==============================

app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

// ==============================
// UPDATE DRIVER DATA
// ==============================

app.post("/api/vtc/update", (req, res) => {
  console.log("Incoming:", req.body);

  const { driverId, name, job } = req.body;

  if (!driverId) {
    return res.status(400).json({ error: "Missing driverId" });
  }

  const data = loadData();

  if (!data[driverId]) {
    data[driverId] = {
      name: name || driverId,
      jobs: [],
      daily: {}
    };
  }

  if (name) {
    data[driverId].name = name;
  }

  if (job) {
    data[driverId].jobs.push(job);

    const today = new Date().toISOString().split("T")[0];

    if (!data[driverId].daily[today]) {
      data[driverId].daily[today] = {
        jobs: 0,
        km: 0,
        income: 0
      };
    }

    data[driverId].daily[today].jobs += 1;
    data[driverId].daily[today].km += job.km || 0;
    data[driverId].daily[today].income += job.income || 0;
  }

  saveData(data);

  res.json({ status: "ok" });
});

// ==============================
// LEADERBOARD
// ==============================

app.get("/api/leaderboard", (req, res) => {
  const data = loadData();

  const leaderboard = Object.entries(data).map(([id, d]) => {
    let totalKM = 0;
    let totalJobs = 0;
    let totalIncome = 0;

    for (const day in d.daily) {
      totalKM += d.daily[day].km || 0;
      totalJobs += d.daily[day].jobs || 0;
      totalIncome += d.daily[day].income || 0;
    }

    return {
      id,
      name: d.name || id,
      jobs: totalJobs,
      km: Math.round(totalKM),
      income: totalIncome
    };
  });

  leaderboard.sort((a, b) => b.jobs - a.jobs);

  res.json(leaderboard);
});

// ==============================
// TOP 3 (MONTHLY)
// ==============================

app.get("/api/top-performers", (req, res) => {
  const data = loadData();

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const leaderboard = Object.entries(data).map(([id, d]) => {
    let jobs = 0;
    let km = 0;
    let income = 0;

    for (const day in d.daily) {
      const date = new Date(day);

      if (date.getMonth() === month && date.getFullYear() === year) {
        jobs += d.daily[day].jobs || 0;
        km += d.daily[day].km || 0;
        income += d.daily[day].income || 0;
      }
    }

    return {
      id,
      name: d.name || id,
      jobs,
      km: Math.round(km),
      income
    };
  });

  leaderboard.sort((a, b) => b.jobs - a.jobs);

  res.json(leaderboard.slice(0, 3));
});

// ==============================
// ERROR HANDLING MIDDLEWARE
// ==============================

app.use((err, req, res, next) => {
  console.error(`[EXPRESS ERROR] ${err.message}`);
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// ==============================
// 404 HANDLER
// ==============================

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found", path: req.path });
});

// ==============================
// START SERVER
// ==============================

console.log(`[STARTUP] About to start server on port ${PORT}...`);

const server = app.listen(PORT, () => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ✅ SERVER STARTED SUCCESSFULLY`);
  console.log(`[${timestamp}] Listening on port ${PORT}`);
  console.log(`[${timestamp}] Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`[${timestamp}] Data file: ${DATA_FILE}`);
  console.log(`[${timestamp}] Process ID: ${process.pid}`);
});

// Handle server errors
server.on("error", (err) => {
  console.error(`[SERVER ERROR] ${err.message}`);
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use`);
  }
  process.exit(1);
});

// Log when server closes
server.on("close", () => {
  console.log("[SERVER] Server closed");
});