export interface ManifestSource {
  path: string;
  raw: string;
}

export interface GeneratedToolSpec {
  fileRelPath: string;
  contents: string;
}

export function generateToolSpecs(_manifests: ManifestSource[]): GeneratedToolSpec[] {
  // P0: skeleton returns []. Real generator lands in P1.
  return [];
}
