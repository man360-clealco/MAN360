/* ═══════════════════════════════════════════════════════
   MAN360 — Módulo: Apontamentos
   Usa getDB() de shared/db.js — mesmo padrão do prog_semanal
   ═══════════════════════════════════════════════════════ */
window.Modulos = window.Modulos || {};

window.Modulos.apontamentos = {

  /* ── Estado ── */
  _s: {
    safra: '2026/27',
    semanas: [],
    dataIni: '', dataFim: '',
    modalidades: ['MEC','CAL','ELE','CIV','INS','AUT','ISP'],
    colabChapa: null,
    apontamentos: [], colaboradores: [], escalas: [], turnos: [],
    especialidades: [], justificativas: [], ferias: [],
    hmPag: 0, tabelaAberta: false, pontosAberto: false,
    cadAba: 'colab',
    // Constantes
    SAFRAS:      ['2024/25','2025/26','2026/27'],
    MODALIDADES: ['MEC','CAL','ELE','CIV','INS','AUT','ISP'],
    META: 0.75,
    SEM_ANCORA: 9, DATA_ANCORA: '2026-05-25',
  },

  /* ── Init ── */
  async init(container) {
    container.innerHTML = this._tpl();
    this._bindTabs();
    await this._carregarBase();
    this._renderContent('principal');
  },

  /* ── Template raiz ── */
  _tpl() {
    return `
      <style>
        .apt-tab{padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:#6b7280;transition:all .15s;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
        .apt-tab.on{color:var(--yellow);border-bottom-color:var(--yellow)}
        .apt-hm-cell{height:26px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;cursor:pointer;border:1px solid rgba(0,0,0,.07)}
        .apt-hm-cell:hover{opacity:.8}
        .apt-turno-hdr{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#4b5563;padding:10px 0 4px;display:flex;align-items:center;gap:8px;grid-column:1/-1}
        .apt-turno-hdr::after{content:'';flex:1;height:1px;background:var(--border)}
        .apt-incompleto{font-size:9px;font-weight:700;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:10px}
        .apt-attn-row{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:12px}
        .apt-attn-row:last-child{border-bottom:none}
        .apt-icon-btn{height:26px;width:26px;padding:0;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:#6b7280;font-size:13px}
        .apt-icon-btn:hover{background:var(--bg)}
        .apt-input{width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 10px;font-family:var(--font);font-size:12px;outline:none}
        .apt-input:focus{border-color:var(--yellow)}
        .apt-select{width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px;outline:none;cursor:pointer}
        .apt-field{display:flex;flex-direction:column;gap:4px;flex:1;min-width:100px}
        .apt-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
        @media(max-width:768px){.metrics-row{grid-template-columns:1fr 1fr!important}.apt-hm-cell{height:22px;font-size:8px}}
      </style>
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px;overflow-x:auto">
        <div id="apt-tab-p" class="apt-tab on"><i class="ti ti-clock-record"></i> Apontamentos</div>
        <div id="apt-tab-c" class="apt-tab"><i class="ti ti-users"></i> Cadastro e Gestão</div>
      </div>
      <div id="apt-body"></div>`;
  },

  _bindTabs() {
    document.getElementById('apt-tab-p').onclick = () => this._renderContent('principal');
    document.getElementById('apt-tab-c').onclick = () => this._renderContent('cadastro');
  },

  /* ── Carregar tabelas base ── */
  async _carregarBase() {
    try {
      const db = getDB();
      const [r1,r2,r3] = await Promise.all([
        db.from('apt_colaboradores').select('*').order('nome'),
        db.from('apt_escalas').select('*').order('nome'),
        db.from('apt_turnos').select('*').order('nome'),
      ]);
      this._s.colaboradores = r1.data || [];
      this._s.escalas       = r2.data || [];
      this._s.turnos        = r3.data || [];
    } catch(e) { console.error('Erro carregarBase:', e); }
  },

  /* ══════════════════════════════════════════════
     ABA PRINCIPAL
     ══════════════════════════════════════════════ */
  _renderContent(aba) {
    // Atualizar tabs
    document.getElementById('apt-tab-p').className = 'apt-tab' + (aba==='principal'?' on':'');
    document.getElementById('apt-tab-c').className = 'apt-tab' + (aba==='cadastro'?' on':'');

    const body = document.getElementById('apt-body');
    if (!body) return;

    if (aba === 'principal') {
      // Calcular semanas padrão (últimas 2)
      if (!this._s.semanas.length) {
        const s = this._semAtual();
        this._s.semanas = [s-1, s];
        this._recalcPeriodo();
      }
      body.innerHTML = this._tplFiltros() + `
        <div id="apt-metricas" class="metrics-row" style="margin-bottom:12px"></div>
        <div id="apt-quadro" style="margin-bottom:12px"></div>
        <div id="apt-pontos" style="margin-bottom:12px"></div>
        <div id="apt-heatmap" class="card" style="margin-bottom:12px;display:none"></div>
        <div id="apt-tabela" class="card" style="margin-bottom:12px;display:none"></div>
        <div id="apt-importar">${this._tplImportador()}</div>`;
      this._bindFiltros();
      this._bindImportador();
      this._carregarDados();
    } else {
      this._s.cadAba = this._s.cadAba || 'colab';
      body.innerHTML = this._tplCadastro();
      this._bindCadastro();
      this._carregarCadastro();
    }
  },

  /* ── Helpers de data ── */
  _addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  },
  _hoje()    { return new Date().toISOString().slice(0, 10); },
  _amanha()  { return this._addDays(this._hoje(), 1); },
  _fmtDM(iso){ const[,m,d]=iso.split('-'); return `${d}/${m}`; },
  _fmtFull(iso){ const[y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; },
  _diaSem(iso){ return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(iso+'T00:00:00').getDay()]; },
  _diaSemN(iso){ return new Date(iso+'T00:00:00').getDay(); },
  _diasEntre(a,b){ const r=[]; let c=a; while(c<=b){r.push(c);c=this._addDays(c,1);} return r; },
  _semParaDatas(s){ const i=this._addDays(this._s.DATA_ANCORA,(s-this._s.SEM_ANCORA)*7); return {ini:i,fim:this._addDays(i,6)}; },
  _semAtual(){
    const ms0=new Date(this._s.DATA_ANCORA+'T00:00:00').getTime();
    const ms1=new Date(this._hoje()+'T00:00:00').getTime();
    return this._s.SEM_ANCORA + Math.floor((ms1-ms0)/604800000);
  },
  _recalcPeriodo(){
    if(!this._s.semanas.length) return;
    const sorted=[...this._s.semanas].sort((a,b)=>a-b);
    this._s.dataIni = this._semParaDatas(sorted[0]).ini;
    this._s.dataFim = this._semParaDatas(sorted[sorted.length-1]).fim;
  },

  /* ── HH esperado pelo turno ── */
  _calcHH(entrada, saida, intervalo) {
    const [eh,em] = entrada.split(':').map(Number);
    const [sh,sm] = saida.split(':').map(Number);
    let mins = (sh*60+sm) - (eh*60+em);
    if (mins <= 0) mins += 1440;
    return Math.round((mins - intervalo) / 60 * 100) / 100;
  },
  _hhTurno(turno, iso) {
    if (!turno) return 8;
    if (turno.nome === 'ADM') {
      const dw = this._diaSemN(iso);
      if (dw===0||dw===6) return 0;
      if (dw===5 && turno.saida_sexta) return this._calcHH(turno.hora_entrada, turno.saida_sexta, turno.intervalo_min);
      return this._calcHH(turno.hora_entrada, turno.hora_saida, turno.intervalo_min);
    }
    return this._calcHH(turno.hora_entrada, turno.hora_saida, turno.intervalo_min);
  },

  /* ── Folgas ── */
  _gerarFolgas(escala, turno, pf, ref, dataIni, dataFim) {
    if (!escala) return new Set();
    // ADM: folga sempre sábado e domingo
    if (escala.tipo_ciclo==='ADM' || turno?.nome==='ADM') {
      const s=new Set(); let c=dataIni;
      while(c<=dataFim){ const dw=this._diaSemN(c); if(dw===0||dw===6) s.add(c); c=this._addDays(c,1); }
      return s;
    }
    // ROTATIVO: precisa de âncora (data de referência de uma folga conhecida)
    const ancora = ref || pf;
    if (!ancora) return new Set(); // sem âncora não é possível projetar
    const ciclo = (escala.dias_trabalho||5) + 1;
    const s = new Set();
    // Projetar para frente a partir da âncora
    let cur = ancora;
    while(cur<=dataFim){ s.add(cur); cur=this._addDays(cur,ciclo); }
    // Projetar para trás a partir da âncora
    cur = this._addDays(ancora,-ciclo);
    while(cur>=dataIni){ s.add(cur); cur=this._addDays(cur,-ciclo); }
    return s;
  },

  /* ── Completude do colaborador ── */
  _completo(c) { return !!(c.modalidade && c.turno_id && c.escala_id); },
  _turnoDe(c)  { return this._s.turnos.find(t=>t.id===c.turno_id)||null; },
  _escalaDe(c) { return this._s.escalas.find(e=>e.id===c.escala_id)||null; },

  /* ══════════════════════════════════════════════
     FILTROS — template
     ══════════════════════════════════════════════ */
  _tplFiltros() {
    const s = this._s;
    const semFim = this._semAtual() + 8;
    let semItems = '';
    for (let n=Math.max(1,this._semAtual()-7); n<=semFim; n++) {
      const {ini,fim} = this._semParaDatas(n);
      const isAt = n===this._semAtual(), isSel = s.semanas.includes(n);
      semItems += `<div class="dd-item"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;width:100%">
        <input type="checkbox" class="apt-sem-cb" value="${n}" ${isSel?'checked':''} style="accent-color:var(--yellow)">
        ${isAt?'<strong>':''}Sem ${n}${isAt?' ★':''} · ${this._fmtDM(ini)}–${this._fmtDM(fim)}${isAt?'</strong>':''}
      </label></div>`;
    }
    const semLbl = () => {
      if (!s.semanas.length) return 'Nenhuma';
      const sorted = [...s.semanas].sort((a,b)=>a-b);
      if (sorted.length===1) { const{ini,fim}=this._semParaDatas(sorted[0]); return `Sem ${sorted[0]} · ${this._fmtDM(ini)}–${this._fmtDM(fim)}`; }
      return `Sem ${sorted[0]}–${sorted[sorted.length-1]} (${sorted.length})`;
    };
    const modLbl = s.modalidades.length===s.MODALIDADES.length?'Todas':s.modalidades.length===0?'Nenhuma':s.modalidades.join(', ');

    return `
    <div class="filters-bar" style="margin-bottom:16px">
      <span class="filter-label">SAFRA</span>
      <div class="dd-wrap">
        <button class="dd-btn" onclick="Modulos.apontamentos._dd('dd-apt-safra')">
          <i class="ti ti-calendar"></i>
          <span class="dd-label" id="apt-lbl-safra">${s.safra}</span>
          <i class="ti ti-chevron-down dd-arrow"></i>
        </button>
        <div class="dd-panel" id="dd-apt-safra">
          ${s.SAFRAS.map(sf=>`<div class="dd-item apt-safra-opt" data-val="${sf}" style="cursor:pointer">${sf===s.safra?'<i class="ti ti-check" style="color:var(--yellow)"></i> ':''} ${sf}</div>`).join('')}
        </div>
      </div>

      <span class="filter-label">SEMANAS</span>
      <div class="dd-wrap">
        <button class="dd-btn" onclick="Modulos.apontamentos._dd('dd-apt-sem')" style="min-width:175px">
          <i class="ti ti-calendar-week"></i>
          <span class="dd-label" id="apt-lbl-sem">${semLbl()}</span>
          <i class="ti ti-chevron-down dd-arrow"></i>
        </button>
        <div class="dd-panel" id="dd-apt-sem" style="max-height:260px;overflow-y:auto;min-width:230px">
          <div class="dd-actions">
            <button class="dd-action-btn primary" id="apt-sem-ult2">Últimas 2</button>
            <button class="dd-action-btn secondary" id="apt-sem-clear">Limpar</button>
          </div>
          ${semItems}
        </div>
      </div>

      <span class="filter-label" style="color:var(--text-muted)">ou</span>
      <input type="date" id="apt-di" value="${s.dataIni}" class="dd-btn" style="cursor:text;font-family:var(--font);font-size:11px;width:130px">
      <span style="color:var(--text-muted);font-size:12px">→</span>
      <input type="date" id="apt-df" value="${s.dataFim}" class="dd-btn" style="cursor:text;font-family:var(--font);font-size:11px;width:130px">

      <span class="filter-label">COLABORADOR</span>
      <div style="position:relative">
        <div class="dd-btn" style="cursor:text;min-width:210px;padding:0;gap:0">
          <i class="ti ti-search" style="padding:0 8px;color:var(--text-muted)"></i>
          <input type="text" id="apt-colab-inp" placeholder="Nome ou crachá…"
            style="border:none;background:transparent;outline:none;font-family:var(--font);font-size:11px;flex:1;height:30px;padding-right:8px">
        </div>
        <div id="apt-colab-drop" style="display:none;position:absolute;top:calc(100% + 3px);left:0;min-width:280px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md);z-index:300;max-height:200px;overflow-y:auto"></div>
      </div>

      <span class="filter-label">MODALIDADE</span>
      <div class="dd-wrap">
        <button class="dd-btn" onclick="Modulos.apontamentos._dd('dd-apt-mod')" style="min-width:95px">
          <i class="ti ti-tag"></i>
          <span class="dd-label" id="apt-lbl-mod">${modLbl}</span>
          <i class="ti ti-chevron-down dd-arrow"></i>
        </button>
        <div class="dd-panel" id="dd-apt-mod">
          <div class="dd-actions">
            <button class="dd-action-btn primary" id="apt-mod-all">Todas</button>
            <button class="dd-action-btn secondary" id="apt-mod-none">Nenhuma</button>
          </div>
          ${s.MODALIDADES.map(m=>`<div class="dd-item"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;width:100%">
            <input type="checkbox" class="apt-mod-cb" value="${m}" ${s.modalidades.includes(m)?'checked':''} style="accent-color:var(--yellow)"> ${m}
          </label></div>`).join('')}
        </div>
      </div>

      <button id="apt-btn-ok" class="dd-action-btn primary" style="height:30px;padding:0 14px;font-family:var(--font);display:inline-flex;align-items:center;gap:5px">
        <i class="ti ti-search"></i> Filtrar
      </button>
      <button id="apt-btn-clear" class="dd-action-btn secondary" style="height:30px;padding:0 10px;font-family:var(--font);display:inline-flex;align-items:center;gap:4px">
        <i class="ti ti-x"></i> Limpar
      </button>
    </div>`;
  },

  _dd(id) {
    // Fechar todos, abrir o clicado
    document.querySelectorAll('.dd-panel').forEach(p => { if (p.id !== id) p.classList.remove('show'); });
    document.getElementById(id)?.classList.toggle('show');
  },

  _bindFiltros() {
    const s = this._s;

    // Safra
    document.querySelectorAll('.apt-safra-opt').forEach(el => el.addEventListener('click', () => {
      s.safra = el.dataset.val;
      document.getElementById('apt-lbl-safra').textContent = s.safra;
      document.getElementById('dd-apt-safra').classList.remove('show');
    }));

    // Semanas
    document.getElementById('dd-apt-sem').addEventListener('change', e => {
      if (!e.target.classList.contains('apt-sem-cb')) return;
      const n = parseInt(e.target.value);
      if (e.target.checked) { if (!s.semanas.includes(n)) s.semanas.push(n); }
      else s.semanas = s.semanas.filter(x => x !== n);
      this._recalcPeriodo();
      this._atualizarLblSem();
    });
    document.getElementById('apt-sem-ult2').addEventListener('click', () => {
      const cur = this._semAtual();
      s.semanas = [cur-1, cur];
      this._recalcPeriodo();
      document.querySelectorAll('.apt-sem-cb').forEach(cb => {
        const v = parseInt(cb.value); cb.checked = (v===cur-1||v===cur);
      });
      this._atualizarLblSem();
      document.getElementById('dd-apt-sem').classList.remove('show');
    });
    document.getElementById('apt-sem-clear').addEventListener('click', () => {
      s.semanas = [];
      document.querySelectorAll('.apt-sem-cb').forEach(cb => cb.checked = false);
      this._atualizarLblSem();
    });

    // Datas livres
    document.getElementById('apt-di').addEventListener('change', e => {
      s.dataIni = e.target.value;
      s.semanas = [];
      document.querySelectorAll('.apt-sem-cb').forEach(cb => cb.checked = false);
      this._atualizarLblSem();
    });
    document.getElementById('apt-df').addEventListener('change', e => {
      s.dataFim = e.target.value;
      s.semanas = [];
      document.querySelectorAll('.apt-sem-cb').forEach(cb => cb.checked = false);
      this._atualizarLblSem();
    });

    // Modalidade
    document.getElementById('apt-mod-all').addEventListener('click', () => {
      s.modalidades = [...s.MODALIDADES];
      document.querySelectorAll('.apt-mod-cb').forEach(cb => cb.checked = true);
      document.getElementById('apt-lbl-mod').textContent = 'Todas';
    });
    document.getElementById('apt-mod-none').addEventListener('click', () => {
      s.modalidades = [];
      document.querySelectorAll('.apt-mod-cb').forEach(cb => cb.checked = false);
      document.getElementById('apt-lbl-mod').textContent = 'Nenhuma';
    });
    document.getElementById('dd-apt-mod').addEventListener('change', e => {
      if (!e.target.classList.contains('apt-mod-cb')) return;
      if (e.target.checked) s.modalidades.push(e.target.value);
      else s.modalidades = s.modalidades.filter(m => m !== e.target.value);
      const l = s.modalidades.length===s.MODALIDADES.length?'Todas':s.modalidades.length===0?'Nenhuma':s.modalidades.join(', ');
      document.getElementById('apt-lbl-mod').textContent = l;
    });

    // Colaborador busca
    const inp = document.getElementById('apt-colab-inp');
    const drop = document.getElementById('apt-colab-drop');
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      if (!q) { drop.style.display='none'; return; }
      const hits = s.colaboradores.filter(c => this._completo(c) && (c.nome.toLowerCase().includes(q)||String(c.cracha).includes(q))).slice(0,12);
      if (!hits.length) { drop.style.display='none'; return; }
      drop.style.display = 'block';
      drop.innerHTML = hits.map(c=>`<div class="dd-item" data-ch="${c.cracha}" style="cursor:pointer;display:flex;gap:8px;align-items:center">
        <span style="color:#9ca3af;font-size:10px;min-width:44px">${c.cracha}</span>
        <span style="flex:1">${c.nome}</span>
        <span style="font-size:10px;background:#eff6ff;color:#1d4ed8;padding:1px 6px;border-radius:10px">${c.modalidade||'—'}</span>
      </div>`).join('');
      drop.querySelectorAll('[data-ch]').forEach(el => el.addEventListener('click', () => {
        const c = s.colaboradores.find(x => String(x.cracha)===el.dataset.ch);
        s.colabChapa = c.cracha; inp.value = `${c.cracha} — ${c.nome}`;
        if (c.modalidade) s.modalidades = [c.modalidade];
        drop.style.display = 'none';
      }));
    });
    document.addEventListener('click', e => { if (!drop.contains(e.target)&&e.target!==inp) drop.style.display='none'; });

    document.getElementById('apt-btn-ok').addEventListener('click', () => { s.hmPag=0; this._carregarDados(); });
    document.getElementById('apt-btn-clear').addEventListener('click', () => {
      s.colabChapa = null; s.modalidades = [...s.MODALIDADES];
      inp.value = '';
      document.querySelectorAll('.apt-mod-cb').forEach(cb => cb.checked=true);
      document.getElementById('apt-lbl-mod').textContent = 'Todas';
      s.hmPag = 0; this._carregarDados();
    });
  },

  _atualizarLblSem() {
    const el = document.getElementById('apt-lbl-sem'); if (!el) return;
    const s = this._s;
    if (!s.semanas.length) { el.textContent='Nenhuma'; return; }
    const sorted = [...s.semanas].sort((a,b)=>a-b);
    if (sorted.length===1) { const{ini,fim}=this._semParaDatas(sorted[0]); el.textContent=`Sem ${sorted[0]} · ${this._fmtDM(ini)}–${this._fmtDM(fim)}`; return; }
    el.textContent = `Sem ${sorted[0]}–${sorted[sorted.length-1]} (${sorted.length})`;
  },

  /* ══════════════════════════════════════════════
     CARREGAR DADOS
     ══════════════════════════════════════════════ */
  async _carregarDados() {
    const s = this._s;
    const elM = document.getElementById('apt-metricas');
    if (!elM) return;

    if (!s.dataIni || !s.dataFim) {
      elM.innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;padding:20px;color:#9ca3af">Selecione ao menos uma semana ou período.</div>`;
      return;
    }

    let cf = s.colaboradores.filter(c => this._completo(c));
    if (s.colabChapa) cf = cf.filter(c => String(c.cracha)===String(s.colabChapa));
    else if (s.modalidades.length) cf = cf.filter(c => s.modalidades.includes(c.modalidade));

    if (!cf.length) {
      elM.innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;padding:40px;color:#9ca3af">
        <i class="ti ti-user-off" style="font-size:32px;display:block;margin-bottom:8px;color:#e5e7eb"></i>
        <p style="margin:0;font-size:12px">Nenhum colaborador configurado completamente para os filtros.<br>
        <span style="color:var(--blue);cursor:pointer;text-decoration:underline" id="apt-ir-cad">Ir para Cadastro</span></p>
      </div>`;
      document.getElementById('apt-ir-cad')?.addEventListener('click', () => this._renderContent('cadastro'));
      ['apt-quadro','apt-pontos','apt-heatmap','apt-tabela'].forEach(id => {
        const el=document.getElementById(id); if(el){el.style.display='none';el.innerHTML='';}
      });
      return;
    }

    // Skeleton
    elM.innerHTML = [1,2,3,4].map(()=>`<div class="metric"><div style="height:10px;background:#f3f4f6;border-radius:4px;width:60%;margin-bottom:10px"></div><div style="height:24px;background:#f3f4f6;border-radius:4px;width:40%"></div></div>`).join('');

    try {
      const db = getDB();
      const chapas = cf.map(c => c.cracha);

      const [r1,r2,r3] = await Promise.all([
        db.from('apontamentos')
          .select('os,data_apontamento,chapa,nome,hora_inicio,hora_fim,hh_total,tipo_atividade,desc_servico')
          .gte('data_apontamento', s.dataIni)
          .lte('data_apontamento', s.dataFim)
          .in('chapa', chapas)
          .order('data_apontamento', {ascending:false})
          .order('hora_inicio', {ascending:false}),
        db.from('apt_justificativas')
          .select('*')
          .lte('data_inicio', s.dataFim)
          .gte('data_fim', s.dataIni)
          .in('chapa', chapas),
        db.from('apt_ferias')
          .select('*')
          .lte('data_inicio', s.dataFim)
          .gte('data_fim', s.dataIni)
          .in('chapa', chapas),
      ]);

      if (r1.error) throw r1.error;
      s.apontamentos  = r1.data || [];
      s.justificativas = r2.data || [];
      s.ferias        = r3.data || [];

      this._renderDados(cf);
    } catch(e) {
      console.error('Erro carregarDados:', e);
      showToast('Erro ao carregar dados: ' + e.message, 'erro');
      elM.innerHTML = `<div class="card" style="grid-column:1/-1;padding:20px;color:var(--red);font-size:12px">
        <i class="ti ti-alert-circle"></i> ${e.message}</div>`;
    }
  },

  /* ══════════════════════════════════════════════
     RENDER DADOS
     ══════════════════════════════════════════════ */
  _renderDados(cf) {
    const s = this._s;
    const hj = this._hoje();
    const dias = this._diasEntre(s.dataIni, s.dataFim);

    const hhDia  = (ch,dia) => s.apontamentos.filter(a=>String(a.chapa)===String(ch)&&a.data_apontamento===dia).reduce((t,a)=>t+(parseFloat(String(a.hh_total||0).replace(',','.'))||0),0);
    // Cache de folgas por colaborador para evitar recalcular a cada célula
    const _folgasCache = new Map();
    const ehFolga = (c,dia) => {
      if (!_folgasCache.has(c.cracha)) {
        // Expandir período de projeção para cobrir bem além do período visível
        const ini = this._addDays(s.dataIni, -30);
        const fim = this._addDays(s.dataFim, 30);
        _folgasCache.set(c.cracha, this._gerarFolgas(this._escalaDe(c),this._turnoDe(c),c.primeira_folga,c.data_ref_folga,ini,fim));
      }
      return _folgasCache.get(c.cracha).has(dia);
    };
    const deFerias = (ch,dia) => s.ferias.some(f=>{
      if(String(f.chapa)!==String(ch)) return false;
      // data_fim efetivo = data_fim - dias_vendidos (venda antecipa o retorno)
      const fimEfetivo = f.dias_vendidos>0
        ? this._addDays(f.data_fim, -f.dias_vendidos)
        : f.data_fim;
      return f.data_inicio<=dia && fimEfetivo>=dia;
    });
    const getJust  = (ch,dia) => s.justificativas.find(j=>String(j.chapa)===String(ch)&&j.data_inicio<=dia&&j.data_fim>=dia)||null;
    const hhEsp    = (c,dia)  => this._hhTurno(this._turnoDe(c), dia);

    // Métricas
    let totPrev=0, totPrevPassado=0, totApt=0, ausencias=[], baixos=[];
    cf.forEach(c => {
      dias.forEach(dia => {
        const esp = hhEsp(c,dia);
        if (esp===0||ehFolga(c,dia)||deFerias(c.cracha,dia)||getJust(c.cracha,dia)) return;
        // H-H previsto total: passado + futuro (para o card de cabeçalho)
        totPrev += esp;
        // Só dias passados/hoje: aderência, ausências, baixo apontamento
        if (dia>hj) return;
        totPrevPassado += esp;
        const hh = hhDia(c.cracha,dia);
        totApt += hh;
        if (hh===0) ausencias.push({colab:c,dia});
        else if (hh/esp < 0.50) baixos.push({colab:c,dia,hh,esp,pct:Math.round(hh/esp*100)});
      });
    });
    // Aderência usa só o H-H dos dias passados como denominador
    const ader = totPrevPassado>0 ? Math.round(totApt/totPrevPassado*100) : null;
    const corAder = ader===null?'#9ca3af':ader>=75?'var(--green)':ader>=50?'var(--amber)':'var(--red)';

    // Aviso de colaboradores sem primeira_folga (não consegue projetar folgas)
    const semFolga = cf.filter(col => !col.primeira_folga && !col.data_ref_folga && this._escalaDe(col)?.tipo_ciclo==='ROTATIVO');
    if (semFolga.length) {
      const elAviso = document.getElementById('apt-metricas');
      const avisoHtml = `<div style="grid-column:1/-1;background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:10px 14px;font-size:11px;color:#92400e;display:flex;align-items:center;gap:8px">
        <i class="ti ti-alert-triangle" style="font-size:16px;flex-shrink:0"></i>
        <div><strong>${semFolga.length} colaborador(es) sem 1ª folga cadastrada</strong> — folgas não podem ser projetadas e H-H previsto pode estar incorreto.
        Configure em <strong>Cadastro → lápis → botão de escala</strong> para cada um: ${semFolga.map(x=>x.nome.split(' ')[0]).join(', ')}.</div>
      </div>`;
      if (elAviso) elAviso.insertAdjacentHTML('beforeend', avisoHtml);
    }

    const elM = document.getElementById('apt-metricas');
    if (elM) elM.innerHTML = [
      {l:'H-H previsto',             v:totPrev.toFixed(1)+'h', s:'Baseado no turno · exclui folgas e férias projetadas',  c:'var(--yellow)'},
      {l:'Aderência ao apontamento', v:ader===null?'—':ader+'%', s:ader===null?'Nenhum dia passado no período':'H-H apontado / H-H disponível (dias passados)',c:corAder},
      {l:'Ausência de apontamento',  v:ausencias.length,       s:'Dias sem registro',             c:ausencias.length>0?'var(--red)':'#374151'},
      {l:'Baixo apontamento',        v:baixos.length,          s:'Dias abaixo de 50% do esperado',c:baixos.length>0?'var(--amber)':'#374151'},
    ].map(({l,v,s:sub,c})=>`<div class="metric"><div class="m-label">${l}</div><div class="m-val" style="color:${c}">${v}</div><div class="m-sub">${sub}</div></div>`).join('');

    // Quadro do dia
    this._renderQuadro(cf, ehFolga, deFerias);

    // Pontos de atenção
    this._renderPontos(ausencias, baixos);

    // Heatmap
    this._renderHeatmap(cf, dias, hhDia, ehFolga, deFerias, getJust, hhEsp, hj);

    // Tabela
    this._renderTabela();

    // Importador bind
    this._bindImportador();
  },

  /* ── Quadro do dia ── */
  _renderQuadro(cf, ehFolga, deFerias) {
    const el = document.getElementById('apt-quadro'); if (!el) return;
    const hj = this._hoje(), am = this._amanha();

    const sit = (c,d) => deFerias(c.cracha,d)?'ferias':ehFolga(c,d)?'folga':'trabalho';
    const fhj = cf.filter(c=>sit(c,hj)==='folga');
    const fam = cf.filter(c=>sit(c,am)==='folga');
    const fer = cf.filter(c=>sit(c,hj)==='ferias');

    const grupo = (colabs) => {
      const g={};
      colabs.forEach(c=>{const t=this._turnoDe(c);const tn=t?t.nome:'?';if(!g[tn])g[tn]=[];g[tn].push(c.nome.split(' ')[0]);});
      if (!Object.keys(g).length) return `<span style="font-size:11px;color:#9ca3af">Nenhum</span>`;
      return Object.entries(g).map(([t,ns])=>`<span style="font-size:11px"><strong>${t}:</strong> ${ns.join(', ')}</span>`).join('<br>');
    };

    el.innerHTML = `<div class="card" style="padding:12px 16px">
      <div class="card-title" style="margin-bottom:10px"><i class="ti ti-calendar-today" style="color:var(--blue)"></i> QUADRO DO DIA — ${this._diaSem(hj)} ${this._fmtFull(hj)}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        ${[
          {cor:'#9ca3af',bg:'#f3f4f6',titulo:'Folgando hoje',      lista:fhj, cnt:fhj.length},
          {cor:'var(--amber)',bg:'var(--amber-l)',titulo:'Folgando amanhã',lista:fam,cnt:fam.length},
          {cor:'#60a5fa',bg:'#dbeafe',titulo:'De férias',          lista:fer, cnt:fer.length},
        ].map(({cor,bg,titulo,lista,cnt})=>`
          <div style="background:var(--bg);border-radius:var(--radius-sm);padding:10px">
            <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-bottom:6px;display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:50%;background:${cor};display:inline-block"></span>${titulo}
              <span style="background:${bg};color:${cor};font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:auto">${cnt}</span>
            </div>
            ${grupo(lista)}
          </div>`).join('')}
      </div>
    </div>`;
  },

  /* ── Pontos de atenção ── */
  _renderPontos(ausencias, baixos) {
    const el = document.getElementById('apt-pontos'); if (!el) return;
    const total = ausencias.length + baixos.length;
    const ausMap = {};
    ausencias.forEach(({colab,dia})=>{ if(!ausMap[colab.cracha]) ausMap[colab.cracha]={colab,dias:[]}; ausMap[colab.cracha].dias.push(dia); });

    el.innerHTML = `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="card-title" style="margin:0"><i class="ti ti-alert-triangle" style="color:var(--amber)"></i> PONTOS DE ATENÇÃO</div>
        <div style="display:flex;align-items:center;gap:8px">
          ${total>0?`<span style="background:var(--red-l);color:var(--red);font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px">${total} ponto${total>1?'s':''}</span>`:''}
          <button id="apt-pontos-toggle" class="apt-icon-btn"><i class="ti ti-chevron-${this._s.pontosAberto?'up':'down'}"></i></button>
        </div>
      </div>
      <div id="apt-pontos-body" style="display:${this._s.pontosAberto?'block':'none'};margin-top:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b5563;margin-bottom:8px">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--red);margin-right:5px"></span>Ausência
            </div>
            ${ausencias.length===0
              ?`<p style="font-size:11px;color:#9ca3af"><i class="ti ti-circle-check" style="color:var(--green)"></i> Nenhuma ausência.</p>`
              :Object.values(ausMap).map(({colab,dias})=>`
                <div class="apt-attn-row">
                  <span style="width:6px;height:6px;border-radius:50%;background:var(--red);flex-shrink:0;margin-top:5px;display:inline-block"></span>
                  <div style="flex:1"><strong>${colab.nome.split(' ').slice(0,2).join(' ')}</strong> — ${dias.map(d=>this._fmtDM(d)).join(', ')}</div>
                  <button class="apt-icon-btn apt-btn-just" data-ch="${colab.cracha}" data-nome="${colab.nome}" data-dias="${dias.join(',')}"><i class="ti ti-pencil"></i></button>
                </div>`).join('')}
            <div style="font-size:10px;color:#9ca3af;margin-top:5px;background:var(--bg);padding:4px 8px;border-radius:var(--radius-sm)">Tratativa: Treinamento ou Serviço externo</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b5563;margin-bottom:8px">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#fb923c;margin-right:5px"></span>Baixo apontamento <span style="background:#ffedd5;color:#c2410c;font-size:9px;padding:1px 5px;border-radius:10px">< 50%</span>
            </div>
            ${baixos.length===0
              ?`<p style="font-size:11px;color:#9ca3af"><i class="ti ti-circle-check" style="color:var(--green)"></i> Nenhum baixo apontamento.</p>`
              :baixos.map(({colab,dia,hh,esp,pct})=>`
                <div class="apt-attn-row">
                  <span style="width:6px;height:6px;border-radius:50%;background:#fb923c;flex-shrink:0;margin-top:5px;display:inline-block"></span>
                  <div><strong>${colab.nome.split(' ')[0]}</strong> — ${this._fmtDM(dia)} · ${hh.toFixed(1)}h/${esp.toFixed(1)}h (${pct}%)</div>
                </div>`).join('')}
            <div style="font-size:10px;color:#9ca3af;margin-top:5px;background:var(--bg);padding:4px 8px;border-radius:var(--radius-sm)">Tratativa disponível em breve.</div>
          </div>
        </div>
      </div>
    </div>`;

    document.getElementById('apt-pontos-toggle').addEventListener('click', () => {
      this._s.pontosAberto = !this._s.pontosAberto;
      document.getElementById('apt-pontos-body').style.display = this._s.pontosAberto?'block':'none';
      document.getElementById('apt-pontos-toggle').innerHTML = `<i class="ti ti-chevron-${this._s.pontosAberto?'up':'down'}"></i>`;
    });
    document.querySelectorAll('.apt-btn-just').forEach(btn => btn.addEventListener('click', () =>
      this._modalJustif(btn.dataset.ch, btn.dataset.nome, btn.dataset.dias.split(','))
    ));
  },


  /* ── Ordem dos colaboradores por modalidade (localStorage) ── */
  _chaveOrdem(mod) { return `apt_ordem_${mod||'all'}`; },
  _carregarOrdem(mod) {
    try { return JSON.parse(localStorage.getItem(this._chaveOrdem(mod))) || []; }
    catch(e) { return []; }
  },
  _salvarOrdem(mod, chapas) {
    try { localStorage.setItem(this._chaveOrdem(mod), JSON.stringify(chapas)); }
    catch(e) {}
  },
  _aplicarOrdem(colabs, mod) {
    const ordem = this._carregarOrdem(mod);
    if (!ordem.length) return colabs;
    const mapa = Object.fromEntries(colabs.map(c=>[c.cracha,c]));
    const ordenados = ordem.map(ch => mapa[ch]).filter(Boolean);
    const novos = colabs.filter(c => !ordem.includes(c.cracha));
    return [...ordenados, ...novos];
  },
  _moverColab(cracha, direcao, turnoNome) {
    // Pega a modalidade atual filtrada
    const mod = this._s.modalidades.length===1 ? this._s.modalidades[0] : 'all';
    // Pega colaboradores do turno
    const turno = this._s.turnos.find(t=>t.nome===turnoNome);
    let cf = this._s.colaboradores.filter(c=>this._completo(c));
    if (this._s.colabChapa) cf=cf.filter(c=>String(c.cracha)===String(this._s.colabChapa));
    else if (this._s.modalidades.length) cf=cf.filter(c=>this._s.modalidades.includes(c.modalidade));
    const doTurno = this._aplicarOrdem(cf.filter(c=>c.turno_id===turno?.id), mod);
    const idx = doTurno.findIndex(c=>c.cracha===cracha);
    if (idx===-1) return;
    const novoIdx = idx + direcao;
    if (novoIdx<0||novoIdx>=doTurno.length) return;
    // Trocar posições
    [doTurno[idx], doTurno[novoIdx]] = [doTurno[novoIdx], doTurno[idx]];
    // Salvar ordem de TODOS os colaboradores (não só do turno)
    const todosOrdenados = this._aplicarOrdem(cf, mod);
    const posicaoTurno = todosOrdenados.filter(c=>c.turno_id===turno?.id);
    // Substituir posições do turno na ordem geral
    let iT=0;
    const novaOrdemGeral = todosOrdenados.map(c => {
      if (c.turno_id===turno?.id) return doTurno[iT++];
      return c;
    });
    this._salvarOrdem(mod, novaOrdemGeral.map(c=>c.cracha));
    // Re-renderizar apenas o heatmap
    this._carregarDados();
  },

  /* ── Heatmap ── */
  _renderHeatmap(cf, todosDias, hhDia, ehFolga, deFerias, getJust, hhEsp, hj) {
    const el = document.getElementById('apt-heatmap'); if (!el) return;
    const s = this._s;
    const PPG=14, pags=Math.ceil(todosDias.length/PPG), pag=Math.min(s.hmPag,pags-1);
    const dias = todosDias.slice(pag*PPG, (pag+1)*PPG);

    const cellBg = (c,dia) => {
      // Férias e folgas têm prioridade mesmo em dias futuros
      if (deFerias(c.cracha,dia)) return {bg:'#60a5fa',fg:'#1e3a8a',lbl:'F'};
      if (ehFolga(c,dia))         return {bg:'#9ca3af',fg:'#f9fafb',lbl:''};
      // Dias futuros sem folga = disponível
      if (dia>hj) return {bg:'#93c5fd',fg:'#1e3a8a',lbl:''};
      const just = getJust(c.cracha,dia);
      if (just) return {bg:'#fbbf24',fg:'#78350f',lbl:just.tratativa?.substring(0,1)||'J'};
      const hh=hhDia(c.cracha,dia), esp=hhEsp(c,dia);
      if (esp===0) return {bg:'#e5e7eb',fg:'#6b7280',lbl:''};
      if (hh===0)  return {bg:'#f87171',fg:'#7f1d1d',lbl:''};
      const pct = hh/esp;
      if (pct >= s.META)  return {bg:'#16a34a',fg:'#dcfce7',lbl:hh.toFixed(1)+'h'};
      if (pct >= 0.50)    return {bg:'#facc15',fg:'#78350f',lbl:hh.toFixed(1)+'h'};
      return {bg:'#fb923c',fg:'#7c2d12',lbl:hh.toFixed(1)+'h'};
    };

    // Modalidade atual para chave de ordem
    const modAtual = s.modalidades.length===1 ? s.modalidades[0] : 'all';

    // Agrupar por turno aplicando ordem salva
    const porTurno = {};
    s.turnos.forEach(t => porTurno[t.nome]=[]);
    porTurno['Não config.'] = [];
    cf.forEach(c => {
      const t = this._turnoDe(c);
      const k = t?t.nome:'Não config.';
      (porTurno[k]||(porTurno[k]=[])).push(c);
    });

    let linhas = '';
    [...s.turnos.map(t=>t.nome),'Não config.'].forEach(turno => {
      const raw = (porTurno[turno]||[]);
      if (!raw.length) return;
      // Aplicar ordem salva (fallback: alfabética)
      const ordemSalva = this._carregarOrdem(modAtual);
      const colabs = ordemSalva.length
        ? this._aplicarOrdem(raw, modAtual)
        : raw.sort((a,b)=>a.nome.localeCompare(b.nome));

      linhas += `<div class="apt-turno-hdr">${turno==='Não config.'?'⚠ NÃO CONFIGURADO':turno.toUpperCase()}</div>`;
      colabs.forEach((c, idx) => {
        const isFirst = idx===0, isLast = idx===colabs.length-1;
        linhas += `
          <div style="font-size:11px;color:#374151;display:flex;align-items:center;height:26px;gap:2px;padding-right:4px;font-weight:600;overflow:hidden" title="${c.nome}">
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.nome.split(' ')[0]}</span>
            <div style="display:flex;flex-direction:column;gap:0;flex-shrink:0;opacity:.3;transition:opacity .15s" class="apt-ordem-btns" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.3">
              <button class="apt-mover-btn" data-ch="${c.cracha}" data-dir="-1" data-turno="${turno}"
                style="width:12px;height:12px;border:none;background:transparent;cursor:${isFirst?'default':'pointer'};color:${isFirst?'transparent':'#6b7280'};padding:0;font-size:9px;line-height:1;display:flex;align-items:center;justify-content:center"
                ${isFirst?'disabled':''} title="Mover para cima">▲</button>
              <button class="apt-mover-btn" data-ch="${c.cracha}" data-dir="1" data-turno="${turno}"
                style="width:12px;height:12px;border:none;background:transparent;cursor:${isLast?'default':'pointer'};color:${isLast?'transparent':'#6b7280'};padding:0;font-size:9px;line-height:1;display:flex;align-items:center;justify-content:center"
                ${isLast?'disabled':''} title="Mover para baixo">▼</button>
            </div>
          </div>
          ${dias.map(dia=>{const{bg,fg,lbl}=cellBg(c,dia);return `<div class="apt-hm-cell" data-ch="${c.cracha}" data-dia="${dia}" style="background:${bg};color:${fg}" title="${c.nome} · ${this._diaSem(dia)} ${this._fmtDM(dia)}">${lbl}</div>`;}).join('')}`;
      });
    });

    el.style.display = 'block';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div class="card-title" style="margin:0"><i class="ti ti-layout-grid"></i> PRESENÇA POR COLABORADOR
          <span style="font-weight:400;text-transform:none;font-size:10px;color:#6b7280;margin-left:6px">${this._fmtFull(dias[0])} – ${this._fmtFull(dias[dias.length-1])}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="display:flex;gap:7px;flex-wrap:wrap">
            ${[['#16a34a',`≥${Math.round(s.META*100)}%`],['#facc15','≥50% <75%'],['#fb923c','>0% <50%'],['#f87171','Sem reg.'],['#9ca3af','Folga'],['#93c5fd','Disponível'],['#fbbf24','Justificado'],['#60a5fa','Férias']].map(([bg,txt])=>
              `<span style="display:flex;align-items:center;gap:3px;font-size:10px;color:#4b5563;font-weight:500"><span style="width:10px;height:10px;border-radius:2px;background:${bg};display:inline-block;border:1px solid rgba(0,0,0,.08)"></span>${txt}</span>`
            ).join('')}
          </div>
          <div style="display:flex;gap:3px;align-items:center">
            <button id="hm-prev" class="apt-icon-btn" ${pag===0?'disabled':''}><i class="ti ti-chevron-left"></i></button>
            <span style="font-size:11px;color:#4b5563;font-weight:500;padding:0 4px">${pag+1}/${pags}</span>
            <button id="hm-next" class="apt-icon-btn" ${pag>=pags-1?'disabled':''}><i class="ti ti-chevron-right"></i></button>
          </div>
        </div>
      </div>
      <div style="overflow-x:auto">
        <div style="display:grid;grid-template-columns:70px repeat(${dias.length},minmax(28px,1fr));gap:3px;min-width:${70+dias.length*30}px">
          <div></div>
          ${dias.map(d=>`<div style="text-align:center;font-size:9px;color:#4b5563;font-weight:600;line-height:1.3;padding-bottom:2px"><div>${this._diaSem(d)}</div><div>${this._fmtDM(d)}</div></div>`).join('')}
          ${linhas}
        </div>
      </div>
      <div style="margin-top:8px;font-size:10px;color:#6b7280;background:var(--bg);padding:5px 10px;border-radius:var(--radius-sm)">
        <i class="ti ti-info-circle"></i> Cores por % do H-H esperado no turno · ≥75% verde · ≥50% amarelo · <50% laranja · 0% vermelho
      </div>`;

    document.getElementById('hm-prev')?.addEventListener('click', () => { s.hmPag--; this._renderHeatmap(cf,todosDias,hhDia,ehFolga,deFerias,getJust,hhEsp,hj); });
    document.getElementById('hm-next')?.addEventListener('click', () => { s.hmPag++; this._renderHeatmap(cf,todosDias,hhDia,ehFolga,deFerias,getJust,hhEsp,hj); });
    // Setas de reordenação
    el.querySelectorAll('.apt-mover-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this._moverColab(btn.dataset.ch, parseInt(btn.dataset.dir), btn.dataset.turno);
      });
    });
    el.querySelectorAll('.apt-hm-cell').forEach(cel => cel.addEventListener('click', () => {
      const c = cf.find(x=>String(x.cracha)===cel.dataset.ch);
      if (c) this._detalheCell(c, cel.dataset.dia, hhDia, hhEsp, hj);
    }));
  },

  _detalheCell(c, dia, hhDia, hhEsp, hj) {
    if (dia>hj) { this._modal('Dia disponível',`<p style="font-size:12px;color:#9ca3af;text-align:center;padding:16px">${this._fmtFull(dia)} ainda não chegou.</p>`); return; }
    const apts = this._s.apontamentos.filter(a=>String(a.chapa)===String(c.cracha)&&a.data_apontamento===dia);
    const tot = apts.reduce((t,a)=>t+(parseFloat(String(a.hh_total||0).replace(',','.'))||0),0);
    const esp = hhEsp(c,dia), pct = esp>0?Math.round(tot/esp*100):0;
    const cor = pct>=75?'var(--green)':pct>=50?'var(--amber)':'var(--red)';
    this._modal(`${c.nome.split(' ').slice(0,2).join(' ')} · ${this._diaSem(dia)} ${this._fmtFull(dia)}`,
      `<div style="font-size:11px;color:#6b7280;margin-bottom:12px;background:var(--bg);padding:8px 10px;border-radius:var(--radius-sm)">
        Esperado: <strong>${esp.toFixed(1)}h</strong> · Apontado: <strong style="color:${cor}">${tot.toFixed(1)}h</strong> · <strong style="color:${cor}">${pct}%</strong>
      </div>`+
      (apts.length===0?`<p style="text-align:center;color:#9ca3af;font-size:12px;padding:16px">Nenhum apontamento.</p>`
      :`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr>${['OS','Descrição','Início','Fim','H-H'].map(h=>`<th style="text-align:left;padding:5px 8px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7280">${h}</th>`).join('')}</tr></thead>
          <tbody>${apts.map(a=>`<tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:5px 8px;font-family:monospace">${a.os}</td>
            <td style="padding:5px 8px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.desc_servico||''}">${a.desc_servico||'—'}</td>
            <td style="padding:5px 8px">${a.hora_inicio}</td><td style="padding:5px 8px">${a.hora_fim}</td>
            <td style="padding:5px 8px;font-weight:600">${(parseFloat(String(a.hh_total||0).replace(',','.'))||0).toFixed(1)}h</td>
          </tr>`).join('')}
          <tr style="background:var(--bg)"><td colspan="4" style="padding:5px 8px;font-weight:700;font-size:11px">Total</td>
          <td style="padding:5px 8px;font-weight:700;color:${cor}">${tot.toFixed(1)}h</td></tr>
          </tbody></table></div>`));
  },

  /* ── Tabela ── */
  _renderTabela() {
    const el = document.getElementById('apt-tabela'); if (!el) return;
    const hj = this._hoje();
    const apts = [...this._s.apontamentos].filter(a=>a.data_apontamento<=hj);
    el.style.display = 'block';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="card-title" style="margin:0"><i class="ti ti-list-details"></i> DETALHAMENTO DE APONTAMENTOS</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:#6b7280">${apts.length} registros</span>
          <button id="apt-tbl-toggle" class="apt-icon-btn"><i class="ti ti-chevron-${this._s.tabelaAberta?'up':'down'}"></i></button>
        </div>
      </div>
      <div style="display:${this._s.tabelaAberta?'block':'none'};margin-top:12px" id="apt-tbl-body">
        <div style="overflow-x:auto;max-height:360px;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead style="position:sticky;top:0;background:var(--card-bg);z-index:1">
              <tr>${['Data','Colaborador','OS','Descrição','Início','Fim','H-H'].map(h=>`<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7280;white-space:nowrap">${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${apts.length===0?`<tr><td colspan="7" style="text-align:center;padding:24px;color:#9ca3af">Nenhum apontamento no período.</td></tr>`
              :apts.map(a=>`<tr style="border-bottom:1px solid #f9fafb">
                  <td style="padding:5px 10px;white-space:nowrap;font-size:11px">${this._fmtDM(a.data_apontamento)}</td>
                  <td style="padding:5px 10px;white-space:nowrap">${(a.nome||'').split(' ').slice(0,2).join(' ')}</td>
                  <td style="padding:5px 10px;font-family:monospace;font-size:11px">${a.os}</td>
                  <td style="padding:5px 10px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.desc_servico||''}">${a.desc_servico||'—'}</td>
                  <td style="padding:5px 10px">${a.hora_inicio}</td>
                  <td style="padding:5px 10px">${a.hora_fim}</td>
                  <td style="padding:5px 10px;font-weight:600">${(parseFloat(String(a.hh_total||0).replace(',','.'))||0).toFixed(1)}h</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    document.getElementById('apt-tbl-toggle').addEventListener('click', () => {
      this._s.tabelaAberta = !this._s.tabelaAberta;
      this._renderTabela();
    });
  },

  /* ══════════════════════════════════════════════
     IMPORTADOR
     ══════════════════════════════════════════════ */
  _tplImportador() {
    return `<div class="card import-section">
      <div class="card-title"><i class="ti ti-upload"></i> IMPORTAR APONTAMENTOS</div>
      <div class="dropzone" id="apt-drop" style="position:relative">
        <input type="file" id="apt-file" accept=".xls,.xlsx" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%">
        <i class="ti ti-file-spreadsheet"></i>
        <p><strong>Arraste o arquivo aqui</strong><br>ou clique para selecionar</p>
        <div class="file-types">
          <div class="file-type"><i class="ti ti-file-spreadsheet" style="color:var(--green)"></i><span class="ext">.xlsx</span></div>
          <div class="file-type"><i class="ti ti-file-spreadsheet" style="color:var(--amber)"></i><span class="ext">.xls</span></div>
        </div>
      </div>
      <div id="apt-imp-prog" style="display:none;margin-top:10px">
        <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden">
          <div id="apt-imp-bar" style="height:100%;background:var(--yellow);border-radius:2px;width:0%;transition:width .3s"></div>
        </div>
        <div id="apt-imp-msg" style="font-size:11px;color:#6b7280;margin-top:5px;line-height:1.5"></div>
      </div>
    </div>`;
  },

  _bindImportador() {
    const inp = document.getElementById('apt-file');
    const zona = document.getElementById('apt-drop');
    if (!inp||!zona||zona._bound) return;
    zona._bound = true;
    zona.addEventListener('dragover', e=>{e.preventDefault();zona.classList.add('over');});
    zona.addEventListener('dragleave', ()=>zona.classList.remove('over'));
    zona.addEventListener('drop', e=>{e.preventDefault();zona.classList.remove('over');if(e.dataTransfer.files[0])this._processarImport(e.dataTransfer.files[0]);});
    inp.addEventListener('change', ()=>{if(inp.files[0])this._processarImport(inp.files[0]);});
  },

  async _processarImport(file) {
    const prog=document.getElementById('apt-imp-prog'),bar=document.getElementById('apt-imp-bar'),msg=document.getElementById('apt-imp-msg');
    const setP=(pct,txt)=>{prog.style.display='block';bar.style.width=pct+'%';msg.innerHTML=txt;};
    try {
      setP(5,'Lendo arquivo…');
      showToast('Importando…','info',60000);
      const XLSX = await this._loadXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, {header:1,defval:null,raw:true});
      setP(15,'Parseando…');

      // Remove prefixo aspas simples SYLK
      const L = v => { if(v==null) return null; const s=String(v).trim(); return s.startsWith("'")?s.slice(1).trim():s; };
      const reData = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
      const reCracha = /^(\d{3,9})\s*-\s*(.+)/;  // até 9 dígitos

      const parseData = v => {
        if (v==null) return null;
        if (typeof v==='number'&&v>10000) {
          const d=new Date(Date.UTC(1900,0,1)+(v-2)*86400000); return d.toISOString().slice(0,10);
        }
        const s=L(v); if(!s) return null;
        if (reData.test(s)) { const[d,m,y]=s.split('/'); return `${y.length===2?'20'+y:y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
        return null;
      };
      const parseHora = v => {
        if (v==null) return '';
        if (typeof v==='number') { const tm=Math.round(v*1440); return `${String(Math.floor(tm/60)).padStart(2,'0')}:${String(tm%60).padStart(2,'0')}`; }
        return L(v)||'';
      };
      const parseHH = v => {
        if (v==null) return 0;
        if (typeof v==='number'&&v<1) return parseFloat((v*24).toFixed(2));
        return parseFloat(String(L(v)||'0').replace(',','.'))||0;
      };

      const records=[]; let curCh=null,curNome=null;
      for (let i=0; i<raw.length; i++) {
        const row=raw[i];
        const v0=L(row[0])||'', v1=L(row[1])||'';
        if (v0==='Funcionário:') {
          const m=reCracha.exec(v1);
          if (m) { curCh=m[1].replace(/^0+/,'')||'0'; curNome=m[2].trim(); }
          continue;
        }
        const dataIso = parseData(row[0]);
        if (!dataIso||!curCh) continue;
        const nxt = raw[i+1]||[];
        const os  = L(nxt[0])||'';
        const desc = nxt[1]!=null ? String(L(nxt[1])||'').replace(/^\d+-\s*/,'') : '';
        const hi=parseHora(row[2]), hf=parseHora(row[3]), ht=parseHH(row[4]);
        if (!os||!hi) continue;
        records.push({data_apontamento:dataIso, os, desc_servico:desc||null,
          tipo_atividade:v1||null, hora_inicio:hi, hora_fim:hf,
          hh_total:ht, chapa:curCh, nome:curNome});
      }

      if (!records.length) {
        const funcs=raw.filter(r=>L(r[0])==='Funcionário:').length;
        const linhasDatas=raw.filter(r=>parseData(r[0])).length;
        setP(0,`⚠ Nenhum registro. Diagnóstico: ${funcs} funcionário(s) detectado(s), ${linhasDatas} linha(s) de data encontrada(s).`);
        showToast('Nenhum registro encontrado.','erro');
        return;
      }

      const nColabs = [...new Set(records.map(r=>r.nome))].length;
      const datas = [...new Set(records.map(r=>r.data_apontamento))].sort();
      setP(30,`${records.length} apontamentos de ${nColabs} colaborador(es) · ${this._fmtDM(datas[0])}–${this._fmtDM(datas[datas.length-1])}. Enviando…`);

      // Upsert usando getDB() — mesmo padrão do prog_semanal
      const db = getDB();
      const LOTE = 100;
      for (let i=0; i<records.length; i+=LOTE) {
        const lote = records.slice(i, i+LOTE);
        const {error} = await db.from('apontamentos').upsert(lote, {
          onConflict: 'os,data_apontamento,chapa,hora_inicio',
          ignoreDuplicates: false
        });
        if (error) throw error;
        setP(30+Math.round((i/records.length)*65), `Enviando… ${Math.min(i+LOTE,records.length)}/${records.length}`);
      }
      setP(100, `✓ ${records.length} apontamentos de ${nColabs} colaboradores importados.`);
      showToast(`${records.length} apontamentos importados.`, 'ok', 5000);
      setTimeout(() => this._carregarDados(), 800);
    } catch(e) {
      showToast('Erro: '+e.message,'erro');
      setP(0,`⚠ Erro: ${e.message}`);
      console.error(e);
    }
  },

  async _loadXLSX() {
    if (window.XLSX) return window.XLSX;
    return new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload=()=>res(window.XLSX); s.onerror=()=>rej(new Error('Falha XLSX'));
      document.head.appendChild(s);
    });
  },

  /* ══════════════════════════════════════════════
     MODAL JUSTIFICATIVA
     ══════════════════════════════════════════════ */
  _modalJustif(ch, nome, dias) {
    this._modal('Lançar justificativa', `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="font-size:12px;background:var(--bg);border-radius:var(--radius-sm);padding:8px 10px"><strong>${nome}</strong> — ${dias.map(d=>this._fmtDM(d)).join(', ')}</div>
        <div>${this._lbl('Tipo')}<select id="jt-tipo" class="apt-select"><option>Ausência de apontamento</option><option>Troca de folga</option></select></div>
        <div style="display:flex;gap:8px">
          <div style="flex:1">${this._lbl('Data início')}<input type="date" id="jt-di" value="${dias[0]}" class="apt-input"></div>
          <div style="flex:1">${this._lbl('Data fim')}<input type="date" id="jt-df" value="${dias[dias.length-1]}" class="apt-input"></div>
        </div>
        <div>${this._lbl('Tratativa')}<select id="jt-trat" class="apt-select"><option>Treinamento</option><option>Serviço externo</option></select></div>
        <div>${this._lbl('Obs.')}<input type="text" id="jt-obs" class="apt-input" placeholder="EX: NR-10…" oninput="this.value=this.value.toUpperCase()"></div>
      </div>`,
      async () => {
        const db = getDB();
        const {error} = await db.from('apt_justificativas').insert({
          chapa:ch, nome, tipo:document.getElementById('jt-tipo').value,
          tratativa:document.getElementById('jt-trat').value,
          data_inicio:document.getElementById('jt-di').value,
          data_fim:document.getElementById('jt-df').value,
          obs:document.getElementById('jt-obs').value
        });
        if (error) throw error;
        this._fecharModal(); showToast('Justificativa registrada.','ok'); this._carregarDados();
      }, 'Salvar');
  },

  /* ══════════════════════════════════════════════
     ABA CADASTRO
     ══════════════════════════════════════════════ */
  _tplCadastro() {
    const aba = this._s.cadAba;
    return `<div class="card">
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:16px;overflow-x:auto">
        ${[['colab','Colaboradores'],['escalas','Escalas'],['turnos','Turnos'],['justif','Justificativas']].map(([id,lbl])=>
          `<div class="apt-tab ${aba===id?'on':''}" id="cad-tab-${id}">${lbl}</div>`).join('')}
      </div>
      <div id="cad-body"></div>
    </div>`;
  },

  _bindCadastro() {
    [['colab','Colaboradores'],['escalas','Escalas'],['turnos','Turnos'],['justif','Justificativas']].forEach(([id]) => {
      document.getElementById(`cad-tab-${id}`)?.addEventListener('click', () => {
        this._s.cadAba = id;
        document.querySelectorAll('[id^="cad-tab-"]').forEach(t => t.classList.remove('on'));
        document.getElementById(`cad-tab-${id}`).classList.add('on');
        this._renderCadCorpo();
      });
    });
  },

  async _carregarCadastro() {
    try {
      const db = getDB();
      const [r1,r2,r3,r4,r5] = await Promise.all([
        db.from('apt_colaboradores').select('*').order('nome'),
        db.from('apt_especialidades').select('*').order('nome'),
        db.from('apt_justificativas').select('*').order('data_inicio',{ascending:false}).limit(100),
        db.from('apt_escalas').select('*').order('nome'),
        db.from('apt_turnos').select('*').order('nome'),
      ]);
      this._s.colaboradores  = r1.data||[];
      this._s.especialidades = r2.data||[];
      this._s.justificativas = r3.data||[];
      this._s.escalas        = r4.data||[];
      this._s.turnos         = r5.data||[];
      this._renderCadCorpo();
    } catch(e) {
      const el=document.getElementById('cad-body');
      if(el) el.innerHTML=`<p style="color:var(--red);font-size:12px">${e.message}</p>`;
    }
  },

  _renderCadCorpo() {
    const aba = this._s.cadAba;
    document.querySelectorAll('[id^="cad-tab-"]').forEach(t => {
      const id = t.id.replace('cad-tab-','');
      t.className = 'apt-tab' + (id===aba?' on':'');
    });
    const body = document.getElementById('cad-body'); if (!body) return;
    if      (aba==='colab')   this._renderColabs(body);
    else if (aba==='escalas') this._renderEscalas(body);
    else if (aba==='turnos')  this._renderTurnos(body);
    else                      this._renderJustifs(body);
  },

  /* ── Colaboradores ── */
  _renderColabs(body) {
    const s = this._s;
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <div class="dd-btn" style="cursor:text;width:190px;padding:0;gap:0">
            <i class="ti ti-search" style="padding:0 8px;color:#9ca3af"></i>
            <input id="cad-busca" type="text" placeholder="Buscar…" style="border:none;background:transparent;outline:none;font-family:var(--font);font-size:11px;flex:1;height:30px;padding-right:8px">
          </div>
          <select id="cad-mod-filtro" class="dd-btn" style="cursor:pointer;width:150px;font-family:var(--font);font-size:11px">
            <option value="">Todas modalidades</option>
            ${s.MODALIDADES.map(m=>`<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;gap:6px">
          <button id="cad-btn-imp" class="dd-action-btn secondary" style="height:30px;padding:0 12px;font-family:var(--font)"><i class="ti ti-download"></i> Importar da base</button>
          <button id="cad-btn-esp" class="dd-action-btn secondary" style="height:30px;padding:0 12px;font-family:var(--font)"><i class="ti ti-tag"></i> Especialidades</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr>${['Crachá','Nome','Modalidade','Especialidade','Escala','Turno','Status','Ações'].map(h=>`<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7280;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
          <tbody id="cad-tbody">${this._linhasColabs(s.colaboradores)}</tbody>
        </table>
      </div>`;

    document.getElementById('cad-busca').addEventListener('input', () => this._filtrarColabs());
    document.getElementById('cad-mod-filtro').addEventListener('change', () => this._filtrarColabs());
    document.getElementById('cad-btn-imp').addEventListener('click', () => this._importarBase());
    document.getElementById('cad-btn-esp').addEventListener('click', () => this._modalEspecialidades());
    this._bindBotoesColab();
  },

  _linhasColabs(cols) {
    if (!cols.length) return `<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af">Nenhum colaborador. Clique em <strong>Importar da base</strong>.</td></tr>`;
    return cols.map(c => {
      const esp = this._s.especialidades.find(e=>e.id===c.especialidade_id);
      const esc = this._s.escalas.find(e=>e.id===c.escala_id);
      const tur = this._s.turnos.find(t=>t.id===c.turno_id);
      const ok  = this._completo(c);
      return `<tr style="border-bottom:1px solid #f9fafb" data-cracha="${c.cracha}" data-mod="${c.modalidade||''}">
        <td style="padding:6px 10px;color:#6b7280;font-size:11px">${c.cracha}</td>
        <td style="padding:6px 10px;font-weight:500">${c.nome}</td>
        <td style="padding:6px 10px">${c.modalidade?`<span style="background:#eff6ff;color:#1d4ed8;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${c.modalidade}</span>`:'—'}</td>
        <td style="padding:6px 10px;font-size:11px;color:#6b7280">${esp?esp.nome:'—'}</td>
        <td style="padding:6px 10px;font-size:11px">${esc?esc.nome:'—'}</td>
        <td style="padding:6px 10px;font-size:11px">${tur?tur.nome:'—'}</td>
        <td style="padding:6px 10px">${ok?`<span style="background:var(--green-l);color:var(--green);font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">✓ OK</span>`:`<span class="apt-incompleto">⚠ Incompleto</span>`}</td>
        <td style="padding:6px 10px">
          <div style="display:flex;gap:3px">
            <button class="apt-icon-btn cad-edit"   data-cracha="${c.cracha}" title="Editar"><i class="ti ti-pencil"></i></button>
            <button class="apt-icon-btn cad-escala" data-cracha="${c.cracha}" title="Escala"><i class="ti ti-calendar-event"></i></button>
            <button class="apt-icon-btn cad-turno"  data-cracha="${c.cracha}" title="Turno"><i class="ti ti-clock"></i></button>
            <button class="apt-icon-btn cad-justif" data-cracha="${c.cracha}" title="Justificativa"><i class="ti ti-notes"></i></button>
            <button class="apt-icon-btn cad-ferias" data-cracha="${c.cracha}" title="Férias"><i class="ti ti-beach"></i></button>
          </div>
        </td>
      </tr>`;}).join('');
  },

  _filtrarColabs() {
    const q=(document.getElementById('cad-busca')?.value||'').toLowerCase();
    const mod=document.getElementById('cad-mod-filtro')?.value||'';
    document.querySelectorAll('#cad-tbody tr[data-cracha]').forEach(tr=>{
      tr.style.display=(!q||tr.textContent.toLowerCase().includes(q))&&(!mod||tr.dataset.mod===mod)?'':'none';
    });
  },

  _bindBotoesColab() {
    document.querySelectorAll('.cad-edit').forEach(btn=>{   const c=this._s.colaboradores.find(x=>x.cracha===btn.dataset.cracha); if(c) btn.onclick=()=>this._modalEditColab(c); });
    document.querySelectorAll('.cad-escala').forEach(btn=>{ const c=this._s.colaboradores.find(x=>x.cracha===btn.dataset.cracha); if(c) btn.onclick=()=>this._modalEscalaColab(c); });
    document.querySelectorAll('.cad-turno').forEach(btn=>{  const c=this._s.colaboradores.find(x=>x.cracha===btn.dataset.cracha); if(c) btn.onclick=()=>this._modalTurnoColab(c); });
    document.querySelectorAll('.cad-justif').forEach(btn=>{ const c=this._s.colaboradores.find(x=>x.cracha===btn.dataset.cracha); if(c) btn.onclick=()=>this._modalJustif(c.cracha,c.nome,[this._hoje()]); });
    document.querySelectorAll('.cad-ferias').forEach(btn=>{ const c=this._s.colaboradores.find(x=>x.cracha===btn.dataset.cracha); if(c) btn.onclick=()=>this._modalFerias(c); });
  },

  /* ── Escalas ── */
  _renderEscalas(body) {
    const s = this._s;
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:12px;color:#6b7280">Define o <strong>ciclo de folgas</strong> (5x1, 6x1, ADM)</div>
        <button id="esc-nova" class="dd-action-btn primary" style="height:30px;padding:0 14px;font-family:var(--font)"><i class="ti ti-plus"></i> Nova</button>
      </div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${['Nome','Tipo','Dias','Ciclo de folga','Ações'].map(h=>`<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7280">${h}</th>`).join('')}</tr></thead>
        <tbody>${s.escalas.length===0?`<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af">Nenhuma escala.</td></tr>`
          :s.escalas.map(e=>`<tr style="border-bottom:1px solid #f9fafb">
            <td style="padding:6px 10px;font-weight:500">${e.nome}</td>
            <td style="padding:6px 10px"><span style="background:${e.tipo_ciclo==='ADM'?'#eff6ff':'#f0fdf4'};color:${e.tipo_ciclo==='ADM'?'#1d4ed8':'var(--green)'};font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${e.tipo_ciclo}</span></td>
            <td style="padding:6px 10px">${e.tipo_ciclo==='ADM'?'—':e.dias_trabalho}</td>
            <td style="padding:6px 10px;font-size:11px;color:#6b7280">${e.tipo_ciclo==='ADM'?'Sábado e domingo':'A cada '+e.dias_trabalho+' dias trabalhados'}</td>
            <td style="padding:6px 10px"><div style="display:flex;gap:3px">
              <button class="apt-icon-btn esc-edit" data-id="${e.id}" title="Editar"><i class="ti ti-pencil"></i></button>
              <button class="apt-icon-btn esc-del" data-id="${e.id}" title="Excluir" style="color:var(--red)"><i class="ti ti-trash"></i></button>
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
    document.getElementById('esc-nova').onclick = () => this._modalEscalaCad();
    document.querySelectorAll('.esc-edit').forEach(btn=>{ const e=s.escalas.find(x=>String(x.id)===btn.dataset.id); if(e) btn.onclick=()=>this._modalEscalaCad(e); });
    document.querySelectorAll('.esc-del').forEach(btn=>btn.onclick=async()=>{
      if (!confirm('Excluir escala?')) return;
      const db=getDB(); await db.from('apt_escalas').delete().eq('id',btn.dataset.id);
      showToast('Excluído.','ok'); this._carregarCadastro();
    });
  },

  /* ── Turnos ── */
  _renderTurnos(body) {
    const s = this._s;
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:12px;color:#6b7280">Define os <strong>horários de entrada/saída</strong> e H-H esperado</div>
        <button id="tur-nova" class="dd-action-btn primary" style="height:30px;padding:0 14px;font-family:var(--font)"><i class="ti ti-plus"></i> Novo</button>
      </div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>${['Nome','Entrada','Saída','Refeição','HH/dia','Exc.Sex.','HH Sex.','Ações'].map(h=>`<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7280;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
        <tbody>${s.turnos.length===0?`<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af">Nenhum turno.</td></tr>`
          :s.turnos.map(t=>{
            const hh=this._calcHH(t.hora_entrada,t.hora_saida,t.intervalo_min);
            const hhSex=t.saida_sexta?this._calcHH(t.hora_entrada,t.saida_sexta,t.intervalo_min):null;
            return `<tr style="border-bottom:1px solid #f9fafb">
              <td style="padding:6px 10px;font-weight:500">${t.nome}</td>
              <td style="padding:6px 10px">${t.hora_entrada}</td>
              <td style="padding:6px 10px">${t.hora_saida}</td>
              <td style="padding:6px 10px">${t.intervalo_min}min</td>
              <td style="padding:6px 10px;font-weight:600">${hh.toFixed(2)}h</td>
              <td style="padding:6px 10px">${t.saida_sexta||'—'}</td>
              <td style="padding:6px 10px">${hhSex?hhSex.toFixed(2)+'h':'—'}</td>
              <td style="padding:6px 10px"><div style="display:flex;gap:3px">
                <button class="apt-icon-btn tur-edit" data-id="${t.id}" title="Editar"><i class="ti ti-pencil"></i></button>
                <button class="apt-icon-btn tur-del"  data-id="${t.id}" title="Excluir" style="color:var(--red)"><i class="ti ti-trash"></i></button>
              </div></td>
            </tr>`;}).join('')}
        </tbody>
      </table></div>`;
    document.getElementById('tur-nova').onclick = () => this._modalTurnoCad();
    document.querySelectorAll('.tur-edit').forEach(btn=>{ const t=s.turnos.find(x=>String(x.id)===btn.dataset.id); if(t) btn.onclick=()=>this._modalTurnoCad(t); });
    document.querySelectorAll('.tur-del').forEach(btn=>btn.onclick=async()=>{
      if (!confirm('Excluir turno?')) return;
      const db=getDB(); await db.from('apt_turnos').delete().eq('id',btn.dataset.id);
      showToast('Excluído.','ok'); this._carregarCadastro();
    });
  },

  /* ── Justificativas ── */
  _renderJustifs(body) {
    const todos = [...this._s.justificativas].sort((a,b)=>b.data_inicio<a.data_inicio?1:-1);
    body.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr>${['Data','Colaborador','Tipo','Tratativa','Obs.','Ações'].map(h=>`<th style="text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6b7280">${h}</th>`).join('')}</tr></thead>
      <tbody>${todos.length===0?`<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af">Nenhuma justificativa.</td></tr>`
        :todos.map(j=>`<tr style="border-bottom:1px solid #f9fafb">
          <td style="padding:6px 10px;white-space:nowrap">${this._fmtDM(j.data_inicio)}${j.data_fim!==j.data_inicio?' – '+this._fmtDM(j.data_fim):''}</td>
          <td style="padding:6px 10px">${j.nome||j.chapa}</td>
          <td style="padding:6px 10px"><span style="background:${j.tipo.includes('Aus')?'var(--red-l)':'var(--green-l)'};color:${j.tipo.includes('Aus')?'var(--red)':'var(--green)'};font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px">${j.tipo}</span></td>
          <td style="padding:6px 10px;font-size:11px">${j.tratativa||'—'}</td>
          <td style="padding:6px 10px;font-size:11px;color:#6b7280">${j.obs||'—'}</td>
          <td style="padding:6px 10px"><button class="apt-icon-btn"><i class="ti ti-pencil"></i></button></td>
        </tr>`).join('')}
      </tbody></table></div>`;
  },

  /* ══════════════════════════════════════════════
     MODAIS DE CADASTRO
     ══════════════════════════════════════════════ */
  _modalEditColab(c) {
    const s = this._s;
    const espOpts = `<option value="">Selecione…</option>`+s.especialidades.map(e=>`<option value="${e.id}" ${c.especialidade_id===e.id?'selected':''}>${e.nome}</option>`).join('');
    this._modal('Editar colaborador', `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:8px">
          <div style="max-width:110px">${this._lbl('Crachá')}<input class="apt-input" value="${c.cracha}" readonly style="background:#f9fafb;color:#6b7280"></div>
          <div style="flex:1">${this._lbl('Nome')}<input class="apt-input" value="${c.nome}" readonly style="background:#f9fafb;color:#6b7280"></div>
        </div>
        <div style="display:flex;gap:8px">
          <div style="flex:1">${this._lbl('Modalidade')}
            <select id="nc-mod" class="apt-select">
              <option value="">Selecione…</option>
              ${s.MODALIDADES.map(m=>`<option value="${m}" ${c.modalidade===m?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div style="flex:1">${this._lbl('Especialidade')}<select id="nc-esp" class="apt-select">${espOpts}</select></div>
        </div>
      </div>`,
      async () => {
        const db = getDB();
        const {error} = await db.from('apt_colaboradores').update({
          modalidade: document.getElementById('nc-mod').value||null,
          especialidade_id: document.getElementById('nc-esp').value||null,
        }).eq('cracha', c.cracha);
        if (error) throw error;
        this._fecharModal(); showToast('Salvo!','ok'); this._carregarCadastro();
      }, 'Salvar');
  },

  _modalEscalaColab(c) {
    const s = this._s;
    const escAtual = s.escalas.find(e=>e.id===c.escala_id);
    const escOpts = `<option value="">Selecione…</option>`+s.escalas.map(e=>`<option value="${e.id}" ${c.escala_id===e.id?'selected':''}>${e.nome}</option>`).join('');
    this._modal('Alterar escala — '+c.nome.split(' ')[0], `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="font-size:11px;background:var(--bg);border-radius:var(--radius-sm);padding:8px 10px;color:#6b7280">Escala atual: <strong>${escAtual?escAtual.nome:'—'}</strong></div>
        <div style="display:flex;gap:8px">
          <div style="flex:1">${this._lbl('Nova escala')}<select id="es-esc" class="apt-select">${escOpts}</select></div>
          <div style="flex:1">${this._lbl('Vigência a partir de')}<input type="date" id="es-vig" value="${this._hoje()}" class="apt-input"></div>
        </div>
        <div>${this._lbl('1ª folga (ou mais recente conhecida)')}
          <input type="date" id="es-pf" value="${c.primeira_folga||''}" class="apt-input">
        </div>
        <div>${this._lbl('Data de referência passada (para projeção retroativa)')}
          <input type="date" id="es-ref" value="${c.data_ref_folga||''}" class="apt-input">
          <div style="font-size:10px;color:#9ca3af;margin-top:2px">Projeta folgas para frente E para trás a partir desta data.</div>
        </div>
        <div id="es-prev" style="display:none;font-size:10px;color:var(--green);background:var(--green-l);border-radius:var(--radius-sm);padding:7px 10px"></div>
      </div>`,
      async () => {
        const escId = document.getElementById('es-esc').value;
        if (!escId) { showToast('Selecione uma escala.','erro'); return; }
        const pf  = document.getElementById('es-pf').value;
        const ref = document.getElementById('es-ref').value;
        const db  = getDB();
        await db.from('apt_historico_escalas').insert({chapa:c.cracha,escala_anterior:c.escala_id,escala_nova:escId,vigencia_inicio:document.getElementById('es-vig').value,primeira_folga_nova:pf||null}).then(()=>{});
        const {error} = await db.from('apt_colaboradores').update({escala_id:parseInt(escId),primeira_folga:pf||null,data_ref_folga:ref||null}).eq('cracha',c.cracha);
        if (error) throw error;
        this._fecharModal(); showToast('Escala atualizada!','ok'); this._carregarCadastro();
      }, 'Salvar');
    setTimeout(() => {
      const escSel=document.getElementById('es-esc'), pfinp=document.getElementById('es-pf'), refinp=document.getElementById('es-ref'), prev=document.getElementById('es-prev');
      const upP=()=>{
        const escId=escSel.value, ancora=refinp.value||pfinp.value;
        if(!escId||!ancora) return;
        const esc=s.escalas.find(e=>String(e.id)===escId);
        if(!esc||esc.tipo_ciclo==='ADM'){prev.style.display='none';return;}
        const ciclo=esc.dias_trabalho+1;
        const fut=[],pass=[];
        let cur=ancora; for(let i=0;i<5;i++){fut.push(this._fmtFull(cur));cur=this._addDays(cur,ciclo);}
        cur=this._addDays(ancora,-ciclo); for(let i=0;i<3;i++){pass.unshift(this._fmtFull(cur));cur=this._addDays(cur,-ciclo);}
        prev.style.display='block';
        prev.innerHTML=`<i class="ti ti-calendar-check"></i> …${pass.join(' · ')} · <strong>${this._fmtFull(ancora)}</strong> · ${fut.slice(1).join(' · ')} · …`;
      };
      escSel.addEventListener('change',upP); pfinp.addEventListener('change',upP); refinp.addEventListener('change',upP);
    },50);
  },

  _modalTurnoColab(c) {
    const s = this._s;
    const turAtual = s.turnos.find(t=>t.id===c.turno_id);
    const turOpts = `<option value="">Selecione…</option>`+s.turnos.map(t=>`<option value="${t.id}" ${c.turno_id===t.id?'selected':''}>${t.nome}</option>`).join('');
    this._modal('Alterar turno — '+c.nome.split(' ')[0], `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="font-size:11px;background:var(--bg);border-radius:var(--radius-sm);padding:8px 10px;color:#6b7280">Turno atual: <strong>${turAtual?turAtual.nome:'—'}</strong></div>
        <div style="display:flex;gap:8px">
          <div style="flex:1">${this._lbl('Novo turno')}<select id="tur-novo" class="apt-select">${turOpts}</select></div>
          <div style="flex:1">${this._lbl('Vigência a partir de')}<input type="date" id="tur-vig" value="${this._hoje()}" class="apt-input"></div>
        </div>
        <div>${this._lbl('Obs. (opcional)')}<input type="text" id="tur-obs" class="apt-input" placeholder="EX: TRANSFERÊNCIA A→B" oninput="this.value=this.value.toUpperCase()"></div>
      </div>`,
      async () => {
        const turId = document.getElementById('tur-novo').value;
        if (!turId) { showToast('Selecione um turno.','erro'); return; }
        const db = getDB();
        await db.from('apt_historico_turnos').insert({chapa:c.cracha,turno_anterior:c.turno_id,turno_novo:parseInt(turId),vigencia_inicio:document.getElementById('tur-vig').value,obs:document.getElementById('tur-obs').value||null}).then(()=>{});
        const {error} = await db.from('apt_colaboradores').update({turno_id:parseInt(turId)}).eq('cracha',c.cracha);
        if (error) throw error;
        this._fecharModal(); showToast('Turno atualizado!','ok'); this._carregarCadastro();
      }, 'Salvar');
  },

  _modalEscalaCad(e=null) {
    const edit=!!e;
    this._modal(edit?'Editar escala':'Nova escala', `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>${this._lbl('Nome')}<input id="ec-nome" class="apt-input" value="${e?.nome||''}" placeholder="EX: 5X1" oninput="this.value=this.value.toUpperCase()"></div>
        <div>${this._lbl('Tipo')}
          <select id="ec-tipo" class="apt-select">
            <option value="ROTATIVO" ${(!e||e.tipo_ciclo==='ROTATIVO')?'selected':''}>ROTATIVO</option>
            <option value="ADM" ${e?.tipo_ciclo==='ADM'?'selected':''}>ADM (folga sáb/dom)</option>
          </select>
        </div>
        <div id="ec-dias-wrap" style="${e?.tipo_ciclo==='ADM'?'display:none':''}">
          ${this._lbl('Dias trabalhados antes da folga')}
          <input id="ec-dias" type="number" class="apt-input" value="${e?.dias_trabalho||5}" min="1" max="9" style="width:100px">
        </div>
      </div>`,
      async () => {
        const nome=document.getElementById('ec-nome').value.trim(), tipo=document.getElementById('ec-tipo').value;
        const dias=parseInt(document.getElementById('ec-dias').value)||5;
        if (!nome) { showToast('Nome obrigatório.','erro'); return; }
        const db=getDB();
        const dados={nome,tipo_ciclo:tipo,hora_entrada:'00:00',hora_saida:'00:00',intervalo_min:0,dias_trabalho:tipo==='ROTATIVO'?dias:null,saida_sexta:null};
        const {error} = edit ? await db.from('apt_escalas').update(dados).eq('id',e.id) : await db.from('apt_escalas').insert(dados);
        if (error) throw error;
        this._fecharModal(); showToast('Escala salva!','ok'); this._carregarCadastro();
      }, 'Salvar');
    setTimeout(()=>{
      const tipo=document.getElementById('ec-tipo'), dw=document.getElementById('ec-dias-wrap');
      tipo.addEventListener('change',()=>{dw.style.display=tipo.value==='ADM'?'none':'block';});
    },50);
  },

  _modalTurnoCad(t=null) {
    const edit=!!t;
    this._modal(edit?'Editar turno':'Novo turno', `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>${this._lbl('Nome')}<input id="tc-nome" class="apt-input" value="${t?.nome||''}" placeholder="EX: TURNO A" oninput="this.value=this.value.toUpperCase()"></div>
        <div style="display:flex;gap:8px">
          <div style="flex:1">${this._lbl('Entrada')}<input id="tc-ent" type="time" class="apt-input" value="${t?.hora_entrada||'07:00'}"></div>
          <div style="flex:1">${this._lbl('Saída')}<input id="tc-sai" type="time" class="apt-input" value="${t?.hora_saida||'15:20'}"></div>
          <div style="flex:1">${this._lbl('Refeição (min)')}<input id="tc-int" type="number" class="apt-input" value="${t?.intervalo_min||60}" min="0"></div>
        </div>
        <div>${this._lbl('Saída sexta (opcional — ADM)')}
          <input id="tc-sex" type="time" class="apt-input" value="${t?.saida_sexta||''}">
        </div>
        <div id="tc-prev" style="font-size:11px;color:var(--green);background:var(--green-l);border-radius:var(--radius-sm);padding:7px 10px"></div>
      </div>`,
      async () => {
        const nome=document.getElementById('tc-nome').value.trim();
        if (!nome) { showToast('Nome obrigatório.','erro'); return; }
        const dados={nome,hora_entrada:document.getElementById('tc-ent').value,hora_saida:document.getElementById('tc-sai').value,intervalo_min:parseInt(document.getElementById('tc-int').value)||60,saida_sexta:document.getElementById('tc-sex').value||null};
        const db=getDB();
        const {error} = edit ? await db.from('apt_turnos').update(dados).eq('id',t.id) : await db.from('apt_turnos').insert(dados);
        if (error) throw error;
        this._fecharModal(); showToast('Turno salvo!','ok'); this._carregarCadastro();
      }, 'Salvar');
    setTimeout(()=>{
      const prev=document.getElementById('tc-prev');
      const up=()=>{
        const e=document.getElementById('tc-ent').value,sa=document.getElementById('tc-sai').value,i=parseInt(document.getElementById('tc-int').value)||60,sx=document.getElementById('tc-sex').value;
        if(!e||!sa) return;
        const hh=this._calcHH(e,sa,i);
        prev.textContent=`HH/dia: ${hh.toFixed(2)}h${sx?` · Sexta: ${this._calcHH(e,sx,i).toFixed(2)}h`:''}`;
      };
      ['tc-ent','tc-sai','tc-int','tc-sex'].forEach(id=>document.getElementById(id)?.addEventListener('input',up));
      up();
    },50);
  },

  _modalFerias(c) {
    this._modal('Lançar férias — '+c.nome.split(' ')[0], `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:8px">
          <div style="flex:1">${this._lbl('Início')}<input type="date" id="fer-ini" value="${this._hoje()}" class="apt-input"></div>
          <div style="flex:1">${this._lbl('Duração (dias)')}<input id="fer-dias" type="number" value="30" min="1" max="90" class="apt-input"></div>
        </div>
        <div>${this._lbl('Venda de dias?')}
          <select id="fer-venda" class="apt-select"><option value="0">Não</option><option value="10">Sim — 10 dias</option><option value="custom">Personalizado</option></select>
        </div>
        <div id="fer-vcw" style="display:none">${this._lbl('Dias a vender')}<input id="fer-vc" type="number" value="10" min="1" max="30" class="apt-input" style="width:100px"></div>
        <div id="fer-prev" style="font-size:11px;color:var(--green);background:var(--green-l);border-radius:var(--radius-sm);padding:6px 10px"></div>
      </div>`,
      async () => {
        const ini=document.getElementById('fer-ini').value, dias=parseInt(document.getElementById('fer-dias').value)||30;
        const vo=document.getElementById('fer-venda').value, vd=vo==='custom'?parseInt(document.getElementById('fer-vc').value)||0:parseInt(vo)||0;
        const db=getDB();
        const {error}=await db.from('apt_ferias').insert({chapa:c.cracha,nome:c.nome,data_inicio:ini,data_fim:this._addDays(ini,dias-1),dias_totais:dias,dias_vendidos:vd});
        if (error) throw error;
        this._fecharModal(); showToast('Férias registradas!','ok'); this._carregarCadastro();
      }, 'Salvar férias');
    setTimeout(()=>{
      const ini=document.getElementById('fer-ini'),dias=document.getElementById('fer-dias'),vend=document.getElementById('fer-venda'),vcw=document.getElementById('fer-vcw'),prev=document.getElementById('fer-prev');
      vend.addEventListener('change',()=>{vcw.style.display=vend.value==='custom'?'block':'none';upP();});
      ini.addEventListener('change',upP); dias.addEventListener('input',upP);
      const upP=()=>{const i=ini.value,d=parseInt(dias.value)||30;if(!i)return;prev.textContent=`${this._fmtFull(i)} até ${this._fmtFull(this._addDays(i,d-1))} (${d} dias)`;};
      upP();
    },50);
  },

  _modalEspecialidades() {
    const s = this._s;
    const lista = (specs) => specs.length===0
      ?`<tr><td colspan="3" style="padding:12px;text-align:center;color:#9ca3af">Nenhuma.</td></tr>`
      :specs.map(e=>`<tr style="border-bottom:1px solid #f9fafb"><td id="esp-c-${e.id}" style="padding:5px 8px;font-size:12px">${e.nome}</td>
          <td style="width:28px"><button class="apt-icon-btn esp-ed" data-id="${e.id}" data-nome="${e.nome}"><i class="ti ti-pencil"></i></button></td>
          <td style="width:28px"><button class="apt-icon-btn esp-del" data-id="${e.id}" style="color:var(--red)"><i class="ti ti-trash"></i></button></td>
        </tr>`).join('');
    this._modal('Gerenciar especialidades',`
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="overflow-y:auto;max-height:200px;border:1px solid var(--border);border-radius:var(--radius-sm)">
          <table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:5px 8px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.07em;color:#6b7280">Especialidade</th><th></th><th></th></tr></thead>
          <tbody id="esp-lista">${lista(s.especialidades)}</tbody></table>
        </div>
        <div style="display:flex;gap:8px">
          <input id="esp-nova" class="apt-input" placeholder="NOVA ESPECIALIDADE…" style="flex:1" oninput="this.value=this.value.toUpperCase()">
          <button id="esp-add" class="dd-action-btn primary" style="height:32px;padding:0 14px;font-family:var(--font)"><i class="ti ti-plus"></i></button>
        </div>
      </div>`);
    const bind = () => {
      document.getElementById('esp-add').onclick = async()=>{
        const n=document.getElementById('esp-nova').value.trim(); if(!n) return;
        const db=getDB(); await db.from('apt_especialidades').insert({nome:n});
        const {data}=await db.from('apt_especialidades').select('*').order('nome');
        s.especialidades=data||[];
        document.getElementById('esp-lista').innerHTML=lista(s.especialidades);
        document.getElementById('esp-nova').value=''; bind();
      };
      document.querySelectorAll('.esp-ed').forEach(btn=>btn.addEventListener('click',()=>{
        const id=btn.dataset.id,cel=document.getElementById(`esp-c-${id}`);
        cel.innerHTML=`<input id="esp-ei-${id}" class="apt-input" style="height:26px;font-size:11px" value="${btn.dataset.nome}" oninput="this.value=this.value.toUpperCase()">`;
        btn.innerHTML='<i class="ti ti-check"></i>';
        btn.onclick=async()=>{
          const nn=document.getElementById(`esp-ei-${id}`).value.trim(); if(!nn) return;
          const db=getDB(); await db.from('apt_especialidades').update({nome:nn}).eq('id',id);
          const {data}=await db.from('apt_especialidades').select('*').order('nome');
          s.especialidades=data||[]; document.getElementById('esp-lista').innerHTML=lista(s.especialidades); bind();
        };
      }));
      document.querySelectorAll('.esp-del').forEach(btn=>btn.addEventListener('click',async()=>{
        if(!confirm('Remover?')) return;
        const db=getDB(); await db.from('apt_especialidades').delete().eq('id',btn.dataset.id);
        s.especialidades=s.especialidades.filter(e=>String(e.id)!==btn.dataset.id);
        document.getElementById('esp-lista').innerHTML=lista(s.especialidades); bind();
      }));
    };
    setTimeout(bind,50);
  },

  async _importarBase() {
    try {
      const db = getDB();
      const {data:apts} = await db.from('apontamentos').select('chapa,nome').order('nome');
      const mapa = {};
      (apts||[]).forEach(a=>{if(a.chapa&&!mapa[a.chapa]) mapa[a.chapa]=a.nome;});
      const novos = Object.entries(mapa).filter(([ch])=>!this._s.colaboradores.find(c=>String(c.cracha)===String(ch)));
      if (!novos.length) { showToast('Todos os colaboradores já estão cadastrados.','info'); return; }
      if (!confirm(`Importar ${novos.length} colaboradores novos?`)) return;
      const {error} = await db.from('apt_colaboradores').insert(novos.map(([ch,nome])=>({cracha:ch,nome})));
      if (error) throw error;
      showToast(`${novos.length} importados. Configure modalidade, escala e turno.`,'ok');
      await this._carregarCadastro();
    } catch(e) { showToast('Erro: '+e.message,'erro'); }
  },

  /* ══════════════════════════════════════════════
     MODAL GENÉRICO
     ══════════════════════════════════════════════ */
  _lbl(txt) { return `<label style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">${txt}</label>`; },

  _modal(titulo, html, onOk=null, btnLabel='Confirmar') {
    this._fecharModal();
    const ov = document.createElement('div'); ov.id='apt-modal-ov';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML=`
      <div style="background:var(--card-bg);border-radius:var(--radius);padding:24px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:var(--shadow-md);font-family:var(--font)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <div style="font-size:14px;font-weight:700;color:#111">${titulo}</div>
          <button id="apt-modal-x" class="apt-icon-btn"><i class="ti ti-x"></i></button>
        </div>
        <div>${html}</div>
        ${onOk?`<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:14px;border-top:1px solid var(--border)">
          <button id="apt-modal-cancel" class="dd-action-btn secondary" style="height:30px;padding:0 14px;font-family:var(--font)">Cancelar</button>
          <button id="apt-modal-ok" class="dd-action-btn primary" style="height:30px;padding:0 16px;font-family:var(--font)">${btnLabel}</button>
        </div>`:''}
      </div>`;
    document.body.appendChild(ov);
    document.getElementById('apt-modal-x').onclick = () => this._fecharModal();
    document.getElementById('apt-modal-cancel')?.addEventListener('click', () => this._fecharModal());
    document.getElementById('apt-modal-ok')?.addEventListener('click', async () => {
      try { await onOk(); } catch(e) { showToast('Erro: '+e.message,'erro'); console.error(e); }
    });
    ov.addEventListener('click', e => { if(e.target===ov) this._fecharModal(); });
  },

  _fecharModal() { document.getElementById('apt-modal-ov')?.remove(); },
};
