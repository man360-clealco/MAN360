/* ═══════════════════════════════════════════════════════
   MAN360 — Importador
   ═══════════════════════════════════════════════════════ */

/* ── OS ──────────────────────────────────────────────── */
async function importarOS(rows) {
  const regs = Parsers.parseOS(rows);
  if (!regs.length) return { ok: false, msg: '0 OS encontradas' };

  const mcu  = regs.filter(r => r.tipo_atividade === 'MCU');
  const prog = regs.filter(r => r.tipo_atividade !== 'MCU');

  // UNIQUE(empresa, os, cod_servico) — Clementina e Queiroz numeram OS
  // a partir do próprio zero, então a chave precisa incluir empresa.
  const { count, error } = await dbUpsert('ordens_servico', regs, 'empresa,os,cod_servico');
  if (error) return { ok: false, msg: 'Erro: ' + error.message };

  /* Após importar OS, tentar resolver cod_servico='?' na programação */
  await resolverProgPendentes();

  return { ok: true, msg: 'OK . ' + regs.length + ' OS (' + mcu.length + ' MCU + ' + prog.length + ' prog.)' };
}

/* ── Resolver cod_servico pendentes na programação semanal ── */
async function resolverProgPendentes() {
  try {
    const db = getDB();

    /* Buscar linhas com cod_servico='?' */
    const { data: pendentes } = await db
      .from('programacao_semanal')
      .select('id, os, desc_servico, equipe, semana, ano')
      .eq('cod_servico', '?');

    if (!pendentes || !pendentes.length) return;

    /* Buscar OS do banco para resolver */
    const osNums = [...new Set(pendentes.map(p => p.os))];
    const { data: osData } = await db
      .from('ordens_servico')
      .select('os, cod_servico, desc_servico')
      .in('os', osNums.slice(0, 500))
      .neq('tipo_atividade', 'MCU');

    if (!osData || !osData.length) return;

    /* Montar mapa os → [{cod, desc}] */
    const tabelaOS = {};
    osData.forEach(r => {
      if (!tabelaOS[r.os]) tabelaOS[r.os] = [];
      tabelaOS[r.os].push({ cod: r.cod_servico, desc: r.desc_servico || '' });
    });

    /* Para cada pendente, tentar resolver */
    let resolvidos = 0;
    for (const p of pendentes) {
      const candidatos = tabelaOS[p.os];
      if (!candidatos || !candidatos.length) continue;

      /* Tentar match por descrição */
      const descNorm = Parsers.normStr(p.desc_servico || '').slice(0, 15);
      const match = candidatos.find(c =>
        Parsers.normStr(c.desc).slice(0, 15) === descNorm
      ) || candidatos[0];

      if (!match || !match.cod) continue;

      /* Atualizar o registro */
      await db
        .from('programacao_semanal')
        .update({ cod_servico: match.cod })
        .eq('id', p.id);

      resolvidos++;
    }

    if (resolvidos > 0)
      console.log('resolverProgPendentes: ' + resolvidos + ' de ' + pendentes.length + ' resolvidos');

  } catch(e) {
    console.warn('resolverProgPendentes:', e.message);
  }
}

/* ── Pré-OS ───────────────────────────────────────────── */
async function importarPreOS(rows) {
  const regs = Parsers.parsePreOS(rows);
  console.log('parsePreOS retornou:', regs.length, 'registros');
  if (regs.length > 0) console.log('Exemplo:', JSON.stringify(regs[0]));
  if (!regs.length) return { ok: false, msg: '0 pré-OS encontradas — verifique o formato do arquivo' };

  const { count, error } = await dbUpsert('pre_ordens', regs, 'pre_os');
  console.log('dbUpsert result:', count, error);
  if (error) return { ok: false, msg: 'Erro: ' + error.message };

  const aguardando = regs.filter(r => r.situacao === 'Aguardando').length;
  const comOS      = regs.filter(r => r.os).length;
  return { ok: true, msg: 'OK . ' + count + ' pré-OS (' + aguardando + ' aguardando · ' + comOS + ' com OS)' };
}

/* ── Programação Semanal ─────────────────────────────── */
async function importarProgSemanal(rows, wb) {
  const db = getDB();

  // Carregar OS do banco para resolver cod_servico
  const { data: osData } = await db
    .from('ordens_servico')
    .select('os, cod_servico, desc_servico')
    .neq('cod_servico', '1');  // só programáveis com cod > 1 têm múltiplos serviços

  // Montar mapa: os → [{cod, desc}]
  const tabelaOS = {};
  const { data: osAll } = await db
    .from('ordens_servico')
    .select('os, cod_servico, desc_servico')
    .neq('tipo_atividade', 'MCU');
  (osAll || []).forEach(r => {
    if (!tabelaOS[r.os]) tabelaOS[r.os] = [];
    tabelaOS[r.os].push({ cod: r.cod_servico, desc: r.desc_servico || '' });
  });

  const { registros, semana, ano, dataIni, dataFim } = Parsers.parseProgSemanal(rows, wb, tabelaOS);
  if (!registros.length) return { ok: false, msg: '0 serviços encontrados' };
  if (!semana || !ano)   return { ok: false, msg: 'Semana/ano não identificados no cabeçalho' };

  // Verificar duplicidade
  const { count: jaExiste } = await dbCount('programacao_semanal', [
    ['semana', 'eq', semana], ['ano', 'eq', ano],
  ]);

  if (jaExiste > 0) {
    const ok = confirm(
      'Semana ' + semana + '/' + ano + ' já importada (' + jaExiste + ' registros).\nSubstituir?'
    );
    if (!ok) return { ok: false, msg: 'Cancelado' };
    await dbDelete('programacao_semanal', [['semana', semana], ['ano', ano]]);
  }

  // Registros com cod_servico null não podem ir para o banco com UNIQUE(os,cod,sem,ano)
  // Salvar como cod_servico='?' para identificar pendentes de resolução
  const limpos = registros.map(r => ({
    ...r,
    cod_servico:  r.cod_servico || '?',
    desc_servico: r.desc_servico || '',   // nunca null — faz parte da chave unica
  }));

  const { count, error } = await dbUpsert('programacao_semanal', limpos, 'os,desc_servico,equipe,semana,ano');
  if (error) return { ok: false, msg: 'Erro: ' + error.message };

  const resolvidos = limpos.filter(r => r.cod_servico !== '?').length;
  const pendentes  = limpos.filter(r => r.cod_servico === '?').length;

  return {
    ok: true,
    msg: 'OK . ' + count + ' serviços (Sem ' + semana + '/' + ano + ') . ' +
         resolvidos + ' com cód. serviço . ' + pendentes + ' pendentes',
    semana, ano, dataIni, dataFim,
  };
}

/* ── Importar registros já parseados (PDF ou outro formato) ── */
async function importarRegistrosProgSemanal(registros, semana, ano, dataIni, dataFim) {
  if (!registros.length) return { ok: false, msg: '0 serviços encontrados no PDF' };
  if (!semana || !ano)   return { ok: false, msg: 'Semana/ano não identificados no PDF' };

  const db = getDB();

  // Verificar duplicidade
  const { count: jaExiste } = await dbCount('programacao_semanal', [
    ['semana', 'eq', semana], ['ano', 'eq', ano],
  ]);
  if (jaExiste > 0) {
    const ok = confirm(
      'Semana ' + semana + '/' + ano + ' já importada (' + jaExiste + ' registros).\nSubstituir?'
    );
    if (!ok) return { ok: false, msg: 'Cancelado' };
    await dbDelete('programacao_semanal', [['semana', semana], ['ano', ano]]);
  }

  const limpos = registros.map(r => ({
    ...r,
    cod_servico:  r.cod_servico || '?',
    desc_servico: r.desc_servico || '',
  }));

  const { count, error } = await dbUpsert('programacao_semanal', limpos, 'os,desc_servico,equipe,semana,ano');
  if (error) return { ok: false, msg: 'Erro: ' + error.message };

  const pendentes = limpos.filter(r => r.cod_servico === '?').length;
  return {
    ok: true,
    msg: 'OK (PDF) . ' + count + ' serviços (Sem ' + semana + '/' + ano + ') . ' + pendentes + ' aguardando importação de OS',
    semana, ano, dataIni, dataFim,
  };
}

/* ── Apontamentos ────────────────────────────────────── */
async function importarApontamento(rows) {
  const regs = Parsers.parseApontamento(rows);
  if (!regs.length) return { ok: false, msg: '0 apontamentos encontrados' };

  // Chave: UNIQUE(os, data_apontamento, chapa, hora_inicio)
  // cod_servico fica fora da chave — MCU tem null, prog tem '1','2'...
  const { count, error } = await dbUpsert(
    'apontamentos', regs,
    'os,data_apontamento,chapa,hora_inicio'
  );
  if (error) return { ok: false, msg: 'Erro: ' + error.message };

  const mcu  = regs.filter(r => !r.cod_servico).length;
  const prog = regs.filter(r => r.cod_servico).length;
  return { ok: true, msg: 'OK . ' + regs.length + ' apontamentos (' + mcu + ' MCU + ' + prog + ' prog.)' };
}

/* ── Orquestrador ────────────────────────────────────── */
async function processarArquivo(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const tipo = Parsers.detectarTipo(file.name, rows);

        let resultado;
        switch (tipo) {
          case 'os':          resultado = await importarOS(rows);               break;
          case 'preos':       resultado = await importarPreOS(rows);            break;
          case 'progsem':     resultado = await importarProgSemanal(rows, wb);  break;
          case 'apontamento': resultado = await importarApontamento(rows);      break;
          default:            resultado = { ok: false, msg: 'Tipo não reconhecido: ' + file.name };
        }
        resolve({ tipo, ...resultado });
      } catch (err) {
        console.error(err);
        resolve({ tipo: 'erro', ok: false, msg: 'Erro: ' + err.message });
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
