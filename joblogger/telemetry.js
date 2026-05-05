function logEvent(type, data) {
    console.log("\n==============================");
    console.log(type);
    console.log("Cargo:", data?.trailer?.name);
    console.log("From:", data?.job?.sourceCity);
    console.log("To:", data?.job?.destinationCity);
    console.log("==============================\n");
}
const http = require("http");

let jobActive = false;
let lastCargo = null;

function checkJob(data) {

    const attached = data?.trailer?.attached;
    const cargo = data?.trailer?.name || null;

    // 🚚 JOB START
    if (!jobActive && attached && cargo) {
        jobActive = true;
        lastCargo = cargo;

        logEvent("🚚 JOB STARTED", data);
        console.log("Cargo:", cargo);
        console.log("From:", data?.job?.sourceCity);
        console.log("To:", data?.job?.destinationCity);
    }

    // 🏁 JOB END
    if (jobActive && (!attached || !cargo)) {
        jobActive = false;

        logEvent("🏁 JOB FINISHED", { trailer: { name: lastCargo } });
        console.log("Cargo:", lastCargo);

        lastCargo = null;
    }
}

setInterval(() => {

    http.get("http://localhost:25555/api/ets2/telemetry", res => {

        let raw = "";

        res.on("data", chunk => raw += chunk);

        res.on("end", () => {
            try {
                const t = JSON.parse(raw);

                // ✅ CHECK JOB STATE
                checkJob(t);

                

                console.log("Online:", t.game.connected);
                console.log("Game paused:", t.game.paused);
                console.log("Speed:", t.truck.speed, "km/h");
                console.log("Income:", "€", t.job.income);
                console.log("Distance left:", t.navigation.estimatedDistance);
                console.log("Start city:", t.job.sourceCity, ":", t.job.sourceCompany);
                console.log("End city:", t.job.destinationCity, ":", t.job.destinationCompany);
                console.log("Fuel left:", t.truck.fuel, "l");
                console.log("Total Fuel:", t.truck.fuelCapacity, "l");
                console.log("Engine status:", t.truck.engineOn);
                console.log("Cargo:", t.trailer.name || "None");

            } catch (err) {
                console.log("Telemetry parse error");
            }
        });

    });

}, 1000);