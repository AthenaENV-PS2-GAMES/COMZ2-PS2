#!/usr/bin/env python3
"""Prepare catalogued Unity PNGs for AthenaENV texture size constraints."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import struct

from convert_unity_meshes import copy_texture

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def dimensions(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if len(header) != 24 or header[:8] != PNG_SIGNATURE or header[12:16] != b"IHDR":
        raise ValueError(f"not a valid PNG: {path}")
    width, height = struct.unpack(">II", header[16:24])
    if not width or not height:
        raise ValueError(f"invalid PNG dimensions: {path}")
    return width, height


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    parser.add_argument("--output", type=Path, default=Path("PS2Assets/Textures"))
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("PS2Assets/texture-export-manifest.json"),
    )
    args = parser.parse_args()

    project_root = args.project_root.resolve()
    catalog_path = project_root / "PS2AssetCatalog.json"
    if not catalog_path.is_file():
        parser.error("run tools/catalog_unity_assets.py before exporting textures")
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    output_dir = args.output if args.output.is_absolute() else project_root / args.output
    manifest_path = (
        args.manifest
        if args.manifest.is_absolute()
        else project_root / args.manifest
    )
    assets = [record for record in catalog["assets"] if record["category"] == "texture"]
    records = []
    failures = []

    try:
        from PIL import Image
    except ImportError as error:
        parser.error(f"Pillow is required to inspect and normalize textures: {error}")

    for asset in assets:
        source = project_root / asset["path"]
        output_name = f"texture_{asset['guid']}.png"
        destination = output_dir / output_name
        record = {
            "source": asset["path"],
            "source_guid": asset["guid"],
            "output": destination.relative_to(project_root).as_posix(),
            "bytes": asset["bytes"],
            "status": "pending",
        }
        try:
            source_size = dimensions(source)
            uv_scale = copy_texture(source, destination)
            output_size = dimensions(destination)
            with Image.open(source) as image:
                has_alpha = (
                    "A" in image.getbands() or "transparency" in image.info
                )
                has_transparency = (
                    has_alpha
                    and image.convert("RGBA").getchannel("A").getextrema()[0] < 255
                )
            record.update(
                {
                    "source_dimensions": list(source_size),
                    "output_dimensions": list(output_size),
                    "uv_scale_after_resize_and_padding": list(uv_scale),
                    "alpha_channel": has_alpha,
                    "transparent_pixels": has_transparency,
                    "output_bytes": destination.stat().st_size,
                    "status": "exported",
                }
            )
        except (OSError, ValueError, struct.error) as error:
            record["status"] = "failed"
            record["error"] = str(error)
            failures.append(record)
        records.append(record)

    status_counts = {
        status: sum(record["status"] == status for record in records)
        for status in sorted({record["status"] for record in records})
    }
    manifest = {
        "format_version": 1,
        "source_catalog": catalog_path.relative_to(project_root).as_posix(),
        "source_texture_assets": len(assets),
        "status_counts": status_counts,
        "transparent_texture_assets": sum(
            record.get("transparent_pixels", False) for record in records
        ),
        "failures": failures,
        "textures": records,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        f"Textures: {status_counts.get('exported', 0)}/{len(assets)} exported; "
        f"{manifest['transparent_texture_assets']} contain transparent pixels"
    )
    print(f"Manifest: {manifest_path}")
    for failure in failures[:12]:
        print(f"FAILED {failure['source']}: {failure['error']}")


if __name__ == "__main__":
    main()
