import test from "node:test";
import assert from "node:assert/strict";
import { googleFormURL, albumState, albumQrURL } from "../public/album.js";
const event = {
  showAlbum: true,
  albumProvider: "google_forms",
  albumClosesAt: "2026-11-02T00:00:00-03:00",
  albumUploadUrl: "https://forms.gle/EXAMPLE123",
};
test("only Google Forms respondent URLs can be used as a public upload link", () => {
  assert.equal(
    googleFormURL("https://forms.gle/EXAMPLE123"),
    "https://forms.gle/EXAMPLE123",
  );
  assert.ok(
    googleFormURL(
      "https://docs.google.com/forms/d/e/EXAMPLE123/viewform?usp=sharing",
    ),
  );
  for (const url of [
    "https://drive.google.com/drive/folders/PRIVATE",
    "https://docs.google.com/forms/d/EXAMPLE/edit",
    "https://forms.gle.evil.example/example",
    "javascript:alert(1)",
    "https://user:pass@forms.gle/example",
    "https://forms.gle:9000/example",
  ])
    assert.equal(googleFormURL(url), "");
});
test("album handles pending configuration, external mode, internal fallback and closing time", () => {
  const now = Date.parse("2026-10-17T23:00:00Z");
  assert.equal(albumState(event, now).kind, "google_forms");
  assert.equal(
    albumState({ ...event, albumUploadUrl: "" }, now).kind,
    "pending",
  );
  assert.equal(
    albumState({ ...event, albumProvider: "supabase" }, now).kind,
    "supabase",
  );
  assert.equal(
    albumState({ ...event, albumProvider: undefined }, now).kind,
    "supabase",
  );
  assert.equal(
    albumState(event, Date.parse("2026-11-02T03:00:00Z")).kind,
    "closed",
  );
  assert.equal(albumState({ ...event, showAlbum: false }, now).kind, "closed");
});
test("external QR keeps the invitation domain and never embeds guest code or draft flag", () => {
  const url = albumQrURL(
    "https://boda-carli-fer.agentslucca.online/?preview=1#codigo=secret",
    "google_forms",
    "secret",
  );
  assert.equal(url, "https://boda-carli-fer.agentslucca.online/#recuerdos");
  assert.throws(() => albumQrURL("https://wedding.example", "supabase", ""));
  assert.match(
    albumQrURL("https://wedding.example", "supabase", "a b"),
    /#codigo=a\+b$/,
  );
});
