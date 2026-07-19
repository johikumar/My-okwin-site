// ============================================
// ADMIN ROUTES
// ============================================

const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const depositController = require('../controllers/depositController');
const withdrawalController = require('../controllers/withdrawalController');

// All admin routes require authentication and admin privileges
router.use(authMiddleware, adminMiddleware);

// Dashboard stats
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/dashboard/recent-activity', adminController.getRecentActivity);

// User management
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.put('/users/:userId/status', adminController.updateUserStatus);
router.put('/users/:userId/balance', adminController.updateUserBalance);
router.delete('/users/:userId', adminController.deleteUser);
router.post('/users/:userId/reset-password', adminController.resetUserPassword);

// Deposit management
router.get('/deposits', depositController.getAllDeposits);
router.put('/deposits/process', depositController.processDeposit);

// Withdrawal management
router.get('/withdrawals', withdrawalController.getAllWithdrawals);
router.put('/withdrawals/process', withdrawalController.processWithdrawal);

// UPI settings
router.get('/upi-settings', adminController.getUPISettings);
router.post('/upi-settings', adminController.addUPI);
router.put('/upi-settings/:id', adminController.updateUPI);
router.delete('/upi-settings/:id', adminController.deleteUPI);

// Game settings
router.get('/game-settings', adminController.getGameSettings);
router.put('/game-settings', adminController.updateGameSettings);

// Admin settings
router.get('/settings', adminController.getAdminSettings);
router.put('/settings', adminController.updateAdminSettings);

// Promotions
router.get('/promotions', adminController.getPromotions);
router.post('/promotions', adminController.createPromotion);
router.put('/promotions/:id', adminController.updatePromotion);
router.delete('/promotions/:id', adminController.deletePromotion);

// Notifications
router.post('/notifications', adminController.sendNotification);
router.get('/notifications', adminController.getAllNotifications);

// Support tickets
router.get('/tickets', adminController.getSupportTickets);
router.put('/tickets/:id', adminController.updateTicketStatus);

// Announcements
router.post('/announcements', adminController.createAnnouncement);
router.get('/announcements', adminController.getAnnouncements);

module.exports = router;
