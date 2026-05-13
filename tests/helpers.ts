export class FakeLocator {
  constructor(private page: FakePage, private selector: string) {}
  async click(): Promise<void> { this.page.events.push(`click:${this.selector}`); }
  async hover(): Promise<void> { this.page.events.push(`hover:${this.selector}`); }
  async fill(text: string): Promise<void> { this.page.events.push(`fill:${this.selector}:${text}`); this.page.values[this.selector] = text; }
  async type(text: string): Promise<void> { this.page.events.push(`type:${this.selector}:${text}`); this.page.values[this.selector] = text; }
  async press(key: string): Promise<void> { this.page.events.push(`press:${this.selector}:${key}`); }
  async selectOption(option: string): Promise<void> { this.page.events.push(`select:${this.selector}:${option}`); this.page.values[this.selector] = option; }
  async setInputFiles(files: string[]): Promise<void> { this.page.events.push(`upload:${this.selector}:${files.join(',')}`); }
  async waitFor(): Promise<void> { this.page.events.push(`wait:${this.selector}`); }
}

export class FakePage {
  events: string[] = [];
  values: Record<string, string> = {};
  textContent: Record<string, string> = {};
  keyboard = { press: async (key: string) => { this.events.push(`keyboard:${key}`); } };
  mouse = { wheel: async (_x: number, y: number) => { this.events.push(`wheel:${y}`); } };
  constructor(public currentUrl = "about:blank") {}
  url(): string { return this.currentUrl; }
  async title(): Promise<string> { return "Fake Page"; }
  async goto(url: string): Promise<void> { this.currentUrl = url; this.events.push(`goto:${url}`); }
  locator(selector: string): FakeLocator { return new FakeLocator(this, selector); }
  getByRole(role: string, opts: { name?: RegExp }): FakeLocator { return new FakeLocator(this, `${role}:${opts?.name}`); }
  getByLabel(label: RegExp): FakeLocator { return new FakeLocator(this, `label:${label}`); }
  getByPlaceholder(text: RegExp): FakeLocator { return new FakeLocator(this, `placeholder:${text}`); }
  getByText(text: RegExp): FakeLocator { return new FakeLocator(this, `text:${text}`); }
  async waitForSelector(selector: string): Promise<void> { this.events.push(`waitForSelector:${selector}`); }
  async waitForLoadState(state: string): Promise<void> { this.events.push(`loadstate:${state}`); }
  async waitForTimeout(ms: number): Promise<void> { this.events.push(`timeout:${ms}`); }
  async evaluate(fn: any, arg?: any): Promise<any> {
    if (arg?.selector && typeof arg.selector === "string") {
      this.events.push(`selectText:${arg.selector}:${arg.start ?? ""}:${arg.end ?? ""}`);
      const text = this.textContent[arg.selector] ?? this.values[arg.selector] ?? "";
      const start = arg.start === undefined ? 0 : Math.max(0, Math.min(arg.start, text.length));
      const end = arg.end === undefined ? text.length : Math.max(start, Math.min(arg.end, text.length));
      return text.slice(start, end);
    }
    return typeof fn === "function" ? fn(arg) : undefined;
  }
}
