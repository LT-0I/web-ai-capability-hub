const path = require("node:path");
import { CapabilityDatabase } from "../../capabilities/database";
import { SiteRegistryImporter } from "../../adapters/research/siteRegistryImporter";

export class ResearchDbImporter {
  constructor(private database = new CapabilityDatabase()) {}

  importInventorySeed(filePath: string, opts: { stemOnly?: boolean } = {}): { imported: number; sites: string[]; path: string } {
    const entries = new SiteRegistryImporter(this.database).parseFile(filePath)
      .filter((entry) => !opts.stemOnly || (entry.raw as any)?.classification?.science_engineering === true);
    const result = this.database.importSiteRegistry(entries);
    return { ...result, path: path.resolve(filePath) };
  }
}
