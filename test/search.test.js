const assert = require('assert');
const AISearch = require('../src/ai-search');
const data = require('../src/graph-data.json');

console.log('Testing AISearch module with POS Graph dataset...');

const nodes = data.graph.nodes;
const edges = (data.graph.links || data.graph.edges).map((e, i) => ({ ...e, id: 'edge-' + i }));

const DEFAULT_WEIGHTS = { calls: 1, references: 2, uses: 3, method: 1, contains: 4, inherits: 2, imports_from: 2, implements: 2, rationale_for: 2 };
function costForEdge(e) {
  return (DEFAULT_WEIGHTS[e.relation] ?? 2) + (e.confidence === 'INFERRED' ? 2 : 0);
}

// Test 1: Example 1 - Login function -> receipt function
console.log('Test 1: UCS search from authentication_views_login_view to sales_views_receipt_pdf_view');
const res1 = AISearch.search({
  nodes,
  edges,
  start: 'authentication_views_login_view',
  goal: 'sales_views_receipt_pdf_view',
  algorithm: 'ucs',
  directed: false,
  costForEdge
});

assert.strictEqual(res1.found, true, 'Path should be found');
assert(res1.totalCost > 0, 'Cost should be positive');
assert(res1.pathNodes.length >= 2, 'Path should have at least 2 nodes');
assert.strictEqual(res1.pathNodes[0], 'authentication_views_login_view');
assert.strictEqual(res1.pathNodes[res1.pathNodes.length - 1], 'sales_views_receipt_pdf_view');
console.log(`✓ Test 1 passed: Cost = ${res1.totalCost}, Hops = ${res1.pathEdges.length}, Expanded = ${res1.expandedCount}`);

// Test 2: A* with h=0 should match UCS cost
console.log('Test 2: A* search matches UCS optimal cost');
const resAStar = AISearch.search({
  nodes,
  edges,
  start: 'authentication_views_login_view',
  goal: 'sales_views_receipt_pdf_view',
  algorithm: 'astar',
  directed: false,
  costForEdge
});
assert.strictEqual(resAStar.found, true);
assert.strictEqual(resAStar.totalCost, res1.totalCost, 'A* with h=0 must equal UCS total cost');
console.log('✓ Test 2 passed: A* cost equals UCS cost exactly');

// Test 3: BFS minimizes hops
console.log('Test 3: BFS search minimizes hops');
const resBFS = AISearch.search({
  nodes,
  edges,
  start: 'authentication_views_login_view',
  goal: 'sales_views_receipt_pdf_view',
  algorithm: 'bfs',
  directed: false,
  costForEdge
});
assert.strictEqual(resBFS.found, true);
assert(resBFS.pathEdges.length <= res1.pathEdges.length, 'BFS hops should be <= UCS hops (or equal)');
console.log(`✓ Test 3 passed: BFS Hops = ${resBFS.pathEdges.length}, Cost = ${resBFS.totalCost}`);

// Test 4: DFS search
console.log('Test 4: DFS search finds a route');
const resDFS = AISearch.search({
  nodes,
  edges,
  start: 'authentication_views_login_view',
  goal: 'sales_views_receipt_pdf_view',
  algorithm: 'dfs',
  directed: false,
  costForEdge
});
assert.strictEqual(resDFS.found, true);
console.log(`✓ Test 4 passed: DFS Hops = ${resDFS.pathEdges.length}, Cost = ${resDFS.totalCost}`);

// Test 5: Unreachable test case (Preset 4: Login template -> receipt under directed overlay)
console.log('Test 5: Unreachable goal under directed rules');
const resUnreachable = AISearch.search({
  nodes,
  edges,
  start: 'login_template',
  goal: 'sales_receipt_pdf_template',
  algorithm: 'ucs',
  directed: true,
  costForEdge
});
assert.strictEqual(resUnreachable.found, false, 'Should be unreachable');
assert.strictEqual(resUnreachable.reason, 'unreachable');
console.log('✓ Test 5 passed: Unreachable goal reported correctly');

// Test 6: Yen's k-shortest alternatives
console.log('Test 6: Enumerate up to 3 alternative loopless paths');
const alts = AISearch.enumerateAlternatives({
  nodes,
  edges,
  start: 'authentication_views_login_view',
  goal: 'sales_views_receipt_pdf_view',
  limit: 3,
  directed: false,
  costForEdge
});
assert.strictEqual(alts.paths.length, 3, 'Should find 3 candidate paths');
assert(alts.paths[0].totalCost <= alts.paths[1].totalCost, 'Path 0 cost <= Path 1 cost');
assert(alts.paths[1].totalCost <= alts.paths[2].totalCost, 'Path 1 cost <= Path 2 cost');
console.log(`✓ Test 6 passed: Found ${alts.paths.length} candidate paths with costs [${alts.paths.map(p => p.totalCost).join(', ')}]`);

console.log('\nAll unit tests passed successfully!');
