const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
import { CapabilityDatabase } from "../src/capabilities/database";
import { BrowserProfileStore } from "../src/browser/profileStore";
import { acquireProfileLease, auditProfiles, releaseLeaseAndCleanLocks, releaseProfileLease } from "../src/browser/profileLease";

function tempRoot(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "profile-lease-")); }
function tempDb(root: string): CapabilityDatabase { return new CapabilityDatabase({ dbPath: path.join(root, "capability.json"), preferSqlite: false }); }

test("profile lease acquire/release happy path", () => {
  const root = tempRoot();
  const db = tempDb(root);
  const store = new BrowserProfileStore(root);
  const dir = store.resolveProfileDir("chatgpt");
  const lease = acquireProfileLease({ profileId: "chatgpt", userDataDir: dir, runId: "run1", ownerPid: 111, chromeProcessPid: 222, database: db });
  assert.equal(db.getActiveProfileLease("chatgpt")?.id, lease.id);
  const released = releaseProfileLease("chatgpt", { database: db });
  assert.equal(released?.released_at !== undefined, true);
  assert.equal(db.getActiveProfileLease("chatgpt"), undefined);
});

test("audit reports stale lock files when chrome pid is dead", () => {
  const root = tempRoot();
  const db = tempDb(root);
  const store = new BrowserProfileStore(root);
  const dir = store.resolveProfileDir("chatgpt");
  fs.writeFileSync(path.join(dir, "SingletonLock"), "lock");
  fs.mkdirSync(path.join(dir, "Cache"), { recursive: true });
  fs.writeFileSync(path.join(dir, "Cache", "blob"), Buffer.alloc(7));
  acquireProfileLease({ profileId: "chatgpt", userDataDir: dir, ownerPid: 111, chromeProcessPid: 222, database: db });
  const audit = auditProfiles({ store, database: db, isPidAlive: () => false });
  const entry = audit.find((item) => item.profileId === "chatgpt");
  assert.equal(entry?.chromePid, 222);
  assert.equal(entry?.chromeAlive, false);
  assert.equal(entry?.cacheSizeBytes, 7);
  assert.deepEqual(entry?.staleLockFiles, [path.join(dir, "SingletonLock")]);
});

test("browser:audit JSON shape", () => {
  const root = tempRoot();
  const cli = path.resolve(__dirname, "../src/cli.js");
  const result = spawnSync(process.execPath, [cli, "browser:audit", "--output-json"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.ok(Array.isArray(parsed));
});

test("release-lease refuses live pid and force overrides", () => {
  const root = tempRoot();
  const db = tempDb(root);
  const store = new BrowserProfileStore(root);
  const dir = store.resolveProfileDir("chatgpt");
  fs.writeFileSync(path.join(dir, "SingletonSocket"), "lock");
  acquireProfileLease({ profileId: "chatgpt", userDataDir: dir, ownerPid: 111, chromeProcessPid: 222, database: db });
  const refused = releaseLeaseAndCleanLocks("chatgpt", { store, database: db, isPidAlive: () => true });
  assert.equal(refused.ok, false);
  assert.equal(refused.errorCode, "PROFILE_LEASE_BUSY");
  assert.ok(fs.existsSync(path.join(dir, "SingletonSocket")));
  const forced = releaseLeaseAndCleanLocks("chatgpt", { store, database: db, isPidAlive: () => true, force: true });
  assert.equal(forced.ok, true);
  assert.deepEqual(forced.cleanedLockFiles, [path.join(dir, "SingletonSocket")]);
  assert.equal(fs.existsSync(path.join(dir, "SingletonSocket")), false);
});
