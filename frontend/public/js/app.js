// ============================================
// WINGO PLATFORM - MAIN APP JAVASCRIPT
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    
    // ===== DOM ELEMENTS =====
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const menuToggle = document.getElementById('menuToggle');
    const notificationPanel = document.getElementById('notificationPanel');
    const notificationBtn = document.getElementById('notificationBtn');
    const closeNotifications = document.getElementById('closeNotifications');
    const userAvatar = document.getElementById('userAvatar');
    const placeBetBtn = document.getElementById('placeBetBtn');
    const betAmount = document.getElementById('betAmount');
    const timerValue = document.getElementById('timerValue');
    const periodValue = document.getElementById('periodValue');
    const numberText = document.getElementById('numberText');
    const numberCircle = document.getElementById('numberCircle');
    const historyBody = document.getElementById('historyBody');
    
    // ===== SIDEBAR =====
    menuToggle.addEventListener('click', function() {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
    });
    
    sidebarOverlay.addEventListener('click', function() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
    });
    
    // ===== NOTIFICATIONS =====
    notificationBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        notificationPanel.classList.toggle('open');
    });
    
    closeNotifications.addEventListener('click', function() {
        notificationPanel.classList.remove('open');
    });
    
    document.addEventListener('click', function(e) {
        if (!notificationPanel.contains(e.target) && e.target !== notificationBtn) {
            notificationPanel.classList.remove('open');
        }
    });
    
    // ===== GAME TABS =====
    const gameTabs = document.querySelectorAll('.game-tab');
    gameTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            gameTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            // Update timer based on selected tab
            const timer = this.dataset.timer;
            startTimer(timer);
        });
    });
    
    // ===== HISTORY TABS =====
    const historyTabs = document.querySelectorAll('.history-tab');
    const historyContent = document.getElementById('historyContent');
    const chartContent = document.getElementById('chartContent');
    const strategyContent = document.getElementById('strategyContent');
    
    historyTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            historyTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            const tabName = this.dataset.tab;
            historyContent.style.display = tabName === 'history' ? 'block' : 'none';
            chartContent.style.display = tabName === 'chart' ? 'block' : 'none';
            strategyContent.style.display = tabName === 'strategy' ? 'block' : 'none';
            
            if (tabName === 'chart') {
                initChart();
            }
        });
    });
    
    // ===== BET TYPE SELECTION =====
    const betTypeBtns = document.querySelectorAll('.bet-type-btn');
    betTypeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            betTypeBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // ===== NUMBER SELECTION =====
    const numBtns = document.querySelectorAll('.num-btn');
    numBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            numBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            numberText.textContent = this.dataset.number;
            updateNumberColor(this.dataset.number);
        });
    });
    
    // ===== MULTIPLIER SELECTION =====
    const multiplierBtns = document.querySelectorAll('.multiplier-btn');
    multiplierBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            multiplierBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // ===== BIG/SMALL SELECTION =====
    const bigSmallBtns = document.querySelectorAll('.big-small-btn');
    bigSmallBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            bigSmallBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // ===== BET AMOUNT PRESETS =====
    const betPresets = [1, 5, 10, 25, 50, 100];
    // Add preset buttons dynamically
    const betAmountGroup = document.querySelector('.bet-amount-group');
    const presetContainer = document.createElement('div');
    presetContainer.className = 'bet-presets';
    presetContainer.style.cssText = `
        display: flex;
        gap: 4px;
        margin-top: 6px;
        flex-wrap: wrap;
    `;
    
    betPresets.forEach(val => {
        const btn = document.createElement('button');
        btn.textContent = `₹${val}`;
        btn.className = 'bet-preset-btn';
        btn.style.cssText = `
            padding: 4px 10px;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            transition: all 0.3s ease;
        `;
        btn.addEventListener('mouseenter', function() {
            this.style.background = 'var(--bg-card-hover)';
            this.style.color = 'var(--text-primary)';
        });
        btn.addEventListener('mouseleave', function() {
            this.style.background = 'var(--bg-card)';
            this.style.color = 'var(--text-secondary)';
        });
        btn.addEventListener('click', function() {
            betAmount.value = val;
        });
        presetContainer.appendChild(btn);
    });
    
    betAmountGroup.parentNode.insertBefore(presetContainer, betAmountGroup.nextSibling);
    
    // ===== PLACE BET =====
    placeBetBtn.addEventListener('click', function() {
        const amount = parseFloat(betAmount.value) || 0;
        if (amount <= 0) {
            showToast('Please enter a valid bet amount', 'error');
            return;
        }
        
        // Get selected bet type
        const activeBetType = document.querySelector('.bet-type-btn.active');
        const betType = activeBetType ? activeBetType.dataset.type : 'green';
        
        // Get selected number if any
        const activeNum = document.querySelector('.num-btn.active');
        const number = activeNum ? activeNum.dataset.number : null;
        
        // Get selected multiplier
        const activeMultiplier = document.querySelector('.multiplier-btn.active');
        const multiplier = activeMultiplier ? parseInt(activeMultiplier.dataset.multiplier) : 1;
        
        // Get big/small
        const activeBigSmall = document.querySelector('.big-small-btn.active');
        const bigSmall = activeBigSmall ? activeBigSmall.textContent.toLowerCase() : null;
        
        const betData = {
            amount,
            betType,
            number,
            multiplier,
            bigSmall
        };
        
        console.log('Placing bet:', betData);
        showToast(`Bet placed: ₹${amount} on ${betType}`, 'success');
        
        // Simulate bet result
        setTimeout(() => {
            const result = Math.floor(Math.random() * 10);
            const colors = ['green', 'violet', 'red'];
            const color = colors[Math.floor(Math.random() * 3)];
            const isBig = result >= 5;
            
            // Update display
            numberText.textContent = result;
            updateNumberColor(result);
            
            // Show result notification
            const win = Math.random() > 0.4;
            if (win) {
                showToast(`🎉 You won ₹${amount * 2.5}!`, 'win');
            } else {
                showToast(`😅 You lost ₹${amount}`, 'loss');
            }
            
            // Update history
            addHistoryRow(`20260719${Date.now().toString().slice(-11)}`, result, isBig ? 'Big' : 'Small', color);
            
        }, 1500);
    });
    
    // ===== TIMER =====
    let timerInterval = null;
    let currentTime = 71; // 1:11 in seconds
    
    function startTimer(seconds) {
        if (timerInterval) {
            clearInterval(timerInterval);
        }
        currentTime = parseInt(seconds) || 71;
        updateTimerDisplay();
        
        timerInterval = setInterval(() => {
            currentTime--;
            if (currentTime <= 0) {
                clearInterval(timerInterval);
                timerValue.textContent = '0:00:00';
                // Generate new random number
                const result = Math.floor(Math.random() * 10);
                numberText.textContent = result;
                updateNumberColor(result);
                // Reset timer
                currentTime = 71;
                updateTimerDisplay();
                // Start new timer
                timerInterval = setInterval(() => {
                    currentTime--;
                    if (currentTime <= 0) {
                        clearInterval(timerInterval);
                        timerValue.textContent = '0:00:00';
                        const newResult = Math.floor(Math.random() * 10);
                        numberText.textContent = newResult;
                        updateNumberColor(newResult);
                        currentTime = 71;
                        updateTimerDisplay();
                    } else {
                        updateTimerDisplay();
                    }
                }, 1000);
            } else {
                updateTimerDisplay();
            }
        }, 1000);
    }
    
    function updateTimerDisplay() {
        const mins = Math.floor(currentTime / 60);
        const secs = currentTime % 60;
        timerValue.textContent = `0:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    
    // ===== UPDATE NUMBER COLOR =====
    function updateNumberColor(number) {
        const num = parseInt(number);
        numberCircle.className = 'number-circle';
        if (num >= 0 && num <= 3) {
            numberCircle.classList.add('red');
        } else if (num >= 4 && num <= 6) {
            numberCircle.classList.add('violet');
        } else if (num >= 7 && num <= 9) {
            numberCircle.classList.add('green');
        }
    }
    
    // ===== ADD HISTORY ROW =====
    function addHistoryRow(period, number, bigSmall, color) {
        const row = document.createElement('tr');
        const colors = {
            'green': '#00E676',
            'violet': '#9C27B0',
            'red': '#FF1744'
        };
        
        row.innerHTML = `
            <td>${period}</td>
            <td class="number-cell">${number}</td>
            <td>${bigSmall}</td>
            <td>
                <span class="color-dot-cell ${color}" style="background: ${colors[color] || '#888'}"></span>
            </td>
        `;
        
        // Add at the beginning
        historyBody.insertBefore(row, historyBody.firstChild);
        
        // Limit rows
        while (historyBody.children.length > 50) {
            historyBody.removeChild(historyBody.lastChild);
        }
    }
    
    // ===== INITIALIZE HISTORY =====
    function initHistory() {
        const sampleData = [
            { period: '20260719100052332', number: 5, bigSmall: 'Big', color: 'green' },
            { period: '20260719100052331', number: 9, bigSmall: 'Big', color: 'green' },
            { period: '20260719100052330', number: 9, bigSmall: 'Big', color: 'green' },
            { period: '20260719100052329', number: 9, bigSmall: 'Big', color: 'green' },
            { period: '20260719100052328', number: 1, bigSmall: 'Small', color: 'red' },
            { period: '20260719100052327', number: 3, bigSmall: 'Small', color: 'red' },
            { period: '20260719100052326', number: 7, bigSmall: 'Big', color: 'green' },
            { period: '20260719100052325', number: 8, bigSmall: 'Big', color: 'green' },
            { period: '20260719100052324', number: 0, bigSmall: 'Small', color: 'red' },
            { period: '20260719100052323', number: 7, bigSmall: 'Big', color: 'green' },
        ];
        
        sampleData.forEach(data => {
            addHistoryRow(data.period, data.number, data.bigSmall, data.color);
        });
    }
    
    // ===== CHART =====
    let chartInstance = null;
    
    function initChart() {
        const canvas = document.getElementById('gameChart');
        if (!canvas) return;
        
        // Simple chart using canvas
        const ctx = canvas.getContext('2d');
        const width = canvas.parentElement.clientWidth - 32;
        const height = 180;
        canvas.width = width;
        canvas.height = height;
        
        // Sample data
        const data = [5, 9, 9, 9, 1, 3, 7, 8, 0, 7, 2, 6, 4, 8, 3];
        const padding = 20;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        
        ctx.clearRect(0, 0, width, height);
        
        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }
        
        // Line
        ctx.beginPath();
        ctx.strokeStyle = '#6C3CE1';
        ctx.lineWidth = 2;
        
        // Fill area
        ctx.moveTo(padding, height - padding);
        
        data.forEach((value, index) => {
            const x = padding + (chartWidth / (data.length - 1)) * index;
            const y = padding + chartHeight - (value / 10) * chartHeight;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Points
        data.forEach((value, index) => {
            const x = padding + (chartWidth / (data.length - 1)) * index;
            const y = padding + chartHeight - (value / 10) * chartHeight;
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = value >= 7 ? '#00E676' : value >= 4 ? '#9C27B0' : '#FF1744';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    }
    
    // ===== TOAST NOTIFICATIONS =====
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            border-radius: 12px;
            color: white;
            font-weight: 600;
            font-size: 14px;
            z-index: 1000;
            animation: slideDown 0.3s ease;
            background: ${type === 'success' ? 'rgba(0, 230, 118, 0.15)' : 
                        type === 'win' ? 'rgba(255, 215, 0, 0.15)' :
                        type === 'loss' ? 'rgba(255, 23, 68, 0.15)' :
                        'rgba(108, 60, 225, 0.15)'};
            border: 1px solid ${type === 'success' ? 'var(--green)' : 
                             type === 'win' ? 'var(--gold)' :
                             type === 'loss' ? 'var(--red)' :
                             'var(--primary)'};
            backdrop-filter: blur(10px);
            max-width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
    
    // ===== BOTTOM NAVIGATION =====
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            navItems.forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            const page = this.dataset.page;
            showToast(`Navigating to ${page}`, 'info');
        });
    });
    
    // ===== KEYBOARD SHORTCUTS =====
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
            notificationPanel.classList.remove('open');
            document.body.style.overflow = '';
        }
        if (e.key === 'Enter' && e.target === betAmount) {
            placeBetBtn.click();
        }
    });
    
    // ===== INITIALIZE =====
    initHistory();
    startTimer(71);
    initChart();
    
    // Update period
    function updatePeriod() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        const secs = String(now.getSeconds()).padStart(2, '0');
        periodValue.textContent = `${year}${month}${day}${hours}${mins}${secs}000`;
    }
    updatePeriod();
    setInterval(updatePeriod, 1000);
    
    console.log('🚀 Wingo Platform initialized!');
});
