/**
 * Docker Optimizer - Analysis Engine
 *
 * Analyzes Dockerfiles and identifies optimization opportunities
 * for faster builds and smaller images.
 */

export interface DockerOptimization {
  name: string;
  check: string;
  badPattern: RegExp;
  goodPattern?: RegExp;
  fix: string;
  impact: 'high' | 'medium' | 'low';
  buildTimeImpact: number; // Minutes saved
  sizeImpact: number; // MB saved
}

export interface AnalysisIssue {
  name: string;
  line: number;
  current: string;
  fix: string;
  impact: 'high' | 'medium' | 'low';
}

export interface AnalysisSummary {
  currentBuildTime: string;
  optimizedBuildTime: string;
  currentSize: string;
  optimizedSize: string;
  cacheHitRate: {
    current: string;
    optimized: string;
  };
}

export interface AnalysisResult {
  file: string;
  issues: AnalysisIssue[];
  passing: string[];
  summary: AnalysisSummary;
  score: number;
}

/**
 * Docker optimization patterns to check
 */
export const DOCKER_OPTIMIZATIONS: DockerOptimization[] = [
  {
    name: 'Layer order',
    check: 'COPY before npm install',
    badPattern: /COPY\s+\.\s+\.[\s\S]*?RUN\s+(npm|yarn|pnpm)\s+install/,
    goodPattern: /COPY\s+package\*?\.json[\s\S]*?RUN\s+(npm|yarn|pnpm)\s+(ci|install)/,
    fix: 'Copy package*.json first, then npm install, then copy source',
    impact: 'high',
    buildTimeImpact: 3,
    sizeImpact: 0,
  },
  {
    name: 'Multi-stage build',
    check: 'Has build stage',
    badPattern: /^(?![\s\S]*FROM\s+\S+\s+AS\s+\w+)/,
    goodPattern: /FROM\s+\S+\s+AS\s+\w+/i,
    fix: 'Separate build and runtime stages to reduce final image size',
    impact: 'high',
    buildTimeImpact: 0,
    sizeImpact: 500,
  },
  {
    name: 'Slim base image',
    check: 'Using slim or alpine',
    badPattern: /FROM\s+node:\d+(?!-(slim|alpine|bookworm-slim|bullseye-slim))/,
    goodPattern: /FROM\s+node:\d+-(slim|alpine)/,
    fix: 'Use node:X-slim or node:X-alpine for smaller base images',
    impact: 'medium',
    buildTimeImpact: 0.5,
    sizeImpact: 300,
  },
  {
    name: 'Production dependencies',
    check: 'npm ci --production or prune',
    badPattern:
      /RUN\s+(npm|yarn)\s+(ci|install)(?![\s\S]*?(--production|--only=production|--omit=dev|npm\s+prune))/,
    goodPattern: /(--production|--only=production|--omit=dev|npm\s+prune\s+--production)/,
    fix: 'Add --production flag or npm prune --production after build',
    impact: 'medium',
    buildTimeImpact: 0.5,
    sizeImpact: 100,
  },
  {
    name: 'Package manager cleanup',
    check: 'Cleanup after apt-get',
    badPattern: /apt-get\s+install(?![\s\S]*?(apt-get\s+clean|rm\s+-rf\s+\/var\/lib\/apt\/lists))/,
    goodPattern: /apt-get\s+clean[\s\S]*?rm\s+-rf\s+\/var\/lib\/apt\/lists/,
    fix: 'Add && apt-get clean && rm -rf /var/lib/apt/lists/* after apt-get install',
    impact: 'medium',
    buildTimeImpact: 0,
    sizeImpact: 50,
  },
  {
    name: 'Combined RUN commands',
    check: 'RUN commands combined',
    badPattern: /RUN\s+apt-get\s+update\s*\n\s*RUN\s+apt-get\s+install/,
    goodPattern: /RUN\s+apt-get\s+update\s*&&\s*apt-get\s+install/,
    fix: 'Combine RUN apt-get update && apt-get install in single layer',
    impact: 'medium',
    buildTimeImpact: 0.5,
    sizeImpact: 20,
  },
  {
    name: 'Non-root user',
    check: 'Running as non-root',
    badPattern: /^(?![\s\S]*USER\s+(?!root)\w+)/,
    goodPattern: /USER\s+(node|app|www-data|\d+)/,
    fix: 'Add USER directive to run as non-root for security',
    impact: 'low',
    buildTimeImpact: 0,
    sizeImpact: 0,
  },
  {
    name: 'WORKDIR usage',
    check: 'Using WORKDIR instead of cd',
    badPattern: /RUN\s+cd\s+\//,
    goodPattern: /WORKDIR\s+\//,
    fix: 'Use WORKDIR directive instead of RUN cd',
    impact: 'low',
    buildTimeImpact: 0,
    sizeImpact: 0,
  },
  {
    name: 'Node modules caching',
    check: 'Node modules cached properly',
    badPattern: /COPY\s+\.\s+\.[\s\S]*?COPY\s+package/,
    fix: 'Ensure COPY package*.json comes before COPY . .',
    impact: 'high',
    buildTimeImpact: 4,
    sizeImpact: 0,
  },
  {
    name: 'Build cache mount',
    check: 'Using BuildKit cache mounts',
    badPattern: /RUN\s+(npm|yarn|pnpm)\s+(ci|install)(?![\s\S]*?--mount=type=cache)/,
    goodPattern: /--mount=type=cache/,
    fix: 'Use --mount=type=cache,target=/root/.npm for faster rebuilds',
    impact: 'medium',
    buildTimeImpact: 1,
    sizeImpact: 0,
  },
];

/**
 * Find the line number where a pattern matches
 */
function findLineNumber(content: string, pattern: RegExp): number {
  const match = content.match(pattern);
  if (!match || match.index === undefined) return -1;

  const beforeMatch = content.substring(0, match.index);
  return beforeMatch.split('\n').length;
}

/**
 * Extract the matching line(s) from content
 */
function extractMatchingCode(content: string, pattern: RegExp): string {
  const match = content.match(pattern);
  if (!match) return '';

  // Get the matched text, but limit to relevant portion
  const matched = match[0];
  const lines = matched.split('\n').slice(0, 3);
  return lines.join('\n').trim();
}

/**
 * Analyze a Dockerfile and return optimization suggestions
 */
export function analyzeDockerfile(content: string, filePath: string): AnalysisResult {
  const issues: AnalysisIssue[] = [];
  const passing: string[] = [];

  let totalBuildTimeSavings = 0;
  let totalSizeSavings = 0;

  for (const optimization of DOCKER_OPTIMIZATIONS) {
    const hasBadPattern = optimization.badPattern.test(content);
    const hasGoodPattern = optimization.goodPattern
      ? optimization.goodPattern.test(content)
      : false;

    // Check if the issue exists (bad pattern present and good pattern absent)
    if (hasBadPattern && !hasGoodPattern) {
      const line = findLineNumber(content, optimization.badPattern);
      const current = extractMatchingCode(content, optimization.badPattern);

      issues.push({
        name: optimization.name,
        line: line > 0 ? line : 1,
        current: current || 'Pattern detected',
        fix: optimization.fix,
        impact: optimization.impact,
      });

      totalBuildTimeSavings += optimization.buildTimeImpact;
      totalSizeSavings += optimization.sizeImpact;
    } else if (hasGoodPattern || !hasBadPattern) {
      passing.push(optimization.name);
    }
  }

  // Calculate scores and estimates
  const baseScore = 100;
  const issueDeductions = issues.reduce((sum, issue) => {
    switch (issue.impact) {
      case 'high':
        return sum + 20;
      case 'medium':
        return sum + 10;
      case 'low':
        return sum + 5;
    }
  }, 0);

  const score = Math.max(0, baseScore - issueDeductions);

  // Estimate current metrics based on detected issues
  const estimatedCurrentBuildTime = 2 + totalBuildTimeSavings; // Base 2 min + savings
  const estimatedCurrentSize = 400 + totalSizeSavings; // Base 400MB + savings

  const summary: AnalysisSummary = {
    currentBuildTime: `~${estimatedCurrentBuildTime} min`,
    optimizedBuildTime: `~${Math.max(1, estimatedCurrentBuildTime - totalBuildTimeSavings)} min`,
    currentSize: `~${estimatedCurrentSize}MB`,
    optimizedSize: `~${Math.max(100, estimatedCurrentSize - totalSizeSavings)}MB`,
    cacheHitRate: {
      current: issues.some((i) => i.name.includes('Layer') || i.name.includes('cache'))
        ? 'Low'
        : 'Medium',
      optimized: 'High',
    },
  };

  return {
    file: filePath,
    issues,
    passing,
    summary,
    score,
  };
}

/**
 * Format analysis result as Markdown
 */
export function formatMarkdown(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push('## Dockerfile Analysis');
  lines.push('');
  lines.push(`**File:** \`${result.file}\``);
  lines.push(`**Score:** ${result.score}/100`);
  lines.push('');

  if (result.issues.length === 0) {
    lines.push('### No Issues Found');
    lines.push('');
    lines.push('Your Dockerfile follows optimization best practices.');
    lines.push('');
  } else {
    lines.push('### Issues Found');
    lines.push('');

    result.issues.forEach((issue, index) => {
      lines.push(`#### ${index + 1}. ${issue.name} (Line ${issue.line})`);
      lines.push('');
      lines.push('**Current:**');
      lines.push('```dockerfile');
      lines.push(issue.current);
      lines.push('```');
      lines.push('');
      lines.push(`**Fix:** ${issue.fix}`);
      lines.push('');
      lines.push(
        `**Impact:** ${issue.impact.charAt(0).toUpperCase() + issue.impact.slice(1)} - ${getImpactDescription(issue.impact)}`,
      );
      lines.push('');
      lines.push('---');
      lines.push('');
    });
  }

  if (result.passing.length > 0) {
    lines.push('### Passing Checks');
    lines.push('');
    result.passing.forEach((check) => {
      lines.push(`- [x] ${check}`);
    });
    lines.push('');
  }

  lines.push('### Summary');
  lines.push('');
  lines.push('| Metric | Current | Optimized |');
  lines.push('|--------|---------|-----------|');
  lines.push(
    `| Build time | ${result.summary.currentBuildTime} | ${result.summary.optimizedBuildTime} |`,
  );
  lines.push(`| Image size | ${result.summary.currentSize} | ${result.summary.optimizedSize} |`);
  lines.push(
    `| Cache hit rate | ${result.summary.cacheHitRate.current} | ${result.summary.cacheHitRate.optimized} |`,
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * Format analysis result as JSON
 */
export function formatJson(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Get impact description
 */
function getImpactDescription(impact: 'high' | 'medium' | 'low'): string {
  switch (impact) {
    case 'high':
      return 'significantly affects build time or image size';
    case 'medium':
      return 'moderate effect on performance';
    case 'low':
      return 'minor improvement or best practice';
  }
}
