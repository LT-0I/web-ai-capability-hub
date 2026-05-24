import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  allowedOriginsForExtensionIds,
  createNativeMessagingHostManifest,
  installExtensionHost,
  uninstallExtensionHost,
  verifyExtensionHost
} from "../../src/runtime/extension/installHost";
import { ConsumerErrorCodes } from "../../src/consumer/errorCodes";

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wah-p5-host-"));
}

function makeProfile(root: string): string {
  const profileDir = path.join(root, "chrome-profile");
  fs.mkdirSync(profileDir, { recursive: true });
  return profileDir;
}

function makeNativeServer(root: string, executable = true): string {
  const file = path.join(root, "native-messaging-host.js");
  fs.writeFileSync(file, "#!/usr/bin/env node\nprocess.exit(0);\n", "utf8");
  fs.chmodSync(file, executable ? 0o755 : 0o644);
  return file;
}

test("phase5 installExtensionHost dryRun returns the expected manifest coordinates without writing", () => {
  const root = tempRoot();
  const profileDir = makeProfile(root);
  const nativeServerPath = makeNativeServer(root);
  const allowedExtensionIds = ["abc123def456"];
  const expectedOrigins = ["chrome-extension://abc123def456/"];

  const result = installExtensionHost({
    chromeProfileDir: profileDir,
    nativeServerPath,
    allowedExtensionIds,
    dryRun: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.nativeServerPath, nativeServerPath);
  assert.deepEqual(result.allowedOrigins, expectedOrigins);
  assert.equal(fs.existsSync(result.manifestPath), false);
  assert.deepEqual(
    createNativeMessagingHostManifest(result.hostName, result.nativeServerPath, result.allowedOrigins),
    {
      name: "com.chromemcp.nativehost",
      description: "Chrome MCP native messaging host",
      path: nativeServerPath,
      type: "stdio",
      allowed_origins: expectedOrigins
    }
  );
});

test("phase5 install, verify, and uninstall use a sandboxed Chrome profile manifest", () => {
  const root = tempRoot();
  const profileDir = makeProfile(root);
  const nativeServerPath = makeNativeServer(root);

  const install = installExtensionHost({
    chromeProfileDir: profileDir,
    nativeServerPath,
    allowedExtensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
  });
  assert.equal(install.ok, true);
  assert.equal(fs.existsSync(install.manifestPath), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(install.manifestPath, "utf8")), {
    name: install.hostName,
    description: "Chrome MCP native messaging host",
    path: nativeServerPath,
    type: "stdio",
    allowed_origins: ["chrome-extension://abcdefghijklmnopabcdefghijklmnop/"]
  });

  const verify = verifyExtensionHost({ chromeProfileDir: profileDir });
  assert.equal(verify.ok, true);
  assert.deepEqual(verify.missingChecks, []);
  assert.equal(verify.manifestPath, install.manifestPath);
  assert.equal(verify.nativeServerPath, nativeServerPath);

  const uninstall = uninstallExtensionHost({ chromeProfileDir: profileDir });
  assert.deepEqual(uninstall, { ok: true, manifestPath: install.manifestPath, deleted: true });
  assert.equal(fs.existsSync(install.manifestPath), false);
  assert.deepEqual(verifyExtensionHost({ chromeProfileDir: profileDir }).missingChecks, ["manifest_missing"]);
});

test("phase5 verifyExtensionHost detects a manifest that references a missing native server", () => {
  const root = tempRoot();
  const profileDir = makeProfile(root);
  const nativeServerPath = makeNativeServer(root);
  const install = installExtensionHost({
    chromeProfileDir: profileDir,
    nativeServerPath,
    allowedExtensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
  });
  assert.equal(install.ok, true);

  fs.rmSync(nativeServerPath, { force: true });
  const verify = verifyExtensionHost({ chromeProfileDir: profileDir });
  assert.equal(verify.ok, false);
  assert.ok(verify.missingChecks.includes("native_server_missing"));
  assert.equal(verify.nativeServerPath, nativeServerPath);
});

test("phase5 verifyExtensionHost detects a non-executable native server", () => {
  const root = tempRoot();
  const profileDir = makeProfile(root);
  const nativeServerPath = makeNativeServer(root, false);
  const install = installExtensionHost({
    chromeProfileDir: profileDir,
    nativeServerPath,
    allowedExtensionIds: ["abcdefghijklmnopabcdefghijklmnop"]
  });
  assert.equal(install.ok, true);

  const verify = verifyExtensionHost({ chromeProfileDir: profileDir });
  assert.equal(verify.ok, false);
  assert.ok(verify.missingChecks.includes("native_server_not_executable"));
});

test("phase5 installExtensionHost returns an error for a missing Chrome profile dir", () => {
  const root = tempRoot();
  const nativeServerPath = makeNativeServer(root);
  const result = installExtensionHost({
    chromeProfileDir: path.join(root, "nonexistent"),
    nativeServerPath,
    allowedExtensionIds: ["abc123def456"]
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED);
});

test("phase5 installExtensionHost returns an error for a missing native server path", () => {
  const root = tempRoot();
  const profileDir = makeProfile(root);
  const result = installExtensionHost({
    chromeProfileDir: profileDir,
    nativeServerPath: path.join(root, "nonexistent.js"),
    allowedExtensionIds: ["abc123def456"]
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, ConsumerErrorCodes.CHROME_EXTENSION_NOT_CONNECTED);
});

test("phase5 installExtensionHost rejects empty allowedExtensionIds", () => {
  const root = tempRoot();
  const profileDir = makeProfile(root);
  const nativeServerPath = makeNativeServer(root);
  const result = installExtensionHost({
    chromeProfileDir: profileDir,
    nativeServerPath,
    allowedExtensionIds: []
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, ConsumerErrorCodes.INVALID_ARGS);
});

test("phase5 allowed-origins generation produces Chrome extension origin URLs", () => {
  assert.deepEqual(allowedOriginsForExtensionIds(["abc123def456"]), ["chrome-extension://abc123def456/"]);
  assert.deepEqual(
    allowedOriginsForExtensionIds(["abc123def456", "abcdefghijklmnopabcdefghijklmnop"]),
    ["chrome-extension://abc123def456/", "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"]
  );
});

test("phase5 no-contract-change guard keeps package, contract, and 8-lock counts unchanged", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
  const contract = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "configs/consumer-contract.json"), "utf8"));
  const golden = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "tests/golden/listMcpTools.195.json"), "utf8"));

  assert.equal(packageJson.version, "1.0.0");
  assert.equal(contract.package_version, "1.0.0");
  assert.equal(contract.contract_version, "consumer-contract-1.10.0");
  assert.equal(contract.commands.length, 191);
  assert.equal(contract.error_codes.length, 39);
  assert.equal(contract.commands.filter((command: any) => String(command.mcp_name || "").startsWith("webai_")).length, 40);
  assert.equal(contract.commands.filter((command: any) => String(command.mcp_name || "").startsWith("research_")).length, 121);
  assert.equal(contract.commands.filter((command: any) => String(command.mcp_name || "").startsWith("wah_")).length, 8);
  assert.equal(golden.tools.length, 195);
});
