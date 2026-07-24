import argparse
import json
import sys
from pathlib import Path

import benchmark as bm


def relative_change(base: float, adapted: float) -> float | None:
    if base == 0:
        return None
    return round((adapted - base) / base, 4)


def build_table(base: dict, adapted: dict) -> list[dict]:
    metrics = [
        "price_direction_accuracy",
        "detector_micro_f1",
        "detector_macro_f1",
        "detector_exact_match",
        "parse_success_rate",
    ]
    rows = []
    for m in metrics:
        b = base.get(m, 0.0)
        a = adapted.get(m, 0.0)
        rows.append({
            "metric": m,
            "base": b,
            "adapted": a,
            "relative_change": relative_change(b, a),
        })
    return rows


def print_table(rows: list[dict]) -> None:
    print(f"{'Metric':<30} {'Base':<10} {'Adapted':<10} {'Relative change':<15}")
    print("-" * 70)
    for r in rows:
        rel = f"{r['relative_change']:+7.2%}" if r["relative_change"] is not None else "N/A"
        print(f"{r['metric']:<30} {r['base']:<10.4f} {r['adapted']:<10.4f} {rel:<15}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test_file", default="data/test.jsonl")
    parser.add_argument("--base_model", default="Qwen/Qwen2.5-Coder-0.5B-Instruct")
    parser.add_argument("--adapter_dir", default="outputs/autoscientist-math-code-lenitnes")
    parser.add_argument("--output", default="metrics_compare.json")
    parser.add_argument("--max_samples", type=int, default=None)
    args = parser.parse_args()

    test_records = bm.load_jsonl(Path(args.test_file))
    if not test_records:
        raise SystemExit(f"No test records found in {args.test_file}")

    print("Evaluating zero-shot base model...")
    base_metrics = bm.evaluate_model(args.base_model, None, test_records, args.max_samples)
    if base_metrics.get("valid", 0) == 0:
        raise SystemExit("Base model produced no valid predictions")

    print("Evaluating fine-tuned (adapted) model...")
    adapted_metrics = bm.evaluate_model(
        args.base_model,
        Path(args.adapter_dir),
        test_records,
        args.max_samples,
    )
    if adapted_metrics.get("valid", 0) == 0:
        raise SystemExit("Adapted model produced no valid predictions")

    table = build_table(base_metrics, adapted_metrics)
    primary_metric = "detector_micro_f1"
    primary_row = next((r for r in table if r["metric"] == primary_metric), None)

    result = {
        "primary_metric": primary_metric,
        "primary_relative_change": primary_row["relative_change"] if primary_row else None,
        "n_test": base_metrics.get("n_test", 0),
        "base": base_metrics,
        "adapted": adapted_metrics,
        "comparison_table": table,
    }

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\nWrote comparison to {args.output}\n")
    print_table(table)


if __name__ == "__main__":
    main()
