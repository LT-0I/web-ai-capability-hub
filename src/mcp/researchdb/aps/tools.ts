import { objectSchema, scalar } from "../../../utils/schema";
import { researchApsSearch, researchApsFilter, researchApsExport, ApsSearchArgs, ApsFilterArgs, ApsExportArgs } from "./flow";

const apsFieldEnum = ["all", "author", "abstract", "abstitle", "title", "citedauthor", "affiliation", "collaboration", "keyword"];
const apsOperatorEnum = ["AND", "OR", "NOT"];

export const researchApsSearchInput = objectSchema<ApsSearchArgs>({
  query: scalar.string("APS query text for a single-clause deterministic deep link"),
  field: { ...scalar.enum(apsFieldEnum, "APS search field"), default: "all" },
  clauses: scalar.array(objectSchema({
    field: { ...scalar.enum(apsFieldEnum, "APS clause field"), default: "all" },
    value: scalar.string("APS clause text"),
    operator: { ...scalar.enum(apsOperatorEnum, "APS clause boolean operator"), default: "AND" }
  }, ["value"]).toJsonSchema(), "Optional explicit APS clauses array"),
  page_size: { ...scalar.number("APS per_page value"), default: 20 },
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-aps" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9244 },
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const researchApsFilterInput = objectSchema<ApsFilterArgs>({
  query: scalar.string("APS query text for a single-clause deterministic deep link"),
  field: { ...scalar.enum(apsFieldEnum, "APS search field"), default: "all" },
  clauses: scalar.array(objectSchema({
    field: { ...scalar.enum(apsFieldEnum, "APS clause field"), default: "all" },
    value: scalar.string("APS clause text"),
    operator: { ...scalar.enum(apsOperatorEnum, "APS clause boolean operator"), default: "AND" }
  }, ["value"]).toJsonSchema(), "Optional explicit APS clauses array"),
  date_range: { ...scalar.enum(["week", "month", "year", "Past Week", "Past Month", "Past Year"], "Verified APS date-range refine; Past Year emits &date=year"), default: "year" },
  page_size: { ...scalar.number("APS per_page value"), default: 20 },
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-aps" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9244 },
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const researchApsExportInput = objectSchema<ApsExportArgs>({
  doi: scalar.string("APS article DOI to export, e.g. 10.1103/hr5f-lvy7"),
  journal_code: scalar.string("APS URL journal code required when article_url is not supplied, e.g. prl"),
  article_url: scalar.string("Exact APS article abstract URL; overrides journal_code"),
  format: { ...scalar.enum(["ris", "bibtex"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-aps" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9244 },
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const apsResearchTools = [
  { name: "research_aps_search", description: "Search APS Journals with the verified deterministic React search deep link.", schema: researchApsSearchInput, handler: async (args: ApsSearchArgs) => researchApsSearch(args) },
  { name: "research_aps_filter", description: "Search and refine APS Journals with the verified date-range parameter emitted by the React app.", schema: researchApsFilterInput, handler: async (args: ApsFilterArgs) => researchApsFilter(args) },
  { name: "research_aps_export", description: "Export a real per-article APS RIS or BibTeX artifact through the verified CDP artifact-click path.", schema: researchApsExportInput, handler: async (args: ApsExportArgs) => researchApsExport(args) }
];

export { researchApsSearch, researchApsFilter, researchApsExport };
