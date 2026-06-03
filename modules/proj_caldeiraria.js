/* ═══════════════════════════════════════════════════════════════
   MAN360 — Projetos Caldeiraria · Projetos de Segurança
   window.Modulos.proj_caldeiraria = { init(container) }
   ═══════════════════════════════════════════════════════════════ */

window.Modulos = window.Modulos || {};
window.Modulos.proj_caldeiraria = (() => {

  /* ── Estado ── */
  let _container  = null;
  let _equipes    = [];   // equipes distintas da base
  let _tipos      = [];   // proj_tipos_intervencao
  let _os         = [];   // ordens_servico filtradas
  let _filtEquipe = 'CAL31';
  let _filtTipos  = [];   // [] = todos
  let _filtCrit   = [];   // [] = todos
  let _filtMO     = '';   // '' = todos
  let _dtInicio   = '';
  let _nEqPropria = 1;
  let _nEqTerc    = 0;
  let _chartS     = null;
  let _osExpandida= null;

  /* ── Constantes ── */
  const HH_DIA_COLAB  = 7.33;
  const DIAS_MES_6X1  = 26;
  const HH_MES_TERC   = 176;
  const PESSOAS_EQ    = 2;

  function hhMesEquipePropria() { return HH_DIA_COLAB * DIAS_MES_6X1 * PESSOAS_EQ; }
  function hhMesEquipeTerc()    { return HH_MES_TERC  * PESSOAS_EQ; }

  /* ── Helpers ── */
  function fmtNum(n, dec) { return (n||0).toLocaleString('pt-BR',{minimumFractionDigits:dec||0,maximumFractionDigits:dec||0}); }
  function isoHoje() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

  /* ══════════════════════════════════════
     CARREGAR DADOS
  ══════════════════════════════════════ */
  async function carregarTipos() {
    const db = getDB();
    const { data } = await db.from('proj_tipos_intervencao').select('*').eq('ativo', true).order('nome');
    _tipos = data || [];
  }

  async function carregarEquipes() {
    const db = getDB();
    const { data } = await db.from('ordens_servico').select('equipe').not('equipe','is',null);
    const todas = [...new Set((data||[]).map(r=>r.equipe).filter(Boolean))].sort();
    _equipes = todas.filter(e => e.startsWith('CAL'));
    if (!_equipes.includes(_filtEquipe) && _equipes.length) _filtEquipe = _equipes[0];
  }

  async function carregarOS() {
    const db = getDB();
    let q = db.from('ordens_servico')
      .select('os, desc_os, desc_servico, hh_prev_os, hh_real_os, status_os, tipo_atividade, data_encerramento, proj_tipo_intervencao, proj_criticidade, proj_mo_tipo')
      .eq('equipe', _filtEquipe)
      .neq('tipo_atividade', 'MCU');

    if (_filtTipos.length) {
      q = q.in('proj_tipo_intervencao', _filtTipos);
    }
    const { data, error } = await q.order('os');
    if (error) console.error('carregarOS:', error);
    _os = data || [];
  }

  async function carregarTudo() {
    await Promise.all([carregarTipos(), carregarEquipes()]);
    await carregarOS();
  }

  /* ── Filtrar OS localmente ── */
  function osFiltradas() {
    return _os.filter(o => {
      if (_filtCrit.length && !_filtCrit.includes(o.proj_criticidade)) return false;
      if (_filtMO && o.proj_mo_tipo !== _filtMO) return false;
      return true;
    });
  }

  function osEncerradas(lista) {
    return lista.filter(o => o.status_os && o.status_os.toLowerCase().includes('encerr'));
  }

  /* ══════════════════════════════════════
     KPIs
  ══════════════════════════════════════ */
  function htmlKPIs(lista) {
    const total   = lista.length;
    const enc     = osEncerradas(lista).length;
    const hhTotal = lista.reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const hhEnc   = lista.filter(o=>o.status_os&&o.status_os.toLowerCase().includes('encerr')).reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const pctOS   = total>0 ? Math.round(enc/total*100) : 0;
    const pctHH   = hhTotal>0 ? Math.round(hhEnc/hhTotal*100) : 0;
    const cor = p => p>=70?'var(--green)':p>=40?'var(--amber)':'var(--red)';

    return `<div class="ps-kpi-grid">
      <div class="ps-kpi">
        <div class="ps-kpi-lbl">Qtd. OS</div>
        <div class="ps-kpi-val" style="color:var(--blue)">${fmtNum(total)}</div>
        <div class="ps-kpi-sub">${enc} encerradas</div>
      </div>
      <div class="ps-kpi">
        <div class="ps-kpi-lbl">HH Previsto</div>
        <div class="ps-kpi-val" style="color:var(--blue)">${fmtNum(hhTotal,1)}h</div>
        <div class="ps-kpi-sub">${fmtNum(hhEnc,1)}h encerradas</div>
      </div>
      <div class="ps-kpi">
        <div class="ps-kpi-lbl">% OS Encerradas</div>
        <div class="ps-kpi-val" style="color:${cor(pctOS)}">${pctOS}%</div>
        <div class="ps-kpi-bar"><div class="ps-kpi-fill" style="width:${pctOS}%;background:${cor(pctOS)}"></div></div>
      </div>
      <div class="ps-kpi">
        <div class="ps-kpi-lbl">% HH Encerrado</div>
        <div class="ps-kpi-val" style="color:${cor(pctHH)}">${pctHH}%</div>
        <div class="ps-kpi-bar"><div class="ps-kpi-fill" style="width:${pctHH}%;background:${cor(pctHH)}"></div></div>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════
     CURVA S
  ══════════════════════════════════════ */
  function calcularCurvaS(lista) {
    if (!_dtInicio) return null;
    const hhTotalProp = lista.filter(o=>o.proj_mo_tipo==='proprio'||!o.proj_mo_tipo).reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const hhTotalTerc = lista.filter(o=>o.proj_mo_tipo==='terceiro').reduce((s,o)=>s+(o.hh_prev_os||0),0);
    if (hhTotalProp===0 && hhTotalTerc===0) return null;

    const hhMesProp = hhMesEquipePropria() * _nEqPropria;
    const hhMesTerc = hhMesEquipeTerc()    * _nEqTerc;

    // Gerar pontos mês a mês
    const labels=[], dataProp=[], dataTerc=[];
    const dtIni = new Date(_dtInicio+'T12:00:00');

    let acumProp=0, acumTerc=0;
    const maxMeses = 36;

    for (let m=0;m<maxMeses;m++) {
      const d = new Date(dtIni);
      d.setMonth(d.getMonth()+m);
      const label = d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
      labels.push(label);

      if (hhTotalProp>0 && hhMesProp>0) {
        acumProp = Math.min(100, (((m+1)*hhMesProp)/hhTotalProp)*100);
      }
      if (hhTotalTerc>0 && hhMesTerc>0) {
        acumTerc = Math.min(100, (((m+1)*hhMesTerc)/hhTotalTerc)*100);
      }

      dataProp.push(hhTotalProp>0?parseFloat(acumProp.toFixed(1)):null);
      dataTerc.push(hhTotalTerc>0&&hhMesTerc>0?parseFloat(acumTerc.toFixed(1)):null);

      if (acumProp>=100 && (hhTotalTerc===0||acumTerc>=100)) break;
    }

    // Adicionar ponto zero no início
    labels.unshift(dtIni.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})+' (início)');
    dataProp.unshift(0);
    dataTerc.unshift(0);

    // Marcar % já concluída hoje
    const hhEncProp = lista.filter(o=>(o.proj_mo_tipo==='proprio'||!o.proj_mo_tipo)&&o.status_os&&o.status_os.toLowerCase().includes('encerr')).reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const hhEncTerc = lista.filter(o=>o.proj_mo_tipo==='terceiro'&&o.status_os&&o.status_os.toLowerCase().includes('encerr')).reduce((s,o)=>s+(o.hh_prev_os||0),0);
    const pctHoje = {
      prop: hhTotalProp>0?Math.round(hhEncProp/hhTotalProp*100):0,
      terc: hhTotalTerc>0?Math.round(hhEncTerc/hhTotalTerc*100):0,
    };

    return { labels, dataProp, dataTerc, hhTotalProp, hhTotalTerc, hhMesProp, hhMesTerc, pctHoje };
  }

  function renderizarCurvaS(lista) {
    const canvas = _container.querySelector('#ps-chart');
    if (!canvas) return;
    if (_chartS) { _chartS.destroy(); _chartS=null; }

    const curva = calcularCurvaS(lista);
    if (!curva) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      return;
    }

    const datasets = [];
    if (curva.hhTotalProp>0) {
      datasets.push({
        label: `MO Própria (${_nEqPropria} eq. · ${fmtNum(curva.hhMesProp,0)}h/mês)`,
        data: curva.dataProp,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,.08)',
        fill: true,
        tension: .4,
        pointRadius: 3,
        pointBackgroundColor: '#2563eb',
        borderWidth: 2,
      });
    }
    if (curva.hhTotalTerc>0 && _nEqTerc>0) {
      datasets.push({
        label: `MO Terceiro (${_nEqTerc} eq. · ${fmtNum(curva.hhMesTerc,0)}h/mês)`,
        data: curva.dataTerc,
        borderColor: '#d97706',
        backgroundColor: 'rgba(217,119,6,.06)',
        fill: true,
        tension: .4,
        pointRadius: 3,
        pointBackgroundColor: '#d97706',
        borderWidth: 2,
        borderDash: [5,3],
      });
    }

    if (!datasets.length) return;

    _chartS = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: curva.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position:'top', labels:{ font:{family:'Sora',size:10}, boxWidth:12 } },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}%`
            }
          },
          annotation: {
            annotations: {
              hoje: {
                type: 'line', scaleID: 'y', value: curva.pctHoje.prop,
                borderColor: 'rgba(22,163,74,.5)', borderWidth: 1,
                borderDash: [4,3],
                label: { display: true, content: `Atual: ${curva.pctHoje.prop}%`, font:{size:9}, position:'end' }
              }
            }
          }
        },
        scales: {
          x: { ticks:{ font:{family:'Sora',size:9} }, grid:{ color:'rgba(0,0,0,.04)' } },
          y: {
            min:0, max:100,
            ticks:{ font:{family:'Sora',size:9}, callback: v=>v+'%' },
            grid:{ color:'rgba(0,0,0,.04)' }
          }
        }
      }
    });
  }

  /* ══════════════════════════════════════
     HTML — FILTROS
  ══════════════════════════════════════ */
  function htmlFiltros() {
    const eqOpts = _equipes.map(e=>`<option value="${e}"${e===_filtEquipe?' selected':''}>${e}</option>`).join('');
    const tiposChips = _tipos.map(t=>{
      const sel = _filtTipos.includes(t.nome);
      return `<span class="ps-chip${sel?' ativo':''}" data-tipo="${t.nome}">${t.nome}</span>`;
    }).join('');

    return `<div class="ps-filtros">
      <div class="ps-filtro-row">
        <div class="ps-filtro-bloco">
          <label class="ps-flbl">Equipe</label>
          <select class="ps-sel" id="ps-sel-equipe">${eqOpts}</select>
        </div>
        <div class="ps-filtro-bloco" style="flex:1">
          <label class="ps-flbl">
            Tipo de Intervenção
            <button class="ps-btn-sm" id="btn-add-tipo" title="Adicionar tipo"><i class="ti ti-plus"></i></button>
          </label>
          <div class="ps-chips-wrap">
            ${tiposChips||'<span style="font-size:10px;color:#9ca3af">Nenhum tipo cadastrado</span>'}
            ${_tipos.length?`<button class="ps-btn-sm" id="btn-edit-tipos" title="Editar tipos"><i class="ti ti-pencil"></i></button>`:''}
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ── Capacidade / MO ── */
  function htmlCapacidade() {
    return `<div class="ps-capacidade">
      <div class="ps-cap-bloco">
        <label class="ps-flbl"><i class="ti ti-users"></i> Equipes MO Própria</label>
        <div class="ps-num-input">
          <button class="ps-num-btn" data-action="dec-prop">−</button>
          <span id="ps-n-prop">${_nEqPropria}</span>
          <button class="ps-num-btn" data-action="inc-prop">+</button>
        </div>
        <div class="ps-cap-sub">${fmtNum(hhMesEquipePropria()*_nEqPropria,0)}h/mês · ${_nEqPropria*PESSOAS_EQ} colaboradores</div>
      </div>
      <div class="ps-cap-sep"></div>
      <div class="ps-cap-bloco">
        <label class="ps-flbl"><i class="ti ti-building-factory"></i> Equipes MO Terceiro</label>
        <div class="ps-num-input">
          <button class="ps-num-btn" data-action="dec-terc">−</button>
          <span id="ps-n-terc">${_nEqTerc}</span>
          <button class="ps-num-btn" data-action="inc-terc">+</button>
        </div>
        <div class="ps-cap-sub">${_nEqTerc>0?fmtNum(hhMesEquipeTerc()*_nEqTerc,0)+'h/mês · '+(_nEqTerc*PESSOAS_EQ)+' colaboradores':'Não configurado'}</div>
      </div>
      <div class="ps-cap-sep"></div>
      <div class="ps-cap-bloco">
        <label class="ps-flbl"><i class="ti ti-calendar"></i> Data início projeção</label>
        <input type="date" class="ps-date-input" id="ps-dt-inicio" value="${_dtInicio}">
      </div>
    </div>`;
  }

  /* ── Lista de OS ── */
  function htmlListaOS(lista) {
    const critBadge = c => {
      if (!c) return '<span class="ps-badge" style="color:#9ca3af;background:#f3f4f6">—</span>';
      const map={alta:['Alta','#dc2626','#fee2e2'],media:['Média','#d97706','#fef3c7'],baixa:['Baixa','#16a34a','#dcfce7']};
      const [l,col,bg]=map[c]||['?','#9ca3af','#f3f4f6'];
      return `<span class="ps-badge" style="color:${col};background:${bg}">${l}</span>`;
    };
    const moBadge = m => {
      if (!m) return '<span class="ps-badge" style="color:#9ca3af;background:#f3f4f6">—</span>';
      return m==='proprio'
        ? '<span class="ps-badge" style="color:#2563eb;background:#dbeafe">Próprio</span>'
        : '<span class="ps-badge" style="color:#d97706;background:#fef3c7">Terceiro</span>';
    };
    const tipoBadge = t => t
      ? `<span class="ps-badge" style="color:#7c3aed;background:#ede9fe">${t}</span>`
      : '<span class="ps-badge" style="color:#9ca3af;background:#f3f4f6">—</span>';

    if (!lista.length) return `<div class="ps-lista-empty"><i class="ti ti-inbox"></i> Nenhuma OS encontrada com os filtros selecionados</div>`;

    return lista.map(o=>{
      const enc = o.status_os && o.status_os.toLowerCase().includes('encerr');
      const expanded = _osExpandida === o.os;
      const tiposOpts = _tipos.map(t=>`<option value="${t.nome}"${o.proj_tipo_intervencao===t.nome?' selected':''}>${t.nome}</option>`).join('');
      return `
        <div class="ps-os-row${enc?' enc':''}" data-os="${o.os}">
          <div class="ps-os-head" data-action="toggle-os" data-os="${o.os}">
            <span class="ps-os-num">${o.os}</span>
            <span class="ps-os-desc">${o.desc_servico||o.desc_os||'—'}</span>
            <span class="ps-os-hh">${o.hh_prev_os?fmtNum(o.hh_prev_os,0)+' HH':'—'}</span>
            <div class="ps-os-badges">
              ${tipoBadge(o.proj_tipo_intervencao)}
              ${critBadge(o.proj_criticidade)}
              ${moBadge(o.proj_mo_tipo)}
            </div>
            <i class="ti ti-chevron-down ps-os-chev${expanded?' rot':''}"></i>
          </div>
          ${expanded?`<div class="ps-os-expand">
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
          </div>`:''}
        </div>`;
    }).join('');
  }

  /* ── Filtros da lista ── */
  function htmlFiltrosLista() {
    const critOpts=[['alta','Alta','#dc2626','#fee2e2'],['media','Média','#d97706','#fef3c7'],['baixa','Baixa','#16a34a','#dcfce7']];
    return `<div class="ps-lista-filtros">
      <span class="ps-flbl" style="flex-shrink:0">Filtrar lista:</span>
      ${critOpts.map(([v,l,c,bg])=>`
        <span class="ps-chip${_filtCrit.includes(v)?' ativo':''}" data-crit="${v}" style="--chip-c:${c};--chip-bg:${bg}">${l}</span>
      `).join('')}
      <div class="ps-filtro-sep"></div>
      <span class="ps-chip${_filtMO==='proprio'?' ativo':''}" data-mo="proprio">Próprio</span>
      <span class="ps-chip${_filtMO==='terceiro'?' ativo':''}" data-mo="terceiro">Terceiro</span>
    </div>`;
  }

  /* ══════════════════════════════════════
     RENDERIZAR
  ══════════════════════════════════════ */
  function renderizar() {
    const lista = osFiltradas();
    _container.innerHTML = `<div class="ps-mod">

      <!-- Filtros principais -->
      ${htmlFiltros()}

      <!-- KPIs -->
      ${htmlKPIs(lista)}

      <!-- Capacidade + Curva S -->
      <div class="ps-card">
        <div class="ps-card-titulo"><i class="ti ti-chart-line"></i> Curva S — Projeção de Avanço</div>
        ${htmlCapacidade()}
        <div class="ps-chart-wrap${!_dtInicio?' ps-chart-vazio':''}">
          ${!_dtInicio
            ? '<div class="ps-chart-placeholder"><i class="ti ti-calendar-event"></i><span>Selecione a data de início para gerar a projeção</span></div>'
            : '<canvas id="ps-chart" height="260"></canvas>'
          }
        </div>
      </div>

      <!-- Lista OS -->
      <div class="ps-card">
        <div class="ps-lista-hdr">
          <div class="ps-card-titulo"><i class="ti ti-list"></i> Lista de Ordens de Serviço <span class="ps-lista-count">${lista.length}</span></div>
          ${htmlFiltrosLista()}
        </div>
        <div class="ps-lista" id="ps-lista">
          ${htmlListaOS(lista)}
        </div>
      </div>

    </div>`;

    bindEventos();
    if (_dtInicio) renderizarCurvaS(lista);
  }

  /* ══════════════════════════════════════
     BIND EVENTOS
  ══════════════════════════════════════ */
  function bindEventos() {
    const c = _container;

    // Equipe
    c.querySelector('#ps-sel-equipe').addEventListener('change', async e => {
      _filtEquipe = e.target.value; _filtTipos=[]; await carregarOS(); renderizar();
    });

    // Adicionar tipo
    const btnAdd = c.querySelector('#btn-add-tipo');
    if (btnAdd) btnAdd.addEventListener('click', () => modalAdicionarTipo());

    // Editar tipos
    const btnEdit = c.querySelector('#btn-edit-tipos');
    if (btnEdit) btnEdit.addEventListener('click', () => modalEditarTipos());

    // Chips de tipo de intervenção
    c.querySelectorAll('.ps-chip[data-tipo]').forEach(chip => {
      chip.addEventListener('click', () => {
        const t = chip.dataset.tipo;
        if (_filtTipos.includes(t)) _filtTipos = _filtTipos.filter(x=>x!==t);
        else _filtTipos.push(t);
        carregarOS().then(renderizar);
      });
    });

    // Chips criticidade
    c.querySelectorAll('.ps-chip[data-crit]').forEach(chip => {
      chip.addEventListener('click', () => {
        const v = chip.dataset.crit;
        if (_filtCrit.includes(v)) _filtCrit = _filtCrit.filter(x=>x!==v);
        else _filtCrit.push(v);
        renderizar();
      });
    });

    // Chips MO
    c.querySelectorAll('.ps-chip[data-mo]').forEach(chip => {
      chip.addEventListener('click', () => {
        const v = chip.dataset.mo;
        _filtMO = _filtMO === v ? '' : v;
        renderizar();
      });
    });

    // Capacidade +/−
    c.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async e => {
        const a = btn.dataset.action;
        const os = btn.dataset.os;
        switch(a) {
          case 'inc-prop': _nEqPropria++; renderizar(); break;
          case 'dec-prop': if(_nEqPropria>1)_nEqPropria--; renderizar(); break;
          case 'inc-terc': _nEqTerc++; renderizar(); break;
          case 'dec-terc': if(_nEqTerc>0)_nEqTerc--; renderizar(); break;
          case 'toggle-os':
            _osExpandida = _osExpandida===btn.dataset.os ? null : btn.dataset.os;
            renderizar(); break;
          case 'set-tipo': await salvarCampoOS(os,'proj_tipo_intervencao',btn.value); break;
          case 'set-crit': await salvarCampoOS(os,'proj_criticidade',btn.dataset.val); break;
          case 'set-mo':   await salvarCampoOS(os,'proj_mo_tipo',btn.dataset.val); break;
        }
      });
    });

    // Select tipo na OS expand
    c.querySelectorAll('select[data-action="set-tipo"]').forEach(sel => {
      sel.addEventListener('change', async e => {
        await salvarCampoOS(sel.dataset.os,'proj_tipo_intervencao',e.target.value||null);
      });
    });

    // Data início
    const dtInput = c.querySelector('#ps-dt-inicio');
    if (dtInput) dtInput.addEventListener('change', e => {
      _dtInicio = e.target.value;
      renderizar();
    });
  }

  /* ── Salvar campo na OS ── */
  async function salvarCampoOS(os, campo, valor) {
    const db = getDB();
    await db.from('ordens_servico').update({[campo]: valor||null}).eq('os', os);
    const idx = _os.findIndex(o=>o.os===os);
    if (idx>=0) _os[idx][campo] = valor||null;
    renderizar();
  }

  /* ── Modais de tipos ── */
  function modalAdicionarTipo() {
    const o = document.createElement('div'); o.className='ps-overlay';
    o.innerHTML=`<div class="ps-modal">
      <div class="ps-modal-titulo">Novo Tipo de Intervenção</div>
      <div class="ps-modal-form">
        <label class="ps-flbl">Nome</label>
        <input type="text" id="nt-nome" class="ps-sel" style="height:36px" placeholder="Ex: Acoplamento, Flangeamento...">
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="ps-modal-cancel" style="flex:1">Cancelar</button>
        <button class="ps-btn-primary" id="nt-ok" style="flex:2"><i class="ti ti-check"></i> Salvar</button>
      </div>
    </div>`;
    o.querySelector('#nt-ok').addEventListener('click', async () => {
      const nome = o.querySelector('#nt-nome').value.trim();
      if (!nome) return;
      const db = getDB();
      await db.from('proj_tipos_intervencao').insert({nome, ativo:true});
      o.remove(); await carregarTipos(); renderizar();
    });
    o.querySelector('.ps-modal-cancel').addEventListener('click', ()=>o.remove());
    o.addEventListener('click', e=>{ if(e.target===o) o.remove(); });
    document.body.appendChild(o);
    o.querySelector('#nt-nome').focus();
  }

  function modalEditarTipos() {
    const itens = _tipos.map(t=>`
      <div class="ps-tipo-item">
        <span style="flex:1;font-size:12px">${t.nome}</span>
        <button class="ps-btn-sm red" data-action="del-tipo" data-id="${t.id}" title="Desativar"><i class="ti ti-trash"></i></button>
      </div>`).join('');
    const o = document.createElement('div'); o.className='ps-overlay';
    o.innerHTML=`<div class="ps-modal" style="width:320px">
      <div class="ps-modal-titulo">Tipos de Intervenção</div>
      <div class="ps-tipos-list">${itens||'<div style="font-size:11px;color:#9ca3af;padding:8px">Nenhum tipo cadastrado</div>'}</div>
      <button class="ps-modal-cancel" style="width:100%;margin-top:12px">Fechar</button>
    </div>`;
    o.querySelectorAll('[data-action="del-tipo"]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        if (!confirm('Desativar este tipo?')) return;
        const db=getDB(); await db.from('proj_tipos_intervencao').update({ativo:false}).eq('id',parseInt(btn.dataset.id));
        o.remove(); await carregarTipos(); renderizar();
      });
    });
    o.querySelector('.ps-modal-cancel').addEventListener('click',()=>o.remove());
    o.addEventListener('click',e=>{if(e.target===o)o.remove();});
    document.body.appendChild(o);
  }

  /* ══════════════════════════════════════
     CSS
  ══════════════════════════════════════ */
  function injetarCSS() {
    if (document.getElementById('ps-style')) return;
    const s = document.createElement('style'); s.id='ps-style';
    s.textContent=`
.ps-mod{display:flex;flex-direction:column;gap:12px;}
.ps-card{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
.ps-card-titulo{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;display:flex;align-items:center;gap:6px;padding:10px 14px;border-bottom:1px solid var(--border);}
.ps-card-titulo i{font-size:13px;}

/* Filtros */
.ps-filtros{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:12px 14px;}
.ps-filtro-row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;}
.ps-filtro-bloco{display:flex;flex-direction:column;gap:5px;}
.ps-flbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;display:flex;align-items:center;gap:5px;}
.ps-flbl i{font-size:11px;}
.ps-sel{height:30px;padding:0 9px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px;color:#374151;background:var(--bg);cursor:pointer;}
.ps-chips-wrap{display:flex;gap:5px;flex-wrap:wrap;align-items:center;}
.ps-chip{padding:3px 10px;border-radius:20px;border:1px solid var(--border);background:var(--bg);font-size:10px;font-weight:600;color:#6b7280;cursor:pointer;user-select:none;}
.ps-chip.ativo{border-color:var(--chip-c,#2563eb);background:var(--chip-bg,#dbeafe);color:var(--chip-c,#2563eb);}
.ps-chip[data-tipo].ativo{border-color:#7c3aed;background:#ede9fe;color:#7c3aed;}
.ps-btn-sm{width:22px;height:22px;border:1px solid var(--border);border-radius:4px;background:var(--bg);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;color:#6b7280;flex-shrink:0;}
.ps-btn-sm:hover{background:var(--dark1,#1e1e1e);color:#fff;border-color:var(--dark1,#1e1e1e);}
.ps-btn-sm.red:hover{background:#dc2626;border-color:#dc2626;color:#fff;}
.ps-filtro-sep{width:1px;height:20px;background:var(--border);flex-shrink:0;}

/* KPIs */
.ps-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);}
@media(max-width:600px){.ps-kpi-grid{grid-template-columns:repeat(2,1fr);}}
.ps-kpi{padding:13px 14px;border-right:1px solid var(--border);}
.ps-kpi:last-child{border-right:none;}
.ps-kpi-lbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:5px;}
.ps-kpi-val{font-size:22px;font-weight:700;line-height:1;margin-bottom:2px;color:#1a1a1a;}
.ps-kpi-sub{font-size:9px;color:#9ca3af;}
.ps-kpi-bar{height:3px;border-radius:2px;background:var(--border);margin-top:7px;overflow:hidden;}
.ps-kpi-fill{height:100%;border-radius:2px;}

/* Capacidade */
.ps-capacidade{display:flex;gap:16px;padding:12px 14px;flex-wrap:wrap;align-items:flex-start;}
.ps-cap-bloco{display:flex;flex-direction:column;gap:5px;}
.ps-cap-sep{width:1px;background:var(--border);flex-shrink:0;align-self:stretch;}
.ps-cap-sub{font-size:9px;color:#9ca3af;}
.ps-num-input{display:flex;align-items:center;gap:6px;}
.ps-num-btn{width:26px;height:26px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);cursor:pointer;font-size:14px;font-weight:600;color:#374151;display:flex;align-items:center;justify-content:center;}
.ps-num-btn:hover{background:var(--yellow,#F8C100);border-color:var(--yellow,#F8C100);}
.ps-num-input span{font-size:16px;font-weight:700;color:#1a1a1a;min-width:24px;text-align:center;}
.ps-date-input{height:30px;padding:0 9px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px;color:#374151;background:var(--bg);}

/* Curva S */
.ps-chart-wrap{padding:14px;min-height:280px;position:relative;}
.ps-chart-vazio{display:flex;}
.ps-chart-placeholder{width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#9ca3af;min-height:200px;}
.ps-chart-placeholder i{font-size:32px;color:#d1d5db;}
.ps-chart-placeholder span{font-size:11px;}

/* Lista filtros */
.ps-lista-hdr{padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}
.ps-lista-filtros{display:flex;gap:5px;align-items:center;flex-wrap:wrap;}
.ps-lista-count{padding:1px 7px;border-radius:10px;background:#f3f4f6;font-size:9px;font-weight:700;color:#9ca3af;margin-left:4px;}

/* OS rows */
.ps-lista{overflow-x:auto;}
.ps-lista-empty{padding:24px;text-align:center;color:#9ca3af;font-size:12px;display:flex;align-items:center;justify-content:center;gap:8px;}
.ps-lista-empty i{font-size:20px;}
.ps-os-row{border-bottom:1px solid var(--border);}
.ps-os-row:last-child{border-bottom:none;}
.ps-os-row.enc{opacity:.65;}
.ps-os-head{display:flex;align-items:center;gap:8px;padding:8px 14px;cursor:pointer;min-width:520px;transition:background .12s;}
.ps-os-head:hover{background:#fafafa;}
.ps-os-num{font-size:10px;font-weight:700;color:#374151;flex-shrink:0;width:80px;font-variant-numeric:tabular-nums;}
.ps-os-desc{font-size:11px;color:#6b7280;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ps-os-hh{font-size:10px;font-weight:600;color:#9ca3af;flex-shrink:0;width:55px;text-align:right;}
.ps-os-badges{display:flex;gap:4px;flex-shrink:0;}
.ps-os-chev{font-size:12px;color:#9ca3af;flex-shrink:0;transition:transform .2s;}
.ps-os-chev.rot{transform:rotate(180deg);}
.ps-badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;}

/* OS expand */
.ps-os-expand{padding:10px 14px 12px;background:#fafafa;border-top:1px solid var(--border);}
.ps-os-edit-grid{display:flex;gap:16px;flex-wrap:wrap;}
.ps-os-edit-bloco{display:flex;flex-direction:column;gap:5px;min-width:140px;}
.ps-crit-opts,.ps-mo-opts{display:flex;gap:4px;}
.ps-crit-btn,.ps-mo-btn{height:26px;padding:0 9px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:10px;font-weight:600;color:#6b7280;cursor:pointer;}
.ps-crit-btn.ativo{background:var(--cc,#9ca3af);border-color:var(--cc,#9ca3af);color:#fff;}
.ps-mo-btn.ativo{background:var(--yellow,#F8C100);border-color:#daa900;color:#1a1a1a;}

/* Modais */
.ps-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}
.ps-modal{background:var(--card-bg);border-radius:var(--radius);box-shadow:0 8px 30px rgba(0,0,0,.15);padding:18px;width:300px;max-width:100%;}
.ps-modal-titulo{font-size:13px;font-weight:700;margin-bottom:12px;color:#1a1a1a;}
.ps-modal-form{display:flex;flex-direction:column;gap:6px;}
.ps-modal-cancel{padding:7px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:10px;font-weight:600;color:#6b7280;cursor:pointer;width:100%;}
.ps-btn-primary{height:28px;padding:0 12px;border:none;border-radius:var(--radius-sm);background:var(--yellow,#F8C100);font-family:var(--font);font-size:11px;font-weight:700;color:#1a1a1a;cursor:pointer;display:flex;align-items:center;gap:5px;justify-content:center;}
.ps-btn-primary:hover{background:#daa900;}
.ps-tipos-list{display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto;}
.ps-tipo-item{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);}
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════
     INIT
  ══════════════════════════════════════ */
  async function init(container) {
    _container = container;
    injetarCSS();
    _container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:48px;color:#9ca3af;font-size:12px"><i class="ti ti-loader-2" style="font-size:18px;animation:spin .8s linear infinite"></i> Carregando...</div>`;
    try {
      await carregarTudo();
      renderizar();
    } catch(e) {
      console.error('proj_caldeiraria:', e);
      _container.innerHTML = `<div style="padding:40px;text-align:center;color:#9ca3af"><i class="ti ti-alert-circle" style="font-size:28px;display:block;margin-bottom:8px"></i>Erro: ${e.message}</div>`;
    }
  }

  return { init };
})();
