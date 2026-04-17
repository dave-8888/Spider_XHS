import os
import sys
from pathlib import Path


APP_NAME = "Spider_XHS"
PROJECT_ROOT = Path(__file__).resolve().parent


def _expand_path(value: str) -> Path:
    return Path(os.path.expandvars(os.path.expanduser(value))).resolve()


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
    node_bin = str(os.getenv("SPIDER_XHS_NODE_BIN") or "").strip()
    node_path = str(os.getenv("SPIDER_XHS_NODE_PATH") or "").strip()

    if node_bin:
        node_bin_path = _expand_path(node_bin)
        current_path = os.environ.get("PATH", "")
        path_entries = [entry for entry in current_path.split(os.pathsep) if entry]
        node_dir = str(node_bin_path.parent)
        if node_dir not in path_entries:
            os.environ["PATH"] = os.pathsep.join([node_dir, *path_entries]) if path_entries else node_dir
        os.environ.setdefault("EXECJS_RUNTIME", "Node")

    if node_path:
        node_path_dir = str(_expand_path(node_path))
        current_node_path = os.environ.get("NODE_PATH", "")
        node_entries = [entry for entry in current_node_path.split(os.pathsep) if entry]
        if node_path_dir not in node_entries:
            os.environ["NODE_PATH"] = os.pathsep.join([node_path_dir, *node_entries]) if node_entries else node_path_dir

