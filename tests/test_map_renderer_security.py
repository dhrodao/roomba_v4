"""Security tests for the tar extraction hardening in ``map_renderer``.

These verify that ``_safe_extract_tar`` refuses path-traversal members and
symlink/hardlink members, and that a well-formed archive still extracts.
"""

from __future__ import annotations

import io
import json
import tarfile
from pathlib import Path

import pytest

import map_renderer
from map_renderer import _safe_extract_tar, extract_room_info_from_archive


def _tar_with_members(members: list[tuple[tarfile.TarInfo, bytes | None]]) -> tarfile.TarFile:
    """Build an in-memory tar from (TarInfo, data) pairs and reopen for reading."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tf:
        for info, data in members:
            if data is not None:
                info.size = len(data)
                tf.addfile(info, io.BytesIO(data))
            else:
                tf.addfile(info)
    buf.seek(0)
    return tarfile.open(fileobj=buf, mode="r")


def test_rejects_parent_directory_traversal(tmp_path: Path):
    info = tarfile.TarInfo(name="../escape.txt")
    tf = _tar_with_members([(info, b"malicious")])
    with pytest.raises(ValueError, match="escapes destination"):
        _safe_extract_tar(tf, tmp_path)
    assert not (tmp_path.parent / "escape.txt").exists()


def test_rejects_absolute_path(tmp_path: Path):
    info = tarfile.TarInfo(name="/tmp/roomba_pwn.txt")
    tf = _tar_with_members([(info, b"malicious")])
    with pytest.raises(ValueError, match="escapes destination"):
        _safe_extract_tar(tf, tmp_path)


def test_rejects_symlink_member(tmp_path: Path):
    info = tarfile.TarInfo(name="link")
    info.type = tarfile.SYMTYPE
    info.linkname = "/etc/passwd"
    tf = _tar_with_members([(info, None)])
    with pytest.raises(ValueError, match="links are not allowed"):
        _safe_extract_tar(tf, tmp_path)


def test_rejects_hardlink_member(tmp_path: Path):
    info = tarfile.TarInfo(name="hard")
    info.type = tarfile.LNKTYPE
    info.linkname = "secret"
    tf = _tar_with_members([(info, None)])
    with pytest.raises(ValueError, match="links are not allowed"):
        _safe_extract_tar(tf, tmp_path)


def test_extracts_valid_archive(tmp_path: Path):
    info = tarfile.TarInfo(name="rooms.geojson")
    tf = _tar_with_members([(info, b'{"features": []}')])
    _safe_extract_tar(tf, tmp_path)
    extracted = tmp_path / "rooms.geojson"
    assert extracted.exists()
    assert json.loads(extracted.read_text()) == {"features": []}


def test_skips_device_and_fifo_members(tmp_path: Path):
    """Non regular files (and non dirs) are silently skipped, not extracted."""
    good = tarfile.TarInfo(name="rooms.geojson")
    fifo = tarfile.TarInfo(name="pipe")
    fifo.type = tarfile.FIFOTYPE
    tf = _tar_with_members([(good, b"{}"), (fifo, None)])
    _safe_extract_tar(tf, tmp_path)
    assert (tmp_path / "rooms.geojson").exists()
    assert not (tmp_path / "pipe").exists()


def test_extract_room_info_from_malicious_gzip_archive(tmp_path: Path):
    """End-to-end: a gzip archive with a traversal member must raise, not write."""
    archive = tmp_path / "evil.tgz"
    with tarfile.open(archive, "w:gz") as tf:
        data = b"malicious"
        info = tarfile.TarInfo(name="../pwned.geojson")
        info.size = len(data)
        tf.addfile(info, io.BytesIO(data))
    with pytest.raises(ValueError):
        extract_room_info_from_archive(archive)
    assert not (tmp_path.parent / "pwned.geojson").exists()
