// script.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-auth.js";
import { collection, addDoc, getDocs, doc, setDoc, deleteDoc, query, orderBy, where, getDoc } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js";

let currentDate = new Date();
let currentSelectedDay = null;
let allAgentsCache = []; // Cache para não buscar do banco toda vez que abre o modal
let currentQueue = []; // Array temporário para guardar a ordem no modal

// --- AUTH CHECK ---
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
    await loadAgentsCache(); // Carrega agentes na memória uma vez
    renderCalendar(currentDate);
    loadAgentsTable(); // Carrega tabela da aba colaboradoras
    
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
        allAgentsCache.push({ id: doc.id, ...doc.data() });
    });
}

// --- CALENDÁRIO ---
async function renderCalendar(date) {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('currentMonthLabel');
    
    grid.innerHTML = '<p>Carregando escala...</p>';
    label.innerText = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Buscar Escala do Mês Inteiro
    // Firestore ID formato: YYYY-MM-DD
    const startStr = `${year}-${String(month+1).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month+1).padStart(2, '0')}-${daysInMonth}`;
    
    // Dica: Firestore não permite query de range em IDs nativamente fácil, 
    // mas vamos buscar tudo da collection 'escala' e filtrar no cliente por enquanto (poucos dados)
    // OU melhor: fazer getDocs de tudo e montar um mapa.
    const scheduleMap = {};
    const scheduleSnap = await getDocs(collection(db, "escala"));
    scheduleSnap.forEach(doc => {
        if(doc.id.startsWith(`${year}-${String(month+1).padStart(2, '0')}`)) {
            scheduleMap[doc.id] = doc.data().agentes || []; // Array de IDs Bitrix
        }
    });

    grid.innerHTML = '';

    for(let i = 1; i <= daysInMonth; i++) {
        const dayString = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dayAgentsIds = scheduleMap[dayString] || [];
        
        // Mapear IDs para Nomes usando o Cache
        const dayAgentNames = dayAgentsIds.map(bitrixId => {
            const agent = allAgentsCache.find(a => a.bitrixId == bitrixId); // Note: bitrixId pode ser string/number
            return agent ? agent.nome.split(' ')[0] : 'Desconhecido';
        });

        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        
        // Monta o HTML do dia
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

// --- MODAL DE ESCALA (Nova Lógica) ---
function openDayModal(dateString, existingIds) {
    currentSelectedDay = dateString;
    currentQueue = [...existingIds]; // Clona array existente

    document.getElementById('modalDateTitle').innerText = `Escala: ${dateString.split('-').reverse().join('/')}`;
    document.getElementById('dayModal').showModal();
    
    renderModalLists();
}

function renderModalLists() {
    const listAvailable = document.getElementById('listAvailable');
    const listQueue = document.getElementById('listQueue');
    
    listAvailable.innerHTML = '';
    listQueue.innerHTML = '';

    // 1. Renderizar Fila (Quem já está selecionado, na ordem)
    currentQueue.forEach((bitrixId, index) => {
        const agent = allAgentsCache.find(a => a.bitrixId == bitrixId);
        if(!agent) return; // Segurança

        const card = document.createElement('div');
        card.className = 'agent-card in-queue';
        card.innerHTML = `
            <span>${agent.nome}</span>
            <div class="queue-number">${index + 1}</div>
        `;
        // Ao clicar, remove da fila
        card.onclick = () => {
            currentQueue.splice(index, 1);
            renderModalLists();
        };
        listQueue.appendChild(card);
    });

    // 2. Renderizar Disponíveis (Quem NÃO está na fila)
    const availableAgents = allAgentsCache.filter(a => !currentQueue.includes(a.bitrixId));
    
    availableAgents.forEach(agent => {
        const card = document.createElement('div');
        card.className = 'agent-card';
        card.innerHTML = `<span>${agent.nome}</span> <span>+</span>`;
        // Ao clicar, adiciona ao final da fila
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
        // Salva exatamente a ordem do array currentQueue
        await setDoc(doc(db, "escala", currentSelectedDay), {
            agentes: currentQueue, // Array ordenado de IDs Bitrix
            last_agent_index: -1, // Reseta o ponteiro do Round Robin
            updatedAt: new Date()
        });

        document.getElementById('dayModal').close();
        renderCalendar(currentDate); // Atualiza visual
        // alert("Escala salva!"); // Opcional
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

    await addDoc(collection(db, "colaboradoras"), { nome, email, bitrixId });
    alert("Salvo!");
    
    // Limpar
    document.getElementById('newAgentName').value = '';
    document.getElementById('newAgentEmail').value = '';
    document.getElementById('newAgentBitrixId').value = '';
    
    await loadAgentsCache(); // Atualiza cache
    loadAgentsTable();
}

async function loadAgentsTable() {
    const tbody = document.getElementById('agentsTableBody');
    tbody.innerHTML = '';
    
    // Usa o cache para popular a tabela (mais rápido)
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
