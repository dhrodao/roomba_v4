"""Tests for the map download size guard in ``cloud_api.download_file``.

``cloud_api`` imports aiohttp and Home Assistant helpers, so these are marked
``hass`` and skipped unless that environment is present. The network layer is
faked, so no real request is performed.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.hass


class _FakeContent:
    def __init__(self, chunks: list[bytes]):
        self._chunks = chunks

    async def iter_chunked(self, _size: int):
        for chunk in self._chunks:
            yield chunk


class _FakeResponse:
    def __init__(self, *, status=200, content_length=None, chunks=None, text=""):
        self.status = status
        self.content_length = content_length
        self.content = _FakeContent(chunks or [])
        self._text = text

    async def text(self):
        return self._text

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _FakeSession:
    def __init__(self, response):
        self._response = response

    def get(self, _url, **_kwargs):
        return self._response


def _make_api(response):
    from custom_components.roomba_v4.cloud_api import IRobotCloudApi

    api = IRobotCloudApi(
        username="u",
        password="p",
        country_code="GB",
        session=_FakeSession(response),
    )
    return api


async def test_rejects_scheme():
    from custom_components.roomba_v4.cloud_api import CloudApiError

    api = _make_api(_FakeResponse())
    with pytest.raises(CloudApiError, match="Unsupported map URL scheme"):
        await api.download_file("ftp://example.com/map.tgz")


async def test_rejects_large_content_length():
    from custom_components.roomba_v4.cloud_api import CloudApiError
    from custom_components.roomba_v4.const import MAX_MAP_DOWNLOAD_BYTES

    resp = _FakeResponse(content_length=MAX_MAP_DOWNLOAD_BYTES + 1)
    api = _make_api(resp)
    with pytest.raises(CloudApiError, match="too large"):
        await api.download_file("https://example.com/map.tgz")


async def test_rejects_streamed_overflow():
    from custom_components.roomba_v4.cloud_api import CloudApiError
    from custom_components.roomba_v4.const import MAX_MAP_DOWNLOAD_BYTES

    # Content-Length lies (None), but the streamed body exceeds the cap.
    big_chunk = b"x" * (1024 * 1024)
    num = (MAX_MAP_DOWNLOAD_BYTES // len(big_chunk)) + 2
    resp = _FakeResponse(content_length=None, chunks=[big_chunk] * num)
    api = _make_api(resp)
    with pytest.raises(CloudApiError, match="exceeded"):
        await api.download_file("https://example.com/map.tgz")


async def test_accepts_small_download():
    resp = _FakeResponse(content_length=5, chunks=[b"hello"])
    api = _make_api(resp)
    out = await api.download_file("https://example.com/map.tgz")
    assert out == b"hello"


async def test_raises_on_http_error():
    from custom_components.roomba_v4.cloud_api import CloudApiError

    resp = _FakeResponse(status=404, text="not found")
    api = _make_api(resp)
    with pytest.raises(CloudApiError, match="Download failed"):
        await api.download_file("https://example.com/map.tgz")
