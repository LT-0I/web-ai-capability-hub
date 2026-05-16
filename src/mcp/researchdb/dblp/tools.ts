import { objectSchema, scalar } from "../../../utils/schema";
import { researchDblpSearch, researchDblpFilter, researchDblpExport, DblpSearchArgs, DblpFilterArgs, DblpExportArgs } from "./flow";

export const researchDblpSearchInput = objectSchema<DblpSearchArgs>({
  query: scalar.string("DBLP CompleteSearch query; space=AND, pipe=OR, word$=exact word; phrase/NOT disabled by DBLP"),
  mode: { ...scalar.enum(["combined", "author", "venue", "publ"], "DBLP search mode"), default: "combined" },
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-dblp" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9226 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchDblpFilterInput = objectSchema<DblpFilterArgs>({
  query: scalar.string("DBLP CompleteSearch base query"),
  mode: { ...scalar.enum(["combined", "author", "venue", "publ"], "DBLP search mode"), default: "combined" },
  refine_token: scalar.string('Raw DBLP facet token, e.g. "type:Journal_Articles:"'),
  type: scalar.string('DBLP type token without wrapper, e.g. "Journal_Articles"'),
  year: scalar.number("DBLP year facet value"),
  author_token: scalar.string("DBLP author facet token"),
  venue_token: scalar.string("DBLP venue/stream facet token"),
  access_token: scalar.string("DBLP access facet token"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-dblp" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9226 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchDblpExportInput = objectSchema<DblpExportArgs>({
  key: scalar.string('DBLP record key for per-entry BibTeX, e.g. "journals/access/AmpratwumEN26"'),
  query: scalar.string("DBLP query for bulk CompleteSearch API xml/json export"),
  format: { ...scalar.enum(["bibtex", "xml", "json"], "Export format; per-entry uses bibtex, bulk API uses xml/json"), default: "bibtex" },
  bulk: scalar.boolean("Use DBLP CompleteSearch bulk API instead of per-entry /rec/<key>.bib"),
  h: { ...scalar.number("Bulk API hit limit; DBLP UI documents first 1000 hits"), default: 1000 },
  filename: scalar.string("Optional output filename"),
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-dblp" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9226 },
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const dblpResearchTools = [
  {
    name: "research_dblp_search",
    description: "Search DBLP through the verified CompleteSearch GET URL and parse hydrated result count/items.",
    schema: researchDblpSearchInput,
    handler: async (args: DblpSearchArgs) => researchDblpSearch(args)
  },
  {
    name: "research_dblp_filter",
    description: "Apply DBLP URL-replayable facet tokens such as type:Journal_Articles: and confirm hydrated result count/items.",
    schema: researchDblpFilterInput,
    handler: async (args: DblpFilterArgs) => researchDblpFilter(args)
  },
  {
    name: "research_dblp_export",
    description: "Export a real DBLP per-record BibTeX file or clean bulk xml/json API file via verified official DBLP URLs; no synthesis or fallback.",
    schema: researchDblpExportInput,
    handler: async (args: DblpExportArgs) => researchDblpExport(args)
  }
];

export { researchDblpSearch, researchDblpFilter, researchDblpExport };
