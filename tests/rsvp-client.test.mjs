import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const moduleUrl = (source) =>
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

async function loadRsvp(rsvp) {
  const controls = [
    { name: "name", value: "Familia Pérez", disabled: false },
    { name: "code", value: "AB-CD", disabled: false },
    { name: "response", value: "confirmed", disabled: false },
    { name: "response", value: "declined", disabled: false },
  ];
  let submit;
  const form = {
    elements: controls,
    name: controls[0],
    code: controls[1],
    addEventListener: (type, callback) => { if (type === "submit") submit = callback; },
  };
  const status = { textContent: "" };
  const panel = { innerHTML: "" };
  globalThis.document = { querySelector: (selector) => ({ "#rsvp-form": form, "#rsvp-status": status, "#rsvp-panel": panel })[selector] };
  globalThis.sessionStorage = storage();
  const navigation = [];
  globalThis.window = { location: { assign: (url) => navigation.push(url) } };
  const apiUrl = moduleUrl(`export const configured=true; export const api={rsvp:globalThis.__rsvp}; // ${Math.random()}`);
  const source = (await fs.readFile(new URL("../public/rsvp.js", import.meta.url), "utf8"))
    .replace('"./api.js"', JSON.stringify(apiUrl));
  globalThis.__rsvp = rsvp;
  await import(moduleUrl(source + `\n// ${Math.random()}`));
  return { controls, form, status, panel, navigation, submit };
}

test("the RSVP client persists confirmation proof and redirects only confirmations", async (t) => {
  await t.test("confirmed", async () => {
    const ui = await loadRsvp(async () => ({ proof: "signed.proof", expiresIn: 1800 }));
    await ui.submit({ preventDefault() {}, submitter: { value: "confirmed" } });
    assert.equal(JSON.parse(sessionStorage.getItem("cf-rsvp-proof")).proof, "signed.proof");
    assert.deepEqual(ui.navigation, ["/confirmados/"]);
    assert.match(ui.status.textContent, /confirmada/u);
  });
  await t.test("declined", async () => {
    const ui = await loadRsvp(async () => ({ ok: true, response: "declined" }));
    await ui.submit({ preventDefault() {}, submitter: { value: "declined" } });
    assert.equal(sessionStorage.getItem("cf-rsvp-proof"), null);
    assert.deepEqual(ui.navigation, []);
    assert.match(ui.panel.innerHTML, /Gracias por avisarnos/u);
  });
});

test("the RSVP client disables controls during requests, ignores duplicate submits, and recovers after network errors", async () => {
  let resolve;
  let calls = 0;
  const ui = await loadRsvp(() => {
    calls++;
    return new Promise((done) => { resolve = done; });
  });
  const first = ui.submit({ preventDefault() {}, submitter: { value: "confirmed" } });
  const duplicate = ui.submit({ preventDefault() {}, submitter: { value: "confirmed" } });
  assert.ok(ui.controls.every((control) => control.disabled));
  assert.equal(calls, 1);
  await duplicate;
  resolve({ proof: "signed.proof", expiresIn: 60 });
  await first;

  const failed = await loadRsvp(async () => { throw new Error("No se pudo conectar."); });
  await failed.submit({ preventDefault() {}, submitter: { value: "declined" } });
  assert.equal(failed.status.textContent, "No se pudo conectar.");
  assert.ok(failed.controls.every((control) => !control.disabled));
});
