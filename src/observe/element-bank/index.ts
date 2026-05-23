const crypto = require("node:crypto");
import { RuntimeLeaseStore, runtimeLeaseStore, ElementBankRow } from "../../runtime/pool/leaseStore";
import { SnapshotElement } from "../../shared/types";
import { selectorCandidatesForElement } from "../selectorCandidates";

function stableId(parts: unknown[]): string { return `el_${crypto.createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16)}`; }
function json(value: unknown): string | undefined { return value === undefined ? undefined : JSON.stringify(value); }

export class ElementBank {
  constructor(private store: RuntimeLeaseStore = runtimeLeaseStore()) {}

  seedFromSnapshot(manifestId: string, target: string, stateHash: string, elements: SnapshotElement[]): ElementBankRow[] {
    return elements.map((element) => {
      const candidates = selectorCandidatesForElement(element);
      const row: ElementBankRow = {
        id: stableId([manifestId, target, stateHash, element.ref || element.selector || element.name]),
        manifest_id: manifestId,
        selector_role: element.role || element.tagName,
        target,
        state_hash: stateHash,
        primary_css: candidates.find((candidate) => !candidate.startsWith("role=")),
        aria_role: element.role,
        aria_name: element.name,
        near_text_json: json({ text: element.text || element.name || "" }),
        bbox_json: json((element as any).boundingBox),
        dom_fingerprint: stableId([element.tagName, element.role, element.name, candidates.slice(0, 5)]),
        success_count: 0,
        failure_count: 0
      };
      return this.store.upsertElement(row);
    });
  }

  upsert(row: ElementBankRow): ElementBankRow { return this.store.upsertElement(row); }
}

export const elementBank = new ElementBank();
