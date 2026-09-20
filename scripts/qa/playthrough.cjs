/**
 * Headless play-through: drives a real browser through the game the way a player would and
 * reports anything a human would call a bug (bodies inside walls, jumping through ceilings,
 * bots that never hide, console errors). Run against a dev server:
 *
 *   npm run dev -- -p 4881
 *   NODE_PATH=$(npm root -g) node scripts/qa/playthrough.cjs [http://localhost:4881] [--maps=저택,백룸] [--rounds]
 *
 * Needs a global `playwright` (npm i -g playwright && npx playwright install chromium).
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://localhost:4881";
const mapArg = process.argv.find((a) => a.startsWith("--maps="));
const MAPS = mapArg ? mapArg.slice(7).split(",") : ["저택", "농장", "하수도", "백룸"];
const POSE_KEYS = { stand: "1", crouch: "2", sit: "3", lie: "4", stretch: "5", ball: "6", stick: "7", lean: "8", huddle: "9", spread: "0", upside: "Minus" };
const findings = [];
const note = (level, text) => {
  findings.push({ level, text });
  console.log(`${level === "BUG" ? "✗" : level === "WARN" ? "!" : "·"} ${text}`);
};

async function newGame(browser, nick) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Playroom|insertCoin/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.fill("#nickname", nick);
  await page.click("button:has-text('AI와 플레이')");
  await page.waitForSelector("aside h2", { timeout: 30000 });
  await page.waitForTimeout(1500);
  return { page, errors };
}

const world = (page, fn, arg) => page.evaluate(fn, arg);

/** Sample points 1.1m inside each room wall, facing that wall. */
async function wallApproaches(page) {
  return page.evaluate(() => {
    const map = window.__camelonWorld.map;
    const pts = [];
    for (const room of map.rooms ?? []) {
      const midX = room.x + room.w / 2, midZ = room.z + room.d / 2;
      pts.push({ x: midX, z: room.z + 1.1, yaw: 0, wall: `${room.id}:n` });
      pts.push({ x: midX, z: room.z + room.d - 1.1, yaw: Math.PI, wall: `${room.id}:s` });
      pts.push({ x: room.x + 1.1, z: midZ, yaw: Math.PI / 2, wall: `${room.id}:w` });
      pts.push({ x: room.x + room.w - 1.1, z: midZ, yaw: -Math.PI / 2, wall: `${room.id}:e` });
    }
    return pts;
  });
}

async function poseSweep(page, mapName) {
  await page.click(`aside button[aria-pressed]:has-text("${mapName}")`);
  await page.waitForTimeout(2500);
  await page.click("canvas");
  const points = await wallApproaches(page);
  let checks = 0;
  for (const [pose, key] of Object.entries(POSE_KEYS)) {
    for (const pt of points) {
      await world(page, ({ x, z, yaw }) => { const w = window.__camelonWorld; w.exitCling(); w.setLocal(x, z); w.yaw = yaw; }, pt);
      await page.keyboard.press("1");
      await page.waitForTimeout(80);
      // A teleport that lands inside furniture is a test artefact, not a game bug: skip it.
      const pre = await world(page, () => window.__camelonWorld.clipReport(window.__camelonSession.myId()).some((c) => c.depth > 0.12));
      if (pre) continue;
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
      // Poses that do not fit are refused by the game (banner) — nothing to push then.
      const posed = await world(page, () => window.__camelonSession.me().get("pose"));
      if (posed !== pose && pose !== "stick") continue;
      const preposed = await world(page, () => window.__camelonWorld.clipReport(window.__camelonSession.myId()).some((c) => c.depth > 0.12));
      if (preposed) continue;
      await page.keyboard.down("w");
      await page.waitForTimeout(700);
      await page.keyboard.up("w");
      await page.waitForTimeout(150);
      const clip = await world(page, () => window.__camelonWorld.clipReport(window.__camelonSession.myId()));
      checks++;
      const worst = clip.sort((a, b) => b.depth - a.depth)[0];
      if (worst && worst.depth > 0.12) note("BUG", `${mapName} ${pose} @${pt.wall}: ${worst.part} sinks ${worst.depth}m into a solid at ${worst.box.x.toFixed(1)},${worst.box.z.toFixed(1)}`);
    }
  }
  // Jump under every room ceiling: the head must stay below it.
  let jumps = 0;
  for (const pt of points) {
    await world(page, ({ x, z }) => { const w = window.__camelonWorld; w.exitCling(); w.setLocal(x, z); }, pt);
    await page.keyboard.press("1");
    await page.keyboard.down("Space"); await page.waitForTimeout(120); await page.keyboard.up("Space");
    let peak = 0;
    for (let i = 0; i < 8; i++) { await page.waitForTimeout(80); peak = Math.max(peak, await world(page, () => window.__camelonWorld.localY)); }
    const roof = await world(page, ({ x, z }) => { const w = window.__camelonWorld; const r = w.map.rooms?.find((rm) => x >= rm.x && x <= rm.x + rm.w && z >= rm.z && z <= rm.z + rm.d); return r?.ceiling?.open ? Infinity : (r?.ceiling?.height ?? w.map.ceiling); }, pt);
    jumps++;
    if (peak + 1.72 > roof + 0.05) note("BUG", `${mapName} jump @${pt.wall}: head reached ${(peak + 1.72).toFixed(2)}m under a ${roof}m ceiling`);
    await page.waitForTimeout(500);
  }
  note("OK", `${mapName}: ${checks} pose/wall approaches, ${jumps} ceiling jumps checked`);
}

async function doorSweep(page, mapName) {
  const doors = await world(page, () => window.__camelonWorld.doorRigs.map((d) => ({ id: d.def.id, x: d.def.x, z: d.def.z, along: d.def.along })));
  for (const d of doors) {
    await world(page, (d) => { const w = window.__camelonWorld; w.exitCling(); w.setLocal(d.x + (d.along === "x" ? 0 : 0.9), d.z + (d.along === "x" ? 0.9 : 0)); }, d);
    await page.waitForTimeout(400);
    await page.keyboard.press("e");
    await page.waitForTimeout(600);
    const open = await world(page, (id) => Math.abs(window.__camelonWorld.doorRigs.find((r) => r.def.id === id).pivot.rotation.y) > 0.2, d.id);
    if (!open) note("BUG", `${mapName} door ${d.id} did not open with E from ${d.x},${d.z}`);
  }
  note("OK", `${mapName}: ${doors.length} doors toggled`);
}

async function aiRound(page, mapName) {
  await page.selectOption("select[name=hunterMode]", "human");
  await page.fill("input[name=prepareTime]", "3");
  await page.fill("input[name=hideTime]", "30");
  await page.fill("input[name=huntTime]", "60");
  await page.click("button:has-text('라운드 시작')");
  await page.waitForTimeout(35000);
  const phase = await world(page, () => window.__camelonSession.getRoom().phase);
  if (phase !== "hunt") note("BUG", `${mapName}: expected hunt phase after prepare+hide, got ${phase}`);
  const bots = await world(page, () => { const s = window.__camelonSession; const room = s.getRoom(); return s.players().filter((p) => p.id !== s.myId() && room.participantIds.includes(p.id)).map((p) => ({ name: p.get("name"), pose: p.get("pose"), blobs: (p.get("blobs") || []).length, fill: p.get("fill") })); });
  const unpainted = bots.filter((b) => b.blobs === 0 && (b.fill === "#f3f1ea" || !b.fill));
  if (unpainted.length > 2) note("WARN", `${mapName}: ${unpainted.length}/${bots.length} bots still unpainted at hunt start (${unpainted.map((b) => b.name).join(",")})`);
  // Hunter tags the nearest bot from close range: the tag must register and the burst must play.
  // Walk up to a hidden bot (give the frame loop time to publish the new position), then tag.
  const tag = await world(page, () => {
    const s = window.__camelonSession; const w = window.__camelonWorld; const room = s.getRoom();
    const bot = s.players().find((p) => p.id !== s.myId() && room.participantIds.includes(p.id) && !room.caughtIds.includes(p.id));
    if (!bot) return null;
    w.exitCling(); w.setLocal(bot.get("x") + 1.2, bot.get("z") + 0.2);
    return bot.id;
  });
  await page.waitForTimeout(600);
  await world(page, (id) => { const s = window.__camelonSession; const seq = Number(s.me().get("shootSeq") ?? 0) + 1; s.me().set("shootSeq", seq); s.callShot(id, s.myId(), seq); }, tag);
  await page.waitForTimeout(600);
  const caught = await world(page, (id) => window.__camelonSession.getRoom().caughtIds.includes(id), tag);
  if (!caught) note("BUG", `${mapName}: point-blank tag did not catch the bot`);
  const fx = await world(page, () => window.__camelonWorld.killFx?.length ?? -1);
  if (fx === 0) note("BUG", `${mapName}: no catch effect after a tag`);
  // Let the hunt run out and confirm the result screen.
  await page.waitForTimeout(62000);
  const end = await world(page, () => window.__camelonSession.getRoom().phase);
  if (end !== "result" && end !== "reveal") note("BUG", `${mapName}: round did not reach reveal/result (phase ${end})`);
  else note("OK", `${mapName}: round completed → ${end}, ${caught ? "tag registered" : "no tag"}, kill fx ${fx}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  for (const mapName of MAPS) {
    const { page, errors } = await newGame(browser, "QA봇");
    try {
      await poseSweep(page, mapName);
      await doorSweep(page, mapName);
      if (process.argv.includes("--rounds")) await aiRound(page, mapName);
    } catch (e) {
      note("BUG", `${mapName}: script failure ${e.message.slice(0, 160)}`);
    }
    if (errors.length) note("BUG", `${mapName}: console errors: ${errors.slice(0, 3).join(" | ")}`);
    await page.context().close();
  }
  await browser.close();
  const bugs = findings.filter((f) => f.level === "BUG").length;
  const warns = findings.filter((f) => f.level === "WARN").length;
  console.log(`\n=== play-through: ${bugs} bug(s), ${warns} warning(s) ===`);
  process.exit(bugs ? 1 : 0);
})();
