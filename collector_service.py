import json
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
    return datetime.now().strftime("%Y%m%d_%H%M%S")


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


def markdown_escape_table(value: Any) -> str:
    text = str(value or "")
    return text.replace("|", "\\|").replace("\n", "<br>")


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


def render_markdown(note: Dict[str, Any], keyword: str, media_items: List[Dict[str, Any]]) -> str:
    title = note.get("title") or "无标题"
    tags = note.get("tags") or []
    tag_text = " ".join([f"#{tag}" for tag in tags]) if tags else "无"
    lines = [
        f"# {title}",
        "",
        "## 基本信息",
        "",
        "| 字段 | 内容 |",
        "| --- | --- |",
        f"| 采集关键词 | {markdown_escape_table(keyword)} |",
        f"| 笔记 ID | {markdown_escape_table(note.get('note_id'))} |",
        f"| 笔记链接 | {markdown_escape_table(note.get('note_url'))} |",
        f"| 内容类型 | {markdown_escape_table(note.get('note_type'))} |",
        f"| 作者 | {markdown_escape_table(note.get('nickname'))} |",
        f"| 作者主页 | {markdown_escape_table(note.get('home_url'))} |",
        f"| 发布时间 | {markdown_escape_table(note.get('upload_time'))} |",
        f"| IP 属地 | {markdown_escape_table(note.get('ip_location'))} |",
        f"| 点赞 | {markdown_escape_table(note.get('liked_count'))} |",
        f"| 收藏 | {markdown_escape_table(note.get('collected_count'))} |",
        f"| 评论 | {markdown_escape_table(note.get('comment_count'))} |",
        f"| 分享 | {markdown_escape_table(note.get('share_count'))} |",
        f"| 标签 | {markdown_escape_table(tag_text)} |",
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

    lines.extend([
        "## 原始数据摘要",
        "",
        "```json",
        json.dumps(note, ensure_ascii=False, indent=2),
        "```",
        "",
    ])
    return "\n".join(lines)


def save_note_as_markdown(note: Dict[str, Any], keyword: str, keyword_dir: Path, output_root: Path) -> Dict[str, Any]:
    note_id = str(note.get("note_id") or uuid.uuid4().hex)
    title = safe_filename(note.get("title"), fallback="无标题", max_len=60)
    note_dir = keyword_dir / f"{title}_{note_id}"
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

    md_path = note_dir / f"{title}_{note_id}.md"
    md_path.write_text(render_markdown(note, keyword, media_items), encoding="utf-8")

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
        }
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
                        saved = save_note_as_markdown(note, keyword, keyword_dir, output_root)
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
            if job.get("status") == "running":
                job["status"] = "interrupted"
                job["finished_at"] = now_text()
                job["error"] = "服务重启，上一轮运行状态已失效"
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
                "source": source,
                "status": "running",
                "created_at": now_text(),
                "started_at": now_text(),
                "finished_at": None,
                "summary": summarize_config(config_snapshot),
                "logs": [],
                "result": None,
                "error": None,
            }
            self.jobs.insert(0, job)
            self.jobs = self.jobs[:50]
            self._persist_unlocked()

        thread = threading.Thread(target=self._run_job, args=(job["id"], config_snapshot), daemon=True)
        thread.start()
        return job

    def list_jobs(self) -> List[Dict[str, Any]]:
        with self.lock:
            return deepcopy(self.jobs)

    def has_running(self) -> bool:
        with self.lock:
            return self._running_job_unlocked() is not None

    def _run_job(self, job_id: str, config: Dict[str, Any]) -> None:
        def progress(message: str) -> None:
            with self.lock:
                job = self._find_job_unlocked(job_id)
                if not job:
                    return
                job.setdefault("logs", []).append({"time": now_text(), "message": message})
                job["logs"] = job["logs"][-120:]
                self._persist_unlocked()

        try:
            result = self.collector.run(config, source=self._job_source(job_id), progress=progress)
            with self.lock:
                job = self._find_job_unlocked(job_id)
                if job:
                    job["status"] = "success"
                    job["finished_at"] = now_text()
                    job["result"] = result
                    self._persist_unlocked()
        except Exception as exc:
            logger.exception(exc)
            with self.lock:
                job = self._find_job_unlocked(job_id)
                if job:
                    job["status"] = "failed"
                    job["finished_at"] = now_text()
                    job["error"] = str(exc)
                    self._persist_unlocked()

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


def list_output_files(output_root: Path, relative_path: str = "") -> Dict[str, Any]:
    ensure_data_dirs()
    output_root.mkdir(parents=True, exist_ok=True)
    target = safe_output_path(output_root, relative_path or "")
    if not target.exists():
        raise FileNotFoundError("路径不存在")
    if target.is_file():
        target = target.parent
    entries = []
    for child in sorted(target.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
        if child.name.startswith(".") or child.name in INTERNAL_DATA_FILES:
            continue
        stat = child.stat()
        entries.append({
            "name": child.name,
            "path": relative_to_root(child, output_root),
            "type": "directory" if child.is_dir() else "file",
            "size": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            "previewable": child.suffix.lower() in [".md", ".txt", ".json", ".log"],
        })
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


def clean_empty_batch_dirs(output_root: Path) -> None:
    if not output_root.exists():
        return
    for child in output_root.iterdir():
        if child.is_dir() and not any(child.iterdir()):
            shutil.rmtree(child, ignore_errors=True)
