/* ═══════════════════════════════════════════════════════════════
   MÓDULO: Planos de Ação SSMA
   Arquivo: modules/planos-ssma.js
   Registra: window.Modulos['planos-ssma']
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Constantes ── */
  const RISCO_LABEL = r => r >= 15 ? 'Alto' : r >= 5 ? 'Médio' : 'Baixo';
  const RISCO_CLASS = r => r >= 15 ? 'sbadge-alto' : r >= 5 ? 'sbadge-medio' : 'sbadge-baixo';
  const CLASSIF_OPTIONS = ['CAPEX', 'OPEX', 'DOCUMENTAL', 'GOVERNANÇA'];

  function categoriaChecklist(raw) {
    if (!raw) return '';
    const u = raw.trim().toUpperCase();
    if (u.startsWith('ADERÊNCIA') || u.startsWith('ADERENCIA')) return 'Aderência';
    if (u.startsWith('ANÁLISE DE ACIDENTE') || u.startsWith('ANALISE DE ACIDENTE')) return 'Análise de Acidente';
    if (u.startsWith('ANÁLISE DE QUASE') || u.startsWith('ANALISE DE QUASE')) return 'Análise de Quase Acidente';
    if (u.startsWith('INSPEÇÃO') || u.startsWith('INSPECAO')) return 'Inspeção de SSMA';
    return raw;
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
      if (/\d{2}\/\d{2}\/\d{4}/.test(val)) return val;
      const d = new Date(val);
      if (!isNaN(d)) return fmt(d);
      return '';
    }
    if (typeof val === 'number') {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(d)) return fmt(d);
    }
    return '';
  }
  function fmt(d) {
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  /* ── Estado ── */
  let DB       = [];   // planos + dados manuais mesclados (vindo do Supabase)
  let MODS     = [];   // modalidades
  let filtros  = { busca:'', responsavel:[], status:[], situacao:[], checklist:[], risco:[], classificacao:[], valorMax: Infinity };
  let modalCodigo = null;
  let modalTab    = 'geral';

  /* ── Helpers ── */
  function fmtBRL(v) { return (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function badgeClassif(v) {
    if (!v) return 'sbadge-none';
    const u = v.toUpperCase();
    if (u==='CAPEX') return 'sbadge-capex';
    if (u==='OPEX')  return 'sbadge-opex';
    if (u.includes('DOCUMENTAL') && u.includes('GOV')) return 'sbadge-docgov';
    if (u.includes('DOCUMENTAL')) return 'sbadge-doc';
    if (u.includes('GOVERN')) return 'sbadge-gov';
    return 'sbadge-none';
  }

  function calcValorTotal(plano) {
    const aqs = plano._aquisicoes || [];
    const svs = plano._servicos   || [];
    const aq = aqs.reduce((s,i) => s + (parseFloat(i.qtd)||0)*(parseFloat(i.valor_unit)||0), 0);
    const sv = svs.reduce((s,i) => {
      const m = MODS.find(m => m.nome === i.modalidade);
      return s + (parseFloat(i.hh_prev)||0)*(m ? parseFloat(m.valor_hh)||0 : 0);
    }, 0);
    return { aq, sv, total: aq+sv };
  }

  /* ════════════════════════════════════════════
     CARREGAMENTO DE DADOS
  ════════════════════════════════════════════ */
  async function carregarTudo() {
    const [rPlanos, rManual, rAq, rSv, rMods] = await Promise.all([
      dbSelect('ssma_planos'),
      dbSelect('ssma_manual'),
      dbSelect('ssma_aquisicoes'),
      dbSelect('ssma_servicos'),
      dbSelect('ssma_modalidades', { order: { col: 'nome', asc: true } }),
    ]);

    MODS = (rMods.data || []);

    /* Mapa de dados manuais */
    const manualMap = {};
    (rManual.data||[]).forEach(m => manualMap[m.codigo] = m);

    /* Mapa de aquisições por código */
    const aqMap = {};
    (rAq.data||[]).forEach(i => {
      if (!aqMap[i.codigo]) aqMap[i.codigo] = [];
      aqMap[i.codigo].push(i);
    });

    /* Mapa de serviços por código */
    const svMap = {};
    (rSv.data||[]).forEach(i => {
      if (!svMap[i.codigo]) svMap[i.codigo] = [];
      svMap[i.codigo].push(i);
    });

    DB = (rPlanos.data||[]).map(p => ({
      ...p,
      situacao: calcSituacao(p.prazo),
      reclassificacao: manualMap[p.codigo]?.reclassificacao || '',
      _aquisicoes: aqMap[p.codigo] || [],
      _servicos:   svMap[p.codigo] || [],
    }));
  }

  /* ════════════════════════════════════════════
     IMPORTAÇÃO XLSX → SUPABASE
  ════════════════════════════════════════════ */
  async function importarXLSX(arquivo) {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: false });
        const ws1 = wb.Sheets[wb.SheetNames[0]];
        const p1  = XLSX.utils.sheet_to_json(ws1, { defval: '' });

        let p2 = [];
        if (wb.SheetNames.length > 1) {
          const ws2 = wb.Sheets[wb.SheetNames[1]];
          p2 = XLSX.utils.sheet_to_json(ws2, { defval: '' });
        }

        const map2 = {};
        p2.forEach(r => {
          const cod = String(r['Código do plano de ação'] || r['Codigo do plano de acao'] || '').trim();
          if (cod) map2[cod] = r;
        });

        const registros = [];
        p1.forEach(r => {
          const cod = String(r['Código do plano de ação'] || '').trim();
          if (!cod) return;
          const r2 = map2[cod] || {};
          const resultado = parseFloat(r2['Resultado']) || 0;
          const prazo = excelDateToStr(r['Quando será feito?'] || '');
          registros.push({
            codigo:         cod,
            descricao:      String(r['O que será feito?'] || '').trim(),
            status:         String(r['Status'] || '').trim(),
            checklist_raw:  String(r['Checklist'] || r['check list'] || '').trim(),
            checklist_cat:  categoriaChecklist(r['Checklist'] || r['check list'] || ''),
            responsavel:    String(r['Responsável'] || r2['RESPONSÁVEL'] || '').trim(),
            prazo,
            situacao:       calcSituacao(prazo),
            resultado,
            risco:          resultado > 0 ? RISCO_LABEL(resultado) : '',
            classificacao:  String(r2['CLASSIFICAÇÃO'] || r2['CLASSIFICAÇÃO                   DE RISCOS'] || '').trim(),
            atualizado_em:  new Date().toISOString(),
          });
        });

        showToastMod('Salvando ' + registros.length + ' planos…', 'info');
        const { count, error } = await dbUpsert('ssma_planos', registros, 'codigo');
        if (error) { showToastMod('Erro: ' + error.message, 'erro'); return; }

        /* Salva timestamp */
        localStorage.setItem('man360_ssma_ultima_importacao', new Date().toLocaleString('pt-BR'));

        await carregarTudo();
        renderLista();
        popularDDs();
        atualizarTimestamp();
        showToastMod(`Importação concluída — ${count} planos atualizados`, 'ok');
      } catch (err) {
        showToastMod('Erro ao ler planilha: ' + err.message, 'erro');
      }
    };
    reader.readAsBinaryString(arquivo);
  }

  /* ════════════════════════════════════════════
     FILTROS
  ════════════════════════════════════════════ */
  function dadosFiltrados() {
    return DB.filter(p => {
      const vt = calcValorTotal(p).total;
      if (filtros.busca) {
        const b = filtros.busca.toLowerCase();
        if (!p.descricao?.toLowerCase().includes(b) && !p.codigo?.includes(b)) return false;
      }
      if (filtros.responsavel.length && !filtros.responsavel.some(f => p.responsavel?.toLowerCase().includes(f.toLowerCase()))) return false;
      if (filtros.status.length && !filtros.status.includes(p.status)) return false;
      if (filtros.situacao.length && !filtros.situacao.includes(p.situacao)) return false;
      if (filtros.checklist.length && !filtros.checklist.includes(p.checklist_cat)) return false;
      if (filtros.risco.length && !filtros.risco.includes(p.risco)) return false;
      if (filtros.classificacao.length && !filtros.classificacao.includes(p.classificacao)) return false;
      if (vt > filtros.valorMax) return false;
      return true;
    });
  }

  /* ════════════════════════════════════════════
     RENDER PRINCIPAL
  ════════════════════════════════════════════ */
  async function render(container) {
    container.innerHTML = `
<style>
.ssma { font-family:var(--font); color:#1a1a1a; }
.ssma-topbar { display:flex; align-items:center; justify-content:space-between; padding:0 0 14px; flex-wrap:wrap; gap:10px; }
.ssma-title  { font-size:14px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:#374151; display:flex; align-items:center; gap:8px; }
.ssma-title i { font-size:18px; color:var(--yellow); }
.ssma-topbar-right { display:flex; gap:8px; align-items:center; }
.ssma-last-import { font-size:10px; color:#9ca3af; }

.ssma-filters { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; background:var(--card-bg); border:1px solid var(--border); border-radius:var(--radius); padding:10px 14px; box-shadow:var(--shadow); align-items:center; }
.ssma-search { display:flex; align-items:center; gap:6px; flex:1; min-width:160px; border:1px solid var(--border); border-radius:var(--radius-sm); padding:0 10px; height:30px; background:var(--bg); }
.ssma-search input { border:none; background:none; outline:none; font-family:var(--font); font-size:11px; width:100%; color:#374151; }
.ssma-search i { font-size:14px; color:#9ca3af; flex-shrink:0; }

.ssma-dd { position:relative; }
.ssma-dd-btn { height:30px; padding:0 10px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg); font-family:var(--font); font-size:11px; font-weight:500; cursor:pointer; display:flex; align-items:center; gap:6px; color:#374151; white-space:nowrap; }
.ssma-dd-btn:hover { border-color:#9ca3af; }
.ssma-dd-btn i { font-size:13px; color:#6b7280; }
.ssma-dd-btn .arr { font-size:11px; margin-left:auto; transition:transform 200ms; }
.ssma-dd-btn.open .arr { transform:rotate(180deg); }
.ssma-dd-panel { position:absolute; top:calc(100% + 4px); left:0; min-width:190px; background:var(--card-bg); border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow-md); z-index:300; display:none; max-height:260px; overflow-y:auto; }
.ssma-dd-panel.show { display:block; }
.ssma-dd-actions { display:flex; gap:6px; padding:6px 8px; border-bottom:1px solid var(--border); }
.ssma-dd-action-btn { flex:1; height:24px; font-size:10px; font-family:var(--font); font-weight:600; border-radius:var(--radius-sm); border:1px solid var(--border); cursor:pointer; }
.ssma-dd-action-btn.primary { background:var(--yellow); color:var(--dark1); border-color:var(--yellow-dk); }
.ssma-dd-action-btn.secondary { background:var(--bg); color:#6b7280; }
.ssma-dd-item { display:flex; align-items:center; gap:8px; padding:7px 12px; font-size:11px; font-weight:500; color:#374151; cursor:pointer; }
.ssma-dd-item:hover { background:var(--bg); }
.ssma-dd-item input[type=checkbox] { accent-color:var(--yellow); }

.ssma-range-wrap { display:flex; flex-direction:column; gap:2px; min-width:150px; }
.ssma-range-lbl { font-size:10px; color:#9ca3af; font-weight:600; text-transform:uppercase; letter-spacing:.05em; }
.ssma-range-row { display:flex; align-items:center; gap:6px; }
.ssma-range-row input[type=range] { flex:1; accent-color:var(--yellow); }
.ssma-range-val { font-size:10px; color:#374151; min-width:55px; text-align:right; }

.ssma-table-wrap { overflow-x:auto; background:var(--card-bg); border:1px solid var(--border); border-radius:var(--radius); box-shadow:var(--shadow); }
.ssma-table { width:100%; border-collapse:collapse; font-size:12px; }
.ssma-table th { text-align:left; padding:8px 12px; background:var(--bg); color:#6b7280; border-bottom:1px solid var(--border); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; white-space:nowrap; }
.ssma-table td { padding:10px 12px; border-bottom:1px solid var(--border); vertical-align:top; }
.ssma-table tbody tr:hover td { background:#fafafa; cursor:pointer; }
.ssma-table tbody tr:last-child td { border-bottom:none; }
.ssma-desc { max-width:260px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.45; }
.ssma-tfoot { padding:8px 14px; font-size:11px; color:#9ca3af; background:var(--bg); border-top:1px solid var(--border); border-radius:0 0 var(--radius) var(--radius); }
.ssma-tfoot span { color:#374151; }

.prazo-atrasado { color:#dc2626; font-size:11px; font-weight:600; white-space:nowrap; }
.prazo-avencer  { color:#d97706; font-size:11px; font-weight:600; white-space:nowrap; }
.prazo-ok       { color:#16a34a; font-size:11px; font-weight:600; white-space:nowrap; }

.sbadge-alto   { background:#fee2e2; color:#991b1b; padding:2px 7px; border-radius:10px; font-size:10px; font-weight:600; display:inline-block; white-space:nowrap; }
.sbadge-medio  { background:#fef3c7; color:#92400e; padding:2px 7px; border-radius:10px; font-size:10px; font-weight:600; display:inline-block; white-space:nowrap; }
.sbadge-baixo  { background:#dcfce7; color:#14532d; padding:2px 7px; border-radius:10px; font-size:10px; font-weight:600; display:inline-block; white-space:nowrap; }
.sbadge-capex  { background:#dbeafe; color:#1e3a8a; padding:2px 7px; border-radius:10px; font-size:10px; font-weight:600; display:inline-block; white-space:nowrap; }
.sbadge-opex   { background:#ede9fe; color:#4c1d95; padding:2px 7px; border-radius:10px; font-size:10px; font-weight:600; display:inline-block; white-space:nowrap; }
.sbadge-docgov { background:#f3f4f6; color:#374151; padding:2px 7px; border-radius:10px; font-size:10px; font-weight:600; display:inline-block; white-space:nowrap; }
.sbadge-doc    { background:#e0f2fe; color:#0c4a6e; padding:2px 7px; border-radius:10px; font-size:10px; font-weight:600; display:inline-block; white-space:nowrap; }
.sbadge-gov    { background:#fdf4ff; color:#581c87; padding:2px 7px; border-radius:10px; font-size:10px; font-weight:600; display:inline-block; white-space:nowrap; }
.sbadge-none   { color:#9ca3af; font-size:11px; }

/* Modal */
.ssma-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.42); z-index:500; display:flex; align-items:flex-start; justify-content:center; padding-top:48px; overflow-y:auto; }
.ssma-modal { background:var(--card-bg); border-radius:var(--radius); width:640px; max-width:96vw; box-shadow:0 8px 32px rgba(0,0,0,.22); display:flex; flex-direction:column; overflow:hidden; max-height:calc(100vh - 80px); margin-bottom:20px; }
.ssma-modal-head { padding:16px 18px; background:var(--bg); border-bottom:1px solid var(--border); }
.ssma-modal-code { font-size:10px; color:#6b7280; font-weight:700; text-transform:uppercase; letter-spacing:.06em; margin-bottom:3px; }
.ssma-modal-title { font-size:13px; font-weight:600; line-height:1.4; color:#111827; }
.ssma-modal-meta { display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; align-items:center; }
.ssma-modal-close { margin-left:auto; background:none; border:none; cursor:pointer; font-size:20px; color:#6b7280; line-height:1; padding:2px 6px; }
.ssma-modal-close:hover { color:#111; }
.ssma-modal-tabs { display:flex; border-bottom:1px solid var(--border); padding:0 18px; flex-shrink:0; }
.ssma-modal-tab { padding:9px 12px; font-size:12px; color:#6b7280; cursor:pointer; border-bottom:2px solid transparent; white-space:nowrap; font-family:var(--font); background:none; border-top:none; border-left:none; border-right:none; }
.ssma-modal-tab.active { color:#111827; border-bottom-color:var(--yellow); font-weight:600; }
.ssma-modal-body { flex:1; overflow-y:auto; padding:16px 18px; }
.ssma-modal-footer { padding:10px 18px; border-top:1px solid var(--border); background:var(--bg); display:flex; align-items:center; gap:8px; flex-shrink:0; }
.ssma-act-btn { display:flex; align-items:center; gap:5px; padding:5px 11px; border:1px solid var(--border); border-radius:var(--radius-sm); font-size:11px; font-family:var(--font); font-weight:500; color:#374151; cursor:pointer; background:var(--card-bg); }
.ssma-act-btn:hover { background:#f0f0f0; }
.ssma-act-btn i { font-size:13px; }
.ssma-vt-block { margin-left:auto; text-align:right; }
.ssma-vt-main { font-size:15px; font-weight:700; color:var(--dark1); }
.ssma-vt-sub { font-size:10px; color:#6b7280; }

.ssma-field-label { font-size:10px; color:#6b7280; font-weight:700; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
.ssma-field-val { font-size:12px; color:#111827; }
.ssma-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
.ssma-grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:12px; }
.ssma-select { width:100%; height:30px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg); font-family:var(--font); font-size:11px; color:#374151; padding:0 8px; cursor:pointer; }
.classif-display { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:4px; }
.classif-nota { font-size:9px; color:#9ca3af; }

/* Popup */
.ssma-popup-overlay { position:fixed; inset:0; background:rgba(0,0,0,.42); z-index:600; display:flex; align-items:flex-start; justify-content:center; padding-top:64px; overflow-y:auto; }
.ssma-popup { background:var(--card-bg); border-radius:var(--radius); width:600px; max-width:96vw; box-shadow:0 8px 32px rgba(0,0,0,.22); overflow:hidden; margin-bottom:20px; }
.ssma-popup-head { padding:12px 16px; background:var(--bg); border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
.ssma-popup-title { font-size:13px; font-weight:600; display:flex; align-items:center; gap:7px; }
.ssma-popup-title i { font-size:15px; color:#6b7280; }
.ssma-popup-body { padding:14px 16px; }
.ssma-popup-footer { padding:10px 16px; border-top:1px solid var(--border); background:var(--bg); display:flex; justify-content:space-between; align-items:center; }
.ssma-popup-sub { font-size:13px; font-weight:700; }
.ssma-popup-sub span { font-size:10px; font-weight:400; color:#6b7280; margin-right:5px; }
.ssma-save-btn { padding:6px 16px; border:none; border-radius:var(--radius-sm); background:var(--yellow); color:var(--dark1); font-family:var(--font); font-size:12px; font-weight:700; cursor:pointer; }
.ssma-save-btn:hover { background:var(--yellow-dk); }

.ssma-ptable { width:100%; border-collapse:collapse; font-size:11px; margin-bottom:8px; }
.ssma-ptable th { text-align:left; padding:4px 6px; color:#6b7280; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; border-bottom:1px solid var(--border); }
.ssma-ptable td { padding:6px 6px; border-bottom:1px solid var(--border); }
.ssma-ptable tr:last-child td { border-bottom:none; }
.ssma-cell-input { border:1px solid var(--border); border-radius:4px; padding:3px 6px; font-size:11px; background:var(--bg); font-family:var(--font); color:#374151; width:100%; }
.ssma-cell-input:focus { outline:none; border-color:#9ca3af; }
.ssma-cell-select { border:1px solid var(--border); border-radius:4px; padding:3px 4px; font-size:10px; background:var(--bg); font-family:var(--font); color:#374151; width:100%; }
.ssma-cell-del { background:none; border:none; cursor:pointer; color:#9ca3af; font-size:15px; line-height:1; }
.ssma-cell-del:hover { color:#dc2626; }
.ssma-add-row { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border:1px dashed var(--border); border-radius:var(--radius-sm); font-size:11px; color:#6b7280; cursor:pointer; background:none; font-family:var(--font); }
.ssma-add-row:hover { border-color:#9ca3af; color:#374151; }
.ssma-check-row { display:flex; align-items:center; gap:5px; font-size:10px; color:#6b7280; margin-top:2px; }
.ssma-mod-list { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
.ssma-mod-pill { font-size:10px; padding:2px 9px; border:1px solid var(--border); border-radius:10px; color:#374151; background:var(--bg); }
.ssma-mod-link { font-size:10px; padding:2px 9px; border:1px dashed var(--border); border-radius:10px; color:#9ca3af; background:none; cursor:pointer; font-family:var(--font); display:inline-flex; align-items:center; gap:3px; }
.ssma-hh-table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:10px; }
.ssma-hh-table th { padding:6px 8px; border-bottom:1px solid var(--border); font-size:10px; font-weight:700; text-transform:uppercase; color:#6b7280; text-align:left; letter-spacing:.05em; }
.ssma-hh-table td { padding:7px 8px; border-bottom:1px solid var(--border); }
.ssma-hh-table tr:last-child td { border-bottom:none; }
.ssma-hh-input { border:1px solid var(--border); border-radius:4px; padding:4px 7px; font-size:12px; font-family:var(--font); background:var(--bg); width:100%; }
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
    ${['responsavel','status','situacao','checklist','risco','classificacao'].map(n => {
      const icons = { responsavel:'ti-user', status:'ti-circle-check', situacao:'ti-clock', checklist:'ti-list', risco:'ti-alert-triangle', classificacao:'ti-tag' };
      const labels = { responsavel:'Responsável', status:'Status', situacao:'Situação', checklist:'Checklist', risco:'Risco', classificacao:'Classificação' };
      return `<div class="ssma-dd" id="dd-${n}">
        <button class="ssma-dd-btn" onclick="ssmaToggleDD('${n}')"><i class="ti ${icons[n]}"></i><span class="dd-lbl">${labels[n]}</span><i class="ti ti-chevron-down arr"></i></button>
        <div class="ssma-dd-panel" id="ddp-${n}">
          <div class="ssma-dd-actions">
            <button class="ssma-dd-action-btn secondary" onclick="ssmaLimparDD('${n}')">Limpar</button>
            <button class="ssma-dd-action-btn primary"   onclick="ssmaAplicarDD('${n}')">Aplicar</button>
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

  <div class="ssma-table-wrap">
    <table class="ssma-table">
      <thead><tr>
        <th style="width:82px">Código</th>
        <th>O que será feito?</th>
        <th style="width:90px">Prazo</th>
        <th style="width:120px">Responsável</th>
        <th style="width:82px;text-align:right">Valor total</th>
        <th style="width:62px">Risco</th>
        <th style="width:82px">Classif.</th>
        <th style="width:96px">Reclassif.</th>
      </tr></thead>
      <tbody id="ssma-tbody"></tbody>
    </table>
    <div class="ssma-tfoot" id="ssma-tfoot">Carregando…</div>
  </div>
</div>`;

    atualizarTimestamp();

    /* Fecha dropdowns ao clicar fora */
    document.addEventListener('click', e => {
      if (!e.target.closest('.ssma-dd')) {
        document.querySelectorAll('.ssma-dd-panel.show').forEach(p => p.classList.remove('show'));
        document.querySelectorAll('.ssma-dd-btn.open').forEach(b => b.classList.remove('open'));
      }
    });

    /* Carrega dados */
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

    const at = dados.filter(p => p.situacao==='Atrasado').length;
    const av = dados.filter(p => p.situacao==='A vencer').length;
    const np = dados.filter(p => p.situacao==='No prazo').length;

    tbody.innerHTML = dados.map(p => {
      const vt = calcValorTotal(p);
      const reclassif = p.reclassificacao || '';
      let prazoClass = 'prazo-ok', dotClr = '#16a34a';
      if (p.situacao==='Atrasado')  { prazoClass='prazo-atrasado'; dotClr='#dc2626'; }
      if (p.situacao==='A vencer')  { prazoClass='prazo-avencer';  dotClr='#d97706'; }
      const dot = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotClr};margin-right:4px;vertical-align:middle"></span>`;
      return `<tr onclick="ssmaAbrirModal('${p.codigo}')">
        <td style="font-size:11px;color:#6b7280;font-weight:600;white-space:nowrap">${esc(p.codigo)}</td>
        <td><div class="ssma-desc" title="${esc(p.descricao)}">${esc(p.descricao)}</div></td>
        <td class="${prazoClass}">${dot}${esc(p.prazo||'—')}</td>
        <td style="font-size:11px;color:#6b7280;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.responsavel||'—')}</td>
        <td style="text-align:right;font-size:12px;font-weight:${vt.total>0?'600':'400'};color:${vt.total>0?'#111':'#9ca3af'}">${vt.total>0?fmtBRL(vt.total):'—'}</td>
        <td>${p.risco?`<span class="${RISCO_CLASS(p.resultado)}">${p.risco}</span>`:`<span class="sbadge-none">—</span>`}</td>
        <td>${p.classificacao?`<span class="${badgeClassif(p.classificacao)}">${esc(p.classificacao)}</span>`:`<span class="sbadge-none">—</span>`}</td>
        <td>${reclassif?`<span class="${badgeClassif(reclassif)}">${esc(reclassif)}</span>`:`<span class="sbadge-none">—</span>`}</td>
      </tr>`;
    }).join('');

    if (tfoot) tfoot.innerHTML = `Exibindo <span>${dados.length}</span> de <span>${DB.length}</span> planos &nbsp;·&nbsp;
      <span style="color:#dc2626">${at} atrasados</span> &nbsp;·&nbsp;
      <span style="color:#d97706">${av} a vencer</span> &nbsp;·&nbsp;
      <span style="color:#16a34a">${np} no prazo</span>`;
  }

  /* ════════════════════════════════════════════
     DDs dinâmicos
  ════════════════════════════════════════════ */
  function popularDDs() {
    const fixos = {
      situacao:  ['Atrasado','A vencer','No prazo'],
      checklist: ['Aderência','Análise de Acidente','Análise de Quase Acidente','Inspeção de SSMA'],
      risco:     ['Alto','Médio','Baixo'],
    };
    const campos = { responsavel:'responsavel', status:'status', classificacao:'classificacao' };

    ['situacao','checklist','risco'].forEach(n => {
      document.getElementById(`ddl-${n}`).innerHTML = fixos[n].map(v =>
        `<label class="ssma-dd-item"><input type="checkbox" value="${esc(v)}"> ${esc(v)}</label>`).join('');
    });

    Object.entries(campos).forEach(([n, campo]) => {
      const vals = [...new Set(DB.map(p => p[campo]).filter(Boolean))].sort();
      document.getElementById(`ddl-${n}`).innerHTML = vals.map(v =>
        `<label class="ssma-dd-item"><input type="checkbox" value="${esc(v)}"> ${esc(v)}</label>`).join('');
    });
  }

  /* ════════════════════════════════════════════
     MODAL DO PLANO
  ════════════════════════════════════════════ */
  window.ssmaAbrirModal = function(codigo) { modalCodigo = codigo; modalTab = 'geral'; renderModal(); };

  function renderModal() {
    const p = DB.find(d => d.codigo === modalCodigo);
    if (!p) return;
    const vt = calcValorTotal(p);
    const reclassif = p.reclassificacao || '';

    let situBadge = '';
    if (p.situacao==='Atrasado') situBadge = `<span class="sbadge-alto">Atrasado</span>`;
    else if (p.situacao==='A vencer') situBadge = `<span class="sbadge-medio">A vencer</span>`;
    else situBadge = `<span class="sbadge-baixo">No prazo</span>`;

    /* Classificação → Reclassificação */
    const classif = p.classificacao || '';
    let classifHtml = '';
    if (classif && reclassif && classif !== reclassif) {
      classifHtml = `<div class="classif-display">
        <span class="${badgeClassif(classif)}">${esc(classif)}</span>
        <span style="color:#9ca3af">→</span>
        <span class="${badgeClassif(reclassif)}">${esc(reclassif)}</span>
        <span class="classif-nota">(alterado)</span>
      </div>`;
    } else if (classif || reclassif) {
      const v = reclassif || classif;
      classifHtml = `<div class="classif-display"><span class="${badgeClassif(v)}">${esc(v)}</span></div>`;
    } else {
      classifHtml = `<div class="classif-display"><span class="sbadge-none">—</span></div>`;
    }

    let bodyHtml = '';
    if (modalTab === 'geral') {
      let prazoClass = p.situacao==='Atrasado'?'prazo-atrasado':p.situacao==='A vencer'?'prazo-avencer':'prazo-ok';
      bodyHtml = `
        <div class="ssma-grid2">
          <div><div class="ssma-field-label">Responsável</div><div class="ssma-field-val">${esc(p.responsavel||'—')}</div></div>
          <div><div class="ssma-field-label">Status</div><div class="ssma-field-val">${esc(p.status||'—')}</div></div>
        </div>
        <div class="ssma-grid3">
          <div><div class="ssma-field-label">Prazo</div><div class="${prazoClass}">${esc(p.prazo||'—')}</div></div>
          <div><div class="ssma-field-label">Risco</div><div style="margin-top:4px">${p.risco?`<span class="${RISCO_CLASS(p.resultado)}">${p.risco} · ${p.resultado}</span>`:`<span class="sbadge-none">—</span>`}</div></div>
          <div><div class="ssma-field-label">Categoria</div><div class="ssma-field-val" style="font-size:11px">${esc(p.checklist_cat||'—')}</div></div>
        </div>
        <div class="ssma-grid2">
          <div>
            <div class="ssma-field-label">Classificação → Reclassificação</div>
            ${classifHtml}
          </div>
          <div>
            <div class="ssma-field-label">Alterar reclassificação</div>
            <select class="ssma-select" onchange="ssmaAlterarReclassif(this.value)">
              <option value="">— selecionar —</option>
              ${CLASSIF_OPTIONS.map(o=>`<option value="${o}" ${reclassif===o?'selected':''}>${o}</option>`).join('')}
            </select>
            <div style="font-size:9px;color:#9ca3af;margin-top:3px">CAPEX · OPEX · DOCUMENTAL · GOVERNANÇA</div>
          </div>
        </div>`;
    } else if (modalTab === 'aquisicoes') {
      bodyHtml = renderAqs(p);
    } else if (modalTab === 'servicos') {
      bodyHtml = renderSvs(p);
    }

    let ov = document.getElementById('ssma-modal-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'ssma-modal-ov';
      ov.className = 'ssma-modal-overlay';
      ov.onclick = e => { if (e.target===ov) ssmaFecharModal(); };
      document.body.appendChild(ov);
    }
    ov.innerHTML = `<div class="ssma-modal">
      <div class="ssma-modal-head">
        <div class="ssma-modal-code"># ${esc(p.codigo)} · ${esc(p.checklist_cat||'')} · ${esc(p.responsavel||'')}</div>
        <div class="ssma-modal-title">${esc(p.descricao)}</div>
        <div class="ssma-modal-meta">${situBadge} ${p.risco?`<span class="${RISCO_CLASS(p.resultado)}">${p.risco} · resultado ${p.resultado}</span>`:''} <button class="ssma-modal-close" onclick="ssmaFecharModal()">×</button></div>
      </div>
      <div class="ssma-modal-tabs">
        <button class="ssma-modal-tab ${modalTab==='geral'?'active':''}" onclick="ssmaMudarTab('geral')">Geral</button>
        <button class="ssma-modal-tab ${modalTab==='aquisicoes'?'active':''}" onclick="ssmaMudarTab('aquisicoes')">Aquisições</button>
        <button class="ssma-modal-tab ${modalTab==='servicos'?'active':''}" onclick="ssmaMudarTab('servicos')">Serviços</button>
      </div>
      <div class="ssma-modal-body">${bodyHtml}</div>
      <div class="ssma-modal-footer">
        <button class="ssma-act-btn" onclick="ssmaMudarTab('aquisicoes')"><i class="ti ti-shopping-cart"></i> Aquisições</button>
        <button class="ssma-act-btn" onclick="ssmaMudarTab('servicos')"><i class="ti ti-tool"></i> Serviços</button>
        <div class="ssma-vt-block">
          <div class="ssma-vt-main">${fmtBRL(vt.total)}</div>
          <div class="ssma-vt-sub">Aq: ${fmtBRL(vt.aq)} + Sv: ${fmtBRL(vt.sv)}</div>
        </div>
      </div>
    </div>`;
    ov.style.display = 'flex';
  }

  function renderAqs(p) {
    const rows = (p._aquisicoes||[]).map((it,i) => `<tr>
      <td>
        <input class="ssma-cell-input" value="${esc(it.sem_cadastro?'':it.cod_item||'')}" ${it.sem_cadastro?'disabled style="opacity:.4"':''} placeholder="Código" oninput="ssmaAqSet(${i},'cod_item',this.value)" style="width:76px">
        <div class="ssma-check-row"><input type="checkbox" ${it.sem_cadastro?'checked':''} onchange="ssmaAqCheck(${i},this.checked)"> sem cadastro</div>
      </td>
      <td><input class="ssma-cell-input" value="${esc(it.descricao||'')}" placeholder="Descrição" oninput="ssmaAqSet(${i},'descricao',this.value)"></td>
      <td><input class="ssma-cell-input" value="${it.qtd||''}" style="width:44px;text-align:center" oninput="ssmaAqSet(${i},'qtd',this.value)"></td>
      <td><input class="ssma-cell-input" value="${it.valor_unit||''}" style="width:78px;text-align:right" placeholder="0,00" oninput="ssmaAqSet(${i},'valor_unit',this.value)"></td>
      <td style="text-align:right;font-weight:600;font-size:11px" id="aq-tot-${i}">${fmtBRL((parseFloat(it.qtd)||0)*(parseFloat(it.valor_unit)||0))}</td>
      <td><button class="ssma-cell-del" onclick="ssmaAqRemover(${i})">×</button></td>
    </tr>`).join('');
    const sub = (p._aquisicoes||[]).reduce((s,i)=>s+(parseFloat(i.qtd)||0)*(parseFloat(i.valor_unit)||0),0);
    return `<table class="ssma-ptable">
      <thead><tr><th style="width:96px">Código</th><th>Descrição</th><th style="width:50px">Qtd</th><th style="width:88px">Vl. unit.</th><th style="width:80px;text-align:right">Total</th><th style="width:28px"></th></tr></thead>
      <tbody>${rows}</tbody></table>
      <button class="ssma-add-row" onclick="ssmaAqAdicionar()"><i class="ti ti-plus" style="font-size:12px"></i> Adicionar item</button>
      <div style="margin-top:12px;text-align:right;font-size:13px;font-weight:700"><span style="font-weight:400;font-size:10px;color:#6b7280;margin-right:5px">Subtotal aquisições</span>${fmtBRL(sub)}</div>`;
  }

  function renderSvs(p) {
    const rows = (p._servicos||[]).map((it,i) => {
      const opts = MODS.map(m=>`<option value="${esc(m.nome)}" ${it.modalidade===m.nome?'selected':''}>${esc(m.nome)}</option>`).join('');
      const m = MODS.find(m=>m.nome===it.modalidade);
      const taxa = m ? parseFloat(m.valor_hh)||0 : 0;
      return `<tr>
        <td><input class="ssma-cell-input" value="${esc(it.os||'')}" placeholder="OS" style="width:60px" oninput="ssmaSvSet(${i},'os',this.value)"></td>
        <td><input class="ssma-cell-input" value="${esc(it.descricao||'')}" placeholder="Descrição" oninput="ssmaSvSet(${i},'descricao',this.value)"></td>
        <td><select class="ssma-cell-select" onchange="ssmaSvSet(${i},'modalidade',this.value)"><option value="">—</option>${opts}</select></td>
        <td><input class="ssma-cell-input" value="${it.hh_prev||''}" style="width:46px;text-align:center" oninput="ssmaSvSet(${i},'hh_prev',this.value)"></td>
        <td style="text-align:right;font-size:10px;color:#6b7280">${taxa?fmtBRL(taxa)+'/h':'—'}</td>
        <td style="text-align:right;font-weight:600;font-size:11px">${fmtBRL((parseFloat(it.hh_prev)||0)*taxa)}</td>
        <td><button class="ssma-cell-del" onclick="ssmaSvRemover(${i})">×</button></td>
      </tr>`;
    }).join('');
    const sub = (p._servicos||[]).reduce((s,i)=>{
      const m=MODS.find(m=>m.nome===i.modalidade); return s+(parseFloat(i.hh_prev)||0)*(m?parseFloat(m.valor_hh)||0:0);
    },0);
    const pills = MODS.map(m=>`<span class="ssma-mod-pill">${esc(m.nome)} · ${fmtBRL(m.valor_hh)}/h</span>`).join('');
    return `<table class="ssma-ptable">
      <thead><tr><th style="width:68px">OS</th><th>Descrição</th><th style="width:100px">Modalidade</th><th style="width:52px">HH prev.</th><th style="width:72px;text-align:right">R$/h</th><th style="width:78px;text-align:right">Subtotal</th><th style="width:28px"></th></tr></thead>
      <tbody>${rows}</tbody></table>
      <button class="ssma-add-row" onclick="ssmaSvAdicionar()"><i class="ti ti-plus" style="font-size:12px"></i> Adicionar serviço</button>
      <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:9px">
        <div class="ssma-field-label">Modalidades disponíveis</div>
        <div class="ssma-mod-list">${pills}
          <button class="ssma-mod-link" onclick="ssmaFecharModal();ssmaAbrirHH()"><i class="ti ti-external-link" style="font-size:10px"></i> Gerenciar em Configurar HH</button>
        </div>
      </div>
      <div style="margin-top:12px;text-align:right;font-size:13px;font-weight:700"><span style="font-weight:400;font-size:10px;color:#6b7280;margin-right:5px">Subtotal serviços</span>${fmtBRL(sub)}</div>`;
  }

  window.ssmaFecharModal = function() {
    const ov = document.getElementById('ssma-modal-ov');
    if (ov) ov.style.display = 'none';
    renderLista();
  };

  window.ssmaMudarTab = function(tab) { modalTab = tab; renderModal(); };

  /* Reclassificação → salva imediatamente */
  window.ssmaAlterarReclassif = async function(val) {
    const p = DB.find(d => d.codigo === modalCodigo);
    if (!p) return;
    p.reclassificacao = val;
    await dbUpsert('ssma_manual', [{ codigo: modalCodigo, reclassificacao: val, atualizado_em: new Date().toISOString() }], 'codigo');
    renderModal();
  };

  /* ── Aquisições ── */
  window.ssmaAqAdicionar = async function() {
    const p = DB.find(d=>d.codigo===modalCodigo);
    const db = getDB();
    const { data } = await db.from('ssma_aquisicoes').insert({ codigo: modalCodigo, sem_cadastro:false, cod_item:'', descricao:'', qtd:0, valor_unit:0 }).select();
    if (data) p._aquisicoes.push(data[0]);
    ssmaMudarTab('aquisicoes');
  };

  window.ssmaAqRemover = async function(i) {
    const p = DB.find(d=>d.codigo===modalCodigo);
    const item = p._aquisicoes[i];
    if (item?.id) await getDB().from('ssma_aquisicoes').delete().eq('id', item.id);
    p._aquisicoes.splice(i,1);
    ssmaMudarTab('aquisicoes');
  };

  window.ssmaAqSet = async function(i, campo, val) {
    const p = DB.find(d=>d.codigo===modalCodigo);
    p._aquisicoes[i][campo] = val;
    const tot = document.getElementById(`aq-tot-${i}`);
    if (tot) tot.textContent = fmtBRL((parseFloat(p._aquisicoes[i].qtd)||0)*(parseFloat(p._aquisicoes[i].valor_unit)||0));
    const item = p._aquisicoes[i];
    if (item.id) await getDB().from('ssma_aquisicoes').update({ [campo]: val }).eq('id', item.id);
  };

  window.ssmaAqCheck = async function(i, val) {
    const p = DB.find(d=>d.codigo===modalCodigo);
    p._aquisicoes[i].sem_cadastro = val;
    const item = p._aquisicoes[i];
    if (item.id) await getDB().from('ssma_aquisicoes').update({ sem_cadastro: val, cod_item: '' }).eq('id', item.id);
    ssmaMudarTab('aquisicoes');
  };

  /* ── Serviços ── */
  window.ssmaSvAdicionar = async function() {
    const p = DB.find(d=>d.codigo===modalCodigo);
    const { data } = await getDB().from('ssma_servicos').insert({ codigo: modalCodigo, os:'', descricao:'', modalidade:'', hh_prev:0 }).select();
    if (data) p._servicos.push(data[0]);
    ssmaMudarTab('servicos');
  };

  window.ssmaSvRemover = async function(i) {
    const p = DB.find(d=>d.codigo===modalCodigo);
    const item = p._servicos[i];
    if (item?.id) await getDB().from('ssma_servicos').delete().eq('id', item.id);
    p._servicos.splice(i,1);
    ssmaMudarTab('servicos');
  };

  window.ssmaSvSet = async function(i, campo, val) {
    const p = DB.find(d=>d.codigo===modalCodigo);
    p._servicos[i][campo] = val;
    const item = p._servicos[i];
    if (item.id) await getDB().from('ssma_servicos').update({ [campo]: val }).eq('id', item.id);
    ssmaMudarTab('servicos');
  };

  /* ════════════════════════════════════════════
     CONFIGURAR HH
  ════════════════════════════════════════════ */
  window.ssmaAbrirHH = function() {
    let ov = document.getElementById('ssma-hh-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'ssma-hh-ov';
      ov.className = 'ssma-modal-overlay';
      ov.onclick = e => { if (e.target===ov) ssmaFecharHH(); };
      document.body.appendChild(ov);
    }
    renderHH(ov);
    ov.style.display = 'flex';
  };

  function renderHH(ov) {
    const rows = MODS.map((m,i) => `<tr>
      <td><input class="ssma-hh-input" value="${esc(m.nome)}" placeholder="Modalidade" oninput="ssmaHHSet(${i},'nome',this.value)"></td>
      <td><input class="ssma-hh-input" value="${m.valor_hh}" style="width:100px;text-align:right" oninput="ssmaHHSet(${i},'valor_hh',this.value)"></td>
      <td><button class="ssma-cell-del" onclick="ssmaHHRemover(${i})">×</button></td>
    </tr>`).join('');
    ov.innerHTML = `<div class="ssma-modal" style="max-width:420px">
      <div class="ssma-modal-head">
        <div class="ssma-modal-code">Configurações</div>
        <div class="ssma-modal-title">Modalidades de Serviço — HH Terceiro</div>
        <div class="ssma-modal-meta"><button class="ssma-modal-close" onclick="ssmaFecharHH()">×</button></div>
      </div>
      <div class="ssma-modal-body">
        <p style="font-size:11px;color:#6b7280;margin-bottom:12px">Defina as modalidades e o valor de referência do HH terceirizado. O Valor Total usa esses valores para calcular o custo de serviços.</p>
        <table class="ssma-hh-table">
          <thead><tr><th>Modalidade</th><th>R$/h (referência)</th><th style="width:28px"></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <button class="ssma-add-row" onclick="ssmaHHAdicionar()"><i class="ti ti-plus" style="font-size:12px"></i> Nova modalidade</button>
      </div>
      <div class="ssma-modal-footer" style="justify-content:flex-end">
        <button class="ssma-save-btn" onclick="ssmaHHSalvar()">Salvar</button>
      </div>
    </div>`;
    ov.style.display = 'flex';
  }

  window.ssmaFecharHH   = function() { const ov=document.getElementById('ssma-hh-ov'); if(ov) ov.style.display='none'; };
  window.ssmaHHSet      = function(i,c,v) { MODS[i][c] = c==='valor_hh'?parseFloat(v)||0:v; };
  window.ssmaHHAdicionar= function() { MODS.push({nome:'',valor_hh:0}); renderHH(document.getElementById('ssma-hh-ov')); };
  window.ssmaHHRemover  = async function(i) {
    const m = MODS[i];
    if (m.id) await getDB().from('ssma_modalidades').delete().eq('id', m.id);
    MODS.splice(i,1);
    renderHH(document.getElementById('ssma-hh-ov'));
  };

  window.ssmaHHSalvar = async function() {
    const registros = MODS.map(m => ({
      ...(m.id?{id:m.id}:{}),
      nome: m.nome,
      valor_hh: parseFloat(m.valor_hh)||0,
      atualizado_em: new Date().toISOString(),
    }));
    const { error } = await dbUpsert('ssma_modalidades', registros.filter(r=>r.nome), 'nome');
    if (error) { showToastMod('Erro ao salvar: '+error.message, 'erro'); return; }
    /* Recarrega lista atualizada */
    const r = await dbSelect('ssma_modalidades', { order:{ col:'nome', asc:true } });
    MODS = r.data || [];
    ssmaFecharHH();
    showToastMod('Modalidades salvas', 'ok');
  };

  /* ════════════════════════════════════════════
     IMPORTAÇÃO — trigger
  ════════════════════════════════════════════ */
  window.ssmaImportar = function() { document.getElementById('ssma-file')?.click(); };
  window.ssmaOnFile   = function(e) { const f=e.target.files[0]; if(f){ e.target.value=''; importarXLSX(f); } };

  /* ════════════════════════════════════════════
     FILTROS — globais
  ════════════════════════════════════════════ */
  window.ssmaFiltrar = function() {
    filtros.busca = document.getElementById('ssma-busca')?.value || '';
    renderLista();
  };
  window.ssmaFiltrarVT = function() {
    const val = parseFloat(document.getElementById('ssma-vt-range')?.value)||200000;
    filtros.valorMax = val >= 200000 ? Infinity : val;
    const lbl = document.getElementById('ssma-vt-lbl');
    if (lbl) lbl.textContent = val>=200000 ? 'Todos' : fmtBRL(val);
    renderLista();
  };
  window.ssmaToggleDD = function(n) {
    const panel = document.getElementById(`ddp-${n}`);
    const btn   = document.querySelector(`#dd-${n} .ssma-dd-btn`);
    const isOpen = panel?.classList.contains('show');
    document.querySelectorAll('.ssma-dd-panel.show').forEach(p=>p.classList.remove('show'));
    document.querySelectorAll('.ssma-dd-btn.open').forEach(b=>b.classList.remove('open'));
    if (!isOpen) { panel?.classList.add('show'); btn?.classList.add('open'); }
  };
  window.ssmaLimparDD = function(n) {
    document.querySelectorAll(`#ddl-${n} input[type=checkbox]`).forEach(cb=>cb.checked=false);
    filtros[n] = [];
    renderLista();
  };
  window.ssmaAplicarDD = function(n) {
    filtros[n] = [...document.querySelectorAll(`#ddl-${n} input[type=checkbox]:checked`)].map(cb=>cb.value);
    document.getElementById(`ddp-${n}`)?.classList.remove('show');
    document.querySelector(`#dd-${n} .ssma-dd-btn`)?.classList.remove('open');
    const lbl = document.querySelector(`#dd-${n} .dd-lbl`);
    const labels = {responsavel:'Responsável',status:'Status',situacao:'Situação',checklist:'Checklist',risco:'Risco',classificacao:'Classificação'};
    if (lbl) {
      const sel = filtros[n];
      lbl.textContent = sel.length ? (sel.join(', ').length>20?sel.join(', ').substring(0,20)+'…':sel.join(', ')) : labels[n];
    }
    renderLista();
  };

  /* ── Timestamp ── */
  function atualizarTimestamp() {
    const el = document.getElementById('ssma-ts');
    const ts = localStorage.getItem('man360_ssma_ultima_importacao');
    if (el) el.textContent = ts ? `Última importação: ${ts}` : 'Nenhuma importação';
  }

  /* ── Toast ── */
  function showToastMod(msg, tipo) {
    if (window.showToast) { window.showToast(msg, tipo); return; }
    const t = document.getElementById('toast');
    if (!t) return;
    t.className = tipo||'info';
    document.getElementById('toast-icon').className = 'ti '+(tipo==='ok'?'ti-check':tipo==='erro'?'ti-alert-circle':'ti-info-circle');
    document.getElementById('toast-msg').textContent = msg;
    t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'),3500);
  }

  /* ════════════════════════════════════════════
     REGISTRO
  ════════════════════════════════════════════ */
  window.Modulos = window.Modulos || {};
  window.Modulos['planos-ssma'] = {
    async init(container) { await render(container); }
  };

})();
