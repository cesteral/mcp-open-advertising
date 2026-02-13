#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function warn(message) {
  console.warn(`WARN: ${message}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listFiles(dirPath, suffix) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith(suffix))
    .map((file) => path.join(dirPath, file));
}

function extractPromptNames(promptFiles) {
  const names = new Set();
  const nameRegex = /name:\s*"([^"]+)"/g;
  for (const filePath of promptFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const match of content.matchAll(nameRegex)) {
      names.add(match[1]);
    }
  }
  return names;
}

function extractToolNames(toolFiles) {
  const names = new Set();
  const nameRegex = /\bTOOL_NAME\s*=\s*["']([^"']+)["']/g;
  for (const filePath of toolFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const match of content.matchAll(nameRegex)) {
      names.add(match[1]);
    }
  }
  return names;
}

function extractResourceUris(resourceFiles) {
  const uris = new Set();
  const uriRegex = /\buri:\s*["']([^"']+)["']/g;
  const uriTemplateLiteralRegex = /\buri:\s*`([^`]+)`/g;
  const uriTemplateRegex = /\buriTemplate:\s*["']([^"']+)["']/g;
  const constTemplateRegex = /\bURI_TEMPLATE\s*=\s*["']([^"']+)["']/g;

  for (const filePath of resourceFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const match of content.matchAll(uriRegex)) {
      uris.add(match[1]);
    }
    for (const match of content.matchAll(uriTemplateLiteralRegex)) {
      uris.add(match[1]);
    }
    for (const match of content.matchAll(uriTemplateRegex)) {
      uris.add(match[1]);
    }
    for (const match of content.matchAll(constTemplateRegex)) {
      uris.add(match[1]);
    }
  }
  return uris;
}

function resourcePatternSatisfied(pattern, availableUris) {
  if (!pattern.includes("{")) {
    return availableUris.has(pattern);
  }
  const prefix = pattern.split("{")[0];
  return Array.from(availableUris).some((uri) => uri.startsWith(prefix));
}

function validateAdapters(contract) {
  const adapterFiles = [
    ".cursor/skills/mcp-tool-explorer/SKILL.md",
    ".cursor/skills/mcp-workflow-executor/SKILL.md",
    ".cursor/skills/mcp-custom-query-executor/SKILL.md",
    ".cursor/skills/mcp-delivery-troubleshooter/SKILL.md",
    ".cursor/skills/mcp-ttd-workflow-executor/SKILL.md",
    ".codex/skills/mcp-tool-explorer/SKILL.md",
    ".codex/skills/mcp-workflow-executor/SKILL.md",
    ".codex/skills/mcp-custom-query-executor/SKILL.md",
    ".codex/skills/mcp-delivery-troubleshooter/SKILL.md",
    ".codex/skills/mcp-ttd-workflow-executor/SKILL.md",
  ].map((p) => path.join(repoRoot, p));

  const workflowIds = new Set(contract.workflowIds);

  for (const filePath of adapterFiles) {
    if (!fs.existsSync(filePath)) {
      fail(`Missing adapter skill: ${path.relative(repoRoot, filePath)}`);
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const lineCount = content.split("\n").length;
    if (lineCount > contract.adapterRules.maxSkillLines) {
      fail(
        `Adapter too long (${lineCount} lines): ${path.relative(repoRoot, filePath)}`
      );
    }

    const workflowMatch = content.match(/Workflow ID:\s*`([^`]+)`/);
    if (!workflowMatch) {
      fail(`Adapter missing workflow ID: ${path.relative(repoRoot, filePath)}`);
      continue;
    }

    const workflowId = workflowMatch[1];
    if (!workflowIds.has(workflowId)) {
      fail(
        `Adapter references unknown workflow ID '${workflowId}': ${path.relative(repoRoot, filePath)}`
      );
      continue;
    }

    const requiredSections =
      contract.workflows[workflowId]?.requiredOutputSections || [];
    for (const section of requiredSections) {
      if (!content.includes(`\`${section}\``)) {
        fail(
          `Adapter missing required output section '${section}': ${path.relative(repoRoot, filePath)}`
        );
      }
    }
  }
}

function extractBacktickedValues(content) {
  const values = [];
  const regex = /`([^`]+)`/g;
  for (const match of content.matchAll(regex)) {
    values.push(match[1]);
  }
  return values;
}

function isPotentialToolName(value) {
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(value);
}

function validateToolReferences(toolNames, promptNames) {
  const filesToCheck = [
    ".cursor/skills/mcp-tool-explorer/SKILL.md",
    ".cursor/skills/mcp-workflow-executor/SKILL.md",
    ".cursor/skills/mcp-custom-query-executor/SKILL.md",
    ".cursor/skills/mcp-delivery-troubleshooter/SKILL.md",
    ".cursor/skills/mcp-ttd-workflow-executor/SKILL.md",
    ".codex/skills/mcp-tool-explorer/SKILL.md",
    ".codex/skills/mcp-workflow-executor/SKILL.md",
    ".codex/skills/mcp-custom-query-executor/SKILL.md",
    ".codex/skills/mcp-delivery-troubleshooter/SKILL.md",
    ".codex/skills/mcp-ttd-workflow-executor/SKILL.md",
    "README.md",
    "CLAUDE.md",
    "docs/client-workflow-mappings.md",
  ].map((p) => path.join(repoRoot, p));

  for (const filePath of filesToCheck) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    const values = extractBacktickedValues(content);
    const unknown = new Set();

    for (const value of values) {
      if (!isPotentialToolName(value)) continue;
      if (toolNames.has(value)) continue;
      if (promptNames.has(value)) continue;
      unknown.add(value);
    }

    for (const value of unknown) {
      fail(
        `Unknown tool/prompt reference '${value}' in ${path.relative(repoRoot, filePath)}`
      );
    }
  }
}

function extractWorkflowIdsFromMappings(mappingsPath) {
  if (!fs.existsSync(mappingsPath)) {
    fail("Missing docs/client-workflow-mappings.md");
    return new Set();
  }
  const content = fs.readFileSync(mappingsPath, "utf8");
  const matches = content.match(/`mcp\.[^`]+`/g) || [];
  return new Set(matches.map((entry) => entry.replace(/`/g, "")));
}

function validatePlatformPackages(contract, workflowIds) {
  const platformPackages = contract.platformPackages || {};
  const requireMappings = Boolean(contract.adapterRules?.requirePackageWorkflowMapping);

  if (!requireMappings) {
    return;
  }

  if (!Object.keys(platformPackages).length) {
    fail("adapterRules.requirePackageWorkflowMapping=true but platformPackages is empty");
    return;
  }

  for (const [packageName, details] of Object.entries(platformPackages)) {
    const requiredWorkflowIds = details?.requiredWorkflowIds || [];
    if (!Array.isArray(requiredWorkflowIds) || requiredWorkflowIds.length === 0) {
      fail(`platformPackages.${packageName}.requiredWorkflowIds must be a non-empty array`);
      continue;
    }
    for (const workflowId of requiredWorkflowIds) {
      if (!workflowIds.has(workflowId)) {
        fail(
          `platformPackages.${packageName} references unknown workflowId '${workflowId}'`
        );
      }
    }
  }
}

function main() {
  const contractPath = path.join(repoRoot, "docs", "mcp-skill-contract.json");
  if (!fs.existsSync(contractPath)) {
    fail("Missing docs/mcp-skill-contract.json");
    return;
  }
  const contract = readJson(contractPath);

  const packageSpecs = [
    {
      server: "dbm-mcp",
      promptsDir: path.join(repoRoot, "packages", "dbm-mcp", "src", "mcp-server", "prompts"),
      toolsDir: path.join(repoRoot, "packages", "dbm-mcp", "src", "mcp-server", "tools", "definitions"),
      resourcesDir: path.join(
        repoRoot,
        "packages",
        "dbm-mcp",
        "src",
        "mcp-server",
        "resources",
        "definitions"
      ),
    },
    {
      server: "dv360-mcp",
      promptsDir: path.join(repoRoot, "packages", "dv360-mcp", "src", "mcp-server", "prompts"),
      toolsDir: path.join(repoRoot, "packages", "dv360-mcp", "src", "mcp-server", "tools", "definitions"),
      resourcesDir: path.join(
        repoRoot,
        "packages",
        "dv360-mcp",
        "src",
        "mcp-server",
        "resources",
        "definitions"
      ),
    },
    {
      server: "ttd-mcp",
      promptsDir: path.join(repoRoot, "packages", "ttd-mcp", "src", "mcp-server", "prompts"),
      toolsDir: path.join(repoRoot, "packages", "ttd-mcp", "src", "mcp-server", "tools", "definitions"),
      resourcesDir: path.join(
        repoRoot,
        "packages",
        "ttd-mcp",
        "src",
        "mcp-server",
        "resources",
        "definitions"
      ),
    },
  ];

  const promptNamesByServer = {};
  const allPromptNames = new Set();
  const allToolNames = new Set();
  const allResourceUris = new Set();
  for (const spec of packageSpecs) {
    promptNamesByServer[spec.server] = extractPromptNames(listFiles(spec.promptsDir, ".prompt.ts"));
    for (const promptName of promptNamesByServer[spec.server]) {
      allPromptNames.add(promptName);
    }

    const toolNames = extractToolNames(listFiles(spec.toolsDir, ".tool.ts"));
    for (const toolName of toolNames) {
      allToolNames.add(toolName);
    }

    const resourceUris = extractResourceUris(listFiles(spec.resourcesDir, ".resource.ts"));
    for (const uri of resourceUris) {
      allResourceUris.add(uri);
    }
  }

  const workflowIds = new Set(contract.workflowIds);
  validatePlatformPackages(contract, workflowIds);

  for (const [workflowId, workflow] of Object.entries(contract.workflows)) {
    for (const prompt of workflow.prompts || []) {
      const availableSet = promptNamesByServer[prompt.server];
      if (!availableSet) {
        fail(
          `Workflow '${workflowId}' references unsupported prompt server '${prompt.server}'`
        );
        continue;
      }
      if (!availableSet.has(prompt.name)) {
        fail(
          `Workflow '${workflowId}' references missing prompt '${prompt.name}' on server '${prompt.server}'`
        );
      }
    }

    for (const resourcePattern of workflow.resources || []) {
      if (!resourcePatternSatisfied(resourcePattern, allResourceUris)) {
        fail(
          `Workflow '${workflowId}' references missing resource pattern '${resourcePattern}'`
        );
      }
    }
  }

  const mappingsPath = path.join(repoRoot, "docs", "client-workflow-mappings.md");
  const mappedWorkflowIds = extractWorkflowIdsFromMappings(mappingsPath);
  for (const workflowId of workflowIds) {
    if (!mappedWorkflowIds.has(workflowId)) {
      fail(`Workflow '${workflowId}' missing from docs/client-workflow-mappings.md`);
    }
  }

  for (const mappedWorkflowId of mappedWorkflowIds) {
    if (!workflowIds.has(mappedWorkflowId)) {
      warn(
        `docs/client-workflow-mappings.md includes non-canonical workflow '${mappedWorkflowId}'`
      );
    }
  }

  validateAdapters(contract);
  validateToolReferences(allToolNames, allPromptNames);

  if (process.exitCode) {
    console.error("Skill adapter validation failed.");
    process.exit(process.exitCode);
  }

  console.log("Skill adapter validation passed.");
}

main();
