/* ═══════════════════════════════════════════════════════════════════
   MAN360 — Carteira de Serviços — Paradas  v2
   Arquivo: modules/paradas-carteira.js
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SUPABASE_URL     = 'https://gwejwvsmmogzdpgyaggf.supabase.co';
  const STORAGE_BUCKET   = 'os-fotos';

  /* ── Constantes ── */
  const PARADA_LABEL = {
    geral:'Parada geral', com_vapor:'Com vapor',
    sem_vapor:'Sem vapor (caldeiras)',
    caldeira_03:'Caldeira 03', caldeira_04:'Caldeira 04', caldeira_05:'Caldeira 05',
    sem_parada:'Sem parada',
  };
  const PARADA_GRUPOS = {
    com_vapor: ['com_vapor'],
    sem_vapor: ['sem_vapor','caldeira_03','caldeira_04','caldeira_05'],
  };
  const PRIO_LABEL  = { alta:'Alta', media:'Média', baixa:'Baixa' };
  const CAT_LABEL   = {
    seguranca:'Segurança',
    correcao_perdas:'Correção Perdas',
    correcao_processos:'Correção Processos',
    melhoria:'Melhoria',
  };
  const REC_LABEL   = { andaime:'Andaime', munck:'Munck', guindaste:'Guindaste', pta:'PTA' };
  const REC_ICON    = { andaime:'ti-ladder', munck:'ti-crane', guindaste:'ti-arrow-up-circle', pta:'ti-forklift' };
  const STATUS_EXCLUIR = ['cancelado','encerrado','2 - encerrada','3 - cancelada','cancelada','encerrada'];

  /* ── Estado ── */
  let OS   = [];
  let CFG  = {};
  let MODS = [];
  let ABA  = 'lista';
  let MODAL_KEY = null;
  let DRAFT = {};
  let SORT = { col:'os', dir:1 };
  let F = { busca:'', parada:[], modalidade:[], prioridade:[], categoria:[], recurso:[], setor:[] };
  let _container = null;

  /* ── Helpers ── */
  const esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmtH = v => { const h=parseFloat(v)||0; return h>0?h.toFixed(1)+'h':'—'; };

  function cfg(os, cod) { return CFG[`${os}|${cod||'1'}`] || {}; }

  function modNome(equipe) {
    if (!equipe) return '';
    const pref = String(equipe).toUpperCase().replace(/\d/g,'').trim().slice(0,3);
    const m = MODS.find(x => x.prefixo === pref);
    return m ? m.nome : '';  // vazio se não mapeado
  }

  function isExcluido(o) {
    const st = String(o.status_os||'').toLowerCase().trim();
    if (STATUS_EXCLUIR.some(s => st.includes(s))) return true;
    const ta = String(o.tipo_atividade||'').toUpperCase().trim();
    if (ta === 'MCU') return true;
    return false;
  }

  function osFiltradas() {
    let d = OS.filter(o => {
      if (isExcluido(o)) return false;
      const c   = cfg(o.os, o.cod_servico);
      const mod = modNome(o.equipe);
      const set = (o.desc_setor||'').trim();
      const tp  = c.tipo_parada || 'sem_parada';

      if (F.busca) {
        const b = F.busca.toLowerCase();
        const t = `${o.os} ${o.desc_servico||o.desc_os||''} ${o.desc_equipamento||''} ${mod} ${set}`.toLowerCase();
        if (!t.includes(b)) return false;
      }
      if (F.parada.length) {
        const ok = F.parada.some(p => {
          if (p === 'sem_parada') return tp === 'sem_parada';
          if (PARADA_GRUPOS[p])  return PARADA_GRUPOS[p].includes(tp);
          return tp === p;
        });
        if (!ok) return false;
      }
      if (F.modalidade.length && !F.modalidade.includes(mod)) return false;
      if (F.prioridade.length && !F.prioridade.includes(c.prioridade||'')) return false;
      if (F.categoria.length  && !F.categoria.includes(c.categoria||''))   return false;
      if (F.recurso.length) {
        const rec = c.recursos||[];
        if (!F.recurso.some(r => rec.includes(r))) return false;
      }
      if (F.setor.length && !F.setor.includes(set)) return false;
      return true;
    });

    return [...d].sort((a,b) => {
      const ca = cfg(a.os,a.cod_servico), cb = cfg(b.os,b.cod_servico);
      let va, vb;
      switch (SORT.col) {
        case 'os':    va=a.os; vb=b.os; break;
        case 'desc':  va=a.desc_servico||a.desc_os||''; vb=b.desc_servico||b.desc_os||''; break;
        case 'hh':    va=parseFloat(a.hh_prev_servico)||0; vb=parseFloat(b.hh_prev_servico)||0; break;
        case 'mod':   va=modNome(a.equipe); vb=modNome(b.equipe); break;
        case 'setor': va=a.desc_setor||''; vb=b.desc_setor||''; break;
        case 'parada':va=PARADA_LABEL[ca.tipo_parada||'sem_parada']||''; vb=PARADA_LABEL[cb.tipo_parada||'sem_parada']||''; break;
        case 'prio':  { const ord={alta:0,media:1,baixa:2,'':3}; va=ord[ca.prioridade||'']; vb=ord[cb.prioridade||'']; break; }
        default: va=a.os; vb=b.os;
      }
      if (va<vb) return -SORT.dir; if (va>vb) return SORT.dir; return 0;
    });
  }

  function osBase() { return OS.filter(o => !isExcluido(o)); }

  function calcKPIs(lista) {
    const total  = lista.length;
    const hh     = lista.reduce((s,o)=>s+(parseFloat(o.hh_prev_servico)||0),0);
    const svList = lista.filter(o=>{ const tp=cfg(o.os,o.cod_servico).tipo_parada||'sem_parada'; return PARADA_GRUPOS.sem_vapor?.includes(tp)||tp==='sem_vapor'; });
    const svAlta = svList.filter(o=>cfg(o.os,o.cod_servico).prioridade==='alta').length;
    const cvList = lista.filter(o=>{ const tp=cfg(o.os,o.cod_servico).tipo_parada||'sem_parada'; return PARADA_GRUPOS.com_vapor?.includes(tp)||tp==='com_vapor'; });
    const cvAlta = cvList.filter(o=>cfg(o.os,o.cod_servico).prioridade==='alta').length;
    return { total, hh, sv:svList.length, svAlta, cv:cvList.length, cvAlta };
  }

  /* ══ RENDER PRINCIPAL ══ */
  function render() {
    const lista = osFiltradas();
    const kpi   = calcKPIs(lista);
    const setores     = [...new Set(osBase().map(o=>(o.desc_setor||'').trim()).filter(s=>s&&!/^\d+$/.test(s)))].sort();
    const modalidades = [...new Set(osBase().map(o=>modNome(o.equipe)).filter(Boolean))].sort();

    _container.innerHTML = `
<style>
.pc{font-family:var(--font);color:#1a1a1a}
.pc-top{display:flex;align-items:center;justify-content:space-between;padding:0 0 14px;flex-wrap:wrap;gap:10px}
.pc-title{font-size:14px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#374151;display:flex;align-items:center;gap:8px}
.pc-title i{font-size:18px;color:var(--yellow)}
.pc-actions{display:flex;gap:8px}
.pc-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:14px}
.pc-kpi{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:11px 14px;box-shadow:var(--shadow)}
.pc-kpi-lbl{font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px}
.pc-kpi-val{font-size:20px;font-weight:700;line-height:1;color:var(--yellow)}
.pc-kpi-sub{font-size:10px;color:#9ca3af;margin-top:3px}
.pc-kpi.alert .pc-kpi-val{color:#dc2626}
.pc-tabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:14px}
.pc-tab{padding:9px 16px;font-size:12px;color:#6b7280;cursor:pointer;border-bottom:2px solid transparent;font-family:var(--font);background:none;border-top:none;border-left:none;border-right:none;font-weight:500}
.pc-tab.active{color:#111;border-bottom-color:var(--yellow);font-weight:700}
.pc-tab.wip{opacity:.4;cursor:default}
.pc-filters{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;box-shadow:var(--shadow);margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.pc-search{display:flex;align-items:center;gap:6px;flex:1;min-width:200px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 10px;height:30px;background:var(--bg)}
.pc-search input{border:none;background:none;outline:none;font-family:var(--font);font-size:11px;width:100%;color:#374151}
.pc-search i{font-size:14px;color:#9ca3af}
.pc-dd{position:relative}
.pc-dd-btn{height:30px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:5px;color:#374151;white-space:nowrap}
.pc-dd-btn.ativo{border-color:var(--yellow);background:#fffbeb}
.pc-dd-btn i.ico{font-size:13px;color:#6b7280}
.pc-dd-btn .arr{font-size:10px;margin-left:2px;transition:transform 200ms}
.pc-dd-btn.open .arr{transform:rotate(180deg)}
.pc-dd-badge{background:var(--yellow);color:var(--dark1);border-radius:10px;font-size:9px;font-weight:700;padding:1px 5px;margin-left:2px}
.pc-dd-panel{position:absolute;top:calc(100%+4px);left:0;min-width:180px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);z-index:300;display:none;max-height:260px;overflow-y:auto}
.pc-dd-panel.show{display:block}
.pc-dd-item{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:11px;font-weight:500;color:#374151;cursor:pointer;user-select:none}
.pc-dd-item:hover{background:var(--bg)}
.pc-dd-item input{accent-color:var(--yellow);pointer-events:none;flex-shrink:0}
.pc-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:0}
.pc-chips:empty{display:none}
.pc-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;background:#fef3c7;border:1px solid #fbbf24;border-radius:10px;font-size:10px;font-weight:600;color:#92400e}
.pc-chip button{background:none;border:none;cursor:pointer;color:#92400e;font-size:13px;line-height:1;padding:0}
.pc-tw{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.pc-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:auto}
.pc-table th{text-align:left;padding:8px 10px;background:var(--bg);color:#4b5563;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;cursor:pointer;user-select:none}
.pc-table th.sorted{color:var(--yellow-dk)}
.pc-table th.ns{cursor:default}
.sico{font-size:10px;margin-left:3px;opacity:.3}
.sorted .sico{opacity:1}
.pc-table td{padding:9px 10px;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap}
.pc-table td.wrap{white-space:normal;max-width:260px}
.pc-table tbody tr:hover td{background:#fafafa;cursor:pointer}
.pc-table tbody tr:last-child td{border-bottom:none}
.pc-foot{padding:8px 14px;font-size:11px;color:#6b7280;background:var(--bg);border-top:1px solid var(--border)}
.pc-foot span{color:#374151}
.pb{display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap}
.pb-none{color:#9ca3af;font-size:11px}
.pb-alta{background:#fee2e2;color:#991b1b}
.pb-media{background:#fef3c7;color:#92400e}
.pb-baixa{background:#dcfce7;color:#14532d}
.pb-geral{background:#fee2e2;color:#991b1b}
.pb-cv{background:#dbeafe;color:#1e3a8a}
.pb-sv{background:#ede9fe;color:#4c1d95}
.pb-cal{background:#fef3c7;color:#92400e}
.pb-sp{background:#f3f4f6;color:#6b7280}
.rec-icons{display:flex;gap:4px;align-items:center}
.rec-icon{font-size:13px}
.rec-icon.andaime-pend{color:#dc2626}
.rec-icon.andaime-ok{color:#16a34a}
.rec-icon.rec-on{color:#374151}
.edit-btn{background:none;border:1px solid var(--border);border-radius:var(--radius-sm);width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6b7280;transition:all 120ms}
.edit-btn:hover{background:var(--yellow);border-color:var(--yellow);color:var(--dark1)}
/* Modal */
.pc-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding-top:40px;overflow-y:auto}
.pc-modal{background:var(--card-bg);border-radius:var(--radius);width:560px;max-width:96vw;box-shadow:0 8px 32px rgba(0,0,0,.22);overflow:hidden;margin-bottom:24px}
.pc-mhead{padding:14px 18px;background:var(--bg);border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.pc-mtitle{font-size:13px;font-weight:700;color:#111;line-height:1.3}
.pc-msub{font-size:10px;color:#6b7280;margin-top:3px}
.pc-mclose{background:none;border:none;cursor:pointer;font-size:20px;color:#6b7280;line-height:1;flex-shrink:0;padding:0}
.pc-mbody{padding:16px 18px;display:flex;flex-direction:column;gap:0}
.pc-mfoot{padding:10px 18px;border-top:1px solid var(--border);background:var(--bg);display:flex;gap:8px;justify-content:flex-end}
/* Seções do modal */
.pc-msec{border-bottom:1px solid var(--border);padding:12px 0}
.pc-msec:last-child{border-bottom:none}
.pc-msec-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px}
/* Botões de seleção estilo cascata */
.pc-sel-row{display:flex;flex-wrap:wrap;gap:6px}
.pc-sel-btn{padding:5px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px;font-weight:500;cursor:pointer;background:var(--bg);color:#374151;transition:all 120ms}
.pc-sel-btn:hover{border-color:#9ca3af}
.pc-sel-btn.sel{border-color:var(--yellow);background:var(--yellow);color:var(--dark1);font-weight:700}
.pc-sel-btn.sel-red{border-color:#dc2626;background:#fee2e2;color:#991b1b;font-weight:700}
.pc-sel-btn.sel-blue{border-color:#2563eb;background:#dbeafe;color:#1e3a8a;font-weight:700}
.pc-sel-btn.sel-purple{border-color:#7c3aed;background:#ede9fe;color:#4c1d95;font-weight:700}
.pc-sel-btn.sel-amber{border-color:#d97706;background:#fef3c7;color:#92400e;font-weight:700}
/* Textarea */
.pc-textarea{width:100%;border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 10px;font-family:var(--font);font-size:11px;color:#374151;background:var(--bg);resize:vertical;min-height:64px;box-sizing:border-box}
.pc-textarea:focus{outline:2px solid var(--yellow);outline-offset:-1px;border-color:transparent}
/* Upload de mídia */
.pc-upload-area{border:1.5px dashed var(--border);border-radius:var(--radius);padding:14px;text-align:center;cursor:pointer;transition:all 150ms;background:var(--bg)}
.pc-upload-area:hover{border-color:var(--yellow);background:#fffbeb}
.pc-upload-area i{font-size:22px;color:#d1d5db;display:block;margin-bottom:4px}
.pc-upload-area p{font-size:10px;color:#9ca3af;margin:0}
.pc-media-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}
.pc-media-item{position:relative;border-radius:6px;overflow:hidden;aspect-ratio:1;background:#f3f4f6;border:1px solid var(--border)}
.pc-media-item img,.pc-media-item video{width:100%;height:100%;object-fit:cover}
.pc-media-del{position:absolute;top:3px;right:3px;background:rgba(0,0,0,.55);border:none;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;font-size:12px}
.pc-media-item.uploading{opacity:.5}
.pc-media-item .upload-prog{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.3);color:#fff;font-size:10px;font-weight:700}
.pc-mselect{width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:12px;color:#374151;padding:0 10px;cursor:pointer;margin-bottom:6px}
.pc-mselect:focus{outline:2px solid var(--yellow);outline-offset:-1px;border-color:transparent}
.pc-msel-badge{display:inline-block;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600;margin-top:2px}
.pc-msel-red{background:#fee2e2;color:#991b1b}
.pc-msel-blue{background:#dbeafe;color:#1e3a8a}
.pc-msel-purple{background:#ede9fe;color:#4c1d95}
.pc-msel-amber{background:#fef3c7;color:#92400e}
.pc-msel-green{background:#dcfce7;color:#14532d}
.pc-msel-gray{background:#f3f4f6;color:#374151}
.pc-save-btn{padding:7px 18px;border:none;border-radius:var(--radius-sm);background:var(--yellow);color:var(--dark1);font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer}
.pc-cancel-btn{padding:7px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:12px;font-weight:500;cursor:pointer;color:#374151}
/* Recursos aba */
.pc-res-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pc-res-card{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;box-shadow:var(--shadow)}
.pc-res-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.pc-res-title i{font-size:14px;color:var(--yellow)}
.pc-res-item{font-size:11px;color:#374151;padding:4px 0;border-bottom:1px solid var(--border);cursor:pointer}
.pc-res-item:last-child{border-bottom:none}
.pc-res-empty{font-size:11px;color:#9ca3af}
</style>

<div class="pc">
  <div class="pc-top">
    <div class="pc-title"><i class="ti ti-calendar-event"></i>Carteira de Serviços — Paradas</div>
    <div class="pc-actions">
      <button class="topbar-btn" id="pc-btn-mod"><i class="ti ti-settings"></i><span>Modalidades</span></button>
      <button class="topbar-btn" id="pc-btn-imp"><i class="ti ti-upload"></i><span>Importar OS</span></button>
      <button class="topbar-btn" id="pc-btn-exp"><i class="ti ti-table-export"></i><span>Exportar</span></button>
    </div>
  </div>
  <input type="file" id="pc-file" accept=".xlsx,.xls" style="display:none">

  <!-- KPIs -->
  <div class="pc-kpis">
    <div class="pc-kpi">
      <div class="pc-kpi-lbl">Total de OS</div>
      <div class="pc-kpi-val" id="k-total">${lista.length}</div>
      <div class="pc-kpi-sub">de ${osBase().length} na base</div>
    </div>
    <div class="pc-kpi">
      <div class="pc-kpi-lbl">HH Previsto</div>
      <div class="pc-kpi-val" id="k-hh">${kpi.hh.toFixed(0)}h</div>
      <div class="pc-kpi-sub">na seleção</div>
    </div>
    <div class="pc-kpi">
      <div class="pc-kpi-lbl">OS Sem Vapor</div>
      <div class="pc-kpi-val" id="k-sv">${kpi.sv}</div>
      <div class="pc-kpi-sub">caldeiras paradas</div>
    </div>
    <div class="pc-kpi ${kpi.svAlta>0?'alert':''}">
      <div class="pc-kpi-lbl">Sem Vapor · Alta</div>
      <div class="pc-kpi-val" id="k-sva">${kpi.svAlta}</div>
      <div class="pc-kpi-sub">prioridade alta</div>
    </div>
    <div class="pc-kpi">
      <div class="pc-kpi-lbl">OS Com Vapor</div>
      <div class="pc-kpi-val" id="k-cv">${kpi.cv}</div>
      <div class="pc-kpi-sub">moenda parada</div>
    </div>
    <div class="pc-kpi ${kpi.cvAlta>0?'alert':''}">
      <div class="pc-kpi-lbl">Com Vapor · Alta</div>
      <div class="pc-kpi-val" id="k-cva">${kpi.cvAlta}</div>
      <div class="pc-kpi-sub">prioridade alta</div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="pc-tabs">
    <button class="pc-tab ${ABA==='lista'?'active':''}" data-aba="lista">Lista de Serviços</button>
    <button class="pc-tab ${ABA==='recursos'?'active':''}" data-aba="recursos">Recursos</button>
    <button class="pc-tab wip">Planos</button>
  </div>

  ${ABA==='lista' ? htmlLista(lista, setores, modalidades) : htmlRecursos(lista)}
</div>`;

    bind();
  }

  /* ══ HTML LISTA ══ */
  function htmlLista(lista, setores, modalidades) {
    function th(col, lbl, ns) {
      const at = SORT.col===col;
      return `<th class="${at?'sorted':''} ${ns?'ns':''}" ${ns?'':` data-sort="${col}"`}>${lbl}${ns?'':` <span class="sico">${at?(SORT.dir===1?'↑':'↓'):'⇅'}</span>`}</th>`;
    }
    return `
<div class="pc-filters">
  <div class="pc-search"><i class="ti ti-search"></i><input id="pc-busca" type="text" placeholder="Buscar OS, descrição…" value="${esc(F.busca)}"></div>
  ${mkDD('parada','ti-calendar-event','Parada', Object.entries(PARADA_LABEL).map(([v,l])=>({v,l})))}
  ${mkDD('modalidade','ti-tool','Modalidade', modalidades.map(m=>({v:m,l:m})))}
  ${mkDD('prioridade','ti-alert-triangle','Prioridade', Object.entries(PRIO_LABEL).map(([v,l])=>({v,l})))}
  ${mkDD('categoria','ti-star','Categoria', Object.entries(CAT_LABEL).map(([v,l])=>({v,l})))}
  ${mkDD('recurso','ti-crane','Recurso', Object.entries(REC_LABEL).map(([v,l])=>({v,l})))}
  ${mkDD('setor','ti-building','Setor', setores.map(s=>({v:s,l:s})))}
</div>
<div class="pc-chips" id="pc-chips">${htmlChips()}</div>
<div class="pc-tw">
  <table class="pc-table">
    <thead><tr>
      ${th('os','OS')} ${th('desc','Descrição')} ${th('setor','Setor')}
      ${th('mod','Modalidade')} ${th('hh','HH Prev.')}
      ${th('parada','Tipo Parada')} ${th('prio','Prio.')}
      <th class="ns">Categoria</th><th class="ns">Recursos</th><th class="ns" style="width:36px"></th>
    </tr></thead>
    <tbody id="pc-tbody">
      ${lista.length ? lista.map(htmlLinha).join('') :
        `<tr><td colspan="10" style="text-align:center;padding:32px;color:#9ca3af">
          <i class="ti ti-search" style="font-size:28px;display:block;margin-bottom:8px;color:#d1d5db"></i>
          Nenhum serviço encontrado
        </td></tr>`}
    </tbody>
  </table>
  <div class="pc-foot" id="pc-foot">
    Exibindo <span>${lista.length}</span> de <span>${osBase().length}</span> serviços &nbsp;·&nbsp;
    <span>${lista.reduce((s,o)=>s+(parseFloat(o.hh_prev_servico)||0),0).toFixed(0)}h</span> previstas
  </div>
</div>`;
  }

  function mkDD(nome, icon, label, opcoes) {
    const sel = F[nome]||[];
    return `<div class="pc-dd" id="pdd-${nome}">
      <button class="pc-dd-btn ${sel.length?'ativo':''}" id="pddbtn-${nome}" onclick="pcToggleDD('${nome}',event)">
        <i class="ti ${icon} ico"></i>${label}${sel.length?`<span class="pc-dd-badge">${sel.length}</span>`:''}
        <i class="ti ti-chevron-down arr"></i>
      </button>
      <div class="pc-dd-panel" id="pddp-${nome}">
        ${opcoes.map((o,i)=>`<label class="pc-dd-item" onclick="pcToggleChk('${nome}',${i},event)">
          <input type="checkbox" id="pchk-${nome}-${i}" data-val="${esc(o.v)}" ${sel.includes(o.v)?'checked':''}> ${esc(o.l)}
        </label>`).join('')}
      </div>
    </div>`;
  }

  function htmlChips() {
    const lbls = {parada:'Parada',modalidade:'Modal.',prioridade:'Prio.',categoria:'Categ.',recurso:'Recurso',setor:'Setor'};
    const fmtV = {
      parada:v=>PARADA_LABEL[v]||v, prioridade:v=>PRIO_LABEL[v]||v,
      categoria:v=>CAT_LABEL[v]||v, recurso:v=>REC_LABEL[v]||v,
      modalidade:v=>v, setor:v=>v,
    };
    let h='';
    Object.keys(lbls).forEach(n=>{
      (F[n]||[]).forEach(v=>{
        h+=`<span class="pc-chip">${lbls[n]}: ${esc(fmtV[n](v))} <button onclick="pcRemoveChip('${n}','${esc(v)}')">×</button></span>`;
      });
    });
    if (F.busca) h+=`<span class="pc-chip">Busca: "${esc(F.busca)}" <button onclick="pcRemoveChip('busca','')">×</button></span>`;
    return h;
  }

  function htmlLinha(o) {
    const c   = cfg(o.os, o.cod_servico);
    const tp  = c.tipo_parada || 'sem_parada';
    const mod = modNome(o.equipe);
    const rec = c.recursos||[];

    // Badge parada
    const pClr = {geral:'pb-geral',com_vapor:'pb-cv',sem_vapor:'pb-sv',
      caldeira_03:'pb-cal',caldeira_04:'pb-cal',caldeira_05:'pb-cal',sem_parada:'pb-sp'};
    const pBadge = `<span class="pb ${pClr[tp]||'pb-sp'}">${PARADA_LABEL[tp]||'Sem parada'}</span>`;

    // Badge prioridade
    const prioBadge = c.prioridade
      ? `<span class="pb pb-${c.prioridade}">${PRIO_LABEL[c.prioridade]}</span>`
      : `<span class="pb-none">—</span>`;

    // Ícones de recursos
    let recHtml = '';
    if (rec.length) {
      recHtml = `<div class="rec-icons">` +
        rec.map(r => {
          let cls = 'rec-on';
          if (r==='andaime') cls = c.andaime_ok ? 'andaime-ok' : 'andaime-pend';
          return `<i class="ti ${REC_ICON[r]||'ti-tool'} rec-icon ${cls}" title="${REC_LABEL[r]||r}${r==='andaime'?(c.andaime_ok?' ✓ montado':' ⚠ pendente'):''}"></i>`;
        }).join('') + `</div>`;
    }

    const key = `${o.os}|${o.cod_servico||'1'}`;
    return `<tr onclick="pcAbrirModal('${esc(o.os)}','${esc(o.cod_servico||'1')}')">
      <td style="font-weight:600;color:#374151">${esc(o.os)}</td>
      <td class="wrap" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(o.desc_servico||o.desc_os||'—')}</td>
      <td style="font-size:11px;color:#4b5563;max-width:110px;overflow:hidden;text-overflow:ellipsis">${esc((o.desc_setor||'—').trim())}</td>
      <td style="font-size:11px;color:#4b5563">${esc(mod||'—')}</td>
      <td style="font-size:11px;font-weight:500">${fmtH(o.hh_prev_servico)}</td>
      <td>${pBadge}</td>
      <td>${prioBadge}</td>
      <td style="font-size:10px;color:#4b5563">${c.categoria?esc(CAT_LABEL[c.categoria]||c.categoria):`<span class="pb-none">—</span>`}</td>
      <td>${recHtml||`<span class="pb-none" style="font-size:10px">—</span>`}</td>
      <td><button class="edit-btn" onclick="pcAbrirModal('${esc(o.os)}','${esc(o.cod_servico||'1')}');event.stopPropagation()"><i class="ti ti-pencil" style="font-size:12px"></i></button></td>
    </tr>`;
  }

  /* ══ HTML RECURSOS ══ */
  function htmlRecursos(lista) {
    const icons2 = {andaime:'ti-ladder',munck:'ti-crane',guindaste:'ti-arrow-up-circle',pta:'ti-forklift'};
    return `<div class="pc-res-grid">
      ${Object.entries(REC_LABEL).map(([r,rl])=>{
        const osR = lista.filter(o=>(cfg(o.os,o.cod_servico).recursos||[]).includes(r));
        return `<div class="pc-res-card">
          <div class="pc-res-title"><i class="ti ${icons2[r]||'ti-tool'}"></i>${rl}
            <span style="background:var(--yellow);color:var(--dark1);border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">${osR.length}</span>
          </div>
          <div>${osR.length ? osR.slice(0,8).map(o=>{
            const c=cfg(o.os,o.cod_servico);
            const aok=r==='andaime'&&c.andaime_ok;
            return `<div class="pc-res-item" onclick="pcAbrirModal('${esc(o.os)}','${esc(o.cod_servico||'1')}')">
              <b>${esc(o.os)}</b> — ${esc((o.desc_servico||o.desc_os||'').slice(0,28))}
              ${r==='andaime'?`<span style="color:${aok?'#16a34a':'#dc2626'};font-size:10px"> ${aok?'✓':'⚠'}</span>`:''}
            </div>`;
          }).join('')+(osR.length>8?`<div class="pc-res-empty">+${osR.length-8} mais…</div>`:'')
          : `<div class="pc-res-empty">Nenhum serviço</div>`}</div>
        </div>`;
      }).join('')}
      <div class="pc-res-card">
        <div class="pc-res-title"><i class="ti ti-info-circle"></i>Resumo</div>
        ${Object.entries(REC_LABEL).map(([r,rl])=>
          `<div class="pc-res-item"><b>${rl}</b>: ${lista.filter(o=>(cfg(o.os,o.cod_servico).recursos||[]).includes(r)).length}</div>`
        ).join('')}
        <div class="pc-res-item" style="margin-top:4px"><b>HH total</b>: ${lista.reduce((s,o)=>s+(parseFloat(o.hh_prev_servico)||0),0).toFixed(0)}h</div>
      </div>
    </div>`;
  }

  /* ══ BIND EVENTOS ══ */
  function bind() {
    const c = _container;
    c.querySelectorAll('.pc-tab').forEach(btn=>{
      if (btn.classList.contains('wip')) return;
      btn.addEventListener('click',()=>{ ABA=btn.dataset.aba; render(); });
    });
    c.querySelector('#pc-busca')?.addEventListener('input', e=>{
      F.busca=e.target.value; updateLista();
    });
    c.querySelectorAll('[data-sort]').forEach(th=>{
      th.addEventListener('click',()=>{
        const col=th.dataset.sort;
        if(SORT.col===col) SORT.dir*=-1; else{SORT.col=col;SORT.dir=1;}
        updateLista();
      });
    });
    c.querySelector('#pc-btn-imp')?.addEventListener('click',()=>c.querySelector('#pc-file').click());
    c.querySelector('#pc-file')?.addEventListener('change',async e=>{
      const f=e.target.files[0]; if(!f) return; e.target.value='';
      await importarOS(f);
    });
    c.querySelector('#pc-btn-exp')?.addEventListener('click',()=>exportar());
    c.querySelector('#pc-btn-mod')?.addEventListener('click',()=>abrirModalidades());
    document.addEventListener('click', e=>{
      if (!e.target.closest('.pc-dd'))
        document.querySelectorAll('.pc-dd-panel.show').forEach(p=>p.classList.remove('show'));
    });
  }

  /* ── Atualização parcial da lista ── */
  function updateLista() {
    const lista = osFiltradas();
    const kpi   = calcKPIs(lista);
    const tbody = document.getElementById('pc-tbody');
    const foot  = document.getElementById('pc-foot');
    const chips = document.getElementById('pc-chips');

    if (tbody) tbody.innerHTML = lista.length ? lista.map(htmlLinha).join('') :
      `<tr><td colspan="10" style="text-align:center;padding:32px;color:#9ca3af"><i class="ti ti-search" style="font-size:28px;display:block;margin-bottom:8px;color:#d1d5db"></i>Nenhum serviço encontrado</td></tr>`;
    if (foot) foot.innerHTML = `Exibindo <span>${lista.length}</span> de <span>${osBase().length}</span> serviços &nbsp;·&nbsp; <span>${lista.reduce((s,o)=>s+(parseFloat(o.hh_prev_servico)||0),0).toFixed(0)}h</span> previstas`;
    if (chips) chips.innerHTML = htmlChips();

    // KPIs
    const upd = (id,val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
    upd('k-total', lista.length);
    upd('k-hh', kpi.hh.toFixed(0)+'h');
    upd('k-sv', kpi.sv);
    upd('k-sva', kpi.svAlta);
    upd('k-cv', kpi.cv);
    upd('k-cva', kpi.cvAlta);
  }

  /* ══ FUNÇÕES GLOBAIS ══ */
  window.pcToggleDD = function(nome, e) {
    e?.stopPropagation();
    const panel = document.getElementById(`pddp-${nome}`);
    const btn   = document.getElementById(`pddbtn-${nome}`);
    const isOpen = panel?.classList.contains('show');
    document.querySelectorAll('.pc-dd-panel.show').forEach(p=>p.classList.remove('show'));
    if (!isOpen) { panel?.classList.add('show'); btn?.classList.add('open'); }
    else btn?.classList.remove('open');
  };

  window.pcToggleChk = function(nome, itemIdx, e) {
    e?.stopPropagation();
    // Pega o valor real pelo data-val do checkbox indexado
    const inp = document.getElementById(`pchk-${nome}-${itemIdx}`);
    if (!inp) return;
    const val = inp.dataset.val;
    inp.checked = !inp.checked;
    const arr = F[nome]||[];
    const pos = arr.indexOf(val);
    if (inp.checked && pos<0) arr.push(val);
    else if (!inp.checked && pos>=0) arr.splice(pos,1);
    F[nome] = arr;
    const btn = document.getElementById(`pddbtn-${nome}`);
    if (btn) {
      btn.classList.toggle('ativo', arr.length>0);
      let badge = btn.querySelector('.pc-dd-badge');
      if (arr.length>0) {
        if (!badge) { badge=document.createElement('span'); badge.className='pc-dd-badge'; btn.insertBefore(badge, btn.querySelector('.arr')); }
        badge.textContent = arr.length;
      } else if (badge) badge.remove();
    }
    updateLista();
  };

  window.pcRemoveChip = function(campo, val) {
    if (campo==='busca') { F.busca=''; const b=document.getElementById('pc-busca'); if(b) b.value=''; }
    else {
      F[campo]=(F[campo]||[]).filter(x=>x!==val);
      // Desmarca visualmente o checkbox correspondente
      document.querySelectorAll(`#pddp-${campo} input[data-val="${CSS.escape(val)}"]`)
        .forEach(inp => inp.checked=false);
      const btn=document.getElementById(`pddbtn-${campo}`);
      if (btn) {
        const arr=F[campo]||[];
        btn.classList.toggle('ativo',arr.length>0);
        const badge=btn.querySelector('.pc-dd-badge');
        if (arr.length>0 && badge) badge.textContent=arr.length;
        else if (badge) badge.remove();
      }
    }
    updateLista();
  };

  /* ══ MODAL DE CLASSIFICAÇÃO ══ */
  window.pcAbrirModal = function(os, cod) {
    MODAL_KEY = `${os}|${cod||'1'}`;
    DRAFT = { ...(CFG[MODAL_KEY]||{}) };
    if (!DRAFT.recursos) DRAFT.recursos=[];
    if (!DRAFT.fotos)    DRAFT.fotos=[];
    renderModal();
  };

  window.pcFecharModal = function() {
    MODAL_KEY=null; DRAFT={};
    document.getElementById('pc-modal-ov')?.remove();
  };

  function renderModal() {
    const [os, cod] = MODAL_KEY.split('|');
    const o  = OS.find(x=>x.os===os&&(x.cod_servico||'1')===cod);
    const tp = DRAFT.tipo_parada||'';
    const pr = DRAFT.prioridade||'';
    const ct = DRAFT.categoria||'';
    const rc = DRAFT.recursos||[];
    const aok= DRAFT.andaime_ok||false;
    const det= DRAFT.detalhamento||'';
    const fotos = DRAFT.fotos||[];

    // Cores por parada
    const pCor={geral:'sel-red',com_vapor:'sel-blue',sem_vapor:'sel-purple',
      caldeira_03:'sel-amber',caldeira_04:'sel-amber',caldeira_05:'sel-amber',sem_parada:'sel'};

    const mediaHtml = `
      <div class="pc-msec">
        <div class="pc-msec-lbl">Fotos e Vídeos</div>
        <label class="pc-upload-area" id="pc-upload-label">
          <input type="file" id="pc-file-media" accept="image/*,video/*" multiple style="display:none" onchange="pcUploadMidia(event)">
          <i class="ti ti-cloud-upload"></i>
          <p>Clique ou arraste fotos e vídeos aqui<br><span style="font-size:9px">JPG, PNG, MP4, MOV · máx 50MB por arquivo</span></p>
        </label>
        <div class="pc-media-grid" id="pc-media-grid">
          ${fotos.map((f,i)=>{
            const isVid = f.url && /\.(mp4|mov|webm|avi)$/i.test(f.url);
            return `<div class="pc-media-item" id="pmedia-${i}">
              ${isVid
                ? `<video src="${esc(f.url)}" controls style="width:100%;height:100%;object-fit:cover"></video>`
                : `<img src="${esc(f.url)}" loading="lazy">`}
              <button class="pc-media-del" onclick="pcRemoverMidia(${i})" title="Remover">×</button>
            </div>`;
          }).join('')}
        </div>
      </div>`;

    const html = `<div class="pc-ov" id="pc-modal-ov" onclick="if(event.target===this)pcFecharModal()">
<div class="pc-modal">
  <div class="pc-mhead">
    <div>
      <div class="pc-mtitle">${esc(o?o.desc_servico||o.desc_os||'—':'—')}</div>
      <div class="pc-msub">OS ${esc(os)} · Cód. ${esc(cod)} · ${esc(o?modNome(o.equipe)||'—':'—')} · ${esc(o?(o.desc_setor||o.setor||'—').trim():'—')} · ${fmtH(o?o.hh_prev_servico:0)}</div>
    </div>
    <button class="pc-mclose" onclick="pcFecharModal()">×</button>
  </div>
  <div class="pc-mbody">

    <div class="pc-msec">
      <div class="pc-msec-lbl">Tipo de Parada</div>
      <select class="pc-mselect" onchange="pcDraftSet('tipo_parada',this.value)">
        <option value="">— selecionar —</option>
        ${Object.entries(PARADA_LABEL).map(([v,l])=>`<option value="${v}" ${tp===v?'selected':''}>${l}</option>`).join('')}
      </select>
      ${tp?`<span class="pc-msel-badge pc-msel-${tp==='geral'?'red':tp==='com_vapor'?'blue':tp==='sem_vapor'||tp.startsWith('cald')?'purple':'gray'}">${PARADA_LABEL[tp]}</span>`:''}
    </div>

    <div class="pc-msec">
      <div class="pc-msec-lbl">Prioridade</div>
      <select class="pc-mselect" onchange="pcDraftSet('prioridade',this.value)">
        <option value="">— selecionar —</option>
        ${Object.entries(PRIO_LABEL).map(([v,l])=>`<option value="${v}" ${pr===v?'selected':''}>${l}</option>`).join('')}
      </select>
      ${pr?`<span class="pc-msel-badge pc-msel-${pr==='alta'?'red':pr==='media'?'amber':'green'}">${PRIO_LABEL[pr]}</span>`:''}
    </div>

    <div class="pc-msec">
      <div class="pc-msec-lbl">Categoria</div>
      <select class="pc-mselect" onchange="pcDraftSet('categoria',this.value)">
        <option value="">— selecionar —</option>
        ${Object.entries(CAT_LABEL).map(([v,l])=>`<option value="${v}" ${ct===v?'selected':''}>${l}</option>`).join('')}
      </select>
      ${ct?`<span class="pc-msel-badge pc-msel-gray">${CAT_LABEL[ct]}</span>`:''}
    </div>

    <div class="pc-msec">
      <div class="pc-msec-lbl">Recursos Necessários <span style="font-size:9px;color:#9ca3af;font-weight:400">(múltipla seleção)</span></div>
      <div class="pc-sel-row">
        ${Object.entries(REC_LABEL).map(([v,l])=>`
          <button class="pc-sel-btn ${rc.includes(v)?'sel':''}" onclick="pcDraftToggleRec('${v}')">${l}</button>`).join('')}
      </div>
      ${rc.includes('andaime')?`
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
        <label style="position:relative;width:36px;height:20px;flex-shrink:0">
          <input type="checkbox" ${aok?'checked':''} onchange="pcDraftSet('andaime_ok',this.checked)" style="opacity:0;width:0;height:0">
          <span style="position:absolute;cursor:pointer;inset:0;background:${aok?'var(--yellow)':'#e5e7eb'};border-radius:10px;transition:background .2s">
            <span style="position:absolute;height:14px;width:14px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:transform .2s;transform:${aok?'translateX(16px)':'none'}"></span>
          </span>
        </label>
        <span style="font-size:11px;color:${aok?'#16a34a':'#d97706'};font-weight:600">${aok?'Andaime montado / aprovado':'Andaime pendente de montagem'}</span>
      </div>`:``}
    </div>

    <div class="pc-msec">
      <div class="pc-msec-lbl">Detalhamento / Impactos</div>
      <textarea class="pc-textarea" id="pc-det" placeholder="Descreva detalhes, impactos na produção, observações técnicas…" onchange="DRAFT.detalhamento=this.value">${esc(det)}</textarea>
    </div>

    <div class="pc-msec">
      <div class="pc-msec-lbl">Fotos e Vídeos</div>
      <label class="pc-upload-area" style="display:flex;align-items:center;gap:10px;padding:10px 14px;text-align:left;cursor:pointer">
        <input type="file" id="pc-file-media" accept="image/*,video/*" multiple style="display:none" onchange="pcUploadMidia(event)">
        <i class="ti ti-cloud-upload" style="font-size:20px;color:#d1d5db;flex-shrink:0"></i>
        <span style="font-size:11px;color:#9ca3af">Clique para adicionar fotos ou vídeos<br><span style="font-size:9px">JPG, PNG, MP4, MOV · máx 50MB</span></span>
      </label>
      ${fotos.length?`<div class="pc-media-grid" id="pc-media-grid" style="margin-top:8px">
        ${fotos.map((f,i)=>{
          const isVid=f.url&&/\.(mp4|mov|webm|avi)$/i.test(f.url);
          return `<div class="pc-media-item">
            ${isVid?`<video src="${esc(f.url)}" style="width:100%;height:100%;object-fit:cover"></video>`:`<img src="${esc(f.url)}" loading="lazy">`}
            <button class="pc-media-del" onclick="pcRemoverMidia(${i})">×</button>
          </div>`;
        }).join('')}
      </div>`:''}
    </div>

  </div>
  <div class="pc-mfoot">
    <button class="pc-cancel-btn" onclick="pcFecharModal()">Cancelar</button>
    <button class="pc-save-btn" onclick="pcSalvarModal()">Salvar</button>
  </div>
</div></div>`;

    const existing = document.getElementById('pc-modal-ov');
    if (existing) existing.outerHTML=html;
    else document.body.insertAdjacentHTML('beforeend',html);
  }

  window.pcDraftSet = function(campo, val) {
    DRAFT[campo] = val;
    // Só re-renderiza o modal para campos que mudam a estrutura visual
    if (campo==='andaime_ok') renderModal();
    // Para tipo_parada, prioridade, categoria: apenas atualiza o badge inline
    if (campo==='tipo_parada'||campo==='prioridade'||campo==='categoria') {
      const pBadges={'tipo_parada':{'geral':'red','com_vapor':'blue','sem_vapor':'purple','caldeira_03':'purple','caldeira_04':'purple','caldeira_05':'purple','sem_parada':'gray'},'prioridade':{'alta':'red','media':'amber','baixa':'green'},'categoria':{}};
      const lbs={'tipo_parada':PARADA_LABEL,'prioridade':PRIO_LABEL,'categoria':CAT_LABEL};
      // re-render rápido só do badge (o select já tem o valor)
      renderModal();
    }
  };

  window.pcDraftToggleRec = function(rec) {
    const recs=[...(DRAFT.recursos||[])];
    const idx=recs.indexOf(rec);
    if(idx>=0) recs.splice(idx,1); else recs.push(rec);
    DRAFT.recursos=recs;
    if(!recs.includes('andaime')) DRAFT.andaime_ok=false;
    renderModal();
  };

  /* ── Upload de mídia ── */
  window.pcUploadMidia = async function(e) {
    const files = Array.from(e.target.files); if(!files.length) return;
    const db = getDB();
    // Pega token de autenticação para storage
    const [os,cod] = MODAL_KEY.split('|');

    for (const file of files) {
      const ext  = file.name.split('.').pop().toLowerCase();
      const path = `${os}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      // Adiciona placeholder
      const idx = DRAFT.fotos.length;
      DRAFT.fotos.push({ url:'', path, uploading:true });
      renderModal();

      try {
        const { data, error } = await db.storage.from(STORAGE_BUCKET).upload(path, file, {
          cacheControl:'3600', upsert:false,
          contentType: file.type,
        });
        if (error) throw error;
        const { data:pub } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
        DRAFT.fotos[idx] = { url: pub.publicUrl, path };
      } catch(err) {
        DRAFT.fotos.splice(idx,1);
        showToastMod('Erro no upload: '+err.message,'erro');
      }
      renderModal();
    }
    e.target.value='';
  };

  window.pcRemoverMidia = async function(i) {
    const foto = DRAFT.fotos[i];
    if (!foto) return;
    if (foto.path) {
      const db = getDB();
      await db.storage.from(STORAGE_BUCKET).remove([foto.path]);
    }
    DRAFT.fotos.splice(i,1);
    renderModal();
  };

  /* ── Salvar modal ── */
  window.pcSalvarModal = async function() {
    DRAFT.detalhamento = document.getElementById('pc-det')?.value||DRAFT.detalhamento||'';
    const [os,cod] = MODAL_KEY.split('|');
    CFG[MODAL_KEY] = { ...(CFG[MODAL_KEY]||{}), ...DRAFT, os, cod_servico:cod };
    const db = getDB();
    await db.from('parada_os_config').upsert({
      os, cod_servico:cod, ...DRAFT,
      fotos: DRAFT.fotos||[],
      atualizado_em: new Date().toISOString(),
    },{ onConflict:'os,cod_servico' });
    showToastMod('Classificação salva','ok');
    pcFecharModal();
    updateLista();
  };

  /* ══ IMPORTAR OS ══ */
  async function importarOS(arquivo) {
    showToastMod('Lendo arquivo…','info');
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const wb   = XLSX.read(e.target.result,{type:'binary',cellDates:true});
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws,{defval:''});
        if (!rows.length){showToastMod('Sem dados','erro');return;}

        const hdr=Object.keys(rows[0]);
        const ci=names=>{for(const n of names){const k=hdr.find(h=>String(h).trim().toLowerCase()===n.toLowerCase());if(k)return k;}return null;};

        const iOS    =ci(['O.S.','OS']);
        const iCod   =ci(['Codigo Serviço','Código Serviço','Cod Servico','Codigo Servico']);
        const iDescOS=ci(['Descrição OS','Descricao OS','Desc OS']);
        const iDescS =ci(['Descrição Serviço','Descricao Servico','Desc Servico']);
        const iEq    =ci(['Equipe']);
        const iSetor =ci(['Setor']);
        const iDescSt=ci(['Descrição Setor','Descricao Setor']);
        const iHhPS  =ci(['Hh Prev. Serviço (Decimal)','Hh Prev. Servico']);
        const iHhPOS =ci(['Hh Prev. OS','Hh Prev OS']);
        const iHhRS  =ci(['Hh Real Serviço (Decimal)','Hh Real Servico']);
        const iHhROS =ci(['Hh Real OS']);
        const iEquip =ci(['Equipamento']);
        const iDescEq=ci(['Descrição Equipamento','Descricao Equipamento']);
        const iTag   =ci(['TAG']);
        const iTipoAt=ci(['Tipo Ativ.','Tipo Atividade']);
        const iStatusOS=ci(['Status OS']);

        const regs=[];
        rows.forEach(r=>{
          const os=String(r[iOS]||'').replace(/\D/g,'');
          if(!os||os.length<4) return;
          // Exclui cancelados/encerrados na importação
          const st=String(r[iStatusOS]||'').toLowerCase();
          if(STATUS_EXCLUIR.some(s=>st.includes(s))) return;
          // Exclui MCU
          const ta=String(r[iTipoAt]||'').toUpperCase().trim();
          if(ta==='MCU') return;
          regs.push({
            os, cod_servico:String(r[iCod]||'1').trim()||'1',
            desc_os:String(r[iDescOS]||'').trim(),
            desc_servico:String(r[iDescS]||'').trim(),
            equipe:String(r[iEq]||'').trim(),
            setor:String(r[iSetor]||'').trim(),
            desc_setor:String(r[iDescSt]||'').trim(),
            equipamento:String(r[iEquip]||'').trim(),
            desc_equipamento:String(r[iDescEq]||'').trim(),
            tag:String(r[iTag]||'').trim(),
            tipo_atividade:ta,
            status_os:String(r[iStatusOS]||'').trim(),
            hh_prev_servico:parseFloat(r[iHhPS]||r[iHhPOS])||0,
            hh_real_servico:parseFloat(r[iHhRS]||r[iHhROS])||0,
            importado_em:new Date().toISOString(),
          });
        });
        if(!regs.length){showToastMod('Nenhuma OS válida encontrada','erro');return;}
        showToastMod(`Salvando ${regs.length} OS…`,'info');
        const db=getDB();
        for(let i=0;i<regs.length;i+=100)
          await db.from('ordens_servico').upsert(regs.slice(i,i+100),{onConflict:'os,cod_servico'});
        await carregarDados();
        render();
        showToastMod(`${regs.length} OS importadas`,'ok');
      }catch(err){showToastMod('Erro: '+err.message,'erro');console.error(err);}
    };
    reader.readAsBinaryString(arquivo);
  }

  /* ══ EXPORTAR ══ */
  async function exportar() {
    if(!window.XLSX){await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
    const lista=osFiltradas();
    const rows=lista.map(o=>{const c=cfg(o.os,o.cod_servico);return{
      'OS':o.os,'Serviço':o.desc_servico||o.desc_os||'',
      'Equipe':o.equipe||'','Modalidade':modNome(o.equipe)||'',
      'Setor':(o.desc_setor||o.setor||'').trim(),
      'Equipamento':o.desc_equipamento||o.equipamento||'','TAG':o.tag||'',
      'HH Prev.(h)':o.hh_prev_servico||0,
      'Tipo Parada':PARADA_LABEL[c.tipo_parada||'sem_parada']||'',
      'Prioridade':PRIO_LABEL[c.prioridade||'']||'',
      'Categoria':CAT_LABEL[c.categoria||'']||'',
      'Andaime':(c.recursos||[]).includes('andaime')?(c.andaime_ok?'Montado':'Pendente'):'Não',
      'Munck':(c.recursos||[]).includes('munck')?'Sim':'Não',
      'Guindaste':(c.recursos||[]).includes('guindaste')?'Sim':'Não',
      'PTA':(c.recursos||[]).includes('pta')?'Sim':'Não',
      'Detalhamento':c.detalhamento||'',
    };});
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Carteira');
    XLSX.writeFile(wb,`CarteiraPararadas_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToastMod('Exportado','ok');
  }

  /* ══ MODAL MODALIDADES ══ */
  let _modEdit=null;
  function abrirModalidades() {
    let ov=document.getElementById('pc-mod-ov');
    if(!ov){ov=document.createElement('div');ov.id='pc-mod-ov';ov.className='pc-ov';ov.onclick=e=>{if(e.target===ov)fecharModalidades();};document.body.appendChild(ov);}
    _modEdit=null; renderModalidades(ov);
    ov.style.display='flex';
  }
  function fecharModalidades(){document.getElementById('pc-mod-ov')?.remove();_modEdit=null;}
  function renderModalidades(ov){
    const rows=MODS.map((m,i)=>{
      if(_modEdit===i) return `<tr style="background:#fffbeb">
        <td><input class="pc-textarea" style="min-height:0;height:28px;padding:4px 7px;width:70px" id="cmod-pref" value="${esc(m.prefixo)}"></td>
        <td><input class="pc-textarea" style="min-height:0;height:28px;padding:4px 7px" id="cmod-nome" value="${esc(m.nome)}"></td>
        <td style="white-space:nowrap">
          <button class="pc-save-btn" style="padding:4px 10px;font-size:10px" onclick="pcModSalvar(${i})">✓</button>
          <button class="pc-cancel-btn" style="padding:4px 8px;font-size:10px;margin-left:4px" onclick="_modEdit=null;renderModalidades(document.getElementById('pc-mod-ov'))">✕</button>
        </td></tr>`;
      return `<tr><td style="font-weight:600">${esc(m.prefixo)}</td><td>${esc(m.nome)}</td>
        <td style="white-space:nowrap">
          <button class="pc-cancel-btn" style="font-size:10px;padding:3px 8px" onclick="_modEdit=${i};renderModalidades(document.getElementById('pc-mod-ov'))">Editar</button>
          <button class="pc-cancel-btn" style="font-size:10px;padding:3px 8px;color:#dc2626;margin-left:4px" onclick="pcModRemover(${i})">Remover</button>
        </td></tr>`;
    }).join('');
    const nova=_modEdit===-1?`<tr style="background:#fffbeb">
      <td><input class="pc-textarea" style="min-height:0;height:28px;padding:4px 7px;width:70px" id="cmod-pref" placeholder="CAL"></td>
      <td><input class="pc-textarea" style="min-height:0;height:28px;padding:4px 7px" id="cmod-nome" placeholder="Caldeiraria"></td>
      <td><button class="pc-save-btn" style="padding:4px 10px;font-size:10px" onclick="pcModSalvar(-1)">✓ Salvar</button></td></tr>`:'';
    ov.innerHTML=`<div class="pc-modal" style="max-width:400px">
      <div class="pc-mhead"><div><div class="pc-mtitle">Modalidades de Serviço</div><div class="pc-msub">Prefixo da equipe → nome da modalidade</div></div><button class="pc-mclose" onclick="fecharModalidades()">×</button></div>
      <div class="pc-mbody" style="padding:12px 18px">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr><th style="padding:5px 7px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;text-align:left">Prefixo</th><th style="padding:5px 7px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;text-align:left">Modalidade</th><th></th></tr></thead>
          <tbody>${rows}${nova}</tbody>
        </table>
        ${_modEdit===null?`<button class="pc-cancel-btn" style="margin-top:8px;font-size:11px" onclick="_modEdit=-1;renderModalidades(document.getElementById('pc-mod-ov'))">+ Nova modalidade</button>`:''}
      </div>
    </div>`;
    ov.style.display='flex';
  }
  window.pcModSalvar=async function(i){
    const pref=document.getElementById('cmod-pref')?.value.trim().toUpperCase();
    const nome=document.getElementById('cmod-nome')?.value.trim();
    if(!pref||!nome){showToastMod('Preencha os dois campos','erro');return;}
    const db=getDB();
    if(i===-1){const{data}=await db.from('config_modalidades').insert({prefixo:pref,nome}).select();if(data)MODS.push(data[0]);}
    else{await db.from('config_modalidades').update({prefixo:pref,nome}).eq('id',MODS[i].id);MODS[i]={...MODS[i],prefixo:pref,nome};}
    _modEdit=null; renderModalidades(document.getElementById('pc-mod-ov'));
    showToastMod('Salvo','ok');
  };
  window.pcModRemover=async function(i){
    if(!confirm('Remover?'))return;
    const db=getDB();const m=MODS[i];
    if(m.id)await db.from('config_modalidades').delete().eq('id',m.id);
    MODS.splice(i,1);_modEdit=null;
    renderModalidades(document.getElementById('pc-mod-ov'));
  };
  window.fecharModalidades=fecharModalidades;
  window.renderModalidades=renderModalidades;

  /* ══ CARREGAR DADOS ══ */
  async function carregarDados() {
    const db=getDB();
    const [rOS,rCFG,rMODS]=await Promise.all([
      db.from('ordens_servico').select('os,cod_servico,desc_os,desc_servico,equipe,setor,desc_setor,equipamento,desc_equipamento,tag,tipo_atividade,status_os,hh_prev_servico,hh_real_servico').order('os',{ascending:true}),
      db.from('parada_os_config').select('*'),
      db.from('config_modalidades').select('*').order('prefixo',{ascending:true}),
    ]);
    OS=rOS.data||[]; MODS=rMODS.data||[]; CFG={};
    (rCFG.data||[]).forEach(c=>{
      const k=`${c.os}|${c.cod_servico||'1'}`;
      CFG[k]=c;
      // Garante que fotos é array
      if(CFG[k].fotos && !Array.isArray(CFG[k].fotos)) CFG[k].fotos=[];
    });
  }

  /* ══ TOAST ══ */
  function showToastMod(msg,tipo){
    if(window.showToast){window.showToast(msg,tipo);return;}
    const t=document.getElementById('toast');if(!t)return;
    t.className=tipo||'info';
    document.getElementById('toast-icon').className='ti '+(tipo==='ok'?'ti-check':tipo==='erro'?'ti-alert-circle':'ti-info-circle');
    document.getElementById('toast-msg').textContent=msg;
    t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500);
  }

  /* ══ SQL — coluna fotos (rodar no Supabase se ainda não existe) ══
     ALTER TABLE parada_os_config ADD COLUMN IF NOT EXISTS fotos JSONB DEFAULT '[]';
     ALTER TABLE parada_os_config ADD COLUMN IF NOT EXISTS detalhamento TEXT DEFAULT '';
  ══ */

  /* ══ REGISTRO ══ */
  window.Modulos=window.Modulos||{};
  window.Modulos['paradas-carteira']={
    async init(container){
      _container=container;
      container.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:200px;gap:10px;color:#9ca3af"><div class="loading-spinner"></div>Carregando carteira…</div>`;
      await carregarDados();
      render();
    }
  };
})();
