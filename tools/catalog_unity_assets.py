#!/usr/bin/env python3
"""Catalog Unity assets required by build scenes and runtime Resources."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict, deque
import json
from pathlib import Path
import re

GUID_PATTERN = re.compile(r"guid:\s*([0-9a-fA-F]{32})")
BUILTIN_GUID_PREFIXES = ("0000000000000000e", "0000000000000000f")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def category(path: Path) -> str:
    suffix = path.suffix.lower()
    parts = path.parts
    if "Mesh" in parts or suffix in {".obj", ".fbx", ".gltf", ".glb"}:
        return "mesh"
    if "Texture2D" in parts or suffix in {".png", ".jpg", ".jpeg", ".tga"}:
        return "texture"
    if "Material" in parts or suffix == ".mat":
        return "material"
    if "AnimationClip" in parts or suffix in {".anim", ".controller"}:
        return "animation"
    if "AudioClip" in parts or suffix in {".wav", ".mp3", ".ogg", ".aiff"}:
        return "audio"
    if suffix == ".prefab":
        return "prefab"
    if suffix == ".unity":
        return "scene"
    if suffix in {".cs", ".js"}:
        return "script"
    if suffix in {".shader", ".compute"}:
        return "shader"
    if "Resources" in parts:
        return "runtime_resource"
    return "other"


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
        default=Path("PS2AssetCatalog.json"),
        help="manifest destination (default: PS2AssetCatalog.json)",
    )
    args = parser.parse_args()
    project_root = args.project_root.resolve()
    assets_root = project_root / "Assets"
    settings = project_root / "ProjectSettings" / "EditorBuildSettings.asset"
    if not assets_root.is_dir() or not settings.is_file():
        parser.error("project root must contain Assets and ProjectSettings/EditorBuildSettings.asset")

    files = sorted(
        path
        for path in assets_root.rglob("*")
        if path.is_file() and path.suffix != ".meta"
    )
    file_by_relative = {
        path.relative_to(project_root).as_posix(): path for path in files
    }
    guid_paths: dict[str, str] = {}
    guid_duplicates: dict[str, list[str]] = defaultdict(list)
    for meta in assets_root.rglob("*.meta"):
        match = re.search(r"^guid:\s*([0-9a-fA-F]{32})\s*$", read_text(meta), re.M)
        if not match:
            continue
        asset_path = meta.with_suffix("").relative_to(project_root).as_posix()
        guid = match.group(1).lower()
        if guid in guid_paths and guid_paths[guid] != asset_path:
            guid_duplicates[guid].append(asset_path)
        else:
            guid_paths[guid] = asset_path
    path_guids = {asset_path: guid for guid, asset_path in guid_paths.items()}

    build_text = read_text(settings)
    enabled_scenes = re.findall(
        r"-\s*enabled:\s*1\s*\n\s*path:\s*(Assets/[^\n]+\.unity)",
        build_text,
    )
    if not enabled_scenes:
        parser.error("no enabled scenes found in EditorBuildSettings.asset")
    missing_scenes = [scene for scene in enabled_scenes if scene not in file_by_relative]
    if missing_scenes:
        parser.error("enabled build scenes are missing: " + ", ".join(missing_scenes))

    roots = set(enabled_scenes)
    dynamic_resources = sorted(
        path.relative_to(project_root).as_posix()
        for path in files
        if "Resources" in path.relative_to(project_root).parts
    )
    roots.update(dynamic_resources)
    queue = deque(sorted(roots))
    included = set(roots)
    referencers: dict[str, set[str]] = defaultdict(set)
    builtins: Counter[str] = Counter()
    unresolved: Counter[str] = Counter()

    while queue:
        relative_path = queue.popleft()
        path = file_by_relative.get(relative_path)
        if path is None or path.suffix.lower() not in {
            ".asset", ".anim", ".mat", ".prefab", ".unity", ".controller"
        }:
            continue
        for guid in set(match.lower() for match in GUID_PATTERN.findall(read_text(path))):
            target = guid_paths.get(guid)
            if target is None:
                if guid.startswith(BUILTIN_GUID_PREFIXES):
                    builtins[guid] += 1
                else:
                    unresolved[guid] += 1
                continue
            referencers[target].add(relative_path)
            if target not in included:
                included.add(target)
                queue.append(target)

    assets = []
    category_counts: Counter[str] = Counter()
    suffix_counts: Counter[str] = Counter()
    total_bytes = 0
    for relative_path in sorted(included):
        path = file_by_relative.get(relative_path)
        if path is None:
            continue
        size = path.stat().st_size
        group = category(path)
        category_counts[group] += 1
        suffix_counts[path.suffix.lower() or "[none]"] += 1
        total_bytes += size
        assets.append(
            {
                "path": relative_path,
                "category": group,
                "bytes": size,
                "guid": path_guids.get(relative_path),
                "referenced_by": sorted(referencers.get(relative_path, ())),
            }
        )

    all_counts = Counter(category(path) for path in files)
    output = args.output
    if not output.is_absolute():
        output = project_root / output
    manifest = {
        "format_version": 1,
        "project": project_root.name,
        "scope": "enabled build-scene dependency closure plus all runtime Resources",
        "enabled_scenes": enabled_scenes,
        "dynamic_resource_roots": len(dynamic_resources),
        "source_inventory": {
            "files": len(files),
            "bytes": sum(path.stat().st_size for path in files),
            "by_category": dict(sorted(all_counts.items())),
        },
        "required_inventory": {
            "files": len(assets),
            "bytes": total_bytes,
            "by_category": dict(sorted(category_counts.items())),
            "by_extension": dict(sorted(suffix_counts.items())),
        },
        "resolution": {
            "unique_guids": len(guid_paths),
            "duplicate_guid_count": len(guid_duplicates),
            "unresolved_non_builtin_guids": dict(sorted(unresolved.items())),
            "builtin_guid_references": dict(sorted(builtins.items())),
        },
        "assets": assets,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {output}")
    print(f"Enabled scenes: {len(enabled_scenes)}")
    print(f"Dynamic Resources roots: {len(dynamic_resources)}")
    print(f"Required assets: {len(assets)} ({total_bytes / 1024**2:.1f} MiB)")
    print("Required categories: " + ", ".join(
        f"{name}={count}" for name, count in sorted(category_counts.items())
    ))
    print(
        f"Unresolved non-built-in GUIDs: {len(unresolved)}; "
        f"duplicate GUIDs: {len(guid_duplicates)}"
    )


if __name__ == "__main__":
    main()
