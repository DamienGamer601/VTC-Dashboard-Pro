const io = require('socket.io-client');
const axios = require('axios');

const RENDER_URL = "https://vtc-dashboard-pro.onrender.com"; // Ton URL Render
const socket = io(RENDER_URL);

console.log("🚛 Relais VTC démarré...");

setInterval(async () => {
    try {
        const response = await axios.get('http://localhost:25555/api/ets2/telemetry');
        socket.emit('truck_data', response.data);
    } catch (err) {
        console.log("❌ Jeu non détecté...");
    }
}, 500);