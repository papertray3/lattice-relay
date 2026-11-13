# Publishing Guide

This document explains how to publish the Obsidian MCP Bridge for community use.

## Repository Structure ✅

**Current structure is CORRECT and follows best practices:**

```
obsidian-mcp-bridge/
├── plugin/              # Obsidian plugin (for Community Plugins)
├── mcp-server/          # Python MCP server (for PyPI/pip)
├── docs/                # Documentation
├── LICENSE              # MIT License
├── CONTRIBUTING.md      # Contribution guidelines
├── CHANGELOG.md         # Version history
└── README.md            # Main documentation
```

**Why this works:**
- ✅ Single source of truth (both components in sync)
- ✅ Easier for users (one clone, get everything)
- ✅ Better versioning (coordinated releases)
- ✅ Industry standard (GitHub MCP, Docker MCP use this pattern)

---

## Two Distribution Channels

### 1. Obsidian Plugin (Community Plugins)

**What gets submitted:** Only the `plugin/` directory

**Process:**
1. Build the release:
   ```bash
   cd plugin
   npm run build
   ```

2. Create GitHub release:
   - Tag: `v0.1.0`
   - Attach: `main.js`, `manifest.json`, `styles.css` (if exists)

3. Submit to Obsidian Community Plugins:
   - Fork [obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
   - Add to `community-plugins.json`
   - Create PR with:
     - Plugin manifest
     - Screenshots
     - Description
     - Link to GitHub repo

**Requirements:**
- Minimum 20 GitHub stars (community interest)
- Working demo/screenshots
- Clear documentation
- No security issues
- Follows Obsidian guidelines

**Update manifest.json before submitting:**
```json
{
  "id": "obsidian-mcp-bridge",
  "name": "MCP Bridge",
  "version": "0.1.0",
  "author": "papertray3",
  "authorUrl": "https://github.com/papertray3/obsidian-mcp-bridge"
}
```

✅ **Already done!**

---

### 2. Python MCP Server (PyPI)

**What gets published:** The `mcp-server/` directory as a Python package

**Option A: Via pip (Recommended)**

Create `mcp-server/setup.py`:
```python
from setuptools import setup

setup(
    name="obsidian-mcp-bridge",
    version="0.1.0",
    description="MCP server for Obsidian MCP Bridge plugin",
    py_modules=["obsidian_mcp_server"],
    install_requires=[
        "mcp>=0.9.0",
        "websockets>=12.0",
    ],
    entry_points={
        "console_scripts": [
            "obsidian-mcp-server=obsidian_mcp_server:main",
        ],
    },
)
```

Publish:
```bash
cd mcp-server
python setup.py sdist
pip install twine
twine upload dist/*
```

Users install:
```bash
pip install obsidian-mcp-bridge
```

**Option B: Direct from GitHub (Easier for now)**

Users install:
```bash
git clone https://github.com/papertray3/obsidian-mcp-bridge
cd obsidian-mcp-bridge/mcp-server
pip install -r requirements.txt
```

---

## Pre-Publishing Checklist

### Code Quality
- [ ] All features working (Phase 1 complete ✅)
- [ ] No console errors
- [ ] Clean code, comments added
- [ ] Error handling in place

### Documentation
- [ ] README.md complete with:
  - [ ] Clear description
  - [ ] Installation instructions
  - [ ] Usage examples
  - [ ] Screenshots/GIFs
  - [ ] Troubleshooting section
- [ ] CONTRIBUTING.md exists ✅
- [ ] CHANGELOG.md exists ✅
- [ ] LICENSE exists ✅
- [ ] API documentation in docs/

### Legal/Admin
- [ ] Update `author` in manifest.json
- [ ] Update `authorUrl` in manifest.json
- [ ] Add your name to LICENSE
- [ ] Choose GitHub username for URLs
- [ ] Create GitHub repository

### Testing
- [ ] Test on clean Obsidian install
- [ ] Test with multiple AI clients
- [ ] Test error scenarios
- [ ] Get beta testers

---

## Current Status: Phase 1 Complete

**Ready for:**
- ✅ Personal use
- ✅ Beta testing with friends
- ✅ GitHub repository (make it public)
- ✅ Early adopters

**Not yet ready for:**
- ❌ Obsidian Community Plugins (need Phase 2-3)
- ❌ PyPI (wait for stable API)
- ❌ Mass distribution

**Recommended path:**

1. **Now:** Make GitHub repo public
   - Get early feedback
   - Build community interest
   - Iterate on features

2. **After Phase 2:** Submit to Community Plugins
   - More features = more value
   - Better chance of acceptance
   - More polished experience

3. **After Phase 3-4:** Publish to PyPI
   - Stable API
   - Production-ready
   - Full documentation

---

## Making Repository Public

### Step 1: Update Personal Info

Replace these in all files:
- `"Your Name"` → Your actual name
- ✅ `"yourusername"` → `papertray3` (Done!)
- ✅ GitHub URL → `https://github.com/papertray3/obsidian-mcp-bridge` (Done!)

**Files to update:**
- `plugin/manifest.json`
- `plugin/package.json`
- `LICENSE`
- `README.md`
- `CONTRIBUTING.md`

### Step 2: Create GitHub Repo

```bash
# On GitHub: Create new repository "obsidian-mcp-bridge"

# In your local repo:
cd C:\Users\<user>\Source\Repos\obsidian-mcp-bridge
git remote add origin https://github.com/papertray3/obsidian-mcp-bridge.git
git branch -M main
git push -u origin main
```

### Step 3: Add README Badges (Optional but nice)

```markdown
# Obsidian MCP Bridge

![GitHub release](https://img.shields.io/github/v/release/papertray3/obsidian-mcp-bridge)
![GitHub stars](https://img.shields.io/github/stars/papertray3/obsidian-mcp-bridge)
![License](https://img.shields.io/github/license/papertray3/obsidian-mcp-bridge)
```

### Step 4: Add Topics on GitHub

Add these topics to help discovery:
- `obsidian`
- `obsidian-plugin`
- `mcp`
- `model-context-protocol`
- `ai`
- `dataview`
- `websocket`

---

## Community Building

### Getting Stars (for Community Plugins requirement)

1. **Share on Obsidian Discord**
   - #plugin-dev channel
   - Show demo/screenshots
   - Ask for beta testers

2. **Reddit:**
   - r/ObsidianMD
   - Post "I made a plugin" with demo

3. **Obsidian Forum:**
   - Share in Plugins category
   - Explain use case

4. **Twitter/X:**
   - Tag #ObsidianMD
   - Show cool examples

### Beta Testing

Create a `BETA.md` file:
```markdown
# Beta Testing

This plugin is in active development. Looking for beta testers!

## What Works
- [x] WebSocket bridge
- [x] Dataview rendering
- [x] Basic tools

## What's Coming
- [ ] Plugin discovery
- [ ] Dataview queries
- [ ] Search

## How to Beta Test
1. Install from GitHub
2. Test with your AI client
3. Report issues
4. Share feedback
```

---

## Example Timeline

**Week 1-2 (NOW):**
- ✅ Phase 1 complete
- Commit and push to GitHub
- Make repo public
- Get 5-10 beta testers

**Week 3-4:**
- Phase 2 implementation
- More features = more value
- Build to 20+ stars

**Week 5-6:**
- Phase 3 (plugin ecosystem)
- Polish documentation
- Create demo videos

**Week 7+:**
- Submit to Community Plugins
- Publish to PyPI
- Announce widely

---

## Resources

**Obsidian Plugin Docs:**
- https://docs.obsidian.md/Plugins/Getting+started
- https://github.com/obsidianmd/obsidian-releases

**MCP Docs:**
- https://spec.modelcontextprotocol.io/

**Community:**
- Obsidian Discord: https://discord.gg/obsidianmd
- Obsidian Forum: https://forum.obsidian.md/

---

## Questions?

Create an issue or discussion on GitHub once published!

---

## Summary: You're on the Right Track! ✅

Your repository structure is **perfect** for community publishing. The dual-component approach (plugin + MCP server in one repo) is exactly what the community expects and follows best practices.

**Next steps:**
1. Update personal info in files
2. Create public GitHub repo
3. Continue to Phase 2
4. Build community interest
5. Submit to Community Plugins when ready
