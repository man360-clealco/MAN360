/* ═══════════════════════════════════════════════════════
   MAN360 — Parsers de Planilhas
   ═══════════════════════════════════════════════════════ */

/* ── Utilitários ──────────────────────────────────────── */

// OS/chave: str(int) — '000034488' e 34488 viram '34488'
function normNum(v) {
  if (v == null || v === '') return null;
  const n = parseInt(String(v).replace(/[^\d]/g, ''));
  return isNaN(n) ? null : String(n);
}

// Remove acentos e normaliza para comparação
function normStr(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

// Data → 'YYYY-MM-DD' ou null
function normData(v) {
  if (!v) return null;
  // Date object (com cellDates:true)
  if (v instanceof Date && !isNaN(v)) return v.toISOString().split('T')[0];
  const s = String(v).trim();
  // ISO: '2026-05-02' ou '2026-05-02 00:00:00'
  const mISO = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (mISO) return mISO[1];
  // BR: '02/05/2026'
  const mBR = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (mBR) return mBR[3] + '-' + mBR[2] + '-' + mBR[1];
  // Número serial do Excel (fallback, caso cellDates:false)
  const n = parseInt(s);
  if (!isNaN(n) && n > 40000 && n < 60000) {
    const d = new Date((n - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  return null;
}

// Hora → 'HH:MM' ou null
function normHora(v) {
  if (!v) return null;
  const m = String(v).trim().match(/^(\d{2}):(\d{2})/);
  return m ? m[1] + ':' + m[2] : null;
}

// Extrair código de serviço: '1-DESCRIÇÃO' → {cod:'1', desc:'DESCRIÇÃO'}
// Sem numeral → {cod:null, desc:'DESCRIÇÃO'}
function extrairCod(descRaw) {
  const s = String(descRaw || '').trim();
  const m = s.match(/^(\d+)\s*-\s*(.+)$/);
  return m ? { cod: m[1], desc: m[2].trim() } : { cod: null, desc: s };
}

// Encontrar índice de coluna tolerante a acentos
function colIdx(hdr, nomes) {
  const normHdr = hdr.map(normStr);
  for (const nome of nomes) {
    const n = normStr(nome);
    let i = normHdr.findIndex(h => h === n);
    if (i >= 0) return i;
    i = normHdr.findIndex(h => h.includes(n) || n.includes(h.slice(0, 6)));
    if (i >= 0) return i;
  }
  return -1;
}

/* ── Detecção de tipo ─────────────────────────────────── */
function detectarTipo(filename, rows) {
  const nome  = filename.toLowerCase();
  const flat  = rows ? rows.slice(0, 12).flat().map(c => normStr(String(c || ''))) : [];
  const texto = flat.join(' ');

  // Pré-OS PRIMEIRO — antes de OS, pois pré-OS tem colunas 'OS' e 'Código Serviço'
  if (flat.some(c => c === 'pre-os') ||
      nome.includes('preos') || nome.includes('pre_os') || nome.includes('pre-os'))
    return 'preos';

  // Programação semanal
  if (flat.some(c => c.includes('h-h (hr:mi)')) ||
      texto.includes('prog.semanal') || texto.includes('plano de execu') ||
      (flat.some(c => c.includes('equipe:')) && flat.some(c => c.includes('disponivel'))) ||
      nome.includes('progsem') || nome.includes('prog_sem') ||
      nome.includes('programacao') || nome.includes('programaçao') || nome.includes('programação'))
    return 'progsem';

  // Ordens de serviço — usar 'o.s.' (com pontos) para não confundir com coluna 'OS' da pré-OS
  if ((flat.some(c => c === 'o.s.') &&
       flat.some(c => c.includes('codigo') && c.includes('servi'))) ||
      nome.includes('bdd_os') || nome.includes('os_cal') ||
      nome.includes('os_mec') || nome.includes('os_civ') || nome.includes('os_ele'))
    return 'os';

  // Apontamentos
  if (flat.some(c => c.includes('hr.in') || c.includes('hr.fim') || c.includes('hr.total')) ||
      texto.includes('apontamento de mao') || nome.includes('apontamento'))
    return 'apontamento';

  return 'desconhecido';
}

/* ══════════════════════════════════════════════════════
   PARSER: ORDENS DE SERVIÇO
   Chave: UNIQUE(os, cod_servico)
   MCU:   cod_servico = '1' (sempre tem cod=1 na planilha)
   Prog:  cod_servico = '1','2'...
   ══════════════════════════════════════════════════════ */
function parseOS(rows) {
  const registros = [];
  if (!rows.length) return registros;

  let hdrIdx = rows.findIndex(r => r.some(c => normStr(c) === 'o.s.' || normStr(c) === 'os'));
  if (hdrIdx < 0) hdrIdx = 0;
  const hdr = rows[hdrIdx].map(c => String(c || ''));
  const g = (i, row) => (i >= 0 && i < row.length) ? String(row[i] || '').trim() : '';

  const iEmpresa  = colIdx(hdr, ['Empresa']);
  const iOS       = colIdx(hdr, ['O.S.', 'OS']);
  const iCod      = colIdx(hdr, ['Codigo Serviço', 'Código Serviço', 'Cod Servico', 'Codigo Servico']);
  const iTipo     = colIdx(hdr, ['Tipo Ativ.', 'Tipo Atividade', 'Tipo Ativ']);
  const iDescOS   = colIdx(hdr, ['Descrição OS', 'Descricao OS', 'Desc OS']);
  const iDescServ = colIdx(hdr, ['Descrição Serviço', 'Descricao Servico', 'Desc Servico']);
  const iDCom     = colIdx(hdr, ['Data Comunic.', 'Data Comunicacao', 'Data Comunic']);
  const iHCom     = colIdx(hdr, ['Hora Comunic.', 'Hora Comunicacao', 'Hora Comunic']);
  const iDGer     = colIdx(hdr, ['Data Geração', 'Data Geracao']);
  const iDEnc     = colIdx(hdr, ['Data Encerramento']);
  const iDIni     = colIdx(hdr, ['Data Ínicio', 'Data Inicio']);
  const iHIni     = colIdx(hdr, ['Hora Ínicio.', 'Hora Inicio']);
  const iDFim     = colIdx(hdr, ['Data Fim']);
  const iHFim     = colIdx(hdr, ['Hora Fim']);
  const iDDes     = colIdx(hdr, ['Data Desejada']);
  const iEquipe   = colIdx(hdr, ['Equipe']);
  const iModal    = colIdx(hdr, ['Modalidade']);
  const iMis      = colIdx(hdr, ['Mis', 'MIS']);
  const iDescMis  = colIdx(hdr, ['Descrição MIS', 'Descricao MIS']);
  const iEquip    = colIdx(hdr, ['Equipamento']);
  const iDescEq   = colIdx(hdr, ['Descrição Equipamento', 'Descricao Equipamento']);
  const iSetor    = colIdx(hdr, ['Setor']);
  const iDescSet  = colIdx(hdr, ['Descrição Setor', 'Descricao Setor']);
  const iTag      = colIdx(hdr, ['TAG']);
  const iSafra    = colIdx(hdr, ['Safra']);
  const iHhPrevS  = colIdx(hdr, ['Hh Prev. Serviço (Decimal)', 'Hh Prev. Servico']);
  const iHhRealS  = colIdx(hdr, ['Hh Real Serviço (Decimal)', 'Hh Real Servico']);
  const iHhPrevOS = colIdx(hdr, ['Hh Prev. OS', 'Hh Prev OS']);
  const iHhRealOS = colIdx(hdr, ['Hh Real OS', 'Hh Real OS']);
  const iStatusOS = colIdx(hdr, ['Status OS']);
  const iStatusS  = colIdx(hdr, ['Status Serviço', 'Status Servico']);
  const iCracha   = colIdx(hdr, ['Cracha', 'Crachá']);
  const iNome     = colIdx(hdr, ['Nome']);

  rows.slice(hdrIdx + 1).forEach(row => {
    const osRaw = g(iOS, row);
    const os    = normNum(osRaw);
    if (!os || !/^\d{4,}$/.test(os)) return;

    // cod_servico: pegar o valor real da planilha (MCU tem '1', prog tem '1','2'...)
    const codRaw    = g(iCod, row);
    const cod       = codRaw ? String(parseInt(codRaw) || codRaw) : '1';
    const tipo      = g(iTipo, row) || null;

    registros.push({
      empresa:           normNum(g(iEmpresa, row)) || '2',
      os,
      cod_servico:       cod,
      tipo_atividade:    tipo,
      desc_os:           g(iDescOS, row).slice(0, 500) || null,
      desc_servico:      g(iDescServ, row).slice(0, 500) || null,
      data_comunicacao:  normData(row[iDCom]),
      hora_comunicacao:  normHora(row[iHCom]),
      data_geracao:      normData(row[iDGer]),
      data_encerramento: normData(row[iDEnc]),
      data_inicio_exec:  normData(row[iDIni]),
      hora_inicio_exec:  normHora(row[iHIni]),
      data_fim_exec:     normData(row[iDFim]),
      hora_fim_exec:     normHora(row[iHFim]),
      data_desejada:     normData(row[iDDes]),
      equipe:            g(iEquipe, row).slice(0, 20) || null,
      modalidade:        g(iModal, row).slice(0, 20) || null,
      mis:               g(iMis, row).slice(0, 20) || null,
      desc_mis:          g(iDescMis, row).slice(0, 100) || null,
      equipamento:       g(iEquip, row).slice(0, 30) || null,
      desc_equipamento:  g(iDescEq, row).slice(0, 150) || null,
      setor:             g(iSetor, row).slice(0, 20) || null,
      desc_setor:        g(iDescSet, row).slice(0, 100) || null,
      tag:               g(iTag, row).slice(0, 50) || null,
      safra:             g(iSafra, row).slice(0, 10) || null,
      hh_prev_os:        parseFloat(g(iHhPrevOS, row)) || null,
      hh_real_os:        parseFloat(g(iHhRealOS, row)) || null,
      hh_prev_servico:   parseFloat(g(iHhPrevS, row)) || null,
      hh_real_servico:   parseFloat(g(iHhRealS, row)) || null,
      status_os:         g(iStatusOS, row).slice(0, 30) || null,
      status_servico:    g(iStatusS, row).slice(0, 30) || null,
      cracha:            normNum(row[iCracha]),
      nome:              g(iNome, row).slice(0, 100) || null,
    });
  });
  return registros;
}

/* ══════════════════════════════════════════════════════
   PARSER: PRÉ-ORDENS
   Chave: UNIQUE(pre_os)
   ══════════════════════════════════════════════════════ */
function parsePreOS(rows) {
  const registros = [];
  const n = s => normStr(s);

  // Linha de cabeçalho: onde primeira célula normalizada = 'pre-os'
  let hdrIdx = rows.findIndex(r => n(r[0]) === 'pre-os');
  if (hdrIdx < 0) hdrIdx = rows.findIndex(r => r.some(c => n(c) === 'pre-os'));
  if (hdrIdx < 0) hdrIdx = 2;

  const hdr = rows[hdrIdx].map(c => String(c || ''));
  const g = (i, row) => (i >= 0 && i < row.length) ? String(row[i] || '').trim() : '';

  const iPreOS  = colIdx(hdr, ['Pré-OS', 'Pre-OS', 'Pre OS']);
  const iSit    = colIdx(hdr, ['Situação', 'Situacao']);
  const iOS     = colIdx(hdr, ['OS']);
  const iDCom   = colIdx(hdr, ['Data comunicação', 'Data comunicacao', 'Data Comunicacao']);
  const iHCom   = colIdx(hdr, ['Hora comunicação', 'Hora comunicacao']);
  const iDInc   = colIdx(hdr, ['Data inclusão', 'Data inclusao', 'Data Inclusao']);
  const iHInc   = colIdx(hdr, ['Hora inclusão', 'Hora inclusao']);
  const iUser   = colIdx(hdr, ['Usuário', 'Usuario']);
  const iCracha = colIdx(hdr, ['Crachá', 'Cracha']);
  const iNome   = colIdx(hdr, ['Nome']);
  const iDesc   = colIdx(hdr, ['Descrição Serviço', 'Descricao Servico']);
  const iMis    = colIdx(hdr, ['MIS', 'Mis']);
  const iEquip  = colIdx(hdr, ['Equipamento']);

  rows.slice(hdrIdx + 1).forEach(row => {
    // parseInt garante que 7720.0 (float do XLSX) vira '7720'
    const rawPre = g(iPreOS >= 0 ? iPreOS : 0, row);
    const preOS  = normNum(rawPre);
    if (!preOS || !/^\d+$/.test(preOS)) return;

    const osRaw = g(iOS, row);
    const os    = normNum(osRaw);

    registros.push({
      pre_os:           preOS,
      situacao:         g(iSit, row) || null,
      os:               os || null,
      data_comunicacao: normData(row[iDCom]),
      hora_comunicacao: normHora(row[iHCom]),
      data_inclusao:    normData(row[iDInc]),
      hora_inclusao:    normHora(row[iHInc]),
      usuario:          g(iUser, row).slice(0, 50) || null,
      cracha:           normNum(row[iCracha]),
      nome:             g(iNome, row).slice(0, 100) || null,
      desc_servico:     g(iDesc, row).slice(0, 500) || null,
      mis:              g(iMis, row).slice(0, 20) || null,
      equipamento:      g(iEquip, row).slice(0, 30) || null,
    });
  });
  return registros;
}

/* ══════════════════════════════════════════════════════
   PARSER: PROGRAMAÇÃO SEMANAL (múltiplas abas)
   Chave: UNIQUE(os, cod_servico, semana, ano)
   Apenas programáveis — cod_servico nunca null aqui
   ══════════════════════════════════════════════════════ */
function parseProgSemanal(rows, wb, tabelaOS) {
  let todos = [];
  let ctx   = { semana: null, ano: null, dataIni: null, dataFim: null };

  if (wb && wb.SheetNames && wb.SheetNames.length > 1) {
    wb.SheetNames.forEach(sn => {
      const ws = wb.Sheets[sn];
      const r  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const res = _parseProgAba(r, ctx, tabelaOS);
      todos = todos.concat(res.registros);
      if (res.semana)   ctx.semana   = res.semana;
      if (res.ano)      ctx.ano      = res.ano;
      if (res.dataIni)  ctx.dataIni  = res.dataIni;
      if (res.dataFim)  ctx.dataFim  = res.dataFim;
      // Persistir equipe entre abas — OS podem continuar em aba separada
      if (res.equipe)   ctx.equipe   = res.equipe;
    });
  } else {
    var res = _parseProgAba(rows, ctx, tabelaOS);
    todos = res.registros;
    ctx   = res;
  }

  return { registros: todos, semana: ctx.semana, ano: ctx.ano,
           dataIni: ctx.dataIni, dataFim: ctx.dataFim };
}

function _parseProgAba(rows, ctxIn, tabelaOS) {
  const registros = [];
  let equipe = ctxIn.equipe || '', semana = ctxIn.semana, ano = ctxIn.ano;
  let dataIni = ctxIn.dataIni, dataFim = ctxIn.dataFim;

  // Normalizar cabeçalho para detectar semana/período
  const headerRaw  = rows.slice(0, 10).map(r => r.map(c => String(c || '')).join(' ')).join(' ');
  const headerText = headerRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const mSem = headerText.match(/SEM\s*(\d+)\s+(\d{2})\/(\d{2})-(\d{2})\/(\d{2})\/(\d{2,4})/i)
            || headerText.match(/SEM\s*(\d+)/i);
  if (mSem && mSem[1]) semana = parseInt(mSem[1]);

  const mIni = headerText.match(/Inicio\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const mFim = headerText.match(/Fim\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (mIni) { dataIni = normData(mIni[1]); ano = parseInt(mIni[1].split('/')[2]); }
  if (mFim)   dataFim = normData(mFim[1]);

  if (mSem && mSem[6]) {
    const anoRaw = mSem[6];
    ano     = anoRaw.length === 2 ? 2000 + parseInt(anoRaw) : parseInt(anoRaw);
    dataIni = ano + '-' + mSem[3] + '-' + mSem[2];
    dataFim = ano + '-' + mSem[5] + '-' + mSem[4];
  }

  rows.forEach(row => {
    const cells = row.map(c => String(c || '').trim());

    // Linha de equipe
    if (normStr(cells[0]) === 'equipe:') {
      const src = cells[1] || '';
      const mEq = src.match(/([A-Z0-9]{2,6})\s*[-]\s*(.+)/i);
      if (mEq) equipe = mEq[1].trim();
      return;
    }

    const os = normNum(cells[0]);
    if (!os || !/^\d{5,}$/.test(os) || !equipe) return;

    const descBruta = cells[1] || '';
    const mis       = cells[2] || null;
    const hhRaw     = cells[5] || cells[4] || cells[3] || '';
    const hh        = parseFloat(String(hhRaw).replace(',', '.')) || null;



    // Resolver cod_servico cruzando com tabela OS
    let codServico = null;
    if (tabelaOS && tabelaOS[os]) {
      const candidatos = tabelaOS[os].filter(c => c.cod !== '1' || tabelaOS[os].length === 1);
      const descNorm   = normStr(descBruta).slice(0, 20);
      const match      = tabelaOS[os].find(c => normStr(c.desc).slice(0, 15) === descNorm.slice(0, 15));
      codServico       = match ? match.cod : (tabelaOS[os][0] ? tabelaOS[os][0].cod : null);
    }

    if (!descBruta && !mis) return;

    registros.push({
      semana,
      ano,
      data_inicio_semana: dataIni,
      data_fim_semana:    dataFim,
      equipe,
      os,
      cod_servico:      codServico,  // null se OS ainda não importada
      desc_servico:     descBruta.slice(0, 500) || null,
      mis:              mis ? mis.slice(0, 20) : null,
      hh_previsto:      hh,

    });
  });

  return { registros, semana, ano, dataIni, dataFim, equipe };
}

/* ══════════════════════════════════════════════════════
   PARSER: APONTAMENTOS
   Chave: UNIQUE(os, data_apontamento, chapa, hora_inicio)
   cod_servico:
     MCU (sem numeral na desc) → NULL
     Programável ('1-DESC')    → '1','2'...
   ══════════════════════════════════════════════════════ */
function parseApontamento(rows) {
  const registros = [];
  let chapa = '', nome = '';
  let dataAtual = null, tipoAtual = '', horaIni = '', horaFim = '', hhTotal = null;
  let pendente = false;

  rows.forEach(row => {
    const cells = row.map(c => String(c || '').trim());
    const c0    = cells[0] || '';

    // Linha de funcionário
    if (normStr(c0).startsWith('funcion')) {
      const raw = cells[1] || '';
      const m   = raw.match(/^(\d+)\s*[-]\s*(.+)$/);
      if (m) { chapa = String(parseInt(m[1])); nome = m[2].trim(); }
      pendente = false;
      return;
    }

    // Linha A: data
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(c0)) {
      dataAtual = normData(c0);
      tipoAtual = cells[1] || '';
      horaIni   = normHora(cells[2]) || '00:00';
      horaFim   = normHora(cells[3]) || '00:00';
      hhTotal   = parseFloat(String(cells[4] || '').replace(',', '.')) || null;
      pendente  = true;
      return;
    }

    // Linha B: OS + descrição
    if (pendente && /^\d{5,6}$/.test(c0)) {
      const os       = normNum(c0);
      const { cod, desc } = extrairCod(cells[1] || '');
      // MCU: descrição sem numeral → cod=null
      // Programável: descrição com numeral → cod='1','2'...
      registros.push({
        os,
        cod_servico:      cod,   // null para MCU
        data_apontamento: dataAtual,
        chapa,
        nome:             nome.slice(0, 100) || null,
        hora_inicio:      horaIni,
        hora_fim:         horaFim,
        hh_total:         hhTotal,
        tipo_atividade:   tipoAtual || null,
      });
      pendente = false;
    }
  });
  return registros;
}


/* ══════════════════════════════════════════════════════
   PARSER: PROGRAMAÇÃO SEMANAL — PDF (PIMS FMIREL140)
   Lê texto extraído do PDF linha a linha
   ══════════════════════════════════════════════════════ */
function parseProgSemanalPDF(textoCompleto, ctxIn) {
  const registros = [];
  let equipe = '', semana = ctxIn.semana||null, ano = ctxIn.ano||null;
  let dataIni = null, dataFim = null;

  const linhas = textoCompleto.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const lNorm = linha.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

    // Detectar semana/período no cabeçalho
    const mSem = linha.match(/SEM\s*(\d+)\s+/i);
    if (mSem && !semana) semana = parseInt(mSem[1]);

    const mIni = linha.match(/In[ií]cio\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (mIni) {
      const parts = mIni[1].split('/');
      ano = parseInt(parts[2]);
      dataIni = parts[2]+'-'+parts[1]+'-'+parts[0];
    }
    const mFim = linha.match(/Fim\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (mFim) {
      const parts = mFim[1].split('/');
      dataFim = parts[2]+'-'+parts[1]+'-'+parts[0];
    }

    // Detectar linha de equipe: "Equipe: CAL1 - CALDEIRARIA..."
    const mEq = linha.match(/^Equipe:\s*([A-Z0-9]{2,8})\s*[-–]\s*(.+)/i);
    if (mEq) {
      equipe = mEq[1].trim().toUpperCase();
      continue;
    }

    // Detectar linha de OS: começa com número de 5+ dígitos
    const mOS = linha.match(/^(\d{5,8})\s+(.+)/);
    if (!mOS || !equipe) continue;

    const os = mOS[1];
    const resto = mOS[2].trim();

    // Extrair H-h (último número da linha, formato XX.XX)
    const mHH = resto.match(/(\d+[.,]\d{2})\s*$/);
    const hh = mHH ? parseFloat(mHH[1].replace(',', '.')) : null;

    // Extrair MIS (código de equipamento — padrão LETRAS+NÚMEROS antes das datas)
    const mMIS = resto.match(/([A-Z]{2,6}\d{4,})\s/);
    const mis = mMIS ? mMIS[1] : null;

    // Descrição: tudo que não é MIS nem datas nem H-h
    let desc = resto
      .replace(/(\d{2}\/\d{2}\s+\d{2}:\d{2})/g, '')  // datas
      .replace(/\d+[.,]\d{2}\s*$/, '')                    // H-h final
      .replace(/[A-Z]{2,6}\d{4,}\s*/, '')                  // MIS
      .replace(/\s{2,}/g, ' ').trim();

    // Se descrição ficou muito curta, pode ter continuação na linha seguinte
    // (PDF quebra linhas longas)
    if (desc.length < 10 && i+1 < linhas.length) {
      const prox = linhas[i+1];
      if (!/^\d{5,}/.test(prox) && !/^Equipe:/i.test(prox) && !/^Total/.test(prox)) {
        desc = (desc + ' ' + prox).trim();
        i++; // pular linha de continuação
      }
    }

    if (!desc || desc.length < 3) continue;

    registros.push({
      semana, ano,
      data_inicio_semana: dataIni,
      data_fim_semana:    dataFim,
      equipe,
      os,
      cod_servico:  null,
      desc_servico: desc.slice(0, 500),
      mis:          mis ? mis.slice(0, 20) : null,
      hh_previsto:  hh,
    });
  }

  return { registros, semana, ano, dataIni, dataFim };
}

/* Exportar */
window.Parsers = {
  detectarTipo, parseOS, parsePreOS,
  parseProgSemanal, parseProgSemanalPDF, parseApontamento,
  normNum, normStr, normData, normHora, extrairCod,
};
