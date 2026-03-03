const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios');
const readline = require('readline');

const app = express();
const server = http.createServer(app);

// --- CONFIGURATION SOCKET.IO ---
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- PARAMÈTRES ET SÉCURITÉ ---
const PORT = process.env.PORT || 3000; 
const MONGO_URI = "mongodb+srv://damienthil60_db_user:syUozi0fA1dlJfwY@cluster0.ieo8gkh.mongodb.net/?appName=Cluster0";
const ADMIN_PASSWORD = "admin60_server60"; 
const DISCORD_WEBHOOK = "https://canary.discord.com/api/webhooks/1430732573285421066/okySLHgJnp1qO9tyMcogXMVH8fH8uefrSjkVGJyCff9DWBuZ246z_VV48W7rzZsMDhjI";
const ADMIN_IPS = ['::1', '127.0.0.1']; // Whitelist pour test local

// --- LEVIER DE MAINTENANCE GLOBAL ---
global.MAINTENANCE_MODE = false; 
global.MAINTENANCE_END = null;

// --- CONNEXION MONGODB ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("✨ DATABASE : Connectée au Cluster VTC Ops"))
    .catch(err => console.error("❌ DATABASE : Erreur critique", err));

// --- MODÈLE DE DONNÉES ---
const driverSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true },
    pass: { type: String, required: true },
    wallet: { type: Number, default: 1500 },
    experience: { type: Number, default: 0 },
    distance: { type: Number, default: 0 },
    isValidated: { type: Boolean, default: false },
    truck: { type: Object, default: { brand: "Renault", model: "T", speed: 0, fuel: 100 } },
    job: { type: Object, default: { cargo: "Aucun", destination: "Dépôt" } },
    lastUpdate: { type: Date, default: Date.now }
});

const Driver = mongoose.model('Driver', driverSchema);

// --- MIDDLEWARES & ROUTES API ---
app.get('/api/maintenance-status', (req, res) => {
    res.json({ enabled: global.MAINTENANCE_MODE, endTime: global.MAINTENANCE_END });
});

app.use((req, res, next) => {
    const isAsset = req.path.includes('.') || req.path.startsWith('/socket.io') || req.path.startsWith('/api');
    const isAdmin = ADMIN_IPS.includes(req.ip) || req.query.admin === 'true';

    if (global.MAINTENANCE_MODE && req.path !== '/maintenance.html' && !isAsset && !isAdmin) {
        return res.redirect('/maintenance.html');
    }
    next();
});

app.use(express.static(path.join(__dirname, '../dashboard')));

// --- LOGIQUE TEMPS RÉEL (SOCKETS) ---
io.on('connection', (socket) => {
    
    // Stats Recrutement (Hiring.html)
    socket.on('get_hiring_stats', async () => {
        const drivers = await Driver.find({ isValidated: true });
        const topThree = await Driver.find({ isValidated: true }).sort({ experience: -1 }).limit(3);
        socket.emit('receive_hiring_stats', {
            totalKM: Math.floor(drivers.reduce((acc, d) => acc + d.distance, 0)),
            activeDrivers: drivers.length,
            totalXP: Math.floor(drivers.reduce((acc, d) => acc + d.experience, 0)),
            topThree: topThree.map(d => ({ name: d.name, xp: d.experience }))
        });
    });

    // Inscription (Register.html)
    socket.on('auth_register', async (regData) => {
        try {
            const newDriver = new Driver({ name: regData.name, pass: regData.pass, truck: { brand: regData.meta?.favoriteTruck || "Renault", model: "Division Standard" } });
            await newDriver.save();
            socket.emit('register_pending');
            axios.post(DISCORD_WEBHOOK, { embeds: [{ title: "🚛 Nouvel Enrôlement", description: `Chauffeur : **${regData.name}**\nDivision : **${regData.meta?.favoriteTruck}**`, color: 15105570 }] }).catch(() => {});
        } catch (err) { socket.emit('auth_error', 'IDENTIFIANT DÉJÀ PRIS.'); }
    });

    // Connexion (Login.html)
    socket.on('auth_login', async ({ name, pass }) => {
        const driver = await Driver.findOne({ name, pass });
        if (driver && driver.isValidated) { socket.join(driver.name); socket.emit('auth_success', { name: driver.name }); }
        else if (driver && !driver.isValidated) { socket.emit('auth_error', 'DOSSIER EN COURS DE VALIDATION.'); }
        else { socket.emit('auth_error', 'IDENTIFIANTS INCORRECTS.'); }
    });

    // Télémétrie Live
    socket.on('truck_data', async (data) => {
        const dist = (data.truck.speed / 7200); 
        const updated = await Driver.findOneAndUpdate({ name: data.driverName }, { $inc: { distance: dist, experience: (dist * 15) }, $set: { truck: data.truck, job: data.job, lastUpdate: new Date() } }, { new: true });
        if (updated) { io.to(data.driverName).emit('update_dashboard', updated); const all = await Driver.find({ isValidated: true }); io.emit('update_leaderboard', all); }
    });

    // Admin Dispatcher
    socket.on('check_admin_lock', (password) => { if (password === ADMIN_PASSWORD) socket.emit('admin_lock_success'); else socket.emit('admin_lock_fail'); });
    socket.on('get_admin_data', async () => {
        const all = await Driver.find().sort({ lastUpdate: -1 });
        socket.emit('receive_admin_data', { drivers: all.filter(d => d.isValidated), pending: all.filter(d => !d.isValidated) });
    });
});

// --- PILOTAGE PAR CLAVIER ---
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on('keypress', (str, key) => {
    // [M] Maintenance On/Off
    if (key.name === 'm') {
        global.MAINTENANCE_MODE = !global.MAINTENANCE_MODE;
        if (global.MAINTENANCE_MODE) {
            global.MAINTENANCE_END = Date.now() + (15 * 60 * 1000); // +15min par défaut
        } else {
            global.MAINTENANCE_END = null;
        }
        
        const statusMsg = global.MAINTENANCE_MODE ? '🔴 ACTIVÉE (15min)' : '✅ DÉSACTIVÉE';
        console.log(`\n[VTC-OPS] Maintenance : ${statusMsg}`);

        axios.post(DISCORD_WEBHOOK, { embeds: [{ title: "⚙️ Statut Système", description: `Maintenance : **${statusMsg}**`, color: global.MAINTENANCE_MODE ? 16711680 : 65280 }] }).catch(() => {});
        if (global.MAINTENANCE_MODE) io.emit('receive_flash', { type: 'error', message: 'MAINTENANCE : Rechargement imminent...' });
    }

    // [T] Ajouter 5 minutes
    if (key.name === 't' && global.MAINTENANCE_MODE) {
        global.MAINTENANCE_END += (5 * 60 * 1000);
        console.log(`\n[VTC-OPS] +5 minutes ajoutées.`);
    }

    // [Q] Quitter
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) { console.log("\nFermeture..."); process.exit(); }
});

// --- LANCEMENT ---
server.listen(PORT, () => {
    console.clear();
    console.log(`
    ==================================================
    🚀 VTC OPS MGMT SYSTEM ONLINE | PORT : ${PORT}
    ==================================================
    🛠  PILOTAGE LIVE :
    [m] : Basculer MAINTENANCE (Initialise à 15min)
    [t] : Ajouter +5 minutes au compteur
    [q] : Arrêter le serveur
    ==================================================
    `);
});