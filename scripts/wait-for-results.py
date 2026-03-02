#!/usr/bin/env python3
"""
wait-for-results.py — Polls blackbox/builds/{build_token}/final_test_results/
until the directory appears (test agent finished) or timeout is reached.

Exit codes:
  0  — final_test_results/ found (test cycle complete)
  1  — timeout expired without results appearing

Usage:
  python3 scripts/wait-for-results.py --build-token <token> [--timeout 600] [--interval 30]
"""

import argparse
import sys
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Wait for test agent to finish a build cycle.")
    parser.add_argument("--build-token", required=True, help="Build token (subdirectory under blackbox/builds/)")
    parser.add_argument("--timeout", type=int, default=600, help="Max seconds to wait (default: 600)")
    parser.add_argument("--interval", type=int, default=30, help="Seconds between status prints (default: 30)")
    args = parser.parse_args()

    builds_dir = Path("blackbox/builds")
    build_dir = builds_dir / args.build_token
    manifest = build_dir / "manifest.json"
    final_results_dir = build_dir / "final_test_results"

    if not manifest.exists():
        print(f"ERROR: manifest.json not found at {manifest}", file=sys.stderr)
        print("Has the build agent written the manifest yet?", file=sys.stderr)
        sys.exit(1)

    print(f"Waiting for test results in {final_results_dir} ...")
    print(f"Timeout: {args.timeout}s | Poll interval: {args.interval}s")
    print()

    elapsed = 0
    while elapsed < args.timeout:
        if final_results_dir.exists():
            results_file = final_results_dir / "results.json"
            print(f"\n✓ final_test_results/ found after {elapsed}s.")
            if results_file.exists():
                print(f"  Results at: {results_file}")
            else:
                print("  WARNING: directory exists but results.json is missing — test agent may have crashed.")
            sys.exit(0)

        # Show streaming progress if test_results.json is present
        streaming = build_dir / "test_results.json"
        if streaming.exists():
            try:
                import json
                data = json.loads(streaming.read_text())
                total = 0
                done = 0
                for app_key, app_data in data.items():
                    if app_key == "_meta":
                        continue
                    for feature_data in app_data.values():
                        for scenario in feature_data.get("scenarios", {}).values():
                            total += 1
                            if scenario.get("status") not in ("UNTESTED", None):
                                done += 1
                pct = int(done / total * 100) if total else 0
                print(f"  [{elapsed:>4}s] Progress: {done}/{total} scenarios ({pct}%)")
            except Exception:
                print(f"  [{elapsed:>4}s] Waiting ... (test_results.json unreadable)")
        else:
            print(f"  [{elapsed:>4}s] Waiting ... (test agent has not started writing results yet)")

        time.sleep(args.interval)
        elapsed += args.interval

    print(f"\nTIMEOUT: No results after {args.timeout}s.", file=sys.stderr)
    print("Check the webapp-blueprint-test session for errors.", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
