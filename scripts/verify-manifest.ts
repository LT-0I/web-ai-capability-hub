#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const root = process.cwd();
const dir = path.join(root, 'configs/adapters');
function walk(d, out=[]) {
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.ya?ml$/i.test(e.name)) out.push(f);
  }
  return out.sort();
}
function looksLikeManifest(raw) { return /(^|\n)\s*version\s*:/m.test(raw) && /(^|\n)\s*operation\s*:/m.test(raw) && /(^|\n)\s*kind\s*:/m.test(raw) && /(^|\n)\s*descriptionLiteral\s*:/m.test(raw); }
function validate(file, raw) {
  const data = yaml.load(raw);
  const errors = [];
  for (const key of ['id','version','target','operation','kind','safety','descriptionLiteral','inputSchemaRef','outputSchemaRef']) if (data?.[key] === undefined) errors.push(`missing ${key}`);
  if (data?.kind === 'direct' && !data.direct) errors.push('missing direct');
  if (data?.kind === 'recipe' && !data.recipe) errors.push('missing recipe');
  if (data?.safety && !['read','write','upload','export','publish','account','payment','batch'].includes(data.safety.class)) errors.push(`invalid safety.class ${data.safety.class}`);
  if (data?.target && !['webai','researchdb','patentdb','generic'].includes(data.target.kind)) errors.push(`invalid target.kind ${data.target.kind}`);
  return errors.length ? { path: file, errors } : null;
}
const files = walk(dir);
const manifestFiles = [];
const errors = [];
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  if (!looksLikeManifest(raw)) continue;
  manifestFiles.push(file);
  const err = validate(file, raw);
  if (err) errors.push(err);
}
const out = { ok: errors.length === 0, manifest_count: manifestFiles.length, errors };
console.log(JSON.stringify(out, null, 2));
if (!out.ok) process.exitCode = 1;
