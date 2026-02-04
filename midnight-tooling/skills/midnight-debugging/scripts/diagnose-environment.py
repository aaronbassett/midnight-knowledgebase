#!/usr/bin/env python3
"""
Quick environment diagnostic for common Midnight issues.
Wrapper around the main doctor.py that focuses on problem identification.
"""

import subprocess
import sys
from pathlib import Path

# Import the main doctor script
PLUGIN_ROOT = Path(__file__).parent.parent.parent.parent
DOCTOR_SCRIPT = PLUGIN_ROOT / "scripts" / "doctor.py"


def main():
    """Run the main doctor script and format output for debugging context."""
    if not DOCTOR_SCRIPT.exists():
        print(f"Error: doctor.py not found at {DOCTOR_SCRIPT}")
        sys.exit(1)

    result = subprocess.run(
        [sys.executable, str(DOCTOR_SCRIPT)],
        capture_output=True,
        text=True
    )

    # Pass through the output
    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)

    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
