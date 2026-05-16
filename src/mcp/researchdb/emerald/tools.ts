import { objectSchema, scalar } from "../../../utils/schema";
import { researchEmeraldSearch, researchEmeraldFilter, researchEmeraldExport, EmeraldSearchArgs, EmeraldFilterArgs, EmeraldExportArgs } from "./flow";

export const researchEmeraldSearchInput = objectSchema<EmeraldSearchArgs>({
  query: scalar.string("Emerald Insight query text"),
  mode: { ...scalar.enum(["Any", "All", "Exact Phrase"], "Emerald advanced search match mode"), default: "Any" },
  page_size: scalar.number("Optional Emerald pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-emerald" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9246 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchEmeraldFilterInput = objectSchema<EmeraldFilterArgs>({
  query: scalar.string("Emerald Insight query text"),
  mode: { ...scalar.enum(["Any", "All", "Exact Phrase"], "Emerald advanced search match mode"), default: "Any" },
  content_type: scalar.string("Content type facet, e.g. Journal Articles"),
  subject: scalar.string("Subject facet value"),
  case_provider: scalar.string("Case provider facet value"),
  page_size: scalar.number("Optional Emerald pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-emerald" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9246 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchEmeraldExportInput = objectSchema<EmeraldExportArgs>({
  doi: scalar.string("Emerald DOI to export"),
  format: { ...scalar.enum(["ris", "bibtex", "endnote", "refworks"], "Citation export format"), default: "bibtex" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-emerald" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9246 },
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const emeraldResearchTools = [
  {
    name: "research_emerald_search",
    description: "Search Emerald Insight via the verified Silverchair advanced search-results URL contract.",
    schema: researchEmeraldSearchInput,
    handler: async (args: EmeraldSearchArgs) => researchEmeraldSearch(args)
  },
  {
    name: "research_emerald_filter",
    description: "Apply Emerald Silverchair URL refinements such as f_ContentType=Journal Articles; no fallback or synthesis is used.",
    schema: researchEmeraldFilterInput,
    handler: async (args: EmeraldFilterArgs) => researchEmeraldFilter(args)
  },
  {
    name: "research_emerald_export",
    description: "Export a real Emerald per-record citation artifact through /Citation/Download using the managed CDP page request path.",
    schema: researchEmeraldExportInput,
    handler: async (args: EmeraldExportArgs) => researchEmeraldExport(args)
  }
];

export { researchEmeraldSearch, researchEmeraldFilter, researchEmeraldExport };
