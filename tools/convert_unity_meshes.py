#!/usr/bin/env python3
"""Export selected Unity YAML Mesh assets to static OBJ/MTL for AthenaENV."""
from __future__ import annotations

import argparse
import math
import re
import shutil
import struct
from pathlib import Path

MAX_EXPANDED_CORNERS = 65532
FORMAT_INFO = {
    0: ("f", 4),
    1: ("e", 2),
    2: ("B", 1),
    3: ("b", 1),
    4: ("H", 2),
    5: ("h", 2),
}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_TEXTURE_DIMENSION = 512


def scalar(text: str, key: str) -> int:
    match = re.search(rf"^\s*{re.escape(key)}:\s*(\d+)\s*$", text, re.M)
    if not match:
        raise ValueError(f"missing {key}")
    return int(match.group(1))


def read_channel_block(text: str) -> list[tuple[int, int, int, int]]:
    match = re.search(r"m_Channels:\s*\n(.*?)\n\s*m_DataSize:", text, re.S)
    if not match:
        raise ValueError("missing vertex channel data")
    channels = [
        tuple(map(int, values))
        for values in re.findall(
            r"- stream:\s*(\d+)\s*\n\s*offset:\s*(\d+)\s*\n"
            r"\s*format:\s*(\d+)\s*\n\s*dimension:\s*(\d+)",
            match.group(1),
        )
    ]
    if not channels:
        raise ValueError("no vertex channels found")
    return channels


def decode_attribute(
    data: bytes,
    vertex_count: int,
    channel: tuple[int, int, int, int],
    required_components: int,
    stream_layout: list[tuple[int, int]],
) -> list[tuple[float, ...]]:
    stream, offset, format_id, dimension = channel
    if format_id not in FORMAT_INFO or dimension < required_components:
        raise ValueError(f"unsupported vertex attribute format/dimension: {channel}")
    if stream >= len(stream_layout):
        raise ValueError(f"vertex attribute refers to an undefined stream: {channel}")
    stream_base, stride = stream_layout[stream]
    code, component_size = FORMAT_INFO[format_id]
    end = offset + dimension * component_size
    if end > stride:
        raise ValueError(f"vertex attribute exceeds stream stride: {channel}")
    unpack = struct.Struct("<" + code * dimension).unpack_from
    result = []
    for vertex in range(vertex_count):
        values = unpack(data, stream_base + vertex * stride + offset)
        if format_id == 2:
            values = tuple(value / 255.0 for value in values)
        elif format_id == 3:
            values = tuple(max(value / 127.0, -1.0) for value in values)
        elif format_id == 4:
            values = tuple(value / 65535.0 for value in values)
        elif format_id == 5:
            values = tuple(max(value / 32767.0, -1.0) for value in values)
        if not all(math.isfinite(value) for value in values):
            raise ValueError("non-finite vertex attribute value")
        result.append(tuple(values))
    return result


def stream_layout(
    channels: list[tuple[int, int, int, int]], vertex_count: int, data_size: int
) -> list[tuple[int, int]]:
    strides = [0] * (max(channel[0] for channel in channels) + 1)
    for stream, offset, format_id, dimension in channels:
        if not dimension:
            continue
        if format_id not in FORMAT_INFO:
            raise ValueError(f"unsupported vertex attribute format: {format_id}")
        _, component_size = FORMAT_INFO[format_id]
        strides[stream] = max(strides[stream], offset + dimension * component_size)
    strides = [(stride + 3) & ~3 for stride in strides]
    required_size = sum(strides) * vertex_count
    if any(stride == 0 for stride in strides) or required_size > data_size:
        raise ValueError("vertex stream layout does not match the serialized buffer size")
    layout = []
    base = 0
    for index, stride in enumerate(strides):
        layout.append((base, stride))
        base += stride * vertex_count
        if index + 1 < len(strides):
            # Unity aligns each interleaved stream start to 16 bytes.
            base = (base + 15) & ~15
    if base != data_size:
        raise ValueError("aligned vertex streams do not match the serialized buffer size")
    return layout


def copy_texture(texture: Path, destination: Path) -> tuple[float, float]:
    header = texture.read_bytes()[:24]
    if len(header) != 24 or header[:8] != PNG_SIGNATURE or header[12:16] != b"IHDR":
        raise ValueError(f"texture is not a valid PNG: {texture}")
    width, height = struct.unpack(">II", header[16:24])
    if not width or not height:
        raise ValueError(f"texture has invalid dimensions: {texture}")
    if width <= MAX_TEXTURE_DIMENSION and height <= MAX_TEXTURE_DIMENSION:
        if not width & (width - 1) and not height & (height - 1):
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(texture, destination)
            return 1.0, 1.0

    try:
        from PIL import Image
    except ImportError as error:
        raise ValueError(
            "texture exceeds AthenaENV's 512x512 limit; install Pillow to downscale it"
        ) from error

    scale = min(1.0, MAX_TEXTURE_DIMENSION / width, MAX_TEXTURE_DIMENSION / height)

    def next_power_of_two(value: int) -> int:
        return min(MAX_TEXTURE_DIMENSION, 1 << (value - 1).bit_length())

    resized_size = (max(1, int(width * scale)), max(1, int(height * scale)))
    output_size = tuple(next_power_of_two(value) for value in resized_size)
    with Image.open(texture) as image:
        if image.mode not in ("RGB", "RGBA", "L", "LA"):
            image = image.convert(
                "RGBA"
                if "A" in image.getbands() or "transparency" in image.info
                else "RGB"
            )
        resized = image.resize(resized_size, Image.Resampling.LANCZOS)
        canvas = Image.new(image.mode, output_size)
        canvas.paste(resized, (0, 0))
        if output_size[0] > resized_size[0]:
            right = resized.crop(
                (resized_size[0] - 1, 0, resized_size[0], resized_size[1])
            ).resize((output_size[0] - resized_size[0], resized_size[1]))
            canvas.paste(right, (resized_size[0], 0))
        if output_size[1] > resized_size[1]:
            bottom = canvas.crop(
                (0, resized_size[1] - 1, output_size[0], resized_size[1])
            ).resize((output_size[0], output_size[1] - resized_size[1]))
            canvas.paste(bottom, (0, resized_size[1]))
        destination.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(destination, format="PNG")
    return (
        resized_size[0] / output_size[0],
        resized_size[1] / output_size[1],
    )


def prepared_texture_scale(texture: Path, prepared: Path) -> tuple[float, float]:
    source_header = texture.read_bytes()[:24]
    output_header = prepared.read_bytes()[:24]
    if (
        len(source_header) != 24
        or len(output_header) != 24
        or source_header[:8] != PNG_SIGNATURE
        or output_header[:8] != PNG_SIGNATURE
    ):
        raise ValueError("cannot read texture dimensions for a reused texture")
    source_size = struct.unpack(">II", source_header[16:24])
    output_size = struct.unpack(">II", output_header[16:24])
    scale = min(
        1.0,
        MAX_TEXTURE_DIMENSION / source_size[0],
        MAX_TEXTURE_DIMENSION / source_size[1],
    )
    resized_size = (
        max(1, int(source_size[0] * scale)),
        max(1, int(source_size[1] * scale)),
    )
    return resized_size[0] / output_size[0], resized_size[1] / output_size[1]


def submeshes(text: str) -> list[dict[str, int]]:
    match = re.search(r"m_SubMeshes:\s*\n(.*?)\n\s*m_Shapes:", text, re.S)
    if not match:
        raise ValueError("missing submesh table")
    blocks = re.findall(
        r"(?:^|\n)\s*-\s*serializedVersion:\s*\d+\s*\n(.*?)(?=\n\s*-\s*serializedVersion:|\Z)",
        match.group(1),
        re.S,
    )
    result = []
    for block in blocks:
        values = {}
        for key in ("firstByte", "indexCount", "topology", "baseVertex"):
            found = re.search(rf"^\s*{key}:\s*(\d+)\s*$", block, re.M)
            if not found:
                raise ValueError(f"submesh is missing {key}")
            values[key] = int(found.group(1))
        result.append(values)
    if not result:
        raise ValueError("mesh has no submeshes")
    return result


def export_mesh(
    source: Path,
    destination: Path,
    *,
    static_skinned: bool = False,
    texture: Path | None = None,
    texture_output_name: str | None = None,
    reuse_texture: bool = False,
    selected_submeshes: set[int] | None = None,
    uv_scale: tuple[float, float] = (1.0, 1.0),
    uv_offset: tuple[float, float] = (0.0, 0.0),
    repeat_uv: tuple[bool, bool] = (False, False),
    triangle_range: tuple[int, int] | None = None,
    position_offset: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> dict[str, int]:
    text = source.read_text(encoding="ascii")
    is_skinned = bool(re.search(r"m_BindPose:\s*\n\s*-", text))
    if is_skinned and not static_skinned:
        raise ValueError(
            "skinned mesh; pass --static-skinned to export undeformed reference geometry"
        )

    vertex_count = scalar(text, "m_VertexCount")
    index_format = scalar(text, "m_IndexFormat")
    data_size = scalar(text, "m_DataSize")
    data_match = re.search(r"^\s*_typelessdata:\s*([0-9a-fA-F]+)\s*$", text, re.M)
    index_match = re.search(r"^\s*m_IndexBuffer:\s*([0-9a-fA-F]*)\s*$", text, re.M)
    if not vertex_count or not data_match or not index_match:
        raise ValueError("empty mesh or missing vertex/index buffers")
    vertex_data = bytes.fromhex(data_match.group(1))
    index_data = bytes.fromhex(index_match.group(1))
    if len(vertex_data) != data_size:
        raise ValueError("vertex buffer size does not match its declared size")
    channels = read_channel_block(text)
    layout = stream_layout(channels, vertex_count, data_size)
    positions = decode_attribute(vertex_data, vertex_count, channels[0], 3, layout)
    if not all(math.isfinite(value) for value in position_offset):
        raise ValueError("position offset must contain finite values")
    positions = [
        tuple(position[axis] + position_offset[axis] for axis in range(3))
        for position in positions
    ]
    normal_channel = channels[1] if len(channels) > 1 and channels[1][3] >= 3 else None
    uv_channel = channels[3] if len(channels) > 3 and channels[3][3] >= 2 else None
    normals = (
        decode_attribute(vertex_data, vertex_count, normal_channel, 3, layout)
        if normal_channel
        else []
    )
    texcoords = (
        decode_attribute(vertex_data, vertex_count, uv_channel, 2, layout)
        if uv_channel
        else []
    )
    if texture and not texcoords:
        raise ValueError("a diffuse texture requires Unity UV0 coordinates")

    if index_format not in (0, 1):
        raise ValueError(f"unsupported index format: {index_format}")
    index_size = 2 if index_format == 0 else 4
    index_code = "H" if index_format == 0 else "I"
    unpack_index = struct.Struct("<" + index_code).unpack_from
    triangles = []
    skipped_degenerate_triangles = 0

    def triangle_normal(indices: tuple[int, int, int]) -> tuple[float, float, float]:
        a, b, c = (positions[index][:3] for index in indices)
        u = tuple(b[i] - a[i] for i in range(3))
        v = tuple(c[i] - a[i] for i in range(3))
        return (
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
        )

    mesh_submeshes = submeshes(text)
    if selected_submeshes is not None and any(
        index < 0 or index >= len(mesh_submeshes) for index in selected_submeshes
    ):
        raise ValueError("selected submesh index is outside the mesh submesh table")
    for group, submesh in enumerate(mesh_submeshes):
        if selected_submeshes is not None and group not in selected_submeshes:
            continue
        if submesh["topology"] != 0:
            raise ValueError("non-triangle submesh topology is not supported")
        count = submesh["indexCount"]
        first = submesh["firstByte"]
        if count % 3 or first + count * index_size > len(index_data):
            raise ValueError("invalid or incomplete submesh index range")
        for offset in range(first, first + count * index_size, index_size * 3):
            indices = tuple(
                unpack_index(index_data, offset + corner * index_size)[0]
                + submesh["baseVertex"]
                for corner in range(3)
            )
            if any(index >= vertex_count for index in indices):
                raise ValueError("submesh contains an out-of-range vertex index")
            if math.hypot(*triangle_normal(indices)) <= 1e-12:
                skipped_degenerate_triangles += 1
                continue
            triangles.append((indices, group))
    if triangle_range is not None:
        start, end = triangle_range
        if start < 0 or end <= start:
            raise ValueError("triangle range must be a nonempty, nonnegative interval")
        triangles = triangles[start:end]
    if not triangles:
        raise ValueError("mesh selection contains no triangles")
    if len(triangles) * 3 > MAX_EXPANDED_CORNERS:
        raise ValueError(
            f"{len(triangles)} triangles exceed AthenaENV's expanded-corner limit"
        )
    used_vertices = sorted({index for indices, _ in triangles for index in indices})
    vertex_indices = {source_index: index for index, source_index in enumerate(used_vertices)}

    obj = [f"# Converted from {source.as_posix()}", f"mtllib {destination.stem}.mtl"]
    obj.extend(
        "v " + " ".join(f"{value:.9g}" for value in positions[index][:3])
        for index in used_vertices
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    texture_parts = None
    if texture:
        requested_name = texture_output_name or texture.name
        requested_path = Path(requested_name)
        if requested_path.is_absolute() or any(
            part in {".", ".."} for part in requested_path.parts
        ):
            raise ValueError("texture output name must be a safe relative path")
        texture_parts = [
            re.sub(r"[^A-Za-z0-9_.-]", "_", part)
            for part in requested_path.parts
        ]
        texture_name = "/".join(texture_parts)
    else:
        texture_name = None
    if texture:
        texture_destination = destination.parent.joinpath(*texture_parts)
        texture_scale = (
            prepared_texture_scale(texture, texture_destination)
            if reuse_texture and texture_destination.is_file()
            else copy_texture(texture, texture_destination)
        )
    else:
        texture_scale = (1.0, 1.0)
    output_uvs = []
    triangle_uv_indices = []
    rebased_triangles = 0
    max_uv_repeat_shift = [0, 0]
    if texture:
        base_uvs = [
            tuple(
                (texcoords[index][axis] * uv_scale[axis] + uv_offset[axis])
                * texture_scale[axis]
                for axis in range(2)
            )
            for index in used_vertices
        ]
        uv_indices: dict[tuple[int, tuple[float, float]], int] = {}
        for indices, _ in triangles:
            mapped_vertices = [vertex_indices[index] for index in indices]
            face_uvs = [base_uvs[index] for index in mapped_vertices]
            face_rebased = False
            for axis in range(2):
                values = [uv[axis] for uv in face_uvs]
                if max(abs(value) for value in values) <= 16:
                    continue
                if not repeat_uv[axis]:
                    raise ValueError(
                        "UV coordinates exceed AthenaENV's supported range [-16, 16]"
                    )
                shift = math.floor((min(values) + max(values)) * 0.5 + 0.5)
                shifted = [value - shift for value in values]
                if max(abs(value) for value in shifted) > 16:
                    raise ValueError(
                        "UV coordinates exceed AthenaENV's supported range [-16, 16]"
                    )
                face_uvs = [
                    tuple(
                        value - shift if dimension == axis else value
                        for dimension, value in enumerate(uv)
                    )
                    for uv in face_uvs
                ]
                max_uv_repeat_shift[axis] = max(
                    max_uv_repeat_shift[axis], abs(shift)
                )
                face_rebased = face_rebased or shift != 0
            if face_rebased:
                rebased_triangles += 1
            face_uv_indices = []
            for vertex_index, uv in zip(mapped_vertices, face_uvs):
                key = (vertex_index, uv)
                if key not in uv_indices:
                    uv_indices[key] = len(output_uvs) + 1
                    output_uvs.append(uv)
                face_uv_indices.append(uv_indices[key])
            triangle_uv_indices.append(face_uv_indices)
        obj.extend(
            "vt "
            + " ".join(f"{value:.9g}" for value in uv)
            for uv in output_uvs
        )

    face_normals: dict[tuple[int, int, int], int] = {}
    if normals:
        obj.extend(
            "vn " + " ".join(f"{value:.9g}" for value in normals[index][:3])
            for index in used_vertices
        )
    else:
        for indices, _ in triangles:
            normal = triangle_normal(indices)
            length = math.hypot(*normal)
            if not math.isfinite(length) or length <= 1e-12:
                raise ValueError("mesh contains a degenerate triangle")
            unit = tuple(round(value / length, 8) for value in normal)
            face_normals.setdefault(unit, len(face_normals) + 1)
        obj.extend(
            "vn " + " ".join(f"{value:.9g}" for value in normal)
            for normal in face_normals
        )

    active_group = None
    for triangle_index, (indices, group) in enumerate(triangles):
        if group != active_group:
            obj.append(f"usemtl submesh_{group:02d}")
            active_group = group
        refs = []
        if normals:
            for corner, index in enumerate(indices):
                vertex_index = vertex_indices[index]
                refs.append(
                    f"{vertex_index + 1}/{triangle_uv_indices[triangle_index][corner]}/{vertex_index + 1}"
                    if texture
                    else f"{vertex_index + 1}//{vertex_index + 1}"
                )
        else:
            normal = triangle_normal(indices)
            length = math.hypot(*normal)
            if not math.isfinite(length) or length <= 1e-12:
                raise ValueError("mesh contains a degenerate triangle")
            normal_id = face_normals[tuple(round(value / length, 8) for value in normal)]
            refs.extend(
                (
                    f"{vertex_indices[index] + 1}/{triangle_uv_indices[triangle_index][corner]}/{normal_id}"
                    if texture
                    else f"{vertex_indices[index] + 1}//{normal_id}"
                )
                for corner, index in enumerate(indices)
            )
        obj.append("f " + " ".join(refs))

    mtl = []
    for group in sorted({group for _, group in triangles}):
        mtl.extend((f"newmtl submesh_{group:02d}", "Kd 1 1 1"))
        if texture_name:
            mtl.append(f"map_Kd {texture_name}")
        mtl.append("")
    destination.write_text("\n".join(obj) + "\n", encoding="ascii")
    destination.with_suffix(".mtl").write_text("\n".join(mtl), encoding="ascii")
    return {
        "vertices": len(used_vertices),
        "source_vertices": vertex_count,
        "triangles": len(triangles),
        "skipped_degenerate_triangles": skipped_degenerate_triangles,
        "materials": len({group for _, group in triangles}),
        "uvs": len(output_uvs),
        "uv_repeat_rebased_triangles": rebased_triangles,
        "max_uv_repeat_shift_u": max_uv_repeat_shift[0],
        "max_uv_repeat_shift_v": max_uv_repeat_shift[1],
        "normals": len(normals) if normals else len(face_normals),
        "skinned": int(is_skinned),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mesh",
        action="append",
        required=True,
        metavar="FILE",
        help="mesh filename under Assets/Mesh (repeat for more meshes)",
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
    parser.add_argument(
        "--static-skinned",
        action="store_true",
        help="export raw reference-pose vertices and ignore skeleton deformation",
    )
    parser.add_argument(
        "--texture",
        metavar="PNG",
        help="copy a PNG from Assets/Texture2D and reference it as map_Kd",
    )
    parser.add_argument(
        "--name",
        help="output filename stem instead of the source mesh name",
    )
    args = parser.parse_args()
    mesh_dir = args.project_root / "Assets" / "Mesh"
    texture_dir = args.project_root / "Assets" / "Texture2D"
    output_dir = args.output if args.output.is_absolute() else args.project_root / args.output
    texture = texture_dir / args.texture if args.texture else None
    if texture and (
        texture.parent.resolve() != texture_dir.resolve()
        or texture.suffix.lower() != ".png"
        or not texture.is_file()
    ):
        parser.error(f"expected an existing PNG directly under Assets/Texture2D: {args.texture}")
    if args.name and not re.fullmatch(r"[A-Za-z0-9_-]+", args.name):
        parser.error("--name must contain only ASCII letters, numbers, '_' or '-'")
    if args.name and len(args.mesh) != 1:
        parser.error("--name can only be used with one --mesh")
    for name in args.mesh:
        source = mesh_dir / name
        if source.parent.resolve() != mesh_dir.resolve() or source.suffix != ".asset":
            parser.error(f"expected a .asset filename directly under Assets/Mesh: {name}")
        try:
            report = export_mesh(
                source,
                output_dir / f"{args.name or source.stem}.obj",
                static_skinned=args.static_skinned,
                texture=texture,
            )
        except (OSError, ValueError, struct.error) as error:
            parser.error(f"{source}: {error}")
        print(
            f"{source.name}: {report['vertices']} vertices, "
            f"{report['triangles']} triangles, {report['materials']} submeshes, "
            f"{report['uvs']} UVs"
            f"{', static reference pose' if report['skinned'] else ''}"
            f"{', texture ' + texture.name if texture else ''}"
            f" -> {output_dir / ((args.name or source.stem) + '.obj')}"
        )


if __name__ == "__main__":
    main()
