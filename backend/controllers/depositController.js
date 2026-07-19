// ============================================
// DEPOSIT CONTROLLER
// ============================================

const { 
    getOne, 
    getAll, 
    insert, 
    transaction,
    executeQuery 
} = require('../config/database');

// Get active UPI settings
const getActiveUPIs = async (req, res) => {
    try {
        const upis = await getAll(
            'SELECT id, upi_id, upi_name, qr_code, is_default FROM upi_settings WHERE is_active = 1 ORDER BY is_default DESC'
        );

        res.json({
            success: true,
            data: upis
        });

    } catch (error) {
        console.error('Get active UPIs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch UPI settings'
        });
    }
};

// Create deposit request
const createDeposit = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { amount, utrNumber, upiId } = req.body;

        // Validation
        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount'
            });
        }

        if (!utrNumber || utrNumber.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Valid UTR number is required'
            });
        }

        if (!upiId) {
            return res.status(400).json({
                success: false,
                message: 'UPI ID is required'
            });
        }

        // Check if UPI exists and is active
        const upi = await getOne(
            'SELECT id FROM upi_settings WHERE upi_id = ? AND is_active = 1',
            [upiId]
        );

        if (!upi) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or inactive UPI ID'
            });
        }

        // Check for duplicate UTR
        const existingDeposit = await getOne(
            'SELECT id FROM deposits WHERE utr_number = ? AND status IN ("pending", "accepted")',
            [utrNumber]
        );

        if (existingDeposit) {
            return res.status(400).json({
                success: false,
                message: 'This UTR number has already been used'
            });
        }

        // Create deposit
        const depositId = await insert(
            `INSERT INTO deposits (user_id, amount, utr_number, upi_id, status) 
             VALUES (?, ?, ?, ?, 'pending')`,
            [userId, amount, utrNumber, upiId]
        );

        // Get deposit details
        const deposit = await getOne(
            `SELECT d.*, u.mobile, u.name 
             FROM deposits d 
             JOIN users u ON d.user_id = u.user_id 
             WHERE d.id = ?`,
            [depositId]
        );

        // Send notification to admin (via WebSocket)
        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('new_deposit', {
                deposit: deposit,
                message: `New deposit request of ₹${amount} from ${deposit.name || deposit.mobile}`
            });
        }

        // Notify user
        await insert(
            `INSERT INTO notifications (user_id, title, message, type) 
             VALUES (?, 'Deposit Request Submitted', 'Your deposit of ₹${amount} has been submitted and is pending approval.', 'deposit')`,
            [userId]
        );

        res.status(201).json({
            success: true,
            message: 'Deposit request submitted successfully',
            data: {
                deposit_id: depositId,
                status: 'pending'
            }
        });

    } catch (error) {
        console.error('Create deposit error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create deposit request'
        });
    }
};

// Get user deposit history
const getDepositHistory = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { limit = 50, offset = 0 } = req.query;

        const deposits = await getAll(
            `SELECT id, amount, utr_number, upi_id, status, created_at, processed_at 
             FROM deposits 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT ? OFFSET ?`,
            [userId, parseInt(limit), parseInt(offset)]
        );

        const total = await getOne(
            'SELECT COUNT(*) as count FROM deposits WHERE user_id = ?',
            [userId]
        );

        res.json({
            success: true,
            data: {
                deposits,
                pagination: {
                    total: total.count,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        });

    } catch (error) {
        console.error('Get deposit history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch deposit history'
        });
    }
};

// Admin: Get all deposits
const getAllDeposits = async (req, res) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT 
                d.*, 
                u.mobile, 
                u.name,
                u.user_id as user_user_id
            FROM deposits d
            JOIN users u ON d.user_id = u.user_id
        `;
        const params = [];

        if (status) {
            query += ' WHERE d.status = ?';
            params.push(status);
        }

        query += ' ORDER BY d.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const deposits = await getAll(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as count FROM deposits d';
        const countParams = [];
        if (status) {
            countQuery += ' WHERE d.status = ?';
            countParams.push(status);
        }
        const total = await getOne(countQuery, countParams);

        res.json({
            success: true,
            data: {
                deposits,
                pagination: {
                    total: total.count,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        });

    } catch (error) {
        console.error('Get all deposits error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch deposits'
        });
    }
};

// Admin: Process deposit (accept/reject)
const processDeposit = async (req, res) => {
    try {
        const { depositId, action, adminNotes } = req.body;
        const adminId = req.user.user_id;

        if (!['accept', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action. Must be "accept" or "reject"'
            });
        }

        const result = await transaction(async (connection) => {
            // Get deposit details
            const [deposit] = await connection.execute(
                'SELECT * FROM deposits WHERE id = ? FOR UPDATE',
                [depositId]
            );

            if (!deposit) {
                throw new Error('Deposit not found');
            }

            if (deposit.status !== 'pending') {
                throw new Error(`Deposit is already ${deposit.status}`);
            }

            const status = action === 'accept' ? 'accepted' : 'rejected';
            const currentTime = new Date().toISOString();

            // Update deposit
            await connection.execute(
                `UPDATE deposits 
                 SET status = ?, processed_at = ?, admin_notes = ? 
                 WHERE id = ?`,
                [status, currentTime, adminNotes || null, depositId]
            );

            // If accepted, update wallet
            if (action === 'accept') {
                // Get current wallet
                const [wallet] = await connection.execute(
                    'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
                    [deposit.user_id]
                );

                if (!wallet) {
                    throw new Error('Wallet not found');
                }

                const newBalance = wallet.balance + parseFloat(deposit.amount);

                // Update wallet
                await connection.execute(
                    'UPDATE wallets SET balance = ?, total_deposits = total_deposits + ? WHERE user_id = ?',
                    [newBalance, deposit.amount, deposit.user_id]
                );

                // Update user total deposits
                await connection.execute(
                    'UPDATE users SET total_deposits = total_deposits + ? WHERE user_id = ?',
                    [deposit.amount, deposit.user_id]
                );

                // Log transaction
                await connection.execute(
                    `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description, reference_id) 
                     VALUES (?, 'deposit', ?, ?, ?, 'Deposit via UPI - ${deposit.upi_id}', ?)`,
                    [deposit.user_id, deposit.amount, wallet.balance, newBalance, depositId]
                );

                // Send notification to user
                await connection.execute(
                    `INSERT INTO notifications (user_id, title, message, type) 
                     VALUES (?, 'Deposit Approved', 'Your deposit of ₹${deposit.amount} has been approved and added to your wallet.', 'deposit')`,
                    [deposit.user_id]
                );
            } else {
                // Send notification for rejection
                await connection.execute(
                    `INSERT INTO notifications (user_id, title, message, type) 
                     VALUES (?, 'Deposit Rejected', 'Your deposit of ₹${deposit.amount} has been rejected. Reason: ${adminNotes || 'Please try again or contact support.'}', 'deposit')`,
                    [deposit.user_id]
                );
            }

            return { deposit, status };
        });

        // Send WebSocket updates
        const io = req.app.get('io');
        if (io) {
            // Notify admin
            io.to('admin_room').emit('deposit_processed', {
                deposit_id: depositId,
                status: result.status,
                message: `Deposit ${result.status} by admin`
            });

            // Notify user
            io.to(`user_${result.deposit.user_id}`).emit('deposit_status_update', {
                deposit_id: depositId,
                status: result.status,
                message: `Your deposit of ₹${result.deposit.amount} has been ${result.status}`
            });

            // If accepted, update user's wallet balance in real-time
            if (result.status === 'accepted') {
                const updatedWallet = await getOne(
                    'SELECT balance FROM wallets WHERE user_id = ?',
                    [result.deposit.user_id]
                );
                io.to(`user_${result.deposit.user_id}`).emit('wallet_update', {
                    balance: updatedWallet.balance
                });
            }
        }

        res.json({
            success: true,
            message: `Deposit ${result.status} successfully`,
            data: {
                deposit_id: depositId,
                status: result.status
            }
        });

    } catch (error) {
        console.error('Process deposit error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to process deposit'
        });
    }
};

module.exports = {
    getActiveUPIs,
    createDeposit,
    getDepositHistory,
    getAllDeposits,
    processDeposit
};
