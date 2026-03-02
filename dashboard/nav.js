document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    const currentPage = path.split("/").pop() || "index.html";

    // Liste des pages où la navigation ne doit pas apparaître
    const authPages = ['login.html', 'register.html', 'rules.html'];
    if (authPages.includes(currentPage)) return;

    const navHTML = `
    <nav class="main-navigation">
        <div class="nav-left">
            <div class="nav-logo">
                <div class="logo-box">
                    <div class="logo-inner"></div>
                </div>
                <span class="logo-text">VTC<span class="logo-light">OPS</span></span>
            </div>
            
            <div class="nav-divider"></div>
            
            <div class="nav-links">
                <a href="index.html" class="nav-link ${currentPage === 'index.html' ? 'active' : ''}">
                    <span class="nav-icon">🚀</span> Cockpit
                </a>
                <a href="garage.html" class="nav-link ${currentPage === 'garage.html' ? 'active' : ''}">
                    <span class="nav-icon">🚛</span> Garage
                </a>
                <a href="convoys.html" class="nav-link ${currentPage === 'convoys.html' ? 'active' : ''}">
                    <span class="nav-icon">📅</span> Convois
                </a>
                <a href="stats.html" class="nav-link ${currentPage === 'stats.html' ? 'active' : ''}">
                    <span class="nav-icon">📊</span> Stats
                </a>
                <a href="leaderboard.html" class="nav-link ${currentPage === 'leaderboard.html' ? 'active' : ''}">
                    <span class="nav-icon">🏆</span> Top 100
                </a>
            </div>
        </div>

        <div class="nav-right">
            <a href="profile.html" class="user-status-link">
                <div class="user-status">
                    <div class="status-pulse"></div>
                    <span id="nav-user-name">IDENTIFICATION...</span>
                </div>
            </a>
            <button onclick="logout()" class="btn-logout" title="Terminer la session">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                </svg>
            </button>
        </div>
    </nav>

    <style>
        .main-navigation {
            background: rgba(2, 6, 23, 0.7);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            padding: 0 40px;
            display: flex; align-items: center; justify-content: space-between;
            border-bottom: 1px solid rgba(51, 65, 85, 0.4);
            position: fixed; top: 0; left: 0; right: 0;
            z-index: 9999; height: 75px;
            font-family: 'Inter', sans-serif;
            animation: navDrop 0.5s ease-out;
        }

        @keyframes navDrop { from { transform: translateY(-100%); } to { transform: translateY(0); } }

        .nav-left, .nav-right { display: flex; align-items: center; gap: 25px; }

        /* Logo Styling */
        .nav-logo { display: flex; align-items: center; gap: 12px; cursor: default; }
        .logo-box { 
            width: 24px; height: 24px; border: 2px solid #3b82f6; 
            display: flex; align-items: center; justify-content: center; transform: rotate(45deg); 
        }
        .logo-inner { width: 10px; height: 10px; background: #3b82f6; box-shadow: 0 0 10px #3b82f6; }
        .logo-text { font-family: 'JetBrains Mono'; font-weight: 900; color: #3b82f6; font-size: 1.2rem; letter-spacing: -1px; }
        .logo-light { color: white; opacity: 0.9; }

        .nav-divider { width: 1px; height: 35px; background: rgba(51, 65, 85, 0.6); margin: 0 10px; }

        /* Navigation Links */
        .nav-links { display: flex; gap: 8px; }
        .nav-link { 
            color: #94a3b8; text-decoration: none; font-size: 0.7rem; font-weight: 800; 
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            text-transform: uppercase; letter-spacing: 1.5px;
            padding: 10px 18px; border-radius: 12px;
            display: flex; align-items: center; gap: 8px;
            border: 1px solid transparent;
        }
        .nav-link:hover { color: white; background: rgba(255,255,255,0.05); transform: translateY(-1px); }
        .nav-link.active { 
            color: white; background: rgba(59, 130, 246, 0.15); 
            border-color: rgba(59, 130, 246, 0.3);
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        .nav-icon { font-size: 1rem; filter: grayscale(1) brightness(1.5); transition: 0.3s; }
        .nav-link:hover .nav-icon, .nav-link.active .nav-icon { filter: grayscale(0) brightness(1); }

        /* User Status */
        .user-status-link { text-decoration: none; }
        .user-status { 
            display: flex; align-items: center; gap: 12px; 
            background: rgba(15, 23, 42, 0.6); padding: 10px 20px; border-radius: 14px;
            border: 1px solid rgba(51, 65, 85, 0.5); transition: 0.3s;
        }
        .user-status:hover { border-color: #3b82f6; background: rgba(15, 23, 42, 0.9); }
        
        .status-pulse { 
            width: 8px; height: 8px; background: #10b981; border-radius: 50%; 
            position: relative; box-shadow: 0 0 10px #10b981;
        }
        .status-pulse::after {
            content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: #10b981; border-radius: 50%; animation: pulse 2s infinite;
        }
        @keyframes pulse { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(3); opacity: 0; } }

        #nav-user-name { font-family: 'JetBrains Mono'; font-size: 0.75rem; font-weight: 800; color: #f8fafc; }

        .btn-logout {
            background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); 
            color: #ef4444; cursor: pointer; width: 42px; height: 42px; 
            display: flex; align-items: center; justify-content: center;
            border-radius: 12px; transition: 0.3s;
        }
        .btn-logout:hover { background: #ef4444; color: white; transform: rotate(90deg); }

        /* Fix for page content padding */
        body { padding-top: 75px; } 
    </style>
    `;

    document.body.insertAdjacentHTML('afterbegin', navHTML);

    const name = localStorage.getItem('driverName');
    if(name) {
        document.getElementById('nav-user-name').innerText = name.toUpperCase();
    } else {
        window.location.href = 'login.html';
    }
});

function logout() {
    if(confirm("⚠ DÉCONNEXION DU TERMINAL\nVoulez-vous vraiment terminer votre service ?")) {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
}