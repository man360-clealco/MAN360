/* ═══════════════════════════════════════════════════════
   MAN360 — Módulo: Indicadores Manutenção
   Comparativo Clementina x Queiroz: quantidade de OS, HH
   realizado, pareto de HH e comparativo previsto x realizado
   por classificação. Escopo atual: mecânica.

   AJUSTE POSSÍVEL: DATE_FIELD abaixo define o campo usado
   pra bucketizar por semana e pra decidir "encerrado".
   ═══════════════════════════════════════════════════════ */
window.Modulos = window.Modulos || {};

window.Modulos.indicadores = {

  DATE_FIELD: 'data_encerramento',

  // hex = cor "normal" (usada em Qtd. por semana, HH por semana, barra de HH realizado)
  // dark = variante escura da mesma cor (usada pra distinguir a série "Qtd."/"Previsto")
  CLASSIFICACAO: {
    programavel: { label: 'Corretiva programável', tipos: ['MCP', 'RGS', 'MDP', 'MBT'], hex: '#2563eb', dark: '#1e3a8a' },
    emergencial: { label: 'Emergencial',            tipos: ['MCU'],                     hex: '#C8102E', dark: '#7a0a1c' },
    inspecao:    { label: 'Inspeção / preventiva',  tipos: ['IPE', 'INP'],               hex: '#16a34a', dark: '#166534' },
  },

  EMPRESAS: [
    { codigo: '1', nome: 'Clementina', slug: 'cle' },
    { codigo: '2', nome: 'Queiroz',    slug: 'que' },
  ],

  TXT_ESCURO: '#1f2937',
  TXT_MEDIO:  '#374151',
  GRID:       '#e4e4e7',

  _s: { instancias: [] },

  async init(container) {
    container.innerHTML = this._tpl();
    document.getElementById('ind-btn-aplicar').addEventListener('click', () => this._aplicar());
    await this._aplicar();
  },

  /* ══════════════════════════════════════════
     TEMPLATE
  ══════════════════════════════════════════ */
  _tpl() {
    const hoje = new Date();
    const oitoSemanasAtras = new Date(hoje);
    oitoSemanasAtras.setDate(hoje.getDate() - 56);
    const isoHoje   = hoje.toISOString().slice(0, 10);
    const isoInicio = oitoSemanasAtras.toISOString().slice(0, 10);

    const legenda = Object.values(this.CLASSIFICACAO).map(c =>
      `<span style="display:flex;align-items:center;gap:5px;font-size:11px;color:${this.TXT_MEDIO};font-weight:500">
         <span style="width:9px;height:9px;border-radius:2px;background:${c.hex};display:inline-block"></span>${c.label}
       </span>`
    ).join('');

    const painel = (idPrefix) => this.EMPRESAS.map(e => `
      <div class="chart-wrap">
        <div style="font-size:11px;font-weight:700;color:${this.TXT_ESCURO};margin-bottom:6px">${e.nome}</div>
        <div class="chart-container"><canvas id="ind-${idPrefix}-${e.slug}"></canvas></div>
      </div>`
    ).join('');

    const cardTitle = (txt) => `<div class="card-title" style="color:${this.TXT_ESCURO}">${txt}</div>`;

    return `
<div class="filters-bar">
  <span class="filter-label" style="color:${this.TXT_MEDIO}">Período</span>
  <input type="date" id="ind-data-inicio" value="${isoInicio}"
    style="height:30px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px;color:${this.TXT_ESCURO}">
  <span style="color:${this.TXT_MEDIO};font-size:11px">até</span>
  <input type="date" id="ind-data-fim" value="${isoHoje}"
    style="height:30px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px;color:${this.TXT_ESCURO}">
  <button id="ind-btn-aplicar"
    style="flex:none;width:auto;padding:0 16px;height:30px;border:1px solid var(--yellow-dk);border-radius:var(--radius-sm);background:var(--yellow);color:var(--dark1);font-family:var(--font);font-size:11px;font-weight:700;cursor:pointer">
    Aplicar
  </button>
  <span id="ind-status" style="font-size:11px;color:${this.TXT_MEDIO};font-weight:500;margin-left:auto"></span>
</div>

<div style="display:flex;gap:16px;margin-bottom:14px;padding:0 4px">${legenda}</div>

<div class="card" style="margin-bottom:16px">
  ${cardTitle('Quantidade de OS por semana')}
  <div class="charts-row">${painel('qtd')}</div>
</div>

<div class="card" style="margin-bottom:16px">
  ${cardTitle('HH realizado por semana')}
  <div class="charts-row">${painel('hh')}</div>
</div>

<div class="card" style="margin-bottom:16px">
  ${cardTitle('Pareto de HH realizado por classificação — intervalo total')}
  <div class="charts-row">${painel('paretohh')}</div>
</div>

<div class="card" style="margin-bottom:16px">
  ${cardTitle('% quantidade de OS x % HH realizado por tipo — intervalo total')}
  <div class="charts-row">${painel('mix')}</div>
</div>

<div class="card" style="margin-bottom:16px">
  ${cardTitle('HH previsto x HH realizado — corretiva programável e inspeção (exclui emergencial) — intervalo total')}
  <div class="charts-row">${painel('prevreal')}</div>
</div>

<div class="import-section"><div class="card">
  <div class="card-title" style="color:${this.TXT_ESCURO}"><i class="ti ti-upload" style="color:var(--yellow)"></i> IMPORTAR DADOS</div>
  <div style="display:grid;grid-template-columns:1fr auto;gap:16px;align-items:start">
    <div class="dropzone" id="ind-dz"
      ondragover="event.preventDefault();this.classList.add('over')"
      ondragleave="this.classList.remove('over')"
      ondrop="Modulos.indicadores._drop(event)"
      onclick="document.getElementById('ind-file-input').click()">
      <i class="ti ti-cloud-upload"></i>
      <p><strong>Arraste o arquivo aqui</strong><br>ou clique para selecionar</p>
      <div class="file-types" style="margin-top:10px">
        <div class="file-type"><i class="ti ti-file-spreadsheet" style="color:var(--green)"></i><span class="ext">.xlsx</span></div>
        <div class="file-type"><i class="ti ti-file-spreadsheet" style="color:var(--amber)"></i><span class="ext">.xls</span></div>
      </div>
    </div>
    <div style="font-size:11px;color:${this.TXT_MEDIO};min-width:160px">
      <div style="font-weight:700;color:${this.TXT_ESCURO};margin-bottom:8px">Arquivos aceitos:</div>
      <div>• Ordens de Serviço (MEC_CLE / MEC_QUEIROZ)</div>
    </div>
  </div>
  <input type="file" id="ind-file-input" accept=".xlsx,.xls,.csv" style="display:none"
    onchange="Modulos.indicadores._filesel(event)">
  <div style="margin-top:16px">
    <div class="hist-title">IMPORTAÇÕES RECENTES</div>
    <div id="ind-hist-list"></div>
  </div>
</div></div>`;
  },

  /* ══════════════════════════════════════════
     IMPORTAÇÃO (mesmo fluxo do prog_semanal.js —
     será unificado depois)
  ══════════════════════════════════════════ */
  _drop(e) {
    e.preventDefault();
    document.getElementById('ind-dz').classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f) this._proc(f);
  },
  _filesel(e) {
    const f = e.target.files[0];
    if (f) this._proc(f);
    e.target.value = '';
  },
  async _proc(file) {
    showToast('Lendo ' + file.name + '...', 'info');
    const res = await processarArquivo(file);
    showToast(res.msg, res.ok ? 'ok' : 'erro', res.ok ? 4000 : 6000);
    this._hist(file.name, res.msg, res.ok);
    if (res.ok) await this._aplicar();
  },
  _hist(nome, badge, ok) {
    const hora = new Date().getHours() + ':' + String(new Date().getMinutes()).padStart(2, '0');
    const list = document.getElementById('ind-hist-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'hist-row';
    row.innerHTML = '<i class="ti ti-file-spreadsheet" style="color:' + (ok ? 'var(--green)' : '#dc2626') + '"></i>' +
      '<span class="hist-name" title="' + nome + '">' + nome + '</span>' +
      '<span class="hist-date">hoje ' + hora + '</span>' +
      '<span class="hist-badge ' + (ok ? 'hb-ok' : 'hb-err') + '">' + badge + '</span>';
    list.insertAdjacentElement('afterbegin', row);
  },

  /* ══════════════════════════════════════════
     DATAS
  ══════════════════════════════════════════ */
  _parseISODateLocal(isoStr) {
    const [y, m, d] = String(isoStr).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  _segundaFeira(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1) - day);
    return d;
  },
  _domingoDaSemana(monday) {
    const d = new Date(monday);
    d.setDate(d.getDate() + 6);
    return d;
  },
  _fmtDia(d) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  },
  _gerarSemanas(dataInicio, dataFim) {
    const semanas = [];
    let cursor = this._segundaFeira(dataInicio);
    const ultima = this._segundaFeira(dataFim);
    let guard = 0;
    while (cursor.getTime() <= ultima.getTime() && guard < 260) {
      if (cursor.getTime() >= dataInicio.getTime()) {
        const dom = this._domingoDaSemana(cursor);
        semanas.push({ inicio: new Date(cursor), fim: dom, label: this._fmtDia(cursor) + '-' + this._fmtDia(dom) });
      }
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 7);
      guard++;
    }
    return semanas;
  },
  _indiceDaSemana(semanas, data) {
    const seg = this._segundaFeira(data).getTime();
    return semanas.findIndex(s => s.inicio.getTime() === seg);
  },

  /* ══════════════════════════════════════════
     CLASSIFICAÇÃO
  ══════════════════════════════════════════ */
  _classificar(tipoAtividade) {
    for (const [key, cfg] of Object.entries(this.CLASSIFICACAO)) {
      if (cfg.tipos.includes(tipoAtividade)) return key;
    }
    return null;
  },
  _hhReal(r) {
    return Number(r.hh_real_servico) || Number(r.hh_real_os) || 0;
  },
  _hhPrev(r) {
    return Number(r.hh_prev_servico) || Number(r.hh_prev_os) || 0;
  },

  /* ══════════════════════════════════════════
     BUSCA E AGREGAÇÃO
  ══════════════════════════════════════════ */
  async _buscarRegistros(empresaCodigo, dataInicioISO, dataFimISO) {
    const { data, error } = await getDB()
      .from('ordens_servico')
      .select('tipo_atividade, hh_real_servico, hh_real_os, hh_prev_servico, hh_prev_os, ' + this.DATE_FIELD)
      .eq('empresa', empresaCodigo)
      .not(this.DATE_FIELD, 'is', null)
      .or('hh_real_servico.gt.0,hh_real_os.gt.0')
      .gte(this.DATE_FIELD, dataInicioISO)
      .lte(this.DATE_FIELD, dataFimISO);
    if (error) throw error;
    return data || [];
  },
  _agregarPorSemana(registros, semanas) {
    const acc = semanas.map(() => ({
      programavel: { qtd: 0, hh: 0 }, emergencial: { qtd: 0, hh: 0 }, inspecao: { qtd: 0, hh: 0 },
    }));
    for (const r of registros) {
      const classe = this._classificar(r.tipo_atividade);
      if (!classe) continue;
      const dataRef = r[this.DATE_FIELD];
      if (!dataRef) continue;
      const idx = this._indiceDaSemana(semanas, this._parseISODateLocal(dataRef));
      if (idx === -1) continue;
      acc[idx][classe].qtd += 1;
      acc[idx][classe].hh += this._hhReal(r);
    }
    return acc;
  },
  _agregarTotal(registros) {
    const tot = { programavel: { qtd: 0, hh: 0 }, emergencial: { qtd: 0, hh: 0 }, inspecao: { qtd: 0, hh: 0 } };
    for (const r of registros) {
      const classe = this._classificar(r.tipo_atividade);
      if (!classe) continue;
      tot[classe].qtd += 1;
      tot[classe].hh += this._hhReal(r);
    }
    return tot;
  },
  _agregarPrevRealNaoMCU(registros) {
    const tot = { programavel: { prev: 0, real: 0 }, inspecao: { prev: 0, real: 0 } };
    for (const r of registros) {
      const classe = this._classificar(r.tipo_atividade);
      if (classe !== 'programavel' && classe !== 'inspecao') continue;
      tot[classe].prev += this._hhPrev(r);
      tot[classe].real += this._hhReal(r);
    }
    return tot;
  },
  _round1(n) { return Math.round(n * 10) / 10; },
  _montarMixData(totais) {
    const totalQtd = totais.programavel.qtd + totais.emergencial.qtd + totais.inspecao.qtd;
    const totalHh  = totais.programavel.hh  + totais.emergencial.hh  + totais.inspecao.hh;
    // ordem fixa: programável, emergencial, inspeção — sem ordenar por magnitude
    return Object.entries(this.CLASSIFICACAO).map(([key, cfg]) => ({
      key, label: cfg.label, hex: cfg.hex, dark: cfg.dark,
      pctQtd: totalQtd > 0 ? this._round1((totais[key].qtd / totalQtd) * 100) : 0,
      pctHh:  totalHh  > 0 ? this._round1((totais[key].hh  / totalHh)  * 100) : 0,
    }));
  },

  /* ══════════════════════════════════════════
     PLUGIN: total flutuando acima do grupo de barras
  ══════════════════════════════════════════ */
  _pluginTotalGrupo(txtColor) {
    return {
      id: 'totalGrupo',
      afterDatasetsDraw(chart) {
        const meta0 = chart.getDatasetMeta(0);
        if (!meta0 || !meta0.data.length) return;
        const { ctx } = chart;
        ctx.save();
        ctx.font = 'bold 10px Sora, sans-serif';
        ctx.fillStyle = txtColor;
        ctx.textAlign = 'center';
        meta0.data.forEach((bar, i) => {
          let total = 0;
          let topoMin = bar.y;
          chart.data.datasets.forEach((ds, dsIdx) => {
            total += Number(ds.data[i]) || 0;
            const pt = chart.getDatasetMeta(dsIdx).data[i];
            if (pt && pt.y < topoMin) topoMin = pt.y;
          });
          if (total > 0) {
            ctx.fillText(Math.round(total).toLocaleString('pt-BR'), bar.x, topoMin - 16);
          }
        });
        ctx.restore();
      },
    };
  },

  /* ══════════════════════════════════════════
     GRÁFICOS
  ══════════════════════════════════════════ */
  _destruirCharts() {
    this._s.instancias.forEach(c => c.destroy());
    this._s.instancias = [];
  },
  _baseScalesBar(yMax) {
    return {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: this.TXT_MEDIO } },
      y: { beginAtZero: true, max: yMax, grid: { color: this.GRID }, ticks: { font: { size: 10 }, color: this.TXT_MEDIO } },
    };
  },
  _datalabelsBar(formatter) {
    return {
      anchor: 'end', align: 'top', offset: 2,
      color: this.TXT_ESCURO, font: { size: 9, weight: 'bold' },
      formatter,
    };
  },

  _renderGraficoSemanal(canvasId, semanas, porSemana, campo, yMax, comTotal) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const datalabelsFmt = this._datalabelsBar(v => v > 0 ? Math.round(v).toLocaleString('pt-BR') : '');
    const plugins = [ChartDataLabels];
    if (comTotal) plugins.push(this._pluginTotalGrupo(this.TXT_ESCURO));
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: semanas.map(s => s.label),
        datasets: Object.entries(this.CLASSIFICACAO).map(([key, cfg]) => ({
          label: cfg.label, data: porSemana.map(s => this._round1(s[key][campo])),
          backgroundColor: cfg.hex, borderRadius: 4,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: comTotal ? 22 : 14 } },
        scales: this._baseScalesBar(yMax),
        plugins: { legend: { display: false }, datalabels: datalabelsFmt },
      },
      plugins,
    });
    this._s.instancias.push(chart);
  },

  _renderGraficoParetoHH(canvasId, totais) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    // pareto de verdade: ordenado do maior HH pro menor
    const linhas = Object.entries(this.CLASSIFICACAO)
      .map(([key, cfg]) => ({ key, label: cfg.label, hex: cfg.hex, hh: this._round1(totais[key].hh) }))
      .sort((a, b) => b.hh - a.hh);
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: linhas.map(l => l.label),
        datasets: [{ data: linhas.map(l => l.hh), backgroundColor: linhas.map(l => l.hex), borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        scales: this._baseScalesBar(undefined),
        plugins: {
          legend: { display: false },
          datalabels: this._datalabelsBar(v => v > 0 ? Math.round(v).toLocaleString('pt-BR') + 'h' : ''),
        },
      },
      plugins: [ChartDataLabels],
    });
    this._s.instancias.push(chart);
  },

  _renderGraficoMix(canvasId, totais) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const linhas = this._montarMixData(totais);
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: linhas.map(l => l.label),
        datasets: [
          { label: '% Qtd. OS',      data: linhas.map(l => l.pctQtd), backgroundColor: linhas.map(l => l.dark), borderRadius: 4 },
          { label: '% HH realizado', data: linhas.map(l => l.pctHh),  backgroundColor: linhas.map(l => l.hex),  borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: this.TXT_MEDIO } },
          y: { beginAtZero: true, max: 100, grid: { color: this.GRID }, ticks: { font: { size: 10 }, color: this.TXT_MEDIO, callback: v => v + '%' } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => c.dataset.label + ': ' + c.parsed.y + '%' } },
          datalabels: this._datalabelsBar(v => v > 0 ? v + '%' : ''),
        },
      },
      plugins: [ChartDataLabels],
    });
    this._s.instancias.push(chart);
  },

  _renderGraficoPrevReal(canvasId, totaisPrevReal) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const chaves = ['programavel', 'inspecao'];
    const labels = chaves.map(k => this.CLASSIFICACAO[k].label);
    const darkCores = chaves.map(k => this.CLASSIFICACAO[k].dark);
    const cores = chaves.map(k => this.CLASSIFICACAO[k].hex);
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'HH previsto',  data: chaves.map(k => this._round1(totaisPrevReal[k].prev)), backgroundColor: darkCores, borderRadius: 4 },
          { label: 'HH realizado', data: chaves.map(k => this._round1(totaisPrevReal[k].real)), backgroundColor: cores,     borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        scales: this._baseScalesBar(undefined),
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => c.dataset.label + ': ' + c.parsed.y.toLocaleString('pt-BR') + 'h' } },
          datalabels: this._datalabelsBar(v => v > 0 ? Math.round(v).toLocaleString('pt-BR') + 'h' : ''),
        },
      },
      plugins: [ChartDataLabels],
    });
    this._s.instancias.push(chart);
  },

  _maxDe(porSemanaLista, campo) {
    let max = 0;
    for (const porSemana of porSemanaLista)
      for (const s of porSemana)
        for (const classe of Object.keys(this.CLASSIFICACAO))
          if (s[classe][campo] > max) max = s[classe][campo];
    return max === 0 ? 10 : Math.ceil(max * 1.25);
  },

  /* ══════════════════════════════════════════
     ORQUESTRADOR
  ══════════════════════════════════════════ */
  async _aplicar() {
    const dataInicioISO = document.getElementById('ind-data-inicio').value;
    const dataFimISO    = document.getElementById('ind-data-fim').value;
    const statusEl = document.getElementById('ind-status');
    if (statusEl) statusEl.textContent = 'Carregando...';

    try {
      const semanas = this._gerarSemanas(this._parseISODateLocal(dataInicioISO), this._parseISODateLocal(dataFimISO));
      const resultados = await Promise.all(
        this.EMPRESAS.map(e => this._buscarRegistros(e.codigo, dataInicioISO, dataFimISO))
      );

      const porSemanaPorEmpresa    = resultados.map(regs => this._agregarPorSemana(regs, semanas));
      const totaisPorEmpresa       = resultados.map(regs => this._agregarTotal(regs));
      const prevRealPorEmpresa     = resultados.map(regs => this._agregarPrevRealNaoMCU(regs));

      this._destruirCharts();

      const yMaxQtd = this._maxDe(porSemanaPorEmpresa, 'qtd');
      const yMaxHh  = this._maxDe(porSemanaPorEmpresa, 'hh');

      this.EMPRESAS.forEach((e, i) => {
        this._renderGraficoSemanal('ind-qtd-' + e.slug, semanas, porSemanaPorEmpresa[i], 'qtd', yMaxQtd, false);
        this._renderGraficoSemanal('ind-hh-' + e.slug, semanas, porSemanaPorEmpresa[i], 'hh', yMaxHh, true);
        this._renderGraficoParetoHH('ind-paretohh-' + e.slug, totaisPorEmpresa[i]);
        this._renderGraficoMix('ind-mix-' + e.slug, totaisPorEmpresa[i]);
        this._renderGraficoPrevReal('ind-prevreal-' + e.slug, prevRealPorEmpresa[i]);
      });

      if (statusEl) {
        const total = resultados.reduce((sum, r) => sum + r.length, 0);
        statusEl.textContent = total + ' serviços encerrados no período · ' + semanas.length + ' semana(s)';
      }
    } catch (err) {
      console.error('[indicadores]', err);
      if (statusEl) statusEl.textContent = 'Erro ao carregar dados';
      showToast('Erro ao carregar indicadores: ' + err.message, 'erro');
    }
  },
};
