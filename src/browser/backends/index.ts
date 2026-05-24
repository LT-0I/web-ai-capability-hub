import { BrowserBackend, BrowserBackendKind } from "./types";
import { createManagedCdpBackend, ManagedCdpBackendOptions } from "./managedCdpBackend";
import { createExtensionAssistedCdpBackend, ExtensionAssistedCdpBackendOptions } from "./extensionAssistedCdpBackend";

export type BrowserBackendFactoryOptions = ManagedCdpBackendOptions | ExtensionAssistedCdpBackendOptions;
export type BrowserBackendFactory = (options?: any) => BrowserBackend;

const registry: Record<BrowserBackendKind, BrowserBackendFactory> = {
  "managed-cdp": createManagedCdpBackend,
  "extension-assisted-cdp": createExtensionAssistedCdpBackend
};

export function getBackend(kind: BrowserBackendKind, options: BrowserBackendFactoryOptions = {}): BrowserBackend {
  const factory = registry[kind];
  if (!factory) throw new Error(`Unknown browser backend kind: ${kind}`);
  return factory(options);
}

export function registerBackend(kind: BrowserBackendKind, factory: BrowserBackendFactory): void {
  registry[kind] = factory;
}

export { BrowserBackend, BrowserBackendKind } from "./types";
export * from "./types";
export * from "./managedCdpBackend";
export * from "./extensionAssistedCdpBackend";
