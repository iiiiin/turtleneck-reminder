# Release Process

## Versioning Rule
- Use SemVer.
- `PATCH` (`1.0.x`): bug fix or wording/docs-only changes.
- `MINOR` (`1.x.0`): backward-compatible feature/behavior changes.
- `MAJOR` (`x.0.0`): breaking changes.

This project changed user behavior from 3-level posture status to 2-level status, so use `1.1.0`.

## Recommended Flow
1. Prepare `CHANGELOG.md` `Unreleased`.
2. Run release preparation:
   - `python3 scripts/release.py <version>`
   - This updates `manifest.json`, promotes `Unreleased` to `## [<version>] - YYYY-MM-DD`, and builds zip.
3. Commit and push release commit:
   - `git add -A`
   - `git commit -m "release: <version>"`
   - `git push origin <branch>`
4. Create and publish tag/release:
   - `python3 scripts/release.py <version> --no-promote-unreleased --create-tag --push-tag --create-gh-release`

## Notes
- `release.py` blocks tag creation on a dirty working tree.
- When using `--create-gh-release` with `--create-tag`, `--push-tag` is required.
