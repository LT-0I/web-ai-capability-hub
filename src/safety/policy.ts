export const authorizedUsePolicy = {
  allowed: [
    "Operate visible browser sessions controlled by the user",
    "Pause for login, MFA, CAPTCHA, paywall, export-limit, or terms prompts",
    "Use site-provided download/export controls when the user is authorized",
    "Keep extracted data, logs, screenshots, and downloads local by default"
  ],
  prohibited: [
    "Bypass logins, paywalls, CAPTCHAs, DRM, bot defenses, rate limits, or license checks",
    "Steal, export, decrypt, or sync browser cookies or credentials from another browser profile",
    "Use stealth, anti-detection, fingerprint-spoofing, CAPTCHA-solving, or evasion logic",
    "Bulk-export paid content without explicit user authorization and subscription compliance",
    "Log passwords, cookies, tokens, or full sensitive account data"
  ]
};

export function policyNotice(): string {
  return `Authorized visible-browser automation only. Prohibited: ${authorizedUsePolicy.prohibited.join("; ")}.`;
}
