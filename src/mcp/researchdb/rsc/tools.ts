import { objectSchema, scalar } from "../../../utils/schema";
import { researchRscSearch, researchRscFilter, researchRscExport, RscSearchArgs, RscFilterArgs, RscExportArgs } from "./flow";

export const researchRscSearchInput = objectSchema<RscSearchArgs>({
  query: scalar.string("RSC advanced search query text; Boolean operators must be uppercase when used"),
  area: { ...scalar.enum(["AllText", "Title", "DOI", "ExactText", "AtleastText", "WithoutText"], "RSC advanced-search field"), default: "AllText" },
  page_size: scalar.number("Optional RSC PageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-rsc" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchRscFilterInput = objectSchema<RscFilterArgs>({
  query: scalar.string("RSC advanced search query text; Boolean operators must be uppercase when used"),
  area: { ...scalar.enum(["AllText", "Title", "DOI", "ExactText", "AtleastText", "WithoutText"], "RSC advanced-search field"), default: "AllText" },
  access: { ...scalar.enum(["Open Access"], "RSC Article Access facet"), default: "Open Access" },
  page_size: scalar.number("Optional RSC PageSize"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-rsc" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchRscExportInput = objectSchema<RscExportArgs>({
  doi: scalar.string("RSC DOI to export"),
  article_url: scalar.string("Optional RSC articlelanding URL; if omitted, a DOI search resolves the article page"),
  format: { ...scalar.enum(["ris", "bibtex", "endnote", "medline", "procite", "referencemanager", "refworks"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-rsc" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export { researchRscSearch, researchRscFilter, researchRscExport };

export const rscResearchTools = [
  { name: "research_rsc_search", description: "Search Royal Society of Chemistry journals via the verified advanced-search results flow.", schema: researchRscSearchInput, handler: researchRscSearch },
  { name: "research_rsc_filter", description: "Search Royal Society of Chemistry journals and apply the verified Article Access = Open Access refine flow.", schema: researchRscFilterInput, handler: researchRscFilter },
  { name: "research_rsc_export", description: "Export an RSC article citation through the verified per-article CDP download path.", schema: researchRscExportInput, handler: researchRscExport }
];
