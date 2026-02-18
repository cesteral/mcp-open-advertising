#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const canonicalDir = path.join(repoRoot, "skills", "canonical");
const providersPath = path.join(repoRoot, "skills", "providers.json");

const GENERATED_HEADER_LINES = (skillName) => [
  `<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->`,
  `<!-- Source: skills/canonical/${skillName}/SKILL.md -->`,
  `<!-- Regenerate: pnpm generate:skills -->`,
];

function readCanonicalSkills() {
  const skills = [];
  const entries = fs.readdirSync(canonicalDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(canonicalDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillPath)) continue;
    skills.push({
      name: entry.name,
      content: fs.readFileSync(skillPath, "utf8"),
    });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { frontmatter: null, body: content };
  return {
    frontmatter: match[0],
    body: content.slice(match[0].length),
  };
}

function extractFrontmatterField(frontmatter, field) {
  if (!frontmatter) return null;
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

function stripFrontmatter(content) {
  return parseFrontmatter(content).body;
}

function addGeneratedHeader(content, skillName) {
  const header = GENERATED_HEADER_LINES(skillName).join("\n");
  return `${header}\n\n${content}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf8");
    if (existing === content) return false;
  }
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

// Format handler: skill-per-directory (Cursor, Codex)
function generateSkillPerDirectory(provider, providerName, skills) {
  let count = 0;
  for (const skill of skills) {
    const outDir = path.join(
      repoRoot,
      provider.outputDir.replace("{skillName}", skill.name)
    );
    ensureDir(outDir);
    const outFile = path.join(outDir, provider.outputFile);

    let content = skill.content;
    if (provider.frontmatter === "strip") {
      content = stripFrontmatter(content);
    }
    content = addGeneratedHeader(content, skill.name);

    writeIfChanged(outFile, content);
    count++;
  }
  return count;
}

// Format handler: file-per-skill (Windsurf, Cline, Continue)
function generateFilePerSkill(provider, providerName, skills) {
  let count = 0;
  const outDir = path.join(repoRoot, provider.outputDir);
  ensureDir(outDir);

  for (const skill of skills) {
    const outFile = path.join(
      outDir,
      provider.outputFile.replace("{skillName}", skill.name)
    );

    let content = skill.content;
    if (provider.frontmatter === "strip") {
      content = stripFrontmatter(content);
    }
    content = addGeneratedHeader(content, skill.name);

    writeIfChanged(outFile, content);
    count++;
  }
  return count;
}

// Format handler: single-concatenated (Copilot)
function generateSingleConcatenated(provider, providerName, skills) {
  const outDir = path.join(repoRoot, provider.outputDir);
  ensureDir(outDir);
  const outFile = path.join(outDir, provider.outputFile);

  const lines = [];

  // Global header
  lines.push(`<!-- GENERATED FILE — DO NOT EDIT DIRECTLY -->`);
  lines.push(`<!-- Source: skills/canonical/*/SKILL.md -->`);
  lines.push(`<!-- Regenerate: pnpm generate:skills -->`);
  lines.push(``);
  lines.push(`# Cesteral MCP Skills`);
  lines.push(``);
  lines.push(
    `This file contains all Cesteral workflow skills for GitHub Copilot. Each skill provides step-by-step guidance for a specific MCP workflow.`
  );
  lines.push(``);

  // Table of contents
  lines.push(`## Table of Contents`);
  lines.push(``);
  for (const skill of skills) {
    const { frontmatter } = parseFrontmatter(skill.content);
    const description =
      extractFrontmatterField(frontmatter, "description") || skill.name;
    const anchor = skill.name;
    lines.push(`- [${skill.name}](#${anchor}) — ${description}`);
  }
  lines.push(``);

  // Each skill
  for (const skill of skills) {
    lines.push(`---`);
    lines.push(``);
    // Strip frontmatter for copilot
    const body = stripFrontmatter(skill.content);
    lines.push(body.trimEnd());
    lines.push(``);
  }

  const content = lines.join("\n");
  writeIfChanged(outFile, content);
  return 1;
}

function main() {
  if (!fs.existsSync(providersPath)) {
    console.error("ERROR: skills/providers.json not found");
    process.exit(1);
  }
  if (!fs.existsSync(canonicalDir)) {
    console.error("ERROR: skills/canonical/ directory not found");
    process.exit(1);
  }

  const { providers } = JSON.parse(fs.readFileSync(providersPath, "utf8"));
  const skills = readCanonicalSkills();

  if (skills.length === 0) {
    console.error("ERROR: No canonical skills found in skills/canonical/");
    process.exit(1);
  }

  console.log(`Found ${skills.length} canonical skills`);
  console.log(
    `Generating adapters for ${Object.keys(providers).length} providers...\n`
  );

  let totalFiles = 0;

  for (const [providerName, provider] of Object.entries(providers)) {
    let count = 0;

    switch (provider.format) {
      case "skill-per-directory":
        count = generateSkillPerDirectory(provider, providerName, skills);
        break;
      case "file-per-skill":
        count = generateFilePerSkill(provider, providerName, skills);
        break;
      case "single-concatenated":
        count = generateSingleConcatenated(provider, providerName, skills);
        break;
      default:
        console.error(
          `ERROR: Unknown format '${provider.format}' for provider '${providerName}'`
        );
        process.exit(1);
    }

    console.log(`  ${providerName}: ${count} file(s)`);
    totalFiles += count;
  }

  console.log(`\nGenerated ${totalFiles} files across ${Object.keys(providers).length} providers.`);
}

main();
