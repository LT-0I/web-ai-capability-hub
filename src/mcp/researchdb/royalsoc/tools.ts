import { objectSchema, scalar } from "../../../utils/schema";
import { researchRoyalSocSearch, researchRoyalSocFilter, researchRoyalSocExport, RoyalSocSearchArgs, RoyalSocFilterArgs, RoyalSocExportArgs } from "./flow";

export const researchRoyalSocSearchInput = objectSchema<RoyalSocSearchArgs>({
  query: scalar.string("Royal Society advanced-search query text"),
  page: scalar.number("Optional result page"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-royalsoc" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9261 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchRoyalSocFilterInput = objectSchema<RoyalSocFilterArgs>({
  query: scalar.string("Royal Society advanced-search query text"),
  page: scalar.number("Optional result page"),
  journal: scalar.string('Journal facet, e.g. "Journal of The Royal Society Interface"'),
  article_type: scalar.string('Article Type facet, e.g. "Research article"'),
  subject_id: scalar.string("Subjects facet numeric id, e.g. 17 for artificial_intelligence"),
  issue_section: scalar.string('Issue Section facet, e.g. "Research articles"'),
  profile: { ...scalar.string("Managed browser profile"), default: "research-royalsoc" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9261 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchRoyalSocExportInput = objectSchema<RoyalSocExportArgs>({
  doi: scalar.string("Royal Society DOI to export; optional if resource_id is supplied"),
  resource_id: scalar.string("Royal Society Silverchair resourceId from a result/article URL"),
  format: { ...scalar.enum(["ris", "endnote", "bibtex", "refworks"], "Citation export format"), default: "ris" },
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-royalsoc" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9261 },
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const royalsocResearchTools = [
  {
    name: "research_royalsoc_search",
    description: "Search Royal Society Publishing through the verified Silverchair /search-results advanced URL and read hydrated result items via CDP observe-only evaluation.",
    schema: researchRoyalSocSearchInput,
    handler: async (args: RoyalSocSearchArgs) => researchRoyalSocSearch(args)
  },
  {
    name: "research_royalsoc_filter",
    description: "Apply Royal Society Publishing URL-param facets such as f_JournalDisplayName and confirm hydrated filtered items.",
    schema: researchRoyalSocFilterInput,
    handler: async (args: RoyalSocFilterArgs) => researchRoyalSocFilter(args)
  },
  {
    name: "research_royalsoc_export",
    description: "Export a real Royal Society Silverchair citation artifact via /Citation/Download using the managed browser session; no synthesis fallback.",
    schema: researchRoyalSocExportInput,
    handler: async (args: RoyalSocExportArgs) => researchRoyalSocExport(args)
  }
];

export { researchRoyalSocSearch, researchRoyalSocFilter, researchRoyalSocExport };
