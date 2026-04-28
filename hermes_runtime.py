import json
import os
import re
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from runtime_paths import DATA_ROOT, PROJECT_ROOT


HERMES_VENDOR_COMMIT = "98d75dea5a86aec599b1e081f8bbe9170bd3f964"
HERMES_VENDOR_PATH = PROJECT_ROOT / "vendor" / "hermes-agent"
DEFAULT_HERMES_HOME = DATA_ROOT / "hermes"
MEMORY_DIR_NAME = "memories"
STATE_DB_NAME = "state.db"
SECTION_DELIMITER = "\u00a7"
MEMORY_CONTEXT_LIMIT = 3600
SESSION_CONTENT_LIMIT = 1800
MEMORY_TARGETS = {
    "memory": {"filename": "MEMORY.md", "limit": 2200, "label": "MEMORY"},
    "user": {"filename": "USER.md", "limit": 1375, "label": "USER PROFILE"},
}
SENSITIVE_PATTERNS = [
    re.compile(r"(?i)\b(web_session|authorization|cookie|cookies|api[_-]?key|dashscope_api_key|token|secret)\b\s*[:=]\s*[^;\s,]+"),
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{12,}"),
    re.compile(r"(?i)\b(sk|ak|dashscope)[-_][A-Za-z0-9._~+/=-]{12,}"),
    re.compile(r"(?i)\b(web_session=)[^;\s]+"),
    re.compile(r"(?i)\b(Authorization:\s*)[^\n]+"),
    re.compile(r"(?i)\b(Cookie:\s*)[^\n]+"),
]
LOCAL_PATH_RE = re.compile(r"(/Users/[^ \n\r\t,，。)）]+|/private/var/[^ \n\r\t,，。)）]+|[A-Za-z]:\\[^ \n\r\t,，。)）]+)")


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def resolve_hermes_home(memory_config: Dict[str, Any]) -> Path:
    configured = str(memory_config.get("hermes_home") or "").strip()
    if not configured:
        return DEFAULT_HERMES_HOME.resolve()
    expanded = os.path.expandvars(os.path.expanduser(configured))
    home = Path(expanded)
    if not home.is_absolute():
        home = DATA_ROOT / home
    return home.resolve()


def memory_config_from(config: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(config, dict):
        return {}
    memory = config.get("memory")
    if isinstance(memory, dict):
        return memory
    return config


def sanitize_memory_text(value: Any, max_len: int = 1600) -> str:
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    for pattern in SENSITIVE_PATTERNS:
        text = pattern.sub(lambda match: f"{match.group(1) if match.groups() else ''}[redacted]", text)
    text = LOCAL_PATH_RE.sub("[local_path]", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = text.strip()
    return text[:max_len].strip()


def compact_text(value: Any, max_len: int = 260) -> str:
    text = sanitize_memory_text(value, max_len=max_len * 2)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len].strip()


class HermesRuntime:
    """Spider_XHS adapter for the vendored Hermes memory substrate.

    The adapter intentionally exposes only bounded memory operations. It uses
    Hermes-compatible MEMORY.md / USER.md files and a local SQLite FTS session
    store, while keeping high-risk agent tools out of the Spider_XHS backend.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None) -> None:
        self.memory_config = memory_config_from(config)
        self.enabled = bool(self.memory_config.get("enabled"))
        self.hermes_home = resolve_hermes_home(self.memory_config)
        self.session_search_enabled = bool(self.memory_config.get("session_search_enabled", True))
        self.top_k = max(1, min(int(self.memory_config.get("top_k") or 8), 20))
        self.lock = threading.RLock()

    @property
    def memories_dir(self) -> Path:
        return self.hermes_home / MEMORY_DIR_NAME

    @property
    def state_db_path(self) -> Path:
        return self.hermes_home / STATE_DB_NAME

    def status(self) -> Dict[str, Any]:
        vendor_available = HERMES_VENDOR_PATH.exists()
        initialized = self.memories_dir.exists() and self.state_db_path.exists()
        memory_counts = {}
        if initialized:
            for target in MEMORY_TARGETS:
                try:
                    memory_counts[target] = len(self._read_entries(target))
                except Exception:
                    memory_counts[target] = 0
        message = "记忆功能未启用"
        if self.enabled and not vendor_available:
            message = "Hermes Vendor 源码缺失"
        elif self.enabled and initialized:
            message = "Hermes 记忆中心已启用"
        elif self.enabled:
            message = "Hermes 记忆中心等待初始化"
        return {
            "enabled": self.enabled,
            "available": vendor_available,
            "initialized": initialized,
            "message": message,
            "hermes_home": str(self.hermes_home),
            "vendor_path": str(HERMES_VENDOR_PATH),
            "vendor_commit": HERMES_VENDOR_COMMIT,
            "session_search_enabled": self.session_search_enabled,
            "top_k": self.top_k,
            "memory_counts": memory_counts,
            "last_synced_at": self._last_synced_at(),
        }

    def initialize(self) -> None:
        self._require_enabled()
        self.memories_dir.mkdir(parents=True, exist_ok=True)
        for target in MEMORY_TARGETS:
            path = self._memory_path(target)
            if not path.exists():
                path.write_text("", encoding="utf-8")
        self._ensure_db()

    def list_memory(self, target: str = "memory") -> Dict[str, Any]:
        self.initialize()
        normalized = self._normalize_target(target)
        entries = self._read_entries(normalized)
        limit = int(MEMORY_TARGETS[normalized]["limit"])
        used = len(self._memory_path(normalized).read_text(encoding="utf-8"))
        return {
            "target": normalized,
            "label": MEMORY_TARGETS[normalized]["label"],
            "entries": [
                {"index": index, "content": entry, "chars": len(entry)}
                for index, entry in enumerate(entries)
            ],
            "used_chars": used,
            "limit_chars": limit,
        }

    def add(self, target: str, content: Any, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self.initialize()
        normalized = self._normalize_target(target)
        entry = sanitize_memory_text(content, max_len=900)
        if not entry:
            raise ValueError("记忆内容不能为空")
        entries = self._read_entries(normalized)
        if entry in entries:
            return {"success": True, "target": normalized, "duplicate": True, "entry": entry}
        entries.append(entry)
        self._write_entries(normalized, entries)
        self._touch_sync(metadata)
        return {"success": True, "target": normalized, "entry": entry, "duplicate": False}

    def replace(self, target: str, old_text: Any, content: Any) -> Dict[str, Any]:
        self.initialize()
        normalized = self._normalize_target(target)
        old = str(old_text or "").strip()
        new_entry = sanitize_memory_text(content, max_len=900)
        if not old:
            raise ValueError("缺少要替换的原记忆片段")
        if not new_entry:
            raise ValueError("新记忆内容不能为空")
        entries = self._read_entries(normalized)
        matches = [index for index, entry in enumerate(entries) if old in entry]
        if len(matches) != 1:
            raise ValueError("原记忆片段必须唯一匹配一条记忆")
        entries[matches[0]] = new_entry
        self._write_entries(normalized, entries)
        self._touch_sync()
        return {"success": True, "target": normalized, "index": matches[0], "entry": new_entry}

    def remove(self, target: str, old_text: Any) -> Dict[str, Any]:
        self.initialize()
        normalized = self._normalize_target(target)
        old = str(old_text or "").strip()
        if not old:
            raise ValueError("缺少要删除的记忆片段")
        entries = self._read_entries(normalized)
        matches = [index for index, entry in enumerate(entries) if old in entry]
        if len(matches) != 1:
            raise ValueError("原记忆片段必须唯一匹配一条记忆")
        removed = entries.pop(matches[0])
        self._write_entries(normalized, entries)
        self._touch_sync()
        return {"success": True, "target": normalized, "removed": removed}

    def search(self, query: Any, top_k: Optional[int] = None) -> Dict[str, Any]:
        self.initialize()
        q = compact_text(query, max_len=180)
        limit = max(1, min(int(top_k or self.top_k), 20))
        results: List[Dict[str, Any]] = []
        q_lower = q.lower()
        for target in MEMORY_TARGETS:
            for index, entry in enumerate(self._read_entries(target)):
                haystack = entry.lower()
                if not q or q_lower in haystack:
                    score = 2 if q and q_lower in haystack else 1
                    results.append({
                        "type": "memory",
                        "target": target,
                        "index": index,
                        "content": entry,
                        "score": score,
                        "created_at": "",
                    })
        if self.session_search_enabled and q:
            results.extend(self._search_sessions(q, limit=limit))
        results.sort(key=lambda item: (item.get("score", 0), item.get("created_at") or ""), reverse=True)
        return {"query": q, "results": results[:limit]}

    def build_context(self, query: Any, top_k: Optional[int] = None) -> str:
        if not self.enabled:
            return ""
        try:
            search_result = self.search(query, top_k=top_k)
        except Exception:
            return ""
        lines = []
        for item in search_result.get("results") or []:
            content = compact_text(item.get("content"), max_len=420)
            if not content:
                continue
            label = item.get("target") or item.get("type") or "memory"
            lines.append(f"- [{label}] {content}")
        if not lines:
            return ""
        body = "\n".join(lines)[:MEMORY_CONTEXT_LIMIT]
        return (
            "<memory-context>\n"
            "[System note: The following is recalled Hermes memory context, "
            "NOT new user input. Treat as background preferences and project knowledge.]\n\n"
            f"{body}\n"
            "</memory-context>"
        )

    def sync_turn(
        self,
        user_content: Any,
        assistant_content: Any,
        metadata: Optional[Dict[str, Any]] = None,
        session_id: str = "spider_xhs",
    ) -> Dict[str, Any]:
        if not self.enabled:
            return {"success": False, "disabled": True}
        self.initialize()
        safe_user = sanitize_memory_text(user_content, max_len=SESSION_CONTENT_LIMIT)
        safe_assistant = sanitize_memory_text(assistant_content, max_len=SESSION_CONTENT_LIMIT)
        if not safe_user and not safe_assistant:
            return {"success": False, "message": "没有可同步的内容"}
        meta = metadata or {}
        with self.lock, sqlite3.connect(self.state_db_path) as conn:
            for role, content in [("user", safe_user), ("assistant", safe_assistant)]:
                if not content:
                    continue
                cursor = conn.execute(
                    "INSERT INTO spider_memory_sessions "
                    "(session_id, role, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)",
                    (session_id, role, content, json.dumps(meta, ensure_ascii=False), now_text()),
                )
                row_id = cursor.lastrowid
                try:
                    conn.execute(
                        "INSERT INTO spider_memory_sessions_fts(rowid, content) VALUES (?, ?)",
                        (row_id, content),
                    )
                except sqlite3.OperationalError:
                    pass
            conn.commit()
        self._touch_sync(meta)
        return {"success": True}

    def sync_profile(self, creator_profile: Dict[str, Any]) -> Dict[str, Any]:
        if not self.enabled:
            return {"success": False, "disabled": True}
        profile = creator_profile if isinstance(creator_profile, dict) else {}
        parts = [
            f"账号定位：{compact_text(profile.get('identity'), 160)}",
            f"业务背景：{compact_text(profile.get('business_context'), 180)}",
            f"目标人群：{compact_text(profile.get('target_audience'), 180)}",
            f"转化目标：{compact_text(profile.get('conversion_goal'), 160)}",
            f"写作风格：{compact_text(profile.get('writing_style'), 220)}",
            f"项目人格：{compact_text(profile.get('content_persona'), 180)}",
            f"禁用表达：{compact_text(profile.get('forbidden_rules'), 180)}",
        ]
        if compact_text(profile.get("sample_texts"), 40):
            parts.append("历史文案样本：已配置，仅用于学习语气、节奏和词汇偏好，不保存原文")
        content = "[Spider_XHS创作画像] " + "；".join(part for part in parts if not part.endswith("："))
        return self._upsert_prefixed_entry("user", "[Spider_XHS创作画像]", content)

    def sync_collect_result(self, result: Dict[str, Any]) -> Dict[str, Any]:
        if not self.enabled or not self.memory_config.get("write_after_collect", True):
            return {"success": False, "disabled": True}
        keywords = [
            str(item.get("keyword") or "").strip()
            for item in result.get("keywords") or []
            if str(item.get("keyword") or "").strip()
        ]
        titles = [
            compact_text(item.get("title"), 48)
            for item in sorted(result.get("items") or [], key=lambda x: str(x.get("liked_count") or ""), reverse=True)[:5]
        ]
        user = f"采集任务：关键词 {', '.join(keywords[:8])}，保存 {result.get('saved_count', 0)} 篇。"
        assistant = f"高表现样本：{' / '.join(title for title in titles if title)}"
        return self.sync_turn(user, assistant, {"source": "collect", "run_dir": result.get("run_dir")})

    def sync_rewrite_result(self, result: Dict[str, Any], notes: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not self.enabled or not self.memory_config.get("write_after_rewrite", True):
            return {"success": False, "disabled": True}
        titles = [compact_text(note.get("title"), 60) for note in notes[:5]]
        articles = result.get("articles") or []
        strategies = [compact_text(article.get("strategy"), 120) for article in articles[:3]]
        user = f"AI仿写：主题 {compact_text(result.get('topic'), 120)}；参考样本 {' / '.join(t for t in titles if t)}。"
        assistant = f"生成 {result.get('article_count', len(articles))} 篇；策略 {'；'.join(s for s in strategies if s)}。"
        return self.sync_turn(user, assistant, {"source": "rewrite", "output_dir": result.get("output_dir")})

    def sync_edit_feedback(self, path: str, old_content: Any, new_content: Any) -> Dict[str, Any]:
        if not self.enabled or not self.memory_config.get("write_after_edit", True):
            return {"success": False, "disabled": True}
        old = str(old_content or "")
        new = str(new_content or "")
        if old == new:
            return {"success": False, "message": "内容未变化"}
        removed = self._line_delta(old, new)
        added = self._line_delta(new, old)
        if not removed and not added:
            return {"success": False, "message": "没有可提取的改稿偏好"}
        content = (
            f"[Spider_XHS改稿偏好] 用户编辑 {compact_text(path, 80)}："
            f"新增倾向「{compact_text(' / '.join(added), 180)}」；"
            f"删除或弱化「{compact_text(' / '.join(removed), 180)}」。"
        )
        return self.add("user", content, {"source": "manual_edit", "path": path})

    def _line_delta(self, left: str, right: str) -> List[str]:
        right_lines = {compact_text(line, 160) for line in right.splitlines() if compact_text(line, 160)}
        result = []
        for line in left.splitlines():
            compact = compact_text(line, 160)
            if len(compact) < 6 or compact in right_lines:
                continue
            result.append(compact)
            if len(result) >= 3:
                break
        return result

    def _require_enabled(self) -> None:
        if not self.enabled:
            raise RuntimeError("记忆功能未启用")
        if not HERMES_VENDOR_PATH.exists():
            raise FileNotFoundError("Hermes Vendor 源码缺失，请确认 vendor/hermes-agent 已存在")

    def _normalize_target(self, target: str) -> str:
        normalized = str(target or "memory").strip().lower()
        if normalized not in MEMORY_TARGETS:
            raise ValueError("记忆目标必须是 memory 或 user")
        return normalized

    def _memory_path(self, target: str) -> Path:
        normalized = self._normalize_target(target)
        return self.memories_dir / str(MEMORY_TARGETS[normalized]["filename"])

    def _read_entries(self, target: str) -> List[str]:
        path = self._memory_path(target)
        if not path.exists():
            return []
        raw = path.read_text(encoding="utf-8")
        return [entry.strip() for entry in raw.split(SECTION_DELIMITER) if entry.strip()]

    def _write_entries(self, target: str, entries: List[str]) -> None:
        normalized = self._normalize_target(target)
        limit = int(MEMORY_TARGETS[normalized]["limit"])
        text = f"\n{SECTION_DELIMITER}\n".join(entry.strip() for entry in entries if entry.strip())
        if len(text) > limit:
            raise ValueError(f"{MEMORY_TARGETS[normalized]['label']} 超出 {limit} 字符上限，请先合并或删除旧记忆")
        self._memory_path(normalized).write_text(text, encoding="utf-8")

    def _upsert_prefixed_entry(self, target: str, prefix: str, content: str) -> Dict[str, Any]:
        self.initialize()
        entries = self._read_entries(target)
        indexes = [index for index, entry in enumerate(entries) if entry.startswith(prefix)]
        if indexes:
            entries[indexes[0]] = sanitize_memory_text(content, max_len=1100)
        else:
            entries.append(sanitize_memory_text(content, max_len=1100))
        self._write_entries(target, entries)
        self._touch_sync({"source": "profile"})
        return {"success": True, "target": target}

    def _ensure_db(self) -> None:
        self.hermes_home.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.state_db_path) as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS spider_memory_sessions ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                "session_id TEXT NOT NULL,"
                "role TEXT NOT NULL,"
                "content TEXT NOT NULL,"
                "metadata_json TEXT NOT NULL DEFAULT '{}',"
                "created_at TEXT NOT NULL"
                ")"
            )
            try:
                conn.execute(
                    "CREATE VIRTUAL TABLE IF NOT EXISTS spider_memory_sessions_fts "
                    "USING fts5(content, content='spider_memory_sessions', content_rowid='id')"
                )
            except sqlite3.OperationalError:
                pass
            conn.execute(
                "CREATE TABLE IF NOT EXISTS spider_memory_meta ("
                "key TEXT PRIMARY KEY,"
                "value TEXT NOT NULL"
                ")"
            )
            conn.commit()

    def _search_sessions(self, query: str, limit: int) -> List[Dict[str, Any]]:
        self._ensure_db()
        safe_like = f"%{query}%"
        rows = []
        with sqlite3.connect(self.state_db_path) as conn:
            conn.row_factory = sqlite3.Row
            try:
                rows = conn.execute(
                    "SELECT s.content, s.role, s.created_at, s.metadata_json "
                    "FROM spider_memory_sessions_fts f "
                    "JOIN spider_memory_sessions s ON s.id = f.rowid "
                    "WHERE spider_memory_sessions_fts MATCH ? "
                    "ORDER BY rank LIMIT ?",
                    (self._fts_query(query), limit),
                ).fetchall()
            except sqlite3.OperationalError:
                rows = []
            if not rows:
                rows = conn.execute(
                    "SELECT content, role, created_at, metadata_json "
                    "FROM spider_memory_sessions WHERE content LIKE ? "
                    "ORDER BY id DESC LIMIT ?",
                    (safe_like, limit),
                ).fetchall()
        return [
            {
                "type": "session",
                "target": row["role"],
                "content": row["content"],
                "created_at": row["created_at"],
                "metadata": self._parse_json(row["metadata_json"]),
                "score": 1,
            }
            for row in rows
        ]

    def _fts_query(self, query: str) -> str:
        terms = re.findall(r"[\w\u3400-\u9fff]+", query)
        if not terms:
            return '"_"'
        return " OR ".join(f'"{term}"' for term in terms[:8])

    def _parse_json(self, value: str) -> Dict[str, Any]:
        try:
            parsed = json.loads(value or "{}")
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}

    def _touch_sync(self, metadata: Optional[Dict[str, Any]] = None) -> None:
        if not self.enabled:
            return
        self._ensure_db()
        with sqlite3.connect(self.state_db_path) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO spider_memory_meta(key, value) VALUES (?, ?)",
                ("last_synced_at", now_text()),
            )
            if metadata:
                conn.execute(
                    "INSERT OR REPLACE INTO spider_memory_meta(key, value) VALUES (?, ?)",
                    ("last_metadata", json.dumps(metadata, ensure_ascii=False)),
                )
            conn.commit()

    def _last_synced_at(self) -> str:
        if not self.state_db_path.exists():
            return ""
        try:
            with sqlite3.connect(self.state_db_path) as conn:
                row = conn.execute(
                    "SELECT value FROM spider_memory_meta WHERE key = ?",
                    ("last_synced_at",),
                ).fetchone()
                return str(row[0]) if row else ""
        except sqlite3.Error:
            return ""
