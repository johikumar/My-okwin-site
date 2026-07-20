require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');

const app = express();

// --- PRODUCTION SECURITY MIDDLEWARE ---
app.use(helmet()); // Secures HTTP headers
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Rate Limiter: Prevent Bot Spam / DDoS on Auth Routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 requests per window
    message: { error: "Too many requests from this IP, please try again later." }
});

// --- MONGODB DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ MongoDB Securely Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- DATABASE SCHEMAS ---
const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    uid: { type: String, required: true, unique: true },
    balance: { type: Number, default: 20 }, // ₹20 Signup Bonus
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const BetSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    gameMode: String,
    period: String,
    selection: String,
    amount: Number,
    status: { type: String, default: 'Pending' },
    payout: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

// --- JWT AUTHENTICATION MIDDLEWARE ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"
    if (!token) return res.status(401).json({ error: "Access Denied. No token provided." });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Invalid or expired token." });
        req.userId = decoded.userId;
        next();
    });
}

// --- SECURE AUTHENTICATION ROUTES ---
app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) return res.status(400).json({ error: "Missing fields" });

        const existing = await User.findOne({ phone });
        if (existing) return res.status(400).json({ error: "Account already exists" });

        // Cryptographic Hash (Salt rounds: 10)
        const hashedPassword = await bcrypt.hash(password, 10);
        const uid = String(Math.floor(1000000 + Math.random() * 9000000));

        const user = new User({ phone, password: hashedPassword, uid });
        await user.save();

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, uid: user.uid, balance: user.balance });
    } catch (err) {
        res.status(500).json({ error: "Server error during registration." });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { phone, password } = req.body;
        const user = await User.findOne({ phone });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, uid: user.uid, balance: user.balance });
    } catch (err) {
        res.status(500).json({ error: "Server error during login." });
    }
});

app.get('/api/user/profile', authenticateToken, async (req, res) => {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
});

// --- GAME STATE & BETTING ---
let gameTimers = {
    "30s": { duration: 30, remaining: 30, period: "" }
};

function generatePeriod(seconds) {
    const now = new Date();
    const totalSeconds = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
    return `${now.toISOString().slice(0, 10).replace(/-/g, "")}1000${Math.floor(totalSeconds / seconds)}`;
}

// Initialize Period
gameTimers["30s"].period = generatePeriod(30);

// Global Game Loop (Production Ready Structure)
setInterval(async () => {
    let timer = gameTimers["30s"];
    timer.remaining--;

    if (timer.remaining <= 0) {
        const winningNumber = Math.floor(Math.random() * 10);
        const oldPeriod = timer.period;
        
        // Reset for next round
        timer.remaining = 30;
        timer.period = generatePeriod(30);

        // Process Wagers in background
        const pendingBets = await Bet.find({ period: oldPeriod, status: 'Pending' });
        for (let bet of pendingBets) {
            let isWin = false;
            let multiplier = 0;

            if (!isNaN(bet.selection) && Number(bet.selection) === winningNumber) {
                isWin = true; multiplier = 9;
            } else if (bet.selection === "Green" && (winningNumber % 2 !== 0 && winningNumber !== 5)) {
                isWin = true; multiplier = 2;
            } else if (bet.selection === "Red" && (winningNumber % 2 === 0 && winningNumber !== 0)) {
                isWin = true; multiplier = 2;
            }

            if (isWin) {
                bet.status = 'Win';
                bet.payout = bet.amount * multiplier;
                await User.findByIdAndUpdate(bet.userId, { $inc: { balance: bet.payout } });
            } else {
                bet.status = 'Loss';
            }
            await bet.save();
        }
    }
}, 1000);

app.get('/api/games/state', (req, res) => { res.json(gameTimers); });

app.post('/api/games/bet', authenticateToken, async (req, res) => {
    const { selection, amount } = req.body;
    const parsedAmount = parseFloat(amount);
    
    if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

    const user = await User.findById(req.userId);
    if (user.balance < parsedAmount) return res.status(400).json({ error: "Insufficient balance" });

    user.balance -= parsedAmount;
    await user.save();

    const bet = new Bet({
        userId: user._id,
        gameMode: "30s",
        period: gameTimers["30s"].period,
        selection,
        amount: parsedAmount
    });
    await bet.save();

    res.json({ message: "Bet placed successfully", balance: user.balance });
});

// Front-End Route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 K9BETS Production Core running on Port ${PORT}`));
