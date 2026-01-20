// script.js - Versão Debug & Fix
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-auth.js";
import { collection, addDoc, getDocs, doc, setDoc, deleteDoc, query, orderBy, where } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js";

let currentDate = new Date();
let currentSelectedDay = null;
let allAgentsCache = []; 
let currentQueue = [];

// --- AUTH CHECK ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        console.log("Usuário logado:", user.email);
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
        console.log("Agentes carregados:", allAgentsCache); // Debug
        
        await renderCalendar(currentDate);
        loadAgentsTable();
    } catch (error) {
        console.error("Erro na inicialização:", error);
    }
    
    // Listeners
    document.getElementById('prevMonth').onclick = () => changeMonth(-1);
    document.getElementById('nextMonth').onclick = () => changeMonth(1);
    document.getElementById('btnAddAgent').onclick = addAgent;
    document.getElementById('btnSaveSchedule').onclick = saveDaySchedule;
}

// --- NAVEGAÇÃO ---
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

// --- DADOS ---
async function loadAgentsCache() {
    const q = query(collection(db, "colaboradoras"), orderBy("nome"));
    const snapshot = await getDocs(q);
    allAgentsCache = [];
    snapshot.forEach(doc => {
        // Garantimos que bitrixId seja tratado como String para comparação
        const data = doc.data();
        allAgentsCache.push({ 
            id: doc.id, 
            ...data, 
            bitrixId: String(data.bitrixId).trim() 
        });
    });
}

// --- CALENDÁRIO ---
async function renderCalendar(date) {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('currentMonthLabel');
    
    grid.innerHTML = '<p>Carregando dados...</p>';
    label.innerText = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const year = date.getFullYear();
    const month = date.getMonth(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Debug: verifique se estamos buscando o mês certo
    const filterPrefix = `${year}-${String(month+1).padStart(2, '0')}`;
    console.log(`Buscando escalas para o prefixo: ${filterPrefix}`);

    const scheduleMap = {};
    const scheduleSnap = await getDocs(collection(db, "escala"));
    
    scheduleSnap.forEach(doc => {
        // Filtra documentos que começam com "2026-01"
        if(doc.id.startsWith(filterPrefix)) {
            const data = doc.data();
            // Garante que é um array, mesmo se vier vazio
            scheduleMap[doc.id] = data.agentes || []; 
            console.log(`Dados encontrados para ${doc.id}:`, data.agentes); // Debug
        }
    });

    grid.innerHTML = '';

    for(let i = 1; i <= daysInMonth; i++) {
        const dayString = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dayAgentsIds = scheduleMap[dayString] || [];
        
        // Mapeamento Robusto
        const dayAgentNames = dayAgentsIds.map(bitrixId => {
            // Compara String com String e remove espaços
            const idToSearch = String(bitrixId).trim();
            const agent = allAgentsCache.find(a => a.bitrixId === idToSearch);
            
            if (!agent) {
                console.warn(`Agente com ID ${idToSearch} está na escala mas não no cadastro de colaboradoras.`);
                return `ID: ${idToSearch}`;
            }
            return agent.nome.split(' ')[0];
        });

        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        
        let previewHTML = '';
        if(dayAgentNames.length > 0) {
            dayAgentNames.forEach((name, idx) => {
                previewHTML += `<div class="preview-item"><strong>${idx+1}º</strong> ${name}</div>`;
            });
        } else {
            previewHTML = '<span style="color:#ccc; font-size:0.8em;">Sem escala</span>';
        }

        dayEl.innerHTML = `
            <div class="day-header">
                <span>${i}</span>
                ${dayAgentNames.length > 0 ? '🟢' : '⚪'}
            </div>
            <div class="day-preview">${previewHTML}</div>
        `;
        
        dayEl.onclick = () => openDayModal(dayString, dayAgentsIds);
        grid.appendChild(dayEl);
    }
}

function changeMonth(offset) {
    currentDate.setMonth(currentDate.getMonth() + offset);
    renderCalendar(currentDate);
}

// --- MODAL ---
function openDayModal(dateString, existingIds) {
    currentSelectedDay = dateString;
    // Garante conversão para string
    currentQueue = existingIds.map(id => String(id).trim());

    document.getElementById('modalDateTitle').innerText = `Escala: ${dateString.split('-').reverse().join('/')}`;
    document.getElementById('dayModal').showModal();
    
    renderModalLists();
}

function renderModalLists() {
    const listAvailable = document.getElementById('listAvailable');
    const listQueue = document.getElementById('listQueue');
    
    listAvailable.innerHTML = '';
    listQueue.innerHTML = '';

    // Renderiza Fila
    currentQueue.forEach((bitrixId, index) => {
        const agent = allAgentsCache.find(a => a.bitrixId === bitrixId);
        const displayName = agent ? agent.nome : `ID: ${bitrixId}`;

        const card = document.createElement('div');
        card.className = 'agent-card in-queue';
        card.innerHTML = `
            <span>${displayName}</span>
            <div class="queue-number">${index + 1}</div>
        `;
        card.onclick = () => {
            currentQueue.splice(index, 1);
            renderModalLists();
        };
        listQueue.appendChild(card);
    });

    // Renderiza Disponíveis
    const availableAgents = allAgentsCache.filter(a => !currentQueue.includes(a.bitrixId));
    
    availableAgents.forEach(agent => {
        const card = document.createElement('div');
        card.className = 'agent-card';
        card.innerHTML = `<span>${agent.nome}</span> <span>+</span>`;
        card.onclick = () => {
            currentQueue.push(agent.bitrixId);
            renderModalLists();
        };
        listAvailable.appendChild(card);
    });
}

async function saveDaySchedule() {
    if(!currentSelectedDay) return;

    try {
        await setDoc(doc(db, "escala", currentSelectedDay), {
            agentes: currentQueue,
            last_agent_index: -1,
            updatedAt: new Date()
        });

        document.getElementById('dayModal').close();
        renderCalendar(currentDate);
    } catch(e) {
        console.error(e);
        alert("Erro ao salvar: " + e.message);
    }
}

// --- CADASTRO ---
async function addAgent() {
    const nome = document.getElementById('newAgentName').value;
    const email = document.getElementById('newAgentEmail').value;
    const bitrixId = document.getElementById('newAgentBitrixId').value;

    if(!nome || !bitrixId) return alert("Preencha campos!");

    // Salva bitrixId sempre como string e sem espaços
    await addDoc(collection(db, "colaboradoras"), { 
        nome, 
        email, 
        bitrixId: String(bitrixId).trim() 
    });
    alert("Salvo!");
    
    document.getElementById('newAgentName').value = '';
    document.getElementById('newAgentEmail').value = '';
    document.getElementById('newAgentBitrixId').value = '';
    
    await loadAgentsCache();
    loadAgentsTable();
}

async function loadAgentsTable() {
    const tbody = document.getElementById('agentsTableBody');
    tbody.innerHTML = '';
    
    if(allAgentsCache.length === 0) await loadAgentsCache();

    allAgentsCache.forEach(agent => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${agent.nome}</td>
            <td>${agent.email}</td>
            <td>${agent.bitrixId}</td>
            <td><button class="btn-danger" onclick="window.deleteAgent('${agent.id}')">Excluir</button></td>
        `;
        tbody.appendChild(tr);
    });
}

window.deleteAgent = async (id) => {
    if(confirm("Excluir colaboradora?")) {
        await deleteDoc(doc(db, "colaboradoras", id));
        await loadAgentsCache();
        loadAgentsTable();
    }
};
