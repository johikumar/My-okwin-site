// ============================================
// SOCKET.IO SETUP
// ============================================

const jwt = require('jsonwebtoken');
const { getOne } = require('./database');
const GameService = require('../services/gameService');

let gameService = null;

const setupSocket = (io) => {
    // Middleware for authentication
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            
            if (!token) {
                return next(new Error('Authentication required'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await getOne(
                'SELECT user_id, is_admin FROM users WHERE user_id = ? AND is_active = 1 AND is_banned = 0',
                [decoded.user_id]
            );

            if (!user) {
                return next(new Error('User not found'));
            }

            socket.userId = user.user_id;
            socket.isAdmin = user.is_admin === 1;
            next();

        } catch (error) {
            console.error('Socket auth error:', error);
            next(new Error('Authentication failed'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`🔌 User connected: ${socket.userId}`);

        // Join user room
        socket.join(`user_${socket.userId}`);

        // If admin, join admin room
        if (socket.isAdmin) {
            socket.join('admin_room');
            console.log(`👑 Admin connected: ${socket.userId}`);
        }

        // Initialize game service if not already
        if (!gameService) {
            gameService = new GameService(io);
            gameService.initializeGame();
        }

        // Send current game state to new user
        const currentRound = gameService?.getCurrentRound();
        if (currentRound) {
            socket.emit('current_round', currentRound);
        }

        // Handle placing bet
        socket.on('place_bet', async (data) => {
            try {
                const { roundId, betType, betValue, amount } = data;
                
                const bet = await gameService.placeBet(
                    socket.userId,
                    roundId,
                    betType,
                    betValue,
                    amount
                );

                socket.emit('bet_confirmation', {
                    success: true,
                    bet
                });

            } catch (error) {
                socket.emit('bet_error', {
                    success: false,
                    message: error.message
                });
            }
        });

        // Handle joining game
        socket.on('join_game', () => {
            // Send game history
            gameService?.getGameHistory(20).then(history => {
                socket.emit('game_history', history);
            });

            // Send user bet history
            gameService?.getUserBetHistory(socket.userId, 20).then(data => {
                socket.emit('user_bet_history', data);
            });
        });

        // Handle user disconnect
        socket.on('disconnect', () => {
            console.log(`🔌 User disconnected: ${socket.userId}`);
        });

        // Handle errors
        socket.on('error', (error) => {
            console.error(`Socket error for user ${socket.userId}:`, error);
        });
    });

    // Store io instance for use in controllers
    return io;
};

module.exports = { setupSocket };
