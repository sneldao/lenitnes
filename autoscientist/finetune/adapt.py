import argparse
import csv
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from adaption import Adaption


def git_commit_sha(short: bool = True) -> str | None:
    try:
        cmd = ["git", "rev-parse", "HEAD" if not short else "--short", "HEAD"]
        return subprocess.check_output(cmd, stderr=subprocess.DEVNULL, cwd=Path(__file__).parent).decode().strip()
    except Exception:
        return os.environ.get("GIT_COMMIT")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def count_jsonl_lines(path: Path) -> int:
    count = 0
    with open(path) as f:
        for _ in f:
            count += 1
    return count


def write_upload_file(input_path: Path, upload_path: Path) -> None:
    with open(input_path) as src, open(upload_path, "w") as dst:
        for line in src:
            record = json.loads(line)
            messages = record.get("messages") or record.get("chat")
            new_record: dict[str, object] = {"chat": messages}
            if "metadata" in record and isinstance(record["metadata"], dict):
                new_record["metadata"] = json.dumps(record["metadata"], ensure_ascii=False)
            dst.write(json.dumps(new_record, ensure_ascii=False) + "\n")


def normalize_direction(value: str) -> str:
    v = str(value).lower().strip()
    if v in {"up", "u", "bullish", "rise", "long"}:
        return "up"
    if v in {"down", "d", "bearish", "fall", "short"}:
        return "down"
    return "flat"


def normalize_action(value: str) -> str:
    v = str(value).lower().strip()
    if v in {"long", "buy", "bullish", "long"}:
        return "long"
    if v in {"short", "sell", "bearish"}:
        return "short"
    return "none"


def normalize_confidence(value: object) -> float:
    try:
        v = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    if 0 <= v <= 1:
        return v * 100
    return min(max(v, 0.0), 100.0)


def extract_completion_json(text: str) -> dict | None:
    # Prefer fenced code block
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fence:
        candidate = fence.group(1).strip()
    else:
        # Fallback: first { } pair
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return None
        candidate = m.group(0)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def normalize_completion_blob(blob: dict) -> dict:
    labels = blob.get("detector_labels", [])
    if not isinstance(labels, list):
        labels = [labels]
    labels = [str(l) for l in labels]

    return {
        "detector_labels": labels,
        "recommended_action": normalize_action(blob.get("recommended_action", "")),
        "confidence": normalize_confidence(blob.get("confidence", 0)),
        "price_direction_24h": normalize_direction(blob.get("price_direction_24h", "")),
    }


def normalize_output(download_path: Path, output_path: Path, input_path: Path) -> None:
    # Load original records keyed by signal_id so we can preserve system/user prompts
    originals: dict[str, dict] = {}
    with open(input_path) as f:
        for line in f:
            record = json.loads(line)
            meta = record.get("metadata", {})
            if isinstance(meta, str):
                meta = json.loads(meta)
            sid = meta.get("signal_id")
            if sid:
                originals[sid] = record

    # Adaption currently returns a CSV with columns:
    # enhanced_prompt, enhanced_completion, metadata
    skipped = 0
    with open(download_path, newline="", encoding="utf-8") as src, open(output_path, "w", encoding="utf-8") as dst:
        reader = csv.DictReader(src)
        for row in reader:
            metadata_str = row.get("metadata", "{}")
            try:
                metadata = json.loads(metadata_str)
            except json.JSONDecodeError:
                metadata = {}

            sid = metadata.get("signal_id")
            original = originals.get(sid) if sid else None

            completion_blob = extract_completion_json(row.get("enhanced_completion", ""))
            if completion_blob is None:
                skipped += 1
                continue

            completion = normalize_completion_blob(completion_blob)
            completion_text = json.dumps(completion, ensure_ascii=False, separators=(",", ":"))

            if original and "messages" in original:
                messages = original["messages"][:2] + [
                    {"role": "assistant", "content": completion_text}
                ]
            else:
                # Fallback: create a minimal 3-turn chat
                messages = [
                    {"role": "system", "content": "You are a crypto code analyst."},
                    {"role": "user", "content": row.get("enhanced_prompt", "")},
                    {"role": "assistant", "content": completion_text},
                ]

            new_record: dict[str, object] = {"messages": messages}
            if metadata:
                new_record["metadata"] = metadata
            dst.write(json.dumps(new_record, ensure_ascii=False) + "\n")

    if skipped:
        print(f"warning: skipped {skipped} rows that did not contain valid assistant JSON", file=sys.stderr)


def validate_adapted(output_path: Path, source_rows: int) -> bool:
    records = []
    with open(output_path) as f:
        for line in f:
            records.append(json.loads(line))

    if not records:
        raise ValueError("Adapted output is empty")

    for i, r in enumerate(records):
        messages = r.get("messages")
        if not messages:
            raise ValueError(f"Row {i}: missing messages")
        if not isinstance(messages, list):
            raise ValueError(f"Row {i}: messages is not a list")
        for m in messages:
            if not isinstance(m, dict):
                raise ValueError(f"Row {i}: message is not an object")
            role = m.get("role")
            content = m.get("content")
            if role not in {"system", "user", "assistant"}:
                raise ValueError(f"Row {i}: invalid role {role}")
            if not isinstance(content, str):
                raise ValueError(f"Row {i}: content is not a string")
        if messages[-1].get("role") != "assistant":
            raise ValueError(f"Row {i}: last message is not assistant")

    if len(records) > source_rows * 10:
        print(f"warning: adapted row count {len(records)} is much larger than source {source_rows}", file=sys.stderr)

    return True


def wait_for_rows(client: Adaption, dataset_id: str, timeout: int) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = client.datasets.get_status(dataset_id)
        if status.row_count is not None and status.row_count > 0:
            return
        time.sleep(2)
    raise TimeoutError(f"Dataset {dataset_id} did not finish ingesting within {timeout}s")


def download_adaption_output(client: Adaption, dataset_id: str, download_path: Path) -> None:
    download = client.datasets.download(dataset_id)
    if not download:
        raise SystemExit("Adaption download returned empty content")

    # The SDK may return either a presigned URL or the file contents as a string.
    text = str(download)
    if text.strip().startswith("http"):
        with urllib.request.urlopen(text) as resp, open(download_path, "wb") as f:
            shutil.copyfileobj(resp, f)
    else:
        with open(download_path, "w", encoding="utf-8") as f:
            f.write(text)


def write_provenance(
    provenance_path: Path,
    input_path: Path,
    output_path: Path,
    dataset_id: str,
    run_id: str,
    column_mapping: dict,
    max_rows: int | None,
) -> None:
    provenance = {
        "raw_train_path": str(input_path),
        "raw_train_sha256": sha256_file(input_path),
        "adapted_output_path": str(output_path),
        "adapted_output_sha256": sha256_file(output_path),
        "adaption_dataset_id": dataset_id,
        "adaption_run_id": run_id,
        "column_mapping": column_mapping,
        "max_rows": max_rows,
        "source_row_count": count_jsonl_lines(input_path),
        "adapted_row_count": count_jsonl_lines(output_path),
        "pipeline_commit": git_commit_sha(),
    }
    provenance_path.parent.mkdir(parents=True, exist_ok=True)
    with open(provenance_path, "w") as f:
        json.dump(provenance, f, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Adapt a raw JSONL train split using the Adaption API."
    )
    parser.add_argument("--input", default="data/train_raw.jsonl")
    parser.add_argument("--output", default="data/train.jsonl")
    parser.add_argument("--provenance", default="data/train.provenance.json")
    parser.add_argument("--name", default="autoscientist-market-analysis-lenitnes-train")
    parser.add_argument("--download_dataset_id", default=None, help="Skip upload/run and download an existing Adaption dataset")
    parser.add_argument("--download_run_id", default=None, help="Run ID to record in provenance when using --download_dataset_id")
    parser.add_argument("--estimate", action="store_true")
    parser.add_argument("--max_rows", type=int, default=None, help="Smoke-test limit on rows to adapt")
    parser.add_argument("--upload_timeout", type=int, default=300)
    parser.add_argument("--run_timeout", type=int, default=1800)
    args = parser.parse_args()

    api_key = os.environ.get("ADAPTION_API_KEY")
    if not api_key:
        raise SystemExit("ADAPTION_API_KEY is required")

    client = Adaption(api_key=api_key)
    input_path = Path(args.input)
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    if args.download_dataset_id:
        dataset_id = args.download_dataset_id
        run_id = args.download_run_id or dataset_id
        source_rows = count_jsonl_lines(input_path)
    else:
        upload_path = input_path.with_suffix(".upload.jsonl")
        write_upload_file(input_path, upload_path)
        source_rows = count_jsonl_lines(input_path)

        upload = client.datasets.upload_file(str(upload_path), name=args.name)
        print(f"Uploaded to dataset {upload.dataset_id} ({source_rows} source rows)")

        wait_for_rows(client, upload.dataset_id, args.upload_timeout)

        column_mapping = {"chat": "chat"}
        job_spec = {"max_rows": args.max_rows} if args.max_rows else None

        if args.estimate:
            estimate_kwargs: dict = {
                "column_mapping": column_mapping,
                "estimate": True,
            }
            if job_spec:
                estimate_kwargs["job_specification"] = job_spec
            estimate = client.datasets.run(upload.dataset_id, **estimate_kwargs)
            print(f"Estimated credits: {estimate.estimated_credits_consumed}")
            return

        run_kwargs: dict = {
            "column_mapping": column_mapping,
        }
        if job_spec:
            run_kwargs["job_specification"] = job_spec
        run = client.datasets.run(upload.dataset_id, **run_kwargs)
        dataset_id = upload.dataset_id
        run_id = run.run_id
        print(f"Started run {run_id}, estimated credits: {run.estimated_credits_consumed}")

        final = client.datasets.wait_for_completion(upload.dataset_id, timeout=args.run_timeout)
        print(f"Run finished: {final.status}")
        if final.error_data:
            raise SystemExit(f"Adaption run failed: {final.error_data.message}")

    download_path = Path(args.output).with_suffix(".download.csv")
    download_adaption_output(client, dataset_id, download_path)

    normalize_output(download_path, Path(args.output), input_path)
    validate_adapted(Path(args.output), source_rows)
    write_provenance(
        Path(args.provenance),
        input_path,
        Path(args.output),
        dataset_id,
        run_id,
        {"chat": "chat"},
        args.max_rows,
    )
    print(f"Wrote adapted dataset to {args.output}")


if __name__ == "__main__":
    main()
