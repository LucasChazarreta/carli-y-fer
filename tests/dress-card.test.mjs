import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseHTML } from "linkedom";
import { initialWedding } from "../public/data.js";

test("celebration includes an accessible third dress card and exact guidance", async () => {
  const { document } = parseHTML(await fs.readFile("public/index.html", "utf8"));
  const cards = document.querySelectorAll(".event-grid > .event-card");
  assert.equal(cards.length, 3);
  const dress = cards[2];
  assert.equal(dress.querySelector(".event-number").textContent, "03");
  assert.equal(dress.getAttribute("aria-labelledby"), "dress-code");
  assert.equal(document.querySelectorAll("#dress-code").length, 1);
  assert.equal(dress.querySelector("h3").textContent, "Elegante relajado");
  assert.equal(dress.querySelector(".event-icon").getAttribute("aria-hidden"), "true");
  assert.match(dress.textContent, /Mujeres.*Pantalón o vestido elegante y sandalias/s);
  assert.match(dress.textContent, /Hombres.*Pantalón de vestir, camisa y zapatos/s);
  assert.equal(initialWedding.dressCode, "Elegante relajado");
});

test("dress divider, responsive columns and reduced-motion-safe CTA are present", async () => {
  const css = await fs.readFile("public/styles.css", "utf8");
  assert.match(css, /\.dress-details\s*\{[^}]*border-top:/);
  assert.match(css, /\.event-grid\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.confirmed-access:not\(\[hidden\]\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  const app = await fs.readFile("public/app.js", "utf8");
  assert.match(app, /dress.textContent = wedding.dressCode\?\.trim\(\) \|\| "Elegante relajado"/);
});

test("versioned opening and page share one app module without duplicate initialization", async () => {
  const { document } = parseHTML(await fs.readFile("public/index.html", "utf8"));
  const opening = await fs.readFile("public/opening.js", "utf8");
  const appScript = [...document.querySelectorAll("script[src]")].find((s) => s.getAttribute("src").startsWith("app.js"));
  assert.ok(appScript.getAttribute("src").includes("?v="));
  assert.ok(opening.includes(`"./${appScript.getAttribute("src")}"`));
  assert.ok(document.querySelector('link[href^="styles.css?v="]'));
  assert.ok(document.querySelector('script[src^="opening.js?v="]'));
});
