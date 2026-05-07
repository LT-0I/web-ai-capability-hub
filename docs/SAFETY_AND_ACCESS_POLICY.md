# Safety and access policy

Allowed behavior:

- User-authorized visible browser automation.
- User manually logs into web AI services.
- Reuse project-managed browser profiles.
- Use official site search/filter/export/download controls.
- Dry-run workflows and fixture tests.

Prohibited behavior:

- Bypassing logins, paywalls, CAPTCHAs, bot checks, rate limits, DRM, or export limits.
- Exporting cookies, tokens, passwords, credentials, or private browser profile data.
- Stealth, fingerprint spoofing, CAPTCHA solving, proxy evasion, or anti-detection logic.
- Purchases, subscriptions, publishing, sharing, deletion, account changes, mass downloads, or paid-content downloads without explicit manual approval.

Safety gates are enforced in `ActionExecutor`, `ConfirmationPolicy`, and `WorkflowCompiler`/`SafetyPolicy`. Risky actions produce approval requirements and policy events.
