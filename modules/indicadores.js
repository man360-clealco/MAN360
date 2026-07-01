/* ═══════════════════════════════════════════════════════════════
   MAN360 — Indicadores Manutenção
   Comparativo Clementina x Queiroz: quantidade de OS, HH realizado
   e mix qtd/HH por classificação, por semana (segunda a domingo).

   Escopo atual: mecânica (a base ordens_servico já é filtrada
   nesse sentido pela importação MEC_CLE / MEC_QUEIROZ).

   AJUSTES QUE PODEM SER NECESSÁRIOS:
   - DATE_FIELD abaixo: campo de data usado para bucketizar por
     semana. Hoje assume 'data_fim_exec' (execução real). Trocar
     para 'data_encerramento' se fizer mais sentido no seu fluxo.
   - getClient(): tenta os padrões mais comuns de client Supabase
     (window.sb, window.supabaseClient, DB.client, DB.supabase).
     Se shared/db.js expõe algo diferente, ajuste só essa função.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  window.Modulos = window.Modulos || {};

  const DATE_FIELD = 'data_fim_exec';

  const CLASSIFICACAO = {
    programavel: {
      label: 'Corretiva programável',
      tipos: ['MCP', 'RGS', 'MDP', 'MBT'],
      hex: '#2563eb'
    },
    emergencial: {
      label: 'Emergencial',
      tipos: ['MCU'],
      hex: '#C8102E'
    },
    inspecao: {
      label: 'Inspeção / preventiva',
      tipos: ['IPE', 'INP'],
      hex: '#16a34a'
    }
  };

  const EMPRESAS = [
    { codigo: '1', nome: 'Clementina', slug: 'cle' },
    { codigo: '2', nome: 'Queiroz', slug: 'que' }
  ];

  function classificar(tipoAtividade) {
    for (const [key, cfg] of Object.entries(CLASSIFICACAO)) {
      if (cfg.tipos.includes(tipoAtividade)) return key;
    }
    return null;
  }

  function getClient() {
    if (window.sb) return window.sb;
    if (window.supabaseClient) return window.supabaseClient;
    if (window.DB && window.DB.client) return window.DB.client;
    if (window.DB && window.DB.supabase) return window.DB.supabase;
    throw new Error(
      'Cliente Supabase não encontrado. Ajuste getClient() em modules/indicadores.js.'
    );
  }

  /* ── Helpers de semana (segunda a domingo) ── */
  function segundaFeira(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function domingoDaSemana(monday) {
    const d = new Date(monday);
    d.setDate(d.getDate() + 6);
    return d;
  }

  function fmtDia(d) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function gerarSemanas(dataInicio, dataFim) {
    const semanas = [];
    let cursor = segundaFeira(dataInicio);
    const ultimaSemana = segundaFeira(dataFim);
    let guard = 0;
    while (cursor.getTime() <= ultimaSemana.getTime() && guard < 260) {
      const dom = domingoDaSemana(cursor);
      semanas.push({
        inicio: new Date(cursor),
        fim: dom,
        label: `${fmtDia(cursor)}-${fmtDia(dom)}`
      });
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 7);
      guard++;
    }
    return semanas;
  }

  function indiceDaSemana(semanas, data) {
    const seg = segundaFeira(data).getTime();
    return semanas.findIndex((s) => s.inicio.getTime() === seg);
  }

  /* ── Busca e agregação ── */
  async function buscarRegistros(empresaCodigo, dataInicioISO, dataFimISO) {
    const client = getClient();
    const { data, error } = await client
      .from('ordens_servico')
      .select(`tipo_atividade, hh_real_servico, ${DATE_FIELD}, status_servico`)
      .eq('empresa', empresaCodigo)
      .ilike('status_servico', '4%')
      .gt('hh_real_servico', 0)
      .gte(DATE_FIELD, dataInicioISO)
      .lte(DATE_FIELD, dataFimISO);

    if (error) throw error;
    return data || [];
  }

  function agregarPorSemana(registros, semanas) {
    const acc = semanas.map(() => ({
      programavel: { qtd: 0, hh: 0 },
      emergencial: { qtd: 0, hh: 0 },
      inspecao: { qtd: 0, hh: 0 }
    }));

    for (const r of registros) {
      const classe = classificar(r.tipo_atividade);
      if (!classe) continue;
      const dataRef = r[DATE_FIELD];
      if (!dataRef) continue;
      const idx = indiceDaSemana(semanas, new Date(dataRef));
      if (idx === -1) continue;
      acc[idx][classe].qtd += 1;
      acc[idx][classe].hh += Number(r.hh_real_servico) || 0;
    }
    return acc;
  }

  function agregarTotal(registros) {
    const tot = {
      programavel: { qtd: 0, hh: 0 },
      emergencial: { qtd: 0, hh: 0 },
      inspecao: { qtd: 0, hh: 0 }
    };
    for (const r of registros) {
      const classe = classificar(r.tipo_atividade);
      if (!classe) continue;
      tot[classe].qtd += 1;
      tot[classe].hh += Number(r.hh_real_servico) || 0;
    }
    return tot;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function montarParetoData(totais) {
    const totalQtd = totais.programavel.qtd + totais.emergencial.qtd + totais.inspecao.qtd;
    const totalHh = totais.programavel.hh + totais.emergencial.hh + totais.inspecao.hh;
    const linhas = Object.entries(CLASSIFICACAO).map(([key, cfg]) => ({
      key,
      label: cfg.label,
      hex: cfg.hex,
      pctQtd: totalQtd > 0 ? round1((totais[key].qtd / totalQtd) * 100) : 0,
      pctHh: totalHh > 0 ? round1((totais[key].hh / totalHh) * 100) : 0
    }));
    linhas.sort((a, b) => b.pctQtd - a.pctQtd);
    return linhas;
  }

  /* ── Render ── */
  function skeletonHTML() {
    const hoje = new Date();
    const oitoSemanasAtras = new Date(hoje);
    oitoSemanasAtras.setDate(hoje.getDate() - 56);
    const isoHoje = hoje.toISOString().slice(0, 10);
    const isoInicio = oitoSemanasAtras.toISOString().slice(0, 10);

    const legenda = Object.values(CLASSIFICACAO)
      .map(
        (c) =>
          `<span style="display:flex;align-items:center;gap:5px;font-size:11px;color:#6b7280">
             <span style="width:9px;height:9px;border-radius:2px;background:${c.hex};display:inline-block"></span>${c.label}
           </span>`
      )
      .join('');

    function painelPar(idPrefix, alturaClasse) {
      return EMPRESAS.map(
        (e) => `
        <div class="chart-wrap">
          <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:6px">${e.nome}</div>
          <div class="${alturaClasse}"><canvas id="ind-${idPrefix}-${e.slug}"></canvas></div>
        </div>`
      ).join('');
    }

    return `
      <div class="filters-bar">
        <span class="filter-label">Período</span>
        <input type="date" id="ind-data-inicio" value="${isoInicio}"
          style="height:30px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px">
        <span style="color:#9ca3af;font-size:11px">até</span>
        <input type="date" id="ind-data-fim" value="${isoHoje}"
          style="height:30px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px">
        <button id="ind-btn-aplicar" class="dd-action-btn primary" style="width:auto;padding:0 16px;height:30px">
          Aplicar
        </button>
        <span id="ind-status" style="font-size:11px;color:#9ca3af;margin-left:auto"></span>
      </div>

      <div style="display:flex;gap:16px;margin-bottom:14px;padding:0 4px">${legenda}</div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-title">Quantidade de OS por semana</div>
        <div class="charts-row">${painelPar('qtd', 'chart-container')}</div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-title">HH realizado por semana</div>
        <div class="charts-row">${painelPar('hh', 'chart-container')}</div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-title">Tendência — corretiva emergencial (MCU)</div>
        <div class="charts-row">${painelPar('trend', 'chart-container')}</div>
      </div>

      <div class="card">
        <div class="card-title">% quantidade de OS x % HH realizado por tipo — intervalo total</div>
        <div class="charts-row">${painelPar('pareto', 'chart-container')}</div>
      </div>
    `;
  }

  function destruirCharts(state) {
    state.instancias.forEach((c) => c.destroy());
    state.instancias = [];
  }

  function baseScalesBar(yMax) {
    return {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af' } },
      y: {
        beginAtZero: true,
        max: yMax,
        grid: { color: '#e4e4e7' },
        ticks: { font: { size: 10 }, color: '#9ca3af' }
      }
    };
  }

  function renderGraficoSemanal(canvasId, semanas, porSemana, campo, yMax, state) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: semanas.map((s) => s.label),
        datasets: Object.entries(CLASSIFICACAO).map(([key, cfg]) => ({
          label: cfg.label,
          data: porSemana.map((s) => round1(s[key][campo])),
          backgroundColor: cfg.hex,
          borderRadius: 4
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: baseScalesBar(yMax),
        plugins: { legend: { display: false } }
      }
    });
    state.instancias.push(chart);
  }

  function renderGraficoTendencia(canvasId, semanas, porSemana, yMax, state) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const hex = CLASSIFICACAO.emergencial.hex;
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: semanas.map((s) => s.label),
        datasets: [
          {
            data: porSemana.map((s) => s.emergencial.qtd),
            borderColor: hex,
            backgroundColor: hex + '1A',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: hex,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: baseScalesBar(yMax),
        plugins: { legend: { display: false } }
      }
    });
    state.instancias.push(chart);
  }

  function renderGraficoPareto(canvasId, totais, state) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const linhas = montarParetoData(totais);
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: linhas.map((l) => l.label),
        datasets: [
          { label: '% Qtd. OS', data: linhas.map((l) => l.pctQtd), backgroundColor: '#2563eb', borderRadius: 4 },
          { label: '% HH realizado', data: linhas.map((l) => l.pctHh), backgroundColor: '#d97706', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af' } },
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: '#e4e4e7' },
            ticks: { font: { size: 10 }, color: '#9ca3af', callback: (v) => v + '%' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + c.parsed.y + '%' } }
        }
      }
    });
    state.instancias.push(chart);
  }

  function maxDe(porSemanaLista, campo) {
    let max = 0;
    for (const porSemana of porSemanaLista) {
      for (const s of porSemana) {
        for (const classe of Object.keys(CLASSIFICACAO)) {
          if (s[classe][campo] > max) max = s[classe][campo];
        }
      }
    }
    return max === 0 ? 10 : Math.ceil(max * 1.15);
  }

  function maxTrend(porSemanaLista) {
    let max = 0;
    for (const porSemana of porSemanaLista) {
      for (const s of porSemana) {
        if (s.emergencial.qtd > max) max = s.emergencial.qtd;
      }
    }
    return max === 0 ? 5 : Math.ceil(max * 1.2);
  }

  async function carregarErenderizar(container, dataInicioISO, dataFimISO) {
    const statusEl = document.getElementById('ind-status');
    if (statusEl) statusEl.textContent = 'Carregando…';

    try {
      const semanas = gerarSemanas(new Date(dataInicioISO), new Date(dataFimISO));

      const resultados = await Promise.all(
        EMPRESAS.map((e) => buscarRegistros(e.codigo, dataInicioISO, dataFimISO))
      );

      const porSemanaPorEmpresa = resultados.map((registros) => agregarPorSemana(registros, semanas));
      const totaisPorEmpresa = resultados.map((registros) => agregarTotal(registros));

      if (!container._indState) container._indState = { instancias: [] };
      const state = container._indState;
      destruirCharts(state);

      const yMaxQtd = maxDe(porSemanaPorEmpresa, 'qtd');
      const yMaxHh = maxDe(porSemanaPorEmpresa, 'hh');
      const yMaxTrend = maxTrend(porSemanaPorEmpresa);

      EMPRESAS.forEach((e, i) => {
        renderGraficoSemanal(`ind-qtd-${e.slug}`, semanas, porSemanaPorEmpresa[i], 'qtd', yMaxQtd, state);
        renderGraficoSemanal(`ind-hh-${e.slug}`, semanas, porSemanaPorEmpresa[i], 'hh', yMaxHh, state);
        renderGraficoTendencia(`ind-trend-${e.slug}`, semanas, porSemanaPorEmpresa[i], yMaxTrend, state);
        renderGraficoPareto(`ind-pareto-${e.slug}`, totaisPorEmpresa[i], state);
      });

      if (statusEl) {
        const totalRegistros = resultados.reduce((sum, r) => sum + r.length, 0);
        statusEl.textContent = `${totalRegistros} serviços encerrados no período · ${semanas.length} semana(s)`;
      }
    } catch (err) {
      console.error('[indicadores]', err);
      if (statusEl) statusEl.textContent = 'Erro ao carregar dados';
      if (typeof showToast === 'function') {
        showToast('Erro ao carregar indicadores: ' + err.message, 'erro');
      }
    }
  }

  window.Modulos.indicadores = {
    async init(container) {
      container.innerHTML = skeletonHTML();

      const inputInicio = document.getElementById('ind-data-inicio');
      const inputFim = document.getElementById('ind-data-fim');
      const btnAplicar = document.getElementById('ind-btn-aplicar');

      async function aplicar() {
        await carregarErenderizar(container, inputInicio.value, inputFim.value);
      }

      btnAplicar.addEventListener('click', aplicar);

      await aplicar();
    }
  };
})();
