/* ═══════════════════════════════════════════════════════════════
   MÓDULO: Planos de Ação SSMA  v3
   Arquivo: modules/planos-ssma.js
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Identificação automática de planilha ── */
  const COL_P1 = ['Código do plano de ação', 'O que será feito?', 'Quando será feito?', 'Responsável', 'Checklist'];
  const COL_P2 = ['Resultado', 'CLASSIFICAÇÃO'];

  function detectarTipo(headers) {
    const h = headers.map(x => String(x||'').trim());
    const temP1 = COL_P1.filter(c => h.some(x => x === c)).length;
    const temP2 = COL_P2.filter(c => h.some(x => x.includes('Resultado') || x.includes('CLASSIFICAÇÃO'))).length;
    // P1 tem "O que será feito?" exclusivo; P2 tem "Resultado"
    if (h.some(x => x === 'O que será feito?')) return 'p1';
    if (h.some(x => x === 'Resultado'))         return 'p2';
    if (temP1 >= 3) return 'p1';
    if (temP2 >= 1) return 'p2';
    return 'desconhecido';
  }

  /* ── Helpers ── */
  const RISCO_LABEL = r => r >= 15 ? 'Alto' : r >= 5 ? 'Médio' : 'Baixo';
  const RISCO_CLASS = r => r >= 15 ? 'sb-alto' : r >= 5 ? 'sb-medio' : 'sb-baixo';
  const CLASSIF_OPTIONS = ['CAPEX', 'OPEX', 'DOCUMENTAL', 'GOVERNANÇA'];

  function categoriaChecklist(raw) {
    if (!raw) return '';
    const u = String(raw).trim().toUpperCase();
    if (u.startsWith('ADER')) return 'Aderência';
    if (u.startsWith('ANÁLISE DE QUASE') || u.startsWith('ANALISE DE QUASE')) return 'Análise de Quase Acidente';
    if (u.startsWith('ANÁLISE DE ACIDENTE') || u.startsWith('ANALISE DE ACIDENTE') || u.startsWith('ANÁLISE DE ACIDENTES') || u.startsWith('ANALISE DE ACIDENTES')) return 'Análise de Acidente';
    if (u.startsWith('INSPE')) return 'Inspeção de SSMA';
    return String(raw).trim();
  }

  function calcSituacao(prazoStr) {
    if (!prazoStr) return 'No prazo';
    const p = prazoStr.split('/');
    if (p.length !== 3) return 'No prazo';
    const prazo = new Date(`${p[2]}-${p[1]}-${p[0]}`);
    if (isNaN(prazo)) return 'No prazo';
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diff = (prazo - hoje) / 86400000;
    if (diff < 0)  return 'Atrasado';
    if (diff <= 7) return 'A vencer';
    return 'No prazo';
  }

  function excelDateToStr(val) {
    if (!val && val !== 0) return '';
    if (typeof val === 'string') {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(val.trim())) return val.trim();
      const d = new Date(val);
      if (!isNaN(d)) return fmtDate(d);
      return '';
    }
    if (val instanceof Date) return fmtDate(val);
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
    const u = String(v).toUpperCase();
    if (u==='CAPEX') return 'sb-capex';
    if (u==='OPEX')  return 'sb-opex';
    if (u.includes('DOCUMENTAL') && u.includes('GOV')) return 'sb-docgov';
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

  /* ── Estado ── */
  let DB    = [];
  let MODS  = [];
  let filtros = { busca:'', responsavel:[], status:[], situacao:[], checklist:[], risco:[], classificacao:[], valorMax: Infinity };
  let modalCodigo = null;
  let modalTab    = 'geral';

  function calcValorTotal(p) {
    const aq = (p._aquisicoes||[]).reduce((s,i)=>s+(parseFloat(i.qtd)||0)*(parseFloat(i.valor_unit)||0),0);
    const sv = (p._servicos||[]).reduce((s,i)=>{
      const m = MODS.find(m=>m.nome===i.modalidade);
      return s+(parseFloat(i.hh_prev)||0)*(m?parseFloat(m.valor_hh)||0:0);
    },0);
    return { aq, sv, total: aq+sv };
  }

  /* ════════════════════════════════════════════
     CARREGAMENTO
  ════════════════════════════════════════════ */
  async function carregarTudo() {
    const [rP, rM, rA, rS, rMods] = await Promise.all([
      dbSelect('ssma_planos'),
      dbSelect('ssma_manual'),
      dbSelect('ssma_aquisicoes'),
      dbSelect('ssma_servicos'),
      dbSelect('ssma_modalidades', { order:{ col:'nome', asc:true } }),
    ]);
    MODS = rMods.data || [];
    const mm = {}; (rM.data||[]).forEach(x => mm[x.codigo]=x);
    const am = {}; (rA.data||[]).forEach(x => { if(!am[x.codigo]) am[x.codigo]=[]; am[x.codigo].push(x); });
    const sm = {}; (rS.data||[]).forEach(x => { if(!sm[x.codigo]) sm[x.codigo]=[]; sm[x.codigo].push(x); });
    DB = (rP.data||[]).filter(p => p.descricao && p.descricao.trim()).map(p => ({
      ...p,
      situacao: calcSituacao(p.prazo),
      reclassificacao: mm[p.codigo]?.reclassificacao || '',
      _aquisicoes: am[p.codigo] || [],
      _servicos:   sm[p.codigo] || [],
    }));
  }

  /* ════════════════════════════════════════════
     IMPORTAÇÃO — detecta planilha automaticamente
  ════════════════════════════════════════════ */
  async function importarXLSX(arquivo) {
    showToastMod('Lendo arquivo…', 'info');
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const wb = XLSX.read(e.target.result, { type:'binary', cellDates:true });

        // Detecta tipo pela primeira aba
        const ws0  = wb.Sheets[wb.SheetNames[0]];
        const rows0 = XLSX.utils.sheet_to_json(ws0, { defval:'' });
        const tipo  = rows0.length ? detectarTipo(Object.keys(rows0[0])) : 'desconhecido';

        if (tipo === 'p1') {
          await processarP1(rows0);
        } else if (tipo === 'p2') {
          await processarP2(rows0);
        } else {
          // Tenta segunda aba
          if (wb.SheetNames.length > 1) {
            const ws1   = wb.Sheets[wb.SheetNames[1]];
            const rows1 = XLSX.utils.sheet_to_json(ws1, { defval:'' });
            const tipo2 = rows1.length ? detectarTipo(Object.keys(rows1[0])) : 'desconhecido';
            if (tipo2 === 'p1') { await processarP1(rows1); return; }
            if (tipo2 === 'p2') { await processarP2(rows1); return; }
          }
          showToastMod('Planilha não reconhecida. Verifique o arquivo.', 'erro');
        }
      } catch(err) {
        showToastMod('Erro ao ler arquivo: '+err.message, 'erro');
        console.error(err);
      }
    };
    reader.readAsBinaryString(arquivo);
  }

  /* Planilha 1 — fonte principal dos planos */
  async function processarP1(rows) {
    const registros = [];
    rows.forEach(r => {
      const cod = String(col(r,'Código do plano de ação')||'').trim();
      if (!cod || cod === '0') return;
      const descricao = String(col(r,'O que será feito?')||'').trim();
      if (!descricao) return; // ignora linhas sem descrição
      const prazo = excelDateToStr(col(r,'Quando será feito?'));
      registros.push({
        codigo:        cod,
        descricao,
        status:        String(col(r,'Status')||'').trim(),
        checklist_raw: String(col(r,'Checklist')||'').trim(),
        checklist_cat: categoriaChecklist(col(r,'Checklist')),
        responsavel:   String(col(r,'Responsável')||'').trim(),
        prazo,
        situacao:      calcSituacao(prazo),
        // Risco e classificação NÃO vêm da P1 — preserva o que já está no banco
        atualizado_em: new Date().toISOString(),
      });
    });
    if (!registros.length) { showToastMod('Nenhum plano encontrado na planilha.','erro'); return; }
    showToastMod(`Salvando ${registros.length} planos (Planilha 1)…`,'info');
    // Upsert apenas campos da P1, sem tocar em resultado/risco/classificacao
    const { count, error } = await dbUpsert('ssma_planos', registros, 'codigo');
    if (error) { showToastMod('Erro: '+error.message,'erro'); return; }
    finalizarImportacao(count, 'Planilha 1');
  }

  /* Planilha 2 — apenas complementa Resultado e Classificação */
  async function processarP2(rows) {
    let atualizados = 0;
    const db = getDB();
    for (const r of rows) {
      const cod = String(col(r,'Código do plano de ação')||'').trim();
      if (!cod || cod === '0') continue;
      const resultado = parseFloat(col(r,'Resultado')) || 0;
      // Última coluna = CLASSIFICAÇÃO (nome curto), antepenúltima = CLASSIFICAÇÃO DE RISCOS
      const classificacao = String(
        col(r,'CLASSIFICAÇÃO') ||
        col(r,'CLASSIFICAÇÃO                   DE RISCOS') ||
        ''
      ).trim();
      const update = {
        resultado,
        risco: resultado > 0 ? RISCO_LABEL(resultado) : '',
        ...(classificacao ? { classificacao } : {}),
        atualizado_em: new Date().toISOString(),
      };
      const { error } = await db.from('ssma_planos').update(update).eq('codigo', cod);
      if (!error) atualizados++;
    }
    finalizarImportacao(atualizados, 'Planilha 2');
  }

  async function finalizarImportacao(count, label) {
    localStorage.setItem('man360_ssma_ultima_importacao', new Date().toLocaleString('pt-BR'));
    await carregarTudo();
    renderLista();
    popularDDs();
    atualizarTimestamp();
    showToastMod(`${label} importada — ${count} registros atualizados`, 'ok');
  }

  /* ════════════════════════════════════════════
     FILTROS
  ════════════════════════════════════════════ */
  function dadosFiltrados() {
    return DB.filter(p => {
      const vt = calcValorTotal(p).total;
      if (filtros.busca) {
        const b = filtros.busca.toLowerCase();
        if (!p.descricao?.toLowerCase().includes(b) && !String(p.codigo).includes(b)) return false;
      }
      if (filtros.responsavel.length && !filtros.responsavel.includes(p.responsavel)) return false;
      if (filtros.status.length && !filtros.status.includes(p.status)) return false;
      if (filtros.situacao.length && !filtros.situacao.includes(p.situacao)) return false;
      if (filtros.checklist.length && !filtros.checklist.includes(p.checklist_cat)) return false;
      if (filtros.risco.length && !filtros.risco.includes(p.risco)) return false;
      if (filtros.classificacao.length && !filtros.classificacao.includes(p.classificacao)) return false;
      if (vt > filtros.valorMax) return false;
      return true;
    });
  }

  function temFiltroAtivo() {
    return filtros.busca || filtros.responsavel.length || filtros.status.length ||
      filtros.situacao.length || filtros.checklist.length || filtros.risco.length ||
      filtros.classificacao.length || filtros.valorMax < Infinity;
  }

  /* ════════════════════════════════════════════
     RENDER PRINCIPAL
  ════════════════════════════════════════════ */
  async function render(container) {
    container.innerHTML = `
<style>
.ssma{font-family:var(--font);color:#1a1a1a}
.ssma-topbar{display:flex;align-items:center;justify-content:space-between;padding:0 0 14px;flex-wrap:wrap;gap:10px}
.ssma-title{font-size:14px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#374151;display:flex;align-items:center;gap:8px}
.ssma-title i{font-size:18px;color:var(--yellow)}
.ssma-topbar-right{display:flex;gap:8px;align-items:center}
.ssma-last-import{font-size:10px;color:#9ca3af}

/* Filtros */
.ssma-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;box-shadow:var(--shadow);align-items:center}
.ssma-search{display:flex;align-items:center;gap:6px;flex:1;min-width:160px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 10px;height:30px;background:var(--bg)}
.ssma-search input{border:none;background:none;outline:none;font-family:var(--font);font-size:11px;width:100%;color:#374151}
.ssma-search i{font-size:14px;color:#9ca3af;flex-shrink:0}

/* Chips de filtros ativos */
.ssma-active-filters{display:flex;flex-wrap:wrap;gap:6px;padding:0 0 10px;min-height:0}
.ssma-active-filters:empty{display:none}
.ssma-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;background:#fef3c7;border:1px solid #fbbf24;border-radius:10px;font-size:10px;font-weight:600;color:#92400e}
.ssma-chip button{background:none;border:none;cursor:pointer;color:#92400e;font-size:13px;line-height:1;padding:0 0 0 2px}

/* DD */
.ssma-dd{position:relative}
.ssma-dd-btn{height:30px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;white-space:nowrap;transition:border-color 120ms}
.ssma-dd-btn:hover{border-color:#9ca3af}
.ssma-dd-btn.ativo{border-color:var(--yellow);background:#fffbeb;color:#92400e}
.ssma-dd-btn i{font-size:13px;color:#6b7280}
.ssma-dd-btn .arr{font-size:11px;margin-left:auto;transition:transform 200ms}
.ssma-dd-btn.open .arr{transform:rotate(180deg)}
.ssma-dd-panel{position:absolute;top:calc(100% + 4px);left:0;min-width:200px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);z-index:300;display:none;max-height:280px;overflow-y:auto}
.ssma-dd-panel.show{display:block}
.ssma-dd-actions{display:flex;gap:6px;padding:6px 8px;border-bottom:1px solid var(--border)}
.ssma-dd-action-btn{flex:1;height:24px;font-size:10px;font-family:var(--font);font-weight:600;border-radius:var(--radius-sm);border:1px solid var(--border);cursor:pointer}
.ssma-dd-action-btn.primary{background:var(--yellow);color:var(--dark1);border-color:var(--yellow-dk)}
.ssma-dd-action-btn.secondary{background:var(--bg);color:#6b7280}
.ssma-dd-item{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:11px;font-weight:500;color:#374151;cursor:pointer}
.ssma-dd-item:hover{background:var(--bg)}
.ssma-dd-item input[type=checkbox]{accent-color:var(--yellow)}

/* Range */
.ssma-range-wrap{display:flex;flex-direction:column;gap:2px;min-width:150px}
.ssma-range-lbl{font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.ssma-range-row{display:flex;align-items:center;gap:6px}
.ssma-range-row input[type=range]{flex:1;accent-color:var(--yellow)}
.ssma-range-val{font-size:10px;color:#374151;min-width:55px;text-align:right}

/* Tabela */
.ssma-table-wrap{overflow-x:auto;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
.ssma-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
.ssma-table th{text-align:left;padding:8px 12px;background:var(--bg);color:#6b7280;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;overflow:hidden}
.ssma-table td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:middle;overflow:hidden}
.ssma-table tbody tr:hover td{background:#fafafa;cursor:pointer}
.ssma-table tbody tr:last-child td{border-bottom:none}

/* Desc — quebra linha mas só quando necessário */
.ssma-desc{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.45;word-break:break-word}

.ssma-tfoot{padding:8px 14px;font-size:11px;color:#9ca3af;background:var(--bg);border-top:1px solid var(--border);border-radius:0 0 var(--radius) var(--radius)}
.ssma-tfoot span{color:#374151}

.prazo-r{color:#dc2626;font-size:11px;font-weight:600;white-space:nowrap}
.prazo-a{color:#d97706;font-size:11px;font-weight:600;white-space:nowrap}
.prazo-g{color:#16a34a;font-size:11px;font-weight:600;white-space:nowrap}

.sb-alto  {background:#fee2e2;color:#991b1b;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-medio {background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-baixo {background:#dcfce7;color:#14532d;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-capex {background:#dbeafe;color:#1e3a8a;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-opex  {background:#ede9fe;color:#4c1d95;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-docgov{background:#f3f4f6;color:#374151;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-doc   {background:#e0f2fe;color:#0c4a6e;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-gov   {background:#fdf4ff;color:#581c87;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;display:inline-block;white-space:nowrap}
.sb-none  {color:#9ca3af;font-size:11px}

/* Modal */
.ssma-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:500;display:flex;align-items:flex-start;justify-content:center;padding-top:48px;overflow-y:auto}
.ssma-modal{background:var(--card-bg);border-radius:var(--radius);width:640px;max-width:96vw;box-shadow:0 8px 32px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden;max-height:calc(100vh - 80px);margin-bottom:20px}
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
.ssma-select{width:100%;height:30px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;color:#374151;padding:0 8px;cursor:pointer}
.classif-display{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px}
.classif-nota{font-size:9px;color:#9ca3af}

/* Popup tabs inline */
.ssma-ptable{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
.ssma-ptable th{text-align:left;padding:5px 6px;color:#6b7280;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);white-space:nowrap}
.ssma-ptable td{padding:6px 6px;border-bottom:1px solid var(--border);vertical-align:middle}
.ssma-ptable tr:last-child td{border-bottom:none}

/* Inputs na tabela — FIX do problema de digitação */
.ssma-cell-input{
  border:1px solid var(--border);border-radius:4px;padding:4px 6px;
  font-size:11px;background:var(--bg);font-family:var(--font);color:#374151;
  width:100%;box-sizing:border-box;
  /* IMPORTANTE: evita perda de foco */
  -webkit-user-select:text;user-select:text;
}
.ssma-cell-input:focus{outline:2px solid var(--yellow);outline-offset:-1px;border-color:transparent}
.ssma-cell-select{border:1px solid var(--border);border-radius:4px;padding:4px 4px;font-size:10px;background:var(--bg);font-family:var(--font);color:#374151;width:100%}
.ssma-cell-del{background:none;border:none;cursor:pointer;color:#9ca3af;font-size:15px;line-height:1;padding:2px 4px}
.ssma-cell-del:hover{color:#dc2626}
.ssma-add-row{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1px dashed var(--border);border-radius:var(--radius-sm);font-size:11px;color:#6b7280;cursor:pointer;background:none;font-family:var(--font);margin-top:4px}
.ssma-add-row:hover{border-color:#9ca3af;color:#374151}
.ssma-check-row{display:flex;align-items:center;gap:5px;font-size:10px;color:#6b7280;margin-top:3px;white-space:nowrap}
.ssma-check-row input{accent-color:var(--yellow);flex-shrink:0}
.ssma-mod-list{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.ssma-mod-pill{font-size:10px;padding:2px 9px;border:1px solid var(--border);border-radius:10px;color:#374151;background:var(--bg)}
.ssma-mod-link{font-size:10px;padding:2px 9px;border:1px dashed var(--border);border-radius:10px;color:#9ca3af;background:none;cursor:pointer;font-family:var(--font);display:inline-flex;align-items:center;gap:3px}
.ssma-save-btn{padding:6px 16px;border:none;border-radius:var(--radius-sm);background:var(--yellow);color:var(--dark1);font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer}
.ssma-save-btn:hover{background:var(--yellow-dk)}
.ssma-subtotal-row{margin-top:12px;text-align:right;font-size:13px;font-weight:700;color:#111}
.ssma-subtotal-row span{font-weight:400;font-size:10px;color:#6b7280;margin-right:5px}

/* HH */
.ssma-hh-table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px}
.ssma-hh-table th{padding:6px 8px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;text-align:left;letter-spacing:.05em}
.ssma-hh-table td{padding:7px 8px;border-bottom:1px solid var(--border)}
.ssma-hh-table tr:last-child td{border-bottom:none}
.ssma-hh-input{border:1px solid var(--border);border-radius:4px;padding:4px 7px;font-size:12px;font-family:var(--font);background:var(--bg);width:100%;box-sizing:border-box}
.ssma-hh-input:focus{outline:2px solid var(--yellow);outline-offset:-1px;border-color:transparent}
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
    ${['responsavel','status','situacao','checklist','risco','classificacao'].map(n=>{
      const icons={responsavel:'ti-user',status:'ti-circle-check',situacao:'ti-clock',checklist:'ti-list',risco:'ti-alert-triangle',classificacao:'ti-tag'};
      const labels={responsavel:'Responsável',status:'Status',situacao:'Situação',checklist:'Checklist',risco:'Risco',classificacao:'Classificação'};
      return `<div class="ssma-dd" id="dd-${n}">
        <button class="ssma-dd-btn" id="ddbtn-${n}" onclick="ssmaToggleDD('${n}')">
          <i class="ti ${icons[n]}"></i><span class="dd-lbl" id="ddlbl-${n}">${labels[n]}</span><i class="ti ti-chevron-down arr"></i>
        </button>
        <div class="ssma-dd-panel" id="ddp-${n}">
          <div class="ssma-dd-actions">
            <button class="ssma-dd-action-btn secondary" onclick="ssmaLimparDD('${n}')">Limpar</button>
            <button class="ssma-dd-action-btn primary" onclick="ssmaAplicarDD('${n}')">Aplicar</button>
          </div>
          <div id="ddl-${n}"></div>
        </div>
      </div>`;
    }).join('')}
    <div class="ssma-range-wrap">
      <div class="ssma-range-lbl"><i class="ti ti-currency-dollar" style="font-size:11px"></i> Valor total</div>
      <div class="ssma-range-row">
        <input type="range" id="ssma-vt-range" min="0" max="200000" step="500" value="200000" oninput="ssmaFiltrarVT()">
        <span class="ssma-range-val" id="ssma-vt-lbl">Todos</span>
      </div>
    </div>
  </div>

  <!-- Chips de filtros ativos -->
  <div class="ssma-active-filters" id="ssma-chips"></div>

  <div class="ssma-table-wrap">
    <table class="ssma-table">
      <colgroup>
        <col style="width:88px">
        <col><!-- descrição — ocupa o espaço restante -->
        <col style="width:96px">
        <col style="width:130px">
        <col style="width:90px">
        <col style="width:66px">
        <col style="width:86px">
        <col style="width:96px">
      </colgroup>
      <thead><tr>
        <th>Código</th>
        <th>O que será feito?</th>
        <th>Prazo</th>
        <th>Responsável</th>
        <th style="text-align:right">Valor total</th>
        <th>Risco</th>
        <th>Classif.</th>
        <th>Reclassif.</th>
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
    renderLista();
  }

  /* ════════════════════════════════════════════
     LISTA
  ════════════════════════════════════════════ */
  function renderLista() {
    const dados = dadosFiltrados();
    const tbody = document.getElementById('ssma-tbody');
    const tfoot = document.getElementById('ssma-tfoot');
    if (!tbody) return;

    const at = dados.filter(p=>p.situacao==='Atrasado').length;
    const av = dados.filter(p=>p.situacao==='A vencer').length;
    const np = dados.filter(p=>p.situacao==='No prazo').length;

    tbody.innerHTML = dados.map(p => {
      const vt = calcValorTotal(p);
      const rc = p.reclassificacao || '';
      let pc='prazo-g', dc='#16a34a';
      if (p.situacao==='Atrasado') { pc='prazo-r'; dc='#dc2626'; }
      if (p.situacao==='A vencer') { pc='prazo-a'; dc='#d97706'; }
      const dot = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dc};margin-right:4px;vertical-align:middle;flex-shrink:0"></span>`;
      return `<tr onclick="ssmaAbrirModal('${esc(p.codigo)}')">
        <td style="font-size:11px;color:#6b7280;font-weight:600;white-space:nowrap">${esc(p.codigo)}</td>
        <td><div class="ssma-desc">${esc(p.descricao)}</div></td>
        <td class="${pc}">${dot}${esc(p.prazo||'—')}</td>
        <td style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.responsavel||'—')}</td>
        <td style="text-align:right;font-size:12px;font-weight:${vt.total>0?600:400};color:${vt.total>0?'#111':'#9ca3af'}">${vt.total>0?fmtBRL(vt.total):'—'}</td>
        <td>${p.risco?`<span class="${RISCO_CLASS(p.resultado)}">${p.risco}</span>`:`<span class="sb-none">—</span>`}</td>
        <td>${p.classificacao?`<span class="${badgeClassif(p.classificacao)}">${esc(p.classificacao)}</span>`:`<span class="sb-none">—</span>`}</td>
        <td>${rc?`<span class="${badgeClassif(rc)}">${esc(rc)}</span>`:`<span class="sb-none">—</span>`}</td>
      </tr>`;
    }).join('');

    if (tfoot) tfoot.innerHTML = `Exibindo <span>${dados.length}</span> de <span>${DB.length}</span> planos &nbsp;·&nbsp;
      <span style="color:#dc2626">${at} atrasados</span> &nbsp;·&nbsp;
      <span style="color:#d97706">${av} a vencer</span> &nbsp;·&nbsp;
      <span style="color:#16a34a">${np} no prazo</span>`;

    renderChips();
  }

  /* ── Chips de filtros ativos ── */
  function renderChips() {
    const el = document.getElementById('ssma-chips');
    if (!el) return;
    const labels = {responsavel:'Responsável',status:'Status',situacao:'Situação',checklist:'Checklist',risco:'Risco',classificacao:'Classificação'};
    let html = '';
    ['responsavel','status','situacao','checklist','risco','classificacao'].forEach(n => {
      if (filtros[n].length) {
        filtros[n].forEach(v => {
          html += `<span class="ssma-chip">${labels[n]}: ${esc(v)} <button onclick="ssmaRemoverChip('${n}','${esc(v)}')" title="Remover">×</button></span>`;
        });
      }
    });
    if (filtros.valorMax < Infinity) {
      html += `<span class="ssma-chip">Valor ≤ ${fmtBRL(filtros.valorMax)} <button onclick="ssmaRemoverChip('valorMax','')" title="Remover">×</button></span>`;
    }
    if (filtros.busca) {
      html += `<span class="ssma-chip">Busca: "${esc(filtros.busca)}" <button onclick="ssmaRemoverChip('busca','')" title="Remover">×</button></span>`;
    }
    el.innerHTML = html;
  }

  window.ssmaRemoverChip = function(campo, val) {
    if (campo === 'valorMax') {
      filtros.valorMax = Infinity;
      const r = document.getElementById('ssma-vt-range');
      const l = document.getElementById('ssma-vt-lbl');
      if (r) r.value = 200000;
      if (l) l.textContent = 'Todos';
    } else if (campo === 'busca') {
      filtros.busca = '';
      const b = document.getElementById('ssma-busca');
      if (b) b.value = '';
    } else {
      filtros[campo] = filtros[campo].filter(x=>x!==val);
      // desmarca checkbox
      document.querySelectorAll(`#ddl-${campo} input[type=checkbox]`).forEach(cb=>{
        if (cb.value===val) cb.checked=false;
      });
      atualizarBotaoDD(campo);
    }
    renderLista();
  };

  /* ── DDs ── */
  function popularDDs() {
    const fixos = {
      situacao:  ['Atrasado','A vencer','No prazo'],
      checklist: ['Aderência','Análise de Acidente','Análise de Quase Acidente','Inspeção de SSMA'],
      risco:     ['Alto','Médio','Baixo'],
    };
    ['situacao','checklist','risco'].forEach(n=>{
      document.getElementById(`ddl-${n}`).innerHTML = fixos[n].map(v=>
        `<label class="ssma-dd-item"><input type="checkbox" value="${esc(v)}" onchange="ssmaAplicarDD('${n}')"> ${esc(v)}</label>`).join('');
    });
    ['responsavel','status','classificacao'].forEach(n=>{
      const campo = n === 'responsavel' ? 'responsavel' : n === 'status' ? 'status' : 'classificacao';
      const vals = [...new Set(DB.map(p=>p[campo]).filter(Boolean))].sort();
      document.getElementById(`ddl-${n}`).innerHTML = vals.map(v=>
        `<label class="ssma-dd-item"><input type="checkbox" value="${esc(v)}" onchange="ssmaAplicarDD('${n}')"> ${esc(v)}</label>`).join('');
    });
  }

  function atualizarBotaoDD(n) {
    const labels = {responsavel:'Responsável',status:'Status',situacao:'Situação',checklist:'Checklist',risco:'Risco',classificacao:'Classificação'};
    const lbl = document.getElementById(`ddlbl-${n}`);
    const btn = document.getElementById(`ddbtn-${n}`);
    const sel = filtros[n] || [];
    if (lbl) lbl.textContent = sel.length ? (sel.join(', ').length>18 ? sel.join(', ').substring(0,18)+'…':sel.join(', ')) : labels[n];
    if (btn) btn.classList.toggle('ativo', sel.length > 0);
  }

  /* ════════════════════════════════════════════
     MODAL DO PLANO
  ════════════════════════════════════════════ */
  window.ssmaAbrirModal = function(codigo) { modalCodigo=codigo; modalTab='geral'; renderModal(); };

  function renderModal() {
    const p = DB.find(d=>d.codigo===modalCodigo);
    if (!p) return;
    const vt = calcValorTotal(p);
    const rc = p.reclassificacao || '';
    const classif = p.classificacao || '';

    let situBadge = p.situacao==='Atrasado'?`<span class="sb-alto">Atrasado</span>`:
      p.situacao==='A vencer'?`<span class="sb-medio">A vencer</span>`:`<span class="sb-baixo">No prazo</span>`;

    let classifHtml = '';
    if (classif && rc && classif!==rc) {
      classifHtml=`<div class="classif-display"><span class="${badgeClassif(classif)}">${esc(classif)}</span><span style="color:#9ca3af">→</span><span class="${badgeClassif(rc)}">${esc(rc)}</span><span class="classif-nota">(alterado)</span></div>`;
    } else {
      const v = rc||classif;
      classifHtml = v ? `<div class="classif-display"><span class="${badgeClassif(v)}">${esc(v)}</span></div>` : `<div class="classif-display"><span class="sb-none">—</span></div>`;
    }

    let bodyHtml = '';
    if (modalTab==='geral') {
      const pc = p.situacao==='Atrasado'?'prazo-r':p.situacao==='A vencer'?'prazo-a':'prazo-g';
      bodyHtml=`
        <div class="ssma-grid2">
          <div><div class="ssma-field-label">Responsável</div><div class="ssma-field-val">${esc(p.responsavel||'—')}</div></div>
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
            <div style="font-size:9px;color:#9ca3af;margin-top:3px">CAPEX · OPEX · DOCUMENTAL · GOVERNANÇA</div>
          </div>
        </div>`;
    } else if (modalTab==='aquisicoes') {
      bodyHtml = renderAqs(p);
    } else if (modalTab==='servicos') {
      bodyHtml = renderSvs(p);
    }

    let ov = document.getElementById('ssma-modal-ov');
    if (!ov) {
      ov=document.createElement('div'); ov.id='ssma-modal-ov'; ov.className='ssma-modal-overlay';
      ov.onclick=e=>{ if(e.target===ov) ssmaFecharModal(); };
      document.body.appendChild(ov);
    }
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

  /* ── Aba Aquisições ── */
  function renderAqs(p) {
    const rows = (p._aquisicoes||[]).map((it,i)=>`<tr>
      <td style="min-width:100px">
        <input class="ssma-cell-input" id="aq-cod-${i}" value="${esc(it.sem_cadastro?'':it.cod_item||'')}"
          ${it.sem_cadastro?'disabled':''} placeholder="Código"
          onchange="ssmaAqSet(${i},'cod_item',this.value)">
        <div class="ssma-check-row">
          <input type="checkbox" id="aq-sc-${i}" ${it.sem_cadastro?'checked':''}
            onchange="ssmaAqCheck(${i},this.checked)">
          <label for="aq-sc-${i}">sem cadastro</label>
        </div>
      </td>
      <td><input class="ssma-cell-input" value="${esc(it.descricao||'')}" placeholder="Descrição"
        onchange="ssmaAqSet(${i},'descricao',this.value)"></td>
      <td style="width:60px"><input class="ssma-cell-input" value="${it.qtd||''}" style="text-align:center"
        placeholder="0" onchange="ssmaAqSet(${i},'qtd',this.value)"></td>
      <td style="width:90px"><input class="ssma-cell-input" value="${it.valor_unit||''}" style="text-align:right"
        placeholder="0,00" onchange="ssmaAqSet(${i},'valor_unit',this.value)"></td>
      <td style="text-align:right;font-weight:600;width:80px">${fmtBRL((parseFloat(it.qtd)||0)*(parseFloat(it.valor_unit)||0))}</td>
      <td style="width:28px"><button class="ssma-cell-del" onclick="ssmaAqRemover(${i})">×</button></td>
    </tr>`).join('');
    const sub = (p._aquisicoes||[]).reduce((s,i)=>s+(parseFloat(i.qtd)||0)*(parseFloat(i.valor_unit)||0),0);
    return `<table class="ssma-ptable">
      <thead><tr>
        <th style="width:110px">Código</th><th>Descrição</th>
        <th style="width:60px">Qtd</th><th style="width:90px">Vl. unit.</th>
        <th style="width:80px;text-align:right">Total</th><th style="width:28px"></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <button class="ssma-add-row" onclick="ssmaAqAdicionar()"><i class="ti ti-plus" style="font-size:12px"></i> Adicionar item</button>
    <div class="ssma-subtotal-row"><span>Subtotal aquisições</span>${fmtBRL(sub)}</div>`;
  }

  /* ── Aba Serviços ── */
  function renderSvs(p) {
    const rows = (p._servicos||[]).map((it,i)=>{
      const opts = MODS.map(m=>`<option value="${esc(m.nome)}" ${it.modalidade===m.nome?'selected':''}>${esc(m.nome)}</option>`).join('');
      const m = MODS.find(m=>m.nome===it.modalidade);
      const taxa = m?parseFloat(m.valor_hh)||0:0;
      return `<tr>
        <td style="width:80px"><input class="ssma-cell-input" value="${esc(it.os||'')}" placeholder="OS"
          onchange="ssmaSvSet(${i},'os',this.value)"></td>
        <td><input class="ssma-cell-input" value="${esc(it.descricao||'')}" placeholder="Descrição"
          onchange="ssmaSvSet(${i},'descricao',this.value)"></td>
        <td style="width:110px"><select class="ssma-cell-select" onchange="ssmaSvSet(${i},'modalidade',this.value)">
          <option value="">—</option>${opts}</select></td>
        <td style="width:60px"><input class="ssma-cell-input" value="${it.hh_prev||''}" style="text-align:center"
          placeholder="0" onchange="ssmaSvSet(${i},'hh_prev',this.value)"></td>
        <td style="width:74px;text-align:right;font-size:10px;color:#6b7280">${taxa?fmtBRL(taxa)+'/h':'—'}</td>
        <td style="width:80px;text-align:right;font-weight:600">${fmtBRL((parseFloat(it.hh_prev)||0)*taxa)}</td>
        <td style="width:28px"><button class="ssma-cell-del" onclick="ssmaSvRemover(${i})">×</button></td>
      </tr>`;
    }).join('');
    const sub = (p._servicos||[]).reduce((s,i)=>{const m=MODS.find(m=>m.nome===i.modalidade);return s+(parseFloat(i.hh_prev)||0)*(m?parseFloat(m.valor_hh)||0:0);},0);
    const pills = MODS.map(m=>`<span class="ssma-mod-pill">${esc(m.nome)} · ${fmtBRL(m.valor_hh)}/h</span>`).join('');
    return `<table class="ssma-ptable">
      <thead><tr>
        <th style="width:80px">OS</th><th>Descrição</th>
        <th style="width:110px">Modalidade</th><th style="width:60px">HH prev.</th>
        <th style="width:74px;text-align:right">R$/h</th><th style="width:80px;text-align:right">Subtotal</th>
        <th style="width:28px"></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <button class="ssma-add-row" onclick="ssmaSvAdicionar()"><i class="ti ti-plus" style="font-size:12px"></i> Adicionar serviço</button>
    <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:9px">
      <div class="ssma-field-label">Modalidades disponíveis</div>
      <div class="ssma-mod-list">${pills}
        <button class="ssma-mod-link" onclick="ssmaFecharModal();ssmaAbrirHH()"><i class="ti ti-external-link" style="font-size:10px"></i> Gerenciar em Configurar HH</button>
      </div>
    </div>
    <div class="ssma-subtotal-row"><span>Subtotal serviços</span>${fmtBRL(sub)}</div>`;
  }

  window.ssmaFecharModal = function() { const ov=document.getElementById('ssma-modal-ov'); if(ov) ov.style.display='none'; renderLista(); };
  window.ssmaMudarTab    = function(tab) { modalTab=tab; renderModal(); };

  window.ssmaAlterarReclassif = async function(val) {
    const p=DB.find(d=>d.codigo===modalCodigo); if(!p) return;
    p.reclassificacao=val;
    await dbUpsert('ssma_manual',[{codigo:modalCodigo,reclassificacao:val,atualizado_em:new Date().toISOString()}],'codigo');
    renderModal();
  };

  /* Aquisições — usa onchange (não oninput) para salvar após sair do campo */
  window.ssmaAqAdicionar = async function() {
    const p=DB.find(d=>d.codigo===modalCodigo);
    const {data}=await getDB().from('ssma_aquisicoes').insert({codigo:modalCodigo,sem_cadastro:false,cod_item:'',descricao:'',qtd:0,valor_unit:0}).select();
    if(data) p._aquisicoes.push(data[0]);
    ssmaMudarTab('aquisicoes');
  };
  window.ssmaAqRemover = async function(i) {
    const p=DB.find(d=>d.codigo===modalCodigo); const item=p._aquisicoes[i];
    if(item?.id) await getDB().from('ssma_aquisicoes').delete().eq('id',item.id);
    p._aquisicoes.splice(i,1); ssmaMudarTab('aquisicoes');
  };
  window.ssmaAqSet = async function(i,campo,val) {
    const p=DB.find(d=>d.codigo===modalCodigo); p._aquisicoes[i][campo]=val;
    const item=p._aquisicoes[i];
    if(item.id) await getDB().from('ssma_aquisicoes').update({[campo]:val}).eq('id',item.id);
    // Atualiza só o total da linha sem re-render completo
    ssmaMudarTab('aquisicoes');
  };
  window.ssmaAqCheck = async function(i,val) {
    const p=DB.find(d=>d.codigo===modalCodigo); p._aquisicoes[i].sem_cadastro=val;
    const item=p._aquisicoes[i];
    if(item.id) await getDB().from('ssma_aquisicoes').update({sem_cadastro:val,cod_item:''}).eq('id',item.id);
    ssmaMudarTab('aquisicoes');
  };

  /* Serviços */
  window.ssmaSvAdicionar = async function() {
    const p=DB.find(d=>d.codigo===modalCodigo);
    const {data}=await getDB().from('ssma_servicos').insert({codigo:modalCodigo,os:'',descricao:'',modalidade:'',hh_prev:0}).select();
    if(data) p._servicos.push(data[0]);
    ssmaMudarTab('servicos');
  };
  window.ssmaSvRemover = async function(i) {
    const p=DB.find(d=>d.codigo===modalCodigo); const item=p._servicos[i];
    if(item?.id) await getDB().from('ssma_servicos').delete().eq('id',item.id);
    p._servicos.splice(i,1); ssmaMudarTab('servicos');
  };
  window.ssmaSvSet = async function(i,campo,val) {
    const p=DB.find(d=>d.codigo===modalCodigo); p._servicos[i][campo]=val;
    const item=p._servicos[i];
    if(item.id) await getDB().from('ssma_servicos').update({[campo]:val}).eq('id',item.id);
    ssmaMudarTab('servicos');
  };

  /* ════════════════════════════════════════════
     CONFIGURAR HH
  ════════════════════════════════════════════ */
  window.ssmaAbrirHH = function() {
    let ov=document.getElementById('ssma-hh-ov');
    if(!ov){ov=document.createElement('div');ov.id='ssma-hh-ov';ov.className='ssma-modal-overlay';ov.onclick=e=>{if(e.target===ov)ssmaFecharHH();};document.body.appendChild(ov);}
    renderHH(ov); ov.style.display='flex';
  };
  function renderHH(ov) {
    const rows=MODS.map((m,i)=>`<tr>
      <td><input class="ssma-hh-input" value="${esc(m.nome)}" placeholder="Modalidade" onchange="ssmaHHSet(${i},'nome',this.value)"></td>
      <td><input class="ssma-hh-input" value="${m.valor_hh}" style="width:100px;text-align:right" onchange="ssmaHHSet(${i},'valor_hh',this.value)"></td>
      <td><button class="ssma-cell-del" onclick="ssmaHHRemover(${i})">×</button></td>
    </tr>`).join('');
    ov.innerHTML=`<div class="ssma-modal" style="max-width:420px">
      <div class="ssma-modal-head">
        <div class="ssma-modal-code">Configurações</div>
        <div class="ssma-modal-title">Modalidades de Serviço — HH Terceiro</div>
        <div class="ssma-modal-meta"><button class="ssma-modal-close" onclick="ssmaFecharHH()">×</button></div>
      </div>
      <div class="ssma-modal-body">
        <p style="font-size:11px;color:#6b7280;margin-bottom:12px">Defina as modalidades e o valor de referência do HH terceirizado. Salve após editar.</p>
        <table class="ssma-hh-table">
          <thead><tr><th>Modalidade</th><th>R$/h</th><th style="width:28px"></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <button class="ssma-add-row" onclick="ssmaHHAdicionar()"><i class="ti ti-plus" style="font-size:12px"></i> Nova modalidade</button>
      </div>
      <div class="ssma-modal-footer" style="justify-content:flex-end">
        <button class="ssma-save-btn" onclick="ssmaHHSalvar()">Salvar</button>
      </div>
    </div>`;
    ov.style.display='flex';
  }
  window.ssmaFecharHH    = function(){const ov=document.getElementById('ssma-hh-ov');if(ov)ov.style.display='none';};
  window.ssmaHHSet       = function(i,c,v){MODS[i][c]=c==='valor_hh'?parseFloat(v)||0:v;};
  window.ssmaHHAdicionar = function(){MODS.push({nome:'',valor_hh:0});renderHH(document.getElementById('ssma-hh-ov'));};
  window.ssmaHHRemover   = async function(i){const m=MODS[i];if(m.id) await getDB().from('ssma_modalidades').delete().eq('id',m.id);MODS.splice(i,1);renderHH(document.getElementById('ssma-hh-ov'));};
  window.ssmaHHSalvar    = async function(){
    const regs=MODS.filter(m=>m.nome).map(m=>({...(m.id?{id:m.id}:{}),nome:m.nome,valor_hh:parseFloat(m.valor_hh)||0,atualizado_em:new Date().toISOString()}));
    const {error}=await dbUpsert('ssma_modalidades',regs,'nome');
    if(error){showToastMod('Erro: '+error.message,'erro');return;}
    const r=await dbSelect('ssma_modalidades',{order:{col:'nome',asc:true}});MODS=r.data||[];
    ssmaFecharHH(); showToastMod('Modalidades salvas','ok');
  };

  /* ════════════════════════════════════════════
     IMPORTAÇÃO
  ════════════════════════════════════════════ */
  window.ssmaImportar = function(){document.getElementById('ssma-file')?.click();};
  window.ssmaOnFile   = function(e){const f=e.target.files[0];if(f){e.target.value='';importarXLSX(f);}};

  /* ════════════════════════════════════════════
     FILTROS
  ════════════════════════════════════════════ */
  window.ssmaFiltrar = function(){
    filtros.busca=document.getElementById('ssma-busca')?.value||'';
    renderLista();
  };
  window.ssmaFiltrarVT = function(){
    const val=parseFloat(document.getElementById('ssma-vt-range')?.value)||200000;
    filtros.valorMax=val>=200000?Infinity:val;
    const lbl=document.getElementById('ssma-vt-lbl');
    if(lbl) lbl.textContent=val>=200000?'Todos':fmtBRL(val);
    renderLista();
  };
  window.ssmaToggleDD = function(n){
    const panel=document.getElementById(`ddp-${n}`);
    const btn=document.getElementById(`ddbtn-${n}`);
    const isOpen=panel?.classList.contains('show');
    document.querySelectorAll('.ssma-dd-panel.show').forEach(p=>p.classList.remove('show'));
    document.querySelectorAll('.ssma-dd-btn.open').forEach(b=>b.classList.remove('open'));
    if(!isOpen){panel?.classList.add('show');btn?.classList.add('open');}
  };
  window.ssmaLimparDD = function(n){
    document.querySelectorAll(`#ddl-${n} input[type=checkbox]`).forEach(cb=>cb.checked=false);
    filtros[n]=[];
    atualizarBotaoDD(n);
    renderLista();
  };
  window.ssmaAplicarDD = function(n){
    filtros[n]=[...document.querySelectorAll(`#ddl-${n} input[type=checkbox]:checked`)].map(cb=>cb.value);
    document.getElementById(`ddp-${n}`)?.classList.remove('show');
    document.getElementById(`ddbtn-${n}`)?.classList.remove('open');
    atualizarBotaoDD(n);
    renderLista();
  };

  function atualizarTimestamp(){
    const el=document.getElementById('ssma-ts');
    const ts=localStorage.getItem('man360_ssma_ultima_importacao');
    if(el) el.textContent=ts?`Última importação: ${ts}`:'Nenhuma importação';
  }

  function showToastMod(msg,tipo){
    if(window.showToast){window.showToast(msg,tipo);return;}
    const t=document.getElementById('toast');if(!t)return;
    t.className=tipo||'info';
    document.getElementById('toast-icon').className='ti '+(tipo==='ok'?'ti-check':tipo==='erro'?'ti-alert-circle':'ti-info-circle');
    document.getElementById('toast-msg').textContent=msg;
    t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500);
  }

  /* ════════════════════════════════════════════
     REGISTRO
  ════════════════════════════════════════════ */
  window.Modulos=window.Modulos||{};
  window.Modulos['planos-ssma']={ async init(container){ await render(container); } };
})();
