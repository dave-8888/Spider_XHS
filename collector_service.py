import json
import base64
import mimetypes
import os
import random
import re
import shutil
import threading
import time
import uuid
from copy import deepcopy
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import requests
from loguru import logger

from apis.xhs_pc_apis import XHS_Apis
from runtime_paths import (
    DATA_ROOT,
    DEFAULT_CONFIG_PATH,
    PROJECT_ROOT,
    RESOURCE_ROOT,
    is_desktop_mode,
)
from xhs_utils.common_util import load_env
from xhs_utils.data_util import handle_note_info, norm_str

ROOT_DIR = PROJECT_ROOT
RELATIVE_STORAGE_ROOT = DATA_ROOT if is_desktop_mode() else ROOT_DIR
DEFAULT_MARKDOWN_ROOT = DATA_ROOT / "markdown_datas"
CONFIG_PATH = DATA_ROOT / "collector_config.json"
JOB_HISTORY_PATH = DATA_ROOT / "collector_jobs.json"
SCHEDULER_STATE_PATH = DATA_ROOT / "scheduler_state.json"
INTERNAL_DATA_FILES = {
    "collector_config.json",
    "collector_jobs.json",
    "scheduler_state.json",
    "login_browser_profile",
}
JOB_LOG_TYPES = {"crawl", "rewrite"}
REWRITE_LOG_MARKERS = (
    "仿写",
    "文本模型",
    "配图",
    "DashScope",
    "DASHSCOPE",
    "阿里百炼",
    "图片任务",
    "图片生成",
)
DEFAULT_REWRITE_REQUIREMENTS = "创业沙龙"
MAX_REWRITE_REQUIREMENTS_LENGTH = 2000

SORT_LABELS = {
    0: "综合",
    1: "最新",
    2: "最多点赞",
    3: "最多评论",
    4: "最多收藏",
}
CONTENT_TYPE_LABELS = {
    0: "全部",
    1: "视频",
    2: "图文",
}
PUBLISH_TIME_LABELS = {
    0: "不限",
    1: "一天内",
    2: "一周内",
    3: "半年内",
    4: "自定义天数",
}
NOTE_RANGE_LABELS = {
    0: "不限",
    1: "已看过",
    2: "未看过",
    3: "已关注",
}
POS_DISTANCE_LABELS = {
    0: "不限",
    1: "同城",
    2: "附近",
}
WEEKDAY_LABELS = {
    1: "周一",
    2: "周二",
    3: "周三",
    4: "周四",
    5: "周五",
    6: "周六",
    7: "周日",
}


def ensure_data_dirs() -> None:
    for path in [DATA_ROOT, DEFAULT_MARKDOWN_ROOT]:
        path.mkdir(parents=True, exist_ok=True)


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def batch_name() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def read_json(path: Path, fallback: Any) -> Any:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning(f"读取 JSON 失败 {path}: {exc}")
    return deepcopy(fallback)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(path)


def to_int(value: Any, default: int = 0, minimum: Optional[int] = None, maximum: Optional[int] = None) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    if minimum is not None:
        number = max(minimum, number)
    if maximum is not None:
        number = min(maximum, number)
    return number


def to_float(value: Any, default: float = 0.0, minimum: Optional[float] = None, maximum: Optional[float] = None) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    if minimum is not None:
        number = max(minimum, number)
    if maximum is not None:
        number = min(maximum, number)
    return number


def normalize_delay_range(minimum: Any, maximum: Any, default_min: float, default_max: float) -> Tuple[float, float]:
    delay_min = to_float(minimum, default_min, 0.0, 30.0)
    delay_max = to_float(maximum, default_max, 0.0, 30.0)
    if delay_max < delay_min:
        delay_max = delay_min
    return delay_min, delay_max


def parse_count(value: Any) -> int:
    if value is None:
        return 0
    text = str(value).strip().replace(",", "")
    if not text:
        return 0
    multiplier = 1
    if "万" in text or "w" in text.lower():
        multiplier = 10000
    elif "千" in text or "k" in text.lower():
        multiplier = 1000
    match = re.search(r"\d+(?:\.\d+)?", text)
    if not match:
        return 0
    return int(float(match.group(0)) * multiplier)


def safe_filename(value: Any, fallback: str = "untitled", max_len: int = 80) -> str:
    text = norm_str(str(value or "")).strip("._-")
    if not text:
        text = fallback
    return text[:max_len]


def available_child_path(parent: Path, preferred_name: str) -> Path:
    candidate = parent / preferred_name
    if not candidate.exists():
        return candidate

    index = 2
    while True:
        candidate = parent / f"{preferred_name}-{index}"
        if not candidate.exists():
            return candidate
        index += 1


def resolve_output_root(config: Optional[Dict[str, Any]] = None) -> Path:
    storage = config.get("storage", {}) if config else {}
    configured = str(storage.get("output_dir") or "").strip()
    if not configured:
        return DEFAULT_MARKDOWN_ROOT.resolve()
    expanded = os.path.expandvars(os.path.expanduser(configured))
    output_root = Path(expanded)
    if not output_root.is_absolute():
        output_root = RELATIVE_STORAGE_ROOT / output_root
    return output_root.resolve()


def relative_to_root(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def redact_cookie(cookie: str) -> str:
    if not cookie:
        return ""
    if len(cookie) <= 24:
        return "已配置"
    return f"{cookie[:18]}...{cookie[-8:]}"


def redact_secret(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) <= 12:
        return "已配置"
    return f"{text[:6]}...{text[-4:]}"


def normalize_rewrite_requirements(value: Any, max_len: int = MAX_REWRITE_REQUIREMENTS_LENGTH) -> str:
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text[:max_len].strip() or DEFAULT_REWRITE_REQUIREMENTS


def rewrite_requirements_label(value: Any, max_len: int = 48) -> str:
    text = normalize_rewrite_requirements(value)
    first_line = re.split(r"[\n。！？!?；;]", text, maxsplit=1)[0].strip()
    label = first_line or DEFAULT_REWRITE_REQUIREMENTS
    return label[:max_len].strip() or DEFAULT_REWRITE_REQUIREMENTS


def pick_extension(url: str, content_type: str, default_ext: str) -> str:
    content_type = (content_type or "").split(";")[0].lower()
    by_type = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
    }
    if content_type in by_type:
        return by_type[content_type]
    suffix = Path(url.split("?", 1)[0]).suffix.lower()
    if suffix in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov"]:
        return ".jpg" if suffix == ".jpeg" else suffix
    return default_ext


def download_url(url: str, target_without_ext: Path, default_ext: str) -> Tuple[Optional[str], Optional[str]]:
    if not url:
        return None, "URL 为空"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
        )
    }
    try:
        with requests.get(url, headers=headers, stream=True, timeout=30) as response:
            response.raise_for_status()
            ext = pick_extension(url, response.headers.get("content-type", ""), default_ext)
            target_path = target_without_ext.with_suffix(ext)
            tmp_path = target_path.with_suffix(target_path.suffix + ".tmp")
            with tmp_path.open("wb") as file:
                for chunk in response.iter_content(chunk_size=1024 * 512):
                    if chunk:
                        file.write(chunk)
            tmp_path.replace(target_path)
            return target_path.name, None
    except Exception as exc:
        return None, str(exc)


def render_markdown(note: Dict[str, Any], media_items: List[Dict[str, Any]]) -> str:
    title = note.get("title") or "无标题"
    lines = [
        f"# {title}",
        "",
        "## 正文",
        "",
        str(note.get("desc") or "无正文"),
        "",
        "## 媒体",
        "",
    ]

    if not media_items:
        lines.extend(["无本地媒体文件。", ""])
    for item in media_items:
        rel_path = item.get("relative_path")
        label = item.get("label", "媒体")
        media_type = item.get("type")
        source_url = item.get("source_url", "")
        error = item.get("error")
        if rel_path and media_type == "image":
            lines.extend([f"![{label}]({rel_path})", ""])
        elif rel_path and media_type == "video":
            poster = item.get("poster")
            poster_attr = f' poster="{poster}"' if poster else ""
            lines.extend([
                f'<video controls src="{rel_path}"{poster_attr} style="max-width: 100%;"></video>',
                "",
                f"[打开视频文件]({rel_path})",
                "",
            ])
        elif rel_path:
            lines.extend([f"[{label}]({rel_path})", ""])
        else:
            lines.extend([f"- {label} 下载失败：{error or '未知错误'}", f"  原始地址：{source_url}", ""])

    return "\n".join(lines)


def save_note_as_markdown(note: Dict[str, Any], keyword_dir: Path, output_root: Path) -> Dict[str, Any]:
    note_id = str(note.get("note_id") or uuid.uuid4().hex)
    title = safe_filename(note.get("title"), fallback="无标题", max_len=60)
    note_dir = available_child_path(keyword_dir, title)
    assert_dir = note_dir / "assert"
    note_dir.mkdir(parents=True, exist_ok=True)
    assert_dir.mkdir(parents=True, exist_ok=True)

    media_items: List[Dict[str, Any]] = []
    note_type = note.get("note_type")
    if note_type == "图集":
        for index, url in enumerate(note.get("image_list") or []):
            file_name, error = download_url(url, assert_dir / f"image_{index + 1}", ".jpg")
            media_items.append({
                "type": "image",
                "label": f"图片 {index + 1}",
                "relative_path": f"assert/{file_name}" if file_name else None,
                "source_url": url,
                "error": error,
            })
    elif note_type == "视频":
        poster_rel = None
        cover_url = note.get("video_cover")
        if cover_url:
            file_name, error = download_url(cover_url, assert_dir / "cover", ".jpg")
            poster_rel = f"assert/{file_name}" if file_name else None
            media_items.append({
                "type": "image",
                "label": "视频封面",
                "relative_path": poster_rel,
                "source_url": cover_url,
                "error": error,
            })
        video_url = note.get("video_addr")
        file_name, error = download_url(video_url, assert_dir / "video", ".mp4")
        media_items.append({
            "type": "video",
            "label": "视频",
            "relative_path": f"assert/{file_name}" if file_name else None,
            "poster": poster_rel,
            "source_url": video_url,
            "error": error,
        })

    info_path = note_dir / "info.json"
    info_path.write_text(json.dumps(note, ensure_ascii=False, indent=2), encoding="utf-8")

    md_path = note_dir / f"{note_dir.name}.md"
    md_path.write_text(render_markdown(note, media_items), encoding="utf-8")

    return {
        "note_id": note_id,
        "title": note.get("title") or "无标题",
        "note_type": note_type,
        "liked_count": note.get("liked_count"),
        "upload_time": note.get("upload_time"),
        "note_url": note.get("note_url"),
        "folder": relative_to_root(note_dir, output_root),
        "markdown": relative_to_root(md_path, output_root),
        "media_count": len([item for item in media_items if item.get("relative_path")]),
    }


def publish_api_filter(filters: Dict[str, Any]) -> int:
    publish_time = to_int(filters.get("publish_time"), 2, 0, 4)
    if publish_time in [0, 1, 2, 3]:
        return publish_time
    days = to_int(filters.get("publish_days"), 7, 0, 3650)
    if days <= 0:
        return 0
    if days <= 1:
        return 1
    if days <= 7:
        return 2
    if days <= 180:
        return 3
    return 0


def publish_days_filter(filters: Dict[str, Any]) -> int:
    publish_time = to_int(filters.get("publish_time"), 2, 0, 4)
    if publish_time == 0:
        return 0
    if publish_time == 1:
        return 1
    if publish_time == 2:
        return 7
    if publish_time == 3:
        return 180
    return to_int(filters.get("publish_days"), 7, 0, 3650)


def within_publish_days(note: Dict[str, Any], days: int) -> bool:
    if days <= 0:
        return True
    upload_time = note.get("upload_time")
    if not upload_time:
        return True
    try:
        note_dt = datetime.strptime(upload_time, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return True
    return note_dt >= datetime.now() - timedelta(days=days)


def content_type_matches(note: Dict[str, Any], content_type: int) -> bool:
    if content_type == 0:
        return True
    if content_type == 1:
        return note.get("note_type") == "视频"
    if content_type == 2:
        return note.get("note_type") == "图集"
    return True


def summarize_config(config: Dict[str, Any]) -> Dict[str, Any]:
    collect = config.get("collect", {})
    filters = config.get("filters", {})
    schedule = config.get("schedule", {})
    return {
        "keywords": config.get("keywords", []),
        "count": collect.get("count"),
        "like_top_n": collect.get("like_top_n"),
        "request_multiplier": collect.get("request_multiplier"),
        "search_delay_min_sec": collect.get("search_delay_min_sec"),
        "search_delay_max_sec": collect.get("search_delay_max_sec"),
        "detail_delay_min_sec": collect.get("detail_delay_min_sec"),
        "detail_delay_max_sec": collect.get("detail_delay_max_sec"),
        "sort_type": SORT_LABELS.get(to_int(filters.get("sort_type"), 2), "未知"),
        "content_type": CONTENT_TYPE_LABELS.get(to_int(filters.get("content_type"), 2), "未知"),
        "publish_time": PUBLISH_TIME_LABELS.get(to_int(filters.get("publish_time"), 2), "未知"),
        "publish_days": publish_days_filter(filters),
        "note_range": NOTE_RANGE_LABELS.get(to_int(filters.get("note_range"), 0), "未知"),
        "pos_distance": POS_DISTANCE_LABELS.get(to_int(filters.get("pos_distance"), 0), "未知"),
        "schedule_enabled": bool(schedule.get("enabled")),
        "rewrite_enabled": bool(config.get("rewrite", {}).get("enabled")),
        "rewrite_topic": rewrite_requirements_label(config.get("rewrite", {}).get("topic")),
        "output_root": str(resolve_output_root(config)),
    }


class ConfigStore:
    def __init__(self, config_path: Path = CONFIG_PATH):
        ensure_data_dirs()
        self.config_path = config_path
        self.lock = threading.RLock()
        self.default_config = read_json(DEFAULT_CONFIG_PATH, self._fallback_default())

    def _fallback_default(self) -> Dict[str, Any]:
        return {
            "login": {"cookies": ""},
            "keywords": ["男士穿搭"],
            "collect": {
                "count": 10,
                "like_top_n": 10,
                "request_multiplier": 3,
                "search_delay_min_sec": 2.0,
                "search_delay_max_sec": 4.0,
                "detail_delay_min_sec": 1.0,
                "detail_delay_max_sec": 3.0,
            },
            "filters": {
                "sort_type": 2,
                "content_type": 2,
                "publish_time": 2,
                "publish_days": 7,
                "note_range": 0,
                "pos_distance": 0,
            },
            "storage": {
                "output_dir": "",
            },
            "rewrite": {
                "enabled": False,
                "topic": DEFAULT_REWRITE_REQUIREMENTS,
                "api_key": "",
                "text_model": "qwen-plus",
                "image_model": "wan2.6-image",
                "region": "cn-beijing",
                "generate_image_prompts": True,
                "generate_images": False,
            },
            "schedule": {
                "enabled": False,
                "cycle": "daily",
                "daily_runs": 1,
                "run_times": ["09:00"],
                "weekdays": [1, 2, 3, 4, 5, 6, 7],
            },
        }

    def load(self) -> Dict[str, Any]:
        with self.lock:
            config = self._load_stored_unlocked()
            if not config.get("login", {}).get("cookies"):
                env_cookie = load_env()
                if env_cookie:
                    config.setdefault("login", {})["cookies"] = env_cookie
            return self._sanitize(config)

    def save(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self.lock:
            current = self._sanitize(self._load_stored_unlocked())
            incoming = deepcopy(payload)
            incoming_cookie = incoming.get("login", {}).get("cookies")
            if incoming_cookie is None or str(incoming_cookie).strip() == "":
                incoming.setdefault("login", {})["cookies"] = current.get("login", {}).get("cookies", "")
            incoming_rewrite = incoming.get("rewrite")
            if isinstance(incoming_rewrite, dict):
                incoming_api_key = incoming_rewrite.get("api_key")
                if incoming_api_key is None or str(incoming_api_key).strip() == "":
                    incoming_rewrite["api_key"] = current.get("rewrite", {}).get("api_key", "")
            merged = deep_merge(current, incoming)
            sanitized = self._sanitize(merged)
            write_json(self.config_path, sanitized)
            return sanitized

    def _load_stored_unlocked(self) -> Dict[str, Any]:
        stored = read_json(self.config_path, {})
        return deep_merge(self.default_config, stored)

    def public(self) -> Dict[str, Any]:
        config = self.load()
        public_config = deepcopy(config)
        cookie = public_config.get("login", {}).get("cookies", "")
        public_config.setdefault("login", {})["cookies"] = ""
        public_config["login"]["cookie_present"] = bool(cookie)
        public_config["login"]["cookies_preview"] = redact_cookie(cookie)
        public_config["paths"] = {
            "data_root": str(DATA_ROOT),
            "markdown_root": str(DEFAULT_MARKDOWN_ROOT),
            "output_root": str(resolve_output_root(config)),
            "resource_root": str(RESOURCE_ROOT),
            "desktop_mode": is_desktop_mode(),
        }
        public_config["choices"] = {
            "sort_type": SORT_LABELS,
            "content_type": CONTENT_TYPE_LABELS,
            "publish_time": PUBLISH_TIME_LABELS,
            "note_range": NOTE_RANGE_LABELS,
            "pos_distance": POS_DISTANCE_LABELS,
            "weekdays": WEEKDAY_LABELS,
            "rewrite_region": {
                "cn-beijing": "北京",
                "ap-southeast-1": "新加坡",
            },
        }
        rewrite_config = config.get("rewrite", {}) if isinstance(config.get("rewrite"), dict) else {}
        stored_api_key = str(rewrite_config.get("api_key") or "").strip()
        env_api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
        api_key = stored_api_key or env_api_key
        public_rewrite = public_config.setdefault("rewrite", {})
        public_rewrite["api_key"] = api_key
        public_rewrite["api_key_present"] = bool(api_key)
        public_rewrite["api_key_preview"] = redact_secret(api_key)
        public_rewrite["api_key_source"] = "配置文件" if stored_api_key else ("环境变量" if env_api_key else "")
        public_config["summary"] = summarize_config(config)
        return public_config

    def _sanitize(self, config: Dict[str, Any]) -> Dict[str, Any]:
        sanitized = deepcopy(config)
        sanitized.setdefault("login", {})
        sanitized["login"]["cookies"] = str(sanitized["login"].get("cookies") or "").strip().strip("'").strip('"')

        keywords = sanitized.get("keywords") or []
        if isinstance(keywords, str):
            keywords = re.split(r"[\n,，]+", keywords)
        sanitized["keywords"] = [str(item).strip() for item in keywords if str(item).strip()]
        if not sanitized["keywords"]:
            sanitized["keywords"] = ["男士穿搭"]

        collect = sanitized.setdefault("collect", {})
        collect["count"] = to_int(collect.get("count"), 10, 1, 200)
        collect["like_top_n"] = to_int(collect.get("like_top_n"), collect["count"], 1, 200)
        collect["request_multiplier"] = to_int(collect.get("request_multiplier"), 3, 1, 10)
        search_delay_min, search_delay_max = normalize_delay_range(
            collect.get("search_delay_min_sec"),
            collect.get("search_delay_max_sec"),
            2.0,
            4.0,
        )
        collect["search_delay_min_sec"] = search_delay_min
        collect["search_delay_max_sec"] = search_delay_max
        detail_delay_min, detail_delay_max = normalize_delay_range(
            collect.get("detail_delay_min_sec"),
            collect.get("detail_delay_max_sec"),
            1.0,
            3.0,
        )
        collect["detail_delay_min_sec"] = detail_delay_min
        collect["detail_delay_max_sec"] = detail_delay_max

        filters = sanitized.setdefault("filters", {})
        filters["sort_type"] = to_int(filters.get("sort_type"), 2, 0, 4)
        filters["content_type"] = to_int(filters.get("content_type"), 2, 0, 2)
        filters["publish_time"] = to_int(filters.get("publish_time"), 2, 0, 4)
        filters["publish_days"] = to_int(filters.get("publish_days"), 7, 0, 3650)
        filters["note_range"] = to_int(filters.get("note_range"), 0, 0, 3)
        filters["pos_distance"] = to_int(filters.get("pos_distance"), 0, 0, 2)
        filters.pop("geo", None)
        filters.pop("extra", None)

        storage = sanitized.setdefault("storage", {})
        storage["output_dir"] = str(storage.get("output_dir") or "").strip().strip("'").strip('"')

        rewrite = sanitized.setdefault("rewrite", {})
        rewrite["enabled"] = bool(rewrite.get("enabled"))
        rewrite["topic"] = normalize_rewrite_requirements(rewrite.get("topic"))
        rewrite["api_key"] = str(rewrite.get("api_key") or "").strip().strip("'").strip('"')[:300]
        rewrite["text_model"] = str(rewrite.get("text_model") or "qwen-plus").strip()[:80] or "qwen-plus"
        rewrite["image_model"] = str(rewrite.get("image_model") or "wan2.6-image").strip()[:80] or "wan2.6-image"
        region = str(rewrite.get("region") or "cn-beijing").strip()
        rewrite["region"] = region if region in {"cn-beijing", "ap-southeast-1"} else "cn-beijing"
        rewrite["generate_image_prompts"] = bool(rewrite.get("generate_image_prompts", True))
        rewrite["generate_images"] = bool(rewrite.get("generate_images"))

        schedule = sanitized.setdefault("schedule", {})
        schedule["enabled"] = bool(schedule.get("enabled"))
        schedule["cycle"] = schedule.get("cycle") if schedule.get("cycle") in ["daily", "weekly"] else "daily"
        schedule["daily_runs"] = to_int(schedule.get("daily_runs"), 1, 1, 24)
        schedule["run_times"] = normalize_run_times(schedule)
        weekdays = schedule.get("weekdays") or [1, 2, 3, 4, 5, 6, 7]
        schedule["weekdays"] = sorted({to_int(day, 1, 1, 7) for day in weekdays})
        return sanitized


class ContentCollector:
    def __init__(self) -> None:
        self.xhs_apis = XHS_Apis()

    def run(self, config: Dict[str, Any], source: str = "manual", progress: Optional[Callable[[str], None]] = None) -> Dict[str, Any]:
        cookies = config.get("login", {}).get("cookies") or load_env()
        if not cookies:
            raise ValueError("缺少登录 Cookie，请先在页面中配置 Cookie 或 .env 的 COOKIES")

        keywords = config.get("keywords") or []
        collect = config.get("collect", {})
        filters = config.get("filters", {})
        count = to_int(collect.get("count"), 10, 1, 200)
        sort_type = to_int(filters.get("sort_type"), 2, 0, 4)
        like_top_n = to_int(collect.get("like_top_n"), count, 1, 200)
        final_limit = like_top_n if sort_type == 2 else count
        request_multiplier = to_int(collect.get("request_multiplier"), 3, 1, 10)
        request_num = min(max(final_limit * request_multiplier, final_limit, 20), 200)
        search_delay_min, search_delay_max = normalize_delay_range(
            collect.get("search_delay_min_sec"),
            collect.get("search_delay_max_sec"),
            2.0,
            4.0,
        )
        detail_delay_min, detail_delay_max = normalize_delay_range(
            collect.get("detail_delay_min_sec"),
            collect.get("detail_delay_max_sec"),
            1.0,
            3.0,
        )

        output_root = resolve_output_root(config)
        output_root.mkdir(parents=True, exist_ok=True)
        batch_dir = output_root / batch_name()
        batch_dir.mkdir(parents=True, exist_ok=True)
        result = {
            "source": source,
            "started_at": now_text(),
            "finished_at": None,
            "run_dir": relative_to_root(batch_dir, output_root),
            "output_root": str(output_root),
            "config": summarize_config(config),
            "keywords": [],
            "items": [],
            "saved_count": 0,
            "failed_count": 0,
        }

        for keyword in keywords:
            self._progress(progress, f"开始搜索关键词：{keyword}")
            keyword_result = {
                "keyword": keyword,
                "searched": 0,
                "candidates": 0,
                "saved": 0,
                "failed": 0,
                "message": "",
            }
            try:
                note_urls = self._search_note_urls(
                    keyword,
                    request_num,
                    cookies,
                    filters,
                    search_delay_min,
                    search_delay_max,
                )
                keyword_result["searched"] = len(note_urls)
                self._progress(progress, f"关键词 {keyword} 获取到 {len(note_urls)} 条搜索结果")

                candidates = []
                days = publish_days_filter(filters)
                content_type = to_int(filters.get("content_type"), 2, 0, 2)
                for index, note_url in enumerate(note_urls, start=1):
                    if index > 1:
                        self._sleep_between_requests(detail_delay_min, detail_delay_max)
                    self._progress(progress, f"拉取详情 {keyword} {index}/{len(note_urls)}")
                    success, msg, note_info = self._fetch_note(note_url, cookies)
                    if not success or not note_info:
                        keyword_result["failed"] += 1
                        self._progress(progress, f"详情失败：{msg}")
                        continue
                    if not content_type_matches(note_info, content_type):
                        continue
                    if not within_publish_days(note_info, days):
                        continue
                    candidates.append(note_info)

                keyword_result["candidates"] = len(candidates)
                if sort_type == 2:
                    candidates.sort(key=lambda item: parse_count(item.get("liked_count")), reverse=True)
                selected = candidates[:final_limit]
                keyword_dir = batch_dir / safe_filename(keyword, fallback="keyword", max_len=60)
                for note in selected:
                    try:
                        saved = save_note_as_markdown(note, keyword_dir, output_root)
                        result["items"].append(saved)
                        keyword_result["saved"] += 1
                        self._progress(progress, f"已保存：{saved['title']}")
                    except Exception as exc:
                        keyword_result["failed"] += 1
                        self._progress(progress, f"保存失败：{exc}")
                        logger.exception(exc)

                keyword_result["message"] = f"保存 {keyword_result['saved']} 篇"
            except Exception as exc:
                keyword_result["failed"] += 1
                keyword_result["message"] = str(exc)
                self._progress(progress, f"关键词 {keyword} 失败：{exc}")
                logger.exception(exc)

            result["saved_count"] += keyword_result["saved"]
            result["failed_count"] += keyword_result["failed"]
            result["keywords"].append(keyword_result)

        result["finished_at"] = now_text()
        clean_empty_batch_dirs(batch_dir, include_root=True)
        self._progress(progress, f"采集完成：保存 {result['saved_count']} 篇，失败 {result['failed_count']} 条")
        return result

    def _search_note_urls(
        self,
        keyword: str,
        request_num: int,
        cookies: str,
        filters: Dict[str, Any],
        delay_min: float,
        delay_max: float,
    ) -> List[str]:
        success, msg, notes = self.xhs_apis.search_some_note(
            keyword,
            request_num,
            cookies,
            sort_type_choice=to_int(filters.get("sort_type"), 2, 0, 4),
            note_type=to_int(filters.get("content_type"), 2, 0, 2),
            note_time=publish_api_filter(filters),
            note_range=to_int(filters.get("note_range"), 0, 0, 3),
            pos_distance=to_int(filters.get("pos_distance"), 0, 0, 2),
            page_delay_callback=lambda _page: self._sleep_between_requests(delay_min, delay_max),
        )
        if not success:
            raise RuntimeError(msg)

        urls = []
        seen = set()
        for note in notes:
            if note.get("model_type") and note.get("model_type") != "note":
                continue
            note_id = note.get("id") or note.get("note_id") or note.get("note_card", {}).get("note_id")
            xsec_token = note.get("xsec_token") or note.get("xsecToken") or note.get("xsec_token_web")
            if not note_id or not xsec_token:
                continue
            note_url = f"https://www.xiaohongshu.com/explore/{note_id}?xsec_token={xsec_token}&xsec_source=pc_search"
            if note_url not in seen:
                urls.append(note_url)
                seen.add(note_url)
        return urls

    def _sleep_between_requests(self, delay_min: float, delay_max: float) -> None:
        if delay_max <= 0:
            return
        delay = delay_min if delay_min == delay_max else random.uniform(delay_min, delay_max)
        if delay > 0:
            time.sleep(delay)

    def _fetch_note(self, note_url: str, cookies: str) -> Tuple[bool, Any, Optional[Dict[str, Any]]]:
        try:
            success, msg, note_info = self.xhs_apis.get_note_info(note_url, cookies)
            if success:
                note_info = note_info["data"]["items"][0]
                note_info["url"] = note_url
                return True, msg, handle_note_info(note_info)
            return False, msg, None
        except Exception as exc:
            return False, str(exc), None

    def _progress(self, progress: Optional[Callable[[str], None]], message: str) -> None:
        logger.info(message)
        if progress:
            progress(message)


class RewriteService:
    def __init__(self, output_root: Path, config: Optional[Dict[str, Any]] = None) -> None:
        self.output_root = output_root.resolve()
        self.config = config or {}
        self.topic = normalize_rewrite_requirements(self.config.get("topic"))
        self.text_model = str(self.config.get("text_model") or "qwen-plus").strip() or "qwen-plus"
        self.image_model = str(self.config.get("image_model") or "wan2.6-image").strip() or "wan2.6-image"
        self.region = str(self.config.get("region") or "cn-beijing").strip() or "cn-beijing"
        self.generate_image_prompts = bool(self.config.get("generate_image_prompts", True))
        self.generate_images = bool(self.config.get("generate_images"))
        self.api_key = str(self.config.get("api_key") or os.getenv("DASHSCOPE_API_KEY", "")).strip()

    def rewrite_from_collection(
        self,
        result: Dict[str, Any],
        progress: Optional[Callable[[str], None]] = None,
    ) -> Optional[Dict[str, Any]]:
        notes = self._notes_from_collection_result(result)
        if not notes:
            return None
        batch_dir = self._collection_batch_dir(result, notes)
        return self.generate(notes, batch_dir, mode="batch", progress=progress)

    def rewrite_note(
        self,
        relative_path: str,
        topic: Optional[str] = None,
        progress: Optional[Callable[[str], None]] = None,
    ) -> Dict[str, Any]:
        if topic:
            self.topic = normalize_rewrite_requirements(topic)
        note_folder = self._resolve_note_folder(relative_path)
        target_note = self._load_note_folder(note_folder)
        peers = self._peer_notes(note_folder)
        notes = [target_note] + [note for note in peers if note.get("note_id") != target_note.get("note_id")]
        target_dir = available_child_path(
            note_folder,
            f"AI仿写_{safe_filename(self.topic_label(), fallback='requirements', max_len=28)}_{batch_name()}",
        )
        return self.generate(notes[:10], target_dir, mode="single", target_note=target_note, progress=progress)

    def topic_label(self, max_len: int = 48) -> str:
        return rewrite_requirements_label(self.topic, max_len=max_len)

    def generate(
        self,
        notes: List[Dict[str, Any]],
        output_dir: Path,
        mode: str = "batch",
        target_note: Optional[Dict[str, Any]] = None,
        progress: Optional[Callable[[str], None]] = None,
    ) -> Dict[str, Any]:
        if not self.api_key:
            raise RuntimeError("缺少 DASHSCOPE_API_KEY，无法调用阿里百炼模型生成仿写文案")

        started_at = now_text()
        stage_logs: List[Dict[str, str]] = []

        def record(message: str) -> None:
            stage_logs.append({"time": now_text(), "message": message})
            self._progress(progress, message)

        output_dir.mkdir(parents=True, exist_ok=True)
        record("正在准备仿写输出目录")
        record(f"正在请求文本模型：{self.text_model}")
        payload = self._call_text_model(notes, mode=mode, target_note=target_note)
        record("文本模型已返回，正在整理仿写结构")
        articles = self._normalize_articles(payload.get("articles"), notes, mode=mode, target_note=target_note)
        analysis_report = str(payload.get("analysis_report") or payload.get("analysis") or "").strip()
        if not analysis_report:
            record("模型未返回分析报告，正在生成兜底分析")
            analysis_report = self._fallback_analysis(notes)

        if self.generate_images:
            images_dir = output_dir / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
            for index, article in enumerate(articles, start=1):
                prompt = str(article.get("image_prompt") or "").strip()
                if not prompt:
                    continue
                note = self._article_source_note(article, notes)
                record(f"正在生成配图 {index}/{len(articles)}")
                try:
                    image_urls = self._generate_image(prompt, self._reference_image(note))
                    if image_urls:
                        file_name, error = download_url(image_urls[0], images_dir / f"article_{index:02d}", ".jpg")
                        if file_name:
                            article["generated_image"] = f"images/{file_name}"
                        else:
                            article["generated_image_url"] = image_urls[0]
                            article["image_download_error"] = error
                except Exception as exc:
                    article["image_error"] = str(exc)
                    record(f"配图生成失败 {index}/{len(articles)}：{exc}")

        result = {
            "topic": self.topic,
            "mode": mode,
            "note_count": len(notes),
            "article_count": len(articles),
            "started_at": started_at,
            "generated_at": now_text(),
            "model": {
                "text": self.text_model,
                "image": self.image_model,
                "region": self.region,
            },
            "analysis_report": analysis_report,
            "articles": articles,
        }
        result["output_dir"] = relative_to_root(output_dir, self.output_root)
        result["analysis_path"] = relative_to_root(output_dir / "爆款分析报告.md", self.output_root)
        result["articles_path"] = relative_to_root(output_dir / "仿写文案.md", self.output_root)
        result["image_prompts_path"] = relative_to_root(output_dir / "图片提示词.md", self.output_root)
        result["result_path"] = relative_to_root(output_dir / "result.json", self.output_root)
        result["log_path"] = relative_to_root(output_dir / "仿写日志.md", self.output_root)
        result["finished_at"] = now_text()
        record("正在写入仿写结果文件")
        self._write_result_files(output_dir, result)
        record("正在写入仿写日志")
        stage_logs.append({
            "time": now_text(),
            "message": f"仿写完成：生成 {len(articles)} 篇，目录 {result['output_dir']}",
        })
        self._write_rewrite_log(output_dir, result, notes, target_note, stage_logs)
        self._progress(progress, stage_logs[-1]["message"])
        return result

    def _notes_from_collection_result(self, result: Dict[str, Any]) -> List[Dict[str, Any]]:
        notes = []
        seen = set()
        for item in result.get("items") or []:
            folder = str(item.get("folder") or "").strip()
            if not folder:
                continue
            note_folder = safe_output_path(self.output_root, folder)
            if not (note_folder / "info.json").exists():
                continue
            note = self._load_note_folder(note_folder)
            note_id = note.get("note_id") or note.get("folder")
            if note_id in seen:
                continue
            seen.add(note_id)
            notes.append(note)
        notes.sort(key=lambda item: parse_count(item.get("liked_count")), reverse=True)
        return notes

    def _collection_batch_dir(self, result: Dict[str, Any], notes: List[Dict[str, Any]]) -> Path:
        run_dir = str(result.get("run_dir") or "").strip()
        if run_dir:
            batch_dir = safe_output_path(self.output_root, run_dir)
        else:
            first_folder = safe_output_path(self.output_root, notes[0]["folder"])
            batch_dir = first_folder.parent.parent if len(first_folder.parents) >= 2 else first_folder.parent
        return available_child_path(
            batch_dir,
            f"AI仿写_{safe_filename(self.topic_label(), fallback='requirements', max_len=28)}_{batch_name()}",
        )

    def _resolve_note_folder(self, relative_path: str) -> Path:
        target = safe_output_path(self.output_root, str(relative_path or "").strip())
        if target.is_file():
            if target.name == "info.json":
                target = target.parent
            elif target.parent.joinpath("info.json").exists():
                target = target.parent
            elif target.parent.name == "assert" and target.parent.parent.joinpath("info.json").exists():
                target = target.parent.parent
        if target.is_dir() and target.joinpath("info.json").exists():
            return target
        raise FileNotFoundError("请选择包含 info.json 的单篇笔记目录或 Markdown 文件")

    def _load_note_folder(self, note_folder: Path) -> Dict[str, Any]:
        info_path = note_folder / "info.json"
        info = read_json(info_path, {})
        if not isinstance(info, dict):
            info = {}
        markdown_paths = sorted(path for path in note_folder.glob("*.md") if path.is_file())
        local_images = []
        assert_dir = note_folder / "assert"
        if assert_dir.exists():
            for child in sorted(assert_dir.iterdir()):
                if child.is_file() and child.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
                    local_images.append(relative_to_root(child, self.output_root))
        return {
            "note_id": str(info.get("note_id") or note_folder.name),
            "title": str(info.get("title") or note_folder.name),
            "desc": str(info.get("desc") or ""),
            "liked_count": info.get("liked_count"),
            "collected_count": info.get("collected_count"),
            "comment_count": info.get("comment_count"),
            "share_count": info.get("share_count"),
            "upload_time": info.get("upload_time"),
            "note_url": info.get("note_url") or info.get("url"),
            "note_type": info.get("note_type"),
            "tags": info.get("tags") or [],
            "image_list": info.get("image_list") or [],
            "folder": relative_to_root(note_folder, self.output_root),
            "markdown": relative_to_root(markdown_paths[0], self.output_root) if markdown_paths else "",
            "local_images": local_images,
        }

    def _peer_notes(self, note_folder: Path) -> List[Dict[str, Any]]:
        peers = []
        search_roots = [note_folder.parent, note_folder.parent.parent]
        seen = set()
        for root in search_roots:
            if not root.exists() or root.resolve() == self.output_root:
                continue
            for info_path in root.rglob("info.json"):
                candidate = info_path.parent
                if candidate == note_folder or candidate in seen:
                    continue
                seen.add(candidate)
                try:
                    peers.append(self._load_note_folder(candidate))
                except Exception:
                    continue
                if len(peers) >= 9:
                    break
            if len(peers) >= 9:
                break
        peers.sort(key=lambda item: parse_count(item.get("liked_count")), reverse=True)
        return peers[:9]

    def _call_text_model(
        self,
        notes: List[Dict[str, Any]],
        mode: str,
        target_note: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        request_notes = []
        for note in notes[:10]:
            request_notes.append({
                "note_id": note.get("note_id"),
                "title": note.get("title"),
                "desc": str(note.get("desc") or "")[:1800],
                "metrics": {
                    "liked": note.get("liked_count"),
                    "collected": note.get("collected_count"),
                    "comment": note.get("comment_count"),
                    "share": note.get("share_count"),
                },
                "note_type": note.get("note_type"),
                "image_count": len(note.get("image_list") or []) or len(note.get("local_images") or []),
                "tags": note.get("tags") or [],
            })
        article_count = 1 if mode == "single" else min(10, len(request_notes))
        prompt = {
            "topic": self.topic_label(),
            "rewrite_requirements": self.topic,
            "mode": mode,
            "article_count": article_count,
            "target_note_id": target_note.get("note_id") if target_note else "",
            "notes": request_notes,
        }
        user_prompt = (
            "请基于以下小红书创业类爆款样本做爆款拆解，并根据 rewrite_requirements 生成仿写文案。"
            "要求：只学习结构、节奏、选题角度和视觉风格，不照抄原文，不复用原文连续 8 个字以上。"
            "如果 mode=batch，请给每篇参考笔记生成一篇不同风格的最终文案；如果 mode=single，只围绕 target_note_id 的套路生成一篇。"
            "每篇最终文案必须符合 rewrite_requirements；如果要求里包含目标人群、风格、禁用表达、转化目标或主题，请全部遵守。"
            "图片提示词要求：image_prompt 必须使用中文撰写，不要输出英文句子或英文关键词；"
            "可以保留数字比例，例如 3:4。提示词需包含画面主体、场景、构图、光线、风格和负面要求。"
            "输出必须是合法 JSON，不要使用 Markdown 代码块。JSON 结构为："
            "{\"analysis_report\":\"Markdown格式爆款分析报告\",\"articles\":[{\"source_note_id\":\"参考笔记ID\","
            "\"source_title\":\"参考标题\",\"strategy\":\"仿写策略\",\"title_options\":[\"标题1\",\"标题2\",\"标题3\"],"
            "\"body\":\"完整小红书正文，含自然转化引导\",\"hashtags\":[\"#话题#\"],"
            "\"comment_cta\":\"评论区引导话术\",\"image_prompt\":\"中文阿里通义万相图片生成提示词\"}]}"
            f"\n\n输入数据：{json.dumps(prompt, ensure_ascii=False)}"
        )
        response = requests.post(
            self._text_endpoint(),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.text_model,
                "messages": [
                    {
                        "role": "system",
                        "content": "你是资深小红书内容策略师，擅长爆款拆解、合规仿写和商业转化文案。",
                    },
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.82,
                "response_format": {"type": "json_object"},
            },
            timeout=180,
        )
        response.raise_for_status()
        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if isinstance(content, list):
            content = "\n".join(
                str(part.get("text") or part.get("content") or "")
                for part in content
                if isinstance(part, dict)
            )
        return self._parse_model_json(content)

    def _parse_model_json(self, content: str) -> Dict[str, Any]:
        text = str(content or "").strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                parsed = json.loads(text[start:end + 1])
                return parsed if isinstance(parsed, dict) else {}
        raise ValueError("模型返回内容不是合法 JSON")

    def _normalize_articles(
        self,
        articles: Any,
        notes: List[Dict[str, Any]],
        mode: str,
        target_note: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        raw_articles = articles if isinstance(articles, list) else []
        expected = 1 if mode == "single" else min(10, len(notes))
        normalized = []
        for index in range(expected):
            source_note = target_note if target_note and index == 0 else notes[index % len(notes)]
            item = raw_articles[index] if index < len(raw_articles) and isinstance(raw_articles[index], dict) else {}
            title_options = item.get("title_options") if isinstance(item.get("title_options"), list) else []
            image_prompt = self._normalize_image_prompt(item.get("image_prompt"), source_note)
            normalized.append({
                "source_note_id": str(item.get("source_note_id") or source_note.get("note_id") or ""),
                "source_title": str(item.get("source_title") or source_note.get("title") or ""),
                "strategy": str(item.get("strategy") or "提炼参考笔记的标题钩子、痛点开场和转化收口。"),
                "title_options": [str(title) for title in title_options[:5]] or self._fallback_titles(source_note),
                "body": str(item.get("body") or self._fallback_body(source_note)),
                "hashtags": [str(tag) for tag in item.get("hashtags", []) if str(tag).strip()] or [
                    "#创业沙龙[话题]#",
                    "#创业[话题]#",
                    "#副业[话题]#",
                    "#商业思维[话题]#",
                ],
                "comment_cta": str(item.get("comment_cta") or "想了解活动安排，可以评论“沙龙”。"),
                "image_prompt": image_prompt,
            })
        return normalized

    def _normalize_image_prompt(self, value: Any, note: Dict[str, Any]) -> str:
        prompt = re.sub(r"\s+", " ", str(value or "").strip())
        if not prompt:
            return self._fallback_image_prompt(note)

        # 文本模型偶尔会返回英文图片提示词；落盘和生成图片前统一兜底成中文。
        chinese_count = len(re.findall(r"[\u3400-\u9fff]", prompt))
        allowed_latin_tokens = {
            token.lower()
            for token in re.findall(r"[A-Za-z][A-Za-z0-9+-]*", self.topic)
        }
        extra_latin_tokens = [
            token
            for token in re.findall(r"[A-Za-z][A-Za-z0-9+-]*", prompt)
            if token.lower() not in allowed_latin_tokens
        ]
        if chinese_count < 8 or extra_latin_tokens:
            return self._fallback_image_prompt(note)
        return prompt

    def _fallback_analysis(self, notes: List[Dict[str, Any]]) -> str:
        titles = "、".join(str(note.get("title") or "") for note in notes[:5])
        return (
            f"这批样本围绕「{titles}」展开，核心爆点集中在强结果、强反差、真实经历和可复制路径。"
            "适合把创业沙龙包装成一次解决信息差、链接同频人和获得具体方向的机会。"
        )

    def _fallback_titles(self, note: Dict[str, Any]) -> List[str]:
        label = self.topic_label()
        return [
            f"想创业的人，真的该来一次{label}",
            f"我建议你创业前先参加一次{label}",
            f"别一个人硬扛，来{label}聊聊",
        ]

    def _fallback_body(self, note: Dict[str, Any]) -> str:
        label = self.topic_label()
        return (
            f"最近越来越感觉，创业最难的不是努力，而是没人帮你拆清楚方向。\n\n"
            f"所以这次我们准备了一场「{label}」，不讲虚的，主要聊三个问题：\n"
            "1. 你的项目到底适不适合继续做\n"
            "2. 普通人怎么找到第一批用户和资源\n"
            "3. 怎么避开那些很贵的试错\n\n"
            "如果你正在创业、准备做副业，或者卡在一个想法里很久了，可以来现场一起聊。\n"
            "评论“沙龙”，我把报名方式发你。"
        )

    def _fallback_image_prompt(self, note: Dict[str, Any]) -> str:
        label = self.topic_label()
        return (
            f"小红书创业主题封面图，主题为{label}，真实线下创业交流沙龙场景，"
            "年轻创业者围坐讨论，白板、笔记本电脑、咖啡、暖色自然光，竖版 3:4，"
            "画面干净、有真实感、适合小红书封面，不出现品牌标志，不出现小红书界面。"
        )

    def _write_result_files(self, output_dir: Path, result: Dict[str, Any]) -> None:
        label = self.topic_label()
        (output_dir / "爆款分析报告.md").write_text(
            f"# {label} 爆款分析报告\n\n{result['analysis_report'].strip()}\n",
            encoding="utf-8",
        )
        article_lines = [f"# {label} 仿写文案", ""]
        prompt_lines = [f"# {label} 图片提示词", ""]
        for index, article in enumerate(result.get("articles") or [], start=1):
            article_lines.extend([
                f"## {index:02d}. {article.get('source_title') or '参考笔记'}",
                "",
                f"参考套路：{article.get('strategy') or ''}",
                "",
                "### 标题备选",
                "",
                *[f"- {title}" for title in article.get("title_options") or []],
                "",
                "### 正文",
                "",
                str(article.get("body") or "").strip(),
                "",
                "### 话题",
                "",
                " ".join(article.get("hashtags") or []),
                "",
                "### 评论引导",
                "",
                str(article.get("comment_cta") or "").strip(),
                "",
                "### 图片提示词",
                "",
                str(article.get("image_prompt") or "").strip(),
                "",
            ])
            if article.get("generated_image"):
                article_lines.extend([f"![生成图]({article['generated_image']})", ""])
            prompt_lines.extend([
                f"## {index:02d}. {article.get('source_title') or '参考笔记'}",
                "",
                str(article.get("image_prompt") or "").strip(),
                "",
            ])
        (output_dir / "仿写文案.md").write_text("\n".join(article_lines), encoding="utf-8")
        (output_dir / "图片提示词.md").write_text("\n".join(prompt_lines), encoding="utf-8")
        (output_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    def _write_rewrite_log(
        self,
        output_dir: Path,
        result: Dict[str, Any],
        notes: List[Dict[str, Any]],
        target_note: Optional[Dict[str, Any]],
        stage_logs: List[Dict[str, str]],
    ) -> None:
        source_notes = [target_note] if target_note else notes
        source_notes = [note for note in source_notes if note]
        lines = [
            f"# {self.topic_label()} 仿写日志",
            "",
            "## 运行信息",
            "",
            f"- 开始时间：{result.get('started_at') or ''}",
            f"- 结束时间：{result.get('finished_at') or ''}",
            f"- 仿写要求：{self.topic}",
            f"- 生成模式：{result.get('mode') or ''}",
            f"- 文本模型：{self.text_model}",
            f"- 图片模型：{self.image_model}",
            f"- 模型地域：{self.region}",
            f"- 样本数量：{result.get('note_count')}",
            f"- 生成篇数：{result.get('article_count')}",
            "",
            "## 源笔记",
            "",
        ]
        if not source_notes:
            lines.extend(["- 未记录源笔记", ""])
        for index, note in enumerate(source_notes[:10], start=1):
            title = str(note.get("title") or "无标题").strip()
            note_id = str(note.get("note_id") or "").strip()
            note_url = str(note.get("note_url") or note.get("url") or "").strip()
            liked = str(note.get("liked_count") or "").strip()
            lines.append(f"- {index}. {title}")
            if note_id:
                lines.append(f"  - 笔记ID：{note_id}")
            if liked:
                lines.append(f"  - 点赞数：{liked}")
            if note_url:
                lines.append(f"  - 原始链接：{note_url}")
        lines.extend([
            "",
            "## 输出文件",
            "",
            f"- 爆款分析报告：{result.get('analysis_path') or ''}",
            f"- 仿写文案：{result.get('articles_path') or ''}",
            f"- 图片提示词：{result.get('image_prompts_path') or ''}",
            f"- 结构化结果：{result.get('result_path') or ''}",
            f"- 仿写日志：{result.get('log_path') or ''}",
            "",
            "## 阶段日志",
            "",
        ])
        if not stage_logs:
            lines.append("- 未记录阶段日志")
        for item in stage_logs:
            lines.append(f"- [{item.get('time') or ''}] {item.get('message') or ''}")
        (output_dir / "仿写日志.md").write_text("\n".join(lines), encoding="utf-8")

    def _text_endpoint(self) -> str:
        host = "dashscope-intl.aliyuncs.com" if self.region == "ap-southeast-1" else "dashscope.aliyuncs.com"
        return f"https://{host}/compatible-mode/v1/chat/completions"

    def _image_endpoint(self) -> str:
        host = "dashscope-intl.aliyuncs.com" if self.region == "ap-southeast-1" else "dashscope.aliyuncs.com"
        return f"https://{host}/api/v1/services/aigc/image-generation/generation"

    def _task_endpoint(self, task_id: str) -> str:
        host = "dashscope-intl.aliyuncs.com" if self.region == "ap-southeast-1" else "dashscope.aliyuncs.com"
        return f"https://{host}/api/v1/tasks/{task_id}"

    def _generate_image(self, prompt: str, reference_image: str = "") -> List[str]:
        content = [{"text": prompt}]
        parameters = {
            "prompt_extend": True,
            "watermark": False,
            "n": 1,
            "size": "1K",
        }
        if reference_image:
            content.append({"image": reference_image})
            parameters["enable_interleave"] = False
        else:
            parameters["enable_interleave"] = True
            parameters["max_images"] = 1
        response = requests.post(
            self._image_endpoint(),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "X-DashScope-Async": "enable",
            },
            json={
                "model": self.image_model,
                "input": {"messages": [{"role": "user", "content": content}]},
                "parameters": parameters,
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        task_id = data.get("output", {}).get("task_id") or data.get("output", {}).get("taskId")
        if not task_id:
            return self._extract_image_urls(data)
        deadline = time.time() + 240
        while time.time() < deadline:
            time.sleep(6)
            status_response = requests.get(
                self._task_endpoint(str(task_id)),
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=30,
            )
            status_response.raise_for_status()
            status_data = status_response.json()
            status = str(status_data.get("output", {}).get("task_status") or "").upper()
            if status in {"SUCCEEDED", "SUCCESS"}:
                return self._extract_image_urls(status_data)
            if status in {"FAILED", "CANCELED", "UNKNOWN"}:
                raise RuntimeError(status_data.get("output", {}).get("message") or f"图片任务失败：{status}")
        raise TimeoutError("图片生成超时")

    def _extract_image_urls(self, value: Any) -> List[str]:
        urls = []

        def visit(item: Any) -> None:
            if isinstance(item, dict):
                for key, nested in item.items():
                    if key in {"url", "image", "image_url"} and isinstance(nested, str) and nested.startswith("http"):
                        urls.append(nested)
                    else:
                        visit(nested)
            elif isinstance(item, list):
                for nested in item:
                    visit(nested)

        visit(value)
        unique_urls = []
        for url in urls:
            if url not in unique_urls:
                unique_urls.append(url)
        return unique_urls

    def _reference_image(self, note: Optional[Dict[str, Any]]) -> str:
        if not note:
            return ""
        for rel_path in note.get("local_images") or []:
            path = safe_output_path(self.output_root, rel_path)
            if path.exists() and path.stat().st_size <= 10 * 1024 * 1024:
                mime = mimetypes.guess_type(str(path))[0] or "image/jpeg"
                data = base64.b64encode(path.read_bytes()).decode("ascii")
                return f"data:{mime};base64,{data}"
        image_list = note.get("image_list") or []
        return str(image_list[0]) if image_list else ""

    def _article_source_note(self, article: Dict[str, Any], notes: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        source_id = str(article.get("source_note_id") or "")
        for note in notes:
            if str(note.get("note_id") or "") == source_id:
                return note
        return notes[0] if notes else None

    def _progress(self, progress: Optional[Callable[[str], None]], message: str) -> None:
        logger.info(message)
        if progress:
            progress(message)


class JobManager:
    def __init__(self, config_store: ConfigStore):
        self.config_store = config_store
        self.collector = ContentCollector()
        self.lock = threading.Lock()
        self.jobs: List[Dict[str, Any]] = read_json(JOB_HISTORY_PATH, [])
        if not isinstance(self.jobs, list):
            self.jobs = []
        changed = False
        for job in self.jobs:
            if not job.get("type"):
                job["type"] = "collect"
                changed = True
            if job.get("status") == "running":
                job["status"] = "interrupted"
                job["finished_at"] = now_text()
                job["error"] = "服务重启，上一轮运行状态已失效"
                job["progress"] = {"value": 100, "label": "已中断", "phase": "interrupted"}
                changed = True
        if changed:
            write_json(JOB_HISTORY_PATH, self.jobs)

    def start(self, source: str = "manual", config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        with self.lock:
            running = self._running_job_unlocked()
            if running:
                raise RuntimeError(f"已有任务正在运行：{running['id']}")
            config_snapshot = deepcopy(config or self.config_store.load())
            job = {
                "id": uuid.uuid4().hex[:12],
                "type": "collect",
                "source": source,
                "status": "running",
                "created_at": now_text(),
                "started_at": now_text(),
                "finished_at": None,
                "summary": summarize_config(config_snapshot),
                "progress": {"value": 3, "label": "等待采集启动", "phase": "starting"},
                "logs": [],
                "log_groups": {"crawl": [], "rewrite": []},
                "result": None,
                "error": None,
            }
            self.jobs.insert(0, job)
            self.jobs = self.jobs[:50]
            self._persist_unlocked()

        thread = threading.Thread(target=self._run_job, args=(job["id"], config_snapshot), daemon=True)
        thread.start()
        return job

    def start_rewrite(
        self,
        targets: List[Dict[str, Any]],
        topic: str,
        config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        normalized_targets = self._normalize_rewrite_targets(targets)
        config_snapshot = deepcopy(config or self.config_store.load())
        topic_text = normalize_rewrite_requirements(topic or config_snapshot.get("rewrite", {}).get("topic"))
        topic_label = rewrite_requirements_label(topic_text)
        config_snapshot.setdefault("rewrite", {})["topic"] = topic_text
        target_names = [target.get("name") or Path(target.get("path", "")).name for target in normalized_targets]
        summary = summarize_config(config_snapshot)
        summary.update({
            "target_count": len(normalized_targets),
            "target_names": target_names[:5],
            "rewrite_topic": topic_label,
        })

        with self.lock:
            running = self._running_job_unlocked()
            if running:
                raise RuntimeError(f"已有任务正在运行：{running['id']}")
            job = {
                "id": uuid.uuid4().hex[:12],
                "type": "rewrite",
                "source": "manual_rewrite",
                "status": "running",
                "created_at": now_text(),
                "started_at": now_text(),
                "finished_at": None,
                "summary": summary,
                "progress": {
                    "value": 2,
                    "label": f"等待仿写启动 0/{len(normalized_targets)}",
                    "phase": "starting",
                    "current": 0,
                    "total": len(normalized_targets),
                },
                "logs": [],
                "log_groups": {"crawl": [], "rewrite": []},
                "result": None,
                "error": None,
            }
            self.jobs.insert(0, job)
            self.jobs = self.jobs[:50]
            self._persist_unlocked()

        thread = threading.Thread(
            target=self._run_rewrite_job,
            args=(job["id"], normalized_targets, topic_text, config_snapshot),
            daemon=True,
        )
        thread.start()
        return job

    def list_jobs(self) -> List[Dict[str, Any]]:
        with self.lock:
            jobs = deepcopy(self.jobs)
        for job in jobs:
            self._prepare_job_for_response(job)
        return jobs

    def has_running(self) -> bool:
        with self.lock:
            return self._running_job_unlocked() is not None

    def _run_job(self, job_id: str, config: Dict[str, Any]) -> None:
        def progress(message: str, log_type: str = "crawl") -> None:
            with self.lock:
                job = self._find_job_unlocked(job_id)
                if not job:
                    return
                self._append_job_log_unlocked(job, message, log_type)
                self._update_collect_progress_unlocked(job, message)
                self._persist_unlocked()

        try:
            result = self.collector.run(config, source=self._job_source(job_id), progress=progress)
            rewrite_config = config.get("rewrite", {}) if isinstance(config.get("rewrite"), dict) else {}
            if rewrite_config.get("enabled") and result.get("saved_count"):
                try:
                    progress("开始自动生成仿写文案", "rewrite")

                    def rewrite_progress(message: str) -> None:
                        progress(message, "rewrite")

                    rewrite_result = RewriteService(resolve_output_root(config), rewrite_config).rewrite_from_collection(
                        result,
                        progress=rewrite_progress,
                    )
                    if rewrite_result:
                        result["rewrite"] = {
                            "topic": rewrite_result.get("topic"),
                            "article_count": rewrite_result.get("article_count"),
                            "output_dir": rewrite_result.get("output_dir"),
                            "analysis_path": rewrite_result.get("analysis_path"),
                            "articles_path": rewrite_result.get("articles_path"),
                            "image_prompts_path": rewrite_result.get("image_prompts_path"),
                            "result_path": rewrite_result.get("result_path"),
                            "log_path": rewrite_result.get("log_path"),
                        }
                except Exception as exc:
                    result["rewrite_error"] = str(exc)
                    progress(f"自动仿写失败：{exc}", "rewrite")
                    logger.exception(exc)
            with self.lock:
                job = self._find_job_unlocked(job_id)
                if job:
                    job["status"] = "success"
                    job["finished_at"] = now_text()
                    job["result"] = result
                    self._set_job_progress_unlocked(job, 100, "已完成", "completed")
                    self._persist_unlocked()
        except Exception as exc:
            logger.exception(exc)
            with self.lock:
                job = self._find_job_unlocked(job_id)
                if job:
                    job["status"] = "failed"
                    job["finished_at"] = now_text()
                    job["error"] = str(exc)
                    self._append_job_log_unlocked(job, f"任务失败：{exc}", "crawl")
                    self._set_job_progress_unlocked(job, 100, "失败", "failed")
                    self._persist_unlocked()

    def _run_rewrite_job(
        self,
        job_id: str,
        targets: List[Dict[str, Any]],
        topic: str,
        config: Dict[str, Any],
    ) -> None:
        total = len(targets)
        result = {
            "type": "rewrite",
            "topic": topic,
            "started_at": now_text(),
            "finished_at": None,
            "target_count": total,
            "success_count": 0,
            "failed_count": 0,
            "items": [],
        }
        rewrite_config = dict(config.get("rewrite", {}) if isinstance(config.get("rewrite"), dict) else {})
        rewrite_config["topic"] = topic
        service = RewriteService(resolve_output_root(config), rewrite_config)

        try:
            with self.lock:
                job = self._find_job_unlocked(job_id)
                if job:
                    job["result"] = deepcopy(result)
                    self._append_job_log_unlocked(job, f"开始 AI 仿写任务：共 {total} 篇，要求「{rewrite_requirements_label(topic)}」", "rewrite")
                    self._set_job_progress_unlocked(job, 2, f"开始仿写 0/{total}", "starting", 0, total)
                    self._persist_unlocked()

            for index, target in enumerate(targets, start=1):
                target_path = target["path"]
                target_name = target.get("name") or Path(target_path).name
                item = {"path": target_path, "name": target_name}

                with self.lock:
                    job = self._find_job_unlocked(job_id)
                    if job:
                        self._append_job_log_unlocked(job, f"开始仿写 {index}/{total}：{target_name}", "rewrite")
                        self._set_rewrite_item_progress_unlocked(job, index, total, "开始仿写", "rewriting")
                        self._persist_unlocked()

                def progress(message: str, item_index: int = index) -> None:
                    with self.lock:
                        job = self._find_job_unlocked(job_id)
                        if not job:
                            return
                        self._append_job_log_unlocked(job, message, "rewrite")
                        self._set_rewrite_item_progress_unlocked(job, item_index, total, message, "rewriting")
                        self._persist_unlocked()

                try:
                    rewrite_result = service.rewrite_note(target_path, topic=topic, progress=progress)
                    item.update({
                        "output_dir": rewrite_result.get("output_dir"),
                        "articles_path": rewrite_result.get("articles_path"),
                        "analysis_path": rewrite_result.get("analysis_path"),
                        "image_prompts_path": rewrite_result.get("image_prompts_path"),
                        "result_path": rewrite_result.get("result_path"),
                        "log_path": rewrite_result.get("log_path"),
                        "article_count": rewrite_result.get("article_count"),
                    })
                    result["success_count"] += 1
                    result["items"].append(item)
                    with self.lock:
                        job = self._find_job_unlocked(job_id)
                        if job:
                            job["result"] = deepcopy(result)
                            self._append_job_log_unlocked(job, f"单篇仿写完成 {index}/{total}：{target_name}", "rewrite")
                            self._set_job_progress_unlocked(
                                job,
                                round((index / total) * 100),
                                f"完成 {index}/{total}",
                                "rewriting",
                                index,
                                total,
                            )
                            self._persist_unlocked()
                except Exception as exc:
                    item["error"] = str(exc)
                    result["failed_count"] += 1
                    result["items"].append(item)
                    logger.exception(exc)
                    with self.lock:
                        job = self._find_job_unlocked(job_id)
                        if job:
                            job["result"] = deepcopy(result)
                            self._append_job_log_unlocked(job, f"单篇仿写失败 {index}/{total}：{target_name}，{exc}", "rewrite")
                            self._set_job_progress_unlocked(
                                job,
                                round((index / total) * 100),
                                f"失败 {index}/{total}",
                                "rewriting",
                                index,
                                total,
                            )
                            self._persist_unlocked()

            result["finished_at"] = now_text()
            final_status = "success" if result["success_count"] > 0 else "failed"
            final_label = f"完成：成功 {result['success_count']}/{total}"
            final_error = None if final_status == "success" else "全部仿写失败"
            if final_error and result["items"]:
                final_error = result["items"][0].get("error") or final_error

            with self.lock:
                job = self._find_job_unlocked(job_id)
                if job:
                    job["status"] = final_status
                    job["finished_at"] = now_text()
                    job["result"] = result
                    job["error"] = final_error
                    self._append_job_log_unlocked(
                        job,
                        f"AI 仿写任务结束：成功 {result['success_count']} 篇，失败 {result['failed_count']} 篇",
                        "rewrite",
                    )
                    self._set_job_progress_unlocked(
                        job,
                        100,
                        final_label if final_status == "success" else "仿写失败",
                        "completed" if final_status == "success" else "failed",
                        total,
                        total,
                    )
                    self._persist_unlocked()
        except Exception as exc:
            logger.exception(exc)
            with self.lock:
                job = self._find_job_unlocked(job_id)
                if job:
                    job["status"] = "failed"
                    job["finished_at"] = now_text()
                    job["error"] = str(exc)
                    self._append_job_log_unlocked(job, f"AI 仿写任务失败：{exc}", "rewrite")
                    self._set_job_progress_unlocked(job, 100, "仿写失败", "failed", 0, total)
                    self._persist_unlocked()

    def _normalize_rewrite_targets(self, targets: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        normalized: List[Dict[str, str]] = []
        seen = set()
        for item in targets or []:
            if isinstance(item, str):
                raw_path = item
                raw_name = ""
            elif isinstance(item, dict):
                raw_path = item.get("path") or ""
                raw_name = item.get("name") or ""
            else:
                continue
            path = str(raw_path).strip()
            if not path or path in seen:
                continue
            seen.add(path)
            name = str(raw_name).strip()[:120] or Path(path).name
            normalized.append({"path": path, "name": name})
        if not normalized:
            raise ValueError("请选择要仿写的笔记")
        return normalized

    def _prepare_job_for_response(self, job: Dict[str, Any]) -> None:
        job.setdefault("type", "collect")
        job["log_groups"] = self._job_log_groups(job)

    def _normalize_job_log_type(self, job: Dict[str, Any], log_type: Optional[str] = None) -> str:
        raw = str(log_type or "").strip().lower()
        if raw in {"crawl", "collect", "spider", "scrape"}:
            return "crawl"
        if raw in {"rewrite", "ai_rewrite"}:
            return "rewrite"
        return "rewrite" if job.get("type") == "rewrite" else "crawl"

    def _normalize_log_entry(self, item: Any, fallback_type: str = "") -> Dict[str, str]:
        if isinstance(item, dict):
            entry = {
                "time": str(item.get("time") or ""),
                "message": str(item.get("message") or ""),
            }
            log_type = str(item.get("type") or fallback_type or "").strip().lower()
        else:
            entry = {"time": "", "message": str(item)}
            log_type = str(fallback_type or "").strip().lower()
        if log_type in JOB_LOG_TYPES:
            entry["type"] = log_type
        return entry

    def _is_rewrite_log_message(self, message: str) -> bool:
        return any(marker in str(message or "") for marker in REWRITE_LOG_MARKERS)

    def _empty_log_groups(self) -> Dict[str, List[Dict[str, str]]]:
        return {"crawl": [], "rewrite": []}

    def _job_log_groups(self, job: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
        groups = self._empty_log_groups()
        stored_groups = job.get("log_groups")
        if isinstance(stored_groups, dict):
            for log_type in JOB_LOG_TYPES:
                entries = stored_groups.get(log_type)
                if isinstance(entries, list):
                    groups[log_type] = [
                        self._normalize_log_entry(item, log_type)
                        for item in entries
                    ][-120:]
        if groups["crawl"] or groups["rewrite"]:
            return groups

        rewrite_active = job.get("type") == "rewrite"
        for item in job.get("logs") or []:
            entry = self._normalize_log_entry(item)
            log_type = entry.get("type")
            if log_type not in JOB_LOG_TYPES:
                log_type = "rewrite" if rewrite_active or self._is_rewrite_log_message(entry.get("message", "")) else "crawl"
                entry["type"] = log_type
            if log_type == "rewrite":
                rewrite_active = True
            groups[log_type].append(entry)
        for log_type in JOB_LOG_TYPES:
            groups[log_type] = groups[log_type][-120:]
        return groups

    def _append_job_log_unlocked(self, job: Dict[str, Any], message: str, log_type: Optional[str] = None) -> None:
        normalized_type = self._normalize_job_log_type(job, log_type)
        entry = {"time": now_text(), "message": str(message), "type": normalized_type}
        job.setdefault("logs", []).append(entry)
        job["logs"] = job["logs"][-120:]
        groups = job.setdefault("log_groups", self._empty_log_groups())
        if not isinstance(groups, dict):
            groups = self._empty_log_groups()
            job["log_groups"] = groups
        for key in JOB_LOG_TYPES:
            if not isinstance(groups.get(key), list):
                groups[key] = []
        groups[normalized_type].append(entry)
        groups[normalized_type] = groups[normalized_type][-120:]

    def _set_job_progress_unlocked(
        self,
        job: Dict[str, Any],
        value: Any,
        label: str,
        phase: str,
        current: Optional[int] = None,
        total: Optional[int] = None,
    ) -> None:
        try:
            numeric = int(round(float(value)))
        except (TypeError, ValueError):
            numeric = 0
        progress = {
            "value": max(0, min(100, numeric)),
            "label": str(label or "").strip() or "处理中",
            "phase": str(phase or "").strip() or "running",
        }
        if current is not None:
            progress["current"] = current
        if total is not None:
            progress["total"] = total
        job["progress"] = progress

    def _update_collect_progress_unlocked(self, job: Dict[str, Any], message: str) -> None:
        if job.get("type", "collect") != "collect":
            return
        text = str(message or "")
        detail_match = re.search(r"拉取详情\s+.+?\s+(\d+)\s*/\s*(\d+)", text)
        image_match = re.search(r"正在生成配图\s+(\d+)\s*/\s*(\d+)", text)
        if "开始搜索关键词" in text:
            self._set_job_progress_unlocked(job, 8, "搜索关键词", "searching")
        elif "获取到" in text and "搜索结果" in text:
            self._set_job_progress_unlocked(job, 14, "搜索完成", "searching")
        elif detail_match:
            current = to_int(detail_match.group(1), 0)
            total = to_int(detail_match.group(2), 0)
            value = 16 + (current / total) * 62 if total else 16
            self._set_job_progress_unlocked(job, value, f"详情 {current}/{total}", "collecting", current, total)
        elif "已保存" in text:
            self._set_job_progress_unlocked(job, 82, "保存笔记", "saving")
        elif "采集完成" in text:
            self._set_job_progress_unlocked(job, 88, "采集完成", "collect_done")
        elif "开始自动生成仿写文案" in text:
            self._set_job_progress_unlocked(job, 90, "自动仿写", "rewrite")
        elif "正在请求文本模型" in text or "正在准备仿写输出目录" in text:
            self._set_job_progress_unlocked(job, 92, "自动仿写：文本生成", "rewrite")
        elif image_match:
            current = to_int(image_match.group(1), 0)
            total = to_int(image_match.group(2), 0)
            value = 94 + (current / total) * 3 if total else 94
            self._set_job_progress_unlocked(job, value, f"自动配图 {current}/{total}", "rewrite_images", current, total)
        elif "仿写完成" in text:
            self._set_job_progress_unlocked(job, 98, "自动仿写完成", "rewrite_done")

    def _set_rewrite_item_progress_unlocked(
        self,
        job: Dict[str, Any],
        index: int,
        total: int,
        message: str,
        phase: str,
    ) -> None:
        total = max(total, 1)
        fraction = self._rewrite_phase_fraction(message)
        value = ((max(index, 1) - 1 + fraction) / total) * 100
        if fraction < 1:
            value = min(value, 99)
        self._set_job_progress_unlocked(
            job,
            value,
            f"{index}/{total} {message}",
            phase,
            index,
            total,
        )

    def _rewrite_phase_fraction(self, message: str) -> float:
        text = str(message or "")
        image_match = re.search(r"正在生成配图\s+(\d+)\s*/\s*(\d+)", text)
        if "开始仿写" in text:
            return 0.04
        if "正在准备仿写输出目录" in text:
            return 0.08
        if "正在请求文本模型" in text:
            return 0.22
        if "文本模型已返回" in text:
            return 0.46
        if "兜底分析" in text or "整理仿写结构" in text:
            return 0.56
        if image_match:
            current = to_int(image_match.group(1), 0)
            total = max(to_int(image_match.group(2), 1), 1)
            return min(0.82, 0.58 + (current / total) * 0.24)
        if "配图生成失败" in text:
            return 0.82
        if "正在写入仿写结果文件" in text:
            return 0.88
        if "正在写入仿写日志" in text:
            return 0.94
        if "仿写完成" in text:
            return 1.0
        if "失败" in text or "错误" in text or "异常" in text:
            return 0.96
        return 0.32

    def _job_source(self, job_id: str) -> str:
        with self.lock:
            job = self._find_job_unlocked(job_id)
            return job.get("source", "manual") if job else "manual"

    def _find_job_unlocked(self, job_id: str) -> Optional[Dict[str, Any]]:
        for job in self.jobs:
            if job.get("id") == job_id:
                return job
        return None

    def _running_job_unlocked(self) -> Optional[Dict[str, Any]]:
        for job in self.jobs:
            if job.get("status") == "running":
                return job
        return None

    def _persist_unlocked(self) -> None:
        write_json(JOB_HISTORY_PATH, self.jobs)


def normalize_run_times(schedule: Dict[str, Any]) -> List[str]:
    raw_times = schedule.get("run_times") or ["09:00"]
    if isinstance(raw_times, str):
        raw_times = re.split(r"[,，\s]+", raw_times)
    valid_times = []
    for item in raw_times:
        text = str(item).strip()
        match = re.fullmatch(r"(\d{1,2}):(\d{2})", text)
        if not match:
            continue
        hour = int(match.group(1))
        minute = int(match.group(2))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            valid_times.append(f"{hour:02d}:{minute:02d}")
    if not valid_times:
        valid_times = ["09:00"]

    daily_runs = to_int(schedule.get("daily_runs"), len(valid_times), 1, 24)
    if len(valid_times) == 1 and daily_runs > 1:
        start_hour, start_minute = [int(part) for part in valid_times[0].split(":")]
        start = start_hour * 60 + start_minute
        interval = 24 * 60 // daily_runs
        valid_times = []
        for index in range(daily_runs):
            minutes = (start + interval * index) % (24 * 60)
            valid_times.append(f"{minutes // 60:02d}:{minutes % 60:02d}")
    unique_times = []
    for item in valid_times:
        if item not in unique_times:
            unique_times.append(item)
    return unique_times[:daily_runs]


class SimpleScheduler:
    def __init__(self, config_store: ConfigStore, job_manager: JobManager):
        self.config_store = config_store
        self.job_manager = job_manager
        self.stop_event = threading.Event()
        self.thread: Optional[threading.Thread] = None
        self.state = read_json(SCHEDULER_STATE_PATH, {"run_keys": []})
        if not isinstance(self.state, dict):
            self.state = {"run_keys": []}

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=2)

    def _loop(self) -> None:
        while not self.stop_event.wait(20):
            try:
                self._tick()
            except Exception as exc:
                logger.warning(f"调度检查失败：{exc}")

    def _tick(self) -> None:
        config = self.config_store.load()
        schedule = config.get("schedule", {})
        if not schedule.get("enabled"):
            return
        now = datetime.now()
        run_times = normalize_run_times(schedule)
        current_hm = now.strftime("%H:%M")
        if current_hm not in run_times:
            return
        if schedule.get("cycle") == "weekly" and now.isoweekday() not in schedule.get("weekdays", []):
            return

        run_key = f"{schedule.get('cycle')}:{now.strftime('%Y-%m-%d')}:{current_hm}"
        run_keys = self.state.setdefault("run_keys", [])
        if run_key in run_keys:
            return
        if self.job_manager.has_running():
            return

        self.job_manager.start(source="schedule", config=config)
        run_keys.append(run_key)
        self.state["run_keys"] = run_keys[-200:]
        write_json(SCHEDULER_STATE_PATH, self.state)


def safe_output_path(output_root: Path, relative_path: str) -> Path:
    base = output_root.resolve()
    target = (base / relative_path).resolve()
    if target != base and base not in target.parents:
        raise ValueError("路径超出采集输出目录")
    return target


def ensure_manageable_output_target(output_root: Path, target: Path) -> Path:
    base = output_root.resolve()
    resolved = target.resolve()
    if resolved == base:
        raise ValueError("不能操作采集输出根目录")
    relative_parts = resolved.relative_to(base).parts
    if any(part.startswith(".") or part in INTERNAL_DATA_FILES for part in relative_parts):
        raise ValueError("包含系统保留目录，不能操作")
    return resolved


def is_hidden_output_entry(path: Path) -> bool:
    return path.name.startswith(".") or path.name in INTERNAL_DATA_FILES


def has_visible_output_content(path: Path) -> bool:
    if path.is_file():
        return True
    if not path.is_dir():
        return False
    try:
        children = list(path.iterdir())
    except OSError:
        return False
    for child in children:
        if is_hidden_output_entry(child):
            continue
        if child.is_file() or (child.is_dir() and has_visible_output_content(child)):
            return True
    return False


def list_output_files(output_root: Path, relative_path: str = "") -> Dict[str, Any]:
    ensure_data_dirs()
    output_root.mkdir(parents=True, exist_ok=True)
    target = safe_output_path(output_root, relative_path or "")
    if not target.exists():
        raise FileNotFoundError("路径不存在")
    if target.is_file():
        target = target.parent
    sortable_entries = []
    for child in target.iterdir():
        if is_hidden_output_entry(child):
            continue
        if child.is_dir() and not has_visible_output_content(child):
            continue
        stat = child.stat()
        rewriteable = (
            (child.is_dir() and child.joinpath("info.json").exists())
            or (
                child.is_file()
                and child.suffix.lower() in [".md", ".markdown"]
                and child.parent.joinpath("info.json").exists()
            )
        )
        sortable_entries.append({
            "is_file": child.is_file(),
            "modified_ts": stat.st_mtime,
            "name": child.name,
            "path": relative_to_root(child, output_root),
            "type": "directory" if child.is_dir() else "file",
            "size": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            "previewable": child.suffix.lower() in [".md", ".txt", ".json", ".log"],
            "rewriteable": rewriteable,
        })
    sortable_entries.sort(key=lambda item: (item["is_file"], -item["modified_ts"], item["name"].lower()))
    entries = [{
        "name": item["name"],
        "path": item["path"],
        "type": item["type"],
        "size": item["size"],
        "modified": item["modified"],
        "previewable": item["previewable"],
        "rewriteable": item["rewriteable"],
    } for item in sortable_entries]
    parent = ""
    if target.resolve() != output_root.resolve():
        parent = target.parent.resolve().relative_to(output_root.resolve()).as_posix()
    return {
        "cwd": target.resolve().relative_to(output_root.resolve()).as_posix() if target.resolve() != output_root.resolve() else "",
        "parent": parent,
        "entries": entries,
    }


def create_output_directory(output_root: Path, parent_path: str, name: str) -> Dict[str, Any]:
    ensure_data_dirs()
    output_root.mkdir(parents=True, exist_ok=True)

    parent = safe_output_path(output_root, str(parent_path or "").strip())
    if not parent.exists():
        raise FileNotFoundError("父目录不存在")
    if not parent.is_dir():
        raise ValueError("父路径不是目录")

    normalized_name = str(name or "").strip()
    if not normalized_name:
        raise ValueError("目录名称不能为空")
    if normalized_name in {".", ".."}:
        raise ValueError("目录名称不合法")
    if "/" in normalized_name or "\\" in normalized_name:
        raise ValueError("目录名称不能包含路径分隔符")
    if normalized_name.startswith(".") or normalized_name in INTERNAL_DATA_FILES:
        raise ValueError("目录名称不可用")

    target = (parent / normalized_name).resolve()
    base = output_root.resolve()
    if target != base and base not in target.parents:
        raise ValueError("目录超出采集输出目录")
    if target.exists():
        raise FileExistsError("目录已存在")

    target.mkdir(parents=False, exist_ok=False)
    return {
        "path": relative_to_root(target, output_root),
        "name": target.name,
    }


def delete_output_entries(output_root: Path, paths: List[str]) -> Dict[str, Any]:
    ensure_data_dirs()
    output_root.mkdir(parents=True, exist_ok=True)

    normalized_paths = []
    for raw_path in paths or []:
        rel = str(raw_path or "").strip()
        if rel and rel not in normalized_paths:
            normalized_paths.append(rel)
    if not normalized_paths:
        raise ValueError("请选择要删除的文件或目录")

    targets = []
    for rel in normalized_paths:
        target = safe_output_path(output_root, rel)
        protected_target = ensure_manageable_output_target(output_root, target)
        if not protected_target.exists():
            raise FileNotFoundError(f"路径不存在：{rel}")
        targets.append(protected_target)

    base = output_root.resolve()
    unique_targets = []
    for target in sorted(targets, key=lambda item: len(item.relative_to(base).parts)):
        if any(existing == target or existing in target.parents for existing in unique_targets):
            continue
        unique_targets.append(target)

    deleted_paths = []
    for target in unique_targets:
        deleted_paths.append(relative_to_root(target, output_root))
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()

    return {
        "deleted_count": len(deleted_paths),
        "deleted_paths": deleted_paths,
    }


def read_output_text_file(output_root: Path, relative_path: str, limit: int = 300000) -> Dict[str, Any]:
    target = safe_output_path(output_root, relative_path)
    if not target.is_file():
        raise FileNotFoundError("文件不存在")
    if target.suffix.lower() not in [".md", ".txt", ".json", ".log"]:
        raise ValueError("该文件不支持文本预览")
    text = target.read_text(encoding="utf-8", errors="replace")
    truncated = len(text) > limit
    return {
        "path": relative_to_root(target, output_root),
        "content": text[:limit],
        "truncated": truncated,
    }


def clean_empty_batch_dirs(output_root: Path, include_root: bool = False) -> None:
    if not output_root.exists():
        return
    root = output_root.resolve()

    def prune(path: Path) -> None:
        try:
            children = list(path.iterdir())
        except OSError:
            return
        for child in children:
            if child.is_dir() and not is_hidden_output_entry(child):
                prune(child)
        try:
            if (include_root or path.resolve() != root) and not any(path.iterdir()):
                path.rmdir()
        except OSError:
            return

    prune(output_root)
