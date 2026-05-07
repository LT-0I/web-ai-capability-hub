import { BrowserAction } from "../shared/types";
import { riskyReason } from "../actions/confirmationPolicy";

export class SafetyPolicy {
  constructor(readonly requireApprovalForSend = process.env.WAH_REQUIRE_APPROVAL_FOR_SEND !== "false", readonly requireApprovalForDownload = process.env.WAH_REQUIRE_APPROVAL_FOR_DOWNLOAD !== "false") {}

  requiresApproval(action: BrowserAction, capability?: string): string | undefined {
    if (action.confirmed) return undefined;
    const reason = riskyReason(action);
    if (reason) return reason;
    const name = `${capability || ""} ${action.type} ${action.riskyReason || ""}`.toLowerCase();
    if (this.requireApprovalForSend && /(send|submit|publish|share)/.test(name)) return "Sending/submitting/publishing/sharing requires explicit approval.";
    if (this.requireApprovalForDownload && /(download|export|bulk)/.test(name)) return "Download/export requires explicit approval and access-policy compliance.";
    return undefined;
  }
}
