/* Offline application graph explorer. Source metadata is immutable. */
'use strict';
const DATA = JSON.parse(document.getElementById('graph-data').textContent);
const NODES = DATA.graph.nodes;
const EDGES = (DATA.graph.links || DATA.graph.edges).map((e,i)=>({...e,id:'edge-'+i}));
const BY_ID = new Map(NODES.map(n=>[String(n.id),n]));
const BY_EDGE = new Map(EDGES.map(e=>[e.id,e]));
const VISUAL = new Map(DATA.visual.nodes.map(n=>[String(n.id),n]));
const COMMUNITIES = DATA.visual.communities;
const ADJACENT = new Map(NODES.map(n=>[n.id,[]]));
EDGES.forEach(e=>{ADJACENT.get(e.source).push(e);ADJACENT.get(e.target).push(e);});
const DEFAULT_WEIGHTS={calls:1,references:2,uses:3,method:1,contains:4,inherits:2,imports_from:2,implements:2,rationale_for:2};
const state={weights:{...DEFAULT_WEIGHTS},penalty:2,overrides:new Map(),costMode:'relation',directed:false,result:null,alternatives:null,step:-1,playing:null,selected:null,selectedEdge:null,focus:null,dirty:false,runConfig:null,preview:null};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(n)?String(Math.round(n*1000)/1000):'—';
const name=id=>BY_ID.get(String(id))?.label||String(id);
const short=(s,max=45)=>s.length>max?s.slice(0,max-1)+'…':s;
function costForEdge(e){if(state.costMode==='unit')return 1;if(state.overrides.has(e.id))return state.overrides.get(e.id);return (state.weights[e.relation]??2)+(e.confidence==='INFERRED'?state.penalty:0);}
function options(){return {nodes:NODES,edges:EDGES,start:$('start').value,goal:$('goal').value,directed:state.directed,costForEdge};}
function toast(message){document.querySelector('.toast')?.remove();const e=document.createElement('div');e.className='toast';e.setAttribute('role','status');e.textContent=message;document.body.append(e);setTimeout(()=>e.remove(),4500);}

function initialize(){
  $('top-stats').innerHTML=[[NODES.length,'nodes'],[EDGES.length,'edges'],[COMMUNITIES.length,'communities']].map(([v,k])=>`<div class="stat"><strong>${v}</strong><span>${k}</span></div>`).join('');
  $('form-states').textContent=`All ${NODES.length} source nodes, including tests, templates, configuration, and isolated nodes.`;
  const sorted=[...NODES].sort((a,b)=>a.label.localeCompare(b.label)||a.id.localeCompare(b.id));
  for(const select of [$('start'),$('goal')])for(const n of sorted){const opt=document.createElement('option');opt.value=n.id;opt.textContent=`${n.label} · ${n.source_file||n.id} [${n.id}]`;select.append(opt);}
  const examples=[
    ['Login function → receipt function','authentication_views_login_view','sales_views_receipt_pdf_view'],
    ['Checkout function → Sale model','sales_views_sales_add_view','sales_models_sale'],
    ['Add Sale Template → receipt template','sales_add_template','sales_receipt_pdf_template'],
    ['Login template → receipt (unreachable)','login_template','sales_receipt_pdf_template'],
    ['Custom start and goal',null,null]
  ];
  for(let i=0;i<examples.length;i++){const o=document.createElement('option');o.value=String(i);o.textContent=examples[i][0];$('preset').append(o);}
  $('preset').onchange=()=>{const p=examples[Number($('preset').value)];if(p[1]&&BY_ID.has(p[1])&&BY_ID.has(p[2])){$('start').value=p[1];$('goal').value=p[2];markDirty();runSearch();}};
  $('start').value=examples[0][1];$('goal').value=examples[0][2];
  ['start','goal'].forEach(id=>$(id).onchange=()=>{$('preset').value=String(examples.length-1);markDirty();updateFormulation();draw();});
  $('swap').onclick=()=>{const a=$('start').value;$('start').value=$('goal').value;$('goal').value=a;$('preset').value=String(examples.length-1);markDirty();updateFormulation();draw();};
  $('algorithm').onchange=()=>{markDirty();updateFormulation();};
  $('direction').onchange=()=>{state.directed=$('direction').value==='directed';markDirty();updateFormulation();draw();};
  $('cost-mode').onchange=()=>{state.costMode=$('cost-mode').value;markDirty();renderInspector();renderLedger();draw();};
  const relations=Object.keys(DATA.audit.relations).sort();
  $('weights').innerHTML=relations.map(r=>`<div class="weight-row"><label for="weight-${esc(r)}">${esc(r)} <small>(${DATA.audit.relations[r]})</small></label><input id="weight-${esc(r)}" data-relation="${esc(r)}" type="number" min="0.5" step="0.5" value="${state.weights[r]??2}"></div>`).join('');
  document.querySelectorAll('[data-relation]').forEach(input=>input.addEventListener('change',()=>{const n=Number(input.value);if(!input.value.trim()||!Number.isFinite(n)||n<=0){input.value=state.weights[input.dataset.relation];toast('Edge costs must be finite and greater than zero.');return;}state.weights[input.dataset.relation]=n;markDirty();renderInspector();renderLedger();draw();}));
  $('penalty').onchange=()=>{const v=Number($('penalty').value);if(!$('penalty').value.trim()||!Number.isFinite(v)||v<0){$('penalty').value=state.penalty;toast('Inference penalty must be finite and nonnegative.');return;}state.penalty=v;markDirty();renderInspector();draw();};
  $('reset-costs').onclick=()=>{state.weights={...DEFAULT_WEIGHTS};state.penalty=2;state.overrides.clear();$('penalty').value='2';document.querySelectorAll('[data-relation]').forEach(e=>e.value=state.weights[e.dataset.relation]);markDirty();renderInspector();renderLedger();draw();};
  $('run').onclick=runSearch;
  $('previous').onclick=()=>setStep(Math.max(0,(state.step<0?state.result?.steps.length||1:state.step)-1));
  $('next').onclick=()=>setStep(state.step<0?0:Math.min(state.step+1,(state.result?.steps.length||1)-1));
  $('show-final').onclick=()=>{stopPlayback();state.step=-1;state.preview=null;renderTrace();draw();};
  $('scrubber').oninput=()=>setStep(Number($('scrubber').value));
  $('play').onclick=()=>{if(state.playing){stopPlayback();return;}if(!state.result?.steps.length)return;if(state.step<0||state.step>=state.result.steps.length-1)state.step=-1;$('play').textContent='Ⅱ Pause';state.playing=setInterval(()=>{if(state.step>=state.result.steps.length-1){stopPlayback();return;}state.step++;renderTrace();draw();},600);};
  $('community-search').oninput=renderCommunities;$('clear-focus').onclick=()=>{state.focus=null;renderCommunities();draw();};
  $('node-search').oninput=searchNodes;$('node-search').onkeydown=e=>{if(e.key==='Escape')$('node-results').hidden=true;};
  $('fit').onclick=fitGraph;$('zoom-in').onclick=()=>zoomAt(1.25,canvasWidth/2,canvasHeight/2);$('zoom-out').onclick=()=>zoomAt(.8,canvasWidth/2,canvasHeight/2);
  $('labels').onchange=draw;$('edge-costs').onchange=draw;
  $('toggle-ledger').onclick=()=>{$('ledger').hidden=!$('ledger').hidden;$('toggle-ledger').textContent=$('ledger').hidden?'Open ledger':'Close ledger';renderLedger();};
  $('ledger-type').onchange=renderLedger;$('ledger-search').oninput=renderLedger;
  $('show-about').onclick=()=>$('about').showModal();$('close-about').onclick=()=>$('about').close();$('about-done').onclick=()=>$('about').close();
  $('download').onclick=exportSearch;
  renderCommunities();renderAudit();updateFormulation();setupCanvas();runSearch();
}

function updateFormulation(){
  $('form-start').textContent=`Current focus = ${name($('start').value)}.`;
  $('form-goal').textContent=`Current node ID equals ${$('goal').value} (${name($('goal').value)}).`;
  const messages={ucs:'UCS expands the smallest accumulated cost g(n). Positive costs guarantee an optimal path in this finite graph.',astar:'A* uses f(n) = g(n) + h(n), with h(n) = 0. It is equivalent to UCS and guarantees an optimal modeled cost.',bfs:'BFS minimizes the number of edges. It guarantees minimum cost only when every transition has the same cost.',dfs:'DFS follows one branch first. It may find an expensive path and does not guarantee the fewest hops or lowest cost.'};
  $('algorithm-help').textContent=messages[$('algorithm').value];
}
function markDirty(){stopPlayback();state.dirty=true;if(state.result){$('result-title').textContent='Inputs changed · run search to update';$('result-explanation').textContent='The previous search is cleared so its costs cannot be confused with the new configuration.';}state.result=null;state.alternatives=null;state.step=-1;state.preview=null;$('path-strip').replaceChildren();$('result-metrics').replaceChildren();$('alternatives').replaceChildren();renderTrace();draw();}
function stopPlayback(){if(state.playing)clearInterval(state.playing);state.playing=null;$('play').textContent='▶ Play';}
function runSearch(){
  stopPlayback();state.preview=null;state.step=-1;
  try{
    const opts=options();state.result=AISearch.search({...opts,algorithm:$('algorithm').value});
    state.alternatives=AISearch.enumerateAlternatives({...opts,limit:3,maxExpansions:16000});
    state.runConfig={start:opts.start,goal:opts.goal,algorithm:$('algorithm').value,directed:state.directed,costMode:state.costMode,weights:{...state.weights},inferredPenalty:state.penalty,edgeOverrides:Object.fromEntries(state.overrides)};
    state.dirty=false;renderResult();renderTrace();updateFormulation();renderInspector();draw();
  }catch(error){state.result=null;toast(error.message);$('result-title').textContent='Search could not run';$('result-explanation').textContent=error.message;}
}
function renderResult(){
  const r=state.result;if(!r)return;const algorithm=$('algorithm').value;
  $('result-title').textContent=r.found?(algorithm==='ucs'||algorithm==='astar'?'Lowest-cost path found':'Solution path found'):'Goal is unreachable';
  $('result-metrics').innerHTML=`<div class="result-number">${r.found?fmt(r.totalCost):'—'}<small>path cost</small></div><div class="result-number">${r.found?r.pathEdges.length:'—'}<small>hops</small></div><div class="result-number">${r.expandedCount}<small>expanded</small></div>`;
  const strip=$('path-strip');strip.replaceChildren();
  if(r.found){r.pathNodes.forEach((id,i)=>{if(i){const arrow=document.createElement('span');arrow.className='path-arrow';arrow.textContent=`— ${fmt(costForEdge(BY_EDGE.get(r.pathEdges[i-1])))} →`;strip.append(arrow);}const b=document.createElement('button');b.className='path-node';b.textContent=name(id);b.title=id;b.onclick=()=>selectNode(id,true);strip.append(b);});}
  const cheapest=state.alternatives?.paths?.[0]?.totalCost;
  $('result-explanation').textContent=!r.found?'No path exists with the selected direction rules. All source components remain intact; no artificial bridge is added.':algorithm==='ucs'||algorithm==='astar'?`Optimal under the current positive teaching costs. Total = ${r.pathEdges.map(id=>fmt(costForEdge(BY_EDGE.get(id)))).join(' + ')||'0'} = ${fmt(r.totalCost)}. This is a relationship-navigation path, not an application execution sequence.`:`${algorithm==='bfs'?'BFS returns a fewest-hop route.':'DFS returns the first discovered route.'} Its cost is ${fmt(r.totalCost)}${Number.isFinite(cheapest)?`; lowest-cost candidate found: ${fmt(cheapest)}`:''}.`;
  const alternatives=$('alternatives');alternatives.replaceChildren();
  for(const [i,p] of (state.alternatives?.paths||[]).entries()){
    const div=document.createElement('div');div.className='alternative';const b=document.createElement('button');b.textContent='Highlight';b.onclick=()=>{stopPlayback();state.step=-1;state.preview=p;draw();$('trace-status').textContent=`Previewing candidate ${i+1} (cost ${fmt(p.totalCost)}). Select Final path to restore the search result.`;};
    const title=document.createElement('strong');title.textContent=`${i===0?'Best candidate':'Alternative '+i} · cost ${fmt(p.totalCost)} · ${p.pathEdges.length} hops`;div.append(b,title);
    const names=document.createElement('span');names.className='path-breakdown';names.textContent=p.pathNodes.map(name).join(' → ');div.append(names);
    const sum=document.createElement('span');sum.className='path-breakdown';sum.textContent=p.pathEdges.map(id=>fmt(costForEdge(BY_EDGE.get(id)))).join(' + ')+' = '+fmt(p.totalCost);div.append(sum);alternatives.append(div);
  }
  if(state.alternatives?.truncated){const p=document.createElement('p');p.className='help';p.textContent=state.alternatives.truncationReason==='maxExpansions'?'Candidate enumeration reached its exploration budget. The list is incomplete; the selected search result remains independent.':'Showing the three lowest-cost loopless candidate paths. Additional paths may exist; equal-cost alternatives are retained.';alternatives.append(p);}
  else if(r.found&&(state.alternatives?.paths.length||0)<3){const p=document.createElement('p');p.className='help';p.textContent=`Only ${state.alternatives.paths.length} loopless candidate path(s) exist under these transition rules.`;alternatives.append(p);}
}
function setStep(value){stopPlayback();if(!state.result?.steps.length)return;state.preview=null;state.step=Math.max(0,Math.min(value,state.result.steps.length-1));renderTrace();draw();}
function renderTrace(){
  const r=state.result,steps=r?.steps||[];$('scrubber').disabled=!steps.length;$('scrubber').max=String(Math.max(0,steps.length-1));$('scrubber').value=String(state.step<0?Math.max(0,steps.length-1):state.step);
  ['previous','next','play','show-final'].forEach(id=>$(id).disabled=!steps.length);
  const index=state.step<0?steps.length-1:state.step,frame=steps[index];
  $('trace-status').textContent=!frame?'Run search to record expansions and frontier costs.':`${state.step<0?'Final result · ':''}Expansion ${index+1} / ${steps.length}: ${name(frame.current)} · g=${fmt(frame.g)}, h=${fmt(frame.h)}, f=${fmt(frame.f)} · frontier ${frame.frontier.length} · visited ${frame.visited.length}`;
  $('trace-body').innerHTML=steps.map((s,i)=>`<tr class="${i===index?'current':''}"><td>${i+1}</td><td><button data-step="${i}" title="${esc(s.current)}">${esc(short(name(s.current),42))}</button></td><td>${fmt(s.g)}</td><td>${fmt(s.h)}</td><td>${fmt(s.f)}</td></tr>`).join('');
  $('trace-body').querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>setStep(Number(b.dataset.step)));
  $('frontier-body').innerHTML=(frame?.frontier||[]).map((n,i)=>`<tr><td><button data-node="${esc(n.id)}">${esc(short(name(n.id),39))}</button></td><td>${fmt(n.g)}</td><td>${$('algorithm').value==='bfs'||$('algorithm').value==='dfs'?i+1:fmt(n.f)}</td></tr>`).join('');
  $('frontier-body').querySelectorAll('[data-node]').forEach(b=>b.onclick=()=>selectNode(b.dataset.node,true));
}
function renderCommunities(){
  const query=$('community-search').value.toLowerCase();$('communities').replaceChildren();
  for(const c of COMMUNITIES){if(!(`${c.cid} ${c.label}`.toLowerCase().includes(query)))continue;const b=document.createElement('button');b.className='community-item'+(state.focus===c.cid?' focused':'');b.title=`Community ${c.cid}: ${c.label}`;b.setAttribute('aria-pressed',String(state.focus===c.cid));b.innerHTML=`<span class="community-dot" style="background:${esc(c.color)}"></span><span class="community-label">${esc(c.cid+' · '+c.label)}</span><span class="community-count">${DATA.audit.communityCounts[String(c.cid)]||0}</span>`;b.onclick=()=>{state.focus=state.focus===c.cid?null:c.cid;renderCommunities();draw();};$('communities').append(b);}
}
function renderAudit(){
  $('audit').innerHTML=[['Source nodes',`${NODES.length} / ${DATA.audit.nodes}`],['Source edges',`${EDGES.length} / ${DATA.audit.edges}`],['Communities',`${COMMUNITIES.length} / ${DATA.audit.communities}`],['Connected components',DATA.audit.components],['Isolated nodes',DATA.audit.isolatedNodes.length],['Node IDs / edge multiset','Exact match'],['Source graph direction','Undirected']].map(([k,v])=>`<div class="audit-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')+`<details><summary>Source hashes & original data</summary><p class="help">SHA-256 of original graph.json</p><pre>${DATA.audit.graphJsonSha256}</pre><p class="help">SHA-256 of original graph.html</p><pre>${DATA.audit.graphHtmlSha256}</pre><button id="export-source">Export preserved source data</button><p class="help">All original source attributes are embedded in this HTML. Community counts use actual membership; original legend values are retained in the export.</p></details>`;
  $('export-source').onclick=()=>downloadJSON('pos-source-graph-preserved.json',{graph:DATA.graph,visual:DATA.visual,audit:DATA.audit});
}
function searchNodes(){
  const q=$('node-search').value.trim().toLowerCase(),results=$('node-results');results.replaceChildren();results.hidden=!q;if(!q)return;
  const matches=NODES.filter(n=>`${n.label} ${n.id} ${n.source_file}`.toLowerCase().includes(q));
  for(const n of matches){const b=document.createElement('button');b.innerHTML=`${esc(n.label)}<small>${esc(n.source_file||n.id)}</small>`;b.onclick=()=>{selectNode(n.id,true);results.hidden=true;};results.append(b);}
  if(!matches.length){const p=document.createElement('div');p.className='empty';p.textContent='No matching source nodes.';results.append(p);}
}
function selectNode(id,center=false){if(!BY_ID.has(id))return;state.selected=id;state.selectedEdge=null;renderInspector();if(center)centerOn(id);draw();}
function selectEdge(id){if(!BY_EDGE.has(id))return;state.selectedEdge=id;state.selected=null;renderInspector();draw();}
function renderInspector(){
  const panel=$('inspector');
  if(state.selected){
    const n=BY_ID.get(state.selected),v=VISUAL.get(n.id),links=ADJACENT.get(n.id);panel.innerHTML=`<span class="pill">NODE / STATE</span><span class="pill">C${esc(n.community)}</span><h3 class="inspector-title">${esc(n.label)}</h3><div class="metadata"><b>ID</b> ${esc(n.id)}<br><b>Source</b> ${esc(n.source_file||'Not recorded')} ${esc(n.source_location||'')}<br><b>Community</b> ${esc(v?.community_name||n.community)}<br><b>Type</b> ${esc(n.file_type||'Unspecified')}<br><b>Incident relationships</b> ${links.length}</div><div class="inspector-actions"><button id="set-start">Set initial</button><button id="set-goal">Set goal</button></div><h3>All adjacent actions (${links.length})</h3><div class="neighbours"></div><details><summary>Complete original node attributes</summary><pre></pre></details>`;
    panel.querySelector('pre').textContent=JSON.stringify({source:n,display:VISUAL.get(n.id)},null,2);
    $('set-start').onclick=()=>{$('start').value=n.id;$('preset').value='4';markDirty();updateFormulation();draw();};$('set-goal').onclick=()=>{$('goal').value=n.id;$('preset').value='4';markDirty();updateFormulation();draw();};
    const list=panel.querySelector('.neighbours');for(const e of links){const other=e.source===n.id?e.target:e.source;const b=document.createElement('button');b.className='neighbour';b.textContent=name(other);const sub=document.createElement('small');sub.textContent=`${e.relation} · cost ${fmt(costForEdge(e))} · ${e.confidence||'unspecified'}`;b.append(sub);b.onclick=()=>selectEdge(e.id);list.append(b);}
  }else if(state.selectedEdge){
    const e=BY_EDGE.get(state.selectedEdge);panel.innerHTML=`<span class="pill ${e.confidence==='INFERRED'?'inferred':''}">${esc(e.confidence||'UNSPECIFIED')}</span><h3 class="inspector-title">${esc(e.relation)}</h3><div class="metadata"><b>From</b> ${esc(name(e.source))}<br><b>To</b> ${esc(name(e.target))}<br><b>Source evidence</b> ${esc(e.source_file||'Not recorded')} ${esc(e.source_location||'')}<br><b>Original weight</b> ${esc(e.weight??'Not recorded')}<br><b>Current teaching cost</b> ${fmt(costForEdge(e))}</div><div class="inspector-actions"><button id="edge-from">From node</button><button id="edge-to">To node</button></div><label for="edge-override">Override this action cost</label><input id="edge-override" type="number" min="0.5" step="0.5" placeholder="Use relationship cost" value="${state.overrides.has(e.id)?state.overrides.get(e.id):''}" ${state.costMode==='unit'?'disabled':''}><p class="help">An override applies in relationship-cost mode. Clear it to restore the relationship weight and confidence penalty.</p><details><summary>Complete original edge attributes</summary><pre></pre></details>`;
    panel.querySelector('pre').textContent=JSON.stringify(DATA.graph.links?.[Number(e.id.slice(5))]||e,null,2);
    $('edge-from').onclick=()=>selectNode(e.source,true);$('edge-to').onclick=()=>selectNode(e.target,true);
    $('edge-override').onchange=()=>{const input=$('edge-override');if(!input.value.trim()){state.overrides.delete(e.id);}else{const n=Number(input.value);if(!Number.isFinite(n)||n<=0){toast('Action costs must be finite and greater than zero.');renderInspector();return;}state.overrides.set(e.id,n);}markDirty();renderInspector();renderLedger();draw();};
  }
}
function renderLedger(){
  if($('ledger').hidden)return;const type=$('ledger-type').value,q=$('ledger-search').value.toLowerCase();
  if(type==='nodes'){
    const rows=NODES.filter(n=>JSON.stringify(n).toLowerCase().includes(q));$('ledger-count').textContent=`${rows.length} / ${NODES.length}`;$('ledger-head').innerHTML='<tr><th>Node / state</th><th>Community</th><th>Source</th></tr>';$('ledger-body').innerHTML=rows.map(n=>`<tr><td><button data-node="${esc(n.id)}">${esc(n.label)}</button><div class="metadata">${esc(n.id)}</div></td><td>C${esc(n.community)} · ${esc(VISUAL.get(n.id)?.community_name||'')}</td><td>${esc(n.source_file||'—')} ${esc(n.source_location||'')}</td></tr>`).join('');$('ledger-body').querySelectorAll('[data-node]').forEach(b=>b.onclick=()=>selectNode(b.dataset.node,true));
  }else{
    const rows=EDGES.filter(e=>`${JSON.stringify(e)} ${name(e.source)} ${name(e.target)}`.toLowerCase().includes(q));$('ledger-count').textContent=`${rows.length} / ${EDGES.length}`;$('ledger-head').innerHTML='<tr><th>From → To</th><th>Relationship</th><th>Evidence</th><th>Cost</th></tr>';$('ledger-body').innerHTML=rows.map(e=>`<tr><td><button data-edge="${e.id}">${esc(name(e.source))} → ${esc(name(e.target))}</button><div class="metadata">${esc(e.id)}</div></td><td>${esc(e.relation)}</td><td>${esc(e.confidence||'—')}<br>${esc(e.source_file||'')} ${esc(e.source_location||'')}</td><td>${fmt(costForEdge(e))}</td></tr>`).join('');$('ledger-body').querySelectorAll('[data-edge]').forEach(b=>b.onclick=()=>selectEdge(b.dataset.edge));
  }
}
function downloadJSON(filename,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportSearch(){if(!state.result){toast('Run a search before exporting.');return;}downloadJSON('pos-ai-search-result.json',{problem:state.runConfig,result:state.result,alternatives:state.alternatives,sourceAudit:DATA.audit,costMeaning:'Illustrative relationship-navigation effort units; not measured runtime or business costs.'});}

/* Canvas renders all source records. Focus changes emphasis, never membership. */
const canvas=$('graph'),ctx=canvas.getContext('2d');let canvasWidth=800,canvasHeight=570,view={scale:1,x:0,y:0},drag=null,hover=null,frameRequest=null;
const positions=DATA.layout;
function screenPoint(id){const p=positions[id];return {x:p.x*view.scale+view.x,y:p.y*view.scale+view.y};}
function fitGraph(){const p=Object.values(positions),minX=Math.min(...p.map(p=>p.x)),maxX=Math.max(...p.map(p=>p.x)),minY=Math.min(...p.map(p=>p.y)),maxY=Math.max(...p.map(p=>p.y));view.scale=Math.min((canvasWidth-70)/(maxX-minX||1),(canvasHeight-90)/(maxY-minY||1));view.x=(canvasWidth-(maxX+minX)*view.scale)/2;view.y=(canvasHeight-(maxY+minY)*view.scale)/2;draw();}
function centerOn(id){const p=positions[id];view.scale=Math.max(view.scale,.9);view.x=canvasWidth/2-p.x*view.scale;view.y=canvasHeight/2-p.y*view.scale;draw();}
function zoomAt(factor,x,y){const next=Math.min(8,Math.max(.025,view.scale*factor)),ratio=next/view.scale;view.x=x-(x-view.x)*ratio;view.y=y-(y-view.y)*ratio;view.scale=next;draw();}
function nodeRadius(id){const degree=ADJACENT.get(id).length;return Math.max(2.4,Math.min(9,3+Math.sqrt(degree)*1.3))*Math.max(.7,Math.sqrt(view.scale));}
function hitTest(x,y){let hit=null,distance=15;for(const n of NODES){const p=screenPoint(n.id),d=Math.hypot(p.x-x,p.y-y);if(d<Math.max(7,nodeRadius(n.id)+4)&&d<distance){distance=d;hit={type:'node',id:n.id};}}if(hit)return hit;let best=5;for(const e of EDGES){const a=screenPoint(e.source),b=screenPoint(e.target),dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len)):0,d=Math.hypot(x-a.x-dx*t,y-a.y-dy*t);if(d<best){best=d;hit={type:'edge',id:e.id};}}return hit;}
function setupCanvas(){
  const resize=()=>{const bounds=$('canvas-wrap').getBoundingClientRect(),first=!canvas.dataset.ready;canvasWidth=bounds.width;canvasHeight=bounds.height;const dpr=window.devicePixelRatio||1;canvas.width=Math.round(canvasWidth*dpr);canvas.height=Math.round(canvasHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);canvas.dataset.ready='true';if(first)fitGraph();else draw();};new ResizeObserver(resize).observe($('canvas-wrap'));resize();
  canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*.001),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,viewX:view.x,viewY:view.y,moved:false};canvas.setPointerCapture(e.pointerId);$('node-results').hidden=true;});
  canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(drag){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>3)drag.moved=true;if(drag.moved){view.x=drag.viewX+e.clientX-drag.x;view.y=drag.viewY+e.clientY-drag.y;draw();$('tooltip').hidden=true;}return;}const hit=hitTest(x,y);hover=hit;canvas.style.cursor=hit?'pointer':'grab';const tip=$('tooltip');tip.hidden=!hit;if(hit){const text=hit.type==='node'?`${name(hit.id)}\n${BY_ID.get(hit.id).source_file||hit.id}`:`${name(BY_EDGE.get(hit.id).source)} → ${name(BY_EDGE.get(hit.id).target)}\n${BY_EDGE.get(hit.id).relation} · cost ${fmt(costForEdge(BY_EDGE.get(hit.id)))}`;tip.textContent=text;tip.style.whiteSpace='pre-line';tip.style.left=Math.min(x+14,Math.max(8,canvasWidth-290))+'px';tip.style.top=Math.min(y+14,canvasHeight-85)+'px';}});
  canvas.addEventListener('pointerup',e=>{if(!drag)return;const moved=drag.moved;drag=null;if(!moved){const r=canvas.getBoundingClientRect(),hit=hitTest(e.clientX-r.left,e.clientY-r.top);if(hit?.type==='node')selectNode(hit.id);if(hit?.type==='edge')selectEdge(hit.id);}});
  canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('pointerleave',()=>{$('tooltip').hidden=true;});
  canvas.addEventListener('keydown',e=>{if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','0'].includes(e.key))e.preventDefault();if(e.key==='+'||e.key==='=')zoomAt(1.2,canvasWidth/2,canvasHeight/2);else if(e.key==='-')zoomAt(.8,canvasWidth/2,canvasHeight/2);else if(e.key==='0')fitGraph();else{const moves={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]};if(moves[e.key]){view.x+=moves[e.key][0];view.y+=moves[e.key][1];draw();}}});
}
function draw(){if(frameRequest)return;frameRequest=requestAnimationFrame(()=>{frameRequest=null;paint();});}
function paint(){
  ctx.clearRect(0,0,canvasWidth,canvasHeight);
  const frame=state.step>=0?state.result?.steps[state.step]:null;
  const currentPath=state.preview||(frame?{pathNodes:frame.pathNodes,pathEdges:frame.pathEdges}:state.result?.found?state.result:null);
  const pathEdges=new Set(currentPath?.pathEdges||[]),pathNodes=new Set(currentPath?.pathNodes||[]),visited=new Set(frame?.visited||[]),frontier=new Set((frame?.frontier||[]).map(n=>n.id));
  const start=$('start').value,goal=$('goal').value;
  for(const e of EDGES){const a=screenPoint(e.source),b=screenPoint(e.target),path=pathEdges.has(e.id),selected=state.selectedEdge===e.id,focused=state.focus===null||BY_ID.get(e.source).community===state.focus||BY_ID.get(e.target).community===state.focus;
    ctx.globalAlpha=path||selected?1:focused?.46:.10;ctx.strokeStyle=selected?'#6ee7db':path?'#f9df9d':e.confidence==='INFERRED'?'#8b829d':'#587292';ctx.lineWidth=selected?3:path?2.7:Math.max(.5,view.scale*.7);ctx.setLineDash(e.confidence==='INFERRED'?[3,3]:e.confidence==='AMBIGUOUS'?[1,4]:[]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
    if(state.directed&&(path||selected||view.scale>.8)){const t=.62,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,angle=Math.atan2(b.y-a.y,b.x-a.x);ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-6*Math.cos(angle-.45),y-6*Math.sin(angle-.45));ctx.lineTo(x-6*Math.cos(angle+.45),y-6*Math.sin(angle+.45));ctx.closePath();ctx.fill();}
    if(($('edge-costs').checked&&view.scale>.28)||path||selected){const x=(a.x+b.x)/2,y=(a.y+b.y)/2,c=fmt(costForEdge(e));ctx.globalAlpha=path||selected?1:focused?.8:.2;ctx.font='9px Segoe UI, sans-serif';const w=ctx.measureText(c).width;ctx.fillStyle='#0d1728';ctx.fillRect(x-w/2-3,y-7,w+6,12);ctx.fillStyle=path?'#f9df9d':'#a4b8d0';ctx.textAlign='center';ctx.fillText(c,x,y+2);}
  }
  for(const n of NODES){const p=screenPoint(n.id),isStart=n.id===start,isGoal=n.id===goal,isSelected=n.id===state.selected,isPath=pathNodes.has(n.id),focused=state.focus===null||n.community===state.focus,highlight=isStart||isGoal||isSelected||isPath;let radius=nodeRadius(n.id)+(highlight?2:0);ctx.globalAlpha=highlight||focused?1:.22;ctx.fillStyle=isStart?'#6ee7db':isGoal?'#f6c865':isPath?'#f9df9d':frame?.current===n.id?'#ffffff':frontier.has(n.id)?'#cc9cf4':visited.has(n.id)?'#829fe5':VISUAL.get(n.id)?.color?.background||'#89b4fa';ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();if(isSelected||isStart||isGoal){ctx.strokeStyle=isSelected?'#ffffff':ctx.fillStyle;ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(p.x,p.y,radius+4,0,Math.PI*2);ctx.stroke();}
    if($('labels').checked||highlight||(view.scale>1&&ADJACENT.get(n.id).length>5)){ctx.globalAlpha=highlight?1:focused?.85:.25;ctx.font=(highlight?'600 ':'')+'10px Segoe UI, sans-serif';const text=short(n.label,55);ctx.textAlign='center';ctx.strokeStyle='#0d1728';ctx.lineWidth=3;ctx.strokeText(text,p.x,p.y-radius-9);ctx.fillStyle=highlight?'#edf4fc':'#a1b7cc';ctx.fillText(text,p.x,p.y-radius-9);}
  }
  ctx.globalAlpha=1;
  $('graph-status').innerHTML=`<span>${NODES.length} nodes · ${EDGES.length} edges · ${COMMUNITIES.length} communities retained</span><span>${state.focus===null?'All communities':`Focus: C${state.focus}`} · ${Math.round(view.scale*100)}%</span>`;
}
initialize();
// Read-only handles support deterministic validation and educational exploration.
window.POSGraphLab={data:DATA,nodes:NODES,edges:EDGES,state,runSearch,costForEdge,selectNode,selectEdge,fitGraph};
