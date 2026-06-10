/* ═══════════════════════════════════════════════════════
   MAN360 — Módulo: Calendário de Acompanhamento (CAL)
   Padrão: window.Modulos.cal_acomp · usa getDB() de shared/db.js
   ═══════════════════════════════════════════════════════ */
'use strict';
window.Modulos = window.Modulos || {};

window.Modulos.cal_acomp = {

  /* ── Estado ── */
  _s: {
    colaboradores: [],  // apt_colaboradores onde modalidade='CAL'
    escalas: [],        // apt_escalas
    turnos: [],         // apt_turnos
    equipes: [],        // cal_equipes
    membros: {},        // membros[equipe_id] = [...colabs enriquecidos]
    mesAtual: '',       // 'YYYY-MM'
    anoMes: null,       // { ano, mes, primDia, ultDia, dias }
  },

  /* ── Init ── */
  async init(container) {
    const hoje = new Date();
    this._s.mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    container.innerHTML = this._tpl();
    this._bindNavMes();
    await this._carregarBase();
    this._setMes(this._s.mesAtual);
    await this._carregarEquipes();
    this._render();
  },

  /* ── Template raiz ── */
  _tpl() {
    return `
      <style>
        .cal-nav{display:flex;align-items:center;gap:10px;margin-bottom:16px}
        .cal-mes-btn{height:28px;width:28px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:#6b7280;font-size:14px}
        .cal-mes-btn:hover{background:var(--bg)}
        .cal-mes-lbl{font-size:14px;font-weight:700;min-width:130px;text-align:center}
        .cal-equipe{margin-bottom:20px}
        .cal-equipe-hdr{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b5563;padding:8px 0 6px;display:flex;align-items:center;gap:8px;border-bottom:2px solid var(--yellow);margin-bottom:8px}
        .cal-equipe-hdr span{flex:1}
        .cal-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:#fef3c7;color:#92400e}
        .cal-grid{overflow-x:auto}
        .cal-table{border-collapse:collapse;font-size:11px;width:100%;min-width:600px}
        .cal-table th{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;padding:3px 2px;text-align:center;border-bottom:1px solid var(--border);white-space:nowrap}
        .cal-table td{padding:2px 2px;text-align:center;vertical-align:middle}
        .cal-table tr:hover td{background:rgba(0,0,0,.02)}
        .cal-td-nome{text-align:left!important;padding-left:8px!important;font-size:11px;font-weight:600;white-space:nowrap;min-width:160px}
        .cal-td-turno{font-size:9px;color:#6b7280;text-align:left!important;padding-left:4px!important;min-width:60px}
        .cal-cell-f{height:22px;width:22px;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;background:#fee2e2;color:#991b1b}
        .cal-cell-t{height:22px;width:22px;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;background:#dcfce7;color:#166534}
        .cal-cell-w{height:22px;width:22px;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;background:#f3f4f6;color:#9ca3af}
        .cal-cell-x{height:22px;width:22px;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:#d1d5db;background:transparent}
        .cal-cell-hh{height:22px;min-width:28px;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;background:#eff6ff;color:#1d4ed8;padding:0 3px}
        .cal-th-fim{background:#fafafa}
        .cal-th-hoj{color:var(--yellow)!important;font-weight:900!important}
        .cal-td-hoj{background:rgba(234,179,8,.06)}
        .cal-aviso{padding:20px;text-align:center;color:#9ca3af;font-size:12px}
        .cal-sem-dados{font-size:10px;color:#f59e0b;background:#fef3c7;padding:4px 10px;border-radius:8px;display:inline-block}
      </style>
      <div class="cal-nav">
        <button class="cal-mes-btn" id="cal-prev"><i class="ti ti-chevron-left"></i></button>
        <span class="cal-mes-lbl" id="cal-mes-lbl">—</span>
        <button class="cal-mes-btn" id="cal-next"><i class="ti ti-chevron-right"></i></button>
        <span id="cal-status" style="font-size:11px;color:#9ca3af;margin-left:8px"></span>
      </div>
      <div id="cal-corpo"></div>`;
  },

  /* ── Navegação de mês ── */
  _bindNavMes() {
    document.getElementById('cal-prev').onclick = () => this._navMes(-1);
    document.getElementById('cal-next').onclick = () => this._navMes(+1);
  },
  async _navMes(delta) {
    const [y, m] = this._s.mesAtual.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    this._s.mesAtual = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    this._setMes(this._s.mesAtual);
    this._render();
  },

  /* ── Helpers de data ── */
  _addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  },
  _hoje() { return new Date().toISOString().slice(0, 10); },
  _diaSemN(iso) { return new Date(iso + 'T00:00:00').getDay(); },
  _fmtMes(anoMes) {
    const [y, m] = anoMes.split('-').map(Number);
    const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return `${nomes[m-1]} ${y}`;
  },

  /* ── Configura mês corrente ── */
  _setMes(anoMes) {
    const [y, m] = anoMes.split('-').map(Number);
    const primDia = `${y}-${String(m).padStart(2,'0')}-01`;
    const ultDia  = this._addDays(`${y}-${String(m).padStart(2,'0')}-${new Date(y,m,0).getDate()}`, 0);
    const dias    = new Date(y, m, 0).getDate();
    this._s.anoMes = { ano: y, mes: m, primDia, ultDia, dias };
    const el = document.getElementById('cal-mes-lbl');
    if (el) el.textContent = this._fmtMes(anoMes);
  },

  /* ── Carregar tabelas base ── */
  async _carregarBase() {
    try {
      const db = getDB();
      const [r1, r2, r3] = await Promise.all([
        db.from('apt_colaboradores').select('*').eq('modalidade','CAL').eq('ativo',true).order('nome'),
        db.from('apt_escalas').select('*').order('nome'),
        db.from('apt_turnos').select('*').order('nome'),
      ]);
      this._s.colaboradores = r1.data || [];
      this._s.escalas       = r2.data || [];
      this._s.turnos        = r3.data || [];
    } catch(e) { console.error('[cal_acomp] _carregarBase:', e); }
  },

  /* ── Carregar equipes e membros ── */
  async _carregarEquipes() {
    try {
      const db = getDB();
      const { data: eqs } = await db.from('cal_equipes').select('*').eq('ativo', true).order('nome');
      this._s.equipes = eqs || [];

      this._s.membros = {};
      for (const eq of this._s.equipes) {
        const { data: mems } = await db.from('cal_equipe_membros').select('*').eq('equipe_id', eq.id);
        // Enriquecer cada membro com dados do colaborador (chapa = cracha)
        this._s.membros[eq.id] = (mems || []).map(m => {
          const colab = this._s.colaboradores.find(c => String(c.cracha) === String(m.chapa));
          return colab ? { ...m, ...colab } : { ...m, _semCadastro: true };
        });
      }
    } catch(e) { console.error('[cal_acomp] _carregarEquipes:', e); }
  },

  /* ── Helpers de escala/turno (por NOME — campo real do banco) ── */
  _escalaDe(colab) {
    if (!colab.escala) return null;
    return this._s.escalas.find(e => e.nome === colab.escala) || null;
  },
  _turnoDe(colab) {
    if (!colab.turno) return null;
    return this._s.turnos.find(t => t.nome === colab.turno) || null;
  },

  /* ── Projeção de folgas (mesma lógica do apontamentos.js) ── */
  _gerarFolgas(colab, dataIni, dataFim) {
    const esc = this._escalaDe(colab);
    const trn = this._turnoDe(colab);
    if (!esc) return new Set();

    // ADM: folga sempre sábado e domingo
    if (esc.tipo_ciclo === 'ADM' || trn?.nome === 'ADM') {
      const s = new Set(); let c = dataIni;
      while (c <= dataFim) {
        const dw = this._diaSemN(c);
        if (dw === 0 || dw === 6) s.add(c);
        c = this._addDays(c, 1);
      }
      return s;
    }

    // ROTATIVO: ancora = primeira_folga (a data É a própria folga)
    const ancora = colab.primeira_folga;
    if (!ancora) return new Set();

    const ciclo = (esc.dias_trabalho || 5) + 1;
    const s = new Set();

    // Projetar para frente a partir da âncora
    let cur = ancora;
    while (cur <= dataFim) { s.add(cur); cur = this._addDays(cur, ciclo); }
    // Projetar para trás a partir da âncora
    cur = this._addDays(ancora, -ciclo);
    while (cur >= dataIni) { s.add(cur); cur = this._addDays(cur, -ciclo); }

    return s;
  },

  /* ── HH do turno num dia específico ── */
  _calcHH(entrada, saida, intervalo) {
    if (!entrada || !saida) return 8;
    // Suporta "HH:MM" e "HH:MM:SS"
    const [eh, em] = entrada.split(':').map(Number);
    const [sh, sm] = saida.split(':').map(Number);
    let mins = (sh * 60 + sm) - (eh * 60 + em);
    if (mins <= 0) mins += 1440;
    return Math.round((mins - (intervalo || 0)) / 60 * 100) / 100;
  },
  _hhTurno(colab, iso) {
    const trn = this._turnoDe(colab);
    if (!trn) return 0;
    if (trn.nome === 'ADM' || trn.tipo_ciclo === 'ADM') {
      const dw = this._diaSemN(iso);
      if (dw === 0 || dw === 6) return 0;
      if (dw === 5 && trn.saida_sexta && trn.hora_entrada)
        return this._calcHH(trn.hora_entrada, trn.saida_sexta, trn.intervalo_min);
    }
    if (!trn.hora_entrada || !trn.hora_saida) return 8;
    return this._calcHH(trn.hora_entrada, trn.hora_saida, trn.intervalo_min);
  },

  /* ── Render principal ── */
  _render() {
    const corpo = document.getElementById('cal-corpo');
    if (!corpo) return;
    const { equipes, membros, anoMes } = this._s;

    if (!anoMes) { corpo.innerHTML = '<div class="cal-aviso">Inicializando…</div>'; return; }
    if (!equipes.length) { corpo.innerHTML = '<div class="cal-aviso">Nenhuma equipe CAL cadastrada.</div>'; return; }

    const hoje   = this._hoje();
    const { primDia, ultDia, dias, mes, ano } = anoMes;

    // Cabeçalhos de dias
    const diasArr = [];
    for (let d = 1; d <= dias; d++) {
      const iso = `${ano}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      diasArr.push(iso);
    }

    const semNome = ['D','S','T','Q','Q','S','S'];
    const html = equipes.map(eq => {
      const mems = (membros[eq.id] || []).filter(m => !m._semCadastro);
      const semDados = mems.filter(m => !m.escala || !m.turno || !m.primeira_folga);

      // Cabeçalho da tabela
      const thDias = diasArr.map(iso => {
        const dw = this._diaSemN(iso);
        const ehFim = dw === 0 || dw === 6;
        const ehHoj = iso === hoje;
        let cls = 'cal-table th';
        if (ehFim) cls += ' cal-th-fim';
        if (ehHoj) cls += ' cal-th-hoj';
        const d = iso.split('-')[2];
        return `<th class="${ehFim?'cal-th-fim':''} ${ehHoj?'cal-th-hoj':''}">
          <div>${d}</div>
          <div style="font-size:8px;color:${ehFim?'#d1d5db':'#9ca3af'}">${semNome[dw]}</div>
        </th>`;
      }).join('');

      // Linhas dos membros
      const linhas = mems.map(c => {
        const folgas = this._gerarFolgas(c, primDia, ultDia);
        let hhTotal = 0;

        const cells = diasArr.map(iso => {
          const dw = this._diaSemN(iso);
          const ehHoj = iso === hoje;
          const ehFolga = folgas.has(iso);
          // ADM: sab/dom = fim de semana, não folga rotativa
          const esc = this._escalaDe(c);
          const ehAdm = esc?.tipo_ciclo === 'ADM';
          const ehFds = dw === 0 || dw === 6;

          let cell;
          if (ehAdm && ehFds) {
            cell = `<div class="cal-cell-w" title="Fim de semana">—</div>`;
          } else if (ehFolga) {
            cell = `<div class="cal-cell-f" title="Folga">F</div>`;
          } else {
            const hh = this._hhTurno(c, iso);
            hhTotal += hh;
            cell = `<div class="cal-cell-t" title="${hh.toFixed(1)}h">${hh % 1 === 0 ? hh : hh.toFixed(1)}</div>`;
          }
          return `<td class="${ehHoj?'cal-td-hoj':''}">${cell}</td>`;
        }).join('');

        const nomeTurno = c.turno || '—';
        const nomeEscala = c.escala || '—';
        const semConfig = !c.escala || !c.turno || !c.primeira_folga;

        return `<tr>
          <td class="cal-td-nome">${c.nome || c.chapa}</td>
          <td class="cal-td-turno">${nomeTurno} · ${nomeEscala}</td>
          ${semConfig
            ? `<td colspan="${dias}" style="padding:4px 8px"><span class="cal-sem-dados">⚠ sem turno/escala/folga configurados</span></td>`
            : cells
          }
          <td><div class="cal-cell-hh">${hhTotal.toFixed(0)}h</div></td>
        </tr>`;
      }).join('');

      const badgeSemDados = semDados.length
        ? `<span class="cal-badge">⚠ ${semDados.length} sem config</span>`
        : '';

      const totalHHMes = mems.reduce((acc, c) => {
        let hh = 0;
        const folgas = this._gerarFolgas(c, primDia, ultDia);
        diasArr.forEach(iso => {
          if (!folgas.has(iso)) hh += this._hhTurno(c, iso);
        });
        return acc + hh;
      }, 0);

      return `
        <div class="cal-equipe card" style="padding:16px;margin-bottom:16px">
          <div class="cal-equipe-hdr">
            <span>${eq.nome}</span>
            ${badgeSemDados}
            <span style="font-size:10px;color:#6b7280">${mems.length} membros · ${totalHHMes.toFixed(0)} HH/mês</span>
          </div>
          <div class="cal-grid">
            <table class="cal-table">
              <thead>
                <tr>
                  <th style="text-align:left;padding-left:8px">Colaborador</th>
                  <th style="text-align:left">Turno · Escala</th>
                  ${thDias}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${linhas || '<tr><td colspan="99" class="cal-aviso">Sem membros.</td></tr>'}</tbody>
            </table>
          </div>
        </div>`;
    }).join('');

    corpo.innerHTML = html || '<div class="cal-aviso">Nenhuma equipe encontrada.</div>';
  },
};
