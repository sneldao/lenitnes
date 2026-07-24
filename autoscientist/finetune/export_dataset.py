import argparse
import json
import os
import re
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor


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


def build_prompt(signal: dict[str, Any], diffs: dict[str, str]) -> str:
    owner, repo = signal["repo"]
    lines = [
        f"Repository: {owner}/{repo}",
        f"Monitored condition: {signal['condition_text']}",
        f"Detected at: {signal['detected_at']}",
        f"Asset: {signal['asset']}",
        "",
        "Commits:",
    ]
    for c in signal["commits"]:
        sha = c["sha"]
        diff = diffs.get(sha)
        if diff:
            diff = diff[:1500] + ("\n..." if len(diff) > 1500 else "")
            lines.append(f"- {sha}: {c['message']}\n{diff}")
        else:
            lines.append(
                f"- {sha}: {c['message']} (+{c['additions']}/-{c['deletions']})"
            )
    lines.append("")
    lines.append(
        "Classify the signal type, recommend an action, and predict the 24h price direction. "
        "Return a compact JSON object with keys: detector_labels, recommended_action, confidence, price_direction_24h."
    )
    return "\n".join(lines)


def build_completion(signal: dict[str, Any]) -> str:
    labels = list({c["detector_type"] for c in signal["classifications"]})
    direction = signal["outcome_direction"] or "flat"
    action = {"up": "long", "down": "short"}.get(direction, "none")
    confidences = [c["confidence"] for c in signal["classifications"]]
    confidence = round(sum(confidences) / len(confidences)) if confidences else 0
    return json.dumps(
        {
            "detector_labels": labels,
            "recommended_action": action,
            "confidence": confidence,
            "price_direction_24h": direction,
        },
        separators=(",", ":"),
    )


def fetch_signal_diffs(signal: dict[str, Any], token: str | None) -> dict[str, str]:
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


def load_signals(conn: Any, window: int) -> list[dict[str, Any]]:
    sql = """
    SELECT s.id,
           s.detected_at,
           s.evidence_text,
           s.condition_summary,
           m.url,
           m.condition_text,
           m.asset_mapping,
           sc.detector_type,
           sc.score,
           sc.confidence,
           sc.label,
           so.asset,
           so.pct_change,
           so.direction
    FROM signals s
    JOIN monitors m ON m.id = s.monitor_id
    JOIN signal_classifications sc ON sc.signal_id = s.id
    LEFT JOIN signal_outcomes so ON so.signal_id = s.id AND so.window_seconds = %s
    WHERE s.is_heartbeat = false
      AND s.evidence_text IS NOT NULL
      AND s.evidence_text <> ''
      AND m.url LIKE '%%github.com%%'
    ORDER BY s.id
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, (window,))
        rows = cur.fetchall()

    by_id: dict[str, dict[str, Any]] = {}
    for r in rows:
        sid = str(r["id"])
        if sid not in by_id:
            repo = parse_repo(r["url"])
            if not repo:
                continue
            asset = r["asset"] or (r["asset_mapping"] or {}).get("coingeckoId") or "unknown"
            by_id[sid] = {
                "id": sid,
                "detected_at": r["detected_at"].isoformat() if r["detected_at"] else None,
                "evidence_text": r["evidence_text"],
                "condition_text": r["condition_text"],
                "condition_summary": r["condition_summary"],
                "repo": repo,
                "asset": asset,
                "commits": parse_evidence_lines(r["evidence_text"]),
                "classifications": [],
                "outcome_direction": r["direction"],
                "pct_change": str(r["pct_change"]) if r["pct_change"] is not None else None,
            }
        by_id[sid]["classifications"].append(
            {
                "detector_type": r["detector_type"],
                "score": r["score"],
                "confidence": r["confidence"],
                "label": r["label"],
            }
        )

    return [s for s in by_id.values() if s["outcome_direction"] is not None]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/train.jsonl")
    parser.add_argument("--window", type=int, default=86400)
    parser.add_argument("--github-token", default=os.environ.get("GITHUB_TOKEN"))
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--no-diff", action="store_true", help="Use commit summaries instead of fetching full diff patches")
    args = parser.parse_args()

    if not args.database_url:
        raise SystemExit("DATABASE_URL is required")

    conn = psycopg2.connect(args.database_url)
    signals = load_signals(conn, args.window)
    conn.close()

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    written = 0
    with open(args.output, "w") as f:
        for signal in signals:
            diffs = {} if args.no_diff else fetch_signal_diffs(signal, args.github_token)
            prompt = build_prompt(signal, diffs)
            completion = build_completion(signal)
            record = {
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a crypto code analyst. Given a GitHub repository's recent commits, "
                            "classify the signal type, recommend a directional action, and predict the 24h price direction. "
                            "Return a compact JSON object with keys: detector_labels, recommended_action, confidence, price_direction_24h."
                        ),
                    },
                    {"role": "user", "content": prompt},
                    {"role": "assistant", "content": completion},
                ]
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            written += 1

    print(f"Wrote {written} examples to {args.output}")


if __name__ == "__main__":
    main()
