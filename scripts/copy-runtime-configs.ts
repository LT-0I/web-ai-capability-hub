#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const outDir = path.join(root, "dist", "configs");
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(
  path.join(root, "configs", "consumer-contract.json"),
  path.join(outDir, "consumer-contract.json")
);
