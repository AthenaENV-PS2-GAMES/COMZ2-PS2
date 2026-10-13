#!/usr/bin/env python3
"""Export Mike's Unity skinned parts as two textured, static OBJ meshes."""
from __future__ import annotations

import argparse
import shutil
import tempfile
from pathlib import Path

from convert_unity_meshes import export_mesh

PARTS = (
    ("Avatar_Mike_H_Body_0.asset", "Avatar_Mike.png"),
    ("Avatar_Mike_H_Head_0.asset", "Avatar_Mike.png"),
    ("Avatar_Mike_H_Neck_0.asset", "Avatar_Mike.png"),
    ("Avatar_Mike_H_01_0.asset", "Avatar_Mike_01.png"),
)


def merge_objs(sources: list[Path], destination: Path, texture_name: str) -> None:
    positions: list[str] = []
    texcoords: list[str] = []
    normals: list[str] = []
    faces: list[str] = []
    for source in sources:
        local_positions: list[str] = []
        local_texcoords: list[str] = []
        local_normals: list[str] = []
        local_faces: list[str] = []
        for line in source.read_text(encoding="ascii").splitlines():
            if line.startswith("v "):
                local_positions.append(line)
            elif line.startswith("vt "):
                local_texcoords.append(line)
            elif line.startswith("vn "):
                local_normals.append(line)
            elif line.startswith("f "):
                local_faces.append(line)
        position_offset = len(positions)
        texcoord_offset = len(texcoords)
        normal_offset = len(normals)
        for line in local_faces:
            refs = []
            for ref in line[2:].split():
                vi, ti, ni = (int(value) for value in ref.split("/"))
                refs.append(
                    f"{vi + position_offset}/{ti + texcoord_offset}/{ni + normal_offset}"
                )
            faces.append("f " + " ".join(refs))
        positions.extend(local_positions)
        texcoords.extend(local_texcoords)
        normals.extend(local_normals)

    if not faces or not texcoords:
        raise ValueError(f"cannot merge empty or untextured mesh sources into {destination.name}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        "\n".join(
            [
                "# Static reference-pose meshes assembled from a Unity prefab",
                f"mtllib {destination.stem}.mtl",
                *positions,
                *texcoords,
                *normals,
                "usemtl textured_part",
                *faces,
                "",
            ]
        ),
        encoding="ascii",
    )
    destination.with_suffix(".mtl").write_text(
        f"newmtl textured_part\nKd 1 1 1\nmap_Kd {texture_name}\n",
        encoding="ascii",
    )


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
        default=Path("AthenaModels"),
        help="output directory (default: AthenaModels)",
    )
    args = parser.parse_args()
    project_root = args.project_root.resolve()
    mesh_dir = project_root / "Assets" / "Mesh"
    texture_dir = project_root / "Assets" / "Texture2D"
    output_dir = args.output if args.output.is_absolute() else project_root / args.output
    output_dir.mkdir(parents=True, exist_ok=True)

    missing = [
        mesh_dir / mesh_name
        for mesh_name, _ in PARTS
        if not (mesh_dir / mesh_name).is_file()
    ]
    if missing:
        parser.error("missing mesh assets: " + ", ".join(str(path) for path in missing))

    with tempfile.TemporaryDirectory(prefix="mike-obj-") as temp:
        temp_dir = Path(temp)
        for mesh_name, texture_name in PARTS:
            texture = texture_dir / texture_name
            if not texture.is_file():
                parser.error(f"missing texture: {texture}")
            source = mesh_dir / mesh_name
            temporary_obj = temp_dir / f"{source.stem}.obj"
            report = export_mesh(
                source,
                temporary_obj,
                static_skinned=True,
                texture=texture,
            )
            print(
                f"{mesh_name}: {report['triangles']} triangles, "
                f"{report['uvs']} UVs, reference-pose geometry"
            )

        merge_objs(
            [
                temp_dir / f"{Path(mesh_name).stem}.obj"
                for mesh_name, texture_name in PARTS[:3]
            ],
            output_dir / "mike_body.obj",
            "Avatar_Mike.png",
        )
        merge_objs(
            [temp_dir / f"{Path(PARTS[3][0]).stem}.obj"],
            output_dir / "mike_headgear.obj",
            "Avatar_Mike_01.png",
        )
        for texture_name in {"Avatar_Mike.png", "Avatar_Mike_01.png"}:
            shutil.copy2(texture_dir / texture_name, output_dir / texture_name)
    print(f"Exported textured Mike meshes to {output_dir}")


if __name__ == "__main__":
    main()
