"""Regression tests for active-plan lifecycle on the coordinator.

A finished cleaning plan must be discarded (``active_plan`` set to ``None``) so
it is not persisted and later rendered as stale "0/N" progress when no cleaning
is in progress.

``coordinator.py`` imports Home Assistant at module load time, so these tests
are marked ``hass`` and skipped unless that environment is available. The
coordinator instance is built with ``object.__new__`` to avoid spinning up a
full HA runtime, because the methods under test only read/write ``active_plan``.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.hass


def _bare_coordinator():
    from custom_components.roomba_v4.coordinator import RoombaV4Coordinator

    return object.__new__(RoombaV4Coordinator)


def test_finish_active_plan_discards_plan():
    coord = _bare_coordinator()
    coord.active_plan = {
        "status": "cleaning",
        "rooms": [{"id": "1"}, {"id": "2"}],
        "completed_room_ids": ["1"],
        "current_room_id": "2",
        "remaining_room_ids": ["2"],
    }
    coord._finish_active_plan()
    assert coord.active_plan is None


def test_finish_active_plan_noop_when_no_plan():
    coord = _bare_coordinator()
    coord.active_plan = None
    # Must not raise.
    coord._finish_active_plan()
    assert coord.active_plan is None
