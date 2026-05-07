const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Use environment variable for data file location, fallback to current directory
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, "data.json");

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.error("Directory creation error:", err);
}

// ==============================
// CONFIG
// ==============================

const PORT = process.env.PORT || 5000;

// ==============================
// SAFE DATA HANDLING
// ==============================

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({}));
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) {
    console.error("Load error:", err);
    return {};
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Save error:", err);
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
    dataFile: DATA_FILE
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
// START SERVER
// ==============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Data file: ${DATA_FILE}`);
  console.log("✅ Server is ready to accept connections");
});