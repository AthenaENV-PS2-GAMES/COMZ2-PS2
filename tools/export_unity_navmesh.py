#!/usr/bin/env python3
"""Export a Unity 2017 NavMeshData asset as a compact polygon navigation graph."""
from __future__ import annotations

import argparse
from collections import deque
import json
import math
from pathlib import Path
import struct


DETOUR_MAGIC = 0x444E4156
DETOUR_VERSION = 16
HEADER_SIZE = 72
POLY_STRIDE = 32
VERTS_PER_POLY = 6


def rotate(point: tuple[float, float, float], quat: tuple[float, ...]) -> tuple[float, float, float]:
    x, y, z = point
    qx, qy, qz, qw = quat
    tx = 2.0 * (qy * z - qz * y)
    ty = 2.0 * (qz * x - qx * z)
    tz = 2.0 * (qx * y - qy * x)
    return (
        x + qw * tx + qy * tz - qz * ty,
        y + qw * ty + qz * tx - qx * tz,
        z + qw * tz + qx * ty - qy * tx,
    )


def parse_tile(
    blob: bytes,
    position: tuple[float, float, float],
    rotation: tuple[float, float, float, float],
    offset: tuple[float, float, float],
) -> tuple[list[tuple[float, float, float]], list[dict]]:
    if len(blob) < HEADER_SIZE:
        raise ValueError("NavMesh tile is shorter than its header")
    magic, version = struct.unpack_from("<2I", blob)
    if magic != DETOUR_MAGIC or version != DETOUR_VERSION:
        raise ValueError(f"Unsupported NavMesh tile magic/version: {magic:#x}/{version}")

    poly_count, vertex_count = struct.unpack_from("<2i", blob, 20)
    if not 0 < poly_count <= 65535 or not 0 < vertex_count <= 65535:
        raise ValueError(f"Invalid tile counts: {poly_count} polygons, {vertex_count} vertices")
    vertex_end = HEADER_SIZE + vertex_count * 12
    polygon_end = vertex_end + poly_count * POLY_STRIDE
    if polygon_end > len(blob):
        raise ValueError("NavMesh tile ends before its polygon records")

    vertices = []
    for index in range(vertex_count):
        local = struct.unpack_from("<3f", blob, HEADER_SIZE + index * 12)
        if not all(math.isfinite(value) for value in local):
            raise ValueError(f"Non-finite vertex {index} in NavMesh tile")
        rotated = rotate(local, rotation)
        vertices.append(tuple(
            rotated[axis] + position[axis] + offset[axis]
            for axis in range(3)
        ))

    polygons = []
    for index in range(poly_count):
        start = vertex_end + index * POLY_STRIDE
        count = struct.unpack_from("<i", blob, start + 28)[0]
        if count < 3:
            continue
        if count > VERTS_PER_POLY:
            raise ValueError(f"Polygon {index} has {count} vertices; maximum is {VERTS_PER_POLY}")
        corners = struct.unpack_from("<6H", blob, start)
        if any(corner >= vertex_count for corner in corners[:count]):
            raise ValueError(f"Polygon {index} references a missing vertex")
        polygons.append({
            "local_id": index,
            "vertices": list(corners[:count]),
            "neighbors": struct.unpack_from("<6H", blob, start + 12)[:count],
        })
    return vertices, polygons


def point_in_polygon(x: float, z: float, polygon: dict, vertices: list[list[float]]) -> bool:
    inside = False
    corners = [vertices[index] for index in polygon["v"]]
    previous = corners[-1]
    for current in corners:
        if (current[2] > z) != (previous[2] > z):
            crossing_x = (
                (previous[0] - current[0]) * (z - current[2]) /
                (previous[2] - current[2]) + current[0]
            )
            if x < crossing_x:
                inside = not inside
        previous = current
    return inside


def build_graph(
    tiles: list[bytes],
    position: tuple[float, float, float],
    rotation: tuple[float, float, float, float],
    offset: tuple[float, float, float],
) -> tuple[list[list[float]], list[dict]]:
    vertices: list[list[float]] = []
    vertex_lookup: dict[tuple[int, int, int], int] = {}
    polygons: list[dict] = []
    tile_polygon_ids = []

    for blob in tiles:
        tile_vertices, tile_polygons = parse_tile(blob, position, rotation, offset)
        vertex_ids = []
        for vertex in tile_vertices:
            key = tuple(round(value * 1000) for value in vertex)
            vertex_id = vertex_lookup.get(key)
            if vertex_id is None:
                vertex_id = len(vertices)
                vertex_lookup[key] = vertex_id
                vertices.append([round(value, 4) for value in vertex])
            vertex_ids.append(vertex_id)

        local_to_global = {}
        for polygon in tile_polygons:
            ids = [vertex_ids[index] for index in polygon["vertices"]]
            center = [
                round(sum(vertices[index][axis] for index in ids) / len(ids), 4)
                for axis in range(3)
            ]
            local_to_global[polygon["local_id"]] = len(polygons)
            polygons.append({"v": ids, "c": center, "n": []})
        tile_polygon_ids.append((local_to_global, tile_polygons))

    adjacency: list[dict[int, tuple[float, float]]] = [dict() for _ in polygons]
    shared_edges: dict[tuple[int, int], list[tuple[int, float, float]]] = {}
    for polygon_id, polygon in enumerate(polygons):
        corners = polygon["v"]
        for edge in range(len(corners)):
            a, b = corners[edge], corners[(edge + 1) % len(corners)]
            edge_key = tuple(sorted((a, b)))
            shared_edges.setdefault(edge_key, []).append(
                (polygon_id, (vertices[a][0] + vertices[b][0]) * 0.5,
                 (vertices[a][2] + vertices[b][2]) * 0.5)
            )

    for edge_owners in shared_edges.values():
        if len(edge_owners) < 2:
            continue
        for owner in edge_owners:
            for neighbor in edge_owners:
                if owner[0] != neighbor[0]:
                    adjacency[owner[0]][neighbor[0]] = (owner[1], owner[2])

    for local_to_global, source_polygons in tile_polygon_ids:
        for source_polygon in source_polygons:
            local_id = source_polygon["local_id"]
            polygon_id = local_to_global[local_id]
            for edge, neighbor_ref in enumerate(source_polygon["neighbors"]):
                if neighbor_ref == 0 or neighbor_ref & 0x8000:
                    continue
                neighbor_local = neighbor_ref - 1
                neighbor_id = local_to_global.get(neighbor_local)
                if neighbor_id is None:
                    continue
                if neighbor_id == polygon_id:
                    continue
                corners = polygons[polygon_id]["v"]
                a, b = corners[edge], corners[(edge + 1) % len(corners)]
                adjacency[polygon_id][neighbor_id] = (
                    (vertices[a][0] + vertices[b][0]) * 0.5,
                    (vertices[a][2] + vertices[b][2]) * 0.5,
                )

    for polygon_id, polygon in enumerate(polygons):
        polygon["n"] = [
            [neighbor, round(midpoint[0], 4), round(midpoint[1], 4)]
            for neighbor, midpoint in sorted(adjacency[polygon_id].items())
        ]

    return vertices, polygons


def component_sizes(polygons: list[dict]) -> list[int]:
    visited = set()
    sizes = []
    for start in range(len(polygons)):
        if start in visited:
            continue
        queue = deque([start])
        visited.add(start)
        size = 0
        while queue:
            current = queue.popleft()
            size += 1
            for neighbor, *_ in polygons[current]["n"]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        sizes.append(size)
    return sorted(sizes, reverse=True)


def load_unity_navmesh(path: Path):
    try:
        import UnityPy
    except ImportError as error:
        raise SystemExit("UnityPy is required; install it with `uv pip install UnityPy`") from error

    environment = UnityPy.load(str(path))
    objects = [obj for obj in environment.objects if obj.type.name == "NavMeshData"]
    if len(objects) != 1:
        raise ValueError(f"Expected one NavMeshData object in {path}, found {len(objects)}")
    data = objects[0].read()
    tiles = [bytes(tile.m_MeshData) for tile in data.m_NavMeshTiles if tile.m_MeshData]
    position = tuple(float(getattr(data.m_Position, axis)) for axis in "xyz")
    rotation = tuple(float(getattr(data.m_Rotation, axis)) for axis in "xyzw")
    return tiles, position, rotation


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--asset",
        type=Path,
        default=Path("Assets/Scene/Scenes/COM2_NORMAL_1/NavMesh.asset"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("PS2Assets/SceneImports/COM2_NORMAL_1/Navigation/navmesh.json"),
    )
    parser.add_argument(
        "--position-offset",
        type=float,
        nargs=3,
        default=(21.06937, -10000.11328125, 1.9064159),
        metavar=("X", "Y", "Z"),
    )
    args = parser.parse_args()
    tiles, position, rotation = load_unity_navmesh(args.asset)
    vertices, polygons = build_graph(tiles, position, rotation, tuple(args.position_offset))
    if not polygons:
        raise ValueError(f"No walkable polygons decoded from {args.asset}")

    output = {
        "source": args.asset.as_posix(),
        "tileVersion": DETOUR_VERSION,
        "tiles": len(tiles),
        "offset": args.position_offset,
        "vertices": vertices,
        "polygons": polygons,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, separators=(",", ":")) + "\n", encoding="utf-8")

    origin_polygons = [
        index for index, polygon in enumerate(polygons)
        if point_in_polygon(0.0, 0.0, polygon, vertices)
    ]
    components = component_sizes(polygons)
    print(json.dumps({
        "output": args.output.as_posix(),
        "tiles": len(tiles),
        "vertices": len(vertices),
        "polygons": len(polygons),
        "triangles": sum(len(polygon["v"]) - 2 for polygon in polygons),
        "connections": sum(len(polygon["n"]) for polygon in polygons) // 2,
        "components": components,
        "spawnPolygons": origin_polygons,
        "bytes": args.output.stat().st_size,
    }, indent=2))


if __name__ == "__main__":
    main()
