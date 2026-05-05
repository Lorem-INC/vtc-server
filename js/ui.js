


async function loadVTCMembers() {
    const counter = document.getElementById("vtc-members");
    if (!counter) return;

    try {
        const res = await fetch("/api/vtc/members");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const value = data.members ?? 0;
        counter.textContent = value;

        const badge = document.getElementById("vtc-members-badge");
        if (badge) badge.textContent = value;
    } catch (err) {
        console.error("Failed to load VTC members", err);
        counter.textContent = "N/A";

        const badge = document.getElementById("vtc-members-badge");
        if (badge) badge.textContent = "N/A";
    }
}

loadVTCMembers();

function formatIncome(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(amount);
}

function getDeliveryCategory(km) {
  if (!km) return 'Local Delivery';
  if (km >= 220) return 'Long Distance';
  if (km >= 100) return 'Heavy Cargo';
  if (km >= 40) return 'Express Delivery';
  return 'Local Delivery';
}

function getStatusVariant(status) {
  if (status === 'Running' || status === 'On') return 'status-pill--success';
  if (status === 'Idle' || status === 'Off') return 'status-pill--warning';
  return 'status-pill--muted';
}

function estimateFuelLevel(totalKm, capacity) {
  const estimated = Math.max(22, capacity - Math.round(totalKm / 3.5));
  return Math.min(capacity, estimated);
}

async function loadLeaderboard() {
  try {
    const res = await fetch("/api/leaderboard");
    const data = await res.json();

    const body = document.getElementById("leaderboardBody");
    if (!body) return;

    body.innerHTML = "";

    data.forEach((driver, index) => {

      const successRate = driver.jobs > 0 ? 100 : 0;
      const penaltyRate = typeof driver.penalties === 'number' ? Math.max(100 - driver.penalties * 2, 90) : 100;

      const row = document.createElement("tr");

      row.innerHTML = `
      <td>#${index + 1}</td>
      <td class="font-semibold">
  ${driver.name} <span style="opacity:0.6">(${driver.id})</span></td>
      <td class="text-center">${driver.jobs}</td>
      <td class="text-center">${driver.km} km</td>
      <td>${penaltyRate}%</td>
      <td>${index === 0 ? "⭐ Best Driver" : ""}</td>
      <td>-</td>
    `;

      body.appendChild(row);
    });

  } catch (err) {
    console.error("API Error:", err);
  }
}


async function loadTopPerformers() {
    try {
        const res = await fetch("/api/top-performers");
        if (!res.ok) {
            throw new Error(`Top performers API failed: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        if (!data.length) return;

        const first = data[0];
        const second = data[1];
        const third = data[2];

    // 1st place
    document.getElementById("top1-name").textContent =
        `${first.name}`;
    document.getElementById("top1-jobs").textContent =
        first.jobs.toLocaleString();

    // 2nd place
    if (second) {
        document.getElementById("top2-name").textContent =
            second.name;
        document.getElementById("top2-jobs").textContent =
            second.jobs.toLocaleString();
    }

    // 3rd place
    if (third) {
        document.getElementById("top3-name").textContent =
            third.name;
        document.getElementById("top3-jobs").textContent =
            third.jobs.toLocaleString();
    }
    } catch (err) {
        console.error("Failed to load top performers", err);
    }
}

loadTopPerformers();
setInterval(loadTopPerformers, 10000);

// run + refresh
loadLeaderboard();
setInterval(loadLeaderboard, 5000);