/* ═══════════════════════════════════════════════════
   MAN360 — Acompanhamento de Turno (Parada)
   modules/parada-turno.js
═══════════════════════════════════════════════════ */
(function () {
'use strict';

const BUCKET = 'os-fotos';

/* ── Estado global ── */
let CFG     = null;
let OS_LIST = [];
let EQUIPE  = [];
let ABA     = 'sit';
let _c      = null;

/* ── Helpers ── */
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtH = d => d ? new Date(d).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—';
const fmtD = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

function durH(o) {
  const hh = parseFloat(o.hh)||0;
  const qt = (o.equipe||[]).length||1;
  return Math.round((hh/qt)*10)/10;
}

function prevFim(o) {
  if (!o.inicio_real) return null;
  const d = new Date(o.inicio_real);
  d.setMinutes(d.getMinutes() + durH(o)*60);
  return fmtH(d.toISOString());
}

function statusLabel(s) {
  return {aguardando:'Aguardando',andamento:'Em andamento',
          bloqueado:'Bloqueado',concluido:'Concluído'}[s]||'Aguardando';
}

function findOS(id) {
  return OS_LIST.find(o => String(o.id) === String(id));
}

/* ── Render ── */
function render() {
  if (!_c) return;
  _c.innerHTML = buildCSS() + buildHTML();
  bindGlobal();
}

function buildCSS() {
  return `<style>
.pt{font-family:var(--font,'Sora',sans-serif);color:#1a1a1a;max-width:640px;margin:0 auto}
.pt-nav{display:flex;background:#1e1e1e;position:sticky;top:0;z-index:50}
.pt-tab{flex:1;padding:12px 4px;text-align:center;color:#9ca3af;font-size:10px;font-weight:700;
  text-transform:uppercase;letter-spacing:.06em;cursor:pointer;border:none;border-bottom:2px solid transparent;
  background:none;font-family:inherit}
.pt-tab.on{color:#F8C100;border-bottom-color:#F8C100}
.pt-sec{display:none;padding-bottom:80px}
.pt-sec.on{display:block}
.pt-hd{background:#F8C100;padding:14px 14px 10px}
.pt-hd-t{font-size:15px;font-weight:800;color:#1a1a1a}
.pt-hd-s{font-size:11px;color:rgba(0,0,0,.5);margin-top:2px}
.pt-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:10px 12px}
.pt-kpi{background:#fff;border-radius:10px;padding:10px 6px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.pt-kpi-v{font-size:22px;font-weight:800;line-height:1}
.pt-kpi-l{font-size:8px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-top:3px}
.va{color:#2563eb}.vb{color:#dc2626}.vc{color:#16a34a}.vd{color:#F8C100}
.pt-os{background:#fff;border-radius:12px;margin:6px 12px 0;padding:13px;
  box-shadow:0 1px 4px rgba(0,0,0,.08);border-left:4px solid #e4e4e7}
.pt-os.andamento{border-left-color:#2563eb}
.pt-os.bloqueado{border-left-color:#dc2626}
.pt-os.concluido{border-left-color:#16a34a}
.pt-os.aguardando{border-left-color:#fbbf24}
.pt-os-n{font-size:10px;color:#9ca3af;font-weight:700;margin-bottom:2px}
.pt-os-d{font-size:13px;font-weight:800;color:#1a1a1a;line-height:1.3;margin-bottom:5px}
.pt-os-m{font-size:11px;color:#6b7280;display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.pt-bdg{display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700}
.ba{background:#dbeafe;color:#1e3a8a}
.bb{background:#fee2e2;color:#991b1b}
.bc{background:#dcfce7;color:#14532d}
.bw{background:#fef3c7;color:#92400e}
.pt-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.pt-btn{height:34px;padding:0 14px;border:none;border-radius:8px;font-weight:700;font-size:12px;
  cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-family:inherit}
.btn-y{background:#F8C100;color:#1a1a1a}
.btn-g{background:#dcfce7;color:#14532d}
.btn-gh{background:#f4f4f5;color:#374151;border:1px solid #e4e4e7}
.btn-b{background:#dbeafe;color:#1e3a8a}
.pt-bloq{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fef3c7;
  border-radius:8px;font-size:11px;font-weight:600;color:#92400e;margin:4px 0}
.pt-card{background:#fff;border-radius:12px;margin:10px 12px 0;padding:13px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.pt-ct{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:10px}
.pt-chips{display:flex;flex-wrap:wrap;gap:5px}
.pt-chip{display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:20px;
  font-size:12px;font-weight:700;background:#f3f4f6;color:#374151;border:1.5px solid #e4e4e7;cursor:pointer;
  -webkit-tap-highlight-color:transparent}
.pt-chip.on{background:#F8C100;color:#1a1a1a;border-color:#F8C100}
.pt-chip.rec{background:#fef3c7;color:#92400e;border-color:#fbbf24}
.pt-chip.add{border-style:dashed;color:#9ca3af}
.pt-inp{width:100%;border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px;
  font-family:inherit;font-size:12px;background:#f9fafb;color:#374151;box-sizing:border-box}
.pt-inp:focus{outline:2px solid #F8C100;outline-offset:-1px;border-color:transparent}
.pt-lbl{font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;display:block}
.pt-fld{margin-bottom:12px}
.pt-r2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pt-sect{padding:10px 12px 4px;font-size:9px;font-weight:800;text-transform:uppercase;
  letter-spacing:.08em;color:#9ca3af}
.pt-fg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
.pt-ft{aspect-ratio:1;border-radius:8px;overflow:hidden;background:#f3f4f6;
  position:relative;cursor:pointer;border:1px solid #e4e4e7}
.pt-ft img,.pt-ft video{width:100%;height:100%;object-fit:cover}
.pt-fd{position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);border:none;
  border-radius:50%;width:20px;height:20px;color:#fff;font-size:12px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;padding:0}
.pt-fa{border:1.5px dashed #d1d5db;border-radius:8px;aspect-ratio:1;
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  background:#f9fafb;color:#9ca3af;font-size:22px;-webkit-tap-highlight-color:transparent}
.pt-sep{height:1px;background:#f0f0f0;margin:10px 0}
.prio-a{color:#dc2626;font-weight:700}
.prio-m{color:#d97706;font-weight:700}
.prio-b{color:#16a34a;font-weight:700}
</style>`;
}

function buildHTML() {
  const sorted = [...OS_LIST].sort((a,b)=>{
    const o={andamento:0,bloqueado:1,aguardando:2,concluido:3};
    return (o[a.status]??2)-(o[b.status]??2);
  });
  const total    = OS_LIST.length;
  const andando  = OS_LIST.filter(o=>o.status==='andamento').length;
  const bloq     = OS_LIST.filter(o=>o.status==='bloqueado').length;
  const conc     = OS_LIST.filter(o=>o.status==='concluido').length;
  const ader     = total ? Math.round(conc/total*100) : 0;

  const nomePar  = CFG?.nome || 'Parada';
  const subPar   = CFG ? `Início: ${fmtD(CFG.inicio)} · ${CFG.hora_inicio||'07:00'} → ${CFG.hora_fim||'17:00'}` : 'Configure a parada';

  return `<div class="pt">
  <div class="pt-nav">
    <button class="pt-tab ${ABA==='sit'?'on':''}" onclick="ptAba('sit')">Situação</button>
    <button class="pt-tab ${ABA==='cfg'?'on':''}" onclick="ptAba('cfg')">Configuração</button>
  </div>

  <!-- SITUAÇÃO -->
  <div class="pt-sec ${ABA==='sit'?'on':''}" id="pt-sit">
    <div class="pt-hd">
      <div class="pt-hd-t">${esc(nomePar)}</div>
      <div class="pt-hd-s">${esc(subPar)}</div>
    </div>
    <div class="pt-kpis">
      <div class="pt-kpi"><div class="pt-kpi-v va">${andando}</div><div class="pt-kpi-l">Andamento</div></div>
      <div class="pt-kpi"><div class="pt-kpi-v vb">${bloq}</div><div class="pt-kpi-l">Falta Recurso</div></div>
      <div class="pt-kpi"><div class="pt-kpi-v vc">${conc}</div><div class="pt-kpi-l">Concluído</div></div>
      <div class="pt-kpi"><div class="pt-kpi-v vd">${ader}%</div><div class="pt-kpi-l">Ader. Proj.</div></div>
    </div>
    ${sorted.length ? sorted.map(o=>cardSit(o)).join('') : `
      <div style="text-align:center;padding:40px 20px;color:#9ca3af">
        <div style="font-size:32px;margin-bottom:8px">📋</div>
        <div style="font-size:13px;font-weight:700;color:#374151">Sem serviços</div>
        <div style="font-size:11px;margin-top:4px">Importe OS na aba Configuração</div>
      </div>`}
  </div>

  <!-- CONFIGURAÇÃO -->
  <div class="pt-sec ${ABA==='cfg'?'on':''}" id="pt-cfg">
    <div class="pt-hd">
      <div class="pt-hd-t">Configuração</div>
      <div class="pt-hd-s">Parada, equipe e serviços</div>
    </div>

    <div class="pt-card">
      <div class="pt-ct">Dados da Parada</div>
      <div class="pt-fld">
        <label class="pt-lbl">Nome da parada</label>
        <input class="pt-inp" id="cfg-nome" value="${esc(CFG?.nome||'')}" placeholder="Ex: Parada Geral">
      </div>
      <div class="pt-r2">
        <div class="pt-fld">
          <label class="pt-lbl">Início efetivo</label>
          <input class="pt-inp" type="datetime-local" id="cfg-inicio" value="${CFG?.inicio||''}">
        </div>
        <div class="pt-fld">
          <label class="pt-lbl">Duração (dias)</label>
          <input class="pt-inp" type="number" id="cfg-dias" min="1" value="${CFG?.fim_dias||1}">
        </div>
      </div>
      <div class="pt-r2">
        <div class="pt-fld">
          <label class="pt-lbl">Início turno</label>
          <input class="pt-inp" type="time" id="cfg-hi" value="${CFG?.hora_inicio||'07:00'}">
        </div>
        <div class="pt-fld">
          <label class="pt-lbl">Fim turno</label>
          <input class="pt-inp" type="time" id="cfg-hf" value="${CFG?.hora_fim||'17:00'}">
        </div>
      </div>
      <button class="pt-btn btn-y" style="width:100%;justify-content:center" onclick="ptSalvarCfg()">
        Salvar configuração
      </button>
    </div>

    <div class="pt-card">
      <div class="pt-ct">Equipe Disponível no Turno</div>
      <div class="pt-chips" id="cfg-eq">
        ${EQUIPE.map((e,i)=>`<span class="pt-chip on" onclick="ptRmEq(${i})">${esc(e)} ✕</span>`).join('')}
        <span class="pt-chip add" onclick="ptAddEq()">+ Adicionar</span>
      </div>
    </div>

    <div style="padding:0 12px;margin-top:10px">
      <button class="pt-btn btn-y" style="width:100%;justify-content:center"
        onclick="document.getElementById('pt-file-os').click()">
        📥 Importar OS (.xlsx)
      </button>
    </div>
    <input type="file" id="pt-file-os" accept=".xlsx,.xls" style="display:none" onchange="ptImport(this)">

    ${OS_LIST.length ? `
      <div class="pt-sect">${OS_LIST.length} serviços importados</div>
      ${OS_LIST.map(o=>cardCfg(o)).join('')}
    ` : `<div style="text-align:center;padding:24px;color:#9ca3af;font-size:11px">Nenhuma OS importada</div>`}
  </div>
</div>`;
}

/* ── Card Situação ── */
function cardSit(o) {
  const id   = String(o.id);
  const dur  = durH(o);
  const pf   = prevFim(o);
  const eq   = (o.equipe||[]).join(', ') || 'Sem equipe';
  const fotos = o.fotos||[];

  const bCls = {andamento:'ba',bloqueado:'bb',concluido:'bc',aguardando:'bw'}[o.status]||'bw';
  const oCls = o.status||'aguardando';

  const prioCls = o.prioridade==='Alta'?'prio-a':o.prioridade==='Média'?'prio-m':o.prioridade==='Baixa'?'prio-b':'';

  let bloqHtml = '';
  if (o.status==='bloqueado' && o.recurso) {
    bloqHtml = `<div class="pt-bloq">⚠ Aguardando ${o.recurso}${o.recurso_dur?' · '+o.recurso_dur+'h montagem':''}</div>`;
  }

  let actHtml = '';
  if (o.status==='aguardando') {
    actHtml = `<button class="pt-btn btn-b" onclick="ptIniciar('${id}')">▶ Iniciar</button>`;
  } else if (o.status==='bloqueado') {
    actHtml = `<button class="pt-btn btn-y" onclick="ptLiberar('${id}')">✓ ${o.recurso||'Recurso'} liberado</button>`;
  } else if (o.status==='andamento') {
    actHtml = `<button class="pt-btn btn-g" onclick="ptConcluir('${id}')">✓ Concluído</button>`;
  } else if (o.status==='concluido') {
    actHtml = `<span style="font-size:11px;color:#16a34a;font-weight:700">✓ Concluído ${fmtH(o.fim_real)}</span>`;
  }

  const fotosHtml = buildFotosHtml(o);

  return `<div class="pt-os ${oCls}">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
    <span class="pt-bdg ${bCls}">${statusLabel(o.status)}</span>
    <span style="font-size:10px;color:#9ca3af">${pf?'Prev: '+pf:dur+'h prev.'}</span>
  </div>
  <div class="pt-os-n">OS ${esc(o.os)} · Cód. ${esc(o.cod)}</div>
  <div class="pt-os-d">${esc(o.descricao||'—')}</div>
  <div class="pt-os-m">
    ${o.modalidade?`<span>🔧 ${esc(o.modalidade)}</span>`:''}
    ${o.prioridade?`<span class="${prioCls}">${esc(o.prioridade)}</span>`:''}
    <span>👥 ${esc(eq)}</span>
    <span>⏱ ${dur}h</span>
    ${o.inicio_real?`<span>▶ ${fmtH(o.inicio_real)}</span>`:''}
  </div>
  ${bloqHtml}
  <div class="pt-acts">
    ${actHtml}
    <button class="pt-btn btn-gh" onclick="ptVerDetalhes('${id}')">Detalhes</button>
  </div>
  ${fotosHtml}
</div>`;
}

/* ── Card Configuração ── */
function cardCfg(o) {
  const id  = String(o.id);
  const dur = durH(o);
  const fotos = o.fotos||[];
  const bCls = {andamento:'ba',bloqueado:'bb',concluido:'bc',aguardando:'bw'}[o.status]||'bw';
  const oCls = o.status||'aguardando';
  const prioCls = o.prioridade==='Alta'?'prio-a':o.prioridade==='Média'?'prio-m':o.prioridade==='Baixa'?'prio-b':'';

  // Chips de equipe — cada pessoa tem onclick com id e nome escapado por atributo data
  const eqChips = EQUIPE.map((e,i) => {
    const sel = (o.equipe||[]).includes(e);
    return `<span class="pt-chip ${sel?'on':''} pt-eq-chip"
      data-osid="${id}" data-nome="${esc(e)}">${esc(e)}</span>`;
  }).join('');

  // Chips de recurso
  const recChips = ['Andaime','Munck','PTA','Guindaste'].map(r => {
    const sel = o.recurso===r;
    return `<span class="pt-chip ${sel?'rec':''} pt-rec-chip"
      data-osid="${id}" data-rec="${r}">${r}</span>`;
  }).join('');

  const durInfo = `${dur}h (${(o.equipe||[]).length||1} pessoa${(o.equipe||[]).length!==1?'s':''})`;

  const fotosHtml = buildFotosHtml(o);

  return `<div class="pt-os ${oCls}" id="pos-${id}">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
    <div>
      <div class="pt-os-n">OS ${esc(o.os)} · Cód. ${esc(o.cod)}</div>
      <div class="pt-os-d">${esc(o.descricao||'—')}</div>
      <div class="pt-os-m">
        ${o.modalidade?`<span>🔧 ${esc(o.modalidade)}</span>`:''}
        ${o.prioridade?`<span class="${prioCls}">${esc(o.prioridade)}</span>`:''}
        <span>HH: ${o.hh}h · ${durInfo}</span>
      </div>
    </div>
    <span class="pt-bdg ${bCls}">${statusLabel(o.status)}</span>
  </div>
  <div class="pt-sep"></div>

  <div class="pt-lbl" style="margin-bottom:6px">Equipe alocada neste serviço</div>
  <div class="pt-chips">${eqChips.length ? eqChips : '<span style="font-size:11px;color:#9ca3af">Adicione pessoas na equipe acima</span>'}</div>

  <div class="pt-sep"></div>

  <div class="pt-lbl" style="margin-bottom:6px">Recurso necessário para iniciar</div>
  <div class="pt-chips">${recChips}</div>
  ${o.recurso ? `
  <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
    <label class="pt-lbl" style="margin:0;white-space:nowrap">Tempo de montagem:</label>
    <input class="pt-inp" type="number" style="width:80px;padding:5px 8px"
      value="${o.recurso_dur||''}" placeholder="h"
      data-osid="${id}"
      onchange="ptSetDur(this)">
    <span style="font-size:11px;color:#6b7280">horas</span>
  </div>` : ''}

  <div class="pt-sep"></div>

  <div class="pt-lbl" style="margin-bottom:4px">HH (editável)</div>
  <div style="display:flex;align-items:center;gap:8px">
    <input class="pt-inp" type="number" style="width:90px;padding:5px 8px"
      value="${o.hh}" placeholder="HH"
      data-osid="${id}"
      onchange="ptSetHH(this)">
    <span style="font-size:10px;color:#9ca3af">Original: ${o.hh_orig||o.hh}h</span>
  </div>

  ${fotosHtml}
</div>`;
}

/* ── HTML de fotos ── */
function buildFotosHtml(o) {
  const id = String(o.id);
  const fotos = o.fotos||[];
  const thumbs = fotos.slice(0,7).map((f,i) => {
    const isVid = /\.(mp4|mov|webm)$/i.test(f.url||'');
    return `<div class="pt-ft" onclick="ptVerFoto('${id}',${i})">
      ${isVid
        ? `<video src="${esc(f.url)}" style="width:100%;height:100%;object-fit:cover"></video>`
        : `<img src="${esc(f.url)}" loading="lazy">`}
      <button class="pt-fd" onclick="event.stopPropagation();ptDelFoto('${id}',${i})">×</button>
    </div>`;
  }).join('');

  return `<div class="pt-fg" style="margin-top:10px">
    ${thumbs}
    <div class="pt-fa" onclick="document.getElementById('pf-${id}').click()">
      <input type="file" id="pf-${id}" accept="image/*,video/*"
        capture="environment" style="display:none"
        data-osid="${id}" onchange="ptUpload(this)">
      📷
    </div>
  </div>`;
}

/* ── Bind global — event delegation ── */
function bindGlobal() {
  // Usa event delegation no container para capturar cliques
  // nos chips de equipe e recurso sem depender de onclick inline
  if (!_c) return;

  _c.addEventListener('click', async function handler(e) {
    // Chip de equipe
    const eqEl = e.target.closest('.pt-eq-chip');
    if (eqEl) {
      e.stopPropagation();
      const id   = eqEl.dataset.osid;
      const nome = eqEl.dataset.nome;
      const os   = findOS(id); if (!os) return;
      if (!Array.isArray(os.equipe)) os.equipe = [];
      const i = os.equipe.indexOf(nome);
      if (i >= 0) os.equipe.splice(i, 1); else os.equipe.push(nome);
      eqEl.classList.toggle('on', os.equipe.includes(nome));
      await salvarOS(os);
      // Atualiza duracao no card sem re-render
      const card = document.getElementById('pos-'+id);
      if (card) {
        const dur = durH(os);
        const qt = os.equipe.length||1;
        const meta = card.querySelector('.pt-os-m');
        if (meta) {
          const spans = meta.querySelectorAll('span');
          spans.forEach(s => {
            if (s.textContent.includes('HH:')) {
              s.textContent = `HH: ${os.hh}h · ${dur}h (${qt} pessoa${qt!==1?'s':''})`;
            }
          });
        }
      }
      return;
    }

    // Chip de recurso
    const recEl = e.target.closest('.pt-rec-chip');
    if (recEl) {
      e.stopPropagation();
      const id  = recEl.dataset.osid;
      const rec = recEl.dataset.rec;
      const os  = findOS(id); if (!os) return;
      os.recurso = (os.recurso === rec) ? null : rec;
      if (!os.recurso) os.recurso_dur = null;
      await salvarOS(os);
      // Re-render só o card afetado
      const card = document.getElementById('pos-'+id);
      if (card) card.outerHTML = cardCfg(os);
      return;
    }
  }, false);
}

/* ══ FUNÇÕES GLOBAIS ══════════════════════════════ */
window.ptAba = function(aba) { ABA=aba; render(); };

window.ptSalvarCfg = async function() {
  const db = getDB();
  const dados = {
    nome:        document.getElementById('cfg-nome')?.value.trim()||'Parada',
    inicio:      document.getElementById('cfg-inicio')?.value||null,
    fim_dias:    parseInt(document.getElementById('cfg-dias')?.value)||1,
    hora_inicio: document.getElementById('cfg-hi')?.value||'07:00',
    hora_fim:    document.getElementById('cfg-hf')?.value||'17:00',
    equipe:      EQUIPE,
  };
  if (CFG?.id) {
    await db.from('parada_turno_config').update(dados).eq('id', CFG.id);
    CFG = {...CFG, ...dados};
  } else {
    const {data} = await db.from('parada_turno_config').insert(dados).select();
    CFG = data?.[0] || {...dados, id: Date.now()};
  }
  toast('Configuração salva','ok');
  render();
};

window.ptAddEq = function() {
  const n = prompt('Nome do colaborador:');
  if (!n?.trim()) return;
  EQUIPE.push(n.trim());
  salvarEquipe();
  render();
};

window.ptRmEq = function(i) {
  EQUIPE.splice(i, 1);
  salvarEquipe();
  render();
};

async function salvarEquipe() {
  if (!CFG?.id) return;
  await getDB().from('parada_turno_config').update({equipe:EQUIPE}).eq('id', CFG.id);
}

/* ptTogEq e ptTogRec tratados por event delegation em bindGlobal */

window.ptSetDur = async function(el) {
  const id = el.dataset.osid;
  const os = findOS(id); if (!os) return;
  os.recurso_dur = parseFloat(el.value)||null;
  await salvarOS(os);
};

window.ptSetHH = async function(el) {
  const id = el.dataset.osid;
  const os = findOS(id); if (!os) return;
  os.hh = parseFloat(el.value)||os.hh_orig||0;
  await salvarOS(os);
};

/* Situação: Iniciar */
window.ptIniciar = async function(id) {
  const os = findOS(id); if (!os) { console.error('ptIniciar: OS não encontrada', id); return; }
  if (os.recurso) {
    os.status = 'bloqueado';
  } else {
    os.status = 'andamento';
    os.inicio_real = new Date().toISOString();
  }
  await salvarOS(os);
  render();
};

/* Situação: Liberar recurso → inicia */
window.ptLiberar = async function(id) {
  const os = findOS(id); if (!os) return;
  os.status = 'andamento';
  os.inicio_real = new Date().toISOString();
  await salvarOS(os);
  toast(os.recurso+' liberado — serviço iniciado','ok');
  render();
};

/* Situação: Concluir */
window.ptConcluir = async function(id) {
  const os = findOS(id); if (!os) return;
  os.status = 'concluido';
  os.fim_real = new Date().toISOString();
  await salvarOS(os);
  toast('Serviço concluído ✓','ok');
  render();
};

/* Situação: Ver detalhes → vai para config na OS */
window.ptVerDetalhes = function(id) {
  ABA = 'cfg';
  render();
  setTimeout(() => {
    const el = document.getElementById('pos-'+id);
    el?.scrollIntoView({behavior:'smooth', block:'center'});
    if (el) { el.style.outline='3px solid #F8C100'; setTimeout(()=>el.style.outline='',1500); }
  }, 100);
};

/* Upload de foto */
window.ptUpload = async function(input) {
  const id   = input.dataset.osid;
  const file = input.files[0]; if (!file) return;
  const os   = findOS(id); if (!os) return;
  toast('Enviando foto…','info');
  try {
    const db  = getDB();
    const ext = (file.name.split('.').pop()||'jpg').toLowerCase();
    const path= `turno/${id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const {error} = await db.storage.from(BUCKET).upload(path, file, {
      cacheControl:'3600', upsert:true, contentType:file.type
    });
    if (error) throw error;
    const {data:pub} = db.storage.from(BUCKET).getPublicUrl(path);
    if (!Array.isArray(os.fotos)) os.fotos=[];
    os.fotos.push({url:pub.publicUrl, path});
    await salvarOS(os);
    toast('Foto enviada ✓','ok');
    render();
  } catch(err) {
    toast('Erro no upload: '+err.message,'erro');
    console.error(err);
  }
  input.value='';
};

window.ptDelFoto = async function(id, idx) {
  const os = findOS(id); if (!os||!os.fotos) return;
  const f  = os.fotos[idx];
  if (f?.path) await getDB().storage.from(BUCKET).remove([f.path]);
  os.fotos.splice(idx,1);
  await salvarOS(os);
  render();
};

window.ptVerFoto = function(id, idx) {
  const os = findOS(id); if (!os) return;
  const f  = os.fotos?.[idx]; if (!f) return;
  const isVid = /\.(mp4|mov|webm)$/i.test(f.url||'');
  const ov = document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:500;display:flex;align-items:center;justify-content:center;cursor:pointer';
  ov.onclick = ()=>ov.remove();
  ov.innerHTML = isVid
    ? `<video src="${esc(f.url)}" controls style="max-width:96vw;max-height:96vh;border-radius:8px"></video>`
    : `<img src="${esc(f.url)}" style="max-width:96vw;max-height:96vh;border-radius:8px;object-fit:contain">`;
  document.body.appendChild(ov);
};

/* Importar OS */
window.ptImport = async function(input) {
  const file = input.files[0]; if (!file) return;
  input.value='';
  toast('Lendo planilha…','info');
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb   = XLSX.read(e.target.result,{type:'binary'});
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws,{defval:''});
      if (!rows.length){toast('Sem dados','erro');return;}

      const hdr = Object.keys(rows[0]);
      const ci  = names => {
        for (const n of names) {
          const k = hdr.find(h=>String(h).trim().toLowerCase()===n.toLowerCase());
          if (k) return k;
        }
        return null;
      };

      const iOS   = ci(['Ordem de Serviço','O.S.','OS','os']);
      const iDesc = ci(['Descrição Serviço','Descricao Servico','Descrição OS','desc_servico','desc_os']);
      const iHH   = ci(['Hh Prev','Hh Prev. Serviço (Decimal)','Hh Prev. OS','HH','hh']);
      const iMod  = ci(['Modalide','Modalidade','Equipe','equipe']);
      const iPrio = ci(['Prioridade','prioridade']);

      const osCont = {};
      const novos  = [];
      rows.forEach(r => {
        const desc = String(r[iDesc]||'').trim();
        const osRaw= r[iOS];
        const osN  = osRaw ? String(osRaw).replace(/\D/g,'') : '';
        if (!osN && !desc) return;
        const os   = osN || ('SN-'+(novos.length+1));
        osCont[os] = (osCont[os]||0)+1;
        const hh   = parseFloat(r[iHH])||0;
        const prio = String(r[iPrio]||'').trim();
        const prioN= prio.toLowerCase()==='alta'?'Alta':
                     prio.toLowerCase()==='média'||prio.toLowerCase()==='media'?'Média':
                     prio.toLowerCase()==='baixa'?'Baixa':'';
        novos.push({
          os, cod:String(osCont[os]),
          descricao: desc,
          hh, hh_orig: hh,
          modalidade: String(r[iMod]||'').trim(),
          prioridade: prioN,
          equipe:[], recurso:null, recurso_dur:null,
          status:'aguardando',
          inicio_real:null, fim_real:null, fotos:[],
          cfg_id: CFG?.id||null,
        });
      });

      if (!novos.length){toast('Nenhuma OS válida','erro');return;}
      toast(`Salvando ${novos.length} OS…`,'info');

      const db = getDB();
      const {data, error} = await db.from('parada_turno_os').insert(novos).select();
      if (error) throw error;
      (data||novos).forEach(o=>{
        o.id    = String(o.id||Date.now()+Math.random());
        o.fotos = Array.isArray(o.fotos)?o.fotos:[];
        o.equipe= Array.isArray(o.equipe)?o.equipe:[];
        if (!OS_LIST.find(x=>x.os===o.os&&x.cod===o.cod)) OS_LIST.push(o);
      });
      toast(`${novos.length} OS importadas ✓`,'ok');
      render();
    } catch(err) {
      toast('Erro: '+err.message,'erro');
      console.error(err);
    }
  };
  reader.readAsBinaryString(file);
};

/* ── Salvar OS no banco ── */
async function salvarOS(os) {
  const db   = getDB();
  const numId= parseInt(os.id);
  if (isNaN(numId)) return;
  const {error} = await db.from('parada_turno_os').update({
    hh:         os.hh,
    equipe:     os.equipe||[],
    recurso:    os.recurso||null,
    recurso_dur:os.recurso_dur||null,
    status:     os.status||'aguardando',
    inicio_real:os.inicio_real||null,
    fim_real:   os.fim_real||null,
    fotos:      os.fotos||[],
    modalidade: os.modalidade||null,
    prioridade: os.prioridade||null,
  }).eq('id', numId);
  if (error) console.error('salvarOS:', error.message);
}

/* ── Toast ── */
function toast(msg, tipo) {
  if (window.showToast) { window.showToast(msg, tipo); return; }
  const t=document.getElementById('toast'); if(!t) return;
  t.className=tipo||'info';
  document.getElementById('toast-icon').className='ti '+(tipo==='ok'?'ti-check':tipo==='erro'?'ti-alert-circle':'ti-info-circle');
  document.getElementById('toast-msg').textContent=msg;
  t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000);
}

/* ── Carregar dados ── */
async function carregar() {
  const db = getDB();
  const [rC,rO] = await Promise.all([
    db.from('parada_turno_config').select('*').order('id',{ascending:false}).limit(1),
    db.from('parada_turno_os').select('*').order('created_at',{ascending:true}),
  ]);
  CFG    = rC.data?.[0]||null;
  EQUIPE = Array.isArray(CFG?.equipe) ? CFG.equipe : [];
  OS_LIST= (rO.data||[]).filter(o=>!CFG||String(o.cfg_id)===String(CFG.id));
  OS_LIST.forEach(o=>{
    o.id    = String(o.id);
    o.fotos = Array.isArray(o.fotos)?o.fotos:[];
    o.equipe= Array.isArray(o.equipe)?o.equipe:[];
    o.status= o.status||'aguardando';
  });
}

/* ── Registro ── */
window.Modulos=window.Modulos||{};
window.Modulos['parada-turno']={
  async init(container){
    _c=container;
    _c.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:200px;gap:10px;color:#9ca3af"><div class="loading-spinner"></div>Carregando…</div>`;
    await carregar();
    render();
  }
};

})();
