const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);

// Configuration Socket.io avec CORS pour éviter les blocages navigateurs
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000; 
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://damienthil60_db_user:syUozi0fA1dlJfwY@cluster0.ieo8gkh.mongodb.net/?appName=Cluster0";
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || "https://canary.discord.com/api/webhooks/1430732573285421066/okySLHgJnp1qO9tyMcogXMVH8fH8uefrSjkVGJyCff9DWBuZ246z_VV48W7rzZsMDhjI";
const ADMIN_PASSWORD = "admin60_server60"; // ⚠️ À changer !

// --- 1. CONNEXION MONGODB ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("✨ DATABASE : Connectée avec succès"))
    .catch(err => console.error("❌ DATABASE : Erreur de connexion", err));

// --- 2. MODÈLE DE DONNÉES ---
const driverSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true },
    pass: { type: String, required: true },
    wallet: { type: Number, default: 1500 },
    experience: { type: Number, default: 0 },
    distance: { type: Number, default: 0 },
    isValidated: { type: Boolean, default: false },
    truck: { type: Object, default: { brand: "Renault", model: "T", speed: 0 } },
    job: { type: Object, default: {} },
    lastUpdate: { type: Date, default: Date.now }
});

const Driver = mongoose.model('Driver', driverSchema);

// --- 3. SERVEUR DE FICHIERS ---
// Assure-toi que tes fichiers .html sont dans un dossier nommé 'dashboard'
app.use(express.static(path.join(__dirname, '../dashboard')));

// --- 4. LOGIQUE SOCKET.IO ---
io.on('connection', (socket) => {
    console.log(`📡 Client connecté : ${socket.id}`);

    // --- SÉCURITÉ ADMIN ---
    socket.on('check_admin_lock', (password) => {
        if (password === ADMIN_PASSWORD) {
            socket.emit('admin_lock_success');
            console.log(`🔓 ADMIN : Accès accordé à ${socket.id}`);
        } else {
            socket.emit('admin_lock_fail');
            console.log(`🔒 ADMIN : Échec d'authentification (${password})`);
        }
    });

    // --- AUTHENTIFICATION CHAUFFEURS ---
    socket.on('auth_register', async (regData) => {
        try {
            const newDriver = new Driver({
                name: regData.name,
                pass: regData.pass,
                truck: { favorite: regData.meta?.favoriteTruck || "Standard" }
            });
            await newDriver.save();
            socket.emit('register_pending');
        } catch (err) { socket.emit('auth_error', 'Nom déjà pris.'); }
    });

    socket.on('auth_login', async ({ name, pass }) => {
        const driver = await Driver.findOne({ name, pass });
        if (driver && driver.isValidated) {
            socket.emit('auth_success', { name: driver.name });
        } else if (driver && !driver.isValidated) {
            socket.emit('auth_error', 'Compte en attente de validation.');
        } else {
            socket.emit('auth_error', 'Identifiants incorrects.');
        }
    });

    // --- TÉLÉMÉTRIE ---
    socket.on('truck_data', async (data) => {
        const distanceStep = (data.truck.speed / 7200); 
        await Driver.findOneAndUpdate(
            { name: data.driverName },
            { 
                $inc: { distance: distanceStep, experience: (distanceStep * 10) },
                $set: { truck: data.truck, job: data.job, lastUpdate: new Date() } 
            }
        );
    });

    // --- GESTION ADMIN ---
    socket.on('get_admin_data', async () => {
        try {
            const all = await Driver.find();
            socket.emit('receive_admin_data', {
                drivers: all.filter(d => d.isValidated),
                pending: all.filter(d => !d.isValidated)
            });
        } catch (err) { console.log("Erreur de récupération admin"); }
    });

    socket.on('admin_validate_driver', async (name) => {
        await Driver.findOneAndUpdate({ name }, { isValidated: true });
        console.log(`✅ ${name} a été validé par le Dispatch.`);
    });

    socket.on('admin_ban_driver', async ({ name, reason }) => {
        await Driver.findOneAndUpdate({ name }, { isValidated: false });
        if (DISCORD_WEBHOOK) {
            axios.post(DISCORD_WEBHOOK, { content: `🚫 **BAN** : ${name} | Raison : ${reason}` }).catch(()=>{});
        }
    });

    socket.on('send_private_flash', ({ name, message, type }) => {
        io.emit('receive_flash', { target: name, message, type });
    });

    socket.on('disconnect', () => console.log(`🔌 Déconnexion : ${socket.id}`));
});

server.listen(PORT, () => {
    console.log(`
    =========================================
    🚀 SERVEUR VTC ACTIF SUR LE PORT ${PORT}
    🏠 ACCUEIL : http://localhost:${PORT}
    👑 ADMIN   : http://localhost:${PORT}/admin.html
    =========================================
    `);
});