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
        // Busca o papel (role) do utilizador
        const q = query(collection(db, "users"), where("uid", "==", user.uid));
        const userDoc = await getDocs(q);
        
        let userRole = "consultor"; 
        userDoc.forEach(d => userRole = d.data().role);

        // Se for consultor, remove fisicamente as abas proibidas
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
        
        // Só tenta carregar tabelas se as secções existirem
        if (document.getElementById('agentsTableBody')) loadAgentsTable();
        if (document.getElementById('dashboard')) await initDashboard(); 
        
    } catch (error) { console.error("Erro no carregamento:", error); }
    
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

// --- RESTO DAS FUNÇÕES (ESCALA, CADASTRO, DASHBOARD) ---
// ... (As funções renderCalendar, loadAgentsCache, loadCustomDashboard, etc. permanecem conforme configurado)
