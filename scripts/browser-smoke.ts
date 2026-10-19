import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { mockEvents } from "../src/lib/demo";
import { WEATHER_GOAL } from "../src/lib/examples";

const base = process.env.PARTSCOUT_URL || "http://localhost:3000";
const goal = "Previously watched build, not the new brief";
const last = mockEvents("brief-race-regression", { goal, budget: 3500, currency: "AUD", shipTo: "Sydney, Australia", deadlineDays: 21, replay: false }).find(event => event.type === "run_finished");
assert(last?.type === "run_finished");
const snapshot = `data: ${JSON.stringify({ type: "watch_snapshot", boms: [last.bom] })}\n\ndata: ${JSON.stringify({ type: "watch_status", watching: 1 })}\n\n`;
async function main() {
const browser = await chromium.launch({ channel: process.env.PARTSCOUT_BROWSER_CHANNEL || "chrome", headless: true });
const cases: { name: string; edit?: (page: Page) => Promise<void>; field: string; expected: string }[] = [
  { name: "pristine brief restores", field: "#goal", expected: goal },
  { name: "typed goal survives", edit: async page => { await page.locator("#goal").fill("One Raspberry Pi Pico, not the archived build"); }, field: "#goal", expected: "One Raspberry Pi Pico, not the archived build" },
  { name: "budget survives", edit: async page => { await page.locator("#budget").fill("123"); }, field: "#budget", expected: "123" },
  { name: "currency survives", edit: async page => { await page.getByRole("combobox", { name: "Budget currency" }).selectOption("USD"); }, field: '[aria-label="Budget currency"]', expected: "USD" },
  { name: "destination survives", edit: async page => { await page.locator("#ship-to").fill("San Francisco, USA"); }, field: "#ship-to", expected: "San Francisco, USA" },
  { name: "deadline survives", edit: async page => { await page.locator("#deadline").selectOption("60"); }, field: "#deadline", expected: "60" },
  { name: "example selection survives", edit: async page => { await page.getByRole("button", { name: "Weather station" }).click(); }, field: "#goal", expected: WEATHER_GOAL },
];
try {
  for (const test of cases) {
    const page = await browser.newPage();
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/watch/events", async route => {
      await ready;
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: snapshot }).catch(() => {});
    });
    let submitted: Record<string, unknown> | undefined;
    await page.route("**/api/runs", async route => {
      submitted = route.request().postDataJSON();
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Browser regression interception; no sourcing run created." }) });
    });
    try {
      const integrationReady = page.waitForResponse(response => response.url().endsWith("/api/integrations"));
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await integrationReady;
      await test.edit?.(page);
      release();
      await page.getByRole("heading", { name: "Watching 1 BOM", exact: true }).waitFor();
      assert.equal(await page.locator(test.field).inputValue(), test.expected, test.name);
      await page.getByRole("button", { name: "Find my parts", exact: true }).click();
      await page.locator(".error-banner").waitFor();
      const field = test.field === "#ship-to" ? "shipTo" : test.field === "#deadline" ? "deadlineDays" : test.field.includes("currency") ? "currency" : test.field.slice(1);
      assert.equal(String(submitted?.[field]), test.expected, `${test.name}: submitted value`);
      console.log(`PASS ${test.name}; delayed Watch snapshot cannot replace submitted input`);
    } finally {
      release();
      await page.close();
    }
  }
} finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
