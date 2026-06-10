/* =============================================================
   cal_acomp.js — MAN360 · PCM Clealco
   Módulo: Calendário de Acompanhamento de Equipes
   Versão reconstruída — campos reais do banco (turno/escala por NOME)
   ============================================================= */

'use strict';

/* ─── Configuração Supabase ─────────────────────────────────── */
const SUPA_URL  = 'https://gwejwvsmmogzdpgyaggf.supabase.co';
const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3ZWp3dnNtbW9nemRwZ3lhZ2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTU0NjIsImV4cCI6MjA5NTEzMTQ2Mn0.HgsOjYyHTOiCtjblADpCcwi7SNkK17jjMTdG4Z7H8Uc';

const HEADERS = {
  'apikey':        SUPA_KEY,
  'Authorization': 'Bearer ' + SUPA_KEY,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation'
};

/* ─── Estado do módulo ──────────────────────────────────────── */
let _turnos  = {};   // indexado por NOME: _turnos["Turno A"] = {...}
let _escalas = {};   // indexado por NOME: _escalas["5x1"]    = {...}
let _equipes = [];   // lista de equipes CAL
let _membros = {};   // _membros[equipe_id] = [{ chapa, nome, ...colab }]
let _colabs  = {};   // _colabs[cracha] = registro completo de apt_colaboradores

let _anoMes  = '';   // "YYYY-MM" corrente
let _diasMes = 0;
let _primDia = null; // Date do 1º dia do mês

/* ─── Helpers de data ────────────────────────────────────────── */
function isoDate(d) {
  // Retorna "YYYY-MM-DD" de um objeto Date
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseISO(str) {
  // Converte "YYYY-MM-DD" para Date (meia-noite local)
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dtHoraToISO(data, hora) {
  // Monta ISO sem offset UTC para evitar conversão de fuso
  // data: "YYYY-MM-DD", hora: "HH:MM"
  return `${data}T${hora}:00`;
}

function fmtHora(isoStr) {
  // Extrai "HH:MM" de string ISO sem depender de UTC
  if (!isoStr) return '--:--';
  const m = String(isoStr).match(/T(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  // fallback: pode ser só "HH:MM"
  const m2 = String(isoStr).match(/^(\d{2}):(\d{2})/);
  if (m2) return `${m2[1]}:${m2[2]}`;
  return '--:--';
}

function addDias(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function diffDias(a, b) {
  // Diferença em dias inteiros (b - a)
  const msDay = 86400000;
  return Math.round((b.getTime() - a.getTime()) / msDay);
}

/* ─── Fetch helper ───────────────────────────────────────────── */
async function supa(tabela, params = '') {
  const url = `${SUPA_URL}/rest/v1/${tabela}${params ? '?' + params : ''}`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase [${tabela}]: ${r.status} — ${txt}`);
  }
  return r.json();
}

async function supaPost(tabela, body) {
  const url = `${SUPA_URL}/rest/v1/${tabela}`;
  const r = await fetch(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase POST [${tabela}]: ${r.status} — ${txt}`);
  }
  return r.json();
}

async function supaPatch(tabela, filtro, body) {
  const url = `${SUPA_URL}/rest/v1/${tabela}?${filtro}`;
  const r = await fetch(url, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(body) });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase PATCH [${tabela}]: ${r.status} — ${txt}`);
  }
  return r.json();
}

async function supaDelete(tabela, filtro) {
  const url = `${SUPA_URL}/rest/v1/${tabela}?${filtro}`;
  const r = await fetch(url, { method: 'DELETE', headers: HEADERS });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase DELETE [${tabela}]: ${r.status} — ${txt}`);
  }
  return true;
}

/* ─── Carregamento de dados base ─────────────────────────────── */
async function carregarTurnos() {
  const rows = await supa('apt_turnos', 'select=*&ativo=eq.true');
  _turnos = {};
  rows.forEach(t => {
    _turnos[t.nome] = t;   // CORREÇÃO 1: indexar por nome
    if (t.id) _turnos[t.id] = t; // manter por id como fallback
  });
  console.log('[cal_acomp] Turnos carregados:', Object.keys(_turnos).filter(k => isNaN(k)));
}

async function carregarEscalas() {
  const rows = await supa('apt_escalas', 'select=*');
  _escalas = {};
  rows.forEach(e => {
    _escalas[e.nome] = e;  // CORREÇÃO 2: indexar por nome
    if (e.id) _escalas[e.id] = e; // manter por id como fallback
  });
  console.log('[cal_acomp] Escalas carregadas:', Object.keys(_escalas).filter(k => isNaN(k)));
}

async function carregarColaboradoresCAL() {
  const rows = await supa(
    'apt_colaboradores',
    'select=cracha,nome,modalidade,especialidade_id,escala,primeira_folga,ativo,turno&modalidade=eq.CAL&ativo=eq.true'
  );
  _colabs = {};
  let semEscala = 0, semTurno = 0;
  rows.forEach(c => {
    _colabs[c.cracha] = c;
    if (!c.escala) semEscala++;
    if (!c.turno)  semTurno++;
  });
  if (semEscala || semTurno)
    console.warn(`[cal_acomp] Colaboradores CAL sem escala: ${semEscala}, sem turno: ${semTurno} — projeção de folgas ficará vazia para estes.`);
  console.log('[cal_acomp] Colaboradores CAL carregados:', rows.length);
}

async function carregarEquipesCAL() {
  // Busca equipes que contenham membros com colaboradores CAL
  // A tabela cal_equipe_membros tem: equipe_id, chapa, nome
  const equipes = await supa('cal_equipes', 'select=*&ativo=eq.true');
  _equipes = equipes || [];

  // Carrega membros de cada equipe
  _membros = {};
  for (const eq of _equipes) {
    const mems = await supa('cal_equipe_membros', `select=*&equipe_id=eq.${eq.id}`);
    // CORREÇÃO 3: buscar colaborador por cracha === chapa
    _membros[eq.id] = (mems || []).map(m => {
      const colab = _colabs[m.chapa]; // chapa = cracha
      return { ...m, ...colab };      // mescla dados do membro com dados do colaborador
    }).filter(m => m.cracha);         // remove membros sem colaborador encontrado
  }
  console.log('[cal_acomp] Equipes CAL carregadas:', _equipes.length);
}

/* ─── Projeção de folgas ─────────────────────────────────────── */
/**
 * Projeta as datas de folga de um colaborador no intervalo [ini, fim].
 * 
 * LÓGICA:
 * - colab.primeira_folga = data de UMA folga real (âncora do ciclo)
 * - âncora → diff=0 → pos=0 → É folga
 * - escala 5x1: ciclo=6 dias. pos 1..5 = trabalho, pos 0 = folga
 * 
 * @param {Object} colab  — registro de apt_colaboradores
 * @param {Date}   ini    — início do intervalo
 * @param {Date}   fim    — fim do intervalo
 * @returns {Set<string>} — conjunto de datas ISO "YYYY-MM-DD" de folgas
 */
function projetarFolgas(colab, ini, fim) {
  const folgas = new Set();

  // CORREÇÃO 4: usar colab.escala (nome) não colab.escala_id
  const nomEsc = colab.escala;
  if (!nomEsc) return folgas;

  const esc = _escalas[nomEsc];
  if (!esc) {
    console.warn(`[projetarFolgas] Escala não encontrada: "${nomEsc}"`);
    return folgas;
  }

  // tipo_ciclo é categórico ("ROTATIVO", "ADM") — não é o tamanho do ciclo
  // ciclo = dias_trabalho + 1 folga  (5x1 → ciclo 6, 6x1 → ciclo 7)
  const diasTrab    = esc.dias_trabalho || 5;
  const ciclo       = diasTrab + 1;
  const ancData     = parseISO(colab.primeira_folga);
  if (!ancData) return folgas;

  let d = new Date(ini);
  while (d <= fim) {
    const diff = diffDias(ancData, d);
    // Normaliza para positivo dentro do ciclo
    const pos = ((diff % ciclo) + ciclo) % ciclo;

    // CORREÇÃO 6: pos === 0 é folga (âncora = dia da folga)
    if (pos === 0) {
      folgas.add(isoDate(d));
    }

    d = addDias(d, 1);
  }

  return folgas;
}

/* ─── HH disponível por equipe por dia ──────────────────────── */
/**
 * Calcula HH disponível de uma equipe num determinado dia.
 * Considera: membros presentes (não em folga) × duração do turno.
 * 
 * @param {number} equipeId
 * @param {Date}   dia
 * @returns {number} HH disponível em horas decimais
 */
function hhDispEquipeDia(equipeId, dia) {
  const mems = _membros[equipeId] || [];
  let totalHH = 0;

  for (const c of mems) {
    // CORREÇÃO 5: usar c.turno (nome) não c.turno_id
    const nomTurno = c.turno;
    if (!nomTurno) continue;

    const turno = _turnos[nomTurno];
    if (!turno) {
      console.warn(`[hhDispEquipeDia] Turno não encontrado: "${nomTurno}"`);
      continue;
    }

    // Verifica se está de folga
    const folgas = projetarFolgas(c, dia, dia);
    if (folgas.has(isoDate(dia))) continue; // está de folga

    // Calcula horas do turno
    // turno tem: hora_saida, intervalo_min, dias_trabalho, saida_sexta
    // Se não há hora_entrada, deduzir a partir de saída e carga horária típica
    let horasBase = 8; // padrão

    if (turno.hora_entrada && turno.hora_saida) {
      const [hE, mE] = turno.hora_entrada.split(':').map(Number);
      const [hS, mS] = turno.hora_saida.split(':').map(Number);
      const minTot = (hS * 60 + mS) - (hE * 60 + mE);
      const minTrab = minTot - (turno.intervalo_min || 0);
      horasBase = minTrab / 60;
    } else if (turno.hora_saida) {
      // Sem hora_entrada: assumir 8h de trabalho - intervalo
      const minTrab = 480 - (turno.intervalo_min || 60);
      horasBase = minTrab / 60;
    }

    // Sexta-feira (dia 5 = Friday) pode ter saída reduzida
    if (dia.getDay() === 5 && turno.saida_sexta) {
      const [hS, mS] = turno.saida_sexta.split(':').map(Number);
      // Recalcular com saída de sexta
      if (turno.hora_entrada) {
        const [hE, mE] = turno.hora_entrada.split(':').map(Number);
        const minTot = (hS * 60 + mS) - (hE * 60 + mE);
        horasBase = Math.max(0, (minTot - (turno.intervalo_min || 0)) / 60);
      }
    }

    totalHH += Math.max(0, horasBase);
  }

  return totalHH;
}

/* ─── Inicialização do mês ───────────────────────────────────── */
function setMes(anoMes) {
  // anoMes: "YYYY-MM"
  _anoMes  = anoMes;
  const [y, m] = anoMes.split('-').map(Number);
  _primDia  = new Date(y, m - 1, 1);
  _diasMes  = new Date(y, m, 0).getDate();
}

function getMes() { return _anoMes; }

function primDiaMes()  { return _primDia; }
function ultimoDiaMes() {
  const [y, m] = _anoMes.split('-').map(Number);
  return new Date(y, m, 0);
}

/* ─── Carregamento completo ──────────────────────────────────── */
async function inicializar(anoMes) {
  setMes(anoMes);
  await Promise.all([
    carregarTurnos(),
    carregarEscalas(),
    carregarColaboradoresCAL()
  ]);
  await carregarEquipesCAL();
  console.log('[cal_acomp] Inicialização completa para:', anoMes);
}

/* ─── Geração de calendário de equipe ───────────────────────── */
/**
 * Gera a grade de presença/folga de uma equipe para o mês corrente.
 * Retorna array de objetos { membro, dias: [{data, folga, hh}] }
 */
function gerarCalendarioEquipe(equipeId) {
  const mems  = _membros[equipeId] || [];
  const ini   = primDiaMes();
  const fim   = ultimoDiaMes();
  const grade = [];

  for (const c of mems) {
    const folgas = projetarFolgas(c, ini, fim);
    const dias   = [];

    let d = new Date(ini);
    while (d <= fim) {
      const iso   = isoDate(d);
      const eFolga = folgas.has(iso);
      const hh    = eFolga ? 0 : hhMembroDia(c, d);
      dias.push({ data: iso, folga: eFolga, hh });
      d = addDias(d, 1);
    }

    grade.push({ membro: c, dias });
  }

  return grade;
}

/**
 * HH disponível de um membro específico em um dia.
 */
function hhMembroDia(colab, dia) {
  const nomTurno = colab.turno;
  if (!nomTurno) return 0;
  const turno = _turnos[nomTurno];
  if (!turno) return 0;

  let horasBase = 8;

  if (turno.hora_entrada && turno.hora_saida) {
    const [hE, mE] = turno.hora_entrada.split(':').map(Number);
    const [hS, mS] = turno.hora_saida.split(':').map(Number);
    const minTrab = (hS * 60 + mS) - (hE * 60 + mE) - (turno.intervalo_min || 0);
    horasBase = minTrab / 60;
  } else if (turno.hora_saida) {
    horasBase = (480 - (turno.intervalo_min || 60)) / 60;
  }

  if (dia.getDay() === 5 && turno.saida_sexta && turno.hora_entrada) {
    const [hE, mE] = turno.hora_entrada.split(':').map(Number);
    const [hS, mS] = turno.saida_sexta.split(':').map(Number);
    const minTrab  = (hS * 60 + mS) - (hE * 60 + mE) - (turno.intervalo_min || 0);
    horasBase = Math.max(0, minTrab / 60);
  }

  return Math.max(0, horasBase);
}

/* ─── Totais HH por equipe no mês ───────────────────────────── */
function totalHHEquipeMes(equipeId) {
  const ini = primDiaMes();
  const fim = ultimoDiaMes();
  let total = 0;
  let d = new Date(ini);
  while (d <= fim) {
    total += hhDispEquipeDia(equipeId, d);
    d = addDias(d, 1);
  }
  return total;
}

/* ─── Resumo do mês por equipe ───────────────────────────────── */
function resumoMesEquipe(equipeId) {
  const mems  = _membros[equipeId] || [];
  const ini   = primDiaMes();
  const fim   = ultimoDiaMes();
  const result = {
    equipe_id:    equipeId,
    total_membros: mems.length,
    hh_total:     0,
    folgas_total: 0,
    membros:      []
  };

  for (const c of mems) {
    const folgas = projetarFolgas(c, ini, fim);
    let hhMembro = 0;
    let d = new Date(ini);
    while (d <= fim) {
      if (!folgas.has(isoDate(d))) {
        hhMembro += hhMembroDia(c, d);
      }
      d = addDias(d, 1);
    }
    result.hh_total     += hhMembro;
    result.folgas_total += folgas.size;
    result.membros.push({
      cracha:       c.cracha,
      nome:         c.nome,
      turno:        c.turno,
      escala:       c.escala,
      hh_mes:       hhMembro,
      folgas_mes:   folgas.size,
      datas_folga:  [...folgas].sort()
    });
  }

  return result;
}

/* ─── API pública do módulo ──────────────────────────────────── */
window.CalAcomp = {
  // Inicialização
  inicializar,
  setMes,
  getMes,

  // Dados
  getEquipes:   () => _equipes,
  getMembros:   (eqId) => _membros[eqId] || [],
  getTurnos:    () => _turnos,
  getEscalas:   () => _escalas,
  getColabs:    () => _colabs,

  // Cálculos
  projetarFolgas,
  hhDispEquipeDia,
  hhMembroDia,
  totalHHEquipeMes,

  // Geração de calendário
  gerarCalendarioEquipe,
  resumoMesEquipe,

  // Helpers de data
  isoDate,
  parseISO,
  fmtHora,
  dtHoraToISO,
  addDias,
  diffDias,
  primDiaMes,
  ultimoDiaMes
};

/* ─── Auto-inicialização se houver indicador no DOM ─────────── */
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('cal-acomp-root');
  if (!el) return;

  const anoMes = el.dataset.anoMes || (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  })();

  window.CalAcomp.inicializar(anoMes)
    .then(() => {
      el.dispatchEvent(new CustomEvent('cal-acomp-ready', {
        bubbles: true,
        detail: { anoMes }
      }));
    })
    .catch(err => {
      console.error('[cal_acomp] Falha na inicialização:', err);
      el.dispatchEvent(new CustomEvent('cal-acomp-error', {
        bubbles: true,
        detail: { err }
      }));
    });
});
