/* ═══════════════════════════════════════════════════════════════
   MAN360 — Acompanhamento Caldeiraria v6
   window.Modulos.cal_acomp = { init(container) }
   ═══════════════════════════════════════════════════════════════ */

window.Modulos = window.Modulos || {};
window.Modulos.cal_acomp = (() => {

  /* ── Âncora de semanas ── */
  const ANCORA_SEM  = 9;
  const ANCORA_DATA = new Date(2026, 4, 25, 12, 0, 0);

  function semAtual() {
    const h = new Date(); h.setHours(12,0,0,0);
    return ANCORA_SEM + Math.floor((h - ANCORA_DATA) / (7*86400000));
  }
  function iniSem(s) {
    const d = new Date(ANCORA_DATA);
    d.setDate(d.getDate() + (s - ANCORA_SEM)*7);
    d.setHours(0,0,0,0); return d;
  }
  function fimSem(s) { const d=iniSem(s); d.setDate(d.getDate()+6); return d; }

  function isoDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function fmtDia(d) {
    if (!d) return '—';
    const dt = typeof d==='string' ? new Date(d.includes('T')?d:d+'T12:00:00') : new Date(d);
    const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    return `${dias[dt.getDay()]} ${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
  }
  function fmtHora(d) {
    if (!d) return '';
    const dt = typeof d==='string' ? new Date(d) : new Date(d);
    return `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
  }
  function fmtDiaHora(d) {
    if (!d) return '—';
    return `${fmtDia(d)} ${fmtHora(d)}`;
  }
  function horaAtual() {
    const n=new Date();
    return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  }
  function hoje() { const d=new Date(); d.setHours(12,0,0,0); return d; }

  /* ── Estado ── */
  let _sem       = semAtual();
  let _equipes   = [];
  let _fila      = {};
  let _progSem   = [];
  let _progAnt   = [];
  let _colabs    = [];
  let _turnos    = {};
  let _escalas   = {};
  let _ferias    = [];
  let _justific  = [];
  let _container = null;
  let _itemAberto= null;  // id do item com ações abertas

  /* ── Semana passada? ── */
  function semPassada() { return _sem < semAtual(); }

  /* ── Folgas ── */
  function projetarFolgas(colab, ini, fim) {
    const folgas = new Set();
    const esc = _escalas[colab.escala_id]; if (!esc) return folgas;
    const di = new Date(ini); di.setHours(12,0,0,0);
    const df = new Date(fim); df.setHours(12,0,0,0);
    if (esc.tipo_ciclo==='ADM') {
      let d=new Date(di);
      while(d<=df){if(d.getDay()===0||d.getDay()===6)folgas.add(isoDate(d));d.setDate(d.getDate()+1);}
      return folgas;
    }
    const ancora=colab.data_ref_folga||colab.primeira_folga; if(!ancora) return folgas;
    const ancD=new Date(ancora+'T12:00:00'); const ciclo=(esc.dias_trabalho||5)+1;
    let d=new Date(di);
    while(d<=df){
      const diff=Math.round((d-ancD)/86400000);
      const pos=((diff%ciclo)+ciclo)%ciclo;
      if(pos===esc.dias_trabalho)folgas.add(isoDate(d));
      d.setDate(d.getDate()+1);
    }
    return folgas;
  }

  /* ── HH disponível da equipe num dia ── */
  function hhEquipeDia(equipe, data) {
    const iso=isoDate(data); let total=0;
    for (const m of (equipe.membros||[])) {
      const c=_colabs.find(x=>(x.cracha||x.chapa)===m.chapa);
      if(!c||!c.turno_id) continue;
      if(_ferias.some(f=>f.chapa===m.chapa&&iso>=f.data_inicio&&iso<=f.data_fim)) continue;
      if(_justific.some(j=>j.chapa===m.chapa&&iso>=j.data_inicio&&iso<=j.data_fim)) continue;
      const folgas=projetarFolgas(c,iniSem(_sem),fimSem(_sem+1));
      if(folgas.has(iso)) continue;
      const t=_turnos[c.turno_id]; if(!t) continue;
      const [eh,em]=(t.hora_entrada||'07:00').split(':').map(Number);
      const [sh,sm]=(t.hora_saida||'15:20').split(':').map(Number);
      total+=Math.max(0,((sh*60+sm)-(eh*60+em)-(t.intervalo_min||0))/60);
    }
    return total;
  }

  /* ── Horário de entrada da equipe num dia ── */
  function entradaEquipeDia(equipe, data) {
    let minEntrada = 999;
    for (const m of (equipe.membros||[])) {
      const c=_colabs.find(x=>(x.cracha||x.chapa)===m.chapa);
      if(!c||!c.turno_id) continue;
      const iso=isoDate(data);
      if(_ferias.some(f=>f.chapa===m.chapa&&iso>=f.data_inicio&&iso<=f.data_fim)) continue;
      const folgas=projetarFolgas(c,iniSem(_sem),fimSem(_sem+1));
      if(folgas.has(iso)) continue;
      const t=_turnos[c.turno_id]; if(!t) continue;
      const [eh,em]=(t.hora_entrada||'07:00').split(':').map(Number);
      if(eh*60+em < minEntrada) minEntrada=eh*60+em;
    }
    return minEntrada===999 ? null : minEntrada;
  }

  /* ── Calcular previsão início/fim de cada item da fila ──
     Retorna array com {id, inicioCalc, fimCalc} para cada item ativo */
  function calcularPrevisoes(equipe) {
    const fila=(_fila[equipe.id]||[]);
    const ativos=fila.filter(i=>i.status!=='encerrado'&&i.status!=='interrompido');
    if(!ativos.length) return {};

    const result={};
    // Cursor de tempo: começa do primeiro disponível
    let cursorDt = null;

    for (let idx=0;idx<ativos.length;idx++) {
      const item=ativos[idx];
      const hhPrev=item.hh_previsto||8;

      // Ponto de partida
      if(idx===0) {
        if(item.status==='em_execucao'&&item.iniciado_em) {
          cursorDt=new Date(item.iniciado_em);
        } else if(item.status==='pausado'&&item.iniciado_em) {
          cursorDt=new Date(item.iniciado_em);
        } else {
          // Começa agora ou no início do próximo dia útil
          cursorDt=new Date();
          const hj=hoje(); const hhHj=hhEquipeDia(equipe,hj);
          if(hhHj===0) {
            // Hoje é folga, avança para próximo dia útil
            cursorDt=new Date(hj); cursorDt.setDate(cursorDt.getDate()+1);
            while(hhEquipeDia(equipe,cursorDt)===0) cursorDt.setDate(cursorDt.getDate()+1);
            const ent=entradaEquipeDia(equipe,cursorDt);
            if(ent!==null){cursorDt.setHours(Math.floor(ent/60),ent%60,0,0);}
          }
        }
      }

      result[item.id]={inicioCalc:new Date(cursorDt)};

      // Avançar cursor pelo HH previsto, pulando domingos e almoço
      let hhRestante=hhPrev;
      let d=new Date(cursorDt);

      while(hhRestante>0) {
        const hhDia=hhEquipeDia(equipe,d);
        if(hhDia===0||d.getDay()===0) { // folga ou domingo
          d.setDate(d.getDate()+1);
          const ent=entradaEquipeDia(equipe,d);
          if(ent!==null){d.setHours(Math.floor(ent/60),ent%60,0,0);}
          continue;
        }
        // Calcular horas restantes no dia a partir do cursor
        const t=_turnos[(_colabs.find(x=>(x.cracha||x.chapa)===((equipe.membros||[])[0]||{}).chapa)||{}).turno_id]||{};
        const [sh,sm]=(t.hora_saida||'17:00').split(':').map(Number);
        const saidaMin=sh*60+sm;
        const cursorMin=d.getHours()*60+d.getMinutes();
        // Pular almoço 12:00-13:00
        let dispMin=saidaMin-cursorMin;
        if(cursorMin<720&&saidaMin>780) dispMin-=60; // subtrai 1h de almoço
        else if(cursorMin>=720&&cursorMin<780) {
          d.setHours(13,0,0,0); // pula pro fim do almoço
          dispMin=saidaMin-780;
          if(dispMin<=0){d.setDate(d.getDate()+1);const ent=entradaEquipeDia(equipe,d);if(ent!==null)d.setHours(Math.floor(ent/60),ent%60,0,0);continue;}
        }
        const dispHH=Math.max(0,dispMin/60);
        if(dispHH<=0){
          d.setDate(d.getDate()+1);
          const ent=entradaEquipeDia(equipe,d);
          if(ent!==null)d.setHours(Math.floor(ent/60),ent%60,0,0);
          continue;
        }
        if(hhRestante<=dispHH) {
          // Termina hoje
          let fimMin=cursorMin+Math.round(hhRestante*60);
          // Adicionar almoço se atravessa
          if(cursorMin<720&&fimMin>720) fimMin+=60;
          d.setHours(Math.floor(fimMin/60),fimMin%60,0,0);
          hhRestante=0;
        } else {
          hhRestante-=dispHH;
          d.setDate(d.getDate()+1);
          const ent=entradaEquipeDia(equipe,d);
          if(ent!==null)d.setHours(Math.floor(ent/60),ent%60,0,0);
        }
      }

      result[item.id].fimCalc=new Date(d);
      cursorDt=new Date(d);
      // Próximo começa no início do próximo dia útil se fim foi no final do dia
    }
    return result;
  }

  /* ── Tipo de OS ── */
  function tipoOS(item) {
    if(item.tipo==='mcu') return 'MCU';
    // Verificar se está na prog da semana atual
    const naProgAtual=_progSem.some(p=>p.os===item.os&&(p.cod_servico||'')===(item.cod_servico||''));
    if(naProgAtual) return 'PRG';
    // Verificar se estava na prog da semana anterior
    const naProgAnt=_progAnt.some(p=>p.os===item.os&&(p.cod_servico||'')===(item.cod_servico||''));
    if(naProgAnt) return 'REP';
    return item.tipo==='programado'?'PRG':'NPG';
  }

  function badgeTipo(tipo) {
    const m={PRG:['#2563eb','#dbeafe'],REP:['#7c3aed','#ede9fe'],NPG:['#d97706','#fef3c7'],MCU:['#dc2626','#fee2e2']};
    const [c,b]=m[tipo]||['#9ca3af','#f3f4f6'];
    return `<span class="cd-badge" style="color:${c};background:${b}">${tipo}</span>`;
  }

  /* ── HH total disponível da equipe na semana ── */
  function hhSemEquipe(equipe) {
    let t=0; const ini=iniSem(_sem);
    for(let i=0;i<7;i++){const d=new Date(ini);d.setDate(d.getDate()+i);t+=hhEquipeDia(equipe,d);}
    return t;
  }

  /* ── Previsão de conclusão total da equipe ── */
  function prevConclusaoEquipe(equipe) {
    const prev=calcularPrevisoes(equipe);
    const fila=(_fila[equipe.id]||[]).filter(i=>i.status!=='encerrado'&&i.status!=='interrompido');
    if(!fila.length) return null;
    const ultimo=fila[fila.length-1];
    const p=prev[ultimo.id];
    return p?p.fimCalc:null;
  }

  /* ── KPIs ── */
  function calcKPIs() {
    const osNaSem = new Set(_progSem.map(p=>p.os+'|'+(p.cod_servico||'')));
    let hhPrevProg=0, hhEncProg=0, hhPrevProj=0;
    let hhMCU=0, hhREP=0, hhTotal=0;

    for(const eq of _equipes) {
      const prev=calcularPrevisoes(eq);
      const fimSemana=fimSem(_sem); fimSemana.setHours(23,59,59);
      for(const item of (_fila[eq.id]||[])) {
        const hh=item.hh_previsto||0;
        const tipo=tipoOS(item);
        hhTotal+=hh;
        if(tipo==='MCU') hhMCU+=hh;
        if(tipo==='REP') hhREP+=hh;
        const key=item.os+'|'+(item.cod_servico||'');
        if(osNaSem.has(key)) {
          hhPrevProg+=hh;
          if(item.status==='encerrado') hhEncProg+=hh;
          const p=prev[item.id];
          if(p&&p.fimCalc<=fimSemana) hhPrevProj+=hh;
        }
      }
    }
    return {
      adesAtual:  hhPrevProg>0?Math.round(hhEncProg/hhPrevProg*100):0,
      adesProj:   hhPrevProg>0?Math.round((hhEncProg+hhPrevProj)/hhPrevProg*100):0,
      pctMCU:     hhTotal>0?Math.round(hhMCU/hhTotal*100):0,
      pctREP:     hhTotal>0?Math.round(hhREP/hhTotal*100):0,
    };
  }

  /* ══════════════════════════════════════
     CARREGAR DADOS
  ══════════════════════════════════════ */
  async function carregarTudo() {
    const db=getDB();
    const ano=iniSem(_sem).getFullYear();
    const ini=isoDate(iniSem(_sem));
    const fim=isoDate(fimSem(_sem));

    const {data:colabs}=await db.from('apt_colaboradores').select('*').eq('modalidade','CAL');
    _colabs=colabs||[];
    const {data:turnos}=await db.from('apt_turnos').select('*');
    const {data:escalas}=await db.from('apt_escalas').select('*');
    _turnos={}; (turnos||[]).forEach(t=>{_turnos[t.id]=t;});
    _escalas={}; (escalas||[]).forEach(e=>{_escalas[e.id]=e;});

    const ini2=isoDate(iniSem(_sem-1)); // 2 semanas atrás para folgas
    const fim2=isoDate(fimSem(_sem+1));
    const {data:ferias}=await db.from('apt_ferias').select('*').lte('data_inicio',fim2).gte('data_fim',ini2);
    const {data:just}=await db.from('apt_justificativas').select('*').lte('data_inicio',fim2).gte('data_fim',ini2);
    _ferias=ferias||[]; _justific=just||[];

    const {data:eqs}=await db.from('cal_equipes').select('*').eq('ativo',true);
    const {data:mbs}=await db.from('cal_equipe_membros').select('*');
    _equipes=(eqs||[]).map(e=>({...e,he_ativo:e.he_ativo||false,membros:(mbs||[]).filter(m=>m.equipe_id===e.id).map(m=>({chapa:m.chapa,nome:m.nome}))}));

    const {data:fila}=await db.from('cal_fila').select('*').eq('semana',_sem).eq('ano',ano).order('ordem',{ascending:true});
    _fila={};
    (fila||[]).forEach(item=>{if(!_fila[item.equipe_id])_fila[item.equipe_id]=[];_fila[item.equipe_id].push(item);});

    const {data:prog}=await db.from('programacao_semanal').select('*').eq('semana',_sem).eq('ano',ano).like('equipe','CAL%');
    _progSem=prog||[];
    const anoAnt=iniSem(_sem-1).getFullYear();
    const {data:progAnt}=await db.from('programacao_semanal').select('*').eq('semana',_sem-1).eq('ano',anoAnt).like('equipe','CAL%');
    _progAnt=progAnt||[];
  }

  async function salvarOrdem(equipeId) {
    const db=getDB(); const fila=_fila[equipeId]||[];
    for(let i=0;i<fila.length;i++){if(!fila[i]||!fila[i].id)continue;await db.from('cal_fila').update({ordem:i+1}).eq('id',fila[i].id);}
  }

  async function atualizarStatus(id,status,extra={}) {
    const db=getDB(); const nid=parseInt(id); const p={status,...extra};
    await db.from('cal_fila').update(p).eq('id',nid);
    for(const eqId in _fila){const idx=_fila[eqId].findIndex(i=>parseInt(i.id)===nid);if(idx>=0){Object.assign(_fila[eqId][idx],p);break;}}
  }

  async function inserirNaFila(equipeId,item,posicao) {
    const db=getDB(); const ano=iniSem(_sem).getFullYear();
    if(!_fila[equipeId])_fila[equipeId]=[];
    const fila=_fila[equipeId];
    const {data,error}=await db.from('cal_fila').insert({equipe_id:equipeId,semana:_sem,ano,ordem:fila.length+1,...item}).select().single();
    if(error||!data){console.error('inserir:',error);return null;}
    if(posicao==='fim'){fila.push(data);}
    else{const pos=typeof posicao==='number'?posicao:0;fila.splice(pos,0,data);await salvarOrdem(equipeId);}
    return data;
  }

  async function removerDaFila(id) {
    const db=getDB(); const nid=parseInt(id);
    await db.from('cal_fila').delete().eq('id',nid);
    for(const eqId in _fila)_fila[eqId]=_fila[eqId].filter(i=>parseInt(i.id)!==nid);
  }

  /* ══════════════════════════════════════
     HTML
  ══════════════════════════════════════ */

  /* Ícone de data/hora */
  function htmlDtHora(dt, tipo) {
    if(!dt) return '<span class="cd-dt-vazio">—</span>';
    const icone = tipo==='exec'?'▶':tipo==='fim'?'🏁':'🕐';
    return `<span class="cd-dt">${icone} ${fmtDia(dt)} ${fmtHora(dt)}</span>`;
  }

  /* ── Linha de serviço ── */
  function htmlItemFila(item, equipeId, pos, total, prev) {
    const isExec  = item.status==='em_execucao';
    const isPause = item.status==='pausado';
    const isInter = item.status==='interrompido';
    const isEnc   = item.status==='encerrado';
    const tipo    = tipoOS(item);
    const p       = prev[item.id];
    const inicioDt= isExec||isPause ? item.iniciado_em : (p?p.inicioCalc:null);
    const fimDt   = isEnc ? item.encerrado_em : (p?p.fimCalc:null);
    const aberto  = _itemAberto===item.id;

    let rowCls='cd-svc-row';
    if(isExec)  rowCls+=' exec';
    if(isPause) rowCls+=' pausado';
    if(isEnc)   rowCls+=' encerrado';
    if(isInter) rowCls+=' interrompido';
    if(semPassada()) rowCls+=' sempassada';

    // Setas de posição — só para ativos não encerrados
    const podeMover = !isEnc && !isExec;
    const posBtn = podeMover ? `<div class="cd-pos">
      <button class="cd-pos-btn" data-action="mover-cima" data-id="${item.id}" data-eq="${equipeId}" ${pos===0?'disabled':''}title="Subir">▲</button>
      <button class="cd-pos-btn" data-action="mover-baixo" data-id="${item.id}" data-eq="${equipeId}" ${pos===total-1?'disabled':''}title="Descer">▼</button>
    </div>` : `<div class="cd-pos cd-pos-empty"></div>`;

    // Datas
    const dtInicio = htmlDtHora(inicioDt, isExec||isPause?'exec':'inicio');
    const dtFim    = htmlDtHora(fimDt, 'fim');

    // Ações
    let acoes='';
    if(isExec) {
      acoes=`<button class="cd-act green" data-action="encerrar" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-check"></i> Encerrar</button>
        <button class="cd-act amber" data-action="pausar" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-player-pause"></i> Pausar</button>
        <button class="cd-act red" data-action="interromper" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-ban"></i> Interromper</button>
        <button class="cd-act blue" data-action="mover-equipe" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-transfer-right"></i> Mover equipe</button>`;
    } else if(isPause) {
      acoes=`<button class="cd-act green" data-action="retomar" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-player-play"></i> Retomar</button>
        <button class="cd-act red" data-action="interromper" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-ban"></i> Interromper</button>
        <button class="cd-act blue" data-action="mover-equipe" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-transfer-right"></i> Mover equipe</button>`;
    } else if(isEnc) {
      if(semPassada()) acoes=`<button class="cd-act blue" data-action="reabrir" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-rotate-clockwise"></i> Reabrir</button>`;
    } else if(isInter) {
      acoes=`<button class="cd-act green" data-action="reabrir" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-rotate-clockwise"></i> Reabrir</button>
        <button class="cd-act ghost" data-action="remover" data-id="${item.id}"><i class="ti ti-x"></i> Remover</button>`;
    } else {
      acoes=`<button class="cd-act green" data-action="iniciar" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-player-play"></i> Iniciar</button>
        <button class="cd-act red" data-action="interromper" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-ban"></i> Interromper</button>
        <button class="cd-act blue" data-action="mover-equipe" data-id="${item.id}" data-eq="${equipeId}"><i class="ti ti-arrows-transfer-right"></i> Mover equipe</button>
        <button class="cd-act ghost" data-action="remover" data-id="${item.id}"><i class="ti ti-x"></i> Remover</button>`;
    }

    return `<div class="${rowCls}" data-id="${item.id}">
      <div class="cd-svc-main" data-action="toggle-item" data-id="${item.id}">
        ${posBtn}
        <div class="cd-svc-body">
          <span class="cd-svc-os">${item.os||'S/N'}</span>
          <span class="cd-svc-desc">${item.desc_servico||'—'}</span>
          ${badgeTipo(tipo)}
        </div>
        <div class="cd-svc-datas">
          ${dtInicio}
          ${dtFim}
        </div>
      </div>
      ${aberto&&acoes?`<div class="cd-svc-acoes">${acoes}</div>`:''}
    </div>`;
  }

  /* ── Fila de uma equipe ── */
  function htmlFila(equipe) {
    const fila=_fila[equipe.id]||[];
    const ativos=fila.filter(i=>i.status!=='encerrado'&&i.status!=='interrompido');
    const prev=calcularPrevisoes(equipe);

    const rows=ativos.map((item,idx)=>htmlItemFila(item,equipe.id,idx,ativos.length,prev)).join('');
    return rows+`<div class="cd-add-os" data-action="add-os" data-eq="${equipe.id}">
      <i class="ti ti-plus"></i> Inserir OS na fila
    </div>`;
  }

  /* ── Board de equipe ── */
  function htmlBoard(equipe) {
    const fila=_fila[equipe.id]||[];
    const ativos=fila.filter(i=>i.status!=='encerrado'&&i.status!=='interrompido');
    const hhDisp=hhSemEquipe(equipe);
    const hhAloc=ativos.reduce((s,i)=>s+(i.hh_previsto||0),0);
    const estouro=hhAloc>hhDisp;
    const prev=prevConclusaoEquipe(equipe);
    const prevStr=prev?`${String(prev.getDate()).padStart(2,'0')}/${String(prev.getMonth()+1).padStart(2,'0')}`:'—';
    const aberto=_itemAberto===`eq-${equipe.id}`;

    const hhCls=estouro?'over':hhAloc>hhDisp*0.85?'warn':'ok';
    const membros=(equipe.membros||[]).map(m=>`<span class="cd-membro">${(m.nome||m.chapa||'').split(' ')[0]}</span>`).join('');

    return `<div class="cd-board" data-eq-id="${equipe.id}">
      <div class="cd-board-hdr${semPassada()?' passada':''}" data-action="toggle-eq" data-eq="${equipe.id}">
        <div class="cd-board-info">
          <span class="cd-board-nome">${equipe.nome}</span>
          <div class="cd-board-membros">${membros||'<span class="cd-membro">Sem membros</span>'}</div>
        </div>
        <div class="cd-board-meta">
          <span class="cd-board-hh ${hhCls}">${hhAloc.toFixed(0)}h / ${hhDisp.toFixed(0)}h</span>
          <span class="cd-board-prev"><i class="ti ti-calendar-due"></i> ${prevStr}</span>
          <button class="cd-cfg-btn" data-action="config-equipe" data-eq="${equipe.id}"><i class="ti ti-settings"></i></button>
          <i class="ti ti-chevron-down cd-board-chev${aberto?' rot':''}"></i>
        </div>
      </div>
      <div class="cd-board-fila${aberto?' open':''}" id="board-fila-${equipe.id}">
        ${htmlFila(equipe)}
      </div>
    </div>`;
  }

  /* ── Grupo Interrompidos ── */
  function htmlInterrompidos() {
    const items=[];
    for(const eq of _equipes) {
      for(const item of (_fila[eq.id]||[]).filter(i=>i.status==='interrompido')) {
        items.push({...item,equipeNome:eq.nome,equipeId:eq.id});
      }
    }
    if(!items.length) return '';
    const aberto=_itemAberto==='grupo-inter';
    const rows=items.map(item=>`<div class="cd-svc-row interrompido">
      <div class="cd-svc-main" data-action="toggle-item" data-id="${item.id}">
        <div class="cd-pos cd-pos-empty"></div>
        <div class="cd-svc-body">
          <span class="cd-svc-os">${item.os||'S/N'}</span>
          <span class="cd-svc-desc">${item.desc_servico||'—'}</span>
          ${badgeTipo(tipoOS(item))}
          <span class="cd-eq-tag">${item.equipeNome}</span>
        </div>
        <div class="cd-svc-datas"><span class="cd-dt-motivo">${item.obs||'—'}</span></div>
      </div>
      ${_itemAberto===item.id?`<div class="cd-svc-acoes">
        <button class="cd-act green" data-action="reabrir" data-id="${item.id}" data-eq="${item.equipeId}"><i class="ti ti-rotate-clockwise"></i> Reabrir</button>
        <button class="cd-act ghost" data-action="remover" data-id="${item.id}"><i class="ti ti-x"></i> Remover</button>
      </div>`:''}
    </div>`).join('');

    return `<div class="cd-board cd-board-inter">
      <div class="cd-board-hdr inter" data-action="toggle-eq" data-eq="grupo-inter">
        <div class="cd-board-info">
          <span class="cd-board-nome"><i class="ti ti-player-pause" style="font-size:12px;margin-right:5px"></i> Interrompidos</span>
        </div>
        <div class="cd-board-meta">
          <span class="cd-board-hh" style="color:#fde047">${items.length} serviço${items.length>1?'s':''}</span>
          <i class="ti ti-chevron-down cd-board-chev${aberto?' rot':''}"></i>
        </div>
      </div>
      <div class="cd-board-fila${aberto?' open':''}">${rows}</div>
    </div>`;
  }

  /* ── Grupo Encerrados ── */
  function htmlEncerrados() {
    const items=[];
    for(const eq of _equipes) {
      for(const item of (_fila[eq.id]||[]).filter(i=>i.status==='encerrado')) {
        items.push({...item,equipeNome:eq.nome,equipeId:eq.id});
      }
    }
    if(!items.length) return '';
    const aberto=_itemAberto==='grupo-enc';
    const rows=items.map(item=>`<div class="cd-svc-row encerrado">
      <div class="cd-svc-main" data-action="toggle-item" data-id="${item.id}">
        <div class="cd-pos cd-pos-empty"></div>
        <div class="cd-svc-body">
          <span class="cd-svc-os">${item.os||'S/N'}</span>
          <span class="cd-svc-desc">${item.desc_servico||'—'}</span>
          ${badgeTipo(tipoOS(item))}
          <span class="cd-eq-tag">${item.equipeNome}</span>
        </div>
        <div class="cd-svc-datas">${htmlDtHora(item.encerrado_em,'fim')}</div>
      </div>
      ${_itemAberto===item.id?`<div class="cd-svc-acoes">
        <button class="cd-act blue" data-action="reabrir" data-id="${item.id}" data-eq="${item.equipeId}"><i class="ti ti-rotate-clockwise"></i> Reabrir</button>
      </div>`:''}
    </div>`).join('');

    return `<div class="cd-board cd-board-enc">
      <div class="cd-board-hdr enc" data-action="toggle-eq" data-eq="grupo-enc">
        <div class="cd-board-info">
          <span class="cd-board-nome"><i class="ti ti-circle-check" style="font-size:12px;margin-right:5px"></i> Encerrados nesta semana</span>
        </div>
        <div class="cd-board-meta">
          <span class="cd-board-hh" style="color:#86efac">${items.length} serviço${items.length>1?'s':''}</span>
          <i class="ti ti-chevron-down cd-board-chev${aberto?' rot':''}"></i>
        </div>
      </div>
      <div class="cd-board-fila${aberto?' open':''}">${rows}</div>
    </div>`;
  }

  /* ── Resumo rápido ── */
  function htmlResumo() {
    const cards=_equipes.map(eq=>{
      const fila=_fila[eq.id]||[];
      const exec=fila.find(i=>i.status==='em_execucao');
      const pause=fila.find(i=>i.status==='pausado');
      const ativos=fila.filter(i=>i.status!=='encerrado'&&i.status!=='interrompido');
      const prev=calcularPrevisoes(eq);
      // Próximo = segundo ativo (primeiro depois do em execução)
      const emAndamento=exec||pause;
      const proximo=ativos.find(i=>i.id!==(emAndamento&&emAndamento.id)&&i.status==='pendente');
      const proxPrev=proximo&&prev[proximo.id]?prev[proximo.id].inicioCalc:null;

      if(!emAndamento&&!proximo) return '';

      return `<div class="cd-resumo-eq">
        <div class="cd-resumo-nome">${eq.nome}</div>
        ${emAndamento?`<div class="cd-resumo-exec">
          <div class="cd-resumo-dot${emAndamento.status==='pausado'?' pausado':''}"></div>
          <span>${emAndamento.os||'S/N'} · ${(emAndamento.desc_servico||'—').substring(0,35)}</span>
        </div>`:''}
        ${proximo?`<div class="cd-resumo-prox">
          <i class="ti ti-arrow-right" style="font-size:10px"></i>
          <span>${proximo.os||'S/N'} · ${(proximo.desc_servico||'').substring(0,30)}${proxPrev?' · 🕐 '+fmtDia(proxPrev)+' '+fmtHora(proxPrev):''}</span>
        </div>`:''}
      </div>`;
    }).filter(Boolean).join('');

    if(!cards) return '';
    return `<div class="cd-resumo">
      <div class="cd-resumo-hdr"><i class="ti ti-activity"></i> Em andamento agora</div>
      <div class="cd-resumo-body">${cards}</div>
    </div>`;
  }

  /* ── Pontos de atenção ── */
  function htmlPontos() {
    const pontos=[];
    const fimDomingo=fimSem(_sem); fimDomingo.setHours(23,59,59);
    const sabado=new Date(fimDomingo); sabado.setDate(sabado.getDate()-1); sabado.setHours(0,0,0,0);

    if(semPassada()) {
      // Semana passada: mostrar OS não encerradas
      for(const eq of _equipes) {
        for(const item of (_fila[eq.id]||[]).filter(i=>i.status!=='encerrado')) {
          pontos.push({tipo:'warn',txt:`OS ${item.os||'S/N'} — ${(item.desc_servico||'').substring(0,40)} não foi encerrada`,sub:`Equipe: ${eq.nome}`,});
        }
      }
    } else {
      // Semana atual: zona de risco + capacidade disponível
      const eqComEspaco=[];
      for(const eq of _equipes) {
        const prev=calcularPrevisoes(eq);
        for(const item of (_fila[eq.id]||[]).filter(i=>i.status!=='encerrado'&&i.status!=='interrompido')) {
          const p=prev[item.id];
          if(p&&p.fimCalc>=sabado&&p.fimCalc<=fimDomingo) {
            pontos.push({tipo:'risco',txt:`OS ${item.os||'S/N'} (${eq.nome}) tem prev. fim no fim de semana`,sub:'Zona de risco — considerar reprogramar para próxima semana'});
          }
        }
        const hhDisp=hhSemEquipe(eq);
        const hhAloc=(_fila[eq.id]||[]).filter(i=>i.status!=='encerrado'&&i.status!=='interrompido').reduce((s,i)=>s+(i.hh_previsto||0),0);
        if(hhDisp-hhAloc>16) eqComEspaco.push({nome:eq.nome,livre:(hhDisp-hhAloc).toFixed(0)});
      }
      if(eqComEspaco.length&&pontos.some(p=>p.tipo==='risco')) {
        eqComEspaco.forEach(e=>{pontos.push({tipo:'ok',txt:`${e.nome} tem ${e.livre}h disponíveis para absorver serviços em risco`,sub:'Capacidade suficiente'});});
      }
    }

    if(!pontos.length) return '';

    const titulo=semPassada()?'OS Pendentes de Execução':'Pontos de Atenção';
    const rows=pontos.map(p=>`<div class="cd-ponto">
      <div class="cd-ponto-dot ${p.tipo}"></div>
      <div><div class="cd-ponto-txt">${p.txt}</div><div class="cd-ponto-sub">${p.sub}</div></div>
    </div>`).join('');

    return `<div class="cd-pontos">
      <div class="cd-pontos-hdr"><i class="ti ti-alert-triangle"></i> ${titulo}</div>
      ${rows}
    </div>`;
  }

  /* ══════════════════════════════════════
     RENDERIZAR
  ══════════════════════════════════════ */
  function renderizar() {
    const kpi=calcKPIs();
    const cor=p=>p>=70?'var(--green)':p>=40?'var(--amber)':'var(--red)';
    const semAnt=_sem-1,semProx=_sem+1;
    const passada=semPassada();

    _container.innerHTML=`<div class="cd-mod${passada?' passada':''}">

      <!-- Filtro semana -->
      <div class="cd-filtros">
        <div class="cd-week-nav">
          <button class="cd-wbtn" id="btn-sem-ant"><i class="ti ti-chevron-left"></i></button>
          <div class="cd-week-chip" id="btn-sem-prev">Sem ${semAnt} · ${fmtDia(iniSem(semAnt))}–${fmtDia(fimSem(semAnt))}</div>
          <div class="cd-week-atual${passada?' passada':''}"><i class="ti ti-calendar-week"></i> Sem ${_sem} · ${fmtDia(iniSem(_sem))} – ${fmtDia(fimSem(_sem))}${passada?' · Semana passada':''}</div>
          <div class="cd-week-chip" id="btn-sem-prox">Sem ${semProx} · ${fmtDia(iniSem(semProx))}–${fmtDia(fimSem(semProx))}</div>
          <button class="cd-wbtn" id="btn-sem-prox2"><i class="ti ti-chevron-right"></i></button>
        </div>
        <button class="cd-btn-primary" id="btn-nova-equipe"><i class="ti ti-plus"></i> Nova equipe</button>
      </div>

      <!-- KPIs -->
      <div class="cd-kpi-grid">
        <div class="cd-kpi"><div class="cd-kpi-lbl">Aderência Atual</div><div class="cd-kpi-val" style="color:${cor(kpi.adesAtual)}">${kpi.adesAtual}%</div><div class="cd-kpi-sub">HH enc. prog. / HH prev. prog.</div><div class="cd-kpi-bar"><div class="cd-kpi-fill" style="width:${kpi.adesAtual}%;background:${cor(kpi.adesAtual)}"></div></div></div>
        <div class="cd-kpi"><div class="cd-kpi-lbl">Aderência Projetada</div><div class="cd-kpi-val" style="color:${cor(kpi.adesProj)}">${kpi.adesProj}%</div><div class="cd-kpi-sub">Incl. prev. conclusão até domingo</div><div class="cd-kpi-bar"><div class="cd-kpi-fill" style="width:${kpi.adesProj}%;background:${cor(kpi.adesProj)}"></div></div></div>
        <div class="cd-kpi"><div class="cd-kpi-lbl">% HH MCU</div><div class="cd-kpi-val" style="color:var(--red)">${kpi.pctMCU}%</div><div class="cd-kpi-sub">MCU sobre total da fila</div><div class="cd-kpi-bar"><div class="cd-kpi-fill" style="width:${kpi.pctMCU}%;background:var(--red)"></div></div></div>
        <div class="cd-kpi"><div class="cd-kpi-lbl">% HH Reprogramado</div><div class="cd-kpi-val" style="color:var(--purple)">${kpi.pctREP}%</div><div class="cd-kpi-sub">REP sobre total da fila</div><div class="cd-kpi-bar"><div class="cd-kpi-fill" style="width:${kpi.pctREP}%;background:var(--purple)"></div></div></div>
      </div>

      <!-- Resumo -->
      ${htmlResumo()}

      <!-- Boards -->
      <div class="cd-boards">
        ${_equipes.map(htmlBoard).join('')}
        ${htmlInterrompidos()}
        ${htmlEncerrados()}
        ${!_equipes.length?'<div class="cd-vazio"><i class="ti ti-users-group"></i><span>Nenhuma equipe cadastrada.</span><button class="cd-btn-primary" id="btn-nova-equipe-vazio"><i class="ti ti-plus"></i> Criar primeira equipe</button></div>':''}
      </div>

      <!-- Pontos de atenção -->
      ${htmlPontos()}

    </div>`;

    bindEventos();
  }

  /* ══════════════════════════════════════
     EVENTOS
  ══════════════════════════════════════ */
  function bindEventos() {
    const c=_container;

    c.querySelector('#btn-sem-ant').addEventListener('click',()=>trocarSemana(_sem-1));
    c.querySelector('#btn-sem-prox2').addEventListener('click',()=>trocarSemana(_sem+1));
    c.querySelector('#btn-sem-prev').addEventListener('click',()=>trocarSemana(_sem-1));
    c.querySelector('#btn-sem-prox').addEventListener('click',()=>trocarSemana(_sem+1));
    c.querySelector('#btn-nova-equipe').addEventListener('click',()=>abrirModalEquipe(null));
    const bv=c.querySelector('#btn-nova-equipe-vazio');
    if(bv)bv.addEventListener('click',()=>abrirModalEquipe(null));

    c.querySelectorAll('[data-action]').forEach(btn=>{
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        const {action,id,eq}=btn.dataset;
        const iid=id?parseInt(id):null; const ieq=eq?parseInt(eq):null;
        switch(action){
          case 'toggle-eq':
            _itemAberto=_itemAberto===eq?null:eq; renderizar(); break;
          case 'toggle-item':
            _itemAberto=_itemAberto===iid?null:iid; renderizar(); break;
          case 'iniciar':       acaoIniciar(iid); break;
          case 'encerrar':      acaoEncerrar(iid); break;
          case 'pausar':        acaoPausar(iid,ieq); break;
          case 'retomar':       acaoRetomar(iid); break;
          case 'interromper':   acaoInterromper(iid,ieq); break;
          case 'reabrir':       acaoReabrir(iid,ieq); break;
          case 'remover':       acaoRemover(iid); break;
          case 'mover-cima':    acaoMoverPos(iid,ieq,-1); break;
          case 'mover-baixo':   acaoMoverPos(iid,ieq,+1); break;
          case 'mover-equipe':  acaoMoverEquipe(iid,ieq); break;
          case 'add-os':        abrirModalOS(ieq); break;
          case 'config-equipe': abrirModalEquipe(ieq); break;
        }
      });
    });
  }

  /* ══════════════════════════════════════
     AÇÕES
  ══════════════════════════════════════ */
  async function acaoIniciar(id) {
    const hora=await modalHora('Hora de início',horaAtual()); if(!hora)return;
    const dt=new Date(); const [h,m]=hora.split(':').map(Number); dt.setHours(h,m,0,0);
    await atualizarStatus(id,'em_execucao',{iniciado_em:dt.toISOString()});
    _itemAberto=null; await recarregarDados();
  }

  async function acaoEncerrar(id) {
    const hora=await modalHora('Hora de encerramento',horaAtual()); if(!hora)return;
    const dt=new Date(); const [h,m]=hora.split(':').map(Number); dt.setHours(h,m,0,0);
    await atualizarStatus(id,'encerrado',{encerrado_em:dt.toISOString()});
    // Perguntar se inicia o próximo
    let equipeId=null;
    for(const eqId in _fila)if(_fila[eqId].some(i=>parseInt(i.id)===id)){equipeId=parseInt(eqId);break;}
    if(equipeId){
      const prox=(_fila[equipeId]||[]).find(i=>parseInt(i.id)!==id&&i.status==='pendente');
      if(prox){
        const sim=await modalConfirm(`Iniciar próximo serviço?\n${prox.os||'S/N'} · ${prox.desc_servico||''}`);
        if(sim){
          const dt2=new Date(); dt2.setHours(dt.getHours(),dt.getMinutes(),0,0);
          await atualizarStatus(prox.id,'em_execucao',{iniciado_em:dt2.toISOString()});
        }
      }
    }
    _itemAberto=null; await recarregarDados();
  }

  async function acaoPausar(id,equipeId) {
    await atualizarStatus(id,'pausado');
    // Mover para posição 2 (logo após o em execução se houver, ou posição 1)
    const fila=_fila[equipeId]||[];
    const idx=fila.findIndex(i=>parseInt(i.id)===id);
    if(idx>=0){
      const [item]=fila.splice(idx,1);
      const posExec=fila.findIndex(i=>i.status==='em_execucao');
      fila.splice(posExec>=0?posExec+1:0,0,item);
      await salvarOrdem(equipeId);
    }
    _itemAberto=null; await recarregarDados();
  }

  async function acaoRetomar(id) {
    const hora=await modalHora('Hora de retomada',horaAtual()); if(!hora)return;
    const dt=new Date(); const [h,m]=hora.split(':').map(Number); dt.setHours(h,m,0,0);
    await atualizarStatus(id,'em_execucao',{iniciado_em:dt.toISOString()});
    _itemAberto=null; await recarregarDados();
  }

  async function acaoInterromper(id,equipeId) {
    const motivo=await modalOpcoes('Motivo da interrupção',['Falta de Material','Falta de Acesso','Segurança Comprometida']);
    if(!motivo)return;
    const fila=_fila[equipeId]||[];
    const idx=fila.findIndex(i=>parseInt(i.id)===id);
    if(idx>=0){const [item]=fila.splice(idx,1);fila.push(item);await salvarOrdem(equipeId);}
    await atualizarStatus(id,'interrompido',{obs:motivo});
    _itemAberto=null; await recarregarDados();
  }

  async function acaoReabrir(id,equipeId) {
    // Selecionar equipe destino
    const opcoes=_equipes.map(e=>e.nome);
    if(!opcoes.length){alert('Nenhuma equipe ativa.');return;}
    const escolha=await modalOpcoes('Selecionar equipe destino',opcoes); if(!escolha)return;
    const novaEq=_equipes.find(e=>e.nome===escolha); if(!novaEq)return;
    const db=getDB();
    const nova_ordem=(_fila[novaEq.id]||[]).length+1;
    await db.from('cal_fila').update({equipe_id:novaEq.id,ordem:nova_ordem,status:'pendente',obs:null,encerrado_em:null}).eq('id',id);
    for(const eqId in _fila){const idx=_fila[eqId].findIndex(i=>parseInt(i.id)===id);if(idx>=0){const [item]=_fila[eqId].splice(idx,1);item.equipe_id=novaEq.id;item.status='pendente';item.ordem=nova_ordem;if(!_fila[novaEq.id])_fila[novaEq.id]=[];_fila[novaEq.id].push(item);break;}}
    _itemAberto=null; await recarregarDados();
  }

  async function acaoRemover(id) {
    if(!confirm('Remover da fila?'))return;
    await removerDaFila(id); _itemAberto=null; await recarregarDados();
  }

  async function acaoMoverPos(id,equipeId,delta) {
    const fila=_fila[equipeId]||[];
    const ativos=fila.filter(i=>i.status!=='encerrado'&&i.status!=='interrompido'&&i.status!=='em_execucao');
    const idx=ativos.findIndex(i=>parseInt(i.id)===id); if(idx<0)return;
    const nova=idx+delta; if(nova<0||nova>=ativos.length)return;
    // Reordenar no array completo
    const idxFila=fila.findIndex(i=>parseInt(i.id)===id);
    const idxAlvo=fila.findIndex(i=>parseInt(i.id)===parseInt(ativos[nova].id));
    if(idxFila<0||idxAlvo<0)return;
    const [item]=fila.splice(idxFila,1); fila.splice(idxAlvo,0,item);
    await salvarOrdem(equipeId); await recarregarDados();
  }

  async function acaoMoverEquipe(id,equipeAtualId) {
    const opcoes=_equipes.filter(e=>e.id!==equipeAtualId).map(e=>e.nome);
    if(!opcoes.length){alert('Sem outras equipes.');return;}
    const escolha=await modalOpcoes('Mover para qual equipe?',opcoes); if(!escolha)return;
    const novaEq=_equipes.find(e=>e.nome===escolha); if(!novaEq)return;
    const db=getDB(); const nova_ordem=(_fila[novaEq.id]||[]).length+1;
    await db.from('cal_fila').update({equipe_id:novaEq.id,ordem:nova_ordem}).eq('id',id);
    for(const eqId in _fila){const idx=_fila[eqId].findIndex(i=>parseInt(i.id)===id);if(idx>=0){const [item]=_fila[eqId].splice(idx,1);item.equipe_id=novaEq.id;if(!_fila[novaEq.id])_fila[novaEq.id]=[];_fila[novaEq.id].push(item);break;}}
    _itemAberto=null; await recarregarDados();
  }

  /* ══════════════════════════════════════
     MODAIS
  ══════════════════════════════════════ */
  function modalHora(titulo,padrao) {
    return new Promise(resolve=>{
      const o=document.createElement('div'); o.className='cd-overlay';
      o.innerHTML=`<div class="cd-modal" style="width:260px">
        <div class="cd-modal-titulo">${titulo}</div>
        <input type="time" id="mh" class="cd-form-input" style="font-size:22px;height:48px;text-align:center" value="${padrao}">
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="cd-modal-cancel" style="flex:1">Cancelar</button>
          <button class="cd-btn-primary" id="mh-ok" style="flex:2"><i class="ti ti-check"></i> Confirmar</button>
        </div>
      </div>`;
      o.querySelector('#mh-ok').addEventListener('click',()=>{const v=o.querySelector('#mh').value;o.remove();resolve(v||null);});
      o.querySelector('.cd-modal-cancel').addEventListener('click',()=>{o.remove();resolve(null);});
      o.addEventListener('click',e=>{if(e.target===o){o.remove();resolve(null);}});
      document.body.appendChild(o); o.querySelector('#mh').focus();
    });
  }

  function modalOpcoes(titulo,opcoes) {
    return new Promise(resolve=>{
      const o=document.createElement('div'); o.className='cd-overlay';
      o.innerHTML=`<div class="cd-modal"><div class="cd-modal-titulo">${titulo}</div>
        <div class="cd-modal-opcoes">${opcoes.map((op,i)=>`<button class="cd-modal-opt" data-i="${i}">${op}</button>`).join('')}</div>
        <button class="cd-modal-cancel">Cancelar</button></div>`;
      o.querySelectorAll('.cd-modal-opt').forEach((btn,i)=>{btn.addEventListener('click',()=>{o.remove();resolve(opcoes[i]);});});
      o.querySelector('.cd-modal-cancel').addEventListener('click',()=>{o.remove();resolve(null);});
      o.addEventListener('click',e=>{if(e.target===o){o.remove();resolve(null);}});
      document.body.appendChild(o);
    });
  }

  function modalConfirm(msg) {
    return new Promise(resolve=>{
      const o=document.createElement('div'); o.className='cd-overlay';
      o.innerHTML=`<div class="cd-modal"><div class="cd-modal-titulo" style="white-space:pre-line">${msg}</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="cd-modal-cancel" style="flex:1">Não</button>
          <button class="cd-btn-primary" id="mc-sim" style="flex:2"><i class="ti ti-check"></i> Sim</button>
        </div></div>`;
      o.querySelector('#mc-sim').addEventListener('click',()=>{o.remove();resolve(true);});
      o.querySelector('.cd-modal-cancel').addEventListener('click',()=>{o.remove();resolve(false);});
      o.addEventListener('click',e=>{if(e.target===o){o.remove();resolve(false);}});
      document.body.appendChild(o);
    });
  }

  /* ── Modal inserir OS ── */
  function abrirModalOS(equipeId) {
    const o=document.createElement('div'); o.className='cd-overlay';
    // Semanas disponíveis para filtro
    const sems=[_sem-1,_sem,_sem+1].map(s=>`<option value="${s}"${s===_sem?' selected':''}>Sem ${s}</option>`).join('');
    o.innerHTML=`<div class="cd-modal" style="width:380px;max-height:85vh;overflow-y:auto">
      <div class="cd-modal-titulo">Inserir OS na fila</div>
      <div class="cd-os-filtros">
        <select class="cd-form-input cd-form-sel" id="mos-sem">${sems}</select>
        <select class="cd-form-input cd-form-sel" id="mos-tipo">
          <option value="">Todos os tipos</option>
          <option value="MCU">MCU</option>
          <option value="prog">Programável</option>
        </select>
        <select class="cd-form-input cd-form-sel" id="mos-cart">
          <option value="">Todas as carteiras</option>
          ${['CAL1','CAL2','CAL3','CAL4'].map(c=>`<option value="${c}">${c}</option>`).join('')}
        </select>
        <input type="text" id="mos-busca" class="cd-form-input" placeholder="Pesquisar OS ou descrição...">
        <button class="cd-btn-primary" id="mos-buscar" style="width:100%"><i class="ti ti-search"></i> Buscar</button>
      </div>
      <div id="mos-resultados" style="margin-top:10px;max-height:280px;overflow-y:auto"></div>
      <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:10px">
        <div class="cd-modal-titulo" style="font-size:11px">Ou inserir sem número de OS:</div>
        <input type="text" id="mos-desc-manual" class="cd-form-input" placeholder="Descrição do serviço" style="margin-top:6px">
        <input type="number" id="mos-hh-manual" class="cd-form-input" placeholder="HH estimado" style="margin-top:6px">
        <div class="cd-tipo-opts" style="margin-top:6px">
          <button class="cd-tipo-btn active" data-tipo="programado">Prog.</button>
          <button class="cd-tipo-btn" data-tipo="fora_prog">NPG</button>
          <button class="cd-tipo-btn" data-tipo="mcu">MCU</button>
        </div>
        <button class="cd-btn-primary" id="mos-manual-ok" style="width:100%;margin-top:8px"><i class="ti ti-plus"></i> Inserir sem OS</button>
      </div>
      <button class="cd-modal-cancel" style="width:100%;margin-top:8px">Fechar</button>
    </div>`;

    let tipoSel='programado';
    o.querySelectorAll('.cd-tipo-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{o.querySelectorAll('.cd-tipo-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');tipoSel=btn.dataset.tipo;});
    });

    o.querySelector('#mos-buscar').addEventListener('click',async()=>{
      const db=getDB();
      const sem=parseInt(o.querySelector('#mos-sem').value);
      const tipo=o.querySelector('#mos-tipo').value;
      const cart=o.querySelector('#mos-cart').value;
      const busca=o.querySelector('#mos-busca').value.trim();
      const ano=iniSem(sem).getFullYear();

      let q=db.from('ordens_servico').select('os,cod_servico,desc_servico,hh_prev_servico,tipo_atividade,equipe').limit(30);
      if(cart) q=q.eq('equipe',cart);
      if(tipo==='MCU') q=q.eq('tipo_atividade','MCU');
      else if(tipo==='prog') q=q.neq('tipo_atividade','MCU');
      if(busca) {
        const num=busca.replace(/^0+/,'');
        if(/^\d+$/.test(num)) q=q.eq('os',num);
        else q=q.ilike('desc_servico','%'+busca+'%');
      }

      const {data}=await q;
      const res=o.querySelector('#mos-resultados');
      if(!data||!data.length){res.innerHTML='<div style="font-size:11px;color:#9ca3af;padding:8px">Nenhuma OS encontrada</div>';return;}
      res.innerHTML=data.map(r=>`<div class="cd-os-result" data-os="${r.os}" data-cod="${r.cod_servico||''}" data-desc="${(r.desc_servico||'').replace(/"/g,'&quot;')}" data-hh="${r.hh_prev_servico||0}" data-tipo="${r.tipo_atividade==='MCU'?'mcu':'programado'}">
        <span class="cd-os-result-num">${r.os}</span>
        <span class="cd-os-result-desc">${r.desc_servico||'—'}</span>
        <span class="cd-os-result-hh">${r.hh_prev_servico||0}h</span>
      </div>`).join('');
      res.querySelectorAll('.cd-os-result').forEach(row=>{
        row.addEventListener('click',async()=>{
          const {os,cod,desc,hh,tipo:t}=row.dataset;
          await inserirNaFila(equipeId,{os,cod_servico:cod||null,desc_servico:desc,hh_previsto:parseFloat(hh)||null,tipo:t,status:'pendente',vinculado:true},'fim');
          o.remove(); await recarregarDados();
        });
      });
    });

    o.querySelector('#mos-manual-ok').addEventListener('click',async()=>{
      const desc=o.querySelector('#mos-desc-manual').value.trim();
      const hh=parseFloat(o.querySelector('#mos-hh-manual').value)||null;
      if(!desc){alert('Informe a descrição');return;}
      await inserirNaFila(equipeId,{os:null,desc_servico:desc,hh_previsto:hh,tipo:tipoSel,status:'pendente',vinculado:false},'fim');
      o.remove(); await recarregarDados();
    });

    o.querySelector('.cd-modal-cancel').addEventListener('click',()=>o.remove());
    o.addEventListener('click',e=>{if(e.target===o)o.remove();});
    document.body.appendChild(o);
  }

  /* ── Modal equipe ── */
  function abrirModalEquipe(equipeId) {
    const eq=equipeId?_equipes.find(e=>e.id===equipeId):null;
    const chapasNaEq=new Set((eq&&eq.membros?eq.membros:[]).map(m=>m.chapa));
    const membHtml=_colabs.map(c=>{
      const cracha=c.cracha||c.chapa; const naEq=chapasNaEq.has(cracha);
      return `<label class="cd-colab-item${naEq?' checked':''}"><input type="checkbox" value="${cracha}"${naEq?' checked':''}><span>${c.nome||cracha}</span></label>`;
    }).join('');
    const o=document.createElement('div'); o.className='cd-overlay';
    o.innerHTML=`<div class="cd-modal" style="width:340px;max-height:80vh;overflow-y:auto">
      <div class="cd-modal-titulo">${eq?'Configurar: '+eq.nome:'Nova Equipe'}</div>
      <div class="cd-modal-form">
        <label class="cd-form-lbl">Nome</label>
        <input type="text" id="meq-nome" class="cd-form-input" value="${eq?eq.nome:''}" placeholder="Ex: Eq. Marcelo">
        <label class="cd-form-lbl" style="margin-top:10px">Colaboradores CAL</label>
        <div class="cd-colab-list">${membHtml}</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="cd-modal-cancel" style="flex:1">Cancelar</button>
        ${eq?`<button class="cd-act red" id="meq-del"><i class="ti ti-trash"></i> Desativar</button>`:''}
        <button class="cd-btn-primary" id="meq-ok" style="flex:2"><i class="ti ti-check"></i> Salvar</button>
      </div>
    </div>`;
    o.querySelectorAll('.cd-colab-item').forEach(l=>{l.addEventListener('click',()=>{setTimeout(()=>l.classList.toggle('checked',l.querySelector('input').checked),0);});});
    o.querySelector('#meq-ok').addEventListener('click',async()=>{
      const nome=o.querySelector('#meq-nome').value.trim(); if(!nome){alert('Informe o nome');return;}
      const sel=[...o.querySelectorAll('.cd-colab-list input:checked')].map(i=>i.value);
      await salvarEquipe(equipeId,nome,sel); o.remove(); await recarregarDados();
    });
    const del=o.querySelector('#meq-del');
    if(del)del.addEventListener('click',async()=>{if(!confirm('Desativar?'))return;await getDB().from('cal_equipes').update({ativo:false}).eq('id',equipeId);o.remove();await recarregarDados();});
    o.querySelector('.cd-modal-cancel').addEventListener('click',()=>o.remove());
    o.addEventListener('click',e=>{if(e.target===o)o.remove();});
    document.body.appendChild(o);
  }

  async function salvarEquipe(equipeId,nome,chapas) {
    const db=getDB(); let eqId=equipeId;
    if(!eqId){const {data}=await db.from('cal_equipes').insert({nome,ativo:true,he_ativo:false}).select().single();if(!data)return;eqId=data.id;}
    else await db.from('cal_equipes').update({nome}).eq('id',eqId);
    const {data:ma}=await db.from('cal_equipe_membros').select('*').eq('equipe_id',eqId);
    const ca=new Set((ma||[]).map(m=>m.chapa));
    for(const ch of chapas)if(!ca.has(ch)){const cv=_colabs.find(x=>(x.cracha||x.chapa)===ch);await db.from('cal_equipe_membros').insert({equipe_id:eqId,chapa:ch,nome:cv&&cv.nome?cv.nome:null,vigencia_inicio:new Date().toISOString()});}
    for(const ch of ca)if(!chapas.includes(ch))await db.from('cal_equipe_membros').delete().eq('equipe_id',eqId).eq('chapa',ch);
  }

  async function trocarSemana(nova) {
    _sem=nova; _itemAberto=null;
    _container.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:48px;color:#9ca3af;font-size:12px"><i class="ti ti-loader-2" style="font-size:18px;animation:cd-spin .8s linear infinite"></i> Carregando...</div>`;
    await carregarTudo(); renderizar();
  }
  async function recarregarDados() { await carregarTudo(); renderizar(); }

  /* ══════════════════════════════════════
     CSS
  ══════════════════════════════════════ */
  function injetarCSS() {
    if(document.getElementById('cd-style'))return;
    const s=document.createElement('style'); s.id='cd-style';
    s.textContent=`
:root{--green:#16a34a;--blue:#2563eb;--red:#dc2626;--amber:#d97706;--purple:#7c3aed;}
.cd-mod{display:flex;flex-direction:column;gap:10px;}
.cd-mod.passada{opacity:.9;}
@keyframes cd-spin{to{transform:rotate(360deg)}}

/* Filtros */
.cd-filtros{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);padding:9px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;box-shadow:var(--shadow);}
.cd-week-nav{display:flex;align-items:center;gap:4px;flex:1;}
.cd-wbtn{width:26px;height:26px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;color:#6b7280;}
.cd-week-atual{height:26px;padding:0 10px;background:var(--yellow);border-radius:var(--radius-sm);font-size:10px;font-weight:700;color:var(--dark1,#1e1e1e);display:flex;align-items:center;gap:5px;white-space:nowrap;}
.cd-week-atual.passada{background:#9ca3af;color:#fff;}
.cd-week-chip{height:26px;padding:0 9px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-size:9px;font-weight:500;color:#6b7280;display:flex;align-items:center;cursor:pointer;white-space:nowrap;}
.cd-btn-primary{height:26px;padding:0 10px;border:none;border-radius:var(--radius-sm);background:var(--yellow);font-family:var(--font);font-size:10px;font-weight:700;color:#1a1a1a;cursor:pointer;display:flex;align-items:center;gap:4px;flex-shrink:0;}

/* KPIs */
.cd-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);}
@media(max-width:600px){.cd-kpi-grid{grid-template-columns:repeat(2,1fr);}}
.cd-kpi{padding:12px 13px;border-right:1px solid var(--border);}
.cd-kpi:last-child{border-right:none;}
.cd-kpi-lbl{font-size:8px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px;}
.cd-kpi-val{font-size:22px;font-weight:700;line-height:1;margin-bottom:2px;color:#1a1a1a;}
.cd-kpi-sub{font-size:8px;color:#9ca3af;}
.cd-kpi-bar{height:3px;border-radius:2px;background:var(--border);margin-top:6px;overflow:hidden;}
.cd-kpi-fill{height:100%;border-radius:2px;}

/* Resumo */
.cd-resumo{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
.cd-resumo-hdr{padding:7px 14px;border-bottom:1px solid var(--border);font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;display:flex;align-items:center;gap:5px;}
.cd-resumo-hdr i{font-size:12px;}
.cd-resumo-body{display:flex;flex-wrap:wrap;}
.cd-resumo-eq{padding:8px 14px;border-right:1px solid var(--border);min-width:180px;flex:1;}
.cd-resumo-eq:last-child{border-right:none;}
.cd-resumo-nome{font-size:10px;font-weight:700;color:#374151;margin-bottom:4px;}
.cd-resumo-exec{display:flex;align-items:center;gap:5px;font-size:10px;color:#374151;margin-bottom:3px;}
.cd-resumo-dot{width:6px;height:6px;border-radius:50%;background:#0891b2;flex-shrink:0;animation:cd-pulse 1.5s infinite;}
.cd-resumo-dot.pausado{background:var(--amber);animation:none;}
@keyframes cd-pulse{0%,100%{opacity:1}50%{opacity:.3}}
.cd-resumo-prox{font-size:9px;color:#9ca3af;display:flex;align-items:center;gap:3px;}
.cd-resumo-prox i{font-size:10px;}

/* Boards */
.cd-boards{display:flex;flex-direction:column;gap:6px;}
.cd-board{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
.cd-board-hdr{display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--dark2,#2a2a2a);color:#f0f0f0;cursor:pointer;user-select:none;}
.cd-board-hdr.passada{background:#4b4b4b;}
.cd-board-hdr.inter{background:#3b2c1a;}
.cd-board-hdr.enc{background:#1a2e1a;}
.cd-board-info{flex:1;display:flex;flex-direction:column;gap:3px;}
.cd-board-nome{font-size:12px;font-weight:700;letter-spacing:.03em;}
.cd-board-membros{display:flex;gap:4px;flex-wrap:wrap;}
.cd-membro{padding:1px 6px;border-radius:8px;background:rgba(255,255,255,.1);font-size:9px;color:#9ca3af;}
.cd-board-meta{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.cd-board-hh{font-size:10px;font-weight:700;}
.cd-board-hh.ok{color:#86efac;} .cd-board-hh.warn{color:#fde047;} .cd-board-hh.over{color:#fca5a5;}
.cd-board-prev{font-size:10px;color:#9ca3af;display:flex;align-items:center;gap:3px;white-space:nowrap;}
.cd-board-prev i{font-size:11px;}
.cd-cfg-btn{width:20px;height:20px;border:1px solid rgba(255,255,255,.15);border-radius:3px;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:11px;padding:0;}
.cd-board-chev{font-size:14px;color:#9ca3af;transition:transform .2s;}
.cd-board-chev.rot{transform:rotate(180deg);}
.cd-board-fila{display:none;}
.cd-board-fila.open{display:block;}

/* Linhas de serviço */
.cd-svc-row{border-bottom:1px solid var(--border);}
.cd-svc-row:last-child{border-bottom:none;}
.cd-svc-row.exec{border-left:3px solid #0891b2;background:#f0fdff;}
.cd-svc-row.pausado{border-left:3px solid var(--amber);background:#fffdf0;}
.cd-svc-row.encerrado{background:#f0fdf4;opacity:.65;}
.cd-svc-row.interrompido{background:#fef9ee;}
.cd-svc-row.sempassada{filter:grayscale(.4);}
.cd-svc-main{display:flex;align-items:stretch;cursor:pointer;}
.cd-svc-main:hover{background:rgba(0,0,0,.02);}
.cd-pos{display:flex;flex-direction:column;gap:1px;padding:0 6px;border-right:1px solid var(--border);justify-content:center;background:#fafafa;flex-shrink:0;}
.cd-pos-empty{width:32px;background:#fafafa;border-right:1px solid var(--border);}
.cd-pos-btn{width:18px;height:13px;border:1px solid var(--border);border-radius:2px;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:8px;color:#9ca3af;padding:0;}
.cd-pos-btn:not(:disabled):hover{background:var(--dark1,#1e1e1e);color:#fff;border-color:var(--dark1,#1e1e1e);}
.cd-pos-btn:disabled{opacity:.3;cursor:not-allowed;}
.cd-svc-body{display:flex;align-items:center;gap:7px;padding:8px 10px;flex:1;min-width:0;}
.cd-svc-os{font-size:9px;font-weight:700;color:#374151;flex-shrink:0;width:58px;font-variant-numeric:tabular-nums;}
.cd-svc-desc{font-size:10px;color:#6b7280;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cd-badge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:8px;font-weight:700;flex-shrink:0;}
.cd-eq-tag{font-size:8px;padding:1px 5px;border-radius:3px;background:#f3f4f6;color:#9ca3af;flex-shrink:0;}
.cd-svc-datas{display:flex;flex-direction:column;gap:2px;align-items:flex-end;padding:6px 10px;flex-shrink:0;min-width:120px;}
.cd-dt{font-size:9px;color:#374151;white-space:nowrap;font-variant-numeric:tabular-nums;}
.cd-dt-vazio{font-size:9px;color:#d1d5db;}
.cd-dt-motivo{font-size:8px;color:var(--amber);max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cd-svc-acoes{display:flex;gap:4px;flex-wrap:wrap;padding:6px 10px 8px 36px;border-top:1px solid var(--border);background:#f9fafb;}
.cd-act{height:24px;padding:0 8px;border:1px solid var(--border);border-radius:3px;background:var(--bg);font-family:var(--font);font-size:9px;font-weight:600;color:#374151;cursor:pointer;display:flex;align-items:center;gap:3px;white-space:nowrap;}
.cd-act i{font-size:10px;}
.cd-act.green{background:#dcfce7;border-color:#86efac;color:#16a34a;}
.cd-act.amber{background:#fef3c7;border-color:#fcd34d;color:#d97706;}
.cd-act.blue{background:#dbeafe;border-color:#93c5fd;color:#2563eb;}
.cd-act.red{background:#fee2e2;border-color:#fca5a5;color:#dc2626;}
.cd-act.ghost{background:transparent;border-color:var(--border);color:#9ca3af;}
.cd-add-os{display:flex;align-items:center;gap:6px;padding:8px 12px;cursor:pointer;font-size:10px;color:#9ca3af;border-top:1px dashed var(--border);}
.cd-add-os:hover{background:#fffbeb;color:#1a1a1a;}
.cd-add-os i{font-size:13px;}

/* Pontos de atenção */
.cd-pontos{background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
.cd-pontos-hdr{padding:9px 14px;border-bottom:1px solid var(--border);font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#d97706;display:flex;align-items:center;gap:5px;}
.cd-ponto{display:flex;align-items:flex-start;gap:8px;padding:8px 14px;border-bottom:1px solid var(--border);}
.cd-ponto:last-child{border-bottom:none;}
.cd-ponto-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:3px;}
.cd-ponto-dot.risco{background:#d97706;} .cd-ponto-dot.ok{background:#16a34a;} .cd-ponto-dot.warn{background:#dc2626;}
.cd-ponto-txt{font-size:11px;color:#374151;}
.cd-ponto-sub{font-size:9px;color:#9ca3af;margin-top:1px;}
.cd-vazio{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:40px;color:#9ca3af;text-align:center;}
.cd-vazio i{font-size:28px;}

/* Modais */
.cd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}
.cd-modal{background:var(--card-bg);border-radius:var(--radius);box-shadow:0 8px 30px rgba(0,0,0,.15);padding:18px;width:300px;max-width:100%;}
.cd-modal-titulo{font-size:13px;font-weight:700;margin-bottom:12px;color:#1a1a1a;}
.cd-modal-opcoes{display:flex;flex-direction:column;gap:5px;margin-bottom:8px;}
.cd-modal-opt{width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:11px;font-weight:500;color:#374151;cursor:pointer;text-align:left;}
.cd-modal-opt:hover{border-color:var(--yellow);background:#fffbeb;}
.cd-modal-cancel{width:100%;padding:7px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:10px;font-weight:600;color:#6b7280;cursor:pointer;margin-top:4px;}
.cd-modal-form{display:flex;flex-direction:column;gap:5px;}
.cd-form-lbl{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;}
.cd-form-input{width:100%;height:32px;padding:0 9px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:11px;color:#374151;background:var(--bg);}
.cd-form-sel{height:30px;}
.cd-colab-list{display:flex;flex-direction:column;gap:3px;max-height:240px;overflow-y:auto;}
.cd-colab-item{display:flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;font-size:10px;color:#374151;font-weight:500;}
.cd-colab-item.checked{background:#dbeafe;border-color:#93c5fd;}
.cd-colab-item input{accent-color:var(--yellow);}
.cd-os-filtros{display:flex;flex-direction:column;gap:5px;}
.cd-os-result{display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--border);cursor:pointer;font-size:11px;}
.cd-os-result:hover{background:#fffbeb;}
.cd-os-result:last-child{border-bottom:none;}
.cd-os-result-num{font-weight:700;color:#374151;flex-shrink:0;width:70px;}
.cd-os-result-desc{flex:1;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cd-os-result-hh{font-size:10px;color:#9ca3af;flex-shrink:0;}
.cd-tipo-opts{display:flex;gap:4px;}
.cd-tipo-btn{flex:1;height:28px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);font-family:var(--font);font-size:10px;font-weight:600;color:#6b7280;cursor:pointer;}
.cd-tipo-btn.active{background:var(--yellow);border-color:#daa900;color:#1a1a1a;}

/* Mobile */
@media(max-width:600px){
  .cd-week-chip{display:none;}
  .cd-svc-datas{min-width:100px;}
  .cd-svc-os{width:48px;}
  .cd-resumo-body{flex-direction:column;}
  .cd-resumo-eq{border-right:none;border-bottom:1px solid var(--border);}
  .cd-resumo-eq:last-child{border-bottom:none;}
}
    `;
    document.head.appendChild(s);
  }

  async function init(container) {
    _container=container; injetarCSS();
    _container.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:48px;color:#9ca3af;font-size:12px"><i class="ti ti-loader-2" style="font-size:18px;animation:cd-spin .8s linear infinite"></i> Carregando...</div>`;
    try { await carregarTudo(); renderizar(); }
    catch(e) {
      console.error('cal_acomp:',e);
      _container.innerHTML=`<div style="padding:40px;text-align:center;color:#9ca3af"><i class="ti ti-alert-circle" style="font-size:28px;display:block;margin-bottom:8px"></i>Erro: ${e.message}</div>`;
    }
  }

  return { init };
})();
