#!/usr/bin/env python3
"""
Midnight Environment Doctor - Comprehensive diagnostic and repair tool.
Identifies issues and suggests (or applies) fixes.
"""

import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Optional


class Severity(Enum):
    OK = "ok"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class DiagnosticResult:
    name: str
    severity: Severity
    message: str
    fix_available: bool = False
    fix_description: str = ""
    fix_command: str = ""
    details: dict = None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "severity": self.severity.value,
            "message": self.message,
            "fix_available": self.fix_available,
            "fix_description": self.fix_description,
            "fix_command": self.fix_command,
            "details": self.details or {}
        }


def run_command(cmd: list, timeout: int = 30) -> tuple[int, str, str]:
    """Run a command and return (returncode, stdout, stderr)."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return -1, "", "Command timed out"
    except FileNotFoundError:
        return -1, "", "Command not found"
    except Exception as e:
        return -1, "", str(e)


def check_node() -> DiagnosticResult:
    """Check Node.js installation and version."""
    code, stdout, stderr = run_command(["node", "--version"])

    if code != 0:
        return DiagnosticResult(
            name="Node.js",
            severity=Severity.CRITICAL,
            message="Node.js is not installed",
            fix_available=True,
            fix_description="Install Node.js 18+ via nvm",
            fix_command="curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash && nvm install 18"
        )

    # Parse version
    version_match = re.match(r'v(\d+)\.(\d+)\.(\d+)', stdout)
    if not version_match:
        return DiagnosticResult(
            name="Node.js",
            severity=Severity.WARNING,
            message=f"Could not parse Node.js version: {stdout}"
        )

    major = int(version_match.group(1))
    if major < 18:
        return DiagnosticResult(
            name="Node.js",
            severity=Severity.ERROR,
            message=f"Node.js {stdout} is too old. Midnight requires Node.js 18+",
            fix_available=True,
            fix_description="Upgrade Node.js to version 18+",
            fix_command="nvm install 18 && nvm use 18",
            details={"current_version": stdout, "required": "18+"}
        )

    return DiagnosticResult(
        name="Node.js",
        severity=Severity.OK,
        message=f"Node.js {stdout} installed",
        details={"version": stdout}
    )


def check_docker() -> DiagnosticResult:
    """Check Docker installation and daemon status."""
    code, stdout, stderr = run_command(["docker", "--version"])

    if code != 0:
        return DiagnosticResult(
            name="Docker",
            severity=Severity.CRITICAL,
            message="Docker is not installed",
            fix_available=True,
            fix_description="Install Docker Desktop",
            fix_command="open https://www.docker.com/products/docker-desktop/"
        )

    # Check if Docker daemon is running
    code, _, stderr = run_command(["docker", "info"])
    if code != 0:
        return DiagnosticResult(
            name="Docker",
            severity=Severity.ERROR,
            message="Docker is installed but daemon is not running",
            fix_available=True,
            fix_description="Start Docker Desktop",
            fix_command="open -a Docker",
            details={"error": stderr[:200] if stderr else "Daemon not responding"}
        )

    return DiagnosticResult(
        name="Docker",
        severity=Severity.OK,
        message=f"Docker installed and running",
        details={"version": stdout}
    )


def check_compact_cli() -> DiagnosticResult:
    """Check Compact developer tools installation."""
    code, stdout, stderr = run_command(["compact", "--version"])

    if code != 0:
        return DiagnosticResult(
            name="Compact CLI",
            severity=Severity.CRITICAL,
            message="Compact developer tools not installed",
            fix_available=True,
            fix_description="Install Compact developer tools",
            fix_command="curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh"
        )

    return DiagnosticResult(
        name="Compact CLI",
        severity=Severity.OK,
        message=f"Compact CLI installed: {stdout}",
        details={"version": stdout}
    )


def check_compact_compiler() -> DiagnosticResult:
    """Check Compact compiler installation."""
    code, stdout, stderr = run_command(["compact", "compile", "--version"])

    if code != 0:
        # Check if CLI is installed but compiler isn't
        cli_code, _, _ = run_command(["compact", "--version"])
        if cli_code == 0:
            return DiagnosticResult(
                name="Compact Compiler",
                severity=Severity.ERROR,
                message="Compact CLI installed but compiler not downloaded",
                fix_available=True,
                fix_description="Download the latest Compact compiler",
                fix_command="compact update"
            )

        return DiagnosticResult(
            name="Compact Compiler",
            severity=Severity.CRITICAL,
            message="Compact compiler not available",
            fix_available=True,
            fix_description="Install Compact developer tools and compiler",
            fix_command="curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh && compact update"
        )

    return DiagnosticResult(
        name="Compact Compiler",
        severity=Severity.OK,
        message=f"Compact compiler: {stdout}",
        details={"version": stdout}
    )


def check_proof_server_image() -> DiagnosticResult:
    """Check if proof server Docker image is available."""
    code, stdout, stderr = run_command([
        "docker", "images", "--format", "{{.Repository}}:{{.Tag}}",
        "midnightnetwork/proof-server"
    ])

    if code != 0 or not stdout:
        return DiagnosticResult(
            name="Proof Server Image",
            severity=Severity.WARNING,
            message="Proof server Docker image not pulled",
            fix_available=True,
            fix_description="Pull the proof server image",
            fix_command="docker pull midnightnetwork/proof-server:latest"
        )

    return DiagnosticResult(
        name="Proof Server Image",
        severity=Severity.OK,
        message=f"Proof server image available: {stdout.split()[0] if stdout else 'unknown'}",
        details={"images": stdout.split('\n') if stdout else []}
    )


def check_proof_server_running() -> DiagnosticResult:
    """Check if proof server is currently running."""
    code, stdout, stderr = run_command([
        "docker", "ps", "--filter", "ancestor=midnightnetwork/proof-server",
        "--format", "{{.Status}}"
    ])

    if code != 0:
        return DiagnosticResult(
            name="Proof Server Status",
            severity=Severity.INFO,
            message="Could not check proof server status (Docker not available?)"
        )

    if not stdout:
        return DiagnosticResult(
            name="Proof Server Status",
            severity=Severity.INFO,
            message="Proof server is not running (start when needed)",
            fix_available=True,
            fix_description="Start the proof server",
            fix_command="docker run -p 6300:6300 midnightnetwork/proof-server -- midnight-proof-server --network testnet"
        )

    return DiagnosticResult(
        name="Proof Server Status",
        severity=Severity.OK,
        message=f"Proof server running: {stdout}",
        details={"status": stdout}
    )


def check_path_contains_compact() -> DiagnosticResult:
    """Check if compact is properly in PATH."""
    compact_path = shutil.which("compact")

    if not compact_path:
        # Check common installation locations
        home = Path.home()
        possible_paths = [
            home / ".compact" / "bin",
            home / ".local" / "bin",
            Path("/usr/local/bin"),
        ]

        found_at = None
        for p in possible_paths:
            if (p / "compact").exists():
                found_at = p
                break

        if found_at:
            return DiagnosticResult(
                name="PATH Configuration",
                severity=Severity.ERROR,
                message=f"Compact found at {found_at} but not in PATH",
                fix_available=True,
                fix_description=f"Add {found_at} to your PATH",
                fix_command=f'echo \'export PATH="{found_at}:$PATH"\' >> ~/.zshrc && source ~/.zshrc',
                details={"found_at": str(found_at)}
            )

        return DiagnosticResult(
            name="PATH Configuration",
            severity=Severity.INFO,
            message="Compact not found in PATH (install first)"
        )

    return DiagnosticResult(
        name="PATH Configuration",
        severity=Severity.OK,
        message=f"Compact in PATH at {compact_path}",
        details={"path": compact_path}
    )


def check_release_notes_cache() -> DiagnosticResult:
    """Check release notes cache freshness."""
    cache_dir = Path.home() / ".cache" / "midnight-tooling"
    metadata_file = cache_dir / "metadata.json"

    if not metadata_file.exists():
        return DiagnosticResult(
            name="Release Notes Cache",
            severity=Severity.WARNING,
            message="Release notes not cached (version checking unavailable)",
            fix_available=True,
            fix_description="Download release notes cache",
            fix_command="Run /midnight:sync-releases"
        )

    try:
        import json
        from datetime import datetime, timezone

        with open(metadata_file) as f:
            metadata = json.load(f)

        last_updated = datetime.fromisoformat(metadata["lastUpdated"].replace("Z", "+00:00"))
        age_hours = (datetime.now(timezone.utc) - last_updated).total_seconds() / 3600

        if age_hours > 48:
            return DiagnosticResult(
                name="Release Notes Cache",
                severity=Severity.WARNING,
                message=f"Release notes cache is {age_hours:.0f} hours old",
                fix_available=True,
                fix_description="Update release notes cache",
                fix_command="Run /midnight:sync-releases",
                details={"age_hours": age_hours, "last_updated": metadata["lastUpdated"]}
            )

        return DiagnosticResult(
            name="Release Notes Cache",
            severity=Severity.OK,
            message=f"Release notes cached ({age_hours:.0f}h ago)",
            details={"age_hours": age_hours, "last_updated": metadata["lastUpdated"]}
        )

    except Exception as e:
        return DiagnosticResult(
            name="Release Notes Cache",
            severity=Severity.WARNING,
            message=f"Could not read cache metadata: {e}"
        )


def run_all_diagnostics() -> list[DiagnosticResult]:
    """Run all diagnostic checks."""
    checks = [
        check_node,
        check_docker,
        check_compact_cli,
        check_compact_compiler,
        check_path_contains_compact,
        check_proof_server_image,
        check_proof_server_running,
        check_release_notes_cache,
    ]

    results = []
    for check in checks:
        try:
            results.append(check())
        except Exception as e:
            results.append(DiagnosticResult(
                name=check.__name__,
                severity=Severity.ERROR,
                message=f"Check failed with error: {e}"
            ))

    return results


def main():
    results = run_all_diagnostics()

    # Categorize results
    critical = [r for r in results if r.severity == Severity.CRITICAL]
    errors = [r for r in results if r.severity == Severity.ERROR]
    warnings = [r for r in results if r.severity == Severity.WARNING]
    ok = [r for r in results if r.severity == Severity.OK]

    output = {
        "summary": {
            "critical": len(critical),
            "errors": len(errors),
            "warnings": len(warnings),
            "ok": len(ok),
            "total": len(results)
        },
        "results": [r.to_dict() for r in results],
        "fixes_available": [r.to_dict() for r in results if r.fix_available]
    }

    print(json.dumps(output, indent=2))

    # Exit code based on severity
    if critical:
        sys.exit(3)
    elif errors:
        sys.exit(2)
    elif warnings:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
