const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);

// --- CONFIGURATION SOCKET.IO ---
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- PARAMÈTRES ---
const PORT = process.env.PORT || 3000; 
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://damienthil60_db_user:syUozi0fA1dlJfwY@cluster0.ieo8gkh.mongodb.net/?appName=Cluster0";
const DISCORD_WEBHOOK = "https://canary.discord.com/api/webhooks/1430732573285421066/okySLHgJnp1qO9tyMcogXMVH8fH8uefrSjkVGJyCff9DWBuZ246z_VV48W7rzZsMDhjI";
const ADMIN_PASSWORD = "admin60_server60"; 

// --- CONNEXION MONGODB ---
mongoose.connect(MONGO_URI)
    .then(() => console.log("✨ DATABASE : Système Connecté au Cluster VTC"))
    .catch(err => console.error("❌ DATABASE : Échec de liaison", err));

// --- MODÈLE DE DONNÉES (DRIVER) ---
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

// --- SERVEUR DE FICHIERS ---
app.use(express.static(path.join(__dirname, '../dashboard')));

// --- LOGIQUE TEMPS RÉEL (SOCKETS) ---
io.on('connection', (socket) => {
    
    // 1. ENRÔLEMENT (register.html)
    socket.on('auth_register', async (regData) => {
        try {
            const newDriver = new Driver({
                name: regData.name,
                pass: regData.pass,
                truck: { 
                    brand: regData.meta?.favoriteTruck || "Renault", 
                    model: "Division Standard", 
                    speed: 0 
                }
            });
            await newDriver.save();
            socket.emit('register_pending');
            
            // Notification Discord
            axios.post(DISCORD_WEBHOOK, {
                embeds: [{
                    title: "🆕 Nouvelle demande d'enrôlement",
                    description: `Le chauffeur **${regData.name}** attend sa validation.\nDivision : **${regData.meta?.favoriteTruck}**`,
                    color: 3447003
                }]
            }).catch(() => {});
        } catch (err) { 
            socket.emit('auth_error', 'Identifiant indisponible.'); 
        }
    });

    // 2. CONNEXION (login.html)
    socket.on('auth_login', async ({ name, pass }) => {
        const driver = await Driver.findOne({ name, pass });
        if (driver && driver.isValidated) {
            socket.join(driver.name); // Rejoint sa propre room privée
            socket.emit('auth_success', { name: driver.name });
        } else if (driver && !driver.isValidated) {
            socket.emit('auth_error', 'Accès refusé : Dossier en attente de validation.');
        } else {
            socket.emit('auth_error', 'Échec de l\'identification.');
        }
    });

    // 3. STATS PUBLIQUES (hiring.html)
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

    // 4. PROFIL PERSONNEL (profile.html)
    socket.on('get_driver_profile', async (name) => {
        const driver = await Driver.findOne({ name });
        if (driver) socket.emit('receive_driver_profile', driver);
    });

    // 5. TÉLÉMÉTRIE LIVE (Pendant que le chauffeur roule)
    socket.on('truck_data', async (data) => {
        const distanceStep = (data.truck.speed / 7200); 
        const updatedDriver = await Driver.findOneAndUpdate(
            { name: data.driverName },
            { 
                $inc: { distance: distanceStep, experience: (distanceStep * 15) },
                $set: { truck: data.truck, job: data.job, lastUpdate: new Date() } 
            },
            { new: true }
        );

        if (updatedDriver) {
            io.to(data.driverName).emit('update_dashboard', updatedDriver);
            // Mise à jour globale pour le dispatcher
            const all = await Driver.find({ isValidated: true });
            io.emit('update_leaderboard', all);
        }
    });

    // 6. ADMINISTRATION & DISPATCHER
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

// Lancement
server.listen(PORT, () => {
    console.log(`🚀 VTC OPS SYSTEM ONLINE | PORT ${PORT}`);
});