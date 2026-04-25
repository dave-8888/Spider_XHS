#!/usr/bin/env python3
from __future__ import annotations

import argparse
import filecmp
import re
import shutil
from pathlib import Path
from typing import Iterable, List, Optional


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = PROJECT_ROOT / "datas" / "markdown_datas"
MARKDOWN_SUFFIXES = {".md", ".markdown"}
INFO_LINK_RE = re.compile(r"\[info\.json\]\(", re.IGNORECASE)


class Migrator:
    def __init__(self, root: Path, dry_run: bool = False) -> None:
        self.root = root.resolve()
        self.dry_run = dry_run
        self.operations: List[str] = []

    def log(self, message: str) -> None:
        self.operations.append(message)

    def apply(self) -> None:
        if not self.root.exists():
            raise FileNotFoundError(f"Root does not exist: {self.root}")
        for note_dir in self.iter_legacy_note_dirs():
            self.migrate_legacy_note_dir(note_dir)
        for markdown_path in self.iter_flat_markdowns():
            self.ensure_flat_markdown(markdown_path)

    def iter_dirs(self) -> Iterable[Path]:
        stack = [self.root]
        while stack:
            current = stack.pop()
            try:
                children = sorted(current.iterdir(), key=lambda item: item.name)
            except OSError:
                continue
            for child in children:
                if not child.is_dir() or child.name.startswith("."):
                    continue
                if child.name.startswith("AI仿写_"):
                    continue
                yield child
                stack.append(child)

    def iter_legacy_note_dirs(self) -> Iterable[Path]:
        for directory in self.iter_dirs():
            if directory.name == "assert" or directory.parent.name == "assert":
                continue
            markdowns = self.markdown_files(directory)
            if not markdowns:
                continue
            if directory.joinpath("info.json").exists() or directory.joinpath("assert", "info.json").exists():
                yield directory

    def iter_flat_markdowns(self) -> Iterable[Path]:
        for markdown_path in sorted(self.root.rglob("*")):
            if not markdown_path.is_file() or markdown_path.suffix.lower() not in MARKDOWN_SUFFIXES:
                continue
            try:
                relative_parts = markdown_path.relative_to(self.root).parts
            except ValueError:
                continue
            if any(part.startswith("AI仿写_") for part in relative_parts):
                continue
            if markdown_path.parent.joinpath("assert", markdown_path.stem, "info.json").exists():
                yield markdown_path

    @staticmethod
    def markdown_files(directory: Path) -> List[Path]:
        return sorted(path for path in directory.iterdir() if path.is_file() and path.suffix.lower() in MARKDOWN_SUFFIXES)

    def preferred_markdown(self, note_dir: Path) -> Optional[Path]:
        exact = note_dir / f"{note_dir.name}.md"
        if exact.exists():
            return exact
        markdowns = self.markdown_files(note_dir)
        return markdowns[0] if markdowns else None

    def available_markdown_path(self, keyword_dir: Path, stem: str, source: Path) -> Path:
        candidate = keyword_dir / f"{stem}.md"
        if not candidate.exists() or candidate.resolve() == source.resolve():
            return candidate
        index = 2
        while True:
            candidate = keyword_dir / f"{stem}-{index}.md"
            if not candidate.exists():
                return candidate
            index += 1

    @staticmethod
    def markdown_target(path: str) -> str:
        return f"<{path.replace('>', '%3E')}>"

    def rewrite_asset_links(self, text: str, asset_stem: str) -> str:
        return re.sub(rf"assert/(?!{re.escape(asset_stem)}/)", f"assert/{asset_stem}/", text)

    def ensure_info_link(self, text: str, info_rel_path: str) -> str:
        if INFO_LINK_RE.search(text):
            return text
        lines = text.splitlines()
        link_line = f"> 信息文件：[info.json]({self.markdown_target(info_rel_path)})"
        if not lines:
            return f"{link_line}\n"
        insert_at = 1
        while insert_at < len(lines) and lines[insert_at].strip() == "":
            insert_at += 1
        updated = lines[:1] + ["", link_line, ""] + lines[insert_at:]
        return "\n".join(updated).rstrip() + "\n"

    def updated_markdown(self, source_md: Path, asset_stem: str) -> str:
        text = source_md.read_text(encoding="utf-8", errors="replace")
        text = self.rewrite_asset_links(text, asset_stem)
        return self.ensure_info_link(text, f"assert/{asset_stem}/info.json")

    def move_path(self, source: Path, target: Path) -> None:
        if not source.exists():
            return
        if target.exists():
            if source.is_file() and target.is_file() and filecmp.cmp(source, target, shallow=False):
                self.log(f"remove duplicate {source.relative_to(self.root)}")
                if not self.dry_run:
                    source.unlink()
                return
            self.log(f"skip existing target {target.relative_to(self.root)}")
            return
        self.log(f"move {source.relative_to(self.root)} -> {target.relative_to(self.root)}")
        if not self.dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(target))

    def write_text_if_changed(self, path: Path, text: str) -> None:
        existing = path.read_text(encoding="utf-8", errors="replace") if path.exists() else None
        if existing == text:
            return
        self.log(f"write {path.relative_to(self.root)}")
        if not self.dry_run:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")

    def remove_empty_dir(self, directory: Path) -> None:
        if not directory.exists() or not directory.is_dir():
            return
        try:
            next(directory.iterdir())
            return
        except StopIteration:
            pass
        self.log(f"remove empty dir {directory.relative_to(self.root)}")
        if not self.dry_run:
            directory.rmdir()

    def migrate_legacy_note_dir(self, note_dir: Path) -> None:
        source_md = self.preferred_markdown(note_dir)
        if not source_md:
            return
        keyword_dir = note_dir.parent
        target_md = self.available_markdown_path(keyword_dir, note_dir.name, source_md)
        asset_stem = target_md.stem
        asset_dir = keyword_dir / "assert" / asset_stem
        updated_md = self.updated_markdown(source_md, asset_stem)

        info_path = note_dir / "info.json"
        if info_path.exists():
            self.move_path(info_path, asset_dir / "info.json")

        old_assert_dir = note_dir / "assert"
        if old_assert_dir.exists():
            for child in sorted(old_assert_dir.iterdir(), key=lambda item: item.name):
                self.move_path(child, asset_dir / child.name)

        self.write_text_if_changed(target_md, updated_md)
        if target_md.resolve() != source_md.resolve():
            self.log(f"remove old markdown {source_md.relative_to(self.root)}")
            if not self.dry_run and source_md.exists():
                source_md.unlink()

        self.remove_empty_dir(old_assert_dir)
        self.remove_empty_dir(note_dir)

    def ensure_flat_markdown(self, markdown_path: Path) -> None:
        asset_stem = markdown_path.stem
        updated = self.updated_markdown(markdown_path, asset_stem)
        self.write_text_if_changed(markdown_path, updated)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate crawled Markdown output to the flat assert layout.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="markdown_datas root to migrate")
    parser.add_argument("--dry-run", action="store_true", help="show planned changes without writing")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root)
    if not root.is_absolute():
        root = PROJECT_ROOT / root
    migrator = Migrator(root, dry_run=args.dry_run)
    migrator.apply()
    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(f"{mode}: {len(migrator.operations)} operation(s)")
    for operation in migrator.operations:
        print(f"- {operation}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
