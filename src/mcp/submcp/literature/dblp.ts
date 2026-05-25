import { ConsumerErrorCodes } from "../../../consumer/errorCodes";
import { registerLiteratureDriver } from "../../../runtime/literature/drivers";
import { LiteratureDownloadError, LiteratureDownloadPdfArgs, LiteratureDownloadPdfOutput, literatureErrorOutput } from "./arxiv";

export const DBLP_BIBLIOGRAPHIC_ONLY_MESSAGE = "dblp is bibliographic-only; use the resolved arXiv/DOI URL from research_dblp_get_metadata to call the appropriate publisher driver (e.g. webai_arxiv_download_pdf, webai_acm_download_pdf, ...)";

function wrongToolError(): LiteratureDownloadError {
  return new LiteratureDownloadError(ConsumerErrorCodes.INVALID_ARGS, DBLP_BIBLIOGRAPHIC_ONLY_MESSAGE, { db_slug: "dblp" });
}

export async function webAiDblpDownloadPdf(_args: Partial<LiteratureDownloadPdfArgs>): Promise<LiteratureDownloadPdfOutput> {
  return literatureErrorOutput(wrongToolError());
}

registerLiteratureDriver("dblp", async () => {
  throw wrongToolError();
});
