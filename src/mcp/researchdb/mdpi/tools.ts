import { objectSchema, scalar } from "../../../utils/schema";
import { researchMdpiSearch, researchMdpiFilter, researchMdpiExport, MdpiSearchArgs, MdpiFilterArgs, MdpiExportArgs } from "./flow";

export const researchMdpiSearchInput = objectSchema<MdpiSearchArgs>({
  query: scalar.string("MDPI title/keyword query text"),
  journal: scalar.string("MDPI journal key, e.g. drones"),
  article_type: scalar.string("MDPI article type key, e.g. research-article"),
  year_from: scalar.number("Start publication year"),
  year_to: scalar.number("End publication year"),
  view: { ...scalar.enum(["default", "abstract", "compact"], "MDPI results view"), default: "default" },
  sort: scalar.string("Optional MDPI sort key"),
  page_count: scalar.number("Optional MDPI page_count value"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-mdpi" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchMdpiFilterInput = objectSchema<MdpiFilterArgs>({
  query: scalar.string("MDPI title/keyword query text"),
  journal: scalar.string("MDPI journal facet key, e.g. drones"),
  article_type: scalar.string("MDPI article type facet key, e.g. research-article"),
  year_from: scalar.number("Start publication year facet"),
  year_to: scalar.number("End publication year facet"),
  view: { ...scalar.enum(["default", "abstract", "compact"], "MDPI results view"), default: "default" },
  sort: scalar.string("Optional MDPI sort key"),
  page_count: scalar.number("Optional MDPI page_count value"),
  country: scalar.string("Optional MDPI countries facet query value"),
  subject: scalar.string("Optional MDPI subjects facet query value"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-mdpi" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchMdpiExportInput = objectSchema<MdpiExportArgs>({
  article_url: scalar.string("MDPI article URL, e.g. https://www.mdpi.com/2504-446X/8/10/548"),
  article_path: scalar.string("MDPI article path, e.g. /2504-446X/8/10/548"),
  doi: scalar.string("Optional expected DOI for artifact validation"),
  format: { ...scalar.enum(["bibtex", "endnote", "ris"], "Citation export format"), default: "bibtex" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-mdpi" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const mdpiResearchTools = [
  {
    name: "research_mdpi_search",
    description: "Search MDPI via the verified MDPI GET-query recipe with bounded hydration polling.",
    schema: researchMdpiSearchInput,
    handler: async (args: MdpiSearchArgs) => researchMdpiSearch(args)
  },
  {
    name: "research_mdpi_filter",
    description: "Search and refine MDPI using verified query-string facets such as journal, article_type, and publication years.",
    schema: researchMdpiFilterInput,
    handler: async (args: MdpiFilterArgs) => researchMdpiFilter(args)
  },
  {
    name: "research_mdpi_export",
    description: "Export a real MDPI article citation artifact through the verified Cite modal CDP artifact-click path.",
    schema: researchMdpiExportInput,
    handler: async (args: MdpiExportArgs) => researchMdpiExport(args)
  }
];

export { researchMdpiSearch, researchMdpiFilter, researchMdpiExport };
