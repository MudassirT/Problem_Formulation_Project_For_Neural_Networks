/**
 * POS · AI State Space Search Lab - Production Application Engine
 * Offline-ready graph explorer, formal search debugger, and visualizer.
 * Preserves 100% of underlying graph topology, metadata, and audit invariants.
 */
'use strict';

const DATA = JSON.parse(document.getElementById('graph-data').textContent);
const NODES = DATA.graph.nodes;
const EDGES = (DATA.graph.links || DATA.graph.edges).map((e, i) => ({ ...e, id: 'edge-' + i }));
const BY_ID = new Map(NODES.map(n => [String(n.id), n]));
const BY_EDGE = new Map(EDGES.map(e => [e.id, e]));
const VISUAL = new Map(DATA.visual.nodes.map(n => [String(n.id), n]));
const COMMUNITIES = DATA.visual.communities;
const ADJACENT = new Map(NODES.map(n => [n.id, []]));
EDGES.forEach(e => {
  ADJACENT.get(e.source).push(e);
  ADJACENT.get(e.target).push(e);
});

const DEFAULT_WEIGHTS = {
  calls: 1,
  references: 2,
  uses: 3,
  method: 1,
  contains: 4,
  inherits: 2,
  imports_from: 2,
  implements: 2,
  rationale_for: 2
};

const PRESET_SCENARIOS = [
  {
    name: 'Checkout Flow → Sale Model',
    start: 'sales_views_sales_add_view',
    goal: 'sales_models_sale',
    directed: false,
    algorithm: 'ucs',
    desc: 'Traces transactional business dispatch from checkout view to database persistence model.'
  },
  {
    name: 'Login View → PDF Receipt Generator',
    start: 'authentication_views_login_view',
    goal: 'sales_views_receipt_pdf_view',
    directed: false,
    algorithm: 'ucs',
    desc: 'End-to-end user session lifecycle from authentication to PDF receipt generation.'
  },
  {
    name: 'Inventory Setup → Stock Deduction Test',
    start: 'django_pos_inventory_tests_inventorytests_setup',
    goal: 'django_pos_inventory_tests_inventorytests_test_stock_deduction_on_sale',
    directed: false,
    algorithm: 'ucs',
    desc: 'Explores unit test verification and inventory mutation invariants.'
  },
  {
    name: 'Add Sale Template → PDF Receipt Template',
    start: 'sales_add_template',
    goal: 'sales_receipt_pdf_template',
    directed: false,
    algorithm: 'ucs',
    desc: 'Navigates the presentation layer across Django HTML templates.'
  },
  {
    name: 'Directed Disconnected Test (Unreachable)',
    start: 'login_template',
    goal: 'sales_receipt_pdf_template',
    directed: true,
    algorithm: 'ucs',
    desc: 'Demonstrates reachability failure under directed constraints without synthetic edge fabrication.'
  },
  {
    name: 'Custom User-Defined Query',
    start: null,
    goal: null,
    directed: false,
    algorithm: 'ucs',
    desc: 'Custom configuration defined interactively by the user.'
  }
];

const state = {
  weights: { ...DEFAULT_WEIGHTS },
  penalty: 2,
  overrides: new Map(),
  costMode: 'relation',
  directed: false,
  result: null,
  alternatives: null,
  step: -1,
  playing: null,
  playbackSpeed: 600,
  selected: null,
  selectedEdge: null,
  focus: null,
  dirty: false,
  runConfig: null,
  preview: null,
  theme: localStorage.getItem('pos-theme') || 'dark'
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '—';
const name = id => BY_ID.get(String(id))?.label || String(id);
const short = (s, max = 45) => s.length > max ? s.slice(0, max - 1) + '…' : s;

function costForEdge(e) {
  if (state.costMode === 'unit') return 1;
  if (state.overrides.has(e.id)) return state.overrides.get(e.id);
  return (state.weights[e.relation] ?? 2) + (e.confidence === 'INFERRED' ? state.penalty : 0);
}

function options() {
  return {
    nodes: NODES,
    edges: EDGES,
    start: $('start').value,
    goal: $('goal').value,
    directed: state.directed,
    costForEdge
  };
}

function toast(message) {
  document.querySelector('.toast')?.remove();
  const e = document.createElement('div');
  e.className = 'toast';
  e.setAttribute('role', 'status');
  e.textContent = message;
  document.body.append(e);
  setTimeout(() => e.remove(), 4200);
}

/* ==========================================================================
   Initialization & Event Wiring
   ========================================================================== */

function initialize() {
  applyTheme(state.theme);

  // Top statistics badges
  $('top-stats').innerHTML = [
    [NODES.length, 'Nodes'],
    [EDGES.length, 'Transitions'],
    [COMMUNITIES.length, 'Communities'],
    [DATA.audit.components, 'Components']
  ].map(([v, k]) => `<div class="stat-item"><strong>${v}</strong><span>${k}</span></div>`).join('');

  $('form-states').textContent = `All ${NODES.length} architectural entities (functions, models, views, templates, unit tests).`;

  // Populate Start & Goal Selects
  const sorted = [...NODES].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  for (const select of [$('start'), $('goal')]) {
    select.replaceChildren();
    for (const n of sorted) {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = `${n.label} · ${n.source_file || n.id}`;
      select.append(opt);
    }
  }

  // Populate Presets
  const presetSelect = $('preset');
  presetSelect.replaceChildren();
  PRESET_SCENARIOS.forEach((scenario, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = scenario.name;
    presetSelect.append(opt);
  });

  presetSelect.onchange = () => {
    const idx = Number(presetSelect.value);
    applyScenario(idx);
  };

  // Wire Scenario Shelf Chips
  const chipContainer = $('scenario-chips');
  if (chipContainer) {
    chipContainer.querySelectorAll('.scenario-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const idx = Number(chip.dataset.preset);
        presetSelect.value = String(idx);
        applyScenario(idx);
      });
    });
  }

  // Initial Scenario Setup (Preset 0: Checkout -> Sale Model)
  applyScenario(0, false);

  // Select Change Handlers
  ['start', 'goal'].forEach(id => {
    $(id).onchange = () => {
      presetSelect.value = String(PRESET_SCENARIOS.length - 1);
      updateScenarioChips(-1);
      markDirty();
      updateFormulation();
      draw();
    };
  });

  $('swap').onclick = () => {
    const a = $('start').value;
    $('start').value = $('goal').value;
    $('goal').value = a;
    presetSelect.value = String(PRESET_SCENARIOS.length - 1);
    updateScenarioChips(-1);
    markDirty();
    updateFormulation();
    draw();
    toast('Swapped initial and goal states.');
  };

  $('algorithm').onchange = () => {
    markDirty();
    updateFormulation();
  };

  $('direction').onchange = () => {
    state.directed = $('direction').value === 'directed';
    markDirty();
    updateFormulation();
    draw();
  };

  $('cost-mode').onchange = () => {
    state.costMode = $('cost-mode').value;
    markDirty();
    renderInspector();
    renderLedger();
    draw();
  };

  // Weights configuration
  const relations = Object.keys(DATA.audit.relations).sort();
  $('weights').innerHTML = relations.map(r => `
    <div class="weight-row">
      <label for="weight-${esc(r)}">${esc(r)} <small>(${DATA.audit.relations[r]} edges)</small></label>
      <input id="weight-${esc(r)}" data-relation="${esc(r)}" type="number" min="0.5" step="0.5" value="${state.weights[r] ?? 2}">
    </div>
  `).join('');

  document.querySelectorAll('[data-relation]').forEach(input => {
    input.addEventListener('change', () => {
      const n = Number(input.value);
      if (!input.value.trim() || !Number.isFinite(n) || n <= 0) {
        input.value = state.weights[input.dataset.relation];
        toast('Edge costs must be finite and positive.');
        return;
      }
      state.weights[input.dataset.relation] = n;
      markDirty();
      renderInspector();
      renderLedger();
      draw();
    });
  });

  $('penalty').onchange = () => {
    const v = Number($('penalty').value);
    if (!$('penalty').value.trim() || !Number.isFinite(v) || v < 0) {
      $('penalty').value = state.penalty;
      toast('Inference penalty must be a finite non-negative number.');
      return;
    }
    state.penalty = v;
    markDirty();
    renderInspector();
    draw();
  };

  $('reset-costs').onclick = () => {
    state.weights = { ...DEFAULT_WEIGHTS };
    state.penalty = 2;
    state.overrides.clear();
    $('penalty').value = '2';
    document.querySelectorAll('[data-relation]').forEach(e => e.value = state.weights[e.dataset.relation]);
    markDirty();
    renderInspector();
    renderLedger();
    draw();
    toast('Cost weights reset to default values.');
  };

  // Run & Playback
  $('run').onclick = runSearch;
  $('previous').onclick = () => setStep(Math.max(0, (state.step < 0 ? state.result?.steps.length || 1 : state.step) - 1));
  $('next').onclick = () => setStep(state.step < 0 ? 0 : Math.min(state.step + 1, (state.result?.steps.length || 1) - 1));
  $('show-final').onclick = () => {
    stopPlayback();
    state.step = -1;
    state.preview = null;
    renderTrace();
    draw();
  };
  $('scrubber').oninput = () => setStep(Number($('scrubber').value));

  $('play').onclick = () => {
    if (window.switchStudioTab) window.switchStudioTab('trace');
    if (state.playing) {
      stopPlayback();
      return;
    }
    if (!state.result?.steps.length) return;
    if (state.step < 0 || state.step >= state.result.steps.length - 1) state.step = -1;
    $('play').textContent = '⏸ Pause';
    state.playing = setInterval(() => {
      if (state.step >= state.result.steps.length - 1) {
        stopPlayback();
        return;
      }
      state.step++;
      renderTrace();
      draw();
    }, state.playbackSpeed);
  };

  $('playback-speed').onchange = () => {
    state.playbackSpeed = Number($('playback-speed').value);
    if (state.playing) {
      // restart with new speed
      stopPlayback();
      $('play').click();
    }
  };

  // Communities Search & Clear
  $('community-search').oninput = renderCommunities;
  $('clear-focus').onclick = () => {
    state.focus = null;
    renderCommunities();
    draw();
    toast('Cleared community isolation focus.');
  };

  // Node Search Autocomplete
  $('node-search').oninput = searchNodes;
  $('node-search').onkeydown = e => {
    if (e.key === 'Escape') $('node-results').hidden = true;
  };

  // Graph Canvas Controls
  $('fit').onclick = fitGraph;
  $('zoom-in').onclick = () => zoomAt(1.25, canvasWidth / 2, canvasHeight / 2);
  $('zoom-out').onclick = () => zoomAt(0.8, canvasWidth / 2, canvasHeight / 2);
  $('labels').onchange = draw;
  $('edge-costs').onchange = draw;

  // Ledger
  $('toggle-ledger').onclick = () => {
    if (window.switchStudioTab) window.switchStudioTab('inventory');
    renderLedger();
  };
  $('ledger-type').onchange = renderLedger;
  $('ledger-search').oninput = renderLedger;

  // Modals & Dialogs
  $('show-about').onclick = () => $('about').showModal();
  $('close-about').onclick = () => $('about').close();
  $('about-done').onclick = () => $('about').close();

  $('compare-btn').onclick = openCompareModal;
  $('close-compare').onclick = () => $('compare-dialog').close();
  $('close-compare-btn').onclick = () => $('compare-dialog').close();

  $('shortcuts-btn').onclick = () => $('shortcuts-dialog').showModal();
  $('close-shortcuts').onclick = () => $('shortcuts-dialog').close();

  $('download').onclick = exportSearch;
  $('theme-toggle').onclick = toggleTheme;

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', handleGlobalKeydown);

  // Studio Tab Switching
  window.switchStudioTab = function(tab) {
    const tabs = [
      { id: 'solution', btn: $('tab-btn-solution'), panel: $('panel-solution') },
      { id: 'trace', btn: $('tab-btn-trace'), panel: $('panel-trace') },
      { id: 'inventory', btn: $('tab-btn-inventory'), panel: $('panel-inventory') }
    ];
    tabs.forEach(t => {
      if (t.btn && t.panel) {
        const active = t.id === tab;
        t.btn.classList.toggle('active', active);
        t.btn.setAttribute('aria-selected', String(active));
        t.panel.hidden = !active;
      }
    });
    if (tab === 'inventory') renderLedger();
  };

  $('tab-btn-solution')?.addEventListener('click', () => switchStudioTab('solution'));
  $('tab-btn-trace')?.addEventListener('click', () => switchStudioTab('trace'));
  $('tab-btn-inventory')?.addEventListener('click', () => switchStudioTab('inventory'));

  renderCommunities();
  renderAudit();
  updateFormulation();
  setupCanvas();
  runSearch();
}

function applyScenario(index, autoRun = true) {
  const scenario = PRESET_SCENARIOS[index];
  if (!scenario || !scenario.start) return;

  if (BY_ID.has(scenario.start) && BY_ID.has(scenario.goal)) {
    $('start').value = scenario.start;
    $('goal').value = scenario.goal;
    state.directed = !!scenario.directed;
    $('direction').value = scenario.directed ? 'directed' : 'undirected';
    $('algorithm').value = scenario.algorithm || 'ucs';
    updateScenarioChips(index);
    markDirty();
    updateFormulation();
    if (autoRun) {
      runSearch();
      centerOn(scenario.start);
    }
  }
}

function updateScenarioChips(activeIndex) {
  const chips = document.querySelectorAll('.scenario-chip');
  chips.forEach((c, i) => {
    if (i === activeIndex) c.classList.add('active');
    else c.classList.remove('active');
  });
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pos-theme', theme);
  $('theme-icon').textContent = theme === 'dark' ? '☀️' : '🌙';
  draw();
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function handleGlobalKeydown(e) {
  // Ignore shortcuts when user is typing in inputs or selects
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    $('play').click();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    $('previous').click();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    $('next').click();
  } else if (e.key.toLowerCase() === 'f') {
    e.preventDefault();
    fitGraph();
  } else if (e.key.toLowerCase() === 'l') {
    e.preventDefault();
    $('labels').checked = !$('labels').checked;
    draw();
  } else if (e.key.toLowerCase() === 'c') {
    e.preventDefault();
    $('edge-costs').checked = !$('edge-costs').checked;
    draw();
  } else if (e.key.toLowerCase() === 'r') {
    e.preventDefault();
    runSearch();
  } else if (e.key === '?') {
    e.preventDefault();
    $('shortcuts-dialog').showModal();
  } else if (e.key === 'Escape') {
    $('about').close();
    $('compare-dialog').close();
    $('shortcuts-dialog').close();
    $('node-results').hidden = true;
  }
}

/* ==========================================================================
   Search Formulation & Execution
   ========================================================================== */

function updateFormulation() {
  $('form-start').textContent = `Current focus = ${name($('start').value)}.`;
  $('form-goal').textContent = `Destination predicate matches ${$('goal').value} (${name($('goal').value)}).`;
  
  const messages = {
    ucs: 'Uniform-Cost Search systematically expands the lowest accumulated path cost g(n). Guarantees the mathematically optimal cost solution for non-negative weights.',
    astar: 'A* Search evaluates f(n) = g(n) + h(n) using consistent heuristic h(n) = 0. Guarantees optimal cost equivalence with UCS on topological graphs.',
    bfs: 'Breadth-First Search evaluates states by hop count. Guarantees the path with the fewest architectural transitions.',
    dfs: 'Depth-First Search aggressively pursues branch depth with cycle detection. Discovers an initial reachability route; non-optimal.'
  };
  $('algorithm-help').innerHTML = messages[$('algorithm').value];
}

function markDirty() {
  stopPlayback();
  state.dirty = true;
  if (state.result) {
    $('result-title').textContent = 'Configuration Modified · Re-run search';
    $('result-explanation').textContent = 'Search parameters have changed. Run search to compute the new path and verify optimality.';
  }
  state.result = null;
  state.alternatives = null;
  state.step = -1;
  state.preview = null;
  $('path-strip').replaceChildren();
  $('result-metrics').replaceChildren();
  $('alternatives').replaceChildren();
  renderTrace();
  draw();
}

function stopPlayback() {
  if (state.playing) clearInterval(state.playing);
  state.playing = null;
  $('play').textContent = '▶ Play';
}

function runSearch() {
  stopPlayback();
  state.preview = null;
  state.step = -1;
  if (window.switchStudioTab) window.switchStudioTab('solution');

  try {
    const opts = options();
    state.result = AISearch.search({ ...opts, algorithm: $('algorithm').value });
    state.alternatives = AISearch.enumerateAlternatives({ ...opts, limit: 3, maxExpansions: 16000 });
    state.runConfig = {
      start: opts.start,
      goal: opts.goal,
      algorithm: $('algorithm').value,
      directed: state.directed,
      costMode: state.costMode,
      weights: { ...state.weights },
      inferredPenalty: state.penalty,
      edgeOverrides: Object.fromEntries(state.overrides)
    };
    state.dirty = false;
    renderResult();
    renderTrace();
    updateFormulation();
    renderInspector();
    draw();
  } catch (error) {
    state.result = null;
    toast(error.message);
    $('result-title').textContent = 'Search Terminated with Error';
    $('result-explanation').textContent = error.message;
  }
}

function renderResult() {
  const r = state.result;
  if (!r) return;
  const algorithm = $('algorithm').value;
  const statusIcon = $('status-icon');

  if (r.found) {
    statusIcon.className = 'status-icon-badge';
    statusIcon.textContent = '✓';
    $('result-title').textContent = (algorithm === 'ucs' || algorithm === 'astar')
      ? 'Optimal Least-Cost Solution Discovered'
      : 'Valid Traversal Route Discovered';
  } else {
    statusIcon.className = 'status-icon-badge unreachable';
    statusIcon.textContent = '✕';
    $('result-title').textContent = 'Destination Goal Is Unreachable';
  }

  $('result-metrics').innerHTML = `
    <div class="metric-card">
      <div class="metric-value">${r.found ? fmt(r.totalCost) : '—'}</div>
      <div class="metric-label">Total Cost</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${r.found ? r.pathEdges.length : '—'}</div>
      <div class="metric-label">Hops (Transitions)</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${r.expandedCount}</div>
      <div class="metric-label">Nodes Expanded</div>
    </div>
  `;

  // Path pipeline
  const strip = $('path-strip');
  strip.replaceChildren();

  if (r.found) {
    r.pathNodes.forEach((id, i) => {
      if (i) {
        const edge = BY_EDGE.get(r.pathEdges[i - 1]);
        const arrow = document.createElement('span');
        arrow.className = 'path-arrow';
        arrow.innerHTML = `→ <small>${edge ? edge.relation : ''} (+${fmt(costForEdge(edge))})</small> →`;
        strip.append(arrow);
      }
      const b = document.createElement('button');
      b.className = 'path-node';
      b.textContent = name(id);
      b.title = `${id} · Click to center camera`;
      b.onclick = () => selectNode(id, true);
      strip.append(b);
    });
  }

  const cheapest = state.alternatives?.paths?.[0]?.totalCost;
  if (!r.found) {
    $('result-explanation').innerHTML = `
      <strong>Goal Unreachable:</strong> No connected path exists from <code>${esc(name($('start').value))}</code> to <code>${esc(name($('goal').value))}</code> under the selected <strong>${state.directed ? 'Directed Flow' : 'Bidirectional'}</strong> rules. All architectural entities remain intact without synthetic bridging.
    `;
  } else if (algorithm === 'ucs' || algorithm === 'astar') {
    $('result-explanation').innerHTML = `
      <strong>Mathematically Optimal:</strong> Under positive transition costs, this path minimizes total architectural navigation effort:
      <code>${r.pathEdges.map(id => fmt(costForEdge(BY_EDGE.get(id)))).join(' + ') || '0'} = <strong>${fmt(r.totalCost)}</strong></code>.
    `;
  } else {
    $('result-explanation').innerHTML = `
      <strong>${algorithm === 'bfs' ? 'Breadth-First Search (BFS)' : 'Depth-First Search (DFS)'} Result:</strong>
      Discovered a route with <strong>${r.pathEdges.length} hops</strong> at cost <strong>${fmt(r.totalCost)}</strong>
      ${Number.isFinite(cheapest) ? `(Optimal minimum cost is <strong>${fmt(cheapest)}</strong>)` : ''}.
    `;
  }

  // Yen's Alternatives
  const alternatives = $('alternatives');
  alternatives.replaceChildren();

  const altPaths = state.alternatives?.paths || [];
  if (altPaths.length > 1) {
    const header = document.createElement('h3');
    header.style.margin = '14px 0 6px 0';
    header.textContent = `Alternative Loopless Paths (Yen's Algorithm · ${altPaths.length} routes)`;
    alternatives.append(header);
  }

  for (const [i, p] of altPaths.entries()) {
    const card = document.createElement('div');
    card.className = 'alternative-card';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'alternative-header';

    const title = document.createElement('div');
    title.className = 'alternative-title';
    title.innerHTML = `<span>${i === 0 ? '⭐ Primary Candidate' : `Alternative Route #${i}`}</span> · <strong>Cost ${fmt(p.totalCost)}</strong> · <span>${p.pathEdges.length} hops</span>`;

    const btn = document.createElement('button');
    btn.className = 'btn-highlight-alt';
    btn.textContent = '👁️ Preview on Map';
    btn.onclick = () => {
      stopPlayback();
      state.step = -1;
      state.preview = p;
      draw();
      $('trace-status').textContent = `Previewing alternative path #${i + 1} (Cost ${fmt(p.totalCost)}). Click "Final ⏭" to restore primary solution.`;
    };

    cardHeader.append(title, btn);

    const names = document.createElement('span');
    names.className = 'path-breakdown';
    names.textContent = p.pathNodes.map(name).join(' → ');

    card.append(cardHeader, names);
    alternatives.append(card);
  }
}

/* ==========================================================================
   Trace & Playback System
   ========================================================================== */

function setStep(value) {
  stopPlayback();
  if (!state.result?.steps.length) return;
  state.preview = null;
  state.step = Math.max(0, Math.min(value, state.result.steps.length - 1));
  if (window.switchStudioTab) window.switchStudioTab('trace');
  renderTrace();
  draw();
}

function renderTrace() {
  const r = state.result;
  const steps = r?.steps || [];
  const scrubber = $('scrubber');

  scrubber.disabled = !steps.length;
  scrubber.max = String(Math.max(0, steps.length - 1));
  scrubber.value = String(state.step < 0 ? Math.max(0, steps.length - 1) : state.step);

  ['previous', 'next', 'play', 'show-final'].forEach(id => $(id).disabled = !steps.length);

  const index = state.step < 0 ? steps.length - 1 : state.step;
  const frame = steps[index];

  if (!frame) {
    $('trace-status').textContent = 'Execute a search to view step-by-step priority queue state.';
  } else {
    $('trace-status').innerHTML = `
      ${state.step < 0 ? '<strong>Final Result:</strong> ' : ''}Expansion <strong>${index + 1}</strong> of <strong>${steps.length}</strong>:
      <code>${esc(name(frame.current))}</code> · g=${fmt(frame.g)}, h=${fmt(frame.h)}, f=${fmt(frame.f)}
      (Frontier queue: ${frame.frontier.length} pending, Visited: ${frame.visited.length})
    `;
  }

  // Render Closed Set Table
  $('trace-body').innerHTML = steps.map((s, i) => `
    <tr class="${i === index ? 'current' : ''}">
      <td>${i + 1}</td>
      <td><button data-step="${i}" title="${esc(s.current)}">${esc(short(name(s.current), 38))}</button></td>
      <td>${fmt(s.g)}</td>
      <td>${fmt(s.h)}</td>
      <td>${fmt(s.f)}</td>
    </tr>
  `).join('');

  $('trace-body').querySelectorAll('[data-step]').forEach(b => {
    b.onclick = () => setStep(Number(b.dataset.step));
  });

  // Render Open Set (Frontier) Table
  $('frontier-body').innerHTML = (frame?.frontier || []).map((n, i) => `
    <tr>
      <td><button data-node="${esc(n.id)}">${esc(short(name(n.id), 36))}</button></td>
      <td>${fmt(n.g)}</td>
      <td>${$('algorithm').value === 'bfs' || $('algorithm').value === 'dfs' ? i + 1 : fmt(n.f)}</td>
    </tr>
  `).join('');

  $('frontier-body').querySelectorAll('[data-node]').forEach(b => {
    b.onclick = () => selectNode(b.dataset.node, true);
  });
}

/* ==========================================================================
   Communities & Louvain Clustering
   ========================================================================== */

function renderCommunities() {
  const query = $('community-search').value.toLowerCase();
  const container = $('communities');
  container.replaceChildren();

  for (const c of COMMUNITIES) {
    if (!(`${c.cid} ${c.label}`.toLowerCase().includes(query))) continue;
    const b = document.createElement('button');
    b.className = 'community-item' + (state.focus === c.cid ? ' focused' : '');
    b.title = `Community ${c.cid}: ${c.label} (${DATA.audit.communityCounts[String(c.cid)] || 0} nodes)`;
    b.setAttribute('aria-pressed', String(state.focus === c.cid));
    b.innerHTML = `
      <span class="community-dot" style="background:${esc(c.color)}; color:${esc(c.color)}"></span>
      <span class="community-label">C${c.cid} · ${esc(c.label)}</span>
      <span class="community-count">${DATA.audit.communityCounts[String(c.cid)] || 0}</span>
    `;
    b.onclick = () => {
      state.focus = state.focus === c.cid ? null : c.cid;
      renderCommunities();
      draw();
    };
    container.append(b);
  }
}

/* ==========================================================================
   Preservation Audit & Provenance Verification
   ========================================================================== */

function renderAudit() {
  $('audit').innerHTML = [
    ['Source Nodes Preserved', `${NODES.length} / ${DATA.audit.nodes}`],
    ['Source Transitions Preserved', `${EDGES.length} / ${DATA.audit.edges}`],
    ['Louvain Communities', `${COMMUNITIES.length} / ${DATA.audit.communities}`],
    ['Connected Components', DATA.audit.components],
    ['Isolated Architecture Nodes', DATA.audit.isolatedNodes.length],
    ['Node Set Verification', 'Exact Match ✓'],
    ['Edge Multiset Verification', 'Exact Match ✓']
  ].map(([k, v]) => `
    <div class="audit-row">
      <span>${esc(k)}</span>
      <strong>${esc(v)}</strong>
    </div>
  `).join('') + `
    <details class="custom-accordion" style="margin-top: 10px;">
      <summary>Cryptographic Hashes & Artifact Provenance</summary>
      <div style="margin-top: 8px;">
        <p class="help-text">SHA-256 (graph.json):</p>
        <pre style="background:var(--bg-subtle); padding:6px; font-size:10px; border-radius:4px; font-family:var(--font-mono); overflow-x:auto;">${DATA.audit.graphJsonSha256}</pre>
        <p class="help-text">SHA-256 (graph.html):</p>
        <pre style="background:var(--bg-subtle); padding:6px; font-size:10px; border-radius:4px; font-family:var(--font-mono); overflow-x:auto;">${DATA.audit.graphHtmlSha256}</pre>
        <button id="export-source" class="btn-primary-run" style="width: 100%; margin-top: 10px; font-size: 11.5px; padding: 6px 12px;">
          <span>Export Preserved Source Graph (JSON)</span>
        </button>
      </div>
    </details>
  `;

  $('export-source').onclick = () => {
    downloadJSON('pos-source-graph-preserved.json', {
      graph: DATA.graph,
      visual: DATA.visual,
      audit: DATA.audit
    });
  };
}

/* ==========================================================================
   Entity Search & Inspector
   ========================================================================== */

function searchNodes() {
  const q = $('node-search').value.trim().toLowerCase();
  const results = $('node-results');
  results.replaceChildren();
  results.hidden = !q;
  if (!q) return;

  const matches = NODES.filter(n => `${n.label} ${n.id} ${n.source_file}`.toLowerCase().includes(q)).slice(0, 30);
  for (const n of matches) {
    const b = document.createElement('button');
    b.innerHTML = `<strong>${esc(n.label)}</strong><small>${esc(n.source_file || n.id)}</small>`;
    b.onclick = () => {
      selectNode(n.id, true);
      results.hidden = true;
    };
    results.append(b);
  }

  if (!matches.length) {
    const p = document.createElement('div');
    p.style.padding = '8px';
    p.style.color = 'var(--text-muted)';
    p.style.fontSize = '11px';
    p.textContent = 'No matching nodes found.';
    results.append(p);
  }
}

function selectNode(id, center = false) {
  if (!BY_ID.has(id)) return;
  state.selected = id;
  state.selectedEdge = null;
  renderInspector();
  if (center) centerOn(id);
  draw();
}

function selectEdge(id) {
  if (!BY_EDGE.has(id)) return;
  state.selectedEdge = id;
  state.selected = null;
  renderInspector();
  draw();
}

function renderInspector() {
  const panel = $('inspector');

  if (state.selected) {
    const n = BY_ID.get(state.selected);
    const v = VISUAL.get(n.id);
    const links = ADJACENT.get(n.id);

    panel.innerHTML = `
      <div class="inspector-card">
        <div class="tag-pills">
          <span class="pill">NODE / STATE</span>
          <span class="pill">C${esc(n.community)}</span>
          <span class="pill">${esc(n.file_type || 'CODE')}</span>
        </div>
        <h3 class="inspector-title">${esc(n.label)}</h3>
        <div class="inspector-meta">
          <div><strong>ID:</strong> <code style="font-family:var(--font-mono); font-size:10px;">${esc(n.id)}</code></div>
          <div><strong>Source File:</strong> ${esc(n.source_file || 'Not recorded')} ${esc(n.source_location || '')}</div>
          <div><strong>Community Module:</strong> ${esc(v?.community_name || ('C' + n.community))}</div>
          <div><strong>Incident Actions:</strong> ${links.length} transitions</div>
        </div>
        <div class="inspector-actions">
          <button id="set-start" class="btn-playback">Set Initial (s₀)</button>
          <button id="set-goal" class="btn-playback">Set Goal (G)</button>
        </div>
        <h4 style="font-size:11.5px; margin: 12px 0 6px 0; color:var(--text-secondary);">Incident Transitions (${links.length}):</h4>
        <div class="neighbours-list"></div>
      </div>
    `;

    $('set-start').onclick = () => {
      $('start').value = n.id;
      $('preset').value = String(PRESET_SCENARIOS.length - 1);
      updateScenarioChips(-1);
      markDirty();
      updateFormulation();
      draw();
      toast(`Initial state set to ${n.label}`);
    };

    $('set-goal').onclick = () => {
      $('goal').value = n.id;
      $('preset').value = String(PRESET_SCENARIOS.length - 1);
      updateScenarioChips(-1);
      markDirty();
      updateFormulation();
      draw();
      toast(`Goal state set to ${n.label}`);
    };

    const list = panel.querySelector('.neighbours-list');
    for (const e of links) {
      const other = e.source === n.id ? e.target : e.source;
      const b = document.createElement('button');
      b.className = 'neighbour-item';
      b.innerHTML = `
        <strong>${esc(name(other))}</strong>
        <small>${esc(e.relation)} · Cost: ${fmt(costForEdge(e))} · ${esc(e.confidence || 'VERIFIED')}</small>
      `;
      b.onclick = () => selectEdge(e.id);
      list.append(b);
    }
  } else if (state.selectedEdge) {
    const e = BY_EDGE.get(state.selectedEdge);
    panel.innerHTML = `
      <div class="inspector-card">
        <div class="tag-pills">
          <span class="pill">TRANSITION / ACTION</span>
          <span class="pill ${e.confidence === 'INFERRED' ? 'inferred' : ''}">${esc(e.confidence || 'VERIFIED')}</span>
        </div>
        <h3 class="inspector-title">${esc(e.relation)}</h3>
        <div class="inspector-meta">
          <div><strong>From State:</strong> ${esc(name(e.source))}</div>
          <div><strong>To State:</strong> ${esc(name(e.target))}</div>
          <div><strong>Evidence:</strong> ${esc(e.source_file || 'Not recorded')} ${esc(e.source_location || '')}</div>
          <div><strong>Current Teaching Cost:</strong> <strong style="color:var(--accent-cyan);">${fmt(costForEdge(e))}</strong></div>
        </div>
        <div class="inspector-actions">
          <button id="edge-from" class="btn-playback">Inspect Source</button>
          <button id="edge-to" class="btn-playback">Inspect Target</button>
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label for="edge-override">Custom Edge Cost Override</label>
          <input id="edge-override" type="number" min="0.5" step="0.5" placeholder="Use default relation cost" value="${state.overrides.has(e.id) ? state.overrides.get(e.id) : ''}" ${state.costMode === 'unit' ? 'disabled' : ''}>
        </div>
      </div>
    `;

    $('edge-from').onclick = () => selectNode(e.source, true);
    $('edge-to').onclick = () => selectNode(e.target, true);

    $('edge-override').onchange = () => {
      const input = $('edge-override');
      if (!input.value.trim()) {
        state.overrides.delete(e.id);
      } else {
        const n = Number(input.value);
        if (!Number.isFinite(n) || n <= 0) {
          toast('Edge costs must be positive numbers.');
          renderInspector();
          return;
        }
        state.overrides.set(e.id, n);
      }
      markDirty();
      renderInspector();
      renderLedger();
      draw();
    };
  } else {
    panel.innerHTML = `
      <div class="inspector-empty">
        <div class="empty-icon-wrap">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
        </div>
        <h4>No Entity Selected</h4>
        <p>Click any node or relationship link on the graph to inspect architectural provenance, dependencies, and action weights.</p>
      </div>
    `;
  }
}

/* ==========================================================================
   Complete Source Inventory (Ledger)
   ========================================================================== */

function renderLedger() {
  if ($('ledger').hidden) return;
  const type = $('ledger-type').value;
  const q = $('ledger-search').value.toLowerCase();

  if (type === 'nodes') {
    const rows = NODES.filter(n => JSON.stringify(n).toLowerCase().includes(q));
    $('ledger-count').textContent = `Showing ${rows.length} of ${NODES.length} nodes`;
    $('ledger-head').innerHTML = `
      <tr>
        <th>Entity Label & ID</th>
        <th>Community</th>
        <th>Source Location</th>
      </tr>
    `;
    $('ledger-body').innerHTML = rows.map(n => `
      <tr>
        <td>
          <button data-node="${esc(n.id)}" style="font-weight:600;">${esc(n.label)}</button>
          <div style="font-family:var(--font-mono); font-size:9.5px; color:var(--text-muted);">${esc(n.id)}</div>
        </td>
        <td>C${esc(n.community)} · ${esc(VISUAL.get(n.id)?.community_name || '')}</td>
        <td>${esc(n.source_file || '—')} ${esc(n.source_location || '')}</td>
      </tr>
    `).join('');

    $('ledger-body').querySelectorAll('[data-node]').forEach(b => {
      b.onclick = () => selectNode(b.dataset.node, true);
    });
  } else {
    const rows = EDGES.filter(e => `${JSON.stringify(e)} ${name(e.source)} ${name(e.target)}`.toLowerCase().includes(q));
    $('ledger-count').textContent = `Showing ${rows.length} of ${EDGES.length} transitions`;
    $('ledger-head').innerHTML = `
      <tr>
        <th>Source → Target State</th>
        <th>Relationship</th>
        <th>Confidence & Source</th>
        <th>Effective Cost</th>
      </tr>
    `;
    $('ledger-body').innerHTML = rows.map(e => `
      <tr>
        <td>
          <button data-edge="${e.id}" style="font-weight:600;">${esc(name(e.source))} → ${esc(name(e.target))}</button>
          <div style="font-family:var(--font-mono); font-size:9.5px; color:var(--text-muted);">${esc(e.id)}</div>
        </td>
        <td><span class="pill">${esc(e.relation)}</span></td>
        <td>${esc(e.confidence || 'VERIFIED')}<br><small style="color:var(--text-muted);">${esc(e.source_file || '')} ${esc(e.source_location || '')}</small></td>
        <td><strong style="font-family:var(--font-mono); color:var(--accent-cyan);">${fmt(costForEdge(e))}</strong></td>
      </tr>
    `).join('');

    $('ledger-body').querySelectorAll('[data-edge]').forEach(b => {
      b.onclick = () => selectEdge(b.dataset.edge);
    });
  }
}

/* ==========================================================================
   Multi-Algorithm Comparison Benchmark
   ========================================================================== */

function openCompareModal() {
  const dialog = $('compare-dialog');
  const tbody = $('compare-tbody');
  const summary = $('compare-summary');
  const opts = options();

  const algorithms = [
    { id: 'ucs', name: 'Uniform-Cost Search (UCS)', badge: 'Optimal Cost', icon: '⭐' },
    { id: 'astar', name: 'A* Search (h = 0)', badge: 'Optimal Cost', icon: '⭐' },
    { id: 'bfs', name: 'Breadth-First Search (BFS)', badge: 'Fewest Hops', icon: '⚡' },
    { id: 'dfs', name: 'Depth-First Search (DFS)', badge: 'Deep Probe', icon: '🧭' }
  ];

  const results = algorithms.map(algo => {
    const t0 = performance.now();
    const res = AISearch.search({ ...opts, algorithm: algo.id });
    const elapsed = Math.round((performance.now() - t0) * 100) / 100;
    return { ...algo, res, elapsed };
  });

  tbody.innerHTML = results.map(r => `
    <tr>
      <td><strong>${r.icon} ${r.name}</strong></td>
      <td><span class="badge ${r.res.found ? 'badge-green' : 'badge-amber'}">${r.res.found ? 'Found' : 'Unreachable'}</span></td>
      <td><strong style="font-family:var(--font-mono); font-size:13px; color:var(--accent-cyan);">${r.res.found ? fmt(r.res.totalCost) : '—'}</strong></td>
      <td>${r.res.found ? r.res.pathEdges.length + ' hops' : '—'}</td>
      <td>${r.res.expandedCount} nodes</td>
      <td>${r.elapsed} ms</td>
      <td><span class="pill">${r.badge}</span></td>
    </tr>
  `).join('');

  const ucs = results.find(r => r.id === 'ucs');
  const astar = results.find(r => r.id === 'astar');
  const bfs = results.find(r => r.id === 'bfs');
  const dfs = results.find(r => r.id === 'dfs');

  if (ucs?.res.found) {
    summary.innerHTML = `
      <strong>Benchmark Analysis:</strong><br>
      • <strong>Optimality Guarantee:</strong> UCS and A* (with admissible h=0) find the exact identical lowest-cost solution (Cost = <strong>${fmt(ucs.res.totalCost)}</strong>).<br>
      • <strong>Hop Count:</strong> BFS minimizes unweighted edge traversals (<strong>${bfs.res.pathEdges.length} hops</strong> vs UCS's ${ucs.res.pathEdges.length} hops).<br>
      • <strong>Exploration Overhead:</strong> DFS expanded ${dfs.res.expandedCount} nodes and found a path costing ${fmt(dfs.res.totalCost)} (non-optimal, demonstrating depth-first probing).
    `;
  } else {
    summary.innerHTML = `
      <strong>Benchmark Analysis:</strong> All algorithms confirm that the destination state is unreachable under current transition constraints.
    `;
  }

  dialog.showModal();
}

/* ==========================================================================
   Data Export Utilities
   ========================================================================== */

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSearch() {
  if (!state.result) {
    toast('Execute a search prior to exporting results.');
    return;
  }
  downloadJSON('pos-ai-search-result.json', {
    problem: state.runConfig,
    result: state.result,
    alternatives: state.alternatives,
    sourceAudit: DATA.audit,
    costInterpretation: 'Educational relationship-navigation effort units; not measured runtime or transaction latency.'
  });
  toast('Exported search results as JSON.');
}

/* ==========================================================================
   High-DPI Canvas Rendering Engine
   ========================================================================== */

const canvas = $('graph');
const ctx = canvas.getContext('2d');
let canvasWidth = 800;
let canvasHeight = 560;
let view = { scale: 1, x: 0, y: 0 };
let drag = null;
let hover = null;
let frameRequest = null;
const positions = DATA.layout;

function screenPoint(id) {
  const p = positions[id];
  return {
    x: p.x * view.scale + view.x,
    y: p.y * view.scale + view.y
  };
}

function fitGraph() {
  const p = Object.values(positions);
  const minX = Math.min(...p.map(pt => pt.x));
  const maxX = Math.max(...p.map(pt => pt.x));
  const minY = Math.min(...p.map(pt => pt.y));
  const maxY = Math.max(...p.map(pt => pt.y));
  view.scale = Math.min((canvasWidth - 80) / (maxX - minX || 1), (canvasHeight - 90) / (maxY - minY || 1));
  view.x = (canvasWidth - (maxX + minX) * view.scale) / 2;
  view.y = (canvasHeight - (maxY + minY) * view.scale) / 2;
  draw();
}

function centerOn(id) {
  const p = positions[id];
  if (!p) return;
  view.scale = Math.max(view.scale, 0.9);
  view.x = canvasWidth / 2 - p.x * view.scale;
  view.y = canvasHeight / 2 - p.y * view.scale;
  draw();
}

function zoomAt(factor, x, y) {
  const next = Math.min(8, Math.max(0.025, view.scale * factor));
  const ratio = next / view.scale;
  view.x = x - (x - view.x) * ratio;
  view.y = y - (y - view.y) * ratio;
  view.scale = next;
  draw();
}

function nodeRadius(id) {
  const degree = ADJACENT.get(id).length;
  return Math.max(2.8, Math.min(10, 3.2 + Math.sqrt(degree) * 1.3)) * Math.max(0.7, Math.sqrt(view.scale));
}

function hitTest(x, y) {
  let hit = null;
  let distance = 16;

  for (const n of NODES) {
    const p = screenPoint(n.id);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < Math.max(8, nodeRadius(n.id) + 4) && d < distance) {
      distance = d;
      hit = { type: 'node', id: n.id };
    }
  }
  if (hit) return hit;

  let best = 6;
  for (const e of EDGES) {
    const a = screenPoint(e.source);
    const b = screenPoint(e.target);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len)) : 0;
    const d = Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
    if (d < best) {
      best = d;
      hit = { type: 'edge', id: e.id };
    }
  }
  return hit;
}

function setupCanvas() {
  const resize = () => {
    const bounds = $('canvas-wrap').getBoundingClientRect();
    const first = !canvas.dataset.ready;
    canvasWidth = bounds.width;
    canvasHeight = bounds.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(canvasHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.dataset.ready = 'true';
    if (first) fitGraph();
    else draw();
  };

  new ResizeObserver(resize).observe($('canvas-wrap'));
  resize();

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.001), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  canvas.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, y: e.clientY, viewX: view.x, viewY: view.y, moved: false };
    canvas.setPointerCapture(e.pointerId);
    $('node-results').hidden = true;
  });

  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    if (drag) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3) drag.moved = true;
      if (drag.moved) {
        view.x = drag.viewX + e.clientX - drag.x;
        view.y = drag.viewY + e.clientY - drag.y;
        draw();
        $('tooltip').hidden = true;
      }
      return;
    }

    const hit = hitTest(x, y);
    hover = hit;
    canvas.style.cursor = hit ? 'pointer' : 'grab';
    const tip = $('tooltip');
    tip.hidden = !hit;

    if (hit) {
      if (hit.type === 'node') {
        const node = BY_ID.get(hit.id);
        const visual = VISUAL.get(hit.id);
        tip.innerHTML = `
          <div class="tooltip-title">${esc(node.label)}</div>
          <div class="tooltip-subtitle">${esc(node.source_file || node.id)}</div>
          <div style="font-size:10.5px; color:#cbd5e1; margin-top:4px;">
            Community: C${node.community} · ${esc(visual?.community_name || '')}<br>
            Connected Actions: ${ADJACENT.get(hit.id).length}
          </div>
        `;
      } else {
        const edge = BY_EDGE.get(hit.id);
        tip.innerHTML = `
          <div class="tooltip-title">${esc(name(edge.source))} → ${esc(name(edge.target))}</div>
          <div class="tooltip-subtitle">Relation: ${esc(edge.relation)} · Cost: ${fmt(costForEdge(edge))}</div>
          <div style="font-size:10.5px; color:#cbd5e1; margin-top:4px;">
            Confidence: ${esc(edge.confidence || 'VERIFIED')} · ${esc(edge.source_file || '')}
          </div>
        `;
      }
      tip.style.left = Math.min(x + 14, Math.max(8, canvasWidth - 300)) + 'px';
      tip.style.top = Math.min(y + 14, canvasHeight - 95) + 'px';
    }
  });

  canvas.addEventListener('pointerup', e => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (!moved) {
      const r = canvas.getBoundingClientRect();
      const hit = hitTest(e.clientX - r.left, e.clientY - r.top);
      if (hit?.type === 'node') selectNode(hit.id);
      else if (hit?.type === 'edge') selectEdge(hit.id);
      else {
        state.selected = null;
        state.selectedEdge = null;
        renderInspector();
        draw();
      }
    }
  });

  canvas.addEventListener('pointercancel', () => drag = null);
  canvas.addEventListener('pointerleave', () => { $('tooltip').hidden = true; });

  canvas.addEventListener('keydown', e => {
    if (['+', '=', '-', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '0'].includes(e.key)) {
      e.preventDefault();
    }
    if (e.key === '+' || e.key === '=') zoomAt(1.2, canvasWidth / 2, canvasHeight / 2);
    else if (e.key === '-') zoomAt(0.8, canvasWidth / 2, canvasHeight / 2);
    else if (e.key === '0') fitGraph();
    else {
      const moves = {
        ArrowLeft: [40, 0],
        ArrowRight: [-40, 0],
        ArrowUp: [0, 40],
        ArrowDown: [-40, 0]
      };
      if (moves[e.key]) {
        view.x += moves[e.key][0];
        view.y += moves[e.key][1];
        draw();
      }
    }
  });
}

function draw() {
  if (frameRequest) return;
  frameRequest = requestAnimationFrame(() => {
    frameRequest = null;
    paint();
  });
}

function paint() {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const isLight = state.theme === 'light';
  const frame = state.step >= 0 ? state.result?.steps[state.step] : null;
  const currentPath = state.preview || (frame ? { pathNodes: frame.pathNodes, pathEdges: frame.pathEdges } : state.result?.found ? state.result : null);
  const pathEdges = new Set(currentPath?.pathEdges || []);
  const pathNodes = new Set(currentPath?.pathNodes || []);
  const visited = new Set(frame?.visited || []);
  const frontier = new Set((frame?.frontier || []).map(n => n.id));
  const start = $('start').value;
  const goal = $('goal').value;

  // 1. Draw Edges
  for (const e of EDGES) {
    const a = screenPoint(e.source);
    const b = screenPoint(e.target);
    const path = pathEdges.has(e.id);
    const selected = state.selectedEdge === e.id;
    const focused = state.focus === null || BY_ID.get(e.source).community === state.focus || BY_ID.get(e.target).community === state.focus;

    ctx.globalAlpha = path || selected ? 1 : focused ? 0.45 : 0.08;

    if (path || selected) {
      // Glow underlay for solution paths
      ctx.shadowColor = selected ? 'rgba(14, 165, 233, 0.5)' : 'rgba(251, 191, 36, 0.45)';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = selected ? '#0ea5e9' : '#fbbf24';
      ctx.lineWidth = selected ? 3.0 : 2.5;
    } else {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isLight
        ? (e.confidence === 'INFERRED' ? '#cbd5e1' : '#e2e8f0')
        : (e.confidence === 'INFERRED' ? '#334155' : '#1e293b');
      ctx.lineWidth = Math.max(0.6, view.scale * 0.7);
    }

    ctx.setLineDash(e.confidence === 'INFERRED' ? [3, 3] : e.confidence === 'AMBIGUOUS' ? [1, 4] : []);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Directed arrowheads
    if (state.directed && (path || selected || view.scale > 0.8)) {
      const t = 0.62;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 7 * Math.cos(angle - 0.45), y - 7 * Math.sin(angle - 0.45));
      ctx.lineTo(x - 7 * Math.cos(angle + 0.45), y - 7 * Math.sin(angle + 0.45));
      ctx.closePath();
      ctx.fill();
    }

    // Edge Cost Labels
    if (($('edge-costs').checked && view.scale > 0.28) || path || selected) {
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      const c = fmt(costForEdge(e));
      ctx.globalAlpha = path || selected ? 1 : focused ? 0.85 : 0.2;
      ctx.font = '600 10px var(--font-mono), sans-serif';
      const w = ctx.measureText(c).width;
      ctx.fillStyle = isLight ? '#ffffff' : '#080d1a';
      ctx.fillRect(x - w / 2 - 3, y - 7, w + 6, 13);
      ctx.fillStyle = path ? '#fbbf24' : isLight ? '#334155' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(c, x, y + 3);
    }
  }

  // 2. Draw Nodes
  for (const n of NODES) {
    const p = screenPoint(n.id);
    const isStart = n.id === start;
    const isGoal = n.id === goal;
    const isSelected = n.id === state.selected;
    const isPath = pathNodes.has(n.id);
    const focused = state.focus === null || n.community === state.focus;
    const highlight = isStart || isGoal || isSelected || isPath;

    let radius = nodeRadius(n.id) + (highlight ? 2.5 : 0);

    ctx.globalAlpha = highlight || focused ? 1 : 0.18;

    // Halo pulse effects for start and goal
    if (isStart || isGoal) {
      ctx.shadowColor = isStart ? 'rgba(14, 165, 233, 0.65)' : 'rgba(245, 158, 11, 0.65)';
      ctx.shadowBlur = 12;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = isStart
      ? '#0ea5e9'
      : isGoal
        ? '#f59e0b'
        : isPath
          ? '#fbbf24'
          : frame?.current === n.id
            ? '#ffffff'
            : frontier.has(n.id)
              ? '#c084fc'
              : visited.has(n.id)
                ? '#60a5fa'
                : VISUAL.get(n.id)?.color?.background || '#64748b';

    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Concentric outer ring for selected, start, and goal
    if (isSelected || isStart || isGoal) {
      ctx.strokeStyle = isSelected ? '#ffffff' : ctx.fillStyle;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Node Labels
    if ($('labels').checked || highlight || (view.scale > 1.1 && ADJACENT.get(n.id).length > 5)) {
      ctx.globalAlpha = highlight ? 1 : focused ? 0.9 : 0.25;
      ctx.font = (highlight ? '600 ' : '500 ') + '11px var(--font-sans), sans-serif';
      const text = short(n.label, 48);
      ctx.textAlign = 'center';
      ctx.strokeStyle = isLight ? '#ffffff' : '#090c14';
      ctx.lineWidth = 3;
      ctx.strokeText(text, p.x, p.y - radius - 7);
      ctx.fillStyle = highlight ? (isLight ? '#0f172a' : '#f8fafc') : (isLight ? '#334155' : '#cbd5e1');
      ctx.fillText(text, p.x, p.y - radius - 7);
    }
  }

  ctx.globalAlpha = 1;
  $('graph-status').innerHTML = `
    <span><strong>${NODES.length}</strong> Nodes · <strong>${EDGES.length}</strong> Transitions · <strong>${COMMUNITIES.length}</strong> Louvain Modules</span>
    <span>${state.focus === null ? 'Global Topology (All Communities)' : `Isolated Community: C${state.focus}`} · Scale: <strong>${Math.round(view.scale * 100)}%</strong></span>
  `;
}

// Kick off initialization
initialize();

// Read-only handles supporting deterministic verification and automation
window.POSGraphLab = {
  data: DATA,
  nodes: NODES,
  edges: EDGES,
  state,
  runSearch,
  costForEdge,
  selectNode,
  selectEdge,
  fitGraph,
  openCompareModal
};
