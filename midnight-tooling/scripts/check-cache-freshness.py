#!/usr/bin/env python3
"""
Check if the Midnight release notes cache is fresh (< 48 hours old).
Outputs JSON with cache status information.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

CACHE_DIR = Path.home() / ".cache" / "midnight-tooling"
METADATA_FILE = CACHE_DIR / "metadata.json"
STALENESS_HOURS = 48


def get_cache_status() -> dict:
    """Check cache freshness and return status information."""
    result = {
        "exists": False,
        "fresh": False,
        "age_hours": None,
        "last_updated": None,
        "git_commit": None,
        "cache_dir": str(CACHE_DIR),
        "message": ""
    }

    if not METADATA_FILE.exists():
        result["message"] = "Release notes cache not found. Run /midnight:sync-releases to download."
        return result

    try:
        with open(METADATA_FILE, "r") as f:
            metadata = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        result["message"] = f"Cache metadata corrupted: {e}. Run /midnight:sync-releases to fix."
        return result

    result["exists"] = True
    result["last_updated"] = metadata.get("lastUpdated")
    result["git_commit"] = metadata.get("gitCommit")

    if not result["last_updated"]:
        result["message"] = "Cache metadata missing timestamp. Run /midnight:sync-releases to fix."
        return result

    try:
        last_updated = datetime.fromisoformat(result["last_updated"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        age = now - last_updated
        result["age_hours"] = round(age.total_seconds() / 3600, 1)

        if result["age_hours"] < STALENESS_HOURS:
            result["fresh"] = True
            result["message"] = f"Cache is fresh ({result['age_hours']} hours old)"
        else:
            result["message"] = f"Cache is stale ({result['age_hours']} hours old, threshold is {STALENESS_HOURS}h). Consider running /midnight:sync-releases"

    except ValueError as e:
        result["message"] = f"Invalid timestamp format: {e}"

    return result


def main():
    status = get_cache_status()
    print(json.dumps(status, indent=2))

    # Exit code: 0 = fresh, 1 = stale/missing, 2 = error
    if status["fresh"]:
        sys.exit(0)
    elif status["exists"]:
        sys.exit(1)  # Stale but exists
    else:
        sys.exit(2)  # Missing or error


if __name__ == "__main__":
    main()
