#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const root = process.cwd();
function walk(d, out=[]) { if (!fs.existsSync(d)) return out; for (const e of fs.readdirSync(d,{withFileTypes:true})) { const f=path.join(d,e.name); if(e.isDirectory()) walk(f,out); else if(/\.ya?ml$/i.test(e.name)) out.push(f); } return out.sort(); }
function looksLikeManifest(raw) { return /(^|\n)\s*version\s*:/m.test(raw) && /(^|\n)\s*operation\s*:/m.test(raw) && /(^|\n)\s*kind\s*:/m.test(raw) && /(^|\n)\s*descriptionLiteral\s*:/m.test(raw); }
function slugify(v) { return String(v).replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase(); }
function camel(v) { return slugify(v).split('-').map((p,i)=>i?p.charAt(0).toUpperCase()+p.slice(1):p).join(''); }
function mcpNameFor(m) { const p=String(m.target.provider||'').replace(/-/g,'_'); if(m.target.kind==='researchdb') return `research_${p}_${m.operation}`; if(m.target.kind==='webai') return `webai_${p}_${String(m.operation).replace(/-/g,'_')}`; if(m.target.kind==='generic' && m.id.startsWith('wah.')) return `wah_${String(m.operation).replace(/\./g,'_')}`; return String(m.id).replace(/[.-]/g,'_'); }
const manifests = walk(path.join(root,'configs/adapters')).map((file)=>({file, raw:fs.readFileSync(file,'utf8')})).filter((x)=>looksLikeManifest(x.raw)).map((x)=>yaml.load(x.raw));
const outDir = path.join(root,'src/generated/tools');
fs.rmSync(outDir,{recursive:true,force:true}); fs.mkdirSync(outDir,{recursive:true});
for (const m of manifests) {
  const base=slugify(m.id); const exportName=`${camel(m.id)}ToolSpec`; const toolName=mcpNameFor(m); const manifestId=JSON.stringify(m.id);
  const contents = `import { objectSchema } from "../../utils/schema";\nimport { ToolSpec } from "../../mcp/tools";\nimport { ExecutionEngine } from "../../runtime/exec/engine";\n\nexport const ${exportName}: ToolSpec = {\n  name: ${JSON.stringify(toolName)},\n  description: ${JSON.stringify(m.descriptionLiteral || '')},\n  schema: objectSchema<Record<string, unknown>>({}, []),\n  handler: async (args, runtime) => ExecutionEngine.run(${manifestId}, args, runtime as any)\n};\n\nexport default ${exportName};\n`;
  fs.writeFileSync(path.join(outDir, `${base}.ts`), contents, 'utf8');
}
console.log(JSON.stringify({ ok:true, generated:manifests.length, outDir }, null, 2));
