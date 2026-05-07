export interface AdapterTargetHint {
  id: string;
  role?: string;
  namePatterns?: string[];
  selectorHints?: string[];
  description?: string;
}

export interface ResearchCapabilitySelectorHints {
  search_input?: { selectors: string[] };
  filter_panel?: { selectors: string[] };
  export_button?: { selectors: string[] };
}

export interface SiteAdapter {
  id: string;
  name?: string;
  displayName: string;
  category: "web-ai" | "research-database" | "generic";
  hosts: string[];
  base_url?: string;
  search_url?: string;
  login_mode?: "public" | "licensed_ip_or_institutional";
  ip_login?: boolean;
  capability_hints?: ResearchCapabilitySelectorHints;
  description?: string;
  capabilityHints?: string[];
  semanticTargets?: AdapterTargetHint[];
  confirmationPolicy?: {
    requireFor?: string[];
    note?: string;
  };
  notesFile?: string;
}

export function validateAdapter(adapter: any): SiteAdapter {
  if (!adapter || typeof adapter !== "object") throw new Error("Adapter must be an object");
  for (const key of ["id", "displayName", "category"]) {
    if (!adapter[key] || typeof adapter[key] !== "string") throw new Error(`Adapter requires string field: ${key}`);
  }
  if (!Array.isArray(adapter.hosts)) throw new Error(`Adapter ${adapter.id} requires hosts[]`);
  if (!["web-ai", "research-database", "generic"].includes(adapter.category)) throw new Error(`Adapter ${adapter.id} has invalid category`);
  return adapter as SiteAdapter;
}
