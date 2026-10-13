#!/usr/bin/env python3
"""Convert catalogued Unity effects to SPU2 ADPCM and music to Ogg Vorbis."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess

AUDIO_SOURCE_RE = re.compile(
    r"^\s*m_AudioClip:\s*\{fileID:\s*[^,}]+,\s*guid:\s*([0-9a-fA-F]{32})",
    re.M,
)
DOC_RE = re.compile(r"(?=^--- !u!\d+ &\d+)", re.M)


def audio_source_uses(paths: list[Path], project_root: Path) -> dict[str, list[dict]]:
    uses: dict[str, list[dict]] = {}
    for path in paths:
        text = path.read_text(encoding="utf-8", errors="replace")
        for document in DOC_RE.split(text):
            header = re.match(r"--- !u!(\d+) &", document)
            if not header or int(header.group(1)) != 82:
                continue
            match = AUDIO_SOURCE_RE.search(document)
            if not match:
                continue
            loop_match = re.search(r"^\s*m_Loop:\s*([01])\s*$", document, re.M)
            uses.setdefault(match.group(1).lower(), []).append(
                {
                    "path": path.relative_to(project_root).as_posix(),
                    "loop": bool(loop_match and loop_match.group(1) == "1"),
                }
            )
    return uses


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    parser.add_argument(
        "--athena-root",
        type=Path,
        default=Path(os.environ["ATHENAENV_ROOT"])
        if os.environ.get("ATHENAENV_ROOT")
        else None,
        help="AthenaENV checkout containing tools/wav2adp.js",
    )
    parser.add_argument("--output", type=Path, default=Path("PS2Assets/Audio"))
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("PS2Assets/audio-export-manifest.json"),
    )
    args = parser.parse_args()

    project_root = args.project_root.resolve()
    catalog_path = project_root / "PS2AssetCatalog.json"
    if not catalog_path.is_file():
        parser.error("run tools/catalog_unity_assets.py before exporting audio")
    if args.athena_root is None:
        parser.error("pass --athena-root or set ATHENAENV_ROOT")
    athena_root = args.athena_root.resolve()
    encoder_path = athena_root / "tools" / "wav2adp.js"
    if not encoder_path.is_file():
        parser.error(f"wav2adp.js not found under AthenaENV root: {athena_root}")
    node = shutil.which("node")
    ffmpeg = shutil.which("ffmpeg")
    if not node:
        parser.error("Node.js is required to run AthenaENV's wav2adp.js")
    if not ffmpeg:
        parser.error("ffmpeg is required to convert MP3 music to Ogg Vorbis")

    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    audio_assets = [
        asset for asset in catalog["assets"] if asset["category"] == "audio"
    ]
    yaml_paths = [
        project_root / asset["path"]
        for asset in catalog["assets"]
        if asset["category"] in {"prefab", "scene"}
    ]
    clip_uses = audio_source_uses(yaml_paths, project_root)
    output_dir = args.output if args.output.is_absolute() else project_root / args.output
    manifest_path = (
        args.manifest
        if args.manifest.is_absolute()
        else project_root / args.manifest
    )

    records = []
    wav_jobs = []
    ffmpeg_jobs = []
    for asset in audio_assets:
        source = project_root / asset["path"]
        guid = asset["guid"]
        record = {
            "source": asset["path"],
            "source_guid": guid,
            "source_bytes": asset["bytes"],
            "uses": clip_uses.get(guid, []),
            "status": "pending",
        }
        if source.suffix.lower() == ".wav":
            use_flags = {item["loop"] for item in record["uses"]}
            loop_variants = sorted(use_flags) if use_flags else [False]
            record["format"] = "spu2_adpcm"
            record["output_variants"] = []
            for is_loop in loop_variants:
                variant_name = (
                    f"sfx_{guid}_{'loop' if is_loop else 'oneshot'}.adp"
                )
                destination = output_dir / "SFX" / variant_name
                variant = {
                    "loop": is_loop,
                    "output": destination.relative_to(project_root).as_posix(),
                }
                record["output_variants"].append(variant)
                wav_jobs.append(
                    {
                        "source": str(source),
                        "output": str(destination),
                        "loop": is_loop,
                        "record": record,
                        "variant": variant,
                    }
                )
        elif source.suffix.lower() == ".mp3":
            destination = output_dir / "Music" / f"music_{guid}.ogg"
            record["format"] = "ogg_vorbis_stream"
            record["output"] = destination.relative_to(project_root).as_posix()
            ffmpeg_jobs.append((source, destination, record))
        else:
            record["status"] = "unsupported_source_format"
        records.append(record)

    node_code = r"""
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.argv[1];
const jobs = JSON.parse(fs.readFileSync(0, 'utf8'));
process.argv[1] = '';
const { encodeWav } = await import(pathToFileURL(modulePath).href);
const results = [];
for (const job of jobs) {
  try {
    const encoded = encodeWav(fs.readFileSync(job.source), { loop: job.loop });
    fs.mkdirSync(path.dirname(job.output), { recursive: true });
    fs.writeFileSync(job.output, encoded);
    results.push({ output: job.output, bytes: encoded.length, ok: true });
  } catch (error) {
    results.push({ output: job.output, error: String(error?.message ?? error), ok: false });
  }
}
process.stdout.write(JSON.stringify(results));
"""
    if wav_jobs:
        node_result = subprocess.run(
            [node, "--input-type=module", "-e", node_code, str(encoder_path)],
            input=json.dumps(
                [
                    {
                        "source": job["source"],
                        "output": job["output"],
                        "loop": job["loop"],
                    }
                    for job in wav_jobs
                ]
            ),
            text=True,
            capture_output=True,
            check=False,
        )
        if node_result.returncode:
            raise RuntimeError(
                f"wav2adp.js failed ({node_result.returncode}): {node_result.stderr.strip()}"
            )
        for job, result in zip(wav_jobs, json.loads(node_result.stdout)):
            if result["ok"]:
                job["variant"]["output_bytes"] = result["bytes"]
                job["variant"]["status"] = "exported"
            else:
                job["variant"]["status"] = "failed"
                job["variant"]["error"] = result["error"]

    for source, destination, record in ffmpeg_jobs:
        destination.parent.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(source),
                "-vn",
                "-map_metadata",
                "-1",
                "-c:a",
                "libvorbis",
                "-q:a",
                "4",
                str(destination),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode:
            record["status"] = "failed"
            record["error"] = result.stderr.strip()
        else:
            record["output_bytes"] = destination.stat().st_size
            record["status"] = "exported"

    for record in records:
        if record["format"] == "spu2_adpcm":
            variant_statuses = [variant["status"] for variant in record["output_variants"]]
            record["status"] = (
                "exported"
                if all(status == "exported" for status in variant_statuses)
                else "failed"
            )
            if record["status"] == "exported":
                record["output_bytes"] = sum(
                    variant["output_bytes"] for variant in record["output_variants"]
                )
            else:
                record["errors"] = [
                    variant["error"]
                    for variant in record["output_variants"]
                    if "error" in variant
                ]

    failures = [record for record in records if record["status"] == "failed"]
    adp_bytes = sum(
        variant.get("output_bytes", 0)
        for record in records
        for variant in record.get("output_variants", [])
    )
    manifest = {
        "format_version": 1,
        "source_catalog": catalog_path.relative_to(project_root).as_posix(),
        "athena_encoder": encoder_path.as_posix(),
        "source_audio_assets": len(audio_assets),
        "sfx_variant_count": sum(
            len(record.get("output_variants", [])) for record in records
        ),
        "adpcm_total_bytes": adp_bytes,
        "adpcm_largest_sample_bytes": max(
            (
                variant.get("output_bytes", 0)
                for record in records
                for variant in record.get("output_variants", [])
            ),
            default=0,
        ),
        "status_counts": {
            status: sum(record["status"] == status for record in records)
            for status in sorted({record["status"] for record in records})
        },
        "failures": failures,
        "audio": records,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        f"Audio assets: {len(audio_assets)}; SFX variants: "
        f"{manifest['sfx_variant_count']}; ADPCM bytes: {adp_bytes}"
    )
    print(f"Manifest: {manifest_path}")
    print(f"Status: {manifest['status_counts']}")
    for failure in failures[:12]:
        print(f"FAILED {failure['source']}: {failure.get('error', 'ADPCM conversion failed')}")


if __name__ == "__main__":
    main()
