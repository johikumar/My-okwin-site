// ============================================
// ADMIN CONTROLLER
// ============================================

const { getOne, getAll, insert, update, transaction } = require('../config/database');
const bcrypt = require('bcryptjs');

// Get dashboard stats
const getDashboardStats = async (req, res) => {
    try {
        const stats = await getOne(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE is_admin = 0) as total_users,
                (SELECT COUNT(*) FROM users WHERE is_active = 1 AND is_admin = 0) as active_users,
                (SELECT COUNT(*) FROM users WHERE is_banned = 1) as banned_users,
                (SELECT COUNT(*) FROM users WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)) as new_users_today,
                (SELECT COALESCE(SUM(balance), 0) FROM wallets) as total_balance,
                (SELECT COALESCE(SUM(total_deposits), 0) FROM wallets) as total_deposits,
                (SELECT COALESCE(SUM(total_withdrawals), 0) FROM wallets) as total_withdrawals,
                (SELECT COALESCE(SUM(amount), 0) FROM deposits WHERE status = 'pending') as pending_deposits,
                (SELECT COALESCE(SUM(amount), 0) FROM withdrawals WHERE status = 'pending') as pending_withdrawals,
                (SELECT COUNT(*) FROM deposits WHERE status = 'pending') as pending_deposit_count,
                (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') as pending_withdrawal_count,
                (SELECT COUNT(*) FROM bets WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)) as bets_today,
                (SELECT COUNT(*) FROM notifications WHERE is_read = 0) as unread_notifications
        `);

        // Get online users count (from socket connections)
        const io = req.app.get('io');
        const onlineUsers = io?.sockets?.adapter?.rooms?.size || 0;

        res.json({
            success: true,
            data: {
                ...stats,
                online_users: onlineUsers,
                revenue: (stats?.total_deposits || 0) - (stats?.total_withdrawals || 0)
            }
        });

    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics'
        });
    }
};

// Get recent activity
const getRecentActivity = async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const activities = await getAll(`
            (SELECT 'deposit' as type, d.*, u.mobile as user_mobile, u.name as user_name
             FROM deposits d
             JOIN users u ON d.user_id = u.user_id
             WHERE d.status = 'pending'
             ORDER BY d.created_at DESC
             LIMIT ?)
            UNION ALL
            (SELECT 'withdrawal' as type, w.*, u.mobile as user_mobile, u.name as user_name
             FROM withdrawals w
             JOIN users u ON w.user_id = u.user_id
             WHERE w.status = 'pending'
             ORDER BY w.created_at DESC
             LIMIT ?)
            ORDER BY created_at DESC
            LIMIT ?
        `, [parseInt(limit), parseInt(limit), parseInt(limit)]);

        res.json({
            success: true,
            data: activities
        });

    } catch (error) {
        console.error('Get recent activity error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recent activity'
        });
    }
};

// Get all users
const getAllUsers = async (req, res) => {
    try {
        const { search, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT 
                u.user_id, u.mobile, u.name, u.email, 
                u.referral_code, u.created_at, u.last_login,
                u.is_active, u.is_banned,
                w.balance, w.bonus_balance, w.referral_earnings
            FROM users u
            LEFT JOIN wallets w ON u.user_id = w.user_id
            WHERE u.is_admin = 0
        `;
        const params = [];

        if (search) {
            query += ' AND (u.user_id LIKE ? OR u.mobile LIKE ? OR u.name LIKE ?)';
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam);
        }

        query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const users = await getAll(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as count FROM users WHERE is_admin = 0';
        const countParams = [];
        if (search) {
            countQuery += ' AND (user_id LIKE ? OR mobile LIKE ? OR name LIKE ?)';
            const searchParam = `%${search}%`;
            countParams.push(searchParam, searchParam, searchParam);
        }
        const total = await getOne(countQuery, countParams);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    total: total.count,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        });

    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users'
        });
    }
};

// Get user details
const getUserDetails = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await getOne(`
            SELECT 
                u.*,
                w.balance, w.bonus_balance, w.referral_earnings,
                w.total_deposits, w.total_withdrawals, w.total_bets, w.total_wins
            FROM users u
            LEFT JOIN wallets w ON u.user_id = w.user_id
            WHERE u.user_id = ?
        `, [userId]);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get user's recent transactions
        const transactions = await getAll(
            `SELECT * FROM transactions 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT 20`,
            [userId]
        );

        res.json({
            success: true,
            data: {
                user,
                recent_transactions: transactions
            }
        });

    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user details'
        });
    }
};

// Update user status (activate/deactivate/ban)
const updateUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { action } = req.body;

        if (!['activate', 'deactivate', 'ban', 'unban'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action'
            });
        }

        let updateData = {};
        switch (action) {
            case 'activate':
                updateData = { is_active: 1, is_banned: 0 };
                break;
            case 'deactivate':
                updateData = { is_active: 0, is_banned: 0 };
                break;
            case 'ban':
                updateData = { is_active: 0, is_banned: 1 };
                break;
            case 'unban':
                updateData = { is_active: 1, is_banned: 0 };
                break;
        }

        await getOne(
            'UPDATE users SET is_active = ?, is_banned = ? WHERE user_id = ?',
            [updateData.is_active, updateData.is_banned, userId]
        );

        // Send notification to user
        await insert(
            `INSERT INTO notifications (user_id, title, message, type) 
             VALUES (?, 'Account Status Updated', 'Your account has been ${action}d by admin.', 'account')`,
            [userId]
        );

        res.json({
            success: true,
            message: `User ${action}d successfully`
        });

    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user status'
        });
    }
};

// Update user balance
const updateUserBalance = async (req, res) => {
    try {
        const { userId } = req.params;
        const { amount, action, reason } = req.body;

        if (!['add', 'remove'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action'
            });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount'
            });
        }

        const result = await transaction(async (connection) => {
            // Get current wallet with lock
            const [wallet] = await connection.execute(
                'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
                [userId]
            );

            if (!wallet) {
                throw new Error('Wallet not found');
            }

            const amountToChange = parseFloat(amount);
            let newBalance;

            if (action === 'add') {
                newBalance = wallet.balance + amountToChange;
                await connection.execute(
                    'UPDATE wallets SET balance = ? WHERE user_id = ?',
                    [newBalance, userId]
                );
            } else {
                if (wallet.balance < amountToChange) {
                    throw new Error('Insufficient balance');
                }
                newBalance = wallet.balance - amountToChange;
                await connection.execute(
                    'UPDATE wallets SET balance = ? WHERE user_id = ?',
                    [newBalance, userId]
                );
            }

            // Log transaction
            await connection.execute(
                `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description) 
                 VALUES (?, 'admin_${action}', ?, ?, ?, ?)`,
                [userId, amountToChange, wallet.balance, newBalance, reason || `Admin ${action}ed balance`]
            );

            // Send notification
            await connection.execute(
                `INSERT INTO notifications (user_id, title, message, type) 
                 VALUES (?, 'Balance Updated', 'Admin ${action}ed ₹${amountToChange} to your account. Reason: ${reason || 'N/A'}', 'balance')`,
                [userId]
            );

            return { newBalance };
        });

        // Send WebSocket update
        const io = req.app.get('io');
        if (io) {
            io.to(`user_${userId}`).emit('wallet_update', {
                balance: result.newBalance
            });
        }

        res.json({
            success: true,
            message: `Balance ${action}ed successfully`,
            data: { new_balance: result.newBalance }
        });

    } catch (error) {
        console.error('Update user balance error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update balance'
        });
    }
};

// Reset user password
const resetUserPassword = async (req, res) => {
    try {
        const { userId } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await getOne(
            'UPDATE users SET password = ? WHERE user_id = ?',
            [hashedPassword, userId]
        );

        // Send notification
        await insert(
            `INSERT INTO notifications (user_id, title, message, type) 
             VALUES (?, 'Password Reset', 'Your password has been reset by admin. Please login with your new password.', 'security')`,
            [userId]
        );

        res.json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('Reset user password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password'
        });
    }
};

// Delete user
const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;

        // Check if user exists
        const user = await getOne('SELECT user_id FROM users WHERE user_id = ?', [userId]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await transaction(async (connection) => {
            // Delete related records
            await connection.execute('DELETE FROM bets WHERE user_id = ?', [userId]);
            await connection.execute('DELETE FROM deposits WHERE user_id = ?', [userId]);
            await connection.execute('DELETE FROM withdrawals WHERE user_id = ?', [userId]);
            await connection.execute('DELETE FROM transactions WHERE user_id = ?', [userId]);
            await connection.execute('DELETE FROM notifications WHERE user_id = ?', [userId]);
            await connection.execute('DELETE FROM referrals WHERE referrer_id = ? OR referred_id = ?', [userId, userId]);
            await connection.execute('DELETE FROM wallets WHERE user_id = ?', [userId]);
            await connection.execute('DELETE FROM users WHERE user_id = ?', [userId]);
        });

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user'
        });
    }
};

// UPI Settings Management
const getUPISettings = async (req, res) => {
    try {
        const upis = await getAll(
            'SELECT * FROM upi_settings ORDER BY is_default DESC, created_at DESC'
        );

        res.json({
            success: true,
            data: upis
        });

    } catch (error) {
        console.error('Get UPI settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch UPI settings'
        });
    }
};

const addUPI = async (req, res) => {
    try {
        const { upi_id, upi_name, qr_code, is_default } = req.body;

        if (!upi_id) {
            return res.status(400).json({
                success: false,
                message: 'UPI ID is required'
            });
        }

        // If setting as default, remove other defaults
        if (is_default) {
            await getOne('UPDATE upi_settings SET is_default = 0 WHERE is_default = 1');
        }

        const id = await insert(
            `INSERT INTO upi_settings (upi_id, upi_name, qr_code, is_default, is_active) 
             VALUES (?, ?, ?, ?, 1)`,
            [upi_id, upi_name || null, qr_code || null, is_default ? 1 : 0]
        );

        res.status(201).json({
            success: true,
            message: 'UPI added successfully',
            data: { id }
        });

    } catch (error) {
        console.error('Add UPI error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add UPI'
        });
    }
};

const updateUPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { upi_id, upi_name, qr_code, is_active, is_default } = req.body;

        // If setting as default, remove other defaults
        if (is_default) {
            await getOne('UPDATE upi_settings SET is_default = 0 WHERE is_default = 1');
        }

        await getOne(
            `UPDATE upi_settings 
             SET upi_id = COALESCE(?, upi_id), 
                 upi_name = COALESCE(?, upi_name), 
                 qr_code = COALESCE(?, qr_code), 
                 is_active = COALESCE(?, is_active), 
                 is_default = COALESCE(?, is_default) 
             WHERE id = ?`,
            [upi_id, upi_name, qr_code, is_active, is_default, id]
        );

        res.json({
            success: true,
            message: 'UPI updated successfully'
        });

    } catch (error) {
        console.error('Update UPI error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update UPI'
        });
    }
};

const deleteUPI = async (req, res) => {
    try {
        const { id } = req.params;

        await getOne('DELETE FROM upi_settings WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'UPI deleted successfully'
        });

    } catch (error) {
        console.error('Delete UPI error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete UPI'
        });
    }
};

// Game Settings
const getGameSettings = async (req, res) => {
    try {
        const settings = await getAll('SELECT * FROM game_settings');

        const settingsObj = {};
        settings.forEach(s => {
            settingsObj[s.setting_key] = s.setting_value;
        });

        res.json({
            success: true,
            data: settingsObj
        });

    } catch (error) {
        console.error('Get game settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch game settings'
        });
    }
};

const updateGameSettings = async (req, res) => {
    try {
        const settings = req.body;

        for (const [key, value] of Object.entries(settings)) {
            await getOne(
                'UPDATE game_settings SET setting_value = ? WHERE setting_key = ?',
                [value, key]
            );
        }

        res.json({
            success: true,
            message: 'Game settings updated successfully'
        });

    } catch (error) {
        console.error('Update game settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update game settings'
        });
    }
};

// Admin Settings
const getAdminSettings = async (req, res) => {
    try {
        const settings = await getAll('SELECT * FROM admin_settings');

        const settingsObj = {};
        settings.forEach(s => {
            settingsObj[s.setting_key] = s.setting_value;
        });

        res.json({
            success: true,
            data: settingsObj
        });

    } catch (error) {
        console.error('Get admin settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch admin settings'
        });
    }
};

const updateAdminSettings = async (req, res) => {
    try {
        const settings = req.body;

        for (const [key, value] of Object.entries(settings)) {
            await getOne(
                'UPDATE admin_settings SET setting_value = ? WHERE setting_key = ?',
                [value, key]
            );
        }

        res.json({
            success: true,
            message: 'Admin settings updated successfully'
        });

    } catch (error) {
        console.error('Update admin settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update admin settings'
        });
    }
};

// Promotions
// ============================================
// ADMIN CONTROLLER - CONTINUED
// ============================================

// Promotions
const getPromotions = async (req, res) => {
    try {
        const promotions = await getAll(
            'SELECT * FROM promotions ORDER BY created_at DESC'
        );

        res.json({
            success: true,
            data: promotions
        });

    } catch (error) {
        console.error('Get promotions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch promotions'
        });
    }
};

const createPromotion = async (req, res) => {
    try {
        const { title, description, type, bonus_amount, min_deposit, start_date, end_date } = req.body;

        if (!title) {
            return res.status(400).json({
                success: false,
                message: 'Title is required'
            });
        }

        const id = await insert(
            `INSERT INTO promotions (title, description, type, bonus_amount, min_deposit, start_date, end_date) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [title, description || null, type || 'bonus', bonus_amount || 0, min_deposit || 0, start_date || null, end_date || null]
        );

        res.status(201).json({
            success: true,
            message: 'Promotion created successfully',
            data: { id }
        });

    } catch (error) {
        console.error('Create promotion error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create promotion'
        });
    }
};

const updatePromotion = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, type, bonus_amount, min_deposit, is_active, start_date, end_date } = req.body;

        await getOne(
            `UPDATE promotions 
             SET title = COALESCE(?, title), 
                 description = COALESCE(?, description), 
                 type = COALESCE(?, type), 
                 bonus_amount = COALESCE(?, bonus_amount), 
                 min_deposit = COALESCE(?, min_deposit), 
                 is_active = COALESCE(?, is_active), 
                 start_date = COALESCE(?, start_date), 
                 end_date = COALESCE(?, end_date) 
             WHERE id = ?`,
            [title, description, type, bonus_amount, min_deposit, is_active, start_date, end_date, id]
        );

        res.json({
            success: true,
            message: 'Promotion updated successfully'
        });

    } catch (error) {
        console.error('Update promotion error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update promotion'
        });
    }
};

const deletePromotion = async (req, res) => {
    try {
        const { id } = req.params;

        await getOne('DELETE FROM promotions WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Promotion deleted successfully'
        });

    } catch (error) {
        console.error('Delete promotion error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete promotion'
        });
    }
};

// Send notification to users
const sendNotification = async (req, res) => {
    try {
        const { userId, title, message, type } = req.body;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        if (userId === 'all') {
            // Send to all users
            const users = await getAll('SELECT user_id FROM users WHERE is_admin = 0');
            for (const user of users) {
                await insert(
                    `INSERT INTO notifications (user_id, title, message, type) 
                     VALUES (?, ?, ?, ?)`,
                    [user.user_id, title, message, type || 'info']
                );
            }
        } else {
            // Send to specific user
            await insert(
                `INSERT INTO notifications (user_id, title, message, type) 
                 VALUES (?, ?, ?, ?)`,
                [userId, title, message, type || 'info']
            );

            // Send WebSocket notification
            const io = req.app.get('io');
            if (io) {
                io.to(`user_${userId}`).emit('notification', {
                    title,
                    message,
                    type: type || 'info'
                });
            }
        }

        res.json({
            success: true,
            message: 'Notification sent successfully'
        });

    } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send notification'
        });
    }
};

// Get all notifications (admin view)
const getAllNotifications = async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;

        const notifications = await getAll(
            `SELECT n.*, u.mobile, u.name 
             FROM notifications n
             LEFT JOIN users u ON n.user_id = u.user_id
             ORDER BY n.created_at DESC 
             LIMIT ? OFFSET ?`,
            [parseInt(limit), parseInt(offset)]
        );

        const total = await getOne(
            'SELECT COUNT(*) as count FROM notifications'
        );

        res.json({
            success: true,
            data: {
                notifications,
                pagination: {
                    total: total.count,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        });

    } catch (error) {
        console.error('Get all notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notifications'
        });
    }
};

// Support tickets
const getSupportTickets = async (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT t.*, u.mobile, u.name 
            FROM support_tickets t
            JOIN users u ON t.user_id = u.user_id
        `;
        const params = [];

        if (status) {
            query += ' WHERE t.status = ?';
            params.push(status);
        }

        query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const tickets = await getAll(query, params);

        let countQuery = 'SELECT COUNT(*) as count FROM support_tickets t';
        const countParams = [];
        if (status) {
            countQuery += ' WHERE t.status = ?';
            countParams.push(status);
        }
        const total = await getOne(countQuery, countParams);

        res.json({
            success: true,
            data: {
                tickets,
                pagination: {
                    total: total.count,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        });

    } catch (error) {
        console.error('Get support tickets error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch support tickets'
        });
    }
};

const updateTicketStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, response } = req.body;

        if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        await transaction(async (connection) => {
            // Update ticket
            await connection.execute(
                `UPDATE support_tickets 
                 SET status = ?, resolved_at = ${status === 'resolved' ? 'NOW()' : 'NULL'} 
                 WHERE id = ?`,
                [status, id]
            );

            // Get ticket details
            const [ticket] = await connection.execute(
                'SELECT user_id FROM support_tickets WHERE id = ?',
                [id]
            );

            // Send notification to user
            if (ticket) {
                await connection.execute(
                    `INSERT INTO notifications (user_id, title, message, type) 
                     VALUES (?, 'Support Ticket Update', 'Your support ticket has been ${status}. ${response || ''}', 'support')`,
                    [ticket.user_id]
                );
            }
        });

        res.json({
            success: true,
            message: 'Ticket status updated successfully'
        });

    } catch (error) {
        console.error('Update ticket status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update ticket status'
        });
    }
};

// Announcements
const createAnnouncement = async (req, res) => {
    try {
        const { title, message, is_active } = req.body;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        const id = await insert(
            `INSERT INTO announcements (title, message, is_active) 
             VALUES (?, ?, ?)`,
            [title, message, is_active ? 1 : 0]
        );

        // Send to all users
        const users = await getAll('SELECT user_id FROM users WHERE is_admin = 0');
        for (const user of users) {
            await insert(
                `INSERT INTO notifications (user_id, title, message, type) 
                 VALUES (?, ?, ?, 'announcement')`,
                [user.user_id, title, message]
            );
        }

        // Send WebSocket notification to all
        const io = req.app.get('io');
        if (io) {
            io.emit('announcement', { title, message });
        }

        res.status(201).json({
            success: true,
            message: 'Announcement created and sent successfully',
            data: { id }
        });

    } catch (error) {
        console.error('Create announcement error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create announcement'
        });
    }
};

const getAnnouncements = async (req, res) => {
    try {
        const announcements = await getAll(
            'SELECT * FROM announcements ORDER BY created_at DESC'
        );

        res.json({
            success: true,
            data: announcements
        });

    } catch (error) {
        console.error('Get announcements error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch announcements'
        });
    }
};

module.exports = {
    getDashboardStats,
    getRecentActivity,
    getAllUsers,
    getUserDetails,
    updateUserStatus,
    updateUserBalance,
    resetUserPassword,
    deleteUser,
    getUPISettings,
    addUPI,
    updateUPI,
    deleteUPI,
    getGameSettings,
    updateGameSettings,
    getAdminSettings,
    updateAdminSettings,
    getPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,
    sendNotification,
    getAllNotifications,
    getSupportTickets,
    updateTicketStatus,
    createAnnouncement,
    getAnnouncements
};
