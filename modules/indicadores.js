/* ═══════════════════════════════════════════════════════
   MAN360 — Módulo: Indicadores Manutenção
   Comparativo Clementina x Queiroz: quantidade de OS, HH
   realizado e mix qtd/HH por classificação, por semana
   (segunda a domingo). Escopo atual: mecânica.

   AJUSTE POSSÍVEL: DATE_FIELD abaixo define o campo usado
   pra bucketizar por semana. Hoje é 'data_fim_exec'. Trocar
   para 'data_encerramento' se fizer mais sentido.
   ═══════════════════════════════════════════════════════ */
window.Modulos = window.Modulos || {};

window.Modulos.indicadores = {

  DATE_FIELD: 'data_encerramento',

  CLASSIFICACAO: {
    programavel: { label: 'Corretiva programável', tipos: ['MCP', 'RGS', 'MDP', 'MBT'], hex: '#2563eb' },
    emergencial: { label: 'Emergencial',            tipos: ['MCU'],                     hex: '#C8102E' },
    inspecao:    { label: 'Inspeção / preventiva',  tipos: ['IPE', 'INP'],               hex: '#16a34a' },
  },

  EMPRESAS: [
    { codigo: '1', nome: 'Clementina', slug: 'cle' },
    { codigo: '2', nome: 'Queiroz',    slug: 'que' },
  ],

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
      `<span style="display:flex;align-items:center;gap:5px;font-size:11px;color:#6b7280">
         <span style="width:9px;height:9px;border-radius:2px;background:${c.hex};display:inline-block"></span>${c.label}
       </span>`
    ).join('');

    const painel = (idPrefix) => this.EMPRESAS.map(e => `
      <div class="chart-wrap">
        <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:6px">${e.nome}</div>
        <div class="chart-container"><canvas id="ind-${idPrefix}-${e.slug}"></canvas></div>
      </div>`
    ).join('');

    return `
<div class="filters-bar">
  <span class="filter-label">Período</span>
  <input type="date" id="ind-data-inicio" value="${isoInicio}"
    style="height:30px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px">
  <span style="color:#9ca3af;font-size:11px">até</span>
  <input type="date" id="ind-data-fim" value="${isoHoje}"
    style="height:30px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px">
  <button id="ind-btn-aplicar"
    style="flex:none;width:auto;padding:0 16px;height:30px;border:1px solid var(--yellow-dk);border-radius:var(--radius-sm);background:var(--yellow);color:var(--dark1);font-family:var(--font);font-size:11px;font-weight:700;cursor:pointer">
    Aplicar
  </button>
  <span id="ind-status" style="font-size:11px;color:#9ca3af;margin-left:auto"></span>
</div>

<div style="display:flex;gap:16px;margin-bottom:14px;padding:0 4px">${legenda}</div>

<div class="card" style="margin-bottom:16px">
  <div class="card-title">Quantidade de OS por semana</div>
  <div class="charts-row">${painel('qtd')}</div>
</div>

<div class="card" style="margin-bottom:16px">
  <div class="card-title">HH realizado por semana</div>
  <div class="charts-row">${painel('hh')}</div>
</div>

<div class="card" style="margin-bottom:16px">
  <div class="card-title">Tendência — corretiva emergencial (MCU)</div>
  <div class="charts-row">${painel('trend')}</div>
</div>

<div class="card" style="margin-bottom:16px">
  <div class="card-title">% quantidade de OS x % HH realizado por tipo — intervalo total</div>
  <div class="charts-row">${painel('pareto')}</div>
</div>

<div class="import-section"><div class="card">
  <div class="card-title"><i class="ti ti-upload" style="color:var(--yellow)"></i> IMPORTAR DADOS</div>
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
    <div style="font-size:11px;color:#6b7280;min-width:160px">
      <div style="font-weight:600;color:#374151;margin-bottom:8px">Arquivos aceitos:</div>
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
     CLASSIFICAÇÃO E SEMANAS
  ══════════════════════════════════════════ */
  _classificar(tipoAtividade) {
    for (const [key, cfg] of Object.entries(this.CLASSIFICACAO)) {
      if (cfg.tipos.includes(tipoAtividade)) return key;
    }
    return null;
  },
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
     BUSCA E AGREGAÇÃO
  ══════════════════════════════════════════ */
  async _buscarRegistros(empresaCodigo, dataInicioISO, dataFimISO) {
    const { data, error } = await getDB()
      .from('ordens_servico')
      .select('tipo_atividade, hh_real_servico, ' + this.DATE_FIELD)
      .eq('empresa', empresaCodigo)
      .not(this.DATE_FIELD, 'is', null)
      .gt('hh_real_servico', 0)
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
      acc[idx][classe].hh += Number(r.hh_real_servico) || 0;
    }
    return acc;
  },
  _agregarTotal(registros) {
    const tot = { programavel: { qtd: 0, hh: 0 }, emergencial: { qtd: 0, hh: 0 }, inspecao: { qtd: 0, hh: 0 } };
    for (const r of registros) {
      const classe = this._classificar(r.tipo_atividade);
      if (!classe) continue;
      tot[classe].qtd += 1;
      tot[classe].hh += Number(r.hh_real_servico) || 0;
    }
    return tot;
  },
  _round1(n) { return Math.round(n * 10) / 10; },
  _montarParetoData(totais) {
    const totalQtd = totais.programavel.qtd + totais.emergencial.qtd + totais.inspecao.qtd;
    const totalHh  = totais.programavel.hh  + totais.emergencial.hh  + totais.inspecao.hh;
    const linhas = Object.entries(this.CLASSIFICACAO).map(([key, cfg]) => ({
      key, label: cfg.label, hex: cfg.hex,
      pctQtd: totalQtd > 0 ? this._round1((totais[key].qtd / totalQtd) * 100) : 0,
      pctHh:  totalHh  > 0 ? this._round1((totais[key].hh  / totalHh)  * 100) : 0,
    }));
    linhas.sort((a, b) => b.pctQtd - a.pctQtd);
    return linhas;
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
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af' } },
      y: { beginAtZero: true, max: yMax, grid: { color: '#e4e4e7' }, ticks: { font: { size: 10 }, color: '#9ca3af' } },
    };
  },
  _renderGraficoSemanal(canvasId, semanas, porSemana, campo, yMax) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: semanas.map(s => s.label),
        datasets: Object.entries(this.CLASSIFICACAO).map(([key, cfg]) => ({
          label: cfg.label, data: porSemana.map(s => this._round1(s[key][campo])),
          backgroundColor: cfg.hex, borderRadius: 4,
        })),
      },
      options: { responsive: true, maintainAspectRatio: false, scales: this._baseScalesBar(yMax), plugins: { legend: { display: false } } },
    });
    this._s.instancias.push(chart);
  },
  _renderGraficoTendencia(canvasId, semanas, porSemana, yMax) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const hex = this.CLASSIFICACAO.emergencial.hex;
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: semanas.map(s => s.label),
        datasets: [{
          data: porSemana.map(s => s.emergencial.qtd),
          borderColor: hex, backgroundColor: hex + '1A', fill: true, tension: 0.3,
          pointRadius: 4, pointBackgroundColor: hex, pointBorderColor: '#ffffff', pointBorderWidth: 2, borderWidth: 2,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: this._baseScalesBar(yMax), plugins: { legend: { display: false } } },
    });
    this._s.instancias.push(chart);
  },
  _renderGraficoPareto(canvasId, totais) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const linhas = this._montarParetoData(totais);
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: linhas.map(l => l.label),
        datasets: [
          { label: '% Qtd. OS',       data: linhas.map(l => l.pctQtd), backgroundColor: '#2563eb', borderRadius: 4 },
          { label: '% HH realizado',  data: linhas.map(l => l.pctHh),  backgroundColor: '#d97706', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af' } },
          y: { beginAtZero: true, max: 100, grid: { color: '#e4e4e7' }, ticks: { font: { size: 10 }, color: '#9ca3af', callback: v => v + '%' } },
        },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + c.parsed.y + '%' } } },
      },
    });
    this._s.instancias.push(chart);
  },
  _maxDe(porSemanaLista, campo) {
    let max = 0;
    for (const porSemana of porSemanaLista)
      for (const s of porSemana)
        for (const classe of Object.keys(this.CLASSIFICACAO))
          if (s[classe][campo] > max) max = s[classe][campo];
    return max === 0 ? 10 : Math.ceil(max * 1.15);
  },
  _maxTrend(porSemanaLista) {
    let max = 0;
    for (const porSemana of porSemanaLista)
      for (const s of porSemana)
        if (s.emergencial.qtd > max) max = s.emergencial.qtd;
    return max === 0 ? 5 : Math.ceil(max * 1.2);
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

      const porSemanaPorEmpresa = resultados.map(regs => this._agregarPorSemana(regs, semanas));
      const totaisPorEmpresa    = resultados.map(regs => this._agregarTotal(regs));

      this._destruirCharts();

      const yMaxQtd   = this._maxDe(porSemanaPorEmpresa, 'qtd');
      const yMaxHh    = this._maxDe(porSemanaPorEmpresa, 'hh');
      const yMaxTrend = this._maxTrend(porSemanaPorEmpresa);

      this.EMPRESAS.forEach((e, i) => {
        this._renderGraficoSemanal('ind-qtd-' + e.slug, semanas, porSemanaPorEmpresa[i], 'qtd', yMaxQtd);
        this._renderGraficoSemanal('ind-hh-' + e.slug, semanas, porSemanaPorEmpresa[i], 'hh', yMaxHh);
        this._renderGraficoTendencia('ind-trend-' + e.slug, semanas, porSemanaPorEmpresa[i], yMaxTrend);
        this._renderGraficoPareto('ind-pareto-' + e.slug, totaisPorEmpresa[i]);
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
