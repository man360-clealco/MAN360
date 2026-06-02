/* ═══════════════════════════════════════════════════════════════
   MAN360 — Programação Caldeiraria v5
   Padrão: window.Modulos.cal_acomp = { init(container) }
   ═══════════════════════════════════════════════════════════════ */

window.Modulos = window.Modulos || {};
window.Modulos.cal_acomp = (() => {

  /* ── Âncora ── */
  const ANCORA_SEMANA = 9;
  const ANCORA_DATA   = new Date(2026, 4, 25, 12, 0, 0);
  const HH_NORMAL = 7.333;
  const HH_HE     = 9;

  function semanaAtual() {
    const h = new Date(); h.setHours(12,0,0,0);
    return ANCORA_SEMANA + Math.floor((h - ANCORA_DATA) / (7*86400000));
  }
  function inicioSemana(s) {
    const d = new Date(ANCORA_DATA);
    d.setDate(d.getDate() + (s - ANCORA_SEMANA)*7);
    d.setHours(0,0,0,0); return d;
  }
  function fimSemana(s) {
    const d = inicioSemana(s); d.setDate(d.getDate()+6); return d;
  }
  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function fmtDia(d) {
    if (!d) return '—';
    const dt = typeof d === 'string' ? new Date(d.includes('T') ? d : d+'T12:00:00') : new Date(d);
    return dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  }
  function fmtDataFull(d) {
    if (!d) return '—';
    const dt = typeof d === 'string' ? new Date(d.includes('T') ? d : d+'T12:00:00') : new Date(d);
    return dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
  }
  function horaAtual() {
    const n=new Date();
    return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  }
  function hoje()  { const d=new Date(); d.setHours(12,0,0,0); return d; }
  function amanha(){ const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+1); return d; }

  /* ── Estado ── */
  const _sem = semanaAtual();
  let _equipes  = [];
  let _fila     = {};
  let _progSem  = [];
  let _aponts   = [];
  let _colabs   = [];
  let _turnos   = {};
  let _escalas  = {};
  let _ferias   = [];
  let _justific = [];
  let _safra    = null;
  let _container = null;

  /* ── Helpers escala/turno ── */
  function projetarFolgas(colab, dataIni, dataFim) {
    const folgas = new Set();
    const esc = _escalas[colab.escala_id]; if (!esc) return folgas;
    const di = new Date(dataIni); di.setHours(12,0,0,0);
    const df = new Date(dataFim); df.setHours(12,0,0,0);
    if (esc.tipo_ciclo === 'ADM') {
      let d = new Date(di);
      while (d <= df) { if (d.getDay()===0||d.getDay()===6) folgas.add(isoDate(d)); d.setDate(d.getDate()+1); }
      return folgas;
    }
    const ancora = colab.data_ref_folga || colab.primeira_folga; if (!ancora) return folgas;
    const ancD = new Date(ancora+'T12:00:00');
    const ciclo = (esc.dias_trabalho||5)+1;
    let d = new Date(di);
    while (d <= df) {
      const diff = Math.round((d-ancD)/86400000);
      const pos  = ((diff%ciclo)+ciclo)%ciclo;
      if (pos===esc.dias_trabalho) folgas.add(isoDate(d));
      d.setDate(d.getDate()+1);
    }
    return folgas;
  }

  function hhDiaMembro(chapa, data, heAtivo) {
    const c = _colabs.find(x=>(x.cracha||x.chapa)===chapa);
    if (!c || !c.turno_id || !c.escala_id) return 0;
    const iso = isoDate(data);
    if (_ferias.some(f=>f.chapa===chapa&&iso>=f.data_inicio&&iso<=f.data_fim)) return 0;
    if (_justific.some(j=>j.chapa===chapa&&iso>=j.data_inicio&&iso<=j.data_fim)) return 0;
    const ini = inicioSemana(_sem); const fim = fimSemana(_sem+1);
    const folgas = projetarFolgas(c, ini, fim);
    if (folgas.has(iso)) return 0;
    return heAtivo ? HH_HE : HH_NORMAL;
  }

  function hhEquipeDia(equipe, data) {
    return (equipe.membros||[]).reduce((s,m)=>s+hhDiaMembro(m.chapa,data,equipe.he_ativo),0);
  }

  function hhEquipeSemana(equipe, semana) {
    let total=0; const ini=inicioSemana(semana);
    for (let i=0;i<7;i++) { const d=new Date(ini); d.setDate(d.getDate()+i); total+=hhEquipeDia(equipe,d); }
    return total;
  }

  function isFolga(equipe, data) {
    return hhEquipeDia(equipe, data) === 0;
  }

  /* Verifica se serviço está atrasado:
     tempo decorrido > hh_previsto considerando capacidade diária */
  function calcularAtraso(item, equipe) {
    if (!item.iniciado_em || item.status !== 'em_execucao') return null;
    const ini = new Date(item.iniciado_em);
    const hj  = hoje();
    let hhDecorrido = 0;
    let d = new Date(ini); d.setHours(12,0,0,0);
    while (d <= hj) {
      hhDecorrido += hhEquipeDia(equipe, d);
      d.setDate(d.getDate()+1);
    }
    const prev = item.hh_previsto || 0;
    if (hhDecorrido > prev && prev > 0) return hhDecorrido - prev;
    return null;
  }

  /* ── Calcular estado de cada dia no Gantt (14 dias) ── */
  function calcularGanttEquipe(equipe) {
    const hjIso = isoDate(hoje());
    const dias  = [];
    const fila  = (_fila[equipe.id]||[]).filter(i=>i.status!=='encerrado'&&i.status!=='interrompido');

    // Distribuir fila nos dias úteis a partir de hoje
    let itemIdx=0, hhRestItem=0;

    for (let s=0; s<2; s++) {
      const semana = _sem + s;
      const ini = inicioSemana(semana);
      for (let i=0;i<7;i++) {
        const d = new Date(ini); d.setDate(d.getDate()+i);
        const iso = isoDate(d);
        const folga = isFolga(equipe, d);
        const passado = iso < hjIso;
        const ehHoje  = iso === hjIso;

        if (folga) { dias.push({iso,semana,estado:'folga'}); continue; }
        if (passado) { dias.push({iso,semana,estado:'passado'}); continue; }

        // Dia futuro ou hoje — distribuir fila
        const hhDisp = hhEquipeDia(equipe, d);
        let hhRestDia = hhDisp;
        let tiposDia = [];

        while (hhRestDia > 0 && itemIdx < fila.length) {
          if (hhRestItem === 0) hhRestItem = fila[itemIdx].hh_previsto || HH_NORMAL;
          const usado = Math.min(hhRestDia, hhRestItem);
          tiposDia.push({tipo:fila[itemIdx].tipo, hh:usado});
          hhRestDia -= usado; hhRestItem -= usado;
          if (hhRestItem <= 0) { hhRestItem=0; itemIdx++; }
        }

        if (!tiposDia.length) {
          dias.push({iso,semana,estado:'disponivel'}); continue;
        }

        // Verificar atraso no dia atual
        const emExec = fila.find(i=>i.status==='em_execucao');
        const atraso = emExec ? calcularAtraso(emExec, equipe) : null;
        if (ehHoje && atraso && atraso > 0) {
          dias.push({iso,semana,estado:'atrasado'}); continue;
        }

        // Estouro se itemIdx ainda tem itens após preencher o dia
        const hhUsado = tiposDia.reduce((s,f)=>s+f.hh,0);
        if (hhUsado >= hhDisp && itemIdx < fila.length) {
          dias.push({iso,semana,estado:'estouro'}); continue;
        }

        // Tipo predominante
        const pred = tiposDia.reduce((a,b)=>b.hh>a.hh?b:a);
        dias.push({iso,semana,estado:'alocado',tipo:pred.tipo});
      }
    }
    return dias;
  }

  /* ══════════════════════════════════════
     CARREGAR DADOS
  ══════════════════════════════════════ */
  async function carregarTudo() {
    const db  = getDB();
    const ano = inicioSemana(_sem).getFullYear();
    const ini = isoDate(inicioSemana(_sem));
    const fim = isoDate(fimSemana(_sem+1)); // 2 semanas

    const {data:safrasRaw} = await db.from('programacao_semanal').select('safra').not('safra','is',null);
    const safras = [...new Set((safrasRaw||[]).map(r=>r.safra).filter(Boolean))].sort().reverse();
    if (!_safra && safras.length) _safra = safras[0];

    const {data:colabs} = await db.from('apt_colaboradores').select('*').eq('modalidade','CAL');
    _colabs = colabs||[];

    const {data:turnos}  = await db.from('apt_turnos').select('*');
    const {data:escalas} = await db.from('apt_escalas').select('*');
    _turnos={}; (turnos||[]).forEach(t=>{_turnos[t.id]=t;});
    _escalas={}; (escalas||[]).forEach(e=>{_escalas[e.id]=e;});

    const {data:ferias}  = await db.from('apt_ferias').select('*').lte('data_inicio',fim).gte('data_fim',ini);
    const {data:just}    = await db.from('apt_justificativas').select('*').lte('data_inicio',fim).gte('data_fim',ini);
    _ferias=ferias||[]; _justific=just||[];

    const {data:eqs} = await db.from('cal_equipes').select('*').eq('ativo',true);
    const {data:mbs} = await db.from('cal_equipe_membros').select('*');
    _equipes = (eqs||[]).map(e=>({
      ...e,
      he_ativo: e.he_ativo||false,
      membros: (mbs||[]).filter(m=>m.equipe_id===e.id).map(m=>({chapa:m.chapa,nome:m.nome}))
    }));

    const ano1 = inicioSemana(_sem).getFullYear();
    const {data:fila}  = await db.from('cal_fila').select('*')
      .eq('semana',_sem).eq('ano',ano1).order('ordem',{ascending:true});
    _fila={};
    (fila||[]).forEach(item=>{
      if (!_fila[item.equipe_id]) _fila[item.equipe_id]=[];
      _fila[item.equipe_id].push(item);
    });

    if (_sem===semanaAtual()) await migrarPendentes(ano1);

    const {data:prog} = await db.from('programacao_semanal').select('*')
      .eq('semana',_sem).eq('ano',ano1).like('equipe','CAL%');
    _progSem = prog||[];

    const iniApt = isoDate(inicioSemana(_sem));
    const fimApt = isoDate(fimSemana(_sem));
    const {data:apts} = await db.from('apontamentos').select('*')
      .gte('data_apontamento',iniApt).lte('data_apontamento',fimApt);
    _aponts = apts||[];
  }

  async function migrarPendentes(ano) {
    const db=getDB(); const semAnt=_sem-1;
    const anoAnt=inicioSemana(semAnt).getFullYear();
    const {data:antigos}=await db.from('cal_fila').select('*')
      .eq('semana',semAnt).eq('ano',anoAnt).in('status',['pendente','aguardando_inicio']);
    if (!antigos||!antigos.length) return;
    for (const item of antigos) {
      const jaExiste=(_fila[item.equipe_id]||[]).some(i=>i.os===item.os&&i.cod_servico===item.cod_servico);
      if (jaExiste) continue;
      const ordem=(_fila[item.equipe_id]||[]).length+1;
      const {data}=await db.from('cal_fila').insert({
        equipe_id:item.equipe_id,semana:_sem,ano,os:item.os,
        cod_servico:item.cod_servico,desc_servico:item.desc_servico,
        hh_previsto:item.hh_previsto,tipo:item.tipo,ordem,
        status:'pendente',vinculado:item.vinculado
      }).select().single();
      if (data) { if (!_fila[item.equipe_id]) _fila[item.equipe_id]=[]; _fila[item.equipe_id].push(data); }
    }
  }

  /* ══════════════════════════════════════
     PERSISTÊNCIA
  ══════════════════════════════════════ */
  async function salvarOrdem(equipeId) {
    const db=getDB(); const fila=_fila[equipeId]||[];
    for (let i=0;i<fila.length;i++) {
      if (!fila[i]||!fila[i].id) continue;
      await db.from('cal_fila').update({ordem:i+1}).eq('id',fila[i].id);
    }
  }

  async function atualizarStatus(id,status,extra={}) {
    const db=getDB(); const nid=parseInt(id); const p={status,...extra};
    await db.from('cal_fila').update(p).eq('id',nid);
    for (const eqId in _fila) {
      const idx=_fila[eqId].findIndex(i=>parseInt(i.id)===nid);
      if (idx>=0) { Object.assign(_fila[eqId][idx],p); break; }
    }
  }

  async function inserirNaFila(equipeId,item,posicao) {
    const db=getDB(); const ano=inicioSemana(_sem).getFullYear();
    if (!_fila[equipeId]) _fila[equipeId]=[];
    const fila=_fila[equipeId];
    const {data,error}=await db.from('cal_fila').insert({
      equipe_id:equipeId,semana:_sem,ano,ordem:fila.length+1,...item
    }).select().single();
    if (error||!data) { console.error('inserirNaFila:',error); return null; }
    if (posicao==='fim') { fila.push(data); }
    else {
      const pos = posicao==='inicio' ? 0 : (typeof posicao==='number' ? posicao : 0);
      fila.splice(pos,0,data);
      await salvarOrdem(equipeId);
    }
    return data;
  }

  async function removerDaFila(id) {
    const db=getDB(); const nid=parseInt(id);
    await db.from('cal_fila').delete().eq('id',nid);
    for (const eqId in _fila) _fila[eqId]=_fila[eqId].filter(i=>parseInt(i.id)!==nid);
  }

  async function toggleHE(equipeId) {
    const db=getDB();
    const eq=_equipes.find(e=>e.id===equipeId); if (!eq) return;
    eq.he_ativo=!eq.he_ativo;
    await db.from('cal_equipes').update({he_ativo:eq.he_ativo}).eq('id',equipeId);
    await recarregarDados();
  }

  /* ══════════════════════════════════════
     HTML — OVERVIEW
  ══════════════════════════════════════ */
  function htmlOverview() {
    // KPIs: só OS programadas CAL da semana atual
    const progTotal  = _progSem.length;
    const osNaFila   = new Set();
    for (const eqId in _fila) for (const item of _fila[eqId]) if(item.os) osNaFila.add(item.os+'|'+(item.cod_servico||''));
    const encerrados = Object.values(_fila).flat().filter(i=>i.status==='encerrado');
    const encOS      = encerrados.length;
    const encHH      = encerrados.reduce((s,i)=>s+(i.hh_previsto||0),0);
    const progHH     = _progSem.reduce((s,p)=>s+(p.hh_previsto||0),0);
    const pctOS      = progTotal>0 ? Math.round(encOS/progTotal*100) : 0;
    const pctHH      = progHH>0   ? Math.round(encHH/progHH*100)   : 0;

    let hhDisp=0, hhAloc=0;
    for (const eq of _equipes) {
      hhDisp += hhEquipeSemana(eq,_sem);
      hhAloc += (_fila[eq.id]||[]).filter(i=>i.status!=='encerrado'&&i.status!=='interrompido').reduce((s,i)=>s+(i.hh_previsto||0),0);
    }

    const ini = fmtDataFull(inicioSemana(_sem));
    const fim = fmtDataFull(fimSemana(_sem));

    return `
      <div class="cag-overview">
        <div class="cag-ov-hdr">
          <span class="cag-ov-title"><i class="ti ti-layout-dashboard"></i> Semana ${_sem} · ${ini} – ${fim}</span>
          <span class="cag-ov-sub">Caldeiraria · CAL1 · CAL2 · CAL3</span>
        </div>
        <div class="cag-kpi-grid">
          <div class="cag-kpi">
            <div class="cag-kpi-lbl">Aderência Proj. (HH)</div>
            <div class="cag-kpi-val" style="color:${pctHH>=70?'var(--green)':pctHH>=40?'var(--amber)':'var(--red)'}">${pctHH}%</div>
            <div class="cag-kpi-sub">${encHH.toFixed(0)} HH enc. / ${progHH.toFixed(0)} HH prog.</div>
            <div class="cag-kpi-bar"><div class="cag-kpi-fill" style="width:${pctHH}%;background:${pctHH>=70?'var(--green)':pctHH>=40?'var(--amber)':'var(--red)'}"></div></div>
          </div>
          <div class="cag-kpi">
            <div class="cag-kpi-lbl">Aderência Proj. (OS)</div>
            <div class="cag-kpi-val" style="color:${pctOS>=70?'var(--green)':pctOS>=40?'var(--amber)':'var(--red)'}">${pctOS}%</div>
            <div class="cag-kpi-sub">${encOS} enc. / ${progTotal} OS programadas</div>
            <div class="cag-kpi-bar"><div class="cag-kpi-fill" style="width:${pctOS}%;background:${pctOS>=70?'var(--green)':pctOS>=40?'var(--amber)':'var(--red)'}"></div></div>
          </div>
          <div class="cag-kpi">
            <div class="cag-kpi-lbl">HH Disponível</div>
            <div class="cag-kpi-val" style="color:var(--blue)">${hhDisp.toFixed(0)}h</div>
            <div class="cag-kpi-sub">${_equipes.length} equipes · semana atual</div>
            <div class="cag-kpi-bar"><div class="cag-kpi-fill" style="width:100%;background:var(--blue);opacity:.25"></div></div>
          </div>
          <div class="cag-kpi">
            <div class="cag-kpi-lbl">HH Programado</div>
            <div class="cag-kpi-val">${progHH.toFixed(0)}h</div>
            <div class="cag-kpi-sub">Da programação semanal</div>
            <div class="cag-kpi-bar"><div class="cag-kpi-fill" style="width:${hhDisp>0?Math.min(100,Math.round(progHH/hhDisp*100)):0}%;background:#9ca3af"></div></div>
          </div>
          <div class="cag-kpi">
            <div class="cag-kpi-lbl">HH Alocado</div>
            <div class="cag-kpi-val" style="color:${hhAloc>hhDisp?'var(--red)':'var(--amber)'}">${hhAloc.toFixed(0)}h</div>
            <div class="cag-kpi-sub">Nas filas · ${hhDisp>0?Math.round(hhAloc/hhDisp*100):0}% da cap.</div>
            <div class="cag-kpi-bar"><div class="cag-kpi-fill" style="width:${hhDisp>0?Math.min(100,Math.round(hhAloc/hhDisp*100)):0}%;background:${hhAloc>hhDisp?'var(--red)':'var(--amber)'}"></div></div>
          </div>
        </div>
      </div>`;
  }

  /* ── Faixa de situação ── */
  function htmlSituacao() {
    const hjIso  = isoDate(hoje());
    const amhIso = isoDate(amanha());
    const folgaHj=[], folgaAmh=[], emFerias=[];

    for (const c of _colabs) {
      if (!c.turno_id||!c.escala_id) continue;
      const id=c.cracha||c.chapa;
      if (_ferias.some(f=>f.chapa===id&&hjIso>=f.data_inicio&&hjIso<=f.data_fim)) { emFerias.push(c.nome||id); continue; }
      const fh=projetarFolgas(c,inicioSemana(_sem),fimSemana(_sem+1));
      if (fh.has(hjIso))  { folgaHj.push(c.nome||id); continue; }
      if (fh.has(amhIso)) folgaAmh.push(c.nome||id);
    }

    const emExec=[];
    for (const eq of _equipes) for (const item of (_fila[eq.id]||[])) {
      if (item.status==='em_execucao') emExec.push({...item,equipeNome:eq.nome,equipe:eq});
    }

    const atrasados=[];
    for (const {equipe,...item} of emExec) {
      const atr=calcularAtraso(item,equipe);
      if (atr&&atr>0) atrasados.push({...item,equipeNome:item.equipeNome,atraso:atr});
    }

    const tags=(arr,cls)=>arr.length ? arr.map(n=>`<span class="cag-sit-tag ${cls}">${n.split(' ')[0]}</span>`).join('') : '<span class="cag-sit-tag vazio">—</span>';

    return `
      <div class="cag-situacao">
        <div class="cag-sit-grupo">
          <div class="cag-sit-titulo"><i class="ti ti-calendar-off"></i> Folga hoje</div>
          <div class="cag-sit-tags">${tags(folgaHj,'folga')}</div>
        </div>
        <div class="cag-sit-sep"></div>
        <div class="cag-sit-grupo">
          <div class="cag-sit-titulo"><i class="ti ti-calendar-clock"></i> Folga amanhã</div>
          <div class="cag-sit-tags">${tags(folgaAmh,'folga-amh')}</div>
        </div>
        <div class="cag-sit-sep"></div>
        <div class="cag-sit-grupo">
          <div class="cag-sit-titulo"><i class="ti ti-beach"></i> Férias</div>
          <div class="cag-sit-tags">${tags(emFerias,'ferias')}</div>
        </div>
        <div class="cag-sit-sep"></div>
        <div class="cag-sit-grupo" style="min-width:200px">
          <div class="cag-sit-titulo"><i class="ti ti-player-play"></i> Em andamento</div>
          ${emExec.length ? emExec.map(i=>`
            <div class="cag-sit-exec">
              <div class="cag-sit-exec-dot"></div>
              <div>
                <div class="cag-sit-exec-name">${i.os||'S/O'} · ${(i.desc_servico||'').substring(0,28)}</div>
                <div class="cag-sit-exec-eq">${i.equipeNome}</div>
              </div>
            </div>`).join('') : '<span class="cag-sit-tag vazio">Nenhum</span>'}
        </div>
        ${atrasados.length ? `
        <div class="cag-sit-sep"></div>
        <div class="cag-sit-grupo" style="min-width:200px">
          <div class="cag-sit-titulo" style="color:var(--amber)"><i class="ti ti-alert-triangle"></i> Atrasados</div>
          ${atrasados.map(i=>`
            <div class="cag-sit-exec">
              <div class="cag-sit-exec-dot" style="background:var(--amber)"></div>
              <div>
                <div class="cag-sit-exec-name" style="color:var(--amber)">${i.os||'S/O'} · ${(i.desc_servico||'').substring(0,28)}</div>
                <div class="cag-sit-exec-eq">+${i.atraso.toFixed(0)}h além do previsto · ${i.equipeNome}</div>
              </div>
            </div>`).join('')}
        </div>` : ''}
      </div>`;
  }

  /* ── Gantt ── */
  function htmlGantt() {
    const DIAS_LABEL = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
    const hjIso = isoDate(hoje());

    // Cabeçalho de dias
    let headSems = '';
    for (let s=0;s<2;s++) {
      const semana=_sem+s;
      const ini=inicioSemana(semana);
      const fim=fimSemana(semana);
      const dias=DIAS_LABEL.map((_,i)=>{
        const d=new Date(ini); d.setDate(d.getDate()+i);
        const iso=isoDate(d);
        const cls=iso===hjIso?' cag-gd-hoje':'';
        return `<div class="cag-gd-hdr${cls}">${DIAS_LABEL[i]}<br>${d.getDate()}/${d.getMonth()+1}</div>`;
      }).join('');
      headSems+=`<div class="cag-gw-col${s===0?' border-right':''}">
        <div class="cag-gw-lbl">Sem ${semana} · ${fmtDia(ini)}–${fmtDia(fim)}</div>
        <div class="cag-gw-days">${dias}</div>
      </div>`;
    }

    // Linhas de equipe
    const linhas = _equipes.map(eq=>{
      const gantt = calcularGanttEquipe(eq);
      const hhD   = hhEquipeSemana(eq,_sem);
      const hhA   = (_fila[eq.id]||[]).filter(i=>i.status!=='encerrado'&&i.status!=='interrompido').reduce((s,i)=>s+(i.hh_previsto||0),0);
      const estouro = hhA > hhD;

      const celulas = gantt.map((dia,idx)=>{
        const cor = {
          passado:   'var(--green)',
          alocado:   dia.tipo==='mcu'?'var(--red)':dia.tipo==='fora_prog'?'var(--amber)':'var(--blue)',
          atrasado:  'var(--amber)',
          estouro:   'var(--red)',
          disponivel:'#fff',
          folga:     'transparent',
        }[dia.estado]||'#fff';

        const barBorder = dia.estado==='disponivel' ? 'border:1px solid var(--border)' : '';
        const folga     = dia.estado==='folga';
        const borderR   = idx===6 ? 'border-right:2px solid var(--border)' : '';

        return `<div class="cag-gcell${folga?' folga':''}" style="${borderR}">
          ${folga
            ? '<div class="cag-gcell-folga-line"></div>'
            : `<div class="cag-gcell-bar" style="background:${cor};${barBorder}"></div>`
          }
          ${dia.iso===hjIso?'<div class="cag-hoje-mark"></div>':''}
        </div>`;
      }).join('');

      const hhInfoCor = estouro ? 'color:#dc2626;font-weight:700' : 'color:#9ca3af';
      const hhInfo    = estouro
        ? `${hhA.toFixed(0)}h · +${(hhA-hhD).toFixed(0)}h exc.`
        : `${hhA.toFixed(0)}h / ${hhD.toFixed(0)}h`;

      return `<div class="cag-grow">
        <div class="cag-geq-cell">
          <div class="cag-geq-name">
            ${eq.nome}
            <button class="cag-he-btn${eq.he_ativo?' on':''}" data-action="toggle-he" data-eq="${eq.id}" title="Horas Extras">HE</button>
          </div>
          <div class="cag-geq-membros">${(eq.membros||[]).map(m=>(m.nome||m.chapa||'').split(' ')[0]).join(' · ')}</div>
          <div class="cag-geq-hh" style="${hhInfoCor}">${hhInfo}</div>
        </div>
        <div class="cag-gdays">${celulas}</div>
      </div>`;
    }).join('');

    return `
      <div class="cag-gantt">
        <div class="cag-gantt-hdr">
          <span class="cag-gantt-title"><i class="ti ti-chart-gantt"></i> Gantt · Sem ${_sem} + Sem ${_sem+1}</span>
          <div class="cag-gantt-leg">
            <span class="cag-gleg"><span class="cag-gleg-dot" style="background:var(--green)"></span>Realizado</span>
            <span class="cag-gleg"><span class="cag-gleg-dot" style="background:var(--blue)"></span>Programado</span>
            <span class="cag-gleg"><span class="cag-gleg-dot" style="background:var(--amber)"></span>Atrasado/NPG</span>
            <span class="cag-gleg"><span class="cag-gleg-dot" style="background:var(--red)"></span>MCU/Estouro</span>
            <span class="cag-gleg"><span class="cag-gleg-dot" style="background:#fff;border:1px solid var(--border)"></span>Disponível</span>
          </div>
        </div>
        <div class="cag-gantt-scroll">
          <div class="cag-gantt-inner">
            <div class="cag-gantt-cols-hdr">
              <div class="cag-geq-hdr">Equipe</div>
              <div class="cag-gweeks-hdr">${headSems}</div>
            </div>
            ${linhas||'<div style="padding:20px;color:#9ca3af;font-size:12px">Nenhuma equipe cadastrada.</div>'}
          </div>
        </div>
      </div>`;
  }

  /* ── Dispatch Board ── */
  function badgeTipo(tipo) {
    const m={programado:['PRG','var(--blue)','#dbeafe'],fora_prog:['NPG','var(--amber)','#fef3c7'],mcu:['MCU','var(--red)','#fee2e2']};
    const [l,c,b]=m[tipo]||['?','#9ca3af','#f3f4f6'];
    return `<span class="cag-badge" style="color:${c};background:${b}">${l}</span>`;
  }

  function htmlCard(item, equipeId, pos, total) {
    const sc={programado:'var(--blue)',fora_prog:'var(--amber)',mcu:'var(--red)'}[item.tipo]||'#9ca3af';
    const isEnc=item.status==='encerrado', isExec=item.status==='em_execucao';
    const isInter=item.status==='interrompido', isAguard=item.status==='aguardando_inicio';
    const eq=_equipes.find(e=>e.id===equipeId);
    const atraso=isExec&&eq ? calcularAtraso(item,eq) : null;

    let cc='cag-dcard';
    if (isEnc) cc+=' concluido'; if (isExec) cc+=' em-exec';
    if (isInter) cc+=' interrompido'; if (isAguard) cc+=' aguardando';
    if (atraso) cc+=' atrasado';

    const execBar=isExec?`<div class="cag-dbar-exec"><div class="cag-dbar-dot"></div> Em execução · ${item.iniciado_em?fmtDia(item.iniciado_em):'—'}</div>`:'';
    const aguardBar=isAguard?`<div class="cag-dbar-aguard"><i class="ti ti-clock"></i> Aguardando início</div>`:'';
    const atrasoBar=atraso?`<div class="cag-dbar-atraso"><i class="ti ti-alert-triangle"></i> Atrasado +${atraso.toFixed(0)}h</div>`:'';
    const interBar=isInter&&item.obs?`<div class="cag-dbar-inter"><i class="ti ti-player-pause"></i> ${item.obs}</div>`:'';
    const semOsBar=(!item.os||!item.vinculado)?`<div class="cag-dbar-semOs"><i class="ti ti-alert-circle"></i> Não vinculada</div>`:'';

    let botoes='';
    if (isEnc) {
      botoes=`<button class="cag-da green" data-action="reabrir" data-id="${item.id}"><i class="ti ti-rotate-clockwise"></i> Reabrir</button>`;
    } else if (isExec) {
      botoes=`<button class="cag-da green" data-action="concluir" data-id="${item.id}"><i class="ti ti-check"></i> Concluir</button>
        <button class="cag-da amber" data-action="interromper" data-id="${item.id}"><i class="ti ti-player-pause"></i> Interromper</button>
        <button class="cag-da blue" data-action="mover-equipe" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-transfer-right"></i> Mover</button>
        <button class="cag-da ghost" data-action="remover" data-id="${item.id}"><i class="ti ti-x"></i></button>`;
    } else if (isInter) {
      botoes=`<button class="cag-da blue" data-action="recolocar" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-rotate-clockwise"></i> Recolocar</button>
        <button class="cag-da ghost" data-action="remover" data-id="${item.id}"><i class="ti ti-x"></i></button>`;
    } else if (isAguard) {
      botoes=`<button class="cag-da green" data-action="iniciar" data-id="${item.id}"><i class="ti ti-player-play"></i> Informar início</button>
        <button class="cag-da blue" data-action="mover-equipe" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-transfer-right"></i> Mover</button>
        <button class="cag-da ghost" data-action="remover" data-id="${item.id}"><i class="ti ti-x"></i></button>`;
    } else {
      botoes=`<button class="cag-da green" data-action="iniciar" data-id="${item.id}"><i class="ti ti-player-play"></i> Iniciar</button>
        <button class="cag-da blue" data-action="mover-equipe" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-transfer-right"></i> Mover</button>
        <button class="cag-da ghost" data-action="remover" data-id="${item.id}"><i class="ti ti-x"></i></button>`;
      if (!item.os||!item.vinculado) botoes+=`<button class="cag-da amber" data-action="vincular" data-id="${item.id}"><i class="ti ti-link"></i></button>`;
    }

    const hhTxt=item.hh_previsto?`<span class="cag-dhh"><i class="ti ti-clock"></i> ${item.hh_previsto}h</span>`:'';
    const posBtn=(!isEnc&&!isExec&&!isInter)?`<div class="cag-pos-btns">
      <button class="cag-pos-btn" data-action="mover-cima" data-id="${item.id}" data-eq="${equipeId}" ${pos===0?'disabled':''}>▲</button>
      <button class="cag-pos-btn" data-action="mover-baixo" data-id="${item.id}" data-eq="${equipeId}" ${pos===total-1?'disabled':''}>▼</button>
    </div>`:'';

    return `<div class="${cc}" data-id="${item.id}" data-eq="${equipeId}">
      <div class="cag-dstripe" style="background:${sc}"></div>
      <div style="display:flex;align-items:stretch;flex:1;overflow:hidden">
        <div class="cag-dbody">
          ${execBar}${aguardBar}${atrasoBar}${interBar}
          <div class="cag-dhead">
            <span class="cag-dos-num">${item.os||'sem nº'}</span>
            <span class="cag-dos-desc">${item.desc_servico||'—'}</span>
          </div>
          ${semOsBar}
        </div>
        ${posBtn}
      </div>
      <div class="cag-dexpand">
        <div class="cag-dexpand-hh">${hhTxt} ${badgeTipo(item.tipo)}</div>
        <div class="cag-dact-row">${botoes}</div>
      </div>
    </div>`;
  }

  function htmlDispatch() {
    const cols = _equipes.map(eq=>{
      const fila=_fila[eq.id]||[];
      const hhD=hhEquipeSemana(eq,_sem);
      const hhA=fila.filter(i=>i.status!=='encerrado'&&i.status!=='interrompido').reduce((s,i)=>s+(i.hh_previsto||0),0);
      const estouro=hhA>hhD;

      let hhAcum=0, linhaOk=false;
      const ativos=fila.filter(i=>i.status!=='encerrado'&&i.status!=='interrompido');
      const encerrados=fila.filter(i=>i.status==='encerrado'||i.status==='interrompido');

      const cardsAtivos=ativos.map((item,idx)=>{
        hhAcum+=item.hh_previsto||0;
        let div='';
        if (!linhaOk&&hhAcum>hhD) {
          linhaOk=true;
          div=`<div class="cag-dover-line"><div class="cag-dover-l"></div><div class="cag-dover-lbl"><i class="ti ti-alert-triangle"></i> Estouro</div><div class="cag-dover-l"></div></div>`;
        }
        return div+htmlCard(item,eq.id,idx,ativos.length);
      }).join('');

      const cardsEnc=encerrados.length>0?`
        <div class="cag-denc-toggle" data-enc-eq="${eq.id}">
          <i class="ti ti-chevron-down"></i> ${encerrados.length} encerrado${encerrados.length>1?'s':''}
        </div>
        <div class="cag-denc-body" id="denc-${eq.id}" style="display:none">
          ${encerrados.map((item,idx)=>htmlCard(item,eq.id,idx,encerrados.length)).join('')}
        </div>`:'' ;

      return `<div class="cag-dcol" data-eq-id="${eq.id}">
        <div class="cag-dcol-hdr${estouro?' estouro':''}">
          <div class="cag-dcol-nome">
            ${eq.nome}
            <button class="cag-he-btn${eq.he_ativo?' on':''}" data-action="toggle-he" data-eq="${eq.id}">HE</button>
            <button class="cag-dcfg" data-action="config-equipe" data-eq="${eq.id}"><i class="ti ti-settings"></i></button>
          </div>
          <div class="cag-dcol-membros">${(eq.membros||[]).map(m=>`<span class="cag-dmembro">${(m.nome||m.chapa||'').split(' ')[0]}</span>`).join('')}</div>
          <div class="cag-dcol-hh" style="${estouro?'color:#f87171;font-weight:700':''}">${hhA.toFixed(0)}h${estouro?` · +${(hhA-hhD).toFixed(0)}h`:` / ${hhD.toFixed(0)}h disp.`}</div>
        </div>
        <div class="cag-dfila" id="dfila-${eq.id}">
          ${cardsAtivos}
          ${cardsEnc}
          <button class="cag-dadd" data-action="add-os" data-eq="${eq.id}"><i class="ti ti-plus"></i> Inserir OS</button>
        </div>
      </div>`;
    }).join('');

    return `<div class="cag-dispatch">
      <div class="cag-dispatch-hdr">
        <span class="cag-dispatch-title"><i class="ti ti-layout-columns"></i> Dispatch Board · Fila de Serviços</span>
        <button class="cag-btn-primary" id="btn-nova-equipe"><i class="ti ti-plus"></i> Nova equipe</button>
      </div>
      <div class="cag-dispatch-cols">${cols||'<div style="padding:24px;color:#9ca3af">Nenhuma equipe cadastrada.</div>'}</div>
    </div>`;
  }

  /* ── Serviços Programados ── */
  function htmlProgSemana() {
    if (!_progSem.length) return `<div class="cag-lista-empty">Sem serviços programados para esta semana</div>`;
    const osNaFila=new Set();
    for (const eqId in _fila) for (const item of _fila[eqId]) if(item.os) osNaFila.add(item.os+'|'+(item.cod_servico||''));
    const thead=`<div class="cag-ptr cag-pth"><div class="cag-ptd">OS</div><div class="cag-ptd">Descrição</div><div class="cag-ptd">HH</div><div class="cag-ptd">Cart.</div><div class="cag-ptd">Status</div><div class="cag-ptd"></div></div>`;
    const rows=_progSem.map(p=>{
      const key=p.os+'|'+(p.cod_servico||'');
      const incluso=osNaFila.has(key);
      const badge=incluso?`<span class="cag-badge" style="color:var(--green);background:#dcfce7">Incluso</span>`:`<span class="cag-badge" style="color:#9ca3af;background:#f3f4f6">Não incluso</span>`;
      const dados={os:p.os,cod:p.cod_servico||'',desc:p.desc_servico||'',hh:p.hh_previsto||0,equipe_orig:p.equipe||''};
      const btnIns=`<button class="cag-da blue cag-prog-ins" data-os="${btoa(unescape(encodeURIComponent(JSON.stringify(dados))))}"><i class="ti ti-plus"></i></button>`;
      return `<div class="cag-ptr">
        <div class="cag-ptd" style="font-weight:700">${p.os||'—'}</div>
        <div class="cag-ptd cag-ptd-desc">${p.desc_servico||'—'}</div>
        <div class="cag-ptd">${p.hh_previsto||'—'}</div>
        <div class="cag-ptd">${p.equipe||'—'}</div>
        <div class="cag-ptd">${badge}</div>
        <div class="cag-ptd">${btnIns}</div>
      </div>`;
    }).join('');
    return thead+rows;
  }

  /* ══════════════════════════════════════
     RENDERIZAR
  ══════════════════════════════════════ */
  function renderizar() {
    _container.innerHTML = `<div class="cag-mod">
      ${htmlOverview()}
      ${htmlSituacao()}
      ${htmlGantt()}
      ${htmlDispatch()}
      <div class="cag-plista">
        <div class="cag-ptoggle" id="cag-ptoggle">
          <i class="ti ti-calendar-week"></i>
          Serviços Programados da Semana
          <span class="cag-plbadge">${_progSem.length}</span>
          <i class="ti ti-chevron-down cag-pchev" style="margin-left:auto"></i>
        </div>
        <div class="cag-pbody" id="cag-pbody">${htmlProgSemana()}</div>
      </div>
    </div>`;
    bindEventos();
  }

  /* ══════════════════════════════════════
     EVENTOS
  ══════════════════════════════════════ */
  function bindEventos() {
    const c=_container;

    // Nova equipe
    c.querySelector('#btn-nova-equipe').addEventListener('click',()=>abrirModalEquipe(null));

    // Lista programados
    c.querySelector('#cag-ptoggle').addEventListener('click',()=>{
      const body=c.querySelector('#cag-pbody');
      const chev=c.querySelector('.cag-pchev');
      const open=body.classList.toggle('open');
      chev.style.transform=open?'rotate(180deg)':'';
    });

    // Encerrados toggle
    c.querySelectorAll('.cag-denc-toggle').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const id=btn.dataset.encEq;
        const body=c.querySelector(`#denc-${id}`);
        if (body) body.style.display=body.style.display==='none'?'block':'none';
      });
    });

    // Cards — expandir
    c.querySelectorAll('.cag-dbody').forEach(body=>{
      let tx=0,ty=0,moved=false;
      body.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;moved=false;},{passive:true});
      body.addEventListener('touchmove',e=>{if(Math.abs(e.touches[0].clientX-tx)>8||Math.abs(e.touches[0].clientY-ty)>8)moved=true;},{passive:true});
      body.addEventListener('touchend',()=>{if(!moved)body.closest('.cag-dcard').classList.toggle('open');});
      body.addEventListener('click',e=>{if(!e.target.closest('button'))body.closest('.cag-dcard').classList.toggle('open');});
    });

    // Ações
    c.querySelectorAll('[data-action]').forEach(btn=>{
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        const {action,id,eq}=btn.dataset;
        const iid=id?parseInt(id):null; const ieq=eq?parseInt(eq):null;
        switch(action){
          case 'iniciar':       acaoIniciar(iid);break;
          case 'concluir':      acaoConcluir(iid);break;
          case 'reabrir':       acaoReabrir(iid);break;
          case 'interromper':   acaoInterromper(iid);break;
          case 'recolocar':     acaoRecolocar(iid,ieq);break;
          case 'remover':       acaoRemover(iid);break;
          case 'mover-equipe':  acaoMoverEquipe(iid,ieq);break;
          case 'mover-cima':    acaoMoverPos(iid,ieq,-1);break;
          case 'mover-baixo':   acaoMoverPos(iid,ieq,+1);break;
          case 'vincular':      acaoVincular(iid);break;
          case 'toggle-he':     toggleHE(ieq);break;
          case 'add-os':        abrirModalOS(ieq);break;
          case 'config-equipe': abrirModalEquipe(ieq);break;
        }
      });
    });

    // Inserir programado na fila
    c.querySelectorAll('.cag-prog-ins').forEach(btn=>{
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        try { const dados=JSON.parse(decodeURIComponent(escape(atob(btn.dataset.os)))); abrirModalInserir(dados); }
        catch(err) { console.error('cag-prog-ins:',err); }
      });
    });
  }

  /* ══════════════════════════════════════
     AÇÕES
  ══════════════════════════════════════ */
  async function acaoIniciar(id) {
    const hora=await modalHora('Hora de início',horaAtual()); if(!hora)return;
    const agora=new Date(); const [h,m]=hora.split(':').map(Number); agora.setHours(h,m,0,0);
    await atualizarStatus(id,'em_execucao',{iniciado_em:agora.toISOString()});
    await recarregarDados();
  }

  async function acaoConcluir(id) {
    const hora=await modalHora('Hora de encerramento',horaAtual()); if(!hora)return;
    const agora=new Date(); const [h,m]=hora.split(':').map(Number); agora.setHours(h,m,0,0);
    await atualizarStatus(id,'encerrado',{encerrado_em:agora.toISOString()});
    let equipeId=null;
    for (const eqId in _fila) if(_fila[eqId].some(i=>parseInt(i.id)===id)){equipeId=parseInt(eqId);break;}
    if (equipeId) {
      const prox=(_fila[equipeId]||[]).find(i=>parseInt(i.id)!==id&&(i.status==='pendente'||i.status==='aguardando_inicio'));
      if (prox&&prox.status==='pendente') await atualizarStatus(prox.id,'aguardando_inicio');
    }
    await recarregarDados();
  }

  async function acaoReabrir(id) { await atualizarStatus(id,'pendente',{encerrado_em:null}); await recarregarDados(); }

  async function acaoInterromper(id) {
    const motivo=await abrirModalOpcoes('Motivo da interrupção',['Falta de Material','Falta de Acesso','Segurança Comprometida']);
    if (!motivo) return;
    let equipeId=null;
    for (const eqId in _fila) if(_fila[eqId].some(i=>parseInt(i.id)===id)){equipeId=parseInt(eqId);break;}
    if (equipeId) {
      const fila=_fila[equipeId]; const idx=fila.findIndex(i=>parseInt(i.id)===id);
      if(idx>=0){const [item]=fila.splice(idx,1);fila.push(item);await salvarOrdem(equipeId);}
    }
    await atualizarStatus(id,'interrompido',{obs:motivo}); await recarregarDados();
  }

  async function acaoRecolocar(id,equipeId) {
    await atualizarStatus(id,'pendente',{obs:null});
    const fila=_fila[equipeId]||[]; const idx=fila.findIndex(i=>parseInt(i.id)===id);
    if(idx>=0){const [item]=fila.splice(idx,1);const pos=fila.findIndex(i=>i.status==='interrompido');pos>=0?fila.splice(pos,0,item):fila.push(item);await salvarOrdem(equipeId);}
    await recarregarDados();
  }

  async function acaoRemover(id) {
    if(!confirm('Remover este serviço da fila?'))return;
    await removerDaFila(id); await recarregarDados();
  }

  async function acaoMoverPos(id,equipeId,delta) {
    const fila=_fila[equipeId]||[];
    const idx=fila.findIndex(i=>parseInt(i.id)===id); if(idx<0)return;
    const novaPos=idx+delta;
    if(novaPos<0||novaPos>=fila.length)return;
    const [item]=fila.splice(idx,1); fila.splice(novaPos,0,item);
    await salvarOrdem(equipeId); await recarregarDados();
  }

  async function acaoMoverEquipe(id,equipeAtualId) {
    const opcoes=_equipes.filter(e=>e.id!==equipeAtualId).map(e=>e.nome);
    if(!opcoes.length){alert('Não há outras equipes.');return;}
    const escolha=await abrirModalOpcoes('Mover para qual equipe?',opcoes); if(!escolha)return;
    const novaEq=_equipes.find(e=>e.nome===escolha); if(!novaEq)return;
    const db=getDB(); const nova_ordem=(_fila[novaEq.id]||[]).length+1;
    await db.from('cal_fila').update({equipe_id:novaEq.id,ordem:nova_ordem}).eq('id',id);
    for (const eqId in _fila){const idx=_fila[eqId].findIndex(i=>parseInt(i.id)===id);if(idx>=0){const [item]=_fila[eqId].splice(idx,1);item.equipe_id=novaEq.id;if(!_fila[novaEq.id])_fila[novaEq.id]=[];_fila[novaEq.id].push(item);break;}}
    await recarregarDados();
  }

  async function acaoVincular(id) {
    const num=prompt('Número da OS:'); if(!num)return;
    const db=getDB(); const os=num.trim().replace(/^0+/,'');
    const {data}=await db.from('ordens_servico').select('os,desc_servico,hh_prev_servico,tipo_atividade').eq('os',os).limit(1).single();
    if(data){const tipo=data.tipo_atividade==='MCU'?'mcu':'programado';await db.from('cal_fila').update({os:data.os,desc_servico:data.desc_servico||undefined,hh_previsto:data.hh_prev_servico||undefined,tipo,vinculado:true}).eq('id',id);}
    else await db.from('cal_fila').update({os,vinculado:false}).eq('id',id);
    await recarregarDados();
  }

  /* ══════════════════════════════════════
     MODAIS
  ══════════════════════════════════════ */
  function modalHora(titulo,padrao) {
    return new Promise(resolve=>{
      const o=document.createElement('div'); o.className='cag-modal-overlay';
      o.innerHTML=`<div class="cag-modal" style="width:260px">
        <div class="cag-modal-titulo">${titulo}</div>
        <input type="time" id="mh" class="cag-form-input" style="font-size:22px;height:48px;text-align:center" value="${padrao}">
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="cag-modal-cancel" style="flex:1">Cancelar</button>
          <button class="cag-btn-primary" id="mh-ok" style="flex:2"><i class="ti ti-check"></i> Confirmar</button>
        </div>
      </div>`;
      o.querySelector('#mh-ok').addEventListener('click',()=>{const v=o.querySelector('#mh').value;o.remove();resolve(v||null);});
      o.querySelector('.cag-modal-cancel').addEventListener('click',()=>{o.remove();resolve(null);});
      o.addEventListener('click',e=>{if(e.target===o){o.remove();resolve(null);}});
      document.body.appendChild(o); o.querySelector('#mh').focus();
    });
  }

  function abrirModalOpcoes(titulo,opcoes) {
    return new Promise(resolve=>{
      const o=document.createElement('div'); o.className='cag-modal-overlay';
      o.innerHTML=`<div class="cag-modal"><div class="cag-modal-titulo">${titulo}</div>
        <div class="cag-modal-opcoes">${opcoes.map((op,i)=>`<button class="cag-modal-opt" data-i="${i}">${op}</button>`).join('')}</div>
        <button class="cag-modal-cancel">Cancelar</button></div>`;
      o.querySelectorAll('.cag-modal-opt').forEach((btn,i)=>{btn.addEventListener('click',()=>{o.remove();resolve(opcoes[i]);});});
      o.querySelector('.cag-modal-cancel').addEventListener('click',()=>{o.remove();resolve(null);});
      o.addEventListener('click',e=>{if(e.target===o){o.remove();resolve(null);}});
      document.body.appendChild(o);
    });
  }

  function abrirModalInserir(dados) {
    const eqOpts=_equipes.map(e=>`<option value="${e.id}">${e.nome}</option>`).join('');
    const o=document.createElement('div'); o.className='cag-modal-overlay';
    o.innerHTML=`<div class="cag-modal" style="width:340px">
      <div class="cag-modal-titulo">Inserir na fila</div>
      <div class="cag-modal-form">
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">${dados.desc}</div>
        <div style="font-size:10px;color:#9ca3af;margin-bottom:10px">${dados.os} · ${dados.hh}h · ${dados.equipe_orig}</div>
        <label class="cag-form-label">Equipe</label>
        <select class="cag-form-input" id="mi-eq" style="height:36px">${eqOpts}</select>
        <label class="cag-form-label" style="margin-top:8px">Posição</label>
        <div class="cag-tipo-opts">
          <button class="cag-tipo-btn" data-pos="fim">Fim da fila</button>
          <button class="cag-tipo-btn active" data-pos="seguida">Em seguida</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="cag-modal-cancel" style="flex:1">Cancelar</button>
        <button class="cag-btn-primary" id="mi-ok" style="flex:2"><i class="ti ti-plus"></i> Inserir</button>
      </div>
    </div>`;
    let posSel='seguida';
    o.querySelectorAll('.cag-tipo-btn').forEach(btn=>{btn.addEventListener('click',()=>{o.querySelectorAll('.cag-tipo-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');posSel=btn.dataset.pos;});});
    o.querySelector('#mi-ok').addEventListener('click',async()=>{
      const equipeId=parseInt(o.querySelector('#mi-eq').value);
      const fila=_fila[equipeId]||[];
      const emExec=fila.find(i=>i.status==='em_execucao');
      const item={os:dados.os,cod_servico:dados.cod||null,desc_servico:dados.desc,hh_previsto:dados.hh||null,tipo:'programado',status:'pendente',vinculado:true};
      if(posSel==='fim'||!emExec){
        await inserirNaFila(equipeId,item,posSel==='fim'?'fim':'inicio');
        o.remove(); await recarregarDados(); return;
      }
      o.remove();
      const opcao=await abrirModalOpcoes(`"${(_equipes.find(e=>e.id===equipeId)||{}).nome||'Equipe'}" tem serviço em execução`,['Só em seguida','Em seguida interrompendo','Concluir e iniciar em seguida']);
      if(!opcao)return;
      if(opcao==='Só em seguida'){
        const pos=fila.findIndex(i=>parseInt(i.id)===parseInt(emExec.id))+1;
        await inserirNaFila(equipeId,item,pos);
      } else if(opcao==='Em seguida interrompendo'){
        const motivo=await abrirModalOpcoes('Motivo',['Falta de Material','Falta de Acesso','Segurança Comprometida','Interrompido para prioridade']);
        const hora=await modalHora('Hora da interrupção',horaAtual()); if(!hora)return;
        const agora=new Date(); const [h,m]=hora.split(':').map(Number); agora.setHours(h,m,0,0);
        const idx=fila.findIndex(i=>parseInt(i.id)===parseInt(emExec.id));
        if(idx>=0){const [it]=fila.splice(idx,1);fila.push(it);await salvarOrdem(equipeId);}
        await atualizarStatus(emExec.id,'interrompido',{obs:motivo||'Interrompido para prioridade'});
        await inserirNaFila(equipeId,{...item,status:'aguardando_inicio'},0);
      } else {
        const hora=await modalHora('Hora conclusão / início',horaAtual()); if(!hora)return;
        const agora=new Date(); const [h,m]=hora.split(':').map(Number); agora.setHours(h,m,0,0);
        await atualizarStatus(emExec.id,'encerrado',{encerrado_em:agora.toISOString()});
        await inserirNaFila(equipeId,{...item,status:'em_execucao',iniciado_em:agora.toISOString()},0);
      }
      await recarregarDados();
    });
    o.querySelector('.cag-modal-cancel').addEventListener('click',()=>o.remove());
    o.addEventListener('click',e=>{if(e.target===o)o.remove();});
    document.body.appendChild(o);
  }

  function abrirModalOS(equipeId) {
    const o=document.createElement('div'); o.className='cag-modal-overlay';
    o.innerHTML=`<div class="cag-modal" style="width:320px">
      <div class="cag-modal-titulo">Inserir Serviço</div>
      <div class="cag-modal-form">
        <label class="cag-form-label">Tipo</label>
        <div class="cag-tipo-opts">
          <button class="cag-tipo-btn active" data-tipo="programado">Prog.</button>
          <button class="cag-tipo-btn" data-tipo="fora_prog">NPG</button>
          <button class="cag-tipo-btn" data-tipo="mcu">MCU</button>
        </div>
        <label class="cag-form-label">Nº OS</label>
        <input type="text" id="mos-num" class="cag-form-input" placeholder="Ex: 1234567 (opcional)">
        <div id="mos-hint" class="cag-form-hint"></div>
        <label class="cag-form-label">Descrição</label>
        <input type="text" id="mos-desc" class="cag-form-input" placeholder="Descrição do serviço">
        <label class="cag-form-label">HH Estimado</label>
        <input type="number" id="mos-hh" class="cag-form-input" placeholder="Ex: 8" min="0" step="0.5">
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="cag-modal-cancel" style="flex:1">Cancelar</button>
        <button class="cag-btn-primary" id="mos-ok" style="flex:2"><i class="ti ti-plus"></i> Adicionar</button>
      </div>
    </div>`;
    let tipoSel='programado';
    o.querySelectorAll('.cag-tipo-btn').forEach(btn=>{btn.addEventListener('click',()=>{o.querySelectorAll('.cag-tipo-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');tipoSel=btn.dataset.tipo;});});
    let _t=null;
    o.querySelector('#mos-num').addEventListener('input',async e=>{
      clearTimeout(_t); const val=e.target.value.trim(); const hint=o.querySelector('#mos-hint');
      if(val.length<4){hint.textContent='';return;}
      _t=setTimeout(async()=>{
        const db=getDB(); const os=val.replace(/^0+/,'');
        const {data}=await db.from('ordens_servico').select('os,desc_servico,hh_prev_servico,tipo_atividade').eq('os',os).limit(1).single();
        if(data){hint.innerHTML=`<span style="color:var(--green)"><i class="ti ti-check"></i> ${data.desc_servico||''}</span>`;o.querySelector('#mos-desc').value=data.desc_servico||'';o.querySelector('#mos-hh').value=data.hh_prev_servico||'';if(data.tipo_atividade==='MCU'){tipoSel='mcu';o.querySelectorAll('.cag-tipo-btn').forEach(b=>b.classList.toggle('active',b.dataset.tipo==='mcu'));}}
        else hint.innerHTML=`<span style="color:var(--amber)"><i class="ti ti-alert-circle"></i> Não encontrada</span>`;
      },500);
    });
    o.querySelector('#mos-ok').addEventListener('click',async()=>{
      const os=o.querySelector('#mos-num').value.trim()||null;
      const desc=o.querySelector('#mos-desc').value.trim();
      const hh=parseFloat(o.querySelector('#mos-hh').value)||null;
      if(!desc){alert('Informe a descrição');return;}
      const osNum=os?os.replace(/^0+/,''):null;
      let vinculado=false;
      if(osNum){const db=getDB();const {data}=await db.from('ordens_servico').select('os').eq('os',osNum).limit(1).single();vinculado=!!data;}
      await inserirNaFila(equipeId,{os:osNum,cod_servico:null,desc_servico:desc,hh_previsto:hh,tipo:tipoSel,status:'pendente',vinculado},'fim');
      o.remove(); await recarregarDados();
    });
    o.querySelector('.cag-modal-cancel').addEventListener('click',()=>o.remove());
    o.addEventListener('click',e=>{if(e.target===o)o.remove();});
    document.body.appendChild(o);
  }

  function abrirModalEquipe(equipeId) {
    const eq=equipeId?_equipes.find(e=>e.id===equipeId):null;
    const chapasNaEq=new Set((eq&&eq.membros?eq.membros:[]).map(m=>m.chapa));
    const membHtml=_colabs.map(c=>{
      const cracha=c.cracha||c.chapa; const naEq=chapasNaEq.has(cracha);
      const emOutra=!naEq&&_equipes.some(e=>e.id!==equipeId&&(e.membros||[]).some(m=>m.chapa===cracha));
      const semTurno=!c.turno_id;
      const aviso=semTurno?' ⚠':emOutra?' (outra eq.)':'';
      return `<label class="cag-colab-item${naEq?' checked':''}"><input type="checkbox" value="${cracha}"${naEq?' checked':''}><span>${c.nome||cracha}<small style="color:#9ca3af">${aviso}</small></span></label>`;
    }).join('');
    const o=document.createElement('div'); o.className='cag-modal-overlay';
    o.innerHTML=`<div class="cag-modal" style="width:340px;max-height:80vh;overflow-y:auto">
      <div class="cag-modal-titulo">${eq?'Configurar: '+eq.nome:'Nova Equipe'}</div>
      <div class="cag-modal-form">
        <label class="cag-form-label">Nome</label>
        <input type="text" id="meq-nome" class="cag-form-input" value="${eq?eq.nome:''}" placeholder="Ex: CAL1 · Marcelo">
        <label class="cag-form-label" style="margin-top:10px">Colaboradores CAL</label>
        <div class="cag-colab-list">${membHtml}</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="cag-modal-cancel" style="flex:1">Cancelar</button>
        ${eq?`<button class="cag-da red" id="meq-del"><i class="ti ti-trash"></i> Desativar</button>`:''}
        <button class="cag-btn-primary" id="meq-ok" style="flex:2"><i class="ti ti-check"></i> Salvar</button>
      </div>
    </div>`;
    o.querySelectorAll('.cag-colab-item').forEach(l=>{l.addEventListener('click',()=>{setTimeout(()=>l.classList.toggle('checked',l.querySelector('input').checked),0);});});
    o.querySelector('#meq-ok').addEventListener('click',async()=>{
      const nome=o.querySelector('#meq-nome').value.trim(); if(!nome){alert('Informe o nome');return;}
      const sel=[...o.querySelectorAll('.cag-colab-list input:checked')].map(i=>i.value);
      await salvarEquipe(equipeId,nome,sel); o.remove(); await recarregarDados();
    });
    const del=o.querySelector('#meq-del');
    if(del)del.addEventListener('click',async()=>{if(!confirm('Desativar?'))return;await getDB().from('cal_equipes').update({ativo:false}).eq('id',equipeId);o.remove();await recarregarDados();});
    o.querySelector('.cag-modal-cancel').addEventListener('click',()=>o.remove());
    o.addEventListener('click',e=>{if(e.target===o)o.remove();});
    document.body.appendChild(o);
  }

  async function salvarEquipe(equipeId,nome,chapas) {
    const db=getDB(); let eqId=equipeId;
    if(!eqId){const {data}=await db.from('cal_equipes').insert({nome,ativo:true,he_ativo:false}).select().single();if(!data)return;eqId=data.id;}
    else await db.from('cal_equipes').update({nome}).eq('id',eqId);
    const {data:ma}=await db.from('cal_equipe_membros').select('*').eq('equipe_id',eqId);
    const ca=new Set((ma||[]).map(m=>m.chapa));
    for (const ch of chapas) if(!ca.has(ch)){const cv=_colabs.find(x=>(x.cracha||x.chapa)===ch);await db.from('cal_equipe_membros').insert({equipe_id:eqId,chapa:ch,nome:cv&&cv.nome?cv.nome:null,vigencia_inicio:new Date().toISOString()});}
    for (const ch of ca) if(!chapas.includes(ch)) await db.from('cal_equipe_membros').delete().eq('equipe_id',eqId).eq('chapa',ch);
  }

  async function recarregarDados() { await carregarTudo(); renderizar(); }

  /* ══════════════════════════════════════
     CSS
  ══════════════════════════════════════ */
  function injetarCSS() {
    if (document.getElementById('cag-style')) return;
    const s=document.createElement('style'); s.id='cag-style';
    s.textContent=`
:root{--green:#16a34a;--blue:#2563eb;--red:#dc2626;--amber:#d97706;}
.cag-mod{display:flex;flex-direction:column;gap:12px;padding:0;}

/* Overview */
.cag-overview{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
.cag-ov-hdr{padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}
.cag-ov-title{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;display:flex;align-items:center;gap:6px;}
.cag-ov-title i{font-size:13px;}
.cag-ov-sub{font-size:9px;color:#9ca3af;}
.cag-kpi-grid{display:grid;grid-template-columns:repeat(5,1fr);}
@media(max-width:600px){.cag-kpi-grid{grid-template-columns:repeat(2,1fr);}}
.cag-kpi{padding:12px 14px;border-right:1px solid var(--border);}
.cag-kpi:last-child{border-right:none;}
.cag-kpi-lbl{font-size:8px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:5px;}
.cag-kpi-val{font-size:22px;font-weight:700;line-height:1;margin-bottom:2px;color:#1a1a1a;}
.cag-kpi-sub{font-size:8px;color:#9ca3af;}
.cag-kpi-bar{height:3px;border-radius:2px;background:var(--border);margin-top:7px;overflow:hidden;}
.cag-kpi-fill{height:100%;border-radius:2px;}

/* Situação */
.cag-situacao{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:10px 14px;display:flex;gap:12px;flex-wrap:wrap;}
.cag-sit-grupo{display:flex;flex-direction:column;gap:5px;min-width:120px;}
.cag-sit-titulo{font-size:8px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;display:flex;align-items:center;gap:4px;padding-bottom:4px;border-bottom:1px solid var(--border);}
.cag-sit-titulo i{font-size:11px;}
.cag-sit-tags{display:flex;gap:3px;flex-wrap:wrap;}
.cag-sit-tag{padding:2px 7px;border-radius:10px;font-size:9px;font-weight:500;}
.cag-sit-tag.folga{background:#f3f4f6;color:#6b7280;}
.cag-sit-tag.folga-amh{background:#fef3c7;color:#d97706;}
.cag-sit-tag.ferias{background:#dbeafe;color:#2563eb;}
.cag-sit-tag.vazio{color:#d1d5db;font-size:9px;}
.cag-sit-sep{width:1px;background:var(--border);flex-shrink:0;}
.cag-sit-exec{display:flex;align-items:center;gap:6px;font-size:10px;}
.cag-sit-exec-dot{width:6px;height:6px;border-radius:50%;background:#0891b2;flex-shrink:0;animation:cag-pulse 1.5s infinite;}
@keyframes cag-pulse{0%,100%{opacity:1}50%{opacity:.3}}
.cag-sit-exec-name{font-weight:600;color:#1a1a1a;}
.cag-sit-exec-eq{font-size:8px;color:#9ca3af;}

/* Gantt */
.cag-gantt{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
.cag-gantt-hdr{padding:9px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.cag-gantt-title{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;display:flex;align-items:center;gap:5px;}
.cag-gantt-title i{font-size:13px;}
.cag-gantt-leg{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto;}
.cag-gleg{display:flex;align-items:center;gap:3px;font-size:8px;color:#9ca3af;}
.cag-gleg-dot{width:8px;height:8px;border-radius:2px;}
.cag-gantt-scroll{overflow-x:auto;}
.cag-gantt-scroll::-webkit-scrollbar{height:3px;}
.cag-gantt-scroll::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
.cag-gantt-inner{min-width:600px;}
.cag-gantt-cols-hdr{display:flex;border-bottom:1px solid var(--border);background:#fafafa;}
.cag-geq-hdr{width:110px;flex-shrink:0;padding:5px 10px;font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;border-right:1px solid var(--border);}
.cag-gweeks-hdr{flex:1;display:flex;}
.cag-gw-col{flex:1;display:flex;flex-direction:column;}
.cag-gw-col.border-right{border-right:2px solid #d1d5db;}
.cag-gw-lbl{padding:2px 6px;font-size:7px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid var(--border);background:#f9fafb;}
.cag-gw-days{display:flex;}
.cag-gd-hdr{flex:1;padding:2px 1px;text-align:center;font-size:7px;font-weight:600;color:#9ca3af;border-right:1px solid #f0f0f0;}
.cag-gd-hdr:last-child{border-right:none;}
.cag-gd-hoje{color:#d97706;font-weight:700;}
.cag-grow{display:flex;border-bottom:1px solid var(--border);}
.cag-grow:last-child{border-bottom:none;}
.cag-geq-cell{width:110px;flex-shrink:0;padding:7px 10px;border-right:1px solid var(--border);display:flex;flex-direction:column;justify-content:center;gap:2px;}
.cag-geq-name{font-size:10px;font-weight:700;color:#1a1a1a;display:flex;align-items:center;gap:4px;flex-wrap:wrap;}
.cag-geq-membros{font-size:8px;color:#9ca3af;}
.cag-geq-hh{font-size:8px;}
.cag-gdays{flex:1;display:flex;}
.cag-gcell{flex:1;height:44px;border-right:1px solid #f5f5f5;position:relative;display:flex;align-items:center;justify-content:center;}
.cag-gcell:last-child{border-right:none;}
.cag-gcell.folga{background:transparent;}
.cag-gcell-bar{position:absolute;left:2px;right:2px;height:26px;border-radius:3px;}
.cag-gcell-folga-line{position:absolute;left:3px;right:3px;top:50%;transform:translateY(-50%);height:1px;background:#e9e9e9;border-radius:1px;}
.cag-hoje-mark{position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--yellow);z-index:1;}

/* HE btn */
.cag-he-btn{padding:1px 5px;border-radius:3px;border:1px solid #d1d5db;background:transparent;font-family:var(--font);font-size:8px;font-weight:700;color:#9ca3af;cursor:pointer;flex-shrink:0;}
.cag-he-btn.on{background:#fef3c7;border-color:#fcd34d;color:#d97706;}

/* Dispatch */
.cag-dispatch{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
.cag-dispatch-hdr{padding:9px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:8px;}
.cag-dispatch-title{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;display:flex;align-items:center;gap:5px;}
.cag-dispatch-title i{font-size:13px;}
.cag-dispatch-cols{display:flex;gap:10px;padding:12px;overflow-x:auto;}
.cag-dispatch-cols::-webkit-scrollbar{height:3px;}
.cag-dispatch-cols::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
.cag-dcol{width:220px;flex-shrink:0;display:flex;flex-direction:column;gap:4px;}
.cag-dcol-hdr{background:var(--dark2,#2a2a2a);border-radius:var(--radius);padding:8px 10px;color:#f0f0f0;}
.cag-dcol-hdr.estouro{background:#3b1a1a;}
.cag-dcol-nome{font-size:10px;font-weight:700;display:flex;align-items:center;gap:4px;margin-bottom:4px;flex-wrap:wrap;}
.cag-dcfg{width:18px;height:18px;border:1px solid rgba(255,255,255,.15);border-radius:3px;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:10px;margin-left:auto;}
.cag-dcol-membros{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:4px;}
.cag-dmembro{padding:1px 5px;border-radius:8px;background:rgba(255,255,255,.1);font-size:8px;color:#9ca3af;}
.cag-dcol-hh{font-size:8px;color:#9ca3af;}
.cag-dfila{display:flex;flex-direction:column;gap:4px;}
.cag-dcard{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;position:relative;cursor:pointer;}
.cag-dstripe{position:absolute;left:0;top:0;bottom:0;width:4px;}
.cag-dbody{padding:5px 7px 5px 12px;flex:1;}
.cag-dhead{display:flex;align-items:center;gap:5px;}
.cag-dos-num{font-size:9px;font-weight:700;color:#374151;flex-shrink:0;font-variant-numeric:tabular-nums;}
.cag-dos-desc{font-size:9px;color:#6b7280;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cag-dbar-exec{font-size:7px;font-weight:600;color:#0891b2;display:flex;align-items:center;gap:3px;margin-bottom:2px;}
.cag-dbar-dot{width:4px;height:4px;border-radius:50%;background:#0891b2;animation:cag-pulse 1.5s infinite;}
.cag-dbar-aguard{font-size:7px;color:#9ca3af;margin-bottom:2px;display:flex;align-items:center;gap:3px;}
.cag-dbar-atraso{font-size:7px;font-weight:600;color:var(--amber);display:flex;align-items:center;gap:3px;margin-bottom:2px;}
.cag-dbar-inter{font-size:7px;color:var(--amber);margin-bottom:2px;}
.cag-dbar-semOs{font-size:7px;color:var(--amber);display:flex;align-items:center;gap:3px;}
.cag-dcard.em-exec{border-color:#a5f3fc;background:#ecfeff;}
.cag-dcard.atrasado{border-color:#fcd34d;background:#fffbeb;}
.cag-dcard.concluido{opacity:.65;background:#f0fdf4;border-color:#bbf7d0;}
.cag-dcard.aguardando{background:#fafafa;}
.cag-dcard.interrompido{background:#fef3c7;border-color:#fcd34d;}
.cag-dexpand{display:none;padding:5px 7px 6px 12px;border-top:1px solid var(--border);background:#fafafa;}
.cag-dcard.open .cag-dexpand{display:block;}
.cag-dexpand-hh{font-size:8px;color:#9ca3af;display:flex;align-items:center;gap:4px;margin-bottom:4px;}
.cag-dact-row{display:flex;gap:3px;flex-wrap:wrap;}
.cag-dover-line{display:flex;align-items:center;gap:4px;padding:1px 0;}
.cag-dover-l{flex:1;height:2px;background:#fca5a5;border-radius:1px;}
.cag-dover-lbl{font-size:8px;font-weight:700;color:var(--red);white-space:nowrap;display:flex;align-items:center;gap:2px;}
.cag-denc-toggle{font-size:9px;color:#9ca3af;cursor:pointer;padding:4px 8px;text-align:center;border:1px dashed var(--border);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;gap:4px;}
.cag-dadd{width:100%;height:26px;border:1px dashed var(--border);border-radius:var(--radius-sm);background:transparent;font-family:var(--font);font-size:9px;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;}
.cag-dadd:hover{border-color:var(--yellow);color:#1a1a1a;background:#fffbeb;}
.cag-pos-btns{display:flex;flex-direction:column;gap:1px;padding:0 5px;border-left:1px solid var(--border);justify-content:center;}
.cag-pos-btn{width:20px;height:13px;border:1px solid var(--border);border-radius:3px;background:var(--bg);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:8px;color:#9ca3af;padding:0;}
.cag-pos-btn:disabled{opacity:.3;cursor:not-allowed;}
.cag-pos-btn:not(:disabled):hover{background:var(--border);}

/* Ações */
.cag-da{height:22px;padding:0 6px;border:1px solid var(--border);border-radius:3px;background:var(--bg);font-family:var(--font);font-size:8px;font-weight:600;color:#374151;cursor:pointer;display:flex;align-items:center;gap:2px;white-space:nowrap;}
.cag-da i{font-size:10px;}
.cag-da.green{background:#dcfce7;border-color:#86efac;color:#16a34a;}
.cag-da.amber{background:#fef3c7;border-color:#fcd34d;color:#d97706;}
.cag-da.blue{background:#dbeafe;border-color:#93c5fd;color:#2563eb;}
.cag-da.red{background:#fee2e2;border-color:#fca5a5;color:#dc2626;}
.cag-da.ghost{background:transparent;border-color:var(--border);color:#9ca3af;}
.cag-badge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:8px;font-weight:700;text-transform:uppercase;}
.cag-btn-primary{height:26px;padding:0 10px;border:none;border-radius:var(--radius-sm);background:var(--yellow);font-family:var(--font);font-size:10px;font-weight:700;color:var(--dark1,#1e1e1e);cursor:pointer;display:flex;align-items:center;gap:4px;}
.cag-btn-primary:hover{background:#daa900;}

/* Programados lista */
.cag-plista{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
.cag-ptoggle{padding:10px 14px;display:flex;align-items:center;gap:7px;cursor:pointer;user-select:none;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;}
.cag-ptoggle i:first-child{font-size:13px;}
.cag-plbadge{padding:1px 6px;border-radius:10px;background:#f3f4f6;font-size:8px;font-weight:700;color:#9ca3af;}
.cag-pchev{font-size:12px;transition:transform .2s;}
.cag-pbody{display:none;border-top:1px solid var(--border);overflow-x:auto;}
.cag-pbody.open{display:block;}
.cag-lista-empty{padding:14px;font-size:11px;color:#9ca3af;}
.cag-ptr{display:flex;align-items:center;border-bottom:1px solid var(--border);min-width:500px;}
.cag-ptr:last-child{border-bottom:none;}
.cag-pth{background:#fafafa;}
.cag-pth .cag-ptd{font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;}
.cag-ptd{padding:6px 10px;font-size:10px;color:#374151;flex-shrink:0;}
.cag-ptd:nth-child(1){width:80px;font-weight:700;}
.cag-ptd:nth-child(2){flex:1;min-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cag-ptd:nth-child(3){width:50px;}
.cag-ptd:nth-child(4){width:55px;}
.cag-ptd:nth-child(5){width:90px;}
.cag-ptd:nth-child(6){width:40px;}

/* Modais */
.cag-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}
.cag-modal{background:var(--card-bg);border-radius:var(--radius);box-shadow:0 8px 30px rgba(0,0,0,.15);padding:18px;width:300px;max-width:100%;}
.cag-modal-titulo{font-size:13px;font-weight:700;margin-bottom:12px;color:#1a1a1a;}
.cag-modal-opcoes{display:flex;flex-direction:column;gap:5px;margin-bottom:8px;}
.cag-modal-opt{width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;font-weight:500;color:#374151;cursor:pointer;text-align:left;}
.cag-modal-opt:hover{border-color:var(--yellow);background:#fffbeb;}
.cag-modal-cancel{width:100%;padding:7px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:10px;font-weight:600;color:#6b7280;cursor:pointer;margin-top:3px;}
.cag-modal-form{display:flex;flex-direction:column;gap:5px;}
.cag-form-label{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;}
.cag-form-input{width:100%;height:32px;padding:0 9px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px;color:#374151;background:var(--bg);}
.cag-form-hint{font-size:9px;min-height:12px;}
.cag-tipo-opts{display:flex;gap:3px;}
.cag-tipo-btn{flex:1;height:28px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:10px;font-weight:600;color:#6b7280;cursor:pointer;}
.cag-tipo-btn.active{background:var(--yellow);border-color:#daa900;color:#1a1a1a;}
.cag-colab-list{display:flex;flex-direction:column;gap:3px;max-height:240px;overflow-y:auto;}
.cag-colab-item{display:flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;font-size:10px;color:#374151;font-weight:500;}
.cag-colab-item.checked{background:#dbeafe;border-color:#93c5fd;}
.cag-colab-item input{accent-color:var(--yellow);}

/* Loading */
.cag-loading{display:flex;align-items:center;justify-content:center;gap:8px;padding:48px;color:#9ca3af;font-size:12px;}
.cag-loading i{font-size:18px;animation:cag-spin 1s linear infinite;}
@keyframes cag-spin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════
     INIT
  ══════════════════════════════════════ */
  async function init(container) {
    _container=container; injetarCSS();
    _container.innerHTML=`<div class="cag-loading"><i class="ti ti-loader-2"></i> Carregando...</div>`;
    try { await carregarTudo(); renderizar(); }
    catch(e) {
      console.error('cal_acomp:',e);
      _container.innerHTML=`<div style="padding:40px;text-align:center;color:#9ca3af"><i class="ti ti-alert-circle" style="font-size:28px;display:block;margin-bottom:8px"></i>Erro: ${e.message}</div>`;
    }
  }

  return { init };
})();
