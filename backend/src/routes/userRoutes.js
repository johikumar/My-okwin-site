// ============================================
// USER ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const authController = require('../controllers/authController');
const depositController = require('../controllers/depositController');
const withdrawalController = require('../controllers/withdrawalController');
const referralController = require('../controllers/referralController');
const notificationController = require('../controllers/notificationController');

// All user routes require authentication
router.use(authMiddleware);

// Profile
router.get('/profile', authController.getProfile);
router.put('/profile', authController.updateProfile);
router.post('/change-password', authController.changePassword);
router.get('/stats', authController.getUserStats);

// Wallet
router.get('/wallet', async (req, res) => {
    try {
        const { getOne } = require('../config/database');
        const wallet = await getOne(
            'SELECT * FROM wallets WHERE user_id = ?',
            [req.user.user_id]
        );
        res.json({
            success: true,
            data: wallet
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch wallet'
        });
    }
});

// Deposits
router.get('/deposits/active-upis', depositController.getActiveUPIs);
router.post('/deposits', depositController.createDeposit);
router.get('/deposits/history', depositController.getDepositHistory);

// Withdrawals
router.post('/withdrawals', withdrawalController.createWithdrawal);
router.get('/withdrawals/history', withdrawalController.getWithdrawalHistory);

// Referrals
router.get('/referrals', referralController.getReferralStats);
router.get('/referrals/history', referralController.getReferralHistory);
router.get('/referrals/earnings', referralController.getReferralEarnings);

// Notifications
router.get('/notifications', notificationController.getUserNotifications);
router.put('/notifications/:id/read', notificationController.markNotificationRead);
router.put('/notifications/read-all', notificationController.markAllRead);
router.delete('/notifications/:id', notificationController.deleteNotification);

// Support
router.post('/support', async (req, res) => {
    try {
        const { subject, message } = req.body;
        const { insert } = require('../config/database');
        
        if (!subject || !message) {
            return res.status(400).json({
                success: false,
                message: 'Subject and message are required'
            });
        }

        const id = await insert(
            `INSERT INTO support_tickets (user_id, subject, message) 
             VALUES (?, ?, ?)`,
            [req.user.user_id, subject, message]
        );

        res.status(201).json({
            success: true,
            message: 'Support ticket created successfully',
            data: { ticket_id: id }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create support ticket'
        });
    }
});

// Game history
router.get('/bet-history', async (req, res) => {
    try {
        const { getAll } = require('../config/database');
        const { limit = 50, offset = 0 } = req.query;
        
        const bets = await getAll(
            `SELECT b.*, bh.number, bh.color, bh.big_small 
             FROM bets b
             LEFT JOIN bet_history bh ON b.round_id = bh.round_id
             WHERE b.user_id = ? 
             ORDER BY b.created_at DESC 
             LIMIT ? OFFSET ?`,
            [req.user.user_id, parseInt(limit), parseInt(offset)]
        );

        const total = await getAll(
            'SELECT COUNT(*) as count FROM bets WHERE user_id = ?',
            [req.user.user_id]
        );

        res.json({
            success: true,
            data: {
                bets,
                pagination: {
                    total: total[0]?.count || 0,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch bet history'
        });
    }
});

// Transaction history
router.get('/transactions', async (req, res) => {
    try {
        const { getAll } = require('../config/database');
        const { limit = 50, offset = 0 } = req.query;
        
        const transactions = await getAll(
            `SELECT * FROM transactions 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT ? OFFSET ?`,
            [req.user.user_id, parseInt(limit), parseInt(offset)]
        );

        const total = await getAll(
            'SELECT COUNT(*) as count FROM transactions WHERE user_id = ?',
            [req.user.user_id]
        );

        res.json({
            success: true,
            data: {
                transactions,
                pagination: {
                    total: total[0]?.count || 0,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transaction history'
        });
    }
});

module.exports = router;
