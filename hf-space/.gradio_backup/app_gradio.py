"""
LENITNES — Scientific Software Integrity Sentinel
Hugging Face Space: live mirror of the production scorecard.
"""
import os

import gradio as gr
import pandas as pd
import requests

API_BASE = os.environ.get("LENITNES_API", "https://lenitnes.persidian.com/api")
WEB_URL = "https://lenitnes.persidian.com"
REPO_URL = "https://github.com/sneldao/lenitnes"


def fetch_json(endpoint):
    try:
        r = requests.get(f"{API_BASE}/{endpoint}", timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def get_scorecard():
    data = fetch_json("scorecard")
    if not data:
        return (
            "**API unreachable** — the live dashboard remains available at "
            f"[{WEB_URL}]({WEB_URL}).",
            pd.DataFrame(),
        )
    oc = data.get("outcomesSummary", {})
    summary = (
        "| Metric | Value |\n|---|---|\n"
        f"| Total signals | {data.get('totalSignals', 'N/A')} |\n"
        f"| Total trades | {data.get('totalTrades', 'N/A')} |\n"
        f"| Hit ratio | {data.get('hitRatio', 0):.1%} |\n"
        f"| Cumulative P&L | ${data.get('cumulativePnlUsd', 0):,.2f} |\n"
        f"| Sharpe | {data.get('sharpe', 0):.3f} |\n"
        f"| Max drawdown | ${data.get('maxDrawdownUsd', 0):,.2f} |\n"
        f"| Closed outcomes | {oc.get('closed', 'N/A')} |\n"
        f"| Pending outcomes | {oc.get('pending', 'N/A')} |"
    )
    det_rows = []
    for d in data.get("bySignalType", []):
        det_rows.append(
            {
                "Detector": d.get("detectorType", ""),
                "Signals": d.get("total", 0),
                "Hits": d.get("hits", 0),
                "Hit rate": f"{d.get('hitRatio', 0):.1%}",
                "Avg 1h %": f"{d.get('avgT1hPct', 0):.2f}",
                "Avg 1d %": f"{d.get('avgT1dPct', 0):.2f}",
                "Avg 7d %": f"{d.get('avgT7dPct', 0):.2f}",
            }
        )
    return summary, pd.DataFrame(det_rows)


def get_recent_signals():
    data = fetch_json("scorecard/recent?limit=10")
    if not data:
        return pd.DataFrame([{"Note": "API unreachable"}])
    rows = []
    for s in data:
        repo = s.get("monitorUrl", "").split("github.com/")[-1].split("/commits")[0]
        rows.append(
            {
                "Time (UTC)": (s.get("detectedAt", "") or "")[:16].replace("T", " "),
                "Repo": repo,
                "Detector": ", ".join(s.get("detectorTypes", []) or []),
                "Conviction": s.get("conviction", ""),
                "Thesis": (s.get("thesis", "") or "")[:120],
            }
        )
    return pd.DataFrame(rows)


def get_monitors():
    data = fetch_json("monitors")
    if not data:
        return pd.DataFrame([{"Note": "API unreachable"}])
    rows = []
    for m in data:
        repo = m.get("url", "").split("github.com/")[-1].split("/commits")[0]
        rows.append(
            {
                "Repo": repo,
                "Domain": m.get("domain", "code"),
                "Condition": (m.get("condition_text", "") or "")[:80],
                "Status": m.get("status", "active"),
                "Last check (UTC)": (m.get("last_check_at", "") or "")[:16].replace("T", " "),
            }
        )
    return pd.DataFrame(rows)


HEADER = f"""
# 🔬 LENITNES
### Scientific Software Integrity Sentinel
An autonomous agent that monitors scientific software repositories, detects
commits that may invalidate published results, scores them with a versioned
rubric, and notarizes every verdict on **Hedera HCS before the outcome is
known**.

**Live dashboard:** [{WEB_URL}]({WEB_URL}) · **Code:** [{REPO_URL}]({REPO_URL}) ·
re:AGENT hackathon · Track A: Co-Scientist
"""

ABOUT = f"""
## How it works
1. **DETECT** — monitors watch GitHub repos for meaningful commits
2. **SCORE** — LLM rubric (v6 [bio] / v5 [code]) scores severity and impact
3. **COMMIT** — every verdict is notarized on Hedera HCS before the outcome is known
4. **GRADE** — outcomes are validated against external ground truth

## Verticals
- **[code]** — crypto software repos scored against market price movement
- **[bio]** — scientific software scored against the published record (retractions / corrections)

## Sponsor integrations
- **GXL / Paperclip** — literature grounding via MCP
- **Anthropic** — Claude as the primary scoring LLM
- **Hedera HCS** — immutable notarization of every verdict
- **Modal** — GPU compute escalation for expensive claims

Every call lands in an append-only JSONL trace. The trace is the demo:
[{WEB_URL}]({WEB_URL})
"""

with gr.Blocks(title="LENITNES — Scientific Software Integrity Sentinel") as demo:
    gr.Markdown(HEADER)

    with gr.Tab("Scorecard"):
        summary_md = gr.Markdown()
        det_table = gr.Dataframe(label="By detector type", interactive=False)
        refresh_btn = gr.Button("Refresh", variant="primary")
        refresh_btn.click(fn=get_scorecard, outputs=[summary_md, det_table])

    with gr.Tab("Recent signals"):
        signals_table = gr.Dataframe(label="Latest scored signals", interactive=False)
        refresh_btn2 = gr.Button("Refresh", variant="primary")
        refresh_btn2.click(fn=get_recent_signals, outputs=[signals_table])

    with gr.Tab("Monitors"):
        monitors_table = gr.Dataframe(label="Active monitors", interactive=False)
        refresh_btn3 = gr.Button("Refresh", variant="primary")
        refresh_btn3.click(fn=get_monitors, outputs=[monitors_table])

    with gr.Tab("About"):
        gr.Markdown(ABOUT)

    demo.load(fn=get_scorecard, outputs=[summary_md, det_table])
    demo.load(fn=get_recent_signals, outputs=[signals_table])
    demo.load(fn=get_monitors, outputs=[monitors_table])

demo.launch()
