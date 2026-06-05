/* ═══════════════════════════════════════════════════════
   MAN360 — Módulo: Programação Semanal
   ═══════════════════════════════════════════════════════ */
window.Modulos = window.Modulos || {};

window.Modulos.prog_semanal = {

  _s: {
    semanas: [], dadosSem: {}, activeSems: [],
    activeEqs: [], eqsPend: [], charts: {},
  },

  async init(container) {
    container.innerHTML = this._tpl();
    await this._carregar();
  },

  _tpl() {
    return `
<div class="filters-bar">
  <span class="filter-label">Equipes</span>
  <div class="dd-wrap">
    <button class="dd-btn" onclick="Modulos.prog_semanal._dd('dd-eq')">
      <i class="ti ti-users"></i><span class="dd-label" id="eq-label">—</span>
      <i class="ti ti-chevron-down dd-arrow"></i>
    </button>
    <div class="dd-panel" id="dd-eq">
      <div class="dd-actions">
        <button class="dd-action-btn primary" onclick="Modulos.prog_semanal._allEq(true)">Todas</button>
        <button class="dd-action-btn secondary" onclick="Modulos.prog_semanal._allEq(false)">Nenhuma</button>
      </div>
      <div id="eq-items"></div>
    </div>
  </div>
  <span class="filter-label">Semana</span>
  <div class="dd-wrap">
    <button class="dd-btn" onclick="Modulos.prog_semanal._dd('dd-sem')">
      <i class="ti ti-calendar"></i><span class="dd-label" id="sem-label">Carregando...</span>
      <i class="ti ti-chevron-down dd-arrow"></i>
    </button>
    <div class="dd-panel" id="dd-sem">
      <div class="dd-actions">
        <button class="dd-action-btn primary" onclick="Modulos.prog_semanal._allSem(true)">SAFRA</button>
        <button class="dd-action-btn secondary" onclick="Modulos.prog_semanal._allSem(false)">Limpar</button>
      </div>
      <div class="dd-sep"></div>
      <div class="dd-group">Safra 2026</div>
      <div id="sem-items"></div>
    </div>
  </div>
</div>

<div class="metrics-row">
  <div class="metric">
    <div class="m-label">H-H Programadas</div>
    <div class="m-val" id="m-hh" style="color:var(--yellow)">—</div>
    <div class="m-sub" id="m-hh-sub">semana selecionada</div>
  </div>
  <div class="metric">
    <div class="m-label">Aderência Global</div>
    <div class="m-val" id="m-adr" style="color:#9ca3af">—</div>
    <div class="m-sub">H-h OS encerradas na prog. / H-h programado</div>
  </div>
  <div class="metric">
    <div class="m-label">Pré-OS Abertas</div>
    <div class="m-val" id="m-preos" style="color:var(--yellow)">—</div>
    <div class="m-sub">situação "Aguardando"</div>
  </div>
  <div class="metric">
    <div class="m-label">Tempo Médio Pré → OS</div>
    <div class="m-val" id="m-tempo" style="color:var(--green)">—</div>
    <div class="m-sub">média geral da safra</div>
  </div>
</div>

<div class="charts-row">
  <div class="chart-wrap">
    <div class="card-title">H-H PROGRAMADO</div>
    <div class="chart-container"><canvas id="c1"></canvas></div>
  </div>
  <div class="chart-wrap">
    <div class="card-title">ADERÊNCIA DA PROGRAMAÇÃO <span style="font-weight:400;color:#9ca3af">meta: 75%</span></div>
    <div class="chart-container"><canvas id="c2"></canvas></div>
  </div>
</div>
<div class="charts-row">
  <div class="chart-wrap">
    <div class="card-title">ADERÊNCIA GLOBAL <span style="font-weight:400;color:#9ca3af">semana a semana</span></div>
    <div class="chart-container"><canvas id="c3"></canvas></div>
  </div>
  <div class="chart-wrap">
    <div class="card-title">EFICIÊNCIA DO PLANEJAMENTO <span style="font-weight:400;color:#9ca3af">H-h previsto × realizado (OS encerradas)</span></div>
    <div class="chart-container"><canvas id="c4"></canvas></div>
  </div>
</div>
<div class="chart-wrap" style="margin-bottom:12px">
  <div class="card-title">DISTRIBUIÇÃO H-H POR MODALIDADE
    <span style="font-weight:400;color:#9ca3af;margin-left:8px">OS encerradas no período selecionado</span>
    <span style="margin-left:16px;font-size:10px;font-weight:600">
      <span style="color:#E24B4A">⬤ MCU</span>
      <span style="color:#16a34a;margin-left:8px">⬤ Dentro da prog.</span>
      <span style="color:#2563eb;margin-left:8px">⬤ Fora da prog.</span>
    </span>
  </div>
  <div class="chart-container-wide"><canvas id="c5"></canvas></div>
</div>

<div class="charts-row bottom-cards">
  <div class="card">
    <div class="card-title"><i class="ti ti-alert-triangle" style="color:var(--amber)"></i> PONTOS DE ATENÇÃO</div>
    <div id="alertas-body"><div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Carregando...</div></div>
  </div>
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div class="card-title" style="margin:0"><i class="ti ti-arrows-right-left" style="color:var(--yellow)"></i> REPROGRAMADAS NÃO EXECUTADAS</div>
      <span id="repr-count" style="font-size:10px;color:#9ca3af"></span>
    </div>
    <div id="repr-body"><div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Carregando...</div></div>
  </div>
</div>

<!-- LISTA DESTRINCHADA -->
<div id="lista-card" style="margin-bottom:12px">
  <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);">
    <!-- Cabeçalho sempre visível -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;cursor:pointer"
         onclick="Modulos.prog_semanal._toggleLista()">
      <div style="display:flex;align-items:center;gap:10px">
        <i class="ti ti-list-search" style="color:var(--yellow);font-size:16px"></i>
        <span style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#374151">
          DETALHAMENTO DE OS
        </span>
        <span id="lista-count" style="font-size:10px;color:#9ca3af"></span>
      </div>
      <i class="ti ti-chevron-down" id="lista-chevron"
         style="font-size:16px;color:#9ca3af;transition:transform .2s"></i>
    </div>
    <!-- Corpo retrátil -->
    <div id="lista-body" style="display:none;padding:0 16px 16px">
      <!-- Filtros -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding-top:4px;border-top:1px solid var(--border)">
        <div class="dd-wrap">
          <button class="dd-btn" onclick="Modulos.prog_semanal._dd('dd-lista-modal')" style="height:28px">
            <i class="ti ti-category" style="font-size:13px"></i>
            <span class="dd-label" id="lista-modal-label" style="font-size:10px">Modalidade</span>
            <i class="ti ti-chevron-down dd-arrow"></i>
          </button>
          <div class="dd-panel" id="dd-lista-modal">
            <div id="lista-modal-items"></div>
          </div>
        </div>
        <div class="dd-wrap">
          <button class="dd-btn" onclick="Modulos.prog_semanal._dd('dd-lista-tipo')" style="height:28px">
            <i class="ti ti-filter" style="font-size:13px"></i>
            <span class="dd-label" id="lista-tipo-label" style="font-size:10px">Tipo</span>
            <i class="ti ti-chevron-down dd-arrow"></i>
          </button>
          <div class="dd-panel" id="dd-lista-tipo">
            <label class="dd-item" style="font-size:11px">
              <input type="radio" name="lista-tipo" value="mcu" onchange="Modulos.prog_semanal._filtrarLista()"> MCU
            </label>
            <label class="dd-item" style="font-size:11px">
              <input type="radio" name="lista-tipo" value="dentro" onchange="Modulos.prog_semanal._filtrarLista()"> Dentro da Prog.
            </label>
            <label class="dd-item" style="font-size:11px">
              <input type="radio" name="lista-tipo" value="fora" onchange="Modulos.prog_semanal._filtrarLista()"> Fora da Prog.
            </label>
            <label class="dd-item" style="font-size:11px">
              <input type="radio" name="lista-tipo" value="naoexec" onchange="Modulos.prog_semanal._filtrarLista()"> Não Executadas
            </label>
          </div>
        </div>
        <button onclick="Modulos.prog_semanal._filtrarLista()"
          style="height:28px;padding:0 12px;background:var(--yellow);border:none;border-radius:var(--radius-sm);
          font-family:var(--font);font-size:10px;font-weight:700;cursor:pointer">
          <i class="ti ti-search"></i> Filtrar
        </button>
      </div>
      <!-- Botão retrair topo -->
      <div id="lista-retrair-top" style="display:none;text-align:center;margin-bottom:8px">
        <button onclick="Modulos.prog_semanal._toggleLista()"
          style="background:none;border:1px solid var(--border);border-radius:20px;padding:3px 14px;
          font-size:10px;color:#9ca3af;cursor:pointer;font-family:var(--font)">
          ▲ recolher
        </button>
      </div>
      <!-- Tabela -->
      <div id="lista-tabela"></div>
      <!-- Botão retrair fundo -->
      <div id="lista-retrair-bot" style="display:none;text-align:center;margin-top:8px">
        <button onclick="Modulos.prog_semanal._toggleLista()"
          style="background:none;border:1px solid var(--border);border-radius:20px;padding:3px 14px;
          font-size:10px;color:#9ca3af;cursor:pointer;font-family:var(--font)">
          ▲ recolher
        </button>
      </div>
    </div>
  </div>
</div>

<div class="import-section"><div class="card">
  <div class="card-title"><i class="ti ti-upload" style="color:var(--yellow)"></i> IMPORTAR DADOS</div>
  <div style="display:grid;grid-template-columns:1fr auto;gap:16px;align-items:start">
    <div class="dropzone" id="dz"
      ondragover="event.preventDefault();this.classList.add('over')"
      ondragleave="this.classList.remove('over')"
      ondrop="Modulos.prog_semanal._drop(event)"
      onclick="document.getElementById('file-input').click()">
      <i class="ti ti-cloud-upload"></i>
      <p><strong>Arraste o arquivo aqui</strong><br>ou clique para selecionar</p>
      <div class="file-types" style="margin-top:10px">
        <div class="file-type"><i class="ti ti-file-spreadsheet" style="color:var(--green)"></i><span class="ext">.xlsx</span></div>
        <div class="file-type"><i class="ti ti-file-spreadsheet" style="color:var(--amber)"></i><span class="ext">.xls</span></div>
      </div>
    </div>
    <div style="font-size:11px;color:#6b7280;min-width:160px">
      <div style="font-weight:600;color:#374151;margin-bottom:8px">Arquivos aceitos:</div>
      <div>• Programação Semanal</div><div>• Ordens de Serviço</div>
      <div>• Apontamentos</div><div>• Pré-Ordens</div>
    </div>
  </div>
  <input type="file" id="file-input" accept=".xlsx,.xls,.csv" style="display:none"
    onchange="Modulos.prog_semanal._filesel(event)">
  <div style="margin-top:16px">
    <div class="hist-title">IMPORTAÇÕES RECENTES</div>
    <div id="hist-list"></div>
  </div>
</div></div>`;
  },

  /* ══════════════════════════════════════════
     CARREGAR DADOS
  ══════════════════════════════════════════ */
  async _carregar() {
    showBanner('Carregando...', true);
    try {
      const db = getDB();

      /* 1. Programação semanal */
      const { data: prog, error: e1 } = await db
        .from('programacao_semanal')
        .select('semana,ano,equipe,hh_previsto,data_inicio_semana,data_fim_semana')
        .order('semana', { ascending: true });
      if (e1) throw e1;

      if (!prog || !prog.length) {
        showBanner('Sem dados. Importe as planilhas abaixo.', true);
        this._initCharts([]);
        this._preosAbertas();
        this._tempoMedio();
        return;
      }

      /* 2. Equipes na programação vs equipes com OS */
      const eqsProg = [...new Set(prog.map(r => r.equipe).filter(Boolean))].sort();
      const { data: osEqData } = await db.from('ordens_servico').select('equipe').not('equipe','is',null);
      const eqsComOS = new Set((osEqData||[]).map(r => r.equipe).filter(Boolean));
      const eqsPend  = eqsProg.filter(eq => !eqsComOS.has(eq));

      if (eqsPend.length)
        showBanner('Pendente importação das OS das equipes: ' + eqsPend.join(', ') + '. Aderência não calculada para essas equipes.', true);
      else
        showBanner('', false);

      /* 3. Agrupar H-h previsto + info de semana */
      const ag = {}, semInfos = {};
      prog.forEach(r => {
        const k = r.semana + '/' + r.ano;
        if (!ag[k]) ag[k] = {};
        if (!semInfos[k]) semInfos[k] = { semana: r.semana, ano: r.ano, dataIni: r.data_inicio_semana, dataFim: r.data_fim_semana };
        if (r.equipe) {
          if (!ag[k][r.equipe]) ag[k][r.equipe] = { prev: 0, prevEnc: 0, hhPrevEnc: 0, hhRealEnc: 0 };
          ag[k][r.equipe].prev += parseFloat(r.hh_previsto) || 0;
        }
      });

      /* 4. Para cada semana: OS encerradas na programação (aderência + eficiência) */
      for (const k of Object.keys(semInfos)) {
        const { semana, ano, dataIni, dataFim } = semInfos[k];
        if (!dataIni || !dataFim) continue;

        /* OS programadas nessa semana */
        const { data: progSem } = await db
          .from('programacao_semanal')
          .select('os,cod_servico,equipe,hh_previsto')
          .eq('semana', semana).eq('ano', ano);
        if (!progSem || !progSem.length) continue;

        const osNums = [...new Set(progSem.map(p => p.os))];

        /* Status e Hh das OS programadas */
        const { data: osInfo } = await db
          .from('ordens_servico')
          .select('os,cod_servico,status_os,hh_prev_servico,hh_real_servico')
          .in('os', osNums.slice(0,500));

        /* Mapa duplo: por os+cod E só por os (para cod='?') */
        const mapaOS = {}, mapaOSsimples = {};
        (osInfo||[]).forEach(o => {
          mapaOS[o.os+'|'+(o.cod_servico||'?')] = o;
          /* Para OS com cod='?': guardar a OS mais relevante (encerrada preferida) */
          if (!mapaOSsimples[o.os] || o.status_os === '4 - Encerrada')
            mapaOSsimples[o.os] = o;
        });

        progSem.forEach(p => {
          const eq  = p.equipe;
          if (!eq || !ag[k] || !ag[k][eq]) return;
          /* Tentar match exato primeiro, depois só por OS */
          const inf = mapaOS[p.os+'|'+(p.cod_servico||'?')]
                   || (p.cod_servico === '?' ? mapaOSsimples[p.os] : null);
          if (!inf) return;
          if (inf.status_os === '4 - Encerrada') {
            const hhProg = parseFloat(p.hh_previsto) || 0;
            ag[k][eq].prevEnc    += hhProg;
            ag[k][eq].hhPrevEnc  += hhProg;
            ag[k][eq].hhRealEnc  += parseFloat(inf.hh_real_servico) || 0;
          }
        });

        /* 5. Distribuição por modalidade:
              Fonte: tabela ordens_servico, filtro por data_encerramento no período
              MCU: usa hh_real_os (coluna Hh Real OS da planilha)
              Prog: usa hh_real_servico (coluna Hh Real Serviço Decimal)
              Dentro: OS está na programação da semana
              Fora: OS não está na programação da semana */
        const chavProg = new Set(progSem.map(p => p.os));

        /* Buscar TODAS as OS encerradas no período */
        const { data: osEncDist } = await db
          .from('ordens_servico')
          .select('os, cod_servico, tipo_atividade, modalidade, hh_real_os, hh_real_servico, hh_prev_servico')
          .eq('status_os', '4 - Encerrada')
          .gte('data_encerramento', dataIni)
          .lte('data_encerramento', dataFim);

        if (!ag[k]['_dist']) ag[k]['_dist'] = {};
        if (!ag[k]['_efic']) ag[k]['_efic'] = {};

        (osEncDist||[]).forEach(o => {
          const modal = (o.modalidade || 'OUTROS').toUpperCase().trim();
          const hhR   = o.tipo_atividade === 'MCU'
            ? (parseFloat(o.hh_real_os)      || 0)
            : (parseFloat(o.hh_real_servico) || 0);
          const hhP   = parseFloat(o.hh_prev_servico) || 0;

          /* Distribuição C5 */
          if (hhR > 0) {
            if (!ag[k]['_dist'][modal]) ag[k]['_dist'][modal] = { mcu:0, dentro:0, fora:0 };
            if (o.tipo_atividade === 'MCU') {
              ag[k]['_dist'][modal].mcu    += hhR;
            } else if (chavProg.has(o.os)) {
              ag[k]['_dist'][modal].dentro += hhR;
            } else {
              ag[k]['_dist'][modal].fora   += hhR;
            }
          }

          /* Eficiência C4: todas programáveis (não MCU) */
          if (o.tipo_atividade !== 'MCU' && (hhR > 0 || hhP > 0)) {
            if (!ag[k]['_efic'][modal]) ag[k]['_efic'][modal] = { prev:0, real:0 };
            ag[k]['_efic'][modal].prev += hhP;
            ag[k]['_efic'][modal].real += hhR;
          }
        });

        /* Arredondar — só equipes, não _dist nem _efic */
        Object.entries(ag[k]).forEach(([key, v]) => {
          if (key === '_dist' || key === '_efic') return;
          if (typeof v === 'object' && v !== null) {
            v.prev      = Math.round((v.prev||0)*10)/10;
            v.prevEnc   = Math.round((v.prevEnc||0)*10)/10;
            v.hhPrevEnc = Math.round((v.hhPrevEnc||0)*10)/10;
            v.hhRealEnc = Math.round((v.hhRealEnc||0)*10)/10;
          }
        });
      }

      this._s.dadosSem   = ag;
      this._s.semanas    = Object.values(semInfos).sort((a,b) => a.semana - b.semana);
      this._s.eqsPend    = eqsPend;
      this._s.activeEqs  = eqsProg;

      const ult = this._s.semanas[this._s.semanas.length-1];
      this._s.activeSems = ult ? [ult.semana+'/'+ult.ano] : [];

      this._buildEqDD(eqsProg);
      this._buildSemDD();
      this._initCharts();
      this._preosAbertas();
      this._tempoMedio();
      this._buildListaModalDD();

    } catch(err) {
      console.error(err);
      showBanner('Erro ao carregar: ' + err.message, true);
    }
  },

  /* ══════════════════════════════════════════
     MÉTRICAS SIMPLES
  ══════════════════════════════════════════ */
  async _preosAbertas() {
    try {
      const { count } = await getDB()
        .from('pre_ordens')
        .select('*', { count:'exact', head:true })
        .eq('situacao', 'Aguardando');
      const el = document.getElementById('m-preos');
      if (el) el.textContent = (count != null ? count : '—');
    } catch(e) { console.warn('preosAbertas:', e); }
  },

  async _tempoMedio() {
    try {
      const db = getDB();
      const { data: preos } = await db.from('pre_ordens')
        .select('os,data_comunicacao').not('os','is',null).neq('os','');
      if (!preos || !preos.length) return;

      const osNums = [...new Set(preos.map(p=>p.os).filter(Boolean))];
      const { data: ords } = await db.from('ordens_servico')
        .select('os,data_geracao').in('os', osNums.slice(0,500)).not('data_geracao','is',null);
      if (!ords || !ords.length) return;

      const mapa = {};
      ords.forEach(o => { mapa[o.os] = o.data_geracao; });

      const diffs = [];
      preos.forEach(p => {
        const dG = mapa[p.os], dC = p.data_comunicacao;
        if (!dG || !dC) return;
        const d = (new Date(dG) - new Date(dC)) / 86400000;
        if (d >= 0 && d < 365) diffs.push(d);
      });

      if (!diffs.length) return;
      const media = diffs.reduce((a,b)=>a+b,0) / diffs.length;
      const el = document.getElementById('m-tempo');
      if (el) { el.textContent = media.toFixed(1)+' dias'; el.style.color = media<=3?'#16a34a':'#d97706'; }
    } catch(e) { console.warn('tempoMedio:', e); }
  },

  /* ══════════════════════════════════════════
     DROPDOWNS
  ══════════════════════════════════════════ */
  _buildEqDD(eqs) {
    const box = document.getElementById('eq-items');
    if (!box) return;
    box.innerHTML = '';
    eqs.forEach(eq => {
      const lbl = document.createElement('label');
      lbl.className = 'dd-item';
      lbl.innerHTML = '<input type="checkbox" name="eq" value="'+eq+'" checked onchange="Modulos.prog_semanal._onEq()"> '+eq;
      box.appendChild(lbl);
    });
    document.getElementById('eq-label').textContent = eqs.join(', ');
  },

  _buildSemDD() {
    const box = document.getElementById('sem-items');
    if (!box) return;
    box.innerHTML = '';
    this._s.semanas.forEach(({semana,ano,dataIni}) => {
      const k = semana+'/'+ano;
      const checked = this._s.activeSems.includes(k);
      const lbl = document.createElement('label');
      lbl.className = 'dd-item';
      lbl.innerHTML = '<input type="checkbox" name="sem" value="'+k+'" '+(checked?'checked':'')+' onchange="Modulos.prog_semanal._onSem()"> Sem '+semana
        +(dataIni?'<span style="color:#9ca3af;font-size:10px;margin-left:4px">'+dataIni.slice(5).replace('-','/')+'</span>':'');
      box.appendChild(lbl);
    });
    this._updSemLabel();
  },

  _dd(id) { toggleDD(id); },
  _onEq() {
    this._s.activeEqs = [...document.querySelectorAll('[name=eq]:checked')].map(c=>c.value);
    document.getElementById('eq-label').textContent = this._s.activeEqs.join(', ') || 'Nenhuma';
    this._update();
  },
  _allEq(all) {
    document.querySelectorAll('[name=eq]').forEach(c=>{c.checked=all;});
    this._onEq();
    document.getElementById('dd-eq').classList.remove('show');
  },
  _onSem() {
    this._s.activeSems = [...document.querySelectorAll('[name=sem]:checked')].map(c=>c.value);
    this._updSemLabel();
    this._update();
    this._reprog();
  },
  _allSem(all) {
    document.querySelectorAll('[name=sem]').forEach(c=>{c.checked=all;});
    if (!all && this._s.semanas.length) {
      const u = this._s.semanas[this._s.semanas.length-1];
      const cb = document.querySelector('[name=sem][value="'+u.semana+'/'+u.ano+'"]');
      if (cb) cb.checked = true;
    }
    this._onSem();
    document.getElementById('dd-sem').classList.remove('show');
  },
  _updSemLabel() {
    this._s.activeSems = [...document.querySelectorAll('[name=sem]:checked')].map(c=>c.value);
    const n = this._s.activeSems.length, t = this._s.semanas.length;
    const lbl = n===t&&t>0 ? 'SAFRA (todas)' : n===0 ? 'Nenhuma' : this._s.activeSems.map(k=>'Sem '+k.split('/')[0]).join(', ');
    const el = document.getElementById('sem-label');
    if (el) el.textContent = lbl;
  },

  /* ══════════════════════════════════════════
     CHARTS
  ══════════════════════════════════════════ */
  _initCharts() {
    const Y='#F8C100', G='#16a34a', R='#E24B4A', B='#2563eb';
    const tC='rgba(80,80,80,.9)', gC='rgba(0,0,0,.06)';
    const META = 75;
    const SUPERV = [
      ['Oficina Manut.', ['MEC1','CAL1','CAL2','CAL3','CIV1']],
      ['Elétrica',       ['ELE1','INS1','AUT1']],
      ['Confiabilidade', ['ISP1','ISP2']],
    ];

    /* Plugin para labels acima das barras */
    const labelPlugin = (fmtFn) => ({
      id: 'barLabel_'+Math.random(),
      afterDraw(chart) {
        const {ctx} = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((bar, i) => {
            const val = ds.data[i];
            if (!val) return;
            const lbl = fmtFn(val, ds, i, chart);
            if (!lbl) return;
            ctx.save();
            ctx.font = 'bold 10px Sora,sans-serif';
            ctx.fillStyle = '#374151';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(lbl, bar.x, bar.y - 2);
            ctx.restore();
          });
        });
      }
    });

    const fmtHh  = v => v ? v+'h' : null;
    const fmtPct = v => v ? v+'%' : null;

    /* Plugin eficiência — só no dataset 1 (Realizado) do C4 */
    const eficPlugin = {
      id: 'eficPlugin',
      afterDraw(chart) {
        const {ctx} = chart;
        const prevDs = chart.data.datasets[0];
        const realDs = chart.data.datasets[1];
        if (!prevDs || !realDs) return;
        const meta = chart.getDatasetMeta(1);
        meta.data.forEach((bar, i) => {
          const prev = prevDs.data[i] || 0;
          const real = realDs.data[i] || 0;
          if (!prev) return;
          const ef = Math.round((1 - Math.abs(real - prev) / prev) * 100);
          ctx.save();
          ctx.font = 'bold 10px Sora,sans-serif';
          ctx.fillStyle = ef >= META ? '#16a34a' : '#dc2626';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(ef+'%', bar.x, bar.y - 2);
          ctx.restore();
        });
      }
    };

    Object.values(this._s.charts).forEach(c=>c.destroy());
    this._s.charts = {};
    const ch = this._s.charts;

    ch.c1 = new Chart(document.getElementById('c1'), {
      type:'bar',
      data:{labels:[],datasets:[{data:[],backgroundColor:Y,borderRadius:4}]},
      options:{responsive:true,maintainAspectRatio:false,
        layout:{padding:{top:20}},
        plugins:{legend:{display:false}, barLabel_c1: labelPlugin(fmtHh)},
        scales:{
          x:{ticks:{color:tC,font:{size:10}},grid:{display:false}},
          y:{ticks:{color:tC,font:{size:10},callback:v=>v+'h'},grid:{color:gC}}
        }
      },
      plugins:[labelPlugin(fmtHh)]
    });

    ch.c2 = new Chart(document.getElementById('c2'), {
      type:'bar',
      data:{labels:[],datasets:[{data:[],backgroundColor:[],borderRadius:4}]},
      options:{responsive:true,maintainAspectRatio:false,
        layout:{padding:{top:20}},
        plugins:{legend:{display:false}},
        scales:{
          x:{ticks:{color:tC,font:{size:10}},grid:{display:false}},
          y:{min:0,max:100,ticks:{color:tC,font:{size:10},callback:v=>v+'%'},grid:{color:gC}}
        }
      },
      plugins:[labelPlugin(fmtPct)]
    });

    ch.c3 = new Chart(document.getElementById('c3'), {
      type:'bar',
      data:{labels:[],datasets:[{data:[],backgroundColor:[],borderRadius:4}]},
      options:{responsive:true,maintainAspectRatio:false,
        layout:{padding:{top:20}},
        plugins:{legend:{display:false}},
        scales:{
          x:{ticks:{color:tC,font:{size:10}},grid:{display:false}},
          y:{min:0,max:100,ticks:{color:tC,font:{size:10},callback:v=>v+'%'},grid:{color:gC}}
        }
      },
      plugins:[labelPlugin(fmtPct)]
    });

    ch.c4 = new Chart(document.getElementById('c4'), {
      type:'bar',
      data:{labels:[],datasets:[
        {label:'Previsto', data:[],backgroundColor:Y,borderRadius:4},
        {label:'Realizado',data:[],backgroundColor:[],borderRadius:4},
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        layout:{padding:{top:20}},
        plugins:{legend:{display:true,labels:{color:tC,font:{size:10},boxWidth:10}}},
        scales:{
          x:{ticks:{color:tC,font:{size:10}},grid:{display:false}},
          y:{ticks:{color:tC,font:{size:10},callback:v=>v+'h'},grid:{color:gC}}
        }
      },
      plugins:[eficPlugin]
    });

    /* Plugin label para cada trecho do C5 */
    const c5LabelPlugin = {
      id: 'c5label',
      afterDraw(chart) {
        const {ctx} = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((bar, i) => {
            const val = ds.data[i];
            if (!val || val < 1) return; /* só mostra se tiver espaço */
            const w = bar.width || (bar.x - bar.base);
            if (w < 28) return; /* trecho muito pequeno, não cabe */
            ctx.save();
            ctx.font = '600 9px Sora,sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(val+'h', bar.x - w/2, bar.y);
            ctx.restore();
          });
        });
      }
    };

    ch.c5 = new Chart(document.getElementById('c5'), {
      type:'bar',
      data:{labels:[],datasets:[
        {label:'MCU',            data:[],backgroundColor:R,borderRadius:0},
        {label:'Dentro da prog.',data:[],backgroundColor:G,borderRadius:0},
        {label:'Fora da prog.',  data:[],backgroundColor:B,borderRadius:0},
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        indexAxis:'y',
        plugins:{legend:{display:false},
          tooltip:{callbacks:{label:ctx=>' '+ctx.dataset.label+': '+ctx.raw+'h'}}},
        scales:{
          x:{stacked:true,ticks:{color:tC,font:{size:10},callback:v=>v+'h'},grid:{color:gC}},
          y:{stacked:true,ticks:{color:tC,font:{size:10}},grid:{display:false}}
        }
      },
      plugins:[c5LabelPlugin]
    });

    this._s.META   = META;
    this._s.SUPERV = SUPERV;
    this._update();
  },

  _update() {
    const {charts:ch, activeSems:sems, activeEqs:eqs, dadosSem:ds,
           semanas, eqsPend, META=75, SUPERV=[]} = this._s;
    if (!Object.keys(ch).length) return;
    const G='#16a34a', R='#E24B4A', CINZA='#d1d5db';

    /* H-h previsto por equipe */
    const prevMap = {};
    eqs.forEach(eq => {
      prevMap[eq] = sems.reduce((s,k)=>s+((ds[k]&&ds[k][eq])?ds[k][eq].prev:0),0);
    });

    /* C1 — ordenar decrescente */
    const c1Sorted = eqs.map(eq=>({ eq, v: Math.round(prevMap[eq]*10)/10 }))
                        .sort((a,b)=>b.v-a.v);
    ch.c1.data.labels = c1Sorted.map(x=>x.eq);
    ch.c1.data.datasets[0].data = c1Sorted.map(x=>x.v);
    ch.c1.update('none');

    /* Aderência por equipe */
    const adrMap = {};
    eqs.forEach(eq => {
      if (eqsPend.includes(eq)) { adrMap[eq]=-1; return; }
      const pEnc = sems.reduce((s,k)=>s+((ds[k]&&ds[k][eq])?ds[k][eq].prevEnc:0),0);
      adrMap[eq] = prevMap[eq] ? Math.round(pEnc/prevMap[eq]*100) : 0;
    });

    /* Aderência global */
    let tP=0,tE=0;
    eqs.forEach(eq=>{ if(!eqsPend.includes(eq)){tP+=prevMap[eq]; tE+=sems.reduce((s,k)=>s+((ds[k]&&ds[k][eq])?ds[k][eq].prevEnc:0),0);} });
    const adrGlob = tP ? Math.round(tE/tP*100) : 0;
    const totalPrev = eqs.reduce((s,eq)=>s+prevMap[eq],0);

    /* Métricas cabeçalho */
    const mHH=document.getElementById('m-hh'), mAdr=document.getElementById('m-adr'), mSub=document.getElementById('m-hh-sub');
    if(mHH)  mHH.textContent  = totalPrev.toLocaleString('pt-BR')+'h';
    if(mSub) mSub.textContent = eqs.length+' equipe'+(eqs.length!==1?'s':'')+' · '+sems.length+' semana'+(sems.length!==1?'s':'');
    if(mAdr) { mAdr.textContent=adrGlob+'%'; mAdr.style.color=adrGlob>=META?G:(adrGlob>0?R:'#9ca3af'); }

    /* C2 — ordem por supervisão */
    const c2Labels=[], c2Vals=[], c2Colors=[];
    let lastSuperv='', needSep=false;
    const allEqsOrder = SUPERV.flatMap(([,eqList])=>eqList).filter(eq=>eqs.includes(eq));
    const remaining = eqs.filter(eq=>!allEqsOrder.includes(eq));
    [...allEqsOrder,...remaining].forEach(eq=>{
      const v = adrMap[eq];
      c2Labels.push(eq);
      c2Vals.push(v===-1?0:v);
      c2Colors.push(v===-1?CINZA:v>=META?G:v>0?R:'#9ca3af');
    });
    ch.c2.data.labels = c2Labels;
    ch.c2.data.datasets[0].data = c2Vals;
    ch.c2.data.datasets[0].backgroundColor = c2Colors;
    ch.c2.update('none');

    /* C3 — aderência semana a semana */
    const semLbl=[], semVals=[];
    semanas.forEach(({semana,ano})=>{
      const k=semana+'/'+ano; if(!ds[k]) return;
      let p=0,e=0;
      eqs.forEach(eq=>{ if(!eqsPend.includes(eq)&&ds[k][eq]){p+=ds[k][eq].prev;e+=ds[k][eq].prevEnc;} });
      semLbl.push('Sem '+semana); semVals.push(p?Math.round(e/p*100):0);
    });
    ch.c3.data.labels = semLbl;
    ch.c3.data.datasets[0].data = semVals;
    ch.c3.data.datasets[0].backgroundColor = semVals.map(v=>v>=META?G:v>0?R:'#9ca3af');
    ch.c3.update('none');

    /* C4 — eficiência por MODALIDADE (apenas programáveis, MCU excluído)
       Agrupa: MEC1→MEC, CAL1+CAL2+CAL3→CAL, CIV1→CIV, ELE1→ELE etc. */
    /* C4: agregar _efic por semana selecionada */
    const modalEfic = {};
    sems.forEach(k => {
      const efic = ds[k] && ds[k]['_efic'];
      if (!efic) return;
      Object.keys(efic).forEach(modal => {
        if (!modalEfic[modal]) modalEfic[modal] = { prev:0, real:0 };
        modalEfic[modal].prev += efic[modal].prev || 0;
        modalEfic[modal].real += efic[modal].real || 0;
      });
    });
    const c4Modals = Object.keys(modalEfic).filter(m => modalEfic[m].prev > 0 || modalEfic[m].real > 0).sort();
    const hhPE = c4Modals.map(m => Math.round(modalEfic[m].prev * 10) / 10);
    const hhRE = c4Modals.map(m => Math.round(modalEfic[m].real * 10) / 10);
    ch.c4.data.labels = c4Modals;
    ch.c4.data.datasets[0].data = hhPE;
    ch.c4.data.datasets[1].data = hhRE;
    ch.c4.data.datasets[1].backgroundColor = hhRE.map((r,i) => {
      if (!hhPE[i]) return '#9ca3af';
      const ef = (1 - Math.abs(r - hhPE[i]) / hhPE[i]) * 100;
      return ef >= META ? G : r > 0 ? R : '#9ca3af';
    });
    ch.c4.update('none');

    /* C5 — distribuição por modalidade */
    const modAcum={};
    sems.forEach(k=>{
      const dist=ds[k]&&ds[k]['_dist'];
      if(!dist) return;
      Object.keys(dist).forEach(m=>{
        if(!modAcum[m]) modAcum[m]={mcu:0,dentro:0,fora:0};
        modAcum[m].mcu    += dist[m].mcu    ||0;
        modAcum[m].dentro += dist[m].dentro ||0;
        modAcum[m].fora   += dist[m].fora   ||0;
      });
    });
    const mods = Object.keys(modAcum).sort();
    ch.c5.data.labels = mods;
    ch.c5.data.datasets[0].data = mods.map(m=>Math.round(modAcum[m].mcu*10)/10);
    ch.c5.data.datasets[1].data = mods.map(m=>Math.round(modAcum[m].dentro*10)/10);
    ch.c5.data.datasets[2].data = mods.map(m=>Math.round(modAcum[m].fora*10)/10);
    ch.c5.update('none');

    /* Alertas */
    this._alertas(adrMap, eqs);
    this._reprog();
  },

  /* ══════════════════════════════════════════
     ALERTAS
  ══════════════════════════════════════════ */
  _alertas(adrMap, eqs) {
    const el = document.getElementById('alertas-body');
    if (!el) return;
    const {eqsPend, dadosSem:ds, semanas, activeSems:sems, META=75} = this._s;

    if (sems.length > 1) {
      el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:#d97706;font-size:12px">'
        + '<i class="ti ti-info-circle" style="font-size:16px"></i>'
        + '<span>Selecione apenas <strong>uma semana</strong> para ver os pontos de atenção detalhados</span></div>';
      return;
    }
    const G='#16a34a', R='#dc2626', AM='#d97706';
    const alertas = [];

    eqsPend.forEach(eq => {
      if (eqs.includes(eq))
        alertas.push({c:AM,i:'ti-alert-circle',t:'<strong>'+eq+'</strong>: OS não importadas — aderência indisponível'});
    });

    eqs.forEach((eq) => {
      if (eqsPend.includes(eq)) return;
      const a = adrMap[eq];

      if (a === 0) {
        alertas.push({c:AM,i:'ti-circle-off',t:'<strong>'+eq+'</strong>: nenhuma OS encerrada na programação desta semana'});
        return;
      }
      if (a > 0 && a < META) {
        /* Só alertar a partir da 2ª semana consecutiva abaixo da meta */
        const semsOrd2 = [...semanas].sort((x,y) => x.semana - y.semana);
        const ultKey2  = sems.slice().sort().pop();
        const semIdx2  = semsOrd2.findIndex(s => s.semana+'/'+s.ano === ultKey2);
        let consec = 0;
        for (let ki = semIdx2 - 1; ki >= 0; ki--) {
          const kk2  = semsOrd2[ki].semana+'/'+semsOrd2[ki].ano;
          const dAnt = ds[kk2] && ds[kk2][eq];
          if (!dAnt || !dAnt.prev) break;
          const aAnt = Math.round(dAnt.prevEnc / dAnt.prev * 100);
          if (aAnt < META) consec++; else break;
        }
        if (consec >= 1) {
          alertas.push({c:R, i:'ti-trending-down',
            t: '<strong>'+eq+'</strong>: aderência de <strong>'+a+'%</strong>'
             + ' — abaixo da meta de '+META+'%'
             + ' — <strong>'+(consec+1)+' semanas consecutivas</strong>'});
        }
      }

      /* Eficiência — usa _efic (mesma fonte do C4) agrupado por modalidade da equipe */
      const modal = eq.replace(/\d+$/, '');
      let hhPE = 0, hhRE = 0;
      sems.forEach(k => {
        const efic = ds[k] && ds[k]['_efic'] && ds[k]['_efic'][modal];
        if (efic) { hhPE += efic.prev || 0; hhRE += efic.real || 0; }
      });
      if (hhPE > 0) {
        const ef = Math.round((1 - Math.abs(hhRE - hhPE) / hhPE) * 100);
        if (ef < META && a >= META)
          alertas.push({c:AM,i:'ti-chart-bar',t:'<strong>'+eq+'</strong>: aderência OK mas eficiência em <strong>'+ef+'%</strong> — H-h realizado abaixo do previsto nas OS encerradas'});
        if (ef > 130)
          alertas.push({c:AM,i:'ti-alert-triangle',t:'<strong>'+eq+'</strong>: eficiência em <strong>'+ef+'%</strong> — H-h realizado muito acima do previsto, revisar dimensionamento'});
      }


    });

    /* Interrompidas e canceladas na programação */
    (async () => {
      try {
        const db2 = getDB();
        const semKey = sems.slice().sort().pop();
        if (!semKey) return;
        const [sNum, aNum] = semKey.split('/').map(Number);
        const { data: prog } = await db2.from('programacao_semanal')
          .select('os, desc_servico').eq('semana',sNum).eq('ano',aNum);
        if (!prog || !prog.length) return;
        const osNums = [...new Set(prog.map(p=>p.os))];
        const { data: osInt } = await db2.from('ordens_servico')
          .select('os, status_os, desc_os, desc_servico, tipo_atividade')
          .in('os', osNums.slice(0,500))
          .in('status_os', ['3 - Interrompida','5 - Cancelada']);
        if (!osInt || !osInt.length) return;
        const alertasEl2 = document.getElementById('alertas-body');
        if (!alertasEl2) return;
        osInt.forEach(o => {
          /* Descrição: MCU usa desc_os, programável usa desc_servico */
          const rawDesc = o.tipo_atividade === 'MCU' ? (o.desc_os||'') : (o.desc_servico||o.desc_os||'');
          const desc    = rawDesc.slice(0, 50) + (rawDesc.length > 50 ? '…' : '');
          const cor     = o.status_os === '3 - Interrompida' ? '#d97706' : '#dc2626';
          const ico     = o.status_os === '3 - Interrompida' ? 'ti-player-pause' : 'ti-ban';
          alertasEl2.innerHTML += '<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);font-size:12px">'
            + '<i class="ti '+ico+'" style="font-size:16px;flex-shrink:0;margin-top:1px;color:'+cor+'"></i>'
            + '<div><strong>'+o.os+'</strong>'+(desc?' — '+desc:'')+' — <strong>'+o.status_os+'</strong> (Sem '+sNum+')</div></div>';
        });
      } catch(e) { console.warn('Alertas int/canc:', e); }
    })();

    if (!alertas.length) {
      el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:#16a34a;font-size:12px"><i class="ti ti-circle-check" style="font-size:18px"></i><span>Nenhum ponto de atenção para o período selecionado</span></div>';
      return;
    }
    const cMap={red:'#dc2626',amber:'#d97706',blue:'#2563eb'};
    el.innerHTML = alertas.map(a=>'<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);font-size:12px"><i class="ti '+a.i+'" style="font-size:16px;flex-shrink:0;margin-top:1px;color:'+a.c+'"></i><div>'+a.t+'</div></div>').join('');
  },

  /* ══════════════════════════════════════════
     REPROGRAMADAS
  ══════════════════════════════════════════ */
  async _reprog() {
    const reprEl = document.getElementById('repr-body');
    const cntEl  = document.getElementById('repr-count');
    if (!reprEl) return;
    const {activeSems:sems, semanas, eqsPend} = this._s;
    if (!sems.length) { reprEl.innerHTML='<div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Selecione uma semana</div>'; return; }
    if (sems.length > 1) {
      reprEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:#d97706;font-size:12px">'
        + '<i class="ti ti-info-circle" style="font-size:16px"></i>'
        + '<span>Selecione apenas <strong>uma semana</strong> para ver as OS reprogramadas</span></div>';
      return;
    }

    try {
      const db = getDB();
      const semsOrd = [...semanas].sort((a,b)=>a.semana-b.semana);
      const semAtualKey = sems.slice().sort().pop();
      const [semAtual,anoAtual] = semAtualKey.split('/').map(Number);
      const semAnt = semsOrd.filter(s=>s.semana<semAtual||(s.semana===semAtual&&s.ano<anoAtual));

      if (!semAnt.length) { reprEl.innerHTML='<div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Nenhuma semana anterior disponível</div>'; return; }

      /* OS programadas na semana atual */
      const {data:pAtual} = await db.from('programacao_semanal')
        .select('os,cod_servico,equipe,desc_servico,hh_previsto')
        .eq('semana',semAtual).eq('ano',anoAtual);
      if (!pAtual||!pAtual.length) { reprEl.innerHTML='<div style="padding:12px 0;font-size:12px;color:#9ca3af;text-align:center">Sem programação para a semana selecionada</div>'; return; }

      /* Status atual das OS */
      const osNums = [...new Set(pAtual.map(p=>p.os))];
      const {data:osS} = await db.from('ordens_servico').select('os,cod_servico,status_os').in('os',osNums.slice(0,500));
      const mSt = {};
      (osS||[]).forEach(o=>{ mSt[o.os+'|'+(o.cod_servico||'?')]=o.status_os; });

      const chavAtual = {};
      pAtual.forEach(p=>{ chavAtual[p.os+'|'+(p.cod_servico||'?')]=p; });

      /* Rastrear em semanas anteriores */
      const hist = {};
      for (const si of semAnt.slice().reverse()) {
        const {data:pA} = await db.from('programacao_semanal').select('os,cod_servico').eq('semana',si.semana).eq('ano',si.ano);
        (pA||[]).forEach(p=>{
          const ch = p.os+'|'+(p.cod_servico||'?');
          if (chavAtual[ch]) { if(!hist[ch]) hist[ch]=[]; hist[ch].push(si.semana); }
        });
      }

      /* Reprogramadas = na semana atual + em semana anterior + não encerrada */
      const reprog = [];
      Object.keys(chavAtual).forEach(ch=>{
        const prev = hist[ch];
        if (!prev||!prev.length) return;
        const st = mSt[ch]||'';
        if (st==='4 - Encerrada') return;
        const p = chavAtual[ch];
        const desde = prev[prev.length-1];
        reprog.push({os:p.os,desc:p.desc_servico||'—',hh:p.hh_previsto||0,
          equipe:p.equipe||'Sem equipe',desde,nSems:semAtual-desde+1,status:st});
      });

      const porEq = {};
      reprog.forEach(r=>{ if(!porEq[r.equipe]) porEq[r.equipe]=[]; porEq[r.equipe].push(r); });
      if (cntEl) cntEl.textContent = reprog.length+' serviço'+(reprog.length!==1?'s':'');

      const eqsNaSem = [...new Set(pAtual.map(p=>p.equipe).filter(Boolean))];
      const pendNa   = eqsNaSem.filter(eq=>eqsPend.includes(eq));
      let html = '';
      if (pendNa.length)
        html += '<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px;color:#92400e;display:flex;align-items:center;gap:8px"><i class="ti ti-alert-triangle"></i><span>Equipes sem OS importada não contabilizadas: <strong>'+pendNa.join(', ')+'</strong></span></div>';

      if (!reprog.length) {
        html += '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:#16a34a;font-size:12px"><i class="ti ti-circle-check" style="font-size:18px"></i><span>Nenhuma OS reprogramada para a Semana '+semAtual+'</span></div>';
        reprEl.innerHTML = html; return;
      }

      Object.entries(porEq).filter(([eq])=>!eqsPend.includes(eq)).forEach(([eq,items])=>{
        html += '<div style="margin-bottom:14px">';
        html += '<div style="font-size:10px;font-weight:700;letter-spacing:.08em;color:#6b7280;text-transform:uppercase;padding:4px 0;border-bottom:2px solid var(--border);margin-bottom:6px;display:flex;align-items:center;justify-content:space-between"><span>'+eq+'</span><span style="color:#9ca3af;font-weight:400">'+items.length+' serviço'+(items.length!==1?'s':'')+'</span></div>';
        items.sort((a,b)=>b.nSems-a.nSems).forEach(r=>{
          const bgC = r.nSems>=3?'#fee2e2':r.nSems===2?'#fef3c7':'#f3f4f6';
          const tC2 = r.nSems>=3?'#dc2626':r.nSems===2?'#92400e':'#6b7280';
          html += '<div style="display:grid;grid-template-columns:56px 1fr auto auto;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px">';
          html += '<span style="font-weight:700;color:#374151">'+r.os+'</span>';
          html += '<span style="color:#6b7280;word-break:break-word;white-space:normal;line-height:1.4">'+r.desc+'</span>';
          html += '<span style="color:#9ca3af;font-size:10px;white-space:nowrap">'+r.hh+'h</span>';
          html += '<span style="padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;white-space:nowrap;background:'+bgC+';color:'+tC2+'">Desde Sem '+r.desde+' ('+r.nSems+' sem.)</span>';
          html += '</div>';
        });
        html += '</div>';
      });
      reprEl.innerHTML = html || '<div style="padding:8px 0;font-size:12px;color:#9ca3af;text-align:center">Nenhum serviço reprogramado nas equipes com OS importada</div>';

    } catch(e) { console.error('Reprog:',e); reprEl.innerHTML='<div style="color:#dc2626;font-size:12px;padding:8px">Erro: '+e.message+'</div>'; }
  },

  /* ══════════════════════════════════════════
     IMPORTAÇÃO
  ══════════════════════════════════════════ */
  _drop(e) { e.preventDefault(); document.getElementById('dz').classList.remove('over'); const f=e.dataTransfer.files[0]; if(f) this._proc(f); },
  _filesel(e) { const f=e.target.files[0]; if(f) this._proc(f); e.target.value=''; },
  async _proc(file) {
    showToast('Lendo '+file.name+'...','info');
    const res = await processarArquivo(file);
    showToast(res.msg, res.ok?'ok':'erro', res.ok?4000:6000);
    this._hist(file.name, res.msg, res.ok);
    if (res.ok) await this._carregar();
  },
  _hist(nome,badge,ok) {
    const hora = new Date().getHours()+':'+String(new Date().getMinutes()).padStart(2,'0');
    const list = document.getElementById('hist-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'hist-row';
    row.innerHTML = '<i class="ti ti-file-spreadsheet" style="color:'+(ok?'var(--green)':'#dc2626')+'"></i><span class="hist-name" title="'+nome+'">'+nome+'</span><span class="hist-date">hoje '+hora+'</span><span class="hist-badge '+(ok?'hb-ok':'hb-err')+'">'+badge+'</span>';
    list.insertAdjacentElement('afterbegin', row);
  },
  /* ══════════════════════════════════════════
     LISTA DESTRINCHADA
  ══════════════════════════════════════════ */
  _toggleLista() {
    const body    = document.getElementById('lista-body');
    const chevron = document.getElementById('lista-chevron');
    const aberto  = body.style.display !== 'none';
    body.style.display = aberto ? 'none' : 'block';
    if (chevron) chevron.style.transform = aberto ? '' : 'rotate(180deg)';
  },

  async _buildListaModalDD() {
    const box = document.getElementById('lista-modal-items');
    if (!box) return;
    box.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#9ca3af">Carregando...</div>';
    try {
      /* Buscar modalidades distintas diretamente do banco */
      const { data } = await getDB()
        .from('ordens_servico')
        .select('modalidade')
        .not('modalidade', 'is', null)
        .neq('modalidade', '');
      const mods = [...new Set((data||[]).map(r => (r.modalidade||'').toUpperCase().trim()).filter(Boolean))].sort();
      box.innerHTML = '';
      mods.forEach(m => {
        const lbl = document.createElement('label');
        lbl.className = 'dd-item';
        lbl.style.fontSize = '11px';
        lbl.innerHTML = '<input type="radio" name="lista-modal" value="'+m+'" onchange="Modulos.prog_semanal._filtrarLista()"> '+m;
        box.appendChild(lbl);
      });
    } catch(e) { box.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#dc2626">Erro</div>'; }
  },

  async _filtrarLista() {
    const tabelaEl = document.getElementById('lista-tabela');
    const countEl  = document.getElementById('lista-count');
    const topEl    = document.getElementById('lista-retrair-top');
    const botEl    = document.getElementById('lista-retrair-bot');
    if (!tabelaEl) return;

    const modalEl = document.querySelector('[name=lista-modal]:checked');
    const tipoEl  = document.querySelector('[name=lista-tipo]:checked');
    if (!modalEl || !tipoEl) {
      tabelaEl.innerHTML = '<div style="padding:12px;font-size:12px;color:#9ca3af;text-align:center">Selecione modalidade e tipo</div>';
      return;
    }
    const modal = modalEl.value;
    const tipo  = tipoEl.value;

    document.getElementById('lista-modal-label').textContent = modal;
    document.getElementById('lista-tipo-label').textContent  = tipoEl.parentElement.textContent.trim();
    document.getElementById('dd-lista-modal').classList.remove('show');
    document.getElementById('dd-lista-tipo').classList.remove('show');

    tabelaEl.innerHTML = '<div style="padding:12px;font-size:12px;color:#9ca3af;text-align:center">Carregando...</div>';

    try {
      const db   = getDB();
      const { activeSems:sems, semanas } = this._s;
      if (!sems.length) { tabelaEl.innerHTML = '<div style="padding:12px;font-size:12px;color:#9ca3af;text-align:center">Selecione uma semana</div>'; return; }

      // Pegar período da semana selecionada
      const semKey = sems[sems.length-1];
      const [semNum, anoNum] = semKey.split('/').map(Number);
      const semInfo = semanas.find(s => s.semana===semNum && s.ano===anoNum);
      if (!semInfo || !semInfo.dataIni || !semInfo.dataFim) {
        tabelaEl.innerHTML = '<div style="padding:12px;font-size:12px;color:#9ca3af;text-align:center">Sem datas da semana</div>';
        return;
      }
      const { dataIni, dataFim } = semInfo;

      let rows = [];

      if (tipo === 'naoexec') {
        // Não executadas: na prog mas não encerradas
        const { data: prog } = await db.from('programacao_semanal')
          .select('os, cod_servico, desc_servico, hh_previsto, equipe')
          .eq('semana', semNum).eq('ano', anoNum);

        if (!prog || !prog.length) { tabelaEl.innerHTML = '<div style="padding:12px;font-size:12px;color:#9ca3af;text-align:center">Sem dados</div>'; return; }

        const osNums = [...new Set(prog.map(p=>p.os))];
        const { data: osData } = await db.from('ordens_servico')
          .select('os, cod_servico, status_os, modalidade')
          .in('os', osNums.slice(0,500));

        const mapaOS = {};
        (osData||[]).forEach(o => { mapaOS[o.os+'|'+(o.cod_servico||'?')] = o; });

        prog.forEach(p => {
          const inf = mapaOS[p.os+'|'+(p.cod_servico||'?')];
          if (!inf) return;
          if ((inf.modalidade||'OUTROS').toUpperCase().trim() !== modal) return;
          if (inf.status_os === '4 - Encerrada') return;
          rows.push({ os: p.os, desc: p.desc_servico||'—', hhReal: 0, hhPrev: parseFloat(p.hh_previsto)||0, tipo: 'naoexec' });
        });

      } else {
        // MCU / Dentro / Fora: OS encerradas no período
        const { data: osEnc } = await db.from('ordens_servico')
          .select('os, cod_servico, tipo_atividade, modalidade, desc_os, desc_servico, hh_real_os, hh_real_servico, hh_prev_servico')
          .eq('status_os', '4 - Encerrada')
          .gte('data_encerramento', dataIni)
          .lte('data_encerramento', dataFim);

        // Chaves da programação desta semana
        const { data: progSem } = await db.from('programacao_semanal')
          .select('os').eq('semana', semNum).eq('ano', anoNum);
        const chavProg = new Set((progSem||[]).map(p => p.os));

        (osEnc||[]).forEach(o => {
          if ((o.modalidade||'OUTROS').toUpperCase().trim() !== modal) return;
          const isMCU = o.tipo_atividade === 'MCU';
          const isDentro = !isMCU && chavProg.has(o.os);
          const isFora   = !isMCU && !chavProg.has(o.os);
          if (tipo === 'mcu'    && !isMCU)    return;
          if (tipo === 'dentro' && !isDentro) return;
          if (tipo === 'fora'   && !isFora)   return;
          const hhReal = isMCU ? (parseFloat(o.hh_real_os)||0) : (parseFloat(o.hh_real_servico)||0);
          const hhPrev = parseFloat(o.hh_prev_servico)||0;
          const desc   = isMCU ? (o.desc_os||'—') : (o.desc_servico||'—');
          rows.push({ os: o.os, desc, hhReal, hhPrev, tipo });
        });
      }

      // Ordenar por Hh realizado decrescente
      rows.sort((a,b) => b.hhReal - a.hhReal);

      if (countEl) countEl.textContent = '(' + rows.length + ' OS)';

      if (!rows.length) {
        tabelaEl.innerHTML = '<div style="padding:12px;font-size:12px;color:#9ca3af;text-align:center">Nenhuma OS encontrada</div>';
        if (topEl) topEl.style.display = 'none';
        if (botEl) botEl.style.display = 'none';
        return;
      }

      // Montar tabela
      const G = '#16a34a', R = '#dc2626';
      let html = '<table style="width:100%;border-collapse:collapse;font-size:11px">';
      html += '<tr style="border-bottom:2px solid var(--border)">';
      html += '<th style="text-align:left;padding:5px 6px;color:#6b7280;font-size:9px;font-weight:700;letter-spacing:.08em;width:52px">OS</th>';
      html += '<th style="text-align:left;padding:5px 6px;color:#6b7280;font-size:9px;font-weight:700;letter-spacing:.08em">DESCRIÇÃO</th>';
      html += '<th style="text-align:right;padding:5px 6px;color:#6b7280;font-size:9px;font-weight:700;letter-spacing:.08em;white-space:nowrap">Hh Real</th>';
      html += '<th style="text-align:right;padding:5px 6px;color:#6b7280;font-size:9px;font-weight:700;letter-spacing:.08em;white-space:nowrap">%Hh</th>';
      html += '</tr>';

      rows.forEach((r, i) => {
        const pct = tipo === 'mcu' ? null : (r.hhPrev > 0 ? Math.round(r.hhReal/r.hhPrev*100) : (r.hhReal > 0 ? null : 0));
        const pctColor = pct === null ? '#9ca3af' : pct >= 75 ? G : R;
        const pctTxt   = pct === null ? '—' : pct + '%';
        const descCurta = r.desc; // Mostrar descrição completa
        const bg = i % 2 === 0 ? '' : 'background:#f9fafb';
        html += '<tr style="border-bottom:1px solid var(--border);'+bg+'">';
        html += '<td style="padding:6px 6px;font-weight:700;color:#374151">'+r.os+'</td>';
        html += '<td style="padding:6px 6px;color:#6b7280;word-break:break-word;white-space:normal;line-height:1.4">'+descCurta+'</td>';
        html += '<td style="padding:6px 6px;text-align:right;color:#374151;white-space:nowrap">'+( r.hhReal ? Math.round(r.hhReal*10)/10 : '0' )+'h</td>';
        html += '<td style="padding:6px 6px;text-align:right;font-weight:700;color:'+pctColor+';white-space:nowrap">'+pctTxt+'</td>';
        html += '</tr>';
      });
      html += '</table>';
      tabelaEl.innerHTML = html;
      if (topEl) topEl.style.display = rows.length > 8 ? 'block' : 'none';
      if (botEl) botEl.style.display = rows.length > 8 ? 'block' : 'none';

    } catch(e) {
      console.error('Lista:', e);
      tabelaEl.innerHTML = '<div style="padding:12px;font-size:12px;color:#dc2626">Erro: '+e.message+'</div>';
    }
  },

  exportar() { showToast('Exportação PDF em desenvolvimento','info'); },
};
