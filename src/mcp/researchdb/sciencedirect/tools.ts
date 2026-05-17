import { objectSchema, scalar } from "../../../utils/schema";
import { researchScienceDirectSearch, researchScienceDirectFilter, researchScienceDirectExport, ScienceDirectSearchArgs, ScienceDirectFilterArgs, ScienceDirectExportArgs } from "./flow";

const scienceDirectFormats = ["ris", "bibtex", "text", "refworks"];
const scienceDirectArticleTypes = ["REV", "FLA", "CH", "EN"];
const scienceDirectAccessTypes = ["openaccess"];

export const researchScienceDirectSearchInput = objectSchema<ScienceDirectSearchArgs>({
  query: scalar.string("ScienceDirect #qs boolean query text"),
  date: scalar.string("ScienceDirect #date year or year range such as 2021-2024"),
  pub: scalar.string("ScienceDirect #pub journal or book title"),
  authors: scalar.string("ScienceDirect #authors value"),
  affiliations: scalar.string("ScienceDirect #affiliations value"),
  tak: scalar.string("ScienceDirect #tak title/abstract/keywords value"),
  title: scalar.string("ScienceDirect #title value"),
  doc_id: scalar.string("ScienceDirect #docId ISSN/ISBN value"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-sciencedirect" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9243 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchScienceDirectFilterInput = objectSchema<ScienceDirectFilterArgs>({
  query: scalar.string("ScienceDirect #qs boolean query text"),
  date: scalar.string("ScienceDirect #date year or year range such as 2021-2024"),
  pub: scalar.string("ScienceDirect #pub journal or book title"),
  authors: scalar.string("ScienceDirect #authors value"),
  affiliations: scalar.string("ScienceDirect #affiliations value"),
  tak: scalar.string("ScienceDirect #tak title/abstract/keywords value"),
  title: scalar.string("ScienceDirect #title value"),
  doc_id: scalar.string("ScienceDirect #docId ISSN/ISBN value"),
  article_type: scalar.enum(scienceDirectArticleTypes, "ScienceDirect articleTypes facet code, e.g. REV or FLA"),
  year: scalar.number("ScienceDirect years facet value, e.g. 2024"),
  access_type: scalar.enum(scienceDirectAccessTypes, "ScienceDirect accessTypes facet code, e.g. openaccess"),
  facet_input_id: scalar.string("Exact ScienceDirect facet input id such as articleTypes-REV, years-2024, or accessTypes-openaccess"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-sciencedirect" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9243 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchScienceDirectExportInput = objectSchema<ScienceDirectExportArgs>({
  query: scalar.string("ScienceDirect #qs boolean query text"),
  date: scalar.string("ScienceDirect #date year or year range such as 2021-2024"),
  pub: scalar.string("ScienceDirect #pub journal or book title"),
  authors: scalar.string("ScienceDirect #authors value"),
  affiliations: scalar.string("ScienceDirect #affiliations value"),
  tak: scalar.string("ScienceDirect #tak title/abstract/keywords value"),
  title: scalar.string("ScienceDirect #title value"),
  doc_id: scalar.string("ScienceDirect #docId ISSN/ISBN value"),
  article_type: scalar.enum(scienceDirectArticleTypes, "ScienceDirect articleTypes facet code, e.g. REV or FLA"),
  year: scalar.number("ScienceDirect years facet value, e.g. 2024"),
  access_type: scalar.enum(scienceDirectAccessTypes, "ScienceDirect accessTypes facet code, e.g. openaccess"),
  facet_input_id: scalar.string("Exact ScienceDirect facet input id such as articleTypes-REV, years-2024, or accessTypes-openaccess"),
  format: { ...scalar.enum(scienceDirectFormats, "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-sciencedirect" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9243 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const sciencedirectResearchTools = [
  {
    name: "research_sciencedirect_search",
    description: "Search Elsevier ScienceDirect using the verified advanced-search recipe (#search-advanced-form / #qs / #date).",
    schema: researchScienceDirectSearchInput,
    handler: async (args: ScienceDirectSearchArgs) => researchScienceDirectSearch(args)
  },
  {
    name: "research_sciencedirect_filter",
    description: "Search and refine Elsevier ScienceDirect with verified styled-checkbox facets such as articleTypes-REV, years-2024, and accessTypes-openaccess.",
    schema: researchScienceDirectFilterInput,
    handler: async (args: ScienceDirectFilterArgs) => researchScienceDirectFilter(args)
  },
  {
    name: "research_sciencedirect_export",
    description: "Export real ScienceDirect selected-result citations through the verified CDP browser:artifact-click path without synthesized fallback.",
    schema: researchScienceDirectExportInput,
    handler: async (args: ScienceDirectExportArgs) => researchScienceDirectExport(args)
  }
];

export { researchScienceDirectSearch, researchScienceDirectFilter, researchScienceDirectExport };
