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
WRAPPER_MARKER = "# bach-to-basics headless Audiveris wrapper"
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
    # Existing service detection uses a lower-case PATH command. Use a tiny
    # wrapper instead of a symlink so every backend invocation gets a stable
    # headless Linux scale. Audiveris 5.11 otherwise auto-probes GTK for HiDPI
    # before CLI parsing, which crashes slim/headless images when GTK is absent.
    write_headless_wrapper()
    subprocess.run([str(ALIAS), "-batch", "-help"], check=True, timeout=60)


def write_headless_wrapper(alias: Path = ALIAS, launcher: Path = LAUNCHER) -> None:
    """Create the PATH launcher used by the backend for headless batch mode.

    Respect an explicitly supplied GDK_SCALE, but default it to 1 so Audiveris
    skips its Linux GTK HiDPI auto-detection. Refuse to overwrite unrelated
    commands in /usr/local/bin.
    """
    if alias.exists() or alias.is_symlink():
        if alias.is_symlink() and alias.resolve() == launcher.resolve():
            # Replace the symlink created by an earlier installer revision.
            alias.unlink()
        elif alias.is_file():
            try:
                existing = alias.read_text(encoding="utf-8")
            except UnicodeDecodeError as exc:
                raise RuntimeError(
                    "Refusing to replace a different existing audiveris command."
                ) from exc
            if WRAPPER_MARKER not in existing:
                raise RuntimeError(
                    "Refusing to replace a different existing audiveris command."
                )
        else:
            raise RuntimeError(
                "Refusing to replace a different existing audiveris command."
            )

    wrapper = (
        "#!/bin/sh\n"
        f"{WRAPPER_MARKER}\n"
        ': "${GDK_SCALE:=1}"\n'
        "export GDK_SCALE\n"
        f'exec "{launcher}" "$@"\n'
    )
    alias.write_text(wrapper, encoding="utf-8")
    alias.chmod(0o755)


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
