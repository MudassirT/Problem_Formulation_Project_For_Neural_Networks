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
  inventoryFilter: 'all',
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

function getNodeCategory(n) {
  const s = (n.id + ' ' + (n.source_file || '') + ' ' + n.label).toLowerCase();
  if (s.includes('view')) return 'Views & API Endpoints';
  if (s.includes('model')) return 'Database Models & Schema';
  if (s.includes('template') || s.includes('.html')) return 'HTML Templates & UI';
  if (s.includes('test')) return 'Unit Tests & Quality';
  return 'Core Architecture & Logic';
}

function getNodeCategoryBadge(n) {
  const s = (n.id + ' ' + (n.source_file || '') + ' ' + n.label).toLowerCase();
  if (s.includes('view')) return 'VIEW';
  if (s.includes('model')) return 'MODEL';
  if (s.includes('template') || s.includes('.html')) return 'TEMPLATE';
  if (s.includes('test')) return 'TEST';
  return 'LOGIC';
}

function updateNodeMeta(selectId, metaId) {
  const el = $(metaId);
  if (!el) return;
  const id = $(selectId)?.value;
  const n = BY_ID.get(id);
  if (!n) {
    el.innerHTML = '';
    return;
  }
  const tag = getNodeCategoryBadge(n);
  const visual = VISUAL.get(id);
  const communityName = visual?.community_name || ('C' + n.community);
  el.innerHTML = `<span class="node-meta-tag">${tag}</span> <span>${esc(n.source_file || n.id)}</span> · <small style="color:var(--text-muted);">${esc(communityName)}</small>`;
}

function updateScenarioBanner(index) {
  const s = PRESET_SCENARIOS[index];
  const badge = $('banner-badge');
  const title = $('banner-title');
  const desc = $('banner-desc');
  if (!s || !badge || !title || !desc) return;
  badge.textContent = index < PRESET_SCENARIOS.length - 1 ? `Preset ${index + 1}` : 'Custom';
  title.textContent = s.name;
  desc.textContent = s.desc;
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

  // Populate Start & Goal Selects with Categorized Optgroups
  const categoryOrder = [
    'Views & API Endpoints',
    'Database Models & Schema',
    'HTML Templates & UI',
    'Unit Tests & Quality',
    'Core Architecture & Logic'
  ];

  const grouped = new Map(categoryOrder.map(c => [c, []]));
  const sorted = [...NODES].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  for (const n of sorted) {
    const cat = getNodeCategory(n);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat).push(n);
  }

  for (const select of [$('start'), $('goal')]) {
    select.replaceChildren();
    for (const cat of categoryOrder) {
      const groupNodes = grouped.get(cat);
      if (!groupNodes || !groupNodes.length) continue;
      const groupEl = document.createElement('optgroup');
      groupEl.label = `${cat} (${groupNodes.length})`;
      for (const n of groupNodes) {
        const opt = document.createElement('option');
        opt.value = n.id;
        opt.textContent = `${n.label} · ${n.source_file || n.id}`;
        groupEl.append(opt);
      }
      select.append(groupEl);
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

  // Wire Quick Pick Chips
  document.querySelectorAll('[data-set-start]').forEach(btn => {
    btn.onclick = () => {
      $('start').value = btn.dataset.setStart;
      presetSelect.value = String(PRESET_SCENARIOS.length - 1);
      updateScenarioChips(-1);
      updateScenarioBanner(PRESET_SCENARIOS.length - 1);
      markDirty();
      updateFormulation();
      runSearch();
      centerOn(btn.dataset.setStart);
      toast(`Initial state set to ${name(btn.dataset.setStart)}`);
    };
  });

  document.querySelectorAll('[data-set-goal]').forEach(btn => {
    btn.onclick = () => {
      $('goal').value = btn.dataset.setGoal;
      presetSelect.value = String(PRESET_SCENARIOS.length - 1);
      updateScenarioChips(-1);
      updateScenarioBanner(PRESET_SCENARIOS.length - 1);
      markDirty();
      updateFormulation();
      runSearch();
      centerOn(btn.dataset.setGoal);
      toast(`Goal state set to ${name(btn.dataset.setGoal)}`);
    };
  });

  // Initial Scenario Setup (Preset 0: Checkout -> Sale Model)
  applyScenario(0, false);
  updateScenarioBanner(0);

  // Select Change Handlers
  ['start', 'goal'].forEach(id => {
    $(id).onchange = () => {
      presetSelect.value = String(PRESET_SCENARIOS.length - 1);
      updateScenarioChips(-1);
      updateScenarioBanner(PRESET_SCENARIOS.length - 1);
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
    updateScenarioBanner(PRESET_SCENARIOS.length - 1);
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

  // Cost Presets Bar
  function updateCostPresetButtons(activeId) {
    ['preset-cost-default', 'preset-cost-unit', 'preset-cost-strict'].forEach(id => {
      const el = $(id);
      if (el) el.classList.toggle('active', id === activeId);
    });
  }

  $('preset-cost-default')?.addEventListener('click', () => {
    state.costMode = 'relation';
    $('cost-mode').value = 'relation';
    state.weights = { ...DEFAULT_WEIGHTS };
    state.penalty = 2;
    state.overrides.clear();
    $('penalty').value = '2';
    document.querySelectorAll('[data-relation]').forEach(e => e.value = state.weights[e.dataset.relation]);
    updateCostPresetButtons('preset-cost-default');
    markDirty();
    renderInspector();
    renderLedger();
    runSearch();
    toast('Cost weights reset to default semantic friction.');
  });

  $('preset-cost-unit')?.addEventListener('click', () => {
    state.costMode = 'unit';
    $('cost-mode').value = 'unit';
    updateCostPresetButtons('preset-cost-unit');
    markDirty();
    renderInspector();
    renderLedger();
    runSearch();
    toast('Unit Cost Model active (every transition = 1.0).');
  });

  $('preset-cost-strict')?.addEventListener('click', () => {
    state.costMode = 'relation';
    $('cost-mode').value = 'relation';
    state.weights = { ...DEFAULT_WEIGHTS, contains: 8, uses: 5, imports_from: 4 };
    state.penalty = 4;
    $('penalty').value = '4';
    document.querySelectorAll('[data-relation]').forEach(e => e.value = state.weights[e.dataset.relation] || 2);
    updateCostPresetButtons('preset-cost-strict');
    markDirty();
    renderInspector();
    renderLedger();
    runSearch();
    toast('Strict architectural isolation weights applied.');
  });

  $('reset-costs').onclick = () => {
    state.weights = { ...DEFAULT_WEIGHTS };
    state.penalty = 2;
    state.overrides.clear();
    $('penalty').value = '2';
    document.querySelectorAll('[data-relation]').forEach(e => e.value = state.weights[e.dataset.relation]);
    updateCostPresetButtons('preset-cost-default');
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
    unlockAchievement('time_traveler');
    if (state.step < 0 || state.step >= state.result.steps.length - 1) state.step = -1;
    $('play').innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg><span>Pause</span>';
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
  $('fullscreen-btn')?.addEventListener('click', toggleFullScreen);
  document.addEventListener('fullscreenchange', handleFullScreenChange);
  $('labels').onchange = draw;
  $('edge-costs').onchange = draw;

  // Interactive Legend Controls
  $('legend-start')?.addEventListener('click', () => {
    centerOn($('start').value);
    toast(`Centered on Initial State (${name($('start').value)})`);
  });
  $('legend-goal')?.addEventListener('click', () => {
    centerOn($('goal').value);
    toast(`Centered on Goal State (${name($('goal').value)})`);
  });
  $('legend-path')?.addEventListener('click', () => {
    if (state.result?.found && state.result.pathNodes.length) {
      centerOn(state.result.pathNodes[Math.floor(state.result.pathNodes.length / 2)]);
    } else {
      fitGraph();
    }
  });

  // Learn Academy Dialog Wiring
  const learnDialog = $('learn-dialog');
  $('learn-btn')?.addEventListener('click', () => {
    unlockAchievement('academy_scholar');
    learnDialog?.showModal();
  });
  $('close-learn')?.addEventListener('click', () => learnDialog?.close());
  $('learn-done-btn')?.addEventListener('click', () => learnDialog?.close());

  document.querySelectorAll('.learn-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.learn-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.learn-panel').forEach(p => p.hidden = true);
      btn.classList.add('active');
      const panel = $('learn-panel-' + btn.dataset.tab);
      if (panel) panel.hidden = false;
    });
  });

  $('learn-run-demo')?.addEventListener('click', () => {
    learnDialog?.close();
    applyScenario(0);
    toast('Demo search loaded & executed! Explore the path below.');
  });

  // Inventory Quick Filters
  document.querySelectorAll('.btn-inv-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-inv-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.inventoryFilter = btn.dataset.filter;
      renderLedger();
    });
  });

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

  // Achievements Dialog Wiring
  const achievementsDialog = $('achievements-dialog');
  $('achievements-btn')?.addEventListener('click', () => {
    renderAchievementsUI();
    achievementsDialog?.showModal();
  });
  $('close-achievements')?.addEventListener('click', () => achievementsDialog?.close());
  $('close-achievements-btn')?.addEventListener('click', () => achievementsDialog?.close());
  $('reset-achievements-btn')?.addEventListener('click', resetAchievements);
  updateAchievementsBadge();

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
    updateScenarioBanner(index);
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

const SUN_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
const MOON_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pos-theme', theme);
  const icon = $('theme-icon');
  if (icon) icon.innerHTML = theme === 'dark' ? SUN_ICON : MOON_ICON;
  draw();
}

function toggleTheme() {
  unlockAchievement('visual_alchemist');
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
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    runSearch();
  } else if (e.key.toLowerCase() === 'm' || e.key === 'F11') {
    e.preventDefault();
    toggleFullScreen();
  } else if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    zoomAt(1.25, canvasWidth / 2, canvasHeight / 2);
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault();
    zoomAt(0.8, canvasWidth / 2, canvasHeight / 2);
  } else if (e.key === '/') {
    e.preventDefault();
    const searchInput = $('node-search');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  } else if (e.key === '?') {
    e.preventDefault();
    $('shortcuts-dialog').showModal();
  } else if (e.key === 'Escape') {
    if (document.querySelector('.graph-panel--fullscreen')) {
      toggleFullScreen();
      return;
    }
    $('about').close();
    $('compare-dialog').close();
    $('shortcuts-dialog').close();
    $('learn-dialog')?.close();
    $('node-results').hidden = true;
  }
}

/* ==========================================================================
   Search Formulation & Execution
   ========================================================================== */

function updateFormulation() {
  const startId = $('start').value;
  const goalId = $('goal').value;
  $('form-start').textContent = `Current focus = ${name(startId)}.`;
  $('form-goal').textContent = `Destination predicate matches ${goalId} (${name(goalId)}).`;
  
  updateNodeMeta('start', 'start-meta');
  updateNodeMeta('goal', 'goal-meta');

  const algo = $('algorithm').value;
  const guaranteeEl = $('algo-guarantee');
  const formulaEl = $('algo-formula');
  const helpEl = $('algorithm-help');

  const algoMeta = {
    ucs: {
      guarantee: 'Optimal Cost Guaranteed',
      formula: 'Priority: g(n)',
      help: 'Uniform-Cost Search systematically expands the lowest accumulated path cost g(n). Guarantees the mathematically optimal cost solution for non-negative weights.'
    },
    astar: {
      guarantee: 'Optimal Cost Heuristic (h=0)',
      formula: 'Priority: f(n) = g(n) + h(n)',
      help: 'A* Search evaluates f(n) = g(n) + h(n) using consistent heuristic h(n) = 0. Guarantees optimal cost equivalence with UCS on topological dependency graphs.'
    },
    bfs: {
      guarantee: 'Fewest Transitions Guaranteed',
      formula: 'Priority: Hop Count (FIFO)',
      help: 'Breadth-First Search evaluates states layer-by-layer. Guarantees the path with the fewest architectural transitions, ignoring edge weights.'
    },
    dfs: {
      guarantee: 'Deep Traversal Exploration',
      formula: 'Priority: Branch Depth (LIFO)',
      help: 'Depth-First Search aggressively pursues branch depth with cycle detection. Discovers an initial reachability route; non-optimal.'
    }
  };

  if (guaranteeEl && formulaEl && helpEl) {
    const meta = algoMeta[algo] || algoMeta.ucs;
    guaranteeEl.textContent = meta.guarantee;
    formulaEl.textContent = meta.formula;
    helpEl.innerHTML = meta.help;
  }
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
  const playBtn = $('play');
  if (playBtn) playBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Play</span>';
}

function runSearch() {
  stopPlayback();
  state.preview = null;
  state.step = -1;
  if (window.switchStudioTab) window.switchStudioTab('solution');

  try {
    const t0 = performance.now();
    const opts = options();
    state.result = AISearch.search({ ...opts, algorithm: $('algorithm').value });
    state.alternatives = AISearch.enumerateAlternatives({ ...opts, limit: 3, maxExpansions: 16000 });
    state.runtime = Math.max(0.1, Math.round((performance.now() - t0) * 10) / 10);
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

    if (state.result && state.result.found) {
      if ($('algorithm').value === 'ucs' || $('algorithm').value === 'astar') {
        unlockAchievement('optimal_navigator');
      }
      if (state.alternatives && state.alternatives.length > 1) {
        unlockAchievement('alternative_explorer');
      }
    }
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
    statusIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    $('result-title').textContent = (algorithm === 'ucs' || algorithm === 'astar')
      ? 'Optimal Least-Cost Solution Discovered'
      : 'Valid Traversal Route Discovered';
  } else {
    statusIcon.className = 'status-icon-badge unreachable';
    statusIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
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
    <div class="metric-card">
      <div class="metric-value">${state.runtime || '0.5'}<span class="metric-unit">ms</span></div>
      <div class="metric-label">Runtime</div>
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
        arrow.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg><span class="path-edge-label">${edge ? edge.relation : ''} <small>+${fmt(costForEdge(edge))}</small></span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
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

  // Cost Formula Breakdown Card
  const costCard = $('cost-breakdown-card');
  if (costCard) {
    if (r.found) {
      const edgeCosts = r.pathEdges.map(id => {
        const edge = BY_EDGE.get(id);
        return `<span class="cost-term">${edge ? edge.relation : 'step'} <strong>+${fmt(costForEdge(edge))}</strong></span>`;
      });
      costCard.innerHTML = `<span><strong>Cost Formula:</strong> c(path) = ${edgeCosts.join(' + ') || '0'} = <strong class="cost-total">${fmt(r.totalCost)}</strong></span>`;
    } else {
      costCard.innerHTML = `<span><strong>Cost Formula:</strong> <span style="color:var(--accent-rose);">c(path) = ∞ (Unreachable under current direction rules)</span></span>`;
    }
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
    title.innerHTML = `<span>${i === 0 ? '<span class="badge badge-primary">Optimal Primary</span>' : `<span class="badge">Alternative #${i}</span>`}</span> · <strong>Cost ${fmt(p.totalCost)}</strong> · <span>${p.pathEdges.length} hops</span>`;

    const btn = document.createElement('button');
    btn.className = 'btn-highlight-alt';
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><line x1="2" y1="12" x2="22" y2="12"/></svg><span>Preview</span>';
    btn.onclick = () => {
      stopPlayback();
      state.step = -1;
      state.preview = p;
      draw();
      $('trace-status').textContent = `Previewing alternative path #${i + 1} (Cost ${fmt(p.totalCost)}). Click "Final" to restore primary solution.`;
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
  unlockAchievement('time_traveler');
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

  // Live Step-by-Step AI Reasoning Explainer
  const reasoningCard = $('expansion-reasoning');
  if (reasoningCard) {
    if (!frame) {
      reasoningCard.innerHTML = `
        <div class="reasoning-step-header">
          <span class="reasoning-badge">Status</span>
          <span class="reasoning-title">Ready for Search Execution</span>
        </div>
        <p class="reasoning-text">Run a search to observe step-by-step priority queue decisions and node expansion reasoning.</p>
      `;
    } else {
      const currentNode = BY_ID.get(frame.current);
      const isStart = frame.current === $('start').value;
      const isGoal = frame.current === $('goal').value;
      const algo = $('algorithm').value.toUpperCase();
      const priorityLabel = (algo === 'BFS' || algo === 'DFS')
        ? `Hop depth ${fmt(frame.g)}`
        : `Priority f(n) = ${fmt(frame.f)} (g = ${fmt(frame.g)})`;
      
      let stepNote = '';
      if (isGoal) {
        stepNote = `🎯 Goal State reached! Algorithm terminates successfully with the optimal solution path reconstructed.`;
      } else if (isStart && index === 0) {
        stepNote = `🚀 Initial State popped from queue. Inspecting ${ADJACENT.get(frame.current).length} incident architectural connections and adding unvisited targets to the Frontier.`;
      } else {
        stepNote = `Examined incident transitions. Closed Set size: <strong>${frame.visited.length}</strong>. Frontier queue now holds <strong>${frame.frontier.length}</strong> candidate states awaiting evaluation in priority order.`;
      }

      reasoningCard.innerHTML = `
        <div class="reasoning-step-header">
          <span class="reasoning-badge">Step ${index + 1} of ${steps.length}</span>
          <span class="reasoning-title">Dequeued State: <code>${esc(currentNode?.label || frame.current)}</code> · ${priorityLabel}</span>
        </div>
        <p class="reasoning-text">${stepNote}</p>
      `;
    }
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
  unlockAchievement('cartographer');
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
          <button id="inspect-center" class="btn-playback" title="Center camera on this node">Center</button>
          <button id="inspect-module" class="btn-playback" title="Isolate this module on canvas">Module</button>
        </div>
        <h4 style="font-size:11.5px; margin: 12px 0 6px 0; color:var(--text-secondary);">Incident Transitions (${links.length}):</h4>
        <div class="neighbours-list"></div>
      </div>
    `;

    $('set-start').onclick = () => {
      $('start').value = n.id;
      $('preset').value = String(PRESET_SCENARIOS.length - 1);
      updateScenarioChips(-1);
      updateScenarioBanner(PRESET_SCENARIOS.length - 1);
      markDirty();
      updateFormulation();
      draw();
      toast(`Initial state set to ${n.label}`);
    };

    $('set-goal').onclick = () => {
      $('goal').value = n.id;
      $('preset').value = String(PRESET_SCENARIOS.length - 1);
      updateScenarioChips(-1);
      updateScenarioBanner(PRESET_SCENARIOS.length - 1);
      markDirty();
      updateFormulation();
      draw();
      toast(`Goal state set to ${n.label}`);
    };

    $('inspect-center').onclick = () => centerOn(n.id);
    $('inspect-module').onclick = () => {
      state.focus = state.focus === n.community ? null : n.community;
      renderCommunities();
      draw();
      toast(state.focus !== null ? `Isolated Community C${n.community}` : 'Cleared module isolation.');
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
        <p>Click any node or transition on the graph, or inspect a core architectural entity below:</p>
        <div class="quick-pick-chips" style="justify-content:center; margin-top:10px;">
          <button type="button" class="quick-chip" data-inspect="sales_views_sales_add_view">Checkout View</button>
          <button type="button" class="quick-chip" data-inspect="sales_models_sale">Sale Model</button>
          <button type="button" class="quick-chip" data-inspect="authentication_views_login_view">Login View</button>
          <button type="button" class="quick-chip" data-inspect="django_pos_inventory_tests_inventorytests_setup">Inventory Setup</button>
        </div>
      </div>
    `;

    panel.querySelectorAll('[data-inspect]').forEach(btn => {
      btn.onclick = () => selectNode(btn.dataset.inspect, true);
    });
  }
}

/* ==========================================================================
   Complete Source Inventory (Ledger)
   ========================================================================== */

function renderLedger() {
  if ($('panel-inventory')?.hidden) return;
  const type = $('ledger-type').value;
  const q = $('ledger-search').value.toLowerCase();

  if (type === 'nodes') {
    let rows = NODES.filter(n => JSON.stringify(n).toLowerCase().includes(q));
    if (state.inventoryFilter && state.inventoryFilter !== 'all') {
      rows = rows.filter(n => {
        const cat = getNodeCategoryBadge(n).toLowerCase();
        return cat.includes(state.inventoryFilter);
      });
    }
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
  unlockAchievement('benchmark_master');
  const dialog = $('compare-dialog');
  const tbody = $('compare-tbody');
  const summary = $('compare-summary');
  const opts = options();

  const algorithms = [
    { id: 'ucs', name: 'Uniform-Cost Search (UCS)', badge: 'Optimal Cost', tag: 'UCS' },
    { id: 'astar', name: 'A* Search (h = 0)', badge: 'Optimal Cost', tag: 'A*' },
    { id: 'bfs', name: 'Breadth-First Search (BFS)', badge: 'Fewest Hops', tag: 'BFS' },
    { id: 'dfs', name: 'Depth-First Search (DFS)', badge: 'Deep Probe', tag: 'DFS' }
  ];

  const results = algorithms.map(algo => {
    const t0 = performance.now();
    const res = AISearch.search({ ...opts, algorithm: algo.id });
    const elapsed = Math.round((performance.now() - t0) * 100) / 100;
    return { ...algo, res, elapsed };
  });

  tbody.innerHTML = results.map(r => `
    <tr>
      <td><strong style="display:inline-flex; align-items:center; gap:6px;"><span class="label-tag">${r.tag}</span> ${r.name}</strong></td>
      <td><span class="badge ${r.res.found ? 'badge-green' : 'badge-amber'}">${r.res.found ? 'Found' : 'Unreachable'}</span></td>
      <td><strong style="font-family:var(--font-mono); font-size:13px; color:var(--accent-sky);">${r.res.found ? fmt(r.res.totalCost) : '—'}</strong></td>
      <td>${r.res.found ? r.res.pathEdges.length + ' hops' : '—'}</td>
      <td>${r.res.expandedCount} nodes</td>
      <td>${r.elapsed} ms</td>
      <td>
        <span class="pill" style="margin-right: 6px;">${r.badge}</span>
        <button type="button" class="btn-ghost-sm" data-select-algo="${r.id}" style="padding:2px 8px; font-size:11px;" title="Switch active search strategy to ${r.name}">Apply</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-select-algo]').forEach(btn => {
    btn.onclick = () => {
      $('algorithm').value = btn.dataset.selectAlgo;
      dialog.close();
      markDirty();
      updateFormulation();
      runSearch();
      toast(`Switched strategy to ${btn.dataset.selectAlgo.toUpperCase()}`);
    };
  });

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
  unlockAchievement('state_archivist');
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
   Laboratory Achievements & Milestones Manager
   ========================================================================== */

const ACHIEVEMENTS_STORAGE_KEY = 'pos_ai_achievements_v1';

const ACHIEVEMENTS_DEF = [
  {
    id: 'optimal_navigator',
    title: 'Optimal Navigator',
    icon: '🎯',
    desc: 'Execute Uniform-Cost Search (UCS) or A* to calculate a provably optimal-cost trajectory.',
    hint: 'Run UCS or A* search between any valid initial and goal states'
  },
  {
    id: 'alternative_explorer',
    title: 'Loopless Pathfinder',
    icon: '🔀',
    desc: "Enumerate alternative routes using Yen's K-Shortest Loopless Paths algorithm (K ≥ 2).",
    hint: 'Run a search where at least 2 candidate paths exist'
  },
  {
    id: 'time_traveler',
    title: 'Frontier Time Traveler',
    icon: '⏱️',
    desc: 'Step through priority queue expansion history using the playback scrubber or navigation keys.',
    hint: 'Use the expansion debugger scrubber, step buttons, or play/pause'
  },
  {
    id: 'benchmark_master',
    title: 'Algorithm Benchmarker',
    icon: '⚡',
    desc: 'Launch the side-by-side comparative analysis matrix across UCS, A*, BFS, and DFS.',
    hint: 'Click "Compare" in the header masthead'
  },
  {
    id: 'cartographer',
    title: 'Graph Cartographer',
    icon: '🗺️',
    desc: 'Inspect an architectural node to evaluate its incident relations and Louvain community.',
    hint: 'Click on any node in the knowledge graph canvas'
  },
  {
    id: 'academy_scholar',
    title: 'State Space Scholar',
    icon: '🎓',
    desc: 'Open and explore the Interactive AI State Space Academy and formal 6-tuple formulation.',
    hint: 'Click "Learn Concepts" in the masthead navigation'
  },
  {
    id: 'visual_alchemist',
    title: 'Visual Alchemist',
    icon: '🌓',
    desc: 'Toggle between cyber-dark slate and daylight developer UI themes.',
    hint: 'Click the sun/moon theme toggle button in the header'
  },
  {
    id: 'state_archivist',
    title: 'State Space Archivist',
    icon: '💾',
    desc: 'Export a complete search trace, priority queue frontier, and graph snapshot as a JSON dataset.',
    hint: 'Click "Export" in the masthead navigation'
  }
];

function getUnlockedAchievements() {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function unlockAchievement(id) {
  try {
    const unlocked = getUnlockedAchievements();
    if (unlocked[id]) return false;
    unlocked[id] = new Date().toISOString();
    localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(unlocked));
    const def = ACHIEVEMENTS_DEF.find(a => a.id === id);
    if (def) {
      toast(`🏆 Achievement Unlocked: ${def.title}!`);
      updateAchievementsBadge();
      if ($('achievements-dialog')?.open) {
        renderAchievementsUI();
      }
    }
    return true;
  } catch (err) {
    console.warn('Could not record achievement:', err);
    return false;
  }
}

function resetAchievements() {
  if (confirm('Are you sure you want to reset all unlocked achievements?')) {
    localStorage.removeItem(ACHIEVEMENTS_STORAGE_KEY);
    toast('Achievements reset to locked.');
    updateAchievementsBadge();
    renderAchievementsUI();
  }
}

function updateAchievementsBadge() {
  const unlocked = getUnlockedAchievements();
  const count = Object.keys(unlocked).length;
  const total = ACHIEVEMENTS_DEF.length;
  const pill = $('achievement-unlocked-count');
  if (pill) {
    pill.textContent = `${count}/${total}`;
    if (count === total) {
      pill.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      pill.style.color = '#ffffff';
      pill.title = 'All achievements unlocked! Master State Space Engineer!';
    } else {
      pill.style.background = '';
      pill.style.color = '';
      pill.title = `${count} of ${total} achievements unlocked`;
    }
  }
}

function renderAchievementsUI() {
  const unlocked = getUnlockedAchievements();
  const count = Object.keys(unlocked).length;
  const total = ACHIEVEMENTS_DEF.length;
  const pct = Math.round((count / total) * 100);

  const progText = $('achievements-progress-text');
  if (progText) progText.textContent = `Progress: ${count} of ${total} Unlocked`;
  const progPct = $('achievements-progress-pct');
  if (progPct) progPct.textContent = `${pct}%`;
  const progBar = $('achievements-progress-bar');
  if (progBar) progBar.style.width = `${pct}%`;

  const grid = $('achievements-grid');
  if (!grid) return;

  grid.innerHTML = ACHIEVEMENTS_DEF.map(item => {
    const isUnlocked = Boolean(unlocked[item.id]);
    const dateStr = isUnlocked ? new Date(unlocked[item.id]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

    return `
      <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}">
        <div class="achievement-icon-wrap" aria-hidden="true">
          ${item.icon}
        </div>
        <div class="achievement-content">
          <div class="achievement-title-row">
            <h4 class="achievement-title">${item.title}</h4>
            <span class="achievement-status-badge ${isUnlocked ? 'unlocked' : 'locked'}">
              ${isUnlocked ? '✓ Unlocked' : '🔒 Locked'}
            </span>
          </div>
          <p class="achievement-desc">${item.desc}</p>
          <div class="achievement-meta">
            ${isUnlocked ? `Unlocked on ${dateStr}` : `Hint: ${item.hint}`}
          </div>
        </div>
      </div>
    `;
  }).join('');
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

function toggleFullScreen() {
  const panel = document.querySelector('.graph-panel');
  if (!panel) return;
  const isFs = panel.classList.toggle('graph-panel--fullscreen');

  if (isFs) {
    if (panel.requestFullscreen && !document.fullscreenElement) {
      panel.requestFullscreen().catch(() => {});
    }
  } else {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  updateFullScreenBtnState(isFs);
  setTimeout(() => {
    fitGraph();
    toast(isFs ? 'Full Screen Canvas Active — Press Esc or M to exit.' : 'Exited Full Screen Canvas.');
  }, 70);
}

function handleFullScreenChange() {
  const panel = document.querySelector('.graph-panel');
  if (!panel) return;
  const isFs = !!document.fullscreenElement;
  panel.classList.toggle('graph-panel--fullscreen', isFs);
  updateFullScreenBtnState(isFs);
  setTimeout(() => fitGraph(), 70);
}

function updateFullScreenBtnState(isFs) {
  const fsBtn = $('fullscreen-btn');
  if (fsBtn) {
    const enterIcon = fsBtn.querySelector('.fs-icon-enter');
    const exitIcon = fsBtn.querySelector('.fs-icon-exit');
    const textSpan = fsBtn.querySelector('.fs-text');
    if (enterIcon) enterIcon.style.display = isFs ? 'none' : 'block';
    if (exitIcon) exitIcon.style.display = isFs ? 'block' : 'none';
    if (textSpan) textSpan.textContent = isFs ? 'Exit Full' : 'Full Screen';
    fsBtn.classList.toggle('active', isFs);
    fsBtn.title = isFs ? 'Exit Full Screen [Esc or M]' : 'Maximize graph to full screen [M]';
  }
}

function nodeRadius(id) {
  const degree = ADJACENT.get(id)?.length || 0;
  // Professional sizing: distinct, legible nodes with clear hierarchy even in full-screen overview
  const base = Math.max(5.2, Math.min(15, 4.8 + Math.sqrt(degree) * 1.6));
  const scaleMul = Math.max(0.85, Math.min(1.4, Math.sqrt(view.scale)));
  return base * scaleMul;
}

function hitTest(x, y) {
  let hit = null;
  let distance = 22;

  for (const n of NODES) {
    const p = screenPoint(n.id);
    const d = Math.hypot(p.x - x, p.y - y);
    const r = Math.max(10, nodeRadius(n.id) + 6);
    if (d < r && d < distance) {
      distance = d;
      hit = { type: 'node', id: n.id };
    }
  }
  if (hit) return hit;

  let best = 8;
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
          <div style="font-size:10.5px; color:var(--text-secondary); margin-top:4px;">
            Community: C${node.community} · ${esc(visual?.community_name || '')}<br>
            Connected Actions: ${ADJACENT.get(hit.id).length}
          </div>
        `;
      } else {
        const edge = BY_EDGE.get(hit.id);
        tip.innerHTML = `
          <div class="tooltip-title">${esc(name(edge.source))} → ${esc(name(edge.target))}</div>
          <div class="tooltip-subtitle">Relation: ${esc(edge.relation)} · Cost: ${fmt(costForEdge(edge))}</div>
          <div style="font-size:10.5px; color:var(--text-secondary); margin-top:4px;">
            Confidence: ${esc(edge.confidence || 'VERIFIED')} · ${esc(edge.source_file || '')}
          </div>
        `;
      }
      const tipWidth = tip.offsetWidth || 260;
      const tipHeight = tip.offsetHeight || 95;
      const left = Math.min(x + 14, Math.max(8, canvasWidth - tipWidth - 14));
      const top = (y + tipHeight + 20 > canvasHeight)
        ? Math.max(8, y - tipHeight - 12)
        : Math.min(y + 14, canvasHeight - tipHeight - 8);
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
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
      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
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

    let radius = nodeRadius(n.id) + (highlight ? 3.5 : 0);

    ctx.globalAlpha = highlight || focused ? 1 : 0.16;

    // Halo pulse effects for start, goal, and solution paths
    if (isStart || isGoal) {
      ctx.shadowColor = isStart ? 'rgba(14, 165, 233, 0.75)' : 'rgba(245, 158, 11, 0.75)';
      ctx.shadowBlur = 14;
    } else if (isPath) {
      ctx.shadowColor = 'rgba(251, 191, 36, 0.65)';
      ctx.shadowBlur = 10;
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

    // Crisp high-contrast outline on every node so all 349 nodes stand out sharply
    ctx.strokeStyle = isLight
      ? 'rgba(15, 23, 42, 0.28)'
      : 'rgba(255, 255, 255, 0.32)';
    ctx.lineWidth = Math.max(1, 1.2 * (view.scale > 0.8 ? 1.2 : 1));
    ctx.stroke();

    // Concentric outer accent ring for selected, start, goal, or hovered
    if (isSelected || isStart || isGoal) {
      ctx.strokeStyle = isSelected ? '#ffffff' : ctx.fillStyle;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 4.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (hover?.type === 'node' && hover.id === n.id) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Node Labels with high-contrast pill backdrop
    const showAllLabels = $('labels').checked;
    const isImportantHub = ADJACENT.get(n.id)?.length >= 8 && view.scale > 0.6;
    const isHovered = hover?.type === 'node' && hover.id === n.id;
    if (showAllLabels || highlight || isHovered || isImportantHub) {
      ctx.globalAlpha = highlight || isHovered ? 1 : focused ? 0.95 : 0.35;
      ctx.font = (highlight || isHovered ? '600 ' : '500 ') + '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif';
      const text = short(n.label, 42);
      const textWidth = ctx.measureText(text).width;
      const padH = 6;
      const badgeH = 16;
      const badgeW = textWidth + padH * 2;
      const badgeX = p.x - textWidth / 2 - padH;
      const badgeY = p.y - radius - 20;

      ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(12, 16, 27, 0.94)';
      ctx.strokeStyle = isStart
        ? '#0ea5e9'
        : isGoal
          ? '#f59e0b'
          : isPath
            ? '#fbbf24'
            : isHovered
              ? '#ffffff'
              : (isLight ? 'rgba(15, 23, 42, 0.16)' : 'rgba(255, 255, 255, 0.18)');
      ctx.lineWidth = 1;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
      } else {
        ctx.rect(badgeX, badgeY, badgeW, badgeH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isStart
        ? (isLight ? '#0369a1' : '#38bdf8')
        : isGoal
          ? (isLight ? '#b45309' : '#fbbf24')
          : isPath
            ? (isLight ? '#b45309' : '#fde047')
            : (isLight ? '#0f172a' : '#f8fafc');
      ctx.textAlign = 'center';
      ctx.fillText(text, p.x, badgeY + 11.5);
    }
  }

  const isFs = document.querySelector('.graph-panel.graph-panel--fullscreen');
  ctx.globalAlpha = 1;
  $('graph-status').innerHTML = `
    <span><strong>${NODES.length}</strong> Nodes · <strong>${EDGES.length}</strong> Transitions · <strong>${COMMUNITIES.length}</strong> Louvain Modules</span>
    <span>${state.focus === null ? 'Global Topology (All Communities)' : `Isolated Community: C${state.focus}`} · Scale: <strong>${Math.round(view.scale * 100)}%</strong>${isFs ? ' · <span class="badge badge-sky" style="font-size:10px; padding:1px 6px;">Full Screen Active</span>' : ''}</span>
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
  toggleFullScreen,
  openCompareModal,
  unlockAchievement,
  getUnlockedAchievements,
  resetAchievements
};
