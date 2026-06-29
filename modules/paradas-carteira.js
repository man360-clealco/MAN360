/* ═══════════════════════════════════════
   MAN360 — Carteira de Serviços — Paradas  v3
   modules/paradas-carteira.js
═══════════════════════════════════════ */
(function () {
  'use strict';

  const STORAGE_BUCKET = 'os-fotos';

  /* ── Constantes ── */
  const PARADA_LABEL = {
    geral:'Parada geral', com_vapor:'Com vapor',
    sem_vapor:'Sem vapor (caldeiras)',
    caldeira_03:'Caldeira 03', caldeira_04:'Caldeira 04', caldeira_05:'Caldeira 05',
    sem_parada:'Sem parada',
  };
  const PARADA_COR = {
    geral:'red', com_vapor:'blue', sem_vapor:'purple',
    caldeira_03:'amber', caldeira_04:'amber', caldeira_05:'amber', sem_parada:'gray',
  };
  const PARADA_GRUPOS_SV = ['sem_vapor','caldeira_03','caldeira_04','caldeira_05'];
  const PRIO_LABEL = { alta:'Alta', media:'Média', baixa:'Baixa' };
  const CAT_LABEL  = { seguranca:'Segurança', correcao_perdas:'Correção Perdas', correcao_processos:'Correção Processos', melhoria:'Melhoria', entressafra:'Entressafra' };
  const REC_LABEL  = { andaime:'Andaime', munck:'Munck', guindaste:'Guindaste', pta:'PTA' };
  const STATUS_EXCLUIR = ['cancelad','encerrad'];

  /* ── SVGs dos recursos ── */
  const REC_SVG = {
    andaime: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="14" height="14" fill="currentColor">
      <rect x="30" y="30" width="452" height="40" rx="20"/>
      <rect x="30" y="442" width="452" height="40" rx="20"/>
      <rect x="30" y="200" width="452" height="30" rx="10"/>
      <rect x="30" y="30" width="40" height="452" rx="10"/>
      <rect x="442" y="30" width="40" height="452" rx="10"/>
      <line x1="30" y1="230" x2="442" y2="442" stroke="currentColor" stroke-width="30" stroke-linecap="round"/>
      <line x1="442" y1="230" x2="30" y2="442" stroke="currentColor" stroke-width="30" stroke-linecap="round"/>
      <circle cx="50" cy="492" r="28" fill="none" stroke="currentColor" stroke-width="25"/>
      <circle cx="462" cy="492" r="28" fill="none" stroke="currentColor" stroke-width="25"/>
    </svg>`,
    munck: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 70" width="18" height="13" fill="currentColor">
      <rect x="2" y="38" width="96" height="18" rx="4"/>
      <rect x="4" y="20" width="30" height="22" rx="3"/>
      <rect x="44" y="14" width="18" height="26" rx="3"/>
      <polygon points="34,8 52,8 52,14 34,14"/>
      <line x1="52" y1="11" x2="90" y2="11" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
      <line x1="90" y1="11" x2="90" y2="36" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
      <path d="M85,36 Q90,44 95,36" fill="none" stroke="currentColor" stroke-width="3"/>
      <circle cx="18" cy="58" r="9" fill="none" stroke="currentColor" stroke-width="5"/>
      <circle cx="80" cy="58" r="9" fill="none" stroke="currentColor" stroke-width="5"/>
    </svg>`,
    guindaste: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80" width="18" height="15" fill="currentColor">
      <rect x="2" y="44" width="96" height="18" rx="4"/>
      <rect x="4" y="26" width="26" height="22" rx="3"/>
      <rect x="36" y="18" width="16" height="28" rx="3"/>
      <line x1="52" y1="8" x2="88" y2="42" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <line x1="36" y1="8" x2="52" y2="8" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <line x1="52" y1="8" x2="52" y2="18" stroke="currentColor" stroke-width="4"/>
      <path d="M83,42 Q88,50 93,42" fill="none" stroke="currentColor" stroke-width="3"/>
      <circle cx="18" cy="64" r="9" fill="none" stroke="currentColor" stroke-width="5"/>
      <circle cx="76" cy="64" r="9" fill="none" stroke="currentColor" stroke-width="5"/>
    </svg>`,
    pta: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="13" height="13" fill="currentColor">
      <rect x="28" y="56" width="24" height="16" rx="4"/>
      <circle cx="20" cy="74" r="7" fill="none" stroke="currentColor" stroke-width="4"/>
      <circle cx="60" cy="74" r="7" fill="none" stroke="currentColor" stroke-width="4"/>
      <rect x="8" y="60" width="64" height="10" rx="3"/>
      <line x1="40" y1="56" x2="20" y2="28" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <line x1="20" y1="28" x2="38" y2="10" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <line x1="38" y1="10" x2="58" y2="28" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <rect x="50" y="4" width="24" height="28" rx="3" fill="none" stroke="currentColor" stroke-width="4"/>
      <line x1="60" y1="4" x2="60" y2="32" stroke="currentColor" stroke-width="3"/>
    </svg>`,
  };

  /* ── Estado ── */
  let OS   = [];
  let CFG  = {};
  let MODS = [];
  let ABA  = 'lista';
  let MODAL_KEY = null;
  let DRAFT = {};
  let SORT  = { col:'os', dir:1 };
  // Filtro padrão: mostra só OS com parada definida (excluindo sem_parada)
  let F = {
    busca:'', parada:['geral','com_vapor','sem_vapor','caldeira_03','caldeira_04','caldeira_05'],
    modalidade:[], prioridade:[], categoria:[], recurso:[], setor:[], midia:[],
  };
  let _container = null;

  /* ── Helpers ── */
  const esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmtH = v => { const h=parseFloat(v)||0; return h>0?h.toFixed(1)+'h':'—'; };
  const cfgOf = o => CFG[`${o.os}|${o.cod_servico||'1'}`] || {};
  const isExcluido = o => {
    const st = String(o.status_os||'').toLowerCase();
    if (STATUS_EXCLUIR.some(s=>st.includes(s))) return true;
    if (String(o.tipo_atividade||'').toUpperCase().trim()==='MCU') return true;
    return false;
  };
  const modNome = equipe => {
    if (!equipe) return '';
    const pref = String(equipe).toUpperCase().replace(/\d/g,'').trim().slice(0,3);
    const m = MODS.find(x=>x.prefixo===pref);
    return m?m.nome:'';
  };
  // Setor: prioriza desc_setor, usa setor só se desc_setor vazio E setor não é numérico
  const setorOs = o => {
    const ds = (o.desc_setor||'').trim();
    if (ds) return ds;
    const s = (o.setor||'').trim();
    return (/^\d+$/.test(s)) ? '' : s;
  };

  /* ── Dados filtrados ── */
  function osBase() { return OS.filter(o=>!isExcluido(o)); }

  function osFiltradas() {
    let d = osBase().filter(o => {
      const c   = cfgOf(o);
      const mod = modNome(o.equipe);
      const set = setorOs(o);
      const tp  = c.tipo_parada || 'sem_parada';

      if (F.busca) {
        const b = F.busca.toLowerCase();
        if (!`${o.os} ${o.desc_servico||o.desc_os||''} ${o.desc_equipamento||''} ${mod} ${set}`.toLowerCase().includes(b)) return false;
      }
      if (F.parada.length) {
        if (!F.parada.includes(tp)) return false;
      }
      if (F.modalidade.length && !F.modalidade.includes(mod)) return false;
      if (F.prioridade.length && !F.prioridade.includes(c.prioridade||'')) return false;
      if (F.categoria.length  && !F.categoria.includes(c.categoria||''))   return false;
      if (F.recurso.length) {
        const rec = c.recursos||[];
        if (!F.recurso.some(r=>rec.includes(r))) return false;
      }
      if (F.setor.length && !F.setor.includes(set)) return false;
      if (F.midia.length) {
        const temMidia = ((CFG[`${o.os}|${o.cod_servico||'1'}`]||{}).fotos||[]).length > 0;
        if (F.midia.includes('com') && !temMidia) return false;
        if (F.midia.includes('sem') && temMidia)  return false;
      }
      return true;
    });

    return [...d].sort((a,b)=>{
      const ca=cfgOf(a), cb=cfgOf(b);
      let va,vb;
      switch(SORT.col){
        case 'os':    va=a.os; vb=b.os; break;
        case 'desc':  va=a.desc_servico||a.desc_os||''; vb=b.desc_servico||b.desc_os||''; break;
        case 'hh':    va=parseFloat(a.hh_prev_servico)||0; vb=parseFloat(b.hh_prev_servico)||0; break;
        case 'mod':   va=modNome(a.equipe); vb=modNome(b.equipe); break;
        case 'setor': va=setorOs(a); vb=setorOs(b); break;
        case 'parada':va=PARADA_LABEL[ca.tipo_parada||'sem_parada']||''; vb=PARADA_LABEL[cb.tipo_parada||'sem_parada']||''; break;
        case 'prio':  { const ord={alta:0,media:1,baixa:2,'':3}; va=ord[ca.prioridade||'']; vb=ord[cb.prioridade||'']; break; }
        default: va=a.os; vb=b.os;
      }
      if(va<vb) return -SORT.dir; if(va>vb) return SORT.dir; return 0;
    });
  }

  function calcKPIs(lista) {
    const base  = osBase();
    const total = lista.length;
    const hh    = lista.reduce((s,o)=>s+(parseFloat(o.hh_prev_servico)||0),0);
    // OS de parada = qualquer parada exceto sem_parada
    const totalParada = base.filter(o=>{const tp=cfgOf(o).tipo_parada; return tp&&tp!=='sem_parada';}).length;
    const sv    = lista.filter(o=>{ const tp=cfgOf(o).tipo_parada||'sem_parada'; return PARADA_GRUPOS_SV.includes(tp)||tp==='sem_vapor'; }).length;
    const svA   = lista.filter(o=>{ const tp=cfgOf(o).tipo_parada||'sem_parada'; return (PARADA_GRUPOS_SV.includes(tp)||tp==='sem_vapor')&&cfgOf(o).prioridade==='alta'; }).length;
    const cv    = lista.filter(o=>cfgOf(o).tipo_parada==='com_vapor').length;
    const cvA   = lista.filter(o=>cfgOf(o).tipo_parada==='com_vapor'&&cfgOf(o).prioridade==='alta').length;
    return {total, hh, totalParada, sv, svA, cv, cvA};
  }

  /* ══ RENDER ══ */
  function render() {
    const lista = osFiltradas();
    const kpi   = calcKPIs(lista);
    const setores = [...new Set(osBase().map(o=>setorOs(o)).filter(s=>s))].sort();
    const mods    = [...new Set(osBase().map(o=>modNome(o.equipe)).filter(Boolean))].sort();

    _container.innerHTML = `
<style>
.pc{font-family:var(--font);color:#1a1a1a}
.pc-top{display:flex;align-items:center;justify-content:space-between;padding:0 0 14px;flex-wrap:wrap;gap:10px}
.pc-title{font-size:14px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#374151;display:flex;align-items:center;gap:8px}
.pc-title i{font-size:18px;color:var(--yellow)}
.pc-actions{display:flex;gap:8px}
/* KPIs */
.pc-kpis{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:14px}
.pc-kpi{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;box-shadow:var(--shadow)}
.pc-kpi-lbl{font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px}
.pc-kpi-val{font-size:19px;font-weight:700;line-height:1;color:var(--yellow)}
.pc-kpi-sub{font-size:9px;color:#9ca3af;margin-top:2px}
.pc-kpi.alert .pc-kpi-val{color:#dc2626}
/* Tabs */
.pc-tabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:14px}
.pc-tab{padding:9px 16px;font-size:12px;color:#6b7280;cursor:pointer;border-bottom:2px solid transparent;font-family:var(--font);background:none;border-top:none;border-left:none;border-right:none;font-weight:500}
.pc-tab.active{color:#111;border-bottom-color:var(--yellow);font-weight:700}
.pc-tab.wip{opacity:.4;cursor:default}
/* Filtros */
.pc-filters{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;box-shadow:var(--shadow);margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.pc-search{display:flex;align-items:center;gap:6px;flex:1;min-width:200px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 10px;height:30px;background:var(--bg)}
.pc-search input{border:none;background:none;outline:none;font-family:var(--font);font-size:11px;width:100%;color:#374151}
.pc-search i{font-size:14px;color:#9ca3af}
/* DD */
.pc-dd{position:relative}
.pc-dd-btn{height:30px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:5px;color:#374151;white-space:nowrap}
.pc-dd-btn.ativo{border-color:var(--yellow);background:#fffbeb}
.pc-dd-btn i.ico{font-size:13px;color:#6b7280}
.pc-dd-btn .arr{font-size:10px;margin-left:2px;transition:transform 200ms}
.pc-dd-btn.open .arr{transform:rotate(180deg)}
.pc-dd-badge{background:var(--yellow);color:var(--dark1);border-radius:10px;font-size:9px;font-weight:700;padding:1px 5px;margin-left:2px}
.pc-dd-panel{position:absolute;top:calc(100% + 4px);left:0;min-width:190px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);z-index:300;display:none;max-height:280px;overflow-y:auto}
.pc-dd-panel.show{display:block}
.pc-dd-actions{display:flex;gap:6px;padding:6px 8px;border-bottom:1px solid var(--border)}
.pc-dd-action{flex:1;height:22px;font-size:10px;font-family:var(--font);font-weight:600;border-radius:var(--radius-sm);border:1px solid var(--border);cursor:pointer}
.pc-dd-action.all{background:var(--yellow);color:var(--dark1);border-color:var(--yellow-dk)}
.pc-dd-action.none{background:var(--bg);color:#6b7280}
.pc-dd-item{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:11px;font-weight:500;color:#374151;cursor:pointer;user-select:none}
.pc-dd-item:hover{background:var(--bg)}
.pc-dd-item input{accent-color:var(--yellow);pointer-events:none;flex-shrink:0}
/* Chips */
.pc-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.pc-chips:empty{display:none}
.pc-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;background:#fef3c7;border:1px solid #fbbf24;border-radius:10px;font-size:10px;font-weight:600;color:#92400e}
.pc-chip button{background:none;border:none;cursor:pointer;color:#92400e;font-size:13px;line-height:1;padding:0}
/* Tabela */
.pc-tw{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.pc-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
.pc-table th{text-align:left;padding:8px 10px;background:var(--bg);color:#4b5563;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;cursor:pointer;user-select:none}
.pc-table th.sorted{color:var(--yellow-dk)}
.pc-table th.ns{cursor:default}
.sico{font-size:10px;margin-left:3px;opacity:.3}
.sorted .sico{opacity:1}
.pc-table td{padding:9px 10px;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap;overflow:hidden}
.pc-table tbody tr:hover td{background:#fafafa;cursor:pointer}
.pc-table tbody tr:last-child td{border-bottom:none}
.pc-foot{padding:8px 14px;font-size:11px;color:#6b7280;background:var(--bg);border-top:1px solid var(--border)}
.pc-foot span{color:#374151}
/* Badges */
.pb{display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap}
.pb-none{color:#9ca3af;font-size:11px}
.pb-alta{background:#fee2e2;color:#991b1b}
.pb-media{background:#fef3c7;color:#92400e}
.pb-baixo{background:#dcfce7;color:#14532d}
.pb-red{background:#fee2e2;color:#991b1b}
.pb-blue{background:#dbeafe;color:#1e3a8a}
.pb-purple{background:#ede9fe;color:#4c1d95}
.pb-amber{background:#fef3c7;color:#92400e}
.pb-gray{background:#f3f4f6;color:#6b7280}
/* Ícones recursos na linha */
.rec-icons{display:flex;gap:5px;align-items:center}
.rec-ic{display:flex;align-items:center;justify-content:center;color:#374151}
.rec-ic.pend{color:#dc2626}
.rec-ic.ok{color:#16a34a}
/* Edit btn */
.edit-btn{background:none;border:1px solid var(--border);border-radius:var(--radius-sm);width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6b7280;transition:all 120ms}
.edit-btn:hover{background:var(--yellow);border-color:var(--yellow);color:var(--dark1)}
/* Modal */
.pc-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding-top:40px;overflow-y:auto}
.pc-modal{background:var(--card-bg);border-radius:var(--radius);width:540px;max-width:96vw;box-shadow:0 8px 32px rgba(0,0,0,.22);overflow:hidden;margin-bottom:24px}
.pc-mhead{padding:12px 16px;background:var(--bg);border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.pc-mtitle{font-size:13px;font-weight:700;color:#111;line-height:1.3}
.pc-msub{font-size:10px;color:#6b7280;margin-top:2px}
.pc-mclose{background:none;border:none;cursor:pointer;font-size:20px;color:#6b7280;line-height:1;flex-shrink:0;padding:0}
.pc-mbody{padding:14px 16px;display:flex;flex-direction:column;gap:0}
.pc-mfoot{padding:10px 16px;border-top:1px solid var(--border);background:var(--bg);display:flex;gap:8px;justify-content:flex-end}
.pc-msec{border-bottom:1px solid var(--border);padding:10px 0}
.pc-msec:last-child{border-bottom:none;padding-bottom:0}
.pc-msec-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:6px}
.pc-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pc-mselect{width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:12px;color:#374151;padding:0 8px;cursor:pointer;margin-bottom:5px}
.pc-mselect:focus{outline:2px solid var(--yellow);outline-offset:-1px;border-color:transparent}
.pc-msel-badge{display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:600}
.pc-sel-row{display:flex;flex-wrap:wrap;gap:6px}
.pc-sel-btn{padding:5px 11px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px;font-weight:500;cursor:pointer;background:var(--bg);color:#374151;transition:all 120ms;display:flex;align-items:center;gap:5px}
.pc-sel-btn:hover{border-color:#9ca3af}
.pc-sel-btn.sel{border-color:var(--yellow);background:var(--yellow);color:var(--dark1);font-weight:700}
.pc-textarea{width:100%;border:1px solid var(--border);border-radius:var(--radius-sm);padding:7px 10px;font-family:var(--font);font-size:11px;color:#374151;background:var(--bg);resize:vertical;min-height:56px;box-sizing:border-box}
.pc-textarea:focus{outline:2px solid var(--yellow);outline-offset:-1px;border-color:transparent}
.pc-upload-area{display:flex;align-items:center;gap:10px;border:1.5px dashed var(--border);border-radius:var(--radius);padding:10px 14px;cursor:pointer;transition:all 150ms;background:var(--bg)}
.pc-upload-area:hover{border-color:var(--yellow);background:#fffbeb}
.pc-upload-area i{font-size:18px;color:#d1d5db;flex-shrink:0}
.pc-media-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px}
.pc-media-item{position:relative;border-radius:6px;overflow:hidden;aspect-ratio:1;background:#f3f4f6;border:1px solid var(--border)}
.pc-media-item img,.pc-media-item video{width:100%;height:100%;object-fit:cover}
.pc-media-del{position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);border:none;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;font-size:11px;line-height:1}
.pc-save-btn{padding:7px 18px;border:none;border-radius:var(--radius-sm);background:var(--yellow);color:var(--dark1);font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer}
.pc-cancel-btn{padding:7px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:12px;cursor:pointer;color:#374151}
/* Andaime toggle inline */
.andaime-inline{display:flex;align-items:center;gap:8px;margin-top:8px;padding:6px 10px;background:var(--bg);border-radius:var(--radius-sm);border:1px solid var(--border)}
.toggle-wrap{position:relative;width:32px;height:18px;flex-shrink:0}
.toggle-wrap input{opacity:0;width:0;height:0}
.toggle-slider{position:absolute;cursor:pointer;inset:0;background:#e5e7eb;border-radius:9px;transition:background .2s}
.toggle-slider::before{content:'';position:absolute;height:12px;width:12px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:transform .2s}
.toggle-wrap input:checked + .toggle-slider{background:var(--yellow)}
.toggle-wrap input:checked + .toggle-slider::before{transform:translateX(14px)}
/* Recursos aba */
.pc-res-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pc-res-card{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;box-shadow:var(--shadow)}
.pc-res-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px;display:flex;align-items:center;gap:6px}
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
      <div class="pc-kpi-sub">na seleção</div>
    </div>
    <div class="pc-kpi">
      <div class="pc-kpi-lbl">OS c/ Parada</div>
      <div class="pc-kpi-val" id="k-parada">${kpi.totalParada}</div>
      <div class="pc-kpi-sub">classificadas</div>
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
    <div class="pc-kpi ${kpi.svA>0?'alert':''}">
      <div class="pc-kpi-lbl">Sem Vapor · Alta</div>
      <div class="pc-kpi-val" id="k-sva">${kpi.svA}</div>
      <div class="pc-kpi-sub">prioridade alta</div>
    </div>
    <div class="pc-kpi">
      <div class="pc-kpi-lbl">OS Com Vapor</div>
      <div class="pc-kpi-val" id="k-cv">${kpi.cv}</div>
      <div class="pc-kpi-sub">moenda parada</div>
    </div>
    <div class="pc-kpi ${kpi.cvA>0?'alert':''}">
      <div class="pc-kpi-lbl">Com Vapor · Alta</div>
      <div class="pc-kpi-val" id="k-cva">${kpi.cvA}</div>
      <div class="pc-kpi-sub">prioridade alta</div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="pc-tabs">
    <button class="pc-tab ${ABA==='lista'?'active':''}" data-aba="lista">Lista de Serviços</button>
    <button class="pc-tab ${ABA==='recursos'?'active':''}" data-aba="recursos">Recursos</button>
    <button class="pc-tab wip">Planos</button>
  </div>

  ${ABA==='lista' ? htmlLista(lista, setores, mods) : htmlRecursos(lista)}
</div>`;

    bind();
  }

  /* ══ HTML LISTA ══ */
  function htmlLista(lista, setores, mods) {
    function th(col, lbl) {
      const at=SORT.col===col;
      return `<th class="${at?'sorted':''}" data-sort="${col}">${lbl}<span class="sico">${at?(SORT.dir===1?'↑':'↓'):'⇅'}</span></th>`;
    }

    // Opções para cada DD
    const ddOpts = {
      parada:     Object.entries(PARADA_LABEL).map(([v,l])=>({v,l})),
      modalidade: mods.map(m=>({v:m,l:m})),
      prioridade: Object.entries(PRIO_LABEL).map(([v,l])=>({v,l})),
      categoria:  Object.entries(CAT_LABEL).map(([v,l])=>({v,l})),
      recurso:    Object.entries(REC_LABEL).map(([v,l])=>({v,l})),
      setor:      setores.map(s=>({v:s,l:s})),
      midia:      [{v:'com',l:'Com foto/vídeo'},{v:'sem',l:'Sem foto/vídeo'}],
    };

    return `
<div class="pc-filters">
  <div class="pc-search"><i class="ti ti-search"></i><input id="pc-busca" type="text" placeholder="Buscar OS, descrição…" value="${esc(F.busca)}"></div>
  ${Object.entries({
    parada:     {icon:'ti-calendar-event', label:'Parada'},
    modalidade: {icon:'ti-tool',           label:'Modalidade'},
    prioridade: {icon:'ti-alert-triangle', label:'Prioridade'},
    categoria:  {icon:'ti-star',           label:'Categoria'},
    recurso:    {icon:'ti-crane',          label:'Recurso'},
    setor:      {icon:'ti-building',       label:'Setor'},
    midia:      {icon:'ti-photo',           label:'M\u00eddia'},
  }).map(([nome,{icon,label}]) => mkDD(nome, icon, label, ddOpts[nome])).join('')}
</div>
<div class="pc-chips" id="pc-chips">${htmlChips()}</div>
<div class="pc-tw">
  <table class="pc-table">
      <colgroup>
        <col style="width:82px"><!-- OS -->
        <col style="width:260px"><!-- Descrição — largura fixa, quebra 2 linhas -->
        <col style="width:160px"><!-- Setor -->
        <col style="width:100px"><!-- Modalidade -->
        <col style="width:70px"><!-- HH Prev -->
        <col style="width:150px"><!-- Tipo Parada -->
        <col style="width:58px"><!-- Prio -->
        <col style="width:130px"><!-- Categoria -->
        <col style="width:90px"><!-- Recursos -->
        <col style="width:36px"><!-- Ação -->
      </colgroup>
    <thead><tr>
      ${th('os','OS')}${th('desc','Descrição')}${th('setor','Setor')}
      ${th('mod','Modalidade')}${th('hh','HH Prev.')}${th('parada','Tipo Parada')}
      ${th('prio','Prio.')}<th class="ns">Categoria</th><th class="ns">Recursos</th>
      <th class="ns" style="width:36px"></th>
    </tr></thead>
    <tbody id="pc-tbody">${lista.length?lista.map(htmlLinha).join(''):htmlVazio()}</tbody>
  </table>
  <div class="pc-foot" id="pc-foot">
    Exibindo <span>${lista.length}</span> de <span>${osBase().length}</span> serviços &nbsp;·&nbsp;
    <span>${lista.reduce((s,o)=>s+(parseFloat(o.hh_prev_servico)||0),0).toFixed(0)}h</span> previstas
  </div>
</div>`;
  }

  function htmlVazio() {
    return `<tr><td colspan="10" style="text-align:center;padding:32px;color:#9ca3af">
      <i class="ti ti-search" style="font-size:28px;display:block;margin-bottom:8px;color:#d1d5db"></i>
      Nenhum serviço encontrado
    </td></tr>`;
  }

  function mkDD(nome, icon, label, opcoes) {
    const sel = F[nome]||[];
    return `<div class="pc-dd" id="pdd-${nome}">
      <button class="pc-dd-btn ${sel.length?'ativo':''}" id="pddbtn-${nome}" onclick="pcToggleDD('${nome}',event)">
        <i class="ti ${icon} ico"></i>${label}${sel.length?`<span class="pc-dd-badge">${sel.length}</span>`:''}
        <i class="ti ti-chevron-down arr"></i>
      </button>
      <div class="pc-dd-panel" id="pddp-${nome}">
        <div class="pc-dd-actions">
          <button class="pc-dd-action all" onclick="pcSelectAll('${nome}',event)">Todos</button>
          <button class="pc-dd-action none" onclick="pcSelectNone('${nome}',event)">Limpar</button>
        </div>
        ${opcoes.map((o,i)=>`<label class="pc-dd-item" onclick="pcToggleChk('${nome}',${i},event)">
          <input type="checkbox" id="pchk-${nome}-${i}" data-val="${esc(o.v)}" ${sel.includes(o.v)?'checked':''}> ${esc(o.l)}
        </label>`).join('')}
      </div>
    </div>`;
  }

  function htmlChips() {
    const lbls={parada:'Parada',modalidade:'Modal.',prioridade:'Prio.',categoria:'Categ.',recurso:'Recurso',setor:'Setor',midia:'Mídia'};
    const fmtV={
      parada:v=>PARADA_LABEL[v]||v, prioridade:v=>PRIO_LABEL[v]||v,
      categoria:v=>CAT_LABEL[v]||v, recurso:v=>REC_LABEL[v]||v,
      modalidade:v=>v, setor:v=>v, midia:v=>v==='com'?'Com foto/vídeo':'Sem foto/vídeo',
    };
    let h='';
    Object.keys(lbls).forEach(n=>{
      (F[n]||[]).forEach(v=>{
        h+=`<span class="pc-chip">${lbls[n]}: ${esc(fmtV[n](v))} <button onclick="pcRemoveChip('${n}','${esc(v)}')">×</button></span>`;
      });
    });
    if(F.busca) h+=`<span class="pc-chip">Busca: "${esc(F.busca)}" <button onclick="pcRemoveChip('busca','')">×</button></span>`;
    return h;
  }

  function htmlLinha(o) {
    const c   = cfgOf(o);
    const tp  = c.tipo_parada||'sem_parada';
    const mod = modNome(o.equipe);
    const set = setorOs(o);
    const rec = c.recursos||[];
    const cor = PARADA_COR[tp]||'gray';

    const pBadge = `<span class="pb pb-${cor}">${PARADA_LABEL[tp]||'Sem parada'}</span>`;
    const prioBadge = c.prioridade
      ? `<span class="pb pb-${c.prioridade==='alta'?'alta':c.prioridade==='media'?'media':'baixo'}">${PRIO_LABEL[c.prioridade]}</span>`
      : `<span class="pb-none">—</span>`;

    // Ícones SVG dos recursos
    let recHtml = '';
    if (rec.length) {
      recHtml = `<div class="rec-icons">` + rec.map(r=>{
        let cls = 'rec-ic';
        if (r==='andaime') cls += c.andaime_ok?' ok':' pend';
        else cls += ' ok';
        const ttl = REC_LABEL[r]+(r==='andaime'?(c.andaime_ok?' ✓':' ⚠'):'');
        return `<span class="${cls}" title="${ttl}">${REC_SVG[r]||''}</span>`;
      }).join('') + `</div>`;
    } else {
      recHtml = `<span class="pb-none" style="font-size:10px">—</span>`;
    }

    const key = `${o.os}|${o.cod_servico||'1'}`;
    return `<tr onclick="pcAbrirModal('${esc(o.os)}','${esc(o.cod_servico||'1')}')">
      <td style="font-weight:600;color:#374151;">
        ${esc(o.os)}
        ${((CFG[`${o.os}|${o.cod_servico||'1'}`]||{}).fotos||[]).length>0
          ? `<i class="ti ti-photo" title="Tem foto/vídeo" style="font-size:10px;color:#9ca3af;margin-left:4px;vertical-align:middle"></i>`
          : ''}
      </td>
      <td style="white-space:normal;overflow:hidden">
        <div style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4;word-break:break-word">${esc(o.desc_servico||o.desc_os||'—')}</div>
      </td>
      <td style="font-size:11px;color:#4b5563;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(set||'—')}</td>
      <td style="font-size:11px;color:#4b5563">${esc(mod||'—')}</td>
      <td style="font-size:11px;font-weight:500">${fmtH(o.hh_prev_servico)}</td>
      <td>${pBadge}</td>
      <td>${prioBadge}</td>
      <td style="font-size:10px;color:#4b5563">${c.categoria?esc(CAT_LABEL[c.categoria]||c.categoria):`<span class="pb-none">—</span>`}</td>
      <td style="overflow:visible">${recHtml}</td>
      <td style="text-align:center;padding:9px 4px"><button class="edit-btn" onclick="pcAbrirModal('${esc(o.os)}','${esc(o.cod_servico||'1')}');event.stopPropagation()"><i class="ti ti-pencil" style="font-size:12px"></i></button></td>
    </tr>`;
  }

  /* ══ HTML RECURSOS ══ */
  function htmlRecursos(lista) {
    return `<div class="pc-res-grid">
      ${Object.entries(REC_LABEL).map(([r,rl])=>{
        const osR=lista.filter(o=>(cfgOf(o).recursos||[]).includes(r));
        return `<div class="pc-res-card">
          <div class="pc-res-title">
            <span style="color:#374151">${REC_SVG[r]||''}</span>${rl}
            <span style="background:var(--yellow);color:var(--dark1);border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">${osR.length}</span>
          </div>
          ${osR.length?osR.slice(0,8).map(o=>{
            const aok=r==='andaime'&&cfgOf(o).andaime_ok;
            return `<div class="pc-res-item" onclick="pcAbrirModal('${esc(o.os)}','${esc(o.cod_servico||'1')}')">
              <b>${esc(o.os)}</b> — ${esc((o.desc_servico||o.desc_os||'').slice(0,26))}
              ${r==='andaime'?`<span style="color:${aok?'#16a34a':'#dc2626'};font-size:10px"> ${aok?'✓':'⚠'}</span>`:''}
            </div>`;
          }).join('')+(osR.length>8?`<div class="pc-res-empty">+${osR.length-8} mais…</div>`:'')+`
          `:`<div class="pc-res-empty">Nenhum</div>`}
        </div>`;
      }).join('')}
      <div class="pc-res-card">
        <div class="pc-res-title"><i class="ti ti-info-circle" style="font-size:14px;color:var(--yellow)"></i>Resumo</div>
        ${Object.entries(REC_LABEL).map(([r,rl])=>`<div class="pc-res-item"><b>${rl}</b>: ${lista.filter(o=>(cfgOf(o).recursos||[]).includes(r)).length}</div>`).join('')}
        <div class="pc-res-item" style="margin-top:4px"><b>HH total</b>: ${lista.reduce((s,o)=>s+(parseFloat(o.hh_prev_servico)||0),0).toFixed(0)}h</div>
      </div>
    </div>`;
  }

  /* ══ BIND ══ */
  function bind() {
    const c=_container;
    c.querySelectorAll('.pc-tab').forEach(btn=>{
      if(btn.classList.contains('wip')) return;
      btn.addEventListener('click',()=>{ABA=btn.dataset.aba;render();});
    });
    c.querySelector('#pc-busca')?.addEventListener('input',e=>{F.busca=e.target.value;updateLista();});
    c.querySelectorAll('[data-sort]').forEach(th=>{
      th.addEventListener('click',()=>{
        const col=th.dataset.sort;
        if(SORT.col===col) SORT.dir*=-1; else{SORT.col=col;SORT.dir=1;}
        updateLista();
      });
    });
    c.querySelector('#pc-btn-imp')?.addEventListener('click',()=>c.querySelector('#pc-file').click());
    c.querySelector('#pc-file')?.addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;e.target.value='';await importarOS(f);});
    c.querySelector('#pc-btn-exp')?.addEventListener('click',()=>exportar());
    c.querySelector('#pc-btn-mod')?.addEventListener('click',()=>abrirModalidades());
    document.addEventListener('click',e=>{
      if(!e.target.closest('.pc-dd'))
        document.querySelectorAll('.pc-dd-panel.show').forEach(p=>p.classList.remove('show'));
    });
  }

  /* ── Atualização parcial da lista ── */
  function updateLista() {
    const lista=osFiltradas();
    const kpi=calcKPIs(lista);
    const tbody=document.getElementById('pc-tbody');
    const foot=document.getElementById('pc-foot');
    const chips=document.getElementById('pc-chips');
    if(tbody) tbody.innerHTML=lista.length?lista.map(htmlLinha).join(''):htmlVazio();
    if(foot) foot.innerHTML=`Exibindo <span>${lista.length}</span> de <span>${osBase().length}</span> serviços &nbsp;·&nbsp; <span>${lista.reduce((s,o)=>s+(parseFloat(o.hh_prev_servico)||0),0).toFixed(0)}h</span> previstas`;
    if(chips) chips.innerHTML=htmlChips();
    const upd=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    upd('k-total',lista.length); upd('k-parada',kpi.totalParada); upd('k-hh',kpi.hh.toFixed(0)+'h');
    upd('k-sv',kpi.sv); upd('k-sva',kpi.svA); upd('k-cv',kpi.cv); upd('k-cva',kpi.cvA);
  }

  /* ══ FUNÇÕES GLOBAIS ══ */
  window.pcToggleDD = function(nome,e) {
    e?.stopPropagation();
    const panel=document.getElementById(`pddp-${nome}`);
    const btn=document.getElementById(`pddbtn-${nome}`);
    const isOpen=panel?.classList.contains('show');
    document.querySelectorAll('.pc-dd-panel.show').forEach(p=>p.classList.remove('show'));
    document.querySelectorAll('.pc-dd-btn.open').forEach(b=>b.classList.remove('open'));
    if(!isOpen){panel?.classList.add('show');btn?.classList.add('open');}
  };

  window.pcToggleChk = function(nome,idx,e) {
    e?.stopPropagation();
    const inp=document.getElementById(`pchk-${nome}-${idx}`);
    if(!inp) return;
    inp.checked=!inp.checked;
    const val=inp.dataset.val;
    const arr=F[nome]||[];
    const pos=arr.indexOf(val);
    if(inp.checked&&pos<0) arr.push(val);
    else if(!inp.checked&&pos>=0) arr.splice(pos,1);
    F[nome]=arr;
    atualizarBotaoDD(nome);
    updateLista();
  };

  window.pcSelectAll = function(nome,e) {
    e?.stopPropagation();
    document.querySelectorAll(`#pddp-${nome} input[type=checkbox]`).forEach(inp=>{
      inp.checked=true;
      const val=inp.dataset.val;
      if(val&&!F[nome].includes(val)) F[nome].push(val);
    });
    atualizarBotaoDD(nome); updateLista();
  };

  window.pcSelectNone = function(nome,e) {
    e?.stopPropagation();
    document.querySelectorAll(`#pddp-${nome} input[type=checkbox]`).forEach(inp=>inp.checked=false);
    F[nome]=[];
    atualizarBotaoDD(nome); updateLista();
  };

  function atualizarBotaoDD(nome) {
    const btn=document.getElementById(`pddbtn-${nome}`);
    const arr=F[nome]||[];
    if(!btn) return;
    btn.classList.toggle('ativo',arr.length>0);
    let badge=btn.querySelector('.pc-dd-badge');
    if(arr.length>0){
      if(!badge){badge=document.createElement('span');badge.className='pc-dd-badge';btn.insertBefore(badge,btn.querySelector('.arr'));}
      badge.textContent=arr.length;
    } else if(badge) badge.remove();
  }

  window.pcRemoveChip = function(campo,val) {
    if(campo==='busca'){F.busca='';const b=document.getElementById('pc-busca');if(b)b.value='';}
    else{
      F[campo]=(F[campo]||[]).filter(x=>x!==val);
      document.querySelectorAll(`#pddp-${campo} input[type=checkbox]`).forEach(inp=>{
        if(inp.dataset.val===val) inp.checked=false;
      });
      atualizarBotaoDD(campo);
    }
    updateLista();
  };

  /* ══ MODAL ══ */
  window.pcAbrirModal = function(os,cod) {
    MODAL_KEY=`${os}|${cod||'1'}`;
    DRAFT={...(CFG[MODAL_KEY]||{})};
    if(!DRAFT.recursos) DRAFT.recursos=[];
    if(!DRAFT.fotos)    DRAFT.fotos=[];
    renderModal();
  };

  window.pcFecharModal = function() {
    MODAL_KEY=null; DRAFT={};
    document.getElementById('pc-modal-ov')?.remove();
  };

  function renderModal() {
    const [os,cod]=MODAL_KEY.split('|');
    const o=OS.find(x=>x.os===os&&(x.cod_servico||'1')===cod);
    const tp=DRAFT.tipo_parada||'';
    const pr=DRAFT.prioridade||'';
    const ct=DRAFT.categoria||'';
    const rc=DRAFT.recursos||[];
    const aok=DRAFT.andaime_ok||false;
    const det=DRAFT.detalhamento||'';
    const fotos=DRAFT.fotos||[];

    const badgeHtml=(val,map,corMap)=>{
      if(!val) return '';
      const cor=corMap?corMap[val]:'gray';
      return `<span class="pc-msel-badge" style="background:var(--pb-${cor}-bg,#f3f4f6);color:var(--pb-${cor}-fg,#374151);margin-left:6px">${esc(map[val]||val)}</span>`;
    };

    const corBadge={
      geral:'background:#fee2e2;color:#991b1b',
      com_vapor:'background:#dbeafe;color:#1e3a8a',
      sem_vapor:'background:#ede9fe;color:#4c1d95',
      caldeira_03:'background:#fef3c7;color:#92400e',
      caldeira_04:'background:#fef3c7;color:#92400e',
      caldeira_05:'background:#fef3c7;color:#92400e',
      sem_parada:'background:#f3f4f6;color:#6b7280',
    };
    const corPrio={alta:'background:#fee2e2;color:#991b1b',media:'background:#fef3c7;color:#92400e',baixa:'background:#dcfce7;color:#14532d'};

    const html=`<div class="pc-ov" id="pc-modal-ov" onclick="if(event.target===this)pcFecharModal()">
<div class="pc-modal">
  <div class="pc-mhead">
    <div>
      <div class="pc-mtitle">${esc(o?o.desc_servico||o.desc_os||'—':'—')}</div>
      <div class="pc-msub">OS ${esc(os)} · Cód. ${esc(cod)} · ${esc(o?modNome(o.equipe)||'—':'—')} · ${esc(o?setorOs(o)||'—':'—')} · ${fmtH(o?o.hh_prev_servico:0)}</div>
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
      ${tp?`<span class="pc-msel-badge" style="${corBadge[tp]||'background:#f3f4f6;color:#374151'}">${esc(PARADA_LABEL[tp])}</span>`:''}
    </div>

    <div class="pc-msec">
      <div class="pc-row2">
        <div>
          <div class="pc-msec-lbl">Prioridade</div>
          <select class="pc-mselect" onchange="pcDraftSet('prioridade',this.value)">
            <option value="">— selecionar —</option>
            ${Object.entries(PRIO_LABEL).map(([v,l])=>`<option value="${v}" ${pr===v?'selected':''}>${l}</option>`).join('')}
          </select>
          ${pr?`<span class="pc-msel-badge" style="${corPrio[pr]||''}">${esc(PRIO_LABEL[pr])}</span>`:''}
        </div>
        <div>
          <div class="pc-msec-lbl">Categoria</div>
          <select class="pc-mselect" onchange="pcDraftSet('categoria',this.value)">
            <option value="">— selecionar —</option>
            ${Object.entries(CAT_LABEL).map(([v,l])=>`<option value="${v}" ${ct===v?'selected':''}>${l}</option>`).join('')}
          </select>
          ${ct?`<span class="pc-msel-badge" style="background:#f3f4f6;color:#374151">${esc(CAT_LABEL[ct])}</span>`:''}
        </div>
      </div>
    </div>

    <div class="pc-msec">
      <div class="pc-msec-lbl">Recursos Necessários <span style="font-size:9px;color:#9ca3af;font-weight:400">(múltipla seleção)</span></div>
      <div class="pc-sel-row">
        ${Object.entries(REC_LABEL).map(([v,l])=>`
          <button class="pc-sel-btn ${rc.includes(v)?'sel':''}" onclick="pcDraftToggleRec('${v}')">
            ${REC_SVG[v]||''} ${l}
          </button>`).join('')}
      </div>
      ${rc.includes('andaime')?`
      <div class="andaime-inline">
        <label class="toggle-wrap">
          <input type="checkbox" ${aok?'checked':''} onchange="pcDraftSet('andaime_ok',this.checked)">
          <span class="toggle-slider"></span>
        </label>
        <span style="font-size:11px;color:${aok?'#16a34a':'#d97706'};font-weight:600">
          ${aok?'Andaime montado / aprovado':'Andaime pendente de montagem'}
        </span>
      </div>`:''}
    </div>

    <div class="pc-msec">
      <div class="pc-msec-lbl">Detalhamento / Impactos</div>
      <textarea class="pc-textarea" id="pc-det" placeholder="Descreva detalhes, impactos na produção, observações técnicas…" onchange="DRAFT.detalhamento=this.value">${esc(det)}</textarea>
    </div>

    <div class="pc-msec">
      <div class="pc-msec-lbl">Fotos e Vídeos</div>
      <label class="pc-upload-area">
        <input type="file" id="pc-file-media" accept="image/*,video/*" multiple style="display:none" onchange="pcUploadMidia(event)">
        <i class="ti ti-cloud-upload"></i>
        <span style="font-size:11px;color:#9ca3af">Clique para adicionar fotos ou vídeos<br><span style="font-size:9px">JPG, PNG, MP4, MOV · máx 50MB</span></span>
      </label>
      ${fotos.length?`<div class="pc-media-grid">${fotos.map((f,i)=>{
        const isVid=f.url&&/\.(mp4|mov|webm)$/i.test(f.url);
        return `<div class="pc-media-item">${isVid?`<video src="${esc(f.url)}" style="width:100%;height:100%;object-fit:cover"></video>`:`<img src="${esc(f.url)}" loading="lazy">`}<button class="pc-media-del" onclick="pcRemoverMidia(${i})">×</button></div>`;
      }).join('')}</div>`:''}
    </div>

  </div>
  <div class="pc-mfoot">
    <button class="pc-cancel-btn" onclick="pcFecharModal()">Cancelar</button>
    <button class="pc-save-btn" onclick="pcSalvarModal()">Salvar</button>
  </div>
</div></div>`;

    const ex=document.getElementById('pc-modal-ov');
    if(ex) ex.outerHTML=html; else document.body.insertAdjacentHTML('beforeend',html);
  }

  window.pcDraftSet = function(campo,val) {
    DRAFT[campo]=val;
    renderModal();
  };

  window.pcDraftToggleRec = function(rec) {
    const recs=[...(DRAFT.recursos||[])];
    const idx=recs.indexOf(rec);
    if(idx>=0) recs.splice(idx,1); else recs.push(rec);
    DRAFT.recursos=recs;
    if(!recs.includes('andaime')) DRAFT.andaime_ok=false;
    renderModal();
  };

  /* ── Upload mídia ── */
  window.pcUploadMidia = async function(e) {
    const files=Array.from(e.target.files); if(!files.length) return;
    const db=getDB();
    const [os]=MODAL_KEY.split('|');
    for(const file of files){
      const ext=file.name.split('.').pop().toLowerCase();
      const path=`${os}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const idx=DRAFT.fotos.length;
      DRAFT.fotos.push({url:'',path,uploading:true});
      renderModal();
      try{
        const{error}=await db.storage.from(STORAGE_BUCKET).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
        if(error) throw error;
        const{data:pub}=db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
        DRAFT.fotos[idx]={url:pub.publicUrl,path};
      }catch(err){
        DRAFT.fotos.splice(idx,1);
        showToastMod('Erro no upload: '+err.message,'erro');
      }
      renderModal();
    }
    e.target.value='';
  };

  window.pcRemoverMidia = async function(i) {
    const foto=DRAFT.fotos[i]; if(!foto) return;
    if(foto.path){ const db=getDB(); await db.storage.from(STORAGE_BUCKET).remove([foto.path]); }
    DRAFT.fotos.splice(i,1); renderModal();
  };

  window.pcSalvarModal = async function() {
    DRAFT.detalhamento=document.getElementById('pc-det')?.value||DRAFT.detalhamento||'';
    const[os,cod]=MODAL_KEY.split('|');
    CFG[MODAL_KEY]={...(CFG[MODAL_KEY]||{}),...DRAFT,os,cod_servico:cod};
    const db=getDB();
    await db.from('parada_os_config').upsert({os,cod_servico:cod,...DRAFT,atualizado_em:new Date().toISOString()},{onConflict:'os,cod_servico'});
    showToastMod('Classificação salva','ok');
    pcFecharModal(); updateLista();
  };

  /* ══ IMPORTAR ══ */
  async function importarOS(arquivo){
    showToastMod('Lendo arquivo…','info');
    const reader=new FileReader();
    reader.onload=async e=>{
      try{
        const wb=XLSX.read(e.target.result,{type:'binary',cellDates:true});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
        if(!rows.length){showToastMod('Sem dados','erro');return;}
        const hdr=Object.keys(rows[0]);
        const ci=names=>{for(const n of names){const k=hdr.find(h=>String(h).trim().toLowerCase()===n.toLowerCase());if(k)return k;}return null;};
        const iOS=ci(['O.S.','OS']);
        const iCod=ci(['Codigo Serviço','Código Serviço','Cod Servico']);
        const iDescOS=ci(['Descrição OS','Descricao OS']);
        const iDescS=ci(['Descrição Serviço','Descricao Servico']);
        const iEq=ci(['Equipe']);
        const iSetor=ci(['Setor']);
        const iDescSt=ci(['Descrição Setor','Descricao Setor','Desc Setor','Descrição do Setor']);
        const iHhPS=ci(['Hh Prev. Serviço (Decimal)','Hh Prev. Servico']);
        const iHhPOS=ci(['Hh Prev. OS','Hh Prev OS']);
        const iHhRS=ci(['Hh Real Serviço (Decimal)','Hh Real Servico']);
        const iHhROS=ci(['Hh Real OS']);
        const iEquip=ci(['Equipamento']);
        const iDescEq=ci(['Descrição Equipamento','Descricao Equipamento']);
        const iTag=ci(['TAG']);
        const iTipoAt=ci(['Tipo Ativ.','Tipo Atividade']);
        const iStatusOS=ci(['Status OS']);

        const regs=[];
        rows.forEach(r=>{
          const os=String(r[iOS]||'').replace(/\D/g,'');
          if(!os||os.length<4) return;
          const st=String(r[iStatusOS]||'').toLowerCase();
          if(STATUS_EXCLUIR.some(s=>st.includes(s))) return;
          const ta=String(r[iTipoAt]||'').toUpperCase().trim();
          if(ta==='MCU') return;
          // Setor: coluna "Setor" = código, "Descrição Setor" = nome legível
          const setorCod  = String(r[iSetor]||'').trim();
          const setorDesc = String(r[iDescSt]||'').trim();
          regs.push({
            os, cod_servico:String(r[iCod]||'1').trim()||'1',
            desc_os:String(r[iDescOS]||'').trim(),
            desc_servico:String(r[iDescS]||'').trim(),
            equipe:String(r[iEq]||'').trim(),
            setor:setorCod,
            desc_setor:setorDesc||setorCod,  // usa código se descrição vazia
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
        if(!regs.length){showToastMod('Nenhuma OS válida','erro');return;}
        showToastMod(`Salvando ${regs.length} OS…`,'info');
        const db=getDB();
        for(let i=0;i<regs.length;i+=100)
          await db.from('ordens_servico').upsert(regs.slice(i,i+100),{onConflict:'os,cod_servico'});
        await carregarDados(); render();
        showToastMod(`${regs.length} OS importadas`,'ok');
      }catch(err){showToastMod('Erro: '+err.message,'erro');console.error(err);}
    };
    reader.readAsBinaryString(arquivo);
  }

  /* ══ EXPORTAR ══ */
  async function exportar(){
    if(!window.XLSX){await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
    const lista=osFiltradas();
    const rows=lista.map(o=>{const c=cfgOf(o);return{'OS':o.os,'Serviço':o.desc_servico||o.desc_os||'','Equipe':o.equipe||'','Modalidade':modNome(o.equipe)||'','Setor':setorOs(o),'Equipamento':o.desc_equipamento||o.equipamento||'','TAG':o.tag||'','HH Prev.(h)':o.hh_prev_servico||0,'Tipo Parada':PARADA_LABEL[c.tipo_parada||'sem_parada']||'','Prioridade':PRIO_LABEL[c.prioridade||'']||'','Categoria':CAT_LABEL[c.categoria||'']||'','Andaime':(c.recursos||[]).includes('andaime')?(c.andaime_ok?'Montado':'Pendente'):'Não','Munck':(c.recursos||[]).includes('munck')?'Sim':'Não','Guindaste':(c.recursos||[]).includes('guindaste')?'Sim':'Não','PTA':(c.recursos||[]).includes('pta')?'Sim':'Não','Detalhamento':c.detalhamento||''};});
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Carteira');
    XLSX.writeFile(wb,`CarteiraPararadas_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToastMod('Exportado','ok');
  }

  /* ══ MODALIDADES ══ */
  let _modEdit=null;
  function abrirModalidades(){let ov=document.getElementById('pc-mod-ov');if(!ov){ov=document.createElement('div');ov.id='pc-mod-ov';ov.className='pc-ov';ov.onclick=e=>{if(e.target===ov)fecharModalidades();};document.body.appendChild(ov);}_modEdit=null;renderModalidades(ov);ov.style.display='flex';}
  function fecharModalidades(){document.getElementById('pc-mod-ov')?.remove();_modEdit=null;}
  function renderModalidades(ov){
    const rows=MODS.map((m,i)=>{
      if(_modEdit===i)return`<tr style="background:#fffbeb"><td><input class="pc-textarea" style="min-height:0;height:28px;padding:4px 7px;width:70px" id="cmod-pref" value="${esc(m.prefixo)}"></td><td><input class="pc-textarea" style="min-height:0;height:28px;padding:4px 7px" id="cmod-nome" value="${esc(m.nome)}"></td><td style="white-space:nowrap"><button class="pc-save-btn" style="padding:4px 10px;font-size:10px" onclick="pcModSalvar(${i})">✓</button><button class="pc-cancel-btn" style="padding:4px 8px;font-size:10px;margin-left:4px" onclick="_modEdit=null;renderModalidades(document.getElementById('pc-mod-ov'))">✕</button></td></tr>`;
      return`<tr><td style="font-weight:600">${esc(m.prefixo)}</td><td>${esc(m.nome)}</td><td style="white-space:nowrap"><button class="pc-cancel-btn" style="font-size:10px;padding:3px 8px" onclick="_modEdit=${i};renderModalidades(document.getElementById('pc-mod-ov'))">Editar</button><button class="pc-cancel-btn" style="font-size:10px;padding:3px 8px;color:#dc2626;margin-left:4px" onclick="pcModRemover(${i})">Remover</button></td></tr>`;
    }).join('');
    const nova=_modEdit===-1?`<tr style="background:#fffbeb"><td><input class="pc-textarea" style="min-height:0;height:28px;padding:4px 7px;width:70px" id="cmod-pref" placeholder="CAL"></td><td><input class="pc-textarea" style="min-height:0;height:28px;padding:4px 7px" id="cmod-nome" placeholder="Caldeiraria"></td><td><button class="pc-save-btn" style="padding:4px 10px;font-size:10px" onclick="pcModSalvar(-1)">✓ Salvar</button></td></tr>`:'';
    ov.innerHTML=`<div class="pc-modal" style="max-width:400px"><div class="pc-mhead"><div><div class="pc-mtitle">Modalidades de Serviço</div><div class="pc-msub">Prefixo da equipe → nome da modalidade</div></div><button class="pc-mclose" onclick="fecharModalidades()">×</button></div><div class="pc-mbody" style="padding:12px 16px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th style="padding:5px 7px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;text-align:left">Prefixo</th><th style="padding:5px 7px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;text-align:left">Modalidade</th><th></th></tr></thead><tbody>${rows}${nova}</tbody></table>${_modEdit===null?`<button class="pc-cancel-btn" style="margin-top:8px;font-size:11px" onclick="_modEdit=-1;renderModalidades(document.getElementById('pc-mod-ov'))">+ Nova modalidade</button>`:''}</div></div>`;
    ov.style.display='flex';
  }
  window.pcModSalvar=async function(i){const pref=document.getElementById('cmod-pref')?.value.trim().toUpperCase();const nome=document.getElementById('cmod-nome')?.value.trim();if(!pref||!nome){showToastMod('Preencha os dois campos','erro');return;}const db=getDB();if(i===-1){const{data}=await db.from('config_modalidades').insert({prefixo:pref,nome}).select();if(data)MODS.push(data[0]);}else{await db.from('config_modalidades').update({prefixo:pref,nome}).eq('id',MODS[i].id);MODS[i]={...MODS[i],prefixo:pref,nome};}_modEdit=null;renderModalidades(document.getElementById('pc-mod-ov'));showToastMod('Salvo','ok');};
  window.pcModRemover=async function(i){if(!confirm('Remover?'))return;const db=getDB();const m=MODS[i];if(m.id)await db.from('config_modalidades').delete().eq('id',m.id);MODS.splice(i,1);_modEdit=null;renderModalidades(document.getElementById('pc-mod-ov'));};
  window.fecharModalidades=fecharModalidades;
  window.renderModalidades=renderModalidades;

  /* ══ CARREGAR ══ */
  async function carregarDados(){
    const db=getDB();
    const[rOS,rCFG,rMODS]=await Promise.all([
      db.from('ordens_servico').select('os,cod_servico,desc_os,desc_servico,equipe,setor,desc_setor,equipamento,desc_equipamento,tag,tipo_atividade,status_os,hh_prev_servico,hh_real_servico').order('os',{ascending:true}),
      db.from('parada_os_config').select('*'),
      db.from('config_modalidades').select('*').order('prefixo',{ascending:true}),
    ]);
    OS=rOS.data||[]; MODS=rMODS.data||[]; CFG={};
    (rCFG.data||[]).forEach(c=>{
      CFG[`${c.os}|${c.cod_servico||'1'}`]=c;
      if(CFG[`${c.os}|${c.cod_servico||'1'}`].fotos&&!Array.isArray(CFG[`${c.os}|${c.cod_servico||'1'}`].fotos))
        CFG[`${c.os}|${c.cod_servico||'1'}`].fotos=[];
    });
  }

  function showToastMod(msg,tipo){
    if(window.showToast){window.showToast(msg,tipo);return;}
    const t=document.getElementById('toast');if(!t)return;
    t.className=tipo||'info';
    document.getElementById('toast-icon').className='ti '+(tipo==='ok'?'ti-check':tipo==='erro'?'ti-alert-circle':'ti-info-circle');
    document.getElementById('toast-msg').textContent=msg;
    t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500);
  }

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
