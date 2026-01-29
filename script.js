import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-auth.js";
import { 
    collection, addDoc, getDocs, doc, setDoc, deleteDoc, query, orderBy, where 
} from "https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js";

let currentDate = new Date();
let currentSelectedDay = null;
let allAgentsCache = []; 
let currentQueue = [];
let rawLeadsCache = []; 

// --- CONTROLO DE AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        initApp();
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "index.html");
});

// --- INICIALIZAÇÃO ---
async function initApp() {
    setupNavigation();
    try {
        await loadAgentsCache();
        await renderCalendar(currentDate);
        loadAgentsTable();
        await initDashboard(); 
    } catch (error) {
        console.error("Erro na inicialização:", error);
    }
    
    document.getElementById('prevMonth').onclick = () => changeMonth(-1);
    document.getElementById('nextMonth').onclick = () => changeMonth(1);
    document.getElementById('btnAddAgent').onclick = addAgent;
    document.getElementById('btnSaveSchedule').onclick = saveDaySchedule;
}

function setupNavigation() {
    const sections = { 'nav-escala': 'escala', 'nav-colab': 'colaboradoras', 'nav-dash': 'dashboard' };
    Object.keys(sections).forEach(navId => {
        document.getElementById(navId).addEventListener('click', (e) => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(sections[navId]).classList.add('active');
        });
    });
}

// --- GESTÃO DE AGENTES ---
async function loadAgentsCache() {
    const q = query(collection(db, "colaboradoras"), orderBy("nome"));
    const snapshot = await getDocs(q);
    allAgentsCache = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        allAgentsCache.push({ id: doc.id, ...data, bitrixId: String(data.bitrixId).trim() });
    });
}

// --- DASHBOARD ANALÍTICO ---
async function initDashboard() {
    const btnFilter = document.getElementById('btnFilterDash');
    const btnClear = document.getElementById('btnClearDash');
    const agentFilter = document.getElementById('dashAgentFilter');

    if(btnFilter) btnFilter.onclick = () => loadCustomDashboard();
    if(btnClear) btnClear.onclick = () => {
        document.getElementById('dashStartDate').value = '';
        document.getElementById('dashEndDate').value = '';
        loadCustomDashboard(); 
    };
    if(agentFilter) agentFilter.onchange = () => renderStatsTable();

    await loadCustomDashboard();
}

async function loadCustomDashboard() {
    const container = document.getElementById('dashboardContainer');
    const start = document.getElementById('dashStartDate').value;
    const end = document.getElementById('dashEndDate').value;
    
    container.innerHTML = '<div style="padding:20px; text-align:center;">A procurar dados...</div>';

    let q;
    const historicoRef = collection(db, "historico_leads");

    try {
        if (start && end) {
            q = query(historicoRef, where("dataString", ">=", start), where("dataString", "<=", end), orderBy("dataString", "desc"), orderBy("dataHora", "desc"));
        } else {
            const hoje = new Date().toISOString().split('T')[0];
            q = query(historicoRef, where("dataString", "==", hoje), orderBy("dataHora", "desc"));
        }

        const snap = await getDocs(q);
        rawLeadsCache = [];
        snap.forEach(doc => rawLeadsCache.push(doc.data()));
        
        updateAgentSelect();
        renderStatsTable();
    } catch (error) {
        console.error("Erro dashboard:", error);
        container.innerHTML = `<p style="color:red; padding:20px;">Erro: ${error.message}.</p>`;
    }
}

function renderStatsTable() {
    const container = document.getElementById('dashboardContainer');
    const agentFilter = document.getElementById('dashAgentFilter').value;
    const summary = {};
    
    const filteredLeads = agentFilter === 'todos' ? rawLeadsCache : rawLeadsCache.filter(l => l.consultorId === agentFilter);

    filteredLeads.forEach(lead => {
        const cId = lead.consultorId;
        if (!summary[cId]) {
            const agent = allAgentsCache.find(a => a.bitrixId == cId);
            summary[cId] = { nome: agent ? agent.nome : `ID: ${cId}`, leads: [], total: 0 };
        }
        summary[cId].leads.push(lead);
        summary[cId].total++;
    });

    const sorted = Object.values(summary).sort((a, b) => b.total - a.total);

    let html = `<table style="width:100%; border-collapse: collapse;"><thead><tr style="background: #3d357e; color: white;"><th style="padding:15px; text-align:left;">Consultora</th><th style="padding:15px; text-align:center;">Total de Leads</th></tr></thead><tbody>`;

    if (sorted.length === 0) {
        html += `<tr><td colspan="2" style="padding:20px; text-align:center;">Sem registos.</td></tr>`;
    } else {
        sorted.forEach(row => {
            html += `<tr style="border-bottom: 1px solid #eee;"><td style="padding:15px;">${row.nome}</td><td style="padding:15px; text-align:center; font-weight:bold; color:#3d357e; cursor:pointer; text-decoration:underline;" onclick='openLeadDetails("${row.nome}", ${JSON.stringify(row.leads)})'>${row.total}</td></tr>`;
        });
    }
    container.innerHTML = html + `</tbody></table>`;
}

window.openLeadDetails = (nome, leads) => {
    const modal = document.getElementById('leadDetailsModal');
    const container = document.getElementById('leadListContainer');
    document.getElementById('modalLeadTitle').innerText = `Leads de ${nome}`;
    let html = '<div style="display:flex; flex-direction:column; gap:10px;">';
    leads.forEach(l => {
        const data = l.dataHora?.toDate ? l.dataHora.toDate().toLocaleString('pt-BR') : l.dataHora;
        html += `<div style="background:#f4f4f9; padding:10px; border-left:4px solid #edae0f; border-radius:4px;"><strong>Lead #${l.leadId || 'N/A'}</strong><br><small>Data/Hora: ${data}</small></div>`;
    });
    container.innerHTML = html + '</div>';
    modal.showModal();
};

function updateAgentSelect() {
    const select = document.getElementById('dashAgentFilter');
    if (!select || select.options.length > 1) return;
    allAgentsCache.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.bitrixId;
        opt.text = a.nome;
        select.add(opt);
    });
}

// --- CALENDÁRIO E ESCALAS ---
async function renderCalendar(date) {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('currentMonthLabel');
    label.innerText = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const year = date.getFullYear();
    const month = date.getMonth(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const filterPrefix = `${year}-${String(month+1).padStart(2, '0')}`;
    const scheduleMap = {};
    const scheduleSnap = await getDocs(collection(db, "escala"));
    scheduleSnap.forEach(doc => { if(doc.id.startsWith(filterPrefix)) scheduleMap[doc.id] = doc.data().agentes || []; });
    grid.innerHTML = '';
    for(let i = 1; i <= daysInMonth; i++) {
        const dayString = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dayAgentsIds = scheduleMap[dayString] || [];
        const dayAgentNames = dayAgentsIds.map(bitrixId => {
            const agent = allAgentsCache.find(a => a.bitrixId === String(bitrixId).trim());
            return agent ? agent.nome.split(' ')[0] : `ID: ${bitrixId}`;
        });
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.innerHTML = `<div class="day-header"><span>${i}</span>${dayAgentNames.length > 0 ? '🟢' : '⚪'}</div><div class="day-preview">${dayAgentNames.map((n, idx) => `<div class="preview-item"><strong>${idx+1}º</strong> ${n}</div>`).join('')}</div>`;
        dayEl.onclick = () => openDayModal(dayString, dayAgentsIds);
        grid.appendChild(dayEl);
    }
}

function changeMonth(offset) { currentDate.setMonth(currentDate.getMonth() + offset); renderCalendar(currentDate); }

function openDayModal(dateString, existingIds) {
    currentSelectedDay = dateString;
    currentQueue = existingIds.map(id => String(id).trim());
    document.getElementById('modalDateTitle').innerText = `Escala: ${dateString.split('-').reverse().join('/')}`;
    document.getElementById('dayModal').showModal();
    renderModalLists();
}

function renderModalLists() {
    const listAvailable = document.getElementById('listAvailable');
    const listQueue = document.getElementById('listQueue');
    listAvailable.innerHTML = ''; listQueue.innerHTML = '';
    currentQueue.forEach((bitrixId, index) => {
        const agent = allAgentsCache.find(a => a.bitrixId === bitrixId);
        const card = document.createElement('div');
        card.className = 'agent-card in-queue';
        card.innerHTML = `<span>${agent ? agent.nome : bitrixId}</span><div class="queue-number">${index + 1}</div>`;
        card.onclick = () => { currentQueue.splice(index, 1); renderModalLists(); };
        listQueue.appendChild(card);
    });
    allAgentsCache.filter(a => !currentQueue.includes(a.bitrixId)).forEach(agent => {
        const card = document.createElement('div');
        card.className = 'agent-card';
        card.innerHTML = `<span>${agent.nome}</span> <span>+</span>`;
        card.onclick = () => { currentQueue.push(agent.bitrixId); renderModalLists(); };
        listAvailable.appendChild(card);
    });
}

async function saveDaySchedule() {
    await setDoc(doc(db, "escala", currentSelectedDay), { agentes: currentQueue, last_agent_index: -1, updatedAt: new Date() });
    document.getElementById('dayModal').close();
    renderCalendar(currentDate);
}

async function addAgent() {
    const nome = document.getElementById('newAgentName').value;
    const bitrixId = document.getElementById('newAgentBitrixId').value;
    if(!nome || !bitrixId) return alert("Preencha os campos!");
    await addDoc(collection(db, "colaboradoras"), { nome, email: document.getElementById('newAgentEmail').value, bitrixId: String(bitrixId).trim() });
    await loadAgentsCache(); loadAgentsTable();
}

async function loadAgentsTable() {
    const tbody = document.getElementById('agentsTableBody');
    tbody.innerHTML = '';
    allAgentsCache.forEach(agent => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${agent.nome}</td><td>${agent.email || '-'}</td><td>${agent.bitrixId}</td><td><button class="btn-danger" onclick="window.deleteAgent('${agent.id}')">Excluir</button></td>`;
        tbody.appendChild(tr);
    });
}

window.deleteAgent = async (id) => { if(confirm("Excluir?")) { await deleteDoc(doc(db, "colaboradoras", id)); await loadAgentsCache(); loadAgentsTable(); } };
