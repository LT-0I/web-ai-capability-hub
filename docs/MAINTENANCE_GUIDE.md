# Maintenance Guide

Web AI services and paid research databases change frequently. This project is designed for maintenance rather than brittle one-time selectors.

## Capture a site map

After opening a page and logging in manually if required:

```bash
npm run snapshot:capture -- --site chatgpt --url https://chatgpt.com
```

Through MCP, call `browser_capture_site_map` with:

```json
{ "site": "chatgpt", "notes": "Model selector moved into top bar" }
```

Captured files are saved under `data/site-maps/<site>/` with a timestamp and `latest.json`.

## Diff site maps

```bash
npm run snapshot:diff -- --site chatgpt --previous data/site-maps/chatgpt/old.json --current data/site-maps/chatgpt/latest.json
```

The diff reports added/removed/changed elements and forms. Use it to identify renamed buttons, moved inputs, changed labels, and selectors that need updates.

## Update adapter notes

Adapters have notes under `configs/adapters/notes/<site>.md`. Add:

- date observed;
- page URL and account/workspace context;
- changed labels or menus;
- stable selector candidates;
- broken recipe steps;
- required user confirmation points.

MCP tool:

```json
{
  "site": "research-generic",
  "notes": "Export button renamed from Export results to Save citations. Selector #export still stable."
}
```

## Updating a recipe

1. Capture current page snapshot.
2. Identify the control by role/name/label before selector.
3. Update `configs/recipes/<id>.yaml`.
4. Run tests or create a fixture reproducing the change.
5. Update docs if command behavior changed.

## Diagnosing broken selectors

- Run `browser_read` and search for the expected role/name.
- Try semantic target `{ role, name }` before CSS.
- Check if the element moved into an iframe.
- Check if the user needs to finish login, MFA, CAPTCHA, or terms confirmation.
- Check whether a modal or cookie banner blocks the page.
- Capture a screenshot and site-map diff.

## Database export maintenance

Paid database export dialogs vary by provider. Recipes should avoid assuming one universal export path. Prefer:

1. read page;
2. identify result count;
3. identify selected records scope;
4. identify export/save/download button;
5. ask user to confirm scope and license compliance;
6. use visible export dialog controls;
7. save file through browser download handling;
8. record notes about format and limits.
