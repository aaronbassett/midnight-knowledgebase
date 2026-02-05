# Detailed Installation Steps

Platform-specific installation guidance for Midnight development tools.

## macOS

### Prerequisites

```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Git
brew install git

# Install nvm for Node.js management
brew install nvm
mkdir ~/.nvm

# Add to ~/.zshrc
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
```

### Docker Desktop

1. Download from https://www.docker.com/products/docker-desktop/
2. Open the `.dmg` file
3. Drag Docker to Applications
4. Launch Docker from Applications
5. Grant required permissions when prompted

### Compact Developer Tools

```bash
# Install
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh

# Add to PATH in ~/.zshrc
export PATH="$HOME/.compact/bin:$PATH"

# Restart terminal, then install compiler
compact update
```

## Linux (Ubuntu/Debian)

### Prerequisites

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install essentials
sudo apt install -y curl git build-essential

# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal or source
source ~/.bashrc

# Install Node.js
nvm install 18 --lts
nvm alias default 18
```

### Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add current user to docker group (avoid sudo)
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
# Then verify
docker run hello-world
```

### Compact Developer Tools

```bash
# Install
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh

# Add to PATH in ~/.bashrc
export PATH="$HOME/.compact/bin:$PATH"

# Restart terminal, then install compiler
compact update
```

## Windows (via WSL2)

### Enable WSL2

```powershell
# In PowerShell as Administrator
wsl --install

# Restart computer, then set up Ubuntu
wsl --install -d Ubuntu
```

### Inside WSL2 Ubuntu

Follow the Linux (Ubuntu/Debian) instructions above.

### Docker Desktop with WSL2 Backend

1. Download Docker Desktop for Windows
2. During setup, enable "Use WSL 2 based engine"
3. In Docker Desktop Settings → Resources → WSL Integration
4. Enable integration with your Ubuntu distribution

## Version Management

### Switching Compact Compiler Versions

```bash
# List available versions
compact list

# List installed versions
compact list --installed

# Switch to specific version
compact update 0.25.0

# Use specific version for one compilation
compact compile +0.25.0 src/contract.compact build/
```

### Switching Node.js Versions

```bash
# List installed versions
nvm list

# Install specific version
nvm install 20

# Switch versions
nvm use 18
nvm use 20

# Set default
nvm alias default 20
```

## Proof Server Options

### Basic Usage

```bash
# Start for testnet
docker run -p 6300:6300 midnightnetwork/proof-server -- midnight-proof-server --network testnet

# Run in background
docker run -d -p 6300:6300 --name midnight-prover midnightnetwork/proof-server -- midnight-proof-server --network testnet

# Stop background container
docker stop midnight-prover

# Remove container
docker rm midnight-prover
```

### Linux Systemd Service

Create `/etc/systemd/system/midnight-proof-server.service`:

```ini
[Unit]
Description=Midnight Proof Server
Requires=docker.service
After=docker.service

[Service]
Restart=always
ExecStart=/usr/bin/docker run --rm -p 6300:6300 midnightnetwork/proof-server -- midnight-proof-server --network testnet
ExecStop=/usr/bin/docker stop -t 10 midnight-prover

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable midnight-proof-server
sudo systemctl start midnight-proof-server
```

## Troubleshooting Installation

### Compact installer fails

```bash
# Check if curl and shell are working
curl --version
bash --version

# Try with explicit bash
bash -c "$(curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh)"
```

### Docker permission denied

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in
# Or use newgrp (temporary)
newgrp docker
```

### nvm not found after install

```bash
# Ensure these lines are in ~/.bashrc or ~/.zshrc
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Then source
source ~/.bashrc  # or ~/.zshrc
```
