import { objectSchema, scalar } from "../../../utils/schema";
import { researchIncopatSearch, researchIncopatFilter, researchIncopatExport, IncopatSearchArgs, IncopatFilterArgs, IncopatExportArgs } from "./flow";

export const researchIncopatSearchInput = objectSchema<IncopatSearchArgs>({
  query: scalar.string("IncoPat simple-search text; the UI normalizes bare text to ALL=(...)"),
  page_size: scalar.number("Optional page size hint; IncoPat UI defaults to 20 patent rows/page"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-incopat" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9239 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchIncopatFilterInput = objectSchema<IncopatFilterArgs>({
  query: scalar.string("IncoPat simple-search text used before applying the facet refine"),
  country: { ...scalar.enum(["CN", "US", "KR", "WO", "EP"], "Country facet code for #PNC_TYPE_<CC> singleFilter span"), default: "CN" },
  page_size: scalar.number("Optional page size hint; IncoPat UI defaults to 20 patent rows/page"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-incopat" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9239 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchIncopatExportInput = objectSchema<IncopatExportArgs>({
  query: scalar.string("IncoPat simple-search text used to locate records before downloading the first per-row PDF"),
  country: scalar.string("Optional country facet code to apply before export, e.g. CN"),
  format: { ...scalar.enum(["pdf"], "Export format"), default: "pdf" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  page_size: scalar.number("Optional page size hint; IncoPat UI defaults to 20 patent rows/page"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-incopat" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9239 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export { researchIncopatSearch, researchIncopatFilter, researchIncopatExport };

export const incopatResearchTools = [
  { name: "research_incopat_search", description: "Search IncoPat through the verified IP-user simple-search SPA flow with trusted-CDP login and #totalCount polling.", schema: researchIncopatSearchInput, handler: researchIncopatSearch },
  { name: "research_incopat_filter", description: "Search IncoPat and apply a verified country facet by trusted-clicking the inner singleFilter span with count-delta confirmation.", schema: researchIncopatFilterInput, handler: researchIncopatFilter },
  { name: "research_incopat_export", description: "Search IncoPat and download the first per-row patent PDF via the verified CDP artifact-click path.", schema: researchIncopatExportInput, handler: researchIncopatExport }
];
