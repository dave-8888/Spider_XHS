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
    SimpleScheduler,
    create_output_directory,
    delete_output_entries,
    list_output_files,
    read_output_text_file,
    relative_to_root,
    resolve_output_root,
    safe_output_path,
)
from runtime_paths import DATA_ROOT, RESOURCE_ROOT, WEB_ROOT, is_desktop_mode

HOST = "127.0.0.1"
PORT = int(str(os.getenv("SPIDER_XHS_PORT") or os.getenv("PORT") or 8765).strip())
LOGIN_URL = "https://www.xiaohongshu.com/explore"
BROWSER_READY_TIMEOUT_SECONDS = 10.0
BROWSER_READY_POLL_SECONDS = 0.25
RELATIVE_STORAGE_ROOT = DATA_ROOT if is_desktop_mode() else RESOURCE_ROOT

config_store = ConfigStore()
job_manager = JobManager(config_store)
scheduler = SimpleScheduler(config_store, job_manager)


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
    elif url_path in ["/settings", "/settings/"]:
        target = WEB_ROOT / "settings.html"
    else:
        rel = unquote(url_path.lstrip("/"))
        if rel.startswith("ui/"):
            rel = rel[3:]
        target = WEB_ROOT / rel
    resolved = target.resolve()
    if resolved != WEB_ROOT.resolve() and WEB_ROOT.resolve() not in resolved.parents:
        raise ValueError("非法静态文件路径")
    return resolved


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


def open_data_folder(relative_path: str = "") -> Dict[str, Any]:
    output_root = resolve_output_root(config_store.load())
    output_root.mkdir(parents=True, exist_ok=True)
    target = safe_output_path(output_root, relative_path or "")
    if not target.exists():
        raise FileNotFoundError("路径不存在")
    folder = target if target.is_dir() else target.parent
    open_in_file_manager(folder)
    folder_path = "" if folder.resolve() == output_root.resolve() else relative_to_root(folder, output_root)
    return {
        "path": folder_path,
        "name": folder.name,
        "root": str(output_root),
    }


def folder_picker_start_path(current_path: str = "") -> Path:
    raw = str(current_path or "").strip()
    if raw:
        expanded = os.path.expandvars(os.path.expanduser(raw))
        candidate = Path(expanded)
        if not candidate.is_absolute():
            candidate = RELATIVE_STORAGE_ROOT / candidate
    else:
        candidate = resolve_output_root(config_store.load())

    candidate = candidate.resolve()
    if candidate.is_file():
        candidate = candidate.parent

    while not candidate.exists() and candidate != candidate.parent:
        candidate = candidate.parent

    return candidate if candidate.exists() else RELATIVE_STORAGE_ROOT


def run_folder_picker(command: List[str]) -> Optional[str]:
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode == 0:
        selected = result.stdout.strip()
        return selected or None
    if result.returncode == 1:
        return None
    raise RuntimeError(result.stderr.strip() or "目录选择器执行失败")


def pick_output_folder(current_path: str = "") -> Dict[str, Any]:
    start_path = folder_picker_start_path(current_path)

    if sys.platform == "darwin":
        escaped = str(start_path).replace("\\", "\\\\").replace('"', '\\"')
        script = [
            f'set startFolder to POSIX file "{escaped}"',
            'try',
            'set chosenFolder to choose folder with prompt "选择采集存放目录" default location startFolder',
            'return POSIX path of chosenFolder',
            'on error number -128',
            'return ""',
            'end try',
        ]
        selected = run_folder_picker(["osascript", *sum([["-e", line] for line in script], [])])
    elif os.name == "nt":
        escaped = str(start_path).replace("'", "''")
        command = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; "
            "$dialog.Description = '选择采集存放目录'; "
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
                "--title=选择采集存放目录",
            ])
        elif kdialog:
            selected = run_folder_picker([
                kdialog,
                "--title=选择采集存放目录",
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
            elif path == "/api/files":
                rel = query.get("path", [""])[0]
                json_response(self, {"success": True, "files": list_output_files(resolve_output_root(config_store.load()), rel)})
            elif path == "/api/file":
                rel = query.get("path", [""])[0]
                json_response(self, {"success": True, "file": read_output_text_file(resolve_output_root(config_store.load()), rel)})
            elif path == "/download":
                rel = query.get("path", [""])[0]
                self._serve_data_file(rel)
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
                config_store.save(payload)
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
            elif path == "/api/login/check":
                self._check_login(payload)
            elif path == "/api/login/browser/start":
                json_response(self, {"success": True, "login": browser_login_manager.start()})
            elif path == "/api/login/browser/status":
                json_response(self, {"success": True, "login": browser_login_manager.status()})
            elif path == "/api/files/open":
                json_response(self, {"success": True, "folder": open_data_folder(str(payload.get("path") or ""))})
            elif path == "/api/files/create-dir":
                json_response(self, {
                    "success": True,
                    "folder": create_output_directory(
                        resolve_output_root(config_store.load()),
                        str(payload.get("parent_path") or ""),
                        str(payload.get("name") or ""),
                    ),
                })
            elif path == "/api/files/delete":
                json_response(self, {
                    "success": True,
                    **delete_output_entries(
                        resolve_output_root(config_store.load()),
                        payload.get("paths") if isinstance(payload.get("paths"), list) else [],
                    ),
                })
            elif path == "/api/storage/pick-folder":
                json_response(self, {"success": True, **pick_output_folder(str(payload.get("current_path") or ""))})
            else:
                error_response(self, "接口不存在", status=404)
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

    def _serve_data_file(self, rel: str) -> None:
        target = safe_output_path(resolve_output_root(config_store.load()), rel)
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
