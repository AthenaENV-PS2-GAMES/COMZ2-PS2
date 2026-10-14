#!/usr/bin/env python3
"""Pack scene OBJ atlases into small, repeat-safe pages for AthenaENV."""
from __future__ import annotations

import argparse
from collections import defaultdict
import itertools
import json
import math
from pathlib import Path
import re

from PIL import Image


def parse_obj(path: Path) -> tuple[list[tuple[float, ...]], list[tuple[float, ...]], list[tuple[float, ...]], list[tuple[str, tuple[int, ...]]]]:
    positions = []
    texcoords = []
    normals = []
    faces = []
    for line in path.read_text(encoding="ascii").splitlines():
        fields = line.split()
        if not fields:
            continue
        if fields[0] == "v":
            positions.append(tuple(map(float, fields[1:4])))
        elif fields[0] == "vt":
            texcoords.append(tuple(map(float, fields[1:3])))
        elif fields[0] == "vn":
            normals.append(tuple(map(float, fields[1:4])))
        elif fields[0] == "usemtl":
            if faces and faces[-1][0] != fields[1]:
                faces.append((fields[1], ()))
            elif not faces:
                faces.append((fields[1], ()))
        elif fields[0] == "f":
            if len(fields) != 4:
                raise ValueError(f"{path}: only triangle faces are supported")
            if not faces:
                faces.append(("default", ()))
            material, _ = faces[-1]
            refs = []
            for value in fields[1:]:
                parts = value.split("/")
                if len(parts) != 3 or not all(parts):
                    raise ValueError(f"{path}: expected position/UV/normal face indices")
                refs.append(tuple(int(index) - 1 for index in parts))
            faces.append((material, tuple(index for ref in refs for index in ref)))
    # Store each face as its own tuple while retaining its current material.
    current_material = "default"
    parsed_faces = []
    for material, refs in faces:
        if not refs:
            current_material = material
            continue
        parsed_faces.append((current_material, refs))
    return positions, texcoords, normals, parsed_faces


def clip_polygon(
    polygon: list[tuple[float, ...]], axis: int, boundary: float, keep_greater: bool
) -> list[tuple[float, ...]]:
    if not polygon:
        return []

    def inside(point: tuple[float, ...]) -> bool:
        return point[axis] >= boundary - 1e-9 if keep_greater else point[axis] <= boundary + 1e-9

    result = []
    previous = polygon[-1]
    previous_inside = inside(previous)
    for current in polygon:
        current_inside = inside(current)
        if current_inside != previous_inside:
            delta = current[axis] - previous[axis]
            if abs(delta) > 1e-12:
                amount = (boundary - previous[axis]) / delta
                result.append(tuple(
                    previous[i] + amount * (current[i] - previous[i])
                    for i in range(len(current))
                ))
        if current_inside:
            result.append(current)
        previous, previous_inside = current, current_inside
    return result


def wrapped_triangle_cells(
    corners: list[tuple[float, ...]],
) -> list[tuple[int, int, list[tuple[float, ...]]]]:
    min_u = min(point[0] for point in corners)
    max_u = max(point[0] for point in corners)
    min_v = min(point[1] for point in corners)
    max_v = max(point[1] for point in corners)
    u_start = math.floor(min_u)
    u_end = max(u_start, math.ceil(max_u) - 1)
    v_start = math.floor(min_v)
    v_end = max(v_start, math.ceil(max_v) - 1)
    if (u_end - u_start + 1) * (v_end - v_start + 1) > 64:
        raise ValueError("triangle UV repeat covers too many atlas tiles")
    for tile_v in range(v_start, v_end + 1):
        for tile_u in range(u_start, u_end + 1):
            polygon = clip_polygon(corners, 0, tile_u, True)
            polygon = clip_polygon(polygon, 0, tile_u + 1, False)
            polygon = clip_polygon(polygon, 1, tile_v, True)
            polygon = clip_polygon(polygon, 1, tile_v + 1, False)
            if len(polygon) >= 3:
                yield tile_u, tile_v, polygon


def normalize_normal(value: tuple[float, ...]) -> tuple[float, float, float]:
    length = math.sqrt(sum(component * component for component in value))
    if length <= 1e-12:
        return (0.0, 1.0, 0.0)
    return tuple(component / length for component in value)


def remap_uv(
    u: float,
    v: float,
    tile_u: int,
    tile_v: int,
    page_x: int,
    page_y: int,
    page_size: int,
    gutter: int,
) -> tuple[float, float]:
    inner_size = page_size // 2 - gutter * 2
    local_u = u - tile_u
    local_v = v - tile_v
    page_u = (page_x + gutter + local_u * inner_size) / page_size
    page_v = 1 - (page_y + gutter + (1 - local_v) * inner_size) / page_size
    return page_u, page_v


def quantize_page(page: Image.Image, alpha_cutoff: float = 0.1) -> tuple[Image.Image, int]:
    rgba = page.convert("RGBA")
    red, green, blue, alpha = rgba.split()
    threshold = round(alpha_cutoff * 255)
    alpha = alpha.point(lambda value: 255 if value >= threshold else 0)
    quantized = Image.merge("RGB", (red, green, blue)).quantize(
        colors=255,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.FLOYDSTEINBERG,
    ).convert("RGB")
    quantized.putalpha(alpha)
    pixels = quantized.load()
    for y in range(quantized.height):
        for x in range(quantized.width):
            if pixels[x, y][3] == 0:
                pixels[x, y] = (0, 0, 0, 0)
    color_count = len(quantized.getcolors(quantized.width * quantized.height) or ())
    if color_count > 256:
        raise ValueError(f"quantized page uses {color_count} colors; GS T8 supports at most 256")
    return quantized, color_count


def pack_page(
    records: list[dict],
    page_path: Path,
    obj_path: Path,
    page_size: int,
    gutter: int,
) -> dict:
    cell_size = page_size // 2
    inner_size = cell_size - gutter * 2
    page = Image.new("RGBA", (page_size, page_size), (0, 0, 0, 0))
    tile_offsets = {}
    for tile_index, record in enumerate(records):
        texture_path = Path(record["output_texture"])
        texture = Image.open(texture_path).convert("RGBA")
        texture = texture.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
        x0 = (tile_index % 2) * cell_size
        y0 = (tile_index // 2) * cell_size
        tile = Image.new("RGBA", (cell_size, cell_size))
        tile.paste(texture.crop((inner_size - gutter, 0, inner_size, inner_size)), (0, gutter))
        tile.paste(texture.crop((0, 0, gutter, inner_size)), (gutter + inner_size, gutter))
        tile.paste(texture.crop((0, inner_size - gutter, inner_size, inner_size)), (gutter, 0))
        tile.paste(texture.crop((0, 0, inner_size, gutter)), (gutter, gutter + inner_size))
        tile.paste(
            texture.crop((inner_size - gutter, inner_size - gutter, inner_size, inner_size)),
            (0, 0)
        )
        tile.paste(texture.crop((0, inner_size - gutter, gutter, inner_size)), (gutter + inner_size, 0))
        tile.paste(texture.crop((inner_size - gutter, 0, inner_size, gutter)), (0, gutter + inner_size))
        tile.paste(texture.crop((0, 0, gutter, gutter)), (gutter + inner_size, gutter + inner_size))
        tile.paste(texture, (gutter, gutter))
        page.paste(tile, (x0, y0))
        tile_offsets[texture_path.resolve()] = (x0, y0)
    page_path.parent.mkdir(parents=True, exist_ok=True)
    page, unique_colors = quantize_page(page)
    page.save(page_path, format="PNG", optimize=True)

    obj_lines = [f"mtllib {obj_path.stem}.mtl"]
    mtl_name = "scene_page"
    obj_lines.append(f"usemtl {mtl_name}")
    vertex_count = 0
    triangle_count = 0
    source_atlases = []
    for record in records:
        source_obj = Path(record["output_obj"])
        positions, texcoords, normals, faces = parse_obj(source_obj)
        page_x, page_y = tile_offsets[Path(record["output_texture"]).resolve()]
        source_atlases.append({
            "texture": record["output_texture"],
            "source_mesh": record["source_mesh"],
            "triangles": record["triangles"],
        })
        for _, refs in faces:
            corners = []
            for offset in range(0, len(refs), 3):
                position_index, uv_index, normal_index = refs[offset:offset + 3]
                position = positions[position_index]
                uv = texcoords[uv_index]
                normal = normals[normal_index]
                corners.append((*uv, *position, *normal))
            for tile_u, tile_v, polygon in wrapped_triangle_cells(corners):
                for fan in range(1, len(polygon) - 1):
                    triangle = (polygon[0], polygon[fan], polygon[fan + 1])
                    for point in triangle:
                        page_u, page_v = remap_uv(
                            point[0], point[1], tile_u, tile_v,
                            page_x, page_y, page_size, gutter
                        )
                        if not all(math.isfinite(value) for value in (*point[2:5], page_u, page_v)):
                            raise ValueError(f"{source_obj}: non-finite packed geometry")
                        obj_lines.append(
                            "v " + " ".join(f"{value:.9g}" for value in point[2:5])
                        )
                        obj_lines.append(f"vt {page_u:.9g} {page_v:.9g}")
                        normal = normalize_normal(point[5:8])
                        obj_lines.append("vn " + " ".join(f"{value:.9g}" for value in normal))
                    first = vertex_count + 1
                    obj_lines.append(
                        f"f {first}/{first}/{first} "
                        f"{first + 1}/{first + 1}/{first + 1} "
                        f"{first + 2}/{first + 2}/{first + 2}"
                    )
                    vertex_count += 3
                    triangle_count += 1
    obj_path.parent.mkdir(parents=True, exist_ok=True)
    obj_path.write_text("\n".join(obj_lines) + "\n", encoding="ascii")
    obj_path.with_suffix(".mtl").write_text(
        f"newmtl {mtl_name}\nKd 1 1 1\nmap_Kd {page_path.name}\n",
        encoding="ascii",
    )
    return {
        "page": page_path.as_posix(),
        "obj": obj_path.as_posix(),
        "mtl": obj_path.with_suffix(".mtl").as_posix(),
        "page_size": page_size,
        "inner_tile_size": inner_size,
        "gutter": gutter,
        "texture_ct16_bytes": page_size * page_size * 2,
        "unique_rgba_colors": unique_colors,
        "gs_texture_format": "T8",
        "triangles": triangle_count,
        "vertices": vertex_count,
        "source_atlases": source_atlases,
    }


def balance_pages(records: list[dict], page_count: int) -> list[list[dict]]:
    bins = [{"records": [], "triangles": 0} for _ in range(page_count)]
    for record in sorted(records, key=lambda row: (-row["triangles"], row["output_texture"])):
        target = min(
            (index for index, item in enumerate(bins) if len(item["records"]) < 4),
            key=lambda index: bins[index]["triangles"],
        )
        bins[target]["records"].append(record)
        bins[target]["triangles"] += record["triangles"]
    return [item["records"] for item in bins]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("PS2Assets/SceneImports/COM2_NORMAL_1/manifest.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("PS2Assets/SceneImports/COM2_NORMAL_1/Packed"),
    )
    parser.add_argument("--page-size", type=int, choices=(256, 512), default=256)
    parser.add_argument("--gutter", type=int, default=2)
    args = parser.parse_args()
    if args.gutter < 1 or args.gutter * 2 >= args.page_size // 2:
        parser.error("gutter must leave a nonempty tile interior")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    records = [
        record for record in manifest["models"]
        if "Combined Mesh" in record["source_mesh"] and record.get("output_texture")
    ]
    if not records:
        parser.error("manifest contains no textured combined-mesh exports")
    if len(records) > 16:
        parser.error("the 2x2 page layout supports at most 16 source atlases")
    page_count = (len(records) + 3) // 4
    output_dir = args.output
    pages = []
    for index, group in enumerate(balance_pages(records, page_count)):
        pages.append(pack_page(
            group,
            output_dir / f"scene_page_{index + 1:02d}.png",
            output_dir / f"scene_page_{index + 1:02d}.obj",
            args.page_size,
            args.gutter,
        ))
    result = {
        "source_manifest": args.manifest.as_posix(),
        "page_size": args.page_size,
        "gutter": args.gutter,
        "page_count": len(pages),
        "ct16_texture_bytes": sum(page["texture_ct16_bytes"] for page in pages),
        "triangles": sum(page["triangles"] for page in pages),
        "pages": pages,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "packed-manifest.json").write_text(
        json.dumps(result, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Packed {len(records)} atlases into {len(pages)} "
        f"{args.page_size}x{args.page_size} pages; "
        f"{result['triangles']} triangles; "
        f"{result['ct16_texture_bytes'] / 1024:.0f} KiB CT16"
    )
    for page in pages:
        print(
            f"  {Path(page['obj']).name}: {page['triangles']} triangles, "
            f"{len(page['source_atlases'])} atlas tiles"
        )


if __name__ == "__main__":
    main()
