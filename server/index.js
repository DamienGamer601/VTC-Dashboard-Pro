const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose'); // Importation de Mongoose
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Render définit dynamiquement le PORT, sinon on utilise 3000
const PORT = process.env.PORT || 3000; 

// --- CONFIGURATION DISCORD & MONGO ---
// On utilise les variables d'environnement de Render pour la sécurité
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "https://canary.discord.com/api/webhooks/1430732573285421066/okySLHgJnp1qO9tyMcogXMVH8fH8uefrSjkVGJyCff9DWBuZ246z_VV48W7rzZsMDhjI";
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://damienthil60_db_user:syUozi0fA1dlJfwY@cluster0.ieo8gkh.mongodb.net/?appName=Cluster0";

// --- CONNEXION MONGODB ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("✨ Connecté à MongoDB Atlas (Base de données Cloud)"))
    .catch(err => console.error("❌ Erreur de connexion MongoDB:", err));

// --- MODÈLE DE DONNÉES (SCHEMA) ---
const driverSchema = new mongoose.Schema({
    name: { type: String, unique: true, required: true },
    pass: { type: String, required: true },
    wallet: { type: Number, default: 1500 },
    experience: { type: Number, default: 0 },
    distance: { type: Number, default: 0 },
    isValidated: { type: Boolean, default: false }, // Gère l'état Pending/Validé
    inventory: { type: Array, default: [] },
    meta: { type: Object, default: {} },
    truck: { type: Object, default: {} },
    joinedAt: { type: Date, default: Date.now }
});

const Driver = mongoose.model('Driver', driverSchema);

// --- FONCTION ALERTE DISCORD ---
async function sendDiscordAlert(driverName, truck) {
    if (!DISCORD_WEBHOOK_URL.startsWith('http')) return;
    try {
        await axios.post(DISCORD_WEBHOOK_URL, {
            embeds: [{
                title: "🚛 Nouvelle Candidature !",
                color: 3932150,
                fields: [
                    { name: "Chauffeur", value: `**${driverName}**`, inline: true },
                    { name: "Camion Favori", value: truck, inline: true }
                ],
                footer: { text: "VTC Ops Management Terminal" },
                timestamp: new Date()
            }]
        });
    } catch (err) { console.error("Discord Webhook Error:", err.message); }
}

// --- CONFIGURATION SERVEUR ---
app.use(express.static(path.join(__dirname, '../dashboard')));

// --- LOGIQUE TEMPS RÉEL (SOCKET.IO) ---
io.on('connection', (socket) => {
    console.log('⚡ Client connecté : ' + socket.id);

    // 1. INSCRIPTION
    socket.on('auth_register', async (regData) => {
        try {
            const newDriver = new Driver({
                name: regData.name,
                pass: regData.pass,
                meta: regData.meta || {}
            });
            await newDriver.save();
            
            socket.emit('register_pending');
            // On informe l'admin qu'il y a un nouveau candidat
            const allDrivers = await Driver.find();
            io.emit('receive_admin_data', {
                drivers: allDrivers.filter(d => d.isValidated),
                pending: allDrivers.filter(d => !d.isValidated)
            });
            
            sendDiscordAlert(regData.name, regData.meta?.favoriteTruck || "Non précisé");
        } catch (err) {
            socket.emit('auth_error', 'Ce nom est déjà pris ou une erreur est survenue.');
        }
    });

    // 2. CONNEXION
    socket.on('auth_login', async ({ name, pass }) => {
        const driver = await Driver.findOne({ name, pass });
        if (driver) {
            if (driver.isValidated) {
                socket.emit('auth_success', { name: driver.name });
            } else {
                socket.emit('auth_error', 'Votre compte est en attente de validation admin.');
            }
        } else {
            socket.emit('auth_error', 'Identifiants incorrects.');
        }
    });

    // 3. ADMINISTRATION
    socket.on('get_admin_data', async () => {
        const allDrivers = await Driver.find();
        socket.emit('receive_admin_data', {
            drivers: allDrivers.filter(d => d.isValidated),
            pending: allDrivers.filter(d => !d.isValidated)
        });
    });

    socket.on('admin_validate_driver', async (name) => {
        await Driver.findOneAndUpdate({ name }, { isValidated: true });
        const allDrivers = await Driver.find();
        io.emit('receive_admin_data', {
            drivers: allDrivers.filter(d => d.isValidated),
            pending: allDrivers.filter(d => !d.isValidated)
        });
        console.log(`✅ ${name} a été validé.`);
    });

    socket.on('admin_reject_driver', async (name) => {
        await Driver.findOneAndDelete({ name, isValidated: false });
        const allDrivers = await Driver.find();
        io.emit('receive_admin_data', {
            drivers: allDrivers.filter(d => d.isValidated),
            pending: allDrivers.filter(d => !d.isValidated)
        });
    });

    // 4. MESSAGES FLASH & TÉLÉMÉTRIE
    socket.on('send_global_flash', (msg) => {
        io.emit('receive_flash', msg);
    });

    socket.on('get_driver_data', async (name) => {
        const driver = await Driver.findOne({ name });
        if (driver) socket.emit('update_dashboard', driver);
    });

    socket.on('telemetry_update', async (data) => {
        // Mise à jour atomique en base de données
        const driver = await Driver.findOneAndUpdate(
            { name: data.driverName },
            { 
                $inc: { distance: (data.truck.speed / 3600) }, 
                $set: { truck: data.truck, job: data.job } 
            },
            { new: true }
        );
        if (driver) socket.emit('update_dashboard', driver);
    });

    // 5. MAINTENANCE
    socket.on('repair_truck_full', async ({ driverName, cost }) => {
        const driver = await Driver.findOne({ name: driverName });
        if (driver && driver.wallet >= cost) {
            const updated = await Driver.findOneAndUpdate(
                { name: driverName },
                { $inc: { wallet: -cost }, $set: { "truck.wearSum": 0 } },
                { new: true }
            );
            socket.emit('repair_success', 0);
            socket.emit('update_dashboard', updated);
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ Client déconnecté');
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Serveur VTC Ops Cloud lancé sur le port ${PORT}`);
});