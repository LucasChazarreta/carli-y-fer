import test from "node:test";
import assert from "node:assert/strict";
import { invitationURL, shareInvitation } from "../public/invitation-links.js";
test("personal invitation links strip administrative state and preserve only their token", () => {
  const token = "x".repeat(43);
  assert.equal(
    invitationURL(
      "https://wedding.example/?preview=1&proof=secret#admin",
      token,
    ),
    "https://wedding.example/?i=" + token,
  );
  assert.throws(() =>
    invitationURL("https://user:pass@wedding.example", token),
  );
});
test("Web Share falls back to copying the exact link", async () => {
  let copied;
  const url = invitationURL("https://wedding.example", "x".repeat(43));
  assert.equal(
    await shareInvitation(url, {
      clipboard: { writeText: async (text) => (copied = text) },
    }),
    "copied",
  );
  assert.equal(copied, url);
  assert.equal(
    await shareInvitation(url, {
      share: async () => {
        throw new Error("unsupported");
      },
      clipboard: { writeText: async (text) => (copied = text) },
    }),
    "copied",
  );
});
test("Web Share respects cancellation without copying", async () => {
  assert.equal(
    await shareInvitation("https://wedding.example", {
      share: async () => {
        const e = new Error();
        e.name = "AbortError";
        throw e;
      },
      clipboard: { writeText: async () => assert.fail() },
    }),
    "cancelled",
  );
});
