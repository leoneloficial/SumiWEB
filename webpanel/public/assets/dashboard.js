const $ = (id) => document.getElementById(id);

const slogan = $('slogan');
const btnLogout = $('btnLogout');

const kpiGlobal = $('kpiGlobal');
const kpiMine = $('kpiMine');

const subbotBadge = $('subbotBadge');
const subbotSub = $('subbotSub');

const bannerImg = $('bannerImg');
const profileName = $('profileName');
const profileMeta = $('profileMeta');
const profileHint = $('profileHint');

const btnLink = $('btnLink');
const btnCustomize = $('btnCustomize');
const btnManage = $('btnManage');

const modals = {
  modalLink: $('modalLink'),
  modalCustomize: $('modalCustomize'),
  modalManage: $('modalManage')
};

function openModal(id){ modals[id].classList.add('open'); }
function closeModal(id){ modals[id].classList.remove('open'); }

document.querySelectorAll('[data-close]').forEach((b)=>{
  b.addEventListener('click', ()=> closeModal(b.dataset.close));
});

Object.values(modals).forEach((m)=>{
  m.addEventListener('click', (e)=>{
    if(e.target === m) m.classList.remove('open');
  });
});

async function api(url, options={}){
  const r = await fetch(url, options);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await r.json() : null;
  if(!r.ok){
    const msg = data?.error || r.statusText || 'Error';
    throw new Error(msg);
  }
  return data;
}

function setBadge(text, kind=''){
  subbotBadge.textContent = text;
  subbotBadge.classList.remove('green');
  if(kind==='green') subbotBadge.classList.add('green');
}

let me = null;
let subbot = null;
let pairingInterval = null;

async function loadAll(){
  me = await api('/api/me');
  slogan.textContent = `👋 Hola, ${me.user.username} · WA: ${me.user.waNumber}`;

  const stats = await api('/api/stats');
  kpiGlobal.textContent = (stats.globalSubbotsOnline ?? 0).toString();

  await loadSubbot();
}

async function loadSubbot(){
  const r = await api('/api/subbot');
  subbot = r;

  const connected = !!r.connected;
  const sessionExists = !!r.sessionExists;

  subbotSub.textContent = `ID: ${r.id} · Carpeta: ${sessionExists ? 'OK' : '—'}`;
  kpiMine.textContent = connected ? 'ONLINE' : (sessionExists ? 'OFFLINE' : 'SIN SESIÓN');

  if(connected){
    setBadge('ONLINE', 'green');
  }else{
    setBadge('OFFLINE');
  }

  const info = r.info || {};
  profileName.textContent = info.name || '—';
  profileMeta.textContent = info.owner ? `Owner: ${info.owner}` : `Subbot: ${r.id}`;

  if(info.bannerUrl){
    bannerImg.src = info.bannerUrl;
    bannerImg.style.display = 'block';
  }else{
    bannerImg.removeAttribute('src');
    bannerImg.style.display = 'none';
  }

  btnCustomize.disabled = false;
  btnManage.disabled = !connected;
  profileHint.style.display = connected ? 'none' : 'block';

  try{
    const nameInp = customForm.querySelector('input[name="name"]');
    if(nameInp) nameInp.value = info.name || '';
    const pfxInp = customForm.querySelector('input[name="prefix"]');
    if(pfxInp) pfxInp.value = (r.prefix || '').toString();
  }catch{}
}

btnLogout.addEventListener('click', async ()=>{
  try{
    await api('/api/auth/logout',{method:'POST'});
  }finally{
    location.href='/login';
  }
});

btnLink.addEventListener('click', ()=>{
  openModal('modalLink');
});
btnCustomize.addEventListener('click', ()=>{
  openModal('modalCustomize');
});
btnManage.addEventListener('click', async ()=>{
  openModal('modalManage');
  await loadGroups();
});

// Pairing
const pairArea = $('pairArea');
const btnModeQr = $('btnModeQr');
const btnModeCode = $('btnModeCode');

function stopPairingPoll(){
  if(pairingInterval) clearInterval(pairingInterval);
  pairingInterval = null;
}

async function pollAfterPairing(){
  stopPairingPoll();
  pairingInterval = setInterval(async ()=>{
    try{
      await loadSubbot();
      if(subbot?.connected){
        stopPairingPoll();
        closeModal('modalLink');
      }
    }catch{}
  }, 2500);
}

btnModeQr.addEventListener('click', async ()=>{
  pairArea.innerHTML = `<div class="note">Generando QR…</div>`;
  try{
    const r = await api('/api/subbot/pair/qr',{method:'POST'});
    if(!r.qrDataUrl){
      pairArea.innerHTML = `<div class="note">Esperando QR… intenta de nuevo.</div>`;
      return;
    }
    pairArea.innerHTML = `
      <div class="qr-wrap">
        <img class="qr" src="${r.qrDataUrl}" alt="qr" />
        <div class="note">Escanea y espera a que se conecte.</div>
        <button class="btn" id="btnRefreshQr"><i class="fa-solid fa-rotate"></i> Refrescar</button>
      </div>
    `;
    document.getElementById('btnRefreshQr').addEventListener('click', ()=> btnModeQr.click());
    pollAfterPairing();
  }catch(err){
    pairArea.innerHTML = `<div class="note">Error: ${err.message}</div>`;
  }
});

btnModeCode.addEventListener('click', async ()=>{
  pairArea.innerHTML = `<div class="note">Generando código…</div>`;
  try{
    const r = await api('/api/subbot/pair/code',{method:'POST'});
    const rawForCopy = (r.codeRaw || r.code || '').toString();
    pairArea.innerHTML = `
      <div class="code-wrap">
        <div class="code">${r.code}</div>
        <div class="note">${r.note || 'WhatsApp → Dispositivos vinculados → Vincular con número.'}</div>
        <div class="note">Si te sale <b>"código inválido"</b>, prueba pegarlo <b>sin guiones</b>: <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; opacity:.95">${rawForCopy}</span></div>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="btnCopyCode"><i class="fa-solid fa-copy"></i> Copiar</button>
          <button class="btn" id="btnRegenCode"><i class="fa-solid fa-rotate"></i> Nuevo</button>
        </div>
      </div>
    `;
    document.getElementById('btnCopyCode').addEventListener('click', async ()=>{
      try{ await navigator.clipboard.writeText(rawForCopy); }catch{}
    });
    document.getElementById('btnRegenCode').addEventListener('click', ()=> btnModeCode.click());
    pollAfterPairing();
  }catch(err){
    pairArea.innerHTML = `<div class="note">Error: ${err.message}</div>`;
  }
});

// Customize
const customAlert = $('customAlert');
const customForm = $('customForm');
const btnSaveName = $('btnSaveName');
const btnSaveBanner = $('btnSaveBanner');
const btnSavePrefix = $('btnSavePrefix');

function showCustom(msg, ok=false){
  customAlert.style.display = 'block';
  customAlert.style.borderColor = ok ? 'rgba(22,163,74,.45)' : 'rgba(220,38,38,.35)';
  customAlert.textContent = msg;
}

btnSaveName.addEventListener('click', async ()=>{
  customAlert.style.display='none';
  const fd = new FormData(customForm);
  const name = (fd.get('name')||'').toString().trim();
  if(!name) return showCustom('Escribe un nombre.');

  try{
    await api('/api/subbot/profile/name',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name })
    });
    showCustom('Nombre actualizado ✅', true);
    await loadSubbot();
  }catch(err){
    showCustom(err.message || 'Error');
  }
});

btnSaveBanner.addEventListener('click', async ()=>{
  customAlert.style.display='none';
  const fd = new FormData(customForm);
  const file = fd.get('banner');
  if(!file || !file.size) return showCustom('Selecciona una imagen.');

  const up = new FormData();
  up.append('banner', file);

  try{
    await api('/api/subbot/profile/banner',{
      method:'POST',
      body: up
    });
    showCustom('Banner actualizado ✅', true);
    await loadSubbot();
  }catch(err){
    showCustom(err.message || 'Error');
  }
});

btnSavePrefix.addEventListener('click', async ()=>{
  customAlert.style.display='none';
  const fd = new FormData(customForm);
  const prefix = (fd.get('prefix')||'').toString().trim();
  if(!prefix) return showCustom('Escribe un prefijo (o usa "default" para resetear).');

  try{
    await api('/api/subbot/prefix',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prefix })
    });
    showCustom('Prefijo actualizado ✅', true);
    await loadSubbot();
  }catch(err){
    showCustom(err.message || 'Error');
  }
});

const groupsBody = $('groupsBody');
const manageAlert = $('manageAlert');
const msgGroupSelect = $('msgGroupSelect');
const welcomeTpl = $('welcomeTpl');
const byeTpl = $('byeTpl');
const saveMsgsBtn = $('saveMsgsBtn');
const resetMsgsBtn = $('resetMsgsBtn');

// Primary UI
const primaryGroupSelect = $('primaryGroupSelect');
const primaryBotSelect = $('primaryBotSelect');
const setPrimaryBtn = $('setPrimaryBtn');
const clearPrimaryBtn = $('clearPrimaryBtn');
const primaryHint = $('primaryHint');

let _groupsCache = [];


function showManage(msg, ok=false){
  manageAlert.style.display = 'block';
  manageAlert.style.borderColor = ok ? 'rgba(22,163,74,.45)' : 'rgba(220,38,38,.35)';
  manageAlert.textContent = msg;
}

async function loadGroupMessages(groupId){
  try{
    const r = await api(`/api/subbot/groups/messages?groupId=${encodeURIComponent(groupId)}`);
    welcomeTpl.value = (r.welcomeText || '').toString();
    byeTpl.value = (r.byeText || '').toString();
  }catch(err){
    showManage(err.message || 'Error');
  }
}

function getSelectedGroup(){
  const id = (msgGroupSelect?.value || '').toString();
  if(!id) return null;
  return _groupsCache.find(g=>g.id===id) || null;
}

function getSelectedPrimaryGroup(){
  const id = (primaryGroupSelect?.value || '').toString();
  if(!id) return null;
  return _groupsCache.find(g=>g.id===id) || null;
}

function syncPrimaryEditorState(){
  if(!primaryGroupSelect || !primaryBotSelect) return;
  const g = getSelectedPrimaryGroup();
  const admin = !!g?.botIsAdmin;
  primaryBotSelect.disabled = !admin;
  if(setPrimaryBtn) setPrimaryBtn.disabled = !admin;
  if(clearPrimaryBtn) clearPrimaryBtn.disabled = !admin;

  if(!g){
    if(primaryHint) primaryHint.textContent = 'Selecciona un grupo…';
    return;
  }

  const cur = (g.primaryLabel || '').toString();
  const has = (g.primaryKey || '').toString();
  const curText = has ? `Actual: ${cur}` : 'Actual: Sin primary (responden todos)';

  if(!admin){
    if(primaryHint) primaryHint.textContent = `Este subbot NO es admin en ese grupo. ${curText}`;
  }else{
    if(primaryHint) primaryHint.textContent = `${curText}`;
  }
}

function fillPrimaryBotsForGroup(g){
  if(!primaryBotSelect) return;
  const bots = Array.isArray(g?.botsInGroup) ? g.botsInGroup : [];
  if(!bots.length){
    primaryBotSelect.innerHTML = `<option value="" disabled selected>No hay bots conectados en este grupo.</option>`;
    return;
  }
  primaryBotSelect.innerHTML = bots.map(b=>`<option value="${escapeHtml(b.key)}">${escapeHtml(b.label)}</option>`).join('');
  // Selecciona el current primary si existe, si no el primero
  const cur = (g?.primaryKey || '').toString();
  const exists = bots.some(b=>b.key===cur);
  primaryBotSelect.value = exists ? cur : (bots[0]?.key || '');
}

function syncMsgEditorState(){
  if(!msgGroupSelect) return;
  const g = getSelectedGroup();
  const admin = !!g?.botIsAdmin;
  if(welcomeTpl) welcomeTpl.disabled = !admin;
  if(byeTpl) byeTpl.disabled = !admin;
  if(saveMsgsBtn) saveMsgsBtn.disabled = !admin;
  if(resetMsgsBtn) resetMsgsBtn.disabled = !admin;

  if(!g) return;
  if(!admin) showManage('Este subbot NO es admin en ese grupo, por eso no puedes editar los mensajes.');
}


async function loadGroups(){
  manageAlert.style.display='none';
  groupsBody.innerHTML = `<tr><td colspan="6" class="note">Cargando…</td></tr>`;

  try{
    const r = await api('/api/subbot/groups');
    const groups = r.groups || [];
    _groupsCache = groups;

    if(!groups.length){
      groupsBody.innerHTML = `<tr><td colspan="6" class="note">No se encontraron grupos.</td></tr>`;
      if(msgGroupSelect) msgGroupSelect.innerHTML = '';
      return;
    }

    // Tabla
    groupsBody.innerHTML = groups.map(g=>{
      return `
        <tr>
          <td>${escapeHtml(g.subject)}<div class="note">${g.id}</div></td>
          <td>${g.size || 0}</td>
          <td>${toggleHtml('bot', g.id, !!g.bot)}</td>
          <td>${toggleHtml('antilink', g.id, !!g.antilink)}</td>
          <td>${toggleHtml('welcome', g.id, !!g.welcome)}</td>
          <td>${toggleHtml('avisos', g.id, !!g.avisos)}</td>
        </tr>
      `;
    }).join('');

    // Listeners de toggles
    groupsBody.querySelectorAll('input[data-group]').forEach((inp)=>{
      inp.addEventListener('change', async ()=>{
        const groupId = inp.dataset.group;
        const kind = inp.dataset.kind;
        const val = inp.checked;
        try{
          const body = { groupId };
          body[kind] = val;
          await api('/api/subbot/groups/toggle',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(body)
          });
        }catch(err){
          inp.checked = !val;
          showManage(err.message || 'Error');
        }
      });
    });

    // Editor de mensajes (select + handlers) — se llena AL CARGAR, no al cambiar un toggle
    if(msgGroupSelect){
      msgGroupSelect.innerHTML = `
        <option value="" disabled selected>Selecciona un grupo…</option>
        ${groups.map(g=>`<option value="${g.id}">${escapeHtml(g.subject)} (${g.size||0})</option>`).join('')}
      `;
      msgGroupSelect.value = groups[0]?.id || '';
      if(msgGroupSelect.value){
        await loadGroupMessages(msgGroupSelect.value);
        syncMsgEditorState();
      }

      msgGroupSelect.onchange = async ()=>{
        const g = getSelectedGroup();
        if(!g) return;
        await loadGroupMessages(g.id);
        syncMsgEditorState();
      };
    }

    // Primary editor (select + handlers)
    if(primaryGroupSelect){
      primaryGroupSelect.innerHTML = `
        <option value="" disabled selected>Selecciona un grupo…</option>
        ${groups.map(g=>`<option value="${g.id}">${escapeHtml(g.subject)} (${g.size||0})</option>`).join('')}
      `;
      primaryGroupSelect.value = groups[0]?.id || '';
      const g0 = getSelectedPrimaryGroup();
      if(g0){
        fillPrimaryBotsForGroup(g0);
        syncPrimaryEditorState();
      }

      primaryGroupSelect.onchange = ()=>{
        const g = getSelectedPrimaryGroup();
        if(!g) return;
        fillPrimaryBotsForGroup(g);
        syncPrimaryEditorState();
      };
    }

    if(setPrimaryBtn){
      setPrimaryBtn.onclick = async ()=>{
        const g = getSelectedPrimaryGroup();
        if(!g) return showManage('Selecciona un grupo.');
        if(!g.botIsAdmin) return showManage('Este subbot NO es admin en ese grupo.');
        const key = (primaryBotSelect?.value || '').toString();
        if(!key) return showManage('Selecciona un bot.');
        try{
          const out = await api('/api/subbot/groups/primary',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ groupId: g.id, key })
          });
          // actualiza cache local
          const idx = _groupsCache.findIndex(x=>x.id===g.id);
          if(idx>=0){
            _groupsCache[idx] = { ..._groupsCache[idx], primaryKey: out.primaryKey, primaryLabel: out.primaryLabel };
          }
          showManage('Primary establecido ✅', true);
          syncPrimaryEditorState();
        }catch(err){
          showManage(err.message || 'Error');
        }
      };
    }

    if(clearPrimaryBtn){
      clearPrimaryBtn.onclick = async ()=>{
        const g = getSelectedPrimaryGroup();
        if(!g) return showManage('Selecciona un grupo.');
        if(!g.botIsAdmin) return showManage('Este subbot NO es admin en ese grupo.');
        try{
          const out = await api('/api/subbot/groups/primary/clear',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ groupId: g.id })
          });
          const idx = _groupsCache.findIndex(x=>x.id===g.id);
          if(idx>=0){
            _groupsCache[idx] = { ..._groupsCache[idx], primaryKey: out.primaryKey, primaryLabel: out.primaryLabel };
          }
          showManage('Primary removido ✅', true);
          syncPrimaryEditorState();
        }catch(err){
          showManage(err.message || 'Error');
        }
      };
    }

    if(saveMsgsBtn){
      saveMsgsBtn.onclick = async ()=>{
        const g = getSelectedGroup();
        if(!g) return showManage('Selecciona un grupo.');
        if(!g.botIsAdmin) return showManage('Este subbot NO es admin en ese grupo.');
        try{
          await api('/api/subbot/groups/messages',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ groupId: g.id, welcomeText: welcomeTpl.value, byeText: byeTpl.value })
          });
          showManage('Mensajes guardados ✅', true);
        }catch(err){
          showManage(err.message || 'Error');
        }
      };
    }

    if(resetMsgsBtn){
      resetMsgsBtn.onclick = async ()=>{
        const g = getSelectedGroup();
        if(!g) return showManage('Selecciona un grupo.');
        if(!g.botIsAdmin) return showManage('Este subbot NO es admin en ese grupo.');
        try{
          await api('/api/subbot/groups/messages',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ groupId: g.id, welcomeText: '', byeText: '' })
          });
          welcomeTpl.value='';
          byeTpl.value='';
          showManage('Mensajes reseteados ✅', true);
        }catch(err){
          showManage(err.message || 'Error');
        }
      };
    }
  }catch(err){
    groupsBody.innerHTML = `<tr><td colspan="6" class="note">Error: ${err.message}</td></tr>`;
  }
}

function toggleHtml(kind, groupId, checked){
  return `
    <label class="switch">
      <input type="checkbox" data-kind="${kind}" data-group="${groupId}" ${checked ? 'checked' : ''} />
      <span class="slider"></span>
    </label>
  `;
}

function escapeHtml(str){
  return (str || '').toString()
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

modals.modalLink.addEventListener('transitionend', ()=>{
  if(!modals.modalLink.classList.contains('open')) stopPairingPoll();
});

loadAll().catch(()=>{ location.href = '/login'; });
