import { objectSchema, scalar } from "../../../utils/schema";
import { researchWosSearch, researchWosFilter, researchWosExport, WosSearchArgs, WosFilterArgs, WosExportArgs } from "./flow";

export const researchWosSearchInput = objectSchema<WosSearchArgs>({
  query: scalar.string("Web of Science advanced-search query, e.g. TS=(...)"),
  mode: { ...scalar.enum(["advanced"], "Web of Science search mode"), default: "advanced" },
  page_size: scalar.number("Optional page size hint; Web of Science UI defaults are used by live flow"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-wos" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchWosFilterInput = objectSchema<WosFilterArgs>({
  query: scalar.string("Web of Science advanced-search query, e.g. TS=(...)"),
  mode: { ...scalar.enum(["advanced"], "Web of Science search mode"), default: "advanced" },
  document_type: { ...scalar.enum(["Article"], "Document Types facet"), default: "Article" },
  page_size: scalar.number("Optional page size hint; Web of Science UI defaults are used by live flow"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-wos" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchWosExportInput = objectSchema<WosExportArgs>({
  query: scalar.string("Web of Science advanced-search query, e.g. TS=(...)"),
  document_type: { ...scalar.enum(["Article"], "Document Types facet"), default: "Article" },
  format: { ...scalar.enum(["bibtex", "ris", "tab", "plain", "excel", "endnote"], "Export format"), default: "bibtex" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-wos" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export { researchWosSearch, researchWosFilter, researchWosExport };

export const wosResearchTools = [
  { name: "research_wos_search", description: "Search Web of Science Core Collection via the verified advanced-search UI flow.", schema: researchWosSearchInput, handler: researchWosSearch },
  { name: "research_wos_filter", description: "Search Web of Science Core Collection and apply the verified Document Type = Article refine flow.", schema: researchWosFilterInput, handler: researchWosFilter },
  { name: "research_wos_export", description: "Search, refine, and export Web of Science Core Collection records via the verified CDP download path.", schema: researchWosExportInput, handler: researchWosExport }
];
