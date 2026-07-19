// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

const jwt = require('jsonwebtoken');
const { getOne } = require('../config/database');

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await getOne(
            'SELECT user_id, mobile, name, is_admin, is_active, is_banned FROM users WHERE user_id = ?',
            [decoded.user_id]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
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
                message: 'Your account is inactive'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Admin middleware
const adminMiddleware = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!req.user.is_admin) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        next();
    } catch (error) {
        console.error('Admin middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Rate limiting per user (optional)
const userRateLimit = new Map();

const rateLimitMiddleware = (maxRequests = 100, windowMs = 60000) => {
    return (req, res, next) => {
        const userId = req.user?.user_id || req.ip;
        const now = Date.now();
        const userData = userRateLimit.get(userId) || { count: 0, resetTime: now + windowMs };

        if (now > userData.resetTime) {
            userData.count = 1;
            userData.resetTime = now + windowMs;
        } else {
            userData.count++;
        }

        userRateLimit.set(userId, userData);

        if (userData.count > maxRequests) {
            return res.status(429).json({
                success: false,
                message: 'Too many requests. Please try again later.'
            });
        }

        next();
    };
};

module.exports = {
    authMiddleware,
    adminMiddleware,
    rateLimitMiddleware
};
