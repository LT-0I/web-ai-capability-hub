# Research database integration

The package supports a generic `research-database` target type. It imports registry entries and discovers visible search, advanced search, filter/facet, result metadata, and official export/download controls.

## Import registry

```bash
node dist/src/cli.js site:registry:import reference-ip-literature-patent-research/references/site_registry.json --json
# or fixture copy:
node dist/src/cli.js site:registry:import fixtures/site_registry.sample.json --json
```

## Capture/update a database target

```bash
node dist/src/cli.js browser:launch --profile research-default --url https://www.cnki.net/ --json
node dist/src/cli.js capability:update --target cnki --kind research-database --profile research-default --json
```

## Stop conditions

Stop and record a blocker report when the site shows login required, CAPTCHA, bot check, access denial, terms confirmation, export limit warning, abnormal download warning, or mass-download notice.
