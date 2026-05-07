export function optionalRequire<T = any>(moduleName: string): T | undefined {
  try {
    return require(moduleName) as T;
  } catch {
    return undefined;
  }
}
