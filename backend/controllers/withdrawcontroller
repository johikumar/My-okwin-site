// ============================================
// WITHDRAWAL CONTROLLER
// ============================================

const { getOne, getAll, insert, transaction } = require('../config/database');

// Create withdrawal request
const createWithdrawal = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { amount, upiId, accountHolder } = req.body;

        // Validation
        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount'
            });
        }

        // Check minimum withdrawal
        const minWithdrawal = await getOne(
            "SELECT setting_value FROM admin_settings WHERE setting_key = 'min_withdrawal'"
        );
        const minAmount = parseFloat(minWithdrawal?.setting_value || 50);

        if (amount < minAmount) {
            return res.status(400).json({
                success: false,
                message: `Minimum withdrawal amount is ₹${minAmount}`
            });
        }

        // Check maximum withdrawal
        const maxWithdrawal = await getOne(
            "SELECT setting_value FROM admin_settings WHERE setting_key = 'max_withdrawal'"
        );
        const maxAmount = parseFloat(maxWithdrawal?.setting_value || 50000);

        if (amount > maxAmount) {
            return res.status(400).json({
                success: false,
                message: `Maximum withdrawal amount is ₹${maxAmount}`
            });
        }

        if (!upiId) {
            return res.status(400).json({
                success: false,
                message: 'UPI ID is required'
            });
        }

        if (!accountHolder) {
            return res.status(400).json({
                success: false,
                message: 'Account holder name is required'
            });
        }

        // Check wallet balance
        const wallet = await getOne(
            'SELECT balance FROM wallets WHERE user_id = ?',
            [userId]
        );

        if (!wallet || wallet.balance < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance'
            });
        }

        // Check for pending withdrawals
        const pendingWithdrawal = await getOne(
            'SELECT id FROM withdrawals WHERE user_id = ? AND status = "pending"',
            [userId]
        );

        if (pendingWithdrawal) {
            return res.status(400).json({
                success: false,
                message: 'You already have a pending withdrawal request'
            });
        }

        // Create withdrawal request
        const withdrawalId = await insert(
            `INSERT INTO withdrawals (user_id, amount, upi_id, account_holder, status) 
             VALUES (?, ?, ?, ?, 'pending')`,
            [userId, amount, upiId, accountHolder]
        );

        // Get withdrawal details
        const withdrawal = await getOne(
            `SELECT w.*, u.mobile, u.name 
             FROM withdrawals w 
             JOIN users u ON w.user_id = u.user_id 
             WHERE w.id = ?`,
            [withdrawalId]
        );

        // Send notification to admin
        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('new_withdrawal', {
                withdrawal: withdrawal,
                message: `New withdrawal request of ₹${amount} from ${withdrawal.name || withdrawal.mobile}`
            });
        }

        // Notify user
        await insert(
            `INSERT INTO notifications (user_id, title, message, type) 
             VALUES (?, 'Withdrawal Request Submitted', 'Your withdrawal request of ₹${amount} has been submitted and is pending approval.', 'withdrawal')`,
            [userId]
        );

        res.status(201).json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            data: {
                withdrawal_id: withdrawalId,
                status: 'pending'
            }
        });

    } catch (error) {
        console.error('Create withdrawal error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create withdrawal request'
        });
    }
};

// Get user withdrawal history
const getWithdrawalHistory = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { limit = 50, offset = 0 } = req.query;

        const withdrawals = await getAll(
            `SELECT id, amount, upi_id, account_holder, status, created_at, processed_at 
             FROM withdrawals 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT ? OFFSET ?`,
            [userId, parseInt(limit), parseInt(offset)]
        );

        const total = await getOne(
            'SELECT COUNT(*) as count FROM withdrawals WHERE user_id = ?',
            [userId]
        );

        res.json({
            success: true,
            data: {
                withdrawals,
                pagination: {
                    total: total.count,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        });

    } catch (error) {
        console.error('Get withdrawal history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch withdrawal history'
        });
    }
};

// Admin: Get all withdrawals
const getAllWithdrawals = async (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT 
                w.*, 
                u.mobile, 
                u.name,
                u.user_id as user_user_id
            FROM withdrawals w
            JOIN users u ON w.user_id = u.user_id
        `;
        const params = [];

        if (status) {
            query += ' WHERE w.status = ?';
            params.push(status);
        }

        query += ' ORDER BY w.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const withdrawals = await getAll(query, params);

        let countQuery = 'SELECT COUNT(*) as count FROM withdrawals w';
        const countParams = [];
        if (status) {
            countQuery += ' WHERE w.status = ?';
            countParams.push(status);
        }
        const total = await getOne(countQuery, countParams);

        res.json({
            success: true,
            data: {
                withdrawals,
                pagination: {
                    total: total.count,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        });

    } catch (error) {
        console.error('Get all withdrawals error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch withdrawals'
        });
    }
};

// Admin: Process withdrawal (approve/reject)
const processWithdrawal = async (req, res) => {
    try {
        const { withdrawalId, action, adminNotes } = req.body;

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action. Must be "approve" or "reject"'
            });
        }

        const result = await transaction(async (connection) => {
            // Get withdrawal details with lock
            const [withdrawal] = await connection.execute(
                'SELECT * FROM withdrawals WHERE id = ? FOR UPDATE',
                [withdrawalId]
            );

            if (!withdrawal) {
                throw new Error('Withdrawal not found');
            }

            if (withdrawal.status !== 'pending') {
                throw new Error(`Withdrawal is already ${withdrawal.status}`);
            }

            const status = action === 'approve' ? 'approved' : 'rejected';
            const currentTime = new Date().toISOString();

            // Update withdrawal
            await connection.execute(
                `UPDATE withdrawals 
                 SET status = ?, processed_at = ?, admin_notes = ? 
                 WHERE id = ?`,
                [status, currentTime, adminNotes || null, withdrawalId]
            );

            // If approved, deduct from wallet
            if (action === 'approve') {
                // Get current wallet with lock
                const [wallet] = await connection.execute(
                    'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
                    [withdrawal.user_id]
                );

                if (!wallet) {
                    throw new Error('Wallet not found');
                }

                if (wallet.balance < withdrawal.amount) {
                    throw new Error('Insufficient balance');
                }

                const newBalance = wallet.balance - parseFloat(withdrawal.amount);

                // Update wallet
                await connection.execute(
                    'UPDATE wallets SET balance = ?, total_withdrawals = total_withdrawals + ? WHERE user_id = ?',
                    [newBalance, withdrawal.amount, withdrawal.user_id]
                );

                // Update user total withdrawals
                await connection.execute(
                    'UPDATE users SET total_withdrawals = total_withdrawals + ? WHERE user_id = ?',
                    [withdrawal.amount, withdrawal.user_id]
                );

                // Log transaction
                await connection.execute(
                    `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description, reference_id) 
                     VALUES (?, 'withdrawal', ?, ?, ?, 'Withdrawal via UPI - ${withdrawal.upi_id}', ?)`,
                    [withdrawal.user_id, withdrawal.amount, wallet.balance, newBalance, withdrawalId]
                );

                // Send notification to user
                await connection.execute(
                    `INSERT INTO notifications (user_id, title, message, type) 
                     VALUES (?, 'Withdrawal Approved', 'Your withdrawal of ₹${withdrawal.amount} has been approved and will be sent to your UPI ID.', 'withdrawal')`,
                    [withdrawal.user_id]
                );
            } else {
                // Send notification for rejection
                await connection.execute(
                    `INSERT INTO notifications (user_id, title, message, type) 
                     VALUES (?, 'Withdrawal Rejected', 'Your withdrawal of ₹${withdrawal.amount} has been rejected. Reason: ${adminNotes || 'Please contact support.'}', 'withdrawal')`,
                    [withdrawal.user_id]
                );
            }

            return { withdrawal, status };
        });

        // Send WebSocket updates
        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('withdrawal_processed', {
                withdrawal_id: withdrawalId,
                status: result.status,
                message: `Withdrawal ${result.status} by admin`
            });

            io.to(`user_${result.withdrawal.user_id}`).emit('withdrawal_status_update', {
                withdrawal_id: withdrawalId,
                status: result.status,
                message: `Your withdrawal of ₹${result.withdrawal.amount} has been ${result.status}`
            });

            // If approved, update user's wallet balance in real-time
            if (result.status === 'approved') {
                const updatedWallet = await getOne(
                    'SELECT balance FROM wallets WHERE user_id = ?',
                    [result.withdrawal.user_id]
                );
                io.to(`user_${result.withdrawal.user_id}`).emit('wallet_update', {
                    balance: updatedWallet.balance
                });
            }
        }

        res.json({
            success: true,
            message: `Withdrawal ${result.status} successfully`,
            data: {
                withdrawal_id: withdrawalId,
                status: result.status
            }
        });

    } catch (error) {
        console.error('Process withdrawal error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to process withdrawal'
        });
    }
};

module.exports = {
    createWithdrawal,
    getWithdrawalHistory,
    getAllWithdrawals,
    processWithdrawal
};
