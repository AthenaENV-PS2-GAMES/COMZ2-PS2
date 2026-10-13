#!/usr/bin/env python3
"""Export selected Unity characters as textured, static reference-pose OBJ meshes."""
from __future__ import annotations

import argparse
import shutil
import tempfile
from pathlib import Path

from convert_unity_meshes import export_mesh
from export_mike_character import merge_objs

CHARACTERS = {
    "cowboy": (
        (
            ("Avatar_Cowboy_H_Body_0.asset", "Avatar_Cowboy_A.png"),
            ("Avatar_Cowboy_H_Head_0.asset", "Avatar_Cowboy_A.png"),
            ("Avatar_Cowboy_H_Neck_0.asset", "Avatar_Cowboy_A.png"),
            ("Avatar_Cowboy_H_01_1.asset", "Avatar_Cowboy_A_01.png"),
            ("Avatar_Cowboy_H_02_0.asset", "Avatar_Cowboy_A_01.png"),
        ),
        (
            ("Avatar_Cowboy_A.png", "cowboy_body"),
            ("Avatar_Cowboy_A_01.png", "cowboy_outfit"),
        ),
    ),
    "doctor": (
        (
            ("Avatar_Doctress_L_Body_3.asset", "Avatar_Doctress_A.png"),
            ("Avatar_Doctress_L_Head_3.asset", "Avatar_Doctress_A.png"),
            ("Avatar_Doctress_L_Neck_3.asset", "Avatar_Doctress_A.png"),
            ("Avatar_Doctress_L_01_3.asset", "Avatar_Doctress_A.png"),
        ),
        (("Avatar_Doctress_A.png", "doctor"),),
    ),
    "swat": (
        (
            ("Avatar_Swat_H_01_Body.asset", "Avatar_Swat_A.png"),
            ("Avatar_Swat_H_01_Head.asset", "Avatar_Swat_A.png"),
            ("Avatar_Swat_H_01_Neck.asset", "Avatar_Swat_A.png"),
            ("Avatar_Swat_H_01.asset", "Avatar_Swat_A_01.png"),
        ),
        (
            ("Avatar_Swat_A.png", "swat_body"),
            ("Avatar_Swat_A_01.png", "swat_gear"),
        ),
    ),
    "zombie": (
        (
            ("Zombie_Normal_H_Body.asset", "Zombie_Normal_Green.png"),
            ("Zombie_Normal_H_Head.asset", "Zombie_Normal_Green.png"),
        ),
        (("Zombie_Normal_Green.png", "zombie"),),
    ),
    "clown": (
        (
            ("Zombie_Clown_H_Body.asset", "Zombie_Clown_Green.png"),
            ("Zombie_Clown_H_Head.asset", "Zombie_Clown_Green.png"),
        ),
        (("Zombie_Clown_Green.png", "zombie_clown"),),
    ),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--character",
        choices=tuple(CHARACTERS),
        action="append",
        help="character to export (repeat to export more than one; default: all)",
    )
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
    selected = args.character or list(CHARACTERS)

    for character in selected:
        parts, groups = CHARACTERS[character]
        missing = [
            mesh_dir / mesh_name
            for mesh_name, _ in parts
            if not (mesh_dir / mesh_name).is_file()
        ]
        missing.extend(
            texture_dir / texture_name
            for _, texture_name in parts
            if not (texture_dir / texture_name).is_file()
        )
        if missing:
            parser.error(
                f"{character}: missing source assets: "
                + ", ".join(str(path) for path in missing)
            )

        output_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=f"{character}-obj-") as temp:
            temp_dir = Path(temp)
            by_texture: dict[str, list[Path]] = {}
            for mesh_name, texture_name in parts:
                source = mesh_dir / mesh_name
                temporary_obj = temp_dir / f"{source.stem}.obj"
                report = export_mesh(
                    source,
                    temporary_obj,
                    static_skinned=True,
                    texture=texture_dir / texture_name,
                )
                by_texture.setdefault(texture_name, []).append(temporary_obj)
                print(
                    f"{character}/{mesh_name}: {report['triangles']} triangles, "
                    f"{report['uvs']} UVs, static reference pose"
                )

            for texture_name, output_stem in groups:
                merge_objs(
                    by_texture[texture_name],
                    output_dir / f"{output_stem}.obj",
                    texture_name,
                )
                shutil.copy2(texture_dir / texture_name, output_dir / texture_name)
                print(
                    f"{character}: wrote {output_stem}.obj with {texture_name}"
                )


if __name__ == "__main__":
    main()
