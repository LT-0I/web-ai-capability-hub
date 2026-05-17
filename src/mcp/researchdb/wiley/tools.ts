import { objectSchema, scalar } from "../../../utils/schema";
import { researchWileySearch, researchWileyFilter, researchWileyExport, WileySearchArgs, WileyFilterArgs, WileyExportArgs } from "./flow";

const wileyAreas = ["AllField", "Title", "ContribRaw", "Keyword", "AbstractText", "Affiliation", "Funding"];
const wileyFormats = ["txt", "ris", "endnote", "bibtex", "medlars", "refworks"];

export const researchWileySearchInput = objectSchema<WileySearchArgs>({
  query: scalar.string("Wiley Online Library query text for row 1"),
  area: { ...scalar.enum(wileyAreas, "Wiley search area for row 1"), default: "AllField" },
  query2: scalar.string("Optional Wiley row 2 query text; Wiley joins rows with AND"),
  area2: { ...scalar.enum(wileyAreas, "Wiley search area for row 2"), default: "AllField" },
  page_size: { ...scalar.number("Optional Wiley pageSize"), default: 10 },
  profile: { ...scalar.string("Managed browser profile"), default: "research-wiley" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9231 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchWileyFilterInput = objectSchema<WileyFilterArgs>({
  query: scalar.string("Wiley Online Library query text for row 1"),
  area: { ...scalar.enum(wileyAreas, "Wiley search area for row 1"), default: "AllField" },
  query2: scalar.string("Optional Wiley row 2 query text; Wiley joins rows with AND"),
  area2: { ...scalar.enum(wileyAreas, "Wiley search area for row 2"), default: "AllField" },
  after_year: scalar.number("AfterYear filter"),
  before_year: scalar.number("BeforeYear filter"),
  series_key: scalar.string("SeriesKey publication/source facet"),
  ppub: scalar.string("Ppub publication type/source facet"),
  concept_id: scalar.string("ConceptID subject facet"),
  access: scalar.boolean("Open Access Content refine"),
  page_size: { ...scalar.number("Optional Wiley pageSize"), default: 10 },
  profile: { ...scalar.string("Managed browser profile"), default: "research-wiley" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9231 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchWileyExportInput = objectSchema<WileyExportArgs>({
  doi: scalar.string("Wiley DOI to export"),
  format: { ...scalar.enum(wileyFormats, "Citation export format"), default: "ris" },
  include_abstract: scalar.boolean("Enable Wiley include-abstract/direct toggle when supported"),
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-wiley" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9231 },
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const wileyResearchTools = [
  {
    name: "research_wiley_search",
    description: "Search Wiley Online Library via the verified Wiley Literatum headless recipe.",
    schema: researchWileySearchInput,
    handler: async (args: WileySearchArgs) => researchWileySearch(args)
  },
  {
    name: "research_wiley_filter",
    description: "Search and refine Wiley Online Library with verified Literatum URL parameters such as dates, SeriesKey, ConceptID, and access=on.",
    schema: researchWileyFilterInput,
    handler: async (args: WileyFilterArgs) => researchWileyFilter(args)
  },
  {
    name: "research_wiley_export",
    description: "Export a real Wiley per-DOI citation artifact using the verified CDP artifact-click path and no synthesized fallback.",
    schema: researchWileyExportInput,
    handler: async (args: WileyExportArgs) => researchWileyExport(args)
  }
];

export { researchWileySearch, researchWileyFilter, researchWileyExport };
