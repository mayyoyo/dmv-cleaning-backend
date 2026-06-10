require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
cors: { origin: "*" }
});

/* ================= MIDDLEWARE ================= */
app.use(cors({
origin: [
"https://mydmvcleaningservice.com",
"https://www.mydmvcleaningservice.com"
],
credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

/* ================= GLOBAL ================= */
global.bookings = global.bookings || [];

/* ================= PRICES ================= */
const prices = {
"Home Cleaning": 120,
"Deep Cleaning": 200,
"Office Cleaning": 150,
"Move In/Out Cleaning": 180
};

/* ================= SOCKET ================= */
io.on("connection", (socket) => {
console.log("Client connected");

// send all bookings on connect
socket.emit("init-bookings", global.bookings);
});

/* ================= BOOK API ================= */
app.post("/api/book", (req, res) => {

const {
name,
email,
phone,
address,
date,
timeSlot,
service
} = req.body;

if (!name || !email || !phone || !address || !date || !timeSlot || !service) {
return res.status(400).json({ error: "All fields required" });
}

const exists = global.bookings.find(
b => b.date === date && b.timeSlot === timeSlot
);

if (exists) {
return res.status(409).json({ error: "Slot already booked" });
}

const total = prices[service] || 0;

const booking = {
id: Date.now(),
name,
email,
phone,
address,
date,
timeSlot,
service,
total,
status: "Pending",
createdAt: new Date().toISOString()
};

global.bookings.push(booking);

/* 🔥 REAL-TIME EVENTS */
io.emit("new-booking", booking);
io.emit("update-slots", global.bookings);

res.json({
success: true,
bookingId: booking.id,
total
});
});

/* ================= PUBLIC BOOKINGS ================= */
app.get("/api/public-bookings", (req, res) => {
res.json(global.bookings);
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
console.log("🚀 Server running on port", PORT);
});
