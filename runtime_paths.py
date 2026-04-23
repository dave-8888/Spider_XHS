import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional


APP_NAME = "Spider_XHS"
PROJECT_ROOT = Path(__file__).resolve().parent


def _expand_path(value: str) -> Path:
    return Path(os.path.expandvars(os.path.expanduser(value))).resolve()


def _is_usable_node_binary(path: Path) -> bool:
    if not path.exists() or not os.access(path, os.X_OK):
        return False
    try:
        completed = subprocess.run(
            [str(path), "--version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return completed.returncode == 0


def _runtime_arch_names() -> list[str]:
    machine = platform.machine().lower()
    if machine in {"arm64", "aarch64"}:
        return ["arm64", "x64"]
    if machine in {"x86_64", "amd64"}:
        return ["x64", "arm64"]
    return [machine, "arm64", "x64"]


def _first_existing_directory(paths: list[Path]) -> Optional[Path]:
    for path in paths:
        if path.exists() and path.is_dir():
            return path.resolve()
    return None


def _candidate_node_binaries() -> list[Path]:
    candidates: list[Path] = []
    explicit = str(os.getenv("SPIDER_XHS_NODE_BIN") or "").strip()
    if explicit:
        candidates.append(_expand_path(explicit))

    runtime_roots = [
        RESOURCE_ROOT.parent / "node-runtime",
        PROJECT_ROOT / "build" / "node-runtime",
        PROJECT_ROOT / "node-runtime",
    ]
    for runtime_root in runtime_roots:
        for arch in _runtime_arch_names():
            candidates.append(runtime_root / arch / "bin" / "node")

    discovered = shutil.which("node")
    if discovered:
        candidates.append(Path(discovered).resolve())

    if sys.platform == "darwin":
        candidates.extend(
            [
                Path("/opt/homebrew/bin/node"),
                Path("/usr/local/bin/node"),
            ]
        )

    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate)
        if key not in seen:
            unique.append(candidate)
            seen.add(key)
    return unique


def _find_node_binary() -> Optional[Path]:
    for candidate in _candidate_node_binaries():
        if _is_usable_node_binary(candidate):
            return candidate.resolve()
    return None


def is_desktop_mode() -> bool:
    return str(os.getenv("SPIDER_XHS_DESKTOP") or "").strip() == "1"


def application_support_root() -> Path:
    if sys.platform == "darwin":
        return (Path.home() / "Library" / "Application Support" / APP_NAME).resolve()
    if os.name == "nt":
        appdata = os.getenv("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return (Path(appdata) / APP_NAME).resolve()
    xdg_data_home = os.getenv("XDG_DATA_HOME")
    if xdg_data_home:
        return (Path(xdg_data_home) / APP_NAME).resolve()
    return (Path.home() / ".local" / "share" / APP_NAME).resolve()


def _resolve_directory_from_env(name: str, default: Path) -> Path:
    raw = str(os.getenv(name) or "").strip()
    if not raw:
        return default.resolve()
    return _expand_path(raw)


RESOURCE_ROOT = _resolve_directory_from_env("SPIDER_XHS_RESOURCE_ROOT", PROJECT_ROOT)
WEB_ROOT = (RESOURCE_ROOT / "web").resolve()
STATIC_ROOT = (RESOURCE_ROOT / "static").resolve()
CONFIG_ROOT = (RESOURCE_ROOT / "config").resolve()

_default_data_root = application_support_root() / "data" if is_desktop_mode() else PROJECT_ROOT / "datas"
DATA_ROOT = _resolve_directory_from_env("SPIDER_XHS_DATA_ROOT", _default_data_root)
DEFAULT_CONFIG_PATH = (CONFIG_ROOT / "default_config.json").resolve()


def resolve_resource_path(*parts: str) -> Path:
    return RESOURCE_ROOT.joinpath(*parts).resolve()


def resolve_static_path(name: str) -> Path:
    return (STATIC_ROOT / name).resolve()


def apply_node_runtime_env() -> None:
    node_bin_path = _find_node_binary()
    node_path_candidates = [
        RESOURCE_ROOT.parent / "js-runtime" / "node_modules",
        PROJECT_ROOT / "build" / "js-runtime" / "node_modules",
        PROJECT_ROOT / "node_modules",
        RESOURCE_ROOT / "node_modules",
    ]
    explicit_node_path = str(os.getenv("SPIDER_XHS_NODE_PATH") or "").strip()
    if explicit_node_path:
        node_path_candidates.insert(0, _expand_path(explicit_node_path))
    node_path = _first_existing_directory(node_path_candidates)

    if node_bin_path:
        current_path = os.environ.get("PATH", "")
        path_entries = [entry for entry in current_path.split(os.pathsep) if entry]
        node_dir = str(node_bin_path.parent)
        if node_dir not in path_entries:
            os.environ["PATH"] = os.pathsep.join([node_dir, *path_entries]) if path_entries else node_dir
        os.environ["SPIDER_XHS_NODE_BIN"] = str(node_bin_path)
        os.environ["EXECJS_RUNTIME"] = "Node"

    if node_path:
        node_path_dir = str(node_path)
        current_node_path = os.environ.get("NODE_PATH", "")
        node_entries = [entry for entry in current_node_path.split(os.pathsep) if entry]
        if node_path_dir not in node_entries:
            os.environ["NODE_PATH"] = os.pathsep.join([node_path_dir, *node_entries]) if node_entries else node_path_dir
