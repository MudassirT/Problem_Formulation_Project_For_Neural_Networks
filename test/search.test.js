const assert = require('assert');
const AISearch = require('../src/ai-search');
const data = require('../src/graph-data.json');

console.log('================================================================');
console.log(' POS · AI State Space Lab - Comprehensive Test & Benchmark Suite');
console.log('================================================================\n');

const nodes = data.graph.nodes;
const edges = (data.graph.links || data.graph.edges).map((e, i) => ({ ...e, id: 'edge-' + i }));

const DEFAULT_WEIGHTS = { calls: 1, references: 2, uses: 3, method: 1, contains: 4, inherits: 2, imports_from: 2, implements: 2, rationale_for: 2 };
function costForEdge(e) {
  return (DEFAULT_WEIGHTS[e.relation] ?? 2) + (e.confidence === 'INFERRED' ? 2 : 0);
}

// Test 1: Baseline UCS search from authentication view to sales receipt PDF view
console.log('Test 1: UCS search from authentication_views_login_view to sales_views_receipt_pdf_view');
const t0 = Date.now();
const res1 = AISearch.search({
  nodes,
  edges,
  start: 'authentication_views_login_view',
  goal: 'sales_views_receipt_pdf_view',
  algorithm: 'ucs',
  directed: false,
  costForEdge
});
const tElapsed = Date.now() - t0;

assert.strictEqual(res1.found, true, 'Path should be found');
assert(res1.totalCost > 0, 'Cost should be positive');
assert(res1.pathNodes.length >= 2, 'Path should have at least 2 nodes');
assert.strictEqual(res1.pathNodes[0], 'authentication_views_login_view');
assert.strictEqual(res1.pathNodes[res1.pathNodes.length - 1], 'sales_views_receipt_pdf_view');
console.log(`✓ Test 1 passed: Cost = ${res1.totalCost}, Hops = ${res1.pathEdges.length}, Expanded = ${res1.expandedCount} (${tElapsed}ms)`);

// Test 2: A* with admissible heuristic (h=0) must match UCS optimal cost
console.log('\nTest 2: A* search matches UCS optimal cost');
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

// Test 3: BFS search minimizes hop count
console.log('\nTest 3: BFS search minimizes hops');
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

// Test 4: DFS search discovers a valid path
console.log('\nTest 4: DFS search finds a route');
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
assert(resDFS.pathEdges.length >= 1, 'DFS must find a valid sequence of edges');
console.log(`✓ Test 4 passed: DFS Hops = ${resDFS.pathEdges.length}, Cost = ${resDFS.totalCost}`);

// Test 5: Unreachable goal under directed rules
console.log('\nTest 5: Unreachable goal under directed rules');
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
console.log('\nTest 6: Enumerate up to 3 alternative loopless paths (Yen\'s algorithm)');
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

// Test 7: Unit Cost Model verification
console.log('\nTest 7: Unit Cost Model (every edge costs 1)');
const resUnit = AISearch.search({
  nodes,
  edges,
  start: 'authentication_views_login_view',
  goal: 'sales_views_receipt_pdf_view',
  algorithm: 'ucs',
  directed: false,
  costForEdge: () => 1
});
assert.strictEqual(resUnit.found, true);
assert.strictEqual(resUnit.totalCost, resUnit.pathEdges.length, 'In unit cost model, totalCost must equal hop count');
console.log(`✓ Test 7 passed: Total cost (${resUnit.totalCost}) equals edge count (${resUnit.pathEdges.length})`);

// Test 8: Knowledge Graph topology invariants
console.log('\nTest 8: Knowledge graph topological invariants');
assert.strictEqual(nodes.length, 349, 'Graph must contain 349 nodes');
assert.strictEqual(edges.length, 452, 'Graph must contain 452 edges');
const communities = new Set(nodes.map(n => n.community));
assert.strictEqual(communities.size, 52, 'Graph must contain 52 Louvain communities');
console.log(`✓ Test 8 passed: 349 nodes, 452 edges, 52 communities validated`);

// Test 9: Loopless property of alternative paths
console.log('\nTest 9: Loopless property of Yen\'s alternative paths');
for (let i = 0; i < alts.paths.length; i++) {
  const p = alts.paths[i];
  const nodeSet = new Set(p.pathNodes);
  assert.strictEqual(nodeSet.size, p.pathNodes.length, `Path ${i} must have zero duplicate/loop nodes`);
}
console.log('✓ Test 9 passed: All alternative paths strictly loopless');

console.log('\n================================================================');
console.log(' All 9 test suites passed successfully with zero errors!');
console.log('================================================================');
