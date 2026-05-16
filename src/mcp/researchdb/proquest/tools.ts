import { objectSchema, scalar } from "../../../utils/schema";
import { researchProquestSearch, researchProquestFilter, researchProquestExport, ProquestSearchArgs, ProquestFilterArgs, ProquestExportArgs } from "./flow";

export const researchProquestSearchInput = objectSchema<ProquestSearchArgs>({
  query: scalar.string("ProQuest inline query text; noft(...) is accepted and bare text is wrapped as noft(<query>)"),
  page_size: scalar.number("Optional page size hint; ProQuest UI defaults to 50 results/page"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-proquest" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchProquestFilterInput = objectSchema<ProquestFilterArgs>({
  query: scalar.string("ProQuest inline query text; noft(...) is accepted and bare text is wrapped as noft(<query>)"),
  full_text: scalar.boolean("Apply ProQuest Full text inline refine checkbox"),
  peer_reviewed: scalar.boolean("Apply ProQuest Peer reviewed inline refine checkbox"),
  page_size: scalar.number("Optional page size hint; ProQuest UI defaults to 50 results/page"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-proquest" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchProquestExportInput = objectSchema<ProquestExportArgs>({
  query: scalar.string("ProQuest inline query text used to locate the records before exporting the first selected record"),
  full_text: scalar.boolean("Optionally apply ProQuest Full text inline refine before export"),
  peer_reviewed: scalar.boolean("Optionally apply ProQuest Peer reviewed inline refine before export"),
  format: { ...scalar.enum(["ris"], "Export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-proquest" },
  cdp_port: scalar.number("Optional CDP port override"),
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export { researchProquestSearch, researchProquestFilter, researchProquestExport };

export const proquestResearchTools = [
  { name: "research_proquest_search", description: "Search ProQuest via the verified advanced-search inline noft(...) UI flow.", schema: researchProquestSearchInput, handler: researchProquestSearch },
  { name: "research_proquest_filter", description: "Search ProQuest and apply verified inline Full text / Peer reviewed refine checkboxes with URL/count confirmation.", schema: researchProquestFilterInput, handler: researchProquestFilter },
  { name: "research_proquest_export", description: "Search ProQuest and export the first selected record as RIS via the verified CDP artifact-click path.", schema: researchProquestExportInput, handler: researchProquestExport }
];
