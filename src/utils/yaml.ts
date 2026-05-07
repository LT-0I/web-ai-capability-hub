const fs = require("node:fs");
import { optionalRequire } from "./optionalRequire";

function countIndent(line: string): number { return line.match(/^\s*/)?.[0].length || 0; }
function stripComment(line: string): string {
  let inSingle = false, inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle && line[i - 1] !== "\\") inDouble = !inDouble;
    if (ch === "#" && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}
function splitKeyValue(text: string): [string, string] | undefined {
  let inSingle = false, inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle && text[i - 1] !== "\\") inDouble = !inDouble;
    if (ch === ":" && !inSingle && !inDouble) return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
  }
  return undefined;
}
function parseScalar(text: string): any {
  const value = text.trim();
  if (value === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1).replace(/\\"/g, '"');
  if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function normalizeLines(text: string): string[] {
  return text.split(/\r?\n/).map(stripComment).filter((line) => line.trim().length > 0);
}

function parseBlock(lines: string[], start: number, indent: number): { value: any; index: number } {
  if (start >= lines.length) return { value: {}, index: start };
  const first = lines[start];
  const firstIndent = countIndent(first);
  if (firstIndent < indent) return { value: {}, index: start };
  const isArray = first.trimStart().startsWith("- ");
  if (isArray) {
    const array: any[] = [];
    let index = start;
    while (index < lines.length) {
      const line = lines[index];
      const lineIndent = countIndent(line);
      if (lineIndent < indent || lineIndent !== indent || !line.trimStart().startsWith("- ")) break;
      const body = line.trimStart().slice(2).trim();
      if (!body) {
        const child = parseBlock(lines, index + 1, indent + 2);
        array.push(child.value);
        index = child.index;
      } else {
        const kv = splitKeyValue(body);
        if (kv) {
          const obj: any = {};
          obj[kv[0]] = kv[1] ? parseScalar(kv[1]) : parseBlock(lines, index + 1, indent + 2).value;
          index++;
          while (index < lines.length) {
            const nextIndent = countIndent(lines[index]);
            if (nextIndent <= indent) break;
            if (nextIndent < indent + 2) break;
            const nextText = lines[index].trim();
            if (nextText.startsWith("- ")) break;
            const nextKv = splitKeyValue(nextText);
            if (!nextKv) break;
            if (nextKv[1]) { obj[nextKv[0]] = parseScalar(nextKv[1]); index++; }
            else { const child = parseBlock(lines, index + 1, nextIndent + 2); obj[nextKv[0]] = child.value; index = child.index; }
          }
          array.push(obj);
        } else { array.push(parseScalar(body)); index++; }
      }
    }
    return { value: array, index };
  }
  const object: any = {};
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    const lineIndent = countIndent(line);
    if (lineIndent < indent) break;
    if (lineIndent > indent) break;
    const kv = splitKeyValue(line.trim());
    if (!kv) { index++; continue; }
    if (kv[1]) { object[kv[0]] = parseScalar(kv[1]); index++; }
    else { const child = parseBlock(lines, index + 1, indent + 2); object[kv[0]] = child.value; index = child.index; }
  }
  return { value: object, index };
}

export function parseConfigText(text: string): any {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
  const yaml = optionalRequire<any>("yaml");
  if (yaml?.parse) return yaml.parse(text);
  return parseBlock(normalizeLines(text), 0, 0).value;
}

export function readConfigFile(filePath: string): any {
  return parseConfigText(fs.readFileSync(filePath, "utf-8"));
}
