/* ═══════════════════════════════════════════════════════════════
   MAN360 — Projetos Caldeiraria · Projetos de Segurança v2
   ═══════════════════════════════════════════════════════════════ */

window.Modulos = window.Modulos || {};
window.Modulos.proj_caldeiraria = (() => {

  /* ── Constantes ── */
  const HH_DIA_COLAB  = 7.33;
  const DIAS_MES_6X1  = 26;
  const HH_MES_TERC   = 176;
  const PESSOAS_EQ    = 2;
  const BUCKET        = 'proj-fotos';
  const VALORES_HH    = [80, 100, 120, 150, 180, 200];

  function hhMesProp(n) { return HH_DIA_COLAB * DIAS_MES_6X1 * PESSOAS_EQ * n; }
  function hhMesTerc(n) { return HH_MES_TERC  * PESSOAS_EQ   * n; }

  /* ── Estado ── */
  let _container  = null;
  let _equipes    = [];
  let _tipos      = [];
  let _os         = [];
  let _fotos      = {};   // os → [{id,nome,url}]
  let _filtEquipe = 'CAL31';
  let _filtTipos  = [];
  let _filtCrit   = [];
  let _filtMO     = '';
  let _filtSetor  = '';
  let _filtStatus = [];  // [] = todos
  let _dtInicio   = '';
  let _nEqProp    = 1;
  let _nEqTerc    = 0;
  let _valorHH    = 120;
  let _osExpandida= null;
  let _osVerFotos = null;
  let _filtBusca  = '';
  let _dtInicioTerc = '';
  let _visaoSetor = 'hh';
  let _curvaExpanded = false;

  /* ── Helpers ── */
  function fmtNum(n,d){ return (n||0).toLocaleString('pt-BR',{minimumFractionDigits:d||0,maximumFractionDigits:d||0}); }
  function fmtMoeda(n){ return (n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0}); }

  function osFiltradas() {
    return _os.filter(o=>{
      if (_filtCrit.length && !_filtCrit.includes(o.proj_criticidade)) return false;
      if (_filtMO && o.proj_mo_tipo !== _filtMO) return false;
      if (_filtSetor && (o.desc_setor||o.setor) !== _filtSetor) return false;
      if (_filtStatus.length) {
        const sl = (o.status_os||'').toLowerCase();
        const match = _filtStatus.some(fs=>{
          if (fs==='encerrada')    return sl.includes('encerr');
          if (fs==='programada')   return sl.includes('program')||sl.includes('gerada')||sl.includes('aberta')||sl===''||!sl;
          if (fs==='andamento')    return sl.includes('andamento')||sl.includes('execu');
          return sl.includes(fs);
        });
        if (!match) return false;
      }
      // Filtro busca por texto parcial
      if (_filtBusca) {
        const q = _filtBusca.toLowerCase();
        const txt = ((o.desc_servico||'') + ' ' + (o.desc_os||'')).toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
  }
  function setoresDistintos() {
    return [...new Set(_os.map(o=>o.desc_setor||o.setor).filter(Boolean))].sort();
  }
  function osEnc(lista){ return lista.filter(o=>o.status_os&&o.status_os.toLowerCase().includes('encerr')); }
  // OS para métricas globais — apenas filtros de equipe e tipo de intervenção
  // (não afetados por criticidade, MO ou setor da lista)
  function osParaMetricas() { return _os; }

  /* Calcula data de conclusão somando dias úteis (pula domingos) */
  function calcDataConclusao(dtInicioStr, hhRest, hhDiario) {
    if (!dtInicioStr || hhRest <= 0 || hhDiario <= 0) return null;
    const diasUteis = Math.round(hhRest / hhDiario);
    const d = new Date(dtInicioStr + 'T12:00:00');
    let contados = 0;
    while (contados < diasUteis) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0) contados++; // pula domingo
    }
    return { data: d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}), dias: diasUteis };
  }

  /* ── Previsão de conclusão ── */
  function _isCan(o){ const sl=(o.status_os||'').toLowerCase(); return sl.includes('cancel')||sl.includes('suspend'); }

  function calcPrevisao(lista) {
    if (!_dtInicio) return {prop:null,terc:null,custoTerc:null};
    const hoje = new Date().toISOString().split('T')[0];
    // Projeção usa apenas OS válidas (sem canceladas/suspensas) — assim alinha com slide.html
    const hhTotProp = lista.filter(o=>(o.proj_mo_tipo==='proprio'||!o.proj_mo_tipo)&&!_isCan(o)).reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const hhTotTerc = lista.filter(o=>o.proj_mo_tipo==='terceiro'&&!_isCan(o)).reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const hhEncProp = lista.filter(o=>(o.proj_mo_tipo==='proprio'||!o.proj_mo_tipo)&&!_isCan(o)&&o.status_os&&o.status_os.toLowerCase().includes('encerr')).reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const hhEncTerc = lista.filter(o=>o.proj_mo_tipo==='terceiro'&&!_isCan(o)&&o.status_os&&o.status_os.toLowerCase().includes('encerr')).reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const hhRestProp = Math.max(0, hhTotProp - hhEncProp);
    const hhRestTerc = Math.max(0, hhTotTerc - hhEncTerc);
    const hhDiarioProp = HH_DIA_COLAB * PESSOAS_EQ * _nEqProp;
    const hhDiarioTerc = HH_DIA_COLAB * PESSOAS_EQ * _nEqTerc;
    // Projeção própria: se já executou algo, projeta a partir de hoje
    const startProp = hhEncProp > 0 ? hoje : _dtInicio;
    const resProp = _nEqProp>0 ? calcDataConclusao(startProp, hhRestProp, hhDiarioProp) : null;
    // Projeção terceiro: usa data de início específica da equipe terceira
    const resTerc = (_nEqTerc>0 && _dtInicioTerc) ? calcDataConclusao(_dtInicioTerc, hhRestTerc, hhDiarioTerc) : null;
    const custoTerc = _nEqTerc>0 ? hhRestTerc * _valorHH : null;
    // Calcular delta (atraso / adiantado) via curva ideal
    let diasDelta = null, adiantado = null, hhDelta = null;
    if (_dtInicio && hhDiarioProp > 0 && hhTotProp > 0) {
      const _ideal = _curvaIdealFn(_dtInicio, hhTotProp, hhDiarioProp);
      const _hojeD = new Date(); _hojeD.setHours(12,0,0,0);
      let _hhIdealHoje = 0;
      for (const pt of _ideal) { if (pt.d <= _hojeD) _hhIdealHoje = pt.hh; else break; }
      hhDelta    = hhEncProp - _hhIdealHoje;
      diasDelta  = Math.round(hhDelta / hhDiarioProp);
      adiantado  = diasDelta >= 0;
    }
    return {
      prop:      resProp ? resProp.data : null,
      terc:      resTerc ? resTerc.data : null,
      diasProp:  resProp ? resProp.dias : null,
      diasTerc:  resTerc ? resTerc.dias : null,
      custoTerc, hhRestTerc,
      mesesProp: resProp ? (resProp.dias/26).toFixed(1) : null,
      mesesTerc: resTerc ? (resTerc.dias/26).toFixed(1) : null,
      diasDelta, adiantado, hhDelta,
    };
  }

  /* ══════════════════════════════════════
     CARREGAR DADOS
  ══════════════════════════════════════ */
  async function carregarTipos() {
    const { data } = await getDB().from('proj_tipos_intervencao').select('*').eq('ativo',true).order('nome');
    _tipos = data||[];
  }

  async function carregarEquipes() {
    const { data } = await getDB().from('ordens_servico').select('equipe').not('equipe','is',null);
    const todas = [...new Set((data||[]).map(r=>r.equipe).filter(Boolean))].sort();
    _equipes = todas.filter(e=>e.startsWith('CAL'));
    if (!_equipes.includes(_filtEquipe) && _equipes.length) _filtEquipe = _equipes[0];
  }

  async function carregarOS() {
    let q = getDB().from('ordens_servico')
      .select('os,cod_servico,desc_os,desc_servico,hh_prev_os,hh_real_os,status_os,tipo_atividade,data_encerramento,setor,desc_setor,proj_tipo_intervencao,proj_criticidade,proj_mo_tipo')
      .eq('equipe',_filtEquipe).neq('tipo_atividade','MCU');
    if (_filtTipos.length) q = q.in('proj_tipo_intervencao',_filtTipos);
    const { data, error } = await q.order('os');
    if (error) console.error('carregarOS:',error);
    // Excluir canceladas/suspensas de TUDO na fonte
    _os = (data||[]).filter(o=>{ const sl=(o.status_os||'').toLowerCase(); return !sl.includes('cancel')&&!sl.includes('suspend'); });
    // Propagar tipo da OS pai (cod_servico=1) para OS filhas (cod_servico>1)
    const _tipoByOS = {};
    _os.forEach(o => { if (!o.cod_servico || String(o.cod_servico) === '1') _tipoByOS[o.os] = o.proj_tipo_intervencao; });
    _os.forEach(o => { if (o.cod_servico && String(o.cod_servico) !== '1' && !o.proj_tipo_intervencao) o.proj_tipo_intervencao = _tipoByOS[o.os] || null; });
  }

  async function carregarFotos(osList) {
    if (!osList.length) return;
    const nums = osList.map(o=>o.os);
    const { data } = await getDB().from('proj_os_fotos').select('*').in('os',nums);
    _fotos = {};
    (data||[]).forEach(f=>{ if(!_fotos[f.os]) _fotos[f.os]=[]; _fotos[f.os].push(f); });
  }

  async function carregarTudo() {
    await Promise.all([carregarTipos(), carregarEquipes()]);
    await carregarOS();
    await carregarFotos(_os);
  }

  /* ══════════════════════════════════════
     SALVAR DADOS
  ══════════════════════════════════════ */
  async function salvarCampo(os, campo, valor) {
    await getDB().from('ordens_servico').update({[campo]:valor||null}).eq('os',os);
    const idx = _os.findIndex(o=>o.os===os);
    if (idx>=0) _os[idx][campo] = valor||null;
  }

  async function renomearTipo(id, nomeAntigo, nomeNovo) {
    if (!nomeNovo || nomeNovo===nomeAntigo) return;
    const db = getDB();
    await db.from('proj_tipos_intervencao').update({nome:nomeNovo}).eq('id',id);
    await db.from('ordens_servico').update({proj_tipo_intervencao:nomeNovo}).eq('proj_tipo_intervencao',nomeAntigo);
    await carregarTipos();
    _os.forEach(o=>{ if(o.proj_tipo_intervencao===nomeAntigo) o.proj_tipo_intervencao=nomeNovo; });
  }

  async function uploadFoto(os, file) {
    const db = getDB();
    const ext  = file.name.split('.').pop();
    const path = `${os}/${Date.now()}.${ext}`;
    const { data: upData, error: upErr } = await db.storage.from(BUCKET).upload(path, file, {cacheControl:'3600',upsert:false});
    if (upErr) { alert('Erro no upload: '+upErr.message); return; }
    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path);
    const url = urlData.publicUrl;
    const { data: fotoData } = await db.from('proj_os_fotos').insert({os, nome:file.name, url}).select().single();
    if (fotoData) { if(!_fotos[os]) _fotos[os]=[]; _fotos[os].push(fotoData); }
    renderizar();
  }

  async function deletarFoto(id, os, url) {
    if (!confirm('Remover esta foto?')) return;
    const db = getDB();
    const path = url.split(`${BUCKET}/`)[1];
    if (path) await db.storage.from(BUCKET).remove([path]);
    await db.from('proj_os_fotos').delete().eq('id',id);
    if (_fotos[os]) _fotos[os] = _fotos[os].filter(f=>f.id!==id);
    renderizar();
  }

  /* ══════════════════════════════════════
     HTML
  ══════════════════════════════════════ */
  function htmlFiltros() {
    const eqOpts = _equipes.map(e=>`<option value="${e}"${e===_filtEquipe?' selected':''}>${e}</option>`).join('');
    const tiposChips = _tipos.map(t=>{
      const sel = _filtTipos.includes(t.nome);
      return `<span class="ps-chip${sel?' ativo':''}" data-tipo="${t.nome}" style="cursor:pointer">${t.nome}</span>`;
    }).join('');
    return `<div class="ps-filtros">
      <div class="ps-filtro-row">
        <div class="ps-filtro-bloco ps-filtro-equipe">
          <label class="ps-flbl">Equipe</label>
          <select class="ps-sel" id="ps-sel-equipe">${eqOpts}</select>
        </div>
        <div class="ps-filtro-sep-v"></div>
        <div class="ps-filtro-bloco" style="flex:1;min-width:180px">
          <label class="ps-flbl">
            Tipo de Intervenção
            <button class="ps-btn-sm" id="btn-add-tipo" title="Adicionar tipo"><i class="ti ti-plus"></i></button>
            <button class="ps-btn-sm" id="btn-edit-tipos" title="Editar tipos"><i class="ti ti-pencil"></i></button>
          </label>
          <div class="ps-chips-wrap" id="ps-chips-tipos">
            ${tiposChips||'<span style="font-size:10px;color:#4b5563">Nenhum tipo</span>'}
          </div>
        </div>
      </div>
    </div>`;
  }

  function htmlKPIs(lista) {
    const total   = lista.length;
    const enc     = osEnc(lista).length;
    // Pontos = OS com cod_servico '1' (ponto principal); sem cod_servico tambem conta
    const pontos  = lista.filter(o => {
      const _sl = (o.status_os||'').toLowerCase();
      if (_sl.includes('cancel')||_sl.includes('suspend')) return false;
      return !o.cod_servico || String(o.cod_servico) === '1';
    });
    const ptTotal = pontos.length;
    const ptEnc   = osEnc(pontos).length;
    const pPT     = ptTotal>0?Math.round(ptEnc/ptTotal*100):0;
    const hhTot  = lista.reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const hhEnc  = osEnc(lista).reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const pOS    = total>0?Math.round(enc/total*100):0;
    const pHH    = hhTot>0?Math.round(hhEnc/hhTot*100):0;
    const cor    = p=>p>=70?'var(--green)':p>=40?'var(--amber)':'var(--red)';
    return `<div class="ps-kpi-grid">
      <div class="ps-kpi">
        <div class="ps-kpi-lbl">Qtd. OS</div>
        <div class="ps-kpi-val" style="color:var(--blue)">${fmtNum(total)}</div>
        <div class="ps-kpi-sub">${enc} encerradas</div>
      </div>
      <div class="ps-kpi">
        <div class="ps-kpi-lbl">Pontos</div>
        <div class="ps-kpi-val" style="color:var(--blue)">${fmtNum(ptTotal)}</div>
        <div class="ps-kpi-sub">${ptEnc} encerrados · ${pPT}%</div>
      </div>
      <div class="ps-kpi">
        <div class="ps-kpi-lbl">HH Previsto</div>
        <div class="ps-kpi-val" style="color:var(--blue)">${fmtNum(hhTot,0)}h</div>
        <div class="ps-kpi-sub">${fmtNum(hhEnc,0)}h encerradas</div>
      </div>
      <div class="ps-kpi">
        <div class="ps-kpi-lbl">% OS Encerradas</div>
        <div class="ps-kpi-val" style="color:${cor(pOS)}">${pOS}%</div>
        <div class="ps-kpi-bar"><div class="ps-kpi-fill" style="width:${pOS}%;background:${cor(pOS)}"></div></div>
      </div>
      <div class="ps-kpi">
        <div class="ps-kpi-lbl">% HH Encerrado</div>
        <div class="ps-kpi-val" style="color:${cor(pHH)}">${pHH}%</div>
        <div class="ps-kpi-bar"><div class="ps-kpi-fill" style="width:${pHH}%;background:${cor(pHH)}"></div></div>
      </div>
    </div>`;
  }

  /* ── Blocos MO Própria e Terceiro ── */
  function htmlBlocosMO(lista) {
    const temTerc = lista.some(o => o.proj_mo_tipo === 'terceiro');
    const colClass = temTerc ? 'ps-blocos-mo' : 'ps-blocos-mo ps-bloco-unico';

    const blocoProp = [
      '<div class="ps-bloco-mo">',
      '<div class="ps-bloco-mo-titulo"><i class="ti ti-users"></i> MO Própria — Distribuição por Setor</div>',
      '<div class="ps-bloco-mo-sub-titulo">Distribuição por setor · criticidade</div>',
      htmlTabelaSetor(lista, 'proprio'),
      '<div class="ps-bloco-mo-sub-titulo" style="margin-top:14px">Cenários de previsão ('+_nEqProp+' eq. · '+fmtNum(hhMesProp(_nEqProp),0)+'h/mês)</div>',
      '<div class="ps-cen-hdr"><span>Cenário</span><span>HH Total</span><span>Previsão</span></div>',
      htmlCenarios(lista, 'proprio', _nEqProp, hhMesProp),
      '</div>',
    ].join('');

    const blocoTerc = temTerc ? [
      '<div class="ps-bloco-mo">',
      '<div class="ps-bloco-mo-titulo"><i class="ti ti-building-factory"></i> MO Terceiro — Distribuição por Setor</div>',
      '<div class="ps-bloco-mo-sub-titulo">Distribuição por setor · criticidade</div>',
      htmlTabelaSetor(lista, 'terceiro'),
      '<div class="ps-bloco-mo-sub-titulo" style="margin-top:14px">Cenários de previsão ('+_nEqTerc+' eq. · '+(_nEqTerc>0?fmtNum(hhMesTerc(_nEqTerc),0)+'h/mês':'sem equipes')+')</div>',
      '<div class="ps-cen-hdr"><span>Cenário</span><span>HH Total</span><span>Previsão</span></div>',
      htmlCenarios(lista, 'terceiro', _nEqTerc, hhMesTerc),
      '</div>',
    ].join('') : '';

    return '<div class="'+colClass+'">'+blocoProp+blocoTerc+'</div>';
  }

  function htmlProjecao(lista) {
    const prev = calcPrevisao(lista);
    const valorOpts = VALORES_HH.map(v=>`<option value="${v}"${v===_valorHH?' selected':''}>R$ ${v}/HH</option>`).join('');

    const corSit = prev.adiantado === null ? '#6b7280' : prev.adiantado ? 'var(--green)' : 'var(--red)';
    const sitLabel = prev.diasDelta === null ? '—'
      : prev.diasDelta === 0 ? 'Em dia'
      : prev.adiantado ? `Adiantado +${prev.diasDelta}D`
      : `Atraso ${prev.diasDelta}D`;
    const cardSit = `<div class="ps-prev-card">
      <div class="ps-prev-lbl"><i class="ti ti-activity"></i> Em Relação ao Plano</div>
      <div class="ps-prev-val" style="color:${corSit};font-size:${prev.diasDelta!==null?'20px':'16px'}">${sitLabel}</div>
      <div class="ps-prev-sub">${prev.hhDelta!==null?fmtNum(Math.abs(prev.hhDelta),0)+'h de diferença':''}</div>
    </div>`;

    const cardProp = `<div class="ps-prev-card">
      <div class="ps-prev-lbl"><i class="ti ti-users"></i> Previsão Conclusão — MO Própria</div>
      <div class="ps-prev-val${prev.prop?'':' vazio'}">${prev.prop||'—'}</div>
      ${prev.mesesProp
        ?`<div class="ps-prev-sub">${prev.mesesProp} meses · ${_nEqProp} eq. · ${fmtNum(hhMesProp(_nEqProp),0)}h/mês</div>`
        :'<div class="ps-prev-sub">Informe a data de início</div>'}
      <div class="ps-prev-obs">* Considerando a execução de toda a matriz</div>
    </div>`;

    const cardTerc = `<div class="ps-prev-card">
      <div class="ps-prev-lbl"><i class="ti ti-building-factory"></i> Previsão Conclusão — MO Terceiro</div>
      <div class="ps-prev-val${prev.terc?'':' vazio'}">${prev.terc||(_nEqTerc===0?'Sem equipes terceiras':'—')}</div>
      ${prev.mesesTerc?`<div class="ps-prev-sub">${prev.mesesTerc} meses · ${_nEqTerc} eq. · ${fmtNum(hhMesTerc(_nEqTerc),0)}h/mês</div>`:`<div class="ps-prev-sub">${_nEqTerc===0?'Configure equipes terceiras':'Informe a data de início'}</div>`}
    </div>`;

    const cardCusto = `<div class="ps-prev-card">
      <div class="ps-prev-lbl"><i class="ti ti-currency-dollar"></i> Custo Projetado — MO Terceiro</div>
      <div class="ps-prev-val${prev.custoTerc?'':' vazio'}">${prev.custoTerc?fmtMoeda(prev.custoTerc):'—'}</div>
      <div class="ps-prev-sub">
        ${prev.hhRestTerc?fmtNum(prev.hhRestTerc,0)+' HH restantes ×':''}
        <select class="ps-sel-valor" id="ps-valor-hh">${valorOpts}</select>
      </div>
    </div>`;

    return `<div class="ps-card">
      <div class="ps-card-titulo"><i class="ti ti-target"></i> Projeção</div>
      <div class="ps-projecao-config">
        <div class="ps-cap-bloco">
          <label class="ps-flbl"><i class="ti ti-calendar"></i> Data início projeção</label>
          <input type="date" class="ps-date-input" id="ps-dt-inicio" value="${_dtInicio}">
        </div>
        <div class="ps-cap-sep"></div>
        <div class="ps-cap-bloco">
          <label class="ps-flbl"><i class="ti ti-users"></i> Eq. MO Própria</label>
          <div class="ps-num-input">
            <button class="ps-num-btn" data-action="dec-prop">−</button>
            <span>${_nEqProp}</span>
            <button class="ps-num-btn" data-action="inc-prop">+</button>
          </div>
          <div class="ps-cap-sub">${fmtNum(hhMesProp(_nEqProp),0)}h/mês</div>
        </div>
        <div class="ps-cap-sep"></div>
        <div class="ps-cap-bloco">
          <label class="ps-flbl"><i class="ti ti-building-factory"></i> Eq. MO Terceiro</label>
          <div class="ps-num-input">
            <button class="ps-num-btn" data-action="dec-terc">−</button>
            <span>${_nEqTerc}</span>
            <button class="ps-num-btn" data-action="inc-terc">+</button>
          </div>
          <div class="ps-cap-sub">${_nEqTerc>0?fmtNum(hhMesTerc(_nEqTerc),0)+'h/mês':'—'}</div>
        </div>
        ${_nEqTerc>0?`
        <div class="ps-cap-sep"></div>
        <div class="ps-cap-bloco">
          <label class="ps-flbl"><i class="ti ti-calendar"></i> Início eq. terceiro</label>
          <input type="date" class="ps-date-input" id="ps-dt-inicio-terc" value="${_dtInicioTerc}">
        </div>`:''}
      </div>
      <div class="ps-prev-grid">
        ${cardSit}${cardProp}${_nEqTerc>0?cardTerc:''}${_nEqTerc>0?cardCusto:''}
      </div>

      ${htmlBlocosMO(lista)}
      <div class="ps-bloco-mo" style="border-right:none;padding:0;border-top:1px solid var(--border)">
        ${htmlCurvaS(lista)}
      </div>
    </div>`;
  }


  /* ── Helpers Curva S inline ── */
  function _curvaIdealFn(dtIni, totalHH, hhDia) {
    const pts=[]; let acum=0, d=new Date(dtIni+'T12:00:00');
    pts.push({d:new Date(d),hh:0}); let g=0;
    while(acum<totalHH&&g<500){
      g++; if(d.getDay()!==0) acum=Math.min(acum+hhDia,totalHH);
      d=new Date(d); d.setDate(d.getDate()+1); pts.push({d:new Date(d),hh:acum});
    }
    return pts;
  }
  function _dataConcFn(dtIni, hhRest, hhDia) {
    if(hhRest<=0) return new Date(dtIni+'T12:00:00');
    let d=new Date(dtIni+'T12:00:00'), cont=0;
    const mx=hhRest/Math.max(hhDia,1);
    while(cont<mx&&cont<500){d=new Date(d);d.setDate(d.getDate()+1);if(d.getDay()!==0)cont++;}
    return d;
  }

  function desenharCurvaS(cvEl, lista) {
    if (!_dtInicio||!lista.length) return;
    const dpr=window.devicePixelRatio||1;
    const W=cvEl.offsetWidth||760;
    const H=260;
    cvEl.width=Math.round(W*dpr);
    cvEl.height=Math.round(H*dpr);
    cvEl.style.width=W+'px';
    cvEl.style.height=H+'px';
    const ctx=cvEl.getContext('2d');
    ctx.scale(dpr,dpr);
    const _listaVal=lista.filter(o=>!_isCan(o));
    const totalHH=_listaVal.reduce((s,o)=>s+(o.hh_prev_os||0),0);
    if(!totalHH) return;
    const hhEnc=_listaVal.filter(o=>o.status_os&&o.status_os.toLowerCase().includes('encerr')).reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const hhDia=HH_DIA_COLAB*PESSOAS_EQ*_nEqProp;
    const hojeIso=new Date().toISOString().split('T')[0];
    const hoje=new Date(hojeIso+'T12:00:00');
    const dtIniDt=new Date(_dtInicio+'T12:00:00');
    const hhRest=Math.max(0,totalHH-hhEnc);
    const dtConc=_dataConcFn(hojeIso,hhRest,hhDia);
    const ideal=_curvaIdealFn(_dtInicio,totalHH,hhDia);
    const real=[{d:dtIniDt,hh:0},{d:new Date(hoje),hh:hhEnc}];
    const proj=[{d:new Date(hoje),hh:hhEnc}];
    let a=hhEnc, d2=new Date(hoje), g=0;
    while(a<totalHH&&g<500){g++;d2=new Date(d2);d2.setDate(d2.getDate()+1);if(d2.getDay()!==0)a=Math.min(a+hhDia,totalHH);proj.push({d:new Date(d2),hh:a});}
    const PAD={t:26,r:12,b:28,l:48};
    const cW=W-PAD.l-PAD.r, cH=H-PAD.t-PAD.b;
    const ax=PAD.l, ay=PAD.t;
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);
    const tMin=dtIniDt.getTime(), tMax=dtConc.getTime();
    function px(d){return ax+Math.max(0,Math.min(1,(d.getTime()-tMin)/(tMax-tMin)))*cW;}
    function py(hh){return ay+cH-(hh/totalHH)*cH;}
    // Grid
    const nG=4;
    for(let i=0;i<=nG;i++){
      const y=ay+(i/nG)*cH, hh=totalHH*(1-i/nG);
      ctx.strokeStyle='#e8e8e8';ctx.lineWidth=0.8;ctx.setLineDash([]);
      ctx.beginPath();ctx.moveTo(ax,y);ctx.lineTo(ax+cW,y);ctx.stroke();
      ctx.fillStyle='#6b7280';ctx.font='bold 8px Arial';ctx.textAlign='right';
      ctx.fillText(Math.round(hh)+'h',ax-4,y+3);
    }
    // Riscas verticais semana
    const ms=new Date(dtIniDt); while(ms.getDay()!==1) ms.setDate(ms.getDate()+1);
    ctx.strokeStyle='#eeeeee';ctx.lineWidth=0.6;ctx.setLineDash([2,2]);
    while(ms.getTime()<=tMax){const x=px(ms);ctx.beginPath();ctx.moveTo(x,ay);ctx.lineTo(x,ay+cH);ctx.stroke();ms.setDate(ms.getDate()+7);}
    ctx.setLineDash([]);
    // Labels X meses
    const meses=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    ctx.fillStyle='#6b7280';ctx.font='bold 8.5px Arial';ctx.textAlign='center';
    let dm=new Date(dtIniDt.getFullYear(),dtIniDt.getMonth(),1);
    while(dm.getTime()<=tMax){
      const x=px(dm);
      if(x>ax+10&&x<=ax+cW-10) ctx.fillText(meses[dm.getMonth()]+'/'+String(dm.getFullYear()).slice(2),x,ay+cH+18);
      dm=new Date(dm.getFullYear(),dm.getMonth()+1,1);
    }
    // Ideal
    ctx.beginPath();ctx.strokeStyle='#1d4ed8';ctx.lineWidth=2.5;ctx.setLineDash([]);
    ideal.forEach((pt,i)=>i===0?ctx.moveTo(px(pt.d),py(pt.hh)):ctx.lineTo(px(pt.d),py(pt.hh)));
    ctx.stroke();
    // Projeção área+linha
    ctx.beginPath();ctx.moveTo(px(proj[0].d),py(0));
    proj.forEach(pt=>ctx.lineTo(px(pt.d),py(pt.hh)));
    ctx.lineTo(px(proj[proj.length-1].d),py(0));
    ctx.closePath();ctx.fillStyle='rgba(134,239,172,0.15)';ctx.fill();
    ctx.beginPath();ctx.strokeStyle='#22c55e';ctx.lineWidth=2.5;ctx.setLineDash([7,4]);
    proj.forEach((pt,i)=>i===0?ctx.moveTo(px(pt.d),py(pt.hh)):ctx.lineTo(px(pt.d),py(pt.hh)));
    ctx.stroke();ctx.setLineDash([]);
    // Real
    ctx.beginPath();ctx.strokeStyle='#16a34a';ctx.lineWidth=3;
    real.forEach((pt,i)=>i===0?ctx.moveTo(px(pt.d),py(pt.hh)):ctx.lineTo(px(pt.d),py(pt.hh)));
    ctx.stroke();
    const lr=real[real.length-1];
    ctx.beginPath();ctx.arc(px(lr.d),py(lr.hh),4.5,0,Math.PI*2);ctx.fillStyle='#16a34a';ctx.fill();
    ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
    // Label início
    const xIni=px(dtIniDt),yIni=py(0);
    ctx.beginPath();ctx.arc(xIni,yIni,4,0,Math.PI*2);ctx.fillStyle='#16a34a';ctx.fill();
    // Hoje
    const xH=px(hoje);
    ctx.strokeStyle='#111';ctx.lineWidth=1.5;ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.moveTo(xH,ay);ctx.lineTo(xH,ay+cH);ctx.stroke();ctx.setLineDash([]);
    const hjW=34,hjH=13;
    ctx.fillStyle='#111';ctx.beginPath();ctx.roundRect(xH-hjW/2,ay-hjH-2,hjW,hjH,2);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 7.5px Arial';ctx.textAlign='center';
    ctx.fillText('HOJE',xH,ay-4);
    // Legenda
    const LX=ax,LY=12;
    ctx.font='bold 8px Arial';ctx.textAlign='left';ctx.setLineDash([]);
    ctx.strokeStyle='#1d4ed8';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.moveTo(LX,LY);ctx.lineTo(LX+18,LY);ctx.stroke();
    ctx.fillStyle='#374151';ctx.fillText('Plano ideal',LX+22,LY+3);
    ctx.strokeStyle='#16a34a';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(LX+96,LY);ctx.lineTo(LX+114,LY);ctx.stroke();
    ctx.fillStyle='#374151';ctx.fillText('Realizado',LX+118,LY+3);
    ctx.strokeStyle='#22c55e';ctx.lineWidth=2.5;ctx.setLineDash([6,3]);
    ctx.beginPath();ctx.moveTo(LX+190,LY);ctx.lineTo(LX+208,LY);ctx.stroke();
    ctx.setLineDash([]);ctx.fillStyle='#374151';ctx.fillText('Projeção',LX+212,LY+3);

    // Badge atraso / adiantado no canto superior direito do gráfico
    if (_dtInicio && hhDia > 0 && totalHH > 0) {
      const _idealD=_curvaIdealFn(_dtInicio,totalHH,hhDia);
      const _hojeD2=new Date(); _hojeD2.setHours(12,0,0,0);
      let _hhIdealH=0;
      for(const pt of _idealD){if(pt.d<=_hojeD2)_hhIdealH=pt.hh; else break;}
      const _diasD=Math.round((hhEnc-_hhIdealH)/Math.max(hhDia,1));
      const _bdgLbl=_diasD===0?'Em dia':_diasD>0?`+${_diasD}D`:`${_diasD}D`;
      const _bdgCor=_diasD>=0?'#16a34a':'#dc2626';
      ctx.font='bold 9px Arial';
      const _bW=ctx.measureText(_bdgLbl).width+14;
      const _bX=ax+cW-_bW-4, _bY=ay+6;
      ctx.fillStyle=_bdgCor;
      ctx.beginPath();ctx.roundRect(_bX,_bY,_bW,16,3);ctx.fill();
      ctx.fillStyle='#fff';ctx.textAlign='center';
      ctx.fillText(_bdgLbl,_bX+_bW/2,_bY+11);
    }
  }

  function htmlCurvaS(lista) {
    if (!_dtInicio) return '';
    const exp=_curvaExpanded;
    const icon=exp?'ti-chevron-up':'ti-chevron-down';
    const hdr=`<div class="ps-curva-hdr" data-action="toggle-curva">
      <i class="ti ti-chart-line" aria-hidden="true"></i>
      <span class="ps-bloco-mo-sub-titulo" style="margin:0">Curva S</span>
      <i class="ti ${icon} ps-curva-chev"></i>
    </div>`;
    if (!exp) return hdr;
    const hhTot=lista.reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const encL=lista.filter(o=>o.status_os&&o.status_os.toLowerCase().includes('encerr'));
    const hhEnc=encL.reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const pOS=lista.length>0?Math.round(encL.length/lista.length*100):0;
    const pHH=hhTot>0?Math.round(hhEnc/hhTot*100):0;
    const pontos=lista.filter(o=>{const sl=(o.status_os||'').toLowerCase();if(sl.includes('cancel')||sl.includes('suspend'))return false;return !o.cod_servico||String(o.cod_servico)==='1';});
    const ptTotal=pontos.length;
    const ptEnc=pontos.filter(o=>o.status_os&&o.status_os.toLowerCase().includes('encerr')).length;
    const cor=p=>p>=70?'var(--green)':p>=40?'var(--amber)':'var(--red)';
    const prev=calcPrevisao(lista);
    return `${hdr}<div class="ps-curva-body">
      <div class="ps-kpi-grid" style="border:none;border-top:1px solid var(--border);grid-template-columns:repeat(auto-fit,minmax(100px,1fr))">
        <div class="ps-kpi"><div class="ps-kpi-lbl">HH Executado</div><div class="ps-kpi-val" style="font-size:16px">${fmtNum(hhEnc,0)}<span style="font-size:11px">/${fmtNum(hhTot,0)}h</span></div><div class="ps-kpi-sub">${fmtNum(hhTot-hhEnc,0)}h restantes</div></div>
        <div class="ps-kpi"><div class="ps-kpi-lbl">OS Executadas</div><div class="ps-kpi-val" style="font-size:16px">${encL.length}<span style="font-size:11px">/${lista.length}</span></div><div class="ps-kpi-sub">${lista.length-encL.length} pendentes</div></div>
        <div class="ps-kpi"><div class="ps-kpi-lbl">Pontos</div><div class="ps-kpi-val" style="font-size:16px">${ptEnc}<span style="font-size:11px">/${ptTotal} PT</span></div><div class="ps-kpi-sub">${Math.round(ptTotal>0?ptEnc/ptTotal*100:0)}% encerrados</div></div>
        <div class="ps-kpi"><div class="ps-kpi-lbl">% OS Enc.</div><div class="ps-kpi-val" style="font-size:16px;color:${cor(pOS)}">${pOS}%</div><div class="ps-kpi-bar"><div class="ps-kpi-fill" style="width:${pOS}%;background:${cor(pOS)}"></div></div></div>
        <div class="ps-kpi"><div class="ps-kpi-lbl">% HH Enc.</div><div class="ps-kpi-val" style="font-size:16px;color:${cor(pHH)}">${pHH}%</div><div class="ps-kpi-bar"><div class="ps-kpi-fill" style="width:${pHH}%;background:${cor(pHH)}"></div></div></div>
        ${prev.prop?`<div class="ps-kpi"><div class="ps-kpi-lbl">Previsão conclusão</div><div class="ps-kpi-val" style="font-size:14px">${prev.prop}</div><div class="ps-kpi-sub">${prev.mesesProp?prev.mesesProp+' meses':''}</div></div>`:''}
      </div>
      <canvas id="ps-curva-canvas" style="display:block;width:100%;border-top:1px solid var(--border)"></canvas>
    </div>`;
  }

  /* ── Pareto Setor × Criticidade (substitui tabela antiga) ── */
  function htmlTabelaSetor(lista, moTipo) {
    const osMO = moTipo === 'proprio'
      ? lista.filter(o => o.proj_mo_tipo === 'proprio' || !o.proj_mo_tipo)
      : lista.filter(o => o.proj_mo_tipo === 'terceiro');

    const osValidas = osMO.filter(o => o.proj_criticidade && (o.desc_setor||o.setor));
    if (!osValidas.length) return '<div class="ps-tab-vazio">Sem dados com setor e criticidade definidos</div>';

    // Construir matriz por setor: HH e Pontos por criticidade
    const setoresSet = [...new Set(osValidas.map(o=>o.desc_setor||o.setor))];
    const data = {};
    setoresSet.forEach(s => { data[s] = {hh:{alta:0,media:0,baixa:0}, pts:{alta:0,media:0,baixa:0}}; });
    osValidas.forEach(o => {
      const s = o.desc_setor||o.setor;
      const cr = o.proj_criticidade;
      if (!data[s] || !cr) return;
      data[s].hh[cr]  = (data[s].hh[cr]||0) + (o.hh_prev_os||0);
      const _psl=(o.status_os||'').toLowerCase();
      if ((!o.cod_servico||String(o.cod_servico)==='1')&&!_psl.includes('cancel')&&!_psl.includes('suspend'))
        data[s].pts[cr] = (data[s].pts[cr]||0) + 1;
    });

    const isHH   = _visaoSetor !== 'pts';
    const chave  = isHH ? 'hh' : 'pts';
    const unid   = isHH ? 'h' : '';
    const label  = isHH ? 'HH' : 'Pontos';

    const setores = setoresSet.map(s => {
      const v = data[s][chave];
      const total = (v.alta||0)+(v.media||0)+(v.baixa||0);
      return {s, v, total};
    }).filter(d=>d.total>0).sort((a,b)=>b.total-a.total);

    if (!setores.length) return '<div class="ps-tab-vazio">Sem dados</div>';

    const totalGeral = setores.reduce((sum,d)=>sum+d.total,0);
    const maxVal = setores[0].total;

    // Acumulado
    let acum = 0;
    const rows = setores.map(d => {
      acum += d.total;
      const pctAcum = Math.round(acum/totalGeral*100);
      const pct     = Math.round(d.total/totalGeral*100);
      return {...d, pct, pctAcum};
    });

    // índice do corte 80%
    const corteIdx = rows.findIndex(d=>d.pctAcum>=80);

    // Toggle
    const toggle = `<div style="display:flex;gap:4px;margin-bottom:10px">
      <button class="ps-pareto-toggle${isHH?' on':''}" data-action="set-visao-setor" data-val="hh">${label==='HH'?'<b>HH</b>':'HH'}</button>
      <button class="ps-pareto-toggle${!isHH?' on':''}" data-action="set-visao-setor" data-val="pts">${!isHH?'<b>Pontos</b>':'Pontos'}</button>
    </div>`;

    // Barras pareto
    const barsHtml = rows.map((d,i) => {
      const wA = maxVal>0?(d.v.alta||0)/maxVal*100:0;
      const wM = maxVal>0?(d.v.media||0)/maxVal*100:0;
      const wB = maxVal>0?(d.v.baixa||0)/maxVal*100:0;
      const corAcum = d.pctAcum<=80?'#dc2626':'var(--color-text-tertiary)';
      const divider = (corteIdx>=0&&i===corteIdx+1)
        ? `<div class="ps-pareto-divider"><span>corte 80%</span></div>` : '';
      return divider+`<div class="ps-pareto-row">
        <div class="ps-pareto-lbl" title="${d.s}">${d.s}</div>
        <div class="ps-pareto-bar-wrap">
          <div class="ps-pareto-bar">
            ${d.v.alta>0?`<div style="width:${wA.toFixed(1)}%;background:#ef4444;height:100%"></div>`:''}
            ${d.v.media>0?`<div style="width:${wM.toFixed(1)}%;background:#f59e0b;height:100%"></div>`:''}
            ${d.v.baixa>0?`<div style="width:${wB.toFixed(1)}%;background:#22c55e;height:100%"></div>`:''}
          </div>
        </div>
        <div class="ps-pareto-val">${fmtNum(d.total,0)}${unid}</div>
        <div class="ps-pareto-acum" style="color:${corAcum}">${d.pctAcum}%</div>
      </div>`;
    }).join('');

    // Legenda barras
    const legenda = `<div style="display:flex;gap:12px;margin-top:8px;font-size:10px;color:var(--color-text-secondary)">
      <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:2px;background:#ef4444;display:inline-block"></span>Alta</span>
      <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:2px;background:#f59e0b;display:inline-block"></span>Média</span>
      <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:2px;background:#22c55e;display:inline-block"></span>Baixa</span>
      <span style="color:var(--color-text-tertiary);margin-left:4px">% = acumulado</span>
    </div>`;

    // Tabela compacta
    const tabHtml = `<table class="ps-pareto-tab">
      <thead><tr>
        <th>#</th><th>Setor</th>
        <th style="text-align:right">${label}</th>
        <th style="text-align:right">%</th>
        <th style="text-align:right">Acum.</th>
      </tr></thead>
      <tbody>${rows.map((d,i)=>`<tr${d.pctAcum<=80?' class="ps-pareto-top"':''}>
        <td style="color:var(--color-text-tertiary)">${i+1}</td>
        <td title="${d.s}" style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.s}</td>
        <td style="text-align:right;font-weight:500">${fmtNum(d.total,0)}${unid}</td>
        <td style="text-align:right;color:var(--color-text-secondary)">${d.pct}%</td>
        <td style="text-align:right;font-weight:500;color:${d.pctAcum<=80?'#dc2626':'var(--color-text-secondary)'}">${d.pctAcum}%</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr>
        <td colspan="2" style="font-weight:500">Total</td>
        <td style="text-align:right;font-weight:500">${fmtNum(totalGeral,0)}${unid}</td>
        <td style="text-align:right">100%</td><td></td>
      </tr></tfoot>
    </table>`;

    return `<div>
      ${toggle}
      <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:16px;align-items:start">
        <div>${barsHtml}${legenda}</div>
        <div>${tabHtml}</div>
      </div>
    </div>`;
  }

  /* ── 3 Cenários de previsão ── */
  function htmlCenarios(lista, moTipo, nEq, hhMesFn) {
    const osMO = (moTipo === 'proprio'
      ? lista.filter(o => o.proj_mo_tipo === 'proprio' || !o.proj_mo_tipo)
      : lista.filter(o => o.proj_mo_tipo === 'terceiro')
    ).filter(o => !_isCan(o));

    const cenarios = [
      { label: 'Só Alta criticidade',      crits: ['alta'],                isTudo: false },
      { label: 'Alta + Média criticidade', crits: ['alta','media'],        isTudo: false },
      { label: 'Toda demanda',             crits: [],                      isTudo: true  },
    ];

    const hhMes   = hhMesFn(nEq);
    const hhDiario = HH_DIA_COLAB * PESSOAS_EQ * nEq;

    // Calcular HH de cada cenário antecipadamente para delta
    const hhCenarios = cenarios.map(cen =>
      (cen.isTudo ? osMO : osMO.filter(o=>cen.crits.includes(o.proj_criticidade)))
        .reduce((s,o)=>s+(o.hh_prev_os||0),0)
    );

    const rows = cenarios.map((cen, idx) => {
      const osC    = cen.isTudo ? osMO : osMO.filter(o=>cen.crits.includes(o.proj_criticidade));
      const hhTot  = hhCenarios[idx];
      const hhEnc  = osC.filter(o=>o.status_os&&o.status_os.toLowerCase().includes('encerr')).reduce((s,o)=>s+(o.hh_prev_os||0),0);
      const hhRest = Math.max(0, hhTot - hhEnc);

      // Previsão + dias — projeta a partir de hoje se há execução, ou da data início
      const _hoje = new Date().toISOString().split('T')[0];
      const _startCen = moTipo === 'terceiro'
        ? (_dtInicioTerc || _dtInicio)
        : (hhEnc > 0 ? _hoje : _dtInicio);
      let previsao = '—';
      if (_startCen && hhDiario > 0 && hhRest > 0) {
        const res = calcDataConclusao(_startCen, hhRest, hhDiario);
        if (res) previsao = res.data + ' <span class="ps-cen-dias">('+res.dias+' dias)</span>';
      } else if (hhRest === 0 && hhTot > 0) {
        previsao = 'Concluído';
      } else if (nEq === 0) {
        previsao = 'Sem equipes';
      } else if (!_startCen) {
        previsao = moTipo === 'terceiro' ? 'Informe início da equipe' : '—';
      }

      // Delta — cenário 1 compara c/ 0, cenário 2 compara com cenário 1
      let delta = '';
      if (idx > 0) {
        const hhAnt = hhCenarios[idx - 1]; // sempre compara com anterior imediato
        if (hhAnt > 0 && hhTot > hhAnt) {
          const pct = Math.round((hhTot - hhAnt) / hhAnt * 100);
          delta = `<span class="ps-delta">+${pct}% vs anterior</span>`;
        }
      }

      const corLabel = ['#dc2626','#d97706','#6b7280'][idx];
      return `<div class="ps-cen-row">
        <div class="ps-cen-label" style="border-left:3px solid ${corLabel}">${cen.label}${delta}</div>
        <div class="ps-cen-hh">${fmtNum(hhTot,0)}h</div>
        <div class="ps-cen-prev">${previsao}</div>
      </div>`;
    }).join('');

    const hint = !_dtInicio
      ? 'Informe a data de início para ver previsões'
      : nEq === 0 ? 'Configure equipes para ver previsões' : '';

    return `<div class="ps-cen-wrap">${rows}${hint?`<div class="ps-cen-hint">${hint}</div>`:''}</div>`;
  }

  function htmlListaOS(lista) {
    const critBadge = c => {
      if (!c) return `<span class="ps-badge" style="color:#9ca3af;background:#f3f4f6">—</span>`;
      const m={alta:['Alta','#dc2626','#fee2e2'],media:['Média','#d97706','#fef3c7'],baixa:['Baixa','#16a34a','#dcfce7']};
      const [l,col,bg]=m[c]||['?','#9ca3af','#f3f4f6'];
      return `<span class="ps-badge" style="color:${col};background:${bg}">${l}</span>`;
    };
    const moBadge = m => {
      if (!m) return `<span class="ps-badge" style="color:#9ca3af;background:#f3f4f6">—</span>`;
      return m==='proprio'
        ?`<span class="ps-badge" style="color:#2563eb;background:#dbeafe">Próprio</span>`
        :`<span class="ps-badge" style="color:#d97706;background:#fef3c7">Terceiro</span>`;
    };
    const tipoBadge = t => t
      ?`<span class="ps-badge" style="color:#7c3aed;background:#ede9fe">${t}</span>`
      :`<span class="ps-badge" style="color:#9ca3af;background:#f3f4f6">—</span>`;

    if (!lista.length) return `<div class="ps-lista-empty"><i class="ti ti-inbox"></i> Nenhuma OS encontrada</div>`;

    return lista.map(o=>{
      const enc = o.status_os&&o.status_os.toLowerCase().includes('encerr');
      const expanded = _osExpandida===o.os;
      const verFotos = _osVerFotos===o.os;
      const fotosOS  = _fotos[o.os]||[];
      const tiposOpts = _tipos.map(t=>`<option value="${t.nome}"${o.proj_tipo_intervencao===t.nome?' selected':''}>${t.nome}</option>`).join('');
      const nFotos   = fotosOS.length;

      const expandHtml = expanded ? `<div class="ps-os-expand">
        <div class="ps-os-edit-grid">
          <div class="ps-os-edit-bloco">
            <label class="ps-flbl">Tipo de Intervenção</label>
            <select class="ps-sel" data-action="set-tipo" data-os="${o.os}">
              <option value="">— Não definido —</option>
              ${tiposOpts}
            </select>
          </div>
          <div class="ps-os-edit-bloco">
            <label class="ps-flbl">Criticidade</label>
            <div class="ps-crit-opts">
              <button class="ps-crit-btn${o.proj_criticidade==='alta'?' ativo':''}" data-action="set-crit" data-os="${o.os}" data-val="alta" style="--cc:#dc2626">Alta</button>
              <button class="ps-crit-btn${o.proj_criticidade==='media'?' ativo':''}" data-action="set-crit" data-os="${o.os}" data-val="media" style="--cc:#d97706">Média</button>
              <button class="ps-crit-btn${o.proj_criticidade==='baixa'?' ativo':''}" data-action="set-crit" data-os="${o.os}" data-val="baixa" style="--cc:#16a34a">Baixa</button>
            </div>
          </div>
          <div class="ps-os-edit-bloco">
            <label class="ps-flbl">MO</label>
            <div class="ps-mo-opts">
              <button class="ps-mo-btn${o.proj_mo_tipo==='proprio'?' ativo':''}" data-action="set-mo" data-os="${o.os}" data-val="proprio">Próprio</button>
              <button class="ps-mo-btn${o.proj_mo_tipo==='terceiro'?' ativo':''}" data-action="set-mo" data-os="${o.os}" data-val="terceiro">Terceiro</button>
            </div>
          </div>
        </div>
      </div>` : '';

      const fotosHtml = verFotos ? `<div class="ps-fotos-wrap">
        <div class="ps-fotos-titulo">
          <span>Fotos (${nFotos})</span>
          <label class="ps-btn-upload" title="Adicionar foto">
            <i class="ti ti-upload"></i> Adicionar
            <input type="file" accept="image/*" data-action="upload-foto" data-os="${o.os}" style="display:none" multiple>
          </label>
        </div>
        <div class="ps-fotos-grid">
          ${fotosOS.map(f=>`
            <div class="ps-foto-item">
              <img src="${f.url}" alt="${f.nome||''}" loading="lazy" data-action="ver-foto" data-url="${f.url}" data-nome="${(f.nome||'').replace(/"/g,'&quot;')}" style="cursor:zoom-in">
              <button class="ps-foto-del" data-action="del-foto" data-id="${f.id}" data-os="${o.os}" data-url="${f.url}" title="Remover"><i class="ti ti-x"></i></button>
            </div>`).join('')}
          ${!fotosOS.length?'<div style="font-size:10px;color:#9ca3af;padding:8px">Nenhuma foto adicionada</div>':''}
        </div>
      </div>` : '';

      return `<div class="ps-os-row${enc?' enc':''}" data-os="${o.os}">
        <div class="ps-os-head" data-action="toggle-os" data-os="${o.os}">
          <span class="ps-os-num">${o.os}</span>
          <span class="ps-os-desc ps-os-desc-mob">${o.desc_servico||o.desc_os||'—'}</span>
          <span class="ps-os-hh">${o.hh_prev_os?fmtNum(o.hh_prev_os,0)+' HH':'—'}</span>
          <div class="ps-os-badges">
            ${tipoBadge(o.proj_tipo_intervencao)}
            ${critBadge(o.proj_criticidade)}
            ${moBadge(o.proj_mo_tipo)}
          </div>
          <button class="ps-foto-btn${nFotos>0?' tem-fotos':''}" data-action="toggle-fotos" data-os="${o.os}" title="${nFotos>0?nFotos+' foto(s)':'Adicionar fotos'}">
            <i class="ti ti-photo"></i>${nFotos>0?`<span>${nFotos}</span>`:''}
          </button>
          <i class="ti ti-chevron-down ps-os-chev${expanded?' rot':''}"></i>
        </div>
        ${expandHtml}
        ${fotosHtml}
      </div>`;
    }).join('');
  }

  function htmlFiltrosLista() {
    const critOpts=[['alta','Alta','#dc2626','#fee2e2'],['media','Média','#d97706','#fef3c7'],['baixa','Baixa','#16a34a','#dcfce7']];
    const statusOpts=[
      ['encerrada','Encerrada','#16a34a','#dcfce7'],
      ['programada','Programada','#d97706','#fef3c7'],
      ['andamento','Em andamento','#2563eb','#dbeafe'],
    ];
    const setores = setoresDistintos();
    const setorOpts = setores.map(s=>`<option value="${s}"${s===_filtSetor?' selected':''}>${s}</option>`).join('');
    return `<div class="ps-lista-filtros">
      <span class="ps-flbl-inline">Criticidade:</span>
      ${critOpts.map(([v,l,col,bg])=>`<span class="ps-chip${_filtCrit.includes(v)?' ativo':''}" data-crit="${v}" style="--chip-c:${col};--chip-bg:${bg}">${l}</span>`).join('')}
      <div class="ps-fsep"></div>
      <span class="ps-flbl-inline">MO:</span>
      <span class="ps-chip${_filtMO==='proprio'?' ativo':''}" data-mo="proprio">Próprio</span>
      <span class="ps-chip${_filtMO==='terceiro'?' ativo':''}" data-mo="terceiro">Terceiro</span>
      <div class="ps-fsep"></div>
      <span class="ps-flbl-inline">Status:</span>
      ${statusOpts.map(([v,l,col,bg])=>`<span class="ps-chip${_filtStatus.includes(v)?' ativo':''}" data-status="${v}" style="--chip-c:${col};--chip-bg:${bg}">${l}</span>`).join('')}
      ${setores.length?`<div class="ps-fsep"></div><select class="ps-sel-setor" id="ps-sel-setor"><option value="">Todos os setores</option>${setorOpts}</select>`:''}
    </div>`;
  }

  /* ══════════════════════════════════════
     RENDERIZAR
  ══════════════════════════════════════ */
  function renderizar() {
    const lista    = osFiltradas();
    const metricas = osParaMetricas();
    _container.innerHTML = `<div class="ps-mod">
      ${htmlFiltros()}
      ${htmlKPIs(metricas)}
      ${htmlProjecao(metricas)}
      ${(()=>{
        const _hhTG = metricas.reduce((s,o)=>s+(o.hh_prev_os||0),0);
        const _hhEG = metricas.filter(o=>o.status_os&&o.status_os.toLowerCase().includes('encerr')).reduce((s,o)=>s+(o.hh_prev_os||0),0);
        const _hhRG = Math.max(0,_hhTG-_hhEG);
        return `<div class="ps-aviso-terc">
          <div class="ps-aviso-terc-inner" style="gap:16px;flex-wrap:wrap">
            <i class="ti ti-info-circle" style="flex-shrink:0"></i>
            <div style="display:flex;flex-direction:column;gap:2px">
              <span style="font-size:10px;color:#92400e">Custo se 100% terceirizado</span>
              <strong style="font-size:15px">${fmtMoeda(_hhTG*_valorHH)}</strong>
              <span class="ps-aviso-sub">${fmtNum(_hhTG,0)} HH × R$${_valorHH}/HH</span>
            </div>
            <div style="width:1px;background:#fcd34d;align-self:stretch"></div>
            <div style="display:flex;flex-direction:column;gap:2px">
              <span style="font-size:10px;color:#92400e">Custo se terceirizado o restante</span>
              <strong style="font-size:15px">${fmtMoeda(_hhRG*_valorHH)}</strong>
              <span class="ps-aviso-sub">${fmtNum(_hhRG,0)} HH restantes × R$${_valorHH}/HH</span>
            </div>
          </div>
        </div>`;
      })()}
      <div class="ps-card">
        <div class="ps-lista-hdr">
          <div style="display:flex;align-items:center;gap:8px;width:100%;flex-wrap:wrap">
            <div class="ps-card-titulo" style="border:none;padding:0"><i class="ti ti-list"></i> Lista de OS <span class="ps-lista-count">${lista.length}</span></div>
            <input type="text" id="ps-busca" class="ps-busca-input" placeholder="Pesquisar..." value="${_filtBusca}" style="flex:1;min-width:140px;max-width:260px">
            <div style="margin-left:auto;display:flex;gap:6px">
              <button class="ps-btn-primary" id="btn-relatorio" style="flex-shrink:0"><i class="ti ti-external-link"></i> Abrir Relatório</button>
              <button class="ps-btn-primary" id="btn-slide" style="flex-shrink:0"><i class="ti ti-chart-line"></i> Curva S</button>
            </div>
          </div>
          ${htmlFiltrosLista()}
        </div>
        <div class="ps-lista">${htmlListaOS(lista)}</div>
      </div>
    </div>`;
    bindEventos();
    if (_curvaExpanded && _dtInicio) {
      const _cv=_container.querySelector('#ps-curva-canvas');
      if (_cv) desenharCurvaS(_cv, osParaMetricas());
    }
  }

  /* ══════════════════════════════════════
     EVENTOS
  ══════════════════════════════════════ */
  function bindEventos() {
    const c = _container;

    /* Equipe */
    c.querySelector('#ps-sel-equipe').addEventListener('change', async e=>{
      _filtEquipe=e.target.value; _filtTipos=[];
      await carregarOS(); await carregarFotos(_os); renderizar();
    });

    /* Chips tipo — usa mousedown para evitar blur cancelar */
    c.querySelectorAll('.ps-chip[data-tipo]').forEach(chip=>{
      chip.addEventListener('mousedown', e=>{
        e.preventDefault(); e.stopPropagation();
        const t=chip.dataset.tipo;
        if (_filtTipos.includes(t)) _filtTipos=_filtTipos.filter(x=>x!==t);
        else _filtTipos.push(t);
        carregarOS().then(()=>carregarFotos(_os)).then(renderizar);
      });
    });

    /* Chips criticidade */
    c.querySelectorAll('.ps-chip[data-crit]').forEach(chip=>{
      chip.addEventListener('mousedown', e=>{
        e.preventDefault();
        const v=chip.dataset.crit;
        if (_filtCrit.includes(v)) _filtCrit=_filtCrit.filter(x=>x!==v);
        else _filtCrit.push(v);
        renderizar();
      });
    });

    /* Filtro status */
    c.querySelectorAll('.ps-chip[data-status]').forEach(chip=>{
      chip.addEventListener('mousedown', e=>{
        e.preventDefault();
        const v=chip.dataset.status;
        if (_filtStatus.includes(v)) _filtStatus=_filtStatus.filter(x=>x!==v);
        else _filtStatus.push(v);
        renderizar();
      });
    });

    /* Filtro setor */
    const selSetor = c.querySelector('#ps-sel-setor');
    if (selSetor) selSetor.addEventListener('change', e=>{ _filtSetor=e.target.value; renderizar(); });

    /* Chips MO */
    c.querySelectorAll('.ps-chip[data-mo]').forEach(chip=>{
      chip.addEventListener('mousedown', e=>{
        e.preventDefault();
        _filtMO=_filtMO===chip.dataset.mo?'':chip.dataset.mo;
        renderizar();
      });
    });

    /* Botões add/edit tipos */
    const btnAdd=c.querySelector('#btn-add-tipo');
    if (btnAdd) btnAdd.addEventListener('click', e=>{ e.stopPropagation(); modalAdicionarTipo(); });
    const btnEdit=c.querySelector('#btn-edit-tipos');
    if (btnEdit) btnEdit.addEventListener('click', e=>{ e.stopPropagation(); modalEditarTipos(); });

    /* Data início */
    c.querySelector('#ps-dt-inicio').addEventListener('change', e=>{ _dtInicio=e.target.value; renderizar(); });

    /* Data início equipe terceiro */
    const inpDtTerc = c.querySelector('#ps-dt-inicio-terc');
    if (inpDtTerc) inpDtTerc.addEventListener('change', e=>{ _dtInicioTerc=e.target.value; renderizar(); });

    /* Busca por texto */
    const inpBusca = c.querySelector('#ps-busca');
    if (inpBusca) inpBusca.addEventListener('input', e=>{
      _filtBusca = e.target.value;
      clearTimeout(window._psBuscaTimer);
      window._psBuscaTimer = setTimeout(()=>{
        renderizar();
        const nb = _container.querySelector('#ps-busca');
        if (nb) { nb.focus(); nb.setSelectionRange(_filtBusca.length, _filtBusca.length); }
      }, 250);
    });

    /* Valor HH */
    const selValor=c.querySelector('#ps-valor-hh');
    if (selValor) selValor.addEventListener('change', e=>{ _valorHH=parseInt(e.target.value); renderizar(); });

    /* Capacidade +/− */
    c.querySelectorAll('[data-action]').forEach(btn=>{
      if (!btn.dataset.action) return;
      btn.addEventListener('click', async e=>{
        e.stopPropagation();
        const a=btn.dataset.action, os=btn.dataset.os;
        switch(a){
          case 'toggle-curva': _curvaExpanded=!_curvaExpanded; renderizar(); break;
          case 'set-visao-setor': _visaoSetor=btn.dataset.val; renderizar(); break;
          case 'inc-prop': _nEqProp++; renderizar(); break;
          case 'dec-prop': if(_nEqProp>1)_nEqProp--; renderizar(); break;
          case 'inc-terc': _nEqTerc++; renderizar(); break;
          case 'dec-terc': if(_nEqTerc>0)_nEqTerc--; renderizar(); break;
          case 'toggle-os':
            _osExpandida=_osExpandida===os?null:os;
            if (_osExpandida) _osVerFotos=null;
            renderizar(); break;
          case 'toggle-fotos':
            _osVerFotos=_osVerFotos===os?null:os;
            if (_osVerFotos) _osExpandida=null;
            renderizar(); break;
          case 'set-crit':
            await salvarCampo(os,'proj_criticidade',btn.dataset.val);
            renderizar(); break;
          case 'set-mo':
            await salvarCampo(os,'proj_mo_tipo',btn.dataset.val);
            renderizar(); break;
          case 'del-foto':
            await deletarFoto(parseInt(btn.dataset.id), os, btn.dataset.url); break;
          case 'ver-foto':
            abrirLightbox(btn.dataset.url, btn.dataset.nome); break;
        }
      });
    });

    /* Select tipo na OS */
    c.querySelectorAll('select[data-action="set-tipo"]').forEach(sel=>{
      sel.addEventListener('change', async e=>{
        await salvarCampo(sel.dataset.os,'proj_tipo_intervencao',e.target.value||null);
        renderizar();
      });
    });

    /* Upload de foto */
    c.querySelectorAll('input[data-action="upload-foto"]').forEach(inp=>{
      inp.addEventListener('change', async e=>{
        const files=[...e.target.files]; const os=inp.dataset.os;
        for (const f of files) await uploadFoto(os,f);
      });
    });

    /* Relatório PDF */
    const btnRel = c.querySelector('#btn-relatorio');
    if (btnRel) btnRel.addEventListener('click', ()=>gerarRelatorio());

    /* Slide */
    const btnSlide = c.querySelector('#btn-slide');
    if (btnSlide) btnSlide.addEventListener('click', ()=>gerarSlide());
  }

  /* ══════════════════════════════════════
     MODAIS
  ══════════════════════════════════════ */
  function modalAdicionarTipo() {
    const o=document.createElement('div'); o.className='ps-overlay';
    o.innerHTML=`<div class="ps-modal">
      <div class="ps-modal-titulo">Novo Tipo de Intervenção</div>
      <label class="ps-flbl">Nome</label>
      <input type="text" id="nt-nome" class="ps-sel" style="width:100%;height:36px;margin-top:4px" placeholder="Ex: Acoplamento">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="ps-modal-cancel" style="flex:1">Cancelar</button>
        <button class="ps-btn-primary" id="nt-ok" style="flex:2"><i class="ti ti-check"></i> Salvar</button>
      </div>
    </div>`;
    const inp=o.querySelector('#nt-nome');
    o.querySelector('#nt-ok').addEventListener('click', async()=>{
      const nome=inp.value.trim(); if (!nome) return;
      await getDB().from('proj_tipos_intervencao').insert({nome,ativo:true});
      o.remove(); await carregarTipos(); renderizar();
    });
    o.querySelector('.ps-modal-cancel').addEventListener('click',()=>o.remove());
    o.addEventListener('click',e=>{if(e.target===o)o.remove();});
    document.body.appendChild(o); inp.focus();
  }

  function modalEditarTipos() {
    const o=document.createElement('div'); o.className='ps-overlay';
    const itens=_tipos.map(t=>`
      <div class="ps-tipo-item" data-id="${t.id}" data-nome="${t.nome}">
        <input class="ps-tipo-input" value="${t.nome}" data-old="${t.nome}">
        <button class="ps-btn-sm" data-action="save-tipo" data-id="${t.id}" title="Salvar"><i class="ti ti-check"></i></button>
        <button class="ps-btn-sm red" data-action="del-tipo" data-id="${t.id}" title="Desativar"><i class="ti ti-trash"></i></button>
      </div>`).join('');
    o.innerHTML=`<div class="ps-modal" style="width:340px">
      <div class="ps-modal-titulo">Tipos de Intervenção</div>
      <div class="ps-tipos-list">${itens||'<div style="font-size:11px;color:#9ca3af;padding:8px">Nenhum tipo</div>'}</div>
      <button class="ps-modal-cancel" style="width:100%;margin-top:12px">Fechar</button>
    </div>`;

    o.querySelectorAll('[data-action="save-tipo"]').forEach(btn=>{
      btn.addEventListener('click', async()=>{
        const item=btn.closest('.ps-tipo-item');
        const inp=item.querySelector('.ps-tipo-input');
        const nomeAntigo=inp.dataset.old;
        const nomeNovo=inp.value.trim();
        if (!nomeNovo||nomeNovo===nomeAntigo) return;
        await renomearTipo(parseInt(btn.dataset.id), nomeAntigo, nomeNovo);
        inp.dataset.old=nomeNovo;
        btn.style.background='#dcfce7'; setTimeout(()=>btn.style.background='',1000);
        renderizar();
      });
    });

    o.querySelectorAll('[data-action="del-tipo"]').forEach(btn=>{
      btn.addEventListener('click', async()=>{
        if (!confirm('Desativar este tipo? As OS com este tipo não serão alteradas.')) return;
        await getDB().from('proj_tipos_intervencao').update({ativo:false}).eq('id',parseInt(btn.dataset.id));
        o.remove(); await carregarTipos(); renderizar();
      });
    });

    o.querySelector('.ps-modal-cancel').addEventListener('click',()=>o.remove());
    o.addEventListener('click',e=>{if(e.target===o)o.remove();});
    document.body.appendChild(o);
  }

  /* ── Lightbox ── */
  function abrirLightbox(url, nome) {
    const o = document.createElement('div');
    o.className = 'ps-lightbox';
    o.innerHTML = `
      <div class="ps-lightbox-inner">
        <button class="ps-lightbox-close" id="ps-lb-close"><i class="ti ti-x"></i></button>
        ${nome ? `<div class="ps-lightbox-nome">${nome}</div>` : ''}
        <img src="${url}" alt="${nome||''}">
      </div>`;
    o.addEventListener('click', e => { if (e.target === o) o.remove(); });
    o.querySelector('#ps-lb-close').addEventListener('click', () => o.remove());
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { o.remove(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(o);
  }


  /* ══════════════════════════════════════
     RELATÓRIO PDF
  ══════════════════════════════════════ */
  function gerarCodigoRelatorio() {
    const agora = new Date();
    const dd = String(agora.getDate()).padStart(2,'0');
    const mm = String(agora.getMonth()+1).padStart(2,'0');
    const seq = String(Math.floor(Math.random()*99)+1).padStart(2,'0');
    return `MAN-CAL-PRJSEG.${mm}${dd}.${seq}`;
  }

  function statusLabel(s) {
    if (!s) return {l:'Programada',c:'#d97706',b:'#fef3c7'};
    const sl = s.toLowerCase();
    if (sl.includes('encerr'))                              return {l:'Encerrada',    c:'#16a34a',b:'#dcfce7'};
    if (sl.includes('andamento')||sl.includes('execu'))     return {l:'Em andamento', c:'#2563eb',b:'#dbeafe'};
    if (sl.includes('program')||sl.includes('gerada')||sl.includes('aberta')) return {l:'Programada',c:'#d97706',b:'#fef3c7'};
    if (sl.includes('cancel')||sl.includes('suspend'))      return {l:'Cancelada',    c:'#dc2626',b:'#fee2e2'};
    return {l:s,c:'#6b7280',b:'#f3f4f6'};
  }

  function critLabel(c) {
    if (!c) return {l:'—',cor:'#9ca3af',bg:'#f3f4f6'};
    const m={alta:{l:'Alta',cor:'#dc2626',bg:'#fee2e2'},media:{l:'Média',cor:'#d97706',bg:'#fef3c7'},baixa:{l:'Baixa',cor:'#16a34a',bg:'#dcfce7'}};
    return m[c]||{l:c,cor:'#6b7280',bg:'#f3f4f6'};
  }

  function gerarSlide() {
    if (!_dtInicio) { alert('Informe a data de início do projeto antes de gerar o slide.'); return; }
    const lista = osParaMetricas();
    if (!lista.length) { alert('Nenhuma OS encontrada.'); return; }

    // ── Montar URL para slide.html ──
    const tiposStr = _filtTipos.join('|');
    const qs = 'equipe='   + encodeURIComponent(_filtEquipe)
             + '&tipos='   + encodeURIComponent(tiposStr)
             + '&inicio='  + encodeURIComponent(_dtInicio)
             + '&nEqProp=' + _nEqProp
             + '&nEqTerc=' + _nEqTerc;

    const a = document.createElement('a');
    a.href = 'slide.html?' + qs;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function gerarRelatorio() {
    var lista = osFiltradas();
    if (!lista.length) { alert('Nenhuma OS para gerar relatório.'); return; }

    // Criar overlay do modal
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center';
    
    var modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:10px;padding:18px;width:320px;box-shadow:0 8px 30px rgba(0,0,0,.15)';
    modal.innerHTML =
      '<div style="font-size:14px;font-weight:700;margin-bottom:4px">Abrir Relatório</div>' +
      '<div style="font-size:11px;color:#6b7280;margin-bottom:14px">Como deseja exibir as fotos?</div>' +
      '<div id="rel-opts" style="display:flex;flex-direction:column;gap:8px">' +
        '<button id="opc-none" style="display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;cursor:pointer;font-family:inherit;text-align:left">' +
          '<span style="font-size:22px">📄</span>' +
          '<span><b style="display:block;font-size:12px">Sem fotos</b><span style="font-size:10px;color:#374151">Leve e rápido · ideal para e-mail</span></span>' +
        '</button>' +
        '<button id="opc-comp" style="display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;cursor:pointer;font-family:inherit;text-align:left">' +
          '<span style="font-size:22px">🗜</span>' +
          '<span><b style="display:block;font-size:12px">Fotos comprimidas</b><span style="font-size:10px;color:#374151">Equilibrado · ~5MB estimado</span></span>' +
        '</button>' +
        '<button id="opc-orig" style="display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;cursor:pointer;font-family:inherit;text-align:left">' +
          '<span style="font-size:22px">📷</span>' +
          '<span><b style="display:block;font-size:12px">Fotos originais</b><span style="font-size:10px;color:#374151">Alta qualidade · arquivo maior</span></span>' +
        '</button>' +
        '<button id="opc-cancel" style="width:100%;margin-top:4px;padding:7px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-size:10px;color:#374151">Cancelar</button>' +
      '</div>';
    ov.appendChild(modal);
    document.body.appendChild(ov);

    function fechar() { document.body.removeChild(ov); }

    function abrir(fotos) {
      fechar();
      var codigo = gerarCodigoRelatorio();
      var agora  = new Date();
      var dtStr  = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
      var totalHH = 0;
      for (var i=0; i<lista.length; i++) totalHH += (lista[i].hh_prev_os||0);

      var qs = 'equipe='  + encodeURIComponent(_filtEquipe)
             + '&tipos='  + encodeURIComponent(_filtTipos.join('|'))
             + '&crits='  + encodeURIComponent(_filtCrit.join(','))
             + '&mo='     + encodeURIComponent(_filtMO||'')
             + '&status=' + encodeURIComponent(_filtStatus.join(','))
             + '&cod='    + encodeURIComponent(codigo)
             + '&dt='     + encodeURIComponent(dtStr)
             + '&hh='     + Math.round(totalHH)
             + '&fotos='  + fotos;

      var a = document.createElement('a');
      a.href = 'relatorio.html?' + qs;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    document.getElementById('opc-none').onclick   = function() { abrir('none'); };
    document.getElementById('opc-comp').onclick   = function() { abrir('compressed'); };
    document.getElementById('opc-orig').onclick   = function() { abrir('original'); };
    document.getElementById('opc-cancel').onclick = function() { fechar(); };
    ov.onclick = function(e) { if (e.target === ov) fechar(); };
  }




  /* ══════════════════════════════════════
     CSS
  ══════════════════════════════════════ */
  function injetarCSS() {
    if (document.getElementById('ps-style')) return;
    const s=document.createElement('style'); s.id='ps-style';
    s.textContent=`
.ps-mod{display:flex;flex-direction:column;gap:12px;}
.ps-card{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
.ps-card-titulo{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#374151;display:flex;align-items:center;gap:6px;padding:10px 14px;border-bottom:1px solid var(--border);}
.ps-card-titulo i{font-size:13px;}

/* Filtros */
.ps-filtros{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:12px 16px;}
.ps-filtro-row{display:flex;gap:0;flex-wrap:wrap;align-items:stretch;}
.ps-filtro-bloco{display:flex;flex-direction:column;gap:6px;padding:0 16px 0 0;}
.ps-filtro-equipe{min-width:120px;flex-shrink:0;}
.ps-filtro-sep-v{width:1px;background:var(--border);flex-shrink:0;margin:0 16px;}
.ps-flbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b5563;display:flex;align-items:center;gap:5px;}
.ps-flbl-inline{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b5563;flex-shrink:0;}
.ps-sel{height:30px;padding:0 9px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px;color:#374151;background:var(--bg);}
.ps-chips-wrap{display:flex;gap:5px;flex-wrap:wrap;align-items:center;min-height:26px;}
.ps-chip{padding:3px 10px;border-radius:20px;border:1px solid var(--border);background:var(--bg);font-size:10px;font-weight:600;color:#374151;cursor:pointer;user-select:none;flex-shrink:0;}
.ps-chip.ativo{border-color:var(--chip-c,#7c3aed);background:var(--chip-bg,#ede9fe);color:var(--chip-c,#7c3aed);}
.ps-chip[data-tipo].ativo{border-color:#7c3aed;background:#ede9fe;color:#7c3aed;}
.ps-btn-sm{width:22px;height:22px;border:1px solid var(--border);border-radius:4px;background:var(--bg);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;color:#374151;flex-shrink:0;padding:0;}
.ps-btn-sm:hover{background:#1e1e1e;color:#fff;border-color:#1e1e1e;}
.ps-btn-sm.red:hover{background:#dc2626;border-color:#dc2626;color:#fff;}
.ps-fsep{width:1px;height:20px;background:var(--border);flex-shrink:0;}

/* KPIs */
.ps-kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);}
@media(max-width:600px){.ps-kpi-grid{grid-template-columns:repeat(2,1fr);}}
.ps-kpi{padding:13px 14px;border-right:1px solid var(--border);}
.ps-kpi:last-child{border-right:none;}
.ps-kpi-lbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b5563;margin-bottom:5px;}
.ps-kpi-val{font-size:22px;font-weight:700;line-height:1;margin-bottom:2px;color:#1a1a1a;}
.ps-kpi-sub{font-size:9px;color:#4b5563;}
.ps-kpi-bar{height:3px;border-radius:2px;background:var(--border);margin-top:7px;overflow:hidden;}
.ps-kpi-fill{height:100%;border-radius:2px;}

/* Projeção */
.ps-projecao-config{display:flex;gap:16px;padding:12px 14px;flex-wrap:wrap;align-items:flex-start;border-bottom:1px solid var(--border);}
.ps-cap-bloco{display:flex;flex-direction:column;gap:5px;}
.ps-cap-sep{width:1px;background:var(--border);flex-shrink:0;align-self:stretch;}
.ps-cap-sub{font-size:9px;color:#4b5563;}
.ps-num-input{display:flex;align-items:center;gap:6px;}
.ps-num-btn{width:26px;height:26px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);cursor:pointer;font-size:14px;font-weight:700;color:#374151;display:flex;align-items:center;justify-content:center;}
.ps-num-btn:hover{background:var(--yellow,#F8C100);border-color:#daa900;}
.ps-num-input span{font-size:16px;font-weight:700;color:#1a1a1a;min-width:24px;text-align:center;}
.ps-date-input{height:30px;padding:0 9px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px;color:#374151;background:var(--bg);}

/* Cards previsão */
.ps-prev-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0;border-top:1px solid var(--border);}
@media(max-width:600px){.ps-prev-grid{grid-template-columns:1fr;}}
.ps-prev-card{padding:14px 16px;border-right:1px solid var(--border);}
.ps-prev-card:last-child{border-right:none;}
.ps-prev-lbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b5563;margin-bottom:6px;display:flex;align-items:center;gap:5px;}
.ps-prev-lbl i{font-size:12px;}
.ps-prev-val{font-size:20px;font-weight:700;color:#1a1a1a;margin-bottom:3px;}
.ps-prev-val.vazio{color:#d1d5db;font-size:16px;}
.ps-prev-sub{font-size:9px;color:#4b5563;display:flex;align-items:center;gap:4px;}
.ps-sel-valor{height:22px;padding:0 5px;border:1px solid var(--border);border-radius:3px;font-family:var(--font);font-size:9px;color:#374151;background:var(--bg);}

/* Lista */
.ps-busca-input{height:28px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px;color:#374151;background:var(--bg);}
.ps-busca-input:focus{outline:none;border-color:#F8C100;}
.ps-lista-hdr{padding:10px 14px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:8px;}
.ps-lista-filtros{display:flex;gap:5px;align-items:center;flex-wrap:wrap;}
.ps-lista-count{padding:1px 7px;border-radius:10px;background:#f3f4f6;font-size:9px;font-weight:700;color:#4b5563;margin-left:4px;}
.ps-lista{overflow-x:auto;}
.ps-lista-empty{padding:24px;text-align:center;color:#4b5563;font-size:12px;display:flex;align-items:center;justify-content:center;gap:8px;}
.ps-os-row{border-bottom:1px solid var(--border);}
.ps-os-row:last-child{border-bottom:none;}
.ps-os-row.enc{opacity:.65;}
.ps-os-head{display:flex;align-items:center;gap:8px;padding:8px 14px;cursor:pointer;min-width:520px;}
.ps-os-head:hover{background:#fafafa;}
.ps-os-num{font-size:10px;font-weight:700;color:#374151;flex-shrink:0;width:75px;}
.ps-os-desc{font-size:11px;color:#374151;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ps-os-hh{font-size:10px;font-weight:600;color:#4b5563;flex-shrink:0;width:52px;text-align:right;}
.ps-os-badges{display:flex;gap:4px;flex-shrink:0;}
.ps-badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;}
.ps-os-chev{font-size:12px;color:#4b5563;flex-shrink:0;transition:transform .2s;}
.ps-os-chev.rot{transform:rotate(180deg);}
.ps-foto-btn{display:flex;align-items:center;gap:3px;height:22px;padding:0 7px;border:1px solid var(--border);border-radius:4px;background:var(--bg);cursor:pointer;font-size:10px;color:#4b5563;flex-shrink:0;}
.ps-foto-btn:hover{border-color:#2563eb;color:#2563eb;}
.ps-foto-btn.tem-fotos{border-color:#2563eb;color:#2563eb;background:#dbeafe;}
.ps-foto-btn span{font-size:9px;font-weight:700;}

/* OS expand */
.ps-os-expand{padding:10px 14px 12px;background:#fafafa;border-top:1px solid var(--border);}
.ps-os-edit-grid{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;}
.ps-os-edit-bloco{display:flex;flex-direction:column;gap:5px;min-width:130px;}
.ps-crit-opts,.ps-mo-opts{display:flex;gap:4px;}
.ps-crit-btn,.ps-mo-btn{height:26px;padding:0 9px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:10px;font-weight:600;color:#374151;cursor:pointer;}
.ps-crit-btn.ativo{background:var(--cc,#9ca3af);border-color:var(--cc,#9ca3af);color:#fff;}
.ps-mo-btn.ativo{background:var(--yellow,#F8C100);border-color:#daa900;color:#1a1a1a;}

/* Fotos */
.ps-fotos-wrap{padding:10px 14px 12px;background:#f9fafb;border-top:1px solid var(--border);}
.ps-fotos-titulo{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-size:10px;font-weight:700;color:#374151;}
.ps-btn-upload{display:flex;align-items:center;gap:4px;height:24px;padding:0 9px;border:1px solid var(--border);border-radius:4px;background:var(--bg);cursor:pointer;font-size:10px;font-weight:600;color:#374151;font-family:var(--font);}
.ps-btn-upload:hover{border-color:var(--yellow,#F8C100);background:#fffbeb;}
.ps-fotos-grid{display:flex;gap:8px;flex-wrap:wrap;}
.ps-foto-item{position:relative;width:80px;height:80px;border-radius:6px;overflow:hidden;border:1px solid var(--border);}
.ps-foto-item img{width:100%;height:100%;object-fit:cover;cursor:pointer;}
.ps-foto-item img:hover{opacity:.85;}
.ps-foto-del{position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.6);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;padding:0;}
.ps-foto-del:hover{background:#dc2626;}

/* Modais */
.ps-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}
.ps-modal{background:var(--card-bg);border-radius:var(--radius);box-shadow:0 8px 30px rgba(0,0,0,.15);padding:18px;width:300px;max-width:100%;}
.ps-modal-titulo{font-size:13px;font-weight:700;margin-bottom:12px;color:#1a1a1a;}
.ps-modal-cancel{padding:7px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:10px;font-weight:600;color:#374151;cursor:pointer;width:100%;}
.ps-btn-primary{height:28px;padding:0 12px;border:none;border-radius:var(--radius-sm);background:var(--yellow,#F8C100);font-family:var(--font);font-size:11px;font-weight:700;color:#1a1a1a;cursor:pointer;display:flex;align-items:center;gap:5px;justify-content:center;}
.ps-btn-secondary{height:28px;padding:0 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);font-family:var(--font);font-size:10px;font-weight:700;color:#374151;cursor:pointer;display:flex;align-items:center;gap:4px;flex-shrink:0;}
.ps-btn-secondary:hover{background:#f3f4f6;}
.ps-rel-opt{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);cursor:pointer;text-align:left;font-family:var(--font);transition:border-color .15s,background .15s;}
.ps-rel-opt:hover{border-color:var(--yellow);background:#fffbeb;}
.ps-rel-opt-icone{font-size:22px;flex-shrink:0;}
.ps-rel-opt-titulo{font-size:12px;font-weight:700;color:#1a1a1a;}
.ps-rel-opt-sub{font-size:10px;color:#374151;margin-top:2px;}
.ps-btn-primary:hover{background:#daa900;}
.ps-tipos-list{display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto;margin-bottom:4px;}
.ps-tipo-item{display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);}
.ps-tipo-input{flex:1;height:28px;padding:0 7px;border:1px solid var(--border);border-radius:4px;font-family:var(--font);font-size:11px;color:#374151;background:var(--bg);}
.ps-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;}
.ps-lightbox-inner{position:relative;max-width:90vw;max-height:90vh;display:flex;flex-direction:column;align-items:center;gap:8px;}
.ps-lightbox-inner img{max-width:100%;max-height:82vh;object-fit:contain;border-radius:6px;box-shadow:0 8px 40px rgba(0,0,0,.5);cursor:default;}
.ps-lightbox-nome{font-size:11px;color:rgba(255,255,255,.7);font-family:var(--font);}
.ps-lightbox-close{position:absolute;top:-12px;right:-12px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.15);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;backdrop-filter:blur(4px);}
.ps-lightbox-close:hover{background:rgba(220,38,38,.8);}

/* Blocos MO */
.ps-blocos-mo{display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px solid var(--border);}
@media(max-width:700px){
  .ps-blocos-mo{grid-template-columns:1fr;}
  .ps-kpi-grid{grid-template-columns:repeat(2,1fr);}
  .ps-prev-grid{grid-template-columns:1fr;}
  .ps-prev-card{border-right:none;border-bottom:1px solid var(--border);}
  .ps-prev-card:last-child{border-bottom:none;}
  .ps-projecao-config{flex-direction:column;gap:10px;}
  .ps-cap-sep{width:100%;height:1px;margin:0;}
  .ps-filtro-row{flex-direction:column;gap:10px;}
  .ps-filtro-sep-v{display:none;}
  .ps-os-desc-mob{white-space:normal!important;overflow:visible!important;text-overflow:unset!important;}
}
.ps-bloco-mo{padding:14px 16px;border-right:1px solid var(--border);}
.ps-bloco-mo:last-child{border-right:none;}
.ps-bloco-mo-titulo{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#374151;display:flex;align-items:center;gap:5px;margin-bottom:8px;}
.ps-bloco-mo-titulo i{font-size:13px;}
.ps-bloco-mo-sub-titulo{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4b5563;margin-bottom:6px;}

/* Pareto setor */
.ps-pareto-toggle{height:22px;padding:0 10px;border:0.5px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:10px;font-weight:600;color:#374151;cursor:pointer;}
.ps-pareto-toggle.on{background:var(--yellow,#F8C100);border-color:#daa900;color:#1a1a1a;}
.ps-pareto-row{display:flex;align-items:center;gap:6px;margin-bottom:5px;}
.ps-pareto-lbl{font-size:10px;color:var(--color-text-secondary);width:110px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ps-pareto-bar-wrap{flex:1;}
.ps-pareto-bar{height:16px;border-radius:2px;overflow:hidden;display:flex;background:var(--color-background-secondary);}
.ps-pareto-val{font-size:10px;font-weight:600;color:var(--color-text-primary);width:50px;text-align:right;flex-shrink:0;}
.ps-pareto-acum{font-size:10px;font-weight:600;width:30px;text-align:right;flex-shrink:0;}
.ps-pareto-divider{font-size:9px;color:#dc2626;padding:5px 0 3px;border-top:1px dashed #dc2626;margin:5px 0 4px;display:flex;align-items:center;gap:6px;}
.ps-pareto-tab{width:100%;font-size:10px;border-collapse:collapse;}
.ps-pareto-tab th{text-align:left;font-size:9px;font-weight:700;color:#4b5563;padding:4px 6px;border-bottom:1px solid var(--border);letter-spacing:.04em;text-transform:uppercase;}
.ps-pareto-tab td{padding:4px 6px;border-bottom:0.5px solid var(--border);color:var(--color-text-primary);font-size:10px;}
.ps-pareto-tab tfoot tr td{border-top:1px solid var(--border);border-bottom:none;font-weight:600;}
.ps-pareto-tab tr.ps-pareto-top td{background:var(--color-background-secondary);}
/* Tabela setor x criticidade (mantida para fallback) */
.ps-tabela-wrap{overflow-x:auto;}
.ps-tab-row{display:flex;border-bottom:1px solid var(--border);min-width:300px;}
.ps-tab-row:last-child{border-bottom:none;}
.ps-tab-head{background:#fafafa;}
.ps-tab-foot{background:#f9fafb;font-weight:700;}
.ps-tab-cell{padding:5px 8px;font-size:10px;color:#374151;flex:1;text-align:right;border-right:1px solid var(--border);}
.ps-tab-cell:last-child{border-right:none;}
.ps-tab-setor-col{flex:3;text-align:left;font-weight:600;min-width:140px;}
.ps-tab-crit{font-weight:700;}
.ps-tab-crit-narrow{flex:0.6;min-width:44px;}
.ps-tab-total{flex:1.2;font-weight:700;color:#374151;}
.ps-tab-pct{font-size:9px;color:#4b5563;font-weight:400;}
.ps-tab-vazio{font-size:10px;color:#4b5563;padding:8px 0;}
.ps-tabela-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}

/* Curva S inline */
.ps-curva-hdr{display:flex;align-items:center;gap:7px;padding:9px 14px;cursor:pointer;user-select:none;border-radius:0;}
.ps-curva-hdr:hover{background:#fafafa;}
.ps-curva-hdr .ti-chart-line{font-size:13px;color:#F8C100;}
.ps-curva-chev{font-size:12px;color:#4b5563;margin-left:auto;}
.ps-curva-body{border-top:1px solid var(--border);}
.ps-curva-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));border-bottom:1px solid var(--border);}
.ps-curva-kpi-item{padding:10px 12px;border-right:1px solid var(--border);}
.ps-curva-kpi-item:last-child{border-right:none;}
.ps-curva-kpi-val{font-size:15px;font-weight:700;color:#1a1a1a;margin-top:3px;}

/* Cenários */
.ps-cen-hdr{display:flex;gap:0;background:#fafafa;border:1px solid var(--border);border-bottom:none;border-radius:var(--radius-sm) var(--radius-sm) 0 0;}
.ps-cen-hdr span{flex:1;padding:5px 8px;font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4b5563;border-right:1px solid var(--border);}
.ps-cen-hdr span:first-child{flex:2;}
.ps-cen-hdr span:last-child{border-right:none;}
.ps-cen-wrap{border:1px solid var(--border);border-radius:0 0 var(--radius-sm) var(--radius-sm);overflow:hidden;}
.ps-cen-row{display:flex;align-items:center;border-bottom:1px solid var(--border);}
.ps-cen-row:last-child{border-bottom:none;}
.ps-cen-label{flex:2;padding:7px 8px;font-size:10px;font-weight:600;color:#374151;border-right:1px solid var(--border);display:flex;flex-direction:column;gap:2px;}
.ps-cen-hh{flex:1;padding:7px 8px;font-size:10px;font-weight:700;color:#374151;text-align:right;border-right:1px solid var(--border);}
.ps-cen-prev{flex:1;padding:7px 8px;font-size:10px;color:#374151;text-align:right;}
.ps-cen-hint{padding:6px 8px;font-size:9px;color:#4b5563;background:#fafafa;border-top:1px solid var(--border);}
.ps-delta{font-size:8px;font-weight:600;color:#d97706;background:#fef3c7;padding:1px 5px;border-radius:3px;width:fit-content;}
.ps-cen-dias{font-size:9px;color:#4b5563;font-weight:400;}
.ps-prev-obs{font-size:8px;color:#4b5563;font-style:italic;margin-top:4px;}
.ps-blocos-mo.ps-bloco-unico{grid-template-columns:1fr;}

/* Aviso custo terceirizado */
.ps-aviso-terc{background:#fffbeb;border:1px solid #fcd34d;border-radius:var(--radius);padding:10px 16px;}
.ps-aviso-terc-inner{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.ps-aviso-terc-inner i{font-size:16px;color:#d97706;flex-shrink:0;}
.ps-aviso-terc-inner span{font-size:11px;color:#92400e;}
.ps-aviso-terc-inner strong{font-size:16px;font-weight:700;color:#d97706;}
.ps-aviso-sub{font-size:9px;color:#d97706;opacity:.7;}

/* Filtro setor */
.ps-sel-setor{height:26px;padding:0 7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:10px;color:#374151;background:var(--bg);}
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════
     INIT
  ══════════════════════════════════════ */
  async function init(container) {
    _container=container; injetarCSS();
    _container.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:48px;color:#9ca3af;font-size:12px"><i class="ti ti-loader-2" style="font-size:18px;animation:cag-spin .8s linear infinite"></i> Carregando...</div>`;
    try { await carregarTudo(); renderizar(); }
    catch(e) {
      console.error('proj_caldeiraria:',e);
      _container.innerHTML=`<div style="padding:40px;text-align:center;color:#4b5563"><i class="ti ti-alert-circle" style="font-size:28px;display:block;margin-bottom:8px"></i>Erro: ${e.message}</div>`;
    }
  }

  return { init };
})();
