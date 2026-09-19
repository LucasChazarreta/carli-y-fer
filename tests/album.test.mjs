import test from "node:test";
import assert from "node:assert/strict";
import {
  googleFormURL,
  albumState,
  publicMemoriesURL,
} from "../public/album.js";
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
test("public memories URL is stable and strips every kind of private state", () => {
  const expected = "https://boda-carli-fer.agentslucca.online/#recuerdos";
  for (const privateState of [
    "?preview=1&codigo=RSVP&token=confirmation&access_token=auth&refresh_token=refresh&password=admin#codigo=shared",
    "?admin=true&credential=secret&api_key=private#token=confirmation",
    "#preview=1&codigo=RSVP&proof=signed",
  ]) {
    const result = publicMemoriesURL(
      `https://boda-carli-fer.agentslucca.online/${privateState}`,
    );
    assert.equal(result, expected);
    const url = new URL(result);
    assert.equal(url.origin, "https://boda-carli-fer.agentslucca.online");
    assert.equal(url.hash, "#recuerdos");
    assert.equal(url.search, "");
  }
  assert.throws(() => publicMemoriesURL("http://wedding.example/?token=x"));
  assert.throws(() =>
    publicMemoriesURL("https://admin:secret@wedding.example/"),
  );
});
