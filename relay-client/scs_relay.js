const io = require('socket.io-client');
const axios = require('axios');

const RENDER_URL = "https://vtc-dashboard-pro.onrender.com"; // TON URL ICI
const driverName = "TonPseudo"; // TON PSEUDO ICI

const socket = io(RENDER_URL);
setInterval(async () => {
    try {
        const res = await axios.get("http://localhost:25555/api/ets2/telemetry");
        const d = res.data;
        socket.emit('truck_data', {
            driverId: driverName,
            drivers_distance: d.truck.odometer,
            truck: { speed: Math.round(d.truck.speed * 3.6), fuel: d.truck.fuel, wearSum: d.truck.wearSum * 100 },
            location: { x: d.truck.placement.x, z: d.truck.placement.z, city: d.navigation.city }
        });
    } catch (e) {}
}, 1000);