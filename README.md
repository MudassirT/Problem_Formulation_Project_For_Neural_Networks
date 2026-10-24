# POS · AI State Space Lab

> **Exact Reverse-Engineered Clone of [problemformulation.netlify.app](https://problemformulation.netlify.app/)**  
> Complete with byte-for-byte exact production files, modular source breakdown, automated unit test suite, and standalone local server.

---

## 1. Project Overview

**POS · AI State Space Lab** is an interactive, browser-based state space search exploration environment for a Point-of-Sale (POS) application codebase.

It formalizes code structure (modules, functions, classes, models, templates, and tests) into an artificial intelligence search problem, allowing users to execute and visualize classical search algorithms (Uniform-Cost Search, A\*, Breadth-First Search, and Depth-First Search) as well as Yen's k-shortest loopless path enumeration.

### Key Metrics Preserved
- **349 Nodes**: Code functions, classes, models, views, templates, tests, and configuration.
- **452 Edges**: Extracted, inferred, and ambiguous relationships (`calls`, `uses`, `contains`, `references`, `method`, `inherits`, `imports_from`, `implements`, `rationale_for`).
- **19 Communities**: Louvain/modular code clustering with distinct color coding.
- **Single-file zero-dependency design**: Standalone offline operation (runs directly in any web browser without build steps or external network requests).

---

## 2. Formal Problem Formulation

The system formulates the search problem as a formal 6-tuple:
$$\mathcal{P} = (S, A, T, s_0, G, c)$$

| Component | Description | Implementation Details |
|---|---|---|
| **$S$ (States)** | Application knowledge graph nodes | All 349 source nodes including views, models, forms, templates, and tests. |
| **$A$ (Actions)** | Relationship traversal | Traversing an incident edge from current node to an adjacent node. |
| **$T$ (Transition Model)** | Focus shift | Moving across edge $(u, v)$ transitions state focus to $v$. |
| **$s_0$ (Initial State)** | Starting node | Chosen via preset dropdown, node selector, or canvas click. |
| **$G$ (Goal Test)** | Destination check | Boolean check: $\text{Current Node ID} == \text{Goal Node ID}$. |
| **$c$ (Path Cost)** | Cumulative action cost | Sum of relationship costs: $c = \sum_{e \in \text{path}} \text{cost}(e)$. |

### Cost Model
$$\text{cost}(e) = \text{base\_weight}(\text{relation}) + (\text{penalty} \text{ if inferred})$$
- Default weights:
  - `calls`: 1
  - `method`: 1
  - `references`: 2
  - `inherits`: 2
  - `imports_from`: 2
  - `implements`: 2
  - `rationale_for`: 2
  - `uses`: 3
  - `contains`: 4
- Inferred edge penalty: +2 (configurable)
- Support for unit cost model (every edge costs 1) and manual per-edge overrides.

---

## 3. Reverse Engineering Findings

1. **Self-Contained Deployment**:
   - The site is hosted on Netlify as a single HTML payload (`index.html`, 534,777 bytes) containing:
     - Embedded CSS (`<style>`)
     - Embedded JSON payload (`<script id="graph-data" type="application/json">`, 467 KB)
     - Graph Search Library (`AISearch`, 13.9 KB)
     - Interactive Canvas & UI Engine (30.9 KB)
   - Site icon: `favicon.ico` (15,086 bytes).
   - Zero external scripts, stylesheets, CDNs, or runtime analytics.

2. **Search Algorithms (`AISearch`)**:
   - **Uniform-Cost Search (UCS)**: Implemented using a min-heap priority queue ordered by accumulated path cost $g(n)$. Guarantees optimal cost paths.
   - **A\* Search**: Uses $f(n) = g(n) + h(n)$ with $h(n) = 0$ (admissible and consistent for knowledge graphs without layout distance bias).
   - **Breadth-First Search (BFS)**: Minimizes hop count.
   - **Depth-First Search (DFS)**: Discovers the first available route via reverse-ordered neighbor exploration.
   - **Yen's Algorithm**: Enumerates the top-$k$ loopless alternative paths with spur-path Dijkstra searches and candidate heap deduplication.

3. **Step-by-Step State Space Visualization**:
   - Expansion recording: stores `current`, `g(n)`, `h(n)`, `f(n)`, `frontier`, `visited`, and active path for every step.
   - Interactive playback controls: Play/Pause, Step Next ($\rightarrow$), Step Previous ($\leftarrow$), Scrubber slider, and Jump to Final Path.
   - Dual inspection tables: Step-by-step expanded nodes and real-time priority queue frontier states.

---

## 4. File Structure

```
Problem Formulation/
├── index.html           # Exact byte-for-byte production website clone (534,777 bytes)
├── favicon.ico          # Exact production website favicon (15,086 bytes)
├── modular.html         # Developer view referencing modular src/ files
├── server.js            # Zero-dependency local Node.js development server
├── package.json         # Project metadata and test/start scripts
├── src/
│   ├── ai-search.js     # Standalone graph search algorithm library (UMD/CommonJS)
│   ├── app.js           # UI logic, canvas renderer, event listeners
│   ├── styles.css       # Clean extracted stylesheet
│   └── graph-data.json  # Extracted graph dataset (349 nodes, 452 edges, layout)
└── test/
    └── search.test.js   # Automated unit test suite verifying all search algorithms
```

---

## 5. Quick Start & Usage

### Option A: Direct Browser Open (Offline, No Setup)
Double-click `index.html` in your file explorer. It will immediately open in Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari with full interactivity and zero network requests.

### Option B: Local Node.js Server
Run the built-in development server:
```bash
npm start
```
Then visit:
```
http://localhost:3000
```

### Option C: Run Automated Tests
Execute the unit test suite to verify search algorithms, cost calculations, and path enumeration:
```bash
npm test
```

Expected output:
```text
Testing AISearch module with POS Graph dataset...
Test 1: UCS search from authentication_views_login_view to sales_views_receipt_pdf_view
✓ Test 1 passed: Cost = 15, Hops = 5, Expanded = 52
Test 2: A* search matches UCS optimal cost
✓ Test 2 passed: A* cost equals UCS cost exactly
Test 3: BFS search minimizes hops
✓ Test 3 passed: BFS Hops = 5, Cost = 15
Test 4: DFS search finds a route
✓ Test 4 passed: DFS Hops = 12, Cost = 37
Test 5: Unreachable goal under directed rules
✓ Test 5 passed: Unreachable goal reported correctly
Test 6: Enumerate up to 3 alternative loopless paths
✓ Test 6 passed: Found 3 candidate paths with costs [15, 16, 18]

All unit tests passed successfully!
```

---

## 6. Verification and Parity Audit

| Metric | Upstream (problemformulation.netlify.app) | Local Clone | Match |
|---|---|---|---|
| **File size (`index.html`)** | 534,777 bytes | 534,777 bytes | **Exact (100%)** |
| **SHA-256 (`index.html`)** | `6F28CED06ABE1BF291A3527FD3DDDCDD9A54710383D739E8E42487C5BB282741` | `6F28CED06ABE1BF291A3527FD3DDDCDD9A54710383D739E8E42487C5BB282741` | **Exact (100%)** |
| **MD5 (`index.html`)** | `6cc0baa2ab2708877a45223e80711fd6` | `6cc0baa2ab2708877a45223e80711fd6` | **Exact (100%)** |
| **Favicon (`favicon.ico`)** | 15,086 bytes | 15,086 bytes | **Exact (100%)** |
| **Node Count** | 349 | 349 | **Exact (100%)** |
| **Edge Count** | 452 | 452 | **Exact (100%)** |
| **Communities** | 19 | 19 | **Exact (100%)** |
| **Algorithms** | UCS, A\*, BFS, DFS, Yen's k-shortest | UCS, A\*, BFS, DFS, Yen's k-shortest | **Exact (100%)** |
| **Interactive Canvas** | Zoom, Pan, Tooltip, Node/Edge Select | Zoom, Pan, Tooltip, Node/Edge Select | **Exact (100%)** |
| **Search Trace Scrubber**| Play/Pause, Step Forward/Back, Scrub | Play/Pause, Step Forward/Back, Scrub | **Exact (100%)** |
| **Source Ledger** | Searchable Node & Edge Directory | Searchable Node & Edge Directory | **Exact (100%)** |
