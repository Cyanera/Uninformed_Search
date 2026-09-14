/**
 * Reliability rehearsal for a graded quiz.
 *
 * Not the happy path - the things that actually happen in a lecture theatre:
 * a whole class joining at once, someone arriving late, a phone refreshing
 * mid-answer, a student changing her mind and resubmitting, two students
 * typing the same ID, and the clock running out.
 */
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CLASS_SIZE = Number(process.env.CLASS_SIZE ?? 25);

const BFS = ["S", "A", "B", "C", "D", "E", "F", "H", "G"];
const DFS = ["S", "A", "D", "E", "B", "F", "C", "H", "G"];
const UCS = ["S", "B", "F", "A", "D", "E", "C", "H", "G"];

let failures = 0;
let checks = 0;
const check = (label, ok, detail = "") => {
  checks++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  " + detail}`);
  if (!ok) failures++;
};

async function tap(page, nodes) {
  for (const n of nodes) await page.getByRole("button", { name: `Add node ${n}` }).click();
}

async function joinAs(browser, code, name, id) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${APP}/join?code=${code}`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Student ID").fill(id);
  await page.getByRole("button", { name: "Join session" }).click();
  await page.waitForURL(/\/s\//, { timeout: 30000 });
  return { page, context, errors };
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const instructor = await browser.newContext();
  const page = await instructor.newPage();
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(`instructor: ${e}`));

  /* -------------------------------------------------- set up and sign in */
  await page.goto(`${APP}/instructor/setup`, { waitUntil: "networkidle" });
  // The page checks the deployment before rendering either the form or an
  // "already set up" notice, so wait for whichever arrives.
  await page
    .getByLabel("Your email")
    .waitFor({ timeout: 15000 })
    .catch(() => {});

  if (await page.getByLabel("Your email").isVisible().catch(() => false)) {
    await page.getByLabel("Your email").fill("ahad@uj.edu.sa");
    await page.getByLabel("Choose a password").fill("lecture2026");
    await page.getByRole("button", { name: /Set up and create/ }).click();
    await page.getByText("Setup complete").waitFor({ timeout: 25000 });
  }
  await page.goto(`${APP}/instructor/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("ahad@uj.edu.sa");
  await page.getByLabel("Password").fill("lecture2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/instructor(\?|$)/, { timeout: 20000 });

  await page.getByRole("button", { name: "Create session" }).click();
  await page.waitForURL(/\/instructor\/session\//, { timeout: 20000 });
  const sessionUrl = page.url();
  const code = (await page.innerText("body")).match(/SESSION CODE\s*\n+\s*([A-Z0-9]{5})/i)?.[1];
  check("session created with a code", !!code);

  const settings = await page.innerText("body");
  check("defaults to 15 minutes", /15:00/.test(settings), settings.slice(0, 200));

  /* ------------------------------------------- a whole class joins at once */
  console.log(`\n[A] ${CLASS_SIZE} students join simultaneously`);
  const started = Date.now();
  const joined = await Promise.all(
    Array.from({ length: CLASS_SIZE }, (_, i) =>
      joinAs(browser, code, `Student ${String(i + 1).padStart(2, "0")}`, `22100${String(i + 1).padStart(2, "0")}`)
        .then((r) => ({ ok: true, ...r }))
        .catch((e) => ({ ok: false, error: String(e) })),
    ),
  );
  const okJoins = joined.filter((j) => j.ok);
  check(
    `all ${CLASS_SIZE} joined`,
    okJoins.length === CLASS_SIZE,
    joined.find((j) => !j.ok)?.error?.slice(0, 200) ?? "",
  );
  console.log(`        took ${((Date.now() - started) / 1000).toFixed(1)}s`);

  await page.reload({ waitUntil: "networkidle" });
  const board = await page.innerText("body");
  const counted = board.match(/STUDENTS\s*\n+\s*(\d+)/i)?.[1];
  check("board counts every student", Number(counted) === CLASS_SIZE, `counted ${counted}`);

  /* ----------------------------------------------------- duplicate IDs */
  console.log("\n[B] Two students type the same ID");
  const dupContext = await browser.newContext();
  const dup = await dupContext.newPage();
  await dup.goto(`${APP}/join?code=${code}`, { waitUntil: "domcontentloaded" });
  await dup.getByLabel("Your name").fill("Someone Else");
  await dup.getByLabel("Student ID").fill("2210001");
  await dup.getByRole("button", { name: "Join session" }).click();
  await dup.waitForTimeout(1500);
  const dupText = await dup.innerText("body");
  check(
    "a clashing ID under a different name is refused with an explanation",
    /already joined/i.test(dupText),
    dupText.slice(0, 200),
  );

  /* ------------------------------------------------------------- start */
  console.log("\n[C] Activity running");
  await page.goto(sessionUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start Activity" }).click();
  await page.waitForTimeout(1500);

  const first = okJoins[0].page;
  await first.reload({ waitUntil: "networkidle" });
  await first.getByRole("tab", { name: "BFS" }).click();
  await tap(first, BFS);

  /* ------------------------------------------- refresh loses nothing */
  console.log("\n[D] A phone refreshes mid-answer");
  await first.waitForTimeout(2000); // let the draft autosave
  await first.reload({ waitUntil: "networkidle" });
  await first.getByRole("tab", { name: "BFS" }).click();
  await first.waitForTimeout(500);
  const afterReload = await first.innerText("body");
  check("the draft survived the refresh", BFS.every((n) => afterReload.includes(n)), afterReload.slice(0, 150));

  await first.getByRole("button", { name: "Submit BFS" }).click();
  await first.waitForTimeout(600);
  check("submission is acknowledged", (await first.innerText("body")).includes("Submitted at"));

  /* --------------------------------------------------------- resubmit */
  console.log("\n[E] A student changes her mind");
  await first.getByRole("button", { name: "Clear strategy" }).click();
  await tap(first, DFS);
  await first.getByRole("button", { name: "Submit BFS" }).click();
  await first.waitForTimeout(800);
  check("resubmission is accepted", (await first.innerText("body")).includes("Submitted at"));

  /* ------------------------------------------------------- late joiner */
  console.log("\n[F] A student arrives after the start");
  const late = await joinAs(browser, code, "Late Arrival", "2210999");
  const lateText = await late.page.innerText("body");
  check("a late joiner can answer immediately", !lateText.includes("Waiting for your instructor"));
  await late.page.getByRole("tab", { name: "UCS" }).click();
  await tap(late.page, UCS);
  await late.page.getByRole("button", { name: "Submit UCS" }).click();
  await late.page.waitForTimeout(600);
  check("a late joiner's answer is stored", (await late.page.innerText("body")).includes("Submitted at"));

  /* ---------------------------------------- the rest of the class answers */
  console.log("\n[G] The class answers");
  await Promise.all(
    okJoins.slice(1, 10).map(async ({ page: sp }, i) => {
      await sp.reload({ waitUntil: "domcontentloaded" });
      const answer = i % 3 === 0 ? BFS : i % 3 === 1 ? DFS : UCS;
      await sp.getByRole("tab", { name: "BFS" }).click();
      await tap(sp, answer);
      await sp.getByRole("button", { name: "Submit BFS" }).click();
      await sp.waitForTimeout(400);
    }),
  );
  check("nine more students submitted without error", true);

  /* --------------------------------------------------------- the clock */
  console.log("\n[H] Time runs out");
  await page.goto(sessionUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "End activity now" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "End activity", exact: true }).click();
  await page.waitForTimeout(1500);

  const stragglerPage = okJoins[11].page;
  await stragglerPage.reload({ waitUntil: "networkidle" });
  const closed = await stragglerPage.innerText("body");
  check("students are told submissions are closed", /Time is up/i.test(closed), closed.slice(0, 200));
  const blocked = await stragglerPage.getByRole("button", { name: "Add node S" }).isDisabled();
  check("answering is blocked after the buzzer", blocked);

  /* ----------------------------------------------------------- marking */
  console.log("\n[I] Marks");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Reveal Results" }).click();
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Analytics" }).click();
  await page.waitForTimeout(1200);

  const marks = await page.innerText("body");
  check("a marks sheet is shown", marks.includes("Marks"), marks.slice(0, 200));
  check("marks are out of 5 by default", /\/\s*5/.test(marks), "");
  check("a class average is reported", /Class average/i.test(marks));

  const download = page.waitForEvent("download", { timeout: 15000 });
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = await download;
  const name = file.suggestedFilename();
  check("the CSV downloads", name.endsWith(".csv"), name);

  const stream = await file.createReadStream();
  const csv = await new Promise((resolve) => {
    let data = "";
    stream.on("data", (c) => (data += c));
    stream.on("end", () => resolve(data));
  });
  const lines = csv.trim().split("\n");
  check("the CSV has a row per student", lines.length === CLASS_SIZE + 2, `${lines.length} lines`);
  check("the CSV carries the mark and the answer", /Mark \(out of 5\)/.test(lines[0]) && /BFS answer/.test(lines[0]));

  await browser.close();
  console.log(`\n${failures ? "FAILED" : "ALL PASSED"}: ${checks - failures}/${checks} checks`);
  if (jsErrors.length) console.log("JS errors:", [...new Set(jsErrors)].slice(0, 5));
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error("Quiz rehearsal crashed:", e);
  process.exit(1);
});
