document.addEventListener('DOMContentLoaded', () => {
    // Détection de la page actuelle pour le style "Active"
    const currentPage = window.location.pathname.split("/").pop() || "index.html";

    const navHTML = `
    <nav class="main-navigation">
        <div class="nav-left">
            <div class="nav-logo">
                <div class="logo-dot"></div>
                <span class="logo-text">VTC<span style="color:white">OPS</span></span>
            </div>
            <div class="nav-divider"></div>
            <div class="nav-links">
                <a href="index.html" class="nav-link ${currentPage === 'index.html' ? 'active' : ''}">🚀 Cockpit</a>
                <a href="garage.html" class="nav-link ${currentPage === 'garage.html' ? 'active' : ''}">🚛 Garage</a>
                <a href="convoys.html" class="nav-link ${currentPage === 'convoys.html' ? 'active' : ''}">📅 Convois</a>
                <a href="stats.html" class="nav-link ${currentPage === 'stats.html' ? 'active' : ''}">📊 Stats</a>
                <a href="leaderboard.html" class="nav-link ${currentPage === 'leaderboard.html' ? 'active' : ''}">🏆 Classement</a>
                <a href="profile.html" class="nav-link ${currentPage === 'profile.html' ? 'active' : ''}">👤 Profil</a>
            </div>
        </div>

        <div class="nav-right">
            <div class="user-status">
                <span class="status-indicator"></span>
                <span id="nav-user-name">CHARGEMENT...</span>
            </div>
            <button onclick="logout()" class="btn-logout" title="Déconnexion">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            </button>
        </div>
    </nav>

    <style>
        .main-navigation {
            background: rgba(15, 23, 42, 0.8);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            padding: 0 40px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid rgba(51, 65, 85, 0.5);
            position: sticky;
            top: 0;
            z-index: 9999;
            height: 70px;
            font-family: 'Inter', sans-serif;
        }

        .nav-left, .nav-right { display: flex; align-items: center; gap: 30px; }

        .nav-logo { display: flex; align-items: center; gap: 10px; }
        .logo-dot { width: 10px; height: 10px; background: #3b82f6; border-radius: 2px; transform: rotate(45deg); }
        .logo-text { font-family: 'JetBrains Mono'; font-weight: 800; color: #3b82f6; font-size: 1.1rem; letter-spacing: 1px; }

        .nav-divider { width: 1px; height: 30px; background: rgba(51, 65, 85, 0.5); }

        .nav-links { display: flex; gap: 10px; }
        .nav-link { 
            color: #94a3b8; 
            text-decoration: none; 
            font-size: 0.75rem; 
            font-weight: 700; 
            transition: 0.2s;
            text-transform: uppercase;
            letter-spacing: 1px;
            padding: 8px 16px;
            border-radius: 8px;
        }
        .nav-link:hover { color: white; background: rgba(255,255,255,0.05); }
        .nav-link.active { color: #3b82f6; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); }

        .user-status { 
            display: flex; align-items: center; gap: 10px; 
            background: rgba(0,0,0,0.2); padding: 8px 16px; border-radius: 50px;
            border: 1px solid rgba(51, 65, 85, 0.5);
        }
        .status-indicator { width: 6px; height: 6px; background: #10b981; border-radius: 50%; box-shadow: 0 0 10px #10b981; }
        #nav-user-name { font-family: 'JetBrains Mono'; font-size: 0.75rem; font-weight: 700; color: #f8fafc; }

        .btn-logout {
            background: none; border: none; color: #64748b; cursor: pointer; padding: 5px; transition: 0.3s;
        }
        .btn-logout:hover { color: #ef4444; transform: translateX(3px); }

        /* Ajustement du body pour compenser la nav fixe si nécessaire */
        body { padding-top: 0 !important; } 
    </style>
    `;

    // Insertion
    document.body.insertAdjacentHTML('afterbegin', navHTML);

    // Initialisation des données utilisateur
    const name = localStorage.getItem('driverName');
    if(name) {
        document.getElementById('nav-user-name').innerText = name.toUpperCase();
    } else {
        // Si pas de session, redirection vers login (optionnel)
        if(currentPage !== 'login.html' && currentPage !== 'register.html' && currentPage !== 'rules.html') {
             window.location.href = 'login.html';
        }
    }
});

// Fonction globale de déconnexion
function logout() {
    if(confirm("Voulez-vous fermer votre session de conduite ?")) {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
}