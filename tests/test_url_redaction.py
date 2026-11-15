"""Tests for the debug URL redaction helper on the coordinator.

``RoombaV4Coordinator._redact_url`` is a pure static method, but it lives in
``coordinator.py`` which imports Home Assistant at module load time. These tests
are therefore marked ``hass`` and skipped unless the HA test environment is
available.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.hass


@pytest.fixture()
def redact():
    from custom_components.roomba_v4.coordinator import RoombaV4Coordinator

    return RoombaV4Coordinator._redact_url


def test_redacts_query_string(redact):
    url = "https://bucket.s3.amazonaws.com/map.tgz?X-Amz-Signature=secret&X-Amz-Credential=abc"
    out = redact(url)
    assert "secret" not in out
    assert "abc" not in out
    assert out.startswith("https://bucket.s3.amazonaws.com/map.tgz?<redacted:")
    # Query parameter *names* are preserved (sorted) for debugging.
    assert "X-Amz-Credential" in out
    assert "X-Amz-Signature" in out


def test_url_without_query_is_unchanged(redact):
    url = "https://bucket.s3.amazonaws.com/map.tgz"
    assert redact(url) == url


def test_non_url_values_passthrough(redact):
    assert redact(None) is None
    assert redact("") == ""
    assert redact("not a url") == "not a url"
    assert redact(1234) == 1234


def test_redact_url_candidates():
    from custom_components.roomba_v4.coordinator import RoombaV4Coordinator

    candidates = [
        {"path": "$.a", "value": "https://x/y?token=abc"},
        {"path": "$.b", "value": "plain"},
        "unexpected",
    ]
    # Call the method unbound; it only touches its argument.
    out = RoombaV4Coordinator._redact_url_candidates(
        RoombaV4Coordinator, candidates
    )
    assert "abc" not in out[0]["value"]
    assert out[1]["value"] == "plain"
    assert out[2] == "unexpected"
