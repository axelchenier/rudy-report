// shotview.js - the "Shot chart" tab on player and team pages.
import { renderTable, esc } from "../ui.js";
import { shotZones, playerShots, binShots, courtSVG, dietRows, dietBar, diffColor } from "../shots.js";

const pct = (v) => v == null ? "–" : (100 * v).toFixed(1);
const pp = (v) => v == null ? "–" : `${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}`;

function legend() {
  return `<div class="shot-legend"><span>Colder than league average</span>
    ${[-12, -6, 0, 6, 12].map((d) => `<i style="background:${diffColor(d)}"></i>`).join("")}
    <span>Hotter</span><span class="muted">· bigger hexagon = more shots · gray = under 5 shots</span></div>`;
}

function dietTable(box, rows) {
  renderTable(box, {
    rows, entity: "players", rank: false, pageSize: 10,
    columns: [
      { key: "ZONE", label: "Zone", left: true },
      { key: "FGA", label: "FGA", title: "Field goal attempts from this zone", html: (r) => r.FGA },
      { key: "FREQ", label: "Freq", title: "Share of all shots taken from this zone", html: (r) => pct(r.FREQ) },
      { key: "LG_FREQ", label: "Lg freq", title: "League-wide share of shots from this zone", html: (r) => pct(r.LG_FREQ) },
      { key: "FG_PCT", label: "FG%", title: "Field goal % from this zone", html: (r) => pct(r.FG_PCT) },
      { key: "LG_FG_PCT", label: "Lg FG%", title: "League-average FG% from this zone", html: (r) => pct(r.LG_FG_PCT) },
      { key: "DIFF", label: "vs Lg", title: "FG% minus the league average from the exact same spots (percentage points)",
        html: (r) => r.DIFF == null || r.FGA < 10 ? `<span class="muted">${r.FGA ? "small sample" : "–"}</span>` : `<span class="${r.DIFF >= 0 ? "pos" : "neg"}">${pp(r.DIFF)}</span>` },
      { key: "PPS", label: "Pts/shot", title: "Points per shot from this zone (free throws not included)", html: (r) => r.PPS == null ? "–" : r.PPS.toFixed(2) },
      { key: "LG_PPS", label: "Lg pts/shot", title: "League points per shot from this zone", html: (r) => r.LG_PPS.toFixed(2) },
    ],
  });
}

export async function renderShotChart(box, { season, playerId, teamId }) {
  let zoneFile;
  try { zoneFile = await shotZones(season); }
  catch { box.innerHTML = `<p class="muted">No shot data for ${season} yet.</p>`; return; }
  const zones = zoneFile.zones, size = zoneFile.hex_size;
  const isTeam = !!teamId;
  let shots = [], side = "for";

  if (!isTeam) shots = await playerShots(season, playerId).catch(() => []);
  if (!isTeam && !shots.length) { box.innerHTML = `<p class="muted">No shots recorded for him in ${season}.</p>`; return; }

  box.innerHTML = `
    <div class="toolbar">
      ${isTeam ? `<div class="tabs" id="sc-side"><button data-v="for" class="active">Team's shots</button><button data-v="against">Opponents' shots</button></div>`
        : `<div class="tabs" id="sc-mode"><button data-v="hex" class="active">Heat map</button><button data-v="dots">Every shot</button></div>
           <label class="small">Quarter <select id="sc-period"><option value="">All</option><option>1</option><option>2</option><option>3</option><option>4</option><option value="5">OT</option></select></label>`}
    </div>
    <div class="shot-wrap">
      <div class="card shot-card"><div id="sc-court"></div><div id="sc-legend"></div></div>
      <div class="shot-side">
        <div class="card"><h3>Shot diet</h3><div id="sc-diet"></div></div>
        <div class="card" style="margin-top:12px"><h3>By zone vs league average</h3><div id="sc-table"></div></div>
      </div>
    </div>
    <p class="muted small">Source: NBA.com/stats shot chart data (ShotChartDetail) via nba_api, ${season} regular season.
      "vs Lg" compares each shot with the league-average FG% from the same zone, so a player who takes harder shots isn't
      punished for it. Dots/hexagons are field goal attempts (free throws aren't on the chart).</p>`;

  const draw = () => {
    let bins, counts = {}, total, made;
    if (isTeam) {
      const t = zoneFile.teams[String(teamId)]?.[side];
      if (!t) { box.querySelector("#sc-court").innerHTML = `<p class="muted">No shots for this team yet.</p>`; return; }
      bins = t.hex; counts = t.zones;
      total = bins.reduce((a, b) => a + b[2], 0); made = bins.reduce((a, b) => a + b[3], 0);
      box.querySelector("#sc-court").innerHTML = courtSVG({ mode: "hex", bins, size, invert: side === "against" });
    } else {
      const period = box.querySelector("#sc-period").value;
      const mode = box.querySelector("#sc-mode .active").dataset.v;
      const list = shots.filter((s) => !period || (period === "5" ? s.P >= 5 : s.P === Number(period)));
      for (const s of list) { const c = counts[s.Z] || (counts[s.Z] = [0, 0]); c[0]++; c[1] += s.M; }
      total = list.length; made = list.reduce((a, s) => a + s.M, 0);
      box.querySelector("#sc-court").innerHTML = list.length ? courtSVG({ mode, shots: list, bins: binShots(list, zones, size), size })
        : `<p class="muted">No shots in that quarter.</p>`;
      box.querySelector("#sc-legend").innerHTML = mode === "hex" ? legend() : `<div class="shot-legend"><i class="dot made"></i> made <i class="dot miss"></i> missed</div>`;
    }
    if (isTeam) box.querySelector("#sc-legend").innerHTML = side === "against"
      ? legend().replace("Colder than league average", "Opponents shot better than average (bad)").replace("Hotter", "Opponents shot worse (good defense)")
      : legend();
    const rows = dietRows(counts, zones);
    box.querySelector("#sc-diet").innerHTML = `<p class="small muted">${total.toLocaleString()} shots · ${made.toLocaleString()} made (${pct(total ? made / total : null)}%)</p>` + dietBar(rows);
    dietTable(box.querySelector("#sc-table"), rows);
  };
  box.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
    b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    if (isTeam) side = b.dataset.v;
    draw();
  }));
  box.querySelector("#sc-period")?.addEventListener("change", draw);
  draw();
}
