const fs = require("fs");

function getConfig() {
    return JSON.parse(fs.readFileSync("./config.json", "utf8"));
}
async function getVTCMembers(vtcId) {
    const res = await fetch(`https://api.truckersmp.com/v2/vtc/${vtcId}/members`);
    const json = await res.json();

    return json?.response?.members?.length || 0;
}

module.exports = { getVTCMembers };

