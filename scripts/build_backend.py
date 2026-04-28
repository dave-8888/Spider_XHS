import os
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_NAME = "spider-xhs-backend"


def target_python_for_arch(arch: str) -> str:
    env_name = f"SPIDER_XHS_PYTHON_{arch.upper()}"
    configured = str(os.getenv(env_name) or "").strip()
    if configured:
        return configured
    return sys.executable


def detect_python_arch(python_bin: str) -> str:
    result = subprocess.run(
        [python_bin, "-c", "import platform; print(platform.machine())"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def detect_python_version(python_bin: str) -> tuple[int, int]:
    result = subprocess.run(
        [python_bin, "-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"],
        capture_output=True,
        text=True,
        check=True,
    )
    major, minor = result.stdout.strip().split(".", 1)
    return int(major), int(minor)


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python scripts/build_backend.py <arm64|x64>")
        return 1

    arch = str(sys.argv[1]).strip()
    if arch not in {"arm64", "x64"}:
        print(f"Unsupported arch: {arch}")
        return 1

    python_bin = target_python_for_arch(arch)
    python_version = detect_python_version(python_bin)
    if python_version < (3, 11):
        print(
            f"Python 3.11+ is required because Spider_XHS embeds Hermes Agent; "
            f"got {python_version[0]}.{python_version[1]}.",
            file=sys.stderr,
        )
        return 1
    detected_arch = detect_python_arch(python_bin)
    if detected_arch != arch:
        print(
            f"Python arch mismatch: expected {arch}, got {detected_arch}. "
            f"Set SPIDER_XHS_PYTHON_{arch.upper()} to the correct interpreter.",
            file=sys.stderr,
        )
        return 1

    dist_path = PROJECT_ROOT / "build" / "backend" / arch
    work_path = PROJECT_ROOT / "build" / "pyinstaller" / arch
    spec_path = PROJECT_ROOT / "build" / "pyinstaller_specs"

    dist_path.mkdir(parents=True, exist_ok=True)
    work_path.mkdir(parents=True, exist_ok=True)
    spec_path.mkdir(parents=True, exist_ok=True)

    command = [
        python_bin,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--name",
        OUTPUT_NAME,
        "--distpath",
        str(dist_path),
        "--workpath",
        str(work_path),
        "--specpath",
        str(spec_path),
        "--paths",
        str(PROJECT_ROOT),
        "--hidden-import",
        "execjs._external_runtime",
        "--hidden-import",
        "execjs._runtimes",
        "--hidden-import",
        "urllib3",
        "--add-data",
        f"{PROJECT_ROOT / 'vendor' / 'hermes-agent'}:vendor/hermes-agent",
        "--add-data",
        f"{PROJECT_ROOT / 'vendor' / 'HERMES_AGENT_SOURCE.md'}:vendor",
        str(PROJECT_ROOT / "web_app.py"),
    ]

    print("Running:", " ".join(command))
    completed = subprocess.run(command, cwd=str(PROJECT_ROOT), check=False)
    return int(completed.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
