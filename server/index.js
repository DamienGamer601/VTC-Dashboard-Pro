const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configuration dynamique (Render / Local)
const PORT = process.env.PORT || 3000; 
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://damienthil60_db_user:syUozi0fA1dlJfwY@cluster0.ieo8gkh.mongodb.net/?appName=Cluster0";
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || "https://canary.discord.com/api/webhooks/1430732573285421066/okySLHgJnp1qO9tyMcogXMVH8fH8uefrSjkVGJyCff9DWBuZ246z_VV48W7rzZsMDhjI";

// --- 1. CONNEXION MONGODB ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("✨ DATABASE : Connectée au Cloud Atlas"))
    .catch(err => console.error("❌ DATABASE : Erreur de connexion", err));

// --- 2. MODÈLE DE DONNÉES ---
const driverSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true },
    pass: { type: String, required: true },
    wallet: { type: Number, default: 1500 },
    experience: { type: Number, default: 0 },
    distance: { type: Number, default: 0 },
    isValidated: { type: Boolean, default: false },
    truck: { type: Object, default: { brand: "Renault", model: "T", wearSum: 0 } },
    job: { type: Object, default: {} },
    lastUpdate: { type: Date, default: Date.now }
});

const Driver = mongoose.model('Driver', driverSchema);

// --- 3. SERVEUR DE FICHIERS ---
app.use(express.static(path.join(__dirname, '../dashboard')));

// --- 4. LOGIQUE SOCKET.IO ---
io.on('connection', (socket) => {
    console.log(`📡 Connexion établie : ${socket.id}`);

    // --- A. AUTHENTIFICATION ---
    socket.on('auth_register', async (regData) => {
        try {
            const newDriver = new Driver({
                name: regData.name,
                pass: regData.pass,
                truck: { favorite: regData.meta?.favoriteTruck || "Non précisé" }
            });
            await newDriver.save();
            socket.emit('register_pending');
            
            // Alerte Discord Webhook
            if (DISCORD_WEBHOOK) {
                axios.post(DISCORD_WEBHOOK, {
                    embeds: [{
                        title: "🚛 Nouveau Candidat !",
                        description: `**${regData.name}** souhaite rejoindre VTC Ops.`,
                        color: 3447003,
                        fields: [{ name: "Camion souhaité", value: regData.meta?.favoriteTruck || "Aucun" }]
                    }]
                }).catch(() => {});
            }
        } catch (err) {
            socket.emit('auth_error', 'Nom déjà pris ou erreur système.');
        }
    });

    socket.on('auth_login', async ({ name, pass }) => {
        const driver = await Driver.findOne({ name, pass });
        if (driver) {
            if (driver.isValidated) {
                socket.emit('auth_success', { name: driver.name });
            } else {
                socket.emit('auth_error', 'Compte en attente de validation admin.');
            }
        } else {
            socket.emit('auth_error', 'Identifiants incorrects.');
        }
    });

    // --- B. TÉLÉMÉTRIE & DISTANCE (Depuis scs_relay.js) ---
    socket.on('truck_data', async (data) => {
        // Gain de distance basé sur l'update toutes les 500ms
        // (Vitesse / 3600 sec / 2 updates par sec)
        const distanceStep = (data.truck.speed / 7200);

        const updated = await Driver.findOneAndUpdate(
            { name: data.driverName },
            { 
                $inc: { distance: distanceStep, experience: (distanceStep * 10) }, // 10 XP par KM
                $set: { 
                    truck: data.truck, 
                    job: data.job, 
                    lastUpdate: new Date() 
                } 
            },
            { new: true }
        );

        if (updated) {
            socket.emit('update_dashboard', updated);
            // On diffuse à tout le monde pour le Classement et le Dispatcher
            io.emit('update_leaderboard', await Driver.find({ isValidated: true }));
        }
    });

    // --- C. STATISTIQUES RECRUTEMENT (Pour hiring.html) ---
    socket.on('get_hiring_stats', async () => {
        try {
            const drivers = await Driver.find({ isValidated: true });
            const totalKM = drivers.reduce((sum, d) => sum + (d.distance || 0), 0);
            const totalXP = drivers.reduce((sum, d) => sum + (d.experience || 0), 0);
            
            const topThree = [...drivers]
                .sort((a, b) => b.experience - a.experience)
                .slice(0, 3)
                .map(d => ({ name: d.name, xp: d.experience }));

            socket.emit('receive_hiring_stats', {
                totalKM,
                totalXP,
                activeDrivers: drivers.length,
                topThree
            });
        } catch (err) { console.log("Erreur stats hiring"); }
    });

    // --- D. ADMINISTRATION & ACTIONS ---
    socket.on('get_admin_data', async () => {
        const all = await Driver.find();
        socket.emit('receive_admin_data', {
            drivers: all.filter(d => d.isValidated),
            pending: all.filter(d => !d.isValidated)
        });
    });

    socket.on('admin_validate_driver', async (name) => {
        await Driver.findOneAndUpdate({ name }, { isValidated: true });
        io.emit('admin_refresh_needed');
    });

    socket.on('send_private_flash', ({ name, message, type }) => {
        io.emit('receive_flash', { target: name, message, type });
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Déconnexion : ${socket.id}`);
    });
});

// Lancement du serveur
server.listen(PORT, () => {
    console.log(`🚀 [VTC OPS] Serveur actif sur le port ${PORT}`);
});