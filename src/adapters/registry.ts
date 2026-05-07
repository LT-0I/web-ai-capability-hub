import { listAdapters } from "./adapterLoader";
import { listWebAiAdapters, getWebAiAdapter } from "./web-ai";

export class AdapterRegistry {
  listAll(): unknown[] { return [...listWebAiAdapters(), ...listAdapters()]; }
  listWebAi() { return listWebAiAdapters(); }
  getWebAi(id: string) { return getWebAiAdapter(id); }
}
