# Docker Optimizer

A Claude Code skill for analyzing and optimizing Dockerfiles for faster builds and smaller images.

## Installation

### As a Claude Code Skill

```bash
# Clone to your Claude skills directory
git clone https://github.com/wrsmith108/claude-skill-docker-optimizer.git ~/.claude/skills/docker-optimizer
```

### Standalone Usage

```bash
npx tsx scripts/index.ts [dockerfile-path] [options]
```

## Trigger Phrases

This skill activates when you mention:
- "slow docker build"
- "optimize Dockerfile"
- "layer caching"
- "reduce image size"
- "docker build taking too long"
- "docker optimization"
- "dockerfile performance"
- "image too large"

## Capabilities

1. **Layer Order Analysis** - Detects inefficient layer ordering that breaks cache
2. **Multi-stage Build Detection** - Identifies opportunities for multi-stage builds
3. **Base Image Optimization** - Recommends slim/alpine variants
4. **Production Dependencies** - Ensures dev dependencies are excluded
5. **Package Manager Cleanup** - Verifies apt-get/apk cleanup
6. **Build Time Estimation** - Estimates time savings from optimizations
7. **Image Size Estimation** - Estimates size reduction from optimizations

## Usage

```bash
# Analyze Dockerfile in current directory
npx tsx scripts/index.ts

# Analyze specific Dockerfile
npx tsx scripts/index.ts /path/to/Dockerfile

# JSON output for programmatic use
npx tsx scripts/index.ts --json
```

## Optimization Checks

| Check | Description | Impact |
|-------|-------------|--------|
| Layer order | COPY source after npm install | High |
| Multi-stage build | Separate build and runtime stages | High |
| Slim base image | Use node:X-slim or alpine | Medium |
| Production deps | --production flag on npm ci | Medium |
| Package cleanup | apt-get clean after install | Medium |
| .dockerignore | Exclude node_modules, .git | Medium |
| WORKDIR usage | Explicit WORKDIR instead of cd | Low |
| Non-root user | Run as non-root for security | Low |

## Output Example

```markdown
## Dockerfile Analysis

### Issues Found

#### 1. Layer order (Line 5)
**Current:**
```dockerfile
COPY . .
RUN npm install
```

**Fix:** Copy package*.json first, then npm install, then copy source

**Impact:** High - enables npm install layer caching

---

### Summary

| Metric | Current | Optimized |
|--------|---------|-----------|
| Build time | ~5 min | ~1 min |
| Image size | ~1.2GB | ~400MB |
| Cache hit rate | Low | High |
```

## Before/After Example

### Before Optimization

```dockerfile
FROM node:22
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]
```

### After Optimization

```dockerfile
# Build stage
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build

# Production stage
FROM node:22-slim AS production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER node
CMD ["node", "dist/server.js"]
```

## Requirements

- Node.js 18+
- TypeScript (tsx for execution)

## Changelog

### 1.0.1 (2026-02-10)

- **Fixed**: Replaced hardcoded `~/.claude/skills/` paths with relative paths for portability across different install locations

## License

MIT

## Related Skills

- [ci-doctor](https://github.com/wrsmith108/claude-skill-ci-doctor) - Diagnose CI/CD pipeline issues
- [version-sync](https://github.com/wrsmith108/claude-skill-version-sync) - Sync Node.js versions
- [flaky-test-detector](https://github.com/wrsmith108/claude-skill-flaky-test-detector) - Detect flaky tests
- [security-auditor](https://github.com/wrsmith108/claude-skill-security-auditor) - Security audits
