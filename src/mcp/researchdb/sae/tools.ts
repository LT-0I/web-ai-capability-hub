import { objectSchema, scalar } from "../../../utils/schema";
import { researchSaeSearch, researchSaeFilter, researchSaeExport, SaeSearchArgs, SaeFilterArgs, SaeExportArgs } from "./flow";

export const researchSaeSearchInput = objectSchema<SaeSearchArgs>({
  query: scalar.string("SAE Mobilus query text"),
  page_size: scalar.number("Optional page size hint; SAE Mobilus currently uses the site default"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-sae" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9237 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchSaeFilterInput = objectSchema<SaeFilterArgs>({
  query: scalar.string("SAE Mobilus query text"),
  facet: { ...scalar.string("SAE Mobilus left-rail facet value, e.g. Technical Paper"), default: "Technical Paper" },
  page_size: scalar.number("Optional page size hint; SAE Mobilus currently uses the site default"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-sae" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9237 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchSaeExportInput = objectSchema<SaeExportArgs>({
  query: scalar.string("SAE Mobilus query text for the result set to export"),
  facet: scalar.string("Optional SAE Mobilus left-rail facet value before export"),
  format: { ...scalar.enum(["ris", "bibtex", "endnote", "metadata"], "Citation export format"), default: "bibtex" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-sae" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9237 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export { researchSaeSearch, researchSaeFilter, researchSaeExport };

export const saeResearchTools = [
  { name: "research_sae_search", description: "Search SAE Mobilus through the verified Angular SPA homepage-to-search flow.", schema: researchSaeSearchInput, handler: researchSaeSearch },
  { name: "research_sae_filter", description: "Apply a verified SAE Mobilus left-rail Material checkbox facet such as Technical Paper.", schema: researchSaeFilterInput, handler: researchSaeFilter },
  { name: "research_sae_export", description: "Export selected SAE Mobilus result citations using the verified CDP artifact-click Citation menu path.", schema: researchSaeExportInput, handler: researchSaeExport }
];
