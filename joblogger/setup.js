const fs = require("fs");
const readline = require("readline");

const CONFIG_PATH = "./config.json";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Extract TMP ID from link or raw input
function extractId(input) {
    const match = input.match(/\d+/);
    return match ? match[0] : input.trim();
}

// Validate name (basic clean check)
function validateName(name) {
    if (!name) return false;
    if (name.length > 20) return false;
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) return false;
    return true;
}

// STEP 1: Ask for ID
rl.question("Enter your TruckersMP profile link OR ID: ", (input) => {

    const id = extractId(input);

    if (!id) {
        console.log("❌ Invalid ID. Try again.");
        rl.close();
        return;
    }

    // STEP 2: Ask for Name
    rl.question("Enter your Driver Name: ", (nameInput) => {

        const name = nameInput.trim();

        if (!validateName(name)) {
            console.log("❌ Invalid name.");
            console.log("✔ Only letters, numbers, spaces, _ and - allowed");
            console.log("✔ Max 20 characters\n");
            rl.close();
            return;
        }

        const config = {
            driverId: id,
            driverName: name
        };

        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

        console.log("\n✅ Setup Complete!");
        console.log(`Driver: ${name} (${id})`);
        console.log("You can now start the logger.\n");

        rl.close();
    });
});