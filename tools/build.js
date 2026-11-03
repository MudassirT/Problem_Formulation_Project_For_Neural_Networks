/**
 * POS · AI State Space Search Lab - Production Artifact Builder
 * Compiles modular.html, src/styles.css, src/graph-data.json, src/ai-search.js, and src/app.js
 * into the self-contained offline distribution index.html.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const cssPath = path.join(ROOT, 'src', 'styles.css');
const modularHtmlPath = path.join(ROOT, 'modular.html');
const graphDataPath = path.join(ROOT, 'src', 'graph-data.json');
const searchJsPath = path.join(ROOT, 'src', 'ai-search.js');
const appJsPath = path.join(ROOT, 'src', 'app.js');
const outputPath = path.join(ROOT, 'index.html');

console.log('Building standalone offline index.html...');

const cssContent = fs.readFileSync(cssPath, 'utf8');
const modularHtml = fs.readFileSync(modularHtmlPath, 'utf8');
const graphData = fs.readFileSync(graphDataPath, 'utf8');
const searchJs = fs.readFileSync(searchJsPath, 'utf8');
const appJs = fs.readFileSync(appJsPath, 'utf8');

// Extract everything from <head> before <link rel="stylesheet">
const headMatch = modularHtml.match(/<head>([\s\S]*?)<\/head>/i);
if (!headMatch) {
  throw new Error('Could not find <head> in modular.html');
}

// Replace <link rel="stylesheet" ...> with <style> ... </style>
let headInner = headMatch[1].replace(/<link\s+rel=["']stylesheet["'][^>]*>/i, `<style>\n${cssContent}\n</style>`);

// Extract everything between <body> and the first <script id="graph-data">
const bodyMatch = modularHtml.match(/<body>([\s\S]*?)<script id="graph-data"/i);
if (!bodyMatch) {
  throw new Error('Could not find <body> or <script id="graph-data"> in modular.html');
}

const bodyInner = bodyMatch[1];

// Assemble complete standalone HTML
const standaloneHtml = `<!doctype html>
<html lang="en">
<head>
${headInner.trim()}
</head>
<body>
${bodyInner.trim()}
  <!-- Embedded Offline Graph Dataset (349 Nodes, 452 Multi-Relational Transitions) -->
  <script id="graph-data" type="application/json">${graphData.trim()}</script>

  <!-- Core AI State-Space Search Engine (UCS, A*, BFS, DFS, Yen's K-Shortest Paths) -->
  <script>
${searchJs.trim()}
  </script>

  <!-- Interactive Visual Canvas & Problem Formulation Lab -->
  <script>
${appJs.trim()}
  </script>
</body>
</html>
`;

fs.writeFileSync(outputPath, standaloneHtml, 'utf8');
console.log(`✓ Standalone index.html successfully compiled (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
