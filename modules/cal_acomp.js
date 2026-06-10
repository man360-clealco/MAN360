/* ═══════════════════════════════════════════════════════
   MAN360 — Módulo: CAL Acomp
   Acompanhamento semanal de OS por equipe — Caldeiraria
   Padrão: window.Modulos.cal_acomp · usa getDB()
   ═══════════════════════════════════════════════════════ */
'use strict';
window.Modulos = window.Modulos || {};

window.Modulos.cal_acomp = {

  /* ══════════════════════════════════════════════
     ESTADO
     ══════════════════════════════════════════════ */
  _s: {
    semana: 0, ano: 0,
    dataIni: '', dataFim: '',
    modoLeitura: false,
    equipes: [], membros: {}, fila: {},
    colaboradores: [], escalas: [], turnos: [],
    programacao: [], // programacao_semanal da semana
    filaAberta: null, // equipe_id com fila expandida
    listaAberta: false,
    SEM_ANCORA: 9, DATA_ANCORA: '2026-05-25',
  },

  /* ══════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════ */
  async init(container) {
    const s = this._s;
    s.semana = this._semAtual();
    s.ano    = new Date().getFullYear();
    this._recalcPeriodo();

    container.innerHTML = this._tplRaiz();
    await this._carregarBase();
    await this._carregar();
  },

  /* ══════════════════════════════════════════════
     TEMPLATE RAIZ
     ══════════════════════════════════════════════ */
  _tplRaiz() {
    return `
    <style>
      /* ── Navegação ── */
      .ca-nav{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}
      .ca-nav-btn{height:30px;padding:0 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);cursor:pointer;font-family:var(--font);font-size:11px;font-weight:600;color:#374151;display:inline-flex;align-items:center;gap:5px;transition:background .15s}
      .ca-nav-btn:hover{background:var(--bg)}
      .ca-nav-btn.atual{background:var(--yellow);color:#000;border-color:var(--yellow)}
      .ca-leitura-badge{font-size:10px;font-weight:700;background:#e5e7eb;color:#6b7280;padding:3px 10px;border-radius:10px;letter-spacing:.05em}
      /* ── KPI cards ── */
      .ca-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
      .ca-kpi{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px}
      .ca-kpi-lbl{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-bottom:6px}
      .ca-kpi-val{font-size:22px;font-weight:800;line-height:1;margin-bottom:6px}
      .ca-kpi-bar{height:5px;border-radius:3px;background:#e5e7eb;overflow:hidden;margin-bottom:4px}
      .ca-kpi-bar-fill{height:100%;border-radius:3px;transition:width .4s}
      .ca-kpi-sub{font-size:10px;color:#9ca3af}
      .ca-kpi-cob{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px 16px;display:flex;align-items:center;gap:12px;grid-column:1/-1}
      /* ── Em andamento ── */
      .ca-andamento{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;margin-bottom:12px}
      .ca-and-row{display:flex;align-items:center;gap:10px;padding:5px 0;font-size:12px;border-bottom:1px solid #f3f4f6}
      .ca-and-row:last-child{border-bottom:none}
      /* ── Boards ── */
      .ca-boards-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
      .ca-boards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
      .ca-board{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:border-color .15s}
      .ca-board:hover{border-color:#d1d5db}
      .ca-board-hdr{padding:12px 14px;cursor:pointer;user-select:none}
      .ca-board-nome{font-size:13px;font-weight:700;color:#111;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between}
      .ca-board-membros{font-size:11px;color:#6b7280;margin-bottom:8px}
      .ca-board-meta{display:flex;align-items:center;gap:10px}
      .ca-board-hh{font-size:11px;font-weight:700}
      .ca-board-bar{flex:1;height:5px;border-radius:3px;background:#e5e7eb;overflow:hidden}
      .ca-board-bar-fill{height:100%;border-radius:3px;transition:width .4s}
      .ca-board-conclusao{font-size:10px;color:#6b7280;margin-top:5px}
      /* ── Fila ── */
      .ca-fila{border-top:1px solid var(--border);background:#fafafa}
      .ca-fila-hdr{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--border)}
      .ca-os-row{display:flex;align-items:flex-start;gap:8px;padding:10px 14px;border-bottom:1px solid #f3f4f6;transition:background .1s}
      .ca-os-row:last-child{border-bottom:none}
      .ca-os-row:hover{background:#f9fafb}
      .ca-os-num{font-size:12px;font-weight:700;color:#111;white-space:nowrap}
      .ca-os-desc{font-size:11px;color:#374151;margin-top:1px}
      .ca-os-info{font-size:10px;color:#6b7280;margin-top:2px}
      .ca-badge{font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;display:inline-block;margin-right:3px}
      .ca-badge-prg{background:#dbeafe;color:#1d4ed8}
      .ca-badge-rpg{background:#fef3c7;color:#92400e}
      .ca-badge-npg{background:#f3f4f6;color:#6b7280}
      .ca-badge-mcu{background:#fee2e2;color:#991b1b}
      .ca-badge-exe{background:#dcfce7;color:#166534}
      .ca-badge-pau{background:#fef3c7;color:#b45309}
      .ca-badge-int{background:#f3f4f6;color:#6b7280}
      .ca-badge-enc{background:#e5e7eb;color:#374151}
      .ca-os-acoes{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}
      .ca-btn{height:24px;padding:0 8px;font-size:10px;font-weight:600;border-radius:4px;cursor:pointer;border:1px solid var(--border);background:var(--card-bg);font-family:var(--font);color:#374151;display:inline-flex;align-items:center;gap:3px;transition:background .1s}
      .ca-btn:hover{background:var(--bg)}
      .ca-btn-green{background:#dcfce7;border-color:#86efac;color:#166534}
      .ca-btn-green:hover{background:#bbf7d0}
      .ca-btn-red{background:#fee2e2;border-color:#fca5a5;color:#991b1b}
      .ca-btn-red:hover{background:#fecaca}
      .ca-btn-yellow{background:#fef3c7;border-color:#fde68a;color:#92400e}
      .ca-btn-yellow:hover{background:#fde68a}
      .ca-reorder{display:flex;flex-direction:column;gap:1px;flex-shrink:0;padding-top:2px}
      .ca-arr{height:16px;width:16px;border:1px solid var(--border);border-radius:2px;background:var(--card-bg);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:9px;color:#9ca3af}
      .ca-arr:hover{background:var(--bg);color:#374151}
      .ca-arr:disabled{opacity:.3;cursor:default}
      /* ── Painéis de grupo ── */
      .ca-grupo{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:10px;overflow:hidden}
      .ca-grupo-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;background:#f9fafb;border-bottom:1px solid transparent}
      .ca-grupo-hdr.open{border-bottom-color:var(--border)}
      .ca-grupo-titulo{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#4b5563;display:flex;align-items:center;gap:8px}
      /* ── Lista geral ── */
      .ca-lista-row{display:grid;grid-template-columns:100px 1fr 120px 50px 70px 70px;gap:6px;align-items:center;padding:6px 14px;border-bottom:1px solid #f3f4f6;font-size:11px}
      .ca-lista-row:last-child{border-bottom:none}
      .ca-lista-hdr{font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;background:#f9fafb;border-bottom:1px solid var(--border)}
      /* ── Pontos de atenção ── */
      .ca-attn{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:12px}
      .ca-attn-row{display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #f9fafb;font-size:11px}
      .ca-attn-row:last-child{border-bottom:none}
      /* ── Leitura ── */
      .ca-leitura *{pointer-events:none;opacity:.7}
      .ca-leitura .ca-nav-btn,.ca-leitura .ca-nav-btn *{pointer-events:auto;opacity:1}
      /* ── Misc ── */
      .ca-icon-btn{height:26px;width:26px;padding:0;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:#6b7280;font-size:13px}
      .ca-icon-btn:hover{background:var(--bg)}
      .ca-input{width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 10px;font-family:var(--font);font-size:12px;outline:none}
      .ca-input:focus{border-color:var(--yellow)}
      .ca-select{width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--card-bg);padding:0 8px;font-family:var(--font);font-size:12px;outline:none;cursor:pointer}
      .ca-lbl{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px}
      .ca-field{display:flex;flex-direction:column;gap:4px;flex:1;min-width:90px}
      .ca-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .ca-sep{height:1px;background:var(--border);margin:16px 0}
      @media(max-width:768px){.ca-kpis{grid-template-columns:1fr 1fr}.ca-boards{grid-template-columns:1fr}.ca-lista-row{grid-template-columns:80px 1fr 90px 40px 60px 60px}}
    </style>
    <div id="ca-root"></div>`;
  },

  /* ══════════════════════════════════════════════
     HELPERS DE DATA (mesmo padrão apontamentos.js)
     ══════════════════════════════════════════════ */
  _addDays(iso, n) { const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); },
  _hoje()    { return new Date().toISOString().slice(0,10); },
  _fmtDM(iso){ if(!iso)return'—'; const[,m,d]=iso.split('-'); return `${d}/${m}`; },
  _fmtDMH(iso){ if(!iso)return'—'; const dt=iso.includes('T')?iso:iso+'T00:00:00'; const d=new Date(dt); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; },
  // Converte datetime do banco (pode ser UTC) para "YYYY-MM-DDTHH:MM" local — usado em _somarHH
  _dtBancoToLocal(iso){
    if(!iso) return null;
    const d=new Date(iso.includes('T')?iso:iso+'T00:00:00');
    const y=d.getFullYear(), mo=String(d.getMonth()+1).padStart(2,'0');
    const dd=String(d.getDate()).padStart(2,'0');
    const hh=String(d.getHours()).padStart(2,'0'), mm=String(d.getMinutes()).padStart(2,'0');
    return `${y}-${mo}-${dd}T${hh}:${mm}`;
  },
  _diaSem(iso){ return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(iso+'T00:00:00').getDay()]; },
  _diaSemN(iso){ return new Date(iso+'T00:00:00').getDay(); },
  _semParaDatas(s){ const i=this._addDays(this._s.DATA_ANCORA,(s-this._s.SEM_ANCORA)*7); return {ini:i,fim:this._addDays(i,6)}; },
  _semAtual(){
    const ms0=new Date(this._s.DATA_ANCORA+'T00:00:00').getTime();
    const ms1=new Date(this._hoje()+'T00:00:00').getTime();
    return this._s.SEM_ANCORA+Math.floor((ms1-ms0)/604800000);
  },
  _recalcPeriodo(){
    const {ini,fim}=this._semParaDatas(this._s.semana);
    this._s.dataIni=ini; this._s.dataFim=fim;
    this._s.modoLeitura = this._s.semana < this._semAtual();
  },

  /* ══════════════════════════════════════════════
     HELPERS HH / FOLGAS (portado do apontamentos.js)
     ══════════════════════════════════════════════ */
  _calcHH(entrada,saida,intervalo){
    if(!entrada||!saida) return 8;
    const[eh,em]=entrada.split(':').map(Number);
    const[sh,sm]=saida.split(':').map(Number);
    let mins=(sh*60+sm)-(eh*60+em);
    if(mins<=0) mins+=1440;
    return Math.round((mins-(intervalo||0))/60*100)/100;
  },
  _hhTurno(turno,iso){
    if(!turno) return 8;
    if(turno.nome==='ADM'){
      const dw=this._diaSemN(iso);
      if(dw===0||dw===6) return 0;
      if(dw===5&&turno.saida_sexta) return this._calcHH(turno.hora_entrada,turno.saida_sexta,turno.intervalo_min);
      return this._calcHH(turno.hora_entrada,turno.hora_saida,turno.intervalo_min);
    }
    return this._calcHH(turno.hora_entrada,turno.hora_saida,turno.intervalo_min);
  },
  _gerarFolgas(escala,turno,pf,dataIni,dataFim){
    if(!escala) return new Set();
    if(escala.tipo_ciclo==='ADM'||turno?.nome==='ADM'){
      const s=new Set(); let c=dataIni;
      while(c<=dataFim){const dw=this._diaSemN(c);if(dw===0||dw===6)s.add(c);c=this._addDays(c,1);}
      return s;
    }
    const ancora=pf; if(!ancora) return new Set();
    const ciclo=(escala.dias_trabalho||5)+1;
    const s=new Set();
    let cur=ancora;
    while(cur<=dataFim){s.add(cur);cur=this._addDays(cur,ciclo);}
    cur=this._addDays(ancora,-ciclo);
    while(cur>=dataIni){s.add(cur);cur=this._addDays(cur,-ciclo);}
    return s;
  },
  _turnoDe(c)  { return this._s.turnos.find(t=>t.id===c.turno_id)||null; },
  _escalaDe(c) { return this._s.escalas.find(e=>e.id===c.escala_id)||null; },

  /* ── Converte datetime-local para ISO com offset local (evita conversão UTC) ── */
  _dtLocal(dtStr){
    // dtStr = "YYYY-MM-DDTHH:MM" do input datetime-local
    if(!dtStr) return null;
    const d = new Date(dtStr); // interpreta como local
    const off = -d.getTimezoneOffset(); // minutos
    const sign = off>=0?'+':'-';
    const hh = String(Math.floor(Math.abs(off)/60)).padStart(2,'0');
    const mm = String(Math.abs(off)%60).padStart(2,'0');
    return dtStr+':00'+sign+hh+':'+mm;
  },

  /* ── HH disponível de um colaborador na semana ── */
  _hhDispSemana(colab){
    const turno  = this._turnoDe(colab);
    const escala = this._escalaDe(colab);
    const ini    = this._addDays(this._s.dataIni,-30);
    const fim    = this._addDays(this._s.dataFim, 30);
    const folgas = this._gerarFolgas(escala,turno,colab.primeira_folga,ini,fim);
    let hh=0;
    let d=this._s.dataIni;
    while(d<=this._s.dataFim){
      if(!folgas.has(d)) hh+=this._hhTurno(turno,d);
      d=this._addDays(d,1);
    }
    return hh;
  },

  /* ── HH disponível de uma equipe na semana ── */
  _hhDispEquipe(equipeId){
    const mems=this._s.membros[equipeId]||[];
    return mems.reduce((acc,m)=>acc+this._hhDispSemana(m),0);
  },

  /* ── HH alocado na fila de uma equipe ── */
  _hhAlocadoEquipe(equipeId){
    const fila=this._s.fila[equipeId]||[];
    return fila.filter(f=>f.status!=='interrompido').reduce((acc,f)=>acc+(parseFloat(f._os?.hh_prev_servico)||0),0);
  },

  /* ── Projeção de data fim da fila (usa mesmo _somarHH da fila) ── */
  _projetarFila(equipeId){
    const fila=(this._s.fila[equipeId]||[])
      .filter(f=>f.status!=='interrompido'&&f.status!=='encerrado')
      .sort((a,b)=>a.posicao-b.posicao);
    const mems=this._s.membros[equipeId]||[];
    if(!fila.length||!mems.length) return null;

    // Se as previsões já foram calculadas pelo _tplFila, usa o _dtFimPrev da última
    const ultima=fila[fila.length-1];
    if(ultima._dtFimPrev) return ultima._dtFimPrev.slice(0,10);

    // Fallback: calcular sequencialmente
    const hoje=this._hoje();
    let cursor=hoje+'T'+(new Date().toTimeString().slice(0,5))+':00';
    for(const f of fila){
      const hh=parseFloat(f._os?.hh_prev_servico||0);
      if(!hh) continue;
      if(f.status==='em_execucao'&&f.dt_inicio_real) cursor=this._dtBancoToLocal(f.dt_inicio_real);
      const dtFim=this._somarHH(cursor,hh,mems);
      if(dtFim) cursor=dtFim;
    }
    return cursor?cursor.slice(0,10):null;
  },

  /* ══════════════════════════════════════════════
     BADGES
     ══════════════════════════════════════════════ */
  _badgeTipo(item){
    if(item._os?.tipo_atividade==='MANUTENÇÃO CORRETIVA DE URGÊNCIA')
      return `<span class="ca-badge ca-badge-mcu">MCU</span>`;
    // Reprogramado: semana_ref < semana atual selecionada
    if(item.semana_ref < this._s.semana)
      return `<span class="ca-badge ca-badge-rpg">RPG</span>`;
    // Programado: está em programacao_semanal desta semana
    const prog=this._s.programacao.find(p=>p.os===item.os&&p.cod_servico===item.cod_servico);
    if(prog) return `<span class="ca-badge ca-badge-prg">PRG</span>`;
    return `<span class="ca-badge ca-badge-npg">NPG</span>`;
  },
  _badgeStatus(status){
    const m={em_execucao:'ca-badge-exe',pausado:'ca-badge-pau',interrompido:'ca-badge-int',encerrado:'ca-badge-enc'};
    const l={em_execucao:'EM EXEC',pausado:'PAUSADO',interrompido:'INTERR.',encerrado:'ENCERRADO',pendente:''};
    if(status==='pendente') return '';
    return `<span class="ca-badge ${m[status]||''}">${l[status]||status}</span>`;
  },

  /* ══════════════════════════════════════════════
     CARREGAR BASE
     ══════════════════════════════════════════════ */
  async _carregarBase(){
    try{
      const db=getDB();
      const [r1,r2,r3]=await Promise.all([
        db.from('apt_colaboradores').select('*').eq('modalidade','CAL').order('nome'),
        db.from('apt_escalas').select('*').order('nome'),
        db.from('apt_turnos').select('*').order('nome'),
      ]);
      this._s.colaboradores=r1.data||[];
      this._s.escalas      =r2.data||[];
      this._s.turnos       =r3.data||[];
    }catch(e){console.error('[cal_acomp] carregarBase:',e);}
  },

  /* ══════════════════════════════════════════════
     CARREGAR TUDO DA SEMANA
     ══════════════════════════════════════════════ */
  async _carregar(){
    const root=document.getElementById('ca-root');
    if(!root) return;
    root.innerHTML=`<div style="padding:40px;text-align:center;color:#9ca3af"><i class="ti ti-loader-2" style="font-size:24px;animation:spin 1s linear infinite"></i><p style="margin-top:8px;font-size:12px">Carregando…</p></div>`;

    try{
      const db=getDB();
      const s=this._s;

      const [rEq,rProg]=await Promise.all([
        db.from('cal_equipes').select('*').eq('ativo',true).order('nome'),
        db.from('programacao_semanal').select('*').eq('semana',s.semana).eq('ano',s.ano),
      ]);
      s.equipes    =rEq.data||[];
      const progTodas=rProg.data||[];

      // Filtrar programação apenas para OS de modalidade CAL
      if(progTodas.length){
        const osNumsProg=[...new Set(progTodas.map(p=>p.os))];
        const {data:osModalidade}=await db.from('ordens_servico')
          .select('os,modalidade,equipe').in('os',osNumsProg.slice(0,500));
        const osCAL=new Set((osModalidade||[]).filter(o=>
          o.modalidade==='CAL'||(o.modalidade===null&&o.equipe&&o.equipe.toUpperCase().includes('CAL'))
        ).map(o=>o.os));
        // OS na programação que não estão em ordens_servico (avulsas) — incluir também
        const osNaoEncontradas=new Set(osNumsProg.filter(os=>!(osModalidade||[]).find(o=>o.os===os)));
        s.programacao=progTodas.filter(p=>osCAL.has(p.os)||osNaoEncontradas.has(p.os));
      } else {
        s.programacao=[];
      }

      // Membros enriquecidos
      s.membros={};
        if(s.equipes.length){
        const eqIds=s.equipes.map(e=>e.id);
        const {data:mems}=await db.from('cal_equipe_membros').select('*').in('equipe_id',eqIds);
        (mems||[]).forEach(m=>{
          if(!s.membros[m.equipe_id]) s.membros[m.equipe_id]=[];
          const colab=s.colaboradores.find(c=>String(c.cracha)===String(m.chapa));
          if(colab) s.membros[m.equipe_id].push({...colab,_mem:m});
        });
      }

      // Fila com OS enriquecida
      s.fila={};
      if(s.equipes.length){
        const eqIds=s.equipes.map(e=>e.id);
        const {data:filaRows}=await db.from('cal_fila').select('*').in('equipe_id',eqIds).order('posicao');
        if(filaRows?.length){
          const osKeys=[...new Set(filaRows.map(f=>f.os))];
          const {data:osRows}=await db.from('ordens_servico').select('os,cod_servico,desc_servico,desc_os,hh_prev_servico,tipo_atividade,status_os,equipamento,desc_equipamento').in('os',osKeys);
          const osMap={};
          (osRows||[]).forEach(o=>{ osMap[o.os+'|'+o.cod_servico]=o; });
          filaRows.forEach(f=>{
            if(!s.fila[f.equipe_id]) s.fila[f.equipe_id]=[];
            f._os=osMap[f.os+'|'+f.cod_servico]||osMap[f.os+'|1']||osMap[f.os+'|null']||null;
            // Fallback: usar dados da programacao_semanal se não tem dados em ordens_servico
            if(!f._os){
              const prog=s.programacao.find(p=>p.os===f.os&&(p.cod_servico||'1')===(f.cod_servico||'1'));
              if(prog) f._os={os:f.os,cod_servico:f.cod_servico,desc_servico:prog.desc_servico,hh_prev_servico:prog.hh_previsto};
            }
            s.fila[f.equipe_id].push(f);
          });
        }
      }

      this._render();
    }catch(e){
      console.error('[cal_acomp] _carregar:',e);
      document.getElementById('ca-root').innerHTML=`<div style="padding:20px;color:var(--red);font-size:12px"><i class="ti ti-alert-circle"></i> ${e.message}</div>`;
    }
  },

  /* ══════════════════════════════════════════════
     RENDER PRINCIPAL
     ══════════════════════════════════════════════ */
  _render(){
    const root=document.getElementById('ca-root');
    if(!root) return;
    const s=this._s;
    const semAtual=this._semAtual();
    const {ini,fim}=this._semParaDatas(s.semana);

    const navHtml=`
      <div class="ca-nav">
        <button class="ca-nav-btn" id="ca-prev"><i class="ti ti-chevron-left"></i> Sem ${s.semana-1}</button>
        <button class="ca-nav-btn ${s.semana===semAtual?'atual':''}" id="ca-hoje">
          Sem ${s.semana} · ${this._fmtDM(ini)}–${this._fmtDM(fim)} ${s.semana===semAtual?'★':''}
        </button>
        <button class="ca-nav-btn" id="ca-next">Sem ${s.semana+1} <i class="ti ti-chevron-right"></i></button>
        ${s.modoLeitura?'<span class="ca-leitura-badge"><i class="ti ti-lock" style="font-size:10px"></i> LEITURA</span>':''}
      </div>`;

    root.innerHTML = navHtml +
      `<div id="ca-kpis-wrap"></div>` +
      `<div id="ca-andamento-wrap"></div>` +
      `<div id="ca-boards-wrap"></div>` +
      `<div id="ca-pontos-wrap"></div>` +
      `<div id="ca-interrompidos-wrap"></div>` +
      `<div id="ca-encerrados-wrap"></div>` +
      `<div id="ca-lista-wrap"></div>`;

    // Bind navegação
    document.getElementById('ca-prev').onclick=()=>this._navSem(-1);
    document.getElementById('ca-next').onclick=()=>this._navSem(+1);
    document.getElementById('ca-hoje').onclick=()=>{ s.semana=semAtual; this._recalcPeriodo(); this._carregar(); };

    this._renderKpis();
    this._renderAndamento();
    this._renderBoards();
    this._renderPontos();
    this._renderGrupoInterrompidos();
    this._renderGrupoEncerrados();
    this._renderListaGeral();

    if(s.modoLeitura){
      document.getElementById('ca-boards-wrap').classList.add('ca-leitura');
    }
  },

  _navSem(delta){
    this._s.semana+=delta;
    this._recalcPeriodo();
    this._s.filaAberta=null;
    this._carregar();
  },

  /* ══════════════════════════════════════════════
     KPIs
     ══════════════════════════════════════════════ */
  _renderKpis(){
    const el=document.getElementById('ca-kpis-wrap'); if(!el) return;
    const s=this._s;

    // Programação CAL da semana (base dos KPIs de aderência)
    const progCAL=s.programacao.filter(p=>!p.modalidade||p.modalidade==='CAL'||
      // fallback: se não tem modalidade na prog, cruza com ordens_servico via OS já carregadas
      Object.values(s.fila).flat().find(f=>f.os===p.os));
    const hhProg=progCAL.reduce((a,p)=>a+(parseFloat(p.hh_previsto)||0),0);

    // OS do board que estão na programação CAL
    const todasOS=Object.values(s.fila).flat().filter(f=>f.status!=='interrompido');
    const osProg=todasOS.filter(f=>progCAL.find(p=>p.os===f.os&&(p.cod_servico||'1')===(f.cod_servico||'1')));

    // Aderência atual: HH encerrado de OS programadas / HH programado total
    const hhEncProg=osProg.filter(f=>f.status==='encerrado').reduce((a,f)=>a+(parseFloat(f._os?.hh_prev_servico)||0),0);
    const aderAtual=hhProg>0?hhEncProg/hhProg:null;

    // Aderência projetada: HH (encerrado + em execução com fim até domingo) / HH programado
    const domingo=s.dataFim;
    const hhProjProg=osProg.filter(f=>{
      if(f.status==='encerrado') return true;
      if(f.status==='em_execucao'){
        // Incluir se fim previsto <= domingo
        return !f._dtFimPrev||(f._dtFimPrev.slice(0,10)<=domingo);
      }
      return false;
    }).reduce((a,f)=>a+(parseFloat(f._os?.hh_prev_servico)||0),0);
    const aderProj=hhProg>0?hhProjProg/hhProg:null;

    // % HH MCU sobre toda a fila
    const hhTotal=todasOS.reduce((a,f)=>a+(parseFloat(f._os?.hh_prev_servico)||0),0);
    const hhMCU=todasOS.filter(f=>f._os?.tipo_atividade==='MANUTENÇÃO CORRETIVA DE URGÊNCIA').reduce((a,f)=>a+(parseFloat(f._os?.hh_prev_servico)||0),0);
    const pctMCU=hhTotal>0?hhMCU/hhTotal:null;

    // % HH Reprogramado
    const hhRpg=todasOS.filter(f=>f.semana_ref<s.semana).reduce((a,f)=>a+(parseFloat(f._os?.hh_prev_servico)||0),0);
    const pctRpg=hhTotal>0?hhRpg/hhTotal:null;

    // Cobertura: OS da programação CAL que já estão no board
    const totalProg=progCAL.length;
    const alocadas=progCAL.filter(p=>todasOS.find(f=>f.os===p.os&&(f.cod_servico||'1')===(p.cod_servico||'1'))).length;
    const pctCob=totalProg>0?alocadas/totalProg:null;

    const _pct=(v)=>v===null?'—':Math.round(v*100)+'%';
    const _cor=(v,inv=false)=>{
      if(v===null) return '#9ca3af';
      const p=v*100;
      if(!inv) return p>=70?'var(--green)':p>=40?'var(--amber)':'var(--red)';
      return p<=20?'var(--green)':p<=40?'var(--amber)':'var(--red)';
    };
    const _bar=(v,inv=false)=>{
      if(v===null) return '';
      const p=Math.min(100,Math.round(v*100));
      const cor=_cor(v,inv);
      return `<div class="ca-kpi-bar"><div class="ca-kpi-bar-fill" style="width:${p}%;background:${cor}"></div></div>`;
    };

    el.innerHTML=`
      <div class="ca-kpis">
        <div class="ca-kpi">
          <div class="ca-kpi-lbl">Aderência Atual</div>
          <div class="ca-kpi-val" style="color:${_cor(aderAtual)}">${_pct(aderAtual)}</div>
          ${_bar(aderAtual)}
          <div class="ca-kpi-sub">${hhEncProg.toFixed(1)}h enc. / ${hhProg.toFixed(1)}h prog.</div>
        </div>
        <div class="ca-kpi">
          <div class="ca-kpi-lbl">Aderência Projetada</div>
          <div class="ca-kpi-val" style="color:${_cor(aderProj)}">${_pct(aderProj)}</div>
          ${_bar(aderProj)}
          <div class="ca-kpi-sub">Inclui em execução</div>
        </div>
        <div class="ca-kpi">
          <div class="ca-kpi-lbl">% HH MCU</div>
          <div class="ca-kpi-val" style="color:${_cor(pctMCU,true)}">${_pct(pctMCU)}</div>
          ${_bar(pctMCU,true)}
          <div class="ca-kpi-sub">${hhMCU.toFixed(1)}h corretivas urgentes</div>
        </div>
        <div class="ca-kpi">
          <div class="ca-kpi-lbl">% HH Reprogramado</div>
          <div class="ca-kpi-val" style="color:${_cor(pctRpg,true)}">${_pct(pctRpg)}</div>
          ${_bar(pctRpg,true)}
          <div class="ca-kpi-sub">${hhRpg.toFixed(1)}h de semanas anteriores</div>
        </div>
        ${pctCob!==null?`
        <div class="ca-kpi-cob">
          <i class="ti ti-clipboard-list" style="font-size:16px;color:#6b7280;flex-shrink:0"></i>
          <div style="flex:1">
            <span style="font-size:11px;font-weight:700;color:#374151">Cobertura da programação</span>
            <div class="ca-kpi-bar" style="margin-top:4px"><div class="ca-kpi-bar-fill" style="width:${Math.round((pctCob||0)*100)}%;background:var(--yellow)"></div></div>
          </div>
          <div style="font-size:13px;font-weight:800;color:var(--yellow);white-space:nowrap">${alocadas} / ${totalProg} OS</div>
        </div>`:''}
      </div>`;
  },

  /* ══════════════════════════════════════════════
     EM ANDAMENTO AGORA
     ══════════════════════════════════════════════ */
  _renderAndamento(){
    const el=document.getElementById('ca-andamento-wrap'); if(!el) return;
    const s=this._s;
    const linhas=[];

    s.equipes.forEach(eq=>{
      const fila=(s.fila[eq.id]||[]).filter(f=>f.status!=='interrompido'&&f.status!=='encerrado').sort((a,b)=>a.posicao-b.posicao);
      const exec=fila.find(f=>f.status==='em_execucao');
      if(!exec) return;
      const prox=fila.find(f=>f.status==='pendente'||f.status==='pausado');
      linhas.push(`
        <div class="ca-and-row">
          <span style="font-size:11px;font-weight:700;color:#374151;min-width:100px">${eq.nome}</span>
          <span style="font-size:11px"><i class="ti ti-player-play" style="color:var(--green);font-size:10px"></i> <strong>${exec.os}</strong> — ${exec._os?.desc_servico||exec._os?.desc_os||'—'}</span>
          ${prox?`<span style="font-size:10px;color:#6b7280;margin-left:auto;white-space:nowrap">Próxima: <strong>${prox.os}</strong></span>`:''}
        </div>`);
    });

    if(!linhas.length){ el.innerHTML=''; return; }
    el.innerHTML=`
      <div class="ca-andamento" style="margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-bottom:8px"><i class="ti ti-activity" style="color:var(--green)"></i> Em andamento agora</div>
        ${linhas.join('')}
      </div>`;
  },

  /* ══════════════════════════════════════════════
     BOARDS DE EQUIPE
     ══════════════════════════════════════════════ */
  _renderBoards(){
    const el=document.getElementById('ca-boards-wrap'); if(!el) return;
    const s=this._s;

    const cardsHtml=s.equipes.map(eq=>{
      const mems=s.membros[eq.id]||[];
      const hhDisp=this._hhDispEquipe(eq.id);
      const hhAloc=this._hhAlocadoEquipe(eq.id);
      const pct=hhDisp>0?Math.min(1,hhAloc/hhDisp):0;
      const corHH=pct>=1?'var(--red)':pct>=0.8?'var(--amber)':'var(--green)';
      const dfim=this._projetarFila(eq.id);
      const aberta=s.filaAberta===eq.id;

      const nomesStr=mems.map(m=>(m.nome||'').split(' ')[0]).join(', ')||'Sem membros';
      const filaEq=(s.fila[eq.id]||[]).filter(f=>f.status!=='interrompido'&&f.status!=='encerrado').sort((a,b)=>a.posicao-b.posicao);

      return `
        <div class="ca-board" id="ca-board-${eq.id}">
          <div class="ca-board-hdr" data-eq="${eq.id}">
            <div class="ca-board-nome">
              <span>${eq.nome}</span>
              <div style="display:flex;gap:4px">
                ${!s.modoLeitura?`<button class="ca-icon-btn ca-cfg-eq" data-eq="${eq.id}" title="Configurar equipe"><i class="ti ti-settings"></i></button>`:''}
                <button class="ca-icon-btn ca-toggle-fila" data-eq="${eq.id}"><i class="ti ti-chevron-${aberta?'up':'down'}"></i></button>
              </div>
            </div>
            <div class="ca-board-membros">${nomesStr}</div>
            <div class="ca-board-meta">
              <span class="ca-board-hh" style="color:${corHH}">${hhAloc.toFixed(1)}h / ${hhDisp.toFixed(1)}h</span>
              <div class="ca-board-bar"><div class="ca-board-bar-fill" style="width:${Math.round(pct*100)}%;background:${corHH}"></div></div>
            </div>
            ${dfim?`<div class="ca-board-conclusao"><i class="ti ti-calendar-due" style="font-size:10px"></i> Conclusão prevista: ${this._diaSem(dfim)} ${this._fmtDM(dfim)}</div>`:''}
          </div>
          ${aberta?this._tplFila(eq,filaEq):''}
        </div>`;
    }).join('');

    el.innerHTML=`
      <div class="ca-boards-hdr">
        <span style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#4b5563">${s.equipes.length} Equipe(s)</span>
        ${!s.modoLeitura?`<button class="ca-nav-btn" id="ca-add-equipe"><i class="ti ti-plus"></i> Equipe</button>`:''}
      </div>
      <div class="ca-boards">${cardsHtml||'<div style="grid-column:1/-1;padding:30px;text-align:center;color:#9ca3af;font-size:12px">Nenhuma equipe cadastrada.</div>'}</div>`;

    // Bind boards
    el.querySelectorAll('.ca-toggle-fila,.ca-board-hdr').forEach(btn=>{
      btn.addEventListener('click',e=>{
        const eqId=parseInt(btn.dataset.eq||btn.closest('[data-eq]')?.dataset.eq);
        if(!eqId) return;
        if(e.target.closest('.ca-cfg-eq')) return;
        s.filaAberta=s.filaAberta===eqId?null:eqId;
        this._renderBoards();
        this._renderGrupoInterrompidos();
        this._renderGrupoEncerrados();
      });
    });
    el.querySelectorAll('.ca-cfg-eq').forEach(btn=>btn.addEventListener('click',e=>{
      e.stopPropagation();
      this._modalConfigEquipe(parseInt(btn.dataset.eq));
    }));
    document.getElementById('ca-add-equipe')?.addEventListener('click',()=>this._modalNovaEquipe());

    // Bind ações da fila
    this._bindAcoesFila(el);
  },

  /* ── Soma HH a partir de um datetime, respeitando turno e folgas da equipe ── */
  /* HH é Homem-Hora: duração = HH ÷ membros presentes no dia                  */
  _somarHH(dtInicio, hhTotal, mems){
    if(!dtInicio||!hhTotal||!mems.length) return null;
    const dtStr=dtInicio.slice(0,16);
    const [datePart,timePart]=dtStr.split('T');
    const [hIni,mIni]=(timePart||'07:00').split(':').map(Number);
    let dAtual=datePart;
    let hhRestantes=hhTotal; // em horas decimais
    let minCursor=hIni*60+mIni;

    const turnoRef=this._turnoDe(mems[0]);
    const getMinEntrada=()=>{
      if(turnoRef?.hora_entrada){ const[h,m]=turnoRef.hora_entrada.split(':').map(Number); return h*60+m; }
      return 7*60;
    };
    const getMinSaida=(dia)=>{
      const dw=new Date(dia+'T00:00:00').getDay();
      if(turnoRef?.nome==='ADM'&&dw===5&&turnoRef?.saida_sexta){
        const[h,m]=turnoRef.saida_sexta.split(':').map(Number); return h*60+m;
      }
      if(turnoRef?.hora_saida){ const[h,m]=turnoRef.hora_saida.split(':').map(Number); return h*60+m; }
      return 17*60;
    };

    for(let i=0; i<90; i++){
      // Conta membros presentes neste dia
      const presentes=mems.filter(m=>{
        const turno=this._turnoDe(m);
        const escala=this._escalaDe(m);
        if(!turno||!escala) return true; // sem config: assume presente
        const dw=new Date(dAtual+'T00:00:00').getDay();
        if(turno.nome==='ADM'&&(dw===0||dw===6)) return false;
        const ini2=this._addDays(dAtual,-45),fim2=this._addDays(dAtual,45);
        const folgas=this._gerarFolgas(escala,turno,m.primeira_folga,ini2,fim2);
        return !folgas.has(dAtual);
      }).length;

      if(presentes===0){
        dAtual=this._addDays(dAtual,1);
        minCursor=getMinEntrada();
        continue;
      }

      const minSaida=getMinSaida(dAtual);
      if(minCursor>=minSaida){
        dAtual=this._addDays(dAtual,1);
        minCursor=getMinEntrada();
        continue;
      }
      if(minCursor<getMinEntrada()) minCursor=getMinEntrada();

      // Minutos disponíveis no dia × membros = HH disponível no dia a partir do cursor
      const minDispDia=minSaida-minCursor;
      const hhDispDia=(minDispDia/60)*presentes; // HH = horas × pessoas

      if(hhRestantes<=hhDispDia){
        // Termina neste dia: duração real = hhRestantes / presentes
        const minDuracao=Math.round((hhRestantes/presentes)*60);
        const minFim=minCursor+minDuracao;
        const hFim=Math.floor(minFim/60);
        const mFim=minFim%60;
        return `${dAtual}T${String(hFim).padStart(2,'0')}:${String(mFim).padStart(2,'0')}:00`;
      }

      hhRestantes-=hhDispDia;
      dAtual=this._addDays(dAtual,1);
      minCursor=getMinEntrada();
    }
    return null;
  },


  _tplFila(eq,fila){
    const s=this._s;

    // Calcular previsões sequenciais
    // Ponto de partida: OS em execução usa dt_inicio_real, demais encadeiam
    const mems=s.membros[eq.id]||[];
    let cursor=null; // ISO datetime do próximo início disponível

    fila.forEach((f,idx)=>{
      const hh=parseFloat(f._os?.hh_prev_servico||0);
      if(!hh){ f._dtIniPrev=null; f._dtFimPrev=null; return; }

      if(f.status==='em_execucao'&&f.dt_inicio_real){
        cursor=this._dtBancoToLocal(f.dt_inicio_real);
      } else if(f.status==='pendente'||f.status==='pausado'){
        // Pendente: início = fim do anterior ou agora
        if(!cursor){
          const hoje=this._hoje();
          cursor=hoje+'T'+(new Date().toTimeString().slice(0,5))+':00';
        }
      }

      if(cursor){
        f._dtIniPrev=cursor;
        const dtFim=this._somarHH(cursor,hh,mems);
        f._dtFimPrev=dtFim;
        cursor=dtFim;
      }
    });

    const rows=fila.map((f,idx)=>{
      const os=f._os;
      const desc=os?.desc_servico||os?.desc_os||'—';
      const hh=parseFloat(os?.hh_prev_servico||0);
      const dt_ini=f.dt_inicio_real?this._fmtDMH(f.dt_inicio_real):f._dtIniPrev?this._fmtDMH(f._dtIniPrev):'—';
      // Previsão calculada sequencialmente
      const dtFimPrev=f._dtFimPrev?this._fmtDMH(f._dtFimPrev):'—';
      const total=fila.length;

      let acoes='';
      if(!s.modoLeitura){
        if(f.status==='pendente'){
          acoes=`
            <button class="ca-btn ca-btn-green ca-ac" data-ac="iniciar" data-id="${f.id}"><i class="ti ti-player-play"></i> Iniciar</button>
            <button class="ca-btn ca-ac" data-ac="mover" data-id="${f.id}"><i class="ti ti-arrows-transfer-up"></i> Mover</button>
            <button class="ca-btn ca-btn-red ca-ac" data-ac="remover" data-id="${f.id}"><i class="ti ti-x"></i></button>`;
        } else if(f.status==='em_execucao'){
          acoes=`
            <button class="ca-btn ca-btn-green ca-ac" data-ac="encerrar" data-id="${f.id}"><i class="ti ti-check"></i> Encerrar</button>
            <button class="ca-btn ca-btn-yellow ca-ac" data-ac="pausar" data-id="${f.id}"><i class="ti ti-player-pause"></i> Pausar</button>
            <button class="ca-btn ca-ac" data-ac="interromper" data-id="${f.id}"><i class="ti ti-ban"></i> Interromper</button>
            <button class="ca-btn ca-ac" data-ac="mover" data-id="${f.id}"><i class="ti ti-arrows-transfer-up"></i> Mover</button>`;
        } else if(f.status==='pausado'){
          acoes=`
            <button class="ca-btn ca-btn-green ca-ac" data-ac="retomar" data-id="${f.id}"><i class="ti ti-player-play"></i> Retomar</button>
            <button class="ca-btn ca-ac" data-ac="interromper" data-id="${f.id}"><i class="ti ti-ban"></i> Interromper</button>
            <button class="ca-btn ca-ac" data-ac="mover" data-id="${f.id}"><i class="ti ti-arrows-transfer-up"></i> Mover</button>`;
        }
      }

      return `
        <div class="ca-os-row" data-fila-id="${f.id}">
          <div class="ca-reorder">
            <button class="ca-arr ca-arr-up" data-id="${f.id}" data-eq="${eq.id}" ${idx===0?'disabled':''}>▲</button>
            <button class="ca-arr ca-arr-dn" data-id="${f.id}" data-eq="${eq.id}" ${idx===total-1?'disabled':''}>▼</button>
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
              <span class="ca-os-num">${f.os}</span>
              ${this._badgeTipo(f)}
              ${this._badgeStatus(f.status)}
            </div>
            <div class="ca-os-desc">${desc}</div>
            <div class="ca-os-info">
              ${os?.equipamento?`<span>${os.equipamento}</span> · `:''}
              ${hh?`<strong>${hh.toFixed(1)}h</strong> · `:''}
              Início: ${dt_ini} · Fim prev.: ${dtFimPrev}
            </div>
            ${acoes?`<div class="ca-os-acoes">${acoes}</div>`:''}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="ca-fila">
        <div class="ca-fila-hdr">
          <span style="font-size:10px;font-weight:700;color:#6b7280">${fila.length} serviço(s) na fila</span>
          ${!s.modoLeitura?`<button class="ca-btn ca-add-os" data-eq="${eq.id}"><i class="ti ti-plus"></i> Add OS</button>`:''}
        </div>
        ${rows||'<div style="padding:14px;text-align:center;font-size:11px;color:#9ca3af">Fila vazia.</div>'}
      </div>`;
  },

  /* ── Bind ações da fila ── */
  _bindAcoesFila(root){
    root.querySelectorAll('.ca-ac').forEach(btn=>btn.addEventListener('click',e=>{
      e.stopPropagation();
      const ac=btn.dataset.ac, id=parseInt(btn.dataset.id);
      if(ac==='iniciar')      this._acIniciar(id);
      else if(ac==='encerrar')this._acEncerrar(id);
      else if(ac==='pausar')  this._acPausar(id);
      else if(ac==='retomar') this._acRetomar(id);
      else if(ac==='interromper') this._acInterromper(id);
      else if(ac==='mover')   this._acMover(id);
      else if(ac==='remover') this._acRemover(id);
    }));
    root.querySelectorAll('.ca-arr-up').forEach(btn=>btn.addEventListener('click',e=>{
      e.stopPropagation();
      if(!btn.disabled) this._reordenar(parseInt(btn.dataset.id),parseInt(btn.dataset.eq),-1);
    }));
    root.querySelectorAll('.ca-arr-dn').forEach(btn=>btn.addEventListener('click',e=>{
      e.stopPropagation();
      if(!btn.disabled) this._reordenar(parseInt(btn.dataset.id),parseInt(btn.dataset.eq),+1);
    }));
    root.querySelectorAll('.ca-add-os').forEach(btn=>btn.addEventListener('click',e=>{
      e.stopPropagation();
      this._modalAddOS(parseInt(btn.dataset.eq));
    }));
  },

  /* ══════════════════════════════════════════════
     AÇÕES DA FILA
     ══════════════════════════════════════════════ */
  _filaItem(id){ return Object.values(this._s.fila).flat().find(f=>f.id===id); },

  /* ══════════════════════════════════════════════
     ATUALIZAÇÃO PARCIAL — sem recarregar tudo
     ══════════════════════════════════════════════ */
  async _atualizarParcial(equipeId){
    const s=this._s;

    // 1. Recarregar fila da equipe afetada do banco
    const db=getDB();
    const{data:filaRows}=await db.from('cal_fila').select('*').eq('equipe_id',equipeId).order('posicao');
    if(filaRows?.length){
      const osKeys=[...new Set(filaRows.map(f=>f.os))];
      const{data:osRows}=await db.from('ordens_servico')
        .select('os,cod_servico,desc_servico,desc_os,hh_prev_servico,tipo_atividade,status_os,equipamento,desc_equipamento')
        .in('os',osKeys);
      const osMap={};
      (osRows||[]).forEach(o=>{ osMap[o.os+'|'+o.cod_servico]=o; });
      filaRows.forEach(f=>{
        f._os=osMap[f.os+'|'+f.cod_servico]||osMap[f.os+'|1']||null;
        if(!f._os){
          const prog=s.programacao.find(p=>p.os===f.os&&(p.cod_servico||'1')===(f.cod_servico||'1'));
          if(prog) f._os={os:f.os,cod_servico:f.cod_servico,desc_servico:prog.desc_servico,hh_prev_servico:prog.hh_previsto};
        }
      });
      s.fila[equipeId]=filaRows;
    } else {
      s.fila[equipeId]=[];
    }

    // 2. Re-renderizar só os componentes afetados
    this._renderKpis();
    this._renderAndamento();
    this._renderBoardEquipe(equipeId);
    this._renderPontos();
    this._renderGrupoInterrompidos();
    this._renderGrupoEncerrados();
    this._renderListaGeral();
  },

  /* ── Renderiza apenas um card de equipe (sem recriar toda a grid) ── */
  _renderBoardEquipe(equipeId){
    const s=this._s;
    const eq=s.equipes.find(e=>e.id===equipeId); if(!eq) return;
    const el=document.getElementById(`ca-board-${equipeId}`); if(!el) return;

    const mems=s.membros[equipeId]||[];
    const hhDisp=this._hhDispEquipe(equipeId);
    const hhAloc=this._hhAlocadoEquipe(equipeId);
    const pct=hhDisp>0?Math.min(1,hhAloc/hhDisp):0;
    const corHH=pct>=1?'var(--red)':pct>=0.8?'var(--amber)':'var(--green)';
    const dfim=this._projetarFila(equipeId);
    const aberta=s.filaAberta===equipeId;
    const nomesStr=mems.map(m=>(m.nome||'').split(' ')[0]).join(', ')||'Sem membros';
    const filaEq=(s.fila[equipeId]||[]).filter(f=>f.status!=='interrompido'&&f.status!=='encerrado').sort((a,b)=>a.posicao-b.posicao);

    el.innerHTML=`
      <div class="ca-board-hdr" data-eq="${eq.id}">
        <div class="ca-board-nome">
          <span>${eq.nome}</span>
          <div style="display:flex;gap:4px">
            ${!s.modoLeitura?`<button class="ca-icon-btn ca-cfg-eq" data-eq="${eq.id}" title="Configurar equipe"><i class="ti ti-settings"></i></button>`:''}
            <button class="ca-icon-btn ca-toggle-fila" data-eq="${eq.id}"><i class="ti ti-chevron-${aberta?'up':'down'}"></i></button>
          </div>
        </div>
        <div class="ca-board-membros">${nomesStr}</div>
        <div class="ca-board-meta">
          <span class="ca-board-hh" style="color:${corHH}">${hhAloc.toFixed(1)}h / ${hhDisp.toFixed(1)}h</span>
          <div class="ca-board-bar"><div class="ca-board-bar-fill" style="width:${Math.round(pct*100)}%;background:${corHH}"></div></div>
        </div>
        ${dfim?`<div class="ca-board-conclusao"><i class="ti ti-calendar-due" style="font-size:10px"></i> Conclusão prevista: ${this._diaSem(dfim)} ${this._fmtDM(dfim)}</div>`:''}
      </div>
      ${aberta?this._tplFila(eq,filaEq):''}`;

    // Re-bind eventos deste card
    el.querySelector('.ca-toggle-fila')?.addEventListener('click',e=>{
      e.stopPropagation();
      s.filaAberta=s.filaAberta===equipeId?null:equipeId;
      this._renderBoardEquipe(equipeId);
    });
    el.querySelector('.ca-board-hdr')?.addEventListener('click',e=>{
      if(e.target.closest('.ca-cfg-eq')||e.target.closest('.ca-toggle-fila')) return;
      s.filaAberta=s.filaAberta===equipeId?null:equipeId;
      this._renderBoardEquipe(equipeId);
    });
    el.querySelector('.ca-cfg-eq')?.addEventListener('click',e=>{
      e.stopPropagation();
      this._modalConfigEquipe(equipeId);
    });
    this._bindAcoesFila(el);
  },

  async _acIniciar(id){
    const item=this._filaItem(id); if(!item) return;
    const now=this._hoje()+'T'+new Date().toTimeString().slice(0,5);
    this._modal('Iniciar OS '+item.os,`
      <div class="ca-row">
        <div class="ca-field"><label class="ca-lbl">Data/hora de início</label>
          <input type="datetime-local" id="ca-dt-ini" class="ca-input" value="${now}">
        </div>
      </div>`,
      async()=>{
        const dt=document.getElementById('ca-dt-ini').value;
        if(!dt){ showToast('Informe a data/hora','erro'); return; }
        const db=getDB();

        // Mover para posição 1: empurra as demais para frente sequencialmente
        const s=this._s;
        const filaEq=(s.fila[item.equipe_id]||[])
          .filter(f=>f.id!==id)
          .sort((a,b)=>a.posicao-b.posicao);

        // Usar posições temporárias negativas para evitar conflito UNIQUE
        for(const f of filaEq){
          await db.from('cal_fila').update({posicao:-(f.posicao+100)}).eq('id',f.id);
        }
        await db.from('cal_fila').update({status:'em_execucao',dt_inicio_real:this._dtLocal(dt),posicao:1}).eq('id',id);
        for(let i=0;i<filaEq.length;i++){
          await db.from('cal_fila').update({posicao:i+2}).eq('id',filaEq[i].id);
        }

        showToast('OS iniciada!','ok');
        this._fecharModal();
        await this._atualizarParcial(item.equipe_id);
      },'Iniciar');
  },

  async _acEncerrar(id){
    const item=this._filaItem(id); if(!item) return;
    const now=this._hoje()+'T'+new Date().toTimeString().slice(0,5);
    const s=this._s;
    const eqFila=(s.fila[item.equipe_id]||[]).filter(f=>f.status==='pendente'||f.status==='pausado').sort((a,b)=>a.posicao-b.posicao);
    const prox=eqFila[0];
    this._modal('Encerrar OS '+item.os,`
      <div class="ca-row">
        <div class="ca-field"><label class="ca-lbl">Data/hora de encerramento</label>
          <input type="datetime-local" id="ca-dt-fim" class="ca-input" value="${now}">
        </div>
      </div>
      ${prox?`<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 12px;font-size:11px;color:#166534;display:flex;align-items:center;gap:8px;margin-top:4px">
        <i class="ti ti-player-play"></i> Iniciar próxima automaticamente?
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-left:auto">
          <input type="checkbox" id="ca-prox-check" checked> OS ${prox.os}
        </label>
      </div>`:''}`,
      async()=>{
        const dt=document.getElementById('ca-dt-fim').value;
        if(!dt){ showToast('Informe a data/hora','erro'); return; }
        const db=getDB();
        const{error}=await db.from('cal_fila').update({status:'encerrado',dt_fim_real:this._dtLocal(dt)}).eq('id',id);
        if(error) throw error;
        if(prox&&document.getElementById('ca-prox-check')?.checked){
          await db.from('cal_fila').update({status:'em_execucao',dt_inicio_real:this._dtLocal(dt)}).eq('id',prox.id);
        }
        showToast('OS encerrada!','ok');
        this._fecharModal();
        await this._atualizarParcial(item.equipe_id);
      },'Encerrar');
  },

  async _acPausar(id){
    const item=this._filaItem(id); if(!item) return;
    const db=getDB();
    const{error}=await db.from('cal_fila').update({status:'pausado',dt_pausa:new Date().toISOString()}).eq('id',id);
    if(error){ showToast('Erro: '+error.message,'erro'); return; }
    showToast('OS pausada','ok');
    await this._atualizarParcial(item.equipe_id);
  },

  async _acRetomar(id){
    const item=this._filaItem(id); if(!item) return;
    const now=this._hoje()+'T'+new Date().toTimeString().slice(0,5);
    this._modal('Retomar OS '+item.os,`
      <div class="ca-row">
        <div class="ca-field"><label class="ca-lbl">Data/hora de retomada</label>
          <input type="datetime-local" id="ca-dt-ret" class="ca-input" value="${now}">
        </div>
      </div>`,
      async()=>{
        const dt=document.getElementById('ca-dt-ret').value;
        const db=getDB();
        const{error}=await db.from('cal_fila').update({status:'em_execucao',dt_inicio_real:this._dtLocal(dt),dt_pausa:null}).eq('id',id);
        if(error) throw error;
        showToast('OS retomada!','ok');
        this._fecharModal();
        await this._atualizarParcial(item.equipe_id);
      },'Retomar');
  },

  async _acInterromper(id){
    const item=this._filaItem(id); if(!item) return;
    const motivos=['Falta de Material','Falta de Acesso','Segurança Comprometida'];
    this._modal('Interromper OS '+item.os,`
      <div class="ca-field"><label class="ca-lbl">Motivo (obrigatório)</label>
        <select id="ca-motivo" class="ca-select">
          <option value="">Selecione…</option>
          ${motivos.map(m=>`<option value="${m}">${m}</option>`).join('')}
        </select>
      </div>`,
      async()=>{
        const motivo=document.getElementById('ca-motivo').value;
        if(!motivo){ showToast('Selecione o motivo','erro'); return; }
        const db=getDB();
        const{error}=await db.from('cal_fila').update({status:'interrompido',motivo_interrupcao:motivo}).eq('id',id);
        if(error) throw error;
        showToast('OS interrompida','ok');
        this._fecharModal();
        await this._atualizarParcial(item.equipe_id);
      },'Interromper');
  },

  async _acMover(id){
    const item=this._filaItem(id); if(!item) return;
    const s=this._s;
    const outrasEqs=s.equipes.filter(e=>e.id!==item.equipe_id);
    if(!outrasEqs.length){ showToast('Nenhuma outra equipe disponível','info'); return; }
    this._modal('Mover OS '+item.os,`
      <div class="ca-field"><label class="ca-lbl">Mover para equipe</label>
        <select id="ca-eq-dest" class="ca-select">
          ${outrasEqs.map(e=>`<option value="${e.id}">${e.nome}</option>`).join('')}
        </select>
      </div>`,
      async()=>{
        const destId=parseInt(document.getElementById('ca-eq-dest').value);
        const filaDestino=(s.fila[destId]||[]);
        const maxPos=filaDestino.length?Math.max(...filaDestino.map(f=>f.posicao)):0;
        const db=getDB();
        const{error}=await db.from('cal_fila').update({equipe_id:destId,posicao:maxPos+1,status:'pendente'}).eq('id',id);
        if(error) throw error;
        showToast('OS movida!','ok');
        this._fecharModal();
        // Mover afeta duas equipes — reload completo necessário
        await this._carregar();
      },'Mover');
  },

  async _acRemover(id){
    const item=this._filaItem(id); if(!item) return;
    if(!confirm('Remover OS da fila?')) return;
    const db=getDB();
    const{error}=await db.from('cal_fila').delete().eq('id',id);
    if(error){ showToast('Erro: '+error.message,'erro'); return; }
    showToast('OS removida da fila','ok');
    await this._atualizarParcial(item.equipe_id);
  },

  async _reordenar(id,equipeId,delta){
    const s=this._s;
    const fila=[...(s.fila[equipeId]||[])].sort((a,b)=>a.posicao-b.posicao);
    const idx=fila.findIndex(f=>f.id===id);
    const novoIdx=idx+delta;
    if(novoIdx<0||novoIdx>=fila.length) return;
    const a=fila[idx], b=fila[novoIdx];
    const db=getDB();
    // Usa posição temporária negativa para evitar conflito de UNIQUE
    const tmpPos = -(a.posicao + b.posicao + 1);
    await db.from('cal_fila').update({posicao:tmpPos}).eq('id',a.id);
    await db.from('cal_fila').update({posicao:a.posicao}).eq('id',b.id);
    await db.from('cal_fila').update({posicao:b.posicao}).eq('id',a.id);
    await this._atualizarParcial(equipeId);
  },

  /* ══════════════════════════════════════════════
     ADD OS NA FILA
     ══════════════════════════════════════════════ */
  async _modalAddOS(equipeId){
    const s=this._s;
    const eq=s.equipes.find(e=>e.id===equipeId);
    // OS já na fila (qualquer equipe)
    const jaAlocadas=new Set(Object.values(s.fila).flat().map(f=>f.os+'|'+(f.cod_servico||'1')));

    this._modal('Adicionar OS — '+eq?.nome,`
      <style>
        .ca-add-tab{padding:6px 14px;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:#6b7280;display:inline-flex;align-items:center;gap:5px}
        .ca-add-tab.on{color:var(--yellow);border-bottom-color:var(--yellow)}
        .ca-os-check-row{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:11px;cursor:pointer;transition:background .1s}
        .ca-os-check-row:hover{background:#f9fafb}
        .ca-os-check-row.selecionado{background:#f0fdf4}
        .ca-os-check-row:last-child{border-bottom:none}
      </style>
      <div style="display:flex;border-bottom:1px solid var(--border);margin-bottom:12px">
        <div class="ca-add-tab on" id="ca-tab-prog">
          <i class="ti ti-clipboard-list"></i> Programação da semana
        </div>
        <div class="ca-add-tab" id="ca-tab-busca">
          <i class="ti ti-search"></i> Busca livre
        </div>
      </div>

      <!-- ABA PROGRAMAÇÃO -->
      <div id="ca-painel-prog">
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input id="ca-prog-filtro" class="ca-input" placeholder="Filtrar por OS ou descrição…" style="flex:1">
          <select id="ca-prog-tipo" class="ca-select" style="width:100px">
            <option value="">Todos</option>
            <option value="MCU">MCU</option>
          </select>
        </div>
        <div id="ca-prog-lista" style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm)">
          <div style="padding:14px;text-align:center;font-size:11px;color:#9ca3af"><i class="ti ti-loader-2"></i> Carregando…</div>
        </div>
        <div id="ca-selecionadas-badge" style="display:none;margin-top:8px;font-size:11px;font-weight:700;color:var(--green)"></div>
      </div>

      <!-- ABA BUSCA LIVRE -->
      <div id="ca-painel-busca" style="display:none">
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input id="ca-os-busca" class="ca-input" placeholder="Número da OS ou descrição…" autocomplete="off" style="flex:1">
          <select id="ca-os-tipo" class="ca-select" style="width:100px">
            <option value="">Todos</option>
            <option value="MCU">MCU</option>
          </select>
        </div>
        <div id="ca-os-resultados" style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm)">
          <div style="padding:14px;text-align:center;font-size:11px;color:#9ca3af">Digite para buscar…</div>
        </div>
      </div>

      <div style="margin-top:10px" id="ca-os-avulso-wrap">
        <button class="ca-btn" id="ca-os-avulso-btn"><i class="ti ti-plus"></i> Inserir serviço avulso (sem OS)</button>
      </div>`,
      async()=>{
        // Coleta selecionados (programação + busca livre)
        const sels=[
          ...document.querySelectorAll('.ca-os-check-row.selecionado[data-os]'),
          ...document.querySelectorAll('.ca-os-opt.selecionado[data-os]'),
        ];
        const avulso=document.getElementById('ca-avulso-os');

        if(!sels.length&&!avulso){ showToast('Selecione ao menos uma OS','erro'); return; }

        const db=getDB();

        // Busca fila atualizada do banco para evitar conflitos por cache
        const{data:filaAtual}=await db.from('cal_fila').select('os,cod_servico');
        const jaNobanco=new Set((filaAtual||[]).map(f=>f.os+'|'+(f.cod_servico||'1')));

        // Posição máxima atual desta equipe
        const{data:filaDaEq}=await db.from('cal_fila').select('posicao').eq('equipe_id',equipeId).order('posicao',{ascending:false}).limit(1);
        let maxPos=(filaDaEq?.[0]?.posicao)||0;

        const inserts=[];
        if(sels.length){
          for(const el of sels){
            const os_val=el.dataset.os, cod_val=el.dataset.cod||'1';
            if(jaNobanco.has(os_val+'|'+cod_val)){ showToast(`OS ${os_val} já está na fila de outra equipe`,'info'); continue; }
            inserts.push({equipe_id:equipeId,os:os_val,cod_servico:cod_val,posicao:++maxPos,semana_ref:s.semana,ano_ref:s.ano,status:'pendente'});
          }
        } else if(avulso){
          const os_val=avulso.value.trim()||('AVULSO-'+Date.now());
          inserts.push({equipe_id:equipeId,os:os_val,cod_servico:'1',posicao:++maxPos,semana_ref:s.semana,ano_ref:s.ano,status:'pendente'});
        }

        if(!inserts.length){ showToast('Nenhuma OS nova para adicionar','info'); return; }

        // Inserir uma a uma para tratar conflitos individualmente
        let adicionadas=0, puladas=0;
        for(const row of inserts){
          const{error}=await db.from('cal_fila').insert(row);
          if(error){
            if(error.code==='23505') puladas++; // duplicate key — já existe
            else throw error;
          } else {
            adicionadas++;
          }
        }
        if(adicionadas) showToast(`${adicionadas} OS adicionada(s) à fila!${puladas?` (${puladas} já existiam)`:''}`, 'ok');
        else showToast('Nenhuma OS foi adicionada — todas já estavam na fila.','info');
        this._fecharModal();
        await this._carregar();
      },`Adicionar`);

    // Bind abas e lógica
    setTimeout(async()=>{
      // Abas
      document.getElementById('ca-tab-prog').addEventListener('click',()=>{
        document.getElementById('ca-tab-prog').className='ca-add-tab on';
        document.getElementById('ca-tab-busca').className='ca-add-tab';
        document.getElementById('ca-painel-prog').style.display='';
        document.getElementById('ca-painel-busca').style.display='none';
      });
      document.getElementById('ca-tab-busca').addEventListener('click',()=>{
        document.getElementById('ca-tab-busca').className='ca-add-tab on';
        document.getElementById('ca-tab-prog').className='ca-add-tab';
        document.getElementById('ca-painel-busca').style.display='';
        document.getElementById('ca-painel-prog').style.display='none';
      });

      // Carregar programação da semana
      const db=getDB();
      const{data:progRows}=await db.from('programacao_semanal')
        .select('os,cod_servico,desc_servico,hh_previsto,equipe')
        .eq('semana',s.semana).eq('ano',s.ano);

      // Enriquecer com tipo_atividade
      const osNums=[...new Set((progRows||[]).map(p=>p.os))];
      let tipoMap={};
      if(osNums.length){
        const{data:tipoRows}=await db.from('ordens_servico')
          .select('os,cod_servico,tipo_atividade,modalidade').in('os',osNums.slice(0,500));
        (tipoRows||[]).forEach(o=>{ tipoMap[o.os+'|'+(o.cod_servico||'1')]=o; });
      }

      const progCAL=(progRows||[]).filter(p=>{
        const t=tipoMap[p.os+'|'+(p.cod_servico||'1')];
        return !t||t.modalidade==='CAL';
      });

      const renderProg=(filtro='',tipo='')=>{
        const lista=document.getElementById('ca-prog-lista'); if(!lista) return;
        let items=progCAL.filter(p=>{
          const jaEsta=jaAlocadas.has(p.os+'|'+(p.cod_servico||'1'));
          if(jaEsta) return false;
          if(filtro&&!p.os.includes(filtro)&&!(p.desc_servico||'').toLowerCase().includes(filtro.toLowerCase())) return false;
          if(tipo==='MCU'){ const t=tipoMap[p.os+'|'+(p.cod_servico||'1')]; if(t?.tipo_atividade!=='MANUTENÇÃO CORRETIVA DE URGÊNCIA') return false; }
          return true;
        });
        if(!items.length){ lista.innerHTML='<div style="padding:14px;text-align:center;font-size:11px;color:#9ca3af">Nenhuma OS disponível.</div>'; return; }
        lista.innerHTML=items.map(p=>{
          const t=tipoMap[p.os+'|'+(p.cod_servico||'1')];
          const mcu=t?.tipo_atividade==='MANUTENÇÃO CORRETIVA DE URGÊNCIA';
          return `<div class="ca-os-check-row" data-os="${p.os}" data-cod="${p.cod_servico||'1'}">
            <input type="checkbox" style="accent-color:var(--yellow);flex-shrink:0">
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:11px">${p.os} ${mcu?'<span class="ca-badge ca-badge-mcu">MCU</span>':''}</div>
              <div style="font-size:11px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.desc_servico||'—'}</div>
              <div style="font-size:10px;color:#9ca3af">${p.equipe||''} ${p.hh_previsto?'· '+p.hh_previsto+'h':''}</div>
            </div>
          </div>`;
        }).join('');

        // Bind checkbox → toggle selecionado
        lista.querySelectorAll('.ca-os-check-row').forEach(row=>{
          const cb=row.querySelector('input[type=checkbox]');
          const toggle=()=>{
            row.classList.toggle('selecionado',cb.checked);
            const n=lista.querySelectorAll('.ca-os-check-row.selecionado').length;
            const badge=document.getElementById('ca-selecionadas-badge');
            if(badge){ badge.style.display=n?'':'none'; badge.textContent=n+' OS selecionada(s)'; }
          };
          cb.addEventListener('change',toggle);
          row.addEventListener('click',e=>{ if(e.target===cb) return; cb.checked=!cb.checked; toggle(); });
        });
      };

      renderProg();
      document.getElementById('ca-prog-filtro').addEventListener('input',e=>renderProg(e.target.value,document.getElementById('ca-prog-tipo').value));
      document.getElementById('ca-prog-tipo').addEventListener('change',e=>renderProg(document.getElementById('ca-prog-filtro').value,e.target.value));

      // Busca livre
      const inp=document.getElementById('ca-os-busca');
      const tipoEl=document.getElementById('ca-os-tipo');
      const res=document.getElementById('ca-os-resultados');
      const buscar=async()=>{
        const q=inp.value.trim(); if(q.length<2){ res.innerHTML='<div style="padding:14px;text-align:center;font-size:11px;color:#9ca3af">Digite ao menos 2 caracteres…</div>'; return; }

        // Busca por número ou descrição
        const isByNum=/^\d+/.test(q);
        const termoBusca=isByNum
          ?`os.ilike.%${q}%`
          :`desc_servico.ilike.%${q}%,desc_os.ilike.%${q}%`;

        // Aceita modalidade=CAL ou (modalidade nula com equipe CAL)
        let q2=db.from('ordens_servico')
          .select('os,cod_servico,desc_servico,desc_os,hh_prev_servico,tipo_atividade,equipamento,status_os,status_servico,modalidade')
          .or(`modalidade.eq.CAL,and(modalidade.is.null,equipe.ilike.%CAL%)`)
          .or(termoBusca);

        if(tipoEl.value==='MCU') q2=q2.eq('tipo_atividade','MANUTENÇÃO CORRETIVA DE URGÊNCIA');
        const{data}=await q2.limit(30);
        if(!data?.length){ res.innerHTML='<div style="padding:14px;text-align:center;font-size:11px;color:#9ca3af">Nenhum resultado.</div>'; return; }

        res.innerHTML=(data||[]).map(o=>{
          const jaEsta=jaAlocadas.has(o.os+'|'+(o.cod_servico||'1'));
          const bloqueado=o.status_os==='4 - Encerrada'||o.status_os==='5 - Cancelada'||
                          o.status_servico==='Encerrado'||o.status_servico==='Cancelado';
          const motivo=bloqueado?(o.status_os||o.status_servico):'';
          const disabled=jaEsta||bloqueado;
          return `<div class="ca-os-check-row ${!disabled?'ca-os-opt':''}" data-os="${o.os}" data-cod="${o.cod_servico||'1'}"
            ${disabled?'style="opacity:.45;pointer-events:none"':''}>
            <input type="checkbox" style="accent-color:var(--yellow);flex-shrink:0" ${disabled?'disabled':''}>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:11px;display:flex;align-items:center;gap:5px">
                ${o.os}
                ${jaEsta?'<span style="font-size:9px;color:#9ca3af">já alocada</span>':''}
                ${bloqueado?`<span style="font-size:9px;background:#fee2e2;color:#991b1b;padding:1px 5px;border-radius:6px">${motivo}</span>`:''}
              </div>
              <div style="font-size:11px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.desc_servico||o.desc_os||'—'}</div>
              <div style="font-size:10px;color:#9ca3af">${o.equipamento||''} ${o.hh_prev_servico?'· '+o.hh_prev_servico+'h':''}</div>
            </div>
          </div>`;
        }).join('');
        res.querySelectorAll('.ca-os-opt').forEach(row=>{
          const cb=row.querySelector('input[type=checkbox]');
          row.addEventListener('click',e=>{ if(e.target===cb) return; cb.checked=!cb.checked; row.classList.toggle('selecionado',cb.checked); });
          cb.addEventListener('change',()=>row.classList.toggle('selecionado',cb.checked));
        });
      };
      inp.addEventListener('input',()=>{ clearTimeout(inp._t); inp._t=setTimeout(buscar,300); });
      tipoEl.addEventListener('change',buscar);

      // Avulso
      document.getElementById('ca-os-avulso-btn').addEventListener('click',()=>{
        document.getElementById('ca-os-avulso-wrap').innerHTML=`
          <div class="ca-row" style="margin-bottom:0">
            <div class="ca-field"><label class="ca-lbl">Nº OS (opcional)</label><input id="ca-avulso-os" class="ca-input" placeholder="Avulso"></div>
          </div>`;
      });
    },100);
  },


  /* ══════════════════════════════════════════════
     PONTOS DE ATENÇÃO
     ══════════════════════════════════════════════ */
  _renderPontos(){
    const el=document.getElementById('ca-pontos-wrap'); if(!el) return;
    const s=this._s;
    const hoje=this._hoje();
    const alertas=[];

    // Zona de risco: término previsto sab/dom
    const sab=this._addDays(s.dataFim,-1); // sábado
    const dom=s.dataFim;                    // domingo

    s.equipes.forEach(eq=>{
      const dfim=this._projetarFila(eq.id);
      if(dfim===sab||dfim===dom){
        alertas.push(`<div class="ca-attn-row"><span style="color:var(--amber);font-size:14px">⚠</span><div><strong>Zona de risco — ${eq.nome}</strong>: conclusão prevista em ${this._diaSem(dfim)} ${this._fmtDM(dfim)}. Considere reprogramar.</div></div>`);
      }
    });

    // Capacidade disponível: equipe com >16h livre pode absorver
    const eqsComFolga=s.equipes.filter(eq=>{
      const disp=this._hhDispEquipe(eq.id);
      const aloc=this._hhAlocadoEquipe(eq.id);
      return disp-aloc>16;
    });
    const eqsRisco=s.equipes.filter(eq=>{
      const dfim=this._projetarFila(eq.id);
      return dfim===sab||dfim===dom;
    });
    if(eqsComFolga.length&&eqsRisco.length){
      eqsComFolga.forEach(eq=>{
        const livre=this._hhDispEquipe(eq.id)-this._hhAlocadoEquipe(eq.id);
        alertas.push(`<div class="ca-attn-row"><span style="color:var(--green);font-size:14px">💡</span><div><strong>${eq.nome}</strong> tem ${livre.toFixed(0)}h disponíveis — pode absorver OS de equipes em zona de risco.</div></div>`);
      });
    }

    // Semana passada: OS não encerradas
    if(s.modoLeitura){
      const pendentes=Object.values(s.fila).flat().filter(f=>f.status==='pendente'||f.status==='em_execucao'||f.status==='pausado');
      if(pendentes.length){
        pendentes.forEach(f=>{
          const eq=s.equipes.find(e=>e.id===f.equipe_id);
          alertas.push(`<div class="ca-attn-row"><span style="color:var(--red);font-size:14px">📋</span><div><strong>${f.os}</strong> (${eq?.nome||'—'}) — não foi encerrada na semana.</div></div>`);
        });
      }
    }

    if(!alertas.length){ el.innerHTML=''; return; }
    el.innerHTML=`
      <div class="ca-attn" style="margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b5563;margin-bottom:10px"><i class="ti ti-alert-triangle" style="color:var(--amber)"></i> Pontos de Atenção</div>
        ${alertas.join('')}
      </div>`;
  },

  /* ══════════════════════════════════════════════
     GRUPOS INTERROMPIDOS / ENCERRADOS
     ══════════════════════════════════════════════ */
  _renderGrupoInterrompidos(){
    const el=document.getElementById('ca-interrompidos-wrap'); if(!el) return;
    const s=this._s;
    const items=Object.values(s.fila).flat().filter(f=>f.status==='interrompido');
    if(!items.length){ el.innerHTML=''; return; }

    const rows=items.map(f=>{
      const eq=s.equipes.find(e=>e.id===f.equipe_id);
      return `<div class="ca-os-row">
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700">${f.os} <span style="font-size:10px;font-weight:400;color:#6b7280">${eq?.nome||'—'}</span></div>
          <div style="font-size:11px;color:#374151">${f._os?.desc_servico||f._os?.desc_os||'—'}</div>
          <div style="font-size:10px;color:var(--red)">${f.motivo_interrupcao||'Sem motivo'}</div>
        </div>
        ${!s.modoLeitura?`<div style="display:flex;gap:4px">
          <button class="ca-btn ca-btn-green ca-ac" data-ac="retomar" data-id="${f.id}"><i class="ti ti-player-play"></i> Reabrir</button>
          <button class="ca-btn ca-btn-red ca-ac" data-ac="remover" data-id="${f.id}"><i class="ti ti-x"></i></button>
        </div>`:''}
      </div>`;
    }).join('');

    el.innerHTML=`
      <div class="ca-grupo" style="margin-bottom:10px">
        <div class="ca-grupo-hdr" id="ca-int-hdr">
          <span class="ca-grupo-titulo"><span style="width:8px;height:8px;border-radius:50%;background:#6b7280;display:inline-block"></span> Interrompidos <span style="background:#e5e7eb;color:#374151;font-size:9px;padding:1px 7px;border-radius:10px">${items.length}</span></span>
          <i class="ti ti-chevron-down" id="ca-int-arr"></i>
        </div>
        <div id="ca-int-body" style="display:none">${rows}</div>
      </div>`;
    document.getElementById('ca-int-hdr').addEventListener('click',()=>{
      const b=document.getElementById('ca-int-body');
      const open=b.style.display==='block';
      b.style.display=open?'none':'block';
      document.getElementById('ca-int-arr').className='ti ti-chevron-'+(open?'down':'up');
      document.getElementById('ca-int-hdr').classList.toggle('open',!open);
    });
    this._bindAcoesFila(el);
  },

  _renderGrupoEncerrados(){
    const el=document.getElementById('ca-encerrados-wrap'); if(!el) return;
    const s=this._s;
    const items=Object.values(s.fila).flat().filter(f=>f.status==='encerrado');
    if(!items.length){ el.innerHTML=''; return; }

    const rows=items.map(f=>{
      const eq=s.equipes.find(e=>e.id===f.equipe_id);
      const hh=parseFloat(f._os?.hh_prev_servico||0);
      return `<div class="ca-os-row">
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700">${f.os} <span style="font-size:10px;font-weight:400;color:#6b7280">${eq?.nome||'—'}</span></div>
          <div style="font-size:11px;color:#374151">${f._os?.desc_servico||f._os?.desc_os||'—'}</div>
          <div style="font-size:10px;color:#9ca3af">${hh?hh.toFixed(1)+'h · ':''}Encerrado ${f.dt_fim_real?this._fmtDMH(f.dt_fim_real):''}</div>
        </div>
        ${!s.modoLeitura?`<button class="ca-btn ca-ac" data-ac="reabrir" data-id="${f.id}"><i class="ti ti-refresh"></i> Reabrir</button>`:''}
      </div>`;
    }).join('');

    el.innerHTML=`
      <div class="ca-grupo" style="margin-bottom:10px">
        <div class="ca-grupo-hdr" id="ca-enc-hdr">
          <span class="ca-grupo-titulo"><span style="width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block"></span> Encerrados na semana <span style="background:#dcfce7;color:#166534;font-size:9px;padding:1px 7px;border-radius:10px">${items.length}</span></span>
          <i class="ti ti-chevron-down" id="ca-enc-arr"></i>
        </div>
        <div id="ca-enc-body" style="display:none">${rows}</div>
      </div>`;
    document.getElementById('ca-enc-hdr').addEventListener('click',()=>{
      const b=document.getElementById('ca-enc-body');
      const open=b.style.display==='block';
      b.style.display=open?'none':'block';
      document.getElementById('ca-enc-arr').className='ti ti-chevron-'+(open?'down':'up');
      document.getElementById('ca-enc-hdr').classList.toggle('open',!open);
    });
    // Bind reabrir (encerrado → pendente)
    el.querySelectorAll('.ca-ac[data-ac="reabrir"]').forEach(btn=>btn.addEventListener('click',async e=>{
      e.stopPropagation();
      const id=parseInt(btn.dataset.id);
      const item=this._filaItem(id);
      const db=getDB();
      const{error}=await db.from('cal_fila').update({status:'pendente',dt_fim_real:null}).eq('id',id);
      if(error){ showToast('Erro: '+error.message,'erro'); return; }
      showToast('OS reaberta','ok');
      if(item) await this._atualizarParcial(item.equipe_id);
      else await this._carregar();
    }));
  },

  /* ══════════════════════════════════════════════
     LISTA GERAL (retraída)
     ══════════════════════════════════════════════ */
  _renderListaGeral(){
    const el=document.getElementById('ca-lista-wrap'); if(!el) return;
    const s=this._s;

    // Calcular previsões para todas as equipes antes de montar a lista
    s.equipes.forEach(eq=>{
      const fila=(s.fila[eq.id]||[]).filter(f=>f.status!=='interrompido'&&f.status!=='encerrado').sort((a,b)=>a.posicao-b.posicao);
      const mems=s.membros[eq.id]||[];
      let cursor=null;
      fila.forEach(f=>{
        const hh=parseFloat(f._os?.hh_prev_servico||0);
        if(!hh){ f._dtIniPrev=null; f._dtFimPrev=null; return; }
        if(f.status==='em_execucao'&&f.dt_inicio_real) cursor=this._dtBancoToLocal(f.dt_inicio_real);
        else if(!cursor){ const hoje=this._hoje(); cursor=hoje+'T'+(new Date().toTimeString().slice(0,5))+':00'; }
        f._dtIniPrev=cursor;
        const dtFim=this._somarHH(cursor,hh,mems);
        f._dtFimPrev=dtFim;
        cursor=dtFim;
      });
    });

    const todos=Object.values(s.fila).flat().sort((a,b)=>{
      if(a.equipe_id!==b.equipe_id) return a.equipe_id-b.equipe_id;
      return a.posicao-b.posicao;
    });

    const rows=todos.map(f=>{
      const eq=s.equipes.find(e=>e.id===f.equipe_id);
      const hh=parseFloat(f._os?.hh_prev_servico||0);
      const iniPrev=f.dt_inicio_real?this._fmtDM(f.dt_inicio_real.slice(0,10)):f._dtIniPrev?this._fmtDM(f._dtIniPrev.slice(0,10)):'—';
      const fimPrev=f._dtFimPrev?this._fmtDM(f._dtFimPrev.slice(0,10)):'—';
      return `<div class="ca-lista-row">
        <span style="font-weight:700">${f.os}</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${f._os?.desc_servico||f._os?.desc_os||'—'}">${f._os?.desc_servico||f._os?.desc_os||'—'}</span>
        <span>${eq?.nome||'—'}</span>
        <span>${hh?hh.toFixed(1)+'h':'—'}</span>
        <span style="color:#6b7280">${iniPrev}</span>
        <span style="color:#6b7280">${fimPrev}</span>
      </div>`;
    }).join('');

    el.innerHTML=`
      <div class="ca-grupo">
        <div class="ca-grupo-hdr" id="ca-lista-hdr">
          <span class="ca-grupo-titulo"><i class="ti ti-list" style="font-size:12px"></i> Todos os serviços alocados <span style="background:#e5e7eb;color:#374151;font-size:9px;padding:1px 7px;border-radius:10px">${todos.length}</span></span>
          <i class="ti ti-chevron-down" id="ca-lista-arr"></i>
        </div>
        <div id="ca-lista-body" style="display:none">
          <div class="ca-lista-row ca-lista-hdr"><span>OS</span><span>Serviço</span><span>Equipe</span><span>HH</span><span>Início</span><span>Fim prev.</span></div>
          ${rows||'<div style="padding:14px;text-align:center;font-size:11px;color:#9ca3af">Nenhum serviço alocado.</div>'}
        </div>
      </div>`;

    document.getElementById('ca-lista-hdr').addEventListener('click',()=>{
      const b=document.getElementById('ca-lista-body');
      const open=b.style.display==='block';
      b.style.display=open?'none':'block';
      document.getElementById('ca-lista-arr').className='ti ti-chevron-'+(open?'down':'up');
      document.getElementById('ca-lista-hdr').classList.toggle('open',!open);
      s.listaAberta=!open;
    });
    if(s.listaAberta){
      document.getElementById('ca-lista-body').style.display='block';
      document.getElementById('ca-lista-arr').className='ti ti-chevron-up';
      document.getElementById('ca-lista-hdr').classList.add('open');
    }
  },

  /* ══════════════════════════════════════════════
     MODAL NOVA EQUIPE
     ══════════════════════════════════════════════ */
  async _modalNovaEquipe(){
    const s=this._s;
    const dispColabs=s.colaboradores.filter(c=>{
      // Não está em nenhuma equipe
      return !Object.values(s.membros).flat().find(m=>String(m.cracha)===String(c.cracha));
    });

    this._modal('Nova equipe',`
      <div class="ca-row">
        <div class="ca-field"><label class="ca-lbl">Nome da equipe</label>
          <input id="ca-eq-nome" class="ca-input" placeholder="Ex: Equipe A">
        </div>
      </div>
      <label class="ca-lbl">Colaboradores</label>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);padding:4px">
        ${dispColabs.length?dispColabs.map(c=>`
          <label style="display:flex;align-items:center;gap:8px;padding:5px 8px;cursor:pointer;font-size:12px;border-radius:4px" class="ca-colab-opt">
            <input type="checkbox" class="ca-mem-cb" value="${c.cracha}" style="accent-color:var(--yellow)">
            <span style="flex:1">${c.nome}</span>
            <span style="font-size:10px;color:#9ca3af">${c.turno||'—'} · ${c.escala||'—'}</span>
          </label>`).join('')
        :'<div style="padding:10px;font-size:11px;color:#9ca3af;text-align:center">Todos os colaboradores já estão alocados.</div>'}
      </div>`,
      async()=>{
        const nome=document.getElementById('ca-eq-nome').value.trim();
        if(!nome){ showToast('Informe o nome da equipe','erro'); return; }
        const chapas=[...document.querySelectorAll('.ca-mem-cb:checked')].map(cb=>cb.value);
        const db=getDB();
        const{data:eqCriada,error}=await db.from('cal_equipes').insert({nome}).select().single();
        if(error) throw error;
        if(chapas.length){
          const{error:e2}=await db.from('cal_equipe_membros').insert(chapas.map(ch=>({equipe_id:eqCriada.id,chapa:ch})));
          if(e2) throw e2;
        }
        showToast('Equipe criada!','ok');
        this._fecharModal();
        await this._carregar();
      },'Criar equipe');
  },

  /* ── Modal config equipe (editar membros) ── */
  async _modalConfigEquipe(equipeId){
    const s=this._s;
    const eq=s.equipes.find(e=>e.id===equipeId);
    const memsAtuais=(s.membros[equipeId]||[]).map(m=>String(m.cracha));

    const colabs=s.colaboradores.filter(c=>{
      // Disponível = não está em outra equipe
      const emOutra=Object.entries(s.membros).find(([eId,ms])=>parseInt(eId)!==equipeId&&ms.find(m=>String(m.cracha)===String(c.cracha)));
      return !emOutra;
    });

    this._modal('Configurar — '+eq?.nome,`
      <div class="ca-row">
        <div class="ca-field"><label class="ca-lbl">Nome</label>
          <input id="ca-eq-edit-nome" class="ca-input" value="${eq?.nome||''}">
        </div>
      </div>
      <label class="ca-lbl">Membros</label>
      <div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);padding:4px">
        ${colabs.map(c=>`
          <label style="display:flex;align-items:center;gap:8px;padding:5px 8px;cursor:pointer;font-size:12px;border-radius:4px">
            <input type="checkbox" class="ca-mem-edit-cb" value="${c.cracha}" ${memsAtuais.includes(String(c.cracha))?'checked':''} style="accent-color:var(--yellow)">
            <span style="flex:1">${c.nome}</span>
            <span style="font-size:10px;color:#9ca3af">${c.turno||'—'} · ${c.escala||'—'}</span>
          </label>`).join('')}
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <button class="ca-btn ca-btn-red" id="ca-eq-excluir"><i class="ti ti-trash"></i> Excluir equipe</button>
      </div>`,
      async()=>{
        const nome=document.getElementById('ca-eq-edit-nome').value.trim();
        if(!nome){ showToast('Informe o nome','erro'); return; }
        const novasChapas=[...document.querySelectorAll('.ca-mem-edit-cb:checked')].map(cb=>cb.value);
        const db=getDB();
        await db.from('cal_equipes').update({nome}).eq('id',equipeId);
        // Reconstruir membros
        await db.from('cal_equipe_membros').delete().eq('equipe_id',equipeId);
        if(novasChapas.length){
          await db.from('cal_equipe_membros').insert(novasChapas.map(ch=>({equipe_id:equipeId,chapa:ch})));
        }
        showToast('Equipe atualizada!','ok');
        this._fecharModal();
        await this._carregar();
      },'Salvar');

    setTimeout(()=>{
      document.getElementById('ca-eq-excluir')?.addEventListener('click',async()=>{
        if(!confirm(`Excluir "${eq?.nome}" e toda a fila?`)) return;
        const db=getDB();
        await db.from('cal_equipes').update({ativo:false}).eq('id',equipeId);
        showToast('Equipe excluída','ok');
        this._fecharModal();
        await this._carregar();
      });
    },50);
  },

  /* ══════════════════════════════════════════════
     MODAL GENÉRICO (mesmo padrão apontamentos.js)
     ══════════════════════════════════════════════ */
  _lbl(txt){ return `<label class="ca-lbl">${txt}</label>`; },

  _modal(titulo,html,onOk=null,btnLabel='Confirmar'){
    this._fecharModal();
    const ov=document.createElement('div'); ov.id='ca-modal-ov';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML=`
      <div style="background:var(--card-bg);border-radius:var(--radius);padding:24px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:var(--shadow-md);font-family:var(--font)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <div style="font-size:14px;font-weight:700;color:#111">${titulo}</div>
          <button id="ca-modal-x" class="ca-icon-btn"><i class="ti ti-x"></i></button>
        </div>
        <div>${html}</div>
        ${onOk?`<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px;padding-top:14px;border-top:1px solid var(--border)">
          <button id="ca-modal-cancel" class="dd-action-btn secondary" style="height:30px;padding:0 14px;font-family:var(--font)">Cancelar</button>
          <button id="ca-modal-ok" class="dd-action-btn primary" style="height:30px;padding:0 16px;font-family:var(--font)">${btnLabel}</button>
        </div>`:''}
      </div>`;
    document.body.appendChild(ov);
    document.getElementById('ca-modal-x').onclick=()=>this._fecharModal();
    document.getElementById('ca-modal-cancel')?.addEventListener('click',()=>this._fecharModal());
    document.getElementById('ca-modal-ok')?.addEventListener('click',async()=>{
      try{ await onOk(); }catch(e){ showToast('Erro: '+e.message,'erro'); console.error(e); }
    });
    ov.addEventListener('click',e=>{ if(e.target===ov) this._fecharModal(); });
  },

  _fecharModal(){ document.getElementById('ca-modal-ov')?.remove(); },
};
