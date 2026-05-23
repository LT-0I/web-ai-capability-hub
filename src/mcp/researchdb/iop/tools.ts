import { objectSchema, scalar } from "../../../utils/schema";
import { researchIopSearch, researchIopFilter, researchIopExport, IopSearchArgs, IopFilterArgs, IopExportArgs } from "../../../handlers/researchdb/legacy/iop";

export const researchIopSearchInput = objectSchema<IopSearchArgs>({
  query: scalar.string("IOPscience boolean/unified search terms"),
  page_size: scalar.number("Accepted for schema parity; IOPscience /nsearch does not expose a verified page-size URL parameter"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-iop" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9240 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchIopFilterInput = objectSchema<IopFilterArgs>({
  query: scalar.string("IOPscience boolean/unified search terms"),
  search_date_period: { ...scalar.enum(["anytime", "lastThirtyDays", "lastTwelveMonths", "lastFiveYears"], "Date published facet"), default: "anytime" },
  pub_type: scalar.enum(["article", "chapter", "book"], "Publication type facet"),
  access_type: scalar.enum(["open-access"], "Open access facet"),
  journal_issn: scalar.string("Journal/source facet ISSN value, e.g. 2053-1591"),
  order_by: scalar.enum(["relevance", "recent", "oldest"], "Sort order"),
  page_size: scalar.number("Accepted for schema parity; IOPscience /nsearch does not expose a verified page-size URL parameter"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-iop" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9240 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchIopExportInput = objectSchema<IopExportArgs>({
  doi: scalar.string("IOPscience article DOI to export"),
  format: { ...scalar.enum(["ris", "bibtex"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-iop" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9240 },
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const iopResearchTools = [
  { name: "research_iop_search", description: "Search IOPscience via the verified IOPscience /nsearch URL-parameter recipe.", schema: researchIopSearchInput, handler: async (args: IopSearchArgs) => researchIopSearch(args) },
  { name: "research_iop_filter", description: "Search and refine IOPscience using verified Refine your search URL parameters.", schema: researchIopFilterInput, handler: async (args: IopFilterArgs) => researchIopFilter(args) },
  { name: "research_iop_export", description: "Export a real per-article IOPscience RIS or BibTeX artifact using the verified CDP artifact-click path.", schema: researchIopExportInput, handler: async (args: IopExportArgs) => researchIopExport(args) }
];

export { researchIopSearch, researchIopFilter, researchIopExport };
