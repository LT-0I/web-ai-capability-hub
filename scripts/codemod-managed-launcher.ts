#!/usr/bin/env node
/**
 * P1 mechanical codemod: replace direct `new ManagedBrowserLauncher()` construction
 * with the v3.2 profile-pool launcher factory. The runtime pool owns the only
 * direct constructor call so grep-based gates can enforce centralization.
 */
const fs = require('node:fs');
const path = require('node:path');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.ts$/.test(entry.name)) files.push(full);
  }
  return files;
}

for (const file of walk(path.resolve(process.cwd(), 'src'))) {
  if (file.endsWith(path.join('src', 'runtime', 'pool', 'profilePool.ts'))) continue;
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes('new ManagedBrowserLauncher')) continue;
  text = text.replace(/new ManagedBrowserLauncher\(\)/g, 'createManagedBrowserLauncher()');
  if (text.includes('createManagedBrowserLauncher()') && !text.includes('../runtime/pool/profilePool') && !text.includes('../../runtime/pool/profilePool') && !text.includes('../../../runtime/pool/profilePool')) {
    const rel = path.relative(path.dirname(file), path.resolve(process.cwd(), 'src/runtime/pool/profilePool')).replace(/\\/g, '/');
    const spec = rel.startsWith('.') ? rel : `./${rel}`;
    text = text.replace(/(import \{[^}]*ManagedBrowserLauncher[^}]*\} from "[^"]+";\n)/, `$1import { createManagedBrowserLauncher } from "${spec}";\n`);
  }
  fs.writeFileSync(file, text, 'utf8');
}
