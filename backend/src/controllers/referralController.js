// ============================================
// REFERRAL CONTROLLER
// ============================================

const { getOne, getAll, transaction } = require('../config/database');

// Get referral stats
const getReferralStats = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const stats = await getOne(`
            SELECT 
                (SELECT COUNT(*) FROM referrals WHERE referrer_id = ?) as total_referrals,
                (SELECT COALESCE(SUM(commission), 0) FROM referrals WHERE referrer_id = ?) as total_earnings,
                (SELECT COUNT(*) FROM referrals WHERE referrer_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)) as referrals_this_month
        `, [userId, userId, userId]);

        res.json({
            success: true,
            data: stats || {
                total_referrals: 0,
                total_earnings: 0,
                referrals_this_month: 0
            }
        });

    } catch (error) {
        console.error('Get referral stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch referral statistics'
        });
    }
};

// Get referral history
const getReferralHistory = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { limit = 50, offset = 0 } = req.query;

        const referrals = await getAll(`
            SELECT 
                r.*,
                u.mobile as referred_mobile,
                u.name as referred_name,
                u.created_at as joined_date
            FROM referrals r
            JOIN users u ON r.referred_id = u.user_id
            WHERE r.referrer_id = ?
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `, [userId, parseInt(limit), parseInt(offset)]);

        const total = await getOne(
            'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?',
            [userId]
        );

        res.json({
            success: true,
            data: {
                referrals,
                pagination: {
                    total: total.count,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        });

    } catch (error) {
        console.error('Get referral history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch referral history'
        });
    }
};

// Get referral earnings
const getReferralEarnings = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { limit = 50, offset = 0 } = req.query;

        const earnings = await getAll(`
            SELECT 
                r.*,
                u.mobile as referred_mobile,
                u.name as referred_name
            FROM referrals r
            JOIN users u ON r.referred_id = u.user_id
            WHERE r.referrer_id = ? AND r.commission > 0
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `, [userId, parseInt(limit), parseInt(offset)]);

        const total = await getOne(
            'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ? AND commission > 0',
            [userId]
        );

        res.json({
            success: true,
            data: {
                earnings,
                pagination: {
                    total: total.count,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        });

    } catch (error) {
        console.error('Get referral earnings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch referral earnings'
        });
    }
};

module.exports = {
    getReferralStats,
    getReferralHistory,
    getReferralEarnings
};
