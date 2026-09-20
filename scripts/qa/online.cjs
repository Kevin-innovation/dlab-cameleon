/**
 * Online play-through with four real browser sessions on one Playroom room: create → join by
 * code → join from the list → kick → round with a late joiner → host leaves → succession →
 * everyone leaves. Needs the dev server (with KV env) and a global playwright:
 *
 *   NODE_PATH=$(npm root -g) node scripts/qa/online.cjs [http://localhost:4881]
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://localhost:4881";
const ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " · " + detail : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(browser, nick) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${nick}] pageerror ${e.message}`));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.fill("#nickname", nick);
  await page.click("button:has-text('한국 서버 입장')");
  await page.waitForSelector("button:has-text('방 만들기')", { timeout: 40000 });
  return page;
}
const inLobby = (page) => page.waitForSelector("aside h2", { timeout: 40000 });
const names = (page) => page.$$eval('aside ul[aria-label="참가자"] li', (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
const joinByCode = async (page, code) => {
  await page.click("button:has-text('코드로 참가')");
  await page.fill("input[name=roomCode]", code);
  await page.click("form button[type=submit]:has-text('입장')");
  await inLobby(page);
};

(async () => {
  const browser = await chromium.launch({ headless: true, args: ARGS });
  const roomName = `QA${Date.now().toString(36).slice(-4)}`;
  try {
    // 1. Host creates a 4-player room.
    const a = await open(browser, "방장A");
    await a.click("button:has-text('방 만들기')");
    await a.fill("input[name=roomName]", roomName);
    await a.click('[role=radiogroup] [role=radio]:has-text("4")');
    await a.click("form button[type=submit]");
    await inLobby(a);
    const code = (await a.$eval('button[title="초대 링크 복사"]', (e) => e.textContent.trim())).replace(/복사.*$/, "").trim();
    check("host created room", /^[A-Z0-9]{8}$/.test(code), `${roomName} ${code}`);

    // 2. Guest joins by code; both see two names, guest sees the crown on the host.
    const b = await open(browser, "손님B");
    await joinByCode(b, code);
    await sleep(2500);
    const bNames = await names(b);
    check("guest sees host + self", bNames.length === 2 && bNames.some((n) => n.includes("방장A")) && bNames.some((n) => n.includes("손님B")), bNames.join(" | "));
    check("guest sees crown on host", bNames.some((n) => n.includes("👑") && n.includes("방장A")));
    check("host sees 2/4", (await names(a)).length === 2);

    // 3. Third player joins from the room list.
    const c = await open(browser, "손님C");
    await c.waitForSelector(`text=${roomName}`, { timeout: 30000 });
    await c.click(`article:has-text("${roomName}") button:has-text("입장")`);
    await inLobby(c);
    await sleep(2500);
    check("list join → 3 players", (await names(a)).length === 3, (await names(a)).join(" | "));

    // 4. Host kicks C; C lands on home with the kick notice.
    a.once("dialog", (d) => d.accept());
    await a.click('button[aria-label="손님C 강퇴"]');
    await c.waitForSelector("text=방장이 당신을 방에서 내보냈습니다", { timeout: 20000 }).then(() => check("kicked guest sees notice", true)).catch(() => check("kicked guest sees notice", false));
    await sleep(1500);
    check("host list drops kicked guest", (await names(a)).length === 2);

    // 5. Round with a late joiner: D enters during hide and must spectate.
    for (const p of [a, b]) await p.click('aside button:has-text("준비")');
    await a.fill("input[name=prepareTime]", "3");
    await a.fill("input[name=hideTime]", "25");
    await a.fill("input[name=huntTime]", "40");
    await a.waitForSelector("button:has-text('라운드 시작'):not([disabled])", { timeout: 20000 });
    await a.click("button:has-text('라운드 시작')");
    await sleep(6000);
    const d = await open(browser, "늦은D");
    await joinByCode(d, code).catch(() => {});
    const spectating = await d.waitForSelector("text=관전 중", { timeout: 30000 }).then(() => true).catch(() => false);
    check("late joiner spectates", spectating);
    const hunting = await b.waitForSelector("text=수색 중", { timeout: 40000 }).then(() => true).catch(() => false);
    check("guest reaches hunt phase", hunting);

    // 6. Host leaves mid-round: the room survives and someone else becomes host.
    await a.evaluate(() => window.__camelonSession?.leave());
    await sleep(6000);
    // Mid-round there is no lobby list, so ask the sessions directly (dev handle).
    const bHost = await b.evaluate(() => window.__camelonSession?.isHost() ?? null);
    const dHost = await d.evaluate(() => window.__camelonSession?.isHost() ?? null);
    const hostName = await b.evaluate(() => window.__camelonSession?.getRoom().hostName ?? "");
    check("host succession after host leaves", bHost === true || dHost === true, `B:${bHost} D:${dHost} hostName:${hostName}`);
    const stillRunning = await b.evaluate(() => window.__camelonSession?.getRoom().phase);
    check("round keeps running after host left", stillRunning === "hunt" || stillRunning === "hide", stillRunning);

    // 7. Everyone leaves; the listing disappears.
    for (const p of [b, d]) await p.evaluate(() => window.__camelonSession?.leave()).catch(() => {});
    await sleep(3000);
    const e = await open(browser, "확인E");
    await sleep(6000);
    const listed = await e.$(`text=${roomName}`);
    check("listing removed after last player leaves", !listed);
  } catch (err) {
    check("script", false, err.message.slice(0, 200));
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== online: ${results.length - failed}/${results.length} passed ===`);
  process.exit(failed ? 1 : 0);
})();
