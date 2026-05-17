import { objectSchema, scalar } from "../../../utils/schema";
import { researchDegruyterSearch, researchDegruyterFilter, researchDegruyterExport, DegruyterSearchArgs, DegruyterFilterArgs, DegruyterExportArgs } from "./flow";

export const researchDegruyterSearchInput = objectSchema<DegruyterSearchArgs>({
  title: scalar.string("De Gruyter advanced-search title field"),
  family_name: scalar.string("De Gruyter advanced-search author familyName field"),
  reference: scalar.string("De Gruyter advanced-search DOI/ISBN/ISSN reference field"),
  match: { ...scalar.enum(["all", "any"], "Boolean combination across populated advanced-search fields"), default: "all" },
  min_pub_year: scalar.number("Minimum publication year"),
  max_pub_year: scalar.number("Maximum publication year"),
  document_types: scalar.array(scalar.string("Document type facet value"), "Optional document type facet values"),
  sort_by: { ...scalar.enum(["relevance", "mostrecent", "leastrecent", "alphabetical", "reversealpha"], "Sort order"), default: "relevance" },
  document_visibility: { ...scalar.enum(["explicit", "open", "public", "available", "all"], "Document visibility filter"), default: "available" },
  page_size: scalar.number("Optional pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-degruyter" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const researchDegruyterFilterInput = objectSchema<DegruyterFilterArgs>({
  title: scalar.string("De Gruyter advanced-search title field"),
  family_name: scalar.string("De Gruyter advanced-search author familyName field"),
  reference: scalar.string("De Gruyter advanced-search DOI/ISBN/ISSN reference field"),
  match: { ...scalar.enum(["all", "any"], "Boolean combination across populated advanced-search fields"), default: "all" },
  min_pub_year: scalar.number("Minimum publication year"),
  max_pub_year: scalar.number("Maximum publication year"),
  document_type_facet: scalar.string("Document type facet value, e.g. article"),
  subject: scalar.string("Subject facet value"),
  publisher: scalar.string("Publisher facet value"),
  language: scalar.string("Language facet value"),
  access: scalar.string("Access/documentVisibility facet value"),
  pub_date: scalar.string("Date facet value"),
  sort_by: { ...scalar.enum(["relevance", "mostrecent", "leastrecent", "alphabetical", "reversealpha"], "Sort order"), default: "relevance" },
  document_visibility: { ...scalar.enum(["explicit", "open", "public", "available", "all"], "Document visibility filter"), default: "available" },
  page_size: scalar.number("Optional pageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-degruyter" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const researchDegruyterExportInput = objectSchema<DegruyterExportArgs>({
  doi: scalar.string("De Gruyter DOI to export"),
  format: { ...scalar.enum(["ris", "bibtex", "endnote"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-degruyter" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export { researchDegruyterSearch, researchDegruyterFilter, researchDegruyterExport };

export const degruyterResearchTools = [
  { name: "research_degruyter_search", description: "Search De Gruyter Brill via its replayable advanced-search GET URL.", schema: researchDegruyterSearchInput, handler: researchDegruyterSearch },
  { name: "research_degruyter_filter", description: "Refine De Gruyter Brill search results via GET facet query parameters.", schema: researchDegruyterFilterInput, handler: researchDegruyterFilter },
  { name: "research_degruyter_export", description: "Export a De Gruyter Brill document citation through the CDP artifact-click path.", schema: researchDegruyterExportInput, handler: researchDegruyterExport }
];
