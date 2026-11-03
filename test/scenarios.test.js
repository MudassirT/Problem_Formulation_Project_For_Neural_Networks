const assert = require('assert');
const AISearch = require('../src/ai-search');
const data = require('../src/graph-data.json');

console.log('================================================================');
console.log(' POS · AI State Space Lab - Scenario Presets Test Suite');
console.log('================================================================\n');

const nodes = data.graph.nodes;
const edges = (data.graph.links || data.graph.edges).map((e, i) => ({ ...e, id: 'edge-' + i }));

const DEFAULT_WEIGHTS = { calls: 1, references: 2, uses: 3, method: 1, contains: 4, inherits: 2, imports_from: 2, implements: 2, rationale_for: 2 };
function costForEdge(e) {
  return (DEFAULT_WEIGHTS[e.relation] ?? 2) + (e.confidence === 'INFERRED' ? 2 : 0);
}

// Preset Scenario 1: Checkout Flow -> Sale Persistence Model
console.log('Preset 1: Checkout Flow -> Sale Model');
const resPreset1 = AISearch.search({
  nodes,
  edges,
  start: 'sales_views_sales_add_view',
  goal: 'sales_models_sale',
  algorithm: 'ucs',
  directed: false,
  costForEdge
});
assert.strictEqual(resPreset1.found, true, 'Checkout -> Sale Model path must exist');
assert(resPreset1.pathNodes.length >= 2, 'Path must connect nodes');
console.log(`✓ Preset 1 passed: Cost = ${resPreset1.totalCost}, Hops = ${resPreset1.pathEdges.length}`);

// Preset Scenario 2: Login View -> PDF Receipt Generator
console.log('\nPreset 2: Login View -> PDF Receipt Generator');
const resPreset2 = AISearch.search({
  nodes,
  edges,
  start: 'authentication_views_login_view',
  goal: 'sales_views_receipt_pdf_view',
  algorithm: 'ucs',
  directed: false,
  costForEdge
});
assert.strictEqual(resPreset2.found, true, 'Login -> PDF Receipt path must exist');
console.log(`✓ Preset 2 passed: Cost = ${resPreset2.totalCost}, Hops = ${resPreset2.pathEdges.length}`);

// Preset Scenario 3: Add Sale Template -> Receipt PDF Template
console.log('\nPreset 3: Add Sale Template -> Receipt PDF Template');
const resPreset3 = AISearch.search({
  nodes,
  edges,
  start: 'sales_add_template',
  goal: 'sales_receipt_pdf_template',
  algorithm: 'ucs',
  directed: false,
  costForEdge
});
assert.strictEqual(resPreset3.found, true, 'Add Sale Template -> Receipt Template path must exist');
console.log(`✓ Preset 3 passed: Cost = ${resPreset3.totalCost}, Hops = ${resPreset3.pathEdges.length}`);

// Preset Scenario 4: Directed Non-reachability Test
console.log('\nPreset 4: Login Template -> Receipt Template (Directed - Unreachable)');
const resPreset4 = AISearch.search({
  nodes,
  edges,
  start: 'login_template',
  goal: 'sales_receipt_pdf_template',
  algorithm: 'ucs',
  directed: true,
  costForEdge
});
assert.strictEqual(resPreset4.found, false, 'Directed transition should be unreachable');
assert.strictEqual(resPreset4.reason, 'unreachable');
console.log('✓ Preset 4 passed: Correctly proves non-reachability under directed call restrictions');

console.log('\n================================================================');
console.log(' All Scenario Presets verified successfully!');
console.log('================================================================\n');
