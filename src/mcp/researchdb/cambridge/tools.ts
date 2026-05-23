import { objectSchema, scalar } from "../../../utils/schema";
import { researchCambridgeSearch, researchCambridgeFilter, researchCambridgeExport, CambridgeSearchArgs, CambridgeFilterArgs, CambridgeExportArgs } from "../../../handlers/researchdb/legacy/cambridge";

export const researchCambridgeSearchInput = objectSchema<CambridgeSearchArgs>({
  query: scalar.string("Cambridge Core boolean query; q is mandatory because bare /core/search returns 404"),
  page_size: scalar.number("Optional pageSize passthrough"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-cambridge" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9245 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchCambridgeFilterInput = objectSchema<CambridgeFilterArgs>({
  query: scalar.string("Cambridge Core boolean query; q is mandatory"),
  product_type: scalar.enum(["JOURNAL_ARTICLE", "BOOK_PART", "BOOK", "ELEMENT"], "Content type facet; JOURNAL_ARTICLE confirms with Type: Articles chip"),
  open_access: scalar.string("Open-access facet raw value"),
  only_show_available: scalar.boolean("Entitled/access-available facet"),
  start_year: scalar.number("dateRange.from publication year"),
  end_year: scalar.number("dateRange.to publication year"),
  sort: scalar.string("Sort value for Cambridge Core search"),
  page_size: scalar.number("Optional pageSize passthrough"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-cambridge" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9245 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchCambridgeExportInput = objectSchema<CambridgeExportArgs>({
  query: { ...scalar.string("Search query used to load a results page before opening Citation Tools"), default: "unmanned aerial vehicle AND control" },
  product_id: scalar.string("Optional Cambridge Core data-prod-id for a per-result Citation Tools link"),
  format: { ...scalar.enum(["ris", "bibtex", "word", "text"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-cambridge" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9245 },
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const cambridgeResearchTools = [
  { name: "research_cambridge_search", description: "Search Cambridge Core using the verified /core/search?q=<boolean> recipe.", schema: researchCambridgeSearchInput, handler: async (args: CambridgeSearchArgs) => researchCambridgeSearch(args) },
  { name: "research_cambridge_filter", description: "Search and refine Cambridge Core using verified URL-expressible facet parameters.", schema: researchCambridgeFilterInput, handler: async (args: CambridgeFilterArgs) => researchCambridgeFilter(args) },
  { name: "research_cambridge_export", description: "Export a real Cambridge Core citation artifact through the verified CDP artifact-click Citation Tools modal path.", schema: researchCambridgeExportInput, handler: async (args: CambridgeExportArgs) => researchCambridgeExport(args) }
];

export { researchCambridgeSearch, researchCambridgeFilter, researchCambridgeExport };
