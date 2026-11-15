"""Shared pytest fixtures and configuration.

This project has two test tiers:

1. Pure unit tests that exercise self-contained helpers (tar extraction
   hardening, URL redaction, download size limits). They only need pytest and
   Pillow, and import the integration modules directly from the component
   directory.

2. Home Assistant integration tests marked with ``@pytest.mark.hass``. They
   require ``pytest-homeassistant-custom-component`` and are skipped
   automatically when that plugin is not installed. Tests that actually drive a
   running HA instance should request the ``hass`` fixture and the
   ``enable_custom_integrations`` fixture explicitly.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Make the integration importable both as a top-level module (e.g. ``import
# map_renderer``) for the pure tests and as part of the ``custom_components``
# package for the Home Assistant tests.
_ROOT = Path(__file__).resolve().parent.parent
_COMPONENT_DIR = _ROOT / "custom_components" / "roomba_v4"
for _p in (str(_ROOT), str(_COMPONENT_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)


def _ha_available() -> bool:
    try:
        import pytest_homeassistant_custom_component  # noqa: F401
    except Exception:
        return False
    return True


HA_AVAILABLE = _ha_available()

# Load the HA test plugin only when present. It bundles pytest-asyncio.
if HA_AVAILABLE:
    pytest_plugins = ["pytest_homeassistant_custom_component"]


def pytest_configure(config):
    """Register markers and, when available, enable auto asyncio mode."""
    config.addinivalue_line(
        "markers",
        "hass: test requires a full Home Assistant test environment",
    )
    if HA_AVAILABLE:
        # pytest-asyncio is bundled with the HA plugin; enable auto mode so
        # plain ``async def`` tests run without an explicit marker, and set the
        # fixture loop scope to the value pytest-asyncio recommends (leaving it
        # unset emits a deprecation warning). These are applied here rather than
        # in pytest.ini because the options only exist when the plugin is
        # installed; declaring them globally would warn in the pure test tier.
        try:
            config.option.asyncio_mode = "auto"
            config.inicfg["asyncio_default_fixture_loop_scope"] = "function"
            config.option.asyncio_default_fixture_loop_scope = "function"
        except Exception:
            pass


def pytest_collection_modifyitems(config, items):
    """Skip HA-dependent tests when the HA test plugin is not installed."""
    if HA_AVAILABLE:
        return
    skip = pytest.mark.skip(
        reason="pytest-homeassistant-custom-component not installed; "
        "install requirements_test.txt (HA tier) to run @pytest.mark.hass tests"
    )
    for item in items:
        if "hass" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def enable_roomba_custom_integration(enable_custom_integrations):
    """Opt-in fixture for tests that spin up a real HA instance.

    Only request this (alongside the ``hass`` fixture) in tests that actually
    set up the integration. Pure import/mocked tests must not request it.
    """
    yield
