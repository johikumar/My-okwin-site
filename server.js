require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const winston = require('winston'); // Added for production logging
const app = express();

app.use(helmet());
app.use(express.json());

// Production Logger
const logger = winston.createLogger({
    transports: [new winston.transports.Console()]
});

mongoose.connect(process.env.MONGO_URI);

// Helper: Calculate Game State based on System Time
function getGameState() {
    const now = new Date();
    const totalSeconds = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
    const period = `${now.toISOString().slice(0, 10).replace(/-/g, "")}1000${Math.floor(totalSeconds / 30)}`;
    const remaining = 30 - (totalSeconds % 30);
    return { period, remaining };
}

// Atomic Betting Route
app.post('/api/games/bet', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { selection, amount } = req.body;
        // 1. Verify User & Balance
        const user = await User.findById(req.userId).session(session);
        if (user.balance < amount) throw new Error("Insufficient balance");

        // 2. Perform Atomic Operations
        user.balance -= amount;
        await user.save({ session });
        
        await new Bet({ 
            userId: user._id, 
            period: getGameState().period, 
            selection, 
            amount 
        }).save({ session });

        await session.commitTransaction();
        res.json({ message: "Success", balance: user.balance });
    } catch (err) {
        await session.abortTransaction();
        logger.error(`Betting Error: ${err.message}`);
        res.status(400).json({ error: err.message });
    } finally {
        session.endSession();
    }
});

app.get('/api/games/state', (req, res) => {
    res.json(getGameState());
});

app.listen(3000, () => console.log('🚀 Server Live'));
