import { objectSchema, scalar } from "../../../utils/schema";
import { researchFrontiersSearch, researchFrontiersFilter, researchFrontiersExport, FrontiersSearchArgs, FrontiersFilterArgs, FrontiersExportArgs } from "../../../handlers/researchdb/legacy/frontiers";

export const researchFrontiersSearchInput = objectSchema<FrontiersSearchArgs>({
  query: scalar.string("Frontiers boolean/free-text query"),
  page_size: scalar.number("Optional maximum parsed items to return"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-frontiers" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9256 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchFrontiersFilterInput = objectSchema<FrontiersFilterArgs>({
  query: scalar.string("Frontiers boolean/free-text query"),
  group: scalar.enum(["domains", "journals", "sections", "type", "date", "partofresearchtopic", "sort"], "Frontiers facet group data-test-id suffix"),
  option_id: scalar.string("Frontiers facet option id suffix, e.g. 3 for Date→Past year or 2449 for Aerospace Engineering"),
  option_label: scalar.string("Optional label to verify on li.current, e.g. Past year"),
  page_size: scalar.number("Optional maximum parsed items to return"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-frontiers" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9256 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query", "group", "option_id"]);

export const researchFrontiersExportInput = objectSchema<FrontiersExportArgs>({
  doi: scalar.string("Frontiers DOI to export, e.g. 10.3389/frobt.2019.00042"),
  journal_slug: scalar.string("Canonical Frontiers journal slug, e.g. robotics-and-ai"),
  article_url: scalar.string("Canonical article URL; may be used instead of journal_slug to derive the slug"),
  format: { ...scalar.enum(["bibtex", "endnote", "reference"], "Citation export format; reference is RIS/Reference Manager"), default: "bibtex" },
  filename: scalar.string("Optional output filename"),
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "research-frontiers" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9256 },
  tab_id: scalar.string("Optional managed tab id")
}, ["doi"]);

export const frontiersResearchTools = [
  {
    name: "research_frontiers_search",
    description: "Search Frontiers articles through the verified URL-driven SPA query contract and bounded-poll the hydrated article count.",
    schema: researchFrontiersSearchInput,
    handler: async (args: FrontiersSearchArgs) => researchFrontiersSearch(args)
  },
  {
    name: "research_frontiers_filter",
    description: "Apply a verified Frontiers client-side facet by data-test-id and confirm li.current plus changed hydrated count.",
    schema: researchFrontiersFilterInput,
    handler: async (args: FrontiersFilterArgs) => researchFrontiersFilter(args)
  },
  {
    name: "research_frontiers_export",
    description: "Export a real Frontiers per-article citation from the public publisher citation endpoint; no synthesis or page-level click fallback.",
    schema: researchFrontiersExportInput,
    handler: async (args: FrontiersExportArgs) => researchFrontiersExport(args)
  }
];

export { researchFrontiersSearch, researchFrontiersFilter, researchFrontiersExport };
