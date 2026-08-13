"""
runner.py — Mode-dispatched Python agent runner.

Invoked by the Node.js PythonSubprocessAdapter:
  python runner.py --mode <agentId> --inputs <json> --output-dir <absPath>

Emits newline-delimited JSON events to stdout that the adapter relays as SSE:
  {"type": "status",  "data": "started"}
  {"type": "log",     "data": "Agent thinking..."}
  {"type": "result",  "data": {...}}
  {"type": "warning", "data": "Expected file not found: ..."}
  {"type": "error",   "data": "...message..."}
  {"type": "status",  "data": "completed"}

stderr is captured by Node as additional log events and is NOT parsed as JSON.

Each mode section:
  - Adds the agent's working directory to sys.path so relative imports work.
  - Bypasses the original main.py (none of the 5 agents accept dynamic input via main.py).
  - Calls crew.kickoff(inputs=...) or the appropriate function directly.
  - After kickoff, moves output_file artifacts to --output-dir using shutil.move.
  - Emits {"type": "result", "data": {...}} before {"type": "status", "data": "completed"}.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import shutil
import sys
from datetime import datetime
from typing import Any

# Force UTF-8 on stdout/stderr — CrewAI emits box-drawing and emoji characters
# that the default Windows 'charmap' codec cannot encode, causing EventBus errors.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def emit(event_type: str, data: Any) -> None:
    """Write a JSON-line event to stdout and flush immediately."""
    print(json.dumps({"type": event_type, "data": data}), flush=True)


def move_output_files(
    cwd: str,
    relative_paths: list[str],
    output_dir: str,
) -> dict[str, str]:
    """
    Move each expected output file from <cwd>/<relative_path> to <output_dir>/<basename>.
    Returns a mapping of basename → absolute destination path.
    Emits a warning (not an error) for any file that is absent.
    """
    os.makedirs(output_dir, exist_ok=True)
    moved: dict[str, str] = {}
    for rel in relative_paths:
        src = os.path.join(cwd, rel)
        if os.path.exists(src):
            dst = os.path.join(output_dir, os.path.basename(rel))
            shutil.move(src, dst)
            moved[os.path.basename(rel)] = dst
        else:
            emit("warning", f"Expected output file not found: {src}")
    return moved


def move_glob_output_files(
    cwd: str,
    pattern: str,
    output_dir: str,
) -> dict[str, str]:
    """Move files matching a glob pattern inside cwd to output_dir."""
    os.makedirs(output_dir, exist_ok=True)
    moved: dict[str, str] = {}
    for src in glob.glob(os.path.join(cwd, pattern)):
        dst = os.path.join(output_dir, os.path.basename(src))
        shutil.move(src, dst)
        moved[os.path.basename(src)] = dst
    return moved


# ---------------------------------------------------------------------------
# Mode: hate-speech-detector
#
# Source: D:/Javed/outskill/outskill/agents/beginner/
# Entrypoint: main.py hardcodes text — bypassed.
# Invocation: import agents + tasks, rebuild crew, kickoff with dynamic text.
# Output: crew.kickoff() returns a CrewOutput; .raw is the text answer.
#         Printed to stdout as result event. No output files.
# ---------------------------------------------------------------------------

def run_hate_speech_detector(inputs: dict[str, Any], output_dir: str) -> None:
    text = inputs.get("text", "")
    if not text:
        raise ValueError("Input 'text' is required and must not be empty.")

    emit("log", "Loading Hate Speech Detector crew...")

    from crewai import Crew  # noqa: PLC0415
    from agents import hate_speech_detector  # noqa: PLC0415
    from tasks import hate_speech_detection_task  # noqa: PLC0415

    crew = Crew(
        agents=[hate_speech_detector],
        tasks=[hate_speech_detection_task],
        verbose=True,
    )
    emit("log", "Crew assembled. Running kickoff...")
    result = crew.kickoff(inputs={"text": text})

    answer = result.raw if hasattr(result, "raw") else str(result)
    emit("result", {"answer": answer, "text": text})


# ---------------------------------------------------------------------------
# Mode: devops-log-analyzer
#
# Source: D:/Javed/outskill/outskill/agents/intermediate/v2/
# Entrypoint: main.py hardcodes log_file_path — bypassed.
# Invocation: import agents + tasks, rebuild crew, kickoff with dynamic path.
# Output: 3 fixed-filename files in task_outputs/ → moved to output_dir.
# ---------------------------------------------------------------------------

def run_devops_log_analyzer(inputs: dict[str, Any], output_dir: str, cwd: str) -> None:
    log_file_path = inputs.get("log_file_path", "")
    if not log_file_path:
        raise ValueError("Input 'log_file_path' is required.")

    emit("log", "Loading DevOps Log Analyzer crew...")

    from crewai import Crew, Process  # noqa: PLC0415
    from agents import issue_investigator, log_analyzer, solution_specialist  # noqa: PLC0415
    from tasks import analyze_logs_task, investigate_issue_task, provide_solution_task  # noqa: PLC0415

    crew = Crew(
        agents=[log_analyzer, issue_investigator, solution_specialist],
        tasks=[analyze_logs_task, investigate_issue_task, provide_solution_task],
        verbose=True,
        process=Process.sequential,
    )
    emit("log", "Crew assembled. Running kickoff...")
    crew.kickoff(inputs={"log_file_path": log_file_path})

    # Move output files to per-execution directory
    output_files = [
        "task_outputs/log_analysis.md",
        "task_outputs/investigation_report.md",
        "task_outputs/solution_plan.md",
    ]
    moved = move_output_files(cwd, output_files, output_dir)
    emit("result", {"files": moved})


# ---------------------------------------------------------------------------
# Mode: stock-analyst
#
# Source: D:/Javed/outskill/outskill/agents/advanced/v2/
# Entrypoint: main.py hardcodes watchlist and runs async — bypassed.
# Invocation: import build_single_stock_crew from main, run single-stock kickoff.
# Output: Pydantic InvestmentRecommendation + 2 output files → moved to output_dir.
# ---------------------------------------------------------------------------

def run_stock_analyst(inputs: dict[str, Any], output_dir: str, cwd: str) -> None:
    stock = inputs.get("stock", "").strip().upper()
    if not stock:
        raise ValueError("Input 'stock' is required (e.g. AAPL, TSLA).")

    emit("log", f"Loading Financial Stock Analyst crew for {stock}...")

    # build_single_stock_crew is defined in main.py of the advanced/v2 agent
    from main import build_single_stock_crew  # noqa: PLC0415

    crew = build_single_stock_crew()
    emit("log", "Crew assembled. Running kickoff (this may take several minutes)...")
    result = crew.kickoff(inputs={"stock": stock})

    # Serialize Pydantic result
    result_data: dict[str, Any] = {"stock": stock}
    if result.pydantic is not None:
        result_data["recommendation"] = result.pydantic.model_dump()
    else:
        result_data["raw"] = result.raw

    # Move output files to per-execution directory
    output_files = [
        "task_outputs/financial_analysis.md",
        "task_outputs/investment_recommendation.md",
    ]
    moved = move_output_files(cwd, output_files, output_dir)
    result_data["files"] = moved
    emit("result", result_data)


# ---------------------------------------------------------------------------
# Mode: podcaster-crew
#
# Source: D:/Javed/outskill/podcaster_crew/
# Entrypoint: src/podcaster/main.py run() hardcodes topic — bypassed.
# Invocation: import Podcaster class, call .crew().kickoff() directly.
# Output: timestamped files in outputs/ — globbed and moved to output_dir.
# Note: podcaster_crew has no .env; GEMINI_API_KEY + SERPER_API_KEY injected
#       by gateway via spawn env.
# ---------------------------------------------------------------------------

def run_podcaster_crew(inputs: dict[str, Any], output_dir: str, cwd: str) -> None:
    topic = inputs.get("topic", "AI LLMs").strip()
    if not topic:
        topic = "AI LLMs"

    emit("log", f"Loading Podcaster Crew for topic: '{topic}'...")

    # Add src/ to path so `podcaster` package is importable
    src_path = os.path.join(cwd, "src")
    if src_path not in sys.path:
        sys.path.insert(0, src_path)

    from podcaster.crew import Podcaster  # noqa: PLC0415

    os.makedirs(os.path.join(cwd, "outputs"), exist_ok=True)
    crew_instance = Podcaster().crew()
    emit("log", "Crew assembled. Running kickoff (research + scripting may take several minutes)...")

    result = crew_instance.kickoff(inputs={
        "topic": topic,
        "current_month": str(datetime.now().month),
        "current_year": str(datetime.now().year),
    })

    # Glob for timestamped output files created during this run
    moved = move_glob_output_files(cwd, "outputs/*.md", output_dir)
    emit("result", {"topic": topic, "raw": result.raw if hasattr(result, "raw") else str(result), "files": moved})


# ---------------------------------------------------------------------------
# Mode: myntra-rag (Phase 2 — not exercised in Phase 1 testing)
#
# Source: D:/Javed/outskill/outskill/rags/myntra_rag/
# Entrypoint: myntra_rag.py main() is an interactive REPL — bypassed entirely.
# Invocation: import MyntraRAG + Config, call .query(question, model) directly.
# Output: dict with "answer", "model", "num_sources" → emitted as result.
# ---------------------------------------------------------------------------

def run_myntra_rag(inputs: dict[str, Any], output_dir: str, cwd: str) -> None:
    query = inputs.get("query", "").strip()
    model = inputs.get("model", "gpt-3.5-turbo").strip()
    if not query:
        raise ValueError("Input 'query' is required.")

    emit("log", f"Initializing Myntra RAG with model '{model}'...")

    from myntra_rag import Config, MyntraRAG  # noqa: PLC0415

    config = Config(
        csv_file_path="Myntra_300_prod_catalogue.csv",
        vector_store_path="myntra_vector_store",
        default_model=model,
    )
    rag = MyntraRAG(config)

    # Load or build vector store
    import pathlib  # noqa: PLC0415
    if pathlib.Path(config.vector_store_path).exists():
        emit("log", "Vector store found — loading...")
        rag.vector_store = rag.load_vector_store()
    else:
        emit("log", "Vector store not found — ingesting data (first-run, may take a while)...")
        rag.ingest_data()

    emit("log", f"Querying: {query}")
    result = rag.query(query, model=model, verbose=False)
    emit("result", {
        "question": result["question"],
        "answer": result["answer"],
        "model": result["model"],
        "num_sources": result["num_sources"],
    })


# ---------------------------------------------------------------------------
# Main dispatcher
# ---------------------------------------------------------------------------

SUPPORTED_MODES = {
    "hate-speech-detector",
    "devops-log-analyzer",
    "stock-analyst",
    "podcaster-crew",
    "myntra-rag",
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Agent gateway runner — mode-dispatched")
    parser.add_argument("--mode", required=True, choices=sorted(SUPPORTED_MODES))
    parser.add_argument("--inputs", required=True, help="JSON string of input parameters")
    parser.add_argument("--output-dir", required=True, dest="output_dir",
                        help="Absolute path to per-execution output directory")
    args = parser.parse_args()

    try:
        inputs: dict[str, Any] = json.loads(args.inputs)
    except json.JSONDecodeError as exc:
        emit("error", f"Failed to parse --inputs as JSON: {exc}")
        sys.exit(1)

    cwd = os.getcwd()
    output_dir: str = args.output_dir

    emit("status", "started")

    try:
        if args.mode == "hate-speech-detector":
            run_hate_speech_detector(inputs, output_dir)

        elif args.mode == "devops-log-analyzer":
            run_devops_log_analyzer(inputs, output_dir, cwd)

        elif args.mode == "stock-analyst":
            run_stock_analyst(inputs, output_dir, cwd)

        elif args.mode == "podcaster-crew":
            run_podcaster_crew(inputs, output_dir, cwd)

        elif args.mode == "myntra-rag":
            run_myntra_rag(inputs, output_dir, cwd)

        emit("status", "completed")

    except Exception as exc:  # noqa: BLE001
        emit("error", str(exc))
        emit("status", "failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
