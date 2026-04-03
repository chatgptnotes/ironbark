/**
 * Ironbark — Project type and framework detection
 * Standalone version (no ECC dependency)
 *
 * Cross-platform (Windows, macOS, Linux) project type detection
 * by inspecting files in the working directory.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LANGUAGE_RULES = [
  { type: 'python', markers: ['requirements.txt', 'pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile', 'poetry.lock'], extensions: ['.py'] },
  { type: 'typescript', markers: ['tsconfig.json', 'tsconfig.build.json'], extensions: ['.ts', '.tsx'] },
  { type: 'javascript', markers: ['package.json', 'jsconfig.json'], extensions: ['.js', '.jsx', '.mjs'] },
  { type: 'golang', markers: ['go.mod', 'go.sum'], extensions: ['.go'] },
  { type: 'rust', markers: ['Cargo.toml', 'Cargo.lock'], extensions: ['.rs'] },
  { type: 'ruby', markers: ['Gemfile', 'Gemfile.lock', 'Rakefile'], extensions: ['.rb'] },
  { type: 'java', markers: ['pom.xml', 'build.gradle', 'build.gradle.kts'], extensions: ['.java'] },
  { type: 'csharp', markers: [], extensions: ['.cs', '.csproj', '.sln'] },
  { type: 'swift', markers: ['Package.swift'], extensions: ['.swift'] },
  { type: 'kotlin', markers: [], extensions: ['.kt', '.kts'] },
  { type: 'elixir', markers: ['mix.exs'], extensions: ['.ex', '.exs'] },
  { type: 'php', markers: ['composer.json', 'composer.lock'], extensions: ['.php'] }
];

const FRAMEWORK_RULES = [
  { framework: 'django', language: 'python', markers: ['manage.py'], packageKeys: ['django'] },
  { framework: 'fastapi', language: 'python', markers: [], packageKeys: ['fastapi'] },
  { framework: 'flask', language: 'python', markers: [], packageKeys: ['flask'] },
  { framework: 'nextjs', language: 'typescript', markers: ['next.config.js', 'next.config.mjs', 'next.config.ts'], packageKeys: ['next'] },
  { framework: 'react', language: 'typescript', markers: [], packageKeys: ['react'] },
  { framework: 'vue', language: 'typescript', markers: ['vue.config.js'], packageKeys: ['vue'] },
  { framework: 'angular', language: 'typescript', markers: ['angular.json'], packageKeys: ['@angular/core'] },
  { framework: 'svelte', language: 'typescript', markers: ['svelte.config.js'], packageKeys: ['svelte'] },
  { framework: 'express', language: 'javascript', markers: [], packageKeys: ['express'] },
  { framework: 'nestjs', language: 'typescript', markers: ['nest-cli.json'], packageKeys: ['@nestjs/core'] },
  { framework: 'remix', language: 'typescript', markers: [], packageKeys: ['@remix-run/node', '@remix-run/react'] },
  { framework: 'astro', language: 'typescript', markers: ['astro.config.mjs', 'astro.config.ts'], packageKeys: ['astro'] },
  { framework: 'nuxt', language: 'typescript', markers: ['nuxt.config.js', 'nuxt.config.ts'], packageKeys: ['nuxt'] },
  { framework: 'rails', language: 'ruby', markers: ['config/routes.rb', 'bin/rails'], packageKeys: [] },
  { framework: 'gin', language: 'golang', markers: [], packageKeys: ['github.com/gin-gonic/gin'] },
  { framework: 'echo', language: 'golang', markers: [], packageKeys: ['github.com/labstack/echo'] },
  { framework: 'actix', language: 'rust', markers: [], packageKeys: ['actix-web'] },
  { framework: 'axum', language: 'rust', markers: [], packageKeys: ['axum'] },
  { framework: 'spring', language: 'java', markers: [], packageKeys: ['spring-boot', 'org.springframework'] },
  { framework: 'laravel', language: 'php', markers: ['artisan'], packageKeys: ['laravel/framework'] },
  { framework: 'symfony', language: 'php', markers: ['symfony.lock'], packageKeys: ['symfony/framework-bundle'] },
  { framework: 'phoenix', language: 'elixir', markers: [], packageKeys: ['phoenix'] }
];

function fileExists(projectDir, filePath) {
  try { return fs.existsSync(path.join(projectDir, filePath)); } catch { return false; }
}

function hasFileWithExtension(projectDir, extensions) {
  try {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    return entries.some(e => e.isFile() && extensions.includes(path.extname(e.name)));
  } catch { return false; }
}

function getPackageJsonDeps(projectDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    return [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
  } catch { return []; }
}

function getPythonDeps(projectDir) {
  const deps = [];
  try {
    const reqPath = path.join(projectDir, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      fs.readFileSync(reqPath, 'utf8').split('\n').forEach(line => {
        const t = line.trim();
        if (t && !t.startsWith('#') && !t.startsWith('-')) {
          const name = t.split(/[>=<![;]/)[0].trim().toLowerCase();
          if (name) deps.push(name);
        }
      });
    }
  } catch { /* ignore */ }
  try {
    const tomlPath = path.join(projectDir, 'pyproject.toml');
    if (fs.existsSync(tomlPath)) {
      const content = fs.readFileSync(tomlPath, 'utf8');
      const m = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
      if (m) m[1].match(/"([^"]+)"/g)?.forEach(s => {
        const name = s.replace(/"/g, '').split(/[>=<![;]/)[0].trim().toLowerCase();
        if (name) deps.push(name);
      });
    }
  } catch { /* ignore */ }
  return deps;
}

function getGoDeps(projectDir) {
  try {
    const content = fs.readFileSync(path.join(projectDir, 'go.mod'), 'utf8');
    const deps = [];
    const m = content.match(/require\s*\(([\s\S]*?)\)/);
    if (m) m[1].split('\n').forEach(line => {
      const t = line.trim();
      if (t && !t.startsWith('//')) { const p = t.split(/\s+/); if (p[0]) deps.push(p[0]); }
    });
    return deps;
  } catch { return []; }
}

function getRustDeps(projectDir) {
  try {
    const content = fs.readFileSync(path.join(projectDir, 'Cargo.toml'), 'utf8');
    const deps = [];
    const sections = content.match(/\[(dev-)?dependencies\]([\s\S]*?)(?=\n\[|$)/g);
    if (sections) sections.forEach(s => s.split('\n').forEach(line => {
      const m = line.match(/^([a-zA-Z0-9_-]+)\s*=/);
      if (m && !line.startsWith('[')) deps.push(m[1]);
    }));
    return deps;
  } catch { return []; }
}

function getComposerDeps(projectDir) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(projectDir, 'composer.json'), 'utf8'));
    return [...Object.keys(c.require || {}), ...Object.keys(c['require-dev'] || {})];
  } catch { return []; }
}

function getElixirDeps(projectDir) {
  try {
    const content = fs.readFileSync(path.join(projectDir, 'mix.exs'), 'utf8');
    const deps = [];
    const matches = content.match(/\{:(\w+)/g);
    if (matches) matches.forEach(m => deps.push(m.replace('{:', '')));
    return deps;
  } catch { return []; }
}

function detectProjectType(projectDir) {
  projectDir = projectDir || process.cwd();
  const languages = [];
  const frameworks = [];

  for (const rule of LANGUAGE_RULES) {
    if (rule.markers.some(m => fileExists(projectDir, m)) || (rule.extensions.length > 0 && hasFileWithExtension(projectDir, rule.extensions))) {
      languages.push(rule.type);
    }
  }

  if (languages.includes('typescript') && languages.includes('javascript')) {
    languages.splice(languages.indexOf('javascript'), 1);
  }

  const depGetters = { python: getPythonDeps, typescript: getPackageJsonDeps, javascript: getPackageJsonDeps, golang: getGoDeps, rust: getRustDeps, php: getComposerDeps, elixir: getElixirDeps };
  const depCache = {};
  const getDeps = (lang) => { if (!depCache[lang]) depCache[lang] = (depGetters[lang] || (() => []))(projectDir); return depCache[lang]; };

  for (const rule of FRAMEWORK_RULES) {
    const hasMarker = rule.markers.some(m => fileExists(projectDir, m));
    const hasDep = rule.packageKeys.length > 0 && rule.packageKeys.some(key => getDeps(rule.language).some(dep => dep.toLowerCase().includes(key.toLowerCase())));
    if (hasMarker || hasDep) frameworks.push(rule.framework);
  }

  let primary = 'unknown';
  if (frameworks.length > 0) primary = frameworks[0];
  else if (languages.length > 0) primary = languages[0];

  const fe = ['react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'astro', 'remix'];
  const be = ['django', 'fastapi', 'flask', 'express', 'nestjs', 'rails', 'spring', 'laravel', 'phoenix', 'gin', 'echo', 'actix', 'axum'];
  if (frameworks.some(f => fe.includes(f)) && frameworks.some(f => be.includes(f))) primary = 'fullstack';

  return { languages, frameworks, primary, projectDir };
}

module.exports = { detectProjectType, LANGUAGE_RULES, FRAMEWORK_RULES };
