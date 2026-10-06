"""Build-time-only installation of a pinned official Audiveris release.

Not imported by the API. Does not run automatically at server start or on upload.
Release metadata: https://github.com/Audiveris/audiveris/releases/tag/5.11.0
"""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.request

VERSION = "5.11.0"
PACKAGE = f"Audiveris-{VERSION}-ubuntu22.04-x86_64.deb"
URL = f"https://github.com/Audiveris/audiveris/releases/download/{VERSION}/{PACKAGE}"
# SHA-256 from the official GitHub release asset metadata, not calculated from
# an untrusted mirror or an unchecked download.
SHA256 = "ae714594f40e54b1a4951fc3f914f08ae38fe5d07b7f2283b1a904fdb6e0a318"
MAX_BYTES = 150 * 1024 * 1024
LAUNCHER = Path("/opt/audiveris/bin/Audiveris")
ALIAS = Path("/usr/local/bin/audiveris")
DESKTOP_MENU_DIRS = (
    Path("/usr/share/desktop-directories"),
    Path("/usr/share/applications"),
)


def validate_platform() -> None:
    if os.geteuid() != 0:
        raise RuntimeError("Audiveris installation must run as root during image build.")
    arch = subprocess.check_output(["dpkg", "--print-architecture"], text=True).strip()
    if arch != "amd64":
        raise RuntimeError(
            f"Pinned Audiveris package supports linux/amd64, not {arch}. "
            "Keep INSTALL_AUDIVERIS=0 on this architecture; no emulation is enabled automatically."
        )


def verify_checksum(path: Path, expected: str = SHA256) -> None:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise RuntimeError("Audiveris package checksum mismatch; refusing installation.")


def download_verified(destination: Path) -> None:
    request = urllib.request.Request(URL, headers={"User-Agent": "bach-to-basics-build"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            if not response.geturl().startswith("https://"):
                raise RuntimeError("Refusing a non-HTTPS Audiveris download redirect.")
            total = 0
            with destination.open("wb") as stream:
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_BYTES:
                        raise RuntimeError("Audiveris download exceeds the expected size limit.")
                    stream.write(chunk)
        verify_checksum(destination)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def prepare_desktop_menu_dirs() -> None:
    # The official .deb registers a desktop entry in its postinst script.
    # xdg-desktop-menu requires BOTH writable XDG directories even when only a
    # .desktop file is installed. Slim/headless images may not contain them.
    # Create the standard directories, not a desktop environment; preserve
    # existing contents/permissions and let real installation errors propagate.
    for directory in DESKTOP_MENU_DIRS:
        directory.mkdir(mode=0o755, parents=True, exist_ok=True)


def install() -> None:
    validate_platform()
    env = dict(os.environ, DEBIAN_FRONTEND="noninteractive")
    with tempfile.TemporaryDirectory(prefix="audiveris-build-") as temp:
        deb = Path(temp) / PACKAGE
        download_verified(deb)
        prepare_desktop_menu_dirs()
        # Install the complete package, including the vendor-supplied JRE and
        # native dependencies. Do not extract just the application JAR.
        subprocess.run(["apt-get", "update"], check=True, env=env)
        subprocess.run(
            ["apt-get", "install", "-y", "--no-install-recommends", str(deb)],
            check=True, env=env,
        )
    if not LAUNCHER.is_file() or not os.access(LAUNCHER, os.X_OK):
        raise RuntimeError("Installed Audiveris launcher is missing or not executable.")
    # Existing service detection uses a lower-case PATH command. /opt is outside
    # the existing read-only /app/bin bind mount, so an empty host folder cannot
    # hide this installation.
    if ALIAS.exists() or ALIAS.is_symlink():
        if ALIAS.resolve() != LAUNCHER.resolve():
            raise RuntimeError("Refusing to replace a different existing audiveris command.")
    else:
        ALIAS.symlink_to(LAUNCHER)
    subprocess.run([str(ALIAS), "-batch", "-help"], check=True, timeout=60)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install", action="store_true", help="Install inside the build image")
    args = parser.parse_args()
    if not args.install:
        parser.print_help()
        return
    install()


if __name__ == "__main__":
    main()
