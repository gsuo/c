/* ===== Claude Code Web — app logic ===== */
'use strict';

/* ---------- Data ---------- */
/* ---------- Skills — REAL from the codespace (no hardcoded list) ---------- */
let SKILLS = []; // populated from the codespace via {type:'skills'} job
let skillsLoaded = false;
async function loadRealSkills(){
  const grid = document.querySelector('#skills-grid');
  if(grid && !skillsLoaded) grid.innerHTML = '<p class="empty">جارٍ جلب المهارات الحقيقية من الساندبوكس…</p>';
  try{
    const res = await fetch(RELAY_URL, {method:'POST', headers: relayHeaders(), body: JSON.stringify({type:'skills'})});
    if(!res.ok) throw new Error('relay ' + res.status);
    const j = await res.json();
    if(!j.jobId) throw new Error('no job');
    const done = await pollRelayJob(j.jobId, 30000);
    if(done.status === 'error') throw new Error(done.error || 'skills job failed');
    const list = (done.result && done.result.skills) || [];
    SKILLS = list.map(s => ({name: s.name, ar: s.name, desc: s.description || ''}));
    skillsLoaded = true;
    renderSkills(document.querySelector('#skills-search') ? document.querySelector('#skills-search').value : '');
  }catch(e){
    if(grid) grid.innerHTML = '<p class="empty">تعذّر جلب المهارات من الساندبوكس — تأكد أن البيئة تعمل ثم أعد المحاولة.</p>';
    const c = document.querySelector('#skills-count'); if(c) c.textContent = '';
  }
}

/* ---------- Real skill contents (loaded from skills.json) ---------- */
const SKILL_CONTENT = {}; // name -> full skill text (sent as system prompt)
fetch('skills.json')
  .then(r => { if(!r.ok) throw 0; return r.json(); })
  .then(d => { if(d && Array.isArray(d.skills)) for(const s of d.skills){ if(s.name) SKILL_CONTENT[s.name] = s.content || ''; } })
  .catch(() => {});

/* ---------- Active skill (chip in chat input) ---------- */
let pendingSkill = null; // {name, ar} — stays active for follow-up messages until removed
function setPendingSkill(s){
  pendingSkill = s || null;
  renderSkillChip();
}
function renderSkillChip(){
  const el = $('#skill-chip');
  if(!el) return;
  if(pendingSkill){
    el.innerHTML = `<span class="chip skill-chip">${IC.bolt} المهارة: <b dir="ltr">${esc(pendingSkill.name)}</b><button aria-label="إزالة المهارة">✕</button></span>`;
    el.querySelector('button').addEventListener('click', () => setPendingSkill(null));
    el.classList.remove('hidden');
  }else{
    el.innerHTML = '';
    el.classList.add('hidden');
  }
}
function skillSystem(){
  return (pendingSkill && SKILL_CONTENT[pendingSkill.name]) ? SKILL_CONTENT[pendingSkill.name] : null;
}
/* detect a manually typed /name trigger at the start of the message */
function takeSkillTrigger(text){
  const m = String(text).match(/^\s*\/([a-z0-9-]+)\b/i);
  if(!m) return null;
  const sk = SKILLS.find(s => s.name === m[1].toLowerCase());
  if(!sk) return null;
  return {skill: sk, clean: String(text).replace(/^\s*\/[a-z0-9-]+\b/i, '').trim()};
}

const PLUGINS = [
  {name:'agents-md', ar:'دعم AGENTS.md', desc:'Built-in plugin — يتيح لوكلاء Claude Code قراءة تعليمات AGENTS.md في المشاريع.', builtin:true},
  {name:'motionsites-web-builder', ar:'باني مواقع MotionSites', desc:'Skill + plugin — بناء مواقع سينمائية بمستوى الجوائز مع حلقة تصوير وإصلاح.', builtin:false},
];

const AGENT_TYPES = [
  {id:'general', ar:'وكيل عام', desc:'مهام متعددة الخطوات: بحث، كتابة كود، تنظيم ملفات — يعمل في الخلفية ويعيد النتيجة.'},
  {id:'browser-task', ar:'وكيل المتصفح', desc:'تصفح المواقع الحقيقية: تسجيل دخول، نماذج، تحديات، ومهام متعددة الخطوات داخل المتصفح.'},
  {id:'researcher', ar:'باحث الويب', desc:'بحث معمّق في الويب مع مصادر موثقة — للتقارير والتحقيقات والتحليل.'},
];

/* ---------- Provider TYPE catalog — users add their own keys ---------- */
const PROVIDER_CATALOG = [
  {type:'openai',    label:'OpenAI',    desc:'نماذج GPT الأصلية',                    keyUrl:'https://platform.openai.com/api-keys'},
  {type:'anthropic', label:'Anthropic', desc:'نماذج Claude الأصلية',                 keyUrl:'https://console.anthropic.com/settings/keys'},
  {type:'groq',      label:'Groq',      desc:'استدلال فائق السرعة',                  keyUrl:'https://console.groq.com/keys'},
  {type:'google',    label:'Google',    desc:'نماذج Gemini',                         keyUrl:'https://aistudio.google.com/apikey'},
  {type:'mistral',   label:'Mistral',   desc:'نماذج Mistral الأوروبية',              keyUrl:'https://console.mistral.ai/api-keys'},
  {type:'cohere',    label:'Cohere',    desc:'نماذج Command للأعمال',                keyUrl:'https://dashboard.cohere.com/api-keys'},
  {type:'deepseek',  label:'DeepSeek',  desc:'نماذج DeepSeek القوية',                keyUrl:'https://platform.deepseek.com/api_keys'},
  {type:'xai',       label:'xAI',       desc:'نماذج Grok',                           keyUrl:'https://console.x.ai'},
  {type:'zai',       label:'Z.ai',      desc:'نماذج GLM',                            keyUrl:'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys'},
  {type:'openrouter',label:'OpenRouter',desc:'بوابة موحدة لمئات النماذج',            keyUrl:'https://openrouter.ai/keys'},
  {type:'together',  label:'Together AI',desc:'استضافة النماذج المفتوحة',            keyUrl:'https://api.together.ai/settings/api-keys'},
  {type:'fireworks', label:'Fireworks', desc:'استدلال سريع للنماذج المفتوحة',        keyUrl:'https://fireworks.ai/account/api-keys'},
];
const MODELS = []; // no hardcoded models — models come from user-added providers

/* Built-in models for the header model picker (id → label) */
const BUILTIN_MODELS = [
  {id:'nvidia/nvidia/nemotron-3-ultra-550b-a55b',            label:'Nemotron 3 Ultra (الأقوى)'},
  {id:'nvidia/nvidia/nemotron-3.5-lightning-30b-a3b',        label:'Nemotron 3.5 Lightning'},
  {id:'nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',label:'Nemotron 3 Nano'},
  {id:'ddgw/gpt-5.6-luna',                                  label:'GPT Luna'},
  {id:'ddgw/claude-haiku-4-5',                              label:'Claude Haiku 4.5'},
  {id:'zai/glm-4.7-flash',                                  label:'GLM 4.7 Flash'},
  {id:'cohere/command-a-03-2025',                            label:'Command A'},
  {id:'gemini/gemini-3.8-flash',                             label:'Gemini 3.8 Flash'},
];


/* ---------- Settings ---------- */
const SETTINGS_KEY = 'ccw_settings_v1';
const PLUGINS_KEY = 'ccw_plugins_v1';
const settings = Object.assign(
  {endpoint:'', apiKey:'', model:''},
  JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
);
function saveSettings(){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fmtBytes(n){
  if(n < 1024) return n + ' B';
  if(n < 1048576) return (n/1024).toFixed(1) + ' KB';
  return (n/1048576).toFixed(1) + ' MB';
}

/* ---------- Navigation ---------- */
function setView(name){
  if(name === '__settings__'){ openSettings(); return; }
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.mnav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + name).classList.add('active');
  if(name === 'browser' && !$('#browser-frame').src) loadBrowserUrl();
  if(name === 'terminal') initTerminal();
  if(name === 'environment'){ loadEnv(); if(envTimer) clearInterval(envTimer); envTimer = setInterval(() => { if($('#view-environment').classList.contains('active')) loadEnv(); }, 30000); }
  else if(envTimer){ clearInterval(envTimer); envTimer = null; }
  if(name === 'skills' && !skillsLoaded) loadRealSkills();
  if(name === 'live'){ startLiveActivity(); } else { stopLiveActivity(); }
}
document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
document.querySelectorAll('.mnav-btn').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));

/* ---------- Markdown (minimal, safe) — code ALWAYS folded ---------- */
function renderMarkdown(src){
  const lines = src.split('\n');
  let html = '', inCode = false, codeLang = '', codeBuf = [], inList = false, listTag = '';
  const inline = t => {
    t = esc(t);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return t;
  };
  const closeList = () => { if(inList){ html += `</${listTag}>`; inList = false; } };
  const codeHtml = code => `<details class="code-fold"><summary>${IC.caret}عرض الكود <span class="lang">${esc(codeLang)}</span></summary><div class="think-anim"><div><pre><code class="language-${codeLang}">${code}</code></pre></div></div></details>`;
  for(const line of lines){
    const codeMatch = line.match(/^```(\w*)/);
    if(codeMatch){
      if(inCode){
        html += codeHtml(esc(codeBuf.join('\n')));
        inCode = false; codeBuf = [];
      } else { closeList(); inCode = true; codeLang = codeMatch[1] || 'text'; }
      continue;
    }
    if(inCode){ codeBuf.push(line); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if(h){ closeList(); html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; continue; }
    const li = line.match(/^(\s*)[-*]\s+(.*)/);
    const oli = line.match(/^(\s*)\d+\.\s+(.*)/);
    if(li || oli){
      const tag = li ? 'ul' : 'ol', text = (li || oli)[2];
      if(!inList || listTag !== tag){ closeList(); html += `<${tag}>`; inList = true; listTag = tag; }
      html += `<li>${inline(text)}</li>`; continue;
    }
    closeList();
    if(/^\s*$/.test(line)) continue;
    if(/^\s*>/.test(line)){ html += `<blockquote>${inline(line.replace(/^\s*>\s?/,''))}</blockquote>`; continue; }
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  if(inCode) html += `<details class="code-fold"><summary>${IC.caret}عرض الكود <span class="lang">${esc(codeLang)}</span></summary><div class="think-anim"><div><pre><code>${esc(codeBuf.join('\n'))}</code></pre></div></div></details>`;
  return html;
}
function highlightAll(root){
  if(!window.hljs) return;
  root.querySelectorAll('pre code').forEach(el => {
    try{ hljs.highlightElement(el); }catch(e){}
  });
}

/* ---------- SVG icon set (no emoji-as-icons) ---------- */
const IC = {
  caret: '<svg class="th-caret" viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  thought: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M9.5 3.5A3.5 3.5 0 0 0 6 7c-1.9.5-3 2-3 3.8 0 1.5 1 2.8 2.4 3.3A4.5 4.5 0 0 0 9 18.5c.4 0 .8-.1 1.1-.2A3.5 3.5 0 0 0 13 21c2.5 0 4.2-2 4-4.3 1.9-.6 3-2.1 3-4A4.7 4.7 0 0 0 15.6 8 4.2 4.2 0 0 0 9.5 3.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none"><path d="M4.5 12.5l5 5L19.5 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09A1.7 1.7 0 0 0 10.11 3V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.01 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09c.26.61.88 1.01 1.56 1.01H21a2 2 0 1 1 0 4h-.09c-.68 0-1.3.4-1.51 1.01z" stroke="currentColor" stroke-width="1.4"/></svg>',
  clip: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 1 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  folder: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  file: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 2v6h6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  dl: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 20h16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};

/* ---------- Thinking panel (chat mode): smooth, SVG caret ---------- */
function thinkPanelHtml(thinking, live){
  const t = String(thinking || '').trim();
  if(!t) return '';
  const paras = t.split(/\n\s*\n/).map(p => {
    const s = p.trim();
    return s ? `<p>${esc(s).replace(/\n/g, '<br>')}</p>` : '';
  }).join('');
  if(!paras) return '';
  return `<details class="think-panel${live ? ' live' : ''}"${live ? ' open' : ''}><summary>${IC.caret}<span class="th-ico">${IC.thought}</span>التفكير${live ? ' <span class="think-meta">— مباشر</span>' : ''}</summary><div class="think-anim"><div><div class="think-body">${paras}</div></div></div></details>`;
}

/* ---------- Task files (claudecode jobs) ---------- */function mimeFor(name){
  const ext = String(name || '').split('.').pop().toLowerCase();
  return {png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml', bmp:'image/bmp'}[ext] || 'application/octet-stream';
}
function decodeTextB64(b64){
  try{
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }catch(e){ return null; }
}
function filesHtml(files){
  const list = (files || []).slice(0, 8);
  if(!list.length) return '';
  const items = list.map(f => {
    const nm = esc(f.name || 'ملف'), sz = esc(fmtBytes(f.size || 0));
    const hasData = typeof f.data === 'string' && f.data.length > 0;
    const url = hasData ? `data:${mimeFor(f.name)};base64,${f.data}` : '';
    const dl = hasData ? `<a class="dl-btn" download="${nm}" href="${url}">${IC.dl} تحميل</a>` : `<span class="file-note">أُنشئ أثناء الجلسة</span>`;
    if(f.kind === 'image' && hasData){
      return `<div class="job-file"><img src="${url}" alt="${nm}" loading="lazy"><div class="jf-meta"><span class="jf-name">${nm}</span><span class="jf-size">${sz}</span>${dl}</div></div>`;
    }
    let preview = '';
    if(f.kind === 'text' && hasData && f.data.length < 600000){
      const txt = decodeTextB64(f.data);
      if(txt !== null){
        const shown = txt.slice(0, 2000);
        preview = `<details class="code-fold"><summary>${IC.caret}عرض المحتوى</summary><div class="think-anim"><div><pre>${esc(shown)}${txt.length > 2000 ? '\n…(مقتطع)' : ''}</pre></div></div></details>`;
      }
    }
    return `<div class="job-file"><div class="jf-meta"><span class="jf-ico">${IC.file}</span><span class="jf-name">${nm}</span><span class="jf-size">${sz}</span>${dl}</div>${preview}</div>`;
  }).join('');
  return `<div class="files-sec"><h4><span class="th-ico">${IC.folder}</span>ملفات المهمة (${list.length})</h4>${items}</div>`;
}
/* strip base64 payloads that would blow localStorage (>1.5MB total) */
function persistableFiles(files){
  const list = (files || []).slice(0, 8);
  let total = 0;
  for(const f of list) total += (typeof f.data === 'string' ? f.data.length : 0);
  if(total < 1500000) return list;
  return list.map(f => ({name: f.name, kind: f.kind, size: f.size}));
}

/* ---------- Live activity + plan checklist (claudecode mode) ---------- */
function planListHtml(plan){
  const items = (plan || []).slice(0, 15);
  if(!items.length) return '';
  const done = items.filter(p => p.status === 'completed').length;
  const rows = items.map(p => {
    const st = p.status;
    const cls = st === 'completed' ? 'done' : st === 'in_progress' ? 'active' : '';
    const icon = st === 'completed'
      ? `<span class="pl-check">${IC.check}</span>`
      : st === 'in_progress'
        ? `<span class="pl-spin"></span>`
        : `<span class="pl-check"></span>`;
    return `<li class="${cls}"><span class="pl-ic">${icon}</span><span class="pl-tx">${esc(String(p.content || ''))}</span></li>`;
  }).join('');
  return `<div class="plan-head"><span>خطة العمل</span><span class="plan-progress">${done}/${items.length}</span></div>
    <div class="plan-bar"><i style="width:${items.length ? Math.round(done / items.length * 100) : 0}%"></i></div>
    <ul class="plan-list">${rows}</ul>`;
}

/* Update (or create) a live thinking panel inside a wrapper during streaming */
function setLiveThinking(wrap, text){
  const t = String(text || '').trim();
  let det = wrap.querySelector('details.think-panel');
  if(!t){ if(det) det.remove(); return; }
  if(!det){
    det = document.createElement('details');
    det.className = 'think-panel live'; det.open = true;
    det.innerHTML = `<summary>${IC.caret}<span class="th-ico">${IC.thought}</span>التفكير <span class="think-meta">— مباشر</span></summary><div class="think-anim"><div><div class="think-body"></div></div></div>`;
    wrap.appendChild(det);
  }
  const body = det.querySelector('.think-body');
  const sig = t.length + ':' + t.slice(-48);
  if(body && body.dataset.sig !== sig){
    body.innerHTML = t.split(/\n\s*\n/).map(p => {
      const s = p.trim();
      return s ? `<p>${esc(s).replace(/\n/g, '<br>')}</p>` : '';
    }).join('');
    body.dataset.sig = sig;
    body.scrollTop = body.scrollHeight;
  }
}

/* ---------- Chat ---------- */
const messagesEl = $('#messages');
const chatInput = $('#chat-input');
const sendBtn = $('#send-btn');
const stopBtn = $('#stop-btn');
let aborter = null;
const history = []; // {role, content, kind?, trace?} — persisted session messages
const apiHistory = () => history.map(m => ({role: m.role, content: m.content}));
let sendGen = 0; // generation counter — invalidates in-flight sends on session switch
/* stop any in-flight send without persisting partial results */
function stopInflight(){
  sendGen++;
  if(aborter){ try{ aborter.abort(); }catch(e){} aborter = null; }
  if(relayTimer){ clearInterval(relayTimer); relayTimer = null; }
  if(ccTimer){ clearInterval(ccTimer); ccTimer = null; }
  relayStopFlag = false; ccStopFlag = false;
  sendBtn.classList.remove('hidden'); stopBtn.classList.add('hidden');
}

function addMessage(role, htmlContent, cls){
  const div = document.createElement('div');
  div.className = 'msg ' + role + (cls ? ' ' + cls : '');
  const who = role === 'user' ? 'أنت' : 'Claude Code';
  const av = role === 'assistant' ? '<span class="avatar">C</span>' : '';
  div.innerHTML = `<div class="who">${av}${who}</div><div class="bubble"></div>`;
  div.querySelector('.bubble').innerHTML = htmlContent;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}
function scrollIfNearBottom(){
  const near = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 140;
  if(near) messagesEl.scrollTop = messagesEl.scrollHeight;
}
function welcome(){
  if(messagesEl.children.length) return;
  const div = addMessage('assistant', `<div class="welcome">
    <h2>أهلًا بك في Claude Code Web</h2>
    <p>اضغط زر <b>تشغيل كلاود</b> بالأعلى للاتصال المباشر دون أي إعدادات — أو اضبط نقطة النهاية والمفتاح يدويًا من <b>الإعدادات</b> (أيقونة الترس).</p>
    <div class="keys">
      <span class="key-hint"><b>/</b> استدعاء مهارة</span>
      <span class="key-hint"><b>Enter</b> إرسال</span>
      <span class="key-hint"><b>Shift+Enter</b> سطر جديد</span>
    </div></div>`);
  highlightAll(div);
}

/* ---------- Chat sessions (persisted in localStorage) ---------- */
const SESSIONS_KEY = 'ccw_sessions_v2';
const SESSIONS_KEY_V1 = 'ccw_sessions_v1';
const ACTIVE_SESSION_KEY = 'ccw_active_session_v1';
const MAX_SESSIONS = 30, MAX_MSGS = 100;
let chatSessions = []; // [{id,title,createdAt,updatedAt,messages:[{role,content,kind,trace}]}]
let activeSessionId = null;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function loadSessions(){
  try{
    const raw = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
    chatSessions = Array.isArray(raw) ? raw.filter(s => s && s.id && Array.isArray(s.messages)) : [];
  }catch(e){ chatSessions = []; }
  // migrate v1 -> v2 once (messages preserved; re-rendered with folded code)
  if(!chatSessions.length){
    try{
      const old = JSON.parse(localStorage.getItem(SESSIONS_KEY_V1) || '[]');
      if(Array.isArray(old) && old.length){
        chatSessions = old.filter(s => s && s.id && Array.isArray(s.messages));
        saveSessions();
        try{ localStorage.removeItem(SESSIONS_KEY_V1); }catch(e){}
      }
    }catch(e){}
  }
  try{ activeSessionId = localStorage.getItem(ACTIVE_SESSION_KEY) || null; }catch(e){}
}
function saveSessions(){
  try{
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(chatSessions.slice(0, MAX_SESSIONS)));
    if(activeSessionId) localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId);
  }catch(e){}
}
function currentSession(){
  return chatSessions.find(s => s.id === activeSessionId) || null;
}
function sessionTitle(msgs){
  const first = msgs.find(m => m.role === 'user');
  let t = first ? String(first.content).replace(/\[ملف مرفق:[^\]]*\]/g, '').trim() : '';
  t = t.replace(/\s+/g, ' ').slice(0, 42);
  return t || 'محادثة جديدة';
}
/* persist current history into the active session record */
function persistChat(){
  if(!activeSessionId) return;
  let s = currentSession();
  if(!s){
    s = {id: activeSessionId, title: 'محادثة جديدة', createdAt: Date.now(), updatedAt: Date.now(), messages: []};
    chatSessions.unshift(s);
  }
  s.messages = history.slice(-MAX_MSGS).map(m => ({role: m.role, content: m.content, kind: m.kind, trace: m.trace, thinking: m.thinking, files: m.files, plan: m.plan}));
  s.title = sessionTitle(s.messages);
  s.updatedAt = Date.now();
  chatSessions.sort((a, b) => b.updatedAt - a.updatedAt);
  chatSessions = chatSessions.slice(0, MAX_SESSIONS);
  saveSessions();
  renderSessionList();
}
function renderSessionList(){
  const list = $('#chat-sessions-list');
  if(!list) return;
  if(!chatSessions.length){
    list.innerHTML = '<p class="sess-empty">لا توجد محادثات محفوظة بعد.</p>';
    return;
  }
  list.innerHTML = chatSessions.map(s => {
    const d = new Date(s.updatedAt);
    let time;
    try{ time = d.toLocaleDateString('ar', {month:'short', day:'numeric'}) + ' ' + d.toLocaleTimeString('ar', {hour:'2-digit', minute:'2-digit'}); }
    catch(e){ time = ''; }
    return `<div class="sess-item${s.id === activeSessionId ? ' active' : ''}" data-sess="${esc(s.id)}">
      <div class="s-title">${esc(s.title)}</div>
      <div class="s-time">${esc(time)} · ${s.messages.length} رسالة</div>
      <button class="sess-del" data-sdel="${esc(s.id)}" aria-label="حذف المحادثة">✕</button>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-sess]').forEach(el => el.addEventListener('click', e => {
    if(e.target.closest('[data-sdel]')) return;
    switchSession(el.dataset.sess);
  }));
  list.querySelectorAll('[data-sdel]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    deleteSession(b.dataset.sdel);
  }));
}
function renderHistoryMessages(){
  messagesEl.innerHTML = '';
  for(const m of history){
    if(m.role === 'user'){
      addMessage('user', renderMarkdown(m.content));
    }else if(m.kind === 'cc'){
      const div = addMessage('assistant', '');
      renderCCBubble(div.querySelector('.bubble'), m.trace || [], m.content, false, m.files, m.plan, null);
      highlightAll(div);
    }else{
      const div = addMessage('assistant', thinkPanelHtml(m.thinking) + renderMarkdown(m.content) + filesHtml(m.files));
      highlightAll(div);
    }
  }
  scrollIfNearBottom();
}
function switchSession(id){
  if(id === activeSessionId){ closeDrawer(); return; }
  persistChat();
  stopInflight();
  const s = chatSessions.find(x => x.id === id);
  if(!s) return;
  activeSessionId = id;
  history.length = 0;
  for(const m of s.messages) history.push({role: m.role, content: m.content, kind: m.kind, trace: m.trace, thinking: m.thinking, files: m.files, plan: m.plan});
  saveSessions();
  renderHistoryMessages();
  renderSessionList();
  closeDrawer();
}
function newChatSession(){
  persistChat();
  stopInflight();
  activeSessionId = uid();
  history.length = 0;
  messagesEl.innerHTML = '';
  welcome();
  // materialize the record immediately so the drawer shows it as active
  chatSessions.unshift({id: activeSessionId, title: 'محادثة جديدة', createdAt: Date.now(), updatedAt: Date.now(), messages: []});
  chatSessions = chatSessions.slice(0, MAX_SESSIONS);
  saveSessions();
  renderSessionList();
  closeDrawer();
  chatInput.focus();
}
function deleteSession(id){
  const s = chatSessions.find(x => x.id === id);
  if(!s) return;
  if(!confirm('حذف هذه المحادثة نهائيًا؟')) return;
  chatSessions = chatSessions.filter(x => x.id !== id);
  if(id === activeSessionId){
    activeSessionId = uid();
    history.length = 0;
    messagesEl.innerHTML = '';
    welcome();
  }
  saveSessions();
  renderSessionList();
}
function openDrawer(){
  loadSessions(); // re-read in case another tab changed them
  renderSessionList();
  $('#sessions-drawer').classList.remove('hidden');
  $('#drawer-backdrop').classList.remove('hidden');
}
function closeDrawer(){
  $('#sessions-drawer').classList.add('hidden');
  $('#drawer-backdrop').classList.add('hidden');
}
function initChatSessions(){
  loadSessions();
  const s = currentSession();
  if(s && s.messages.length){
    history.length = 0;
    for(const m of s.messages) history.push({role: m.role, content: m.content, kind: m.kind, trace: m.trace});
    renderHistoryMessages();
  }else{
    if(!activeSessionId){ activeSessionId = uid(); saveSessions(); }
    welcome();
  }
  renderSessionList();
}

/* ---------- Notifications ---------- */
const NOTIFY_KEY = 'ccw_notify_v1';
let notifyOn = false;
try{ notifyOn = localStorage.getItem(NOTIFY_KEY) === 'on'; }catch(e){}
function updateNotifyBtn(){
  const b = $('#notify-btn');
  if(b){ b.classList.toggle('on', notifyOn); b.title = notifyOn ? 'الإشعارات: مفعّلة' : 'الإشعارات: متوقفة'; }
}
function toast(msg, kind){
  let t = $('#ccw-toast');
  if(!t){ t = document.createElement('div'); t.id = 'ccw-toast'; document.body.appendChild(t); }
  t.innerHTML = '';
  const dot = document.createElement('span');
  dot.className = 'live-pulse';
  dot.style.animationDuration = '1.6s';
  if(kind === 'ok') dot.style.background = 'var(--green)';
  else if(kind === 'err') dot.style.background = 'var(--red)';
  t.appendChild(dot);
  const tx = document.createElement('span'); tx.textContent = msg; t.appendChild(tx);
  t.classList.remove('ok', 'err');
  if(kind) t.classList.add(kind);
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3200);
}
async function toggleNotify(){
  if(!('Notification' in window)){ toast('المتصفح لا يدعم الإشعارات.'); return; }
  if(notifyOn){
    notifyOn = false;
  }else{
    let perm = Notification.permission;
    if(perm === 'default'){ try{ perm = await Notification.requestPermission(); }catch(e){ perm = 'denied'; } }
    if(perm === 'granted'){ notifyOn = true; toast('تم تفعيل الإشعارات ✓'); }
    else { toast('تم رفض الإشعارات — فعّلها من إعدادات الموقع.'); return; }
  }
  try{ localStorage.setItem(NOTIFY_KEY, notifyOn ? 'on' : 'off'); }catch(e){}
  updateNotifyBtn();
}
function notifyDone(kind, text){
  if(!notifyOn) return;
  if(!('Notification' in window)) return;
  if(!document.hidden) return;
  const heads = {chat: 'اكتمل رد المحادثة', agent: 'اكتملت مهمة الوكيل', cc: 'اكتمل تنفيذ Claude Code'};
  let body = heads[kind] || 'اكتملت المهمة';
  const snip = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if(snip) body += ' — ' + snip;
  try{
    const n = new Notification('Claude Code Web', {body, tag: 'ccw-' + kind});
    n.onclick = () => { try{ window.focus(); }catch(e){} n.close(); };
  }catch(e){}
}

$('#notify-btn').addEventListener('click', toggleNotify);
$('#sessions-btn').addEventListener('click', openDrawer);
$('#drawer-close').addEventListener('click', closeDrawer);
$('#drawer-backdrop').addEventListener('click', closeDrawer);
$('#new-session-btn').addEventListener('click', newChatSession);
$('#new-chat-btn').addEventListener('click', newChatSession);
$('#del-chat-btn').addEventListener('click', () => deleteSession(activeSessionId));

function friendlyError(status, body){
  const ar = {
    net:'تعذّر الوصول إلى نقطة النهاية. تأكد أن البوابة تعمل وأن العنوان صحيح.',
    401:'المفتاح مرفوض (401). تحقق من مفتاح API في الإعدادات.',
    403:'مرفوض (403) — قد يكون المفتاح بلا صلاحية لهذا النموذج.',
    404:'النموذج غير موجود (404). جرّب نموذجًا آخر من الإعدادات.',
    429:'حد الاستخدام ممتلئ (429). انتظر قليلًا ثم أعد المحاولة.',
    500:'خطأ في الخادم (500). أعد المحاولة بعد قليل.',
  };
  let msg = ar[status] || `خطأ ${status}.`;
  try{
    const j = JSON.parse(body || '{}');
    const d = j.error && j.error.message;
    if(d) msg += `<br><span class="mono" dir="ltr" style="font-size:12px">${esc(String(d)).slice(0,220)}</span>`;
  }catch(e){}
  if(status === 'net') msg = ar.net;
  return msg;
}

/* ---------- Chat modes: relay vs manual ---------- */
const MODE_KEY = 'ccw_chatmode_v1';
/* Relay URL: the live tunnel to the codespace worker, published in the repo.
   GitHub Pages is static — no server, no secrets. The tunnel URL refreshes
   automatically whenever a new sandbox registers itself. */
let RELAY_URL = localStorage.getItem('ccw_tunnel_url') || '';
const TUNNEL_FILE_URL = 'https://raw.githubusercontent.com/gsuo/c/main/tunnel-url.txt';
// Link key: shared secret with the codespace worker (never in the repo).
// The user pastes it once in Settings; it lives only in this browser.
function linkKey(){ return localStorage.getItem('ccw_link_key') || ''; }
function relayHeaders(extra){
  return Object.assign({'Content-Type': 'application/json', 'X-Relay-Key': linkKey()}, extra || {});
}
async function refreshTunnelUrl(){
  try{
    const r = await fetch(TUNNEL_FILE_URL + '?t=' + Date.now());
    if(!r.ok) return RELAY_URL;
    const url = (await r.text()).trim();
    if(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/?$/.test(url)){
      if(url !== RELAY_URL){ RELAY_URL = url; localStorage.setItem('ccw_tunnel_url', url); }
      return url;
    }
  }catch(e){}
  return RELAY_URL;
}
let chatMode = 'relay';
let relayState = 'idle'; // idle | connecting | connected
let relayTimer = null;
let relayStopFlag = false;
let manualConn = null; // null = untested, true/false = last manual probe
let activeModelId = null; // last modelUsed reported by the relay backend
try{ chatMode = localStorage.getItem(MODE_KEY) || 'relay'; }catch(e){}

// Friendly display names for model IDs (smart routing reports modelUsed)
function friendlyModel(id){
  if(!id) return null;
  const s = String(id).toLowerCase();
  if(s.includes('nemotron-3-ultra-550b')) return 'Nemotron 3 Ultra';
  if(s.includes('nemotron-3.5-lightning')) return 'Nemotron 3.5 Lightning';
  if(s.includes('nemotron-3-nano')) return 'Nemotron 3 Nano';
  if(s.includes('gpt-5.6-luna')) return 'GPT Luna';
  if(s.includes('claude-haiku-4-5')) return 'Claude Haiku 4.5';
  if(s.includes('glm-4.7-flash')) return 'GLM 4.7 Flash';
  if(s.includes('command-a-03-2025')) return 'Command A';
  if(s.includes('gemini-3.8-flash')) return 'Gemini 3.8 Flash';
  // fallback: shorten raw id (drop provider prefix)
  const parts = String(id).split('/');
  return parts[parts.length - 1];
}
function setActiveModel(id){
  if(!id || id === activeModelId) return;
  activeModelId = id;
  const line = $('#model-line');
  if(!line) return;
  const name = id === 'claude-code' ? 'Claude Code' : friendlyModel(id);
  line.innerHTML = 'يرد عليك الآن: <b>' + esc(name) + '</b>';
  line.classList.remove('hidden');
}

/* ---------- Model picker (header) ---------- */
const MODEL_KEY = 'ccw_model_v1';
function getSelectedModel(){
  try{ return localStorage.getItem(MODEL_KEY) || 'auto'; }catch(e){ return 'auto'; }
}
function buildModelPicker(){
  const sel = $('#model-picker');
  if(!sel) return;
  const cur = getSelectedModel();
  let html = '<option value="auto">⚡ تلقائي (الأفضل أولًا)</option><optgroup label="النماذج المدمجة">';
  for(const m of BUILTIN_MODELS) html += `<option value="${esc(m.id)}">${esc(m.label)}</option>`;
  html += '</optgroup>';
  const ups = getUserProviders();
  if(ups.length){
    html += '<optgroup label="مفاتيحك">';
    for(const p of ups){
      for(const mm of (p.models || [])){
        const raw = typeof mm === 'string' ? mm : (mm.id || mm.name || '');
        if(!raw) continue;
        const shortId = String(raw).includes('/') ? String(raw).split('/').pop() : String(raw);
        const val = p.name + '/' + shortId; // worker routes user-* providers as user-<type>/<model>
        const lbl = (p.label || p.name) + ' — ' + shortId;
        html += `<option value="${esc(val)}">${esc(lbl)}</option>`;
      }
    }
    html += '</optgroup>';
  }
  sel.innerHTML = html;
  const ok = [...sel.options].some(o => o.value === cur);
  sel.value = ok ? cur : 'auto';
}
$('#model-picker').addEventListener('change', e => {
  try{ localStorage.setItem(MODEL_KEY, e.target.value); }catch(_){}
});

function refreshConnPill(){
  if(chatMode !== 'relay') return;
  const pill = $('#conn-pill');
  pill.classList.toggle('ok', relayState === 'connected');
  pill.classList.remove('bad');
  $('#conn-label').textContent = relayState === 'connected' ? 'متصل' : relayState === 'connecting' ? 'جارٍ الاتصال…' : 'وضع كلاود';
}
function setMode(m){
  chatMode = m;
  try{ localStorage.setItem(MODE_KEY, m); }catch(e){}
  const lbl = $('#mode-label'), desc = $('#mode-desc'), tog = $('#mode-toggle');
  const btn = $('#relay-btn'), rlab = $('#relay-label');
  if(m === 'relay'){
    lbl.textContent = 'وضع كلاود'; lbl.classList.remove('manual');
    desc.textContent = 'يعمل عبر وسيط كلاود — لا حاجة لأي إعدادات';
    tog.textContent = 'استخدام endpoint خاص';
    btn.classList.toggle('connected', relayState === 'connected');
    rlab.textContent = relayState === 'connecting' ? 'جارٍ الاتصال…' : relayState === 'connected' ? 'متصل ✓' : 'تشغيل كلاود';
    const ml = $('#model-line');
    if(ml) ml.classList.toggle('hidden', !activeModelId);
    refreshConnPill();
  }else{
    lbl.textContent = 'الوضع اليدوي'; lbl.classList.add('manual');
    desc.textContent = 'تتصل بنقطة النهاية الخاصة بك من الإعدادات';
    tog.textContent = 'العودة إلى وضع كلاود';
    btn.classList.remove('connected');
    rlab.textContent = 'تشغيل كلاود';
    const ml = $('#model-line');
    if(ml) ml.classList.add('hidden');
    const cp = $('#conn-pill');
    cp.classList.toggle('ok', manualConn === true);
    cp.classList.toggle('bad', manualConn === false);
    $('#conn-label').textContent = manualConn === null ? 'غير مختبر' : manualConn ? 'متصل' : 'غير متصل';
  }
}
function setRelayState(s){
  relayState = s;
  $('#relay-btn').classList.toggle('connecting', s === 'connecting');
  setMode(chatMode);
}
async function activateRelay(){
  if(relayState === 'connecting') return;
  if(relayState === 'connected'){ setMode('relay'); return; }
  setRelayState('connecting');
  try{
    const res = await fetch(RELAY_URL, {method:'GET', headers: {'X-Relay-Key': linkKey()}});
    if(res.status === 404) throw new Error('not-deployed');
    setRelayState('connected');
    setMode('relay');
  }catch(err){
    setRelayState('idle');
    setMode('manual');
    const msg = err && err.message === 'not-deployed'
      ? 'خدمة وسيط كلاود غير منشورة بعد على هذا الموقع.'
      : 'تعذّر الوصول إلى وسيط كلاود — تحقق من اتصالك بالإنترنت.';
    const div = addMessage('assistant',
      `<p>⚠️ ${esc(msg)}</p><p>تم التبديل إلى <b>الوضع اليدوي</b> — أدخل نقطة النهاية والمفتاح من الإعدادات، أو أعد محاولة الاتصال لاحقًا.</p>` +
      `<p><button class="use-btn" id="err-open-settings">فتح الإعدادات ←</button> ` +
      `<button class="ghost-btn" id="err-retry-relay">إعادة محاولة الاتصال</button></p>`,
      'msg-error');
    const bs = div.querySelector('#err-open-settings');
    if(bs) bs.addEventListener('click', openSettings);
    const br = div.querySelector('#err-retry-relay');
    if(br) br.addEventListener('click', activateRelay);
  }
}
$('#relay-btn').addEventListener('click', activateRelay);
$('#mode-toggle').addEventListener('click', () => {
  if(chatMode === 'relay'){ setMode('manual'); if(!settings.apiKey) openSettings(); }
  else activateRelay();
});

async function sendMessage(){
  if(buildMode === 'build') return sendClaudeCode();
  if(chatMode === 'relay'){
    if(relayState !== 'connected'){
      await activateRelay();
      if(relayState !== 'connected') return;
    }
    return sendRelay();
  }
  return sendManual();
}

async function sendRelay(){
  let text = chatInput.value.trim();
  // a manually typed /name trigger activates that skill for this message
  const trig = takeSkillTrigger(text);
  if(trig){ setPendingSkill(trig.skill); text = trig.clean; }
  const skill = pendingSkill;
  if(!text && !skill) return;
  if(relayTimer || aborter || ccTimer) return;
  const gen = ++sendGen;
  const shownText = text || '(تفعيل المهارة)';
  let full = text;
  if(attachedFiles.length){
    for(const f of attachedFiles){
      full += f.textContent ? `\n\n[ملف مرفق: ${f.name}]\n${f.textContent.slice(0,12000)}` : `\n\n[ملف مرفق: ${f.name}]`;
    }
    clearAttachments();
  }
  const skillTag = skill ? `<div class="used-skill">${IC.bolt} المهارة: <b dir="ltr">${esc(skill.name)}</b></div>` : '';
  addMessage('user', skillTag + renderMarkdown(shownText));
  history.push({role:'user', content: full || shownText});
  persistChat();
  chatInput.value = ''; autosize(); hideSlash();

  relayStopFlag = false;
  sendBtn.classList.add('hidden'); stopBtn.classList.remove('hidden');
  const msgDiv = addMessage('assistant', '');
  const bubble = msgDiv.querySelector('.bubble');
  // live status line (prominent, real-time)
  const liveBar = document.createElement('div');
  liveBar.className = 'live-bar';
  liveBar.innerHTML = '<span class="live-pulse"></span><span class="live-text">يفكر…</span>';
  bubble.appendChild(liveBar);
  const liveThinkWrap = document.createElement('div');
  bubble.appendChild(liveThinkWrap);
  const cursor = document.createElement('span');
  cursor.className = 'stream-cursor';
  bubble.appendChild(cursor);
  const setLiveText = t => { const s = liveBar.querySelector('.live-text'); if(s) s.textContent = t; };
  let raw = '', thinkingText = '', answered = false;
  const started = Date.now();

  const cleanup = () => {
    if(relayTimer){ clearInterval(relayTimer); relayTimer = null; }
    sendBtn.classList.remove('hidden'); stopBtn.classList.add('hidden');
  };
  const finishOk = () => {
    if(gen !== sendGen) return;
    cleanup();
    if(raw){
      const th = thinkingText.trim() ? thinkingText : undefined;
      history.push({role:'assistant', content: raw, thinking: th});
      persistChat();
      notifyDone('chat', raw);
      bubble.innerHTML = thinkPanelHtml(th) + renderMarkdown(raw);
      highlightAll(bubble);
    }else{
      msgDiv.classList.add('msg-error');
      bubble.innerHTML = '<p>انتهت المهمة دون رد.</p>';
    }
    scrollIfNearBottom();
  };
  const finishErr = msg => {
    if(gen !== sendGen) return;
    cleanup();
    msgDiv.classList.add('msg-error');
    bubble.innerHTML = '<p>⚠️ ' + esc(msg) + '</p><p class="empty">يمكنك إعادة المحاولة أو التبديل إلى الوضع اليدوي.</p>';
    scrollIfNearBottom();
  };
  const appendNew = t => {
    if(t.length > raw.length){
      const cur = bubble.querySelector('.stream-cursor');
      bubble.insertBefore(document.createTextNode(t.slice(raw.length)), cur);
      raw = t;
      return true;
    }
    return false;
  };

  let jobId;
  try{
    const postBody = {type:'chat', messages: apiHistory()};
    const sys = skillSystem();
    const planPrefix = (buildMode === 'plan') ? PLAN_SYSTEM : null;
    const fullSys = [planPrefix, sys].filter(Boolean).join('\n\n');
    if(fullSys) postBody.system = fullSys; // plan mode: plan-only instructions; real skill: model follows the skill text
    const pm = getSelectedModel();
    if(pm && pm !== 'auto') postBody.preferredModel = pm;
    const res = await fetch(RELAY_URL, {
      method:'POST',
      headers: relayHeaders(),
      body: JSON.stringify(postBody),
    });
    if(res.status === 404) throw new Error('خدمة وسيط كلاود غير منشورة بعد على هذا الموقع.');
    if(!res.ok) throw new Error('تعذّر بدء المهمة (خطأ ' + res.status + ').');
    const j = await res.json().catch(() => ({}));
    jobId = j && j.jobId;
    if(!jobId) throw new Error('الوسيط لم يُرجع معرّف مهمة.');
  }catch(err){
    finishErr(err && err.message ? err.message : 'تعذّر بدء مهمة الوسيط.');
    return;
  }

  let polling = false;
  relayTimer = setInterval(async () => {
    if(polling) return;
    if(relayStopFlag){ finishOk(); return; }
    if(Date.now() - started > 120000){ finishErr('انتهت مهلة الانتظار (120 ثانية) دون اكتمال الرد.'); return; }
    polling = true;
    try{
      const r = await fetch(RELAY_URL + '?jobId=' + encodeURIComponent(jobId), {headers: {'X-Relay-Key': linkKey()}});
      const j = await r.json().catch(() => ({}));
      if(j.modelUsed) setActiveModel(j.modelUsed);
      if(typeof j.thinking === 'string' && j.thinking.length > thinkingText.length){
        thinkingText = j.thinking;
        setLiveThinking(liveThinkWrap, thinkingText);
      }
      if(j.status === 'done'){
        const t = typeof j.text === 'string' ? j.text : raw;
        appendNew(t);
        finishOk();
      }else if(j.status === 'error'){
        finishErr(String(j.error || 'خطأ غير معروف من الوسيط.'));
      }else{
        const t = typeof j.text === 'string' ? j.text : '';
        if(t && !answered){ answered = true; setLiveText('يصيغ الرد…'); }
        if(appendNew(t)) scrollIfNearBottom();
      }
    }catch(e){ /* transient poll failure — keep waiting */ }
    finally{ polling = false; }
  }, 1500);
}

async function sendManual(){
  let text = chatInput.value.trim();
  const trig = takeSkillTrigger(text);
  if(trig){ setPendingSkill(trig.skill); text = trig.clean; }
  const skill = pendingSkill;
  if((!text && !skill) || aborter || relayTimer || ccTimer) return;
  const gen = ++sendGen;
  const shownText = text || '(تفعيل المهارة)';
  // gather attachments
  let full = text;
  if(attachedFiles.length){
    for(const f of attachedFiles){
      full += f.textContent ? `\n\n[ملف مرفق: ${f.name}]\n${f.textContent.slice(0,12000)}` : `\n\n[ملف مرفق: ${f.name}]`;
    }
    clearAttachments();
  }
  const skillTag = skill ? `<div class="used-skill">${IC.bolt} المهارة: <b dir="ltr">${esc(skill.name)}</b></div>` : '';
  addMessage('user', skillTag + renderMarkdown(shownText));
  history.push({role:'user', content: full || shownText});
  persistChat();
  chatInput.value = ''; autosize();
  hideSlash();

  aborter = new AbortController();
  sendBtn.classList.add('hidden'); stopBtn.classList.remove('hidden');
  const msgDiv = addMessage('assistant', '<span class="stream-cursor"></span>');
  const bubble = msgDiv.querySelector('.bubble');
  let raw = '';

  try{
    const sys = skillSystem();
    const apiMessages = sys ? [{role:'system', content: sys}, ...apiHistory()] : apiHistory();
    const res = await fetch(settings.endpoint.replace(/\/+$/,'') + '/chat/completions', {
      method:'POST',
      signal: aborter.signal,
      headers:{'Content-Type':'application/json', ...(settings.apiKey ? {Authorization:'Bearer ' + settings.apiKey} : {})},
      body: JSON.stringify({model: settings.model, messages: apiMessages, stream:true, temperature:0.7}),
    });
    if(!res.ok){
      const body = await res.text().catch(()=> '');
      throw {status: res.status, body};
    }
    if(!res.body) throw {status: 'net'};
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for(;;){
      const {done, value} = await reader.read();
      if(done) break;
      buf += dec.decode(value, {stream:true});
      const parts = buf.split('\n\n'); buf = parts.pop();
      for(const part of parts){
        const line = part.trim().split('\n').find(l => l.startsWith('data:'));
        if(!line) continue;
        const data = line.slice(5).trim();
        if(data === '[DONE]') continue;
        try{
          const j = JSON.parse(data);
          const delta = j.choices && j.choices[0] && j.choices[0].delta;
          const chunk = delta && (delta.content || '');
          if(chunk){
            raw += chunk;
            bubble.innerHTML = esc(raw) + '<span class="stream-cursor"></span>';
            scrollIfNearBottom();
          }
        }catch(e){}
      }
    }
    if(gen === sendGen){
      history.push({role:'assistant', content: raw});
      persistChat();
      notifyDone('chat', raw);
      bubble.innerHTML = renderMarkdown(raw) || '<p class="empty">رد فارغ.</p>';
      highlightAll(bubble);
    }else{
      msgDiv.remove();
    }
  }catch(err){
    if(err && err.name === 'AbortError'){
      if(gen !== sendGen){ msgDiv.remove(); }
      else if(raw){ history.push({role:'assistant', content: raw}); persistChat(); notifyDone('chat', raw); bubble.innerHTML = renderMarkdown(raw); highlightAll(bubble); }
      else msgDiv.remove();
    } else if(gen !== sendGen){
      msgDiv.remove();
    } else {
      const status = (err && err.status) || 'net';
      msgDiv.classList.add('msg-error');
      bubble.innerHTML = friendlyError(status, err && err.body);
    }
  }finally{
    aborter = null;
    sendBtn.classList.remove('hidden'); stopBtn.classList.add('hidden');
    scrollIfNearBottom();
  }
}
function onStop(){
  if(aborter) aborter.abort();
  if(relayTimer) relayStopFlag = true;
  if(ccTimer) ccStopFlag = true;
}
stopBtn.addEventListener('click', onStop);
sendBtn.addEventListener('click', sendMessage);
function autosize(){
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
}
chatInput.addEventListener('input', () => { autosize(); onSlashInput(); });
chatInput.addEventListener('keydown', e => {
  if(slashOpen){
    if(e.key === 'ArrowDown'){ e.preventDefault(); slashMove(1); return; }
    if(e.key === 'ArrowUp'){ e.preventDefault(); slashMove(-1); return; }
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); slashPick(); return; }
    if(e.key === 'Escape'){ hideSlash(); return; }
  }
  if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); }
});

/* ---------- Build mode: plan vs build (composer segmented control) ---------- */
const BUILDMODE_KEY = 'ccw_build_mode_v1';
let buildMode = 'plan'; // 'plan' | 'build'
try{ buildMode = localStorage.getItem(BUILDMODE_KEY) || 'plan'; }catch(e){}
let ccTimer = null, ccStopFlag = false;

function setBuildMode(m){
  buildMode = (m === 'build') ? 'build' : 'plan';
  try{ localStorage.setItem(BUILDMODE_KEY, buildMode); }catch(e){}
  const bp = $('#mode-plan'), bb = $('#mode-build');
  if(bp){ bp.classList.toggle('active', buildMode === 'plan'); bp.setAttribute('aria-selected', String(buildMode === 'plan')); }
  if(bb){ bb.classList.toggle('active', buildMode === 'build'); bb.setAttribute('aria-selected', String(buildMode === 'build')); }
  const hint = $('#build-mode-hint');
  if(hint) hint.textContent = buildMode === 'build' ? 'ينفّذ المهمة فعليًا عبر Claude Code' : 'يرد بخطة مفصلة فقط — دون تنفيذ';
  chatInput.placeholder = buildMode === 'build' ? 'صف المهمة لـ Claude Code…' : 'صف ما تريد… (اكتب / لاستدعاء مهارة)';
}
$('#mode-plan').addEventListener('click', () => setBuildMode('plan'));
$('#mode-build').addEventListener('click', () => setBuildMode('build'));

/* Plan-only system prefix: plan mode outputs a detailed Arabic plan, no execution */
const PLAN_SYSTEM = 'أنت مساعد تخطيط فقط. مهمتك الوحيدة: إخراج خطة مفصلة خطوة بخطوة باللغة العربية لما طلبه المستخدم. قواعد صارمة: لا تنفّذ أي شيء، لا تستدعِ أي أدوات، لا تكتب أي كود، لا تعدّل أي ملفات. أخرج الخطة فقط — مرقّمة، واضحة، وقابلة للتنفيذ لاحقًا.';

function traceNode(e){
  const k = e && e.kind, txt = String((e && e.text) || '');
  if(k === 'tool'){
    const d = document.createElement('div'); d.className = 'tr-tool'; d.textContent = '🔧 ' + txt; return d;
  }
  if(k === 'info'){
    const p = document.createElement('p'); p.className = 'tr-info'; p.textContent = txt; return p;
  }
  const p = document.createElement('p'); p.className = 'tr-think'; p.textContent = txt; return p;
}
/* Build the claude-code result bubble: live activity + plan + collapsible thinking + folded-code result + files */
function renderCCBubble(bubble, trace, resultText, streaming, files, plan, activity){
  bubble.innerHTML = '';
  // live status line (top)
  const actLine = document.createElement('div');
  actLine.className = 'cc-activity';
  actLine.innerHTML = '<span class="pulse-gear">' + IC.gear + '</span><span class="act-text"></span>';
  bubble.appendChild(actLine);
  const setActivity = t => {
    const s = actLine.querySelector('.act-text');
    if(s) s.textContent = String(t || '');
    actLine.style.display = t ? '' : 'none';
  };
  setActivity(activity);
  // plan checklist
  const planWrap = document.createElement('div');
  planWrap.className = 'plan-wrap';
  bubble.appendChild(planWrap);
  const setPlan = p => { planWrap.innerHTML = planListHtml(p); };
  setPlan(plan);
  const det = document.createElement('details');
  det.className = 'think-fold'; det.open = true;
  const sum = document.createElement('summary');
  sum.innerHTML = IC.caret + '<span class="th-ico">' + IC.thought + '</span>التفكير والخطط <span class="tr-count"></span>';
  det.appendChild(sum);
  const anim = document.createElement('div'); anim.className = 'think-anim';
  const animIn = document.createElement('div');
  const tdiv = document.createElement('div'); tdiv.className = 'trace';
  for(const e of (trace || [])) tdiv.appendChild(traceNode(e));
  animIn.appendChild(tdiv); anim.appendChild(animIn); det.appendChild(anim);
  bubble.appendChild(det);
  const res = document.createElement('div'); res.className = 'cc-result';
  if(resultText){
    if(streaming){ res.innerHTML = esc(resultText) + '<span class="stream-cursor"></span>'; }
    else { res.innerHTML = renderMarkdown(resultText); highlightAll(res); }
  }else if(streaming){
    res.innerHTML = '<span class="stream-cursor"></span>';
  }
  bubble.appendChild(res);
  if(files && files.length){
    const fdiv = document.createElement('div');
    fdiv.innerHTML = filesHtml(files);
    bubble.appendChild(fdiv);
  }
  const cnt = det.querySelector('.tr-count');
  if(cnt && trace && trace.length) cnt.textContent = '(' + trace.length + ')';
  return {det, traceEl: tdiv, resEl: res, setActivity, setPlan};
}

async function sendClaudeCode(){
  let text = chatInput.value.trim();
  const trig = takeSkillTrigger(text);
  if(trig){ setPendingSkill(trig.skill); text = trig.clean; }
  const skill = pendingSkill;
  if(!text) return;
  if(ccTimer || aborter || relayTimer) return;
  const gen = ++sendGen;
  // cc mode runs on the server — needs the relay transport
  if(chatMode === 'relay'){
    if(relayState !== 'connected'){ await activateRelay(); if(relayState !== 'connected') return; }
  }else{
    await activateRelay();
    if(relayState !== 'connected') return;
  }
  let task = text;
  if(skill && SKILL_CONTENT[skill.name]){
    task = `[مهارة: ${skill.name}]\n${SKILL_CONTENT[skill.name].slice(0, 6000)}\n\nالمهمة:\n${text}`;
  }
  const skillTag = skill ? `<div class="used-skill">${IC.bolt} المهارة: <b dir="ltr">${esc(skill.name)}</b></div>` : '';
  addMessage('user', skillTag + renderMarkdown(text));
  history.push({role:'user', content: text});
  persistChat();
  chatInput.value = ''; autosize(); hideSlash();

  ccStopFlag = false;
  sendBtn.classList.add('hidden'); stopBtn.classList.remove('hidden');
  const msgDiv = addMessage('assistant', '');
  const bubble = msgDiv.querySelector('.bubble');
  const parts = renderCCBubble(bubble, [], '', true);
  const traceEl = parts.traceEl, resEl = parts.resEl, det = parts.det;
  const trace = [];
  let traceShown = 0, raw = '';
  const started = Date.now();

  const cleanup = () => {
    if(ccTimer){ clearInterval(ccTimer); ccTimer = null; }
    sendBtn.classList.remove('hidden'); stopBtn.classList.add('hidden');
  };
  const syncTrace = arr => {
    if(!Array.isArray(arr)) return;
    for(let i = traceShown; i < arr.length; i++){
      traceEl.appendChild(traceNode(arr[i]));
      trace.push(arr[i]);
    }
    traceShown = arr.length;
    const c = det.querySelector('.tr-count');
    if(c) c.textContent = trace.length ? '(' + trace.length + ')' : '';
    traceEl.scrollTop = traceEl.scrollHeight;
  };
  const finishOk = (finalText, filesArr, planArr) => {
    if(gen !== sendGen) return;
    cleanup();
    raw = finalText || raw;
    const wasOpen = det.open; // respect user's collapse choice
    const pf = persistableFiles(filesArr);
    renderCCBubble(bubble, trace, raw, false, pf, planArr, null);
    if(!wasOpen){ const d2 = bubble.querySelector('.think-fold'); if(d2) d2.open = false; }
    history.push({role:'assistant', content: raw, kind:'cc', trace, files: pf, plan: planArr});
    persistChat();
    notifyDone('cc', raw);
    scrollIfNearBottom();
  };
  const finishErr = msg => {
    if(gen !== sendGen) return;
    cleanup();
    msgDiv.classList.add('msg-error');
    bubble.innerHTML = '<p>⚠️ ' + esc(msg) + '</p><p class="empty">يمكنك إعادة المحاولة.</p>';
    scrollIfNearBottom();
  };

  let jobId;
  try{
    const res = await fetch(RELAY_URL, {
      method:'POST', headers: relayHeaders(),
      body: JSON.stringify({type:'claudecode', task}),
    });
    if(res.status === 404) throw new Error('خدمة وسيط كلاود غير منشورة بعد على هذا الموقع.');
    if(!res.ok) throw new Error('تعذّر بدء التنفيذ (خطأ ' + res.status + ').');
    const j = await res.json().catch(() => ({}));
    jobId = j && j.jobId;
    if(!jobId) throw new Error('الوسيط لم يُرجع معرّف مهمة.');
  }catch(err){
    finishErr(err && err.message ? err.message : 'تعذّر بدء التنفيذ.');
    return;
  }

  let busy = false;
  let ccFiles = null, ccPlan = null;
  ccTimer = setInterval(async () => {
    if(busy) return;
    if(ccStopFlag){ finishOk(raw, ccFiles, ccPlan); return; }
    if(Date.now() - started > 600000){ finishErr('انتهت مهلة التنفيذ (10 دقائق).'); return; }
    busy = true;
    try{
      const r = await fetch(RELAY_URL + '?jobId=' + encodeURIComponent(jobId), {headers: {'X-Relay-Key': linkKey()}});
      const j = await r.json().catch(() => ({}));
      if(j.modelUsed) setActiveModel(j.modelUsed);
      if(j.trace) syncTrace(j.trace);
      if(typeof j.activity === 'string' && j.activity) parts.setActivity(j.activity);
      if(Array.isArray(j.plan) && j.plan.length){ ccPlan = j.plan; parts.setPlan(j.plan); }
      if(Array.isArray(j.files) && j.files.length) ccFiles = j.files;
      const t = typeof j.text === 'string' ? j.text : '';
      if(t.length > raw.length){
        raw = t;
        resEl.innerHTML = esc(raw) + '<span class="stream-cursor"></span>';
        scrollIfNearBottom();
      }
      if(j.status === 'done'){ finishOk(typeof j.text === 'string' ? j.text : raw, ccFiles, ccPlan); }
      else if(j.status === 'error'){ finishErr(String(j.error || 'خطأ من Claude Code.')); }
    }catch(e){ /* transient poll failure — keep waiting */ }
    finally{ busy = false; }
  }, 2000);
}

/* ---------- Slash autocomplete ---------- */
const slashList = $('#slash-list');
let slashOpen = false, slashIdx = 0, slashMatches = [];
function slashQuery(){
  const v = chatInput.value;
  const m = v.match(/(?:^|\s)\/([a-z0-9-]*)$/i);
  return m ? m[1].toLowerCase() : null;
}
function onSlashInput(){
  const q = slashQuery();
  if(q === null){ hideSlash(); return; }
  slashMatches = SKILLS.filter(s => s.name.includes(q)).slice(0, 8);
  if(!slashMatches.length){ hideSlash(); return; }
  slashIdx = 0; renderSlash(); slashOpen = true;
  slashList.classList.remove('hidden');
}
function renderSlash(){
  slashList.innerHTML = slashMatches.map((s, i) =>
    `<div class="slash-item${i===slashIdx?' sel':''}" role="option" data-i="${i}">
       <span class="cmd">/${esc(s.name)}</span><span class="lbl">${esc(s.ar)}</span>
     </div>`).join('');
  slashList.querySelectorAll('.slash-item').forEach(el => {
    el.addEventListener('mousedown', e => { e.preventDefault(); slashIdx = +el.dataset.i; slashPick(); });
  });
}
function slashMove(d){
  slashIdx = (slashIdx + d + slashMatches.length) % slashMatches.length;
  renderSlash();
}
function slashPick(){
  const s = slashMatches[slashIdx];
  if(!s) return;
  chatInput.value = chatInput.value.replace(/(?:^|\s)\/[a-z0-9-]*$/i, ' ').trim();
  setPendingSkill(s); // real skill: loaded as system prompt on send
  hideSlash(); chatInput.focus(); autosize();
}
function hideSlash(){ slashOpen = false; slashList.classList.add('hidden'); }
document.addEventListener('click', e => { if(!e.target.closest('#slash-wrap') && !e.target.closest('#chat-input')) hideSlash(); });

/* ---------- Skills panel ---------- */
function renderSkills(filter){
  const grid = $('#skills-grid');
  const q = (filter || '').trim().toLowerCase();
  const list = SKILLS.filter(s => !q || s.name.includes(q) || s.ar.includes(q));
  $('#skills-count').textContent = list.length + ' / ' + SKILLS.length;
  grid.innerHTML = list.map(s => `
    <div class="card">
      <h3><span class="mono">/${esc(s.name)}</span></h3>
      <p><b>${esc(s.ar)}</b><br>${esc(s.desc.length > 180 ? s.desc.slice(0,180) + '…' : s.desc)}</p>
      <div class="row"><span class="tag">مهارة</span>
        <button class="use-btn" data-skill="${esc(s.name)}">استخدام ←</button></div>
    </div>`).join('') || '<p class="empty">لا توجد مهارات مطابقة.</p>';
  grid.querySelectorAll('.use-btn').forEach(b => b.addEventListener('click', () => {
    const s = SKILLS.find(x => x.name === b.dataset.skill);
    if(s) setPendingSkill(s); // pre-load the real skill as a chip in the chat input
    document.querySelector('[data-view="chat"]').click();
    chatInput.focus(); autosize();
  }));
}
$('#skills-search').addEventListener('input', e => renderSkills(e.target.value));

/* ---------- Plugins panel ---------- */
function getPlugins(){
  try{ return Object.assign({ 'agents-md': true, 'motionsites-web-builder': true }, JSON.parse(localStorage.getItem(PLUGINS_KEY) || '{}')); }
  catch(e){ return { 'agents-md': true, 'motionsites-web-builder': true }; }
}
function pluginRowHtml(p, state){
  return `<div class="plugin-row">
    <span class="plugin-doc"><svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 2v6h6M9 13h6M9 17h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>
    <div class="plugin-txt"><strong>${esc(p.ar)}</strong><small>${esc(p.desc)}</small></div>
    <label class="switch"><input type="checkbox" data-plugin="${esc(p.name)}" ${state[p.name] ? 'checked' : ''}><span class="track"></span></label>
  </div>`;
}
function renderPlugins(){
  const state = getPlugins();
  $('#plugins-grid').innerHTML = PLUGINS.map(p => `
    <div class="card">
      <h3>${esc(p.ar)} <span class="mono" style="font-size:12px;color:var(--faint)" dir="ltr">${esc(p.name)}</span></h3>
      <p>${esc(p.desc)}</p>
      <div class="row">
        <span class="tag">${p.builtin ? 'مدمجة' : 'خارجية'}</span>
        <label class="switch"><input type="checkbox" data-plugin="${esc(p.name)}" ${state[p.name] ? 'checked' : ''}><span class="track"></span></label>
      </div>
    </div>`).join('');
  renderHomePlugins(state);
}
function renderHomePlugins(state){
  state = state || getPlugins();
  const el = $('#home-plugins');
  if(el) el.innerHTML = PLUGINS.map(p => pluginRowHtml(p, state)).join('');
}
/* delegated toggle: keeps the plugins view and the home rows in sync */
document.addEventListener('change', e => {
  const t = e.target.closest && e.target.closest('[data-plugin]');
  if(!t) return;
  const s = getPlugins(); s[t.dataset.plugin] = t.checked;
  localStorage.setItem(PLUGINS_KEY, JSON.stringify(s));
  document.querySelectorAll('[data-plugin="' + t.dataset.plugin + '"]').forEach(el => { el.checked = t.checked; });
});

/* ---------- Agents panel (real: via relay backend) ---------- */
let agentSeq = 0;
const agentSessions = new Map(); // id -> {timer, poll, stopFlag}
const AGENT_PREFIX = {'general':'[general agent]', 'browser-task':'[browser-task agent]', 'researcher':'[researcher agent]'};

function renderAgentTypes(){
  $('#agent-types').innerHTML = AGENT_TYPES.map(a => `
    <div class="card">
      <h3>${esc(a.ar)} <span class="mono" style="font-size:12px;color:var(--faint)" dir="ltr">${esc(a.id)}</span></h3>
      <p>${esc(a.desc)}</p>
      <input class="agent-task" data-agent-input="${esc(a.id)}" placeholder="صف مهمة الوكيل…" aria-label="مهمة الوكيل">
      <div class="row"><span class="tag">وكيل حقيقي</span>
        <button class="use-btn" data-agent="${esc(a.id)}">تشغيل ←</button></div>
    </div>`).join('');
  document.querySelectorAll('[data-agent]').forEach(b => b.addEventListener('click', () => runAgent(b.dataset.agent)));
  document.querySelectorAll('[data-agent-input]').forEach(inp => inp.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); runAgent(inp.dataset.agentInput); }
  }));
}

/* shared relay job poller: resolves on done/error, rejects on timeout */
function pollRelayJob(jobId, timeoutMs){
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let busy = false;
    const t = setInterval(async () => {
      if(busy) return;
      if(Date.now() - started > (timeoutMs || 180000)){ clearInterval(t); reject(new Error('timeout')); return; }
      busy = true;
      try{
        const r = await fetch(RELAY_URL + '?jobId=' + encodeURIComponent(jobId), {headers: {'X-Relay-Key': linkKey()}});
        const j = await r.json().catch(() => ({}));
        if(j.status === 'done' || j.status === 'error'){ clearInterval(t); resolve(j); }
      }catch(e){ /* transient — keep polling */ }
      finally{ busy = false; }
    }, 1500);
  });
}

async function runAgent(typeId){
  const t = AGENT_TYPES.find(a => a.id === typeId) || {ar: typeId};
  const input = document.querySelector(`[data-agent-input="${CSS.escape(typeId)}"]`);
  const taskText = (input && input.value || '').trim();
  if(!taskText){
    if(input){ input.focus(); input.classList.add('input-err'); setTimeout(() => input.classList.remove('input-err'), 1200); }
    return;
  }
  if(chatMode === 'relay' && relayState !== 'connected'){
    await activateRelay();
    if(relayState !== 'connected') return;
  }
  if(chatMode !== 'relay'){
    addAgentNotice('الوكلاء يعملون عبر وسيط كلاود — اضغط «تشغيل كلاود» في المحادثة أولًا.');
    return;
  }
  if(input) input.value = '';

  const id = 'agent-' + (++agentSeq);
  const started = Date.now();
  const list = $('#sessions-list');
  const empty = list.querySelector('.empty'); if(empty) empty.remove();
  const div = document.createElement('div');
  div.className = 'session agent-session'; div.dataset.asess = id;
  div.innerHTML = `<span class="pulse"></span>
    <div class="sess-main">
      <div class="sess-head"><span class="stype">${esc(t.ar)}</span><span class="stime mono" dir="ltr">0s</span><span class="grow"></span><button class="ghost-btn" data-astop>إيقاف</button></div>
      <div class="sess-task">${esc(taskText)}</div>
      <div class="sess-output"><span class="stream-cursor"></span></div>
    </div>`;
  list.prepend(div);
  const outEl = div.querySelector('.sess-output');
  const timeEl = div.querySelector('.stime');
  const timer = setInterval(() => { if(timeEl) timeEl.textContent = Math.floor((Date.now() - started) / 1000) + 's'; }, 1000);
  const sess = {timer, stopped: false, poll: null};
  agentSessions.set(id, sess);
  $('#sessions-count').textContent = agentSessions.size;
  div.querySelector('[data-astop]').addEventListener('click', () => stopAgent(id, 'أُوقفت الجلسة.'));

  const setOut = (txt, isErr) => {
    outEl.innerHTML = '';
    if(isErr){ outEl.innerHTML = '<p class="sess-err">⚠️ ' + esc(txt) + '</p>'; }
    else { const pre = document.createElement('div'); pre.className = 'sess-text'; pre.textContent = txt; outEl.appendChild(pre); }
  };

  let jobId;
  try{
    const res = await fetch(RELAY_URL, {
      method:'POST', headers: relayHeaders(),
      body: JSON.stringify({type:'agent', task: (AGENT_PREFIX[typeId] || '[agent]') + ' ' + taskText}),
    });
    if(res.status === 404) throw new Error('خدمة وسيط كلاود غير منشورة بعد.');
    if(!res.ok) throw new Error('تعذّر بدء الوكيل (خطأ ' + res.status + ').');
    const j = await res.json().catch(() => ({}));
    jobId = j && j.jobId;
    if(!jobId) throw new Error('الوسيط لم يُرجع معرّف مهمة.');
  }catch(err){
    clearInterval(timer); agentSessions.delete(id);
    setOut(err && err.message ? err.message : 'تعذّر بدء الوكيل.', true);
    div.querySelector('[data-astop]').remove();
    div.querySelector('.pulse').style.background = 'var(--red)';
    $('#sessions-count').textContent = agentSessions.size;
    return;
  }

  let raw = '', busy = false;
  sess.poll = setInterval(async () => {
    if(busy || sess.stopped) return;
    if(Date.now() - started > 300000){ stopAgent(id, 'انتهت مهلة الوكيل (5 دقائق).'); return; }
    busy = true;
    try{
      const r = await fetch(RELAY_URL + '?jobId=' + encodeURIComponent(jobId), {headers: {'X-Relay-Key': linkKey()}});
      const j = await r.json().catch(() => ({}));
      if(typeof j.text === 'string' && j.text.length > raw.length){
        raw = j.text;
        outEl.innerHTML = '';
        const pre = document.createElement('div'); pre.className = 'sess-text'; pre.textContent = raw;
        const cur = document.createElement('span'); cur.className = 'stream-cursor';
        outEl.appendChild(pre); outEl.appendChild(cur);
      }
      if(j.status === 'done'){
        clearInterval(sess.poll); clearInterval(timer); agentSessions.delete(id);
        const c = outEl.querySelector('.stream-cursor'); if(c) c.remove();
        outEl.innerHTML = renderMarkdown(raw || '(لا نتيجة)');
        highlightAll(outEl);
        notifyDone('agent', raw);
        div.querySelector('.pulse').style.background = 'var(--green)';
        div.querySelector('[data-astop]').remove();
        $('#sessions-count').textContent = agentSessions.size;
      }else if(j.status === 'error'){
        stopAgent(id, String(j.error || 'خطأ من الوكيل.'));
      }
    }catch(e){ /* transient — keep polling */ }
    finally{ busy = false; }
  }, 1500);
}

function stopAgent(id, note){
  const sess = agentSessions.get(id);
  const div = document.querySelector(`[data-asess="${id}"]`);
  if(sess){ clearInterval(sess.poll); clearInterval(sess.timer); sess.stopped = true; agentSessions.delete(id); }
  if(div){
    const c = div.querySelector('.stream-cursor'); if(c) c.remove();
    div.querySelector('.pulse').style.background = 'var(--yellow)';
    const btn = div.querySelector('[data-astop]'); if(btn) btn.remove();
    if(note){
      const p = document.createElement('p'); p.className = 'sess-note'; p.textContent = note;
      div.querySelector('.sess-main').appendChild(p);
    }
  }
  const list = $('#sessions-list');
  $('#sessions-count').textContent = agentSessions.size;
  if(!agentSessions.size && !list.children.length) list.innerHTML = '<p class="empty">لا توجد جلسات بعد — اكتب مهمة وشغّل وكيلًا من الأعلى.</p>';
}

function addAgentNotice(msg){
  const list = $('#sessions-list');
  const empty = list.querySelector('.empty'); if(empty) empty.remove();
  const p = document.createElement('p');
  p.className = 'empty sess-err'; p.textContent = msg;
  list.prepend(p);
  setTimeout(() => { p.remove(); if(!list.children.length) list.innerHTML = '<p class="empty">لا توجد جلسات بعد — اكتب مهمة وشغّل وكيلًا من الأعلى.</p>'; }, 6000);
}

/* ---------- Providers: dedicated key screen — per-card paste + add ---------- */
const STATUS_AR = {ok:'يعمل', down:'متوقف', warn:'محدود', skip:'متخطى', unknown:'غير معروف'};
function renderProviders(){
  // Each provider card: name + one-line description + key link + its own paste field + add button
  const grid = $('#providers-grid');
  if(!grid) return;
  $('#providers-count').textContent = PROVIDER_CATALOG.length;
  grid.innerHTML = PROVIDER_CATALOG.map(p => `
    <div class="card prov-card" data-ptype="${esc(p.type)}">
      <h3>${esc(p.label)}</h3>
      <p>${esc(p.desc || '')}</p>
      <a class="key-link" href="${esc(p.keyUrl)}" target="_blank" rel="noopener">🔑 احصل على مفتاح API</a>
      <div class="prov-add-row">
        <input type="password" class="prov-key-input" dir="ltr" placeholder="الصق مفتاح API هنا" autocomplete="new-password" aria-label="مفتاح API — ${esc(p.label)}">
        <button class="primary-btn prov-add-btn">إضافة</button>
      </div>
      <span class="prov-msg" role="status"></span>
    </div>`).join('');
  grid.querySelectorAll('.prov-card').forEach(card => {
    const type = card.dataset.ptype;
    const input = card.querySelector('.prov-key-input');
    const btn = card.querySelector('.prov-add-btn');
    const msg = card.querySelector('.prov-msg');
    const setMsg = (t, kind) => { msg.textContent = t; msg.className = 'prov-msg' + (kind ? ' ' + kind : ''); };
    btn.addEventListener('click', () => addProviderCard(type, input, btn, setMsg));
    input.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); addProviderCard(type, input, btn, setMsg); } });
  });
}
async function addProviderCard(provider, input, btn, setMsg){
  const key = input.value.trim();
  if(!key){ setMsg('الصق مفتاح API أولًا.', 'err'); input.focus(); return; }
  const name = 'user-' + provider;
  btn.disabled = true; setMsg('جارٍ إضافة المزود والتحقق منه داخل الساندبوكس…', 'busy');
  try{
    if(chatMode === 'relay' && relayState !== 'connected') await activateRelay();
    const res = await fetch(RELAY_URL, {
      method: 'POST', headers: relayHeaders(),
      body: JSON.stringify({type: 'addProvider', provider, name, key}),
    });
    if(!res.ok) throw new Error('تعذّر بدء الإضافة (خطأ ' + res.status + ').');
    const j0 = await res.json().catch(() => ({}));
    if(!j0.jobId) throw new Error('الوسيط لم يُرجع معرّف مهمة.');
    const done = await pollRelayJob(j0.jobId, 90000);
    if(done.status === 'error') throw new Error(String(done.error || 'فشل التحقق من المزود.'));
    const models = (done.result && Array.isArray(done.result.models)) ? done.result.models : [];
    const cat = PROVIDER_CATALOG.find(c => c.type === provider);
    const label = (cat && cat.label) || provider;
    const list = getUserProviders().filter(p => p.name !== name);
    // Save the key in THIS browser only, so providers can be restored on a new sandbox without re-typing
    list.unshift({name, provider, label, models, status: 'ok', addedAt: Date.now(), key});
    saveUserProviders(list);
    renderUserProviders();
    buildModelPicker();
    input.value = '';
    setMsg(`تمت إضافة «${label}» والتحقق منه بنجاح ✓ (المفتاح محفوظ في متصفحك فقط)`, 'ok');
    toast(`تمت إضافة المزود «${label}» بنجاح`, 'ok');
  }catch(err){
    setMsg(err && err.message ? err.message : 'تعذّرت الإضافة.', 'err');
    toast('فشلت إضافة المزود', 'err');
  }
  btn.disabled = false;
}
/* ---------- Providers: status refresh ---------- */
$('#providers-refresh').addEventListener('click', async () => {
  const btn = $('#providers-refresh'); btn.disabled = true; btn.textContent = 'يفحص…';
  try{
    if(chatMode === 'relay' && relayState !== 'connected') await activateRelay();
    if(chatMode !== 'relay' || relayState !== 'connected')
      throw new Error('فعّل «تشغيل كلاود» أولًا لفحص المزودين.');
    const res = await fetch(RELAY_URL, {
      method:'POST', headers: relayHeaders(),
      body: JSON.stringify({type:'status'}),
    });
    if(res.status === 404) throw new Error('خدمة وسيط كلاود غير منشورة بعد.');
    if(!res.ok) throw new Error('تعذّر بدء الفحص (خطأ ' + res.status + ').');
    const j = await res.json().catch(() => ({}));
    if(!j.jobId) throw new Error('الوسيط لم يُرجع معرّف مهمة.');
    const done = await pollRelayJob(j.jobId, 60000);
    if(done.status === 'error') throw new Error(String(done.error || 'خطأ في الفحص.'));
    let map;
    try{ map = JSON.parse(done.text || '{}'); }
    catch(e){ throw new Error('رد الفحص غير صالح.'); }
    applyProviderStatus(map);
    btn.textContent = 'تم التحديث ✓';
  }catch(err){
    btn.textContent = (err && err.message) ? err.message : 'تعذّر الفحص';
  }
  setTimeout(() => { btn.disabled = false; btn.textContent = 'تحديث الحالة'; }, 2500);
});

/* Provider status refresh — checks user's own added providers via relay */
function applyProviderStatus(map){
  // Status now applies to user-added providers only; catalog has no fake status.
  renderUserProviders();
}

/* ---------- Restore providers on a new sandbox ---------- */
$('#providers-restore').addEventListener('click', async () => {
  const saved = getUserProviders().filter(p => p.key);
  if (!saved.length) { toast('لا توجد مفاتيح محفوظة للاستعادة', 'err'); return; }
  if (!confirm(`إعادة تسجيل ${saved.length} مزود في الساندبوكس الحالي؟`)) return;
  const btn = $('#providers-restore'); btn.disabled = true; btn.textContent = 'جارٍ الاستعادة…';
  let ok = 0, fail = 0;
  for (const p of saved) {
    try {
      const res = await fetch(RELAY_URL, {
        method: 'POST', headers: relayHeaders(),
        body: JSON.stringify({ type: 'addProvider', provider: p.provider, name: p.name, key: p.key }),
      });
      const j0 = await res.json().catch(() => ({}));
      if (!j0.jobId) throw new Error('no job');
      const done = await pollRelayJob(j0.jobId, 90000);
      if (done.status === 'error') throw new Error(done.error || 'failed');
      const models = (done.result && Array.isArray(done.result.models)) ? done.result.models : [];
      p.models = models; p.status = 'ok'; ok++;
    } catch (e) { p.status = 'error'; fail++; }
  }
  saveUserProviders(getUserProviders());
  renderUserProviders(); buildModelPicker();
  btn.disabled = false; btn.textContent = '↻ استعادة المزودين';
  toast(`تمت استعادة ${ok} مزود${fail ? ` — فشل ${fail}` : ''}`, ok ? 'ok' : 'err');
});

/* ---------- User-added providers (localStorage, real OmniRoute via relay) ---------- */
const USER_PROV_KEY = 'ccw_user_providers_v1';
function getUserProviders(){
  try{ const l = JSON.parse(localStorage.getItem(USER_PROV_KEY) || '[]'); return Array.isArray(l) ? l : []; }
  catch(e){ return []; }
}
function saveUserProviders(list){
  try{ localStorage.setItem(USER_PROV_KEY, JSON.stringify(list)); }catch(e){}
}
const PROV_TYPE_AR = {openai:'OpenAI', anthropic:'Anthropic', google:'Google', groq:'Groq', mistral:'Mistral', cohere:'Cohere', deepseek:'DeepSeek', xai:'xAI', openrouter:'OpenRouter', together:'Together AI', fireworks:'Fireworks', novita:'Novita'};
function renderUserProviders(){
  const list = getUserProviders();
  $('#user-providers-count').textContent = list.length;
  const grid = $('#user-providers-grid');
  const empty = $('#user-providers-empty');
  if(!list.length){
    grid.innerHTML = '<p class="empty" id="user-providers-empty">لم تضف أي مزود بعد — أضف مفتاحك من الأعلى.</p>';
    return;
  }
  grid.innerHTML = list.map((p, i) => `
    <div class="card user-prov">
      <h3><span class="status-dot ${p.status || 'ok'}"></span>${esc(p.label || p.name)}</h3>
      <p>${esc((PROV_TYPE_AR[p.provider] || p.provider) + ' — يعمل داخل الساندبوكس')}</p>
      ${p.models && p.models.length ? `<div class="models-list">${p.models.slice(0, 6).map(m => `<span class="model-chip">${esc(m)}</span>`).join('')}</div>` : ''}
      <div class="row"><span class="tag">${STATUS_AR[p.status] || 'يعمل'}</span>
        <button class="del-prov" data-delprov="${i}">حذف</button></div>
    </div>`).join('');
  grid.querySelectorAll('[data-delprov]').forEach(b => b.addEventListener('click', () => {
    const l = getUserProviders();
    l.splice(+b.dataset.delprov, 1);
    saveUserProviders(l);
    renderUserProviders();
    buildModelPicker();
    toast('تم حذف المزود من القائمة المحلية.');
  }));
}

/* ---------- Files panel ---------- */
const filesEl = $('#files-list');
const dropzone = $('#dropzone');
const fileInput = $('#file-input');
const uploadedFiles = [];
const attachedFiles = [];
function handleFiles(list){
  for(const f of list){
    const rec = {name: f.name, size: f.size, type: f.type, url: URL.createObjectURL(f), textContent: null};
    uploadedFiles.push(rec);
    if(f.type.startsWith('text/') || /\.(md|txt|json|js|ts|css|html|py|sh|yaml|yml|toml)$/i.test(f.name)){
      const r = new FileReader();
      r.onload = () => { rec.textContent = String(r.result || '').slice(0, 20000); };
      r.readAsText(f);
    }
    addFileRow(rec);
  }
}
function addFileRow(rec){
  const div = document.createElement('div');
  div.className = 'file-row';
  const thumb = rec.type.startsWith('image/')
    ? `<img class="file-thumb" src="${rec.url}" alt="">`
    : `<div class="file-icon">${esc((rec.name.split('.').pop() || '?').slice(0,4))}</div>`;
  div.innerHTML = `${thumb}
    <div><div class="fname">${esc(rec.name)}</div><div class="fsize">${fmtBytes(rec.size)}</div></div>
    <span class="grow"></span>
    <button class="ghost-btn" data-preview>معاينة</button>
    <button class="use-btn" data-attach>إرفاق</button>`;
  div.querySelector('[data-preview]').addEventListener('click', () => previewFile(rec));
  div.querySelector('[data-attach]').addEventListener('click', () => attachFile(rec));
  filesEl.prepend(div);
}
function previewFile(rec){
  if(rec.type.startsWith('image/')) window.open(rec.url, '_blank');
  else if(rec.textContent !== null){
    addMessage('assistant', `<p><b>معاينة: ${esc(rec.name)}</b></p><pre><code>${esc(rec.textContent.slice(0,1500))}</code></pre>`);
    document.querySelector('[data-view="chat"]').click();
  } else {
    addMessage('assistant', `<p>لا توجد معاينة نصية لـ <b>${esc(rec.name)}</b> — يمكنك إرفاقه مع رسالتك.</p>`);
    document.querySelector('[data-view="chat"]').click();
  }
}
function attachFile(rec){
  if(attachedFiles.includes(rec)) return;
  attachedFiles.push(rec);
  renderChips();
  document.querySelector('[data-view="chat"]').click();
  chatInput.focus();
}
function renderChips(){
  $('#attach-chips').innerHTML = attachedFiles.map((f, i) => {
    const thumb = f.type && f.type.startsWith('image/')
      ? `<img class="chip-thumb" src="${f.url}" alt="">`
      : `<span class="chip-fico">${esc(((f.name || '?').split('.').pop() || '?').slice(0, 4).toUpperCase())}</span>`;
    return `<span class="chip">${thumb}<span class="chip-meta"><span class="chip-name">${esc(f.name)}</span><span class="chip-size">${esc(fmtBytes(f.size || 0))}</span></span><button data-unattach="${i}" aria-label="إزالة">✕</button></span>`;
  }).join('');
  document.querySelectorAll('[data-unattach]').forEach(b => b.addEventListener('click', () => {
    attachedFiles.splice(+b.dataset.unattach, 1); renderChips();
  }));
}
function clearAttachments(){ attachedFiles.length = 0; renderChips(); }

/* ---------- Chat drag & drop: premium overlay, direct attach ---------- */
const chatView = $('#view-chat'), chatDrop = $('#chat-drop');
let chatDragDepth = 0;
chatView.addEventListener('dragenter', e => {
  e.preventDefault();
  if(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')){
    chatDragDepth++;
    chatDrop.classList.remove('hidden');
  }
});
chatView.addEventListener('dragover', e => e.preventDefault());
chatView.addEventListener('dragleave', e => {
  e.preventDefault();
  chatDragDepth = Math.max(0, chatDragDepth - 1);
  if(chatDragDepth === 0) chatDrop.classList.add('hidden');
});
chatView.addEventListener('drop', e => {
  e.preventDefault();
  chatDragDepth = 0;
  chatDrop.classList.add('hidden');
  const files = e.dataTransfer && e.dataTransfer.files;
  if(files && files.length){
    const before = new Set(uploadedFiles);
    handleFiles(files);
    // attach the newly added files directly to the chat
    for(const rec of uploadedFiles){
      if(!before.has(rec)) attachFile(rec);
    }
    toast(`تم إرفاق ${files.length} ملف — جاهز للإرسال`, 'ok');
  }
});
$('#browse-btn').addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });
['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
$('#attach-btn').addEventListener('click', () => {
  document.querySelector('[data-view="files"]').click();
});

/* ---------- Browser panel ---------- */
const browserFrame = $('#browser-frame');
const browserUrl = $('#browser-url');
function loadBrowserUrl(){
  let u = browserUrl.value.trim();
  if(!u) return;
  if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
  browserUrl.value = u;
  browserFrame.src = u;
  $('#browser-note').textContent = 'جارٍ التحميل: ' + u;
}
$('#browser-go').addEventListener('click', loadBrowserUrl);
browserUrl.addEventListener('keydown', e => { if(e.key === 'Enter') loadBrowserUrl(); });
$('#browser-back').addEventListener('click', () => { try{ browserFrame.contentWindow.history.back(); }catch(e){} });
$('#browser-fwd').addEventListener('click', () => { try{ browserFrame.contentWindow.history.forward(); }catch(e){} });
$('#browser-reload').addEventListener('click', () => browserFrame.contentWindow.location.reload());
browserFrame.addEventListener('load', () => {
  try{ $('#browser-note').textContent = 'تم التحميل: ' + browserFrame.contentWindow.location.href; }
  catch(e){ $('#browser-note').textContent = 'تم التحميل — الموقع يمنع قراءة العنوان (سياسة الأمان).'; }
});

/* ---------- Connection status ---------- */
function setConn(ok){
  manualConn = !!ok;
  if(chatMode !== 'manual') return;
  const pill = $('#conn-pill');
  pill.classList.toggle('ok', !!ok);
  pill.classList.toggle('bad', !ok);
  $('#conn-label').textContent = ok ? 'متصل' : 'غير متصل';
}
$('#conn-pill').addEventListener('click', async () => {
  if(chatMode === 'relay'){ activateRelay(); return; }
  $('#conn-label').textContent = 'يفحص…';
  try{
    const res = await fetch(settings.endpoint.replace(/\/+$/,'') + '/models', {
      headers: settings.apiKey ? {Authorization:'Bearer ' + settings.apiKey} : {},
    });
    setConn(res.ok);
  }catch(e){ setConn(false); }
});

/* ---------- Wake button (GitHub Codespace) ---------- */
const wakeBtn = $('#wake-btn'), wakeLabel = $('#wake-label');
let sandboxDead = false;
async function checkWakeStatus(){
  if(!RELAY_URL) await refreshTunnelUrl();
  if(!RELAY_URL){ setWakeUI('dead'); return; }
  try{
    const res = await fetch(RELAY_URL + '?wake=status', {headers: {'X-Relay-Key': linkKey()}});
    const j = await res.json();
    if(j.state === 'Available'){ setWakeUI('running'); sandboxDead = false; }
    else setWakeUI('dead');
  }catch(e){
    // tunnel unreachable — maybe a new sandbox registered a new URL
    const before = RELAY_URL;
    await refreshTunnelUrl();
    if(RELAY_URL && RELAY_URL !== before){ checkWakeStatus(); return; }
    setWakeUI('dead'); sandboxDead = true;
  }
}
function setWakeUI(state){
  wakeBtn.classList.remove('waking', 'running');
  wakeBtn.disabled = false;
  if(state === 'running'){ wakeBtn.classList.add('running'); wakeLabel.textContent = 'يعمل'; }
  else if(state === 'waking'){ wakeBtn.classList.add('waking'); wakeLabel.textContent = 'يستيقظ…'; wakeBtn.disabled = true; }
  else { wakeLabel.textContent = 'تشغيل'; wakeBtn.title = 'الساندبوكس مطفأ — اضغط للتشغيل المباشر'; }
}
const WAKE_URL = 'https://wake-relay-cxp4.onrender.com';
wakeBtn.addEventListener('click', async () => {
  if(sandboxDead || wakeLabel.textContent === 'تشغيل'){
    // One-click wake: the Render wake service starts the codespace via GitHub API.
    // (Render free sleeps when idle — first request may take ~50s to cold-start.)
    setWakeUI('waking'); wakeLabel.textContent = 'يستيقظ…';
    toast('جارٍ تشغيل الساندبوكس…', 'ok');
    try{
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 90000);
      const r = await fetch(WAKE_URL + '/wake', {method: 'POST', signal: ctl.signal});
      clearTimeout(t);
      const j = await r.json().catch(() => ({}));
      if(j.state === 'Available'){ toast('الساندبوكس يعمل بالفعل', 'ok'); }
      else if(j.state === 'starting'){ toast('بدأ التشغيل — سيتصل الموقع تلقائيًا', 'ok'); }
      else { toast('تعذّر التشغيل: ' + (j.error || j.state || '؟'), 'err'); }
    }catch(e){
      toast('خدمة الإيقاظ لا ترد — حاول مجددًا بعد دقيقة', 'err');
    }
    // watch for the new tunnel URL
    for(let i = 0; i < 40; i++){
      await new Promise(r => setTimeout(r, 15000));
      const before = RELAY_URL;
      await refreshTunnelUrl();
      if(RELAY_URL && RELAY_URL !== before){ checkWakeStatus(); return; }
    }
    checkWakeStatus();
    return;
  }
  // tunnel alive — nothing to wake
  checkWakeStatus();
});
// check status on load
checkWakeStatus();
// Honest status: re-check every 60s while the page is visible, so the
// indicator never lies (codespaces auto-sleep after 30 min idle).
setInterval(() => { if(!document.hidden) checkWakeStatus(); }, 60000);

/* ---------- Stop sandbox (real: polls until actually shut down) ---------- */
const stopTopBtn = $('#stop-btn-top'), stopLabel = $('#stop-label');
if (stopTopBtn) stopTopBtn.addEventListener('click', async () => {
  if (!confirm('إطفاء الساندبوكس؟ ستتوقف جميع المهام الجارية.')) return;
  stopTopBtn.disabled = true; stopLabel.textContent = 'يُطفأ…';
  try {
    const res = await fetch(RELAY_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
    await res.json().catch(() => ({}));
    // Poll until GitHub confirms shutdown (stop takes ~30-60s)
    let done = false;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 10000));
      try {
        const s = await fetch(RELAY_URL + '?wake=status', {headers: {'X-Relay-Key': linkKey()}}).then(r => r.json());
        if (s.state === 'Shutdown') { done = true; break; }
      } catch (e) {}
    }
    stopLabel.textContent = 'إطفاء';
    toast(done ? 'تم إطفاء الساندبوكس ✓' : 'أُرسل أمر الإطفاء — تحقق من الحالة', done ? 'ok' : 'warn');
    checkWakeStatus();
  } catch (e) { stopLabel.textContent = 'إطفاء'; toast('تعذّر الإطفاء', 'err'); }
  stopTopBtn.disabled = false;
});

/* ---------- ⓘ Button explanations ---------- */
const TB_INFO = {
  conn: '«وضع كلاود»: طريقة اتصالك الحالية. طلباتك تمر عبر وسيط آمن إلى الساندبوكس — لا تحتاج أي إعدادات. اضغط الزر نفسه لفحص الاتصال.',
  wake: 'حالة الساندبوكس الحقيقية الآن — تُفحص تلقائيًا كل دقيقة. أخضر «يعمل» = شغّال وجاهز. «تشغيل» = مطفأ؛ اضغطه فيشتغل مباشرة من هنا (يستغرق 1–3 دقائق).',
  stop: 'يطفئ الساندبوكس فعلًا لتوفير ساعاتك المجانية. ملفاتك محفوظة في GitHub ولن تضيع. أعد التشغيل بزر «إيقاظ».',
  notify: 'إشعارات المتصفح: تُعلمك عند اكتمال مهمة طويلة (رد كلاود كود، لقطة، ترحيل) حتى لو كنت في تبويب آخر.',
  settings: 'إعدادات الاتصال: نقطة النهاية (endpoint)، المفتاح، والنموذج الافتراضي — للحالات المتقدمة فقط.',
};
const tbPop = $('#tb-pop');
document.querySelectorAll('.tb-info').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const key = btn.dataset.info;
    const wasOpen = !tbPop.classList.contains('hidden') && tbPop.dataset.for === key;
    if (wasOpen) { tbPop.classList.add('hidden'); return; }
    tbPop.textContent = TB_INFO[key] || '';
    tbPop.dataset.for = key;
    tbPop.classList.remove('hidden');
    const r = btn.getBoundingClientRect(), pr = tbPop.parentElement.getBoundingClientRect();
    tbPop.style.top = (r.bottom - pr.top + 8) + 'px';
    tbPop.style.insetInlineEnd = Math.max(8, pr.right - r.right) + 'px';
  });
});
document.addEventListener('click', (e) => {
  if (!tbPop.classList.contains('hidden') && !e.target.closest('#tb-pop') && !e.target.closest('.tb-info'))
    tbPop.classList.add('hidden');
});

/* ---------- Settings modal ---------- */
const modal = $('#settings-modal');
function openSettings(){
  $('#set-endpoint').value = settings.endpoint;
  $('#set-key').value = settings.apiKey;
  $('#set-linkkey').value = linkKey();
  $('#set-linkkey').placeholder = linkKey() ? '•••••••• (محفوظ)' : 'الصقه من الساندبوكس: cat ~/.omniroute/relay.key';
  const sel = $('#set-model');
  sel.innerHTML = MODELS.map(m => `<option value="${esc(m)}"${m === settings.model ? ' selected' : ''}>${esc(m)}</option>`).join('');
  if(!MODELS.includes(settings.model)){
    const o = document.createElement('option'); o.value = settings.model; o.textContent = settings.model; o.selected = true;
    sel.appendChild(o);
  }
  $('#settings-msg').textContent = ''; $('#settings-msg').className = 'settings-msg';
  modal.classList.remove('hidden');
}
function closeSettings(){ modal.classList.add('hidden'); }
$('#settings-btn').addEventListener('click', openSettings);
$('#settings-close').addEventListener('click', closeSettings);
modal.addEventListener('click', e => { if(e.target === modal) closeSettings(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape' && !modal.classList.contains('hidden')) closeSettings(); });
$('#settings-save').addEventListener('click', () => {
  settings.endpoint = $('#set-endpoint').value.trim() || '';
  settings.apiKey = $('#set-key').value;
  settings.model = $('#set-model').value;
  const lk = $('#set-linkkey').value.trim();
  if(lk) localStorage.setItem('ccw_link_key', lk);
  saveSettings();
  manualConn = null;
  if(chatMode === 'manual'){
    const cp = $('#conn-pill');
    cp.classList.remove('ok', 'bad');
    $('#conn-label').textContent = 'غير مختبر';
  }
  closeSettings();
});
$('#settings-test').addEventListener('click', async () => {
  const msg = $('#settings-msg');
  const ep = $('#set-endpoint').value.trim() || '';
  const key = $('#set-key').value;
  msg.className = 'settings-msg'; msg.textContent = 'يفحص الاتصال…';
  try{
    const res = await fetch(ep.replace(/\/+$/,'') + '/models', {
      headers: key ? {Authorization:'Bearer ' + key} : {},
    });
    if(res.ok){
      let n = '';
      try{ const j = await res.json(); n = j.data ? ` — ${j.data.length} نموذجًا متاحًا` : ''; }catch(e){}
      msg.className = 'settings-msg ok'; msg.textContent = 'الاتصال يعمل ✓' + n;
      setConn(true);
    } else {
      msg.className = 'settings-msg err'; msg.textContent = friendlyError(res.status, '').replace(/<[^>]+>/g, ' ');
      setConn(false);
    }
  }catch(e){ msg.className = 'settings-msg err'; msg.textContent = 'تعذّر الوصول — تأكد من العنوان وأن البوابة تعمل.'; setConn(false); }
});


/* ================= Terminal view — real commands in the codespace ================= */
const TERM_HIST_KEY = 'ccw_term_hist_v1';
let termHist = [];
try{ termHist = JSON.parse(localStorage.getItem(TERM_HIST_KEY) || '[]'); }catch(e){ termHist = []; }
let termHistIdx = -1;
function termPrint(text, cls){
  const out = $('#term-output');
  if(!out) return;
  const div = document.createElement('div');
  div.className = 'term-line ' + (cls || '');
  div.textContent = text;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}
async function termExec(cmd){
  cmd = (cmd || '').trim();
  if(!cmd) return;
  termPrint('$ ' + cmd, 'term-cmd');
  termHist.push(cmd); if(termHist.length > 50) termHist.shift();
  try{ localStorage.setItem(TERM_HIST_KEY, JSON.stringify(termHist)); }catch(e){}
  termHistIdx = -1;
  termPrint('…', 'term-pending');
  try{
    const res = await fetch(RELAY_URL, {method:'POST', headers: relayHeaders(), body: JSON.stringify({type:'terminal', command: cmd})});
    if(!res.ok) throw new Error('relay ' + res.status);
    const j = await res.json();
    if(!j.jobId) throw new Error('no job');
    const done = await pollRelayJob(j.jobId, 45000);
    const pend = document.querySelector('#term-output .term-pending');
    if(pend) pend.remove();
    if(done.status === 'error'){ termPrint('خطأ: ' + (done.error || 'فشل التنفيذ'), 'term-err'); return; }
    const r = done.result || {};
    termPrint(r.output || '(لا مخرجات)', r.ok ? 'term-out' : 'term-err');
  }catch(e){
    const pend = document.querySelector('#term-output .term-pending');
    if(pend) pend.remove();
    termPrint('تعذّر التنفيذ: ' + (e.message || e), 'term-err');
  }
}
function initTerminal(){
  const input = $('#term-input'), btn = $('#term-exec');
  if(!input || !btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => { termExec(input.value); input.value = ''; input.focus(); });
  input.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); termExec(input.value); input.value = ''; }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); if(termHist.length){ termHistIdx = termHistIdx < 0 ? termHist.length - 1 : Math.max(0, termHistIdx - 1); input.value = termHist[termHistIdx] || ''; } }
    else if(e.key === 'ArrowDown'){ e.preventDefault(); if(termHistIdx >= 0){ termHistIdx++; input.value = termHistIdx >= termHist.length ? '' : termHist[termHistIdx]; if(termHistIdx >= termHist.length) termHistIdx = -1; } }
  });
  const logBtn = $('#term-log-btn');
  if(logBtn && !logBtn.dataset.bound){
    logBtn.dataset.bound = '1';
    logBtn.addEventListener('click', () => termExec('tail -50 ~/.omniroute/worker.log'));
  }
  termPrint('طرفية الساندبوكس — الأوامر تُنفَّذ في بيئة GitHub Codespace (مهلة 30 ثانية).', 'term-info');
  const envBtn = document.querySelector('#env-refresh');
  if(envBtn && !envBtn.dataset.bound){
    envBtn.dataset.bound = '1';
    envBtn.addEventListener('click', () => loadEnv());
  }
  const migBtn = document.querySelector('#migrate-btn');
  if(migBtn && !migBtn.dataset.bound){
    migBtn.dataset.bound = '1';
    migBtn.addEventListener('click', migrateSandbox);
  }
}

/* ---------- One-click sandbox migration: backup → create → wait → restore ---------- */
function migrateLog(msg){
  const el = $('#migrate-status');
  if(!el) return;
  el.classList.remove('hidden');
  const line = document.createElement('div');
  line.innerHTML = `<span class="mig-dot"></span>${esc(msg)}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}
async function migrateSandbox(){
  const btn = $('#migrate-btn');
  const statusEl = $('#migrate-status');
  if(statusEl) statusEl.innerHTML = '';
  if(!confirm('ترحيل كامل لساندبوكس جديد؟\n\n1. نسخ احتياطي لكل الملفات\n2. إنشاء ساندبوكس جديد\n3. انتظار جاهزيته (≈5 دقائق)\n4. استعادة مزوديك تلقائيًا')) return;
  btn.disabled = true;
  try{
    // Step 1: final backup of current sandbox
    migrateLog('① نسخ احتياطي للساندبوكس الحالي…');
    {
      const res = await fetch(RELAY_URL, { method:'POST', headers: relayHeaders(), body: JSON.stringify({type:'sync'}) });
      const j0 = await res.json().catch(()=>({}));
      if(j0.jobId){ const done = await pollRelayJob(j0.jobId, 120000); migrateLog(done.status==='done' ? '✓ تم النسخ الاحتياطي' : '⚠ تعذّر النسخ — نكمل على أي حال'); }
    }
    // Step 2: create new codespace via the worker (gh CLI), then stop the old one
    migrateLog('② إنشاء ساندبوكس جديد (قد يستغرق ~5 دقائق)…');
    const oldTunnel = RELAY_URL;
    {
      const res = await fetch(RELAY_URL, { method:'POST', headers: relayHeaders(), body: JSON.stringify({action:'create'}) });
      const j = await res.json().catch(()=>({}));
      if(j.error) throw new Error(j.error);
      migrateLog('✓ بدأ إنشاء الساندبوكس الجديد' + (j.name ? ` (${j.name})` : ''));
    }
    migrateLog('③ إطفاء الساندبوكس القديم لتوفير الساعات…');
    try{ await fetch(oldTunnel, { method:'POST', headers: relayHeaders(), body: JSON.stringify({action:'stop'}) }); }catch(e){}
    // Step 3: wait for the new worker to publish its tunnel URL
    migrateLog('④ انتظار تسجيل الساندبوكس الجديد…');
    let ready = false;
    for(let i = 0; i < 40; i++){
      await new Promise(r => setTimeout(r, 15000));
      await refreshTunnelUrl();
      if(RELAY_URL && RELAY_URL !== oldTunnel){
        // verify the new tunnel actually answers
        try{ const s = await fetch(RELAY_URL + '?wake=status', {headers: {'X-Relay-Key': linkKey()}}).then(r=>r.json()); if(s.state === 'Available'){ ready = true; break; } }catch(e){}
      }
      if(i % 4 === 3) migrateLog('… ما زال يُجهَّز');
    }
    if(!ready){ migrateLog('⚠ انتهت المهلة — تحقق لاحقًا من زر التشغيل'); btn.disabled = false; return; }
    migrateLog('✓ الساندبوكس الجديد يعمل');
    // Step 4: restore user providers
    const saved = getUserProviders().filter(p => p.key);
    if(saved.length){
      migrateLog(`⑤ استعادة ${saved.length} مزود…`);
      let ok = 0;
      for(const p of saved){
        try{
          const res = await fetch(RELAY_URL, { method:'POST', headers: relayHeaders(), body: JSON.stringify({type:'addProvider', provider:p.provider, name:p.name, key:p.key}) });
          const j0 = await res.json().catch(()=>({}));
          if(j0.jobId){ const done = await pollRelayJob(j0.jobId, 90000); if(done.status !== 'error'){ ok++; const models = (done.result && Array.isArray(done.result.models)) ? done.result.models : []; p.models = models; p.status = 'ok'; } }
        }catch(e){}
      }
      saveUserProviders(getUserProviders()); renderUserProviders(); buildModelPicker();
      migrateLog(`✓ تمت استعادة ${ok}/${saved.length} مزود`);
    } else migrateLog('لا توجد مفاتيح محفوظة للاستعادة');
    migrateLog('🎉 اكتمل الترحيل — كل شيء في الساندبوكس الجديد');
    toast('اكتمل الترحيل بنجاح', 'ok');
    checkWakeStatus(); loadEnv();
  }catch(err){
    migrateLog('⚠ خطأ: ' + (err && err.message ? err.message : 'غير معروف'));
  }
  btn.disabled = false;
}

/* ================= Environment view — real codespace data ================= */
let envTimer = null;
async function loadEnv(){
  const grid = $('#env-stats');
  if(grid) grid.innerHTML = '<p class="empty">جارٍ جلب بيانات البيئة الحقيقية…</p>';
  // 1. Codespace usage from relay
  try{
    const u = await fetch(RELAY_URL + '?usage=codespace', {headers: {'X-Relay-Key': linkKey()}}).then(r => r.json());
    const cards = [];
    const stateAr = {Available:'يعمل', Shutdown:'نائم', ShuttingDown:'يُطفأ…', Starting:'يستيقظ…', Queued:'في الانتظار', Provisioning:'يُجهَّز…', Failed:'فشل'};
    cards.push({label:'حالة البيئة', value: stateAr[u.state] || u.state || '—', sub: u.name || ''});
    if(u.machine) cards.push({label:'نوع الآلة', value: u.machine, sub: ''});
    if(u.storage_gb != null) cards.push({label:'التخزين', value: u.storage_gb + ' GB', sub: ''});
    if(u.idle_timeout_minutes != null) cards.push({label:'مهلة الخمول', value: u.idle_timeout_minutes + ' دقيقة', sub: 'ينام تلقائيًا بعدها'});
    if(u.last_used_at) cards.push({label:'آخر نشاط', value: new Date(u.last_used_at).toLocaleString('ar'), sub: ''});
    if(u.created_at) cards.push({label:'أُنشئت', value: new Date(u.created_at).toLocaleDateString('ar'), sub: ''});
    renderEnvCards(cards, 'codespace');
  }catch(e){
    if(grid) grid.innerHTML = '<p class="empty">تعذّر جلب بيانات البيئة — تأكد أنها تعمل.</p>';
    return;
  }
  // 2. Live env from the worker (disk, mem, versions)
  try{
    const res = await fetch(RELAY_URL, {method:'POST', headers: relayHeaders(), body: JSON.stringify({type:'env'})});
    const j = await res.json();
    if(j.jobId){
      const done = await pollRelayJob(j.jobId, 30000);
      if(done.status === 'done' && done.result){
        const r = done.result;
        const cards = [];
        if(r.disk) cards.push({label:'القرص', value: r.disk, sub: ''});
        if(r.mem) cards.push({label:'الذاكرة', value: r.mem, sub: ''});
        if(r.uptime) cards.push({label:'مدة التشغيل', value: r.uptime, sub: ''});
        if(r.claudeV) cards.push({label:'Claude Code', value: r.claudeV, sub: ''});
        if(r.omniV) cards.push({label:'OmniRoute', value: r.omniV, sub: ''});
        if(r.nodeV) cards.push({label:'Node.js', value: r.nodeV, sub: ''});
        renderEnvCards(cards, 'live');
      }
    }
  }catch(e){ /* live env optional — usage cards already shown */ }
}
function renderEnvCards(cards, cls){
  const grid = $('#env-stats');
  if(!grid) return;
  const wrapId = 'env-' + cls;
  let wrap = document.getElementById(wrapId);
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = wrapId;
    wrap.className = 'env-group';
    grid.appendChild(wrap);
    const loading = grid.querySelector('.empty'); if(loading) loading.remove();
  }
  wrap.innerHTML = cards.map(c => `
    <div class="env-card">
      <span class="env-label">${esc(c.label)}</span>
      <strong class="env-value" dir="auto">${esc(c.value)}</strong>
      ${c.sub ? `<small>${esc(c.sub)}</small>` : ''}
    </div>`).join('');
}

/* ---------- Live view: sandbox browser screenshots + worker activity ---------- */
let liveActivityTimer = null, liveShotTimer = null, liveCapturing = false;

async function ensureRelayForLive(){
  if(chatMode === 'relay' && relayState !== 'connected'){ await activateRelay(); }
  return relayState === 'connected';
}

async function captureScreenshot(){
  if(liveCapturing) return;
  const urlInput = $('#live-url');
  const url = (urlInput.value || '').trim();
  if(!url){ urlInput.focus(); urlInput.classList.add('input-err'); setTimeout(() => urlInput.classList.remove('input-err'), 1200); return; }
  if(!await ensureRelayForLive()) return;
  liveCapturing = true;
  const btn = $('#live-capture-btn');
  btn.disabled = true;
  const meta = $('#live-shot-meta');
  const loading = $('#bw-loading');
  const tabTitle = $('#bw-tab-title');
  if(loading) loading.classList.remove('hidden');
  if(tabTitle) tabTitle.textContent = 'جارٍ التحميل…';
  meta.textContent = 'جارٍ الالتقاط من متصفح الساندبوكس…';
  try{
    const res = await fetch(RELAY_URL, {
      method: 'POST', headers: relayHeaders(),
      body: JSON.stringify({type: 'screenshot', url}),
    });
    if(!res.ok) throw new Error('تعذّر بدء الالتقاط (خطأ ' + res.status + ').');
    const j0 = await res.json().catch(() => ({}));
    if(!j0.jobId) throw new Error('الوسيط لم يُرجع معرّف مهمة.');
    const done = await pollRelayJob(j0.jobId, 60000);
    if(done.status === 'error') throw new Error(String(done.error || 'فشل الالتقاط.'));
    const r = done.result || {};
    if(r.ok && r.image){
      const img = $('#live-shot-img');
      img.src = 'data:image/jpeg;base64,' + r.image;
      img.classList.remove('hidden');
      const empty = $('#live-shot-empty'); if(empty) empty.remove();
      const when = r.takenAt ? new Date(r.takenAt).toLocaleString('ar') : new Date().toLocaleString('ar');
      meta.textContent = 'آخر لقطة: ' + when;
      if(tabTitle){ try{ tabTitle.textContent = new URL(r.url || url).hostname; }catch(e){ tabTitle.textContent = url; } }
      const sizeEl = $('#bw-size'); if(sizeEl) sizeEl.textContent = '1280×800';
    }else{
      throw new Error('لم تصل صورة من الساندبوكس.');
    }
  }catch(err){
    meta.textContent = err && err.message ? err.message : 'تعذّر الالتقاط.';
    if(tabTitle) tabTitle.textContent = 'فشل التحميل';
  }
  if(loading) loading.classList.add('hidden');
  btn.disabled = false;
  liveCapturing = false;
}

function setLiveShotAuto(on){
  if(liveShotTimer){ clearInterval(liveShotTimer); liveShotTimer = null; }
  if(on){
    liveShotTimer = setInterval(() => {
      if(!$('#view-live').classList.contains('active')) return;
      if(!$('#live-url').value.trim()) return;
      captureScreenshot();
    }, 10000);
  }
}

const LIVE_JOB_AR = {chat:'محادثة', agent:'وكيل', claudecode:'كلاود كود', terminal:'طرفية', addProvider:'إضافة مزود', screenshot:'لقطة', activity:'نشاط', status:'حالة', env:'بيئة', skills:'مهارات'};
const LIVE_STATUS_AR = {done:'مكتملة', error:'فشلت', working:'جارية', queued:'بالانتظار'};

async function refreshActivity(){
  const jobsEl = $('#live-jobs');
  const logEl = $('#live-log');
  if(!await ensureRelayForLive()) return;
  try{
    const res = await fetch(RELAY_URL, {
      method: 'POST', headers: relayHeaders(),
      body: JSON.stringify({type: 'activity'}),
    });
    if(!res.ok) throw new Error();
    const j0 = await res.json().catch(() => ({}));
    if(!j0.jobId) throw new Error();
    const done = await pollRelayJob(j0.jobId, 30000);
    if(done.status === 'error') throw new Error(String(done.error || ''));
    const r = done.result || {};
    const recent = Array.isArray(r.recent) ? r.recent : [];
    jobsEl.innerHTML = recent.length
      ? recent.slice(0, 8).map(j => `
        <div class="live-job">
          <span class="status-dot ${esc(j.status || 'queued')}"></span>
          <span class="live-job-type">${esc(LIVE_JOB_AR[j.type] || j.type || '—')}</span>
          <span class="live-job-status">${esc(LIVE_STATUS_AR[j.status] || j.status || '')}</span>
          <time class="live-job-time" dir="ltr">${esc(j.at ? new Date(j.at).toLocaleTimeString('ar') : '')}</time>
        </div>`).join('')
      : '<p class="empty">لا نشاط بعد.</p>';
    logEl.textContent = r.logTail || '—';
  }catch(err){
    jobsEl.innerHTML = '<p class="empty">تعذّر جلب النشاط.</p>';
  }
}

function startLiveActivity(){
  stopLiveActivity();
  refreshActivity();
  liveActivityTimer = setInterval(() => {
    if($('#view-live').classList.contains('active')) refreshActivity();
  }, 5000);
}
function stopLiveActivity(){
  if(liveActivityTimer){ clearInterval(liveActivityTimer); liveActivityTimer = null; }
}

$('#live-capture-btn').addEventListener('click', captureScreenshot);
$('#bw-reload').addEventListener('click', () => { if($('#live-url').value.trim()) captureScreenshot(); });
$('#live-url').addEventListener('keydown', e => { if(e.key === 'Enter') captureScreenshot(); });
$('#live-auto-shot').addEventListener('change', e => setLiveShotAuto(e.target.checked));
$('#live-activity-refresh').addEventListener('click', refreshActivity);

/* ---------- Init (light theme only) ---------- */
document.documentElement.dataset.theme = 'light';
setMode(chatMode);
loadRealSkills();
renderPlugins();
renderAgentTypes();
renderProviders();
renderUserProviders();
buildModelPicker();
initChatSessions();
setBuildMode(buildMode);
updateNotifyBtn();
autosize();
