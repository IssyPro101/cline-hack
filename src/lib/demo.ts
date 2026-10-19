import type { AgentEvent, Bom, BomRow, CandidateListing, Evidence, PartRequirement, RunInput, VerifiedField } from "./schema";

export const ROBOT_GOAL = "Desktop robot arm that picks 100–300 g plastic parts from a tray and places them in a fixture.";
export const WEATHER_GOAL = "A solar-powered weather station that measures temperature, humidity and rainfall, with Wi-Fi, for A$200.";
export const DEMO_CHECKED_AT = "2026-10-18T09:30:00.000Z";
type DemoPart = [string, string, string, string, number, number | null, number, string, string, Record<string, string>];
const robot: DemoPart[] = [
  ["arm", "6-axis robot arm", "Move parts from tray to fixture", "Waveshare", 1, 1699, 7, "RoArm-M3 Pro", "https://www.waveshare.com/roarm-m3-pro.htm", { payload: "≥ 300 g", reach: "≥ 400 mm", interface: "Serial / Wi-Fi" }],
  ["gripper", "Adaptive gripper", "Secure a range of plastic part shapes", "RobotShop", 1, 149, 5, "Adaptive parallel gripper", "https://www.robotshop.com/collections/robot-grippers", { opening: "20–60 mm", payload: "≥ 300 g" }],
  ["camera", "Vision camera", "Locate parts in the picking tray", "Arducam", 1, 89, 6, "USB 1080p camera module", "https://www.arducam.com/usb-camera/", { resolution: "1080p", interface: "USB", focus: "Fixed" }],
  ["controller", "Single-board computer", "Run vision and arm control", "Core Electronics", 1, 135, 4, "Raspberry Pi 5 · 4 GB", "https://core-electronics.com.au/raspberry-pi.html", { ram: "4 GB", usb: "USB 3", os: "Linux" }],
  ["power", "24 V power supply", "Provide regulated power to the arm", "Mean Well", 1, 64, 3, "LRS-150-24 · 150 W", "https://www.meanwell.com/", { output: "24 V DC", power: "150 W", protection: "Overload / short circuit" }],
  ["estop", "Emergency stop switch", "Allow immediate manual shutdown", "RS Components", 1, 38, 4, "Latching mushroom E-stop", "https://au.rs-online.com/web/c/switches/emergency-stop-push-buttons/", { type: "Normally closed", mounting: "22 mm" }],
  ["cables", "Cables & connectors", "Connect power, controller and camera", "Core Electronics", 1, 32, 4, "USB-C + DC wiring kit", "https://core-electronics.com.au/cables.html", { voltage: "24 V rated", length: "1 m" }],
  ["mount", "Custom mounting fixture", "Mount the arm and locate the workpiece", "", 1, null, 0, "CNC aluminium base & fixture", "https://www.hubs.com/cnc-machining/", { material: "6061 aluminium", plate: "300 × 300 × 8 mm", tolerance: "± 0.1 mm" }],
];
const weather: DemoPart[] = [
  ["controller", "Wi-Fi microcontroller", "Read sensors and publish weather data", "Core Electronics", 1, 19, 4, "ESP32 development board", "https://core-electronics.com.au/esp32.html", { connectivity: "Wi-Fi 2.4 GHz", voltage: "3.3 V" }],
  ["sensor", "Temperature & humidity sensor", "Measure ambient temperature and humidity", "Adafruit", 1, 24, 5, "SHT31-D sensor breakout", "https://www.adafruit.com/product/2857", { interface: "I²C", temperature: "± 0.3 °C" }],
  ["rain", "Tipping-bucket rain gauge", "Measure cumulative precipitation", "SparkFun", 1, 39, 7, "Weather meter rain gauge", "https://www.sparkfun.com/weather-meter-kit.html", { output: "Reed switch", mounting: "Outdoor" }],
  ["solar", "Solar panel & charger", "Recharge the station in daylight", "DFRobot", 1, 36, 8, "6 V solar power kit", "https://www.dfrobot.com/category-81.html", { panel: "6 V / 3 W", battery: "Protected Li-ion" }],
  ["battery", "Rechargeable battery", "Power the station overnight", "Core Electronics", 1, 17, 4, "Protected 18650 · 2600 mAh", "https://core-electronics.com.au/power-batteries.html", { voltage: "3.7 V", capacity: "2600 mAh" }],
  ["enclosure", "Weatherproof sensor housing", "Protect electronics without trapping heat", "", 1, null, 0, "Vented outdoor enclosure", "https://www.hubs.com/3d-printing/", { protection: "Rain shield", material: "UV-resistant ASA" }],
];

export function demoParts(input: RunInput): PartRequirement[] {
  return (/weather|rain|humidity/i.test(input.goal) ? weather : robot).map(([id, name, purpose, , quantity, price, , , , keySpecs]) => ({ id, name, purpose, quantity, keySpecs, category: price === null ? "custom-fabricated" : "off-the-shelf", critical: ["arm", "controller", "estop"].includes(id) }));
}
const empty = (): VerifiedField => ({ status: "unknown", evidence: [], sourceCount: 0 });
export function demoRow(part: PartRequirement, input: RunInput): BomRow {
  const data = (/weather|rain|humidity/i.test(input.goal) ? weather : robot).find((d) => d[0] === part.id)!;
  const [, , , supplier, , amount, days, productName, productUrl] = data;
  if (amount === null) return { part, candidates: [], suppliers: [{ name: "Protolabs Network", url: productUrl, evidence: [{ field: "spec", value: "Custom fabrication services", sourceUrl: productUrl, quote: "Illustrative demo supplier — contact for a custom quote.", checkedAt: DEMO_CHECKED_AT }] }, { name: "Xometry", url: "https://www.xometry.com/", evidence: [] }], fields: { price: empty(), stock: empty(), leadTimeDays: empty(), shipsToDestination: empty() }, status: "unknown", needsQuote: true };
  const conflict = part.id === "camera" || part.id === "rain";
  const single = part.id === "gripper" || part.id === "battery";
  const low = part.id === "controller";
  // Every figure in this module is illustrative, never a claimed live supplier price.
  const make = (url: string, price: number): CandidateListing => {
    const values: [Evidence["field"], Evidence["value"], string][] = [
      ["price", price, `Demo fixture: AUD ${price.toFixed(2)} per unit.`],
      ["stock", low ? "low" : "in_stock", low ? "Demo fixture: limited stock." : "Demo fixture: in stock."],
      ["leadTimeDays", days, `Demo fixture: delivery in ${days} calendar days.`],
      ["shipsToDestination", true, "Demo fixture: ships to Australia."],
    ];
    return { partId: part.id, supplier, productName, productUrl: url, productKey: part.id, price: { amount: price, currency: "AUD", qty: 1 }, stock: low ? "low" : "in_stock", leadTimeDays: days, shipsToDestination: true, specsFound: part.keySpecs, evidence: values.map(([field, value, quote]) => ({ field, value, quote, sourceUrl: url, checkedAt: DEMO_CHECKED_AT })) };
  };
  const candidates = [make(productUrl, amount)];
  if (!single) candidates.push(make(`https://evidence.partscout.example/${part.id}`, conflict ? amount * 1.18 : amount));
  const fields = Object.fromEntries((["price", "stock", "leadTimeDays", "shipsToDestination"] as const).map((field) => {
    const evidence = candidates.flatMap((c) => c.evidence.filter((e) => e.field === field));
    return [field, { status: field === "price" && conflict ? "conflicting" : single ? "single_source" : "agreed", value: evidence[0].value, ...(field === "price" ? { min: amount, max: conflict ? amount * 1.18 : amount } : {}), evidence, sourceCount: candidates.length }];
  })) as BomRow["fields"];
  return { part, pick: candidates[0], candidates, suppliers: [], fields, status: conflict ? "conflicting" : single ? "single_source" : "agreed", needsQuote: false };
}
export function demoBom(runId: string, input: RunInput, rows: BomRow[]): Bom {
  const rate = { AUD: 1, USD: 0.65, EUR: 0.60, GBP: 0.51 }[input.currency];
  const converted = rows.map((row) => ({ ...row, fields: { ...row.fields, price: { ...row.fields.price, ...(typeof row.fields.price.value === "number" ? { value: row.fields.price.value * rate, min: row.fields.price.min! * rate, max: row.fields.price.max! * rate } : {}) } } }));
  const total = converted.reduce((s, r) => s + (r.fields.price.min ?? 0) * r.part.quantity, 0);
  const totalMax = converted.reduce((s, r) => s + (r.fields.price.max ?? 0) * r.part.quantity, 0);
  return { runId, input, rows: converted, total, totalMax, budgetRemaining: input.budget - totalMax, quoteCount: rows.filter((r) => r.needsQuote).length, risks: [
    ...rows.filter((r) => r.status === "conflicting").map((r) => ({ partId: r.part.id, severity: "warning" as const, message: `${r.part.name}: sources disagree on price.` })),
    ...rows.filter((r) => r.fields.stock.value === "low").map((r) => ({ partId: r.part.id, severity: "warning" as const, message: `${r.part.name}: limited stock. Confirm availability.` })),
    ...rows.filter((r) => r.needsQuote).map((r) => ({ partId: r.part.id, severity: "info" as const, message: `${r.part.name}: needs a custom quote; excluded from total.` })),
    ...(totalMax > input.budget ? [{ severity: "danger" as const, message: "Known costs exceed your budget before shipping and custom quotes." }] : []),
  ], exchange: { base: input.currency, rates: { AUD: rate, USD: rate / 0.65, EUR: rate / 0.60, GBP: rate / 0.51 }, source: "Illustrative demo exchange rates", checkedAt: DEMO_CHECKED_AT, fallback: true }, createdAt: DEMO_CHECKED_AT, demo: true };
}
export function mockEvents(runId: string, input: RunInput): AgentEvent[] {
  const parts = demoParts(input);
  const rows = parts.map((p) => demoRow(p, input));
  return [
    { type: "run_started", runId },
    { type: "assumption", text: "Demo mode: replaying an illustrative fixture, not current supplier prices. Switch to Live after configuring credentials for your own build." },
    { type: "assumption", text: /weather/i.test(input.goal) ? "Assuming a fixed outdoor installation with Wi-Fi coverage and solar charging." : "Assuming a 400 mm working reach, 300 g payload, and a fixed desktop installation." },
    { type: "plan", parts },
    ...parts.flatMap((p): AgentEvent[] => [{ type: "crawler_started", partId: p.id }, { type: "step", partId: p.id, label: p.category === "custom-fabricated" ? "Finding fabrication partners" : "Searching 4 supplier queries" }]),
    ...rows.flatMap((row): AgentEvent[] => [
      { type: "step", partId: row.part.id, label: row.needsQuote ? "Custom geometry requires a quote" : "Comparing independent sources" },
      ...row.candidates.map((listing): AgentEvent => ({ type: "listing", listing })),
      ...(row.needsQuote ? [{ type: "part_needs_quote" as const, partId: row.part.id, suppliers: row.suppliers }] : []),
      { type: "part_result", partId: row.part.id, row },
    ]),
    { type: "run_finished", bom: demoBom(runId, input, rows) },
  ];
}
