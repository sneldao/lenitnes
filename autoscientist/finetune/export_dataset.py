#!/usr/bin/env python3
"""Export lenitnes production signals to a prompt/completion JSONL seed dataset.

Connects to the production Postgres (via the SSH tunnel to the VPS docker
network) and emits one training example per (signal, outcome-window) pair.

Seed-expansion strategy (see docs/AUTOSCIENTIST.md):

1. All monitors, not just github — the three synthesized monitors
   (narrative:portfolio, proactive:signals, synthesis:thesis) carry
   richly-labeled cross-signal evidence and are on-category for
   "Market-Analysis & News".
2. Multi-window labels — outcomes exist for 1h / 4h / 24h / 1w. Predicting
   the direction over different horizons is a genuinely different task, so
   one signal legitimately yields up to len(WINDOWS) examples. The horizon
   is stated explicitly in the prompt and echoed as a generic
   ``price_direction`` key in the completion (no 24h hard-coding).
3. Every example records ``metadata.signal_id`` so any downstream split can
   keep variants of one signal together (leakage discipline).

Usage:

    DATABASE_URL=<from .env or VPS ssh tunnel> \
    GITHUB_TOKEN=<pat> \
    python export_dataset.py --output data/all.jsonl
"""

import argparse
import json
import os
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor

# Outcome windows we turn into labeled examples, in seconds.
WINDOWS = {
    3600: "1h",
    14400: "4h",
    86400: "24h",
    604800: "1w",
}

GITHUB_MONITORS = "github monitors"
SYNTH_MAILBOX_PREFIXES = ("narrative:", "proactive:", "synthesis:")

SYSTEM_PROMPT = (
    "You are a crypto market-analysis model. Given GitHub commit/release "
    "evidence for one or more monitored repositories, classify the signal "
    "types present, recommend a directional action, estimate confidence, and "
    "predict the asset's price direction over the stated horizon. Return only "
    "a compact JSON object with keys: detector_labels, recommended_action, "
    "confidence, price_direction."
)

TASK_SENTENCE = (
    "Classify the signal types present, recommend a directional action, "
    "estimate confidence, and predict the "
)

RETURN_CONTRACT = (
    " Return a compact JSON object with keys: detector_labels, "
    "recommended_action, confidence, price_direction."
)


def parse_repo(url: str) -> tuple[str, str] | None:
    m = re.match(r"^https?://github\.com/([^/]+)/([^/]+)(?:/.*)?$", url)
    if m:
        return m.group(1), m.group(2).replace(".git", "")
    m = re.match(r"^([\w.-]+)/([\w.-]+)$", url)
    if m:
        return m.group(1), m.group(2).replace(".git", "")
    return None


def fetch_diff(owner: str, repo: str, sha: str, token: str | None) -> str | None:
    url = f"https://api.github.com/repos/{owner}/{repo}/commits/{sha}"
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github.diff",
            "User-Agent": "lenitnes-autoscientist/1.0",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception:
        return None


def parse_evidence_lines(evidence: str) -> list[dict[str, str]]:
    commits: list[dict[str, str]] = []
    for line in evidence.splitlines():
        if len(line) < 8 or line[7] != ":":
            continue
        sha = line[:7].strip()
        rest = line[8:].strip()
        size_match = re.search(r" \(\+(\d+)/-(\d+)\)$", rest)
        if size_match:
            message = rest[: size_match.start()]
            additions = size_match.group(1)
            deletions = size_match.group(2)
        else:
            message = rest
            additions = "0"
            deletions = "0"
        commits.append(
            {"sha": sha, "message": message, "additions": additions, "deletions": deletions}
        )
    return commits


def build_prompt(signal: dict[str, Any], diffs: dict[str, str], window_label: str) -> str:
    if signal["repo"]:
        owner, repo = signal["repo"]
        header = f"Repository: {owner}/{repo}"
    else:
        header = f"Monitor: {signal['monitor_url']}"
    lines = [
        SYSTEM_PROMPT,
        "",
        header,
        f"Monitored condition: {signal['condition_text']}",
        f"Detected at: {signal['detected_at']}",
        f"Asset: {signal['asset']}",
        "",
        "Evidence:",
    ]
    if signal["repo"] and signal["commits"]:
        for c in signal["commits"]:
            sha = c["sha"]
            diff = diffs.get(sha)
            if diff:
                diff = diff[:800] + ("\n..." if len(diff) > 800 else "")
                lines.append(f"- {sha}: {c['message']}\n{diff}")
            else:
                lines.append(f"- {sha}: {c['message']} (+{c['additions']}/-{c['deletions']})")
    else:
        # Synthesized monitors already embed cross-repo evidence as text.
        lines.append(signal["evidence_text"].strip())
    lines.append("")
    lines.append(
        f"{TASK_SENTENCE}{window_label} price direction.{RETURN_CONTRACT}"
    )
    return "\n".join(lines)


def build_completion(signal: dict[str, Any], direction: str) -> str:
    labels = list({c["detector_type"] for c in signal["classifications"]})
    action = {"up": "long", "down": "short"}.get(direction, "none")
    confidences = [c["confidence"] for c in signal["classifications"]]
    confidence = round(sum(confidences) / len(confidences)) if confidences else 0
    return json.dumps(
        {
            "detector_labels": labels,
            "recommended_action": action,
            "confidence": confidence,
            "price_direction": direction,
        },
        separators=(",", ":"),
    )


def fetch_signal_diffs(signal: dict[str, Any], token: str | None) -> dict[str, str]:
    if not signal["repo"]:
        return {}
    owner, repo = signal["repo"]
    diffs: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(fetch_diff, owner, repo, c["sha"], token): c["sha"]
            for c in signal["commits"]
        }
        for future in as_completed(futures):
            sha = futures[future]
            result = future.result()
            if result:
                diffs[sha] = result
    return diffs


def load_signals(conn: Any) -> list[dict[str, Any]]:
    sql = """
    SELECT s.id,
           s.detected_at,
           s.evidence_text,
           s.condition_summary,
           m.url,
           m.condition_text,
           m.asset_mapping,
           sc.detector_type,
           sc.confidence,
           so.window_seconds,
           so.asset,
           so.direction,
           so.pct_change
    FROM signals s
    JOIN monitors m ON m.id = s.monitor_id
    JOIN signal_classifications sc ON sc.signal_id = s.id
    JOIN signal_outcomes so ON so.signal_id = s.id AND so.window_seconds = ANY(%s)
    WHERE s.is_heartbeat = false
      AND s.evidence_text IS NOT NULL
      AND s.evidence_text <> ''
    ORDER BY s.id, so.window_seconds
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, (list(WINDOWS),))
        rows = cur.fetchall()

    by_id: dict[str, dict[str, Any]] = {}
    for r in rows:
        sid = str(r["id"])
        if sid not in by_id:
            url = r["url"] or ""
            is_synth = any(url.startswith(p) for p in SYNTH_MAILBOX_PREFIXES)
            repo = None if is_synth else parse_repo(url)
            asset = r["asset"] or (r["asset_mapping"] or {}).get("coingeckoId") or "unknown"
            by_id[sid] = {
                "id": sid,
                "detected_at": r["detected_at"].isoformat() if r["detected_at"] else None,
                "evidence_text": r["evidence_text"],
                "condition_text": r["condition_text"],
                "condition_summary": r["condition_summary"],
                "repo": repo,
                "monitor_url": url,
                "is_synth": is_synth,
                "asset": asset,
                "commits": parse_evidence_lines(r["evidence_text"]) if not is_synth else [],
                "classifications": [],
                "outcomes": {},
            }
        by_id[sid]["classifications"].append(
            {"detector_type": r["detector_type"], "confidence": r["confidence"]}
        )
        w = int(r["window_seconds"])
        direction = r["direction"]
        if direction and w not in by_id[sid]["outcomes"]:
            by_id[sid]["outcomes"][w] = {
                "direction": direction,
                "pct_change": str(r["pct_change"]) if r["pct_change"] is not None else None,
            }

    # Signals need at least one outcome window and at least one classification.
    return [s for s in by_id.values() if s["outcomes"] and s["classifications"]]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/all.jsonl")
    parser.add_argument("--github-token", default=os.environ.get("GITHUB_TOKEN"))
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--no-diff", action="store_true",
                        help="Use commit summaries instead of fetching full diff patches")
    parser.add_argument("--max-diff-bodies", type=int, default=600,
                        help="Cap on GitHub diff fetches (rate-limit safety)")
    args = parser.parse_args()

    if not args.database_url:
        raise SystemExit("DATABASE_URL is required")

    conn = psycopg2.connect(args.database_url)
    signals = load_signals(conn)
    conn.close()

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)

    diff_budget = 0
    written = 0
    per_window = {w: 0 for w in WINDOWS}
    per_monitor: dict[str, int] = {}
    with open(args.output, "w") as f:
        for signal in signals:
            # Only fetch diffs for github-repo monitors; synthesis evidence is
            # already self-contained text.
            diffs: dict[str, str] = {}
            if signal["repo"] and not args.no_diff and diff_budget < args.max_diff_bodies:
                diffs = fetch_signal_diffs(signal, args.github_token)
                diff_budget += len(diffs)

            for window, outcome in sorted(signal["outcomes"].items()):
                label = WINDOWS[window]
                prompt = build_prompt(signal, diffs, label)
                completion = build_completion(signal, outcome["direction"])
                record = {
                    "prompt": prompt,
                    "completion": completion,
                    "metadata": {
                        "signal_id": signal["id"],
                        "monitor": signal["monitor_url"],
                        "monitor_kind": "synthesis" if signal["is_synth"] else "github",
                        "asset": signal["asset"],
                        "detected_at": signal["detected_at"],
                        "window": label,
                        "pct_change": outcome["pct_change"],
                    },
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                written += 1
                per_window[window] += 1
                kind = "synthesis" if signal["is_synth"] else "github"
                per_monitor[kind] = per_monitor.get(kind, 0) + 1

    print(f"Wrote {written} examples to {args.output}")
    print(f"  per window: {dict((WINDOWS[w], n) for w, n in per_window.items())}")
    print(f"  per monitor kind: {per_monitor}")
    print(f"  signals used: {len(signals)}")


if __name__ == "__main__":
    main()
