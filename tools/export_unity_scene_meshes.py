#!/usr/bin/env python3
"""Export referenced Unity renderer meshes with their assigned diffuse maps."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import struct

from convert_unity_meshes import MAX_EXPANDED_CORNERS, export_mesh, submeshes

GUID_RE = re.compile(r"[0-9a-fA-F]{32}")
DOC_RE = re.compile(r"(?=^--- !u!\d+ &\d+)", re.M)
PPTR_RE = re.compile(r"\{fileID:\s*[^,}]+,\s*guid:\s*([0-9a-fA-F]{32})")
MAIN_TEX_RE = re.compile(
    r"(?ms)- _MainTex:\s*\n(?:(?!^\s*-\s+_).*\n)*?"
    r"\s*m_Texture:\s*\{fileID:\s*[^,}]+,\s*guid:\s*([0-9a-fA-F]{32})"
)


def guid_registry(assets_root: Path) -> dict[str, Path]:
    result = {}
    for meta in assets_root.rglob("*.meta"):
        text = meta.read_text(encoding="utf-8", errors="replace")
        match = re.search(r"^guid:\s*([0-9a-fA-F]{32})\s*$", text, re.M)
        if match:
            result[match.group(1).lower()] = meta.with_suffix("")
    return result


def game_object_id(document: str) -> str | None:
    match = re.search(r"^\s*m_GameObject:\s*\{fileID:\s*(-?\d+)", document, re.M)
    return match.group(1) if match else None


def pointer_guid(document: str, field: str) -> str | None:
    match = re.search(
        rf"^\s*{re.escape(field)}:\s*\{{fileID:\s*[^,}}]+,\s*guid:\s*"
        r"([0-9a-fA-F]{32})",
        document,
        re.M,
    )
    return match.group(1).lower() if match else None


def material_guids(document: str) -> list[str]:
    lines = document.splitlines()
    for index, line in enumerate(lines):
        match = re.match(r"^(\s*)m_Materials:\s*(.*)$", line)
        if not match:
            continue
        indentation = len(match.group(1))
        values = []
        inline = PPTR_RE.findall(match.group(2))
        values.extend(value.lower() for value in inline)
        for following in lines[index + 1 :]:
            list_item = re.match(r"^\s*-", following)
            if (
                following.strip()
                and len(following) - len(following.lstrip()) <= indentation
                and not list_item
            ):
                break
            values.extend(value.lower() for value in PPTR_RE.findall(following))
        return values
    return []


def static_batch_range(document: str) -> tuple[int, int] | None:
    match = re.search(
        r"(?ms)^\s*m_StaticBatchInfo:\s*\n"
        r"\s*firstSubMesh:\s*(\d+)\s*\n"
        r"\s*subMeshCount:\s*(\d+)",
        document,
    )
    if not match or int(match.group(2)) == 0:
        return None
    return int(match.group(1)), int(match.group(2))


def parse_vector(text: str, key: str, default: tuple[float, float]) -> tuple[float, float]:
    match = re.search(
        rf"^\s*{re.escape(key)}:\s*\{{x:\s*([-+0-9.eE]+),\s*y:\s*([-+0-9.eE]+)\}}",
        text,
        re.M,
    )
    return (float(match.group(1)), float(match.group(2))) if match else default


def read_materials(
    guid_paths: dict[str, Path],
) -> tuple[dict[str, dict], Counter[str]]:
    materials = {}
    unresolved = Counter()
    for guid, path in guid_paths.items():
        if path.suffix.lower() != ".mat":
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        texture_match = MAIN_TEX_RE.search(text)
        texture_guid = texture_match.group(1).lower() if texture_match else None
        texture_path = guid_paths.get(texture_guid) if texture_guid else None
        if texture_guid and texture_path is None:
            unresolved[texture_guid] += 1
        wrap = (False, False)
        if texture_path:
            texture_meta = texture_path.with_suffix(texture_path.suffix + ".meta")
            if texture_meta.is_file():
                texture_settings = texture_meta.read_text(
                    encoding="utf-8", errors="replace"
                )
                wrap_match = re.search(
                    r"(?ms)^\s*textureSettings:\s*\n(.*?)(?=^\S|\Z)",
                    texture_settings,
                )
                if wrap_match:
                    wrap_u = re.search(r"^\s*wrapU:\s*(\d+)", wrap_match.group(1), re.M)
                    wrap_v = re.search(r"^\s*wrapV:\s*(\d+)", wrap_match.group(1), re.M)
                    wrap = (
                        bool(wrap_u and int(wrap_u.group(1)) == 0),
                        bool(wrap_v and int(wrap_v.group(1)) == 0),
                    )
        materials[guid] = {
            "path": path,
            "texture_guid": texture_guid if texture_path else None,
            "texture_path": texture_path,
            "scale": parse_vector(text, "m_Scale", (1.0, 1.0)),
            "offset": parse_vector(text, "m_Offset", (0.0, 0.0)),
            "repeat_uv": wrap,
        }
    return materials, unresolved


def renderer_uses(path: Path) -> list[tuple[str, list[str], tuple[int, int] | None]]:
    """Return mesh GUIDs paired with materials from the same GameObject."""
    text = path.read_text(encoding="utf-8", errors="replace")
    filters: list[tuple[str, str]] = []
    renderers: dict[str, tuple[list[str], tuple[int, int] | None]] = {}
    for document in DOC_RE.split(text):
        header = re.match(r"--- !u!(\d+) &", document)
        if not header:
            continue
        component_type = int(header.group(1))
        object_id = game_object_id(document)
        if object_id is None:
            continue
        mesh_guid = pointer_guid(document, "m_Mesh")
        if component_type == 33 and mesh_guid:
            filters.append((object_id, mesh_guid))
        elif component_type in (23, 137):
            renderers[object_id] = (
                material_guids(document),
                static_batch_range(document),
            )
            if component_type == 137 and mesh_guid:
                filters.append((object_id, mesh_guid))
    return [
        (mesh_guid, *renderers.get(object_id, ([], None)))
        for object_id, mesh_guid in filters
    ]


def texture_key(
    material: dict | None,
) -> tuple[str | None, tuple[float, float], tuple[float, float], tuple[bool, bool]]:
    if material is None or material["texture_path"] is None:
        return None, (1.0, 1.0), (0.0, 0.0), (False, False)
    return (
        str(material["texture_path"]),
        material["scale"],
        material["offset"],
        material["repeat_uv"],
    )


def make_slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_-]+", "_", value).strip("_")
    return slug or "asset"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("PS2Assets/Models"),
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("PS2Assets/model-export-manifest.json"),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--scene",
        help="export only this scene path relative to the project root",
    )
    parser.add_argument(
        "--position-offset",
        type=float,
        nargs=3,
        metavar=("X", "Y", "Z"),
        default=(0.0, 0.0, 0.0),
        help="offset exported vertices, e.g. to center them around a player spawn",
    )
    args = parser.parse_args()

    project_root = args.project_root.resolve()
    assets_root = project_root / "Assets"
    catalog_path = project_root / "PS2AssetCatalog.json"
    if not catalog_path.is_file():
        parser.error("run tools/catalog_unity_assets.py before exporting models")
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    guid_paths = guid_registry(assets_root)
    materials, unresolved_material_textures = read_materials(guid_paths)
    path_guids = {path: guid for guid, path in guid_paths.items()}
    manifest_assets = {
        record["path"] for record in catalog["assets"]
        if record["category"] in {"prefab", "scene"}
    }
    if args.scene:
        scene_path = Path(args.scene).as_posix()
        if scene_path not in manifest_assets:
            parser.error(f"scene is not present in the asset catalog: {scene_path}")
        manifest_assets = {scene_path}

    grouped: dict[tuple, dict] = {}
    skipped_mesh_guids = Counter()
    builtin_mesh_guids = Counter()
    external_mesh_paths = Counter()
    mismatched_materials = []
    for relative_path in sorted(manifest_assets):
        source = project_root / relative_path
        for mesh_guid, material_refs, batch_range in renderer_uses(source):
            mesh_path = guid_paths.get(mesh_guid)
            if mesh_guid.startswith(("0000000000000000e", "0000000000000000f")):
                builtin_mesh_guids[mesh_guid] += 1
                continue
            if mesh_path is None:
                skipped_mesh_guids[mesh_guid] += 1
                continue
            if mesh_path.parent != assets_root / "Mesh":
                external_mesh_paths[mesh_path.relative_to(project_root).as_posix()] += 1
                continue
            mesh_text = mesh_path.read_text(encoding="ascii")
            mesh_submeshes = submeshes(mesh_text)
            submesh_count = len(mesh_submeshes)
            if batch_range:
                first_submesh, batch_count = batch_range
                if first_submesh + batch_count > submesh_count:
                    raise ValueError(
                        f"{relative_path}: static-batch range "
                        f"{first_submesh}+{batch_count} exceeds "
                        f"{mesh_path.name}'s {submesh_count} submeshes"
                    )
                if material_refs and len(material_refs) != batch_count:
                    mismatched_materials.append(
                        {
                            "source": relative_path,
                            "mesh": mesh_path.relative_to(project_root).as_posix(),
                            "materials": len(material_refs),
                            "submeshes": batch_count,
                            "static_batch_range": [first_submesh, batch_count],
                        }
                    )
                assignments = [
                    (
                        material_refs[min(slot, len(material_refs) - 1)]
                        if material_refs
                        else None,
                        first_submesh + slot,
                    )
                    for slot in range(batch_count)
                ]
            elif not material_refs:
                assignments = [(None, index) for index in range(submesh_count)]
            else:
                assignments = [
                    (material_refs[min(index, len(material_refs) - 1)], index)
                    for index in range(submesh_count)
                ]
                if len(material_refs) > submesh_count:
                    mismatched_materials.append(
                        {
                            "source": relative_path,
                            "mesh": mesh_path.relative_to(project_root).as_posix(),
                            "materials": len(material_refs),
                            "submeshes": submesh_count,
                            "unused_material_guids": material_refs[submesh_count:],
                        }
                    )
            for material_guid, submesh_index in assignments:
                material = materials.get(material_guid) if material_guid else None
                if material_guid and material is None:
                    material = None
                texture_path, uv_scale, uv_offset, repeat_uv = texture_key(material)
                key = (
                    mesh_path,
                    texture_path,
                    uv_scale,
                    uv_offset,
                    repeat_uv,
                )
                record = grouped.setdefault(
                    key,
                    {
                        "mesh_path": mesh_path,
                        "texture_path": Path(texture_path) if texture_path else None,
                        "texture_guid": material["texture_guid"]
                        if material and texture_path
                        else None,
                        "uv_scale": uv_scale,
                        "uv_offset": uv_offset,
                        "repeat_uv": repeat_uv,
                        "submeshes": set(),
                        "materials": set(),
                        "used_by": set(),
                        "static_batch_ranges": set(),
                    },
                )
                record["submeshes"].add(submesh_index)
                if batch_range:
                    record["static_batch_ranges"].add(batch_range)
                if material_guid:
                    record["materials"].add(material_guid)
                record["used_by"].add(relative_path)

    output_dir = args.output if args.output.is_absolute() else project_root / args.output
    manifest_path = args.manifest if args.manifest.is_absolute() else project_root / args.manifest
    mesh_records = []
    failures = []
    status_counts = Counter()
    submesh_cache: dict[Path, list[dict[str, int]]] = {}
    source_meshes = {
        guid_paths[guid]
        for guid in guid_paths
        if guid_paths[guid].parent == assets_root / "Mesh"
    }
    used_meshes = {record["mesh_path"] for record in grouped.values()}
    for key, record in sorted(
        grouped.items(),
        key=lambda item: (
            item[1]["mesh_path"].name.casefold(),
            str(item[1]["texture_path"] or ""),
            repr(item[1]["uv_scale"]),
            repr(item[1]["uv_offset"]),
        ),
    ):
        mesh_path = record["mesh_path"]
        texture_path = record["texture_path"]
        if mesh_path not in submesh_cache:
            submesh_cache[mesh_path] = submeshes(
                mesh_path.read_text(encoding="ascii")
            )
        raw_triangle_count = sum(
            submesh_cache[mesh_path][index]["indexCount"] // 3
            for index in record["submeshes"]
        )
        chunk_triangle_limit = MAX_EXPANDED_CORNERS // 3
        chunk_count = max(1, (raw_triangle_count + chunk_triangle_limit - 1) // chunk_triangle_limit)
        mesh_guid = path_guids.get(mesh_path, "unknown")
        texture_stem = texture_path.stem if texture_path else "untextured"
        output_stem = (
            f"{make_slug(mesh_path.stem)}_{mesh_guid[:8]}__"
            f"{make_slug(texture_stem)}_{(record['texture_guid'] or 'none')[:8]}_"
            f"{hashlib.sha1(repr((record['uv_scale'], record['uv_offset'])).encode()).hexdigest()[:6]}"
        )
        obj_path = output_dir / f"{output_stem}.obj"
        chunk_paths = (
            [
                output_dir / f"{output_stem}_part{index + 1:03d}.obj"
                for index in range(chunk_count)
            ]
            if chunk_count > 1
            else [obj_path]
        )
        texture_relative_path = (
            f"Textures/texture_{record['texture_guid']}.png"
            if texture_path
            else None
        )
        entry = {
            "source_mesh": mesh_path.relative_to(project_root).as_posix(),
            "source_mesh_guid": mesh_guid,
            "source_texture": (
                texture_path.relative_to(project_root).as_posix()
                if texture_path
                else None
            ),
            "source_texture_guid": record["texture_guid"],
            "material_uv_scale": record["uv_scale"],
            "material_uv_offset": record["uv_offset"],
            "texture_repeat_uv": record["repeat_uv"],
            "output_obj": obj_path.relative_to(project_root).as_posix(),
            "output_mtl": obj_path.with_suffix(".mtl").relative_to(project_root).as_posix(),
            "output_parts": [
                {
                    "obj": path.relative_to(project_root).as_posix(),
                    "mtl": path.with_suffix(".mtl").relative_to(project_root).as_posix(),
                }
                for path in chunk_paths
            ],
            "output_texture": (
                (output_dir / texture_relative_path).relative_to(project_root).as_posix()
                if texture_relative_path
                else None
            ),
            "submeshes": sorted(record["submeshes"]),
            "material_guids": sorted(record["materials"]),
            "static_batch_ranges": [
                list(value) for value in sorted(record["static_batch_ranges"])
            ],
            "used_by": sorted(record["used_by"]),
            "status": "planned" if args.dry_run else "pending",
        }
        try:
            if not args.dry_run:
                reports = []
                exported_parts = []
                for index, part_path in enumerate(chunk_paths):
                    triangle_range = (
                        (index * chunk_triangle_limit, (index + 1) * chunk_triangle_limit)
                        if chunk_count > 1
                        else None
                    )
                    try:
                        report = export_mesh(
                            mesh_path,
                            part_path,
                            static_skinned=True,
                            texture=texture_path,
                            texture_output_name=texture_relative_path,
                            reuse_texture=True,
                            selected_submeshes=record["submeshes"],
                            uv_scale=record["uv_scale"],
                            uv_offset=record["uv_offset"],
                            repeat_uv=record["repeat_uv"],
                            triangle_range=triangle_range,
                            position_offset=(
                                tuple(args.position_offset)
                                if record["static_batch_ranges"]
                                else (0.0, 0.0, 0.0)
                            ),
                        )
                    except ValueError as error:
                        if str(error) == "mesh selection contains no triangles":
                            continue
                        raise
                    reports.append(report)
                    exported_parts.append(
                        {
                            "obj": part_path.relative_to(project_root).as_posix(),
                            "mtl": part_path.with_suffix(".mtl").relative_to(project_root).as_posix(),
                        }
                    )
                if not reports:
                    raise ValueError("no nonempty triangle chunks were exported")
                entry["output_parts"] = exported_parts
                entry["output_obj"] = exported_parts[0]["obj"]
                entry["output_mtl"] = exported_parts[0]["mtl"]
                entry.update(
                    {
                        "vertices": sum(report["vertices"] for report in reports),
                        "source_vertices": reports[0]["source_vertices"],
                        "triangles": sum(report["triangles"] for report in reports),
                        "skipped_degenerate_triangles": max(
                            report["skipped_degenerate_triangles"] for report in reports
                        ),
                        "materials": sum(report["materials"] for report in reports),
                        "uvs": sum(report["uvs"] for report in reports),
                        "uv_repeat_rebased_triangles": sum(
                            report["uv_repeat_rebased_triangles"]
                            for report in reports
                        ),
                        "max_uv_repeat_shift_u": max(
                            report["max_uv_repeat_shift_u"] for report in reports
                        ),
                        "max_uv_repeat_shift_v": max(
                            report["max_uv_repeat_shift_v"] for report in reports
                        ),
                        "normals": sum(report["normals"] for report in reports),
                        "skinned": max(report["skinned"] for report in reports),
                    }
                )
                entry["status"] = "exported"
        except (OSError, ValueError, struct.error) as error:
            entry["error"] = str(error)
            if "empty mesh or missing vertex/index buffers" in str(error):
                entry["status"] = "skipped_empty"
            else:
                entry["status"] = "failed"
                failures.append(entry)
        status_counts[entry["status"]] += 1
        mesh_records.append(entry)

    manifest = {
        "format_version": 1,
        "source_catalog": catalog_path.relative_to(project_root).as_posix(),
        "mode": "dry-run" if args.dry_run else "export",
        "source_mesh_assets": len(source_meshes),
        "renderer_mesh_assets": len(used_meshes),
        "mesh_assets_not_in_renderer_components": len(source_meshes - used_meshes),
        "mesh_texture_variants": len(mesh_records),
        "status_counts": dict(sorted(status_counts.items())),
        "unresolved_material_texture_guids": dict(
            sorted(unresolved_material_textures.items())
        ),
        "unresolved_mesh_guids": dict(sorted(skipped_mesh_guids.items())),
        "builtin_mesh_references": dict(sorted(builtin_mesh_guids.items())),
        "external_mesh_paths": dict(sorted(external_mesh_paths.items())),
        "material_submesh_mismatches": mismatched_materials,
        "failures": failures,
        "models": mesh_records,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Manifest: {manifest_path}")
    print(
        f"Renderer meshes exported/planned: {len(used_meshes)}/{len(source_meshes)}; "
        f"mesh/texture variants: {len(mesh_records)}"
    )
    print(
        "Status: "
        + ", ".join(f"{name}={count}" for name, count in sorted(status_counts.items()))
    )
    print(
        f"Submesh/material count mismatches: {len(mismatched_materials)}; "
        f"unresolved renderer mesh GUIDs: {sum(skipped_mesh_guids.values())}; "
        f"built-in mesh refs: {sum(builtin_mesh_guids.values())}; "
        f"external mesh paths: {sum(external_mesh_paths.values())}; "
        f"unresolved material texture GUIDs: {sum(unresolved_material_textures.values())}"
    )
    for failure in failures[:12]:
        print(f"FAILED {failure['source_mesh']}: {failure['error']}")


if __name__ == "__main__":
    main()
