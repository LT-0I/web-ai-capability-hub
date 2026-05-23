import { objectSchema, scalar } from "../../../utils/schema";
import { researchWorldsciSearch, researchWorldsciFilter, researchWorldsciExport, WorldsciSearchArgs, WorldsciFilterArgs, WorldsciExportArgs } from "../../../handlers/researchdb/legacy/worldsci";

export const researchWorldsciSearchInput = objectSchema<WorldsciSearchArgs>({
  query: scalar.string("World Scientific query text"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "Abstract", "Affiliation"], "World Scientific search area"), default: "AllField" },
  page_size: scalar.number("Optional World Scientific pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-worldsci" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchWorldsciFilterInput = objectSchema<WorldsciFilterArgs>({
  query: scalar.string("World Scientific query text"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "Abstract", "Affiliation"], "World Scientific search area"), default: "AllField" },
  pub_type: scalar.string("PubType facet: journal, book, or specific"),
  content_item_type: scalar.string("ContentItemType facet such as research-article, chapter, or review-article"),
  ppub: scalar.string("Ppub date preset range"),
  after_year: scalar.number("AfterYear filter"),
  before_year: scalar.number("BeforeYear filter"),
  contrib_raw: scalar.string("ContribRaw author facet"),
  concept_id: scalar.string("ConceptID subject facet"),
  access: scalar.string("Access facet: full or open"),
  sort_by: scalar.string("sortBy parameter such as downloaded or cited"),
  page_size: scalar.number("Optional World Scientific pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-worldsci" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchWorldsciExportInput = objectSchema<WorldsciExportArgs>({
  doi: scalar.string("World Scientific DOI to export"),
  format: { ...scalar.enum(["ris", "bibtex"], "File citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-worldsci" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const worldsciResearchTools = [
  {
    name: "research_worldsci_search",
    description: "Search World Scientific via the verified Atypon/Literatum URL-driven recipe and CDP observer.",
    schema: researchWorldsciSearchInput,
    handler: async (args: WorldsciSearchArgs) => researchWorldsciSearch(args)
  },
  {
    name: "research_worldsci_filter",
    description: "Search and refine World Scientific with verified server-side URL facet parameters.",
    schema: researchWorldsciFilterInput,
    handler: async (args: WorldsciFilterArgs) => researchWorldsciFilter(args)
  },
  {
    name: "research_worldsci_export",
    description: "Export a real World Scientific citation artifact using the verified CDP artifact-click path.",
    schema: researchWorldsciExportInput,
    handler: async (args: WorldsciExportArgs) => researchWorldsciExport(args)
  }
];

export { researchWorldsciSearch, researchWorldsciFilter, researchWorldsciExport };
