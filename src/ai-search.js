/* Offline graph search. Costs model the educational graph, not measured POS latency. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISearch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function idOf(value, label) {
    if (value !== null && typeof value === "object") value = value.id;
    if (value === undefined || value === null) throw new TypeError(label + " requires an ID.");
    return String(value);
  }

  function positiveInteger(value, fallback, label) {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < 1) throw new RangeError(label + " must be a positive integer.");
    return value;
  }

  function buildAdjacency(nodes, edges, options) {
    options = options || {};
    if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new TypeError("nodes and edges must be arrays.");
    if (options.costForEdge !== undefined && typeof options.costForEdge !== "function") {
      throw new TypeError("costForEdge must be a function.");
    }
    var adjacency = new Map();
    nodes.forEach(function (node) {
      var id = idOf(node, "Node");
      if (adjacency.has(id)) throw new Error("Duplicate node ID: " + id);
      adjacency.set(id, []);
    });
    var edgeIds = new Set();
    edges.forEach(function (edge, index) {
      var source = idOf(edge.source, "Edge source");
      var target = idOf(edge.target, "Edge target");
      var edgeId = edge.id === undefined || edge.id === null ? "edge-" + index : String(edge.id);
      if (edgeIds.has(edgeId)) throw new Error("Duplicate edge ID: " + edgeId);
      if (!adjacency.has(source) || !adjacency.has(target)) {
        throw new Error("Edge " + edgeId + " has an endpoint outside the node set.");
      }
      edgeIds.add(edgeId);
      var cost = options.costForEdge ? options.costForEdge(edge, index) : 1;
      if (typeof cost !== "number" || !Number.isFinite(cost) || cost <= 0) {
        throw new RangeError("Edge " + edgeId + " must have a positive finite numeric cost.");
      }
      adjacency.get(source).push({ to: target, edgeId: edgeId, cost: cost, edge: edge, reversed: false });
      if (!options.directed && source !== target) {
        adjacency.get(target).push({ to: source, edgeId: edgeId, cost: cost, edge: edge, reversed: true });
      }
    });
    return adjacency;
  }

  function Heap(compare) {
    this.items = [];
    this.compare = compare;
  }
  Heap.prototype.push = function (item) {
    var items = this.items;
    var index = items.length;
    items.push(item);
    while (index > 0) {
      var parent = (index - 1) >> 1;
      if (this.compare(items[parent], item) <= 0) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  };
  Heap.prototype.pop = function () {
    var items = this.items;
    if (!items.length) return undefined;
    var first = items[0];
    var last = items.pop();
    if (items.length) {
      var index = 0;
      while (true) {
        var left = index * 2 + 1;
        if (left >= items.length) break;
        var right = left + 1;
        var child = right < items.length && this.compare(items[right], items[left]) < 0 ? right : left;
        if (this.compare(last, items[child]) <= 0) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }
    return first;
  };

  function getPath(item) {
    var nodes = [];
    var edges = [];
    for (var cursor = item; cursor; cursor = cursor.parent) {
      nodes.push(cursor.id);
      if (cursor.via !== null) edges.push(cursor.via);
    }
    nodes.reverse();
    edges.reverse();
    return { pathNodes: nodes, pathEdges: edges, totalCost: item.g };
  }

  function normalizeAlgorithm(value) {
    var algorithm = String(value || "ucs").toLowerCase().replace(/[\s_-]/g, "");
    if (algorithm === "ucs" || algorithm === "dijkstra" || algorithm === "uniformcost" || algorithm === "uniformcostsearch") return "ucs";
    if (algorithm === "a*" || algorithm === "astar") return "astar";
    if (algorithm === "bfs" || algorithm === "breadthfirst") return "bfs";
    if (algorithm === "dfs" || algorithm === "depthfirst") return "dfs";
    throw new Error("Unknown search algorithm: " + value);
  }

  function prepare(options) {
    var adjacency = buildAdjacency(options.nodes, options.edges, options);
    var start = idOf(options.start, "Start state");
    var goal = idOf(options.goal, "Goal state");
    if (!adjacency.has(start)) throw new Error("Unknown start state: " + start);
    if (!adjacency.has(goal)) throw new Error("Unknown goal state: " + goal);
    return { adjacency: adjacency, start: start, goal: goal };
  }

  /*
   * Each step is a state after expanding `current` and adding its successors.
   * The goal itself is recorded as the final expansion. Frontier entries are in
   * next-expansion order and omit replaced/stale priority-queue entries.
   * A* reopens improved nodes. Its caller-supplied heuristic must be admissible
   * (and zero at the goal) for an optimality guarantee; omitted means h = 0.
   */
  function search(options) {
    options = options || {};
    var graph = prepare(options);
    var algorithm = normalizeAlgorithm(options.algorithm);
    var weighted = algorithm === "ucs" || algorithm === "astar";
    if (options.heuristic !== undefined && typeof options.heuristic !== "function") throw new TypeError("heuristic must be a function.");
    var hCache = new Map();
    function estimate(id) {
      if (algorithm !== "astar" || !options.heuristic) return 0;
      if (!hCache.has(id)) {
        var h = options.heuristic(id, graph.goal);
        if (typeof h !== "number" || !Number.isFinite(h) || h < 0) throw new RangeError("Heuristic must return a nonnegative finite number.");
        if (id === graph.goal && h !== 0) throw new RangeError("Heuristic must be zero at the goal.");
        hCache.set(id, h);
      }
      return hCache.get(id);
    }
    // Validate the goal even when no path reaches it.
    estimate(graph.goal);
    var nextOrder = 0;
    function makeItem(id, g, parent, via) {
      var h = estimate(id);
      var item = { id: id, g: g, h: h, f: g + h, parent: parent, via: via, order: nextOrder++ };
      item.priority = algorithm === "bfs" ? item.order : algorithm === "dfs" ? -item.order : item.f;
      return item;
    }
    function compare(a, b) { return a.priority - b.priority || a.order - b.order; }
    var queue = new Heap(compare);
    var pending = new Map();
    var best = new Map();
    var seen = new Set();
    var visited = [];
    var steps = [];
    var first = makeItem(graph.start, 0, null, null);
    queue.push(first);
    pending.set(first.id, first);
    best.set(first.id, 0);
    seen.add(first.id);
    while (queue.items.length) {
      var current = queue.pop();
      if (pending.get(current.id) !== current) continue;
      pending.delete(current.id);
      if (visited.indexOf(current.id) === -1) visited.push(current.id);
      var path = getPath(current);
      if (current.id !== graph.goal) {
        var neighbors = graph.adjacency.get(current.id);
        // Stack order follows the order in which the source graph lists edges.
        if (algorithm === "dfs") neighbors = neighbors.slice().reverse();
        neighbors.forEach(function (arc) {
          var g = current.g + arc.cost;
          if (!Number.isFinite(g)) throw new RangeError("Accumulated path cost exceeds the numeric range.");
          if (weighted ? best.has(arc.to) && g >= best.get(arc.to) : seen.has(arc.to)) return;
          var item = makeItem(arc.to, g, current, arc.edgeId);
          best.set(arc.to, g);
          seen.add(arc.to);
          pending.set(arc.to, item);
          queue.push(item);
        });
      }
      var frontier = Array.from(pending.values()).sort(compare).map(function (item) {
        return { id: item.id, g: item.g, h: item.h, f: item.f, parent: item.parent ? item.parent.id : null };
      });
      steps.push({ current: current.id, g: current.g, h: current.h, f: current.f, frontier: frontier, visited: visited.slice(), pathNodes: path.pathNodes, pathEdges: path.pathEdges });
      if (current.id === graph.goal) {
        return { found: true, pathNodes: path.pathNodes, pathEdges: path.pathEdges, totalCost: path.totalCost, steps: steps, expandedCount: steps.length, reason: "goal-reached" };
      }
    }
    return { found: false, pathNodes: [], pathEdges: [], totalCost: Infinity, steps: steps, expandedCount: steps.length, reason: "unreachable" };
  }

  function shortestPath(adjacency, start, goal, bannedNodes, bannedEdges, budget) {
    var queue = new Heap(function (a, b) { return a.g - b.g || a.order - b.order; });
    var nextOrder = 0;
    var pending = new Map();
    var best = new Map();
    var expansions = 0;
    var first = { id: start, g: 0, parent: null, via: null, order: nextOrder++ };
    queue.push(first);
    pending.set(start, first);
    best.set(start, 0);
    while (queue.items.length) {
      var current = queue.pop();
      if (pending.get(current.id) !== current) continue;
      if (expansions >= budget) return { found: false, cutoff: true, expansions: expansions };
      pending.delete(current.id);
      expansions++;
      if (current.id === goal) {
        var path = getPath(current);
        path.found = true;
        path.cutoff = false;
        path.expansions = expansions;
        return path;
      }
      adjacency.get(current.id).forEach(function (arc) {
        if (bannedNodes.has(arc.to) || bannedEdges.has(arc.edgeId)) return;
        var g = current.g + arc.cost;
        if (!Number.isFinite(g)) throw new RangeError("Accumulated path cost exceeds the numeric range.");
        if (best.has(arc.to) && g >= best.get(arc.to)) return;
        var item = { id: arc.to, g: g, parent: current, via: arc.edgeId, order: nextOrder++ };
        best.set(arc.to, g);
        pending.set(arc.to, item);
        queue.push(item);
      });
    }
    return { found: false, cutoff: false, expansions: expansions };
  }

  function sameRoot(path, rootNodes, rootEdges) {
    if (path.pathNodes.length < rootNodes.length) return false;
    for (var i = 0; i < rootNodes.length; i++) if (path.pathNodes[i] !== rootNodes[i]) return false;
    for (var j = 0; j < rootEdges.length; j++) if (path.pathEdges[j] !== rootEdges[j]) return false;
    return true;
  }

  /*
   * Yen's k-shortest loopless paths, including edge-distinct parallel routes.
   * `expansions` is the total across all internal Dijkstra searches. A budget
   * cutoff returns only already-proven next-shortest paths. `truncated` means
   * a cap stopped enumeration: at the requested limit more paths MAY exist;
   * false means all loopless paths have been exhausted. No cycles are returned.
   */
  function enumerateAlternatives(options) {
    options = options || {};
    var graph = prepare(options);
    var limit = positiveInteger(options.limit, 3, "limit");
    var maxExpansions = positiveInteger(options.maxExpansions, 20000, "maxExpansions");
    var expansions = 0;
    var paths = [];
    function result(truncated, reason) {
      return { paths: paths, truncated: truncated, expansions: expansions, truncationReason: reason || null };
    }
    var first = shortestPath(graph.adjacency, graph.start, graph.goal, new Set(), new Set(), maxExpansions);
    expansions += first.expansions;
    if (first.cutoff) return result(true, "maxExpansions");
    if (!first.found) return result(false);
    paths.push({ pathNodes: first.pathNodes, pathEdges: first.pathEdges, totalCost: first.totalCost });
    if (graph.start === graph.goal) return result(false);
    var edgeCosts = new Map();
    graph.adjacency.forEach(function (arcs) { arcs.forEach(function (arc) { edgeCosts.set(arc.edgeId, arc.cost); }); });
    var order = 0;
    var candidates = new Heap(function (a, b) { return a.path.totalCost - b.path.totalCost || a.order - b.order; });
    var known = new Set([JSON.stringify([first.pathNodes, first.pathEdges])]);
    while (paths.length < limit) {
      var previous = paths[paths.length - 1];
      var rootCost = 0;
      for (var i = 0; i < previous.pathNodes.length - 1; i++) {
        var rootNodes = previous.pathNodes.slice(0, i + 1);
        var rootEdges = previous.pathEdges.slice(0, i);
        var bannedEdges = new Set();
        paths.forEach(function (path) {
          if (sameRoot(path, rootNodes, rootEdges)) bannedEdges.add(path.pathEdges[i]);
        });
        var spur = shortestPath(graph.adjacency, previous.pathNodes[i], graph.goal, new Set(rootNodes.slice(0, -1)), bannedEdges, maxExpansions - expansions);
        expansions += spur.expansions;
        if (spur.cutoff) return result(true, "maxExpansions");
        if (spur.found) {
          var path = { pathNodes: rootNodes.slice(0, -1).concat(spur.pathNodes), pathEdges: rootEdges.concat(spur.pathEdges), totalCost: rootCost + spur.totalCost };
          var key = JSON.stringify([path.pathNodes, path.pathEdges]);
          if (!known.has(key)) {
            known.add(key);
            candidates.push({ path: path, order: order++ });
          }
        }
        rootCost += edgeCosts.get(previous.pathEdges[i]);
      }
      if (!candidates.items.length) return result(false);
      paths.push(candidates.pop().path);
    }
    return result(true, "limit");
  }

  return { buildAdjacency: buildAdjacency, search: search, enumerateAlternatives: enumerateAlternatives };
});
