import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { registerLiteratureDriver } from "../../../runtime/literature/drivers";
import { LiteratureDownloadError, LiteratureDownloadPdfArgs, LiteratureDownloadPdfOutput, literatureErrorOutput } from "./arxiv";

export const WOS_BIBLIOGRAPHIC_ONLY_MESSAGE = "wos is bibliographic/metadata-only; use the resolved DOI URL from research_wos_get_metadata to call the appropriate publisher driver (e.g. webai_acm_download_pdf, webai_wiley_download_pdf, ...)";

function wrongToolError(): LiteratureDownloadError {
  return new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, WOS_BIBLIOGRAPHIC_ONLY_MESSAGE, { db_slug: "wos" });
}

export async function webAiWosDownloadPdf(_args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return literatureErrorOutput(wrongToolError());
}

registerLiteratureDriver("wos", async () => {
  throw wrongToolError();
});
