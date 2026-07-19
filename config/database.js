// ============================================
// DATABASE CONFIGURATION
// ============================================

const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

let pool = null;

// Create connection pool
const getPool = async () => {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'wingo_db',
            waitForConnections: true,
            connectionLimit: 100,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        });
    }
    return pool;
};

// Initialize database
const initDatabase = async () => {
    try {
        const pool = await getPool();
        console.log('✅ Database connection established');
        return pool;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
};

// Execute query with error handling
const executeQuery = async (query, params = []) => {
    try {
        const pool = await getPool();
        const [results] = await pool.execute(query, params);
        return results;
    } catch (error) {
        console.error('Query execution error:', error.message);
        console.error('Query:', query);
        console.error('Params:', params);
        throw error;
    }
};

// Get single row
const getOne = async (query, params = []) => {
    const results = await executeQuery(query, params);
    return results.length > 0 ? results[0] : null;
};

// Get multiple rows
const getAll = async (query, params = []) => {
    return await executeQuery(query, params);
};

// Insert and get ID
const insert = async (query, params = []) => {
    const pool = await getPool();
    const [result] = await pool.execute(query, params);
    return result.insertId;
};

// Transaction wrapper
const transaction = async (callback) => {
    const pool = await getPool();
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

// Generate unique user ID (numbers only)
const generateUserId = async () => {
    const min = 10000000;
    const max = 99999999;
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
        const userId = String(Math.floor(Math.random() * (max - min + 1)) + min);
        const existing = await getOne('SELECT user_id FROM users WHERE user_id = ?', [userId]);
        if (!existing) {
            return userId;
        }
        attempts++;
    }
    throw new Error('Failed to generate unique user ID');
};

// Generate referral code (numbers only)
const generateReferralCode = async () => {
    const min = 100000;
    const max = 999999;
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
        const code = String(Math.floor(Math.random() * (max - min + 1)) + min);
        const existing = await getOne('SELECT referral_code FROM users WHERE referral_code = ?', [code]);
        if (!existing) {
            return code;
        }
        attempts++;
    }
    throw new Error('Failed to generate unique referral code');
};

module.exports = {
    getPool,
    initDatabase,
    executeQuery,
    getOne,
    getAll,
    insert,
    transaction,
    generateUserId,
    generateReferralCode
};
