/* ═══════════════════════════════════════════════════════════════
   MAN360 — Acompanhamento Caldeiraria v4
   ═══════════════════════════════════════════════════════════════ */

window.Modulos = window.Modulos || {};
window.Modulos.cal_acomp = (() => {

  /* ── Âncora ── */
  const ANCORA_SEMANA = 9;
  const ANCORA_DATA   = new Date(2026, 4, 25, 12, 0, 0);

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
  function fmtData(d) {
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
    const n=new Date(); return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  }
  function hoje()  { const d=new Date(); d.setHours(0,0,0,0); return d; }
  function amanha(){ const d=hoje(); d.setDate(d.getDate()+1); return d; }

  /* ── Estado ── */
  let _semana    = semanaAtual();
  let _safra     = null;
  let _safras    = [];
  let _equipes   = [];
  let _fila      = {};
  let _progSem   = [];
  let _aponts    = [];
  let _colabs    = [];
  let _turnos    = {};
  let _escalas   = {};
  let _ferias    = [];
  let _justific  = [];
  let _carteiras = [];      // carteiras ativas selecionadas
  let _container = null;

  /* ── Helpers de turno/escala ── */
  function hhDiaTurno(turnoId) {
    const t = _turnos[turnoId]; if (!t) return 0;
    const [eh,em] = (t.hora_entrada||'00:00').split(':').map(Number);
    const [sh,sm] = (t.hora_saida  ||'00:00').split(':').map(Number);
    return Math.max(0, ((sh*60+sm)-(eh*60+em)-(t.intervalo_min||0))/60);
  }
  function entradaTurno(turnoId) {
    const t = _turnos[turnoId]; if (!t) return null;
    const [h,m] = (t.hora_entrada||'07:00').split(':').map(Number);
    return h*60+m; // minutos desde meia-noite
  }
  function saidaTurno(turnoId) {
    const t = _turnos[turnoId]; if (!t) return null;
    const [h,m] = (t.hora_saida||'17:00').split(':').map(Number);
    return h*60+m;
  }

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

  function hhDispEquipeDia(equipe, data) {
    const iso = isoDate(data); let total=0;
    for (const m of (equipe.membros||[])) {
      const c = _colabs.find(x=>(x.cracha||x.chapa)===m.chapa);
      if (!c||!c.turno_id) continue;
      if (_ferias.some(f=>f.chapa===m.chapa&&iso>=f.data_inicio&&iso<=f.data_fim)) continue;
      if (_justific.some(j=>j.chapa===m.chapa&&iso>=j.data_inicio&&iso<=j.data_fim)) continue;
      const folgas = projetarFolgas(c, inicioSemana(_semana), fimSemana(_semana));
      if (folgas.has(iso)) continue;
      total += hhDiaTurno(c.turno_id);
    }
    return total;
  }

  function hhSemanaEquipe(equipe) {
    let t=0; const ini=inicioSemana(_semana);
    for (let i=0;i<7;i++) { const d=new Date(ini); d.setDate(d.getDate()+i); t+=hhDispEquipeDia(equipe,d); }
    return t;
  }

  /* ── HH disponível restante hoje a partir de agora ──
     Considera a hora atual dentro do turno da equipe    */
  function hhRestanteHoje(equipe) {
    const agora = new Date();
    const minAgora = agora.getHours()*60+agora.getMinutes();
    let total = 0;
    for (const m of (equipe.membros||[])) {
      const c = _colabs.find(x=>(x.cracha||x.chapa)===m.chapa);
      if (!c||!c.turno_id) continue;
      const hjIso = isoDate(hoje());
      if (_ferias.some(f=>f.chapa===m.chapa&&hjIso>=f.data_inicio&&hjIso<=f.data_fim)) continue;
      if (_justific.some(j=>j.chapa===m.chapa&&hjIso>=j.data_inicio&&hjIso<=j.data_fim)) continue;
      const folgas = projetarFolgas(c, hoje(), hoje());
      if (folgas.has(hjIso)) continue;
      const saida = saidaTurno(c.turno_id);
      const entrada = entradaTurno(c.turno_id);
      const intervalo = (_turnos[c.turno_id] ? _turnos[c.turno_id].intervalo_min||0 : 0);
      if (saida===null) continue;
      if (minAgora >= saida) continue; // já passou do horário
      if (minAgora <= entrada) { // ainda não começou — HH total do dia
        total += hhDiaTurno(c.turno_id);
      } else { // dentro do turno — HH restante
        const restMin = saida - minAgora - (minAgora < (entrada + (hhDiaTurno(c.turno_id)*60/2)) ? intervalo : 0);
        total += Math.max(0, restMin/60);
      }
    }
    return total;
  }

  /* ── Calcular segmentos do mini Gantt ──
     Projeção a partir de AGORA, não do início da semana
     Folgas são puladas — o serviço continua no próximo dia útil  */
  function calcularSegmentos(equipe) {
    const ini    = inicioSemana(_semana);
    const hjIso  = isoDate(hoje());
    const fila   = (_fila[equipe.id]||[]).filter(i=>i.status!=='encerrado'&&i.status!=='interrompido');

    // HH disponível por dia
    const diasHH = Array.from({length:7},(_,i)=>{
      const d=new Date(ini); d.setDate(d.getDate()+i); return hhDispEquipeDia(equipe,d);
    });

    // Para hoje, só usar HH restante a partir de agora
    const hjIdx = Array.from({length:7},(_,i)=>{
      const d=new Date(ini); d.setDate(d.getDate()+i); return isoDate(d);
    }).indexOf(hjIso);
    const diasDisp = [...diasHH];
    if (hjIdx>=0) diasDisp[hjIdx] = hhRestanteHoje(equipe);

    // Distribuir serviços a partir do dia atual (ignorar dias passados)
    const diasFatias = Array.from({length:7},()=>[]);
    let hhRestItem=0, itemIdx=0;

    for (let diaIdx=0;diaIdx<7;diaIdx++) {
      const d=new Date(ini); d.setDate(d.getDate()+diaIdx);
      const iso=isoDate(d);
      if (iso < hjIso) continue; // dias passados → verde, não distribuir
      if (diasHH[diaIdx]===0) continue; // folga → pula sem consumir HH

      let hhRestDia = diasDisp[diaIdx];
      while (hhRestDia>0 && itemIdx<fila.length) {
        if (hhRestItem===0) hhRestItem = fila[itemIdx].hh_previsto||8;
        const usado = Math.min(hhRestDia, hhRestItem);
        diasFatias[diaIdx].push({tipo:fila[itemIdx].tipo, hh:usado});
        hhRestDia-=usado; hhRestItem-=usado;
        if (hhRestItem<=0) { hhRestItem=0; itemIdx++; }
      }
      if (hhRestDia<=0 && itemIdx<fila.length) {
        diasFatias[diaIdx].push({tipo:'estouro', hh:1});
      }
    }

    // Montar resultado final
    return Array.from({length:7},(_,i)=>{
      const d=new Date(ini); d.setDate(d.getDate()+i);
      const iso=isoDate(d);
      if (diasHH[i]===0) return [{tipo:'folga',pct:100}];
      if (iso < hjIso)   return [{tipo:'passado',pct:100}];
      if (!diasFatias[i].length) return [{tipo:'vazio',pct:100}];
      const total=diasFatias[i].reduce((s,f)=>s+f.hh,0);
      return diasFatias[i].map(f=>({tipo:f.tipo,pct:Math.round(f.hh/total*100)}));
    });
  }

  function corTipo(tipo) {
    return {
      programado:'var(--cag-prog)', fora_prog:'var(--cag-fora)',
      mcu:'var(--cag-mcu)', estouro:'var(--cag-estourado)',
      passado:'var(--cag-realizado)', folga:'var(--cag-folga)', vazio:'var(--cag-vazio)',
    }[tipo]||'var(--cag-vazio)';
  }

  /* ══════════════════════════════════════
     CARREGAR DADOS
  ══════════════════════════════════════ */
  async function carregarTudo() {
    const db  = getDB();
    const ano = inicioSemana(_semana).getFullYear();
    const ini = isoDate(inicioSemana(_semana));
    const fim = isoDate(fimSemana(_semana));

    const {data:safrasRaw} = await db.from('programacao_semanal').select('safra').neq('safra','');
    _safras = [...new Set((safrasRaw||[]).map(r=>r.safra).filter(Boolean))].sort().reverse();
    if (!_safra&&_safras.length) _safra=_safras[0];

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
      ...e, membros:(mbs||[]).filter(m=>m.equipe_id===e.id).map(m=>({chapa:m.chapa,nome:m.nome}))
    }));

    const {data:fila} = await db.from('cal_fila').select('*')
      .eq('semana',_semana).eq('ano',ano).order('ordem',{ascending:true});
    _fila={};
    (fila||[]).forEach(item=>{
      if (!_fila[item.equipe_id]) _fila[item.equipe_id]=[];
      _fila[item.equipe_id].push(item);
    });

    if (_semana===semanaAtual()) await migrarPendentes(ano);

    const {data:prog} = await db.from('programacao_semanal').select('*').eq('semana',_semana).eq('ano',ano);
    _progSem = prog||[];

    // Carteiras disponíveis na semana (equipes distintas da programação)
    const cartsDisponiveis = [...new Set((_progSem||[]).map(p=>p.equipe).filter(Boolean))].sort();
    // Manter seleção existente, adicionar novas por padrão
    const selAntes = new Set(_carteiras);
    _carteiras = cartsDisponiveis.map(c=>({
      nome:c,
      selecionada: selAntes.size===0 ? true : selAntes.has(c)
    }));

    const {data:apts} = await db.from('apontamentos').select('*').gte('data_apontamento',ini).lte('data_apontamento',fim);
    _aponts = apts||[];
  }

  async function migrarPendentes(ano) {
    const db=getDB(); const semAnt=_semana-1;
    const anoAnt=inicioSemana(semAnt).getFullYear();
    const {data:antigos}=await db.from('cal_fila').select('*').eq('semana',semAnt).eq('ano',anoAnt).in('status',['pendente','aguardando_inicio']);
    if (!antigos || !antigos.length) return;
    for (const item of antigos) {
      const jaExiste=(_fila[item.equipe_id]||[]).some(i=>i.os===item.os&&i.cod_servico===item.cod_servico);
      if (jaExiste) continue;
      const ordem=(_fila[item.equipe_id]||[]).length+1;
      const {data}=await db.from('cal_fila').insert({
        equipe_id:item.equipe_id,semana:_semana,ano,os:item.os,
        cod_servico:item.cod_servico,desc_servico:item.desc_servico,
        hh_previsto:item.hh_previsto,tipo:item.tipo,ordem,
        status:'pendente',vinculado:item.vinculado,obs:item.obs
      }).select().single();
      if (data) { if (!_fila[item.equipe_id]) _fila[item.equipe_id]=[]; _fila[item.equipe_id].push(data); }
    }
  }

  /* ══════════════════════════════════════
     PERSISTÊNCIA
  ══════════════════════════════════════ */
  async function salvarOrdem(equipeId) {
    const db=getDB();
    for (let i=0;i<(_fila[equipeId]||[]).length;i++)
      await db.from('cal_fila').update({ordem:i+1}).eq('id',_fila[equipeId][i].id);
  }

  async function atualizarStatus(id,status,extra={}) {
    const db=getDB(); const p={status,...extra};
    await db.from('cal_fila').update(p).eq('id',id);
    for (const eqId in _fila) { const idx=_fila[eqId].findIndex(i=>i.id===id); if (idx>=0){Object.assign(_fila[eqId][idx],p);break;} }
  }

  async function inserirNaFila(equipeId,item,posicao) {
    const db=getDB(); const ano=inicioSemana(_semana).getFullYear();
    if (!_fila[equipeId]) _fila[equipeId]=[];
    const fila=_fila[equipeId];
    // posicao: 'fim' | 'inicio' | número (0-based)
    const ordem = posicao==='fim' ? fila.length+1 : (posicao==='inicio'?1:posicao+1);
    const {data,error}=await db.from('cal_fila').insert({equipe_id:equipeId,semana:_semana,ano,ordem,...item}).select().single();
    if (error){console.error('inserirNaFila:',error);return null;}
    if (posicao!=='fim') { fila.splice(posicao==='inicio'?0:posicao,0,data); await salvarOrdem(equipeId); }
    else fila.push(data);
    return data;
  }

  async function removerDaFila(id) {
    const db=getDB(); await db.from('cal_fila').delete().eq('id',id);
    for (const eqId in _fila) _fila[eqId]=_fila[eqId].filter(i=>i.id!==id);
  }

  /* ══════════════════════════════════════
     HTML — MINI GANTT
  ══════════════════════════════════════ */
  function htmlMiniGantt(equipe) {
    const DIAS=['S','T','Q','Q','S','S','D'];
    const segs=calcularSegmentos(equipe);
    const ini=inicioSemana(_semana); const hjIso=isoDate(hoje());
    const labels=DIAS.map(l=>`<div class="cag-mg-dl">${l}</div>`).join('');
    const blocos=segs.map((fatias,i)=>{
      const dt=new Date(ini); dt.setDate(dt.getDate()+i);
      const iso=isoDate(dt);
      const isHoje=iso===hjIso;
      if (fatias[0] && fatias[0].tipo==='folga') return `<div class="cag-mg-day" style="background:#fff;border:1px solid #d1d5db"></div>`;
      if (fatias[0] && fatias[0].tipo==='passado') return `<div class="cag-mg-day" style="background:var(--cag-realizado)"></div>`;
      if (fatias.length===1) return `<div class="cag-mg-day${isHoje?' hoje':''}" style="background:${corTipo(fatias[0].tipo)}"></div>`;
      let grad='linear-gradient(to right',acc=0;
      for (const f of fatias){grad+=`,${corTipo(f.tipo)} ${acc}%,${corTipo(f.tipo)} ${acc+f.pct}%`;acc+=f.pct;}
      grad+=')';
      return `<div class="cag-mg-day${isHoje?' hoje':''}" style="background:${grad}"></div>`;
    }).join('');
    const fila=(_fila[equipe.id]||[]).filter(i=>i.status!=='encerrado'&&i.status!=='interrompido');
    const hhD=hhSemanaEquipe(equipe);
    const hhA=fila.reduce((s,i)=>s+(i.hh_previsto||0),0);
    const dif=hhD-hhA;
    const hhTxt=dif<0
      ?`<span style="color:#f87171;font-weight:700">${hhA.toFixed(0)} HH · +${Math.abs(dif).toFixed(0)} excedido</span>`
      :`${hhA.toFixed(0)} HH alocados · ${dif.toFixed(0)} livres`;
    return `<div class="cag-mg-labels">${labels}</div><div class="cag-mg">${blocos}</div><div class="cag-cap-hh">${hhTxt}</div>`;
  }

  /* ── Badge ── */
  function badgeTipo(tipo) {
    const m={programado:['PRG','var(--cs-prog)','var(--cag-prog-l)'],fora_prog:['NPG','var(--cs-fora)','var(--cag-fora-l)'],mcu:['MCU','var(--cs-mcu)','var(--cag-mcu-l)']};
    const [l,c,b]=m[tipo]||['?','#9ca3af','#f3f4f6'];
    return `<span class="cag-badge" style="color:${c};background:${b}">${l}</span>`;
  }

  /* ── Card ── */
  function htmlCard(item,equipeId) {
    const sc={programado:'var(--cs-prog)',fora_prog:'var(--cs-fora)',mcu:'var(--cs-mcu)'}[item.tipo]||'#9ca3af';
    const isEnc=item.status==='encerrado',isExec=item.status==='em_execucao';
    const isInter=item.status==='interrompido',isAguard=item.status==='aguardando_inicio';
    let cc='cag-card';
    if(isEnc)cc+=' concluido'; if(isExec)cc+=' em-exec';
    if(isInter)cc+=' interrompido'; if(isAguard)cc+=' aguardando';
    const osNum=item.os?`<span class="cag-os-num">${item.os}</span>`:`<span class="cag-os-num sem-os">sem nº</span>`;
    const si=isEnc?`<i class="ti ti-circle-check cag-si done"></i>`:isExec?`<i class="ti ti-player-play cag-si exec"></i>`:isInter?`<i class="ti ti-player-pause cag-si inter"></i>`:isAguard?`<i class="ti ti-clock cag-si aguard"></i>`:'';
    const execBar=isExec?`<div class="cag-exec-bar"><div class="cag-exec-dot"></div> Em execução · ${item.iniciado_em?fmtData(item.iniciado_em):'—'}</div>`:'';
    const aguardBar=isAguard?`<div class="cag-aguard-bar"><i class="ti ti-clock"></i> Aguardando início</div>`:'';
    const interMotivo=isInter&&item.obs?`<div class="cag-inter-motivo"><i class="ti ti-alert-circle"></i> ${item.obs}</div>`:'';
    const semOs=(!item.os||!item.vinculado)?`<div class="cag-sem-os-aviso"><i class="ti ti-alert-circle"></i> Não vinculada</div>`:'';
    let botoes='';
    if(isEnc){
      botoes=`<button class="cag-act blue" data-action="reabrir" data-id="${item.id}"><i class="ti ti-rotate-clockwise"></i> Reabrir</button>`;
    } else if(isExec){
      botoes=`<button class="cag-act green" data-action="concluir" data-id="${item.id}"><i class="ti ti-check"></i> Concluir</button>
        <button class="cag-act amber" data-action="interromper" data-id="${item.id}"><i class="ti ti-player-pause"></i> Interromper</button>
        <button class="cag-act blue" data-action="mover-equipe" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-transfer-right"></i> Mover</button>
        <button class="cag-act ghost" data-action="remover" data-id="${item.id}"><i class="ti ti-x"></i> Remover</button>`;
    } else if(isInter){
      botoes=`<button class="cag-act blue" data-action="recolocar" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-rotate-clockwise"></i> Recolocar na fila</button>
        <button class="cag-act ghost" data-action="remover" data-id="${item.id}"><i class="ti ti-x"></i> Remover</button>`;
    } else if(isAguard){
      botoes=`<button class="cag-act green" data-action="iniciar" data-id="${item.id}"><i class="ti ti-player-play"></i> Informar início</button>
        <button class="cag-act blue" data-action="mover-equipe" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-transfer-right"></i> Mover</button>
        <button class="cag-act ghost" data-action="mover-pos" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-up-down"></i> Posição</button>
        <button class="cag-act ghost" data-action="remover" data-id="${item.id}"><i class="ti ti-x"></i> Remover</button>`;
    } else {
      botoes=`<button class="cag-act green" data-action="iniciar" data-id="${item.id}"><i class="ti ti-player-play"></i> Iniciar</button>
        <button class="cag-act blue" data-action="mover-equipe" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-transfer-right"></i> Mover</button>
        <button class="cag-act ghost" data-action="mover-pos" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-up-down"></i> Posição</button>
        <button class="cag-act ghost" data-action="remover" data-id="${item.id}"><i class="ti ti-x"></i> Remover</button>`;
      if(!item.os||!item.vinculado) botoes+=`<button class="cag-act amber" data-action="vincular" data-id="${item.id}"><i class="ti ti-link"></i> Vincular OS</button>`;
    }
    const hhTxt=item.hh_previsto?`<span class="cag-os-hh"><i class="ti ti-clock"></i> ${item.hh_previsto} HH prev.</span>`:'';
    return `<div class="${cc}" data-id="${item.id}" data-eq="${equipeId}">
      <div class="cag-stripe" style="background:${sc}"></div>
      <div class="cag-card-body">${execBar}${aguardBar}<div class="cag-card-head">${osNum}<span class="cag-os-desc">${item.desc_servico||'—'}</span>${si}</div>${interMotivo}${semOs}</div>
      <div class="cag-card-expand"><div class="cag-expand-row">${hhTxt}</div><div class="cag-act-row">${botoes}</div></div>
    </div>`;
  }

  function htmlEquipeCol(equipe) {
    const fila=_fila[equipe.id]||[];
    const hhD=hhSemanaEquipe(equipe);
    const hhA=fila.filter(i=>i.status!=='encerrado'&&i.status!=='interrompido').reduce((s,i)=>s+(i.hh_previsto||0),0);
    const membrosHtml=(equipe.membros||[]).map(m=>{
      const c=_colabs.find(x=>(x.cracha||x.chapa)===m.chapa);
      const w=c&&!c.turno_id;
      return `<span class="cag-membro-tag${w?' warn':''}">${(m.nome||m.chapa||'').split(' ')[0]}${w?' ⚠':''}</span>`;
    }).join('');
    let hhAcum=0,linhaOk=false;
    const cardsHtml=fila.map(item=>{
      const ativo=item.status!=='encerrado'&&item.status!=='interrompido';
      if(ativo) hhAcum+=item.hh_previsto||0;
      let div='';
      if(!linhaOk&&hhAcum>hhD&&ativo){linhaOk=true;div=`<div class="cag-overflow-div"><div class="cag-overflow-line"></div><div class="cag-overflow-label"><i class="ti ti-alert-triangle"></i> Estouro</div><div class="cag-overflow-line"></div></div>`;}
      return div+htmlCard(item,equipe.id);
    }).join('');
    return `<div class="cag-equipe-col" data-eq-id="${equipe.id}">
      <div class="cag-eq-header${hhA>hhD?' estouro':''}">
        <div class="cag-eq-nome">${equipe.nome}<button class="cag-eq-btn" data-action="config-equipe" data-eq="${equipe.id}"><i class="ti ti-settings"></i></button></div>
        <div class="cag-membros">${membrosHtml||'<span style="color:#6b7280;font-size:9px">Sem membros</span>'}</div>
        ${htmlMiniGantt(equipe)}
      </div>
      <div class="cag-fila" id="fila-${equipe.id}">${cardsHtml}
        <button class="cag-add-os-btn" data-action="add-os" data-eq="${equipe.id}"><i class="ti ti-plus"></i> Inserir OS</button>
      </div>
    </div>`;
  }

  /* ── Lista suspensa ── */
  function htmlLista(id,titulo,icone,badge,conteudo,corBadge) {
    return `<div class="cag-lista" id="lista-${id}">
      <div class="cag-lista-toggle" data-lista="${id}">
        <i class="ti ti-${icone}"></i><span>${titulo}</span>
        ${badge!=null?`<span class="cag-lista-badge" style="${corBadge||''}">${badge}</span>`:''}
        <i class="ti ti-chevron-down cag-lista-chevron" style="margin-left:auto"></i>
      </div>
      <div class="cag-lista-body" id="lista-body-${id}">${conteudo}</div>
    </div>`;
  }
  function tr(...cells){return `<div class="cag-tr">${cells.map(c=>`<div class="cag-td">${c}</div>`).join('')}</div>`;}
  function th(...cells){return `<div class="cag-tr cag-thead">${cells.map(c=>`<div class="cag-td">${c}</div>`).join('')}</div>`;}

  /* ── Serviços em andamento ── */
  function htmlServsEmAndamento() {
    const emExec=[];
    for (const eq of _equipes) for (const item of (_fila[eq.id]||[])) if(item.status==='em_execucao') emExec.push({...item,equipeNome:eq.nome});
    const hjIso=isoDate(hoje()),amhIso=isoDate(amanha());
    const indispHoje=[],indispAmanha=[],deFerias=[];
    for (const c of _colabs) {
      const id=c.cracha||c.chapa;
      if(_ferias.some(f=>f.chapa===id&&hjIso>=f.data_inicio&&hjIso<=f.data_fim)){deFerias.push(c.nome||id);continue;}
      const fh=projetarFolgas(c,inicioSemana(_semana),fimSemana(_semana));
      if(fh.has(hjIso)){indispHoje.push(c.nome||id);continue;}
      if(fh.has(amhIso))indispAmanha.push(c.nome||id);
    }
    let html='';
    if(emExec.length){
      html+=th('OS','Descrição','Início','Equipe','Tipo');
      html+=emExec.map(i=>tr(i.os||'<span style="color:#9ca3af;font-style:italic">sem nº</span>',`<span class="cag-desc-cell">${i.desc_servico||'—'}</span>`,i.iniciado_em?fmtData(i.iniciado_em):'—',`<span class="cag-equipe-cell">${i.equipeNome}</span>`,badgeTipo(i.tipo))).join('');
    } else {
      html+=`<div class="cag-lista-empty"><i class="ti ti-check"></i> Nenhum serviço em execução</div>`;
    }
    const tags=(arr,cls)=>arr.map(n=>`<span class="cag-disp-tag ${cls}">${n}</span>`).join('');
    const grupos=[
      indispHoje.length?`<div class="cag-disp-group"><span class="cag-disp-label">Folga hoje</span>${tags(indispHoje,'folga')}</div>`:'',
      indispAmanha.length?`<div class="cag-disp-group"><span class="cag-disp-label">Folga amanhã</span>${tags(indispAmanha,'folga-amh')}</div>`:'',
      deFerias.length?`<div class="cag-disp-group"><span class="cag-disp-label">Férias</span>${tags(deFerias,'ferias')}</div>`:'',
    ].filter(Boolean).join('');
    if(grupos) html+=`<div class="cag-disp-wrap">${grupos}</div>`;
    return html;
  }

  /* ── Serviços Programados da Semana (com inserir na fila) ── */
  function htmlProgSemana() {
    // Filtrar pelas carteiras selecionadas
    const cartSel=new Set(_carteiras.filter(c=>c.selecionada).map(c=>c.nome));
    const prog=cartSel.size>0 ? _progSem.filter(p=>cartSel.has(p.equipe)) : _progSem;
    if(!prog.length) return `<div class="cag-lista-empty">Sem serviços programados para as carteiras selecionadas</div>`;
    const osNaFila=new Set();
    for (const eqId in _fila) for (const item of _fila[eqId]) if(item.os) osNaFila.add(item.os+'|'+(item.cod_servico||''));
    return th('OS','Descrição','HH Prev.','Carteira','') +
      prog.map(p=>{
        const key=p.os+'|'+(p.cod_servico||'');
        const incluso=osNaFila.has(key);
        const badge=incluso?`<span class="cag-badge" style="color:var(--green);background:var(--green-l)">Incluso</span>`:`<span class="cag-badge" style="color:#9ca3af;background:#f3f4f6">Não incluso</span>`;
        const _dadosOS = {os:p.os,cod:p.cod_servico||'',desc:p.desc_servico||'',hh:p.hh_previsto||0,equipe_orig:p.equipe||''};
        const btnInserir=`<button class="cag-act blue cag-prog-inserir" data-os="${btoa(unescape(encodeURIComponent(JSON.stringify(_dadosOS))))}" title="Inserir na fila"><i class="ti ti-plus"></i></button>`;
        return `<div class="cag-prog-row" data-key="${key}">
          ${tr(p.os||'—',`<span class="cag-desc-cell cag-prog-desc" data-full="${(p.desc_servico||'').replace(/"/g,'&quot;')}">${p.desc_servico||'—'}</span>`,p.hh_previsto?`${p.hh_previsto} HH`:'—',`<span style="font-size:10px;color:#6b7280">${p.equipe||'—'}</span>`,badge+' '+btnInserir)}
          <div class="cag-prog-expand" id="expand-${key.replace(/[^a-z0-9]/gi,'_')}"></div>
        </div>`;
      }).join('');
  }

  function htmlExecutados() {
    const enc=[];
    for (const eq of _equipes) for (const item of (_fila[eq.id]||[])) if(item.status==='encerrado') enc.push(item);
    if(!enc.length) return `<div class="cag-lista-empty">Nenhum serviço concluído nesta semana</div>`;
    return th('OS','Descrição','Início','Fim','Tipo')+enc.map(i=>tr(i.os||'<i style="color:#9ca3af">sem nº</i>',`<span class="cag-desc-cell">${i.desc_servico||'—'}</span>`,i.iniciado_em?fmtData(i.iniciado_em):'—',i.encerrado_em?fmtData(i.encerrado_em):'—',badgeTipo(i.tipo))).join('');
  }

  /* ══════════════════════════════════════
     RENDERIZAR
  ══════════════════════════════════════ */
  function renderizar() {
    const ini=fmtDataFull(inicioSemana(_semana));
    const fim=fmtDataFull(fimSemana(_semana));
    const sp=_semana-1,sn=_semana+1;
    const safraOpts=_safras.map(s=>`<option value="${s}"${s===_safra?' selected':''}>${s}</option>`).join('');

    // Chips de carteira com % HH alocado
    const chipsHtml=_carteiras.map(c=>{
      const progCart=_progSem.filter(p=>p.equipe===c.nome);
      const hhProg=progCart.reduce((s,p)=>s+(p.hh_previsto||0),0);
      const hhAloc=Object.values(_fila).flat().filter(i=>i.status!=='encerrado'&&i.status!=='interrompido')
        .filter(i=>progCart.some(p=>p.os===i.os&&(p.cod_servico||'')===(i.cod_servico||'')))
        .reduce((s,i)=>s+(i.hh_previsto||0),0);
      const pct=hhProg>0?Math.round(hhAloc/hhProg*100):0;
      const ok=pct>=100;
      return `<div class="cag-cart-chip${c.selecionada?' ativo':''}" data-cart="${c.nome}">
        ${c.nome} <span class="cag-cart-pct${ok?' ok':''}">${pct}%</span>
      </div>`;
    }).join('');

    const colsHtml=_equipes.length
      ?_equipes.map(htmlEquipeCol).join('')
      :`<div class="cag-sem-equipes"><i class="ti ti-users-group"></i><p>Nenhuma equipe cadastrada.</p>
        <button class="cag-btn-primary" id="btn-nova-equipe-vazio"><i class="ti ti-plus"></i> Criar primeira equipe</button></div>`;

    const legItens=[
      ['var(--cag-realizado)','Realizado'],['var(--cag-prog)','Programado'],
      ['var(--cag-fora)','Fora da prog.'],['var(--cag-mcu)','MCU'],
      ['var(--cag-estourado)','Estourado'],['var(--cag-folga)','Folga','border:1px solid #d1d5db'],
      ['var(--cag-vazio)','Disponível'],
    ].map(([bg,l,e])=>`<div class="cag-leg-item"><div class="cag-leg-dot" style="background:${bg};${e||''}"></div>${l}</div>`).join('');

    const nAnd=Object.values(_fila).flat().filter(i=>i.status==='em_execucao').length;
    const nExec=Object.values(_fila).flat().filter(i=>i.status==='encerrado').length;

    _container.innerHTML=`<div class="cag-mod">
      <div class="cag-filtros">
        <div class="cag-week-nav">
          <button class="cag-wbtn" id="btn-sem-ant"><i class="ti ti-chevron-left"></i></button>
          <div class="cag-week-chip" id="btn-sem-prev">Sem ${sp} · ${fmtData(inicioSemana(sp))}–${fmtData(fimSemana(sp))}</div>
          <div class="cag-week-atual"><i class="ti ti-calendar-week"></i> Sem ${_semana} · ${ini} – ${fim}</div>
          <div class="cag-week-chip" id="btn-sem-prox">Sem ${sn} · ${fmtData(inicioSemana(sn))}–${fmtData(fimSemana(sn))}</div>
          <button class="cag-wbtn" id="btn-sem-prox2"><i class="ti ti-chevron-right"></i></button>
        </div>
        <div class="cag-filtros-sep"></div>
        <select class="cag-select" id="cag-safra-sel">${safraOpts}</select>
        <div class="cag-filtros-sep"></div>
        <div class="cag-cart-chips">${chipsHtml}</div>
        <div class="cag-filtros-sep"></div>
        <button class="cag-btn-primary" id="btn-nova-equipe"><i class="ti ti-plus"></i> Nova equipe</button>
      </div>

      ${htmlLista('andamento','Serviços em Andamento','activity',nAnd||null,htmlServsEmAndamento(),'background:#dbeafe;color:#1d4ed8')}

      <div class="cag-kanban-scroll"><div class="cag-kanban" id="cag-kanban">${colsHtml}</div></div>
      <div class="cag-legenda">${legItens}</div>

      ${htmlLista('prog-semana','Serviços Programados da Semana','calendar-week',_progSem.length||null,htmlProgSemana(),'')}
      ${htmlLista('executados','Serviços Executados','circle-check',nExec||null,htmlExecutados(),'background:#dcfce7;color:#16a34a')}
    </div>`;

    bindEventos();
    iniciarSortable();
  }

  /* ══════════════════════════════════════
     EVENTOS
  ══════════════════════════════════════ */
  function bindEventos() {
    const c=_container;
    c.querySelector('#btn-sem-ant').addEventListener('click',()=>trocarSemana(_semana-1));
    c.querySelector('#btn-sem-prox2').addEventListener('click',()=>trocarSemana(_semana+1));
    c.querySelector('#btn-sem-prev').addEventListener('click',()=>trocarSemana(_semana-1));
    c.querySelector('#btn-sem-prox').addEventListener('click',()=>trocarSemana(_semana+1));
    c.querySelector('#cag-safra-sel').addEventListener('change',e=>{_safra=e.target.value;recarregarDados();});
    c.querySelector('#btn-nova-equipe').addEventListener('click',()=>abrirModalEquipe(null));
    const bv=c.querySelector('#btn-nova-equipe-vazio'); if(bv)bv.addEventListener('click',()=>abrirModalEquipe(null));

    // Chips de carteira
    c.querySelectorAll('.cag-cart-chip').forEach(chip=>{
      chip.addEventListener('click',()=>{
        const nome=chip.dataset.cart;
        const cart=_carteiras.find(ct=>ct.nome===nome);
        if(cart){cart.selecionada=!cart.selecionada; renderizar();}
      });
    });

    // Listas suspensas
    c.querySelectorAll('.cag-lista-toggle').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const body=c.querySelector(`#lista-body-${btn.dataset.lista}`);
        const chev=btn.querySelector('.cag-lista-chevron');
        const open=body.classList.toggle('open');
        chev.style.transform=open?'rotate(180deg)':'';
      });
    });

    // Cards — expandir com distinção touch/drag
    c.querySelectorAll('.cag-card-body').forEach(body=>{
      let touchStartY=0,touchStartX=0,moved=false;
      body.addEventListener('touchstart',e=>{
        touchStartX=e.touches[0].clientX; touchStartY=e.touches[0].clientY; moved=false;
      },{passive:true});
      body.addEventListener('touchmove',e=>{
        const dx=Math.abs(e.touches[0].clientX-touchStartX);
        const dy=Math.abs(e.touches[0].clientY-touchStartY);
        if(dx>8||dy>8) moved=true;
      },{passive:true});
      body.addEventListener('touchend',e=>{
        if(!moved&&!e.target.closest('button')) body.closest('.cag-card').classList.toggle('open');
      });
      body.addEventListener('click',e=>{
        if(e.target.closest('button')) return;
        body.closest('.cag-card').classList.toggle('open');
      });
    });

    // Ações dos cards
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
          case 'mover-pos':     acaoMoverPos(iid,ieq);break;
          case 'vincular':      acaoVincular(iid);break;
          case 'add-os':        abrirModalOS(ieq);break;
          case 'config-equipe': abrirModalEquipe(ieq);break;
        }
      });
    });

    // Inserir programado na fila
    c.querySelectorAll('.cag-prog-inserir').forEach(btn=>{
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        const dados=JSON.parse(decodeURIComponent(escape(atob(btn.dataset.os))));
        abrirModalInserirPrografila(dados);
      });
    });

    // Expandir descrição completa ao clicar na linha da programação
    c.querySelectorAll('.cag-prog-desc').forEach(el=>{
      el.addEventListener('click',e=>{
        e.stopPropagation();
        const full=el.dataset.full;
        if(full&&full.length>el.textContent.length-3){
          const row=el.closest('.cag-prog-row');
          const key=row && row.dataset && row.dataset.key ? row.dataset.key.replace(/[^a-z0-9]/gi,'_') : null;
          const exp=c.querySelector(`#expand-${key}`);
          if(exp){
            if(exp.classList.contains('open')){exp.innerHTML='';exp.classList.remove('open');}
            else{exp.innerHTML=`<div class="cag-prog-full-desc">${full}</div>`;exp.classList.add('open');}
          }
        }
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
    for (const eqId in _fila) if(_fila[eqId].some(i=>i.id===id)){equipeId=parseInt(eqId);break;}
    if(equipeId){
      const prox=(_fila[equipeId]||[]).find(i=>i.id!==id&&(i.status==='pendente'||i.status==='aguardando_inicio'));
      if(prox&&prox.status==='pendente') await atualizarStatus(prox.id,'aguardando_inicio');
    }
    await recarregarDados();
  }

  async function acaoReabrir(id) {
    await atualizarStatus(id,'pendente',{encerrado_em:null}); await recarregarDados();
  }

  async function acaoInterromper(id) {
    const motivo=await abrirModalOpcoes('Motivo da interrupção',['Falta de Material','Falta de Acesso','Segurança Comprometida']);
    if(!motivo)return;
    let equipeId=null;
    for (const eqId in _fila) if(_fila[eqId].some(i=>i.id===id)){equipeId=parseInt(eqId);break;}
    if(equipeId){
      const fila=_fila[equipeId]; const idx=fila.findIndex(i=>i.id===id);
      if(idx>=0){const [item]=fila.splice(idx,1);fila.push(item);await salvarOrdem(equipeId);}
    }
    await atualizarStatus(id,'interrompido',{obs:motivo}); await recarregarDados();
  }

  async function acaoRecolocar(id,equipeId) {
    await atualizarStatus(id,'pendente',{obs:null});
    const fila=_fila[equipeId]||[];
    const idx=fila.findIndex(i=>i.id===id);
    if(idx>=0){
      const [item]=fila.splice(idx,1);
      const posInter=fila.findIndex(i=>i.status==='interrompido');
      posInter>=0?fila.splice(posInter,0,item):fila.push(item);
      await salvarOrdem(equipeId);
    }
    await recarregarDados();
  }

  async function acaoRemover(id) {
    if(!confirm('Remover este serviço da fila?'))return;
    await removerDaFila(id); await recarregarDados();
  }

  async function acaoMoverEquipe(id,equipeAtualId) {
    const opcoes=_equipes.filter(e=>e.id!==equipeAtualId).map(e=>e.nome);
    if(!opcoes.length){alert('Não há outras equipes.');return;}
    const escolha=await abrirModalOpcoes('Mover para qual equipe?',opcoes); if(!escolha)return;
    const novaEq=_equipes.find(e=>e.nome===escolha); if(!novaEq)return;
    const db=getDB(); const nova_ordem=(_fila[novaEq.id]||[]).length+1;
    await db.from('cal_fila').update({equipe_id:novaEq.id,ordem:nova_ordem}).eq('id',id);
    for (const eqId in _fila){const idx=_fila[eqId].findIndex(i=>i.id===id);if(idx>=0){const [item]=_fila[eqId].splice(idx,1);item.equipe_id=novaEq.id;item.ordem=nova_ordem;if(!_fila[novaEq.id])_fila[novaEq.id]=[];_fila[novaEq.id].push(item);break;}}
    await recarregarDados();
  }

  async function acaoMoverPos(id,equipeId) {
    const fila=_fila[equipeId]||[];
    const atual=fila.findIndex(i=>i.id===id)+1;
    const pos=prompt(`Posição atual: ${atual}/${fila.length}\nNova posição:`,atual); if(!pos)return;
    const nova=Math.max(1,Math.min(fila.length,parseInt(pos))); if(isNaN(nova))return;
    const idx=fila.findIndex(i=>i.id===id);
    const [item]=fila.splice(idx,1); fila.splice(nova-1,0,item);
    await salvarOrdem(equipeId); await recarregarDados();
  }

  async function acaoVincular(id) {
    const num=prompt('Digite o número da OS:'); if(!num)return;
    const db=getDB(); const os=num.trim().replace(/^0+/,'');
    const {data}=await db.from('ordens_servico').select('os,desc_servico,hh_prev_servico,tipo_atividade').eq('os',os).limit(1).single();
    if(data){const tipo=data.tipo_atividade==='MCU'?'mcu':'programado';await db.from('cal_fila').update({os:data.os,desc_servico:data.desc_servico||undefined,hh_previsto:data.hh_prev_servico||undefined,tipo,vinculado:true}).eq('id',id);}
    else await db.from('cal_fila').update({os,vinculado:false}).eq('id',id);
    await recarregarDados();
  }

  /* ══════════════════════════════════════
     MODAL — INSERIR PROGRAMADO NA FILA
  ══════════════════════════════════════ */
  function abrirModalInserirPrografila(dados) {
    const overlay=document.createElement('div'); overlay.className='cag-modal-overlay';
    const eqOpts=_equipes.map(e=>`<option value="${e.id}">${e.nome}</option>`).join('');
    overlay.innerHTML=`<div class="cag-modal" style="width:360px">
      <div class="cag-modal-titulo">Inserir na fila</div>
      <div class="cag-modal-form">
        <div class="cag-prog-modal-desc">${dados.desc}</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:4px">${dados.os} · ${dados.hh} HH · ${dados.equipe_orig}</div>
        <label class="cag-form-label" style="margin-top:10px">Equipe</label>
        <select class="cag-form-input" id="modal-prog-eq" style="height:36px">${eqOpts}</select>
        <label class="cag-form-label" style="margin-top:10px">Posição na fila</label>
        <div class="cag-tipo-opts">
          <button class="cag-tipo-btn" data-pos="fim">Fim da fila</button>
          <button class="cag-tipo-btn active" data-pos="seguida">Em seguida</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="cag-modal-cancel" style="flex:1">Cancelar</button>
        <button class="cag-btn-primary" id="modal-prog-confirm" style="flex:2"><i class="ti ti-plus"></i> Inserir</button>
      </div>
    </div>`;

    let posSel='seguida';
    overlay.querySelectorAll('.cag-tipo-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        overlay.querySelectorAll('.cag-tipo-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active'); posSel=btn.dataset.pos;
      });
    });

    overlay.querySelector('#modal-prog-confirm').addEventListener('click',async()=>{
      const equipeId=parseInt(overlay.querySelector('#modal-prog-eq').value);
      const equipe=_equipes.find(e=>e.id===equipeId); if(!equipe)return;
      const fila=_fila[equipeId]||[];
      const emExec=fila.find(i=>i.status==='em_execucao');
      const item={os:dados.os,cod_servico:dados.cod||null,desc_servico:dados.desc,hh_previsto:dados.hh||null,tipo:'programado',status:'pendente',vinculado:true};

      if(posSel==='fim'){
        await inserirNaFila(equipeId,item,'fim');
        overlay.remove(); await recarregarDados(); return;
      }

      // Em seguida — checar se há serviço em execução
      if(!emExec){
        await inserirNaFila(equipeId,item,'inicio');
        overlay.remove(); await recarregarDados(); return;
      }

      // Há serviço em execução — perguntar ação
      overlay.remove();
      const opcao=await abrirModalOpcoes(
        `"${equipe.nome}" tem serviço em execução.\nComo inserir em seguida?`,
        ['Só em seguida (sem interromper)','Em seguida interrompendo atual','Concluir atual e iniciar em seguida']
      );
      if(!opcao) return;

      if(opcao==='Só em seguida (sem interromper)'){
        // Posição 1 na fila (logo após o em execução que fica na pos 0)
        const posIdx=fila.findIndex(i=>i.id===emExec.id)+1;
        await inserirNaFila(equipeId,item,posIdx);
        await recarregarDados();
      } else if(opcao==='Em seguida interrompendo atual'){
        const hora=await modalHora('Hora da interrupção',horaAtual()); if(!hora)return;
        // Interromper atual
        const agora=new Date(); const [h,m]=hora.split(':').map(Number); agora.setHours(h,m,0,0);
        const motivoInter=await abrirModalOpcoes('Motivo da interrupção',['Falta de Material','Falta de Acesso','Segurança Comprometida','Interrompido para prioridade']);
        // Mover atual para o fim
        const idxExec=fila.findIndex(i=>i.id===emExec.id);
        if(idxExec>=0){const [it]=fila.splice(idxExec,1);fila.push(it);await salvarOrdem(equipeId);}
        await atualizarStatus(emExec.id,'interrompido',{obs:motivoInter||'Interrompido para prioridade'});
        // Inserir novo no início
        await inserirNaFila(equipeId,{...item,status:'aguardando_inicio'},0);
        await recarregarDados();
      } else if(opcao==='Concluir atual e iniciar em seguida'){
        const hora=await modalHora('Hora de conclusão / início',horaAtual()); if(!hora)return;
        const agora=new Date(); const [h,m]=hora.split(':').map(Number); agora.setHours(h,m,0,0);
        await atualizarStatus(emExec.id,'encerrado',{encerrado_em:agora.toISOString()});
        // Inserir novo já iniciado
        await inserirNaFila(equipeId,{...item,status:'em_execucao',iniciado_em:agora.toISOString()},0);
        await recarregarDados();
      }
    });

    overlay.querySelector('.cag-modal-cancel').addEventListener('click',()=>overlay.remove());
    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
    document.body.appendChild(overlay);
  }

  /* ══════════════════════════════════════
     MODAIS UTILITÁRIOS
  ══════════════════════════════════════ */
  function modalHora(titulo,valorPadrao) {
    return new Promise(resolve=>{
      const o=document.createElement('div'); o.className='cag-modal-overlay';
      o.innerHTML=`<div class="cag-modal" style="width:280px">
        <div class="cag-modal-titulo">${titulo}</div>
        <input type="time" id="mh-input" class="cag-form-input" style="font-size:22px;height:48px;text-align:center" value="${valorPadrao}">
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="cag-modal-cancel" style="flex:1">Cancelar</button>
          <button class="cag-btn-primary" id="mh-ok" style="flex:2"><i class="ti ti-check"></i> Confirmar</button>
        </div>
      </div>`;
      o.querySelector('#mh-ok').addEventListener('click',()=>{const v=o.querySelector('#mh-input').value;o.remove();resolve(v||null);});
      o.querySelector('.cag-modal-cancel').addEventListener('click',()=>{o.remove();resolve(null);});
      o.addEventListener('click',e=>{if(e.target===o){o.remove();resolve(null);}});
      document.body.appendChild(o);
      o.querySelector('#mh-input').focus();
    });
  }

  function abrirModalOpcoes(titulo,opcoes) {
    return new Promise(resolve=>{
      const o=document.createElement('div'); o.className='cag-modal-overlay';
      o.innerHTML=`<div class="cag-modal"><div class="cag-modal-titulo">${titulo}</div>
        <div class="cag-modal-opcoes">${opcoes.map((op,i)=>`<button class="cag-modal-opt" data-idx="${i}">${op}</button>`).join('')}</div>
        <button class="cag-modal-cancel">Cancelar</button></div>`;
      o.querySelectorAll('.cag-modal-opt').forEach((btn,i)=>{btn.addEventListener('click',()=>{o.remove();resolve(opcoes[i]);});});
      o.querySelector('.cag-modal-cancel').addEventListener('click',()=>{o.remove();resolve(null);});
      o.addEventListener('click',e=>{if(e.target===o){o.remove();resolve(null);}});
      document.body.appendChild(o);
    });
  }

  function abrirModalOS(equipeId) {
    const o=document.createElement('div'); o.className='cag-modal-overlay';
    o.innerHTML=`<div class="cag-modal" style="width:340px">
      <div class="cag-modal-titulo">Inserir Serviço</div>
      <div class="cag-modal-form">
        <label class="cag-form-label">Tipo</label>
        <div class="cag-tipo-opts">
          <button class="cag-tipo-btn active" data-tipo="programado">Programado</button>
          <button class="cag-tipo-btn" data-tipo="fora_prog">Fora da prog.</button>
          <button class="cag-tipo-btn" data-tipo="mcu">MCU</button>
        </div>
        <label class="cag-form-label">Nº OS <span style="color:#9ca3af">(opcional)</span></label>
        <input type="text" id="mos-num" class="cag-form-input" placeholder="Ex: 1234567">
        <div id="mos-hint" class="cag-form-hint"></div>
        <label class="cag-form-label">Descrição</label>
        <input type="text" id="mos-desc" class="cag-form-input" placeholder="Descrição do serviço">
        <label class="cag-form-label">HH Estimado</label>
        <input type="number" id="mos-hh" class="cag-form-input" placeholder="Ex: 8" min="0" step="0.5">
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="cag-modal-cancel" style="flex:1">Cancelar</button>
        <button class="cag-btn-primary" id="mos-confirm" style="flex:2"><i class="ti ti-plus"></i> Adicionar</button>
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
        if(data){hint.innerHTML=`<span style="color:var(--green)"><i class="ti ti-check"></i> ${data.desc_servico||'sem descrição'}</span>`;o.querySelector('#mos-desc').value=data.desc_servico||'';o.querySelector('#mos-hh').value=data.hh_prev_servico||'';if(data.tipo_atividade==='MCU'){tipoSel='mcu';o.querySelectorAll('.cag-tipo-btn').forEach(b=>b.classList.toggle('active',b.dataset.tipo==='mcu'));}}
        else hint.innerHTML=`<span style="color:var(--amber)"><i class="ti ti-alert-circle"></i> Não encontrada</span>`;
      },500);
    });
    o.querySelector('#mos-confirm').addEventListener('click',async()=>{
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
    const equipe=equipeId?_equipes.find(e=>e.id===equipeId):null;
    const chapasNaEq=new Set(((equipe && equipe.membros)||[]).map(m=>m.chapa));
    const membHtml=_colabs.map(c=>{
      const cracha=c.cracha||c.chapa; const naEq=chapasNaEq.has(cracha);
      const emOutra=!naEq&&_equipes.some(e=>e.id!==equipeId&&(e.membros||[]).some(m=>m.chapa===cracha));
      const semTurno=!c.turno_id;
      const aviso=semTurno?' ⚠ sem turno':emOutra?' (outra equipe)':'';
      return `<label class="cag-colab-item${naEq?' checked':''}"><input type="checkbox" value="${cracha}"${naEq?' checked':''}><span>${c.nome||cracha}<span class="cag-colab-hint">${aviso}</span></span></label>`;
    }).join('');
    const o=document.createElement('div'); o.className='cag-modal-overlay';
    o.innerHTML=`<div class="cag-modal" style="width:360px;max-height:80vh;overflow-y:auto">
      <div class="cag-modal-titulo">${equipe?'Configurar: '+equipe.nome:'Nova Equipe'}</div>
      <div class="cag-modal-form">
        <label class="cag-form-label">Nome</label>
        <input type="text" id="meq-nome" class="cag-form-input" placeholder="Ex: Eq. Marcelo" value="${equipe?equipe.nome:''}">
        <label class="cag-form-label" style="margin-top:10px">Colaboradores CAL</label>
        <div class="cag-colab-list">${membHtml}</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="cag-modal-cancel" style="flex:1">Cancelar</button>
        ${equipe?`<button class="cag-act red" id="meq-del" style="flex:1"><i class="ti ti-trash"></i> Desativar</button>`:''}
        <button class="cag-btn-primary" id="meq-confirm" style="flex:2"><i class="ti ti-check"></i> Salvar</button>
      </div>
    </div>`;
    o.querySelectorAll('.cag-colab-item').forEach(lbl=>{lbl.addEventListener('click',()=>{setTimeout(()=>lbl.classList.toggle('checked',lbl.querySelector('input').checked),0);});});
    o.querySelector('#meq-confirm').addEventListener('click',async()=>{
      const nome=o.querySelector('#meq-nome').value.trim(); if(!nome){alert('Informe o nome');return;}
      const selecionados=[...o.querySelectorAll('.cag-colab-list input:checked')].map(i=>i.value);
      await salvarEquipe(equipeId,nome,selecionados); o.remove(); await recarregarDados();
    });
    const del=o.querySelector('#meq-del');
    if(del)del.addEventListener('click',async()=>{if(!confirm('Desativar?'))return;await getDB().from('cal_equipes').update({ativo:false}).eq('id',equipeId);o.remove();await recarregarDados();});
    o.querySelector('.cag-modal-cancel').addEventListener('click',()=>o.remove());
    o.addEventListener('click',e=>{if(e.target===o)o.remove();});
    document.body.appendChild(o);
  }

  async function salvarEquipe(equipeId,nome,chapas) {
    const db=getDB(); let eqId=equipeId;
    if(!eqId){const {data}=await db.from('cal_equipes').insert({nome,ativo:true}).select().single();if(!data)return;eqId=data.id;}
    else await db.from('cal_equipes').update({nome}).eq('id',eqId);
    const {data:ma}=await db.from('cal_equipe_membros').select('*').eq('equipe_id',eqId);
    const ca=new Set((ma||[]).map(m=>m.chapa));
    for (const ch of chapas) if(!ca.has(ch)){const c=_colabs.find(x=>(x.cracha||x.chapa)===ch);await db.from('cal_equipe_membros').insert({equipe_id:eqId,chapa:ch,nome:(c && c.nome)||null,vigencia_inicio:new Date().toISOString()});}
    for (const ch of ca) if(!chapas.includes(ch)) await db.from('cal_equipe_membros').delete().eq('equipe_id',eqId).eq('chapa',ch);
  }

  /* ══════════════════════════════════════
     SORTABLE — delay mobile
  ══════════════════════════════════════ */
  function iniciarSortable() {
    if(typeof Sortable==='undefined')return;
    _container.querySelectorAll('.cag-fila').forEach(el=>{
      Sortable.create(el,{
        animation:150, handle:'.cag-card', draggable:'.cag-card',
        delay:200,              // delay para distinguir toque de drag
        delayOnTouchOnly:true,  // delay só no touch
        touchStartThreshold:5,
        onEnd:async evt=>{
          const equipeId=parseInt(el.id.replace('fila-',''));
          const fila=_fila[equipeId]; if(!fila)return;
          const [item]=fila.splice(evt.oldIndex,1); fila.splice(evt.newIndex,0,item);
          await salvarOrdem(equipeId); await recarregarDados();
        }
      });
    });
  }

  async function trocarSemana(nova) {
    _semana=nova; _container.innerHTML=`<div class="cag-loading"><i class="ti ti-loader-2"></i> Carregando...</div>`;
    await carregarTudo(); renderizar();
  }
  async function recarregarDados() { await carregarTudo(); renderizar(); }

  /* ══════════════════════════════════════
     CSS
  ══════════════════════════════════════ */
  function injetarCSS() {
    if(document.getElementById('cag-style'))return;
    const s=document.createElement('style'); s.id='cag-style';
    s.textContent=`
      :root{--cag-realizado:#86efac;--cag-prog:#93c5fd;--cag-fora:#fde047;--cag-mcu:#fca5a5;--cag-estourado:#c4b5fd;--cag-folga:#ffffff;--cag-vazio:#e4e4e7;--cag-prog-l:#dbeafe;--cag-fora-l:#fef9c3;--cag-mcu-l:#fee2e2;--cs-prog:#2563eb;--cs-fora:#ca8a04;--cs-mcu:#dc2626;--cs-inter:#d97706;--cs-done:#16a34a;}
      .cag-mod{display:flex;flex-direction:column;gap:10px;padding:14px;}
      .cag-loading{display:flex;align-items:center;justify-content:center;gap:8px;padding:48px;color:#9ca3af;font-size:13px;}
      .cag-loading i{font-size:20px;animation:cag-spin 1s linear infinite;}
      @keyframes cag-spin{to{transform:rotate(360deg)}}
      .cag-filtros{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;box-shadow:var(--shadow);}
      .cag-week-nav{display:flex;align-items:center;gap:4px;}
      .cag-wbtn{width:28px;height:28px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;color:#6b7280;}
      .cag-wbtn:hover{background:var(--border);}
      .cag-week-atual{height:28px;padding:0 12px;background:var(--yellow);border-radius:var(--radius-sm);font-size:11px;font-weight:700;color:var(--dark1);display:flex;align-items:center;gap:6px;white-space:nowrap;}
      .cag-week-chip{height:28px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-size:10px;font-weight:500;color:#6b7280;display:flex;align-items:center;cursor:pointer;white-space:nowrap;}
      .cag-week-chip:hover{border-color:#9ca3af;}
      .cag-filtros-sep{width:1px;height:24px;background:var(--border);}
      .cag-select{height:28px;padding:0 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;color:#374151;cursor:pointer;}
      .cag-btn-primary{height:28px;padding:0 12px;border:none;border-radius:var(--radius-sm);background:var(--yellow);font-family:var(--font);font-size:11px;font-weight:700;color:var(--dark1);cursor:pointer;display:flex;align-items:center;gap:5px;}
      .cag-btn-primary:hover{background:var(--yellow-dk,#daa900);}
      .cag-cart-chips{display:flex;gap:5px;flex-wrap:wrap;}
      .cag-cart-chip{display:flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;border:1px solid var(--border);background:var(--bg);font-size:10px;font-weight:600;color:#6b7280;cursor:pointer;user-select:none;}
      .cag-cart-chip.ativo{border-color:var(--blue,#2563eb);background:#dbeafe;color:#2563eb;}
      .cag-cart-pct{font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;background:rgba(0,0,0,.08);}
      .cag-cart-pct.ok{background:#dcfce7;color:#16a34a;}
      .cag-lista{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
      .cag-lista-toggle{display:flex;align-items:center;gap:8px;padding:9px 14px;cursor:pointer;user-select:none;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;}
      .cag-lista-toggle:hover{background:var(--bg);}
      .cag-lista-toggle i:first-child{font-size:14px;}
      .cag-lista-badge{padding:1px 7px;border-radius:10px;font-size:9px;font-weight:700;}
      .cag-lista-chevron{font-size:13px;transition:transform .2s;}
      .cag-lista-body{display:none;border-top:1px solid var(--border);overflow-x:auto;}
      .cag-lista-body.open{display:block;}
      .cag-lista-empty{padding:14px;font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:6px;}
      .cag-tr{display:flex;align-items:center;border-bottom:1px solid var(--border);min-width:480px;}
      .cag-tr:last-child{border-bottom:none;}
      .cag-thead{background:#fafafa;}
      .cag-thead .cag-td{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;}
      .cag-td{padding:7px 10px;font-size:11px;color:#374151;flex-shrink:0;}
      .cag-td:first-child{width:85px;font-weight:700;}
      .cag-td:nth-child(2){flex:1;min-width:140px;}
      .cag-td:nth-child(3),.cag-td:nth-child(4){width:65px;}
      .cag-td:nth-child(5){width:90px;}
      .cag-td:nth-child(6){width:80px;}
      .cag-desc-cell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:200px;}
      .cag-equipe-cell{font-size:10px;color:#6b7280;}
      .cag-badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
      .cag-disp-wrap{padding:10px 14px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px;}
      .cag-disp-group{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
      .cag-disp-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;min-width:90px;}
      .cag-disp-tag{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:500;}
      .cag-disp-tag.folga{background:#f3f4f6;color:#6b7280;}
      .cag-disp-tag.folga-amh{background:#fef3c7;color:#d97706;}
      .cag-disp-tag.ferias{background:#dbeafe;color:#2563eb;}
      .cag-prog-row{}
      .cag-prog-full-desc{padding:8px 12px;font-size:11px;color:#374151;background:#fffbeb;border-top:1px solid var(--border);}
      .cag-prog-expand{}
      .cag-prog-modal-desc{font-size:12px;font-weight:600;color:#374151;line-height:1.4;}
      .cag-kanban-scroll{overflow-x:auto;}
      .cag-kanban-scroll::-webkit-scrollbar{height:5px;}
      .cag-kanban-scroll::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
      .cag-kanban{display:flex;gap:10px;min-width:max-content;padding-bottom:4px;}
      .cag-sem-equipes{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:48px;color:#9ca3af;text-align:center;width:100%;}
      .cag-sem-equipes i{font-size:32px;}
      .cag-equipe-col{width:230px;flex-shrink:0;display:flex;flex-direction:column;gap:5px;}
      .cag-eq-header{background:var(--dark2,#2a2a2a);border-radius:var(--radius);padding:9px 10px;color:#f0f0f0;}
      .cag-eq-header.estouro{background:#3b1a1a;}
      .cag-eq-nome{font-size:11px;font-weight:700;letter-spacing:.04em;margin-bottom:5px;display:flex;align-items:center;justify-content:space-between;}
      .cag-eq-btn{width:20px;height:20px;border:1px solid rgba(255,255,255,.15);border-radius:4px;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:11px;}
      .cag-eq-btn:hover{background:rgba(255,255,255,.1);color:#fff;}
      .cag-membros{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:7px;}
      .cag-membro-tag{padding:1px 6px;border-radius:10px;background:rgba(255,255,255,.1);font-size:9px;color:#9ca3af;}
      .cag-membro-tag.warn{background:rgba(248,193,0,.2);color:#F8C100;}
      .cag-mg-labels{display:flex;gap:2px;margin-bottom:2px;}
      .cag-mg-dl{flex:1;text-align:center;font-size:7px;color:#9ca3af;font-weight:600;}
      .cag-mg{display:flex;gap:2px;}
      .cag-mg-day{flex:1;height:16px;border-radius:3px;border:1px solid rgba(0,0,0,.06);}
      .cag-mg-day.hoje{box-shadow:0 0 0 2px #F8C100;z-index:1;position:relative;}
      .cag-cap-hh{font-size:9px;color:#9ca3af;margin-top:3px;text-align:right;}
      .cag-fila{display:flex;flex-direction:column;gap:4px;}
      .cag-card{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;cursor:pointer;transition:box-shadow .15s;position:relative;-webkit-user-select:none;user-select:none;}
      .cag-card:hover{box-shadow:var(--shadow-md,0 4px 12px rgba(0,0,0,.10));}
      .cag-stripe{position:absolute;left:0;top:0;bottom:0;width:4px;}
      .cag-card-body{padding:6px 8px 6px 12px;}
      .cag-card-head{display:flex;align-items:center;gap:6px;}
      .cag-os-num{font-size:10px;font-weight:700;color:#374151;font-variant-numeric:tabular-nums;flex-shrink:0;}
      .cag-os-num.sem-os{color:#9ca3af;font-style:italic;font-weight:400;}
      .cag-os-desc{font-size:10px;color:#6b7280;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .cag-si{font-size:12px;flex-shrink:0;}
      .cag-si.done{color:var(--cs-done);}.cag-si.exec{color:#0891b2;}.cag-si.inter{color:var(--cs-inter);}.cag-si.aguard{color:#6b7280;}
      .cag-exec-bar{display:flex;align-items:center;gap:4px;font-size:8px;font-weight:600;color:#0891b2;margin-bottom:2px;}
      .cag-exec-dot{width:5px;height:5px;border-radius:50%;background:#0891b2;animation:cag-pulse 1.5s infinite;}
      .cag-aguard-bar{display:flex;align-items:center;gap:4px;font-size:8px;font-weight:600;color:#6b7280;margin-bottom:2px;}
      @keyframes cag-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}
      .cag-inter-motivo{font-size:8px;color:var(--cs-inter);margin-top:2px;font-weight:600;}
      .cag-sem-os-aviso{font-size:8px;color:#d97706;margin-top:2px;display:flex;align-items:center;gap:3px;}
      .cag-card-expand{display:none;padding:6px 8px 7px 12px;border-top:1px solid var(--border);background:#fafafa;}
      .cag-card.open .cag-card-expand{display:block;}
      .cag-expand-row{margin-bottom:5px;}
      .cag-os-hh{font-size:9px;font-weight:600;color:#9ca3af;display:flex;align-items:center;gap:3px;}
      .cag-act-row{display:flex;gap:3px;flex-wrap:wrap;}
      .cag-act{height:24px;padding:0 7px;border:1px solid var(--border);border-radius:4px;background:var(--bg);font-family:var(--font);font-size:9px;font-weight:600;color:#374151;cursor:pointer;display:flex;align-items:center;gap:3px;white-space:nowrap;}
      .cag-act i{font-size:11px;}
      .cag-act.green{background:#dcfce7;border-color:#86efac;color:#16a34a;}
      .cag-act.amber{background:#fef3c7;border-color:#fcd34d;color:#d97706;}
      .cag-act.blue{background:#dbeafe;border-color:#93c5fd;color:#2563eb;}
      .cag-act.red{background:#fee2e2;border-color:#fca5a5;color:#dc2626;}
      .cag-act.ghost{background:transparent;border-color:var(--border);color:#9ca3af;}
      .cag-card.concluido{background:#f0fdf4;border-color:#bbf7d0;opacity:.72;}
      .cag-card.concluido .cag-os-num{color:var(--cs-done);}
      .cag-card.em-exec{border-color:#a5f3fc;background:#ecfeff;}
      .cag-card.interrompido{background:#fef3c7;border-color:#fcd34d;}
      .cag-card.interrompido .cag-os-num{color:#d97706;}
      .cag-card.aguardando{border-color:#e5e7eb;background:#f9fafb;}
      .cag-overflow-div{display:flex;align-items:center;gap:6px;padding:2px 0;}
      .cag-overflow-line{flex:1;height:2px;background:#c4b5fd;border-radius:1px;}
      .cag-overflow-label{font-size:9px;font-weight:700;color:#7c3aed;white-space:nowrap;display:flex;align-items:center;gap:3px;}
      .cag-add-os-btn{width:100%;height:28px;border:1px dashed var(--border);border-radius:var(--radius-sm);background:transparent;font-family:var(--font);font-size:10px;font-weight:500;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;}
      .cag-add-os-btn:hover{border-color:var(--yellow);color:var(--dark1);background:#fffbeb;}
      .cag-legenda{display:flex;gap:10px;flex-wrap:wrap;padding:4px 0;}
      .cag-leg-item{display:flex;align-items:center;gap:5px;font-size:9px;color:#6b7280;}
      .cag-leg-dot{width:10px;height:10px;border-radius:2px;flex-shrink:0;}
      .cag-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;}
      .cag-modal{background:var(--card-bg);border-radius:var(--radius);box-shadow:0 8px 30px rgba(0,0,0,.15);padding:20px;width:300px;max-width:100%;}
      .cag-modal-titulo{font-size:13px;font-weight:700;margin-bottom:14px;color:var(--dark1);}
      .cag-modal-opcoes{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;}
      .cag-modal-opt{width:100%;padding:9px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:12px;font-weight:500;color:#374151;cursor:pointer;text-align:left;}
      .cag-modal-opt:hover{border-color:var(--yellow);background:#fffbeb;}
      .cag-modal-cancel{width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;font-weight:600;color:#6b7280;cursor:pointer;margin-top:4px;}
      .cag-modal-form{display:flex;flex-direction:column;gap:6px;}
      .cag-form-label{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;}
      .cag-form-input{width:100%;height:32px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:12px;color:#374151;background:var(--bg);}
      .cag-form-hint{font-size:10px;min-height:14px;}
      .cag-tipo-opts{display:flex;gap:4px;}
      .cag-tipo-btn{flex:1;height:28px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:10px;font-weight:600;color:#6b7280;cursor:pointer;}
      .cag-tipo-btn.active{background:var(--yellow);border-color:#daa900;color:var(--dark1);}
      .cag-colab-list{display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto;}
      .cag-colab-item{display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;font-size:11px;color:#374151;font-weight:500;}
      .cag-colab-item:hover{background:var(--bg);}
      .cag-colab-item.checked{background:#dbeafe;border-color:#93c5fd;}
      .cag-colab-item input{accent-color:var(--yellow);}
      .cag-colab-hint{font-size:9px;color:#9ca3af;margin-left:4px;}
    `;
    document.head.appendChild(s);
  }

  function carregarSortable() {
    return new Promise(resolve=>{
      if(typeof Sortable!=='undefined'){resolve();return;}
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js';
      s.onload=resolve;s.onerror=resolve;document.head.appendChild(s);
    });
  }

  async function init(container) {
    _container=container; injetarCSS();
    _container.innerHTML=`<div class="cag-loading"><i class="ti ti-loader-2"></i> Carregando acompanhamento...</div>`;
    await carregarSortable();
    try { await carregarTudo(); renderizar(); }
    catch(e) {
      console.error('cal_acomp:',e);
      _container.innerHTML=`<div style="padding:40px;text-align:center;color:#9ca3af"><i class="ti ti-alert-circle" style="font-size:32px;display:block;margin-bottom:8px"></i>Erro: ${e.message}</div>`;
    }
  }

  return { init };
})();
