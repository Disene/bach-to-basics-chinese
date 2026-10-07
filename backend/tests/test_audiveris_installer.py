"""Offline build-installer tests: no download, apt install, or OMR is performed."""
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).parents[1] / "scripts" / "install_audiveris.py"
spec = importlib.util.spec_from_file_location("audiveris_installer", MODULE)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class FakeResponse(io.BytesIO):
    def __init__(self, data, url="https://release-assets.githubusercontent.com/test"):
        super().__init__(data)
        self.url = url

    def geturl(self):
        return self.url


class InstallerTests(unittest.TestCase):
    def test_official_url_and_fixed_version(self):
        self.assertEqual(installer.VERSION, "5.11.0")
        self.assertTrue(installer.URL.startswith("https://github.com/Audiveris/audiveris/releases/download/5.11.0/"))
        self.assertEqual(len(installer.SHA256), 64)

    def test_checksum_accepts_matching_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "test.deb"
            file.write_bytes(b"synthetic package")
            installer.verify_checksum(file, hashlib.sha256(file.read_bytes()).hexdigest())

    def test_checksum_rejects_changed_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "test.deb"
            file.write_bytes(b"changed")
            with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
                installer.verify_checksum(file)

    def test_rejects_nonroot_before_any_platform_command(self):
        with patch.object(installer.os, "geteuid", return_value=1000), patch.object(installer.subprocess, "check_output") as output:
            with self.assertRaisesRegex(RuntimeError, "root"):
                installer.validate_platform()
            output.assert_not_called()

    def test_rejects_arm64_without_downloading(self):
        with patch.object(installer.os, "geteuid", return_value=0), patch.object(installer.subprocess, "check_output", return_value="arm64\n"), patch.object(installer, "download_verified") as download:
            with self.assertRaisesRegex(RuntimeError, "linux/amd64"):
                installer.install()
            download.assert_not_called()

    def test_accepts_amd64(self):
        with patch.object(installer.os, "geteuid", return_value=0), patch.object(installer.subprocess, "check_output", return_value="amd64\n"):
            installer.validate_platform()

    def test_download_verifies_before_it_returns(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "test.deb"
            with patch.object(installer.urllib.request, "urlopen", return_value=FakeResponse(b"synthetic")), patch.object(installer, "verify_checksum") as verify:
                installer.download_verified(file)
                verify.assert_called_once_with(file)
                self.assertEqual(file.read_bytes(), b"synthetic")

    def test_bad_checksum_removes_download_and_never_runs_apt(self):
        with patch.object(installer, "validate_platform"), patch.object(installer.urllib.request, "urlopen", return_value=FakeResponse(b"corrupt")), patch.object(installer.subprocess, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
                installer.install()
            run.assert_not_called()

    def test_download_rejects_http_redirect(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "test.deb"
            with patch.object(installer.urllib.request, "urlopen", return_value=FakeResponse(b"bad", "http://example.com/package")):
                with self.assertRaisesRegex(RuntimeError, "non-HTTPS"):
                    installer.download_verified(file)
                self.assertFalse(file.exists())

    def test_oversize_response_is_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "test.deb"
            with patch.object(installer, "MAX_BYTES", 3), patch.object(installer.urllib.request, "urlopen", return_value=FakeResponse(b"1234")):
                with self.assertRaisesRegex(RuntimeError, "size limit"):
                    installer.download_verified(file)
                self.assertFalse(file.exists())

    def test_no_install_flag_has_no_side_effects(self):
        with patch("sys.argv", ["install_audiveris.py"]), patch.object(installer, "install") as install, patch("sys.stdout", new_callable=io.StringIO):
            installer.main()
            install.assert_not_called()


    def test_creates_required_desktop_menu_directories(self):
        self.assertEqual(installer.DESKTOP_MENU_DIRS, (
            Path("/usr/share/desktop-directories"),
            Path("/usr/share/applications"),
        ))
        with tempfile.TemporaryDirectory() as tmp:
            dirs = tuple(Path(tmp) / path.relative_to("/") for path in installer.DESKTOP_MENU_DIRS)
            with patch.object(installer, "DESKTOP_MENU_DIRS", dirs):
                installer.prepare_desktop_menu_dirs()
            for directory in dirs:
                self.assertTrue(directory.is_dir())
                self.assertEqual(stat.S_IMODE(directory.stat().st_mode) & 0o022, 0)

    def test_existing_menu_contents_and_permissions_are_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / "existing"
            directory.mkdir(mode=0o750)
            marker = directory / "existing.directory"
            marker.write_text("keep this entry")
            mode = stat.S_IMODE(directory.stat().st_mode)
            with patch.object(installer, "DESKTOP_MENU_DIRS", (directory,)):
                installer.prepare_desktop_menu_dirs()
                installer.prepare_desktop_menu_dirs()
            self.assertEqual(marker.read_text(), "keep this entry")
            self.assertEqual(stat.S_IMODE(directory.stat().st_mode), mode)

    def test_verified_download_and_menu_dirs_precede_apt_install(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dirs = (root / "desktop-directories", root / "applications")
            launcher = root / "Audiveris"
            alias = root / "audiveris"
            events = []

            def download(deb):
                self.assertFalse(any(directory.exists() for directory in dirs))
                events.append("verified-download")
                deb.write_bytes(b"synthetic verified package")

            def run(command, **kwargs):
                self.assertTrue(kwargs["check"])
                self.assertTrue(all(directory.is_dir() for directory in dirs))
                if command[:2] == ["apt-get", "install"]:
                    self.assertEqual(events, ["verified-download", "update"])
                    self.assertEqual(kwargs["env"]["DEBIAN_FRONTEND"], "noninteractive")
                    launcher.write_text("synthetic executable")
                    launcher.chmod(0o755)
                events.append(command[1])
                return subprocess.CompletedProcess(command, 0)

            with patch.object(installer, "validate_platform"), \
                 patch.object(installer, "download_verified", side_effect=download), \
                 patch.object(installer, "DESKTOP_MENU_DIRS", dirs), \
                 patch.object(installer, "LAUNCHER", launcher), \
                 patch.object(installer, "ALIAS", alias), \
                 patch.object(installer.subprocess, "run", side_effect=run) as call:
                installer.install()
                call.assert_called_with([str(alias), "-batch", "-help"], check=True, timeout=60)
            self.assertEqual(events, ["verified-download", "update", "install", "-batch"])
            self.assertTrue(alias.is_file())
            self.assertIn(installer.WRAPPER_MARKER, alias.read_text())
            self.assertIn('GDK_SCALE:=1', alias.read_text())
            self.assertTrue(alias.stat().st_mode & 0o111)

    def test_menu_directory_failure_aborts_before_apt(self):
        with patch.object(installer, "validate_platform"), \
             patch.object(installer, "download_verified"), \
             patch.object(installer, "prepare_desktop_menu_dirs", side_effect=PermissionError("read-only")), \
             patch.object(installer.subprocess, "run") as run:
            with self.assertRaises(PermissionError):
                installer.install()
            run.assert_not_called()

    def test_apt_install_failure_is_not_suppressed(self):
        failure = subprocess.CalledProcessError(100, ["apt-get", "install"])
        with patch.object(installer, "validate_platform"), \
             patch.object(installer, "download_verified"), \
             patch.object(installer, "prepare_desktop_menu_dirs"), \
             patch.object(installer.subprocess, "run", side_effect=[None, failure]) as run:
            with self.assertRaises(subprocess.CalledProcessError) as raised:
                installer.install()
            self.assertEqual(raised.exception.returncode, 100)
            self.assertEqual(run.call_count, 2)

    @unittest.skipUnless(shutil.which("xdg-desktop-menu"), "Requires xdg-utils")
    def test_real_xdg_menu_reproduces_missing_directory_and_accepts_fix(self):
        # Exercise the installed xdg utility in temporary XDG locations, without
        # touching /usr/share, downloading Audiveris, or installing any packages.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            home, data = root / "home", root / "share"
            home.mkdir()
            data.mkdir()
            applications = data / "applications"
            applications.mkdir()
            desktop = root / "bach-headless-test.desktop"
            desktop.write_text(
                "[Desktop Entry]\nType=Application\nName=Installer regression test\n"
                "Exec=/bin/true\nCategories=Education;\n"
            )
            env = dict(os.environ, HOME=str(home), XDG_DATA_DIRS=str(data),
                       XDG_DATA_HOME=str(home / "data"), XDG_CONFIG_DIRS=str(root / "config"),
                       XDG_CONFIG_HOME=str(home / "config"), XDG_CACHE_HOME=str(home / "cache"),
                       XDG_CURRENT_DESKTOP="X-Generic")
            command = [shutil.which("xdg-desktop-menu"), "install", "--mode", "system",
                       "--novendor", str(desktop)]
            before = subprocess.run(command, env=env, capture_output=True, text=True, timeout=10)
            self.assertEqual(before.returncode, 3, before.stderr)
            self.assertIn("No writable system menu directory found", before.stderr)
            with patch.object(installer, "DESKTOP_MENU_DIRS", (data / "desktop-directories", applications)):
                installer.prepare_desktop_menu_dirs()
            after = subprocess.run(command, env=env, capture_output=True, text=True, timeout=10)
            self.assertEqual(after.returncode, 0, after.stderr)
            self.assertEqual((applications / desktop.name).read_text(), desktop.read_text())

    def test_headless_wrapper_defaults_scale_and_forwards_args(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            launcher = root / "Audiveris"
            alias = root / "audiveris"
            output = root / "output.txt"
            launcher.write_text(
                '#!/bin/sh\nprintf "%s|%s" "$GDK_SCALE" "$*" > "$OUTPUT"\n'
            )
            launcher.chmod(0o755)
            installer.write_headless_wrapper(alias, launcher)
            env = dict(os.environ, OUTPUT=str(output))
            env.pop("GDK_SCALE", None)
            subprocess.run([str(alias), "-batch", "-help"], check=True, env=env)
            self.assertEqual(output.read_text(), "1|-batch -help")
            self.assertTrue(alias.stat().st_mode & 0o111)

    def test_headless_wrapper_preserves_explicit_scale(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            launcher = root / "Audiveris"
            alias = root / "audiveris"
            output = root / "output.txt"
            launcher.write_text(
                '#!/bin/sh\nprintf "%s" "$GDK_SCALE" > "$OUTPUT"\n'
            )
            launcher.chmod(0o755)
            installer.write_headless_wrapper(alias, launcher)
            env = dict(os.environ, OUTPUT=str(output), GDK_SCALE="2")
            subprocess.run([str(alias)], check=True, env=env)
            self.assertEqual(output.read_text(), "2")

    def test_headless_wrapper_refuses_unrelated_existing_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            launcher = root / "Audiveris"
            alias = root / "audiveris"
            launcher.write_text("#!/bin/sh\nexit 0\n")
            launcher.chmod(0o755)
            alias.write_text("#!/bin/sh\necho unrelated\n")
            alias.chmod(0o755)
            with self.assertRaisesRegex(RuntimeError, "Refusing to replace"):
                installer.write_headless_wrapper(alias, launcher)


if __name__ == "__main__":
    unittest.main()
