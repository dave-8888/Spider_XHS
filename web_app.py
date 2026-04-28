import json
import mimetypes
import base64
import hashlib
import os
import shutil
import signal
import socket
import struct
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import request as urlrequest
from urllib.parse import parse_qs, unquote, urlparse

from loguru import logger

from apis.xhs_pc_apis import XHS_Apis
from collector_service import (
    ConfigStore,
    DATA_ROOT,
    JobManager,
    REWRITE_PREVIEW_TOPIC_SOURCE,
    RewriteService,
    SimpleScheduler,
    create_output_directory,
    delete_output_entries,
    detect_rewrite_requirement_conflicts,
    list_recent_markdown_files,
    list_output_files,
    read_output_text_file,
    relative_to_root,
    rename_output_entry,
    resolve_output_root,
    resolve_rewrite_output_root,
    safe_output_path,
    save_output_markdown_file,
)
from hermes_runtime import HermesRuntime
from runtime_paths import DATA_ROOT, RESOURCE_ROOT, WEB_ROOT, is_desktop_mode

HOST = "127.0.0.1"
PORT = int(str(os.getenv("SPIDER_XHS_PORT") or os.getenv("PORT") or 8765).strip())
LOGIN_URL = "https://www.xiaohongshu.com/explore"
BROWSER_READY_TIMEOUT_SECONDS = 10.0
BROWSER_READY_POLL_SECONDS = 0.25
RELATIVE_STORAGE_ROOT = DATA_ROOT if is_desktop_mode() else RESOURCE_ROOT
VDITOR_VENDOR_PREFIX = "/vendor/vditor/"

config_store = ConfigStore()
job_manager = JobManager(config_store)
scheduler = SimpleScheduler(config_store, job_manager)


class RewriteRequirementConflictError(Exception):
    def __init__(self, message: str, conflicts: List[Dict[str, str]]) -> None:
        super().__init__(message)
        self.conflicts = conflicts


def find_browser_executable() -> str:
    candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    raise RuntimeError("未找到 Chrome / Edge / Chromium，无法弹出登录浏览器")


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def fetch_json(url: str, timeout: int = 3) -> Dict[str, Any]:
    with urlrequest.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def recv_exact(sock: socket.socket, length: int) -> bytes:
    chunks = []
    remaining = length
    while remaining > 0:
        chunk = sock.recv(remaining)
        if not chunk:
            raise RuntimeError("浏览器调试连接已关闭")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def send_ws_text(sock: socket.socket, payload: Dict[str, Any]) -> None:
    data = json.dumps(payload).encode("utf-8")
    header = bytearray([0x81])
    if len(data) < 126:
        header.append(0x80 | len(data))
    elif len(data) < 65536:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", len(data)))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", len(data)))
    mask = os.urandom(4)
    masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(data))
    sock.sendall(bytes(header) + mask + masked)


def recv_ws_text(sock: socket.socket) -> Dict[str, Any]:
    while True:
        first, second = recv_exact(sock, 2)
        opcode = first & 0x0F
        masked = second & 0x80
        length = second & 0x7F
        if length == 126:
            length = struct.unpack("!H", recv_exact(sock, 2))[0]
        elif length == 127:
            length = struct.unpack("!Q", recv_exact(sock, 8))[0]
        mask = recv_exact(sock, 4) if masked else b""
        payload = recv_exact(sock, length) if length else b""
        if masked:
            payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        if opcode == 1:
            return json.loads(payload.decode("utf-8"))
        if opcode == 8:
            raise RuntimeError("浏览器调试连接已关闭")


def cdp_call(ws_url: str, method: str, params: Dict[str, Any] = None, timeout: int = 5) -> Dict[str, Any]:
    parsed = urlparse(ws_url)
    path = parsed.path + (f"?{parsed.query}" if parsed.query else "")
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    with socket.create_connection((parsed.hostname, parsed.port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        request_lines = [
            f"GET {path} HTTP/1.1",
            f"Host: {parsed.hostname}:{parsed.port}",
            "Upgrade: websocket",
            "Connection: Upgrade",
            f"Sec-WebSocket-Key: {key}",
            "Sec-WebSocket-Version: 13",
            "",
            "",
        ]
        sock.sendall("\r\n".join(request_lines).encode("utf-8"))
        response = b""
        while b"\r\n\r\n" not in response:
            response += sock.recv(1024)
        accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
        header_text = response.decode("utf-8", errors="ignore")
        if " 101 " not in header_text or accept not in header_text:
            raise RuntimeError("浏览器调试 WebSocket 握手失败")
        request_id = 1
        send_ws_text(sock, {"id": request_id, "method": method, "params": params or {}})
        while True:
            message = recv_ws_text(sock)
            if message.get("id") == request_id:
                if "error" in message:
                    raise RuntimeError(message["error"].get("message", "浏览器调试命令失败"))
                return message


def wait_for_browser_ws_url(port: int, timeout: float = BROWSER_READY_TIMEOUT_SECONDS) -> str:
    deadline = time.time() + max(timeout, BROWSER_READY_POLL_SECONDS)
    last_error: Optional[Exception] = None
    while time.time() < deadline:
        try:
            version = fetch_json(f"http://127.0.0.1:{port}/json/version")
            ws_url = str(version.get("webSocketDebuggerUrl") or "").strip()
            if ws_url:
                return ws_url
            last_error = RuntimeError("未获取到浏览器调试地址")
        except Exception as exc:
            last_error = exc
        time.sleep(BROWSER_READY_POLL_SECONDS)
    raise RuntimeError(f"浏览器调试端口未就绪：{last_error or '未知错误'}")


class BrowserLoginManager:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.process = None
        self.port = None
        self.started_at = None

    def start(self) -> Dict[str, Any]:
        with self.lock:
            if self.process and self.process.poll() is None and self.port:
                if self._browser_ready(timeout=2):
                    try:
                        self._open_login_window()
                    except Exception as exc:
                        logger.warning(f"复用登录浏览器失败，准备重新拉起：{exc}")
                        self._stop_process()
                        self.process = None
                        self.port = None
                        self.started_at = None
                    else:
                        return {
                            "status": "running",
                            "message": "登录浏览器已在运行，已重新打开小红书登录窗口",
                            "port": self.port,
                        }
                else:
                    logger.warning("登录浏览器进程仍在，但调试端口不可用，准备重新拉起")
                    self._stop_process()
                    self.process = None
                    self.port = None
                    self.started_at = None

            browser = find_browser_executable()
            self.port = find_free_port()
            self.started_at = time.time()
            profile_dir = DATA_ROOT / "login_browser_profile"
            profile_dir.mkdir(parents=True, exist_ok=True)
            self.process = subprocess.Popen(
                [
                    browser,
                    f"--remote-debugging-port={self.port}",
                    f"--user-data-dir={profile_dir}",
                    "--no-first-run",
                    "--no-default-browser-check",
                    LOGIN_URL,
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            try:
                wait_for_browser_ws_url(self.port)
            except Exception as exc:
                self._stop_process()
                self.process = None
                self.port = None
                self.started_at = None
                raise RuntimeError(f"未能成功拉起登录浏览器，请确认系统允许打开浏览器：{exc}") from exc
            return {
                "status": "started",
                "message": "已打开登录浏览器，请在弹出的浏览器中登录小红书；登录完成后页面会自动保存 Cookie",
                "port": self.port,
            }

    def status(self) -> Dict[str, Any]:
        with self.lock:
            if not self.port:
                return {"status": "idle", "message": "登录浏览器尚未启动"}
            if self.process and self.process.poll() is not None:
                return {"status": "closed", "message": "登录浏览器已关闭，请重新打开浏览器登录"}
            try:
                cookie_str = self._read_xhs_cookie_string()
            except Exception as exc:
                return {"status": "waiting", "message": f"等待浏览器登录中：{exc}"}

        if "web_session=" not in cookie_str:
            return {"status": "waiting", "message": "等待登录完成，暂未检测到 web_session Cookie"}

        validation = validate_login_cookie(cookie_str)
        if not validation["valid"]:
            return {
                "status": "waiting",
                "verified": False,
                "message": validation["message"],
                "user": validation["user"],
            }
        config_store.save({"login": {"cookies": cookie_str}})
        return {
            "status": "saved",
            "verified": True,
            "message": "登录有效，Cookie 已保存",
            "user": validation["user"],
        }

    def _read_xhs_cookie_string(self) -> str:
        ws_url = wait_for_browser_ws_url(self.port, timeout=3)
        try:
            message = cdp_call(ws_url, "Storage.getCookies")
            cookies = message.get("result", {}).get("cookies", [])
        except Exception:
            message = cdp_call(ws_url, "Network.getAllCookies")
            cookies = message.get("result", {}).get("cookies", [])
        return xhs_cookie_string(cookies)

    def _browser_ready(self, timeout: float = 1.5) -> bool:
        if not self.port:
            return False
        try:
            wait_for_browser_ws_url(self.port, timeout=timeout)
            return True
        except Exception:
            return False

    def _open_login_window(self) -> None:
        if not self.port:
            raise RuntimeError("登录浏览器尚未启动")
        ws_url = wait_for_browser_ws_url(self.port, timeout=3)
        try:
            response = cdp_call(ws_url, "Target.createTarget", {"url": LOGIN_URL, "newWindow": True})
        except Exception:
            response = cdp_call(ws_url, "Target.createTarget", {"url": LOGIN_URL})
        target_id = str(response.get("result", {}).get("targetId") or "").strip()
        if target_id:
            try:
                cdp_call(ws_url, "Target.activateTarget", {"targetId": target_id})
            except Exception:
                pass

    def _stop_process(self) -> None:
        if not self.process or self.process.poll() is not None:
            return
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)


def xhs_cookie_string(cookies: Any) -> str:
    parts = []
    seen = set()
    for cookie in cookies or []:
        domain = str(cookie.get("domain") or "")
        name = str(cookie.get("name") or "")
        value = str(cookie.get("value") or "")
        if "xiaohongshu.com" not in domain or not name or name in seen:
            continue
        seen.add(name)
        parts.append(f"{name}={value}")
    return "; ".join(parts)


browser_login_manager = BrowserLoginManager()


def json_response(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def text_response(handler: BaseHTTPRequestHandler, text: str, status: int = 200, content_type: str = "text/plain") -> None:
    body = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", f"{content_type}; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def error_response(handler: BaseHTTPRequestHandler, message: str, status: int = 400) -> None:
    json_response(handler, {"success": False, "message": message}, status=status)


def read_body(handler: BaseHTTPRequestHandler) -> Dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length <= 0:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    if not raw.strip():
        return {}
    return json.loads(raw)


def safe_web_path(url_path: str) -> Path:
    if url_path == "/":
        target = WEB_ROOT / "index.html"
    elif url_path in ["/rewrite", "/rewrite/"]:
        target = WEB_ROOT / "rewrite.html"
    elif url_path in ["/settings", "/settings/"]:
        target = WEB_ROOT / "settings.html"
    elif url_path in ["/advanced-settings", "/advanced-settings/"]:
        target = WEB_ROOT / "advanced-settings.html"
    else:
        rel = unquote(url_path.lstrip("/"))
        if rel.startswith("ui/"):
            rel = rel[3:]
        target = WEB_ROOT / rel
    resolved = target.resolve()
    if resolved != WEB_ROOT.resolve() and WEB_ROOT.resolve() not in resolved.parents:
        raise ValueError("非法静态文件路径")
    return resolved


def vditor_vendor_roots() -> List[Path]:
    project_root = Path(__file__).resolve().parent
    candidates = [
        RESOURCE_ROOT.parent / "js-runtime" / "node_modules" / "vditor",
        RESOURCE_ROOT / "node_modules" / "vditor",
        project_root / "node_modules" / "vditor",
        project_root / "build" / "js-runtime" / "node_modules" / "vditor",
    ]
    roots: List[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        resolved = candidate.resolve()
        key = str(resolved)
        if key in seen or not resolved.is_dir():
            continue
        roots.append(resolved)
        seen.add(key)
    return roots


def safe_vditor_vendor_path(relative_path: str) -> Path:
    rel = unquote(str(relative_path or "").lstrip("/"))
    if not rel or rel.endswith("/") or not rel.startswith("dist/"):
        raise FileNotFoundError("Vditor 资源不存在")
    for root in vditor_vendor_roots():
        dist_root = (root / "dist").resolve()
        target = (root / rel).resolve()
        if target != dist_root and dist_root not in target.parents:
            continue
        if target.is_file():
            return target
    raise FileNotFoundError("Vditor 资源不存在")


def parse_user_info(res: Dict[str, Any]) -> Dict[str, Any]:
    data = res.get("data") if isinstance(res, dict) else {}
    if not isinstance(data, dict):
        data = {}
    candidates = [
        data,
        data.get("user_info", {}) if isinstance(data.get("user_info"), dict) else {},
        data.get("basic_info", {}) if isinstance(data.get("basic_info"), dict) else {},
    ]
    result = {}
    for item in candidates:
        for key in ["nickname", "red_id", "user_id", "image", "avatar"]:
            if key in item and key not in result:
                result[key] = item.get(key)
    return result


def validate_login_cookie(cookies: str) -> Dict[str, Any]:
    if not cookies:
        return {
            "valid": False,
            "message": "缺少 Cookie，无法检查登录",
            "user": {},
            "raw_success": False,
        }
    success, msg, res = XHS_Apis().get_user_self_info2(cookies)
    data = res.get("data", {}) if isinstance(res, dict) else {}
    if not success:
        return {
            "valid": False,
            "message": msg,
            "user": parse_user_info(res or {}),
            "raw_success": success,
        }
    if data.get("guest") is True:
        return {
            "valid": False,
            "message": "当前浏览器仍是游客态，请在弹出的浏览器中完成小红书登录",
            "user": parse_user_info(res or {}),
            "raw_success": success,
        }
    return {
        "valid": True,
        "message": msg,
        "user": parse_user_info(res or {}),
        "raw_success": success,
    }


def open_in_file_manager(target: Path) -> None:
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(target)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return
    if os.name == "nt":
        os.startfile(str(target))  # type: ignore[attr-defined]
        return
    opener = shutil.which("xdg-open")
    if not opener:
        raise RuntimeError("当前系统未找到可用的文件管理器打开命令")
    subprocess.Popen([opener, str(target)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def normalize_file_root(value: Any = "") -> str:
    return "rewrite" if str(value or "").strip().lower() == "rewrite" else "crawl"


def resolve_file_output_root(config: Dict[str, Any], root: Any = "crawl") -> Path:
    return resolve_rewrite_output_root(config) if normalize_file_root(root) == "rewrite" else resolve_output_root(config)


def open_data_folder(relative_path: str = "", root: Any = "crawl") -> Dict[str, Any]:
    normalized_root = normalize_file_root(root)
    output_root = resolve_file_output_root(config_store.load(), normalized_root)
    output_root.mkdir(parents=True, exist_ok=True)
    target = safe_output_path(output_root, relative_path or "")
    if not target.exists():
        raise FileNotFoundError("路径不存在")
    folder = target if target.is_dir() else target.parent
    open_in_file_manager(folder)
    folder_path = "" if folder.resolve() == output_root.resolve() else relative_to_root(folder, output_root)
    return {
        "root": normalized_root,
        "path": folder_path,
        "name": folder.name,
        "output_root": str(output_root),
    }


def folder_picker_start_path(current_path: str = "") -> Path:
    raw = str(current_path or "").strip()
    fallback = resolve_output_root(config_store.load())
    if raw:
        expanded = os.path.expandvars(os.path.expanduser(raw))
        candidate = Path(expanded)
        if not candidate.is_absolute():
            candidate = RELATIVE_STORAGE_ROOT / candidate
    else:
        candidate = fallback

    candidate = candidate.resolve()
    if candidate.is_file():
        candidate = candidate.parent

    while not candidate.exists() and candidate != candidate.parent:
        candidate = candidate.parent

    if candidate.exists():
        return candidate
    return fallback if fallback.exists() else RELATIVE_STORAGE_ROOT


def run_folder_picker(command: List[str]) -> Optional[str]:
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode == 0:
        selected = result.stdout.strip()
        return selected or None
    if result.returncode == 1:
        return None
    raise RuntimeError(result.stderr.strip() or "目录选择器执行失败")


def pick_output_folder(current_path: str = "", prompt: str = "选择采集存放目录") -> Dict[str, Any]:
    start_path = folder_picker_start_path(current_path)
    safe_prompt = str(prompt or "选择采集存放目录").replace('"', '\\"')

    if sys.platform == "darwin":
        escaped = str(start_path).replace("\\", "\\\\").replace('"', '\\"')
        script = [
            f'set startFolder to POSIX file "{escaped}"',
            'try',
            f'set chosenFolder to choose folder with prompt "{safe_prompt}" default location startFolder',
            'return POSIX path of chosenFolder',
            'on error number -128',
            'return ""',
            'end try',
        ]
        selected = run_folder_picker(["osascript", *sum([["-e", line] for line in script], [])])
    elif os.name == "nt":
        escaped = str(start_path).replace("'", "''")
        powershell_prompt = str(prompt or "选择采集存放目录").replace("'", "''")
        command = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; "
            f"$dialog.Description = '{powershell_prompt}'; "
            "$dialog.ShowNewFolderButton = $true; "
            f"$dialog.SelectedPath = '{escaped}'; "
            "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { "
            "Write-Output $dialog.SelectedPath "
            "}"
        )
        selected = run_folder_picker(["powershell", "-NoProfile", "-STA", "-Command", command])
    else:
        zenity = shutil.which("zenity")
        kdialog = shutil.which("kdialog")
        if zenity:
            selected = run_folder_picker([
                zenity,
                "--file-selection",
                "--directory",
                f"--filename={start_path}{os.sep}",
                f"--title={prompt}",
            ])
        elif kdialog:
            selected = run_folder_picker([
                kdialog,
                f"--title={prompt}",
                "--getexistingdirectory",
                str(start_path),
            ])
        else:
            raise RuntimeError("当前系统未找到可用的目录选择器（需要 zenity 或 kdialog）")

    if not selected:
        return {"canceled": True}

    folder = Path(os.path.expandvars(os.path.expanduser(selected))).resolve()
    if not folder.exists() or not folder.is_dir():
        raise RuntimeError("所选目录无效")

    return {
        "canceled": False,
        "folder": {
            "path": str(folder),
            "name": folder.name,
        },
    }


def run_manual_rewrite(payload: Dict[str, Any]) -> Dict[str, Any]:
    relative_path = str(payload.get("path") or "").strip()
    if not relative_path:
        raise ValueError("请选择要仿写的笔记")
    root = normalize_file_root(payload.get("root"))
    config = config_store.load()
    rewrite_config = dict(config.get("rewrite", {}) if isinstance(config.get("rewrite"), dict) else {})
    topic = str(payload.get("topic") or rewrite_config.get("topic") or "创业沙龙").strip()
    topic_source = str(payload.get("topic_source") or "").strip()
    if topic_source == REWRITE_PREVIEW_TOPIC_SOURCE and not bool(payload.get("confirmed_conflicts")):
        conflicts = detect_rewrite_requirement_conflicts(topic, rewrite_config)
        if conflicts:
            raise RewriteRequirementConflictError("本次仿写要求可能和旧创作画像或默认要求冲突", conflicts)
    if topic:
        rewrite_config["topic"] = topic
    if topic_source == REWRITE_PREVIEW_TOPIC_SOURCE:
        rewrite_config["_topic_source"] = topic_source
    if "generate_images" in payload:
        rewrite_config["generate_images"] = bool(payload.get("generate_images"))
    rewrite_config["_memory"] = config.get("memory", {})
    service = RewriteService(
        resolve_file_output_root(config, root),
        resolve_rewrite_output_root(config),
        rewrite_config,
        allow_plain_markdown_sources=root == "rewrite",
    )
    return service.rewrite_note(relative_path, topic=topic)


def run_manual_rewrite_job(payload: Dict[str, Any]) -> Dict[str, Any]:
    raw_targets = payload.get("targets")
    if raw_targets is None:
        raw_targets = [{"path": payload.get("path"), "name": payload.get("name")}]
    if not isinstance(raw_targets, list):
        raise ValueError("仿写目标格式不正确")
    config = config_store.load()
    rewrite_config = config.get("rewrite", {}) if isinstance(config.get("rewrite"), dict) else {}
    topic = str(payload.get("topic") or rewrite_config.get("topic") or "创业沙龙").strip() or "创业沙龙"
    topic_source = str(payload.get("topic_source") or "").strip()
    if topic_source == REWRITE_PREVIEW_TOPIC_SOURCE:
        if not bool(payload.get("confirmed_conflicts")):
            conflicts = detect_rewrite_requirement_conflicts(topic, rewrite_config)
            if conflicts:
                raise RewriteRequirementConflictError("本次仿写要求可能和旧创作画像或默认要求冲突", conflicts)
        config.setdefault("rewrite", {})["_topic_source"] = topic_source
    return job_manager.start_rewrite(raw_targets, topic=topic, config=config)


def run_style_profile_job(payload: Dict[str, Any]) -> Dict[str, Any]:
    style_payload = {
        "user_url": str(payload.get("user_url") or "").strip(),
        "sample_selection": "top_liked",
        "sample_limit": payload.get("sample_limit", 30),
        "include_image_ocr": bool(payload.get("include_image_ocr")),
    }
    config = config_store.save({"style_profile": style_payload})
    style_config = config.get("style_profile", {}) if isinstance(config.get("style_profile"), dict) else {}
    return job_manager.start_style_profile(
        user_url=style_config.get("user_url", ""),
        sample_limit=style_config.get("sample_limit", 30),
        include_image_ocr=style_config.get("include_image_ocr", False),
        config=config,
    )


def apply_style_profile_draft(payload: Dict[str, Any]) -> Dict[str, Any]:
    profile_draft = payload.get("profile_draft")
    if not isinstance(profile_draft, dict):
        raise ValueError("缺少可应用的创作画像草稿")
    saved_config = config_store.save({
        "rewrite": {
            "creator_profile": profile_draft,
        }
    })
    sync_profile_memory(saved_config)
    return config_store.public()


def sync_profile_memory(config: Dict[str, Any]) -> None:
    try:
        rewrite = config.get("rewrite", {}) if isinstance(config.get("rewrite"), dict) else {}
        profile = rewrite.get("creator_profile") if isinstance(rewrite.get("creator_profile"), dict) else {}
        if profile:
            HermesRuntime(config).sync_profile(profile)
    except Exception as exc:
        logger.warning(f"Hermes 创作画像同步失败：{exc}")


def memory_runtime() -> HermesRuntime:
    return HermesRuntime(config_store.load())


class AppHandler(BaseHTTPRequestHandler):
    server_version = "SpiderXHSWeb/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        try:
            if path == "/api/health":
                server_port = 0
                if getattr(self, "server", None) and getattr(self.server, "server_address", None):
                    server_port = int(self.server.server_address[1])
                json_response(self, {
                    "success": True,
                    "port": server_port,
                    "desktop": is_desktop_mode(),
                })
            elif path == "/api/config":
                json_response(self, {"success": True, "config": config_store.public()})
            elif path == "/api/jobs":
                json_response(self, {"success": True, "jobs": job_manager.list_jobs()})
            elif path == "/api/memory/status":
                runtime = memory_runtime()
                json_response(self, {"success": True, "memory": runtime.status(), "disabled": not runtime.enabled})
            elif path == "/api/memory/list":
                runtime = memory_runtime()
                if not runtime.enabled:
                    json_response(self, {"success": True, "disabled": True, "memory": runtime.status()})
                else:
                    target = query.get("target", ["memory"])[0]
                    json_response(self, {"success": True, "memory": runtime.list_memory(target)})
            elif path == "/api/memory/search":
                runtime = memory_runtime()
                if not runtime.enabled:
                    json_response(self, {"success": True, "disabled": True, "memory": runtime.status(), "results": []})
                else:
                    q = query.get("q", [""])[0]
                    json_response(self, {"success": True, "memory": runtime.search(q)})
            elif path == "/api/files":
                rel = query.get("path", [""])[0]
                root = normalize_file_root(query.get("root", ["crawl"])[0])
                config = config_store.load()
                files = list_output_files(
                    resolve_file_output_root(config, root),
                    rel,
                    hide_rewrite_auxiliary=root == "rewrite",
                )
                files["root"] = root
                json_response(self, {
                    "success": True,
                    "files": files,
                })
            elif path == "/api/recent-md":
                limit_text = query.get("limit", ["8"])[0]
                try:
                    limit = int(limit_text)
                except (TypeError, ValueError):
                    limit = 8
                config = config_store.load()
                json_response(self, {
                    "success": True,
                    "recent": list_recent_markdown_files(
                        resolve_output_root(config),
                        limit=limit,
                        rewrite_root=resolve_rewrite_output_root(config),
                    ),
                })
            elif path == "/api/file":
                rel = query.get("path", [""])[0]
                root = normalize_file_root(query.get("root", ["crawl"])[0])
                config = config_store.load()
                file_info = read_output_text_file(resolve_file_output_root(config, root), rel)
                file_info["root"] = root
                json_response(self, {"success": True, "file": file_info})
            elif path == "/download":
                rel = query.get("path", [""])[0]
                self._serve_data_file(rel, normalize_file_root(query.get("root", ["crawl"])[0]))
            elif path.startswith(VDITOR_VENDOR_PREFIX):
                self._serve_vditor_vendor(path[len(VDITOR_VENDOR_PREFIX):])
            else:
                self._serve_static(path)
        except ValueError as exc:
            error_response(self, str(exc), status=400)
        except FileNotFoundError as exc:
            error_response(self, str(exc), status=404)
        except Exception as exc:
            logger.exception(exc)
            error_response(self, str(exc), status=500)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            payload = read_body(self)
            if path == "/api/config":
                saved_config = config_store.save(payload)
                sync_profile_memory(saved_config)
                json_response(self, {"success": True, "config": config_store.public()})
            elif path == "/api/config/reset":
                section = str(payload.get("section") or "").strip()
                saved_config = config_store.reset_section(section)
                sync_profile_memory(saved_config)
                json_response(self, {"success": True, "config": config_store.public()})
            elif path == "/api/schedule":
                config_store.save({"schedule": payload})
                json_response(self, {"success": True, "config": config_store.public()})
            elif path == "/api/collect":
                if payload.get("config"):
                    config = config_store.save(payload["config"])
                else:
                    config = config_store.load()
                job = job_manager.start(source="manual", config=config)
                json_response(self, {"success": True, "job": job})
            elif path == "/api/rewrite-job":
                json_response(self, {"success": True, "job": run_manual_rewrite_job(payload)})
            elif path == "/api/rewrite":
                json_response(self, {"success": True, "rewrite": run_manual_rewrite(payload)})
            elif path == "/api/style-profile-job":
                json_response(self, {"success": True, "job": run_style_profile_job(payload), "config": config_store.public()})
            elif path == "/api/style-profile/apply":
                json_response(self, {"success": True, "config": apply_style_profile_draft(payload)})
            elif path == "/api/file/save":
                root = normalize_file_root(payload.get("root"))
                config = config_store.load()
                relative_path = str(payload.get("path") or "")
                output_root = resolve_file_output_root(config, root)
                old_content = ""
                try:
                    old_target = safe_output_path(output_root, relative_path)
                    if old_target.exists() and old_target.is_file():
                        old_content = old_target.read_text(encoding="utf-8")
                except Exception:
                    old_content = ""
                file_info = save_output_markdown_file(
                    output_root,
                    relative_path,
                    payload.get("content"),
                )
                file_info["root"] = root
                try:
                    HermesRuntime(config).sync_edit_feedback(
                        f"{root}:{file_info.get('path') or relative_path}",
                        old_content,
                        payload.get("content"),
                    )
                except Exception as exc:
                    logger.warning(f"Hermes 改稿记忆同步失败：{exc}")
                json_response(self, {
                    "success": True,
                    "file": file_info,
                })
            elif path == "/api/memory/add":
                runtime = memory_runtime()
                if not runtime.enabled:
                    json_response(self, {"success": True, "disabled": True, "memory": runtime.status()})
                else:
                    json_response(self, {"success": True, "memory": runtime.add(payload.get("target", "memory"), payload.get("content"))})
            elif path == "/api/memory/replace":
                runtime = memory_runtime()
                if not runtime.enabled:
                    json_response(self, {"success": True, "disabled": True, "memory": runtime.status()})
                else:
                    json_response(self, {"success": True, "memory": runtime.replace(payload.get("target", "memory"), payload.get("old_text"), payload.get("content"))})
            elif path == "/api/memory/remove":
                runtime = memory_runtime()
                if not runtime.enabled:
                    json_response(self, {"success": True, "disabled": True, "memory": runtime.status()})
                else:
                    json_response(self, {"success": True, "memory": runtime.remove(payload.get("target", "memory"), payload.get("old_text"))})
            elif path == "/api/memory/sync-profile":
                config = config_store.load()
                runtime = HermesRuntime(config)
                if not runtime.enabled:
                    json_response(self, {"success": True, "disabled": True, "memory": runtime.status()})
                else:
                    rewrite = config.get("rewrite", {}) if isinstance(config.get("rewrite"), dict) else {}
                    profile = rewrite.get("creator_profile") if isinstance(rewrite.get("creator_profile"), dict) else {}
                    json_response(self, {"success": True, "memory": runtime.sync_profile(profile), "status": runtime.status()})
            elif path == "/api/jobs/delete":
                json_response(self, {
                    "success": True,
                    **job_manager.delete_jobs(
                        payload.get("ids") if isinstance(payload.get("ids"), list) else [],
                    ),
                })
            elif path == "/api/jobs/cancel":
                json_response(self, {
                    "success": True,
                    **job_manager.cancel_job(str(payload.get("id") or "")),
                })
            elif path == "/api/login/check":
                self._check_login(payload)
            elif path == "/api/login/browser/start":
                json_response(self, {"success": True, "login": browser_login_manager.start()})
            elif path == "/api/login/browser/status":
                json_response(self, {"success": True, "login": browser_login_manager.status()})
            elif path == "/api/files/open":
                json_response(self, {
                    "success": True,
                    "folder": open_data_folder(str(payload.get("path") or ""), payload.get("root")),
                })
            elif path == "/api/files/create-dir":
                root = normalize_file_root(payload.get("root"))
                json_response(self, {
                    "success": True,
                    "folder": create_output_directory(
                        resolve_file_output_root(config_store.load(), root),
                        str(payload.get("parent_path") or ""),
                        str(payload.get("name") or ""),
                    ),
                })
            elif path == "/api/files/rename":
                root = normalize_file_root(payload.get("root"))
                json_response(self, {
                    "success": True,
                    "entry": rename_output_entry(
                        resolve_file_output_root(config_store.load(), root),
                        str(payload.get("path") or ""),
                        str(payload.get("name") or ""),
                    ),
                })
            elif path == "/api/files/delete":
                root = normalize_file_root(payload.get("root"))
                json_response(self, {
                    "success": True,
                    **delete_output_entries(
                        resolve_file_output_root(config_store.load(), root),
                        payload.get("paths") if isinstance(payload.get("paths"), list) else [],
                    ),
                })
            elif path == "/api/storage/pick-folder":
                prompt = "选择 AI 仿写存放目录" if normalize_file_root(payload.get("root")) == "rewrite" else "选择采集存放目录"
                json_response(self, {
                    "success": True,
                    **pick_output_folder(str(payload.get("current_path") or ""), prompt=prompt),
                })
            else:
                error_response(self, "接口不存在", status=404)
        except RewriteRequirementConflictError as exc:
            json_response(
                self,
                {
                    "success": False,
                    "message": str(exc),
                    "conflicts": exc.conflicts,
                },
                status=409,
            )
        except json.JSONDecodeError:
            error_response(self, "请求体不是合法 JSON", status=400)
        except ValueError as exc:
            error_response(self, str(exc), status=400)
        except FileExistsError as exc:
            error_response(self, str(exc), status=400)
        except FileNotFoundError as exc:
            error_response(self, str(exc), status=404)
        except Exception as exc:
            logger.exception(exc)
            error_response(self, str(exc), status=500)

    def _serve_static(self, path: str) -> None:
        target = safe_web_path(path)
        if not target.exists() or not target.is_file():
            target = WEB_ROOT / "index.html"
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_vditor_vendor(self, rel: str) -> None:
        target = safe_vditor_vendor_path(rel)
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_data_file(self, rel: str, root: Any = "crawl") -> None:
        config = config_store.load()
        target = safe_output_path(resolve_file_output_root(config, root), rel)
        if not target.exists() or not target.is_file():
            raise FileNotFoundError("文件不存在")
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(target.stat().st_size))
        self.send_header("Content-Disposition", f"inline; filename*=UTF-8''{target.name}")
        self.end_headers()
        with target.open("rb") as file:
            while True:
                chunk = file.read(1024 * 512)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def _check_login(self, payload: Dict[str, Any]) -> None:
        cookies = str(payload.get("cookies") or "").strip()
        if not cookies:
            cookies = config_store.load().get("login", {}).get("cookies", "")
        if not cookies:
            error_response(self, "缺少 Cookie，无法检查登录", status=400)
            return
        validation = validate_login_cookie(cookies)
        if validation["valid"] and payload.get("save"):
            config_store.save({"login": {"cookies": cookies}})
        json_response(self, {
            "success": validation["valid"],
            "message": validation["message"],
            "user": validation["user"],
            "raw_success": validation["raw_success"],
        }, status=200 if validation["valid"] else 400)


def run_server(host: str = HOST, port: int = PORT) -> None:
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    WEB_ROOT.mkdir(parents=True, exist_ok=True)
    scheduler.start()
    httpd = ThreadingHTTPServer((host, port), AppHandler)

    def shutdown(signum: int, frame: Any) -> None:
        logger.info("正在关闭 Spider_XHS Web 控制台...")
        scheduler.stop()
        threading.Thread(target=httpd.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    logger.info(f"Spider_XHS Web 控制台已启动：http://{host}:{port}，desktop={is_desktop_mode()}")
    try:
        httpd.serve_forever()
    finally:
        scheduler.stop()
        httpd.server_close()


if __name__ == "__main__":
    host = HOST
    port = PORT
    if len(sys.argv) >= 2:
        port = int(sys.argv[1])
    run_server(host=host, port=port)
