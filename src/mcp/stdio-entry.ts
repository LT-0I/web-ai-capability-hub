#!/usr/bin/env node
import { startMcpServer } from "./server";

(async () => {
  try {
    await startMcpServer();
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(message);
    process.exit(1);
  }
})();
