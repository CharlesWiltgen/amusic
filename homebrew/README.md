# Homebrew Tap Setup

This directory contains the template for the Homebrew formula that will be
automatically updated when new releases are created.

## Setup Instructions

To enable Homebrew distribution for amusic:

1. **Create a Homebrew Tap Repository**

   Create a new repository named `homebrew-tap` in your GitHub account:
   ```bash
   gh repo create homebrew-tap --public --description "Homebrew tap for amusic"
   ```

2. **Initialize the Tap Repository**

   Clone and set up the basic structure:
   ```bash
   git clone https://github.com/YOUR_USERNAME/homebrew-tap
   cd homebrew-tap
   mkdir -p Formula
   echo "# Homebrew Tap for amusic" > README.md
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

3. **Create a Personal Access Token**

   The GitHub Actions workflow needs permission to create pull requests in your
   tap repository:

   - Go to GitHub Settings → Developer settings → Personal access tokens →
     Tokens (classic)
   - Create a new token with `repo` scope
   - Name it something like "HOMEBREW_TAP_TOKEN"
   - Copy the token value

4. **Add the Token to Repository Secrets**

   In your amusic repository:
   - Go to Settings → Secrets and variables → Actions
   - Create a new repository secret named `HOMEBREW_TAP_TOKEN`
   - Paste the token value

## How It Works

When you create a new release:

1. The `release.yml` workflow builds binaries for all platforms
2. The `homebrew-update.yml` workflow:
   - Downloads the release artifacts and checksums
   - Generates a Homebrew formula from the template
   - Creates a pull request to your homebrew-tap repository
   - You can then review and merge the PR to publish the update

## Manual Formula Generation

If needed, you can manually generate the formula:

```bash
# Set variables
GITHUB_OWNER="your-username"
VERSION="0.5.0"
SHA256_MACOS_ARM64="abc123..."
SHA256_MACOS_X86_64="def456..."
SHA256_LINUX_X86_64="ghi789..."

# Generate formula
sed -e "s/{{GITHUB_OWNER}}/$GITHUB_OWNER/g" \
    -e "s/{{VERSION}}/$VERSION/g" \
    -e "s/{{SHA256_MACOS_ARM64}}/$SHA256_MACOS_ARM64/g" \
    -e "s/{{SHA256_MACOS_X86_64}}/$SHA256_MACOS_X86_64/g" \
    -e "s/{{SHA256_LINUX_X86_64}}/$SHA256_LINUX_X86_64/g" \
    amusic.rb.template > amusic.rb
```
