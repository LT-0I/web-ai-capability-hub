import { objectSchema, scalar } from "../../../utils/schema";
import { researchIeeeSearch, researchIeeeFilter, researchIeeeExport, IeeeSearchArgs, IeeeFilterArgs, IeeeExportArgs } from "./flow";

const ieeeFields = ["All Metadata", "Full Text & Metadata", "Full Text Only", "Document Title", "Authors", "Publication Title", "Abstract", "Index Terms", "Accession Number", "Article Number", "Article Page Number"];
const ieeeContentTypes = ["Conferences", "Journals", "Early Access Articles", "Magazines", "Books"];

export const researchIeeeSearchInput = objectSchema<IeeeSearchArgs>({
  query: scalar.string("IEEE Xplore query text"),
  field: { ...scalar.enum(ieeeFields, "IEEE Xplore search field"), default: "All Metadata" },
  page_size: scalar.number("Optional rowsPerPage"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-research" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9226 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchIeeeFilterInput = objectSchema<IeeeFilterArgs>({
  query: scalar.string("IEEE Xplore query text"),
  field: { ...scalar.enum(ieeeFields, "IEEE Xplore search field"), default: "All Metadata" },
  content_type: scalar.enum(ieeeContentTypes, "ContentType refinement"),
  page_size: scalar.number("Optional rowsPerPage"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-research" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9226 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchIeeeExportInput = objectSchema<IeeeExportArgs>({
  query: scalar.string("IEEE Xplore query text for the result set to export"),
  field: { ...scalar.enum(ieeeFields, "IEEE Xplore search field"), default: "All Metadata" },
  content_type: scalar.enum(ieeeContentTypes, "ContentType refinement"),
  format: { ...scalar.enum(["ris", "bibtex", "csv"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-research" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9226 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export { researchIeeeSearch, researchIeeeFilter, researchIeeeExport };

export const ieeeResearchTools = [
  { name: "research_ieee_search", description: "Search IEEE Xplore using the verified boolean query URL contract.", schema: researchIeeeSearchInput, handler: researchIeeeSearch },
  { name: "research_ieee_filter", description: "Apply IEEE Xplore URL refinements such as ContentType:Journals.", schema: researchIeeeFilterInput, handler: researchIeeeFilter },
  { name: "research_ieee_export", description: "Attempt IEEE Xplore export; currently surfaces the verified HUMAN_HANDOFF_REQUIRED modal blocker instead of synthesizing files.", schema: researchIeeeExportInput, handler: researchIeeeExport }
];
