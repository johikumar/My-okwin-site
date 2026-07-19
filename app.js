// ========================================
// K9BETS - Complete Application Logic
// ========================================

const DB_KEY = 'k9bets_db';
const ADMIN_ID = '9676138055';
const ADMIN_PASS = '9676138055';

// State
let users = [];
let currentUser = null;
let historyData = [];
let userStats = { totalBets: 0, totalWins: 0, totalLosses: 0 };
let activities = [];
let currentPage = 1;
const itemsPerPage = 10;
let isProcessing = false;
let countdownSeconds = 71;
let timerInterval = null;
let selectedColor = 'green';
let selectedMultiplier = 1;
let selectedBigSmall = 'Big';
let upiId = 'k9bets@upi';

// DOM References
const $ = (id) => document.getElementById(id);
const authContainer = $('authContainer');
const gameUI = $('gameUI');
const authTitle = $('authTitle');
const authUserId = $('authUserId');
const authPassword = $('authPassword');
const authSubmitBtn = $('authSubmitBtn');
const authSwitchText = $('authSwitchText');
const authError = $('authError');
const referralInfo = $('referralInfo');
const referralCode = $('referralCode');
const userDisplay = $('userDisplay');
const balanceDisplay = $('balanceDisplay');
const historyBody = $('historyBody');
const timerDisplay = $('timerDisplay');
const periodDisplay = $('periodDisplay');
const depositModal = $('depositModal');
const withdrawModal = $('withdrawModal');
const depositAmount = $('depositAmount');
const withdrawAmount = $('withdrawAmount');
const adminPanel = $('adminPanel');
const toggleAdminBtn = $('toggleAdminBtn');
const logoutBtn = $('logoutBtn');
const betAmount = $('betAmount');
const placeBetBtn = $('placeBetBtn');
const totalBets = $('totalBets');
const totalWins = $('totalWins');
const totalLosses = $('totalLosses');
const winRate = $('winRate');
const currentPageEl = $('currentPage');
const totalPagesEl = $('totalPages');
const prevPageBtn = $('prevPage');
const nextPageBtn = $('nextPage');
const withdrawBalance = $('withdrawBalance');
const activityList = $('activityList');
const activityCount = $('activityCount');
const upiDisplay = $('upiDisplay');
const adminUPI = $('adminUPI');

// ========================================
// DATABASE FUNCTIONS
// ========================================

function initDB() {
    const stored = localStorage.getItem(DB_KEY);
    if (stored) {
        try {
            const data = JSON.parse(stored);
            users = data.users || [];
            historyData = data.history || [];
            userStats = data.userStats || { totalBets: 0, totalWins: 0, totalLosses: 0 };
            activities = data.activities || [];
            upiId = data.upiId || 'k9bets@upi';
            return;
        } catch(e) {}
    }
    // Default data
    users = [
        { id: '9676138055', password: '9676138055', balance: 1000, referralCode: 'K9VIP', referredBy: null, referralBonus: 0, joinDate: new Date().toISOString() }
    ];
    historyData = [
        { period: '20260719100052332', number: 5, bigSmall: 'Big', color: 'green' },
        { period: '20260719100052331', number: 9, bigSmall: 'Big', color: 'green' },
        { period: '20260719100052330', number: 9, bigSmall: 'Big', color: 'green' },
        { period: '20260719100052329', number: 9, bigSmall: 'Big', color: 'green' },
        { period: '20260719100052328', number: 1, bigSmall: 'Small', color: 'violet' },
        { period: '20260719100052327', number: 3, bigSmall: 'Small', color: 'violet' },
        { period: '20260719100052326', number: 7, bigSmall: 'Big', color: 'green' },
        { period: '20260719100052325', number: 8, bigSmall: 'Big', color: 'green' },
        { period: '20260719100052324', number: 0, bigSmall: 'Small', color: 'violet' },
        { period: '20260719100052323', number: 7, bigSmall: 'Big', color: 'green' }
    ];
    userStats = { totalBets: 0, totalWins: 0, totalLosses: 0 };
    activities = [];
    upiId = 'k9bets@upi';
    saveDB();
}

function saveDB() {
    localStorage.setItem(DB_KEY, JSON.stringify({ 
        users, 
        history: historyData, 
        userStats, 
        activities,
        upiId 
    }));
}

function findUser(id) {
    return users.find(u => u.id === id);
}

// ========================================
// UI HELPERS
// ========================================

function showToast(msg, duration = 3000) {
    const toast = $('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

function showLoading(show) {
    const overlay = $('loadingOverlay');
    overlay.classList.toggle('show', show);
}

function showAuthError(msg) {
    authError.textContent = msg;
    authError.classList.add('show');
    setTimeout(() => authError.classList.remove('show'), 5000);
}

function renderHistory(page = 1) {
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = historyData.slice(start, end);
    const totalPages = Math.ceil(historyData.length / itemsPerPage) || 1;

    let html = '';
    if (pageData.length === 0) {
        html = '<tr><td colspan="4" style="text-align:center;color:#6a78a2;padding:20px 0;">No history yet</td></tr>';
    } else {
        pageData.forEach(row => {
            const colorMap = { 'green': '#16a34a', 'violet': '#8b5cf6', 'red': '#dc2626' };
            const colorHex = colorMap[row.color] || '#666';
            const numberClass = row.number >= 5 ? 'big-number' : 'small-number';
            html += `<tr>
                <td style="font-size:0.7rem;color:#8490b8;">${row.period}</td>
                <td style="font-weight:700;font-size:1.1rem;" class="${numberClass}">${row.number}</td>
                <td><span class="badge ${row.bigSmall.toLowerCase()}">${row.bigSmall}</span></td>
                <td><span class="color-dot" style="background:${colorHex};"></span>${row.color}</td>
            </tr>`;
        });
    }
    historyBody.innerHTML = html;
    currentPageEl.textContent = page;
    totalPagesEl.textContent = totalPages;
    currentPage = page;
    prevPageBtn.style.opacity = page <= 1 ? '0.3' : '1';
    prevPageBtn.style.cursor = page <= 1 ? 'not-allowed' : 'pointer';
    nextPageBtn.style.opacity = page >= totalPages ? '0.3' : '1';
    nextPageBtn.style.cursor = page >= totalPages ? 'not-allowed' : 'pointer';
}

function updateStats() {
    totalBets.textContent = userStats.totalBets || 0;
    totalWins.textContent = userStats.totalWins || 0;
    totalLosses.textContent = userStats.totalLosses || 0;
    const rate = userStats.totalBets > 0 ? Math.round((userStats.totalWins / userStats.totalBets) * 100) : 0;
    winRate.textContent = rate + '%';
}

function updateBalanceUI() {
    if (currentUser) {
        balanceDisplay.textContent = currentUser.balance.toFixed(2);
        userDisplay.textContent = currentUser.id;
        if (withdrawBalance) {
            withdrawBalance.textContent = currentUser.balance.toFixed(2);
        }
    }
    if (upiDisplay) {
        upiDisplay.textContent = upiId;
    }
         }
function addActivity(message, type = 'info') {
    const icons = { 
        'win': '🎉', 
        'loss': '😞', 
        'deposit': '💰', 
        'withdraw': '💳', 
        'bet': '🎯', 
        'referral': '🤝', 
        'admin': '👑' 
    };
    const icon = icons[type] || '📌';
    const timestamp = new Date().toLocaleTimeString();
    activities.unshift(`${icon} ${message} (${timestamp})`);
    if (activities.length > 50) activities.pop();
    renderActivities();
    saveDB();
}

function renderActivities() {
    if (activities.length === 0) {
        activityList.innerHTML = '<div class="activity-item" style="text-align:center;color:#6a78a2;padding:10px 0;">No recent activity</div>';
        activityCount.textContent = '0';
        return;
    }
    let html = '';
    activities.slice(0, 10).forEach(item => {
        html += `<div class="activity-item">${item}</div>`;
    });
    activityList.innerHTML = html;
    activityCount.textContent = activities.length;
}

// ========================================
// GAME FUNCTIONS
// ========================================

function placeBet() {
    if (!currentUser) {
        showToast('Please login first');
        return;
    }
    if (isProcessing) {
        showToast('Processing... Please wait');
        return;
    }
    const amount = parseFloat(betAmount.value);
    if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid bet amount');
        return;
    }
    if (amount > currentUser.balance) {
        showToast('Insufficient balance!');
        return;
    }
    if (amount < 0.50) {
        showToast('Minimum bet is ₹0.50');
        return;
    }

    isProcessing = true;
    placeBetBtn.disabled = true;
    showLoading(true);

    setTimeout(() => {
        const number = Math.floor(Math.random() * 10);
        let bigSmall = number >= 5 ? 'Big' : 'Small';
        let color = '';
        if (number >= 7) color = 'green';
        else if (number >= 4) color = 'violet';
        else color = 'red';
        if (number === 0) { color = 'violet'; bigSmall = 'Small'; }
        
        const period = '20260719' + String(1000000000 + Math.floor(Math.random() * 900000000));
        historyData.unshift({ period, number, bigSmall, color });
        if (historyData.length > 50) historyData.pop();
        saveDB();
        renderHistory(currentPage);

        const userColor = selectedColor;
        const userBigSmall = selectedBigSmall;
        const win = (userColor === color && userBigSmall === bigSmall);

        userStats.totalBets = (userStats.totalBets || 0) + 1;
        
        if (win) {
            const winAmount = amount * selectedMultiplier;
            currentUser.balance += winAmount;
            userStats.totalWins = (userStats.totalWins || 0) + 1;
            addActivity(`Won ₹${winAmount.toFixed(2)} on ${color.toUpperCase()} ${bigSmall} (×${selectedMultiplier})`, 'win');
            showToast(`🎉 You won! +₹${winAmount.toFixed(2)}`);
            document.querySelector('.color-option.' + color)?.classList.add('win-animation');
            setTimeout(() => {
                document.querySelector('.color-option.' + color)?.classList.remove('win-animation');
            }, 1000);
        } else {
            currentUser.balance -= amount;
            userStats.totalLosses = (userStats.totalLosses || 0) + 1;
            addActivity(`Lost ₹${amount.toFixed(2)} on ${color.toUpperCase()} ${bigSmall}`, 'loss');
            showToast(`😞 You lost. -₹${amount.toFixed(2)}`);
            document.querySelector('.color-option.' + color)?.classList.add('lose-animation');
            setTimeout(() => {
                document.querySelector('.color-option.' + color)?.classList.remove('lose-animation');
            }, 1000);
        }
        
        saveDB();
        updateBalanceUI();
        updateStats();
        
        isProcessing = false;
        placeBetBtn.disabled = false;
        showLoading(false);
    }, 1500);
}

function simulateRound() {
    if (!currentUser) return;
    const number = Math.floor(Math.random() * 10);
    let bigSmall = number >= 5 ? 'Big' : 'Small';
    let color = '';
    if (number >= 7) color = 'green';
    else if (number >= 4) color = 'violet';
    else color = 'red';
    if (number === 0) { color = 'violet'; bigSmall = 'Small'; }
    const period = '20260719' + String(1000000000 + Math.floor(Math.random() * 900000000));
    historyData.unshift({ period, number, bigSmall, color });
    if (historyData.length > 50) historyData.pop();
    saveDB();
    renderHistory(currentPage);
    userStats.totalBets = (userStats.totalBets || 0) + 1;
    if (number >= 7) {
        userStats.totalWins = (userStats.totalWins || 0) + 1;
    } else {
        userStats.totalLosses = (userStats.totalLosses || 0) + 1;
    }
    updateStats();
    saveDB();
}

// ========================================
// AUTH FUNCTIONS
// ========================================

function handleAuth() {
    const id = authUserId.value.trim();
    const pass = authPassword.value.trim();
    const ref = referralCode.value.trim();

    if (!id || !pass) {
        showAuthError('Please enter ID and Password');
        return;
    }
    if (id.length < 4) {
        showAuthError('User ID must be at least 4 characters');
        return;
    }

    if (isLogin) {
        const user = findUser(id);
        if (!user) {
            showAuthError('User not found! Please register.');
            return;
        }
        if (user.password !== pass) {
            showAuthError('Incorrect password!');
            return;
        }
        currentUser = user;
        showToast('Welcome back, ' + user.id + '!');
        enterGame();
    } else {
        if (findUser(id)) {
            showAuthError('User ID already exists!');
            return;
        }
        let referredBy = null;
        if (ref) {
            const refUser = findUser(ref);
            if (refUser) {
                referredBy = ref;
                showToast('Valid referral code! You get ₹50 bonus!');
            } else {
                showToast('Referral code invalid, continuing without bonus');
            }
        }
        const newUser = {
            id: id,
            password: pass,
            balance: referredBy ? 50 : 0,
            referralCode: id.substring(0, 6).toUpperCase() + Math.floor(Math.random() * 1000),
            referredBy: referredBy,
            referralBonus: referredBy ? 50 : 0,
            joinDate: new Date().toISOString()
        };
        users.push(newUser);
        if (referredBy) {
            const referrer = findUser(referredBy);
            if (referrer) {
                referrer.balance += 25;
                addActivity(`Referral bonus from ${id}: +₹25`, 'referral');
                showToast('🎉 Referral bonus! You got ₹50, referrer got ₹25');
            }
        }
        saveDB();
        currentUser = newUser;
        showToast('Account created! Welcome ' + id + (referredBy ? ' with ₹50 bonus!' : ''));
        enterGame();
    }
}

let isLogin = true;

function enterGame() {
    authContainer.classList.remove('active');
    gameUI.classList.add('visible');
    updateBalanceUI();
    renderHistory(1);
    updateStats();
    renderActivities();
    if (currentUser.id === ADMIN_ID) {
        toggleAdminBtn.style.display = 'block';
        document.querySelector('.brand-header h1').textContent = '👑 K9BETS ADMIN';
    } else {
        toggleAdminBtn.style.display = 'none';
        adminPanel.classList.remove('visible');
        document.querySelector('.brand-header h1').textContent = 'K9BETS';
    }
    sessionStorage.setItem('k9bets_session', currentUser.id);
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        currentUser = null;
        gameUI.classList.remove('visible');
        authContainer.classList.add('active');
        authTitle.textContent = 'Welcome Back';
        authSubmitBtn.textContent = 'Login';
        isLogin = true;
        authToggle.textContent = 'Register';
        authSwitchText.innerHTML = 'Don\'t have an account? <span id="authToggle">Register</span>';
        referralInfo.style.display = 'none';
        document.querySelector('#authSwitchText #authToggle')?.addEventListener('click', toggleAuthMode);
        showToast('Logged out successfully');
        document.querySelector('.brand-header h1').textContent = 'K9BETS';
        sessionStorage.removeItem('k9bets_session');
    }
}

function toggleAuthMode() {
    isLogin = !isLogin;
    if (isLogin) {
        authTitle.textContent = 'Welcome Back';
        authSubmitBtn.textContent = 'Login';
        authToggle.textContent = 'Register';
        authSwitchText.innerHTML = 'Don\'t have an account? <span id="authToggle">Register</span>';
        referralInfo.style.display = 'none';
    } else {
        authTitle.textContent = 'Create Account';
        authSubmitBtn.textContent = 'Register';
        authToggle.textContent = 'Login';
        authSwitchText.innerHTML = 'Already have an account? <span id="authToggle">Login</span>';
        referralInfo.style.display = 'block';
    }
    document.querySelector('#authSwitchText #authToggle')?.addEventListener('click', toggleAuthMode);
               }
// ========================================
// TIMER FUNCTIONS
// ========================================

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        countdownSeconds--;
        if (countdownSeconds <= 0) {
            countdownSeconds = 71;
            if (currentUser && gameUI.classList.contains('visible')) {
                simulateRound();
            }
        }
        const mins = Math.floor(countdownSeconds / 60);
        const secs = countdownSeconds % 60;
        timerDisplay.textContent = `0:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
        periodDisplay.textContent = '20260719' + String(1000000000 + Math.floor(Date.now() / 1000));
    }, 1000);
}

// ========================================
// EVENT LISTENERS
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    // Initialize
    initDB();
    renderHistory(1);
    updateStats();
    renderActivities();
    updateBalanceUI();
    document.querySelector('.color-option.green')?.classList.add('selected');
    startTimer();

    // Auth
    authSubmitBtn.addEventListener('click', handleAuth);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && authContainer.classList.contains('active')) {
            handleAuth();
        }
        if (e.key === ' ' && gameUI.classList.contains('visible') && !isProcessing) {
            e.preventDefault();
            placeBet();
        }
        if (e.key === 'Escape') {
            depositModal.style.display = 'none';
            withdrawModal.style.display = 'none';
            adminPanel.classList.remove('visible');
        }
        if (e.key === 'A' && e.ctrlKey && e.shiftKey) {
            e.preventDefault();
            if (currentUser && currentUser.id === ADMIN_ID) {
                adminPanel.classList.toggle('visible');
            }
        }
    });

    // Logout
    logoutBtn.addEventListener('click', logout);

    // Color pick
    document.querySelectorAll('.color-option').forEach(el => {
        el.addEventListener('click', function() {
            document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            selectedColor = this.dataset.color;
            selectedBigSmall = this.dataset.bigsmall;
            document.querySelectorAll('.big-small-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.big-small-btn').forEach(b => {
                if (b.dataset.bigsmall === selectedBigSmall) b.classList.add('active');
            });
        });
    });

    // Big/Small
    document.querySelectorAll('.big-small-btn').forEach(el => {
        el.addEventListener('click', function() {
            document.querySelectorAll('.big-small-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            selectedBigSmall = this.dataset.bigsmall;
            document.querySelectorAll('.color-option').forEach(c => {
                c.classList.remove('selected');
                if (c.dataset.bigsmall === selectedBigSmall) c.classList.add('selected');
            });
            const activeColor = document.querySelector('.color-option.selected');
            if (activeColor) selectedColor = activeColor.dataset.color;
        });
    });

    // Multipliers
    document.querySelectorAll('.multiplier').forEach(el => {
        el.addEventListener('click', function() {
            document.querySelectorAll('.multiplier').forEach(m => m.classList.remove('active'));
            this.classList.add('active');
            selectedMultiplier = parseInt(this.dataset.mult, 10);
        });
    });

    // Quick bet amounts
    document.querySelectorAll('.quick-bet').forEach(el => {
        el.addEventListener('click', function() {
            document.querySelectorAll('.quick-bet').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            betAmount.value = this.dataset.amount;
        });
    });

    // Place bet
    placeBetBtn.addEventListener('click', placeBet);

    // Quick amounts in modals
    document.querySelectorAll('.quick-amount').forEach(el => {
        el.addEventListener('click', function() {
            const parent = this.closest('.modal-body');
            const input = parent.querySelector('input[type="number"]');
            if (input) {
                input.value = this.dataset.amount;
                input.dispatchEvent(new Event('input'));
            }
        });
    });

    // Deposit
    document.getElementById('depositBtn').addEventListener('click', () => {
        if (!currentUser) { showToast('Please login first'); return; }
        depositModal.style.display = 'flex';
        if (upiDisplay) upiDisplay.textContent = upiId;
    });
    document.getElementById('closeDeposit').addEventListener('click', () => { depositModal.style.display = 'none'; });
    document.getElementById('confirmDeposit').addEventListener('click', () => {
        const val = parseFloat(depositAmount.value);
        if (!isNaN(val) && val > 0) {
            if (val > 100000) { showToast('Maximum deposit is ₹100,000'); return; }
            currentUser.balance += val;
            saveDB();
            updateBalanceUI();
            depositAmount.value = '';
            depositModal.style.display = 'none';
            addActivity(`Deposited ₹${val.toFixed(2)}`, 'deposit');
            showToast(`💰 Deposited ₹${val.toFixed(2)}`);
        } else {
            showToast('Enter valid amount');
        }
    });

    // Withdraw
    document.getElementById('withdrawBtn').addEventListener('click', () => {
        if (!currentUser) { showToast('Please login first'); return; }
        withdrawBalance.textContent = currentUser.balance.toFixed(2);
        withdrawModal.style.display = 'flex';
    });
    document.getElementById('closeWithdraw').addEventListener('click', () => { withdrawModal.style.display = 'none'; });
    document.getElementById('confirmWithdraw').addEventListener('click', () => {
        const val = parseFloat(withdrawAmount.value);
        if (!isNaN(val) && val > 0 && val <= currentUser.balance) {
            if (val < 10) { showToast('Minimum withdrawal is ₹10'); return; }
            currentUser.balance -= val;
            saveDB();
            updateBalanceUI();
            withdrawAmount.value = '';
            withdrawModal.style.display = 'none';
            addActivity(`Withdrew ₹${val.toFixed(2)}`, 'withdraw');
            showToast(`💳 Withdrew ₹${val.toFixed(2)}`);
        } else {
            showToast('Insufficient balance or invalid amount');
        }
    });

    // Admin panel
    toggleAdminBtn.addEventListener('click', () => {
        if (currentUser && currentUser.id === ADMIN_ID) {
            adminPanel.classList.toggle('visible');
            if (adminUPI) adminUPI.value = upiId;
        } else {
            showToast('Admin access only');
        }
    });
    document.getElementById('closeAdmin').addEventListener('click', () => {
        adminPanel.classList.remove('visible');
    });

    // Admin: Set Balance
    document.getElementById('setBalanceBtn').addEventListener('click', () => {
        if (!currentUser || currentUser.id !== ADMIN_ID) { showToast('Admin only'); return; }
        const val = parseFloat(document.getElementById('adminBalanceInput').value);
        if (!isNaN(val) && val >= 0) {
            currentUser.balance = val;
            saveDB();
            updateBalanceUI();
            document.getElementById('adminBalanceInput').value = '';
            addActivity(`Admin set balance to ₹${val.toFixed(2)}`, 'admin');
            showToast('✅ Balance updated');
        } else {
            showToast('Enter valid balance');
        }
    });

    // Admin: Set UPI
    document.getElementById('setUPIBtn').addEventListener('click', () => {
        if (!currentUser || currentUser.id !== ADMIN_ID) { showToast('Admin only'); return; }
        const upi = document.getElementById('adminUPI').value.trim();
        if (upi && upi.includes('@')) {
            upiId = upi;
            saveDB();
            if (upiDisplay) upiDisplay.textContent = upiId;
            addActivity(`Admin updated UPI to ${upiId}`, 'admin');
            showToast('✅ UPI updated successfully');
        } else {
            showToast('Please enter a valid UPI ID (contains @)');
        }
    });

    // Admin: Add History
    document.getElementById('addHistoryBtn').addEventListener('click', () => {
        if (!currentUser || currentUser.id !== ADMIN_ID) { showToast('Admin only'); return; }
        const period = document.getElementById('adminPeriod').value.trim();
        const number = parseInt(document.getElementById('adminNumber').value, 10);
        const bigSmall = document.getElementById('adminBigSmall').value;
        if (!period || isNaN(number) || number < 0 || number > 9) {
            showToast('Invalid period or number (0-9)');
            return;
        }
        let color = 'green';
        if (number >= 7) color = 'green';
        else if (number >= 4) color = 'violet';
        else color = 'red';
        if (number === 0) color = 'violet';
        historyData.unshift({ period, number, bigSmall, color });
        if (historyData.length > 50) historyData.pop();
        saveDB();
        renderHistory(currentPage);
        document.getElementById('adminPeriod').value = '';
        document.getElementById('adminNumber').value = '';
        addActivity(`Admin added history: ${number} - ${color}`, 'admin');
        showToast('✅ History added');
    });

    // Admin: Reset History
    document.getElementById('resetHistoryBtn').addEventListener('click', () => {
        if (!currentUser || currentUser.id !== ADMIN_ID) { showToast('Admin only'); return; }
        if (confirm('Reset all history?')) {
            historyData = [];
            saveDB();
            renderHistory(1);
            addActivity('Admin reset all history', 'admin');
            showToast('✅ History reset');
        }
    });

    // Admin: Simulate Round
    document.getElementById('simulateRoundBtn').addEventListener('click', () => {
        if (!currentUser || currentUser.id !== ADMIN_ID) { showToast('Admin only'); return; }
        simulateRound();
        showToast('🎲 Round simulated');
    });

    // Admin: Reset All Data
    document.getElementById('resetAllDataBtn').addEventListener('click', () => {
        if (!currentUser || currentUser.id !== ADMIN_ID) { showToast('Admin only'); return; }
        if (confirm('⚠️ Reset ALL data including users? This cannot be undone!')) {
            if (confirm('Are you absolutely sure?')) {
                localStorage.removeItem(DB_KEY);
                location.reload();
            }
        }
    });

    // Pagination
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) renderHistory(currentPage - 1);
    });
    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(historyData.length / itemsPerPage) || 1;
        if (currentPage < totalPages) renderHistory(currentPage + 1);
    });

    // Close modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target === depositModal) depositModal.style.display = 'none';
        if (e.target === withdrawModal) withdrawModal.style.display = 'none';
    });

    // Auth toggle
    document.querySelector('#authSwitchText #authToggle')?.addEventListener('click', toggleAuthMode);

    // Session restore
    const savedSession = sessionStorage.getItem('k9bets_session');
    if (savedSession) {
        const user = findUser(savedSession);
        if (user) {
            currentUser = user;
            enterGame();
            showToast('Welcome back, ' + user.id + '!');
        }
    }

    // Auto-save
    setInterval(() => {
        if (currentUser) saveDB();
    }, 30000);

    // Visibility change
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
        } else {
            if (!timerInterval) startTimer();
        }
    });

    // Before unload
    window.addEventListener('beforeunload', () => {
        saveDB();
        if (currentUser) {
            sessionStorage.setItem('k9bets_session', currentUser.id);
        }
    });

    // Error handling
    window.addEventListener('error', (e) => {
        console.error('Runtime error:', e.message);
        showToast('⚠️ An error occurred. Please try again.', 4000);
    });

    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled rejection:', e.reason);
        showToast('⚠️ Something went wrong. Please refresh.', 4000);
    });

    // Console info
    console.log('🚀 K9BETS PRODUCTION READY');
    console.log('👑 Admin: 9676138055 / 9676138055');
    console.log('💡 Press SPACE to place bet');
    console.log('⌨️ Ctrl+Shift+A for Admin Panel');
    console.log('📊 ' + users.length + ' users registered');
    console.log('🏦 UPI: ' + upiId);
});
