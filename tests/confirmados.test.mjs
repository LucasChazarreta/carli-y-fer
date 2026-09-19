import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const moduleUrl = (source) =>
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const makeStorage = (saved) => ({
  value: saved,
  getItem() {
    return this.value == null ? null : JSON.stringify(this.value);
  },
  removeItem() {
    this.value = null;
  },
});

async function loadConfirmed({ saved, validate = async () => ({ ok: true }) }) {
  const validation = { hidden: false, innerHTML: "" };
  const content = { hidden: true, focus() {} };
  const link = { href: "" };
  const qrOutput = {
    innerHTML: "",
    querySelector: () => ({ prepend() {}, setAttribute() {} }),
  };
  const elements = {
    "#validation": validation,
    "#confirmed-content": content,
    "#memories-link": link,
    "#memories-qr": qrOutput,
  };
  globalThis.document = {
    querySelector: (selector) => elements[selector],
    createElementNS: () => ({ id: "", textContent: "" }),
  };
  globalThis.sessionStorage = makeStorage(saved);
  const redirects = [];
  globalThis.location = {
    href: "https://wedding.example/confirmados/?proof=leak",
    pathname: "/confirmados/",
  };
  globalThis.history = {
    replaceState(_state, _title, url) {
      location.href = "https://wedding.example" + url;
    },
  };
  globalThis.window = {
    qrcode: () => ({
      addData(value) {
        this.value = value;
      },
      make() {},
      createSvgTag() {
        return "<svg></svg>";
      },
    }),
    setTimeout: (callback) => callback(),
    location: { replace: (url) => redirects.push(url) },
  };
  globalThis.__validate = validate;
  const nonce = Math.random();
  const api = moduleUrl(
    `export const api={validateRsvpProof:globalThis.__validate}; // ${nonce}`,
  );
  const album = moduleUrl(
    `export function publicMemoriesURL(value){const url=new URL(value);url.search="";url.hash="recuerdos";return url.href} // ${nonce}`,
  );
  const config = moduleUrl(
    `export const config={siteUrl:"https://wedding.example/?apikey=never-in-qr#proof"}; // ${nonce}`,
  );
  let source = await fs.readFile(
    new URL("../public/confirmados/confirmados.js", import.meta.url),
    "utf8",
  );
  const session = moduleUrl(
    (await fs.readFile(
      new URL("../public/invitation-session.js", import.meta.url),
      "utf8",
    )) + `\n// ${nonce}`,
  );
  source = source
    .replace('"../invitation-session.js"', JSON.stringify(session))
    .replace('"../api.js"', JSON.stringify(api))
    .replace('"../album.js"', JSON.stringify(album))
    .replace('"../config.js"', JSON.stringify(config));
  await import(moduleUrl(source + `\n// ${Math.random()}`));
  await new Promise((resolve) => setImmediate(resolve));
  return { validation, content, link, redirects, storage: sessionStorage };
}

test("confirmed-only page stays locked without a current, authentic, confirmed proof", async (t) => {
  const cases = [
    ["missing", null, async () => ({ ok: true })],
    [
      "tampered",
      { proof: "tampered", expiresAt: Date.now() + 60_000 },
      async () => {
        throw new Error("invalid");
      },
    ],
    [
      "expired",
      { proof: "signed", expiresAt: Date.now() - 1 },
      async () => ({ ok: true }),
    ],
    [
      "declined",
      { proof: "signed", expiresAt: Date.now() + 60_000 },
      async () => {
        throw new Error("declined");
      },
    ],
  ];
  for (const [label, saved, validate] of cases)
    await t.test(label, async () => {
      const page = await loadConfirmed({ saved, validate });
      assert.equal(page.content.hidden, true);
      assert.deepEqual(page.redirects, ["../#confirmar"]);
      assert.equal(page.storage.value, null);
    });
});

test("a valid confirmed proof unlocks songs, memories and a credential-free QR URL", async () => {
  const page = await loadConfirmed({
    saved: { proof: "signed.secret", expiresAt: Date.now() + 60_000 },
  });
  assert.equal(page.validation.hidden, true);
  assert.equal(page.content.hidden, false);
  assert.equal(page.redirects.length, 0);
  assert.equal(page.link.href, "https://wedding.example/#recuerdos");
  assert.doesNotMatch(page.link.href, /signed|secret|proof|apikey|@/u);
  assert.equal(location.href, "https://wedding.example/confirmados/");
});
