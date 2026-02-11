#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "manifest.json"
CHANGELOG_PATH = ROOT / "CHANGELOG.md"


@dataclass(frozen=True)
class ReleaseContext:
    version: str
    today: date
    root: Path


# Only include runtime files needed by the extension package.
INCLUDE_FILES = [
    Path("manifest.json"),
    Path("background.js"),
    Path("popup.html"),
    Path("popup.js"),
    Path("style.css"),
    Path("images/neck_no.png"),
    Path("images/neck_long.png"),
    Path("images/giraffe_no.png"),
    Path("images/giraffe_long.png"),
]
INCLUDE_DIRS = [
    Path("_locales"),
]


UNRELEASED_HEADING = "## [Unreleased]"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Bump manifest version, promote CHANGELOG Unreleased section, build zip, and optionally create a GitHub release."
        )
    )
    parser.add_argument("version", help="Release version (e.g. 1.0.2)")
    parser.add_argument(
        "--zip-name",
        default=None,
        help="Override zip filename (default: turtle-neck-reminder-<version>.zip)",
    )
    parser.add_argument(
        "--notes-source",
        choices=["changelog", "template"],
        default="changelog",
        help="Release notes source. 'changelog' reads ## [<version>] section from CHANGELOG.md.",
    )
    parser.add_argument(
        "--no-promote-unreleased",
        action="store_true",
        help="Do not move CHANGELOG Unreleased content into the target version heading.",
    )
    parser.add_argument(
        "--create-gh-release",
        action="store_true",
        help="Create GitHub release via 'gh release create'.",
    )
    parser.add_argument(
        "--create-tag",
        action="store_true",
        help="Create an annotated git tag for this release.",
    )
    parser.add_argument(
        "--push-tag",
        action="store_true",
        help="Push the created tag to origin. Requires --create-tag.",
    )
    parser.add_argument(
        "--tag",
        default=None,
        help="Tag name for GitHub release (default: v<version>).",
    )
    parser.add_argument(
        "--title",
        default=None,
        help="Title for GitHub release (default: v<version>).",
    )
    parser.add_argument(
        "--draft",
        action="store_true",
        help="Create GitHub release as draft.",
    )
    parser.add_argument(
        "--prerelease",
        action="store_true",
        help="Mark GitHub release as prerelease.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without writing files.",
    )
    return parser.parse_args()


def load_manifest(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"manifest.json not found at {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def save_manifest(path: Path, manifest: dict, dry_run: bool) -> None:
    if dry_run:
        return
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def bump_manifest_version(ctx: ReleaseContext, dry_run: bool) -> tuple[str, str]:
    manifest = load_manifest(MANIFEST_PATH)
    previous = str(manifest.get("version", ""))
    manifest["version"] = ctx.version
    save_manifest(MANIFEST_PATH, manifest, dry_run=dry_run)
    return previous, ctx.version


def default_release_notes_template(ctx: ReleaseContext) -> str:
    return (
        f"## [{ctx.version}] - {ctx.today.isoformat()}\n"
        "### Added\n"
        "- 변경사항을 CHANGELOG.md의 [Unreleased] 섹션에 먼저 작성하세요.\n"
    )


def _find_version_heading(text: str, version: str) -> re.Match[str] | None:
    return re.search(rf"^## \[{re.escape(version)}\][^\n]*$", text, re.MULTILINE)


def _find_next_version_heading(text: str, start_pos: int) -> re.Match[str] | None:
    return re.search(r"^## \[[^\n]+\][^\n]*$", text[start_pos:], re.MULTILINE)


def extract_changelog_notes(version: str) -> str | None:
    if not CHANGELOG_PATH.exists():
        return None

    text = CHANGELOG_PATH.read_text(encoding="utf-8")
    match = _find_version_heading(text, version)
    if not match:
        return None

    start = match.start()
    next_match = _find_next_version_heading(text, match.end())
    if next_match:
        end = match.end() + next_match.start()
    else:
        end = len(text)

    section = text[start:end].strip()
    if not section:
        return None
    return section + "\n"


def _split_unreleased_section(text: str) -> tuple[int, int, str] | None:
    unreleased_match = re.search(r"^## \[Unreleased\]\s*$", text, re.MULTILINE)
    if not unreleased_match:
        return None

    section_start = unreleased_match.end()
    next_heading_match = _find_next_version_heading(text, section_start)
    if next_heading_match:
        section_end = section_start + next_heading_match.start()
    else:
        section_end = len(text)

    body = text[section_start:section_end]
    return unreleased_match.start(), section_end, body


def promote_unreleased_to_version(ctx: ReleaseContext, dry_run: bool) -> str:
    if not CHANGELOG_PATH.exists():
        return "missing-changelog"

    text = CHANGELOG_PATH.read_text(encoding="utf-8")

    if _find_version_heading(text, ctx.version):
        return "version-already-exists"

    split = _split_unreleased_section(text)
    if not split:
        return "missing-unreleased"

    unreleased_start, unreleased_end, unreleased_body = split
    if unreleased_body.strip() == "":
        return "empty-unreleased"

    version_heading = f"## [{ctx.version}] - {ctx.today.isoformat()}"
    new_block = f"{UNRELEASED_HEADING}\n\n{version_heading}{unreleased_body.rstrip()}\n\n"

    updated = text[:unreleased_start] + new_block + text[unreleased_end:]
    updated = re.sub(r"\n{3,}", "\n\n", updated)

    if not dry_run:
        CHANGELOG_PATH.write_text(updated, encoding="utf-8")
    return "promoted"


def resolve_release_notes(ctx: ReleaseContext, source: str) -> tuple[str, str]:
    if source == "template":
        return default_release_notes_template(ctx), "template"

    notes = extract_changelog_notes(ctx.version)
    if notes:
        return notes, "changelog"

    return default_release_notes_template(ctx), "template-fallback"


def iter_files(dirs: Iterable[Path]) -> Iterable[Path]:
    for rel_path in dirs:
        abs_path = ROOT / rel_path
        if not abs_path.exists():
            continue
        if abs_path.is_file():
            yield abs_path
            continue
        for child in abs_path.rglob("*"):
            if child.is_file():
                yield child


def unique_paths(paths: Iterable[Path]) -> list[Path]:
    seen: set[Path] = set()
    ordered: list[Path] = []
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        ordered.append(path)
    return ordered


def iter_package_files() -> list[Path]:
    required_files = [ROOT / rel_path for rel_path in INCLUDE_FILES]
    missing = [str(path.relative_to(ROOT)) for path in required_files if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"Required package files are missing: {', '.join(missing)}")
    return unique_paths([*required_files, *iter_files(INCLUDE_DIRS)])


def build_zip(ctx: ReleaseContext, zip_name: str, dry_run: bool) -> Path:
    zip_path = ROOT / zip_name
    files = iter_package_files()
    if dry_run:
        return zip_path

    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as zf:
        for file_path in files:
            arcname = file_path.relative_to(ROOT)
            zf.write(file_path, arcname)
    return zip_path


def create_github_release(
    *,
    tag: str,
    title: str,
    notes: str,
    draft: bool,
    prerelease: bool,
    dry_run: bool,
) -> None:
    cmd = ["gh", "release", "create", tag, "--title", title, "--notes", notes]
    if draft:
        cmd.append("--draft")
    if prerelease:
        cmd.append("--prerelease")

    if dry_run:
        print("[release] gh command:", " ".join(cmd[:6]) + " ...")
        return

    try:
        subprocess.run(cmd, check=True)
    except FileNotFoundError as exc:
        raise RuntimeError("GitHub CLI 'gh' is not installed or not in PATH.") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"GitHub release creation failed (exit code: {exc.returncode}).") from exc


def _run_git(args: list[str], dry_run: bool) -> None:
    cmd = ["git", *args]
    if dry_run:
        print("[release] git command:", " ".join(cmd))
        return
    try:
        subprocess.run(cmd, check=True)
    except FileNotFoundError as exc:
        raise RuntimeError("git is not installed or not in PATH.") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"git command failed: {' '.join(cmd)} (exit code: {exc.returncode})") from exc


def _tag_exists(tag: str) -> bool:
    result = subprocess.run(["git", "tag", "--list", tag], capture_output=True, text=True, check=True)
    return tag in result.stdout.split()


def _has_uncommitted_changes() -> bool:
    unstaged = subprocess.run(["git", "diff", "--quiet"], check=False)
    staged = subprocess.run(["git", "diff", "--cached", "--quiet"], check=False)
    return unstaged.returncode != 0 or staged.returncode != 0


def create_git_tag(*, tag: str, version: str, dry_run: bool) -> None:
    if not dry_run and _tag_exists(tag):
        raise RuntimeError(f"git tag already exists locally: {tag}")
    message = f"Release {version}"
    _run_git(["tag", "-a", tag, "-m", message], dry_run=dry_run)


def push_git_tag(*, tag: str, dry_run: bool) -> None:
    _run_git(["push", "origin", tag], dry_run=dry_run)


def main() -> int:
    args = parse_args()
    ctx = ReleaseContext(version=args.version, today=date.today(), root=ROOT)

    print(f"[release] root: {ROOT}")
    print(f"[release] target version: {ctx.version}")
    if args.dry_run:
        print("[release] dry-run enabled; no files will be written.")

    previous, current = bump_manifest_version(ctx, dry_run=args.dry_run)
    print(f"[release] manifest version: {previous or '(unset)'} -> {current}")

    if not args.no_promote_unreleased:
        promote_state = promote_unreleased_to_version(ctx, dry_run=args.dry_run)
        print(f"[release] changelog promote: {promote_state}")

    notes, notes_source = resolve_release_notes(ctx, source=args.notes_source)
    print(f"[release] notes source: {notes_source}")

    tag = args.tag or f"v{ctx.version}"
    title = args.title or tag

    if args.push_tag and not args.create_tag:
        raise RuntimeError("--push-tag requires --create-tag.")

    if args.create_tag and not args.dry_run and _has_uncommitted_changes():
        raise RuntimeError("Working tree is dirty. Commit changes before creating a tag.")

    if args.create_gh_release and args.create_tag and not args.push_tag:
        raise RuntimeError("--create-gh-release with --create-tag requires --push-tag.")

    if args.create_tag:
        create_git_tag(tag=tag, version=ctx.version, dry_run=args.dry_run)
        tag_status = "would be created" if args.dry_run else "created"
        print(f"[release] git tag: {tag} ({tag_status})")

        if args.push_tag:
            push_git_tag(tag=tag, dry_run=args.dry_run)
            push_status = "would be pushed" if args.dry_run else "pushed"
            print(f"[release] git tag push: {tag} ({push_status})")

    zip_name = args.zip_name or f"turtle-neck-reminder-{ctx.version}.zip"
    zip_path = build_zip(ctx, zip_name=zip_name, dry_run=args.dry_run)
    action = "would be built" if args.dry_run else "built"
    print(f"[release] zip: {zip_path.relative_to(ROOT)} ({action})")

    if args.create_gh_release:
        if not args.create_tag and not args.dry_run and not _tag_exists(tag):
            raise RuntimeError(f"Tag does not exist locally: {tag}. Create/push tag first.")
        create_github_release(
            tag=tag,
            title=title,
            notes=notes,
            draft=args.draft,
            prerelease=args.prerelease,
            dry_run=args.dry_run,
        )
        status = "would be created" if args.dry_run else "created"
        print(f"[release] github release: {tag} ({status})")

    print("[release] next steps: review, then git add/commit/tag/push.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
