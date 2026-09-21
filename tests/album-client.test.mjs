import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseHTML } from "linkedom";
import { initialWedding } from "../public/data.js";

const moduleURL = (source) =>
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");

async function openMemories(t) {
  const { document } = parseHTML(await fs.readFile("public/index.html", "utf8"));
  globalThis.document = document;
  globalThis.location = { search: "", hash: "#recuerdos" };
  document.querySelector("#album-dialog").showModal = function () {
    this.setAttribute("open", "");
  };
  t.mock.method(globalThis, "setInterval", () => 0);
  t.mock.method(globalThis, "setTimeout", () => 0);
  let resolve, reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  globalThis.__albumAPI = { wedding: () => pending, approvedMessages: async () => [] };
  let source = await fs.readFile("public/app.js", "utf8");
  const modules = {
    "./invitation-session.js": "export const invitationToken=()=>null, currentProof=()=>null;",
    "./api.js": "export const configured=true, api=globalThis.__albumAPI;",
    "./data.js": await fs.readFile("public/data.js", "utf8"),
    "./utils.js": await fs.readFile("public/utils.js", "utf8"),
    "./album.js?v=20260921-album": (await fs.readFile("public/album.js", "utf8"))
      .replace("now = Date.now()", 'now = Date.parse("2026-09-21T12:00:00-03:00")'),
  };
  for (const [path, code] of Object.entries(modules)) {
    source = source.replace(JSON.stringify(path), JSON.stringify(moduleURL(code + "\n//" + Math.random())));
  }
  await import(moduleURL(source + "\n//" + Math.random()));
  const link = document.querySelector("#album-external-link");
  const description = document.querySelector("#album-instructions");
  assert.ok(document.querySelector("#album-dialog").hasAttribute("open"));
  assert.match(description.textContent, /cargando/);
  assert.equal(link.hidden, true);
  assert.equal(link.hasAttribute("href"), false);
  return { document, link, description, resolve, reject };
}

test("memories waits for published settings before offering the upload form", async (t) => {
  const ui = await openMemories(t);
  ui.resolve({ ...initialWedding });
  await new Promise(setImmediate);
  assert.equal(ui.link.hidden, false);
  assert.equal(ui.link.getAttribute("href"), initialWedding.albumUploadUrl);
  assert.doesNotMatch(ui.description.textContent, /finalizó|cargando/);
});

test("disabled memories is never presented as an expired deadline", async (t) => {
  const ui = await openMemories(t);
  ui.resolve({ ...initialWedding, showAlbum: false });
  await new Promise(setImmediate);
  assert.equal(ui.link.hidden, true);
  assert.match(ui.description.textContent, /desactivado temporalmente/);
  assert.doesNotMatch(ui.description.textContent, /plazo.*finalizó/);
});

test("an actually expired deadline hides the upload form after settings load", async (t) => {
  const ui = await openMemories(t);
  ui.resolve({ ...initialWedding, albumClosesAt: "2026-09-20T00:00:00-03:00" });
  await new Promise(setImmediate);
  assert.equal(ui.link.hidden, true);
  assert.equal(ui.link.hasAttribute("href"), false);
  assert.match(ui.description.textContent, /plazo.*finalizó/);
});

test("settings failure asks to reload instead of using a stale upload link", async (t) => {
  const ui = await openMemories(t);
  ui.reject(new Error("offline"));
  await new Promise(setImmediate);
  assert.equal(ui.link.hidden, true);
  assert.equal(ui.link.hasAttribute("href"), false);
  assert.match(ui.description.textContent, /No pudimos cargar/);
  assert.doesNotMatch(ui.description.textContent, /plazo.*finalizó/);
});
