import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseHTML } from "linkedom";
const moduleURL = (s) =>
  "data:text/javascript;base64," + Buffer.from(s).toString("base64");
async function loadUI(responder, overrides = {}) {
  const { document, window } = parseHTML(
    await fs.readFile("public/index.html", "utf8"),
  );
  globalThis.document = document;
  const token = "T".repeat(43),
    values = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  const navigation = [];
  globalThis.location = {
    href: "https://wedding.example/?i=" + token,
    assign: (v) => navigation.push(v),
  };
  globalThis.history = {
    replaceState(_s, _t, url) {
      location.href = new URL(url, location.href).href;
    },
  };
  const form = document.querySelector("#rsvp-form");
  Object.defineProperty(form, "elements", {
    get: () => form.querySelectorAll("input,button"),
  });
  globalThis.FormData = class {
    constructor(form) {
      this.entries = [...form.querySelectorAll("input:checked")].map((i) => [
        i.name,
        i.value,
      ]);
    }
    [Symbol.iterator]() {
      return this.entries[Symbol.iterator]();
    }
  };
  const state = {
    ok: true,
    displayName: "Familia <Gómez>",
    revision: 2,
    deadline: "2099-09-30",
    guests: [
      { key: "a".repeat(64), name: "Ana", status: "pending" },
      { key: "b".repeat(64), name: "Juan", status: "pending" },
    ],
    ...overrides,
  };
  globalThis.__client = {
    resolveInvitation: async () => state,
    rsvp: responder,
  };
  const api = moduleURL(
    "export const configured=true;export const api=globalThis.__client; //" +
      Math.random(),
  );
  const session = moduleURL(
    (await fs.readFile("public/invitation-session.js", "utf8")) +
      "\n//" +
      Math.random(),
  );
  const utils = moduleURL(await fs.readFile("public/utils.js", "utf8"));
  let source = await fs.readFile("public/rsvp.js", "utf8");
  source = source
    .replace('"./api.js"', JSON.stringify(api))
    .replace('"./invitation-session.js"', JSON.stringify(session))
    .replace('"./utils.js"', JSON.stringify(utils));
  await import(moduleURL(source + "\n//" + Math.random()));
  await new Promise((r) => setImmediate(r));
  const submit = () =>
    form.dispatchEvent(new window.Event("submit", { cancelable: true }));
  const answer = (index, status) => {
    form
      .querySelectorAll("input")
      [
        index * 2 + (status === "confirmed" ? 0 : 1)
      ].setAttribute("checked", "");
  };
  return { document, form, state, navigation, values, submit, answer };
}
test("confirmation CTA is prominent but remains gated by the resolved invitation", async () => {
  for (const confirmed of [false, true]) {
    const ui = await loadUI(async () => ({}), { confirmed });
    const link = ui.document.querySelector("#confirmed-access");
    assert.equal(link.hidden, !confirmed);
    assert.equal(link.getAttribute("href"), "confirmados/");
    assert.ok(link.classList.contains("button"));
    assert.ok(link.classList.contains("confirmed-access"));
    assert.match(link.textContent, /Ir a mi confirmación/);
  }
});
test("V2 client identifies a family from the link, scrubs URL and redirects only after confirmation", async () => {
  const ui = await loadUI(async () => ({
    confirmed: true,
    proof: "signed.proof",
    expiresIn: 1800,
  }));
  assert.equal(
    ui.document.querySelector("#invitation-name").textContent,
    "Familia <Gómez>",
  );
  assert.equal(ui.form.hidden, false);
  assert.equal(ui.form.querySelectorAll("fieldset").length, 2);
  assert.equal(location.href, "https://wedding.example/");
  ui.answer(0, "confirmed");
  ui.submit();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(ui.navigation, ["https://wedding.example/confirmados/"]);
  assert.ok(ui.values.get("cf-rsvp-proof").includes("signed.proof"));
});
test("V2 client thanks all declines and does not unlock confirmed features", async () => {
  const ui = await loadUI(async () => ({
    confirmed: false,
    revision: 3,
    guests: [{ status: "declined" }, { status: "declined" }],
  }));
  ui.answer(0, "declined");
  ui.answer(1, "declined");
  ui.submit();
  await new Promise((r) => setImmediate(r));
  assert.equal(ui.navigation.length, 0);
  assert.match(
    ui.document.querySelector("#rsvp-status").textContent,
    /Gracias por avisarnos/,
  );
  assert.equal(ui.values.get("cf-rsvp-proof"), undefined);
});
test("V2 client ignores double clicks, reuses the request ID after network failure and recovers controls", async () => {
  let reject,
    calls = [];
  const ui = await loadUI(async (token, body) => {
    calls.push(body);
    return new Promise((_resolve, no) => {
      reject = no;
    });
  });
  ui.answer(0, "confirmed");
  ui.submit();
  ui.submit();
  assert.equal(calls.length, 1);
  assert.ok([...ui.form.elements].every((c) => c.disabled));
  reject(new Error("Sin conexión"));
  await new Promise((r) => setImmediate(r));
  assert.ok([...ui.form.elements].every((c) => !c.disabled));
  ui.submit();
  assert.equal(calls[0].requestId, calls[1].requestId);
  reject(new Error("Sin conexión"));
  await new Promise((r) => setImmediate(r));
});
