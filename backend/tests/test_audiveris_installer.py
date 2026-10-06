"""Offline build-installer tests: no download, apt install, or OMR is performed."""
import hashlib
import importlib.util
import io
from pathlib import Path
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


if __name__ == "__main__":
    unittest.main()
