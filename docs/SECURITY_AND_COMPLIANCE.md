# Security and Compliance

## Authorized use only

This project is for browser automation that the user is authorized to perform. It must not be used to bypass logins, paywalls, license checks, CAPTCHAs, bot defenses, DRM, rate limits, institutional subscription rules, export limits, or access controls.

## Credential and cookie handling

The default browser profile is dedicated to this project:

```text
./data/browser-profile
```

The user logs in manually inside that visible profile. The project does not steal, decrypt, export, or import cookies or credentials from an existing browser profile.

Optional CDP mode is only for a browser explicitly started by the user with remote debugging. CDP exposes powerful browser control to local processes. Use it only on trusted machines.

## Confirmation gates

Risky actions require confirmation by default:

- sending prompts or messages to web AI services;
- uploading files;
- downloading or exporting data;
- submitting forms;
- deleting/removing records;
- changing account settings;
- publishing/sharing;
- payment/purchase actions;
- bulk exports;
- actions involving login, MFA, CAPTCHA, or terms prompts.

Set `confirmed: true` only after the user approves the exact action and scope.

## Research database compliance

Paid databases may restrict:

- automated querying;
- result export sizes;
- full-text downloads;
- citation manager exports;
- systematic crawling;
- sharing downloaded content.

This project only operates visible site controls. That does not automatically make a workflow compliant. The user must follow institutional and provider rules.

## Logging and redaction

`src/safety/redaction.ts` redacts common sensitive keys and bearer/cookie-like strings. Logs should not include passwords, cookies, access tokens, API keys, or full private research data. Keep logs local and avoid committing `data/`.

## Data locality

Snapshots, screenshots, downloads, and site maps are local by default. External AI agents connected through MCP may choose to send data elsewhere; configure those agents separately and avoid sending paid/private content without permission.

## Prohibited additions

Do not add:

- CAPTCHA solving;
- stealth plugins;
- fingerprint spoofing;
- proxy rotation for evasion;
- paywall bypass;
- DRM bypass;
- cookie theft/export/import;
- credential scraping;
- hidden background scraping of paid databases.
