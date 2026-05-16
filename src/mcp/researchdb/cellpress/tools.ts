import { objectSchema, scalar } from "../../../utils/schema";
import { researchCellpressSearch, researchCellpressFilter, researchCellpressExport, CellpressSearchArgs, CellpressFilterArgs, CellpressExportArgs } from "./flow";

export const researchCellpressSearchInput = objectSchema<CellpressSearchArgs>({
  query: scalar.string("Cell Press query text"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "Abstract", "AbstractTitleKeywordFilterField"], "Cell Press search area"), default: "AllField" },
  page_size: scalar.number("Optional Cell Press pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-cellpress" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9240 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchCellpressFilterInput = objectSchema<CellpressFilterArgs>({
  query: scalar.string("Cell Press query text"),
  area: { ...scalar.enum(["AllField", "Title", "Contrib", "Keyword", "Abstract", "AbstractTitleKeywordFilterField"], "Cell Press search area"), default: "AllField" },
  content_item_type: scalar.string("ContentItemType article-type facet code, e.g. fla, rev, sco"),
  after_year: scalar.number("AfterYear filter"),
  before_year: scalar.number("BeforeYear filter"),
  author: scalar.string("ContribRaw author facet"),
  journal: scalar.string("SeriesKey journal facet"),
  collection: scalar.string("Collection facet"),
  keyword: scalar.string("ConceptID keyword facet"),
  access: scalar.string("Access facet: full or open"),
  sort_by: scalar.string("sortBy parameter such as relevancy"),
  page_size: scalar.number("Optional Cell Press pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-cellpress" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9240 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchCellpressExportInput = objectSchema<CellpressExportArgs>({
  pii: scalar.string("Cell Press PII used by showCitFormats?pii=..."),
  format: { ...scalar.enum(["ris"], "Cell Press citation export format; RIS-only"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  filename: scalar.string("Optional output filename"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-cellpress" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9240 },
  tab_id: scalar.string("Optional managed tab id")
}, ["pii"]);

export const cellpressResearchTools = [
  {
    name: "research_cellpress_search",
    description: "Search Cell Press via the verified NUAA Atypon/Literatum doSearch recipe.",
    schema: researchCellpressSearchInput,
    handler: async (args: CellpressSearchArgs) => researchCellpressSearch(args)
  },
  {
    name: "research_cellpress_filter",
    description: "Search and refine Cell Press with verified Atypon query-parameter facet replay; reports MODE_UNCERTAIN if the count does not move.",
    schema: researchCellpressFilterInput,
    handler: async (args: CellpressFilterArgs) => researchCellpressFilter(args)
  },
  {
    name: "research_cellpress_export",
    description: "Export a real RIS-only Cell Press citation artifact using pii-keyed downloadCitationSecure through the managed page request context.",
    schema: researchCellpressExportInput,
    handler: async (args: CellpressExportArgs) => researchCellpressExport(args)
  }
];

export { researchCellpressSearch, researchCellpressFilter, researchCellpressExport };
