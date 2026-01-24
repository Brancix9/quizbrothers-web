// Admin mód pre editáciu textov
(function() {
    'use strict';
    
    const DEFAULT_PASSWORD = 'admin123'; // Predvolené heslo
    const PASSWORD_STORAGE_KEY = 'qb_admin_password';
    const STORAGE_KEY = 'qb_admin_texts';
    
    let isAdminMode = false;
    let savedTexts = {};
    
    // Získanie aktuálneho hesla
    function getPassword() {
        const saved = localStorage.getItem(PASSWORD_STORAGE_KEY);
        return saved || DEFAULT_PASSWORD;
    }
    
    // Uloženie nového hesla
    function setPassword(newPassword) {
        if (newPassword && newPassword.length >= 4) {
            localStorage.setItem(PASSWORD_STORAGE_KEY, newPassword);
            return true;
        }
        return false;
    }
    
    // Načítanie uložených textov
    function loadSavedTexts() {
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
                    <button onclick="window.qbAdmin.changePassword()" class="admin-password-btn">🔐 Zmeniť heslo</button>
                    <button onclick="window.qbAdmin.clearAll()" class="admin-clear-btn">🗑️ Vymazať všetko</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
    }
    
    // Umožnenie editácie textov
    function makeTextsEditable() {
        const editableSelectors = 'h1, h2, h3, p, span, a, li, .card p, .card h3, .hero h1, .hero p';
        const elements = document.querySelectorAll(editableSelectors);
        
        elements.forEach((el, index) => {
            // Preskočiť prvky v menu a footeri (môžeš pridať výnimky)
            if (el.closest('header') || el.closest('footer') || el.closest('#admin-edit-panel')) {
                return;
            }
            
            const textId = `text-${getPageName()}-${index}`;
            el.setAttribute('data-text-id', textId);
            el.setAttribute('contenteditable', 'true');
            el.classList.add('editable-text');
            
            // Uloženie pôvodného textu ak ešte nie je uložený
            const pageName = getPageName();
            if (!savedTexts[pageName]) savedTexts[pageName] = {};
            if (!savedTexts[pageName][textId]) {
                savedTexts[pageName][textId] = el.textContent.trim();
            }
            
            // Event listenery
            el.addEventListener('focus', function() {
                this.style.outline = '2px solid #27ae60';
                this.style.backgroundColor = 'rgba(39, 174, 96, 0.1)';
                // Na mobiloch minimalizuj panel pri editovaní
                if (window.innerWidth <= 768) {
                    const panel = document.getElementById('admin-edit-panel');
                    if (panel && !panel.classList.contains('admin-panel-minimized')) {
                        toggleMinimize();
                    }
                }
            });
            
            el.addEventListener('blur', function() {
                this.style.outline = '';
                this.style.backgroundColor = '';
                // Automatické uloženie pri strate fokusu
                const currentText = this.textContent.trim();
                if (currentText !== savedTexts[pageName][textId]) {
                    savedTexts[pageName][textId] = currentText;
                    saveToStorage();
                }
            });
        });
    }
    
    // Uloženie do localStorage
    function saveToStorage() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedTexts));
    }
    
    // Uloženie všetkých zmien
    function saveAll() {
        const pageName = getPageName();
        const editableElements = document.querySelectorAll('[data-text-id]');
        
        editableElements.forEach(el => {
            const textId = el.getAttribute('data-text-id');
            if (textId) {
                if (!savedTexts[pageName]) savedTexts[pageName] = {};
                savedTexts[pageName][textId] = el.textContent.trim();
            }
        });
        
        saveToStorage();
        alert('✅ Všetky zmeny boli uložené!');
    }
    
    // Reset stránky
    function resetPage() {
        if (!confirm('Naozaj chceš resetovať všetky zmeny na tejto stránke?')) return;
        
        const pageName = getPageName();
        delete savedTexts[pageName];
        saveToStorage();
        location.reload();
    }
    
    // Vymazanie všetkého
    function clearAll() {
        if (!confirm('⚠️ Naozaj chceš vymazať VŠETKY uložené texty zo všetkých stránok?')) return;
        
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
    
    // Zmena hesla
    function changePassword() {
        const currentPassword = prompt('Zadaj aktuálne heslo:');
        if (currentPassword !== getPassword()) {
            alert('❌ Nesprávne heslo!');
            return;
        }
        
        const newPassword = prompt('Zadaj nové heslo (min. 4 znaky):');
        if (newPassword && newPassword.length >= 4) {
            if (setPassword(newPassword)) {
                alert('✅ Heslo bolo úspešne zmenené!');
            } else {
                alert('❌ Heslo musí mať aspoň 4 znaky!');
            }
        } else if (newPassword !== null) {
            alert('❌ Heslo musí mať aspoň 4 znaky!');
        }
    }
    
    // Tlačidlo na aktiváciu
    function createAdminButton() {
        const btn = document.createElement('button');
        btn.id = 'admin-activate-btn';
        btn.innerHTML = '⚙';
        btn.title = 'Admin mód';
        btn.onclick = function() {
            const password = prompt('Zadaj admin heslo:');
            if (password === getPassword()) {
                activateAdminMode();
                btn.style.display = 'none';
            } else if (password !== null) {
                alert('❌ Nesprávne heslo!');
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
        changePassword: changePassword,
        toggleMinimize: toggleMinimize
    };
    
    // Inicializácia
    document.addEventListener('DOMContentLoaded', function() {
        loadSavedTexts();
        createAdminButton();
    });
    
})();
