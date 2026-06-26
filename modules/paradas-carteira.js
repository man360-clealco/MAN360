/* ═══════════════════════════════════════════════════════════════════
   MAN360 — Módulo: Gestão de Paradas > Carteira de Serviços
   Arquivo: modules/paradas-carteira.js
   Padrão: window.Modulos['paradas-carteira'] = { async init(container) }
   Tabelas: ordens_servico, parada_os_config, config_modalidades
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ══ Constantes ══════════════════════════════════════════════════ */
  const HIERARQUIA = {
    geral:       ['geral','com_vapor','sem_vapor','caldeira_03','caldeira_04','caldeira_05'],
    com_vapor:   ['com_vapor'],
    sem_vapor:   ['sem_vapor','caldeira_03','caldeira_04','caldeira_05'],
    caldeira_03: ['caldeira_03'],
    caldeira_04: ['caldeira_04'],
    caldeira_05: ['caldeira_05'],
    sem_parada:  ['sem_parada'],
  };
  const PARADA_LABEL = {
    geral:'Parada geral', com_vapor:'Com vapor', sem_vapor:'Sem vapor (caldeiras)',
    caldeira_03:'Caldeira 03', caldeira_04:'Caldeira 04', caldeira_05:'Caldeira 05',
    sem_parada:'Sem parada',
  };
  const PARADA_COR = {
    geral:'#dc2626', com_vapor:'#2563eb', sem_vapor:'#7c3aed',
    caldeira_03:'#d97706', caldeira_04:'#d97706', caldeira_05:'#d97706',
    sem_parada:'#9ca3af',
  };
  const PRIO_LABEL  = { alta:'Alta', media:'Média', baixa:'Baixa' };
  const PRIO_COR    = { alta:'#dc2626', media:'#d97706', baixa:'#16a34a' };
  const PRIORI_LABEL = { seguranca:'Segurança', corretiva_processo:'Corret. Processo', melhoria_processo:'Melhoria Processo' };
  const RECURSOS_LABEL = { andaime:'Andaime', munck:'Munck', guindaste:'Guindaste', pta:'PTA' };

  /* ══ Estado ══════════════════════════════════════════════════════ */
  let OS       = [];   // linhas de ordens_servico
  let CFG      = {};   // { "OS|COD": { tipo_parada, prioridade, ... } }
  let MODS     = [];   // [{ prefixo, nome, cor }]
  let ABA      = 'lista';
  let MODAL_OS = null; // { os, cod } sendo editado

  // Filtros
  let F = {
    busca:'', parada:[], modalidade:[], prioridade:[], priorizacao:[],
    recurso:[], setor:[], semClassif: false,
  };

  // Ordenação
  let SORT = { col:'os', dir:1 };

  /* ══ Helpers ══════════════════════════════════════════════════════ */
  function esc(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtHH(v)  { const h=parseFloat(v)||0; return h>0?h.toFixed(1)+'h':'—'; }
  function cfg(o)    { return CFG[`${o.os}|${o.cod_servico||'1'}`] || {}; }
  function modNome(equipe) {
    if (!equipe) return '';
    const pref = String(equipe).toUpperCase().slice(0,3);
    const m = MODS.find(x => x.prefixo === pref);
    return m ? m.nome : pref;
  }

  /* ══ Dados filtrados + ordenados ═════════════════════════════════ */
  function osFiltradas() {
    let d = OS.filter(o => {
      const c = cfg(o);
      const tp = c.tipo_parada || 'sem_parada';
      const eq = modNome(o.equipe);
      const set = o.desc_setor || o.setor || '';

      if (F.busca) {
        const b = F.busca.toLowerCase();
        const txt = `${o.os} ${o.desc_servico||o.desc_os||''} ${o.desc_equipamento||''} ${eq} ${set}`.toLowerCase();
        if (!txt.includes(b)) return false;
      }
      if (F.parada.length) {
        const ok = F.parada.some(p => (HIERARQUIA[p]||[]).includes(tp));
        if (!ok) return false;
      }
      if (F.modalidade.length && !F.modalidade.includes(eq)) return false;
      if (F.prioridade.length && !F.prioridade.includes(c.prioridade||'')) return false;
      if (F.priorizacao.length && !F.priorizacao.includes(c.priorizacao||'')) return false;
      if (F.recurso.length) {
        const rec = c.recursos||[];
        if (!F.recurso.some(r => rec.includes(r))) return false;
      }
      if (F.setor.length && !F.setor.includes(set)) return false;
      if (F.semClassif && (c.tipo_parada || c.prioridade || c.priorizacao)) return false;
      return true;
    });

    d = [...d].sort((a, b) => {
      let va, vb;
      const ca = cfg(a), cb = cfg(b);
      switch (SORT.col) {
        case 'os':       va=a.os;    vb=b.os;    break;
        case 'desc':     va=a.desc_servico||a.desc_os||''; vb=b.desc_servico||b.desc_os||''; break;
        case 'hh':       va=parseFloat(a.hh_prev_servico)||0; vb=parseFloat(b.hh_prev_servico)||0; break;
        case 'equipe':   va=modNome(a.equipe); vb=modNome(b.equipe); break;
        case 'setor':    va=a.desc_setor||''; vb=b.desc_setor||''; break;
        case 'parada':   va=PARADA_LABEL[ca.tipo_parada||'sem_parada']||''; vb=PARADA_LABEL[cb.tipo_parada||'sem_parada']||''; break;
        case 'prioridade': {
          const ord={alta:0,media:1,baixa:2,'':3};
          va=ord[ca.prioridade||'']; vb=ord[cb.prioridade||'']; break;
        }
        default: va=a.os; vb=b.os;
      }
      if (va < vb) return -SORT.dir;
      if (va > vb) return  SORT.dir;
      return 0;
    });
    return d;
  }

  /* ══ KPIs ════════════════════════════════════════════════════════ */
  function calcKPIs(lista) {
    const total = lista.length;
    const hhTotal = lista.reduce((s,o) => s+(parseFloat(o.hh_prev_servico)||0), 0);
    const classif = lista.filter(o => cfg(o).tipo_parada && cfg(o).tipo_parada !== 'sem_parada').length;
    const alta    = lista.filter(o => cfg(o).prioridade === 'alta').length;
    return { total, hhTotal, classif, pctClassif: total?Math.round(classif/total*100):0, alta };
  }

  /* ══ RENDER ══════════════════════════════════════════════════════ */
  function render(container) {
    const lista = osFiltradas();
    const kpi   = calcKPIs(lista);
    const setores = [...new Set(OS.map(o=>o.desc_setor||o.setor||'').filter(Boolean))].sort();
    const modalidades = [...new Set(OS.map(o=>modNome(o.equipe)).filter(Boolean))].sort();

    container.innerHTML = `
<style>
.pcar{font-family:var(--font);color:#1a1a1a;min-height:100%}
.pcar-topbar{display:flex;align-items:center;justify-content:space-between;padding:0 0 14px;flex-wrap:wrap;gap:10px}
.pcar-title{font-size:14px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#374151;display:flex;align-items:center;gap:8px}
.pcar-title i{font-size:18px;color:var(--yellow)}
.pcar-actions{display:flex;gap:8px;align-items:center}

/* KPIs */
.pcar-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
.pcar-kpi{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:11px 14px;box-shadow:var(--shadow)}
.pcar-kpi-lbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px}
.pcar-kpi-val{font-size:22px;font-weight:700;line-height:1;color:var(--yellow)}
.pcar-kpi-sub{font-size:10px;color:#9ca3af;margin-top:3px}
.pcar-kpi.alert .pcar-kpi-val{color:#dc2626}

/* Tabs */
.pcar-tabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:14px;gap:0}
.pcar-tab{padding:9px 16px;font-size:12px;color:#6b7280;cursor:pointer;border-bottom:2px solid transparent;font-family:var(--font);background:none;border-top:none;border-left:none;border-right:none;font-weight:500;white-space:nowrap}
.pcar-tab.active{color:#111827;border-bottom-color:var(--yellow);font-weight:700}
.pcar-tab.wip{opacity:.4;cursor:default}

/* Filtros */
.pcar-filters{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;box-shadow:var(--shadow);margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
.pcar-search{display:flex;align-items:center;gap:6px;flex:1;min-width:160px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 10px;height:30px;background:var(--bg)}
.pcar-search input{border:none;background:none;outline:none;font-family:var(--font);font-size:11px;width:100%;color:#374151}
.pcar-search i{font-size:14px;color:#9ca3af;flex-shrink:0}

/* DD filtros */
.pcar-dd{position:relative}
.pcar-dd-btn{height:30px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;white-space:nowrap;transition:border-color 120ms}
.pcar-dd-btn:hover{border-color:#9ca3af}
.pcar-dd-btn.ativo{border-color:var(--yellow);background:#fffbeb}
.pcar-dd-btn i{font-size:13px;color:#6b7280}
.pcar-dd-btn .arr{font-size:10px;margin-left:2px;transition:transform 200ms}
.pcar-dd-btn.open .arr{transform:rotate(180deg)}
.pcar-dd-badge{background:var(--yellow);color:var(--dark1);border-radius:10px;font-size:9px;font-weight:700;padding:1px 5px;margin-left:2px}
.pcar-dd-panel{position:absolute;top:calc(100% + 4px);left:0;min-width:200px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);z-index:300;display:none;max-height:260px;overflow-y:auto}
.pcar-dd-panel.show{display:block}
.pcar-dd-item{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:11px;font-weight:500;color:#374151;cursor:pointer;user-select:none}
.pcar-dd-item:hover{background:var(--bg)}
.pcar-dd-item input{accent-color:var(--yellow);pointer-events:none;flex-shrink:0}
.pcar-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.pcar-chips:empty{display:none}
.pcar-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;background:#fef3c7;border:1px solid #fbbf24;border-radius:10px;font-size:10px;font-weight:600;color:#92400e}
.pcar-chip button{background:none;border:none;cursor:pointer;color:#92400e;font-size:13px;line-height:1;padding:0}

/* Tabela */
.pcar-table-wrap{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.pcar-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:auto}
.pcar-table th{text-align:left;padding:8px 10px;background:var(--bg);color:#4b5563;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;cursor:pointer;user-select:none}
.pcar-table th:hover{color:#111}
.pcar-table th.sorted{color:var(--yellow-dk)}
.sico{font-size:10px;margin-left:3px;opacity:.35}
.sorted .sico{opacity:1}
.pcar-table td{padding:9px 10px;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap}
.pcar-table td.desc-td{white-space:normal;max-width:240px}
.pcar-table tbody tr:hover td{background:#fafafa;cursor:pointer}
.pcar-table tbody tr:last-child td{border-bottom:none}
.pcar-tfoot{padding:8px 14px;font-size:11px;color:#6b7280;background:var(--bg);border-top:1px solid var(--border)}
.pcar-tfoot span{color:#374151}

/* Badges */
.pb{display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap}
.pb-none{color:#9ca3af;font-size:11px}
.pb-alta{background:#fee2e2;color:#991b1b}
.pb-media{background:#fef3c7;color:#92400e}
.pb-baixa{background:#dcfce7;color:#14532d}
.pb-geral{background:#fee2e2;color:#991b1b}
.pb-cv{background:#dbeafe;color:#1e3a8a}
.pb-sv{background:#ede9fe;color:#4c1d95}
.pb-cal{background:#fef3c7;color:#92400e}
.pb-sp{background:#f3f4f6;color:#4b5563}

/* Recursos dots */
.rec-dots{display:flex;gap:3px;align-items:center}
.rec-dot{width:7px;height:7px;border-radius:50%;background:#d1d5db;cursor:default}
.rec-dot.on{background:var(--yellow-dk)}

/* Andaime */
.andaime-ok{color:#16a34a;font-size:11px;font-weight:600}
.andaime-pend{color:#d97706;font-size:11px}

/* Modal de classificação */
.pcar-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding-top:60px;overflow-y:auto}
.pcar-modal{background:var(--card-bg);border-radius:var(--radius);width:520px;max-width:96vw;box-shadow:0 8px 32px rgba(0,0,0,.22);overflow:hidden;margin-bottom:20px}
.pcar-modal-head{padding:14px 18px;background:var(--bg);border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.pcar-modal-title{font-size:13px;font-weight:700;color:#111}
.pcar-modal-os{font-size:10px;color:#6b7280;margin-top:2px}
.pcar-modal-close{background:none;border:none;cursor:pointer;font-size:20px;color:#6b7280;line-height:1;flex-shrink:0}
.pcar-modal-body{padding:16px 18px;display:flex;flex-direction:column;gap:14px}
.pcar-modal-footer{padding:10px 18px;border-top:1px solid var(--border);background:var(--bg);display:flex;gap:8px;justify-content:flex-end}

/* Grupos no modal */
.mgrp{}
.mgrp-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:7px}
.mbtn-group{display:flex;flex-wrap:wrap;gap:6px}
.mbtn{padding:5px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px;font-weight:500;cursor:pointer;background:var(--bg);color:#374151;transition:all 120ms}
.mbtn:hover{border-color:#9ca3af}
.mbtn.sel{border-color:var(--yellow);background:var(--yellow);color:var(--dark1);font-weight:700}
.mbtn.sel-red{border-color:#dc2626;background:#fee2e2;color:#991b1b;font-weight:700}
.mbtn.sel-blue{border-color:#2563eb;background:#dbeafe;color:#1e3a8a;font-weight:700}
.mbtn.sel-purple{border-color:#7c3aed;background:#ede9fe;color:#4c1d95;font-weight:700}
.mbtn.sel-amber{border-color:#d97706;background:#fef3c7;color:#92400e;font-weight:700}

/* Andaime no modal */
.andaime-row{display:flex;align-items:center;gap:10px}
.andaime-toggle{position:relative;width:36px;height:20px;flex-shrink:0}
.andaime-toggle input{opacity:0;width:0;height:0}
.andaime-slider{position:absolute;cursor:pointer;inset:0;background:#e5e7eb;border-radius:10px;transition:background .2s}
.andaime-toggle input:checked + .andaime-slider{background:var(--yellow)}
.andaime-slider::before{content:'';position:absolute;height:14px;width:14px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:transform .2s}
.andaime-toggle input:checked + .andaime-slider::before{transform:translateX(16px)}
.andaime-label{font-size:11px;color:#374151}

/* Aba Recursos */
.pcar-res-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:4px}
.pcar-res-card{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;box-shadow:var(--shadow)}
.pcar-res-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.pcar-res-title i{font-size:14px;color:var(--yellow)}
.pcar-res-list{display:flex;flex-direction:column;gap:4px}
.pcar-res-item{font-size:11px;color:#374151;padding:4px 0;border-bottom:1px solid var(--border)}
.pcar-res-item:last-child{border-bottom:none}
.pcar-res-empty{font-size:11px;color:#9ca3af}

/* Botão salvar */
.pcar-save-btn{padding:7px 18px;border:none;border-radius:var(--radius-sm);background:var(--yellow);color:var(--dark1);font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer}
.pcar-save-btn:hover{background:var(--yellow-dk)}
.pcar-cancel-btn{padding:7px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:12px;font-weight:500;cursor:pointer;color:#374151}

/* Config modal (modalidades) */
.pcar-cfg-table{width:100%;border-collapse:collapse;font-size:12px}
.pcar-cfg-table th{padding:6px 8px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;text-align:left}
.pcar-cfg-table td{padding:7px 8px;border-bottom:1px solid var(--border)}
.pcar-cfg-table tr:last-child td{border-bottom:none}
.pcar-cfg-input{border:1px solid var(--border);border-radius:4px;padding:4px 7px;font-size:12px;font-family:var(--font);background:var(--bg);width:100%;box-sizing:border-box}
.pcar-cfg-input:focus{outline:2px solid var(--yellow);outline-offset:-1px;border-color:transparent}
</style>

<div class="pcar">
  <div class="pcar-topbar">
    <div class="pcar-title"><i class="ti ti-calendar-event"></i>Carteira de Serviços — Paradas</div>
    <div class="pcar-actions">
      <button class="topbar-btn" id="pcar-btn-cfg"><i class="ti ti-settings"></i><span>Modalidades</span></button>
      <button class="topbar-btn" id="pcar-btn-import"><i class="ti ti-upload"></i><span>Importar OS</span></button>
      <button class="topbar-btn" id="pcar-btn-export"><i class="ti ti-table-export"></i><span>Exportar</span></button>
    </div>
  </div>
  <input type="file" id="pcar-file" accept=".xlsx,.xls" style="display:none">

  <!-- KPIs -->
  <div class="pcar-kpis">
    <div class="pcar-kpi">
      <div class="pcar-kpi-lbl">Total de OS</div>
      <div class="pcar-kpi-val">${lista.length}</div>
      <div class="pcar-kpi-sub">de ${OS.length} na base</div>
    </div>
    <div class="pcar-kpi">
      <div class="pcar-kpi-lbl">HH previsto</div>
      <div class="pcar-kpi-val">${kpi.hhTotal.toFixed(0)}h</div>
      <div class="pcar-kpi-sub">na seleção atual</div>
    </div>
    <div class="pcar-kpi">
      <div class="pcar-kpi-lbl">Classificadas</div>
      <div class="pcar-kpi-val">${kpi.classif}</div>
      <div class="pcar-kpi-sub">${kpi.pctClassif}% da seleção</div>
    </div>
    <div class="pcar-kpi ${kpi.alta>0?'alert':''}">
      <div class="pcar-kpi-lbl">Prioridade Alta</div>
      <div class="pcar-kpi-val">${kpi.alta}</div>
      <div class="pcar-kpi-sub">serviços críticos</div>
    </div>
    <div class="pcar-kpi">
      <div class="pcar-kpi-lbl">Sem classificação</div>
      <div class="pcar-kpi-val">${lista.filter(o=>!cfg(o).tipo_parada).length}</div>
      <div class="pcar-kpi-sub">pendentes de triagem</div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="pcar-tabs">
    <button class="pcar-tab ${ABA==='lista'?'active':''}" data-aba="lista">Lista de Serviços</button>
    <button class="pcar-tab ${ABA==='recursos'?'active':''}" data-aba="recursos">Recursos</button>
    <button class="pcar-tab wip">Planos</button>
  </div>

  ${ABA === 'lista' ? htmlLista(lista) : htmlRecursos(lista)}
</div>

${MODAL_OS ? htmlModal() : ''}`;

    bindEventos(container);
  }

  /* ══ HTML LISTA ══════════════════════════════════════════════════ */
  function htmlLista(lista) {
    const setores     = [...new Set(OS.map(o=>o.desc_setor||o.setor||'').filter(Boolean))].sort();
    const modalidades = [...new Set(OS.map(o=>modNome(o.equipe)).filter(Boolean))].sort();

    function thSort(col, label) {
      const ativo = SORT.col === col;
      return `<th class="${ativo?'sorted':''}" data-sort="${col}">${label} <span class="sico">${ativo?(SORT.dir===1?'↑':'↓'):'⇅'}</span></th>`;
    }

    return `
<div class="pcar-filters">
  <div class="pcar-search"><i class="ti ti-search"></i><input type="text" id="pcar-busca" placeholder="Buscar OS, descrição, equipamento…" value="${esc(F.busca)}"></div>
  ${ddFiltro('parada','ti-calendar-event','Parada',Object.keys(PARADA_LABEL).map(k=>({v:k,l:PARADA_LABEL[k]})))}
  ${ddFiltro('modalidade','ti-tool','Modalidade',modalidades.map(m=>({v:m,l:m})))}
  ${ddFiltro('prioridade','ti-alert-triangle','Prioridade',Object.entries(PRIO_LABEL).map(([v,l])=>({v,l})))}
  ${ddFiltro('priorizacao','ti-star','Priorização',Object.entries(PRIORI_LABEL).map(([v,l])=>({v,l})))}
  ${ddFiltro('recurso','ti-crane','Recurso',Object.entries(RECURSOS_LABEL).map(([v,l])=>({v,l})))}
  ${ddFiltro('setor','ti-building','Setor',setores.map(s=>({v:s,l:s})))}
  <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:500;color:#374151;cursor:pointer;white-space:nowrap">
    <input type="checkbox" id="pcar-sem-classif" ${F.semClassif?'checked':''} style="accent-color:var(--yellow)"> Sem classificação
  </label>
</div>

<div class="pcar-chips" id="pcar-chips">${htmlChips()}</div>

<div class="pcar-table-wrap">
  <table class="pcar-table">
    <thead><tr>
      ${thSort('os','OS')}
      <th>Descrição</th>
      ${thSort('setor','Setor')}
      ${thSort('equipe','Modalidade')}
      ${thSort('hh','HH Prev.')}
      ${thSort('parada','Tipo Parada')}
      ${thSort('prioridade','Prio.')}
      <th>Priorização</th>
      <th title="Andaime / Munck / Guindaste / PTA">Recursos</th>
      <th style="width:36px"></th>
    </tr></thead>
    <tbody>
      ${lista.length ? lista.map(o => htmlLinha(o)).join('') :
        `<tr><td colspan="10" style="text-align:center;padding:32px;color:#9ca3af">
          <i class="ti ti-search" style="font-size:24px;display:block;margin-bottom:8px;color:#d1d5db"></i>
          Nenhum serviço encontrado
        </td></tr>`}
    </tbody>
  </table>
  <div class="pcar-tfoot">Exibindo <span>${lista.length}</span> de <span>${OS.length}</span> serviços
    &nbsp;·&nbsp; <span>${lista.reduce((s,o)=>s+(parseFloat(o.hh_prev_servico)||0),0).toFixed(0)}h</span> previstas</div>
</div>`;
  }

  function ddFiltro(nome, icon, label, opcoes) {
    const sel = F[nome] || [];
    return `<div class="pcar-dd" id="pdd-${nome}">
      <button class="pcar-dd-btn ${sel.length?'ativo':''}" id="pddbtn-${nome}" onclick="pcarToggleDD('${nome}',event)">
        <i class="ti ${icon}"></i>${label}${sel.length?`<span class="pcar-dd-badge">${sel.length}</span>`:''}
        <i class="ti ti-chevron-down arr"></i>
      </button>
      <div class="pcar-dd-panel" id="pddp-${nome}">
        ${opcoes.map(o=>`<label class="pcar-dd-item" onclick="pcarToggleChk('${nome}','${esc(o.v)}',event)">
          <input type="checkbox" ${sel.includes(o.v)?'checked':''}> ${esc(o.l)}
        </label>`).join('')}
      </div>
    </div>`;
  }

  function htmlChips() {
    const labels = {parada:'Parada',modalidade:'Modal.',prioridade:'Prio.',priorizacao:'Prioriz.',recurso:'Recurso',setor:'Setor'};
    const labelFor = {
      parada: v=>PARADA_LABEL[v]||v,
      prioridade: v=>PRIO_LABEL[v]||v,
      priorizacao: v=>PRIORI_LABEL[v]||v,
      recurso: v=>RECURSOS_LABEL[v]||v,
      modalidade: v=>v, setor: v=>v,
    };
    let html = '';
    ['parada','modalidade','prioridade','priorizacao','recurso','setor'].forEach(n=>{
      (F[n]||[]).forEach(v=>{
        html+=`<span class="pcar-chip">${labels[n]}: ${esc(labelFor[n](v))} <button onclick="pcarRemoveChip('${n}','${esc(v)}')">×</button></span>`;
      });
    });
    if (F.semClassif) html+=`<span class="pcar-chip">Sem classificação <button onclick="pcarRemoveChip('semClassif','')">×</button></span>`;
    if (F.busca) html+=`<span class="pcar-chip">Busca: "${esc(F.busca)}" <button onclick="pcarRemoveChip('busca','')">×</button></span>`;
    return html;
  }

  function htmlLinha(o) {
    const c   = cfg(o);
    const tp  = c.tipo_parada || '';
    const eq  = modNome(o.equipe);
    const rec = c.recursos || [];

    // Badge parada
    const pBadge = tp
      ? `<span class="pb pb-${tp==='geral'?'geral':tp==='com_vapor'?'cv':tp==='sem_vapor'?'sv':tp.startsWith('cal')?'cal':'sp'}">${PARADA_LABEL[tp]||tp}</span>`
      : `<span class="pb-none">—</span>`;

    // Badge prioridade
    const prioBadge = c.prioridade
      ? `<span class="pb pb-${c.prioridade}">${PRIO_LABEL[c.prioridade]}</span>`
      : `<span class="pb-none">—</span>`;

    // Recursos dots
    const recHtml = `<div class="rec-dots" title="${['andaime','munck','guindaste','pta'].map(r=>rec.includes(r)?RECURSOS_LABEL[r]:'').filter(Boolean).join(', ')||'Nenhum'}">
      ${['andaime','munck','guindaste','pta'].map(r=>`<div class="rec-dot ${rec.includes(r)?'on':''}" title="${RECURSOS_LABEL[r]}"></div>`).join('')}
    </div>`;

    const descricao = esc(o.desc_servico||o.desc_os||'—');
    const setor     = esc(o.desc_setor||o.setor||'—');

    return `<tr onclick="pcarAbrirModal('${esc(o.os)}','${esc(o.cod_servico||'1')}')">
      <td style="font-size:11px;font-weight:600;color:#374151">${esc(o.os)}</td>
      <td class="desc-td" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${descricao}">${descricao}</td>
      <td style="font-size:11px;color:#4b5563;max-width:100px;overflow:hidden;text-overflow:ellipsis">${setor}</td>
      <td style="font-size:11px;color:#4b5563">${esc(eq||'—')}</td>
      <td style="font-size:11px;font-weight:500">${fmtHH(o.hh_prev_servico)}</td>
      <td>${pBadge}</td>
      <td>${prioBadge}</td>
      <td style="font-size:10px;color:#4b5563">${c.priorizacao?esc(PRIORI_LABEL[c.priorizacao]||c.priorizacao):`<span class="pb-none">—</span>`}</td>
      <td>${recHtml}</td>
      <td><button class="topbar-btn" style="height:26px;padding:0 8px;font-size:10px" onclick="pcarAbrirModal('${esc(o.os)}','${esc(o.cod_servico||'1')}');event.stopPropagation()"><i class="ti ti-pencil" style="font-size:12px"></i></button></td>
    </tr>`;
  }

  /* ══ HTML RECURSOS ═══════════════════════════════════════════════ */
  function htmlRecursos(lista) {
    const porRecurso = {};
    ['andaime','munck','guindaste','pta'].forEach(r => {
      porRecurso[r] = lista.filter(o => (cfg(o).recursos||[]).includes(r));
    });
    const icons = {andaime:'ti-ladder',munck:'ti-crane',guindaste:'ti-arrow-up-circle',pta:'ti-forklift'};
    return `<div class="pcar-res-grid">
      ${Object.entries(porRecurso).map(([r,os]) => `
        <div class="pcar-res-card">
          <div class="pcar-res-title"><i class="ti ${icons[r]||'ti-tool'}"></i>${RECURSOS_LABEL[r]} <span style="font-size:11px;background:var(--yellow);color:var(--dark1);border-radius:10px;padding:1px 7px;font-weight:700">${os.length}</span></div>
          <div class="pcar-res-list">
            ${os.length ? os.slice(0,8).map(o => {
              const c=cfg(o); const andOk=r==='andaime'&&c.andaime_ok;
              return `<div class="pcar-res-item" style="cursor:pointer" onclick="pcarAbrirModal('${esc(o.os)}','${esc(o.cod_servico||'1')}')">
                <span style="font-weight:600">${esc(o.os)}</span> — ${esc((o.desc_servico||o.desc_os||'').substring(0,30))}
                ${r==='andaime'?`<span class="${andOk?'andaime-ok':'andaime-pend'}"> ${andOk?'✓ montado':'⏳ pendente'}</span>`:''}
              </div>`;
            }).join('')+''+( os.length>8?`<div style="font-size:10px;color:#9ca3af;padding:4px 0">+${os.length-8} mais…</div>`:'') :
            `<div class="pcar-res-empty">Nenhum serviço</div>`}
          </div>
        </div>`).join('')}
      <div class="pcar-res-card">
        <div class="pcar-res-title"><i class="ti ti-info-circle"></i>Resumo de Recursos</div>
        <div class="pcar-res-list">
          ${Object.entries(porRecurso).map(([r,os])=>`<div class="pcar-res-item"><b>${RECURSOS_LABEL[r]}</b>: ${os.length} serviços</div>`).join('')}
          <div class="pcar-res-item" style="margin-top:4px"><b>HH total</b>: ${lista.reduce((s,o)=>s+(parseFloat(o.hh_prev_servico)||0),0).toFixed(0)}h</div>
        </div>
      </div>
    </div>`;
  }

  /* ══ HTML MODAL classificação ════════════════════════════════════ */
  function htmlModal() {
    const o = OS.find(x => x.os === MODAL_OS.os && (x.cod_servico||'1') === (MODAL_OS.cod||'1'));
    const c = CFG[`${MODAL_OS.os}|${MODAL_OS.cod||'1'}`] || {};
    const tp  = c.tipo_parada||'';
    const pri = c.prioridade||'';
    const priz= c.priorizacao||'';
    const rec = c.recursos||[];
    const aok = c.andaime_ok||false;

    // Cores dos botões de parada
    const paradaCor = {geral:'sel-red',com_vapor:'sel-blue',sem_vapor:'sel-purple',caldeira_03:'sel-amber',caldeira_04:'sel-amber',caldeira_05:'sel-amber',sem_parada:'sel'};

    return `<div class="pcar-modal-overlay" id="pcar-modal-ov" onclick="if(event.target===this)pcarFecharModal()">
<div class="pcar-modal">
  <div class="pcar-modal-head">
    <div>
      <div class="pcar-modal-title">${esc(o?o.desc_servico||o.desc_os||'—':'—')}</div>
      <div class="pcar-modal-os">OS ${esc(MODAL_OS.os)} · Cód. ${esc(MODAL_OS.cod||'1')} · ${esc(o?modNome(o.equipe):'—')} · ${esc(o?o.desc_setor||o.setor||'—':'—')} · ${fmtHH(o?o.hh_prev_servico:0)}</div>
    </div>
    <button class="pcar-modal-close" onclick="pcarFecharModal()">×</button>
  </div>
  <div class="pcar-modal-body">

    <div class="mgrp">
      <div class="mgrp-lbl">Tipo de Parada</div>
      <div class="mbtn-group">
        ${Object.entries(PARADA_LABEL).map(([v,l])=>`
          <button class="mbtn ${tp===v?paradaCor[v]||'sel':''}" onclick="pcarModalSet('tipo_parada','${v}')">${l}</button>`).join('')}
      </div>
    </div>

    <div class="mgrp">
      <div class="mgrp-lbl">Prioridade</div>
      <div class="mbtn-group">
        <button class="mbtn ${pri==='alta'?'sel-red':''}" onclick="pcarModalSet('prioridade','alta')">Alta</button>
        <button class="mbtn ${pri==='media'?'sel-amber':''}" onclick="pcarModalSet('prioridade','media')">Média</button>
        <button class="mbtn ${pri==='baixa'?'sel':''}" onclick="pcarModalSet('prioridade','baixa')">Baixa</button>
      </div>
    </div>

    <div class="mgrp">
      <div class="mgrp-lbl">Priorização</div>
      <div class="mbtn-group">
        ${Object.entries(PRIORI_LABEL).map(([v,l])=>`
          <button class="mbtn ${priz===v?'sel':''}" onclick="pcarModalSet('priorizacao','${v}')">${l}</button>`).join('')}
      </div>
    </div>

    <div class="mgrp">
      <div class="mgrp-lbl">Recursos necessários</div>
      <div class="mbtn-group">
        ${Object.entries(RECURSOS_LABEL).map(([v,l])=>`
          <button class="mbtn ${rec.includes(v)?'sel':''}" onclick="pcarModalToggleRec('${v}')">${l}</button>`).join('')}
      </div>
    </div>

    ${rec.includes('andaime') ? `
    <div class="mgrp">
      <div class="mgrp-lbl">Andaime</div>
      <div class="andaime-row">
        <label class="andaime-toggle">
          <input type="checkbox" id="pcar-andaime-ok" ${aok?'checked':''} onchange="pcarModalSet('andaime_ok',this.checked)">
          <span class="andaime-slider"></span>
        </label>
        <span class="andaime-label">${aok?'<span class="andaime-ok">Andaime montado / aprovado</span>':'Andaime pendente'}</span>
      </div>
    </div>` : ''}

  </div>
  <div class="pcar-modal-footer">
    <button class="pcar-cancel-btn" onclick="pcarFecharModal()">Cancelar</button>
    <button class="pcar-save-btn" onclick="pcarSalvarModal()">Salvar</button>
  </div>
</div></div>`;
  }

  /* ══ Bind eventos ════════════════════════════════════════════════ */
  function bindEventos(container) {
    // Tabs
    container.querySelectorAll('.pcar-tab').forEach(btn => {
      if (btn.classList.contains('wip')) return;
      btn.addEventListener('click', () => { ABA = btn.dataset.aba; render(container); });
    });
    // Busca
    const busca = container.querySelector('#pcar-busca');
    if (busca) busca.addEventListener('input', e => { F.busca = e.target.value; renderChips(container); renderTabela(container); });
    // Sem classif
    const semcl = container.querySelector('#pcar-sem-classif');
    if (semcl) semcl.addEventListener('change', e => { F.semClassif = e.target.checked; renderChips(container); renderTabela(container); });
    // Sort
    container.querySelectorAll('[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (SORT.col === col) SORT.dir *= -1; else { SORT.col=col; SORT.dir=1; }
        renderTabela(container);
      });
    });
    // Import
    container.querySelector('#pcar-btn-import')?.addEventListener('click', () => container.querySelector('#pcar-file').click());
    container.querySelector('#pcar-file')?.addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return; e.target.value='';
      await importarOS(f, container);
    });
    // Export
    container.querySelector('#pcar-btn-export')?.addEventListener('click', () => exportar());
    // Config modalidades
    container.querySelector('#pcar-cfg')?.addEventListener('click', () => abrirCfgModal(container));
    container.querySelector('#pcar-btn-cfg')?.addEventListener('click', () => abrirCfgModal(container));
    // Fecha DDs ao clicar fora
    document.addEventListener('click', e => {
      if (!e.target.closest('.pcar-dd')) {
        container.querySelectorAll('.pcar-dd-panel.show').forEach(p=>p.classList.remove('show'));
        container.querySelectorAll('.pcar-dd-btn.open').forEach(b=>b.classList.remove('open'));
      }
    }, {once:false});
  }

  /* Re-render parciais sem destruir o estado dos inputs */
  function renderTabela(container) {
    const lista = osFiltradas();
    const kpi   = calcKPIs(lista);
    // Atualiza KPIs
    const kpis = container.querySelectorAll('.pcar-kpi');
    if (kpis[0]) kpis[0].querySelector('.pcar-kpi-val').textContent = lista.length;
    if (kpis[1]) { kpis[1].querySelector('.pcar-kpi-val').textContent=lista.reduce((s,o)=>s+(parseFloat(o.hh_prev_servico)||0),0).toFixed(0)+'h'; }
    if (kpis[2]) { kpis[2].querySelector('.pcar-kpi-val').textContent=kpi.classif; kpis[2].querySelector('.pcar-kpi-sub').textContent=kpi.pctClassif+'% da seleção'; }
    if (kpis[3]) { kpis[3].querySelector('.pcar-kpi-val').textContent=kpi.alta; kpis[3].classList.toggle('alert',kpi.alta>0); }
    if (kpis[4]) kpis[4].querySelector('.pcar-kpi-val').textContent=lista.filter(o=>!cfg(o).tipo_parada).length;
    // Atualiza corpo da tabela
    const tbody = container.querySelector('.pcar-table tbody');
    const tfoot = container.querySelector('.pcar-tfoot');
    if (tbody) tbody.innerHTML = lista.length ? lista.map(o=>htmlLinha(o)).join('') :
      `<tr><td colspan="10" style="text-align:center;padding:32px;color:#9ca3af"><i class="ti ti-search" style="font-size:24px;display:block;margin-bottom:8px;color:#d1d5db"></i>Nenhum serviço encontrado</td></tr>`;
    if (tfoot) tfoot.innerHTML=`Exibindo <span>${lista.length}</span> de <span>${OS.length}</span> serviços &nbsp;·&nbsp; <span>${lista.reduce((s,o)=>s+(parseFloat(o.hh_prev_servico)||0),0).toFixed(0)}h</span> previstas`;
    renderChips(container);
  }

  function renderChips(container) {
    const el = container.querySelector('#pcar-chips');
    if (el) el.innerHTML = htmlChips();
  }

  /* ══ Funções globais (chamadas inline) ═══════════════════════════ */
  window.pcarToggleDD = function(nome, e) {
    e && e.stopPropagation();
    const panel = document.getElementById(`pddp-${nome}`);
    const btn   = document.getElementById(`pddbtn-${nome}`);
    const isOpen = panel?.classList.contains('show');
    document.querySelectorAll('.pcar-dd-panel.show').forEach(p=>p.classList.remove('show'));
    document.querySelectorAll('.pcar-dd-btn.open').forEach(b=>b.classList.remove('open'));
    if (!isOpen) { panel?.classList.add('show'); btn?.classList.add('open'); }
  };

  window.pcarToggleChk = function(nome, val, e) {
    e && e.stopPropagation();
    const arr = F[nome] || [];
    const idx = arr.indexOf(val);
    if (idx >= 0) arr.splice(idx,1); else arr.push(val);
    F[nome] = arr;
    // Atualiza checkbox visual
    const inp = document.querySelector(`#pddp-${nome} input[value="${CSS.escape(val)}"]`);
    if (inp) inp.checked = arr.includes(val);
    // Atualiza badge do botão
    const btn = document.getElementById(`pddbtn-${nome}`);
    if (btn) {
      btn.classList.toggle('ativo', arr.length>0);
      let badge = btn.querySelector('.pcar-dd-badge');
      if (arr.length>0) {
        if (!badge) { badge=document.createElement('span'); badge.className='pcar-dd-badge'; btn.appendChild(badge); }
        badge.textContent=arr.length;
      } else if (badge) badge.remove();
    }
    const cont = document.querySelector('.pcar');
    if (cont) { renderChips(cont.parentElement||cont); renderTabela(cont.parentElement||cont); }
  };

  window.pcarRemoveChip = function(campo, val) {
    if (campo==='busca') { F.busca=''; const b=document.querySelector('#pcar-busca'); if(b){b.value='';} }
    else if (campo==='semClassif') { F.semClassif=false; const c=document.querySelector('#pcar-sem-classif'); if(c) c.checked=false; }
    else { F[campo]=(F[campo]||[]).filter(x=>x!==val); }
    const cont = document.querySelector('.pcar')?.parentElement;
    if (cont) { renderChips(cont); renderTabela(cont); }
  };

  /* Modal de classificação */
  let _modalDraft = {}; // alterações ainda não salvas

  window.pcarAbrirModal = function(os, cod) {
    MODAL_OS = { os, cod: cod||'1' };
    _modalDraft = { ...(CFG[`${os}|${cod||'1'}`]||{}) };
    const cont = document.querySelector('.pcar')?.parentElement || document.getElementById('module-container');
    renderModalOverlay(cont);
  };

  window.pcarFecharModal = function() {
    MODAL_OS = null; _modalDraft = {};
    document.getElementById('pcar-modal-ov')?.remove();
  };

  window.pcarModalSet = function(campo, val) {
    if (campo === 'tipo_parada' && _modalDraft.tipo_parada === val) { _modalDraft.tipo_parada = ''; }
    else if (campo === 'prioridade' && _modalDraft.prioridade === val) { _modalDraft.prioridade = ''; }
    else if (campo === 'priorizacao' && _modalDraft.priorizacao === val) { _modalDraft.priorizacao = ''; }
    else { _modalDraft[campo] = val; }
    const cont = document.querySelector('.pcar')?.parentElement || document.getElementById('module-container');
    renderModalOverlay(cont);
  };

  window.pcarModalToggleRec = function(rec) {
    const recs = [...(_modalDraft.recursos||[])];
    const idx = recs.indexOf(rec);
    if (idx>=0) recs.splice(idx,1); else recs.push(rec);
    _modalDraft.recursos = recs;
    if (!recs.includes('andaime')) _modalDraft.andaime_ok = false;
    const cont = document.querySelector('.pcar')?.parentElement || document.getElementById('module-container');
    renderModalOverlay(cont);
  };

  window.pcarSalvarModal = async function() {
    const os  = MODAL_OS.os;
    const cod = MODAL_OS.cod||'1';
    const key = `${os}|${cod}`;
    CFG[key]  = { ...(CFG[key]||{}), ..._modalDraft, os, cod_servico: cod };
    const db  = getDB();
    await db.from('parada_os_config').upsert({
      os, cod_servico: cod, ..._modalDraft,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'os,cod_servico' });
    showToastMod('Classificação salva', 'ok');
    pcarFecharModal();
    const cont = document.querySelector('.pcar')?.parentElement || document.getElementById('module-container');
    renderTabela(cont);
  };

  function renderModalOverlay(cont) {
    // Salva os dados do draft no modal atual antes de re-renderizar
    const existing = document.getElementById('pcar-modal-ov');
    const draftOv  = document.createElement('div');
    // Monta HTML do modal com _modalDraft em vez de CFG
    const o  = OS.find(x => x.os === MODAL_OS.os && (x.cod_servico||'1') === (MODAL_OS.cod||'1'));
    const c  = _modalDraft;
    const tp = c.tipo_parada||'';
    const pri= c.prioridade||'';
    const priz=c.priorizacao||'';
    const rec= c.recursos||[];
    const aok= c.andaime_ok||false;
    const paradaCor={geral:'sel-red',com_vapor:'sel-blue',sem_vapor:'sel-purple',caldeira_03:'sel-amber',caldeira_04:'sel-amber',caldeira_05:'sel-amber',sem_parada:'sel'};

    const html = `<div class="pcar-modal-overlay" id="pcar-modal-ov" onclick="if(event.target===this)pcarFecharModal()">
<div class="pcar-modal">
  <div class="pcar-modal-head">
    <div>
      <div class="pcar-modal-title">${esc(o?o.desc_servico||o.desc_os||'—':'—')}</div>
      <div class="pcar-modal-os">OS ${esc(MODAL_OS.os)} · Cód. ${esc(MODAL_OS.cod||'1')} · ${esc(o?modNome(o.equipe):'—')} · ${esc(o?o.desc_setor||o.setor||'—':'—')} · ${fmtHH(o?o.hh_prev_servico:0)}</div>
    </div>
    <button class="pcar-modal-close" onclick="pcarFecharModal()">×</button>
  </div>
  <div class="pcar-modal-body">
    <div class="mgrp">
      <div class="mgrp-lbl">Tipo de Parada</div>
      <div class="mbtn-group">
        ${Object.entries(PARADA_LABEL).map(([v,l])=>`<button class="mbtn ${tp===v?paradaCor[v]||'sel':''}" onclick="pcarModalSet('tipo_parada','${v}')">${l}</button>`).join('')}
      </div>
    </div>
    <div class="mgrp">
      <div class="mgrp-lbl">Prioridade</div>
      <div class="mbtn-group">
        <button class="mbtn ${pri==='alta'?'sel-red':''}" onclick="pcarModalSet('prioridade','alta')">Alta</button>
        <button class="mbtn ${pri==='media'?'sel-amber':''}" onclick="pcarModalSet('prioridade','media')">Média</button>
        <button class="mbtn ${pri==='baixa'?'sel':''}" onclick="pcarModalSet('prioridade','baixa')">Baixa</button>
      </div>
    </div>
    <div class="mgrp">
      <div class="mgrp-lbl">Priorização</div>
      <div class="mbtn-group">
        ${Object.entries(PRIORI_LABEL).map(([v,l])=>`<button class="mbtn ${priz===v?'sel':''}" onclick="pcarModalSet('priorizacao','${v}')">${l}</button>`).join('')}
      </div>
    </div>
    <div class="mgrp">
      <div class="mgrp-lbl">Recursos necessários</div>
      <div class="mbtn-group">
        ${Object.entries(RECURSOS_LABEL).map(([v,l])=>`<button class="mbtn ${rec.includes(v)?'sel':''}" onclick="pcarModalToggleRec('${v}')">${l}</button>`).join('')}
      </div>
    </div>
    ${rec.includes('andaime')?`<div class="mgrp">
      <div class="mgrp-lbl">Andaime</div>
      <div class="andaime-row">
        <label class="andaime-toggle">
          <input type="checkbox" ${aok?'checked':''} onchange="pcarModalSet('andaime_ok',this.checked)">
          <span class="andaime-slider"></span>
        </label>
        <span class="andaime-label">${aok?'<span class="andaime-ok">Andaime montado / aprovado</span>':'Andaime pendente'}</span>
      </div>
    </div>`:''}
  </div>
  <div class="pcar-modal-footer">
    <button class="pcar-cancel-btn" onclick="pcarFecharModal()">Cancelar</button>
    <button class="pcar-save-btn" onclick="pcarSalvarModal()">Salvar</button>
  </div>
</div></div>`;

    if (existing) existing.outerHTML = html;
    else document.body.insertAdjacentHTML('beforeend', html);
  }

  /* ══ Importar OS (xlsx) ══════════════════════════════════════════ */
  async function importarOS(arquivo, container) {
    showToastMod('Lendo arquivo…', 'info');
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const wb   = XLSX.read(e.target.result, {type:'binary', cellDates:true});
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
        if (!rows.length) { showToastMod('Nenhum dado encontrado','erro'); return; }

        const hdr = Object.keys(rows[0]);
        function colIdx(names) {
          for (const n of names) {
            const k = hdr.find(h=>String(h).trim().toLowerCase()===n.toLowerCase());
            if (k) return k;
          }
          return null;
        }
        const iOS    = colIdx(['O.S.','OS']);
        const iCod   = colIdx(['Codigo Serviço','Código Serviço','Cod Servico']);
        const iDescOS= colIdx(['Descrição OS','Descricao OS','Desc OS']);
        const iDescS = colIdx(['Descrição Serviço','Descricao Servico','Desc Servico']);
        const iEq    = colIdx(['Equipe']);
        const iSetor = colIdx(['Setor']);
        const iDescSet=colIdx(['Descrição Setor','Descricao Setor']);
        const iHhPS  = colIdx(['Hh Prev. Serviço (Decimal)','Hh Prev. Servico']);
        const iHhPOS = colIdx(['Hh Prev. OS','Hh Prev OS']);
        const iHhRS  = colIdx(['Hh Real Serviço (Decimal)','Hh Real Servico']);
        const iHhROS = colIdx(['Hh Real OS']);
        const iEquip = colIdx(['Equipamento']);
        const iDescEq= colIdx(['Descrição Equipamento','Descricao Equipamento']);
        const iTag   = colIdx(['TAG']);
        const iTipoAt= colIdx(['Tipo Ativ.','Tipo Atividade','Tipo Ativ']);
        const iStatusOS=colIdx(['Status OS']);

        const regs = [];
        rows.forEach(r => {
          const os = String(r[iOS]||'').replace(/\D/g,'');
          if (!os || os.length < 4) return;
          regs.push({
            os,
            cod_servico:      String(r[iCod]||'1').trim()||'1',
            desc_os:          String(r[iDescOS]||'').trim(),
            desc_servico:     String(r[iDescS]||'').trim(),
            equipe:           String(r[iEq]||'').trim(),
            setor:            String(r[iSetor]||'').trim(),
            desc_setor:       String(r[iDescSet]||'').trim(),
            equipamento:      String(r[iEquip]||'').trim(),
            desc_equipamento: String(r[iDescEq]||'').trim(),
            tag:              String(r[iTag]||'').trim(),
            tipo_atividade:   String(r[iTipoAt]||'').trim(),
            status_os:        String(r[iStatusOS]||'').trim(),
            hh_prev_servico:  parseFloat(r[iHhPS]||r[iHhPOS])||0,
            hh_real_servico:  parseFloat(r[iHhRS]||r[iHhROS])||0,
            importado_em:     new Date().toISOString(),
          });
        });

        if (!regs.length) { showToastMod('Nenhuma OS válida encontrada','erro'); return; }
        showToastMod(`Salvando ${regs.length} OS…`, 'info');

        const db = getDB();
        const BATCH = 100;
        for (let i=0; i<regs.length; i+=BATCH) {
          await db.from('ordens_servico').upsert(regs.slice(i,i+BATCH), {onConflict:'os,cod_servico'});
        }
        localStorage.setItem('man360_paradas_ultima_import', new Date().toLocaleString('pt-BR'));
        await carregarDados();
        render(container);
        showToastMod(`${regs.length} OS importadas com sucesso`, 'ok');
      } catch(err) {
        showToastMod('Erro: '+err.message, 'erro');
        console.error(err);
      }
    };
    reader.readAsBinaryString(arquivo);
  }

  /* ══ Exportar Excel ══════════════════════════════════════════════ */
  async function exportar() {
    if (!window.XLSX) {
      showToastMod('Preparando exportação…', 'info');
      await new Promise((res,rej) => {
        const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        s.onload=res; s.onerror=rej;
        document.head.appendChild(s);
      });
    }
    const lista = osFiltradas();
    const rows  = lista.map(o => {
      const c = cfg(o);
      return {
        'OS':          o.os,
        'Serviço':     o.desc_servico||o.desc_os||'',
        'Equipe':      o.equipe||'',
        'Modalidade':  modNome(o.equipe)||'',
        'Setor':       o.desc_setor||o.setor||'',
        'Equipamento': o.desc_equipamento||o.equipamento||'',
        'TAG':         o.tag||'',
        'HH Prev.(h)': o.hh_prev_servico||0,
        'Tipo Parada': PARADA_LABEL[c.tipo_parada||'sem_parada']||'',
        'Prioridade':  PRIO_LABEL[c.prioridade||'']||'',
        'Priorização': PRIORI_LABEL[c.priorizacao||'']||'',
        'Andaime':     (c.recursos||[]).includes('andaime')?(c.andaime_ok?'Montado':'Pendente'):'Não',
        'Munck':       (c.recursos||[]).includes('munck')?'Sim':'Não',
        'Guindaste':   (c.recursos||[]).includes('guindaste')?'Sim':'Não',
        'PTA':         (c.recursos||[]).includes('pta')?'Sim':'Não',
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Carteira');
    XLSX.writeFile(wb, `CarteiraPararadas_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToastMod('Exportado com sucesso', 'ok');
  }

  /* ══ Config modalidades ══════════════════════════════════════════ */
  let _cfgMod_edit = null;
  function abrirCfgModal(container) {
    let ov = document.getElementById('pcar-cfg-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'pcar-cfg-ov';
      ov.className = 'pcar-modal-overlay';
      ov.onclick = e => { if(e.target===ov) fecharCfgModal(); };
      document.body.appendChild(ov);
    }
    renderCfgModal(ov, container);
    ov.style.display = 'flex';
  }
  function fecharCfgModal() { document.getElementById('pcar-cfg-ov')?.remove(); _cfgMod_edit=null; }
  function renderCfgModal(ov, container) {
    const rows = MODS.map((m,i)=>{
      if (_cfgMod_edit===i) return `<tr style="background:#fffbeb">
        <td><input class="pcar-cfg-input" id="cfgm-pref" value="${esc(m.prefixo)}" placeholder="CAL" style="width:60px"></td>
        <td><input class="pcar-cfg-input" id="cfgm-nome" value="${esc(m.nome)}" placeholder="Caldeiraria"></td>
        <td style="white-space:nowrap">
          <button class="pcar-save-btn" style="font-size:10px;padding:4px 10px" onclick="pcarCfgSalvar(${i},this.closest('.pcar-modal').closest('div').parentElement)">✓ Salvar</button>
          <button class="pcar-cancel-btn" style="font-size:10px;padding:4px 8px;margin-left:4px" onclick="_cfgMod_edit=null;renderCfgModal(document.getElementById('pcar-cfg-ov'))">✕</button>
        </td>
      </tr>`;
      return `<tr>
        <td style="font-weight:600">${esc(m.prefixo)}</td>
        <td>${esc(m.nome)}</td>
        <td style="white-space:nowrap">
          <button class="pcar-cancel-btn" style="font-size:10px;padding:3px 8px" onclick="_cfgMod_edit=${i};renderCfgModal(document.getElementById('pcar-cfg-ov'))">Editar</button>
          <button class="pcar-cancel-btn" style="font-size:10px;padding:3px 8px;margin-left:4px;color:#dc2626" onclick="pcarCfgRemover(${i})">Remover</button>
        </td>
      </tr>`;
    }).join('');
    const novaRow = _cfgMod_edit===-1?`<tr style="background:#fffbeb">
      <td><input class="pcar-cfg-input" id="cfgm-pref" value="" placeholder="ELE" style="width:60px"></td>
      <td><input class="pcar-cfg-input" id="cfgm-nome" value="" placeholder="Elétrica"></td>
      <td><button class="pcar-save-btn" style="font-size:10px;padding:4px 10px" onclick="pcarCfgSalvar(-1)">✓ Salvar</button></td>
    </tr>`:'';

    ov.innerHTML = `<div class="pcar-modal" style="max-width:420px">
      <div class="pcar-modal-head">
        <div><div class="pcar-modal-title">Modalidades de Serviço</div><div class="pcar-modal-os">Prefixo equipe → nome da modalidade</div></div>
        <button class="pcar-modal-close" onclick="fecharCfgModal()">×</button>
      </div>
      <div class="pcar-modal-body" style="padding:12px 18px">
        <table class="pcar-cfg-table">
          <thead><tr><th>Prefixo</th><th>Modalidade</th><th></th></tr></thead>
          <tbody>${rows}${novaRow}</tbody>
        </table>
        ${_cfgMod_edit===null?`<button class="pcar-cancel-btn" style="margin-top:8px;font-size:11px" onclick="_cfgMod_edit=-1;renderCfgModal(document.getElementById('pcar-cfg-ov'))">+ Nova modalidade</button>`:''}
      </div>
    </div>`;
    ov.style.display='flex';
  }
  window.pcarCfgSalvar = async function(i) {
    const pref = document.getElementById('cfgm-pref')?.value.trim().toUpperCase();
    const nome = document.getElementById('cfgm-nome')?.value.trim();
    if (!pref||!nome) { showToastMod('Preencha prefixo e nome','erro'); return; }
    const db = getDB();
    if (i===-1) {
      const {data} = await db.from('config_modalidades').insert({prefixo:pref,nome}).select();
      if (data) MODS.push(data[0]);
    } else {
      await db.from('config_modalidades').update({prefixo:pref,nome}).eq('id',MODS[i].id);
      MODS[i]={...MODS[i],prefixo:pref,nome};
    }
    _cfgMod_edit=null;
    renderCfgModal(document.getElementById('pcar-cfg-ov'));
    showToastMod('Modalidade salva','ok');
  };
  window.pcarCfgRemover = async function(i) {
    if (!confirm('Remover esta modalidade?')) return;
    const db=getDB(); const m=MODS[i];
    if (m.id) await db.from('config_modalidades').delete().eq('id',m.id);
    MODS.splice(i,1); _cfgMod_edit=null;
    renderCfgModal(document.getElementById('pcar-cfg-ov'));
    showToastMod('Removida','ok');
  };
  window.fecharCfgModal = fecharCfgModal;

  /* ══ Carregar dados do Supabase ══════════════════════════════════ */
  async function carregarDados() {
    const db = getDB();
    const [rOS, rCFG, rMODS] = await Promise.all([
      db.from('ordens_servico').select('os,cod_servico,desc_os,desc_servico,equipe,setor,desc_setor,equipamento,desc_equipamento,tag,tipo_atividade,status_os,hh_prev_servico,hh_real_servico').order('os',{ascending:true}),
      db.from('parada_os_config').select('*'),
      db.from('config_modalidades').select('*').order('prefixo',{ascending:true}),
    ]);
    OS   = rOS.data   || [];
    MODS = rMODS.data || [];
    CFG  = {};
    (rCFG.data||[]).forEach(c => { CFG[`${c.os}|${c.cod_servico||'1'}`] = c; });
  }

  /* ══ Toast ═══════════════════════════════════════════════════════ */
  function showToastMod(msg, tipo) {
    if (window.showToast) { window.showToast(msg, tipo); return; }
    const t=document.getElementById('toast'); if(!t) return;
    t.className=tipo||'info';
    document.getElementById('toast-icon').className='ti '+(tipo==='ok'?'ti-check':tipo==='erro'?'ti-alert-circle':'ti-info-circle');
    document.getElementById('toast-msg').textContent=msg;
    t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3500);
  }

  /* ══ Registro ════════════════════════════════════════════════════ */
  window.Modulos = window.Modulos || {};
  window.Modulos['paradas-carteira'] = {
    async init(container) {
      container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px;gap:10px;color:#9ca3af"><div class="loading-spinner"></div> Carregando carteira…</div>`;
      await carregarDados();
      render(container);
    }
  };

})();
