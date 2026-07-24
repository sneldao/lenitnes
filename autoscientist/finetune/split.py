import argparse
import hashlib
import json
import os
import random
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def git_commit_sha(short: bool = True) -> str | None:
    try:
        cmd = ["git", "rev-parse", "--short" if short else "HEAD", "HEAD"]
        return subprocess.check_output(cmd, stderr=subprocess.DEVNULL, cwd=Path(__file__).parent).decode().strip()
    except Exception:
        return os.environ.get("GIT_COMMIT")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def get_detected_at(record: dict) -> str | None:
    return record.get("metadata", {}).get("detected_at")


def load_records(path: Path) -> list[dict]:
    records = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Split a raw JSONL dataset temporally or randomly."
    )
    parser.add_argument("--input", default="data/all.jsonl")
    parser.add_argument("--train", default="data/train_raw.jsonl")
    parser.add_argument("--test", default="data/test.jsonl")
    parser.add_argument("--manifest", default="data/test_manifest.json")
    parser.add_argument("--test_cutoff", default=None, help="ISO date; records after this go to test")
    parser.add_argument("--test_ratio", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--allow_missing_dates", action="store_true", help="Place records without detected_at into train instead of failing")
    args = parser.parse_args()

    input_path = Path(args.input)
    records = load_records(input_path)
    if not records:
        raise SystemExit(f"No records found in {args.input}")

    input_sha = sha256_file(input_path)

    if args.test_cutoff:
        cutoff = parse_iso(args.test_cutoff)
        train_records: list[dict] = []
        test_records: list[dict] = []
        missing = 0
        for r in records:
            ts = get_detected_at(r)
            if ts is None:
                missing += 1
                if args.allow_missing_dates:
                    train_records.append(r)
                else:
                    raise SystemExit(
                        f"record lacks metadata.detected_at; use --allow_missing_dates to place these in train"
                    )
            elif parse_iso(ts) <= cutoff:
                train_records.append(r)
            else:
                test_records.append(r)
        if missing and args.allow_missing_dates:
            print(
                f"warning: {missing} records lack metadata.detected_at and were placed in train",
                file=sys.stderr,
            )
    else:
        cutoff = None
        random.seed(args.seed)
        shuffled = records[:]
        random.shuffle(shuffled)
        split = int(len(shuffled) * (1 - args.test_ratio))
        train_records = shuffled[:split]
        test_records = shuffled[split:]

    if not test_records:
        raise SystemExit("test set is empty — check your cutoff/ratio or input file")

    for out_path, subset in [(args.train, train_records), (args.test, test_records)]:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w") as f:
            for r in subset:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    test_dates = [parse_iso(ts) for ts in (get_detected_at(r) for r in test_records) if ts]
    test_sha = sha256_file(Path(args.test))

    manifest = {
        "input_path": str(input_path),
        "input_sha256": input_sha,
        "test_path": args.test,
        "test_sha256": test_sha,
        "train_path": args.train,
        "train_rows": len(train_records),
        "test_rows": len(test_records),
        "date_min": min(test_dates).isoformat() if test_dates else None,
        "date_max": max(test_dates).isoformat() if test_dates else None,
        "cutoff": args.test_cutoff,
        "test_ratio": args.test_ratio if not args.test_cutoff else None,
        "seed": args.seed if not args.test_cutoff else None,
        "pipeline_commit": git_commit_sha(),
    }
    Path(args.manifest).parent.mkdir(parents=True, exist_ok=True)
    with open(args.manifest, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"train: {len(train_records)} examples -> {args.train}")
    print(f"test:  {len(test_records)} examples -> {args.test}")
    print(f"manifest: {args.manifest}")


if __name__ == "__main__":
    main()
