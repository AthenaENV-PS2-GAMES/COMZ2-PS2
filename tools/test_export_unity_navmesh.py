import struct
import unittest

from tools.export_unity_navmesh import (
    DETOUR_MAGIC,
    DETOUR_VERSION,
    HEADER_SIZE,
    POLY_STRIDE,
    build_graph,
    parse_tile,
    point_in_polygon,
)


def make_tile(vertices):
    blob = bytearray(HEADER_SIZE + len(vertices) * 12 + POLY_STRIDE)
    struct.pack_into("<2I", blob, 0, DETOUR_MAGIC, DETOUR_VERSION)
    struct.pack_into("<2i", blob, 20, 1, len(vertices))
    struct.pack_into("<7f", blob, 44, -1, 0, -1, 1, 0, 1, 6)
    offset = HEADER_SIZE
    for vertex in vertices:
        struct.pack_into("<3f", blob, offset, *vertex)
        offset += 12
    struct.pack_into("<6H", blob, offset, 0, 1, 2, 3, 0, 0)
    struct.pack_into("<6H", blob, offset + 12, 0, 0, 0, 0, 0, 0)
    struct.pack_into("<i", blob, offset + 28, 4)
    return bytes(blob)


def make_tile_with_polygons(vertices, polygons):
    blob = bytearray(
        HEADER_SIZE + len(vertices) * 12 + len(polygons) * POLY_STRIDE
    )
    struct.pack_into("<2I", blob, 0, DETOUR_MAGIC, DETOUR_VERSION)
    struct.pack_into("<2i", blob, 20, len(polygons), len(vertices))
    offset = HEADER_SIZE
    for vertex in vertices:
        struct.pack_into("<3f", blob, offset, *vertex)
        offset += 12
    for corners, neighbors in polygons:
        struct.pack_into(
            "<6H", blob, offset, *(corners + [0] * (6 - len(corners)))
        )
        struct.pack_into(
            "<6H", blob, offset + 12, *(neighbors + [0] * (6 - len(neighbors)))
        )
        struct.pack_into("<i", blob, offset + 28, len(corners))
        offset += POLY_STRIDE
    return bytes(blob)


class UnityNavMeshExportTests(unittest.TestCase):
    def test_parses_vertices_and_applies_scene_centering_offset(self):
        tile = make_tile([
            (-1, 2, -1),
            (0, 2, -1),
            (0, 2, 1),
            (-1, 2, 1),
        ])
        vertices, polygons = parse_tile(
            tile,
            position=(0, 0, 0),
            rotation=(0, 0, 0, 1),
            offset=(1, -2, 1),
        )

        self.assertEqual(len(vertices), 4)
        self.assertEqual(vertices[0], (0, 0, 0))
        self.assertEqual(polygons[0]["vertices"], [0, 1, 2, 3])

    def test_links_polygons_across_tile_edges_and_locates_walkable_area(self):
        left = make_tile([
            (-1, 0, -1),
            (0, 0, -1),
            (0, 0, 1),
            (-1, 0, 1),
        ])
        right = make_tile([
            (0, 0, -1),
            (1, 0, -1),
            (1, 0, 1),
            (0, 0, 1),
        ])
        vertices, polygons = build_graph(
            [left, right],
            position=(0, 0, 0),
            rotation=(0, 0, 0, 1),
            offset=(0, 0, 0),
        )

        self.assertEqual(len(polygons), 2)
        self.assertEqual([edge[0] for edge in polygons[0]["n"]], [1])
        self.assertEqual([edge[0] for edge in polygons[1]["n"]], [0])
        self.assertTrue(point_in_polygon(-0.5, 0, polygons[0], vertices))
        self.assertFalse(point_in_polygon(0.5, 0, polygons[0], vertices))

    def test_rejects_unsupported_tile_versions(self):
        tile = bytearray(make_tile([
            (-1, 0, -1),
            (0, 0, -1),
            (0, 0, 1),
            (-1, 0, 1),
        ]))
        struct.pack_into("<I", tile, 4, DETOUR_VERSION + 1)
        with self.assertRaisesRegex(ValueError, "Unsupported NavMesh"):
            parse_tile(
                bytes(tile),
                position=(0, 0, 0),
                rotation=(0, 0, 0, 1),
                offset=(0, 0, 0),
            )

    def test_preserves_local_neighbor_indices_after_non_walkable_polygon(self):
        tile = make_tile_with_polygons(
            [
                (-2, 0, 0),
                (-1, 0, 0),
                (-1, 0, -1),
                (0, 0, -1),
                (0, 0, 1),
                (-1, 0, 1),
                (2, 0, -1),
                (3, 0, -1),
                (3, 0, 1),
                (2, 0, 1),
            ],
            [
                ([0, 1], []),
                ([2, 3, 4, 5], [0, 0, 0, 3]),
                ([6, 7, 8, 9], [2, 0, 0, 0]),
            ],
        )
        _, polygons = build_graph(
            [tile],
            position=(0, 0, 0),
            rotation=(0, 0, 0, 1),
            offset=(0, 0, 0),
        )

        self.assertEqual(len(polygons), 2)
        self.assertEqual([edge[0] for edge in polygons[0]["n"]], [1])
        self.assertEqual([edge[0] for edge in polygons[1]["n"]], [0])


if __name__ == "__main__":
    unittest.main()
