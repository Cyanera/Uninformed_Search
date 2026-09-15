/**
 * Drives the whole application in a real browser against a real PostgreSQL
 * database: first-time setup, instructor sign-in, creating a session, three
 * students joining from separate browser contexts and answering, the live
 * board, revealing results, the analytics, and Teach Mode.
 *
 * This is the test that says the product works, rather than that its parts do.
 */
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const BFS = ["S", "A", "B", "C", "D", "E", "F", "H", "G"];
const DFS = ["S", "A", "D", "E", "B", "F", "C", "H", "G"];
const UCS = ["S", "B", "F", "A", "D", "E", "C", "H", "G"];
const UCS_EARLY_STOP = ["S", "B", "F", "A", "D", "E", "C", "G"];

let failures = 0;
let checks = 0;

function check(label, condition, detail = "") {
  checks++;
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

async function tapNodes(page, sequence) {
  for (const node of sequence) {
    await page.getByRole("button", { name: `Add node ${node}` }).click();
    await page.waitForTimeout(30);
  }
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const errors = [];

  const instructor = await browser.newContext();
  const page = await instructor.newPage();
  page.on("pageerror", (e) => errors.push(`instructor: ${e}`));

  /* ---------------------------------------------------------- 1. health */
  console.log("\n[1] Health and first-time setup");
  const health = await (await page.request.get(`${APP}/api/health`)).json();
  check("health reports no problems", health.problems.length === 0, JSON.stringify(health.problems));
  check("build ships no middleware", health.build.hasMiddleware === false);

  await page.goto(`${APP}/instructor/setup`, { waitUntil: "networkidle" });
  check("setup page loads", (await page.innerText("body")).includes("First-time setup"));

  await page.getByLabel("Your email").fill("ahad@uj.edu.sa");
  await page.getByLabel("Choose a password").fill("lecture2026");
  await page.getByRole("button", { name: /Set up and create/ }).click();
  await page.waitForTimeout(2500);
  const setupText = await page.innerText("body");
  check("setup completes", setupText.includes("Setup complete"), setupText.slice(0, 200));

  /* ----------------------------------------------------------- 2. login */
  console.log("\n[2] Instructor sign-in");
  await page.goto(`${APP}/instructor/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("ahad@uj.edu.sa");
  await page.getByLabel("Password").fill("lecture2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/instructor(\?|$)/, { timeout: 15000 });
  check("lands on the instructor home", page.url().includes("/instructor"));

  /* ------------------------------------------- 3. changing the sign-in email */
  console.log("\n[3] Changing the sign-in email");
  check("the current email is shown", (await page.innerText("body")).includes("ahad@uj.edu.sa"));

  await page.getByRole("button", { name: "Change email" }).click();
  await page.getByLabel("New sign-in email").fill("ahad.almasoudi@gmail.com");
  await page.getByLabel("Current password").fill("wrong-password");
  await page.getByRole("button", { name: "Save email" }).click();
  await page.waitForTimeout(1200);
  check(
    "the wrong password is refused",
    /not your current password/i.test(await page.innerText("body")),
    (await page.innerText("body")).slice(0, 200),
  );

  await page.getByLabel("Current password").fill("lecture2026");
  await page.getByRole("button", { name: "Save email" }).click();
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "networkidle" });
  const afterChange = await page.innerText("body");
  check("the new email is shown", afterChange.includes("ahad.almasoudi@gmail.com"), afterChange.slice(0, 200));
  check("the old email is gone", !afterChange.includes("ahad@uj.edu.sa"));

  // The point of the change: the new address is what signs in, with no
  // confirmation email in the way.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/instructor\/login/, { timeout: 15000 });
  await page.getByLabel("Email").fill("ahad.almasoudi@gmail.com");
  await page.getByLabel("Password").fill("lecture2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/instructor(\?|$)/, { timeout: 15000 });
  check("the new email signs in immediately", page.url().includes("/instructor"));

  /* --------------------------------------------- 4. adding a second teacher */
  console.log("\n[4] Adding a second instructor");
  // The list is fetched after the page renders, so wait for it rather than
  // racing it.
  await page.getByText("(you)").waitFor({ timeout: 10000 }).catch(() => {});
  check("the account list shows the signed-in instructor", (await page.innerText("body")).includes("(you)"));

  await page.getByRole("button", { name: "Add an instructor" }).click();
  await page.getByLabel("Their email").fill("smalgamdi@uj.edu.sa");
  await page.getByLabel("Password for them").fill("12345");
  await page.getByLabel("Your own password").fill("lecture2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForTimeout(1000);
  check(
    "a password under six characters is refused",
    /at least 6 characters/i.test(await page.innerText("body")),
    (await page.innerText("body")).slice(0, 200),
  );

  await page.getByLabel("Password for them").fill("123456");
  await page.getByLabel("Your own password").fill("not-my-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForTimeout(1200);
  check("the wrong confirming password is refused", /not your password/i.test(await page.innerText("body")));

  await page.getByLabel("Your own password").fill("lecture2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForTimeout(2000);
  const addedText = await page.innerText("body");
  check("the new instructor is listed", addedText.includes("smalgamdi@uj.edu.sa"), addedText.slice(0, 300));
  check("the new instructor can sign in", /can sign in now/i.test(addedText));

  // Adding the same address twice is a mistake worth naming, not a silent
  // second account.
  await page.getByRole("button", { name: "Add an instructor" }).click();
  await page.getByLabel("Their email").fill("smalgamdi@uj.edu.sa");
  await page.getByLabel("Password for them").fill("123456");
  await page.getByLabel("Your own password").fill("lecture2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForTimeout(1500);
  check("a duplicate address is refused", /already exists/i.test(await page.innerText("body")));
  await page.getByRole("button", { name: "Cancel" }).click();

  // The point of all of it: the colleague signs in with no email in the way,
  // and sees an empty session list rather than anybody else's class.
  const colleagueContext = await browser.newContext();
  const colleague = await colleagueContext.newPage();
  await colleague.goto(`${APP}/instructor/login`, { waitUntil: "networkidle" });
  await colleague.getByLabel("Email").fill("smalgamdi@uj.edu.sa");
  await colleague.getByLabel("Password").fill("123456");
  await colleague.getByRole("button", { name: "Sign in" }).click();
  await colleague.waitForURL(/\/instructor(\?|$)/, { timeout: 15000 });
  check("the second instructor signs in straight away", colleague.url().includes("/instructor"));
  const colleagueText = await colleague.innerText("body");
  check("the second instructor sees no sessions of her own yet", colleagueText.includes("No sessions yet"));
  await colleagueContext.close();

  /* -------------------------------------------------- 3. create session */
  console.log("\n[5] Creating a session");
  await page.getByRole("button", { name: "Create session" }).click();
  await page.waitForURL(/\/instructor\/session\//, { timeout: 15000 });
  const body = await page.innerText("body");
  const code = body.match(/SESSION CODE\s*\n+\s*([A-Z0-9]{5})/i)?.[1];
  check("a session code is shown", !!code, body.slice(0, 300));
  console.log(`        session code: ${code}`);

  const sessionUrl = page.url();

  /* ------------------------------------------------ 4. students join */
  console.log("\n[6] Three students join from their own devices");
  const students = [
    { name: "Norah Al-Harbi", id: "2210045", answers: { BFS, DFS, UCS } },
    { name: "Sara Al-Otaibi", id: "2210203", answers: { BFS, DFS, UCS: UCS_EARLY_STOP } },
    { name: "Lama Al-Ghamdi", id: "2210078", answers: { BFS: DFS, DFS, UCS } },
  ];

  const pages = [];
  for (const student of students) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const sp = await context.newPage();
    sp.on("pageerror", (e) => errors.push(`${student.name}: ${e}`));
    await sp.goto(`${APP}/join?code=${code}`, { waitUntil: "networkidle" });
    await sp.getByLabel("Your name").fill(student.name);
    await sp.getByLabel("Student ID").fill(student.id);
    await sp.getByRole("button", { name: "Join session" }).click();
    await sp.waitForURL(/\/s\//, { timeout: 15000 });
    pages.push({ student, page: sp });
  }
  check("all three students reached the activity", pages.length === 3);

  await page.reload({ waitUntil: "networkidle" });
  const board = await page.innerText("body");
  check("board shows every student", students.every((s) => board.includes(s.name)), board.slice(0, 400));
  check("board counts three", /STUDENTS\s*\n+\s*3/i.test(board), board.match(/STUDENTS[\s\S]{0,20}/i)?.[0]);

  /* ------------------------------------------- 5. answering is blocked */
  console.log("\n[7] Before the instructor starts");
  const firstStudent = pages[0].page;
  const lobbyText = await firstStudent.innerText("body");
  check("students are told to wait", lobbyText.includes("Waiting for your instructor"));
  const disabled = await firstStudent.getByRole("button", { name: "Add node S" }).isDisabled();
  check("node buttons are disabled in the lobby", disabled);

  /* ------------------------------------------------- 6. start and answer */
  console.log("\n[8] Activity running");
  await page.getByRole("button", { name: "Start Activity" }).click();
  await page.waitForTimeout(1500);

  for (const { student, page: sp } of pages) {
    await sp.reload({ waitUntil: "networkidle" });
    for (const [strategy, sequence] of Object.entries(student.answers)) {
      await sp.getByRole("tab", { name: strategy }).click();
      await sp.waitForTimeout(150);
      await tapNodes(sp, sequence);
      await sp.getByRole("button", { name: `Submit ${strategy}` }).click();
      await sp.waitForTimeout(400);
    }
    const text = await sp.innerText("body");
    check(`${student.name}: three strategies submitted`, text.includes("3 of 4 strategies submitted"), text.slice(0, 200));
  }

  // IDS, with its separate rows per depth limit.
  const ids = pages[0].page;
  await ids.getByRole("tab", { name: "IDS" }).click();
  await ids.waitForTimeout(200);
  await tapNodes(ids, ["S"]);
  await ids.getByRole("button", { name: "Add Next Depth Limit" }).click();
  await tapNodes(ids, ["S", "A", "B", "C"]);
  await ids.getByRole("button", { name: "Add Next Depth Limit" }).click();
  await tapNodes(ids, DFS);
  await ids.getByRole("button", { name: "Submit IDS" }).click();
  await ids.waitForTimeout(500);
  const idsText = await ids.innerText("body");
  check("IDS records three depth limits", /L = 0[\s\S]*L = 1[\s\S]*L = 2/.test(idsText));
  check("all four strategies submitted", idsText.includes("4 of 4 strategies submitted"), idsText.slice(0, 200));

  // No correctness feedback may leak to a student.
  const forbidden = ["Exact match", "First divergence", "Possible misconception", "Accuracy"];
  const leaked = forbidden.filter((word) => idsText.includes(word));
  check("no correctness feedback shown to students", leaked.length === 0, leaked.join(", "));

  await ids.getByRole("button", { name: "Submit All Answers" }).click();
  await ids.waitForTimeout(300);
  await ids.getByRole("button", { name: "Yes, submit" }).click();
  await ids.waitForTimeout(800);
  check("final submission recorded", (await ids.innerText("body")).includes("All answers submitted"));

  /* ---------------------------------------------------- 7. live board */
  console.log("\n[9] Instructor's live board");
  await page.reload({ waitUntil: "networkidle" });
  const live = await page.innerText("body");
  check("progress is shown", live.includes("Submitted"), live.slice(0, 300));
  check("correctness is hidden before reveal", !live.includes("Exact match"));

  /* ------------------------------------------------------- 8. analytics */
  console.log("\n[10] Reveal results and analytics");
  await page.getByRole("button", { name: "Reveal Results" }).click();
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Analytics" }).click();
  await page.waitForTimeout(1000);
  const analytics = await page.innerText("body");
  check("accuracy by strategy is shown", analytics.includes("Accuracy by strategy"), analytics.slice(0, 200));
  check("first divergence is reported", analytics.includes("Where the search first went wrong"));
  check("UCS goal-test misconception detected", /goal test on generation/i.test(analytics), "");
  check("BFS-as-DFS misconception detected", /stack \/ depth-first/i.test(analytics), "");
  check("student x strategy matrix present", analytics.includes("Student × strategy"));

  /* ------------------------------------------------------ 9. inspection */
  console.log("\n[11] Inspecting one student");
  await page.getByRole("tab", { name: "Live" }).click();
  await page.waitForTimeout(500);
  await page.getByText("Sara Al-Otaibi").first().click();
  await page.waitForTimeout(800);
  const detail = await page.innerText("body");
  check("shows first divergence", detail.includes("First divergence"), detail.slice(0, 300));
  // The heading is CSS-uppercased, so innerText returns it in caps.
  check(
    "flags the possible misconception",
    /possible misconception/i.test(detail),
    detail.slice(detail.indexOf("UCS"), detail.indexOf("UCS") + 400),
  );
  check(
    "names the goal-test-on-generation mistake",
    /goal test on generation/i.test(detail),
    "",
  );

  /* ------------------------------------------------------ 10. teach mode */
  console.log("\n[12] Teach Mode");
  await page.getByRole("button", { name: /Back to the list/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole("tab", { name: "Teach Mode" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "UCS" }).click();
  await page.getByRole("button", { name: "Start Demonstration" }).click();
  await page.waitForTimeout(400);

  const options = await page.locator("select").first().locator("option").allInnerTexts();
  const order = options.filter((o) => o.includes("Process")).map((o) => o.split("Process ")[1]).join(",");
  check("UCS trace matches the canonical answer", order === UCS.join(","), order);

  for (let i = 0; i < 6; i++) {
    await page.getByRole("button", { name: /Next Step/ }).click();
    await page.waitForTimeout(100);
  }
  const step7 = await page.innerText("body");
  check("the goal-generated warning appears", step7.includes("do NOT stop yet"), "");

  await browser.close();

  console.log(`\n${failures ? "FAILED" : "ALL PASSED"}: ${checks - failures}/${checks} checks`);
  if (errors.length) {
    console.log("\nJavaScript errors seen in the browser:");
    for (const e of [...new Set(errors)].slice(0, 10)) console.log("  " + e);
  }
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
