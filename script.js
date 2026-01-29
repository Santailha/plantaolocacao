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

// --- VERIFICAÇÃO DE LOGIN E NÍVEL DE ACESSO ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html"; 
    } else {
        // Busca o papel (role) do usuário no Firestore
        const q = query(collection(db, "users"), where("uid", "==", user.uid));
        const userDoc = await getDocs(q);
        
        let userRole = "consultor"; // Padrão de segurança
        userDoc.forEach(d => userRole = d.data().role);

        // Restrição: Se for consultor, remove abas de admin do menu e do documento
        if (userRole === 'consultor') {
            document.getElementById('nav-colab')?.remove();
            document.getElementById('nav-dash')?.remove();
            document.getElementById('colaboradoras')?.remove();
            document.getElementById('dashboard')?.remove();
        }

        initApp();
    }
});

document.getElementById('btn-logout').onclick = () => signOut(auth);

// --- INICIALIZAÇÃO DA APP ---
async function initApp() {
    setupNavigation();
    try {
        await loadAgentsCache();
        await renderCalendar(currentDate);
        
        // Só carrega as funções de abas se elas existirem no DOM
        if (document.getElementById('agentsTableBody')) loadAgentsTable();
        if (document.getElementById('dashboard')) await initDashboard(); 
        
    } catch (error) { 
        console.error("Erro no carregamento:", error); 
    }
    
    document.getElementById('prevMonth').onclick = () => changeMonth(-1);
    document.getElementById('nextMonth').onclick = () => changeMonth(1);
    
    const btnAdd = document.getElementById('btnAddAgent');
    if (btnAdd) btnAdd.onclick = addAgent;

    const btnSave = document.getElementById('btnSaveSchedule');
    if (btnSave) btnSave.onclick = saveDaySchedule;
}

function setupNavigation() {
    const sections = { 'nav-escala': 'escala', 'nav-colab': 'colaboradoras', 'nav-dash': 'dashboard' };
    Object.keys(sections).forEach(navId => {
        const navBtn = document.getElementById(navId);
        if (navBtn) {
            navBtn.onclick = (e) => {
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(sections[navId])?.classList.add('active');
            };
        }
    });
}

// --- GESTÃO DE COLABORADORAS ---
async function loadAgentsCache() {
    const q = query(collection(db, "colaboradoras"), orderBy("nome"));
    const snapshot = await getDocs(q);
    allAgentsCache = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        allAgentsCache.push({ id: doc.id, ...data, bitrixId: String(data.bitrixId).trim() });
    });
}

async function addAgent() {
    const nome = document.getElementById('newAgentName').value;
    const bitrixId = document.getElementById('newAgentBitrixId').value;
    if(!nome || !bitrixId) return alert("Preencha nome e ID Bitrix!");
    await addDoc(collection(db, "colaboradoras"), { 
        nome, 
        email: document.getElementById('newAgentEmail').value, 
        bitrixId: String(bitrixId).trim() 
    });
    document.getElementById('newAgentName').value = '';
    document.getElementById('newAgentEmail').value = '';
    document.getElementById('newAgentBitrixId').value = '';
    await loadAgentsCache(); loadAgentsTable();
}

async function loadAgentsTable() {
    const tbody = document.getElementById('agentsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    allAgentsCache.forEach(agent => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${agent.nome}</td><td>${agent.email || '-'}</td><td>${agent.bitrixId}</td><td><button class="btn-danger" onclick="window.deleteAgent('${agent.id}')">Excluir</button></td>`;
        tbody.appendChild(tr);
    });
}

window.deleteAgent = async (id) => { if(confirm("Excluir colaboradora?")) { await deleteDoc(doc(db, "colaboradoras", id)); await loadAgentsCache(); loadAgentsTable(); } };

// --- CALENDÁRIO (ESCALA) ---
async function renderCalendar(date) {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('currentMonthLabel');
    label.innerText = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const year = date.getFullYear();
    const month = date.getMonth(); 
    const firstDayIndex = new Date(year, month, 1).getDay(); // Alinha com o dia da semana correto
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const filterPrefix = `${year}-${String(month+1).padStart(2, '0')}`;
    const scheduleSnap = await getDocs(collection(db, "escala"));
    const scheduleMap = {};
    scheduleSnap.forEach(doc => { if(doc.id.startsWith(filterPrefix)) scheduleMap[doc.id] = doc.data().agentes || []; });
    
    grid.innerHTML = '';

    // Espaços vazios para alinhar o dia 1 ao cabeçalho (Dom-Sáb)
    for (let i = 0; i < firstDayIndex; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'calendar-day empty';
        emptyDiv.style.visibility = 'hidden'; 
        grid.appendChild(emptyDiv);
    }

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

// --- DASHBOARD ---
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
    if (!container) return;
    const start = document.getElementById('dashStartDate').value;
    const end = document.getElementById('dashEndDate').value;
    container.innerHTML = '<div style="padding:20px; text-align:center;">Buscando dados...</div>';
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
    } catch (e) { container.innerHTML = `<p style="color:red; padding:20px;">Erro: ${e.message}</p>`; }
}

function renderStatsTable() {
    const container = document.getElementById('dashboardContainer');
    if (!container) return;
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
    let html = `<table><thead><tr style="background: var(--primary-blue); color: white;"><th>Consultora</th><th style="text-align:center;">Total Leads</th></tr></thead><tbody>`;
    if (sorted.length === 0) html += `<tr><td colspan="2" style="text-align:center;">Nenhum lead encontrado.</td></tr>`;
    else {
        sorted.forEach(row => {
            html += `<tr><td>${row.nome}</td><td style="text-align:center; font-weight:bold; color:var(--primary-blue); cursor:pointer; text-decoration:underline;" onclick='openLeadDetails("${row.nome}", ${JSON.stringify(row.leads)})'>${row.total}</td></tr>`;
        });
    }
    container.innerHTML = html + `</tbody></table>`;
}

window.openLeadDetails = (nome, leads) => {
    const modal = document.getElementById('leadDetailsModal');
    const container = document.getElementById('leadListContainer');
    if (!modal || !container) return;
    document.getElementById('modalLeadTitle').innerText = `Leads de ${nome}`;
    let html = '<div style="display:flex; flex-direction:column; gap:10px;">';
    leads.forEach(l => {
        const data = l.dataHora?.toDate ? l.dataHora.toDate().toLocaleString('pt-BR') : l.dataHora;
        html += `<div style="background:#f4f4f9; padding:10px; border-left:4px solid var(--primary-yellow); border-radius:4px;"><strong>Lead #${l.leadId || 'N/A'}</strong><br><small>Data/Hora: ${data}</small></div>`;
    });
    container.innerHTML = html + '</div>';
    modal.showModal();
};

function updateAgentSelect() {
    const select = document.getElementById('dashAgentFilter');
    if (!select || select.options.length > 1) return;
    allAgentsCache.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.bitrixId; opt.text = a.nome; select.add(opt);
    });
}

// --- MODAL DE ESCALA ---
function openDayModal(dateString, existingIds) {
    const modal = document.getElementById('dayModal');
    if (!modal) return;
    currentSelectedDay = dateString;
    currentQueue = existingIds.map(id => String(id).trim());
    document.getElementById('modalDateTitle').innerText = `Escala: ${dateString.split('-').reverse().join('/')}`;
    modal.showModal();
    renderModalLists();
}

function renderModalLists() {
    const listAvailable = document.getElementById('listAvailable');
    const listQueue = document.getElementById('listQueue');
    if (!listAvailable || !listQueue) return;
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
