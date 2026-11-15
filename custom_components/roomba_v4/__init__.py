
from __future__ import annotations

import inspect
import logging
import uuid
from pathlib import Path

import voluptuous as vol
from homeassistant.components.frontend import add_extra_js_url
try:
    from homeassistant.components.http import StaticPathConfig
except ImportError:  # Home Assistant < 2024.7
    StaticPathConfig = None  # type: ignore[assignment]
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .cloud_api import IRobotCloudApi
from .const import CONF_AUTO_DOWNLOAD_MAP, CONF_COUNTRY_CODE, CONF_DEBUG_ENABLED, CONF_ROBOT_BLID, CONF_S3_MAP_URL, DOMAIN, PLATFORMS
from .coordinator import RoombaV4Coordinator
from .debug import get_debug_enabled

type RoombaV4ConfigEntry = ConfigEntry[dict]

_LOGGER = logging.getLogger(__name__)

SERVICE_REFRESH_MAP_FROM_ARCHIVE = "refresh_map_from_archive"
SERVICE_REFRESH_MAP_FROM_URL = "refresh_map_from_url"
SERVICE_CLEAR_PATH_HISTORY = "clear_path_history"
SERVICE_CLEAN_ROOM = "clean_room"
SERVICE_SPOT_CLEAN = "spot_clean"
SERVICE_CLEAN_ROOMS = "clean_rooms"
SERVICE_SAVE_ROUTINE = "save_routine"
SERVICE_DELETE_ROUTINE = "delete_routine"
SERVICE_RUN_ROUTINE = "run_routine"
SERVICE_SKIP_ROOM = "skip_room"
SERVICE_MISSION_COMMAND = "mission_command"

CARD_URL = "/roomba_v4/roomba-v4-map-card.js"
FRONTEND_REGISTERED = f"{DOMAIN}_frontend_registered"


async def _async_register_frontend(hass: HomeAssistant) -> None:
    if hass.data.get(FRONTEND_REGISTERED):
        return
    card_dir = Path(__file__).parent / "frontend"
    static_ok = False
    try:
        if StaticPathConfig is not None and hasattr(hass.http, "async_register_static_paths"):
            await hass.http.async_register_static_paths([
                StaticPathConfig("/roomba_v4", str(card_dir), cache_headers=False)
            ])
        else:
            hass.http.register_static_path("/roomba_v4", str(card_dir), cache_headers=False)
        static_ok = True
    except Exception as err:
        _LOGGER.warning("roomba_v4: unable to register map card static path: %s", err)
    module_ok = False
    try:
        result = add_extra_js_url(hass, CARD_URL)
        if inspect.isawaitable(result):
            await result
        module_ok = True
    except Exception as err:
        _LOGGER.warning("roomba_v4: unable to register map card frontend module: %s", err)
        try:
            extra_modules = hass.data.get("frontend_extra_module_url")
            if extra_modules is not None:
                extra_modules.add(CARD_URL)
            else:
                hass.data.setdefault("frontend_extra_module_url", set()).add(CARD_URL)
            module_ok = True
        except Exception as fallback_err:
            _LOGGER.warning("roomba_v4: frontend module fallback failed: %s", fallback_err)
    if static_ok and module_ok:
        hass.data[FRONTEND_REGISTERED] = True
        _LOGGER.info("roomba_v4: map card registered at %s", CARD_URL)
    else:
        _LOGGER.warning("roomba_v4: map card registration incomplete (static=%s, module=%s)", static_ok, module_ok)


def _target_coordinator(hass: HomeAssistant, call: ServiceCall) -> RoombaV4Coordinator:
    entry_id = call.data.get("entry_id")
    coordinators = hass.data.get(DOMAIN) or {}
    if entry_id:
        coordinator = coordinators.get(entry_id)
        if coordinator is None:
            raise vol.Invalid(f"Unknown roomba_v4 entry_id: {entry_id}")
        return coordinator
    if len(coordinators) == 1:
        return next(iter(coordinators.values()))
    raise vol.Invalid("Specify entry_id to select which robot should handle this service")


async def _async_reload_entry(hass: HomeAssistant, entry: RoombaV4ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_setup_entry(hass: HomeAssistant, entry: RoombaV4ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})
    session = async_get_clientsession(hass)
    api = IRobotCloudApi(
        username=entry.data[CONF_USERNAME],
        password=entry.data[CONF_PASSWORD],
        country_code=entry.data.get(CONF_COUNTRY_CODE, "US"),
        session=session,
    )
    client_config = entry.data.get("cloud_client_config")
    if not isinstance(client_config, dict) or not all(client_config.get(key) for key in ("appId", "deviceId")):
        identity = f"{hass.config.config_dir}:{entry.entry_id}"
        client_config = {
            "appId": str(uuid.uuid5(uuid.NAMESPACE_URL, f"roomba_v4:app:{identity}")),
            "deviceId": str(uuid.uuid5(uuid.NAMESPACE_URL, f"roomba_v4:device:{identity}")),
        }
        hass.config_entries.async_update_entry(entry, data={**entry.data, "cloud_client_config": client_config})
    api.config = dict(client_config)
    api.local_mqtt_ip_override = ""
    debug_enabled = get_debug_enabled(entry)
    coordinator = RoombaV4Coordinator(
        hass=hass,
        api=api,
        robot_blid=entry.data[CONF_ROBOT_BLID],
        entry_id=entry.entry_id,
        auto_download_map=entry.options.get(CONF_AUTO_DOWNLOAD_MAP, entry.data.get(CONF_AUTO_DOWNLOAD_MAP, True)),
        s3_map_url=entry.options.get(CONF_S3_MAP_URL, entry.data.get(CONF_S3_MAP_URL)) or None,
        debug_enabled=debug_enabled,
    )
    api.debug_dir = coordinator.debug_dir if debug_enabled else None
    await coordinator.async_config_entry_first_refresh()
    await coordinator.async_start_background_subscriber()
    hass.data[DOMAIN][entry.entry_id] = coordinator
    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))

    if not hass.services.has_service(DOMAIN, SERVICE_REFRESH_MAP_FROM_ARCHIVE):
        async def _handle_refresh_archive(call: ServiceCall) -> None:
            archive_path = call.data["archive_path"]
            show_labels = call.data.get("show_labels", True)
            show_coverage = call.data.get("show_coverage", True)
            for stored_coordinator in hass.data[DOMAIN].values():
                await stored_coordinator.async_refresh_map_from_archive(archive_path, show_labels=show_labels, show_coverage=show_coverage)

        hass.services.async_register(
            DOMAIN,
            SERVICE_REFRESH_MAP_FROM_ARCHIVE,
            _handle_refresh_archive,
            schema=vol.Schema({
                vol.Required("archive_path"): str,
                vol.Optional("show_labels", default=True): bool,
                vol.Optional("show_coverage", default=True): bool,
            }),
        )

    if not hass.services.has_service(DOMAIN, SERVICE_REFRESH_MAP_FROM_URL):
        async def _handle_refresh_url(call: ServiceCall) -> None:
            url = call.data["url"]
            for stored_coordinator in hass.data[DOMAIN].values():
                await stored_coordinator.async_refresh_map_from_url(url)

        hass.services.async_register(
            DOMAIN,
            SERVICE_REFRESH_MAP_FROM_URL,
            _handle_refresh_url,
            schema=vol.Schema({vol.Required("url"): str}),
        )


    if not hass.services.has_service(DOMAIN, SERVICE_CLEAN_ROOM):
        async def _handle_clean_room(call: ServiceCall) -> None:
            room_name = call.data["room_name"]
            target_entry_id = call.data.get("entry_id")
            coordinators = hass.data[DOMAIN].values()
            if target_entry_id:
                coordinator = hass.data[DOMAIN].get(target_entry_id)
                if coordinator is None:
                    raise vol.Invalid(f"Unknown roomba_v4 entry_id: {target_entry_id}")
                coordinators = [coordinator]
            handled = False
            for stored_coordinator in coordinators:
                if room_name in (stored_coordinator.rooms or []):
                    await stored_coordinator.async_clean_room_by_name(room_name)
                    handled = True
            if not handled:
                raise vol.Invalid(f"Room not found in available roomba_v4 coordinators: {room_name}")

        hass.services.async_register(
            DOMAIN,
            SERVICE_CLEAN_ROOM,
            _handle_clean_room,
            schema=vol.Schema({
                vol.Required("room_name"): str,
                vol.Optional("entry_id"): str,
            }),
        )

    if not hass.services.has_service(DOMAIN, SERVICE_SPOT_CLEAN):
        async def _handle_spot_clean(call: ServiceCall) -> None:
            entry_id = call.data.get("entry_id")
            coordinators = hass.data[DOMAIN]
            if entry_id:
                coordinator = coordinators.get(entry_id)
                if coordinator is None:
                    raise vol.Invalid("Unknown Roomba entry")
            elif len(coordinators) == 1:
                coordinator = next(iter(coordinators.values()))
            else:
                raise vol.Invalid("Specify entry_id to select which robot should clean the spot")
            await coordinator.async_spot_clean(call.data["x"], call.data["y"])

        hass.services.async_register(
            DOMAIN, SERVICE_SPOT_CLEAN, _handle_spot_clean,
            schema=vol.Schema({vol.Required("x"): vol.Coerce(float), vol.Required("y"): vol.Coerce(float), vol.Optional("entry_id"): str}),
        )

    if not hass.services.has_service(DOMAIN, SERVICE_CLEAR_PATH_HISTORY):
        async def _handle_clear_path_history(call: ServiceCall) -> None:
            for stored_coordinator in hass.data[DOMAIN].values():
                camera = getattr(stored_coordinator, "map_camera", None)
                if camera is not None:
                    await camera.async_clear_path_history()
                stored_coordinator.async_update_listeners()

        hass.services.async_register(
            DOMAIN,
            SERVICE_CLEAR_PATH_HISTORY,
            _handle_clear_path_history,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_CLEAN_ROOMS):
        async def _handle_clean_rooms(call: ServiceCall) -> None:
            coordinator = _target_coordinator(hass, call)
            rooms = call.data["rooms"]
            if isinstance(rooms, (str, dict)):
                rooms = [rooms]
            await coordinator.async_clean_rooms(
                list(rooms),
                settings=call.data.get("settings"),
                source="service",
            )

        hass.services.async_register(
            DOMAIN,
            SERVICE_CLEAN_ROOMS,
            _handle_clean_rooms,
            schema=vol.Schema({
                vol.Required("rooms"): vol.Any(str, dict, [vol.Any(str, dict)]),
                vol.Optional("settings"): dict,
                vol.Optional("entry_id"): str,
            }),
        )

    if not hass.services.has_service(DOMAIN, SERVICE_SAVE_ROUTINE):
        async def _handle_save_routine(call: ServiceCall) -> None:
            coordinator = _target_coordinator(hass, call)
            await coordinator.async_save_map_routine(call.data["name"], call.data["config"])

        hass.services.async_register(
            DOMAIN,
            SERVICE_SAVE_ROUTINE,
            _handle_save_routine,
            schema=vol.Schema({
                vol.Required("name"): str,
                vol.Required("config"): dict,
                vol.Optional("entry_id"): str,
            }),
        )

    if not hass.services.has_service(DOMAIN, SERVICE_DELETE_ROUTINE):
        async def _handle_delete_routine(call: ServiceCall) -> None:
            coordinator = _target_coordinator(hass, call)
            await coordinator.async_delete_map_routine(call.data["name"])

        hass.services.async_register(
            DOMAIN,
            SERVICE_DELETE_ROUTINE,
            _handle_delete_routine,
            schema=vol.Schema({
                vol.Required("name"): str,
                vol.Optional("entry_id"): str,
            }),
        )

    if not hass.services.has_service(DOMAIN, SERVICE_RUN_ROUTINE):
        async def _handle_run_routine(call: ServiceCall) -> None:
            coordinator = _target_coordinator(hass, call)
            await coordinator.async_run_map_routine(call.data["name"])

        hass.services.async_register(
            DOMAIN,
            SERVICE_RUN_ROUTINE,
            _handle_run_routine,
            schema=vol.Schema({
                vol.Required("name"): str,
                vol.Optional("entry_id"): str,
            }),
        )

    if not hass.services.has_service(DOMAIN, SERVICE_SKIP_ROOM):
        async def _handle_skip_room(call: ServiceCall) -> None:
            coordinator = _target_coordinator(hass, call)
            await coordinator.async_skip_room()

        hass.services.async_register(
            DOMAIN,
            SERVICE_SKIP_ROOM,
            _handle_skip_room,
            schema=vol.Schema({vol.Optional("entry_id"): str}),
        )

    if not hass.services.has_service(DOMAIN, SERVICE_MISSION_COMMAND):
        async def _handle_mission_command(call: ServiceCall) -> None:
            coordinator = _target_coordinator(hass, call)
            command = str(call.data["command"]).lower()
            if command == "pause":
                await coordinator.async_pause_cleaning()
            elif command == "resume":
                await coordinator.async_resume_cleaning()
            elif command == "stop":
                await coordinator.async_stop_cleaning()
            elif command == "dock":
                await coordinator.async_return_to_base()
            elif command == "skip":
                await coordinator.async_skip_room()
            else:
                raise vol.Invalid(f"Unsupported mission command: {command}")

        hass.services.async_register(
            DOMAIN,
            SERVICE_MISSION_COMMAND,
            _handle_mission_command,
            schema=vol.Schema({
                vol.Required("command"): vol.In(["pause", "resume", "stop", "dock", "skip"]),
                vol.Optional("entry_id"): str,
            }),
        )

    await _async_register_frontend(hass)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True

async def async_unload_entry(hass: HomeAssistant, entry: RoombaV4ConfigEntry) -> bool:
    coordinator = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if coordinator is not None:
        await coordinator.async_shutdown()
        await coordinator.api.async_shutdown_event_subscriber()
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok
