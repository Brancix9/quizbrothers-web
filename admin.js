// Admin mód pre editáciu textov
(function() {
    'use strict';
    
    const STORAGE_KEY = 'qb_admin_texts';
    
    let isAdminMode = false;
    let savedTexts = {};
    let db = null;
    let auth = null;
    let app = null;
    let firebaseInitialized = false;
    
    // Inicializácia Firebase (ak ešte nie je inicializované)
    async function initFirebase() {
        if (firebaseInitialized && db && auth) return;
        
        // Skús použiť existujúci app a db objekty
        if (window.app && typeof window.app === 'object') {
            app = window.app;
        }
        if (window.db && typeof window.db === 'object') {
            db = window.db;
        }
        
        // Počkaj chvíľu, možno sa Firebase ešte načítava
        if (!window.db && !db) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (window.app && typeof window.app === 'object') {
            app = window.app;
        }
        if (window.db && typeof window.db === 'object') {
            db = window.db;
        }
        
        // Ak nie je db, inicializuj Firebase
        if (!db && !app) {
            try {
                const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
                const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                
                const firebaseConfig = {
                    apiKey: "AIzaSyCgKeENYtYJWf2_DZOw4irg6GPLq3XKhEc",
                    authDomain: "quizbrothers-rezervacia.firebaseapp.com",
                    projectId: "quizbrothers-rezervacia",
                    storageBucket: "quizbrothers-rezervacia.firebasestorage.app",
                    messagingSenderId: "193476216369",
                    appId: "1:193476216369:web:8e0d59dd8282cb53ba3710",
                    measurementId: "G-0LKTHWLKH5"
                };
                
                app = initializeApp(firebaseConfig);
                db = getFirestore(app);
            } catch (error) {
                console.error("Chyba pri inicializácii Firebase:", error);
            }
        }
        
        // Inicializácia Auth
        if (!auth && app) {
            try {
                const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
                auth = getAuth(app);
            } catch (error) {
                console.error("Chyba pri inicializácii Firebase Auth:", error);
            }
        }
        
        firebaseInitialized = true;
    }
    
    // Vytvorenie login modálneho dialógu
    function showLoginModal() {
        // Odstránenie existujúceho modálu
        const existing = document.getElementById('admin-login-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'admin-login-modal';
        modal.innerHTML = `
            <div class="admin-login-overlay"></div>
            <div class="admin-login-container">
                <h2>🔐 Admin Login</h2>
                <form id="admin-login-form">
                    <div class="form-group">
                        <label for="admin-email">Email:</label>
                        <input type="email" id="admin-email" required placeholder="tvoj@email.com">
                    </div>
                    <div class="form-group">
                        <label for="admin-password">Heslo:</label>
                        <input type="password" id="admin-password" required placeholder="••••••••">
                    </div>
                    <button type="submit" class="admin-login-btn">Prihlásiť sa</button>
                    <p id="admin-login-error" style="color: #e74c3c; margin-top: 10px; display: none;"></p>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        
        // CSS štýly pre modál
        const style = document.createElement('style');
        style.textContent = `
            #admin-login-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .admin-login-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
            }
            
            .admin-login-container {
                position: relative;
                background: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                width: 90%;
                max-width: 400px;
                z-index: 100000;
            }
            
            .admin-login-container h2 {
                margin: 0 0 20px 0;
                text-align: center;
                color: #333;
            }
            
            .form-group {
                margin-bottom: 15px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
                color: #555;
            }
            
            .form-group input {
                width: 100%;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
                box-sizing: border-box;
            }
            
            .form-group input:focus {
                outline: none;
                border-color: #27ae60;
                box-shadow: 0 0 5px rgba(39, 174, 96, 0.3);
            }
            
            .admin-login-btn {
                width: 100%;
                padding: 12px;
                background: #27ae60;
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                transition: background 0.3s;
                opacity: 1;
            }
            
            .admin-login-btn:hover {
                background: #229954;
            }
        `;
        if (!document.querySelector('style[data-admin-modal-styles]')) {
            style.setAttribute('data-admin-modal-styles', 'true');
            document.head.appendChild(style);
        }
        
        // Event listener pre login
        const form = document.getElementById('admin-login-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('admin-email').value;
            const password = document.getElementById('admin-password').value;
            const errorMsg = document.getElementById('admin-login-error');
            
            try {
                const { signInWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
                await signInWithEmailAndPassword(auth, email, password);
                // Ak je prihlasenie úspešné, modal sa automaticky uzavrie
                const modal = document.getElementById('admin-login-modal');
                if (modal) modal.remove();
                activateAdminMode();
            } catch (error) {
                errorMsg.style.display = 'block';
                if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                    errorMsg.textContent = '❌ Nesprávny email alebo heslo!';
                } else if (error.code === 'auth/invalid-email') {
                    errorMsg.textContent = '❌ Neplatný email!';
                } else {
                    errorMsg.textContent = '❌ Chyba pri prihlasovaní: ' + error.message;
                }
            }
        });
        
        // Click na overlay zatvorí modál
        document.querySelector('.admin-login-overlay').addEventListener('click', () => {
            const modal = document.getElementById('admin-login-modal');
            if (modal) modal.remove();
        });
    }
    
    // Načítanie uložených textov
    async function loadSavedTexts() {
        await initFirebase();
        
        // Skús načítať z Firebase
        if (db) {
            try {
                const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                const docRef = doc(db, "config", "pageTexts");
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    savedTexts = docSnap.data() || {};
                    applySavedTexts();
                    return;
                }
            } catch (error) {
                console.error("Chyba pri načítaní z Firebase:", error);
            }
        }
        
        // Fallback na localStorage
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            savedTexts = JSON.parse(saved);
            applySavedTexts();
        }
    }
    
    // Aplikovanie uložených textov
    function applySavedTexts() {
        const pageName = getPageName();
        if (savedTexts[pageName]) {
            Object.keys(savedTexts[pageName]).forEach(id => {
                const element = document.querySelector(`[data-text-id="${id}"]`);
                if (element) {
                    element.textContent = savedTexts[pageName][id];
                }
            });
        }
    }
    
    // Získanie názvu stránky
    function getPageName() {
        const path = window.location.pathname;
        let page = path.split('/').pop() || 'index.html';
        // Normalizácia názvu súboru (rezervácia.html -> rezervacia.html pre localStorage)
        if (page === 'rezervácia.html') page = 'rezervacia.html';
        return page;
    }
    
    // Aktivácia admin módu
    function activateAdminMode() {
        isAdminMode = true;
        document.body.classList.add('admin-mode');
        createAdminPanel();
        makeTextsEditable();
    }
    
    // Vytvorenie admin panelu
    function createAdminPanel() {
        // Odstránenie existujúceho panelu
        const existing = document.getElementById('admin-edit-panel');
        if (existing) existing.remove();
        
        const panel = document.createElement('div');
        panel.id = 'admin-edit-panel';
        panel.innerHTML = `
            <div class="admin-panel-header">
                <h3>✏️ Admin mód - Editácia textov</h3>
                <div style="display: flex; gap: 5px;">
                    <button onclick="window.qbAdmin.toggleMinimize()" class="admin-minimize-btn">−</button>
                    <button onclick="window.qbAdmin.deactivate()" class="admin-close-btn">✕ Zatvoriť</button>
                </div>
            </div>
            <div class="admin-panel-content">
                <p style="color: #27ae60; margin-bottom: 15px;">💡 Klikni na akýkoľvek text na stránke a začni ho editovať!</p>
                <div class="admin-actions">
                    <button onclick="window.qbAdmin.saveAll()" class="admin-save-btn">💾 Uložiť všetky zmeny</button>
                    <button onclick="window.qbAdmin.resetPage()" class="admin-reset-btn">🔄 Resetovať túto stránku</button>
                    <button onclick="window.qbAdmin.clearAll()" class="admin-clear-btn">🗑️ Vymazať všetko</button>
                    <button onclick="window.qbAdmin.logout()" class="admin-logout-btn">🚪 Odhlásiť sa</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
    }
    
    // Inicializácia text ID-čiek (volá sa RAZ pri prvom loadovaní)
    let textIdsInitialized = false;
    function initializeTextIds() {
        // Volaj len raz za behu aplikácie
        if (textIdsInitialized) return;
        
        const editableSelectors = 'h1, h2, h3, p, span, a, li, .card p, .card h3, .hero h1, .hero p';
        const elements = document.querySelectorAll(editableSelectors);
        let validIndex = 0;
        
        elements.forEach((el) => {
            // Preskočiť prvky v menu a footeri a admin paneli
            if (el.closest('header') || el.closest('footer') || el.closest('#admin-edit-panel') || el.closest('#admin-login-modal')) {
                return;
            }
            
            // Ak element ešte nemá data-text-id, pridaj mu ho
            if (!el.getAttribute('data-text-id')) {
                const textId = `text-${getPageName()}-${validIndex}`;
                el.setAttribute('data-text-id', textId);
                validIndex++;
            }
        });
        
        textIdsInitialized = true;
    }
    
    // Umožnenie editácie textov
    function makeTextsEditable() {
        // Zavolaj inicializáciu ak ešte nebola zavolaná
        if (!textIdsInitialized) {
            initializeTextIds();
        }
        
        const editableSelectors = 'h1, h2, h3, p, span, a, li, .card p, .card h3, .hero h1, .hero p';
        const elements = document.querySelectorAll(editableSelectors);
        
        elements.forEach((el) => {
            // Preskočiť prvky v menu a footeri a admin paneli
            if (el.closest('header') || el.closest('footer') || el.closest('#admin-edit-panel') || el.closest('#admin-login-modal')) {
                return;
            }
            
            // Použij existujúci data-text-id alebo ho vytvor
            let textId = el.getAttribute('data-text-id');
            if (!textId) {
                // Toto by sa nemalo stať, ale pre istotu
                textId = `text-${getPageName()}-${Math.random().toString(36).substr(2, 9)}`;
                el.setAttribute('data-text-id', textId);
            }
            
            // Ak element ešte nie je editovateľný, nastav ho
            if (!el.classList.contains('editable-text')) {
                el.setAttribute('contenteditable', 'true');
                el.classList.add('editable-text');
                
                // Uloženie pôvodného textu ak ešte nie je uložený
                const pageName = getPageName();
                if (!savedTexts[pageName]) savedTexts[pageName] = {};
                if (!savedTexts[pageName][textId]) {
                    savedTexts[pageName][textId] = el.textContent.trim();
                }
                
                // Event listenery - pridaj len raz
                if (!el.hasAttribute('data-listener-attached')) {
                    el.addEventListener('focus', function() {
                        this.style.outline = '2px solid #27ae60';
                        this.style.backgroundColor = 'rgba(39, 174, 96, 0.1)';
                        // Na mobiloch minimalizuj panel pri editovaní
                        if (window.innerWidth <= 768) {
                            const panel = document.getElementById('admin-edit-panel');
                            if (panel && !panel.classList.contains('admin-panel-minimized')) {
                                window.qbAdmin.toggleMinimize();
                            }
                        }
                    });
                    
                    el.addEventListener('blur', async function() {
                        this.style.outline = '';
                        this.style.backgroundColor = '';
                        // Automatické uloženie pri strate fokusu
                        const currentText = this.textContent.trim();
                        const tId = this.getAttribute('data-text-id');
                        const pName = getPageName();
                        if (!savedTexts[pName]) savedTexts[pName] = {};
                        if (currentText !== savedTexts[pName][tId]) {
                            savedTexts[pName][tId] = currentText;
                            await saveToStorage();
                        }
                    });
                    
                    el.setAttribute('data-listener-attached', 'true');
                }
            }
        });
    }
    
    // Uloženie do Firebase alebo localStorage
    async function saveToStorage() {
        await initFirebase();
        
        // Skús uložiť do Firebase
        if (db) {
            try {
                const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                const docRef = doc(db, "config", "pageTexts");
                await setDoc(docRef, savedTexts, { merge: true });
                // Tiež ulož do localStorage ako backup
                localStorage.setItem(STORAGE_KEY, JSON.stringify(savedTexts));
                return;
            } catch (error) {
                console.error("Chyba pri ukladaní do Firebase:", error);
            }
        }
        
        // Fallback na localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedTexts));
    }
    
    // Uloženie všetkých zmien
    async function saveAll() {
        const pageName = getPageName();
        const editableElements = document.querySelectorAll('[data-text-id]');
        
        editableElements.forEach(el => {
            const textId = el.getAttribute('data-text-id');
            if (textId) {
                if (!savedTexts[pageName]) savedTexts[pageName] = {};
                savedTexts[pageName][textId] = el.textContent.trim();
            }
        });
        
        await saveToStorage();
        alert('✅ Všetky zmeny boli uložené!');
    }
    
    // Reset stránky
    async function resetPage() {
        if (!confirm('Naozaj chceš resetovať všetky zmeny na tejto stránke?')) return;
        
        const pageName = getPageName();
        delete savedTexts[pageName];
        await saveToStorage();
        location.reload();
    }
    
    // Vymazanie všetkého
    async function clearAll() {
        if (!confirm('⚠️ Naozaj chceš vymazať VŠETKY uložené texty zo všetkých stránok?')) return;
        
        await initFirebase();
        if (db) {
            try {
                const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                const docRef = doc(db, "config", "pageTexts");
                await deleteDoc(docRef);
            } catch (error) {
                console.error("Chyba pri mazaní z Firebase:", error);
            }
        }
        
        localStorage.removeItem(STORAGE_KEY);
        savedTexts = {};
        alert('✅ Všetko bolo vymazané!');
        location.reload();
    }
    
    // Minimalizovanie admin panelu
    function toggleMinimize() {
        const panel = document.getElementById('admin-edit-panel');
        if (panel) {
            panel.classList.toggle('admin-panel-minimized');
            const content = panel.querySelector('.admin-panel-content');
            if (content) {
                content.style.display = panel.classList.contains('admin-panel-minimized') ? 'none' : 'block';
            }
        }
    }
    
    // Deaktivácia admin módu
    function deactivate() {
        isAdminMode = false;
        document.body.classList.remove('admin-mode');
        const panel = document.getElementById('admin-edit-panel');
        if (panel) panel.remove();
        
        // Odstránenie contenteditable
        document.querySelectorAll('[contenteditable="true"]').forEach(el => {
            el.removeAttribute('contenteditable');
            el.classList.remove('editable-text');
        });
    }
    
    // Odhlásiť sa
    async function logout() {
        try {
            const { signOut } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
            await signOut(auth);
            deactivate();
            location.reload();
        } catch (error) {
            console.error("Chyba pri odhlasovaní:", error);
            alert('❌ Chyba pri odhlasovaní');
        }
    }
    
   // Tlačidlo na aktiváciu
   function createAdminButton() {
    // Najprv skontroluj, či už tlačidlo neexistuje (aby sa neduplikovalo)
    if (document.getElementById('admin-activate-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'admin-activate-btn';
    btn.innerHTML = '⚙';
    btn.title = 'Admin mód';
    
    // --- PRIDANÉ ŠTÝLY ABY TO VYZERALO DOBRE ---
    btn.style.background = 'none';
    btn.style.border = 'none';
    btn.style.fontSize = '24px';
    btn.style.cursor = 'pointer';
    btn.style.opacity = '0.5';
    btn.style.transition = 'opacity 0.3s';
    btn.style.padding = '10px';
    btn.style.position = 'fixed';
    btn.style.bottom = '20px';
    btn.style.right = '20px';
    btn.style.zIndex = '9999';
    
    // Efekt pri prejdení myšou
    btn.onmouseover = function() { this.style.opacity = '1'; }
    btn.onmouseout = function() { this.style.opacity = '0.5'; }

    btn.onclick = async function() {
        // Skontroluj, či je používateľ prihlásený
        if (auth && auth.currentUser) {
            // Ak je prihlásený, aktivuj admin mód
            activateAdminMode();
        } else {
            // Ak nie je prihlásený, zobraz login modál
            showLoginModal();
        }
    };

    document.body.appendChild(btn);
}
    
    // Export funkcií
    window.qbAdmin = {
        activate: activateAdminMode,
        deactivate: deactivate,
        saveAll: saveAll,
        resetPage: resetPage,
        clearAll: clearAll,
        logout: logout,
        toggleMinimize: toggleMinimize,
        isUserAdmin: function() {
            // Return true if user is logged in via Firebase
            return auth && auth.currentUser ? true : false;
        },
        getAuth: function() {
            // Return auth object so other scripts can use it
            return auth;
        },
        showLoginModal: showLoginModal
    };
    
    // --- OPRAVA SPÚŠŤANIA S onAuthStateChanged ---
    const startAdmin = async function() {
        await initFirebase();
        
        // Vždy inicializuj text ID-čka (aby boli dostupné aj bez admin módu)
        initializeTextIds();
        
        // Zawždy vytvor tlačidlo
        setTimeout(() => {
            createAdminButton();
        }, 300);
        
        // Zaregistruj listener na zmeny auth stavu
        if (auth) {
            const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
            
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    // Používateľ je prihlásený
                    await loadSavedTexts();
                    // Automaticky aktivuj admin mód
                    activateAdminMode();
                } else {
                    // Používateľ nie je prihlásený
                    // Deaktivuj admin mód
                    deactivate();
                    await loadSavedTexts();
                }
            });
        } else {
            // Ak Auth nie je dostupný, pokračuj bez neho
            await loadSavedTexts();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startAdmin);
    } else {
        // Ak už je stránka načítaná, spusti to hneď s oneskorením
        setTimeout(startAdmin, 100);
    }
    
})();
