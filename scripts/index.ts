#!/usr/bin/env npx tsx
/**
 * Docker Optimizer - CLI Entry Point
 *
 * Analyzes Dockerfiles for optimization opportunities.
 *
 * Usage:
 *   npx tsx scripts/index.ts [dockerfile-path] [--json]
 *
 * Examples:
 *   npx tsx scripts/index.ts
 *   npx tsx scripts/index.ts ./Dockerfile
 *   npx tsx scripts/index.ts /path/to/Dockerfile --json
 */

import * as fs from 'fs';
import * as path from 'path';
import { analyzeDockerfile, formatMarkdown, formatJson } from './analyze.js';

interface CliOptions {
  dockerfilePath: string;
  jsonOutput: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CliOptions {
  let dockerfilePath = './Dockerfile';
  let jsonOutput = false;

  for (const arg of args) {
    if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      dockerfilePath = arg;
    }
  }

  return { dockerfilePath, jsonOutput };
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Docker Optimizer - Analyze and optimize Dockerfiles

Usage:
  npx tsx scripts/index.ts [dockerfile-path] [options]

Arguments:
  dockerfile-path    Path to Dockerfile (default: ./Dockerfile)

Options:
  --json            Output results as JSON
  --help, -h        Show this help message

Examples:
  npx tsx scripts/index.ts
  npx tsx scripts/index.ts ./Dockerfile
  npx tsx scripts/index.ts /path/to/Dockerfile --json

Optimization Checks:
  - Layer order (COPY package.json before npm install)
  - Multi-stage builds
  - Slim/alpine base images
  - Production dependencies only
  - Package manager cleanup (apt-get clean)
  - Combined RUN commands
  - Non-root user
  - WORKDIR usage
  - Node modules caching
  - BuildKit cache mounts
`);
}

/**
 * Resolve Dockerfile path
 */
function resolveDockerfilePath(inputPath: string): string {
  // If absolute path, use as-is
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  // Otherwise, resolve relative to current working directory
  return path.resolve(process.cwd(), inputPath);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  const dockerfilePath = resolveDockerfilePath(options.dockerfilePath);

  // Check if file exists
  if (!fs.existsSync(dockerfilePath)) {
    console.error(`Error: Dockerfile not found at ${dockerfilePath}`);
    console.error('');
    console.error('Usage: npx tsx scripts/index.ts [dockerfile-path]');
    process.exit(1);
  }

  // Read Dockerfile content
  let content: string;
  try {
    content = fs.readFileSync(dockerfilePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading Dockerfile: ${error}`);
    process.exit(1);
  }

  // Analyze the Dockerfile
  const result = analyzeDockerfile(content, dockerfilePath);

  // Output results
  if (options.jsonOutput) {
    console.log(formatJson(result));
  } else {
    console.log(formatMarkdown(result));
  }

  // Exit with error code if there are high-impact issues
  const hasHighImpactIssues = result.issues.some((issue) => issue.impact === 'high');
  if (hasHighImpactIssues) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
