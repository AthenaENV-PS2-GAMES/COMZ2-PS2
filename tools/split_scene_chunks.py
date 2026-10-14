#!/usr/bin/env python3
"""Partition packed triangle OBJs spatially, sharing the original atlas textures.

No triangles are cut or removed. Faces are assigned by centroid; each output
mesh's actual bounds remain conservative, including triangles crossing cells.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import json
import math
from pathlib import Path

if __package__:
    from .pack_scene_atlases import parse_obj
else:
    from pack_scene_atlases import parse_obj


def split_scene(source: Path, output: Path, cell_size: float, centered: bool = False) -> dict:
    if not math.isfinite(cell_size) or cell_size <= 0:
        raise ValueError("cell size must be finite and positive")
    packed = json.loads((source / "packed-manifest.json").read_text())
    output.mkdir(parents=True, exist_ok=True)
    chunks = []
    for page_index, page in enumerate(packed["pages"], 1):
        obj = source / Path(page["obj"]).name
        positions, uvs, normals, faces = parse_obj(obj)
        cells = defaultdict(list)
        for _, refs in faces:
            points = [positions[refs[i]] for i in (0, 3, 6)]
            cell = tuple(math.floor(sum(p[axis] for p in points) / 3 / cell_size)
                         for axis in (0, 1, 2))
            cells[cell].append(refs)
        for index, (cell, cell_faces) in enumerate(sorted(cells.items())):
            # Keep well below Athena's corner limit even with a large cell size.
            for part in range(0, len(cell_faces), 2048):
                group = cell_faces[part:part + 2048]
                world_vertices = [positions[refs[i]] for refs in group for i in (0, 3, 6)]
                bounds = [[f(p[a] for p in world_vertices) for a in range(3)] for f in (min, max)]
                center = [(bounds[0][a] + bounds[1][a]) / 2 for a in range(3)] if centered else [0, 0, 0]
                target = output / f"page_{page_index:02}_cell_{index:03}_{part // 2048}.obj"
                lines = ["# Shared atlas supplied explicitly by the runtime."]
                vertices = []
                for refs in group:
                    for corner in range(3):
                        p, uv, n = refs[corner * 3:corner * 3 + 3]
                        vertices.append(positions[p])
                        local_position = tuple(positions[p][a] - center[a] for a in range(3))
                        for kind, values in (("v", local_position), ("vt", uvs[uv]),
                                             ("vn", normals[n])):
                            lines.append(kind + " " + " ".join(f"{v:.9g}" for v in values))
                for first in range(1, len(vertices) + 1, 3):
                    lines.append("f " + " ".join(f"{i}/{i}/{i}" for i in range(first, first + 3)))
                target.write_text("\n".join(lines) + "\n", encoding="ascii")
                record = {
                    "objPath": target.as_posix(),
                    "texturePath": (source / Path(page["page"]).name).as_posix(),
                    "triangles": len(group), "cell": cell,
                    "bounds": bounds,
                    "position": center
                }
                if page_index == 1:
                    record["alphaCutoff"] = 0.1
                chunks.append(record)
    result = {"cellSize": cell_size, "centered": centered, "triangles": sum(c["triangles"] for c in chunks),
              "textureCount": len(packed["pages"]), "chunks": chunks}
    if result["triangles"] != packed["triangles"]:
        raise ValueError("partition did not preserve the source triangle count")
    (output / "chunks.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("PS2Assets/SceneImports/COM2_NORMAL_1/Packed"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cell-size", type=float, default=8)
    parser.add_argument("--centered", action="store_true", help="Recenter meshes for Scene3D/LOD; record node positions")
    args = parser.parse_args()
    result = split_scene(args.source, args.output, args.cell_size, args.centered)
    print(f"{len(result['chunks'])} chunks, {result['triangles']} triangles, "
          f"{result['textureCount']} shared textures")


if __name__ == "__main__":
    main()
