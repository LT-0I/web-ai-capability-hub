import { CapabilityDatabase } from "./database";
import { CapabilityQuery, CapabilityRecord } from "./schemas";

export class CapabilityQueryService {
  constructor(private database = new CapabilityDatabase()) {}

  query(query: CapabilityQuery): CapabilityRecord[] {
    return this.database.queryCapabilities(query);
  }

  targetSummary(targetId: string): { target: string; capabilityCount: number; categories: Record<string, number>; top: CapabilityRecord[] } {
    const capabilities = this.database.queryCapabilities({ target: targetId, limit: 500 });
    const categories: Record<string, number> = {};
    for (const capability of capabilities) categories[capability.category] = (categories[capability.category] || 0) + 1;
    return { target: targetId, capabilityCount: capabilities.length, categories, top: capabilities.slice(0, 10) };
  }
}
