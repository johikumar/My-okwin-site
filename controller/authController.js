// ============================================
// AUTH CONTROLLER
// ============================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { 
    getOne, 
    insert, 
    transaction, 
    generateUserId, 
    generateReferralCode 
} = require('../config/database');
const { sendNotification } = require('../services/notificationService');

// Register new user
const register = async (req, res) => {
    try {
        const { mobile, password, confirmPassword, referralCode } = req.body;

        // Check if mobile already exists
        const existingUser = await getOne('SELECT user_id FROM users WHERE mobile = ?', [mobile]);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Mobile number already registered'
            });
        }

        // Check password match
        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match'
            });
        }

        // Check referral code if provided
        let referredBy = null;
        let signupBonus = 50; // Default signup bonus

        if (referralCode) {
            const referrer = await getOne('SELECT user_id FROM users WHERE referral_code = ?', [referralCode]);
            if (referrer) {
                referredBy = referrer.user_id;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid referral code'
                });
            }
        }

        // Generate user ID and referral code
        const userId = await generateUserId();
        const userReferralCode = await generateReferralCode();

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user in transaction
        const newUser = await transaction(async (connection) => {
            // Insert user
            const userQuery = `
                INSERT INTO users (user_id, referral_code, mobile, password, referred_by) 
                VALUES (?, ?, ?, ?, ?)
            `;
            const [userResult] = await connection.execute(userQuery, [
                userId,
                userReferralCode,
                mobile,
                hashedPassword,
                referredBy
            ]);

            // Create wallet
            const walletQuery = `
                INSERT INTO wallets (user_id, balance) 
                VALUES (?, ?)
            `;
            await connection.execute(walletQuery, [userId, 0]);

            // Add signup bonus if applicable
            if (signupBonus > 0) {
                // Update wallet
                await connection.execute(
                    'UPDATE wallets SET balance = balance + ?, bonus_balance = bonus_balance + ? WHERE user_id = ?',
                    [signupBonus, signupBonus, userId]
                );

                // Log transaction
                await connection.execute(
                    `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description) 
                     VALUES (?, 'bonus', ?, 0, ?, 'Signup bonus')`,
                    [userId, signupBonus, signupBonus]
                );
            }

            // Handle referral
            if (referredBy) {
                // Get referrer wallet
                const [referrerWallet] = await connection.execute(
                    'SELECT balance FROM wallets WHERE user_id = ?',
                    [referredBy]
                );

                const referralBonus = 25; // ₹25 for referrer

                // Update referrer wallet
                await connection.execute(
                    'UPDATE wallets SET balance = balance + ?, referral_earnings = referral_earnings + ? WHERE user_id = ?',
                    [referralBonus, referralBonus, referredBy]
                );

                // Log referral
                await connection.execute(
                    `INSERT INTO referrals (referrer_id, referred_id, commission) 
                     VALUES (?, ?, ?)`,
                    [referredBy, userId, referralBonus]
                );

                // Log transaction for referrer
                const beforeBalance = referrerWallet?.balance || 0;
                await connection.execute(
                    `INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, description) 
                     VALUES (?, 'referral', ?, ?, ?, 'Referral bonus for inviting ${mobile}')`,
                    [referredBy, referralBonus, beforeBalance, beforeBalance + referralBonus]
                );

                // Send notification to referrer
                await connection.execute(
                    `INSERT INTO notifications (user_id, title, message, type) 
                     VALUES (?, 'Referral Bonus', 'You earned ₹${referralBonus} for referring ${mobile}', 'referral')`,
                    [referredBy]
                );
            }

            // Send welcome notification
            await connection.execute(
                `INSERT INTO notifications (user_id, title, message, type) 
                 VALUES (?, 'Welcome to K9BETS', 'Welcome ${mobile}! Start playing and winning now.', 'info')`,
                [userId]
            );

            return { userId, userReferralCode, signupBonus };
        });

        // Generate JWT
        const token = jwt.sign(
            { user_id: userId, mobile },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                user_id: userId,
                referral_code: newUser.userReferralCode,
                signup_bonus: newUser.signupBonus,
                token
            }
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
};

// Login
const login = async (req, res) => {
    try {
        const { mobile, password } = req.body;

        const user = await getOne(`
            SELECT user_id, mobile, password, name, is_admin, is_active, is_banned 
            FROM users WHERE mobile = ?
        `, [mobile]);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid mobile number or password'
            });
        }

        if (user.is_banned) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been banned'
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Your account is inactive. Please contact support.'
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid mobile number or password'
            });
        }

        // Update last login
        await getOne('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id]);

        // Generate JWT
        const token = jwt.sign(
            { user_id: user.user_id, mobile: user.mobile },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user_id: user.user_id,
                name: user.name || user.mobile,
                is_admin: user.is_admin,
                token
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
};

// Verify token
const verifyToken = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await getOne(
            'SELECT user_id, mobile, name, is_admin FROM users WHERE user_id = ? AND is_active = 1 AND is_banned = 0',
            [decoded.user_id]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        res.json({
            success: true,
            data: {
                user_id: user.user_id,
                mobile: user.mobile,
                name: user.name,
                is_admin: user.is_admin
            }
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        res.status(500).json({
            success: false,
            message: 'Token verification failed'
        });
    }
};

// Forgot password
const forgotPassword = async (req, res) => {
    try {
        const { mobile } = req.body;

        const user = await getOne('SELECT user_id FROM users WHERE mobile = ?', [mobile]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Generate reset token
        const resetToken = jwt.sign(
            { user_id: user.user_id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Store reset token in database
        // Forgot password - CONTINUED
        // Store reset token in database
        await getOne(
            'UPDATE users SET reset_token = ?, reset_token_expiry = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE user_id = ?',
            [resetToken, user.user_id]
        );

        // In production, send email with reset link
        // For now, return the token (in production, send via email/SMS)
        res.json({
            success: true,
            message: 'Password reset token generated. Check your email/SMS for the link.',
            data: {
                reset_token: resetToken // Remove this in production
            }
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process forgot password request'
        });
    }
};

// Reset password
const resetPassword = async (req, res) => {
    try {
        const { resetToken, newPassword, confirmPassword } = req.body;

        if (!resetToken) {
            return res.status(400).json({
                success: false,
                message: 'Reset token is required'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match'
            });
        }

        // Verify token
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
        
        // Check if token exists and is not expired
        const user = await getOne(
            'SELECT user_id FROM users WHERE user_id = ? AND reset_token = ? AND reset_token_expiry > NOW()',
            [decoded.user_id, resetToken]
        );

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and clear reset token
        await getOne(
            'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE user_id = ?',
            [hashedPassword, user.user_id]
        );

        res.json({
            success: true,
            message: 'Password reset successfully. Please login with your new password.'
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password'
        });
    }
};

// Logout
const logout = async (req, res) => {
    try {
        // Client-side token removal is sufficient for JWT
        // Optionally, you can add token to a blacklist if needed
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed'
        });
    }
};

// Get user profile (protected)
const getProfile = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const user = await getOne(`
            SELECT 
                u.user_id, u.mobile, u.name, u.email, u.upi_id, 
                u.bank_name, u.bank_account, u.profile_pic, 
                u.referral_code, u.referred_by, u.created_at,
                u.total_deposits, u.total_withdrawals, u.total_bets, u.total_wins,
                w.balance, w.bonus_balance, w.referral_earnings,
                w.total_deposits as wallet_total_deposits,
                w.total_withdrawals as wallet_total_withdrawals,
                w.total_bets as wallet_total_bets,
                w.total_wins as wallet_total_wins
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

        res.json({
            success: true,
            data: user
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile'
        });
    }
};

// Update profile
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { name, email, upi_id, bank_name, bank_account } = req.body;

        const updateFields = [];
        const updateValues = [];

        if (name) {
            updateFields.push('name = ?');
            updateValues.push(name);
        }
        if (email) {
            updateFields.push('email = ?');
            updateValues.push(email);
        }
        if (upi_id) {
            updateFields.push('upi_id = ?');
            updateValues.push(upi_id);
        }
        if (bank_name) {
            updateFields.push('bank_name = ?');
            updateValues.push(bank_name);
        }
        if (bank_account) {
            updateFields.push('bank_account = ?');
            updateValues.push(bank_account);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        updateValues.push(userId);

        await getOne(
            `UPDATE users SET ${updateFields.join(', ')} WHERE user_id = ?`,
            updateValues
        );

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
};

// Change password
const changePassword = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'New passwords do not match'
            });
        }

        // Get current user with password
        const user = await getOne(
            'SELECT password FROM users WHERE user_id = ?',
            [userId]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await getOne(
            'UPDATE users SET password = ? WHERE user_id = ?',
            [hashedPassword, userId]
        );

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to change password'
        });
    }
};

// Get user stats
const getUserStats = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const stats = await getOne(`
            SELECT 
                COUNT(DISTINCT b.id) as total_bets_placed,
                SUM(CASE WHEN b.status = 'won' THEN 1 ELSE 0 END) as total_wins,
                SUM(CASE WHEN b.status = 'lost' THEN 1 ELSE 0 END) as total_losses,
                SUM(b.amount) as total_bet_amount,
                SUM(CASE WHEN b.status = 'won' THEN b.win_amount ELSE 0 END) as total_win_amount,
                (SELECT COUNT(*) FROM referrals WHERE referrer_id = ?) as total_referrals,
                (SELECT COALESCE(SUM(commission), 0) FROM referrals WHERE referrer_id = ?) as total_commission
            FROM bets b
            WHERE b.user_id = ?
        `, [userId, userId, userId]);

        res.json({
            success: true,
            data: stats || {
                total_bets_placed: 0,
                total_wins: 0,
                total_losses: 0,
                total_bet_amount: 0,
                total_win_amount: 0,
                total_referrals: 0,
                total_commission: 0
            }
        });

    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user statistics'
        });
    }
};

module.exports = {
    register,
    login,
    verifyToken,
    forgotPassword,
    resetPassword,
    logout,
    getProfile,
    updateProfile,
    changePassword,
    getUserStats
};
