# POS · AI State Space Search Lab

[![CI - AI Search Test Suite](https://github.com/MudassirT/Problem_Formulation_Project_For_Neural_Networks/actions/workflows/ci.yml/badge.svg)](https://github.com/MudassirT/Problem_Formulation_Project_For_Neural_Networks/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-9%20Passing-brightgreen.svg)](test/search.test.js)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-orange.svg)](#)

> **Graph-Theoretic State-Space Problem Formulation & Heuristic Search Visualization for Enterprise POS Architecture**  
> An interactive AI state-space laboratory modeling code structure as a formal search graph, supporting Uniform-Cost Search (UCS), A\*, Breadth-First Search (BFS), Depth-First Search (DFS), and Yen's $K$-Shortest Loopless Paths.

---

## 1. Project Overview

In Artificial Intelligence and automated software engineering, understanding how components interact, propagate dependencies, and execute workflows can be modeled as a **State-Space Search Problem**.

**POS · AI State Space Lab** provides an interactive, mathematically rigorous environment that maps the architecture of a full-scale Point-of-Sale (POS) codebase into a navigable state space. Users can interactively specify starting states ($s_0$) and goal states ($G$), evaluate search algorithms under various cost functions, inspect step-by-step priority queue frontiers, and visualize loopless alternative routes across modular communities.

### Key Knowledge Graph Metrics
- **349 States (Nodes)**: Individual functions, classes, database models, views, templates, tests, and configuration scripts.
- **452 Multi-Relational Transitions (Edges)**: Concrete architectural relationships (`calls`, `uses`, `contains`, `references`, `method`, `inherits`, `imports_from`, `implements`, `rationale_for`).
- **52 Louvain Communities**: Hierarchical community clustering with distinct visual palettes.
- **Zero-Dependency Architecture**: Runs completely client-side in any modern web browser or locally via a lightweight built-in Node.js server.

---

## 2. Formal Problem Formulation

The system formulates code traversal as a classical AI 6-tuple:

$$\mathcal{P} = \langle S, A, T, s_0, G, c \rangle$$

| Component | Formal Definition | Application Implementation |
|---|---|---|
| **$S$ (State Space)** | Set of all valid application states | 349 architectural nodes representing views, models, forms, templates, unit tests, and routines. |
| **$A$ (Action Space)** | Allowable transitions from state $s$ | 452 multi-relational edges connecting adjacent architectural entities. |
| **$T$ (Transition Model)** | Deterministic mapping $T(s, a) \to s'$ | Moving across edge $(u, v)$ shifts the current search focus from node $u$ to node $v$. |
| **$s_0$ (Initial State)** | Starting state focus | Selected via preset scenarios, node search dropdown, or direct canvas selection. |
| **$G$ (Goal Test)** | Destination satisfaction check | Predicate evaluating whether the current state matches the target goal: $\text{Current ID} == \text{Goal ID}$. |
| **$c$ (Path Cost)** | Cumulative traversal cost | Sum of relationship costs along the traversed path: $c = \sum_{e \in \text{path}} \text{cost}(e)$. |

### Semantic Cost Function
$$\text{cost}(e) = \text{base\_weight}(\text{relation}(e)) + \mathbf{1}_{\text{INFERRED}}(e) \cdot \lambda_{\text{penalty}}$$

- **Base Relationship Weights**:
  - `calls`: 1 (direct invocation)
  - `method`: 1 (class method dispatch)
  - `references`: 2 (variable or model lookup)
  - `inherits`: 2 (subclass relationship)
  - `imports_from`: 2 (module import dependency)
  - `implements`: 2 (interface implementation)
  - `rationale_for`: 2 (test-to-code invariant link)
  - `uses`: 3 (service utilization)
  - `contains`: 4 (lexical containment)
- **Uncertainty Penalty**: Default $+2$ for `INFERRED` edges (configurable).
- **Unit Cost Mode**: Supports $c(e) = 1, \forall e \in E$ to evaluate unweighted topological distance.

For full mathematical definitions, see [docs/PROBLEM_FORMULATION_AND_STATE_SPACE.md](docs/PROBLEM_FORMULATION_AND_STATE_SPACE.md).

---

## 3. Search Algorithms Implemented

The underlying search engine (`AISearch`) implements five state-space traversal strategies:

1. **Uniform-Cost Search (UCS)**:
   - Uses a binary min-heap priority queue ordered by cumulative path cost $g(n)$.
   - Mathematically guarantees finding optimal-cost paths for non-negative edge costs ($c(e) \ge 0$).
2. **$A^*$ Search**:
   - Evaluates nodes using $f(n) = g(n) + h(n)$.
   - Employs an admissible and consistent heuristic $h(n) = 0$ for topological knowledge graphs, maintaining optimal cost equivalence with UCS.
3. **Breadth-First Search (BFS)**:
   - Evaluates states in FIFO order to minimize total hop count (unweighted distance).
4. **Depth-First Search (DFS)**:
   - Explores deepest paths first using a LIFO strategy with cycle detection.
5. **Yen's $K$-Shortest Loopless Paths Algorithm**:
   - Computes alternative routes by systematically calculating spur paths and candidate paths, ensuring no loops or duplicate trajectories.

For complexity analysis and pseudocode, see [docs/ALGORITHM_SPECIFICATION.md](docs/ALGORITHM_SPECIFICATION.md).

---

## 4. Repository Structure

```
Problem Formulation/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI workflow for automated testing
├── docs/
│   ├── PROBLEM_FORMULATION_AND_STATE_SPACE.md   # Theoretical 6-tuple formulation
│   └── ALGORITHM_SPECIFICATION.md               # Search engine mechanics & complexity
├── index.html                 # Production standalone single-file distribution (offline-ready)
├── modular.html               # Developer view referencing modular src/ files
├── favicon.ico                # Application favicon
├── server.js                  # Zero-dependency local Node.js development server
├── package.json               # Project manifest, dependencies, and test scripts
├── src/
│   ├── ai-search.js           # Core graph search algorithm library (UCS, A*, BFS, DFS, Yen's)
│   ├── app.js                 # Interactive canvas rendering, state scrubber, and UI controls
│   ├── styles.css             # Responsive theme styling and modern dark mode
│   └── graph-data.json        # Comprehensive knowledge graph dataset (349 nodes, 452 edges)
└── test/
    └── search.test.js         # Automated unit test & topological invariant suite
```

---

## 5. Quick Start & Execution

### Method 1: Direct Browser Launch (Offline, Zero Install)
Double-click `index.html` (or `modular.html`) in your file explorer. The application runs immediately in Google Chrome, Microsoft Edge, Mozilla Firefox, or Apple Safari without build tools or internet connectivity.

### Method 2: Local Development Server
Launch the built-in HTTP server:
```bash
npm start
```
Then navigate to:
```
http://localhost:3000
```

### Method 3: Run Automated Test Suite
Execute the test and verification suite:
```bash
npm test
```

Expected output:
```text
================================================================
 POS · AI State Space Lab - Comprehensive Test & Benchmark Suite
================================================================

Test 1: UCS search from authentication_views_login_view to sales_views_receipt_pdf_view
✓ Test 1 passed: Cost = 15, Hops = 5, Expanded = 52 (5ms)

Test 2: A* search matches UCS optimal cost
✓ Test 2 passed: A* cost equals UCS cost exactly

Test 3: BFS search minimizes hops
✓ Test 3 passed: BFS Hops = 5, Cost = 15

Test 4: DFS search finds a route
✓ Test 4 passed: DFS Hops = 12, Cost = 37

Test 5: Unreachable goal under directed rules
✓ Test 5 passed: Unreachable goal reported correctly

Test 6: Enumerate up to 3 alternative loopless paths (Yen's algorithm)
✓ Test 6 passed: Found 3 candidate paths with costs [15, 16, 18]

Test 7: Unit Cost Model (every edge costs 1)
✓ Test 7 passed: Total cost (5) equals edge count (5)

Test 8: Knowledge graph topological invariants
✓ Test 8 passed: 349 nodes, 452 edges, 52 communities validated

Test 9: Loopless property of Yen's alternative paths
✓ Test 9 passed: All alternative paths strictly loopless

================================================================
 All 9 test suites passed successfully with zero errors!
================================================================
```

The test runner also automatically verifies:
- `test/scenarios.test.js`: Validates all quick-launch educational preset scenarios.
- `test/build.test.js`: Validates offline standalone compiler and asset payload integrity.

### Method 4: Build Standalone Offline Distribution
Compile changes from `src/` and `modular.html` into `index.html`:
```bash
npm run build
```

---

## 6. Algorithm Benchmark & Comparative Analysis

Evaluation on canonical benchmark query (`authentication_views_login_view` $\to$ `sales_views_receipt_pdf_view`):

| Algorithm | Optimal Cost | Path Hops | Nodes Expanded | Completeness | Optimality Guarantee |
|---|---|---|---|---|---|
| **Uniform-Cost Search (UCS)** | **15.0** | 5 | 52 | Yes | **Guaranteed Optimal Cost** |
| **$A^*$ Search ($h=0$)** | **15.0** | 5 | 52 | Yes | **Guaranteed Optimal Cost** |
| **Breadth-First Search (BFS)**| 15.0 | **5** | 68 | Yes | **Guaranteed Minimal Hops** |
| **Depth-First Search (DFS)**  | 37.0 | 12 | 14 | Yes | First Discovered Route |
| **Yen's 1st Alternative**     | 16.0 | 6 | 74 | Yes | Loopless Deviation Path |
| **Yen's 2nd Alternative**     | 18.0 | 6 | 89 | Yes | Loopless Deviation Path |

---

## 7. Interactive Visualization Features

- **Quick-Start Scenario Shelf**: 1-click guided presets (Checkout to Sale DB, Login to Receipt PDF, Stock Deduction, Template Hierarchy, and Directed Reachability tests) for instant educational onboarding.
- **Side-by-Side Multi-Algorithm Comparison**: Simultaneously runs UCS, A*, BFS, and DFS on the active start and goal, benchmarking cost, hop count, node expansions, and execution time.
- **Dynamic High-DPI Canvas Engine**: Crisp Retina rendering with glowing solution paths, pulsing beacons on Initial ($s_0$) and Goal ($G$) states, interactive pan/zoom, and node neighborhood inspection.
- **Time-Travel Expansion Scrubber**: Step-by-step playback with speed controls (0.5x to 4.0x) to rewind, pause, play, and inspect closed sets and frontier priority queues in real time.
- **Dark & Light Mode Support**: Refined cyber-dark slate and crisp developer light themes with persistent preference storage.
- **Global Keyboard Shortcuts**: Fast navigation with `Space` (Play/Pause), `←`/`→` (Step Back/Forward), `F` (Fit Graph), `L` (Toggle Labels), `C` (Toggle Costs), `R` (Re-run), and `?` (Shortcuts dialog).
- **Community Focus Filtering**: Dim non-target modules to study intra-community and inter-community edge traffic.
- **Complete Source Ledger**: Searchable and filterable data table inspecting every node attribute, line number, and connection multiset.
- **Export Capabilities**: Export full search traces and graph configurations as structured JSON datasets.

---

## 8. Author & License

- **Author**: Mudassir Ahmed ([GitHub Profile](https://github.com/MudassirT))
- **Repository**: [Problem_Formulation_Project_For_Neural_Networks](https://github.com/MudassirT/Problem_Formulation_Project_For_Neural_Networks)
- **License**: [MIT License](LICENSE)
