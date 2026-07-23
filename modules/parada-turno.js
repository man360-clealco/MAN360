/* ═══════════════════════════════════════════════════════════
   MAN360 — Módulo: Parada com Chuva / Turno
   modules/parada-turno.js
   Tabelas: parada_turno_config, parada_turno_os, parada_turno_midias
═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

const BUCKET = 'os-fotos';

/* ── Estado ── */
let CFG    = null;   // { id, nome, inicio, fim_dias, hora_inicio, hora_fim }
let OS_LIST = [];    // [{id, os, cod, desc, hh, hh_orig, equipe:[], recurso, recurso_dur, status, inicio_real, fim_real, fotos:[]}]
let EQUIPE = [];     // ['Jean','Givaldo',...]
let ABA    = 'sit';
let _c     = null;   // container

/* ── Helpers ── */
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtHora = d => d ? new Date(d).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';
const fmtData = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const agora = () => new Date().toISOString();

function duracaoH(os) {
  const hh = parseFloat(os.hh)||0;
  const qt = (os.equipe||[]).length||1;
  return hh/qt;
}

function previsaoFim(os) {
  if (!os.inicio_real) return null;
  const d = new Date(os.inicio_real);
  d.setHours(d.getHours() + duracaoH(os));
  return d.toISOString();
}

function statusLabel(s) {
  return {aguardando:'Aguardando',andamento:'Em andamento',bloqueado:'Bloqueado',concluido:'Concluído'}[s]||s;
}

/* ── Render principal ── */
function render() {
  if (!_c) return;
  _c.innerHTML = buildHTML();
  bind();
}

function buildHTML() {
  const osOrdenadas = [...OS_LIST].sort((a,b) => {
    const ord = {andamento:0,bloqueado:1,aguardando:2,concluido:3};
    return (ord[a.status]??2) - (ord[b.status]??2);
  });
  const total    = OS_LIST.length;
  const andando  = OS_LIST.filter(o=>o.status==='andamento').length;
  const bloq     = OS_LIST.filter(o=>o.status==='bloqueado').length;
  const concluidos = OS_LIST.filter(o=>o.status==='concluido').length;
  const aderencia = total>0 ? Math.round(concluidos/total*100) : 0;

  return `
<style>
.pt{font-family:var(--font);color:#1a1a1a;max-width:600px;margin:0 auto}
.pt-nav{display:flex;background:#1e1e1e;position:sticky;top:0;z-index:50;border-radius:0}
.pt-tab{flex:1;padding:11px 4px;text-align:center;color:#9ca3af;font-size:10px;font-weight:700;
  text-transform:uppercase;letter-spacing:.06em;cursor:pointer;border-bottom:2px solid transparent;background:none;border-top:none;border-left:none;border-right:none;font-family:var(--font)}
.pt-tab.active{color:#F8C100;border-bottom-color:#F8C100}
.pt-section{display:none;padding-bottom:80px}
.pt-section.active{display:block}

/* Header */
.pt-header{background:#F8C100;padding:14px 14px 10px}
.pt-header-title{font-size:15px;font-weight:800;color:#1a1a1a}
.pt-header-sub{font-size:11px;color:rgba(0,0,0,.55);margin-top:2px}

/* KPIs */
.pt-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:10px 12px}
.pt-kpi{background:#fff;border-radius:10px;padding:10px 6px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.pt-kpi-val{font-size:20px;font-weight:800;line-height:1}
.pt-kpi-lbl{font-size:8px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-top:3px;line-height:1.2}
.v-andando{color:#2563eb} .v-bloq{color:#dc2626} .v-ok{color:#16a34a} .v-ader{color:#F8C100}

/* Cards OS */
.pt-os{background:#fff;border-radius:12px;margin:6px 12px 0;padding:13px;box-shadow:0 1px 4px rgba(0,0,0,.08);border-left:4px solid #e4e4e7}
.pt-os.andamento{border-left-color:#2563eb}
.pt-os.bloqueado{border-left-color:#dc2626}
.pt-os.concluido{border-left-color:#16a34a}
.pt-os.aguardando{border-left-color:#fbbf24}
.pt-os-num{font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:2px}
.pt-os-desc{font-size:13px;font-weight:800;color:#1a1a1a;line-height:1.3;margin-bottom:5px}
.pt-os-meta{font-size:11px;color:#6b7280;display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
.pt-badge{display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700}
.b-andamento{background:#dbeafe;color:#1e3a8a}
.b-bloqueado{background:#fee2e2;color:#991b1b}
.b-concluido{background:#dcfce7;color:#14532d}
.b-aguardando{background:#fef3c7;color:#92400e}
.pt-os-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.pt-btn{height:32px;padding:0 12px;border:none;border-radius:8px;font-weight:700;font-size:11px;
  cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-family:var(--font)}
.pt-btn-yellow{background:#F8C100;color:#1a1a1a}
.pt-btn-green{background:#dcfce7;color:#14532d}
.pt-btn-ghost{background:#f4f4f5;color:#374151;border:1px solid #e4e4e7}
.pt-btn-red{background:#fee2e2;color:#991b1b}
.pt-btn-blue{background:#dbeafe;color:#1e3a8a}
.pt-fotos-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:8px}
.pt-foto-thumb{aspect-ratio:1;border-radius:6px;overflow:hidden;background:#f3f4f6;position:relative;cursor:pointer}
.pt-foto-thumb img,.pt-foto-thumb video{width:100%;height:100%;object-fit:cover}
.pt-foto-del{position:absolute;top:2px;right:2px;background:rgba(0,0,0,.55);border:none;border-radius:50%;
  width:18px;height:18px;color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.pt-foto-add{border:1.5px dashed #d1d5db;border-radius:6px;aspect-ratio:1;display:flex;align-items:center;
  justify-content:center;cursor:pointer;background:#f9fafb;color:#9ca3af;font-size:20px}

/* Config */
.pt-card{background:#fff;border-radius:12px;margin:10px 12px 0;padding:13px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.pt-card-title{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:10px}
.pt-chips{display:flex;flex-wrap:wrap;gap:5px}
.pt-chip{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:20px;font-size:11px;
  font-weight:700;background:#f3f4f6;color:#374151;border:1.5px solid #e4e4e7;cursor:pointer}
.pt-chip.sel{background:#F8C100;color:#1a1a1a;border-color:#F8C100}
.pt-chip.add{border-style:dashed;color:#9ca3af}
.pt-chip.rec{background:#fef3c7;color:#92400e;border-color:#fbbf24}
.pt-input{width:100%;border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px;font-family:var(--font);
  font-size:12px;background:#f9fafb;color:#374151;box-sizing:border-box}
.pt-input:focus{outline:2px solid #F8C100;outline-offset:-1px;border-color:transparent}
.pt-label{font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;display:block}
.pt-field{margin-bottom:12px}
.pt-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}

/* Modal */
.pt-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;
  align-items:flex-end;justify-content:center}
.pt-modal{background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:600px;
  max-height:90vh;overflow-y:auto;padding:20px 16px 40px}
.pt-modal-handle{width:36px;height:4px;background:#e4e4e7;border-radius:2px;margin:0 auto 16px}
.pt-modal-title{font-size:15px;font-weight:800;margin-bottom:4px}
.pt-modal-sub{font-size:11px;color:#6b7280;margin-bottom:16px}

.pt-bloq-info{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fef3c7;
  border-radius:8px;font-size:11px;font-weight:600;color:#92400e;margin-bottom:0}
</style>

<div class="pt">
  <!-- TABS -->
  <div class="pt-nav">
    <button class="pt-tab ${ABA==='sit'?'active':''}" onclick="ptAba('sit')">Situação</button>
    <button class="pt-tab ${ABA==='cfg'?'active':''}" onclick="ptAba('cfg')">Configuração</button>
  </div>

  <!-- ══ SITUAÇÃO ══ -->
  <div class="pt-section ${ABA==='sit'?'active':''}" id="pt-sit">
    <div class="pt-header">
      <div class="pt-header-title">${CFG?esc(CFG.nome):'Parada — Sem configuração'}</div>
      <div class="pt-header-sub">${CFG?`Início: ${fmtData(CFG.inicio)} · ${CFG.hora_inicio||'07:00'} → ${CFG.hora_fim||'17:00'}`:'Configure a parada primeiro'}</div>
    </div>

    <!-- KPIs -->
    <div class="pt-kpis">
      <div class="pt-kpi"><div class="pt-kpi-val v-andando">${andando}</div><div class="pt-kpi-lbl">Andamento</div></div>
      <div class="pt-kpi"><div class="pt-kpi-val v-bloq">${bloq}</div><div class="pt-kpi-lbl">Falta Recurso</div></div>
      <div class="pt-kpi"><div class="pt-kpi-val v-ok">${concluidos}</div><div class="pt-kpi-lbl">Concluído</div></div>
      <div class="pt-kpi"><div class="pt-kpi-val v-ader">${aderencia}%</div><div class="pt-kpi-lbl">Ader. Proj.</div></div>
    </div>

    <!-- OS ordenadas: andamento → bloqueado → aguardando → concluido -->
    ${osOrdenadas.length ? osOrdenadas.map(o => buildOSCard(o, 'sit')).join('') :
      `<div style="text-align:center;padding:40px 20px;color:#9ca3af">
        <div style="font-size:32px;margin-bottom:8px">📋</div>
        <div style="font-size:13px;font-weight:700;color:#374151">Nenhum serviço importado</div>
        <div style="font-size:11px;margin-top:4px">Vá em Configuração e importe as OS</div>
      </div>`}
  </div>

  <!-- ══ CONFIGURAÇÃO ══ -->
  <div class="pt-section ${ABA==='cfg'?'active':''}" id="pt-cfg">
    <div class="pt-header">
      <div class="pt-header-title">Configuração</div>
      <div class="pt-header-sub">Parada, equipe e serviços</div>
    </div>

    <!-- Dados da parada -->
    <div class="pt-card">
      <div class="pt-card-title">Dados da Parada</div>
      <div class="pt-field">
        <label class="pt-label">Nome da parada</label>
        <input class="pt-input" id="cfg-nome" value="${esc(CFG?.nome||'')}" placeholder="Ex: Parada Geral Julho 2026">
      </div>
      <div class="pt-row2">
        <div class="pt-field">
          <label class="pt-label">Início efetivo</label>
          <input class="pt-input" type="datetime-local" id="cfg-inicio" value="${CFG?.inicio||''}">
        </div>
        <div class="pt-field">
          <label class="pt-label">Duração (dias)</label>
          <input class="pt-input" type="number" id="cfg-dias" min="1" value="${CFG?.fim_dias||1}" placeholder="2">
        </div>
      </div>
      <div class="pt-row2">
        <div class="pt-field">
          <label class="pt-label">Início do turno</label>
          <input class="pt-input" type="time" id="cfg-hora-ini" value="${CFG?.hora_inicio||'07:00'}">
        </div>
        <div class="pt-field">
          <label class="pt-label">Fim do turno</label>
          <input class="pt-input" type="time" id="cfg-hora-fim" value="${CFG?.hora_fim||'17:00'}">
        </div>
      </div>
      <button class="pt-btn pt-btn-yellow" style="width:100%;justify-content:center" onclick="ptSalvarCfg()">
        Salvar configuração
      </button>
    </div>

    <!-- Equipe -->
    <div class="pt-card">
      <div class="pt-card-title">Equipe no Turno</div>
      <div class="pt-chips" id="cfg-equipe">
        ${EQUIPE.map((e,i)=>`<span class="pt-chip sel" onclick="ptRemoverEquipe(${i})">${esc(e)} ✕</span>`).join('')}
        <span class="pt-chip add" onclick="ptAddEquipe()">+ Adicionar</span>
      </div>
    </div>

    <!-- Importar OS -->
    <div style="padding:0 12px;margin-top:10px;display:flex;gap:8px">
      <button class="pt-btn pt-btn-yellow" style="flex:1;justify-content:center" onclick="document.getElementById('pt-file-os').click()">
        📥 Importar OS (.xlsx)
      </button>
    </div>
    <input type="file" id="pt-file-os" accept=".xlsx,.xls" style="display:none">

    <!-- Lista de OS configuradas -->
    ${OS_LIST.length ? `<div style="padding:10px 12px 4px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af">${OS_LIST.length} serviços importados</div>
    ${OS_LIST.map(o => buildOSCard(o, 'cfg')).join('')}` :
    `<div style="text-align:center;padding:24px 20px;color:#9ca3af">
      <div style="font-size:11px">Nenhuma OS importada ainda</div>
    </div>`}
  </div>
</div>`;
}

function buildOSCard(o, modo) {
  const dur = duracaoH(o).toFixed(1);
  const eq  = (o.equipe||[]).join(', ') || 'Sem equipe';
  const pf  = previsaoFim(o);
  const fotos = o.fotos||[];

  const badgeClass = {andamento:'b-andamento',bloqueado:'b-bloqueado',
    concluido:'b-concluido',aguardando:'b-aguardando'}[o.status]||'b-aguardando';

  const fotosHtml = `
    <div class="pt-fotos-grid">
      ${fotos.slice(0,7).map((f,i)=>{
        const isVid=/\.(mp4|mov|webm)$/i.test(f.url||'');
        return `<div class="pt-foto-thumb" onclick="ptVerFoto('${esc(o.id)}',${i})">
          ${isVid?`<video src="${esc(f.url)}" style="width:100%;height:100%;object-fit:cover"></video>`:`<img src="${esc(f.url)}" loading="lazy">`}
          <button class="pt-foto-del" onclick="event.stopPropagation();ptDelFoto('${esc(o.id)}',${i})">×</button>
        </div>`;
      }).join('')}
      <label class="pt-foto-add" title="Tirar foto">
        <input type="file" accept="image/*,video/*" capture="environment" style="display:none"
          onchange="ptUploadFoto('${esc(o.id)}',this)">
        📷
      </label>
    </div>`;

  if (modo === 'cfg') {
    return `<div class="pt-os ${o.status}" id="pos-${esc(o.id)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div class="pt-os-num">OS ${esc(o.os)} · Cód. ${esc(o.cod)}</div>
          <div class="pt-os-desc">${esc(o.descricao||o.descricao||o.desc||'—')}</div>
          <div class="pt-os-meta">
            <span>HH: ${o.hh}h</span>
            <span>Duração: ${dur}h (${(o.equipe||[]).length||1} pessoa${(o.equipe||[]).length!==1?'s':''})</span>
          </div>
        </div>
        <span class="pt-badge ${badgeClass}">${statusLabel(o.status)}</span>
      </div>
      <!-- Alocação -->
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid #f0f0f0">
        <div class="pt-label" style="margin-bottom:6px">Equipe alocada</div>
        <div class="pt-chips">
          ${EQUIPE.map(e=>`<span class="pt-chip ${(o.equipe||[]).includes(e)?'sel':''}"
            onclick="ptToggleEquipeOS('${esc(o.id)}','${esc(e)}')">${esc(e)}</span>`).join('')}
        </div>
        <div style="margin-top:10px">
          <div class="pt-label" style="margin-bottom:6px">Recurso para iniciar</div>
          <div class="pt-chips">
            ${['Andaime','Munck','PTA','Guindaste'].map(r=>`
              <span class="pt-chip ${o.recurso===r?'rec':''}"
                onclick="ptToggleRecurso('${esc(o.id)}','${r}')">${r}</span>`).join('')}
          </div>
          ${o.recurso?`<div style="margin-top:8px;display:flex;align-items:center;gap:8px">
            <label class="pt-label" style="margin:0;white-space:nowrap">Tempo montagem:</label>
            <input class="pt-input" type="number" style="width:80px;padding:5px 8px"
              value="${o.recurso_dur||''}" placeholder="horas"
              onchange="ptSetRecursoDur('${esc(o.id)}',this.value)">
            <span style="font-size:11px;color:#6b7280">h</span>
          </div>`:''}
        </div>
        <div style="margin-top:10px">
          <div class="pt-label" style="margin-bottom:4px">HH (editável)</div>
          <div style="display:flex;align-items:center;gap:8px">
            <input class="pt-input" type="number" style="width:90px;padding:5px 8px"
              value="${o.hh}" placeholder="HH"
              onchange="ptSetHH('${esc(o.id)}',this.value)">
            <span style="font-size:10px;color:#9ca3af">Original: ${o.hh_orig||o.hh}h</span>
          </div>
        </div>
      </div>
      ${fotosHtml}
    </div>`;
  }

  // Modo situação
  const bloqInfo = o.status==='bloqueado' && o.recurso
    ? `<div class="pt-bloq-info">⚠ Aguardando ${esc(o.recurso)}${o.recurso_dur?` · ${o.recurso_dur}h montagem`:''}</div>`
    : '';

  const actions = {
    aguardando: `<button class="pt-btn pt-btn-blue" onclick="ptIniciar('${esc(o.id)}')">▶ Iniciar</button>`,
    bloqueado:  `<button class="pt-btn pt-btn-yellow" onclick="ptLiberarRecurso('${esc(o.id)}')">✓ ${esc(o.recurso||'Recurso')} liberado</button>`,
    andamento:  `<button class="pt-btn pt-btn-green" onclick="ptConcluir('${esc(o.id)}')">✓ Concluído</button>`,
    concluido:  `<span style="font-size:11px;color:#16a34a;font-weight:700">✓ ${fmtHora(o.fim_real)}</span>`,
  }[o.status]||'';

  return `<div class="pt-os ${o.status}" id="pos-${esc(o.id)}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
      <span class="pt-badge ${badgeClass}">${statusLabel(o.status)}</span>
      <span style="font-size:10px;color:#9ca3af">${pf?'Prev: '+fmtHora(pf):dur+'h prev.'}</span>
    </div>
    <div class="pt-os-num">OS ${esc(o.os)} · Cód. ${esc(o.cod)}</div>
    <div class="pt-os-desc">${esc(o.descricao||o.descricao||o.desc||'—')}</div>
    <div class="pt-os-meta">
      <span>👥 ${esc(eq)}</span>
      <span>⏱ ${dur}h</span>
      ${o.inicio_real?`<span>▶ ${fmtHora(o.inicio_real)}</span>`:''}
    </div>
    ${bloqInfo}
    <div class="pt-os-actions">
      ${actions}
      <button class="pt-btn pt-btn-ghost" onclick="ptAbrirDetalhes('${esc(o.id)}')">Detalhes</button>
    </div>
    ${fotosHtml}
  </div>`;
}

/* ── Bind ── */
function bind() {
  document.getElementById('pt-file-os')?.addEventListener('change', async e => {
    const f = e.target.files[0]; if(!f) return; e.target.value='';
    await importarOS(f);
  });
}

/* ── Funções globais ── */
window.ptAba = function(aba) { ABA=aba; render(); };

window.ptSalvarCfg = async function() {
  const db = getDB();
  const dados = {
    nome:        document.getElementById('cfg-nome')?.value.trim()||'Parada',
    inicio:      document.getElementById('cfg-inicio')?.value||null,
    fim_dias:    parseInt(document.getElementById('cfg-dias')?.value)||1,
    hora_inicio: document.getElementById('cfg-hora-ini')?.value||'07:00',
    hora_fim:    document.getElementById('cfg-hora-fim')?.value||'17:00',
    equipe:      EQUIPE,
  };
  if (CFG?.id) {
    await db.from('parada_turno_config').update(dados).eq('id',CFG.id);
    CFG = {...CFG,...dados};
  } else {
    const {data} = await db.from('parada_turno_config').insert(dados).select();
    CFG = data?.[0]||{...dados,id:Date.now()};
  }
  showToastMod('Configuração salva','ok');
  render();
};

window.ptAddEquipe = function() {
  const nome = prompt('Nome do colaborador:');
  if (!nome?.trim()) return;
  EQUIPE.push(nome.trim());
  salvarEquipe();
  render();
};

window.ptRemoverEquipe = function(i) {
  EQUIPE.splice(i,1);
  salvarEquipe();
  render();
};

async function salvarEquipe() {
  if (!CFG?.id) return;
  const db = getDB();
  await db.from('parada_turno_config').update({equipe:EQUIPE}).eq('id',CFG.id);
}

window.ptToggleEquipeOS = async function(id, nome) {
  const os = OS_LIST.find(o=>o.id===id); if(!os) return;
  const eq = os.equipe||[];
  const i  = eq.indexOf(nome);
  if (i>=0) eq.splice(i,1); else eq.push(nome);
  os.equipe=eq;
  await salvarOS(os);
  render();
};

window.ptToggleRecurso = async function(id, rec) {
  const os = OS_LIST.find(o=>o.id===id); if(!os) return;
  os.recurso = os.recurso===rec ? null : rec;
  if (!os.recurso) os.recurso_dur=null;
  if (os.status==='bloqueado') os.status='aguardando';
  await salvarOS(os);
  render();
};

window.ptSetRecursoDur = async function(id, val) {
  const os = OS_LIST.find(o=>o.id===id); if(!os) return;
  os.recurso_dur = parseFloat(val)||null;
  await salvarOS(os);
};

window.ptSetHH = async function(id, val) {
  const os = OS_LIST.find(o=>o.id===id); if(!os) return;
  os.hh = parseFloat(val)||os.hh_orig;
  await salvarOS(os);
  render();
};

window.ptIniciar = async function(id) {
  const os = OS_LIST.find(o=>o.id===id); if(!os) return;
  os.status='andamento'; os.inicio_real=agora();
  await salvarOS(os);
  render();
};

window.ptLiberarRecurso = async function(id) {
  const os = OS_LIST.find(o=>o.id===id); if(!os) return;
  os.status='andamento'; os.inicio_real=agora();
  await salvarOS(os);
  showToastMod(`${os.recurso||'Recurso'} liberado — serviço iniciado`,'ok');
  render();
};

window.ptConcluir = async function(id) {
  const os = OS_LIST.find(o=>o.id===id); if(!os) return;
  os.status='concluido'; os.fim_real=agora();
  // Próximo serviço da mesma equipe → aguardando ou bloqueado
  await salvarOS(os);
  showToastMod('Serviço concluído','ok');
  render();
};

window.ptAbrirDetalhes = function(id) {
  const os = OS_LIST.find(o=>o.id===id); if(!os) return;
  // Redireciona para aba config com destaque na OS
  ABA='cfg'; render();
  setTimeout(()=>{
    document.getElementById(`pos-${id}`)?.scrollIntoView({behavior:'smooth',block:'center'});
  },100);
};

/* ── Upload de foto ── */
window.ptUploadFoto = async function(id, input) {
  const file = input.files[0]; if(!file) return;
  const os = OS_LIST.find(o=>o.id===id); if(!os) return;
  showToastMod('Enviando foto…','info');
  try {
    const db  = getDB();
    const ext = file.name.split('.').pop().toLowerCase();
    const path= `turno/${id}/${Date.now()}.${ext}`;
    const {error} = await db.storage.from(BUCKET).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
    if (error) throw error;
    const {data:pub} = db.storage.from(BUCKET).getPublicUrl(path);
    if (!os.fotos) os.fotos=[];
    os.fotos.push({url:pub.publicUrl,path});
    await salvarOS(os);
    showToastMod('Foto enviada','ok');
    render();
  } catch(err) {
    showToastMod('Erro: '+err.message,'erro');
  }
  input.value='';
};

window.ptDelFoto = async function(id, idx) {
  const os = OS_LIST.find(o=>o.id===id); if(!os||!os.fotos) return;
  const foto = os.fotos[idx];
  if (foto?.path) { const db=getDB(); await db.storage.from(BUCKET).remove([foto.path]); }
  os.fotos.splice(idx,1);
  await salvarOS(os);
  render();
};

window.ptVerFoto = function(id, idx) {
  const os = OS_LIST.find(o=>o.id===id); if(!os) return;
  const f = os.fotos?.[idx]; if(!f) return;
  const isVid=/\.(mp4|mov|webm)$/i.test(f.url||'');
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:500;display:flex;align-items:center;justify-content:center';
  ov.onclick=()=>ov.remove();
  ov.innerHTML=isVid
    ?`<video src="${esc(f.url)}" controls style="max-width:95vw;max-height:95vh;border-radius:8px"></video>`
    :`<img src="${esc(f.url)}" style="max-width:95vw;max-height:95vh;border-radius:8px;object-fit:contain">`;
  document.body.appendChild(ov);
};

/* ── Importar OS ── */
async function importarOS(arquivo) {
  showToastMod('Lendo…','info');
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb = XLSX.read(e.target.result,{type:'binary'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws,{defval:''});
      if (!rows.length){showToastMod('Sem dados','erro');return;}
      const hdr=Object.keys(rows[0]);
      const ci=names=>{for(const n of names){const k=hdr.find(h=>String(h).trim().toLowerCase()===n.toLowerCase());if(k)return k;}return null;};
      const iOS  =ci(['O.S.','OS','os']);
      const iCod =ci(['Codigo Serviço','Código Serviço','Cod','cod_servico']);
      const iDesc=ci(['Descrição Serviço','Descricao Servico','Desc Servico','Descrição OS','desc_servico','desc_os']);
      const iHH  =ci(['Hh Prev. Serviço (Decimal)','Hh Prev. OS','HH','hh','hh_prev_servico']);
      const novos=[];
      rows.forEach(r=>{
        const os=String(r[iOS]||'').replace(/\D/g,'');
        if(!os||os.length<4)return;
        novos.push({
          os, cod:String(r[iCod]||'1').trim()||'1',
          descricao:String(r[iDesc]||'').trim(),
          hh:parseFloat(r[iHH])||0,
          hh_orig:parseFloat(r[iHH])||0,
          equipe:[], recurso:null, recurso_dur:null,
          status:'aguardando',
          inicio_real:null, fim_real:null, fotos:[],
          cfg_id:CFG?.id||null,
        });
      });
      if(!novos.length){showToastMod('Nenhuma OS válida','erro');return;}
      const db=getDB();
      const {data} = await db.from('parada_turno_os').insert(novos).select();
      (data||novos).forEach(o=>{
        if(!OS_LIST.find(x=>x.os===o.os&&x.cod===o.cod)) OS_LIST.push(o);
      });
      showToastMod(`${novos.length} OS importadas`,'ok');
      render();
    }catch(err){showToastMod('Erro: '+err.message,'erro');console.error(err);}
  };
  reader.readAsBinaryString(arquivo);
}

async function salvarOS(os) {
  const db = getDB();
  if (os.id && String(os.id).length > 5) {
    await db.from('parada_turno_os').update({
      hh:os.hh, equipe:os.equipe, recurso:os.recurso, recurso_dur:os.recurso_dur,
      status:os.status, inicio_real:os.inicio_real, fim_real:os.fim_real, fotos:os.fotos||[],
    }).eq('id',os.id);
  }
}

/* ── Toast ── */
function showToastMod(msg,tipo){
  if(window.showToast){window.showToast(msg,tipo);return;}
  const t=document.getElementById('toast');if(!t)return;
  t.className=tipo||'info';
  document.getElementById('toast-icon').className='ti '+(tipo==='ok'?'ti-check':tipo==='erro'?'ti-alert-circle':'ti-info-circle');
  document.getElementById('toast-msg').textContent=msg;
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500);
}

/* ── Carregar ── */
async function carregar() {
  const db = getDB();
  const [rCfg,rOS] = await Promise.all([
    db.from('parada_turno_config').select('*').order('id',{ascending:false}).limit(1),
    db.from('parada_turno_os').select('*').order('created_at',{ascending:true}),
  ]);
  CFG     = rCfg.data?.[0] || null;
  EQUIPE  = CFG?.equipe || [];
  OS_LIST = (rOS.data||[]).filter(o => !CFG || o.cfg_id===CFG.id);
  OS_LIST.forEach(o=>{
    if(!o.fotos) o.fotos=[];
    if(!o.equipe) o.equipe=[];
    if(!o.status) o.status='aguardando';
  });
}

/* ── Registro ── */
window.Modulos = window.Modulos || {};
window.Modulos['parada-turno'] = {
  async init(container) {
    _c = container;
    _c.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px;gap:10px;color:#9ca3af"><div class="loading-spinner"></div>Carregando…</div>`;
    await carregar();
    render();
  }
};

})();
