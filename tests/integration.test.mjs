import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../public/config.js";
import { initialWedding } from "../public/data.js";
import { googleFormURL } from "../public/album.js";

test("production endpoints and confirmed wedding links are connected", () => {
  assert.equal(config.supabaseUrl, "https://wrfyceerrcnrvsuzeuzh.supabase.co");
  assert.match(config.supabasePublishableKey, /^sb_publishable_/);
  assert.equal(config.siteUrl, "https://boda-carli-fer.agentslucca.online/");
  assert.equal(initialWedding.ceremonyMap, "https://goo.su/dLQSOD");
  assert.equal(initialWedding.partyMap, "https://goo.su/6zn23");
  assert.equal(initialWedding.sharedMap, "");
  assert.equal(initialWedding.albumProvider, "google_forms");
  assert.equal(
    googleFormURL(initialWedding.albumUploadUrl),
    initialWedding.albumUploadUrl,
  );
});
