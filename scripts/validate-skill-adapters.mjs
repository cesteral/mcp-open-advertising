#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = process.cwd();
const skipFreshness = process.argv.includes("--skip-freshness");
// Legacy flag support
const checkFreshness = !skipFreshness || process.argv.includes("--check-freshness");

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
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, suffix));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(suffix)) {
      files.push(fullPath);
    }
  }
  return files;
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

// --- Data-driven adapter path computation ---

function readCanonicalSkillNames() {
  const canonicalDir = path.join(repoRoot, "skills", "canonical");
  if (!fs.existsSync(canonicalDir)) {
    fail("Missing skills/canonical/ directory");
    return [];
  }
  const entries = fs.readdirSync(canonicalDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .filter((e) => fs.existsSync(path.join(canonicalDir, e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort();
}

function computeExpectedPaths(providers, skillNames) {
  const paths = [];
  for (const [providerName, provider] of Object.entries(providers)) {
    switch (provider.format) {
      case "skill-per-directory":
        for (const name of skillNames) {
          const dir = provider.outputDir.replace("{skillName}", name);
          paths.push({
            provider: providerName,
            skill: name,
            filePath: path.join(repoRoot, dir, provider.outputFile),
          });
        }
        break;
      case "file-per-skill":
        for (const name of skillNames) {
          const file = provider.outputFile.replace("{skillName}", name);
          paths.push({
            provider: providerName,
            skill: name,
            filePath: path.join(repoRoot, provider.outputDir, file),
          });
        }
        break;
      case "single-concatenated":
        paths.push({
          provider: providerName,
          skill: "*",
          filePath: path.join(repoRoot, provider.outputDir, provider.outputFile),
        });
        break;
    }
  }
  return paths;
}

function validateAdapters(contract, providers, skillNames) {
  const expectedPaths = computeExpectedPaths(providers, skillNames);
  const workflowIds = new Set(contract.workflowIds);

  for (const entry of expectedPaths) {
    if (!fs.existsSync(entry.filePath)) {
      fail(
        `Missing adapter (${entry.provider}): ${path.relative(repoRoot, entry.filePath)}`
      );
      continue;
    }

    const content = fs.readFileSync(entry.filePath, "utf8");

    // For single-concatenated files, validate all workflow IDs are present
    if (entry.skill === "*") {
      for (const workflowId of workflowIds) {
        if (!content.includes(workflowId)) {
          fail(
            `Concatenated file missing workflow ID '${workflowId}': ${path.relative(repoRoot, entry.filePath)}`
          );
        }
      }
      // Check line count of concatenated file
      const lineCount = content.split("\n").length;
      const maxConcatenatedLines = contract.adapterRules.maxSkillLines * skillNames.length;
      if (lineCount > maxConcatenatedLines) {
        fail(
          `Concatenated file too long (${lineCount} lines, max ${maxConcatenatedLines}): ${path.relative(repoRoot, entry.filePath)}`
        );
      }
      continue;
    }

    // Per-skill validation
    const lineCount = content.split("\n").length;
    // Account for 4 extra lines from generated header (3 comment lines + 1 blank)
    const effectiveMax = contract.adapterRules.maxSkillLines + 4;
    if (lineCount > effectiveMax) {
      fail(
        `Adapter too long (${lineCount} lines): ${path.relative(repoRoot, entry.filePath)}`
      );
    }

    const workflowMatch = content.match(/Workflow ID:\s*`([^`]+)`/);
    if (!workflowMatch) {
      fail(
        `Adapter missing workflow ID: ${path.relative(repoRoot, entry.filePath)}`
      );
      continue;
    }

    const workflowId = workflowMatch[1];
    if (!workflowIds.has(workflowId)) {
      fail(
        `Adapter references unknown workflow ID '${workflowId}': ${path.relative(repoRoot, entry.filePath)}`
      );
      continue;
    }

    const requiredSections =
      contract.workflows[workflowId]?.requiredOutputSections || [];
    for (const section of requiredSections) {
      if (!content.includes(`\`${section}\``)) {
        fail(
          `Adapter missing required output section '${section}': ${path.relative(repoRoot, entry.filePath)}`
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

function validateToolReferences(toolNames, promptNames, providers, skillNames) {
  // Build list of files to check from providers (only check canonical + one provider to avoid dupe noise)
  const filesToCheck = [];

  // Check canonical files
  for (const name of skillNames) {
    filesToCheck.push(
      path.join(repoRoot, "skills", "canonical", name, "SKILL.md")
    );
  }

  // Check docs
  filesToCheck.push(path.join(repoRoot, "README.md"));
  filesToCheck.push(path.join(repoRoot, "CLAUDE.md"));
  filesToCheck.push(path.join(repoRoot, "docs", "client-workflow-mappings.md"));

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
  const requireMappings = Boolean(
    contract.adapterRules?.requirePackageWorkflowMapping
  );

  if (!requireMappings) {
    return;
  }

  if (!Object.keys(platformPackages).length) {
    fail(
      "adapterRules.requirePackageWorkflowMapping=true but platformPackages is empty"
    );
    return;
  }

  for (const [packageName, details] of Object.entries(platformPackages)) {
    const requiredWorkflowIds = details?.requiredWorkflowIds || [];
    if (
      !Array.isArray(requiredWorkflowIds) ||
      requiredWorkflowIds.length === 0
    ) {
      fail(
        `platformPackages.${packageName}.requiredWorkflowIds must be a non-empty array`
      );
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

function validateFreshness() {
  console.log("\nChecking freshness...");

  const tmpDir = path.join(repoRoot, ".tmp-skill-freshness");
  try {
    // Clean up any previous tmp dir
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });

    // Re-generate to tmp by temporarily swapping output dirs
    const providersPath = path.join(repoRoot, "skills", "providers.json");
    const { providers } = readJson(providersPath);
    const canonicalDir = path.join(repoRoot, "skills", "canonical");
    const skillNames = readCanonicalSkillNames();

    // Read canonical skills
    const skills = skillNames.map((name) => ({
      name,
      content: fs.readFileSync(
        path.join(canonicalDir, name, "SKILL.md"),
        "utf8"
      ),
    }));

    // Generate to tmp and compare
    let staleCount = 0;

    for (const [providerName, provider] of Object.entries(providers)) {
      const expectedPaths = computeExpectedPaths(
        { [providerName]: provider },
        skillNames
      );

      for (const entry of expectedPaths) {
        if (!fs.existsSync(entry.filePath)) {
          fail(`Freshness: missing file ${path.relative(repoRoot, entry.filePath)}`);
          staleCount++;
          continue;
        }

        // For single-concatenated, we need to regenerate the entire file
        // For others, check that canonical content matches the body after header
        const currentContent = fs.readFileSync(entry.filePath, "utf8");

        if (entry.skill === "*") {
          // For concatenated files, verify all canonical skills are present
          for (const skill of skills) {
            const workflowMatch = skill.content.match(
              /Workflow ID:\s*`([^`]+)`/
            );
            if (workflowMatch && !currentContent.includes(workflowMatch[1])) {
              fail(
                `Freshness: concatenated file missing workflow from '${skill.name}'`
              );
              staleCount++;
            }
          }
          continue;
        }

        // For per-skill files, strip the generated header and compare body
        const skill = skills.find((s) => s.name === entry.skill);
        if (!skill) continue;

        // Strip generated header (first 3 lines + blank line)
        const lines = currentContent.split("\n");
        const bodyStart = lines.findIndex(
          (line, i) =>
            i >= 3 && !line.startsWith("<!--") && line !== ""
        );

        // Determine expected body based on frontmatter handling
        let expectedBody;
        if (provider.frontmatter === "strip") {
          const fmMatch = skill.content.match(/^---\n[\s\S]*?\n---\n/);
          expectedBody = fmMatch
            ? skill.content.slice(fmMatch[0].length)
            : skill.content;
        } else {
          expectedBody = skill.content;
        }

        // The body after header should start at line index where content begins
        // Generated header is 3 comment lines + 1 blank line = 4 lines (indices 0-3)
        const actualBody = lines.slice(4).join("\n");

        if (actualBody !== expectedBody) {
          fail(
            `Freshness: stale file (${providerName}) ${path.relative(repoRoot, entry.filePath)}`
          );
          staleCount++;
        }
      }
    }

    if (staleCount === 0) {
      console.log("Freshness check passed — all generated files match canonical sources.");
    }
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
}

function extractWorkflowIdFromSkill(skillPath) {
  const content = fs.readFileSync(skillPath, "utf8");
  const match = content.match(/Workflow ID:\s*`([^`]+)`/);
  return match ? match[1] : null;
}

function validateSkillContractAlignment(contract, skillNames) {
  console.log("\nChecking skill-contract alignment...");
  const canonicalDir = path.join(repoRoot, "skills", "canonical");

  for (const name of skillNames) {
    const skillPath = path.join(canonicalDir, name, "SKILL.md");
    const content = fs.readFileSync(skillPath, "utf8");
    const workflowId = extractWorkflowIdFromSkill(skillPath);

    if (!workflowId) {
      fail(`Canonical skill '${name}' missing Workflow ID`);
      continue;
    }

    const workflow = contract.workflows[workflowId];
    if (!workflow) {
      continue; // Orphan detection handles this case
    }

    // Check that prompts required by contract are referenced in skill Steps
    const prompts = workflow.prompts || [];
    for (const prompt of prompts) {
      if (!content.includes(prompt.name)) {
        warn(
          `Canonical skill '${name}' (${workflowId}) does not reference contract prompt '${prompt.name}' (${prompt.server}) in its Steps`
        );
      }
    }
  }
}

function validateOrphans(contract, skillNames) {
  console.log("Checking for orphan skills/workflows...");
  const canonicalDir = path.join(repoRoot, "skills", "canonical");
  const contractWorkflowIds = new Set(contract.workflowIds);
  const canonicalWorkflowIds = new Set();

  // Map canonical skills to their workflow IDs
  for (const name of skillNames) {
    const skillPath = path.join(canonicalDir, name, "SKILL.md");
    const workflowId = extractWorkflowIdFromSkill(skillPath);
    if (workflowId) {
      canonicalWorkflowIds.add(workflowId);
      if (!contractWorkflowIds.has(workflowId)) {
        warn(
          `Canonical skill '${name}' references workflow '${workflowId}' not in contract`
        );
      }
    }
  }

  // Check for contract workflows with no canonical skill
  for (const workflowId of contractWorkflowIds) {
    if (!canonicalWorkflowIds.has(workflowId)) {
      warn(
        `Contract workflow '${workflowId}' has no corresponding canonical skill`
      );
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

  const providersPath = path.join(repoRoot, "skills", "providers.json");
  if (!fs.existsSync(providersPath)) {
    fail("Missing skills/providers.json");
    return;
  }
  const { providers } = readJson(providersPath);

  const skillNames = readCanonicalSkillNames();
  if (skillNames.length === 0) {
    fail("No canonical skills found");
    return;
  }

  console.log(
    `Validating ${skillNames.length} skills across ${Object.keys(providers).length} providers...\n`
  );

  const packageSpecs = [
    {
      server: "dbm-mcp",
      promptsDir: path.join(
        repoRoot,
        "packages",
        "dbm-mcp",
        "src",
        "mcp-server",
        "prompts"
      ),
      toolsDir: path.join(
        repoRoot,
        "packages",
        "dbm-mcp",
        "src",
        "mcp-server",
        "tools",
        "definitions"
      ),
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
      promptsDir: path.join(
        repoRoot,
        "packages",
        "dv360-mcp",
        "src",
        "mcp-server",
        "prompts"
      ),
      toolsDir: path.join(
        repoRoot,
        "packages",
        "dv360-mcp",
        "src",
        "mcp-server",
        "tools",
        "definitions"
      ),
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
      promptsDir: path.join(
        repoRoot,
        "packages",
        "ttd-mcp",
        "src",
        "mcp-server",
        "prompts"
      ),
      toolsDir: path.join(
        repoRoot,
        "packages",
        "ttd-mcp",
        "src",
        "mcp-server",
        "tools",
        "definitions"
      ),
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
    {
      server: "gads-mcp",
      promptsDir: path.join(
        repoRoot,
        "packages",
        "gads-mcp",
        "src",
        "mcp-server",
        "prompts"
      ),
      toolsDir: path.join(
        repoRoot,
        "packages",
        "gads-mcp",
        "src",
        "mcp-server",
        "tools",
        "definitions"
      ),
      resourcesDir: path.join(
        repoRoot,
        "packages",
        "gads-mcp",
        "src",
        "mcp-server",
        "resources",
        "definitions"
      ),
    },
    {
      server: "meta-mcp",
      promptsDir: path.join(
        repoRoot,
        "packages",
        "meta-mcp",
        "src",
        "mcp-server",
        "prompts"
      ),
      toolsDir: path.join(
        repoRoot,
        "packages",
        "meta-mcp",
        "src",
        "mcp-server",
        "tools",
        "definitions"
      ),
      resourcesDir: path.join(
        repoRoot,
        "packages",
        "meta-mcp",
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
    promptNamesByServer[spec.server] = extractPromptNames(
      listFiles(spec.promptsDir, ".prompt.ts")
    );
    for (const promptName of promptNamesByServer[spec.server]) {
      allPromptNames.add(promptName);
    }

    const toolNames = extractToolNames(listFiles(spec.toolsDir, ".tool.ts"));
    for (const toolName of toolNames) {
      allToolNames.add(toolName);
    }

    const resourceUris = extractResourceUris(
      listFiles(spec.resourcesDir, ".resource.ts")
    );
    for (const uri of resourceUris) {
      allResourceUris.add(uri);
    }
  }

  // Also scan shared package for cross-server tools and resources (e.g. learnings)
  const sharedLearningsDir = path.join(repoRoot, "packages", "shared", "src", "learnings");
  if (fs.existsSync(sharedLearningsDir)) {
    const sharedToolFiles = listFiles(sharedLearningsDir, ".tool.ts");
    const sharedResourceFiles = listFiles(sharedLearningsDir, ".ts").filter(
      (f) => f.includes("resource")
    );
    for (const toolName of extractToolNames(sharedToolFiles)) {
      allToolNames.add(toolName);
    }
    for (const uri of extractResourceUris(sharedResourceFiles)) {
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

  validateAdapters(contract, providers, skillNames);
  validateToolReferences(allToolNames, allPromptNames, providers, skillNames);
  validateSkillContractAlignment(contract, skillNames);
  validateOrphans(contract, skillNames);

  if (checkFreshness) {
    validateFreshness();
  }

  if (process.exitCode) {
    console.error("\nSkill adapter validation failed.");
    process.exit(process.exitCode);
  }

  console.log("\nSkill adapter validation passed.");
}

main();
