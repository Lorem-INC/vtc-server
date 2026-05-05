const http = require("http");
const fs = require("fs");
const path = require("path");
const express = require("express");
const app = express();
const cors = require("cors");
app.use(cors());
app.use(express.json());
const { getVTCMembers } = require("./Truckermpapi.js");

const PUBLIC_DIR = path.join(__dirname, "..");
app.use(express.static(PUBLIC_DIR));

const PORT = 5000;

// ==============================
// CONFIG
// ==============================

const CONFIG = JSON.parse(fs.readFileSync("./config.json", "utf8"));
const DRIVER_ID = CONFIG.driverId;
const DATA_FILE = "./data/stats.json";
const DRIVER_NAME = CONFIG.driverName;
const VTC_ID = CONFIG.vtcId || 69772;
// ==============================
// STATE
// ==============================

let jobActive = false;
let jobData = null;
let lastPosition = null;

// ==============================
// HELPERS
// ==============================

function loadData() {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
    const dir = "./data";

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function today() {
    return new Date().toISOString().split("T")[0];
}

function ensureToday(data) {
    ensureDriver(data);

    const t = today();

    if (!data[DRIVER_ID].daily[t]) {
        data[DRIVER_ID].daily[t] = {
            km: 0,
            jobs: 0,
            income: 0
        };
    }

    if (data[DRIVER_ID].daily[t].income == null) {
        data[DRIVER_ID].daily[t].income = 0;
    }
}

function ensureDriver(data) {
    if (!data[DRIVER_ID]) {
        data[DRIVER_ID] = {
            name: DRIVER_NAME,
            jobs: [],
            daily: {}
        };
    }

    if (DRIVER_NAME) {
        data[DRIVER_ID].name = DRIVER_NAME;
    }

    if (!data[DRIVER_ID].jobs) data[DRIVER_ID].jobs = [];
    if (!data[DRIVER_ID].daily) data[DRIVER_ID].daily = {};
}

app.post("/api/vtc/update", (req, res) => {
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

    // always update name
    if (name) {
        data[driverId].name = name;
    }

    // add job
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

function distance(x1, z1, x2, z2) {
    return Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
}

// ==============================
// WEEKLY SYSTEM
// ==============================

function getWeekNumber(dateString) {
    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(), 0, 4);

    return (
        date.getFullYear() +
        "-W" +
        Math.ceil(((date - week1) / 86400000 + 1) / 7)
    );
}

function calculateWeeklySummary(data) {
    const driver = data[DRIVER_ID];
    if (!driver) return {};

    const weekly = {};

    for (const date in driver.daily) {
        const week = getWeekNumber(date);

        if (!weekly[week]) {
            weekly[week] = {
                jobs: 0,
                km: 0,
                income: 0,
                avgSpeed: 0,
                speedCategory: "Normal"
            };
        }

        weekly[week].jobs += driver.daily[date].jobs;
        weekly[week].km += driver.daily[date].km;
        weekly[week].income += driver.daily[date].income;
    }

    for (const job of driver.jobs) {
        const week = getWeekNumber(job.start);
        if (!weekly[week]) continue;
        weekly[week].avgSpeed += job.avgSpeed;
    }

    for (const week in weekly) {
        if (weekly[week].jobs > 0) {
            weekly[week].avgSpeed = Math.round(
                weekly[week].avgSpeed / weekly[week].jobs
            );
        }

        if (weekly[week].avgSpeed >= 130) {
            weekly[week].speedCategory = "Abnormal";
        } else if (weekly[week].avgSpeed >= 110) {
            weekly[week].speedCategory = "High";
        }
    }

    return weekly;
}

// ==============================
// TELEMETRY POLL
// ==============================

function pollTelemetry() {
    http.get("http://localhost:25555/api/ets2/telemetry", res => {

        let raw = "";

        res.on("data", chunk => raw += chunk);

        res.on("end", () => {

            if (!raw || raw.trim() === "") return;

            let t;
            try { t = JSON.parse(raw); } catch { return; }

            const source = t?.job?.sourceCity || "";
            const dest = t?.job?.destinationCity || "";

            const posX =
                t?.truck?.placement?.x ??
                t?.truck?.position?.x ??
                t?.truck?.pos?.x;
            const posZ =
                t?.truck?.placement?.z ??
                t?.truck?.position?.z ??
                t?.truck?.pos?.z;

            const speed = Math.max(0, Math.round(t?.truck?.speed || 0));
            const income = t?.job?.income || 0;

            const hasJob = source !== "" && dest !== "";

            // JOB START
            if (!jobActive && hasJob) {
                jobActive = true;

                jobData = {
                    from: source,
                    to: dest,
                    km: 0,
                    speedSum: 0,
                    ticks: 0,
                    lastIncome: 0,
                    start: new Date().toISOString()
                };
            }

            // DISTANCE
            if (lastPosition && posX !== undefined && posZ !== undefined) {

                const d = distance(
                    lastPosition.x,
                    lastPosition.z,
                    posX,
                    posZ
                ) / 1000;

                if (d > 0 && d < 5) {
                    const data = loadData();
                    ensureDriver(data);
                    ensureToday(data);

                    data[DRIVER_ID].daily[today()].km += d;
                    data[DRIVER_ID].daily[today()].km =
                        Math.round(data[DRIVER_ID].daily[today()].km * 100) / 100;

                    if (jobActive && jobData) {
                        jobData.km += d;
                        jobData.km = Math.round(jobData.km * 100) / 100;

                        jobData.speedSum += speed;
                        jobData.ticks++;

                        if (income > 0) {
                            jobData.lastIncome = income;
                        }
                    }

                    saveData(data);
                }
            }

            lastPosition = { x: posX, z: posZ };

            // JOB END
            if (jobActive && !hasJob && jobData) {

                const data = loadData();
                ensureDriver(data);
                ensureToday(data);

                const avgSpeed =
                    jobData.ticks > 0
                        ? Math.round(jobData.speedSum / jobData.ticks)
                        : 0;

                let speedCategory = "Normal";
                if (avgSpeed >= 130) speedCategory = "Abnormal";
                else if (avgSpeed >= 110) speedCategory = "High";

                jobData.end = new Date().toISOString();
                jobData.avgSpeed = avgSpeed;
                jobData.speedCategory = speedCategory;
                jobData.income = Number(jobData.lastIncome) || 0;

                delete jobData.speedSum;
                delete jobData.ticks;
                delete jobData.lastIncome;

                data[DRIVER_ID].jobs.push(jobData);

                data[DRIVER_ID].daily[today()].jobs++;
                data[DRIVER_ID].daily[today()].income =
                    (data[DRIVER_ID].daily[today()].income || 0) +
                    (jobData.income || 0);

                saveData(data);

                jobActive = false;
                jobData = null;
            }
        });

    }).on("error", () => {});
}

setInterval(pollTelemetry, 2000);

// ==============================
// API ROUTES
// ==============================

// All data
app.get("/api/data", (req, res) => {
    res.json(loadData());
});

// Single driver
app.get("/api/driver/:id", (req, res) => {
    const data = loadData();
    res.json(data[req.params.id] || {});
});

// ==============================
// Member count
// ==============================
app.get("/api/vtc/members", async (req, res) => {
    try {
        const members = await getVTCMembers(VTC_ID);
        res.json({ members });
    } catch (err) {
        console.log(err);
        res.json({ members: 0 });
    }
});



// Weekly summary
app.get("/api/weekly/:id", (req, res) => {
    const data = loadData();
    const driver = data[req.params.id];

    if (!driver) return res.json({});

    res.json(calculateWeeklySummary(data));
});


// podium section


app.get("/api/top-performers", (req, res) => {
    const data = loadData();

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const leaderboard = Object.entries(data).map(([id, d]) => {
        let monthlyJobs = 0;
        let monthlyKM = 0;
        let monthlyIncome = 0;

        for (const day in d.daily) {
            const date = new Date(day);

            if (
                date.getMonth() === currentMonth &&
                date.getFullYear() === currentYear
            ) {
                monthlyJobs += d.daily[day].jobs || 0;
                monthlyKM += d.daily[day].km || 0;
                monthlyIncome += d.daily[day].income || 0;
            }
        }

        return {
            id,
            name: d.name || id,
            jobs: monthlyJobs,
            km: Math.round(monthlyKM),
            income: monthlyIncome
        };
    });

    leaderboard.sort((a, b) => b.jobs - a.jobs);

    res.json(leaderboard.slice(0, 3)); // TOP 3 ONLY
});

// Leaderboard (simple)
app.get("/api/leaderboard", (req, res) => {
    const data = loadData();

    const leaderboard = Object.entries(data).map(([id, d]) => {
        let totalKM = 0;
        let totalJobs = 0;
        let totalIncome = 0;

        for (const day in d.daily) {
            totalKM += d.daily[day].km;
            totalJobs += d.daily[day].jobs;
            totalIncome += d.daily[day].income;

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
// START SERVER
// ==============================

app.listen(PORT, () => {
    console.log(`🚀 API running on http://localhost:${PORT}`);
});