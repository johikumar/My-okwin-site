// ============================================
// GAME SERVICE - WINGO GAME ENGINE
// ============================================

const { getOne, getAll, insert, transaction } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class GameService {
    constructor(io) {
        this.io = io;
        this.activeRounds = new Map();
        this.gameTimers = new Map();
        this.betLocked = new Map();
        this.isGameRunning = false;
    }

    // Initialize game settings
    async initializeGame() {
        try {
            // Get game settings
            const settings = await this.getGameSettings();
            
            // Start game loop
            this.startGameLoop(settings);
            
            console.log('🎮 Game service initialized');
            return true;
        } catch (error) {
            console.error('Game initialization error:', error);
            return false;
        }
    }

    // Get game settings from database
    async getGameSettings() {
        const settings = await getAll('SELECT setting_key, setting_value FROM game_settings');
        const settingsMap = {};
        settings.forEach(s => {
            settingsMap[s.setting_key] = s.setting_value;
        });
        return settingsMap;
    }

    // Start game loop
    startGameLoop(settings) {
        if (this.isGameRunning) return;
        this.isGameRunning = true;

        const timerOptions = [
            parseInt(settings.game_timer_30) || 30,
            parseInt(settings.game_timer_60) || 60,
            parseInt(settings.game_timer_180) || 180,
            parseInt(settings.game_timer_300) || 300
        ];

        let currentTimerIndex = 0;

        const runRound = async () => {
            try {
                const timerDuration = timerOptions[currentTimerIndex % timerOptions.length];
                currentTimerIndex++;

                // Create new round
                const roundId = await this.createRound(timerDuration);
                
                // Start countdown
                await this.startCountdown(roundId, timerDuration);
                
                // Generate result
                await this.generateResult(roundId);
                
                // Settle bets
                await this.settleBets(roundId);

                // Schedule next round
                setTimeout(runRound, 5000); // 5 second gap between rounds

            } catch (error) {
                console.error('Round error:', error);
                setTimeout(runRound, 10000);
            }
        };

        // Start first round
        setTimeout(runRound, 3000);
    }

    // Create new round
    async createRound(timerDuration) {
        const roundId = uuidv4().substring(0, 8).toUpperCase();
        
        // Store round in memory
        this.activeRounds.set(roundId, {
            roundId,
            timerDuration,
            startTime: Date.now(),
            status: 'waiting',
            bets: [],
            result: null
        });

        // Broadcast round start
        this.io.emit('round_started', {
            roundId,
            timerDuration,
            status: 'waiting'
        });

        return roundId;
    }

    // Start countdown
    async startCountdown(roundId, duration) {
        const round = this.activeRounds.get(roundId);
        if (!round) return;

        round.status = 'countdown';
        let remaining = duration;

        // Broadcast countdown updates every second
        const interval = setInterval(() => {
            remaining--;
            this.io.emit('countdown_update', {
                roundId,
                remaining,
                status: remaining > 0 ? 'betting' : 'locking'
            });

            // Enable betting
            if (remaining === duration - 5) {
                this.betLocked.set(roundId, false);
                this.io.emit('betting_opened', { roundId });
            }

            // Lock bets 3 seconds before result
            if (remaining <= 3) {
                this.betLocked.set(roundId, true);
                this.io.emit('betting_closed', { roundId });
            }

            if (remaining <= 0) {
                clearInterval(interval);
                round.status = 'result_ready';
            }
        }, 1000);

        // Store interval for cleanup
        this.gameTimers.set(roundId, interval);

        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, duration * 1000);
        });
    }

    // Generate result
    async generateResult(roundId) {
        const round = this.activeRounds.get(roundId);
        if (!round) return;

        // Generate random number 0-9
        const number = Math.floor(Math.random() * 10);
        
        // Determine color
        let color, bigSmall;
        if (number >= 0 && number <= 3) {
            color = 'red';
            bigSmall = number <= 4 ? 'small' : 'small';
        } else if (number >= 4 && number <= 6) {
            color = 'violet';
            bigSmall = number <= 4 ? 'small' : 'big';
        } else {
            color = 'green';
            bigSmall = number >= 5 ? 'big' : 'big';
        }

        // Store result
        round.result = { number, color, bigSmall };
        round.status = 'result_ready';

        // Store in database
        await insert(
            `INSERT INTO bet_history (round_id, number, color, big_small) 
             VALUES (?, ?, ?, ?)`,
            [roundId, number, color, bigSmall]
        );

        // Broadcast result
        this.io.emit('result_announced', {
            roundId,
            number,
            color,
            bigSmall
        });

        return { number, color, bigSmall };
    }

    // Place bet
    async placeBet(userId, roundId, betType, betValue, amount) {
        try {
            const round = this.activeRounds.get(roundId);
            if (!round) {
                throw new Error('Round not found');
            }

            if (round.status === 'result_ready' || round.status === 'settled') {
                throw new Error('Betting is closed for this round');
            }

            if (this.betLocked.get(roundId)) {
                throw new Error('Betting is locked');
            }

            // Validate bet type and value
            const validBetTypes = ['big', 'small', 'red', 'green', 'violet', 'number'];
            if (!validBetTypes.includes(betType)) {
                throw new Error('Invalid bet type');
            }

            if (betType === 'number' && (betValue < 0 || betValue > 9)) {
                throw new Error('Number must be between 0 and 9');
            }

            // Check min/max bet
            const settings = await this.getGameSettings();
            const minBet = parseFloat(settings.min_bet) || 1;
            const maxBet = parseFloat(settings.max_bet) || 10000;

            if (amount < minBet) {
                throw new Error(`Minimum bet amount is ₹${minBet}`);
            }
            if (amount > maxBet) {
                throw new Error(`Maximum bet amount is ₹${maxBet}`);
            }

            // Check wallet balance
            const wallet = await getOne(
                'SELECT balance FROM wallets WHERE user_id = ?',
                [userId]
            );

            if (!wallet || wallet.balance < amount) {
                throw new Error('Insufficient balance');
            }

            // Process bet in transaction
            const betResult = await transaction(async (connection) => {
                // Deduct from wallet
                await connection.execute(
                    'UPDATE wallets SET balance = balance - ?, total_bets = total_bets + ? WHERE user_id = ?',
                    [amount, amount, userId]
                );

                // Create bet record
                const betId = await connection.execute(
                    `INSERT INTO bets (user_id, round_id, bet_type, bet_value, amount, status) 
                     VALUES (?, ?, ?, ?, ?, 'pending')`,
                    [userId, roundId, betType, betValue, amount]
                );

                // Get bet details
                const [bet] = await connection.execute(
                    'SELECT * FROM bets WHERE id = ?',
                    [betId.insertId]
                );

                // Store bet in memory
                round.bets.push(bet);

                // Update user total bets
                await connection.execute(
                    'UPDATE users SET total_bets = total_bets + 1 WHERE user_id = ?',
                    [userId]
                );

                return bet;
            });

            // Broadcast bet placed
            this.io.emit('bet_placed', {
                userId,
                roundId,
                betType,
                betValue,
                amount
            });

            return betResult;

        } catch (error) {
            console.error('Place bet error:', error);
            throw error;
        }
    }

    // Settle bets
    async settleBets(roundId) {
        try {
            const round = this.activeRounds.get(roundId);
            if (!round || !round.result) return;

            const { number, color, bigSmall } = round.result;
            const bets = round.bets;

            if (bets.length === 0) {
                round.status = 'settled';
                this.io.emit('round_settled', { roundId });
                return;
            }

            // Process each bet
            for (const bet of bets) {
                let winAmount = 0;
                let won = false;

                // Determine if bet won
                switch (bet.bet_type) {
                    case 'big':
                        won = bigSmall === 'big';
                        winAmount = won ? bet.amount * 1.9 : 0;
                        break;
                    case 'small':
                        won = bigSmall === 'small';
                        winAmount = won ? bet.amount * 1.9 : 0;
                        break;
                    case 'red':
                        won = color === 'red';
                        winAmount = won ? bet.amount * 2.5 : 0;
                        break;
                    case 'green':
                        won = color === 'green';
                        winAmount = won ? bet.amount * 2.5 : 0;
                        break;
                    case 'violet':
                        won = color === 'violet';
                        winAmount = won ? bet.amount * 4 : 0;
                        break;
                    case 'number':
                        won = parseInt(bet.bet_value) === number;
                        winAmount = won ? bet.amount * 9 : 0;
                        break;
                }

                // Update bet in database
                await transaction(async (connection) => {
                    const status = won ? 'won' : 'lost';
                    
                    await connection.execute(
                        `UPDATE bets 
                         SET result = ?, win_amount = ?, status = ?, settled_at = NOW() 
                         WHERE id = ?`,
                        [number, winAmount, status, bet.id]
                    );

                    // If won, add to wallet
                    if (won && winAmount > 0) {
                        await connection.execute(
                            'UPDATE wallets SET balance = balance + ?, total_wins = total_wins + ? WHERE user_id = ?',
                            [winAmount, winAmount, bet.user_id]
                        );

                        // Log transaction
                        await connection.execute(
                            `INSERT INTO transactions (user_id, type, amount, description, reference_id) 
                             VALUES (?, 'win', ?, 'Won bet on ${bet.bet_type} ${bet.bet_value}', ?)`,
                            [bet.user_id, winAmount, bet.id]
                        );

                        // Update user total wins
                        await connection.execute(
                            'UPDATE users SET total_wins = total_wins + 1 WHERE user_id = ?',
                            [bet.user_id]
                        );

                        // Send notification
                        await connection.execute(
                            `INSERT INTO notifications (user_id, title, message, type) 
                             VALUES (?, '🎉 You Won!', 'You won ₹${winAmount} on ${bet.bet_type} ${bet.bet_value}', 'win')`,
                            [bet.user_id]
                        );
                    }

                    // Send real-time update
                    this.io.to(`user_${bet.user_id}`).emit('bet_result', {
                        bet_id: bet.id,
                        roundId,
                        won,
                        winAmount,
                        number,
                        color,
                        bigSmall
                    });

                    // Update user's wallet balance in real-time
                    if (won) {
                        const updatedWallet = await getOne(
                            'SELECT balance FROM wallets WHERE user_id = ?',
                            [bet.user_id]
                        );
                        this.io.to(`user_${bet.user_id}`).emit('wallet_update', {
                            balance: updatedWallet.balance
                        });
                    }
                });
            }

            // Update round status
            round.status = 'settled';
            this.io.emit('round_settled', { roundId });

            // Clean up
            this.activeRounds.delete(roundId);
            this.betLocked.delete(roundId);
            if (this.gameTimers.has(roundId)) {
                clearInterval(this.gameTimers.get(roundId));
                this.gameTimers.delete(roundId);
            }

        } catch (error) {
            console.error('Settle bets error:', error);
        }
    }

    // Get current round status
    getCurrentRound() {
        const rounds = Array.from(this.activeRounds.values());
        return rounds.length > 0 ? rounds[rounds.length - 1] : null;
    }

    // Get game history
    async getGameHistory(limit = 50) {
        try {
            return await getAll(
                'SELECT * FROM bet_history ORDER BY created_at DESC LIMIT ?',
                [limit]
            );
        } catch (error) {
            console.error('Get game history error:', error);
            return [];
        }
    }

    // Get user bet history
    async getUserBetHistory(userId, limit = 50, offset = 0) {
        try {
            const bets = await getAll(
                `SELECT b.*, bh.number, bh.color, bh.big_small 
                 FROM bets b
                 LEFT JOIN bet_history bh ON b.round_id = bh.round_id
                 WHERE b.user_id = ? 
                 ORDER BY b.created_at DESC 
                 LIMIT ? OFFSET ?`,
                [userId, parseInt(limit), parseInt(offset)]
            );

            const total = await getOne(
                'SELECT COUNT(*) as count FROM bets WHERE user_id = ?',
                [userId]
            );

            return {
                bets,
                total: total?.count || 0
            };
        } catch (error) {
            console.error('Get user bet history error:', error);
            return { bets: [], total: 0 };
        }
    }
}

module.exports = GameService;
