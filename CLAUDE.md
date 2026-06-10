# CLAUDE.md

## Code style

All code changes must pass Prettier before being committed. Run the check with:

```bash
npm run format:check
```

To auto-fix formatting:

```bash
npm run format
```

CI enforces this on every PR (`main.yml` → "Check formatting" step), so any commit that fails `format:check` will block the build. Always run `npm run format` on new or modified files before committing.
