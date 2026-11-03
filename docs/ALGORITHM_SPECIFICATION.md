# Search Algorithm Specification & Complexity Analysis

## 1. Overview

The **POS · AI State Space Lab** incorporates a high-performance graph search engine (`AISearch`) implemented in pure, zero-dependency JavaScript. The library supports both uninformed (blind) and informed (heuristic) search strategies, as well as alternative path generation for resilient route planning.

---

## 2. Core Search Algorithms

### 2.1 Uniform-Cost Search (UCS)

Uniform-Cost Search explores the state space in order of cumulative path cost $g(n)$, ensuring that the first time a goal state is dequeued from the frontier, the discovered path has minimal cost.

- **Data Structure**: Binary Min-Heap Priority Queue ordered by $g(n)$.
- **Optimality**: Mathematically guaranteed for graphs with non-negative step costs ($c(e) \ge 0$).
- **Completeness**: Complete if step cost $\epsilon > 0$ and branching factor $b$ is finite.
- **Time Complexity**: $O(b^{1 + \lfloor C^* / \epsilon \rfloor})$ or $O(\|E\| + \|V\| \log \|V\|)$ with adjacency lists.
- **Space Complexity**: $O(b^{1 + \lfloor C^* / \epsilon \rfloor})$.

### 2.2 $A^*$ Search

$A^*$ evaluates nodes by combining the cost to reach the node $g(n)$ with an estimated cost to the goal $h(n)$:

$$f(n) = g(n) + h(n)$$

- **Heuristic Function**: In unweighted/unpositioned topological knowledge graphs, the default heuristic is $h(n) = 0$.
- **Admissibility**: Because $h(n) = 0 \le h^*(n)$ for all $n$, the heuristic is strictly admissible.
- **Consistency**: For any transition $n \to n'$ with cost $c(n, a, n')$, $h(n) \le c(n, a, n') + h(n')$ holds trivially ($0 \le c(n, a, n') + 0$), guaranteeing monotonicity.

### 2.3 Breadth-First Search (BFS)

Breadth-First Search explores nodes shallowest-first, prioritizing shortest paths in terms of **edge hops** rather than weighted cost.

- **Data Structure**: First-In-First-Out (FIFO) queue.
- **Optimality**: Optimal for unweighted graphs (unit cost $c=1$); finds the route with the fewest discrete transitions.
- **Time Complexity**: $O(b^d)$ where $d$ is goal depth.
- **Space Complexity**: $O(b^d)$.

### 2.4 Depth-First Search (DFS)

Depth-First Search explores as deeply as possible along each branch before backtracking.

- **Data Structure**: Last-In-First-Out (LIFO) stack (or recursion).
- **Behavior**: Fast initial exploration with low memory footprint, but non-optimal paths and susceptible to long loops if cycle detection is omitted.
- **Loop Avoidance**: Implements an explicit visited set to prevent infinite cycles in cyclic knowledge graphs.

---

## 3. Yen's $K$-Shortest Loopless Paths Algorithm

In real-world software analysis, developers often require fallback execution routes or backup dependency paths. The lab implements **Yen's Algorithm (1971)** to enumerate up to $K$ shortest loopless paths.

### Algorithmic Procedure

1. **Base Case ($k = 1$)**: Compute the primary optimal path $P_1$ using Uniform-Cost Search.
2. **Spur Path Exploration ($k = 2 \dots K$)**:
   - For each node $i$ along the previous path $P_{k-1}$ (the *spur node*):
     - Extract the *root path* from $s_0$ to the spur node.
     - Temporarily remove all edges used by previous paths sharing the same root path to prevent duplicate routes.
     - Temporarily remove all nodes in the root path except the spur node to prevent cyclic loops.
     - Compute a *spur path* from the spur node to the goal using UCS.
     - Combine root path and spur path to form a valid candidate path $P_{\text{cand}}$.
     - Push $P_{\text{cand}}$ into a candidate min-heap priority queue.
     - Restore removed nodes and edges.
3. **Selection**: Dequeue the lowest-cost candidate path from the candidate heap as $P_k$.
4. **Termination**: Repeat until $K$ paths are found or the candidate heap is exhausted.

---

## 4. State Space Trace & Replay Engine

Every search invocation captures full expansion telemetry:

- **Expanded States**: Sequence of nodes extracted from the frontier with their corresponding $g(n)$, $h(n)$, and $f(n)$ evaluations.
- **Frontier Snapshots**: Real-time contents of the priority queue at every expansion step.
- **Active Path Reconstruction**: Parent-pointer backtracing from goal to initial state.
- **Interactive Scrubber**: Bi-directional step-by-step playback controls with canvas highlighting.
