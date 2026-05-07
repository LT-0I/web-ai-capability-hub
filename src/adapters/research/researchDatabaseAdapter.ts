export interface ResearchDatabaseAdapter {
  id: string;
  kind: "research-database";
  baseUrl?: string;
  title?: string;
  accessPolicy: string[];
  stopConditions: string[];
  defaultCapabilities: string[];
}

export function makeResearchDatabaseAdapter(site: { site_id?: string; id?: string; base_url?: string; url?: string; title?: string; name?: string }): ResearchDatabaseAdapter {
  const id = site.site_id || site.id || "research-database";
  return {
    id,
    kind: "research-database",
    baseUrl: site.base_url || site.url,
    title: site.title || site.name || id,
    accessPolicy: ["Use official visible search/filter/export UI", "Prefer IP/institutional access", "Do not bypass login walls, CAPTCHA, bot checks, or export limits"],
    stopConditions: ["login required", "CAPTCHA", "access denied", "abnormal download behavior", "terms confirmation", "mass download warning"],
    defaultCapabilities: ["enter_search_query", "open_advanced_search", "apply_filter_or_facet", "read_results_metadata", "download_or_export"]
  };
}
