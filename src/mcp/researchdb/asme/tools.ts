import { objectSchema, scalar } from "../../../utils/schema";
import { researchAsmeSearch, researchAsmeFilter, researchAsmeExport, AsmeSearchArgs, AsmeFilterArgs, AsmeExportArgs } from "./flow";

export const researchAsmeSearchInput = objectSchema<AsmeSearchArgs>({
  query: scalar.string("ASME Digital Collection query text"),
  page_size: scalar.number("Optional ASME pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-asme" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9236 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchAsmeFilterInput = objectSchema<AsmeFilterArgs>({
  query: scalar.string("ASME Digital Collection query text"),
  format: scalar.string("Format facet, e.g. Journal Articles or Proceedings Papers"),
  publisher: scalar.string("Publisher/source facet, e.g. ASME"),
  subject: scalar.string("Subject facet, e.g. Heat Transfer and Electronic Packaging"),
  journal: scalar.string("Journal facet, e.g. ASME Journal of Heat and Mass Transfer"),
  topic: scalar.string("Topic facet, e.g. Heat transfer"),
  from_date: scalar.string("Optional date range start, mm/dd/yyyy"),
  to_date: scalar.string("Optional date range end, mm/dd/yyyy"),
  page_size: scalar.number("Optional ASME pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-asme" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9236 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchAsmeExportInput = objectSchema<AsmeExportArgs>({
  doi: scalar.string("ASME DOI to export"),
  format: { ...scalar.enum(["ris", "bibtex", "endnote", "refworks"], "Citation export format"), default: "bibtex" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-asme" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9236 },
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const asmeResearchTools = [
  {
    name: "research_asme_search",
    description: "Search ASME Digital Collection via the verified Silverchair search-results URL contract.",
    schema: researchAsmeSearchInput,
    handler: async (args: AsmeSearchArgs) => researchAsmeSearch(args)
  },
  {
    name: "research_asme_filter",
    description: "Apply ASME Silverchair URL refinements such as fl_ContentType=Journal Articles; no Atypon fallback is used.",
    schema: researchAsmeFilterInput,
    handler: async (args: AsmeFilterArgs) => researchAsmeFilter(args)
  },
  {
    name: "research_asme_export",
    description: "Export a real ASME per-record citation artifact through the /Citation/Download endpoint using CDP artifact-click.",
    schema: researchAsmeExportInput,
    handler: async (args: AsmeExportArgs) => researchAsmeExport(args)
  }
];

export { researchAsmeSearch, researchAsmeFilter, researchAsmeExport };
