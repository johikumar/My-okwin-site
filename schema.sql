-- ============================================
-- WINGO PLATFORM - COMPLETE DATABASE SCHEMA
-- ============================================

CREATE DATABASE IF NOT EXISTS wingo_db;
USE wingo_db;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(20) UNIQUE NOT NULL,
    referral_code VARCHAR(20) UNIQUE NOT NULL,
    referred_by VARCHAR(20),
    mobile VARCHAR(15) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    email VARCHAR(100),
    upi_id VARCHAR(100),
    bank_name VARCHAR(100),
    bank_account VARCHAR(50),
    profile_pic VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_banned BOOLEAN DEFAULT FALSE,
    frozen BOOLEAN DEFAULT FALSE,
    total_deposits DECIMAL(15,2) DEFAULT 0,
    total_withdrawals DECIMAL(15,2) DEFAULT 0,
    total_bets INT DEFAULT 0,
    total_wins INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_referral_code (referral_code),
    INDEX idx_mobile (mobile)
);

-- ============================================
-- WALLET TABLE
-- ============================================
CREATE TABLE wallets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(20) NOT NULL,
    balance DECIMAL(15,2) DEFAULT 0,
    bonus_balance DECIMAL(15,2) DEFAULT 0,
    referral_earnings DECIMAL(15,2) DEFAULT 0,
    total_deposits DECIMAL(15,2) DEFAULT 0,
    total_withdrawals DECIMAL(15,2) DEFAULT 0,
    total_bets DECIMAL(15,2) DEFAULT 0,
    total_wins DECIMAL(15,2) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_user_id (user_id)
);

-- ============================================
-- DEPOSITS TABLE
-- ============================================
CREATE TABLE deposits (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(20) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    utr_number VARCHAR(100) NOT NULL,
    upi_id VARCHAR(100) NOT NULL,
    status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_utr (utr_number)
);

-- ============================================
-- WITHDRAWALS TABLE
-- ============================================
CREATE TABLE withdrawals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(20) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    upi_id VARCHAR(100) NOT NULL,
    account_holder VARCHAR(100) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
);

-- ============================================
-- BETS TABLE
-- ============================================
CREATE TABLE bets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(20) NOT NULL,
    round_id VARCHAR(50) NOT NULL,
    bet_type VARCHAR(20) NOT NULL,
    bet_value VARCHAR(10) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    multiplier INT DEFAULT 1,
    result VARCHAR(10),
    win_amount DECIMAL(15,2) DEFAULT 0,
    status ENUM('pending', 'won', 'lost') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_user_id (user_id),
    INDEX idx_round_id (round_id),
    INDEX idx_status (status)
);

-- ============================================
-- BET HISTORY (for game rounds)
-- ============================================
CREATE TABLE bet_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    round_id VARCHAR(50) UNIQUE NOT NULL,
    number INT NOT NULL,
    color VARCHAR(20) NOT NULL,
    big_small VARCHAR(10) NOT NULL,
    total_bets INT DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_round_id (round_id)
);

-- ============================================
-- REFERRALS TABLE
-- ============================================
CREATE TABLE referrals (
    id INT PRIMARY KEY AUTO_INCREMENT,
    referrer_id VARCHAR(20) NOT NULL,
    referred_id VARCHAR(20) NOT NULL,
    commission DECIMAL(15,2) DEFAULT 0,
    status ENUM('pending', 'completed') DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referrer_id) REFERENCES users(user_id),
    FOREIGN KEY (referred_id) REFERENCES users(user_id),
    INDEX idx_referrer_id (referrer_id),
    INDEX idx_referred_id (referred_id)
);

-- ============================================
-- TRANSACTIONS TABLE
-- ============================================
CREATE TABLE transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(20) NOT NULL,
    type ENUM('deposit', 'withdrawal', 'bet', 'win', 'referral', 'bonus') NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    balance_before DECIMAL(15,2) NOT NULL,
    balance_after DECIMAL(15,2) NOT NULL,
    description TEXT,
    reference_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_user_id (user_id),
    INDEX idx_type (type)
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_user_id (user_id),
    INDEX idx_is_read (is_read)
);

-- ============================================
-- UPI SETTINGS TABLE
-- ============================================
CREATE TABLE upi_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    upi_id VARCHAR(100) NOT NULL,
    upi_name VARCHAR(100),
    qr_code VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active (is_active),
    INDEX idx_default (is_default)
);

-- ============================================
-- ADMIN SETTINGS TABLE
-- ============================================
CREATE TABLE admin_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(50) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- PROMOTIONS TABLE
-- ============================================
CREATE TABLE promotions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'bonus',
    bonus_amount DECIMAL(15,2) DEFAULT 0,
    min_deposit DECIMAL(15,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SUPPORT TICKETS TABLE
-- ============================================
CREATE TABLE support_tickets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(20) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
);

-- ============================================
-- GAME SETTINGS TABLE
-- ============================================
CREATE TABLE game_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(50) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- INITIAL DATA
-- ============================================

-- Insert default admin user (password: Admin@123)
INSERT INTO users (user_id, referral_code, mobile, password, name, is_admin) 
VALUES ('10000001', 'ADMIN001', '9999999999', '$2b$10$YourHashedPasswordHere', 'Admin', TRUE);

-- Insert default UPI settings
INSERT INTO upi_settings (upi_id, upi_name, is_active, is_default) 
VALUES ('k9bets@upi', 'K9BETS UPI', TRUE, TRUE);

-- Insert default admin settings
INSERT INTO admin_settings (setting_key, setting_value, description) VALUES
('signup_bonus', '50', 'Signup bonus amount'),
('referral_commission', '10', 'Referral commission percentage'),
('referral_reward', '25', 'Referral reward amount'),
('min_deposit', '100', 'Minimum deposit amount'),
('min_withdrawal', '50', 'Minimum withdrawal amount'),
('max_withdrawal', '50000', 'Maximum withdrawal amount');

-- Insert default game settings
INSERT INTO game_settings (setting_key, setting_value, description) VALUES
('game_timer_30', '30', '30 second game timer'),
('game_timer_60', '60', '60 second game timer'),
('game_timer_180', '180', '180 second game timer'),
('game_timer_300', '300', '300 second game timer'),
('min_bet', '1', 'Minimum bet amount'),
('max_bet', '10000', 'Maximum bet amount');
