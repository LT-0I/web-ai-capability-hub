export interface RegisteredPage {
  id: string;
  page?: any;
  url: string;
  title?: string;
  active: boolean;
  createdAt: string;
}

export class PageRegistry {
  private pages = new Map<string, RegisteredPage>();
  private activePageId?: string;
  private counter = 0;

  register(page: any): RegisteredPage {
    const existing = this.findByPage(page);
    if (existing) return existing;
    const id = `page-${++this.counter}`;
    const entry: RegisteredPage = {
      id,
      page,
      url: typeof page.url === "function" ? page.url() : "about:blank",
      active: false,
      createdAt: new Date().toISOString()
    };
    this.pages.set(id, entry);
    if (!this.activePageId) this.setActive(id);
    return entry;
  }

  unregister(pageOrId: any): void {
    const id = typeof pageOrId === "string" ? pageOrId : this.findByPage(pageOrId)?.id;
    if (!id) return;
    this.pages.delete(id);
    if (this.activePageId === id) {
      this.activePageId = undefined;
      const first = this.list()[0];
      if (first) this.setActive(first.id);
    }
  }

  findByPage(page: any): RegisteredPage | undefined {
    return Array.from(this.pages.values()).find((entry) => entry.page === page);
  }

  async refresh(): Promise<RegisteredPage[]> {
    for (const entry of this.pages.values()) {
      try {
        entry.url = typeof entry.page.url === "function" ? entry.page.url() : entry.url;
        entry.title = typeof entry.page.title === "function" ? await entry.page.title() : entry.title;
      } catch {
        // The page might have closed between registry updates.
      }
    }
    return this.list();
  }

  list(): RegisteredPage[] {
    return Array.from(this.pages.values()).map((entry) => ({
      id: entry.id,
      url: entry.url,
      title: entry.title,
      active: entry.id === this.activePageId,
      createdAt: entry.createdAt
    }));
  }

  setActive(id: string): RegisteredPage {
    const entry = this.pages.get(id);
    if (!entry) throw new Error(`Unknown page id: ${id}`);
    this.activePageId = id;
    return { id: entry.id, url: entry.url, title: entry.title, active: true, createdAt: entry.createdAt };
  }

  getActive(): any | undefined {
    if (!this.activePageId) return undefined;
    return this.pages.get(this.activePageId)?.page;
  }

  getActiveEntry(): RegisteredPage | undefined {
    if (!this.activePageId) return undefined;
    const entry = this.pages.get(this.activePageId);
    return entry ? { ...entry, active: true } : undefined;
  }
}
