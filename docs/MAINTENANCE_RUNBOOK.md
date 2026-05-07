# Maintenance runbook

## Refresh capabilities manually

```bash
node dist/src/cli.js browser:launch --profile gemini --url https://gemini.google.com/app --json
node dist/src/cli.js capability:update --target gemini --profile gemini --json
node dist/src/cli.js capability:query --target gemini --text "upload" --json
```

## Capture and diff site maps

```bash
node dist/src/cli.js snapshot:capture --site gemini --json
node dist/src/cli.js snapshot:diff --site gemini --previous data/site-maps/old.json --current data/site-maps/new.json --json
```

## Scheduler

`scheduled_jobs` are stored in the database. `scheduler:run` is a local foreground entry point. It intentionally does not create OS-level scheduled tasks.

## Updating selectors

Prefer role/name/semantic anchors. Add selector candidates only with evidence. Keep old selectors as fallbacks while confidence is uncertain. Update fixtures and tests when adding or changing adapters.
