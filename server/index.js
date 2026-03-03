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

// --- VARIABLES GLOBALES ---
global.MAINTENANCE_MODE = false;
global.MAINTENANCE_END = null;

// --- CONNEXION MONGODB ---
mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log("✨ DATABASE : Connectée");
        // Au démarrage, on vérifie si une maintenance était déjà active dans la DB
        const config = await mongoose.connection.db.collection('config').findOne({ id: 'maintenace_state' });
        if (config) {
            global.MAINTENANCE_MODE = config.enabled;
            global.MAINTENANCE_END = config.endTime;
            console.log(`📡 ÉTAT RESTAURÉ : Maintenance ${global.MAINTENANCE_MODE ? 'ACTIVE' : 'INACTIVE'}`);
        }
    })
    .catch(err => console.error("❌ DATABASE : Erreur", err));

// --- MODÈLE DE DONNÉES CHAUFFEURS ---
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

// --- FONCTION DE SAUVEGARDE DE L'ÉTAT ---
async function saveMaintenanceState() {
    await mongoose.connection.db.collection('config').updateOne(
        { id: 'maintenace_state' },
        { $set: { enabled: global.MAINTENANCE_MODE, endTime: global.MAINTENANCE_END } },
        { upsert: true }
    );
}

// --- MIDDLEWARES ---
app.get('/api/maintenance-status', (req, res) => {
    res.json({ enabled: global.MAINTENANCE_MODE, endTime: global.MAINTENANCE_END });
});

app.use((req, res, next) => {
    const isAsset = req.path.includes('.') || req.path.startsWith('/socket.io') || req.path.startsWith('/api');
    if (global.MAINTENANCE_MODE && req.path !== '/maintenance.html' && !isAsset) {
        return res.redirect('/maintenance.html');
    }
    next();
});

app.use(express.static(path.join(__dirname, '../dashboard')));

// --- LOGIQUE SOCKET (TÉLÉMÉTRIE & AUTH) ---
io.on('connection', (socket) => {
    // Connexion
    socket.on('auth_login', async ({ name, pass }) => {
        const driver = await Driver.findOne({ name, pass });
        if (driver && driver.isValidated) { socket.join(driver.name); socket.emit('auth_success', { name: driver.name }); }
        else { socket.emit('auth_error', 'IDENTIFIANTS INCORRECTS OU DOSSIER NON VALIDÉ.'); }
    });
    // Télémétrie
    socket.on('truck_data', async (data) => {
        const dist = (data.truck.speed / 7200); 
        await Driver.findOneAndUpdate({ name: data.driverName }, { $inc: { distance: dist, experience: (dist * 15) }, $set: { truck: data.truck, job: data.job, lastUpdate: new Date() } });
    });
});

// --- PILOTAGE PAR CLAVIER ---
if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on('keypress', async (str, key) => {
        // [M] Maintenance 7 jours
        if (key.name === 'm') {
            global.MAINTENANCE_MODE = !global.MAINTENANCE_MODE;
            if (global.MAINTENANCE_MODE) {
                const SEPT_JOURS = 7 * 24 * 60 * 60 * 1000;
                global.MAINTENANCE_END = Date.now() + SEPT_JOURS;
            } else {
                global.MAINTENANCE_END = null;
            }
            
            await saveMaintenanceState();
            console.log(`\n[VTC-OPS] MAINTENANCE : ${global.MAINTENANCE_MODE ? 'ACTIVÉE (7 JOURS)' : 'DÉSACTIVÉE'}`);
            
            // Discord
            axios.post(DISCORD_WEBHOOK, { embeds: [{ 
                title: global.MAINTENANCE_MODE ? "🚧 MAINTENANCE HEBDOMADAIRE" : "✅ RÉOUVERTURE", 
                description: global.MAINTENANCE_MODE ? "Le système entre en maintenance pour 7 jours." : "Opérations reprises.", 
                color: global.MAINTENANCE_MODE ? 16753920 : 65280 
            }]}).catch(() => {});
            
            if (global.MAINTENANCE_MODE) io.emit('receive_flash', { type: 'error', message: 'Maintenance activée.' });
        }

        // [T] Ajouter 1 jour
        if (key.name === 't' && global.MAINTENANCE_MODE) {
            global.MAINTENANCE_END += (24 * 60 * 60 * 1000);
            await saveMaintenanceState();
            console.log(`\n[VTC-OPS] +1 jour ajouté.`);
        }

        if (key.name === 'q') process.exit();
    });
}

// --- LANCEMENT ---
server.listen(PORT, () => {
    console.clear();
    console.log(`
    ==================================================
    🚀 VTC OPS MGMT SYSTEM ONLINE | PORT : ${PORT}
    ==================================================
    🛠  COMMANDES :
    [m] : Basculer MAINTENANCE (7 jours)
    [t] : Ajouter +1 jour au délai
    [q] : Arrêter le serveur
    ==================================================
    `);
});