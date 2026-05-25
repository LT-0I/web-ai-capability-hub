export type LiteratureDriver = (input: {
  db_slug: string;
  doc_id: string;
  requested_url: string | null;
}) => Promise<{ path: string; sha256: string; resolved_url: string | null }>;

const registry = new Map<string, LiteratureDriver>();

export function registerLiteratureDriver(db_slug: string, driver: LiteratureDriver): void {
  registry.set(db_slug, driver);
}

export function getLiteratureDriver(db_slug: string): LiteratureDriver | null {
  return registry.get(db_slug) || null;
}
