const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);

// Configuration Socket.io renforcée
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000; 
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://damienthil60_db_user:syUozi0fA1dlJfwY@cluster0.ieo8gkh.mongodb.net/?appName=Cluster0";
const DISCORD_WEBHOOK = "https://canary.discord.com/api/webhooks/1430732573285421066/okySLHgJnp1qO9tyMcogXMVH8fH8uefrSjkVGJyCff9DWBuZ246z_VV48W7rzZsMDhjI";
const ADMIN_PASSWORD = "admin60_server60"; 

// --- 1. CONNEXION MONGODB ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("✨ DATABASE : Connectée au Cluster VTC"))
    .catch(err => console.error("❌ DATABASE : Échec de liaison", err));

// --- 2. MODÈLE DE DONNÉES AMÉLIORÉ ---
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

// --- 3. SERVEUR DE FICHIERS ---
app.use(express.static(path.join(__dirname, '../dashboard')));

// --- 4. LOGIQUE TEMPS RÉEL ---
io.on('connection', (socket) => {
    
    // --- AUTHENTIFICATION ---
    socket.on('auth_register', async (regData) => {
        try {
            const newDriver = new Driver({
                name: regData.name,
                pass: regData.pass,
                truck: { brand: regData.favoriteTruck || "Renault", model: "T", speed: 0 }
            });
            await newDriver.save();
            socket.emit('register_pending');
            
            // Notification Discord Nouveau Chauffeur
            axios.post(DISCORD_WEBHOOK, {
                embeds: [{
                    title: "🆕 Nouvelle demande d'enrôlement",
                    description: `Le chauffeur **${regData.name}** attend sa validation.`,
                    color: 3447003
                }]
            }).catch(() => {});
        } catch (err) { socket.emit('auth_error', 'Identifiant indisponible.'); }
    });

    socket.on('auth_login', async ({ name, pass }) => {
        const driver = await Driver.findOne({ name, pass });
        if (driver && driver.isValidated) {
            socket.emit('auth_success', { name: driver.name });
            // On rejoint une "room" spécifique à l'utilisateur pour les messages privés
            socket.join(driver.name);
        } else if (driver && !driver.isValidated) {
            socket.emit('auth_error', 'Accès refusé : En attente de validation.');
        } else {
            socket.emit('auth_error', 'Échec de l\'identification.');
        }
    });

    // --- TÉLÉMÉTRIE & STATS ---
    socket.on('truck_data', async (data) => {
        // Calcul de distance simplifié (vitesse / temps)
        const distanceStep = (data.truck.speed / 7200); 
        
        const updatedDriver = await Driver.findOneAndUpdate(
            { name: data.driverName },
            { 
                $inc: { distance: distanceStep, experience: (distanceStep * 10) },
                $set: { truck: data.truck, job: data.job, lastUpdate: new Date() } 
            },
            { new: true } // Retourne le document mis à jour
        );

        // Envoyer les stats mises à jour en temps réel au dashboard
        if (updatedDriver) {
            io.to(data.driverName).emit('update_dashboard', {
                wallet: updatedDriver.wallet,
                distance: updatedDriver.distance,
                experience: updatedDriver.experience,
                truck: updatedDriver.truck
            });
        }
    });

    // --- GESTION ADMIN ---
    socket.on('check_admin_lock', (password) => {
        if (password === ADMIN_PASSWORD) socket.emit('admin_lock_success');
        else socket.emit('admin_lock_fail');
    });

    socket.on('get_admin_data', async () => {
        const all = await Driver.find().sort({ lastUpdate: -1 });
        socket.emit('receive_admin_data', {
            drivers: all.filter(d => d.isValidated),
            pending: all.filter(d => !d.isValidated)
        });
    });

    socket.on('admin_validate_driver', async (name) => {
        await Driver.findOneAndUpdate({ name }, { isValidated: true });
        io.to(name).emit('receive_flash', { 
            type: 'success', 
            message: 'Félicitations ! Votre dossier a été validé par le Dispatch.' 
        });
    });

    socket.on('disconnect', () => {});
});

server.listen(PORT, () => {
    console.log(`🚀 VTC OPS SYSTEM ONLINE | PORT ${PORT}`);
});