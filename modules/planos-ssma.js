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
    risco:[], reclassificacao:[], composicao:[], modalidadeSv:[],
    valorMin:null, valorMax:null,
    ocultarConcluidos: true,
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
    const [rP,rM,rA,rS,rMods,rRS] = await Promise.all([
      dbSelect('ssma_planos'),
      dbSelect('ssma_manual'),
      dbSelect('ssma_aquisicoes'),
      dbSelect('ssma_servicos'),
      dbSelect('ssma_modalidades', {order:{col:'nome',asc:true}}),
      dbSelect('ssma_responsavel_setor'),
    ]);
    window._ssmaRespSetor = {};
    (rRS.data||[]).forEach(x => { window._ssmaRespSetor[x.responsavel] = x.setor; });
    if (!window._ssmaGrafSetores) window._ssmaGrafSetores = [];

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
    // Tombamento automático
    const codigosImportados = new Set(registros.map(r => r.codigo));
    const db2 = getDB();
    const { data: ativos } = await db2.from('ssma_planos').select('codigo')
      .not('status','ilike','%conclu%').not('status','ilike','%cancel%');
    const tombados = (ativos||[]).filter(p => !codigosImportados.has(p.codigo));
    if (tombados.length > 0) {
      const dataHoje = new Date().toISOString().slice(0,10);
      await db2.from('ssma_planos').update({
        status:'Concluído (auto)', situacao:'Concluído',
        data_conclusao:dataHoje, atualizado_em:new Date().toISOString(),
      }).in('codigo', tombados.map(p=>p.codigo));
      window._ssma_tombados = tombados.map(p=>p.codigo);
    } else { window._ssma_tombados = []; }
    await finalizarImportacao(count,'Planilha 1', tombados.length);
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

  async function finalizarImportacao(count, label, qtdTombados) {
    localStorage.setItem('man360_ssma_ultima_importacao', new Date().toLocaleString('pt-BR'));
    await carregarTudo();
    popularDDs();
    renderGraficos();
    renderLista();
    atualizarTimestamp();
    showToastMod(`${label} importada — ${count} registros`,'ok');
    if (qtdTombados > 0) setTimeout(() => ssmaExibirResumoTombamento(qtdTombados), 600);
  }

  /* ══ Filtros ════════════════════════════════════════════════ */
  function dadosFiltrados() {
    let dados = DB.filter(p => {
      if (filtros.ocultarConcluidos) {
        const st = (p.status||'').toLowerCase();
        if (st.includes('conclu') || st.includes('cancel')) return false;
      }
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
      if (filtros.reclassificacao && filtros.reclassificacao.length) {
        const hasSem = filtros.reclassificacao.includes('__sem__');
        const outros = filtros.reclassificacao.filter(x=>x!=='__sem__');
        const pRec = p.reclassificacao||'';
        const matchSem = hasSem && !pRec;
        const matchVal = outros.length > 0 && outros.includes(pRec);
        if (!matchSem && !matchVal) return false;
      }
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
      const RISCO_ORD = {'Baixo':1,'Médio':2,'Alto':3};
      dados = [...dados].sort((a,b) => {
        let va, vb;
        if (sortCol === 'vt') {
          // Numérico
          va = calcValorTotal(a).total;
          vb = calcValorTotal(b).total;
        } else if (sortCol === 'risco') {
          // Baixo → Médio → Alto
          va = RISCO_ORD[a.risco] || 0;
          vb = RISCO_ORD[b.risco] || 0;
        } else if (sortCol === 'prazo') {
          // Data real dd/mm/yyyy → timestamp
          const toTs = s => {
            if (!s) return 0;
            const p = s.split('/');
            if (p.length !== 3) return 0;
            return new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime() || 0;
          };
          va = toTs(a.prazo);
          vb = toTs(b.prazo);
        } else {
          // Alfabético
          va = String(a[sortCol]||'').toLowerCase();
          vb = String(b[sortCol]||'').toLowerCase();
        }
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
.ssma-last-import{font-size:10px;color:#6b7280}
.ssma-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;box-shadow:var(--shadow);align-items:flex-end}
.ssma-search{display:flex;align-items:center;gap:6px;flex:1;min-width:160px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 10px;height:30px;background:var(--bg)}
.ssma-search input{border:none;background:none;outline:none;font-family:var(--font);font-size:11px;width:100%;color:#374151}
.ssma-search i{font-size:14px;color:#9ca3af;flex-shrink:0}
.ssma-dd{position:relative}
.ssma-dd-btn{height:30px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:6px;color:#374151;white-space:nowrap;transition:border-color 120ms}
.ssma-dd-btn:hover{border-color:#9ca3af}
.ssma-dd-btn.ativo{border-color:var(--yellow);background:#fffbeb}
.ssma-dd-btn i{font-size:13px;color:#4b5563}
.ssma-dd-btn .arr{font-size:10px;margin-left:4px;transition:transform 200ms}
.ssma-dd-btn.open .arr{transform:rotate(180deg)}
.dd-badge{background:var(--yellow);color:var(--dark1);border-radius:10px;font-size:9px;font-weight:700;padding:1px 5px;margin-left:2px}
.ssma-dd-panel{position:absolute;top:calc(100% + 4px);left:0;min-width:210px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);z-index:400;display:none;max-height:280px;overflow-y:auto}
.ssma-dd-panel.show{display:block}
.ssma-dd-item{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:11px;font-weight:500;color:#374151;cursor:pointer;user-select:none}
.ssma-dd-item:hover{background:var(--bg)}
.ssma-dd-item input[type=checkbox]{accent-color:var(--yellow);flex-shrink:0;pointer-events:none}
.ssma-val-wrap{display:flex;flex-direction:column;gap:3px}
.ssma-val-lbl{font-size:10px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
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
.ssma-legenda{display:flex;align-items:center;gap:16px;font-size:10px;color:#374151;padding:0 2px 8px;flex-wrap:wrap}
.ssma-legenda-item{display:flex;align-items:center;gap:5px}
.trat-dot{display:inline-block;width:7px;height:7px;border-radius:50%;flex-shrink:0}
.trat-green{background:#16a34a}
.trat-red{background:#dc2626}
.trat-gray{background:#d1d5db}
.ssma-table-wrap{overflow-x:auto;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
.ssma-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:auto}
.ssma-table th{text-align:left;padding:8px 10px;background:var(--bg);color:#4b5563;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;cursor:pointer;user-select:none}
.ssma-table th:hover{color:#374151}
.ssma-table th .sico{font-size:10px;margin-left:3px;opacity:.3}
.ssma-table th.sorted .sico{opacity:1;color:var(--yellow)}
.ssma-table td{padding:10px 10px;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap}
.ssma-table td.desc-td{white-space:normal;min-width:180px}
.ssma-table tbody tr:hover td{background:#fafafa;cursor:pointer}
.ssma-table tbody tr:last-child td{border-bottom:none}
.ssma-desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.45;word-break:break-word;white-space:normal}
.ssma-tfoot{padding:8px 14px;font-size:11px;color:#6b7280;background:var(--bg);border-top:1px solid var(--border);border-radius:0 0 var(--radius) var(--radius)}
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
.ssma-modal-code{font-size:10px;color:#4b5563;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
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
.ssma-field-label{font-size:10px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.ssma-field-val{font-size:12px;color:#111827}
.ssma-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.ssma-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px}
.ssma-grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px}
.ssma-select{width:100%;height:30px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;color:#374151;padding:0 8px;cursor:pointer}
.classif-display{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px}
.classif-nota{font-size:9px;color:#9ca3af}
.ssma-itab{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
.ssma-itab th{text-align:left;padding:5px 7px;color:#4b5563;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);white-space:nowrap}
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
.ssma-hh-table th{padding:6px 8px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;color:#4b5563;text-align:left}
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
      <button class="topbar-btn" id="ssma-btn-concluidos" onclick="ssmaToggleConcluidos()" title="Exibir planos concluídos">
        <i class="ti ti-circle-check"></i><span>Ver concluídos</span>
      </button>
      <button class="topbar-btn" onclick="ssmaAbrirMapaSetores()"><i class="ti ti-map-pin"></i><span>Resp. → Setor</span></button>
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
      {n:'reclassificacao',icon:'ti-tag',          label:'Reclassificação'},
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
  <!-- Filtro de setor dos gráficos — separado para não ser destruído no re-render -->
  <div id="ssma-graf-filtro-wrap" style="margin-bottom:10px"></div>
  <!-- Container dos gráficos -->
  <div id="ssma-graficos-area">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <div class="ssma-grafico-card" id="graf-card-vt">
        <div class="ssma-grafico-head"><div class="ssma-grafico-title">Valores por Classificação de Investimento <span style="font-weight:400;font-size:9px;color:#6b7280">(atrasados)</span></div></div>
        <div class="ssma-canvas-wrap"><canvas id="graf-vt"></canvas></div>
      </div>
      <div class="ssma-grafico-card" id="graf-card-qt">
        <div class="ssma-grafico-head"><div class="ssma-grafico-title">Planos de Ação por Classificação de Investimento <span style="font-weight:400;font-size:9px;color:#6b7280">(atrasados)</span></div></div>
        <div class="ssma-canvas-wrap"><canvas id="graf-qt"></canvas></div>
      </div>
      <div class="ssma-grafico-card" id="graf-card-dual">
        <div class="ssma-grafico-head"><div class="ssma-grafico-title">Valor × Quantidade por Classificação de Investimento <span style="font-weight:400;font-size:9px;color:#6b7280">(atrasados · com valor)</span></div></div>
        <div class="ssma-canvas-wrap" style="height:240px"><canvas id="graf-dual"></canvas></div>
      </div>
      <div class="ssma-grafico-card" id="graf-card-tabela">
        <div class="ssma-grafico-head"><div class="ssma-grafico-title">Valor por Setor e Classificação <span style="font-weight:400;font-size:9px;color:#6b7280">(atrasados · com valor)</span></div></div>
        <div id="graf-tabela-wrap" style="overflow-x:auto;max-height:260px;overflow-y:auto"></div>
      </div>
    </div>
  </div>

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
    ['responsavel','status'].forEach(n => {
      const vals = [...new Set(DB.map(p=>p[n]).filter(Boolean))].sort();
      document.getElementById(`ddl-${n}`).innerHTML = vals.map(v =>
        `<label class="ssma-dd-item" onclick="ssmaToggleChk('${n}','${esc(v)}',event)"><input type="checkbox" id="chk-${n}-${esc(v)}" value="${esc(v)}"> ${esc(v)}</label>`
      ).join('');
    });
    // Reclassificação — valores únicos + opção especial "Sem reclassificação"
    {
      const vals = [...new Set(DB.map(p=>p.reclassificacao).filter(Boolean))].sort();
      const semOpt = `<label class="ssma-dd-item" onclick="ssmaToggleChk('reclassificacao','__sem__',event)"><input type="checkbox" id="chk-reclassificacao-__sem__" value="__sem__"> <em>Sem reclassificação</em></label>`;
      document.getElementById('ddl-reclassificacao').innerHTML = semOpt + vals.map(v =>
        `<label class="ssma-dd-item" onclick="ssmaToggleChk('reclassificacao','${esc(v)}',event)"><input type="checkbox" id="chk-reclassificacao-${esc(v)}" value="${esc(v)}"> ${esc(v)}</label>`
      ).join('');
    }
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
  function renderChips() {
    const el = document.getElementById('ssma-chips'); if(!el) return;
    const labels={responsavel:'Responsável',status:'Status',situacao:'Situação',checklist:'Checklist',risco:'Risco',reclassificacao:'Reclassificação',composicao:'Composição',modalidadeSv:'Modalidade'};
    let html='';
    ['responsavel','status','situacao','checklist','risco','reclassificacao','composicao','modalidadeSv'].forEach(n=>{
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
  function atualizarTimestamp(){
    const el=document.getElementById('ssma-ts');
    const ts=localStorage.getItem('man360_ssma_ultima_importacao');
    if(el) el.textContent=ts?`Última importação: ${ts}`:'Nenhuma importação';
  }

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
        <td style="font-size:11px;color:#374151;font-weight:600">${dot}${esc(p.codigo)}</td>
        <td class="desc-td"><div class="ssma-desc">${esc(p.descricao)}</div></td>
        <td class="${pc}">${esc(p.prazo||'—')}</td>
        <td style="font-size:11px;color:#374151">${esc(p.responsavel||'—')}</td>
        <td style="text-align:right;font-size:12px;font-weight:${vt.total>0?600:400};color:${vt.total>0?'#111':'#9ca3af'}">${vt.total>0?fmtBRL(vt.total):'—'}</td>
        <td>${p.risco?`<span class="${RISCO_CLASS(p.resultado)}">${p.risco}</span>`:`<span class="sb-none">—</span>`}</td>
        <td>${p.classificacao?`<span class="${badgeClassif(p.classificacao)}">${esc(p.classificacao)}</span>`:`<span class="sb-none">—</span>`}</td>
        <td>${rc?`<span class="${badgeClassif(rc)}">${esc(rc)}</span>`:`<span class="sb-none">—</span>`}</td>
      </tr>`;
    }).join('');

    const concluidos = DB.filter(p=>(p.status||'').toLowerCase().includes('conclu')).length;
    const totalBase  = filtros.ocultarConcluidos ? DB.length - concluidos : DB.length;
    if (tfoot) tfoot.innerHTML=`Exibindo <span>${dados.length}</span> de <span>${totalBase}</span> planos
      ${concluidos>0?`&nbsp;·&nbsp;<span style="color:#9ca3af">${concluidos} concluídos ${filtros.ocultarConcluidos?'(ocultos)':''}</span>`:''} &nbsp;·&nbsp;
      <span style="color:#dc2626">${at} atrasados</span> &nbsp;·&nbsp;
      <span style="color:#d97706">${av} a vencer</span> &nbsp;·&nbsp;
      <span style="color:#16a34a">${np} no prazo</span>`;

    renderChips();
  }

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

  function showToastMod(msg,tipo){
    if(window.showToast){ window.showToast(msg,tipo); return; }
    const t=document.getElementById('toast'); if(!t) return;
    t.className=tipo||'info';
    document.getElementById('toast-icon').className='ti '+(tipo==='ok'?'ti-check':tipo==='erro'?'ti-alert-circle':'ti-info-circle');
    document.getElementById('toast-msg').textContent=msg;
    t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3500);
  }

  function renderGraficos() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    // Base: atrasados excluindo concluídos e cancelados
    const atrasados = DB.filter(p => {
      const st = (p.status||'').toLowerCase();
      if (st.includes('conclu') || st.includes('cancel')) return false;
      if (!p.prazo) return false;
      const pts = p.prazo.split('/'); if (pts.length!==3) return false;
      const d = new Date(`${pts[2]}-${pts[1]}-${pts[0]}T12:00:00`);
      return !isNaN(d) && (d-hoje)/86400000 < 0;
    });

    const setoresSel = window._ssmaGrafSetores || [];

    // ── Filtro de setor por botões ──────────────────────────────────────
    const todosSetores = [...new Set(
      Object.values(window._ssmaRespSetor||{}).filter(Boolean)
    )].sort();

    const wrapFiltro = document.getElementById('ssma-graf-filtro-wrap');
    // Salva lista de setores globalmente para a função de toggle
    window._ssmaGrafTodosSetores = todosSetores;

    if (wrapFiltro) {
      if (!todosSetores.length) {
        wrapFiltro.innerHTML = '';
      } else {
        const btns = todosSetores.map(function(s, i) {
          const ativo = setoresSel.length === 0 || setoresSel.includes(s);
          return '<button id="gfbtn-' + i + '" onclick="ssmaGrafToggle(' + i + ')" style="'
            + 'height:26px;padding:0 10px;font-size:11px;font-family:var(--font);font-weight:600;'
            + 'border-radius:var(--radius-sm);cursor:pointer;white-space:nowrap;margin:2px;border:1px solid '
            + (ativo ? 'var(--yellow);background:var(--yellow);color:var(--dark1)' : 'var(--border);background:var(--bg);color:#6b7280')
            + '">' + s + '</button>';
        }).join('');
        wrapFiltro.innerHTML = '<div class="ssma-grafico-card" style="padding:10px 14px">'
          + '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">'
          + '<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-right:6px;white-space:nowrap">Setor:</span>'
          + btns
          + '<button onclick="window._ssmaGrafSetores=[];renderGraficos();" style="'
          + 'height:26px;padding:0 10px;font-size:10px;font-family:var(--font);font-weight:600;'
          + 'border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg);'
          + 'color:#374151;cursor:pointer;margin:2px;margin-left:8px">Todos</button>'
          + '</div></div>';
      }
    }    // ────────────────────────────────────────────────────────────────────

    // Aviso se nenhum setor selecionado
    const nenhumSelecionado = false;

    const dadosGraf = setoresSel.length > 0
      ? atrasados.filter(p => {
          const s = (window._ssmaRespSetor||{})[p.responsavel];
          return s && setoresSel.includes(s);
        })
      : atrasados;

    // Agrupa por classificação efetiva (rec > classif), excluindo pendentes e sem classif
    const grupos = {};
    dadosGraf.forEach(p => {
      const rec = (p.reclassificacao||'').trim();
      const cl  = (p.classificacao||'').trim();
      const key = rec || cl;
      if (!key) return; // sem classificação — não entra
      if (key === 'PENDENTE CLASSIF' || key === 'Não classificado') return;
      if (!grupos[key]) grupos[key] = {Alto:0,Médio:0,Baixo:0,total:0,vt:0};
      const risco = p.risco||'Sem risco';
      if (grupos[key][risco]!==undefined) grupos[key][risco]++; else grupos[key][risco]=1;
      grupos[key].total++;
      grupos[key].vt += calcValorTotal(p).total;
    });

    // Ordena por valor decrescente (gráficos 1 e 3) e por quantidade (gráfico 2)
    const entriesByVT = Object.entries(grupos).filter(([,g])=>g.vt>0).sort((a,b)=>b[1].vt-a[1].vt);
    const entriesByQt = Object.entries(grupos).filter(([,g])=>g.total>0).sort((a,b)=>b[1].total-a[1].total);

    const labelsVT  = entriesByVT.map(e=>e[0]);
    const vtVals    = entriesByVT.map(e=>e[1].vt);
    const vtTotal   = vtVals.reduce((a,b)=>a+b,0);
    const vtCumPct  = vtVals.map((v,i)=>vtVals.slice(0,i+1).reduce((a,b)=>a+b,0)/(vtTotal||1)*100);

    const labelsQT  = entriesByQt.map(e=>e[0]);
    const totais    = entriesByQt.map(e=>e[1].total);
    const qtTotal   = totais.reduce((a,b)=>a+b,0);
    const cumPct    = totais.map((v,i)=>totais.slice(0,i+1).reduce((a,b)=>a+b,0)/(qtTotal||1)*100);

    const labelsD3  = entriesByVT.map(e=>e[0]);
    const vtD3      = entriesByVT.map(e=>e[1].vt);
    const qtD3      = entriesByVT.map(e=>e[1].total);


    // Mensagem se nenhum setor selecionado
    if (nenhumSelecionado) {
      ['graf-vt','graf-qt','graf-dual'].forEach(id=>{
        _grafMensagem(id, '__ch_'+id.replace('-',''), 500, 220, 'Selecione pelo menos um setor para exibir');
      });
      document.getElementById('graf-tabela-wrap').innerHTML =
        '<div style="padding:32px;text-align:center;color:#9ca3af;font-size:12px">Selecione pelo menos um setor para exibir</div>';
      return;
    }

    // Gráfico 1: Valores
    if (vtTotal===0) _grafMensagem('graf-vt','__ch_grafvt',500,220,'Nenhum valor registrado');
    else desenharParetoSimples('graf-vt','__ch_grafvt',labelsVT,vtVals,vtCumPct,v=>fmtBRL(v),'Valor (R$)');

    // Gráfico 2: Quantidade
    if (!labelsQT.length) _grafMensagem('graf-qt','__ch_grafqt',500,220,'Sem planos atrasados com classificação');
    else desenharParetoEmpilhado('graf-qt','__ch_grafqt',labelsQT,entriesByQt,totais,cumPct);

    // Gráfico 3: Dual
    if (!labelsD3.length) _grafMensagem('graf-dual','__ch_grafdual',500,240,'Sem dados com valor');
    else desenharDual('graf-dual','__ch_grafdual',labelsD3,vtD3,qtD3);

    // Gráfico 4: Tabela
    _renderTabelaSetores(dadosGraf, setoresSel, todosSetores);
  }



  // Funções do dropdown de setor — simples, sem re-render








  function _renderTabelaSetores(dadosGraf, setoresSel, todosSetores) {
    const wrap = document.getElementById('graf-tabela-wrap');
    if (!wrap) return;

    // Determina setores a mostrar
    const setoresMostrar = (setoresSel.length > 0 && setoresSel.length < todosSetores.length)
      ? setoresSel
      : todosSetores;

    if (!setoresMostrar.length) {
      wrap.innerHTML='<div style="padding:20px;text-align:center;color:#9ca3af;font-size:11px">Configure o mapeamento Resp. → Setor</div>';
      return;
    }

    // Acumula valores por setor e classificação
    // Estrutura: { setor: { CAPEX: val, OPEX: val, ... } }
    const tabDados = {};
    setoresMostrar.forEach(s => tabDados[s] = {});

    dadosGraf.forEach(p => {
      const setor = (window._ssmaRespSetor||{})[p.responsavel];
      if (!setor || !setoresMostrar.includes(setor)) return;
      const rec = (p.reclassificacao||'').trim();
      const cl  = (p.classificacao||'').trim();
      const classif = rec || cl;
      if (!classif || classif==='PENDENTE CLASSIF' || classif==='Não classificado') return;
      const vt = calcValorTotal(p).total;
      if (!tabDados[setor][classif]) tabDados[setor][classif] = 0;
      tabDados[setor][classif] += vt;
    });

    // Classificações com valor (colunas)
    const classifs = [...new Set(
      Object.values(tabDados).flatMap(d=>Object.keys(d))
    )].sort();

    if (!classifs.length) {
      wrap.innerHTML='<div style="padding:20px;text-align:center;color:#9ca3af;font-size:11px">Sem valores registrados para os setores selecionados</div>';
      return;
    }

    // Totais por coluna e total geral
    const totCols = {};
    classifs.forEach(cl=>{ totCols[cl]=0; });
    let totGeral = 0;
    setoresMostrar.forEach(s=>{
      classifs.forEach(cl=>{
        const v = tabDados[s][cl]||0;
        totCols[cl]+=v; totGeral+=v;
      });
    });

    // Estado de ordenação da tabela
    if (!window._tabSort) window._tabSort = { col:'setor', dir:1 };

    // Ordena setores
    let linhas = setoresMostrar.map(s=>{
      const total = classifs.reduce((sum,cl)=>sum+(tabDados[s][cl]||0),0);
      return { setor:s, vals:classifs.map(cl=>tabDados[s][cl]||0), total };
    });
    const ts = window._tabSort;
    linhas.sort((a,b)=>{
      let va,vb;
      if (ts.col==='setor') { va=a.setor; vb=b.setor; }
      else if (ts.col==='total') { va=a.total; vb=b.total; }
      else { const i=classifs.indexOf(ts.col); va=a.vals[i]||0; vb=b.vals[i]||0; }
      if (va<vb) return -ts.dir; if (va>vb) return ts.dir; return 0;
    });

    function thSort(col,lbl) {
      const at = ts.col===col;
      const ico = at?(ts.dir===1?'↑':'↓'):'⇅';
      return `<th onclick="tabSort('${esc(col)}')" style="padding:6px 8px;border-bottom:2px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${at?'var(--yellow-dk)':'#4b5563'};cursor:pointer;white-space:nowrap;background:var(--bg);text-align:right">${esc(lbl)} <span style="font-size:9px">${ico}</span></th>`;
    }

    const rows = linhas.map(l=>{
      const pct = totGeral>0?(l.total/totGeral*100).toFixed(1):'0.0';
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;font-weight:600;color:#374151;white-space:nowrap">${esc(l.setor)}</td>
        ${l.vals.map(v=>`<td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;text-align:right;color:${v>0?'#111':'#9ca3af'}">${v>0?fmtBRL(v):'—'}</td>`).join('')}
        <td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;text-align:right;font-weight:600">${fmtBRL(l.total)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;text-align:right;color:#6b7280">${pct}%</td>
      </tr>`;
    }).join('');

    const totRow = `<tr style="background:var(--bg);font-weight:700">
      <td style="padding:6px 8px;font-size:11px;font-weight:700;color:#111;border-top:2px solid var(--border)">TOTAL</td>
      ${classifs.map(cl=>`<td style="padding:6px 8px;font-size:11px;text-align:right;border-top:2px solid var(--border)">${fmtBRL(totCols[cl])}</td>`).join('')}
      <td style="padding:6px 8px;font-size:11px;text-align:right;border-top:2px solid var(--border)">${fmtBRL(totGeral)}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;border-top:2px solid var(--border);color:#6b7280">100%</td>
    </tr>`;

    const pctRow = `<tr style="background:#fffbeb">
      <td style="padding:4px 8px;font-size:10px;color:#6b7280;font-weight:600">% DO TOTAL</td>
      ${classifs.map(cl=>`<td style="padding:4px 8px;font-size:10px;text-align:right;color:#6b7280">${totGeral>0?(totCols[cl]/totGeral*100).toFixed(1)+'%':'—'}</td>`).join('')}
      <td style="padding:4px 8px;font-size:10px;text-align:right;color:#6b7280">100%</td>
      <td style="padding:4px 8px"></td>
    </tr>`;

    wrap.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr>
        <th onclick="tabSort('setor')" style="padding:6px 8px;border-bottom:2px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${ts.col==='setor'?'var(--yellow-dk)':'#4b5563'};cursor:pointer;text-align:left;background:var(--bg);white-space:nowrap">
          Setor <span style="font-size:9px">${ts.col==='setor'?(ts.dir===1?'↑':'↓'):'⇅'}</span>
        </th>
        ${classifs.map(cl=>thSort(cl,cl)).join('')}
        ${thSort('total','Total')}
        <th style="padding:6px 8px;border-bottom:2px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;color:#4b5563;background:var(--bg);text-align:right">% Total</th>
      </tr></thead>
      <tbody>${rows}${totRow}${pctRow}</tbody>
    </table>`;
  }

  window.ssmaGrafToggle = function(idx2) {
    var todos = window._ssmaGrafTodosSetores || [];
    var arr   = (window._ssmaGrafSetores||[]).slice(); // copia
    var s     = todos[idx2];
    if (!s) return;
    // Se estava mostrando tudo (arr vazio), começa filtrando só os outros
    if (arr.length === 0) {
      arr = todos.filter(function(x){ return x !== s; });
    } else {
      var pos = arr.indexOf(s);
      if (pos >= 0) arr.splice(pos, 1); else arr.push(s);
    }
    // Se todos marcados = volta para "todos" (arr vazio)
    if (arr.length === todos.length) arr = [];
    window._ssmaGrafSetores = arr;
    renderGraficos();
  };

  window.tabSort = function(col) {
    if (!window._tabSort) window._tabSort={col:'setor',dir:1};
    if (window._tabSort.col===col) window._tabSort.dir*=-1;
    else { window._tabSort.col=col; window._tabSort.dir=-1; } // começa decrescente (maior primeiro)
    renderGraficos();
  };


  function _grafMensagem(id, key, w, h, msg) {
    const cv=document.getElementById(id); if(!cv) return;
    cv.width=cv.parentElement?.offsetWidth||w; cv.height=h;
    if(window[key]){window[key].destroy();window[key]=null;}
    const ctx=cv.getContext('2d');
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle='#9ca3af'; ctx.font='12px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(msg,cv.width/2,cv.height/2);
  }


  function _regDatalabels() {
    if (window._dlReg) return;
    try { if(window.ChartDataLabels) { Chart.register(ChartDataLabels); window._dlReg=true; } } catch(e){}
  }

  function desenharParetoSimples(canvasId,chartKey,labels,vals,cumPct,fmtTick,yLabel){
    _regDatalabels();
    const canvas=document.getElementById(canvasId);if(!canvas)return;
    canvas.width=canvas.parentElement?.offsetWidth||500;canvas.height=260;
    const ctx=canvas.getContext('2d');
    if(!vals.length){ctx.fillStyle='#9ca3af';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Sem dados',canvas.width/2,canvas.height/2);return;}
    const maxVal=Math.max(...vals);
    if(window[chartKey]){window[chartKey].destroy();window[chartKey]=null;}
    window[chartKey]=new Chart(ctx,{
      data:{labels,datasets:[
        { type:'bar', label:yLabel, data:vals,
          backgroundColor:'rgba(248,193,0,0.88)', borderColor:'#c49000', borderWidth:1,
          yAxisID:'y', order:2,
          datalabels:{
            display:true,
            anchor:'end', align:'end', offset:2, clamp:true,
            color:'#1a1a1a', font:{size:9,weight:'700'},
            backgroundColor:'rgba(255,255,255,0.82)',
            borderRadius:3, padding:{top:1,bottom:1,left:3,right:3},
            formatter: v => fmtTick(v)
          }
        },
        { type:'line', label:'% Acumulado', data:cumPct,
          borderColor:'#C8102E', backgroundColor:'rgba(200,16,46,.1)',
          borderWidth:2, pointRadius:5, pointBackgroundColor:'#C8102E',
          fill:false, tension:.3, yAxisID:'y2', order:1,
          datalabels:{
            display:true,
            anchor:'center', align:'top', offset:6,
            color:'#C8102E', font:{size:9,weight:'700'},
            backgroundColor:'rgba(255,255,255,0.85)',
            borderRadius:3, padding:{top:1,bottom:1,left:3,right:3},
            formatter: v => v.toFixed(0)+'%'
          }
        }
      ]},
      plugins:[window.ChartDataLabels].filter(Boolean),
      options:{
        responsive:false, maintainAspectRatio:false,
        layout:{padding:{top:30, right:10}},
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:true,position:'top',labels:{font:{size:10},color:'#374151',boxWidth:10}},
          tooltip:{enabled:true, callbacks:{
            label(ctx){
              return ctx.dataset.type==='line'
                ? ' Acumulado: '+ctx.raw.toFixed(1)+'%'
                : ' '+yLabel+': '+fmtTick(ctx.raw);
            }
          }},
          datalabels:{}
        },
        scales:{
          x:{ticks:{font:{size:10},color:'#4b5563',maxRotation:35},grid:{display:false}},
          y:{type:'linear',position:'left',min:0,suggestedMax:maxVal*1.5,
            ticks:{font:{size:9},color:'#4b5563',callback:v=>fmtTick(v),maxTicksLimit:6},
            grid:{color:'#e5e7eb'},
            title:{display:true,text:yLabel,font:{size:9},color:'#4b5563'}},
          y2:{type:'linear',position:'right',min:0,max:115,
            ticks:{font:{size:9},color:'#C8102E',callback:v=>v+'%',maxTicksLimit:6},
            grid:{display:false},
            title:{display:true,text:'% Acumulado',font:{size:9},color:'#C8102E'}}
        }
      }
    });
  }

  function desenharParetoEmpilhado(canvasId,chartKey,labels,entries,totais,cumPct){
    _regDatalabels();
    const canvas=document.getElementById(canvasId);if(!canvas)return;
    canvas.width=canvas.parentElement?.offsetWidth||500;canvas.height=260;
    const ctx=canvas.getContext('2d');
    if(!entries.length){ctx.fillStyle='#9ca3af';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Sem dados',canvas.width/2,canvas.height/2);return;}
    const maxVal=Math.max(...totais);
    if(window[chartKey]){window[chartKey].destroy();window[chartKey]=null;}
    const altoData =entries.map(e=>e[1].Alto||0);
    const medioData=entries.map(e=>e[1].Médio||0);
    const baixoData=entries.map(e=>e[1].Baixo||0);
    window[chartKey]=new Chart(ctx,{
      data:{labels,datasets:[
        { type:'bar', label:'Alto',  data:altoData,  backgroundColor:'#dc2626', borderWidth:0, stack:'risco', yAxisID:'y', order:2, datalabels:{display:false} },
        { type:'bar', label:'Médio', data:medioData, backgroundColor:'#f59e0b', borderWidth:0, stack:'risco', yAxisID:'y', order:2, datalabels:{display:false} },
        { type:'bar', label:'Baixo', data:baixoData, backgroundColor:'#16a34a', borderWidth:0, stack:'risco', yAxisID:'y', order:2,
          datalabels:{
            display:true, anchor:'end', align:'end', offset:2, clamp:true,
            color:'#1a1a1a', font:{size:9,weight:'700'},
            backgroundColor:'rgba(255,255,255,0.82)', borderRadius:3,
            padding:{top:1,bottom:1,left:3,right:3},
            formatter:(v,ctx2) => totais[ctx2.dataIndex]>0 ? String(totais[ctx2.dataIndex]) : ''
          }
        },
        { type:'line', label:'% Acumulado', data:cumPct,
          borderColor:'#1d4ed8', backgroundColor:'rgba(29,78,216,.1)',
          borderWidth:2, pointRadius:5, pointBackgroundColor:'#1d4ed8',
          fill:false, tension:.3, yAxisID:'y2', order:1,
          datalabels:{
            display:true, anchor:'center', align:'top', offset:6,
            color:'#1d4ed8', font:{size:9,weight:'700'},
            backgroundColor:'rgba(255,255,255,0.85)', borderRadius:3,
            padding:{top:1,bottom:1,left:3,right:3},
            formatter: v => v.toFixed(0)+'%'
          }
        }
      ]},
      plugins:[window.ChartDataLabels].filter(Boolean),
      options:{
        responsive:false, maintainAspectRatio:false,
        layout:{padding:{top:30, right:10}},
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:true, position:'top',
            labels:{font:{size:10},color:'#374151',boxWidth:10,
              filter(item){ return item.text!=='% Acumulado'; }}},
          tooltip:{enabled:true, callbacks:{
            label(ctx){ if(ctx.dataset.type==='line') return ' Acumulado: '+ctx.raw.toFixed(1)+'%'; return ' '+ctx.dataset.label+': '+ctx.raw; },
            footer(items){ const t=items.filter(i=>i.dataset.type==='bar').reduce((s,i)=>s+i.raw,0); return t>0?'Total: '+t:''; }
          }},
          datalabels:{}
        },
        scales:{
          x:{ticks:{font:{size:10},color:'#4b5563',maxRotation:35},grid:{display:false}},
          y:{type:'linear',position:'left',min:0,suggestedMax:maxVal*1.5,stacked:true,
            ticks:{font:{size:9},color:'#4b5563',maxTicksLimit:6},
            grid:{color:'#e5e7eb'},
            title:{display:true,text:'Planos',font:{size:9},color:'#4b5563'}},
          y2:{type:'linear',position:'right',min:0,max:115,
            ticks:{font:{size:9},color:'#1d4ed8',callback:v=>v+'%',maxTicksLimit:6},
            grid:{display:false},
            title:{display:true,text:'% Acumulado',font:{size:9},color:'#1d4ed8'}}
        }
      }
    });
  }


  function desenharDual(canvasId,chartKey,labels,vtVals,qtVals){
    _regDatalabels();
    const canvas=document.getElementById(canvasId);if(!canvas)return;
    canvas.width=canvas.parentElement?.offsetWidth||500;canvas.height=260;
    const ctx=canvas.getContext('2d');
    if(!labels.length){ctx.fillStyle='#9ca3af';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Sem dados',canvas.width/2,canvas.height/2);return;}
    const maxVT=Math.max(...vtVals), maxQT=Math.max(...qtVals);
    if(window[chartKey]){window[chartKey].destroy();window[chartKey]=null;}
    window[chartKey]=new Chart(ctx,{
      data:{labels,datasets:[
        { type:'bar', label:'Valor (R$)', data:vtVals,
          backgroundColor:'rgba(248,193,0,0.88)', borderColor:'#c49000', borderWidth:1,
          yAxisID:'yVT', order:1,
          datalabels:{
            display:true, anchor:'end', align:'end', offset:2, clamp:true,
            color:'#92400e', font:{size:9,weight:'700'},
            backgroundColor:'rgba(255,255,255,0.82)', borderRadius:3,
            padding:{top:1,bottom:1,left:3,right:3},
            formatter: v => fmtBRL(v)
          }
        },
        { type:'bar', label:'Qtd. Planos', data:qtVals,
          backgroundColor:'rgba(29,78,216,0.8)', borderColor:'#1e3a8a', borderWidth:1,
          yAxisID:'yQT', order:1,
          datalabels:{
            display:true, anchor:'end', align:'end', offset:2, clamp:true,
            color:'#1e3a8a', font:{size:9,weight:'700'},
            backgroundColor:'rgba(255,255,255,0.82)', borderRadius:3,
            padding:{top:1,bottom:1,left:3,right:3},
            formatter: v => String(v)
          }
        }
      ]},
      plugins:[window.ChartDataLabels].filter(Boolean),
      options:{
        responsive:false, maintainAspectRatio:false,
        layout:{padding:{top:30, right:10}},
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:true,position:'top',labels:{font:{size:10},color:'#374151',boxWidth:10}},
          tooltip:{enabled:true, callbacks:{
            label(ctx){ return ctx.dataset.yAxisID==='yVT' ? ' Valor: '+fmtBRL(ctx.raw) : ' Qtd.: '+ctx.raw+' planos'; }
          }},
          datalabels:{}
        },
        scales:{
          x:{ticks:{font:{size:10},color:'#4b5563',maxRotation:35},grid:{display:false}},
          yVT:{type:'linear',position:'left',min:0,suggestedMax:maxVT*1.5,
            ticks:{font:{size:9},color:'#92400e',callback:v=>fmtBRL(v),maxTicksLimit:6},
            grid:{color:'#e5e7eb'},
            title:{display:true,text:'Valor (R$)',font:{size:9},color:'#92400e'}},
          yQT:{type:'linear',position:'right',min:0,suggestedMax:maxQT*1.5,
            ticks:{font:{size:9},color:'#1d4ed8',maxTicksLimit:6},
            grid:{display:false},
            title:{display:true,text:'Qtd. Planos',font:{size:9},color:'#1d4ed8'}}
        }
      }
    });
  }



  /* ══ Filtro de setor — select nativo ══════════════════════ */








  /* ══ Toggle concluídos ═════════════════════════════════════ */
  window.ssmaToggleConcluidos = function() {
    filtros.ocultarConcluidos = !filtros.ocultarConcluidos;
    const btn = document.getElementById('ssma-btn-concluidos');
    if (btn) {
      btn.classList.toggle('ativo', !filtros.ocultarConcluidos);
      btn.querySelector('span').textContent = filtros.ocultarConcluidos ? 'Ver concluídos' : 'Ocultar concluídos';
    }
    renderLista();
  };

  /* ══ Modal resumo tombamento ════════════════════════════════ */
  window.ssmaExibirResumoTombamento = function(qtd) {
    const codigos = (window._ssma_tombados||[]).slice(0,20);
    const extra = (window._ssma_tombados||[]).length>20?`<div style="font-size:10px;color:#9ca3af;padding:4px 0">+${(window._ssma_tombados||[]).length-20} mais…</div>`:'';
    const html=`<div class="ssma-modal-overlay" id="ssma-tomb-ov" onclick="if(event.target===this)document.getElementById('ssma-tomb-ov').remove()" style="z-index:600">
      <div class="ssma-modal" style="max-width:480px">
        <div class="ssma-modal-head">
          <div class="ssma-modal-code">Importação concluída</div>
          <div class="ssma-modal-title"><i class="ti ti-check-circle" style="color:#16a34a;font-size:18px"></i> ${qtd} plano${qtd>1?'s':''} tombado${qtd>1?'s':''} automaticamente</div>
          <div class="ssma-modal-meta" style="margin-top:6px">
            <span style="font-size:11px;color:#6b7280">Não apareceram na nova exportação. Marcados como <strong>Concluído (auto)</strong>.</span>
            <button class="ssma-modal-close" onclick="document.getElementById('ssma-tomb-ov').remove()">×</button>
          </div>
        </div>
        <div class="ssma-modal-body" style="max-height:260px;overflow-y:auto">
          ${codigos.map(cod=>{const p=DB.find(d=>d.codigo===cod);return`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)"><span class="sb-baixo">Concluído</span><span style="font-weight:600;font-size:11px">${esc(cod)}</span><span style="font-size:11px;color:#6b7280;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p?.descricao||'—')}</span></div>`;}).join('')}
          ${extra}
        </div>
        <div class="ssma-modal-footer" style="justify-content:flex-end">
          <button class="ssma-save-btn" onclick="document.getElementById('ssma-tomb-ov').remove()">Fechar</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend',html);
  };

  /* ══ Mapeamento Responsável → Setor ════════════════════════ */
  window.ssmaAbrirMapaSetores = function() {
    let ov=document.getElementById('ssma-rs-ov');
    if(!ov){ov=document.createElement('div');ov.id='ssma-rs-ov';ov.className='ssma-modal-overlay';ov.onclick=e=>{if(e.target===ov)ssmaFecharMapaSetores();};document.body.appendChild(ov);}
    ssmaRenderMapaSetores(ov);ov.style.display='flex';
  };
  window.ssmaFecharMapaSetores=function(){document.getElementById('ssma-rs-ov')?.remove();};
  window.ssmaRenderMapaSetores=function(ov){
    const responsaveis=[...new Set(DB.map(p=>p.responsavel).filter(Boolean))].sort();
    const setoresOpts=[...new Set(['FABRICAÇÃO DE AÇÚCAR','FABRICAÇÃO DE ÁLCOOL','GERAÇÃO/DISTRIBUIÇÃO DE VAPOR','TRATAMENTO DE CALDO','RECEPÇÃO E EXTRAÇÃO','UTILIDADES','MANUTENÇÃO','MANUTENÇÃO ELÉTRICA','MANUTENÇÃO INDUSTRIAL','SSMA','ADMINISTRATIVO','OUTROS',...Object.values(window._ssmaRespSetor||{}).filter(Boolean)])].sort();
    const rows=responsaveis.map((resp)=>{
      const sa=(window._ssmaRespSetor||{})[resp]||'';
      return`<tr><td style="font-size:11px;padding:5px 7px;border-bottom:1px solid var(--border)">${esc(resp)}</td>
        <td style="padding:5px 7px;border-bottom:1px solid var(--border)"><select class="ssma-select" style="height:28px;font-size:11px" onchange="window._ssmaRespSetor['${esc(resp)}']=this.value">
          <option value="">— sem setor —</option>
          ${setoresOpts.map(s=>`<option value="${esc(s)}" ${sa===s?'selected':''}>${esc(s)}</option>`).join('')}
        </select></td></tr>`;
    }).join('');
    ov.innerHTML=`<div class="ssma-modal" style="max-width:500px">
      <div class="ssma-modal-head"><div class="ssma-modal-code">Configuração</div><div class="ssma-modal-title">Responsável → Setor</div>
        <div class="ssma-modal-meta"><span style="font-size:11px;color:#6b7280">Vincule responsáveis a setores para filtrar os gráficos.</span><button class="ssma-modal-close" onclick="ssmaFecharMapaSetores()">×</button></div></div>
      <div class="ssma-modal-body" style="max-height:360px;overflow-y:auto;padding:0">
        <table style="width:100%;border-collapse:collapse"><thead><tr>
          <th style="padding:7px;background:var(--bg);border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;text-align:left">Responsável</th>
          <th style="padding:7px;background:var(--bg);border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;text-align:left">Setor</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="ssma-modal-footer" style="justify-content:flex-end">
        <button class="ssma-cancel-btn" style="padding:6px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:12px;cursor:pointer" onclick="ssmaFecharMapaSetores()">Cancelar</button>
        <button class="ssma-save-btn" onclick="ssmaSalvarMapaSetores()">Salvar</button>
      </div>
    </div>`;
    ov.style.display='flex';
  };
  window.ssmaSalvarMapaSetores=async function(){
    const db=getDB();
    const registros=Object.entries(window._ssmaRespSetor||{}).filter(([,s])=>s).map(([responsavel,setor])=>({responsavel,setor}));
    if(registros.length){await db.from('ssma_responsavel_setor').delete().neq('responsavel','__NONE__');await db.from('ssma_responsavel_setor').insert(registros);}
    ssmaFecharMapaSetores();renderGraficos();showToastMod('Mapeamento salvo','ok');
  };

  /* ══ Registro ═══════════════════════════════════════════════ */
  window.Modulos = window.Modulos || {};
  window.Modulos['planos-ssma'] = { async init(container){ await render(container); } };
})();
