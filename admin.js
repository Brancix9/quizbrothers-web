// Admin mód pre editáciu textov
(function() {
    'use strict';
    
    /** Rovnaký zoznam ako dôveryhodní editori v Firestore; nie je to náhrada za serverové pravidlá. */
    const ORGANIZER_EMAILS = new Set([
        'branislav.gonos@gmail.com',
        'marcel.gonos@gmail.com',
        'bg.brano99@gmail.com'
    ]);
    
    function isOrganizerEmail(email) {
        if (!email || typeof email !== 'string') return false;
        return ORGANIZER_EMAILS.has(email.trim().toLowerCase());
    }
    
    const STORAGE_KEY = 'qb_admin_texts';
    
    let isAdminMode = false;
    let savedTexts = {};
    let db = null;
    let auth = null;
    let app = null;
    let firebaseInitialized = false;
    let isEditingText = false; // Flag na kontrolu či user edituje text
    const APPCHECK_SITE_KEY = '6Lci_cAsAAAAAL9VrBYxUUlUCVYw9gEyUPqy6Q8T';
    
    
    // Inicializácia Firebase (ak ešte nie je inicializované)
    async function initFirebase() {
        if (firebaseInitialized && db && auth) return;
        
        // Ihneď skús použiť existujúci Firebase z window - ŽIADNE ČAKANIE!
        if (window.app && typeof window.app === 'object') {
            app = window.app;
        }
        if (window.db && typeof window.db === 'object') {
            db = window.db;
        }
        if (window.auth && typeof window.auth === 'object') {
            auth = window.auth;
            firebaseInitialized = true;
            console.log("⚡ Firebase z window dostupný okamžite!");
            return;
        }
        
        // Ak window Firebase nie je dostupný, inicializuj vlastný
        // ALE BEZ ČAKANIA - ak nie je dostupný za 100ms, pokračuj bez neho
        if (!db) {
            try {
                const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
                const { initializeAppCheck, ReCaptchaV3Provider } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js");
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
                initializeAppCheck(app, {
                    provider: new ReCaptchaV3Provider(APPCHECK_SITE_KEY),
                    isTokenAutoRefreshEnabled: true
                });
                db = getFirestore(app);
                window.app = app;
                window.db = db;
                console.log("⚡ Vlastný Firebase inicializovaný");
            } catch (error) {
                console.error("Chyba pri inicializácii Firebase:", error);
            }
        }
        
        // Inicializácia Auth
        if (!auth && app) {
            try {
                const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
                auth = getAuth(app);
                window.auth = auth;
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
                <p style="margin: 0 0 15px 0; color:#555; font-size: 14px;">
                    Prihlás sa cez Google účet organizátora.
                </p>
                <button type="button" id="admin-google-login-btn" class="admin-login-btn" style="background:#1877F2;">
                    Prihlásiť sa cez Google
                </button>
                <p id="admin-login-error" style="color: #e74c3c; margin-top: 10px; display: none;"></p>
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
        
        // Event listener pre Google login
        const googleBtn = document.getElementById('admin-google-login-btn');
        googleBtn.addEventListener('click', async () => {
            const errorMsg = document.getElementById('admin-login-error');
            try {
                const {GoogleAuthProvider, signInWithPopup, signOut} = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
                const provider = new GoogleAuthProvider();
                provider.setCustomParameters({prompt: 'select_account'});
                const cred = await signInWithPopup(auth, provider);
                if (!isOrganizerEmail(cred.user.email)) {
                    await signOut(auth);
                    errorMsg.style.display = 'block';
                    errorMsg.textContent = '❌ Tento účet nemá oprávnenie upravovať texty (admin).';
                    return;
                }
                const modal = document.getElementById('admin-login-modal');
                if (modal) modal.remove();
                activateAdminMode();
            } catch (error) {
                errorMsg.style.display = 'block';
                errorMsg.textContent = '❌ Chyba pri prihlasovaní cez Google: ' + (error.message || error);
            }
        });
        
        // Click na overlay zatvorí modál
        document.querySelector('.admin-login-overlay').addEventListener('click', () => {
            const modal = document.getElementById('admin-login-modal');
            if (modal) modal.remove();
        });
    }
    
    // Vyčistenie starých chybných dát z localStorage (iba raz pri spustení)
    function cleanupLegacyData() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                // Ak sú tam neplatné texty, vymažeme ich
                const pageName = getPageName();
                
                // Ak sú tam texty ktoré vyzerajú ako "displayCapacity" alebo "listReserved", vymažeme všetko
                if (data[pageName]) {
                    const keys = Object.keys(data[pageName]);
                    const suspiciousKeys = keys.filter(k => 
                        k.includes('Zostáva') || k.includes('Piči') || 
                        k.includes('Reserved') || k.includes('Confirmed') ||
                        data[pageName][k].includes('✔') || data[pageName][k].includes('⏳')
                    );
                    
                    // Ak má veľa podozrivých kľúčov, vymažeme všetky dáta pre túto stránku
                    if (suspiciousKeys.length > 3) {
                        console.log('Čistenie chybných dát z admin editora...');
                        delete data[pageName];
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                        return;
                    }
                }
            }
        } catch (e) {
            console.log('Skipping legacy data cleanup');
        }
    }
    
    // Načítanie uložených textov
    async function loadSavedTexts() {
        // Vyčistenie starých dát
        cleanupLegacyData();
        
        // GUARD: Ak user edituje, neiniciuj applySavedTexts
        if (isEditingText) {
            return;
        }
        
        await initFirebase();
        
        // Skús načítať z Firebase
        if (db) {
            try {
                const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                
                // Načítaj dáta zo všetkých relevantných kolekcií
                const pageTextsRef = doc(db, "config", "pageTexts");
                const homeRef = doc(db, "web_content", "home");
                const aboutRef = doc(db, "web_content", "about");
                const appRef = doc(db, "web_content", "app");
                
                const [pageTextsSnap, homeSnap, aboutSnap, appSnap] = await Promise.all([
                    getDoc(pageTextsRef),
                    getDoc(homeRef),
                    getDoc(aboutRef),
                    getDoc(appRef)
                ]);
                
                // Začni s dátami z config/pageTexts
                savedTexts = pageTextsSnap.exists() ? (pageTextsSnap.data() || {}) : {};
                
                // Zjednoť dáta z web_content kolekcií do správnych stránok
                const pageName = getPageName();
                if (!savedTexts[pageName]) savedTexts[pageName] = {};
                
                // Pridaj home_ texty
                if (homeSnap.exists()) {
                    Object.assign(savedTexts[pageName], homeSnap.data());
                }
                
                // Pridaj about_ texty
                if (aboutSnap.exists()) {
                    Object.assign(savedTexts[pageName], aboutSnap.data());
                }
                
                // Pridaj app_ texty
                if (appSnap.exists()) {
                    Object.assign(savedTexts[pageName], appSnap.data());
                }
                
                applySavedTexts();
                return;
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
        
        // Aplikuj texty pre aktuálnu stránku
        if (savedTexts[pageName]) {
            Object.keys(savedTexts[pageName]).forEach(id => {
                const element = document.querySelector(`[data-text-id="${id}"]`) || document.getElementById(id);
                if (element) {
                    // GUARD: Ak má element focus (edituje ho user), neignoruj ho
                    if (element === document.activeElement) {
                        return;
                    }
                    element.textContent = savedTexts[pageName][id];
                    // Aktualizuj aj data-original-text pri načítaní
                    if (element.hasAttribute('data-original-text')) {
                        element.setAttribute('data-original-text', savedTexts[pageName][id]);
                    }
                }
            });
        }
    }
    
    // Získanie názvu stránky
    function getPageName() {
        const path = window.location.pathname;
        // Rozpoznanie podpriečinkov
        if (path.includes('/onas')) return 'onas';
        if (path.includes('/aplikacia')) return 'aplikacia';
        if (path.includes('/rezervacia')) return 'rezervacia';
        // Fallback na index
        return 'index';
    }
    
    // Aktivácia admin módu
    function activateAdminMode() {
        isAdminMode = true;
        document.body.classList.add('admin-mode');
        createAdminPanel();
        makeTextsEditable();
        prefillQuizDateInput();
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

                <div style="margin-bottom: 15px; padding: 10px; border-radius: 6px; background: #f0f8ff; border: 1px solid #cfe0ff;">
                    <label for="quiz_date_input" style="display:block; font-weight:bold; font-size: 13px; margin-bottom:4px;">Dátum a čas najbližšieho kvízu (pre web + SEO)</label>
                    <input type="datetime-local" id="quiz_date_input" name="quiz_date_input" step="60" style="width:100%; padding:6px 8px; border-radius:4px; border:1px solid #ccc; font-size:13px; box-sizing:border-box;">
                    <small style="display:block; margin-top:4px; color:#555; font-size:11px;">Tento údaj sa uloží ako <code>quiz_date_iso</code> do Firebase a použije sa na webe aj v Schema.org Event.</small>
                </div>
                
                <details style="margin-top: 0; margin-bottom: 20px; padding: 8px; border: 1px solid #d4a574; border-radius: 5px; background: #f5ede3;">
                    <summary style="cursor: pointer; color: #8b7355; font-weight: bold; font-size: 12px;">⚙️ Pokročilé operácie (rozbaľ)</summary>
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #d4a574;">
                        <button onclick="window.qbAdmin.resetPage()" class="admin-reset-btn" style="width: 100%; margin-bottom: 6px; font-size: 12px;">🔄 Resetovať stránku</button>
                        <button onclick="window.qbAdmin.clearAll()" class="admin-clear-btn" style="width: 100%; margin-bottom: 6px; font-size: 12px;">🗑️ Vymazať všetko</button>
                        <button onclick="window.qbAdmin.resetFirebaseData()" class="admin-reset-btn" style="background: #e8a87c; width: 100%; font-size: 12px;">🔥 Reset Firebase</button>
                    </div>
                </details>
                
                <div class="admin-actions">
                    <button onclick="window.qbAdmin.saveAll()" class="admin-save-btn">💾 Uložiť všetky zmeny</button>
                </div>
                
                <div class="admin-actions" style="margin-top: 15px;">
                    <button onclick="window.qbAdmin.logout()" class="admin-logout-btn">🚪 Odhlásiť sa</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
    }
    
    // Inicializácia text ID-čiek (volá sa RAZ pri prvom loadovaní) - OPTIMALIZOVANÉ
    let textIdsInitialized = false;
    function initializeTextIds() {
        // Volaj len raz za behu aplikácie
        if (textIdsInitialized) return;
        
        console.time('⏱️ Text IDs Init');
        
        // WHITELIST prvkov ktoré SMÚ byť editovateľné - NO COMPLEX SELECTORS!
        const editableSelectors = ['H1', 'H2', 'H3', 'LI'];
        const pElements = document.querySelectorAll('p');
        const liElements = document.querySelectorAll('li[id]');
        const editableElements = [];
        
        // Zbieraj len prvky bez zbytočných closest() volaní
        const elementsToIgnore = {
            'displayCapacity': true, 'listReserved': true, 'listConfirmed': true, 
            'teamReservedInfo': true, 'pinLabel': true, 'pinHelp': true, 
            'pinSection': true, 'newTeamInput': true, 'submitBtn': true,
            'formMessage': true, 'adminSection': true, 'admin-edit-panel': true,
            'publicQuizDate': true, 'publicDeadlineInfo': true, 'adminLoginPrompt': true
        };
        
        // Zbieraj H1, H2, H3
        document.querySelectorAll('h1, h2, h3').forEach(el => {
            if (!elementsToIgnore[el.id] && !el.closest('header') && !el.closest('footer')) {
                editableElements.push(el);
            }
        });
        
        // Zbieraj P bez zbytočných filtrácii
        pElements.forEach(el => {
            if (!elementsToIgnore[el.id] && !el.closest('header') && !el.closest('footer') && 
                !el.closest('#adminSection') && !el.closest('form')) {
                editableElements.push(el);
            }
        });
        
        // Zbieraj LI s ID (pre zoznamy ako "Ako postupovať?")
        liElements.forEach(el => {
            if (!elementsToIgnore[el.id] && !el.closest('header') && !el.closest('footer') && 
                !el.closest('#adminSection') && !el.closest('form') && !el.closest('nav')) {
                editableElements.push(el);
            }
        });
        
        let validIndex = 0;
        editableElements.forEach((el) => {
            // Preskočiť prvky ktoré sú v ignore liste
            if (el.id && elementsToIgnore[el.id]) {
                return;
            }
            
            // Vylúč prvky s atribútom data-no-admin-edit
            if (el.getAttribute('data-no-admin-edit') === 'true') {
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
        console.timeEnd('⏱️ Text IDs Init');
    }
    
    // Umožnenie editácie textov
    function makeTextsEditable() {
        // Zavolaj inicializáciu ak ešte nebola zavolaná
        if (!textIdsInitialized) {
            initializeTextIds();
        }
        
        // WHITELIST prvkov ktoré SMÚ byť editovateľné (pridané li pre zoznamy)
        const editableSelectors = 'h1, h2, h3, p:not(#formMessage):not(#adminLoginPrompt p):not(#pinHelp):not(#teamReservedInfo), li[id]';
        const editableElements = document.querySelectorAll(editableSelectors);
        const elementsToIgnore = [
            'displayCapacity', 'listReserved', 'listConfirmed', 'teamReservedInfo',
            'pinLabel', 'pinHelp', 'pinSection', 'newTeamInput', 'submitBtn',
            'formMessage', 'adminSection', 'admin-edit-panel', 'admin-login-modal',
            'publicQuizDate', 'publicDeadlineInfo', 'adminLoginPrompt'
        ];
        
        editableElements.forEach((el) => {
            // Preskočiť prvky ktoré sú v ignore liste
            if (el.id && elementsToIgnore.includes(el.id)) {
                return;
            }
            
            // Vylúč prvky s atribútom data-no-admin-edit
            if (el.getAttribute('data-no-admin-edit') === 'true' || el.closest('[data-no-admin-edit="true"]')) {
                return;
            }
            
            // POZNÁMKA: Prvky s home_, about_, app_ prefixmi SÚ teraz editovateľné
            // a ukladajú sa priamo do web_content kolekcie (viď saveTextToFirebase)
            
            // Vylúč prvky v headeri, footeri, admin paneli
            if (el.closest('header') || el.closest('footer') || el.closest('#admin-edit-panel') || el.closest('#admin-login-modal')) {
                return;
            }
            
            // Vylúč prvky vo formulároch a admin sekcii
            if (el.closest('form') || el.closest('#adminSection')) {
                return;
            }
            
            // Použij element ID ak existuje (pre home_, about_, app_ elementy), inak data-text-id alebo vygeneruj nové
            let textId = el.id || el.getAttribute('data-text-id');
            if (!textId) {
                textId = `text-${getPageName()}-${Math.random().toString(36).substr(2, 9)}`;
            }
            el.setAttribute('data-text-id', textId);
            
            // Ak element ešte nie je editovateľný, nastav ho
            if (!el.classList.contains('editable-text')) {
                el.setAttribute('contenteditable', 'true');
                el.classList.add('editable-text');
                
                // Uloženie pôvodného textu ak ešte nie je uložený
                const pageName = getPageName();
                if (!savedTexts[pageName]) savedTexts[pageName] = {};
                const originalText = el.textContent.trim();
                if (!savedTexts[pageName][textId]) {
                    savedTexts[pageName][textId] = originalText;
                }
                // Ulož originálny text do data atribútu pre porovnávanie
                if (!el.getAttribute('data-original-text')) {
                    el.setAttribute('data-original-text', originalText);
                }
                
                // Event listenery - pridaj len raz
                if (!el.hasAttribute('data-listener-attached')) {
                    el.addEventListener('focus', function() {
                        isEditingText = true; // Označ že user edituje
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
                    
                    el.addEventListener('blur', async function(e) {
                        isEditingText = false; // Označ že user končí editáciu
                        // GUARD: Neignoruj blur ak je event spôsobený input/textarea elementami
                        if (e.relatedTarget && (e.relatedTarget.tagName === 'INPUT' || e.relatedTarget.tagName === 'TEXTAREA')) {
                            return;
                        }
                        
                        this.style.outline = '';
                        this.style.backgroundColor = '';
                        // Automatické uloženie pri strate fokusu
                        const currentText = this.textContent.trim();
                        const tId = this.getAttribute('data-text-id');
                        const originalText = this.getAttribute('data-original-text') || '';
                        const pName = getPageName();
                        if (!savedTexts[pName]) savedTexts[pName] = {};
                        if (currentText !== originalText) {
                            savedTexts[pName][tId] = currentText;
                            // Použiť novú funkciu ktorá ukladá do správnej kolekcie
                            await saveTextToFirebase(tId, currentText);
                            // Aktualizuj originálnu hodnotu po uložení
                            this.setAttribute('data-original-text', currentText);
                        }
                    });
                    
                    el.setAttribute('data-listener-attached', 'true');
                }
            }
        });
    }
    
    // Uloženie textu do správnej Firebase kolekcie podľa prefixu ID
    async function saveTextToFirebase(textId, text) {
        await initFirebase();
        
        if (!db) {
            // Fallback na localStorage
            const pageName = getPageName();
            if (!savedTexts[pageName]) savedTexts[pageName] = {};
            savedTexts[pageName][textId] = text;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(savedTexts));
            return false;
        }
        
        try {
            const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            
            // Určenie kolekcie podľa prefixu ID
            if (textId.startsWith('home_')) {
                const docRef = doc(db, 'web_content', 'home');
                await setDoc(docRef, { [textId]: text }, { merge: true });
                console.log(`✅ Uložené do web_content/home: ${textId}`);
            } else if (textId.startsWith('about_')) {
                const docRef = doc(db, 'web_content', 'about');
                await setDoc(docRef, { [textId]: text }, { merge: true });
                console.log(`✅ Uložené do web_content/about: ${textId}`);
            } else if (textId.startsWith('app_')) {
                const docRef = doc(db, 'web_content', 'app');
                await setDoc(docRef, { [textId]: text }, { merge: true });
                console.log(`✅ Uložené do web_content/app: ${textId}`);
            } else {
                // Ostatné texty do config/pageTexts
                const pageName = getPageName();
                const docRef = doc(db, 'config', 'pageTexts');
                await setDoc(docRef, { [pageName]: { [textId]: text } }, { merge: true });
                console.log(`✅ Uložené do config/pageTexts/${pageName}: ${textId}`);
            }
            
            // Tiež ulož do localStorage ako backup
            const pageName = getPageName();
            if (!savedTexts[pageName]) savedTexts[pageName] = {};
            savedTexts[pageName][textId] = text;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(savedTexts));
            
            return true;
        } catch (error) {
            console.error("Chyba pri ukladaní do Firebase:", error);
            return false;
        }
    }

    // Konverzia hodnoty z <input type="datetime-local"> na ISO 8601 s časovým pásmom
    function toISOWithTimezone(localDateTimeValue) {
        if (!localDateTimeValue) return null;

        const parts = localDateTimeValue.split('T');
        if (parts.length !== 2) return null;

        const [datePart, timePart] = parts;
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute] = timePart.split(':').map(Number);

        if (!year || !month || !day || isNaN(hour) || isNaN(minute)) return null;

        // Date v lokálnom čase
        const dt = new Date(year, month - 1, day, hour, minute || 0, 0);

        const offsetMinutes = dt.getTimezoneOffset(); // v minútach, záporné pre + časové pásma
        const sign = offsetMinutes <= 0 ? '+' : '-';
        const abs = Math.abs(offsetMinutes);
        const offsetHours = String(Math.floor(abs / 60)).padStart(2, '0');
        const offsetMins = String(abs % 60).padStart(2, '0');

        const yyyy = dt.getFullYear();
        const MM = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        const hh = String(dt.getHours()).padStart(2, '0');
        const mm = String(dt.getMinutes()).padStart(2, '0');
        const ss = String(dt.getSeconds()).padStart(2, '0');

        return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}${sign}${offsetHours}:${offsetMins}`;
    }

    // Konverzia ISO 8601 s časovým pásmom na hodnotu pre <input type="datetime-local">
    function isoToLocalDatetimeInputValue(isoString) {
        if (!isoString) return '';
        const dt = new Date(isoString);
        if (isNaN(dt.getTime())) return '';

        const yyyy = dt.getFullYear();
        const MM = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        const hh = String(dt.getHours()).padStart(2, '0');
        const mm = String(dt.getMinutes()).padStart(2, '0');

        // Formát pre datetime-local: YYYY-MM-DDTHH:MM (bez sekúnd a bez offsetu)
        return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
    }

    // Uloženie quiz_date_iso do dokumentu web_content/home
    async function saveQuizDateIsoToFirebase(isoString) {
        await initFirebase();

        if (!db || !isoString) {
            return false;
        }

        try {
            const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const docRef = doc(db, 'web_content', 'home');
            await setDoc(docRef, { quiz_date_iso: isoString }, { merge: true });
            console.log('✅ Uložené quiz_date_iso do web_content/home:', isoString);
            return true;
        } catch (error) {
            console.error('Chyba pri ukladaní quiz_date_iso do Firebase:', error);
            return false;
        }
    }

    // Predvyplnenie datetime-local inputu z quiz_date_iso z Firebase
    async function prefillQuizDateInput() {
        const input = document.getElementById('quiz_date_input');
        if (!input) return;

        await initFirebase();
        if (!db) return;

        try {
            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const docRef = doc(db, 'web_content', 'home');
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data() || {};
                if (data.quiz_date_iso) {
                    const localValue = isoToLocalDatetimeInputValue(data.quiz_date_iso);
                    if (localValue) {
                        input.value = localValue;
                    }
                }
            }
        } catch (e) {
            console.warn('Nepodarilo sa načítať quiz_date_iso pre admin panel:', e);
        }
    }
    
    // Uloženie do Firebase alebo localStorage (zachované pre kompatibilitu)
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
    
    // Uloženie všetkých zmien (texty + dátum kvízu)
    async function saveAll() {
        const pageName = getPageName();
        const editableElements = document.querySelectorAll('[data-text-id]');
        let savedCount = 0;
        
        // 1) Uloženie všetkých editovateľných textov
        for (const el of editableElements) {
            const textId = el.getAttribute('data-text-id');
            if (textId) {
                const currentText = el.textContent.trim();
                if (!savedTexts[pageName]) savedTexts[pageName] = {};
                
                // Získaj originálnu hodnotu z data atribútu (ak existuje)
                const originalText = el.getAttribute('data-original-text') || savedTexts[pageName][textId] || '';
                
                // Uložiť ak sa text zmenil oproti originálnej hodnote
                if (originalText !== currentText) {
                    savedTexts[pageName][textId] = currentText;
                    await saveTextToFirebase(textId, currentText);
                    // Aktualizuj originálnu hodnotu
                    el.setAttribute('data-original-text', currentText);
                    savedCount++;
                }
            }
        }

        // 2) Uloženie dátumu a času kvízu do quiz_date_iso (ak existuje input v admin HTML)
        const quizDateInput = document.getElementById('quiz_date_input');
        if (quizDateInput && quizDateInput.value) {
            const isoValue = toISOWithTimezone(quizDateInput.value);
            if (isoValue) {
                const ok = await saveQuizDateIsoToFirebase(isoValue);
                if (ok) {
                    savedCount++;
                }
            }
        }
        
        alert(`✅ Uložené! (${savedCount} zmien)`);
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
    
    // Vymazanie všetkých admin dát z Firebase
    async function resetFirebaseData() {
        if (!confirm('⚠️ VAROVANIE!\n\nToto vymaže VŠETKY admin texty z Firebase databázy!\n\nJe to nevratné!\n\nChceš pokračovať?')) {
            return;
        }
        
        await initFirebase();
        
        if (!db) {
            alert('❌ Firebase nie je pripojená!');
            return;
        }
        
        try {
            const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            
            // Vymaž pageTexts dokument z Firebase
            await deleteDoc(doc(db, "config", "pageTexts"));
            
            console.log('✅ Firebase dáta vymazané');
            alert('✅ Všetky admin texty boli vymazané z Firebase!\n\nStránka sa obnoví za 2 sekundy...');
            
            // Vymaž aj localStorage
            localStorage.removeItem(STORAGE_KEY);
            
            // Obnov stránku
            setTimeout(() => {
                location.reload();
            }, 2000);
            
        } catch (error) {
            console.error("Chyba pri mazaní Firebase dát:", error);
            alert('❌ Chyba pri mazaní: ' + error.message);
        }
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
        resetFirebaseData: resetFirebaseData,
        isUserAdmin: function() {
            const u = (auth && auth.currentUser) || (window.auth && window.auth.currentUser);
            return isOrganizerEmail(u && u.email);
        },
        getAuth: function() {
            // Return auth object so other scripts can use it
            return auth;
        },
        showLoginModal: showLoginModal
    };
    
    // --- OPRAVA SPÚŠŤANIA S onAuthStateChanged ---
    const startAdmin = async function() {
        console.time('⏱️ Admin.js Init');
        
        // Nečakaj na initFirebase - spusti sa asynchronne v pozadí
        initFirebase().catch(e => console.warn('Firebase init error (non-blocking):', e));
        
        // IHNEĎ inicializuj text ID-čka bez čakania
        // (toto teraz nechá behu paralelne)
        setTimeout(() => {
            initializeTextIds();
        }, 0);
        
        // IHNEĎ vytvor tlačidlo bez oneskorenia
        createAdminButton();
        
        // Zaregistruj listener na zmeny auth stavu - ASYNCHRONNE
        if (window.auth) {
            try {
                const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
                onAuthStateChanged(window.auth, async (user) => {
                    if (user && isOrganizerEmail(user.email)) {
                        window.adminLoggedIn = true;
                        console.log("✅ Admin (organizátor) je prihlásený:", user.email);
                        loadSavedTexts().catch(e => console.warn('Text load error:', e));
                    } else {
                        window.adminLoggedIn = false;
                        if (user) {
                            console.log("ℹ️ Prihlásený bežný účet (nie organizátor):", user.email);
                        } else {
                            console.log("❌ Žiadny auth používateľ");
                        }
                        deactivate();
                    }
                });
            } catch (e) {
                console.warn('Auth state listener setup failed:', e);
            }
        }
        
        console.timeEnd('⏱️ Admin.js Init');
    };

    // Spusti IHNEĎ bez čakania na DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startAdmin);
    } else {
        // Spusti IHNEĎ bez oneskorenia
        startAdmin();
    }
    
})();
