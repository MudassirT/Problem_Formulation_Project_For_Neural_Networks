const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('================================================================');
console.log(' POS · AI State Space Lab - Build & Distribution Test Suite');
console.log('================================================================\n');

const ROOT = path.resolve(__dirname, '..');
const indexPath = path.join(ROOT, 'index.html');
const toolsBuildPath = path.join(ROOT, 'tools', 'build.js');

// Test 1: Verify tools/build.js script exists
console.log('Test 1: Compiler script availability');
assert(fs.existsSync(toolsBuildPath), 'tools/build.js must exist');
console.log('✓ Test 1 passed: tools/build.js is present');

// Test 2: Execute build script and verify exit code 0
console.log('\nTest 2: Standalone build execution');
const buildOutput = execSync('node tools/build.js', { cwd: ROOT, encoding: 'utf8' });
assert(buildOutput.includes('✓ Standalone index.html successfully compiled'), 'Build script must report successful compilation');
console.log('✓ Test 2 passed: Build compiler executed without errors');

// Test 3: Inspect compiled index.html file properties
console.log('\nTest 3: Compiled artifact validation');
assert(fs.existsSync(indexPath), 'index.html must exist after build');
const stat = fs.statSync(indexPath);
assert(stat.size > 500 * 1024, `Compiled artifact should be > 500 KB (actual: ${(stat.size / 1024).toFixed(1)} KB)`);
console.log(`✓ Test 3 passed: Artifact size is ${(stat.size / 1024).toFixed(1)} KB`);

// Test 4: Verify essential DOM elements and embedded scripts
console.log('\nTest 4: Embedded asset integrity');
const indexContent = fs.readFileSync(indexPath, 'utf8');
assert(indexContent.includes('id="graph-data"'), 'index.html must embed #graph-data JSON payload');
assert(indexContent.includes('id="canvas-wrap"'), 'index.html must contain #canvas-wrap');
assert(indexContent.includes('id="graph"'), 'index.html must contain #graph canvas');
assert(indexContent.includes('class="scenario-shelf"'), 'index.html must contain quick-launch shelf');
assert(indexContent.includes('class="masthead"'), 'index.html must contain masthead');
assert(indexContent.includes('<style>'), 'index.html must inline styling');
console.log('✓ Test 4 passed: All core structural components and payloads embedded');

console.log('\n================================================================');
console.log(' All Build & Distribution test suites passed successfully!');
console.log('================================================================\n');
