#!/usr/bin/env node
"use strict";

const path = require("node:path");

const HELP = `Usage:
  node scripts/extension-host.js install [--dry-run] [--chrome-profile-dir DIR] [--host-name NAME] [--native-server-path FILE] [--extension-id ID ...]
  node scripts/extension-host.js verify [--chrome-profile-dir DIR] [--host-name NAME]
  node scripts/extension-host.js uninstall [--chrome-profile-dir DIR] [--host-name NAME]
  node scripts/extension-host.js --help

This is unprivileged operator tooling for Chrome Native Messaging host manifests.
Run npm run build before install/verify/uninstall so dist/src/runtime/extension/installHost.js exists.`;

function loadInstaller() {
  const modulePath = path.resolve(__dirname, "../dist/src/runtime/extension/installHost.js");
  try {
    return require(modulePath);
  } catch (error) {
    const message = error && error.code === "MODULE_NOT_FOUND"
      ? `Installer module not found at ${modulePath}; run npm run build first.`
      : `Failed to load installer module at ${modulePath}: ${error && error.message ? error.message : String(error)}`;
    console.error(JSON.stringify({ ok: false, errorCode: "HUB_NOT_BUILT", message }, null, 2));
    process.exit(1);
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { allowedExtensionIds: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = () => {
      index += 1;
      if (index >= rest.length) throw new Error(`${arg} requires a value`);
      return rest[index];
    };
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--chrome-profile-dir") options.chromeProfileDir = next();
    else if (arg === "--host-name") options.hostName = next();
    else if (arg === "--native-server-path") options.nativeServerPath = next();
    else if (arg === "--extension-id") options.allowedExtensionIds.push(next());
    else if (arg === "--help" || arg === "-h") return { command: "help", options };
    else throw new Error(`Unknown flag: ${arg}`);
  }
  if (options.allowedExtensionIds.length === 0) delete options.allowedExtensionIds;
  return { command: command || "help", options };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, errorCode: "INVALID_ARGS", message: error.message }, null, 2));
    process.exit(2);
  }

  if (parsed.command === "help" || parsed.command === "--help" || parsed.command === "-h") {
    console.log(HELP);
    return;
  }

  const installer = loadInstaller();
  let result;
  if (parsed.command === "install") result = installer.installExtensionHost(parsed.options);
  else if (parsed.command === "verify") result = installer.verifyExtensionHost(parsed.options);
  else if (parsed.command === "uninstall") result = installer.uninstallExtensionHost(parsed.options);
  else {
    console.error(JSON.stringify({ ok: false, errorCode: "INVALID_ARGS", message: `Unknown subcommand: ${parsed.command}` }, null, 2));
    process.exit(2);
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, errorCode: "UNKNOWN", message: error && error.message ? error.message : String(error) }, null, 2));
  process.exit(1);
});
