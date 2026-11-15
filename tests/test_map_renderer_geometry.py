"""Unit tests for the pure GeoJSON parsing helpers in ``map_renderer``."""

from __future__ import annotations

from map_renderer import _ring_to_points, geometry_polygons


def test_ring_to_points_filters_invalid_coords():
    ring = [[1, 2], ["x", "y"], [3.5, 4.5], [1], None, [5, 6, 7]]
    assert _ring_to_points(ring) == [[1.0, 2.0], [3.5, 4.5], [5.0, 6.0]]


def test_ring_to_points_non_sequence():
    assert _ring_to_points(None) == []
    assert _ring_to_points("nope") == []


def test_geometry_polygons_polygon():
    geom = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1]]]}
    assert geometry_polygons(geom) == [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]]]


def test_geometry_polygons_drops_degenerate_ring():
    # Fewer than 3 points is not a valid polygon.
    geom = {"type": "Polygon", "coordinates": [[[0, 0], [1, 1]]]}
    assert geometry_polygons(geom) == []


def test_geometry_polygons_multipolygon():
    geom = {
        "type": "MultiPolygon",
        "coordinates": [
            [[[0, 0], [1, 0], [1, 1]]],
            [[[2, 2], [3, 2], [3, 3]]],
        ],
    }
    assert geometry_polygons(geom) == [
        [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
        [[2.0, 2.0], [3.0, 2.0], [3.0, 3.0]],
    ]


def test_geometry_polygons_collection_recurses():
    geom = {
        "type": "GeometryCollection",
        "geometries": [
            {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1]]]},
        ],
    }
    assert geometry_polygons(geom) == [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]]]


def test_geometry_polygons_rejects_non_dict():
    assert geometry_polygons(None) == []
    assert geometry_polygons("nope") == []
    assert geometry_polygons({"type": "Point", "coordinates": [1, 2]}) == []
