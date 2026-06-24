/* ═══════════════════════════════════════════════════════════════
   MÓDULO: Planos de Ação SSMA  v5 — arquivo limpo
   Arquivo: modules/planos-ssma.js
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ══ Helpers ════════════════════════════════════════════════ */
  const RISCO_LABEL = r => r >= 15 ? 'Alto' : r >= 5 ? 'Médio' : 'Baixo';
  const RISCO_CLASS = r => r >= 15 ? 'sb-alto' : r >= 5 ? 'sb-medio' : 'sb-baixo';
  const CLASSIF_OPTIONS = ['CAPEX','OPEX','DOCUMENTAL','GOVERNANÇA'];

  function normClassif(v) {
    if (!v) return '';
    return String(v).trim()
      .replace(/DOCUMENTAL\s*[/\\]\s*GOVERN[AÂ]N[CÇ]A/gi, 'DOC/GOV')
      .replace(/DOCUMENTAL E GOVERN[AÂ]N[CÇ]A/gi, 'DOC/GOV');
  }

  function categoriaChecklist(raw) {
    if (!raw) return '';
    const u = String(raw).trim().toUpperCase();
    if (u.startsWith('ADER'))   return 'Aderência';
    if (u.startsWith('ANÁLISE DE QUASE') || u.startsWith('ANALISE DE QUASE')) return 'Análise de Quase Acidente';
    if (u.startsWith('ANÁLISE DE ACIDENTE') || u.startsWith('ANALISE DE ACIDENTE') ||
        u.startsWith('ANÁLISE DE ACIDENTES') || u.startsWith('ANALISE DE ACIDENTES')) return 'Análise de Acidente';
    if (u.startsWith('INSPE')) return 'Inspeção de SSMA';
    return String(raw).trim();
  }

  function calcSituacao(prazoStr) {
    if (!prazoStr) return 'No prazo';
    const p = prazoStr.split('/');
    if (p.length !== 3) return 'No prazo';
    const prazo = new Date(`${p[2]}-${p[1]}-${p[0]}T12:00:00`);
    if (isNaN(prazo)) return 'No prazo';
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diff = (prazo - hoje) / 86400000;
    if (diff < 0)  return 'Atrasado';
    if (diff <= 7) return 'A vencer';
    return 'No prazo';
  }

  function excelDateToStr(val) {
    if (!val && val !== 0) return '';
    if (val instanceof Date) return fmtDate(val);
    if (typeof val === 'string') {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(val.trim())) return val.trim();
      const d = new Date(val); if (!isNaN(d)) return fmtDate(d); return '';
    }
    if (typeof val === 'number' && val > 0) {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(d)) return fmtDate(d);
    }
    return '';
  }
  function fmtDate(d) {
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  function fmtBRL(v) { return (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
  function esc(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function badgeClassif(v) {
    if (!v) return 'sb-none';
    const u = normClassif(String(v)).toUpperCase();
    if (u === 'CAPEX')   return 'sb-capex';
    if (u === 'OPEX')    return 'sb-opex';
    if (u === 'DOC/GOV') return 'sb-docgov';
    if (u.includes('DOCUMENTAL')) return 'sb-doc';
    if (u.includes('GOVERN'))     return 'sb-gov';
    return 'sb-none';
  }

  function col(row, ...nomes) {
    for (const n of nomes) {
      const k = Object.keys(row).find(k => String(k).trim() === n.trim());
      if (k !== undefined && row[k] !== '' && row[k] !== null && row[k] !== undefined) return row[k];
    }
    return '';
  }

  function detectarTipo(headers) {
    const h = headers.map(x => String(x||'').trim());
    if (h.some(x => x === 'O que será feito?')) return 'p1';
    if (h.some(x => x === 'Resultado'))          return 'p2';
    return 'desconhecido';
  }

  /* ══ Estado ═════════════════════════════════════════════════ */
  let DB   = [];
  let MODS = [];
  let sortCol = null, sortDir = 1;
  let filtros = {
    busca:'', responsavel:[], status:[], situacao:[], checklist:[],
    risco:[], classificacao:[], composicao:[], modalidadeSv:[],
    valorMin:null, valorMax:null
  };
  let modalCodigo = null;
  let modalTab    = 'geral';
  let aqEditando  = null;
  let svEditando  = null;
  let hhEditando  = null;

  function calcValorTotal(p) {
    const aq = (p._aquisicoes||[]).reduce((s,i)=>s+(parseFloat(i.qtd)||0)*(parseFloat(i.valor_unit)||0),0);
    const sv = (p._servicos||[]).reduce((s,i)=>{
      const m = MODS.find(m=>m.nome===i.modalidade);
      return s + (parseFloat(i.hh_prev)||0)*(m?parseFloat(m.valor_hh)||0:0);
    },0);
    return {aq, sv, total:aq+sv};
  }

  function temTratativa(p) {
    return (p._aquisicoes||[]).length > 0 || (p._servicos||[]).length > 0;
  }

  /* ══ Banco de dados ═════════════════════════════════════════ */
  async function carregarTudo() {
    const [rP,rM,rA,rS,rMods] = await Promise.all([
      dbSelect('ssma_planos'),
      dbSelect('ssma_manual'),
      dbSelect('ssma_aquisicoes'),
      dbSelect('ssma_servicos'),
      dbSelect('ssma_modalidades', {order:{col:'nome',asc:true}}),
    ]);
    MODS = rMods.data || [];
    const mm={}, am={}, sm={};
    (rM.data||[]).forEach(x => mm[x.codigo]=x);
    (rA.data||[]).forEach(x => { if(!am[x.codigo]) am[x.codigo]=[]; am[x.codigo].push(x); });
    (rS.data||[]).forEach(x => { if(!sm[x.codigo]) sm[x.codigo]=[]; sm[x.codigo].push(x); });
    DB = (rP.data||[])
      .filter(p => p.descricao && p.descricao.trim())
      .map(p => ({
        ...p,
        situacao:        calcSituacao(p.prazo),
        classificacao:   normClassif((p.classificacao||'').trim()),
        reclassificacao: normClassif(((mm[p.codigo]?.reclassificacao)||'').trim()),
        _aquisicoes:     am[p.codigo] || [],
        _servicos:       sm[p.codigo] || [],
      }));
  }

  /* ══ Importação ═════════════════════════════════════════════ */
  async function importarXLSX(arquivo) {
    showToastMod('Lendo arquivo…','info');
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const wb = XLSX.read(e.target.result, {type:'binary', cellDates:true});
        const ws0 = wb.Sheets[wb.SheetNames[0]];
        const rows0 = XLSX.utils.sheet_to_json(ws0, {defval:''});
        const tipo = rows0.length ? detectarTipo(Object.keys(rows0[0])) : 'desconhecido';
        if      (tipo === 'p1') { await processarP1(rows0); }
        else if (tipo === 'p2') { await processarP2(rows0); }
        else if (wb.SheetNames.length > 1) {
          const ws1 = wb.Sheets[wb.SheetNames[1]];
          const rows1 = XLSX.utils.sheet_to_json(ws1, {defval:''});
          const tipo2 = rows1.length ? detectarTipo(Object.keys(rows1[0])) : 'desconhecido';
          if      (tipo2 === 'p1') { await processarP1(rows1); }
          else if (tipo2 === 'p2') { await processarP2(rows1); }
          else showToastMod('Planilha não reconhecida.','erro');
        } else showToastMod('Planilha não reconhecida.','erro');
      } catch(err) { showToastMod('Erro: '+err.message,'erro'); console.error(err); }
    };
    reader.readAsBinaryString(arquivo);
  }

  async function processarP1(rows) {
    const registros = [];
    rows.forEach(r => {
      const cod = String(col(r,'Código do plano de ação')||'').trim();
      if (!cod || cod==='0') return;
      const descricao = String(col(r,'O que será feito?')||'').trim();
      if (!descricao) return;
      const prazo   = excelDateToStr(col(r,'Quando será feito?'));
      const criacao = excelDateToStr(col(r,'Data de criação'));
      registros.push({
        codigo:          cod,
        descricao,
        status:          String(col(r,'Status')||'').trim(),
        checklist_raw:   String(col(r,'Checklist')||'').trim(),
        checklist_cat:   categoriaChecklist(col(r,'Checklist')),
        responsavel:     String(col(r,'Responsável')||'').trim(),
        usuario_criacao: String(col(r,'Usuário')||'').trim(),
        data_criacao:    criacao,
        prazo,
        situacao:        calcSituacao(prazo),
        atualizado_em:   new Date().toISOString(),
      });
    });
    if (!registros.length) { showToastMod('Nenhum plano encontrado.','erro'); return; }
    showToastMod(`Salvando ${registros.length} planos…`,'info');
    const {count,error} = await dbUpsert('ssma_planos', registros, 'codigo');
    if (error) { showToastMod('Erro: '+error.message,'erro'); return; }
    await finalizarImportacao(count,'Planilha 1');
  }

  async function processarP2(rows) {
    let n = 0;
    const db = getDB();
    for (const r of rows) {
      const cod = String(col(r,'Código do plano de ação')||'').trim();
      if (!cod || cod==='0') continue;
      const resultado     = parseFloat(col(r,'Resultado')) || 0;
      const classificacao = normClassif(String(
        col(r,'CLASSIFICAÇÃO') || col(r,'CLASSIFICAÇÃO                   DE RISCOS') || ''
      ).trim());
      const upd = { resultado, risco: resultado>0 ? RISCO_LABEL(resultado) : '', atualizado_em: new Date().toISOString() };
      if (classificacao) upd.classificacao = classificacao;
      const {error} = await db.from('ssma_planos').update(upd).eq('codigo', cod);
      if (!error) n++;
    }
    await finalizarImportacao(n,'Planilha 2');
  }

  async function finalizarImportacao(count, label) {
    localStorage.setItem('man360_ssma_ultima_importacao', new Date().toLocaleString('pt-BR'));
    await carregarTudo();
    popularDDs();
    renderGraficos();
    renderLista();
    atualizarTimestamp();
    showToastMod(`${label} importada — ${count} registros`,'ok');
  }

  /* ══ Filtros ════════════════════════════════════════════════ */
  function dadosFiltrados() {
    let dados = DB.filter(p => {
      const vt = calcValorTotal(p).total;
      if (filtros.busca) {
        const b = filtros.busca.toLowerCase();
        if (!p.descricao?.toLowerCase().includes(b) && !String(p.codigo).includes(b)) return false;
      }
      if (filtros.responsavel.length  && !filtros.responsavel.includes(p.responsavel))  return false;
      if (filtros.status.length       && !filtros.status.includes(p.status))             return false;
      if (filtros.situacao.length     && !filtros.situacao.includes(p.situacao))         return false;
      if (filtros.checklist.length    && !filtros.checklist.includes(p.checklist_cat))   return false;
      if (filtros.risco.length        && !filtros.risco.includes(p.risco))               return false;
      if (filtros.classificacao.length && !filtros.classificacao.includes(p.classificacao)) return false;
      if (filtros.valorMin !== null && !isNaN(filtros.valorMin) && vt < filtros.valorMin) return false;
      if (filtros.valorMax !== null && !isNaN(filtros.valorMax) && vt > filtros.valorMax) return false;
      if (filtros.composicao.length) {
        const hasAq = (p._aquisicoes||[]).length > 0;
        const hasSv = (p._servicos||[]).length > 0;
        const ok = filtros.composicao.some(c => {
          if (c==='somente_aq') return hasAq && !hasSv;
          if (c==='somente_sv') return !hasAq && hasSv;
          if (c==='ambos')      return hasAq && hasSv;
          if (c==='sem')        return !hasAq && !hasSv;
          return false;
        });
        if (!ok) return false;
      }
      if (filtros.modalidadeSv.length) {
        const svMods = (p._servicos||[]).map(s=>s.modalidade).filter(Boolean);
        if (!filtros.modalidadeSv.some(m=>svMods.includes(m))) return false;
      }
      return true;
    });

    if (sortCol) {
      dados = [...dados].sort((a,b) => {
        let va, vb;
        if (sortCol === 'vt') { va = calcValorTotal(a).total; vb = calcValorTotal(b).total; }
        else { va = String(a[sortCol]||'').toLowerCase(); vb = String(b[sortCol]||'').toLowerCase(); }
        if (va < vb) return -sortDir;
        if (va > vb) return  sortDir;
        return 0;
      });
    }
    return dados;
  }

  /* ══ RENDER PRINCIPAL ═══════════════════════════════════════ */
  async function render(container) {
    container.innerHTML = `
<style>
.ssma{font-family:var(--font);color:#1a1a1a}
.ssma-topbar{display:flex;align-items:center;justify-content:space-between;padding:0 0 14px;flex-wrap:wrap;gap:10px}
.ssma-title{font-size:14px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#374151;display:flex;align-items:center;gap:8px}
.ssma-title i{font-size:18px;color:var(--yellow)}
.ssma-topbar-right{display:flex;gap:8px;align-items:center}
.ssma-last-import{font-size:10px;color:#9ca3af}
.ssma-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;box-shadow:var(--shadow);align-items:flex-end}
.ssma-search{display:flex;align-items:center;gap:6px;flex:1;min-width:160px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 10px;height:30px;background:var(--bg)}
.ssma-search input{border:none;background:none;outline:none;font-family:var(--font);font-size:11px;width:100%;color:#374151}
.ssma-search i{font-size:14px;color:#9ca3af;flex-shrink:0}
.ssma-dd{position:relative}
.ssma-dd-btn{height:30px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;white-space:nowrap;transition:border-color 120ms}
.ssma-dd-btn:hover{border-color:#9ca3af}
.ssma-dd-btn.ativo{border-color:var(--yellow);background:#fffbeb}
.ssma-dd-btn i{font-size:13px;color:#6b7280}
.ssma-dd-btn .arr{font-size:10px;margin-left:4px;transition:transform 200ms}
.ssma-dd-btn.open .arr{transform:rotate(180deg)}
.dd-badge{background:var(--yellow);color:var(--dark1);border-radius:10px;font-size:9px;font-weight:700;padding:1px 5px;margin-left:2px}
.ssma-dd-panel{position:absolute;top:calc(100% + 4px);left:0;min-width:210px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);z-index:400;display:none;max-height:280px;overflow-y:auto}
.ssma-dd-panel.show{display:block}
.ssma-dd-item{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:11px;font-weight:500;color:#374151;cursor:pointer;user-select:none}
.ssma-dd-item:hover{background:var(--bg)}
.ssma-dd-item input[type=checkbox]{accent-color:var(--yellow);flex-shrink:0;pointer-events:none}
.ssma-val-wrap{display:flex;flex-direction:column;gap:3px}
.ssma-val-lbl{font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.ssma-val-row{display:flex;align-items:center;gap:4px}
.ssma-val-input{height:30px;width:86px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;color:#374151;padding:0 8px;text-align:right}
.ssma-val-input:focus{outline:none;border-color:var(--yellow)}
.ssma-val-sep{font-size:11px;color:#9ca3af}
.ssma-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 0 10px;min-height:0}
.ssma-chips:empty{display:none}
.ssma-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;background:#fef3c7;border:1px solid #fbbf24;border-radius:10px;font-size:10px;font-weight:600;color:#92400e}
.ssma-chip button{background:none;border:none;cursor:pointer;color:#92400e;font-size:14px;line-height:1;padding:0}
.ssma-graficos{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.ssma-grafico-card{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:14px;box-shadow:var(--shadow)}
.ssma-grafico-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.ssma-grafico-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#374151}
.ssma-canvas-wrap{position:relative;height:220px;width:100%}
.ssma-legenda{display:flex;align-items:center;gap:16px;font-size:10px;color:#6b7280;padding:0 2px 8px;flex-wrap:wrap}
.ssma-legenda-item{display:flex;align-items:center;gap:5px}
.trat-dot{display:inline-block;width:7px;height:7px;border-radius:50%;flex-shrink:0}
.trat-green{background:#16a34a}
.trat-red{background:#dc2626}
.trat-gray{background:#d1d5db}
.ssma-table-wrap{overflow-x:auto;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
.ssma-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:auto}
.ssma-table th{text-align:left;padding:8px 10px;background:var(--bg);color:#6b7280;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;cursor:pointer;user-select:none}
.ssma-table th:hover{color:#374151}
.ssma-table th .sico{font-size:10px;margin-left:3px;opacity:.3}
.ssma-table th.sorted .sico{opacity:1;color:var(--yellow)}
.ssma-table td{padding:10px 10px;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap}
.ssma-table td.desc-td{white-space:normal;min-width:180px}
.ssma-table tbody tr:hover td{background:#fafafa;cursor:pointer}
.ssma-table tbody tr:last-child td{border-bottom:none}
.ssma-desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.45;word-break:break-word;white-space:normal}
.ssma-tfoot{padding:8px 14px;font-size:11px;color:#9ca3af;background:var(--bg);border-top:1px solid var(--border);border-radius:0 0 var(--radius) var(--radius)}
.ssma-tfoot span{color:#374151}
.prazo-r{color:#dc2626;font-size:11px;font-weight:600}
.prazo-a{color:#d97706;font-size:11px;font-weight:600}
.prazo-g{color:#16a34a;font-size:11px;font-weight:600}
.sb-alto  {background:#fee2e2;color:#991b1b;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-medio {background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-baixo {background:#dcfce7;color:#14532d;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-capex {background:#dbeafe;color:#1e3a8a;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-opex  {background:#ede9fe;color:#4c1d95;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-docgov{background:#f3f4f6;color:#374151;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-doc   {background:#e0f2fe;color:#0c4a6e;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-gov   {background:#fdf4ff;color:#581c87;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-none  {color:#9ca3af;font-size:11px}
.ssma-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding-top:48px;overflow-y:auto}
.ssma-modal{background:var(--card-bg);border-radius:var(--radius);width:660px;max-width:96vw;box-shadow:0 8px 32px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden;max-height:calc(100vh - 80px);margin-bottom:20px}
.ssma-modal-head{padding:16px 18px;background:var(--bg);border-bottom:1px solid var(--border)}
.ssma-modal-code{font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
.ssma-modal-title{font-size:13px;font-weight:600;line-height:1.4;color:#111827}
.ssma-modal-meta{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center}
.ssma-modal-close{margin-left:auto;background:none;border:none;cursor:pointer;font-size:20px;color:#6b7280;line-height:1;padding:2px 6px}
.ssma-modal-close:hover{color:#111}
.ssma-modal-tabs{display:flex;border-bottom:1px solid var(--border);padding:0 18px;flex-shrink:0}
.ssma-modal-tab{padding:9px 14px;font-size:12px;color:#6b7280;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;font-family:var(--font);background:none;border-top:none;border-left:none;border-right:none}
.ssma-modal-tab.active{color:#111827;border-bottom-color:var(--yellow);font-weight:600}
.ssma-modal-body{flex:1;overflow-y:auto;padding:16px 18px}
.ssma-modal-footer{padding:10px 18px;border-top:1px solid var(--border);background:var(--bg);display:flex;align-items:center;flex-shrink:0}
.ssma-vt-block{margin-left:auto;text-align:right}
.ssma-vt-main{font-size:15px;font-weight:700;color:var(--dark1)}
.ssma-vt-sub{font-size:10px;color:#6b7280}
.ssma-field-label{font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.ssma-field-val{font-size:12px;color:#111827}
.ssma-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.ssma-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px}
.ssma-grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px}
.ssma-select{width:100%;height:30px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;color:#374151;padding:0 8px;cursor:pointer}
.classif-display{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px}
.classif-nota{font-size:9px;color:#9ca3af}
.ssma-itab{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
.ssma-itab th{text-align:left;padding:5px 7px;color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);white-space:nowrap}
.ssma-itab td{padding:6px 7px;border-bottom:1px solid var(--border);vertical-align:middle}
.ssma-itab tr:last-child td{border-bottom:none}
.ssma-itab tr.erow td{background:#fffbeb}
.ssma-ci{border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:11px;background:var(--bg);font-family:var(--font);color:#374151;width:100%;box-sizing:border-box}
.ssma-ci:focus{outline:2px solid var(--yellow);outline-offset:-1px;border-color:transparent}
.ssma-cs{border:1px solid var(--border);border-radius:4px;padding:4px;font-size:10px;background:var(--bg);font-family:var(--font);color:#374151;width:100%}
.btn-ic{background:none;border:none;cursor:pointer;padding:3px 5px;border-radius:4px;font-size:13px;line-height:1;color:#6b7280}
.btn-ic:hover{background:var(--bg)}
.btn-ic.edit:hover{color:#2563eb}
.btn-ic.del:hover{color:#dc2626}
.btn-ic.save{color:#16a34a}
.btn-ic.save:hover{background:#dcfce7}
.btn-ic.cancel:hover{color:#dc2626}
.ssma-add-row{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1px dashed var(--border);border-radius:var(--radius-sm);font-size:11px;color:#6b7280;cursor:pointer;background:none;font-family:var(--font);margin-top:4px}
.ssma-add-row:hover{border-color:#9ca3af;color:#374151}
.ssma-sub{margin-top:12px;text-align:right;font-size:13px;font-weight:700;color:#111}
.ssma-sub span{font-weight:400;font-size:10px;color:#6b7280;margin-right:5px}
.ssma-mod-list{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.ssma-mod-pill{font-size:10px;padding:2px 9px;border:1px solid var(--border);border-radius:10px;color:#374151;background:var(--bg)}
.ssma-mod-link{font-size:10px;padding:2px 9px;border:1px dashed var(--border);border-radius:10px;color:#9ca3af;background:none;cursor:pointer;font-family:var(--font);display:inline-flex;align-items:center;gap:3px}
.ssma-save-btn{padding:6px 16px;border:none;border-radius:var(--radius-sm);background:var(--yellow);color:var(--dark1);font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer}
.ssma-save-btn:hover{background:var(--yellow-dk)}
.ssma-hh-table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px}
.ssma-hh-table th{padding:6px 8px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;text-align:left}
.ssma-hh-table td{padding:7px 8px;border-bottom:1px solid var(--border);vertical-align:middle}
.ssma-hh-table tr:last-child td{border-bottom:none}
.ssma-hh-table tr.erow td{background:#fffbeb}
.ssma-hh-input{border:1px solid var(--border);border-radius:4px;padding:4px 7px;font-size:12px;font-family:var(--font);background:var(--bg);width:100%;box-sizing:border-box}
.ssma-hh-input:focus{outline:2px solid var(--yellow);outline-offset:-1px}
</style>

<div class="ssma">
  <div class="ssma-topbar">
    <div class="ssma-title"><i class="ti ti-shield-check"></i>Planos de Ação — SSMA</div>
    <div class="ssma-topbar-right">
      <span class="ssma-last-import" id="ssma-ts">—</span>
      <button class="topbar-btn" onclick="ssmaImportar()"><i class="ti ti-upload"></i><span>Importar planilha</span></button>
      <button class="topbar-btn" onclick="ssmaAbrirHH()"><i class="ti ti-settings"></i><span>Configurar HH</span></button>
    </div>
  </div>
  <input type="file" id="ssma-file" accept=".xlsx,.xls" style="display:none" onchange="ssmaOnFile(event)">

  <div class="ssma-filters">
    <div class="ssma-search"><i class="ti ti-search"></i><input type="text" id="ssma-busca" placeholder="Buscar código ou descrição…" oninput="ssmaFiltrar()"></div>
    ${[
      {n:'responsavel', icon:'ti-user',          label:'Responsável'},
      {n:'status',      icon:'ti-circle-check',  label:'Status'},
      {n:'situacao',    icon:'ti-clock',          label:'Situação'},
      {n:'checklist',   icon:'ti-list',           label:'Checklist'},
      {n:'risco',       icon:'ti-alert-triangle', label:'Risco'},
      {n:'classificacao',icon:'ti-tag',           label:'Classificação'},
      {n:'composicao',  icon:'ti-stack-2',        label:'Composição'},
      {n:'modalidadeSv',icon:'ti-tool',           label:'Modalidade'},
    ].map(({n,icon,label}) => `<div class="ssma-dd" id="dd-${n}">
      <button class="ssma-dd-btn" id="ddbtn-${n}" onclick="ssmaToggleDD('${n}',event)">
        <i class="ti ${icon}"></i>${label}<i class="ti ti-chevron-down arr"></i>
      </button>
      <div class="ssma-dd-panel" id="ddp-${n}"><div id="ddl-${n}"></div></div>
    </div>`).join('')}
    <div class="ssma-val-wrap">
      <div class="ssma-val-lbl"><i class="ti ti-currency-dollar" style="font-size:10px"></i> Valor total</div>
      <div class="ssma-val-row">
        <input type="text" class="ssma-val-input" id="ssma-vt-min" placeholder="Mín" oninput="ssmaFiltrarVT()">
        <span class="ssma-val-sep">–</span>
        <input type="text" class="ssma-val-input" id="ssma-vt-max" placeholder="Máx" oninput="ssmaFiltrarVT()">
      </div>
    </div>
  </div>

  <div class="ssma-chips" id="ssma-chips"></div>
  <div class="ssma-graficos" id="ssma-graficos"></div>

  <div class="ssma-legenda">
    <span style="font-weight:600;color:#374151">Tratativa:</span>
    <span class="ssma-legenda-item"><span class="trat-dot trat-green"></span>Com aquisição ou serviço registrado</span>
    <span class="ssma-legenda-item"><span class="trat-dot trat-red"></span>Atrasado/a vencer sem tratativa</span>
    <span class="ssma-legenda-item"><span class="trat-dot trat-gray"></span>No prazo sem tratativa</span>
  </div>

  <div class="ssma-table-wrap">
    <table class="ssma-table">
      <thead><tr>
        <th onclick="ssmaSort('codigo')"        id="th-codigo">Código <span class="sico">⇅</span></th>
        <th style="cursor:default">O que será feito?</th>
        <th onclick="ssmaSort('prazo')"         id="th-prazo">Prazo <span class="sico">⇅</span></th>
        <th onclick="ssmaSort('responsavel')"   id="th-responsavel">Responsável <span class="sico">⇅</span></th>
        <th onclick="ssmaSort('vt')" id="th-vt" style="text-align:right">Valor Total <span class="sico">⇅</span></th>
        <th onclick="ssmaSort('risco')"         id="th-risco">Risco <span class="sico">⇅</span></th>
        <th onclick="ssmaSort('classificacao')" id="th-classificacao">Classif. <span class="sico">⇅</span></th>
        <th onclick="ssmaSort('reclassificacao')" id="th-reclassificacao">Reclassif. <span class="sico">⇅</span></th>
      </tr></thead>
      <tbody id="ssma-tbody"></tbody>
    </table>
    <div class="ssma-tfoot" id="ssma-tfoot">Carregando…</div>
  </div>
</div>`;

    atualizarTimestamp();
    document.addEventListener('click', e => {
      if (!e.target.closest('.ssma-dd')) {
        document.querySelectorAll('.ssma-dd-panel.show').forEach(p=>p.classList.remove('show'));
        document.querySelectorAll('.ssma-dd-btn.open').forEach(b=>b.classList.remove('open'));
      }
    });

    await carregarTudo();
    popularDDs();
    renderGraficos();
    renderLista();
  }

  /* ══ DDs ════════════════════════════════════════════════════ */
  function popularDDs() {
    const fixos = {
      situacao:    ['Atrasado','A vencer','No prazo'],
      checklist:   ['Aderência','Análise de Acidente','Análise de Quase Acidente','Inspeção de SSMA'],
      risco:       ['Alto','Médio','Baixo'],
      composicao:  [['somente_aq','Só aquisições'],['somente_sv','Só serviços'],['ambos','Com ambos'],['sem','Sem tratativa']],
    };
    ['situacao','checklist','risco'].forEach(n => {
      document.getElementById(`ddl-${n}`).innerHTML = fixos[n].map(v =>
        `<label class="ssma-dd-item" onclick="ssmaToggleChk('${n}','${esc(v)}',event)"><input type="checkbox" id="chk-${n}-${esc(v)}" value="${esc(v)}"> ${esc(v)}</label>`
      ).join('');
    });
    document.getElementById('ddl-composicao').innerHTML = fixos.composicao.map(([v,l]) =>
      `<label class="ssma-dd-item" onclick="ssmaToggleChk('composicao','${v}',event)"><input type="checkbox" id="chk-composicao-${v}" value="${v}"> ${l}</label>`
    ).join('');
    ['responsavel','status','classificacao'].forEach(n => {
      const vals = [...new Set(DB.map(p=>p[n]).filter(Boolean))].sort();
      document.getElementById(`ddl-${n}`).innerHTML = vals.map(v =>
        `<label class="ssma-dd-item" onclick="ssmaToggleChk('${n}','${esc(v)}',event)"><input type="checkbox" id="chk-${n}-${esc(v)}" value="${esc(v)}"> ${esc(v)}</label>`
      ).join('');
    });
    const modNomes = MODS.map(m=>m.nome).filter(Boolean);
    document.getElementById('ddl-modalidadeSv').innerHTML = modNomes.map(v =>
      `<label class="ssma-dd-item" onclick="ssmaToggleChk('modalidadeSv','${esc(v)}',event)"><input type="checkbox" id="chk-modalidadeSv-${esc(v)}" value="${esc(v)}"> ${esc(v)}</label>`
    ).join('');
  }

  window.ssmaToggleChk = function(campo, val, e) {
    e && e.stopPropagation();
    const cb = document.getElementById(`chk-${campo}-${val}`);
    if (!cb) return;
    cb.checked = !cb.checked;
    filtros[campo] = [...document.querySelectorAll(`#ddl-${campo} input:checked`)].map(x=>x.value);
    atualizarBotaoDD(campo);
    renderLista();
  };

  window.ssmaToggleDD = function(n, e) {
    e && e.stopPropagation();
    const panel = document.getElementById(`ddp-${n}`);
    const btn   = document.getElementById(`ddbtn-${n}`);
    const isOpen = panel?.classList.contains('show');
    document.querySelectorAll('.ssma-dd-panel.show').forEach(p=>p.classList.remove('show'));
    document.querySelectorAll('.ssma-dd-btn.open').forEach(b=>b.classList.remove('open'));
    if (!isOpen) { panel?.classList.add('show'); btn?.classList.add('open'); }
  };

  function atualizarBotaoDD(n) {
    const btn = document.getElementById(`ddbtn-${n}`);
    const sel = filtros[n] || [];
    if (!btn) return;
    btn.classList.toggle('ativo', sel.length > 0);
    let badge = btn.querySelector('.dd-badge');
    if (sel.length > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className='dd-badge'; btn.insertBefore(badge, btn.querySelector('.arr')); }
      badge.textContent = sel.length;
    } else {
      if (badge) badge.remove();
    }
  }

  window.ssmaFiltrar = function() {
    filtros.busca = document.getElementById('ssma-busca')?.value || '';
    renderLista();
  };

  window.ssmaFiltrarVT = function() {
    const toNum = s => { const n=parseFloat(String(s).replace(/\./g,'').replace(',','.')); return isNaN(n)?null:n; };
    filtros.valorMin = toNum(document.getElementById('ssma-vt-min')?.value);
    filtros.valorMax = toNum(document.getElementById('ssma-vt-max')?.value);
    renderLista();
  };

  window.ssmaSort = function(c) {
    if (sortCol===c) sortDir*=-1; else { sortCol=c; sortDir=1; }
    document.querySelectorAll('.ssma-table th').forEach(th => {
      th.classList.remove('sorted');
      const ico = th.querySelector('.sico'); if(ico) ico.textContent='⇅';
    });
    const th = document.getElementById(`th-${c}`);
    if (th) { th.classList.add('sorted'); const ico=th.querySelector('.sico'); if(ico) ico.textContent=sortDir===1?'↑':'↓'; }
    renderLista();
  };

  window.ssmaRemoverChip = function(campo, val) {
    if (campo==='busca') { filtros.busca=''; const b=document.getElementById('ssma-busca'); if(b) b.value=''; }
    else if (campo==='valor') {
      filtros.valorMin=null; filtros.valorMax=null;
      ['ssma-vt-min','ssma-vt-max'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    } else {
      filtros[campo] = filtros[campo].filter(x=>x!==val);
      const cb = document.getElementById(`chk-${campo}-${val}`); if(cb) cb.checked=false;
      atualizarBotaoDD(campo);
    }
    renderLista();
  };

  /* ══ GRÁFICOS ═══════════════════════════════════════════════ */
  function renderGraficos() {
    const el = document.getElementById('ssma-graficos'); if(!el) return;

    // Recalcula situacao dinamicamente — não depende do campo salvo no banco
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const atrasados = DB.filter(p => {
      if (!p.prazo) return false;
      const pts = p.prazo.split('/'); if(pts.length!==3) return false;
      const d = new Date(`${pts[2]}-${pts[1]}-${pts[0]}T12:00:00`);
      return !isNaN(d) && (d-hoje)/86400000 < 0;
    });

    // Agrupa: reclassificacao > classificacao > 'Não classificado'
    const agrVT = {}, agrQt = {};
    atrasados.forEach(p => {
      const key = p.reclassificacao || p.classificacao || 'Não classificado';
      agrVT[key] = (agrVT[key]||0) + calcValorTotal(p).total;
      agrQt[key] = (agrQt[key]||0) + 1;
    });

    console.log('[SSMA] atrasados:', atrasados.length, 'grupos:', agrQt);

    el.innerHTML = `
      <div class="ssma-grafico-card">
        <div class="ssma-grafico-head">
          <div class="ssma-grafico-title">Valores por Classificação de Investimento <span style="font-weight:400;font-size:9px;color:#9ca3af">(atrasados)</span></div>
        </div>
        <div class="ssma-canvas-wrap"><canvas id="graf-vt"></canvas></div>
      </div>
      <div class="ssma-grafico-card">
        <div class="ssma-grafico-head">
          <div class="ssma-grafico-title">Planos de Ação por Classificação de Investimento <span style="font-weight:400;font-size:9px;color:#9ca3af">(atrasados)</span></div>
        </div>
        <div class="ssma-canvas-wrap"><canvas id="graf-qt"></canvas></div>
      </div>`;

    const totalVT = Object.values(agrVT).reduce((a,b)=>a+b,0);
    if (totalVT === 0) {
      const cv = document.getElementById('graf-vt');
      if (cv) {
        cv.width = cv.parentElement?.offsetWidth||500; cv.height=220;
        if (window.__ch_grafvt) { window.__ch_grafvt.destroy(); window.__ch_grafvt=null; }
        const ctx=cv.getContext('2d');
        ctx.clearRect(0,0,cv.width,cv.height);
        ctx.fillStyle='#9ca3af'; ctx.font='12px sans-serif';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('Nenhum valor registrado nos planos atrasados', cv.width/2, cv.height/2);
      }
    } else {
      desenharPareto('graf-vt','__ch_grafvt', agrVT, v=>fmtBRL(v), 'Valor total (R$)');
    }
    desenharPareto('graf-qt','__ch_grafqt', agrQt, v=>String(Math.round(v)), 'Planos');
  }

  function desenharPareto(canvasId, chartKey, agr, fmtTick, yLabel) {
    const canvas = document.getElementById(canvasId); if(!canvas) return;
    canvas.width  = canvas.parentElement?.offsetWidth || 500;
    canvas.height = 220;
    const ctx = canvas.getContext('2d');

    const entries = Object.entries(agr).sort((a,b)=>b[1]-a[1]);
    if (!entries.length) {
      ctx.fillStyle='#9ca3af'; ctx.font='12px sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('Sem dados', canvas.width/2, canvas.height/2); return;
    }

    const labels  = entries.map(e=>e[0]);
    const vals    = entries.map(e=>e[1]);
    const total   = vals.reduce((a,b)=>a+b,0);
    const cumPct  = vals.map((v,i)=>vals.slice(0,i+1).reduce((a,b)=>a+b,0)/total*100);
    const maxVal  = Math.max(...vals);
    const barClrs = ['#F8C100','#e5ad00','#d4a000','#c49300','#b48600'];

    if (window[chartKey]) { window[chartKey].destroy(); window[chartKey]=null; }

    window[chartKey] = new Chart(ctx, {
      data: {
        labels,
        datasets: [
          { type:'bar',  label:yLabel,       data:vals,    backgroundColor:labels.map((_,i)=>barClrs[i%barClrs.length]), yAxisID:'y',  order:2 },
          { type:'line', label:'% Acumulado', data:cumPct, borderColor:'#C8102E', backgroundColor:'rgba(200,16,46,.08)',
            borderWidth:2, pointRadius:4, pointBackgroundColor:'#C8102E', fill:false, tension:.3, yAxisID:'y2', order:1 }
        ]
      },
      options:{
        responsive:false,
        maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{
          legend:{ display:true, position:'top', labels:{ font:{size:10}, boxWidth:10 } },
          tooltip:{ callbacks:{ label(c){ return c.dataset.type==='line'?`Acumulado: ${c.raw.toFixed(1)}%`:`${yLabel}: ${fmtTick(c.raw)}`; } } }
        },
        scales:{
          x:{ ticks:{ font:{size:10}, maxRotation:30 }, grid:{ display:false } },
          y:{ type:'linear', position:'left', min:0, suggestedMax: maxVal*1.15,
              ticks:{ font:{size:9}, callback:v=>fmtTick(v), precision:0 },
              grid:{ color:'#f3f4f6' },
              title:{ display:true, text:yLabel, font:{size:9}, color:'#6b7280' } },
          y2:{ type:'linear', position:'right', min:0, max:100,
               ticks:{ font:{size:9}, callback:v=>v+'%', precision:0 },
               grid:{ display:false },
               title:{ display:true, text:'% Acumulado', font:{size:9}, color:'#C8102E' } }
        }
      }
    });
  }

  /* ══ LISTA ══════════════════════════════════════════════════ */
  function renderLista() {
    const dados = dadosFiltrados();
    const tbody = document.getElementById('ssma-tbody');
    const tfoot = document.getElementById('ssma-tfoot');
    if (!tbody) return;

    const at=dados.filter(p=>p.situacao==='Atrasado').length;
    const av=dados.filter(p=>p.situacao==='A vencer').length;
    const np=dados.filter(p=>p.situacao==='No prazo').length;

    tbody.innerHTML = dados.map(p => {
      const vt = calcValorTotal(p);
      const rc = p.reclassificacao||'';
      const trat = temTratativa(p);
      let dotCls = 'trat-gray';
      if (trat) dotCls='trat-green';
      else if (p.situacao==='Atrasado'||p.situacao==='A vencer') dotCls='trat-red';
      const dot = `<span class="trat-dot ${dotCls}" style="margin-right:5px;vertical-align:middle"></span>`;
      const pc = p.situacao==='Atrasado'?'prazo-r':p.situacao==='A vencer'?'prazo-a':'prazo-g';
      return `<tr onclick="ssmaAbrirModal('${esc(p.codigo)}')">
        <td style="font-size:11px;color:#6b7280;font-weight:600">${dot}${esc(p.codigo)}</td>
        <td class="desc-td"><div class="ssma-desc">${esc(p.descricao)}</div></td>
        <td class="${pc}">${esc(p.prazo||'—')}</td>
        <td style="font-size:11px;color:#6b7280">${esc(p.responsavel||'—')}</td>
        <td style="text-align:right;font-size:12px;font-weight:${vt.total>0?600:400};color:${vt.total>0?'#111':'#9ca3af'}">${vt.total>0?fmtBRL(vt.total):'—'}</td>
        <td>${p.risco?`<span class="${RISCO_CLASS(p.resultado)}">${p.risco}</span>`:`<span class="sb-none">—</span>`}</td>
        <td>${p.classificacao?`<span class="${badgeClassif(p.classificacao)}">${esc(p.classificacao)}</span>`:`<span class="sb-none">—</span>`}</td>
        <td>${rc?`<span class="${badgeClassif(rc)}">${esc(rc)}</span>`:`<span class="sb-none">—</span>`}</td>
      </tr>`;
    }).join('');

    if (tfoot) tfoot.innerHTML=`Exibindo <span>${dados.length}</span> de <span>${DB.length}</span> planos &nbsp;·&nbsp;
      <span style="color:#dc2626">${at} atrasados</span> &nbsp;·&nbsp;
      <span style="color:#d97706">${av} a vencer</span> &nbsp;·&nbsp;
      <span style="color:#16a34a">${np} no prazo</span>`;

    renderChips();
  }

  function renderChips() {
    const el = document.getElementById('ssma-chips'); if(!el) return;
    const labels={responsavel:'Responsável',status:'Status',situacao:'Situação',checklist:'Checklist',risco:'Risco',classificacao:'Classificação',composicao:'Composição',modalidadeSv:'Modalidade'};
    let html='';
    ['responsavel','status','situacao','checklist','risco','classificacao','composicao','modalidadeSv'].forEach(n=>{
      (filtros[n]||[]).forEach(v=>{
        html+=`<span class="ssma-chip">${labels[n]}: ${esc(v)} <button onclick="ssmaRemoverChip('${n}','${esc(v)}')">×</button></span>`;
      });
    });
    if (filtros.valorMin!==null||filtros.valorMax!==null) {
      html+=`<span class="ssma-chip">Valor: ${filtros.valorMin!==null?fmtBRL(filtros.valorMin):'∞'} – ${filtros.valorMax!==null?fmtBRL(filtros.valorMax):'∞'} <button onclick="ssmaRemoverChip('valor','')">×</button></span>`;
    }
    if (filtros.busca) html+=`<span class="ssma-chip">Busca: "${esc(filtros.busca)}" <button onclick="ssmaRemoverChip('busca','')">×</button></span>`;
    el.innerHTML=html;
  }

  /* ══ MODAL ══════════════════════════════════════════════════ */
  window.ssmaAbrirModal = function(codigo) { modalCodigo=codigo; modalTab='geral'; aqEditando=null; svEditando=null; renderModal(); };

  function renderModal() {
    const p = DB.find(d=>d.codigo===modalCodigo); if(!p) return;
    const vt=calcValorTotal(p); const rc=p.reclassificacao||''; const cl=p.classificacao||'';
    const situBadge = p.situacao==='Atrasado'?`<span class="sb-alto">Atrasado</span>`:p.situacao==='A vencer'?`<span class="sb-medio">A vencer</span>`:`<span class="sb-baixo">No prazo</span>`;

    let classifHtml='';
    if (cl && rc && cl!==rc) {
      classifHtml=`<div class="classif-display"><span class="${badgeClassif(cl)}">${esc(cl)}</span><span style="color:#9ca3af">→</span><span class="${badgeClassif(rc)}">${esc(rc)}</span><span class="classif-nota">(alterado)</span></div>`;
    } else {
      const v=rc||cl;
      classifHtml=v?`<div class="classif-display"><span class="${badgeClassif(v)}">${esc(v)}</span></div>`:`<div class="classif-display"><span class="sb-none">—</span></div>`;
    }

    let bodyHtml='';
    if (modalTab==='geral') {
      const pc=p.situacao==='Atrasado'?'prazo-r':p.situacao==='A vencer'?'prazo-a':'prazo-g';
      bodyHtml=`
        <div class="ssma-grid4">
          <div><div class="ssma-field-label">Responsável</div><div class="ssma-field-val">${esc(p.responsavel||'—')}</div></div>
          <div><div class="ssma-field-label">Usuário (abertura)</div><div class="ssma-field-val">${esc(p.usuario_criacao||'—')}</div></div>
          <div><div class="ssma-field-label">Data de criação</div><div class="ssma-field-val">${esc(p.data_criacao||'—')}</div></div>
          <div><div class="ssma-field-label">Status</div><div class="ssma-field-val">${esc(p.status||'—')}</div></div>
        </div>
        <div class="ssma-grid3">
          <div><div class="ssma-field-label">Prazo</div><div class="${pc}">${esc(p.prazo||'—')}</div></div>
          <div><div class="ssma-field-label">Risco</div><div style="margin-top:4px">${p.risco?`<span class="${RISCO_CLASS(p.resultado)}">${p.risco} · ${p.resultado}</span>`:`<span class="sb-none">—</span>`}</div></div>
          <div><div class="ssma-field-label">Categoria</div><div class="ssma-field-val" style="font-size:11px">${esc(p.checklist_cat||'—')}</div></div>
        </div>
        <div class="ssma-grid2">
          <div><div class="ssma-field-label">Classificação → Reclassificação</div>${classifHtml}</div>
          <div>
            <div class="ssma-field-label">Alterar reclassificação</div>
            <select class="ssma-select" onchange="ssmaAlterarReclassif(this.value)">
              <option value="">— selecionar —</option>
              ${CLASSIF_OPTIONS.map(o=>`<option value="${o}" ${rc===o?'selected':''}>${o}</option>`).join('')}
            </select>
          </div>
        </div>`;
    } else if (modalTab==='aquisicoes') {
      bodyHtml = renderAqs(p);
    } else {
      bodyHtml = renderSvs(p);
    }

    let ov = document.getElementById('ssma-modal-ov');
    if (!ov) { ov=document.createElement('div'); ov.id='ssma-modal-ov'; ov.className='ssma-modal-overlay'; ov.onclick=e=>{if(e.target===ov)ssmaFecharModal();}; document.body.appendChild(ov); }
    ov.innerHTML=`<div class="ssma-modal">
      <div class="ssma-modal-head">
        <div class="ssma-modal-code"># ${esc(p.codigo)} · ${esc(p.checklist_cat||'')} · ${esc(p.responsavel||'')}</div>
        <div class="ssma-modal-title">${esc(p.descricao)}</div>
        <div class="ssma-modal-meta">${situBadge} ${p.risco?`<span class="${RISCO_CLASS(p.resultado)}">${p.risco} · resultado ${p.resultado}</span>`:''}<button class="ssma-modal-close" onclick="ssmaFecharModal()">×</button></div>
      </div>
      <div class="ssma-modal-tabs">
        <button class="ssma-modal-tab ${modalTab==='geral'?'active':''}" onclick="ssmaMudarTab('geral')">Geral</button>
        <button class="ssma-modal-tab ${modalTab==='aquisicoes'?'active':''}" onclick="ssmaMudarTab('aquisicoes')">Aquisições</button>
        <button class="ssma-modal-tab ${modalTab==='servicos'?'active':''}" onclick="ssmaMudarTab('servicos')">Serviços</button>
      </div>
      <div class="ssma-modal-body">${bodyHtml}</div>
      <div class="ssma-modal-footer">
        <div class="ssma-vt-block">
          <div class="ssma-vt-main">${fmtBRL(vt.total)}</div>
          <div class="ssma-vt-sub">Aq: ${fmtBRL(vt.aq)} + Sv: ${fmtBRL(vt.sv)}</div>
        </div>
      </div>
    </div>`;
    ov.style.display='flex';
  }

  /* Aquisições */
  function renderAqs(p) {
    const items=p._aquisicoes||[];
    const sub=items.reduce((s,i)=>s+(parseFloat(i.qtd)||0)*(parseFloat(i.valor_unit)||0),0);
    const modOpts=MODS.map(m=>`<option value="${esc(m.nome)}">${esc(m.nome)}</option>`).join('');

    const rows=items.map((it,i)=>{
      if (aqEditando===i) return `<tr class="erow">
        <td><input class="ssma-ci" id="aq-cod" value="${esc(it.sem_cadastro?'':it.cod_item||'')}" ${it.sem_cadastro?'disabled':''} placeholder="Código" style="width:76px">
          <div style="display:flex;align-items:center;gap:5px;margin-top:3px;font-size:10px;color:#6b7280"><input type="checkbox" id="aq-sc" ${it.sem_cadastro?'checked':''} onchange="ssmaAqToggleSC()"> sem cadastro</div></td>
        <td><input class="ssma-ci" id="aq-desc" value="${esc(it.descricao||'')}" placeholder="Descrição"></td>
        <td><select class="ssma-cs" id="aq-mod"><option value="">—</option>${MODS.map(m=>`<option value="${esc(m.nome)}" ${it.modalidade===m.nome?'selected':''}>${esc(m.nome)}</option>`).join('')}</select></td>
        <td><input class="ssma-ci" id="aq-qtd" value="${it.qtd||''}" style="width:46px;text-align:center" placeholder="0"></td>
        <td><input class="ssma-ci" id="aq-vunit" value="${it.valor_unit||''}" style="width:78px;text-align:right" placeholder="0,00"></td>
        <td style="text-align:right;font-weight:600">${fmtBRL((parseFloat(it.qtd)||0)*(parseFloat(it.valor_unit)||0))}</td>
        <td style="white-space:nowrap"><button class="btn-ic save" onclick="ssmaAqSalvar(${i})"><i class="ti ti-check"></i></button><button class="btn-ic cancel" onclick="ssmaAqCancelar()"><i class="ti ti-x"></i></button></td>
      </tr>`;
      return `<tr>
        <td style="font-size:11px;color:#6b7280">${esc(it.sem_cadastro?'(s/cad.)':it.cod_item||'—')}</td>
        <td>${esc(it.descricao||'—')}</td>
        <td>${esc(it.modalidade||'—')}</td>
        <td style="text-align:center">${it.qtd||'—'}</td>
        <td style="text-align:right">${it.valor_unit?fmtBRL(parseFloat(it.valor_unit)):'—'}</td>
        <td style="text-align:right;font-weight:600">${fmtBRL((parseFloat(it.qtd)||0)*(parseFloat(it.valor_unit)||0))}</td>
        <td style="white-space:nowrap"><button class="btn-ic edit" onclick="ssmaAqEditar(${i})"><i class="ti ti-pencil"></i></button><button class="btn-ic del" onclick="ssmaAqRemover(${i})"><i class="ti ti-trash"></i></button></td>
      </tr>`;
    }).join('');

    const novaLinha = aqEditando===-1?`<tr class="erow">
      <td><input class="ssma-ci" id="aq-cod" placeholder="Código" style="width:76px">
        <div style="display:flex;align-items:center;gap:5px;margin-top:3px;font-size:10px;color:#6b7280"><input type="checkbox" id="aq-sc" onchange="ssmaAqToggleSC()"> sem cadastro</div></td>
      <td><input class="ssma-ci" id="aq-desc" placeholder="Descrição"></td>
      <td><select class="ssma-cs" id="aq-mod"><option value="">—</option>${modOpts}</select></td>
      <td><input class="ssma-ci" id="aq-qtd" style="width:46px;text-align:center" placeholder="0"></td>
      <td><input class="ssma-ci" id="aq-vunit" style="width:78px;text-align:right" placeholder="0,00"></td>
      <td>—</td>
      <td style="white-space:nowrap"><button class="btn-ic save" onclick="ssmaAqSalvar(-1)"><i class="ti ti-check"></i></button><button class="btn-ic cancel" onclick="ssmaAqCancelar()"><i class="ti ti-x"></i></button></td>
    </tr>`:'';

    return `<table class="ssma-itab"><thead><tr>
      <th style="width:100px">Código</th><th>Descrição</th><th style="width:100px">Modalidade</th>
      <th style="width:52px;text-align:center">Qtd</th><th style="width:88px;text-align:right">Vl. unit.</th>
      <th style="width:80px;text-align:right">Total</th><th style="width:60px"></th>
    </tr></thead><tbody>${rows}${novaLinha}</tbody></table>
    ${aqEditando===null?`<button class="ssma-add-row" onclick="ssmaAqNovo()"><i class="ti ti-plus" style="font-size:12px"></i> Adicionar item</button>`:''}
    <div class="ssma-sub"><span>Subtotal aquisições</span>${fmtBRL(sub)}</div>`;
  }

  /* Serviços */
  function renderSvs(p) {
    const items=p._servicos||[];
    const sub=items.reduce((s,i)=>{const m=MODS.find(m=>m.nome===i.modalidade);return s+(parseFloat(i.hh_prev)||0)*(m?parseFloat(m.valor_hh)||0:0);},0);

    const rows=items.map((it,i)=>{
      const m=MODS.find(m=>m.nome===it.modalidade); const taxa=m?parseFloat(m.valor_hh)||0:0;
      if (svEditando===i) return `<tr class="erow">
        <td><input class="ssma-ci" id="sv-os" value="${esc(it.os||'')}" placeholder="OS" style="width:70px"></td>
        <td><input class="ssma-ci" id="sv-desc" value="${esc(it.descricao||'')}" placeholder="Descrição"></td>
        <td><select class="ssma-cs" id="sv-mod"><option value="">—</option>${MODS.map(m=>`<option value="${esc(m.nome)}" ${it.modalidade===m.nome?'selected':''}>${esc(m.nome)}</option>`).join('')}</select></td>
        <td><input class="ssma-ci" id="sv-hh" value="${it.hh_prev||''}" style="width:48px;text-align:center" placeholder="0"></td>
        <td style="text-align:right;font-size:10px;color:#6b7280">${taxa?fmtBRL(taxa)+'/h':'—'}</td>
        <td style="text-align:right;font-weight:600">${fmtBRL((parseFloat(it.hh_prev)||0)*taxa)}</td>
        <td style="white-space:nowrap"><button class="btn-ic save" onclick="ssmaSvSalvar(${i})"><i class="ti ti-check"></i></button><button class="btn-ic cancel" onclick="ssmaSvCancelar()"><i class="ti ti-x"></i></button></td>
      </tr>`;
      return `<tr>
        <td style="font-size:11px;color:#6b7280">${esc(it.os||'—')}</td>
        <td>${esc(it.descricao||'—')}</td>
        <td>${esc(it.modalidade||'—')}</td>
        <td style="text-align:center">${it.hh_prev||'—'}</td>
        <td style="text-align:right;font-size:10px;color:#6b7280">${taxa?fmtBRL(taxa)+'/h':'—'}</td>
        <td style="text-align:right;font-weight:600">${fmtBRL((parseFloat(it.hh_prev)||0)*taxa)}</td>
        <td style="white-space:nowrap"><button class="btn-ic edit" onclick="ssmaSvEditar(${i})"><i class="ti ti-pencil"></i></button><button class="btn-ic del" onclick="ssmaSvRemover(${i})"><i class="ti ti-trash"></i></button></td>
      </tr>`;
    }).join('');

    const novaLinha=svEditando===-1?`<tr class="erow">
      <td><input class="ssma-ci" id="sv-os" placeholder="OS" style="width:70px"></td>
      <td><input class="ssma-ci" id="sv-desc" placeholder="Descrição"></td>
      <td><select class="ssma-cs" id="sv-mod"><option value="">—</option>${MODS.map(m=>`<option value="${esc(m.nome)}">${esc(m.nome)}</option>`).join('')}</select></td>
      <td><input class="ssma-ci" id="sv-hh" style="width:48px;text-align:center" placeholder="0"></td>
      <td>—</td><td>—</td>
      <td style="white-space:nowrap"><button class="btn-ic save" onclick="ssmaSvSalvar(-1)"><i class="ti ti-check"></i></button><button class="btn-ic cancel" onclick="ssmaSvCancelar()"><i class="ti ti-x"></i></button></td>
    </tr>`:'';

    return `<table class="ssma-itab"><thead><tr>
      <th style="width:78px">OS</th><th>Descrição</th><th style="width:110px">Modalidade</th>
      <th style="width:58px;text-align:center">HH prev.</th><th style="width:74px;text-align:right">R$/h</th>
      <th style="width:80px;text-align:right">Subtotal</th><th style="width:60px"></th>
    </tr></thead><tbody>${rows}${novaLinha}</tbody></table>
    ${svEditando===null?`<button class="ssma-add-row" onclick="ssmaSvNovo()"><i class="ti ti-plus" style="font-size:12px"></i> Adicionar serviço</button>`:''}
    <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:9px">
      <div class="ssma-field-label">Modalidades</div>
      <div class="ssma-mod-list">${MODS.map(m=>`<span class="ssma-mod-pill">${esc(m.nome)} · ${fmtBRL(m.valor_hh)}/h</span>`).join('')}
        <button class="ssma-mod-link" onclick="ssmaFecharModal();ssmaAbrirHH()"><i class="ti ti-external-link" style="font-size:10px"></i> Gerenciar HH</button>
      </div>
    </div>
    <div class="ssma-sub"><span>Subtotal serviços</span>${fmtBRL(sub)}</div>`;
  }

  window.ssmaFecharModal = function() { aqEditando=null; svEditando=null; const ov=document.getElementById('ssma-modal-ov'); if(ov) ov.style.display='none'; renderLista(); renderGraficos(); };
  window.ssmaMudarTab    = function(tab) { modalTab=tab; renderModal(); };

  window.ssmaAlterarReclassif = async function(val) {
    const p=DB.find(d=>d.codigo===modalCodigo); if(!p) return;
    p.reclassificacao=val;
    await dbUpsert('ssma_manual',[{codigo:modalCodigo,reclassificacao:val,atualizado_em:new Date().toISOString()}],'codigo');
    renderModal();
  };

  window.ssmaAqEditar   = i => { aqEditando=i; ssmaMudarTab('aquisicoes'); };
  window.ssmaAqCancelar = ()=> { aqEditando=null; ssmaMudarTab('aquisicoes'); };
  window.ssmaAqNovo     = ()=> { aqEditando=-1; ssmaMudarTab('aquisicoes'); };
  window.ssmaAqToggleSC = ()=> { const cb=document.getElementById('aq-sc'); const cod=document.getElementById('aq-cod'); if(cod){cod.disabled=cb?.checked; if(cb?.checked) cod.value='';} };

  window.ssmaAqSalvar = async function(i) {
    const p=DB.find(d=>d.codigo===modalCodigo);
    const dados={
      sem_cadastro: document.getElementById('aq-sc')?.checked||false,
      cod_item:     document.getElementById('aq-cod')?.value.trim()||'',
      descricao:    document.getElementById('aq-desc')?.value.trim()||'',
      modalidade:   document.getElementById('aq-mod')?.value||'',
      qtd:          parseFloat(document.getElementById('aq-qtd')?.value)||0,
      valor_unit:   parseFloat(String(document.getElementById('aq-vunit')?.value||'').replace(',','.'))||0,
    };
    if (i===-1) { const {data}=await getDB().from('ssma_aquisicoes').insert({codigo:modalCodigo,...dados}).select(); if(data) p._aquisicoes.push(data[0]); }
    else { const item=p._aquisicoes[i]; if(item?.id) await getDB().from('ssma_aquisicoes').update(dados).eq('id',item.id); Object.assign(p._aquisicoes[i],dados); }
    aqEditando=null; ssmaMudarTab('aquisicoes');
  };
  window.ssmaAqRemover = async function(i) {
    if(!confirm('Remover este item?')) return;
    const p=DB.find(d=>d.codigo===modalCodigo); const item=p._aquisicoes[i];
    if(item?.id) await getDB().from('ssma_aquisicoes').delete().eq('id',item.id);
    p._aquisicoes.splice(i,1); aqEditando=null; ssmaMudarTab('aquisicoes');
  };

  window.ssmaSvEditar   = i => { svEditando=i; ssmaMudarTab('servicos'); };
  window.ssmaSvCancelar = ()=> { svEditando=null; ssmaMudarTab('servicos'); };
  window.ssmaSvNovo     = ()=> { svEditando=-1; ssmaMudarTab('servicos'); };

  window.ssmaSvSalvar = async function(i) {
    const p=DB.find(d=>d.codigo===modalCodigo);
    const dados={
      os:         document.getElementById('sv-os')?.value.trim()||'',
      descricao:  document.getElementById('sv-desc')?.value.trim()||'',
      modalidade: document.getElementById('sv-mod')?.value||'',
      hh_prev:    parseFloat(document.getElementById('sv-hh')?.value)||0,
    };
    if (i===-1) { const {data}=await getDB().from('ssma_servicos').insert({codigo:modalCodigo,...dados}).select(); if(data) p._servicos.push(data[0]); }
    else { const item=p._servicos[i]; if(item?.id) await getDB().from('ssma_servicos').update(dados).eq('id',item.id); Object.assign(p._servicos[i],dados); }
    svEditando=null; ssmaMudarTab('servicos');
  };
  window.ssmaSvRemover = async function(i) {
    if(!confirm('Remover este serviço?')) return;
    const p=DB.find(d=>d.codigo===modalCodigo); const item=p._servicos[i];
    if(item?.id) await getDB().from('ssma_servicos').delete().eq('id',item.id);
    p._servicos.splice(i,1); svEditando=null; ssmaMudarTab('servicos');
  };

  /* ══ CONFIGURAR HH ══════════════════════════════════════════ */
  window.ssmaAbrirHH = function() {
    let ov=document.getElementById('ssma-hh-ov');
    if(!ov){ov=document.createElement('div');ov.id='ssma-hh-ov';ov.className='ssma-modal-overlay';ov.onclick=e=>{if(e.target===ov)ssmaFecharHH();};document.body.appendChild(ov);}
    hhEditando=null; renderHH(ov); ov.style.display='flex';
  };

  function renderHH(ov) {
    const rows=MODS.map((m,i)=>{
      if(hhEditando===i) return `<tr class="erow">
        <td><input class="ssma-hh-input" id="hh-nome" value="${esc(m.nome)}" placeholder="Modalidade"></td>
        <td><input class="ssma-hh-input" id="hh-val" value="${m.valor_hh}" style="width:90px;text-align:right"></td>
        <td style="white-space:nowrap"><button class="btn-ic save" onclick="ssmaHHSalvar(${i})"><i class="ti ti-check"></i></button><button class="btn-ic cancel" onclick="ssmaHHCancelar()"><i class="ti ti-x"></i></button></td>
      </tr>`;
      return `<tr>
        <td>${esc(m.nome)}</td><td style="text-align:right">${fmtBRL(m.valor_hh)}/h</td>
        <td style="white-space:nowrap"><button class="btn-ic edit" onclick="ssmaHHEditar(${i})"><i class="ti ti-pencil"></i></button><button class="btn-ic del" onclick="ssmaHHRemover(${i})"><i class="ti ti-trash"></i></button></td>
      </tr>`;
    }).join('');
    const novaLinha=hhEditando===-1?`<tr class="erow">
      <td><input class="ssma-hh-input" id="hh-nome" placeholder="Nome da modalidade"></td>
      <td><input class="ssma-hh-input" id="hh-val" style="width:90px;text-align:right" placeholder="0"></td>
      <td style="white-space:nowrap"><button class="btn-ic save" onclick="ssmaHHSalvar(-1)"><i class="ti ti-check"></i></button><button class="btn-ic cancel" onclick="ssmaHHCancelar()"><i class="ti ti-x"></i></button></td>
    </tr>`:'';
    ov.innerHTML=`<div class="ssma-modal" style="max-width:420px">
      <div class="ssma-modal-head">
        <div class="ssma-modal-code">Configurações</div>
        <div class="ssma-modal-title">Modalidades de Serviço — HH Terceiro</div>
        <div class="ssma-modal-meta"><button class="ssma-modal-close" onclick="ssmaFecharHH()">×</button></div>
      </div>
      <div class="ssma-modal-body">
        <table class="ssma-hh-table"><thead><tr><th>Modalidade</th><th style="text-align:right">R$/h</th><th style="width:60px"></th></tr></thead>
        <tbody>${rows}${novaLinha}</tbody></table>
        ${hhEditando===null?`<button class="ssma-add-row" onclick="ssmaHHNovo()"><i class="ti ti-plus" style="font-size:12px"></i> Nova modalidade</button>`:''}
      </div>
    </div>`;
    ov.style.display='flex';
  }

  window.ssmaFecharHH  = ()=>{ const ov=document.getElementById('ssma-hh-ov'); if(ov) ov.style.display='none'; };
  window.ssmaHHEditar  = i=>{ hhEditando=i; renderHH(document.getElementById('ssma-hh-ov')); };
  window.ssmaHHCancelar= ()=>{ hhEditando=null; renderHH(document.getElementById('ssma-hh-ov')); };
  window.ssmaHHNovo    = ()=>{ hhEditando=-1; renderHH(document.getElementById('ssma-hh-ov')); };
  window.ssmaHHRemover = async function(i){
    if(!confirm('Remover?')) return;
    const m=MODS[i]; if(m.id) await getDB().from('ssma_modalidades').delete().eq('id',m.id);
    MODS.splice(i,1); hhEditando=null; renderHH(document.getElementById('ssma-hh-ov')); popularDDs();
  };
  window.ssmaHHSalvar = async function(i){
    const nome=document.getElementById('hh-nome')?.value.trim()||'';
    const val=parseFloat(document.getElementById('hh-val')?.value)||0;
    if(!nome){ showToastMod('Nome obrigatório','erro'); return; }
    if(i===-1){ const {data}=await getDB().from('ssma_modalidades').insert({nome,valor_hh:val}).select(); if(data) MODS.push(data[0]); }
    else { const m=MODS[i]; if(m.id) await getDB().from('ssma_modalidades').update({nome,valor_hh:val}).eq('id',m.id); MODS[i]={...m,nome,valor_hh:val}; }
    hhEditando=null; renderHH(document.getElementById('ssma-hh-ov')); popularDDs(); showToastMod('Modalidade salva','ok');
  };

  /* ══ Importação ═════════════════════════════════════════════ */
  window.ssmaImportar = ()=>{ document.getElementById('ssma-file')?.click(); };
  window.ssmaOnFile   = function(e){ const f=e.target.files[0]; if(f){ e.target.value=''; importarXLSX(f); } };

  function atualizarTimestamp(){
    const el=document.getElementById('ssma-ts');
    const ts=localStorage.getItem('man360_ssma_ultima_importacao');
    if(el) el.textContent=ts?`Última importação: ${ts}`:'Nenhuma importação';
  }
  function showToastMod(msg,tipo){
    if(window.showToast){ window.showToast(msg,tipo); return; }
    const t=document.getElementById('toast'); if(!t) return;
    t.className=tipo||'info';
    document.getElementById('toast-icon').className='ti '+(tipo==='ok'?'ti-check':tipo==='erro'?'ti-alert-circle':'ti-info-circle');
    document.getElementById('toast-msg').textContent=msg;
    t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3500);
  }

  /* ══ Registro ═══════════════════════════════════════════════ */
  window.Modulos = window.Modulos || {};
  window.Modulos['planos-ssma'] = { async init(container){ await render(container); } };
})();
