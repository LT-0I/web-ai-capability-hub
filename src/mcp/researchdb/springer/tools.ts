import { objectSchema, scalar } from "../../../utils/schema";
import { researchSpringerSearch, researchSpringerFilter, researchSpringerExport, SpringerSearchArgs, SpringerFilterArgs, SpringerExportArgs } from "./flow";

export const researchSpringerSearchInput = objectSchema<SpringerSearchArgs>({
  query: scalar.string("SpringerLink boolean query text"),
  title: scalar.string("Optional title hint"),
  contributor: scalar.string("Optional author/editor hint"),
  journal: scalar.string("Optional journal hint"),
  date_from: scalar.number("Custom start year"),
  date_to: scalar.number("Custom end year"),
  date: { ...scalar.string("Date facet value"), default: "custom" },
  page: scalar.number("Optional result page"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-springer" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9247 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchSpringerFilterInput = objectSchema<SpringerFilterArgs>({
  query: scalar.string("SpringerLink boolean query text"),
  title: scalar.string("Optional title hint"),
  contributor: scalar.string("Optional author/editor hint"),
  journal: scalar.string("Optional journal hint"),
  date_from: scalar.number("Custom start year"),
  date_to: scalar.number("Custom end year"),
  date: { ...scalar.string("Date facet value"), default: "custom" },
  content_type: scalar.string('Content type facet, e.g. "Article"'),
  open_access: scalar.string("Publishing model/openAccess facet value"),
  language: scalar.string("Language facet value"),
  taxonomy: scalar.string("Subject taxonomy facet value"),
  discipline: scalar.string("Discipline facet value"),
  sub_discipline: scalar.string("Subdiscipline facet value"),
  sustainable_development_goal: scalar.string("Sustainable development goal facet value"),
  page: scalar.number("Optional result page"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-springer" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9247 },
  tab_id: scalar.string("Optional managed tab id")
}, ["query"]);

export const researchSpringerExportInput = objectSchema<SpringerExportArgs>({
  doi: scalar.string("Springer DOI for the verified per-article RIS export"),
  format: { ...scalar.enum(["ris", "csv"], "Export format; csv/bulk is blocked by personal-account login and returns HUMAN_HANDOFF_REQUIRED"), default: "ris" },
  bulk_export: scalar.boolean("Set true only to request the documented blocked bulk CSV path; returns HUMAN_HANDOFF_REQUIRED"),
  download_dir: scalar.string("Absolute or cwd-relative download directory"),
  profile: { ...scalar.string("Managed browser profile"), default: "nuaa-springer" },
  cdp_port: { ...scalar.number("Optional CDP port override"), default: 9247 },
  tab_id: scalar.string("Optional managed tab id")
}, []);

export const springerResearchTools = [
  {
    name: "research_springer_search",
    description: "Search SpringerLink through the verified /search GET contract and parse the hydrated result count/items.",
    schema: researchSpringerSearchInput,
    handler: async (args: SpringerSearchArgs) => researchSpringerSearch(args)
  },
  {
    name: "research_springer_filter",
    description: "Apply SpringerLink URL facet refinements such as content-type=Article; confirms hydrated results and applied filters.",
    schema: researchSpringerFilterInput,
    handler: async (args: SpringerFilterArgs) => researchSpringerFilter(args)
  },
  {
    name: "research_springer_export",
    description: "Export a real Springer per-article RIS citation via citation-needed.springer.com; bulk CSV surfaces HUMAN_HANDOFF_REQUIRED.",
    schema: researchSpringerExportInput,
    handler: async (args: SpringerExportArgs) => researchSpringerExport(args)
  }
];

export { researchSpringerSearch, researchSpringerFilter, researchSpringerExport };
