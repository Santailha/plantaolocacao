// script.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-auth.js";
import { collection, addDoc, getDocs, doc, setDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js";

let currentDate = new Date();
let currentSelectedDay = null;

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
function initApp() {
    setupNavigation();
    renderCalendar(currentDate);
    loadAgents();
    
    // Listeners de botões
    document.getElementById('prevMonth').onclick = () => changeMonth(-1);
    document.getElementById('nextMonth').onclick = () => changeMonth(1);
    document.getElementById('btnAddAgent').onclick = addAgent;
    document.getElementById('btnSaveSchedule').onclick = saveDaySchedule;
}

// --- NAVEGAÇÃO ---
function setupNavigation() {
    const sections = {
        'nav-escala': 'escala',
        'nav-colab': 'colaboradoras',
        'nav-dash': 'dashboard'
    };

    Object.keys(sections).forEach(navId => {
        document.getElementById(navId).addEventListener('click', (e) => {
            // Remove active
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            
            // Set active
            e.target.classList.add('active');
            document.getElementById(sections[navId]).classList.add('active');
        });
    });
}

// --- CALENDÁRIO ---
async function renderCalendar(date) {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('currentMonthLabel');
    
    grid.innerHTML = '';
    label.innerText = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for(let i = 1; i <= daysInMonth; i++) {
        const dayString = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.innerHTML = `<div class="day-number">${i}</div><div class="day-status">...</div>`;
        dayEl.onclick = () => openDayModal(dayString);
        grid.appendChild(dayEl);
    }
}

function changeMonth(offset) {
    currentDate.setMonth(currentDate.getMonth() + offset);
    renderCalendar(currentDate);
}

// --- MODAL & ESCALA ---
async function openDayModal(dateString) {
    currentSelectedDay = dateString;
    document.getElementById('modalDateTitle').innerText = `Escala: ${dateString}`;
    document.getElementById('dayModal').showModal();
    
    const list = document.getElementById('modalAgentsList');
    list.innerHTML = 'Carregando colaboradoras...';

    // Carrega colaboradoras para preencher o modal
    const q = query(collection(db, "colaboradoras"), orderBy("nome"));
    const snapshot = await getDocs(q);
    
    list.innerHTML = '';
    snapshot.forEach(docSnap => {
        const agent = docSnap.data();
        const div = document.createElement('div');
        div.innerHTML = `
            <input type="checkbox" id="chk-${agent.bitrixId}" value="${agent.bitrixId}">
            <label for="chk-${agent.bitrixId}">${agent.nome}</label>
        `;
        list.appendChild(div);
    });
}

async function saveDaySchedule() {
    if(!currentSelectedDay) return;
    const checkboxes = document.querySelectorAll('#modalAgentsList input:checked');
    const ids = Array.from(checkboxes).map(c => c.value);

    try {
        await setDoc(doc(db, "escala", currentSelectedDay), {
            agentes: ids,
            last_agent_index: -1,
            updatedAt: new Date()
        });
        alert("Salvo!");
        document.getElementById('dayModal').close();
    } catch(e) {
        console.error(e);
        alert("Erro ao salvar");
    }
}

// --- COLABORADORAS ---
async function addAgent() {
    const nome = document.getElementById('newAgentName').value;
    const email = document.getElementById('newAgentEmail').value;
    const bitrixId = document.getElementById('newAgentBitrixId').value;

    if(!nome || !bitrixId) return alert("Preencha os campos!");

    await addDoc(collection(db, "colaboradoras"), { nome, email, bitrixId });
    alert("Adicionado!");
    loadAgents();
}

async function loadAgents() {
    const tbody = document.getElementById('agentsTableBody');
    tbody.innerHTML = 'Carregando...';
    
    const q = query(collection(db, "colaboradoras"), orderBy("nome"));
    const snapshot = await getDocs(q);
    
    tbody.innerHTML = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${data.nome}</td>
            <td>${data.email}</td>
            <td>${data.bitrixId}</td>
            <td><button class="btn-secondary" onclick="window.deleteAgent('${docSnap.id}')">Excluir</button></td>
        `;
        tbody.appendChild(tr);
    });
}

// Expor função deleteAgent para o escopo global (pois é chamada no HTML inline)
window.deleteAgent = async (id) => {
    if(confirm("Excluir?")) {
        await deleteDoc(doc(db, "colaboradoras", id));
        loadAgents();
    }
};
