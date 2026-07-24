import argparse
import json
import math
import random
from collections import Counter
from pathlib import Path

import benchmark as bm
from sklearn.metrics import accuracy_score, f1_score


def percentile(sorted_scores: list[float], p: float) -> float:
    n = len(sorted_scores)
    if n == 0:
        return 0.0
    return sorted_scores[int(p * (n - 1))]


def extract_gold(record: dict) -> dict | None:
    messages = record.get("messages") or record.get("chat") or []
    if not messages:
        return None
    try:
        content = messages[-1]["content"]
        blob = json.loads(content)
    except (json.JSONDecodeError, KeyError, IndexError, TypeError):
        return None
    return bm.normalize_prediction(blob)


def collect_predictions(base_model: str, adapter_dir: Path | None, test_records: list[dict], max_samples: int | None = None):
    model, tokenizer, adapter_hash = bm.load_model(base_model, adapter_dir)
    records = test_records[:max_samples] if max_samples else test_records

    gold_directions: list[str] = []
    pred_directions: list[str] = []
    gold_labels: list[list[str]] = []
    pred_labels: list[list[str]] = []
    json_extracted = 0
    schema_valid = 0

    for record in records:
        gold = extract_gold(record)
        if not gold or not gold["_valid"]:
            continue

        messages = record.get("messages") or record.get("chat") or []
        raw = bm.generate(model, tokenizer, messages)
        blob = bm.parse_json_blob(raw)
        pred = bm.normalize_prediction(blob) if blob is not None else bm.normalize_prediction({})

        gold_directions.append(gold["price_direction_24h"])
        gold_labels.append(list(gold.get("detector_labels", [])))

        if blob is not None:
            json_extracted += 1
            if pred["_valid"]:
                schema_valid += 1
                pred_directions.append(pred["price_direction_24h"])
                pred_labels.append(pred["detector_labels"])
            else:
                pred_directions.append(bm.INVALID_DIRECTION)
                pred_labels.append([bm.INVALID_LABEL])
        else:
            pred_directions.append(bm.INVALID_DIRECTION)
            pred_labels.append([bm.INVALID_LABEL])

    return {
        "gold_directions": gold_directions,
        "pred_directions": pred_directions,
        "gold_labels": gold_labels,
        "pred_labels": pred_labels,
        "n_test": len(records),
        "valid": len(gold_directions),
        "json_extracted": json_extracted,
        "schema_valid": schema_valid,
        "adapter_hash": adapter_hash,
    }


def direction_metrics(gold: list[str], pred: list[str]) -> dict:
    return {
        "accuracy": round(accuracy_score(gold, pred), 4),
        "macro_f1": round(f1_score(gold, pred, labels=["up", "down", "flat"], average="macro", zero_division=0), 4),
    }


def majority_baseline(gold: list[str]) -> tuple[str, dict]:
    most_common = Counter(gold).most_common(1)[0][0]
    pred = [most_common] * len(gold)
    return most_common, direction_metrics(gold, pred)


def bootstrap_ci(scores: list[float]) -> tuple[float, float, float]:
    scores = sorted(scores)
    return (
        percentile(scores, 0.025),
        percentile(scores, 0.50),
        percentile(scores, 0.975),
    )


def paired_delta_bootstrap(base_gold: list[str], base_pred: list[str], adapted_gold: list[str], adapted_pred: list[str], n: int = 1000) -> tuple[float, float, float]:
    n_samples = len(base_gold)
    if n_samples != len(adapted_gold) or n_samples == 0:
        return (0.0, 0.0, 0.0)
    rng = random.Random(42)
    deltas = []
    for _ in range(n):
        indices = [rng.randint(0, n_samples - 1) for _ in range(n_samples)]
        base_f1 = f1_score([base_gold[i] for i in indices], [base_pred[i] for i in indices], labels=["up", "down", "flat"], average="macro", zero_division=0)
        adapted_f1 = f1_score([adapted_gold[i] for i in indices], [adapted_pred[i] for i in indices], labels=["up", "down", "flat"], average="macro", zero_division=0)
        deltas.append(adapted_f1 - base_f1)
    return bootstrap_ci(deltas)


def model_bootstrap(gold: list[str], pred: list[str], n: int = 1000) -> tuple[float, float, float]:
    n_samples = len(gold)
    if n_samples == 0:
        return (0.0, 0.0, 0.0)
    rng = random.Random(42)
    scores = []
    for _ in range(n):
        indices = [rng.randint(0, n_samples - 1) for _ in range(n_samples)]
        scores.append(f1_score([gold[i] for i in indices], [pred[i] for i in indices], labels=["up", "down", "flat"], average="macro", zero_division=0))
    return bootstrap_ci(scores)


def relative_change(base: float, adapted: float) -> float | None:
    if base == 0:
        return None
    return round((adapted - base) / base, 4)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test_file", default="data/test.jsonl")
    parser.add_argument("--test_manifest", default="data/test_manifest.json")
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-Coder-0.5B-Instruct")
    parser.add_argument("--adapter_dir", default="outputs/autoscientist-market-analysis-lenitnes")
    parser.add_argument("--output", default="metrics_compare.json")
    parser.add_argument("--max_samples", type=int, default=None)
    parser.add_argument("--n_bootstrap", type=int, default=1000)
    args = parser.parse_args()

    test_records = bm.load_jsonl(Path(args.test_file))
    if not test_records:
        raise SystemExit(f"No test records found in {args.test_file}")

    manifest_path = Path(args.test_manifest)
    if not manifest_path.exists():
        raise SystemExit(f"Test manifest not found: {args.test_manifest}")
    manifest = json.loads(manifest_path.read_text())

    actual_hash = bm.sha256_file(Path(args.test_file))
    if manifest.get("test_sha256") != actual_hash:
        raise SystemExit("Test dataset hash does not match frozen manifest")
    if manifest.get("test_rows") != len(test_records):
        raise SystemExit("Test dataset row count does not match frozen manifest")

    print("Evaluating zero-shot base model...")
    base = collect_predictions(args.base_model, None, test_records, args.max_samples)
    if base["valid"] == 0:
        raise SystemExit("Base model produced no valid predictions")

    print("Evaluating fine-tuned (adapted) model...")
    adapted = collect_predictions(args.base_model, Path(args.adapter_dir), test_records, args.max_samples)
    if adapted["valid"] == 0:
        raise SystemExit("Adapted model produced no valid predictions")

    base_dir = direction_metrics(base["gold_directions"], base["pred_directions"])
    adapted_dir = direction_metrics(adapted["gold_directions"], adapted["pred_directions"])
    majority_class, majority = majority_baseline(base["gold_directions"])

    base_ci = model_bootstrap(base["gold_directions"], base["pred_directions"], args.n_bootstrap)
    adapted_ci = model_bootstrap(adapted["gold_directions"], adapted["pred_directions"], args.n_bootstrap)
    delta_ci = paired_delta_bootstrap(
        base["gold_directions"], base["pred_directions"],
        adapted["gold_directions"], adapted["pred_directions"],
        args.n_bootstrap,
    )

    primary_metric = "direction_macro_f1"
    primary_base = base_dir["macro_f1"]
    primary_adapted = adapted_dir["macro_f1"]

    class_distribution = dict(Counter(base["gold_directions"]))

    comparison = [
        {
            "metric": "price_direction_accuracy",
            "base": base_dir["accuracy"],
            "adapted": adapted_dir["accuracy"],
            "majority_baseline": majority["accuracy"],
            "absolute_gain": round(adapted_dir["accuracy"] - base_dir["accuracy"], 4),
            "relative_change": relative_change(base_dir["accuracy"], adapted_dir["accuracy"]),
        },
        {
            "metric": "direction_macro_f1",
            "base": base_dir["macro_f1"],
            "adapted": adapted_dir["macro_f1"],
            "majority_baseline": majority["macro_f1"],
            "absolute_gain": round(adapted_dir["macro_f1"] - base_dir["macro_f1"], 4),
            "relative_change": relative_change(base_dir["macro_f1"], adapted_dir["macro_f1"]),
            "base_95ci": base_ci,
            "adapted_95ci": adapted_ci,
            "delta_95ci": delta_ci,
        },
    ]

    result = {
        "primary_metric": primary_metric,
        "primary_relative_change": relative_change(primary_base, primary_adapted),
        "primary_absolute_gain": round(primary_adapted - primary_base, 4),
        "primary_delta_95ci": delta_ci,
        "n_test": base["n_test"],
        "valid": base["valid"],
        "json_extracted_rate": round(base["json_extracted"] / base["valid"], 4) if base["valid"] else 0.0,
        "schema_valid_rate_base": round(base["schema_valid"] / base["valid"], 4) if base["valid"] else 0.0,
        "schema_valid_rate_adapted": round(adapted["schema_valid"] / adapted["valid"], 4) if adapted["valid"] else 0.0,
        "class_distribution": class_distribution,
        "majority_class": majority_class,
        "base": base_dir,
        "adapted": adapted_dir,
        "majority_baseline": majority,
        "comparison_table": comparison,
        "manifest": manifest,
        "base_adapter_hash": None,
        "adapted_adapter_hash": adapted["adapter_hash"],
    }

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\nWrote comparison to {args.output}\n")
    print(f"{'Metric':<30} {'Baseline':<10} {'Base':<10} {'Adapted':<10} {'Change':<12}")
    print("-" * 80)
    for r in comparison:
        change = f"{r['absolute_gain']:+.4f}"
        print(f"{r['metric']:<30} {r['majority_baseline']:<10.4f} {r['base']:<10.4f} {r['adapted']:<10.4f} {change:<12}")
    print(f"\nPrimary delta 95% CI: [{delta_ci[0]:.4f}, {delta_ci[2]:.4f}] (median {delta_ci[1]:.4f})")


if __name__ == "__main__":
    main()
