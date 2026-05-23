#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
function read(file) { return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')); }
const oldPath = fs.existsSync(path.resolve(process.cwd(), 'tests/golden/listMcpTools.185.archived.json')) ? 'tests/golden/listMcpTools.185.archived.json' : 'tests/golden/listMcpTools.185.json';
const oldSnap = read(oldPath);
const newSnap = read('tests/golden/listMcpTools.195.json');
const oldMap = new Map(oldSnap.tools.map((tool) => [tool.name, tool]));
const newMap = new Map(newSnap.tools.map((tool) => [tool.name, tool]));
const removed = [];
const changed = [];
for (const [name, tool] of oldMap) {
  const next = newMap.get(name);
  if (!next) removed.push(name);
  else if (JSON.stringify(tool) !== JSON.stringify(next)) changed.push(name);
}
const added = [...newMap.keys()].filter((name) => !oldMap.has(name)).sort();
const expected = ['webai_chatgpt_select_model','webai_claude_select_model','wah_adapter_health','wah_artifact_get','wah_capability_query','wah_policy_explain','wah_task_cancel','wah_task_resume','wah_task_start','wah_task_status'].sort();
const ok = removed.length === 0 && changed.length === 0 && JSON.stringify(added) === JSON.stringify(expected);
console.log(JSON.stringify({ ok, oldPath, old_count: oldSnap.tools.length, new_count: newSnap.tools.length, added, removed, changed }, null, 2));
if (!ok) process.exitCode = 1;
