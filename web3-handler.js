let provider, signer, contract;

// --- CONFIGURATION ---
const CONTRACT_ADDRESS = "0xc7a3d01dc8e8716aC0519C163D0fD1Db9faA82Bb"; 
const USDT_TOKEN_ADDRESS = "0x3b66b1e08f55af26c8ea14a73da64b6bc8d799de"; // BSC USDT
const TESTNET_CHAIN_ID = 97; 

// --- RANK CONFIG (Star1 to Master King) ---
const RANK_DETAILS = [
    { name: "NONE", roi: "0%", targetTeam: 0, targetVolume: 0 },
    { name: "Star1", roi: "1.00%", targetTeam: 1, targetVolume: 5 },
    { name: "Star2", roi: "2.00%", targetTeam: 2, targetVolume: 10 },
    { name: "Star3", roi: "3.00%", targetTeam: 3, targetVolume: 25 },
    { name: "Star4", roi: "4.00%", targetTeam: 4, targetVolume: 50},
    { name: "Star5", roi: "5.00%", targetTeam: 5, targetVolume: 100 },
    { name: "Kings Star", roi: "7.00%", targetTeam: 6, targetVolume: 500},
    { name: "Master King", roi: "7.50%", targetTeam: 7, targetVolume: 1000 }
];

// --- ABI (Full Updated for USDT Contract) ---
const CONTRACT_ABI = [
    "function register(string username, string referrerUsername) external",
    "function deposit(uint256 amount) external", 
    "function claimRewards() external",
    "function reinvestRewards() external",
    "function reinvestMatured() external",
    "function withdrawMaturedCapital() external",
    "function getRankName(uint8 rankId) public view returns (string)",
    "function getLevelTeamDetails(address _upline, uint256 _level) view returns (string[] names, address[] wallets, uint256[] joinDates, uint256[] activeDeps, uint256[] teamTotalDeps, uint256[] teamActiveDeps, uint256[] withdrawals)",
    "function getLiveBalance(address uA) view returns (uint256 pendingROI)",
    "function users(address) view returns (address referrer, string username, bool registered, uint256 joinDate, uint256 totalActiveDeposit, uint256 teamActiveDeposit, uint256 teamTotalDeposit, uint256 totalDeposited, uint256 totalWithdrawn, uint256 totalEarnings)",
    "function usersExtra(address) view returns (uint256 rewardsReferral, uint256 rewardsRank, uint256 reserveDailyROI,uint256 totalEarnedROI,uint256 totalEarnedLevel,uint256 totalEarnedRank,  uint32 teamCount, uint32 directsCount, uint32 directsQuali, uint8 rank)",
    "function getPosition(address uA, uint256 i) view returns (tuple(uint256 amount, uint256 startTime, uint256 lastCheckpoint, uint256 endTime, uint256 earned, uint256 expectedTotalEarn, bool active) v)",
    "function getUserTotalPositions(address uA) view returns (uint256)",
    "function getUserHistory(address _user) view returns (tuple(string txType, uint256 amount, uint256 timestamp, string detail)[])"
];

const ERC20_ABI = ["function approve(address spender, uint256 amount) public returns (bool)", "function allowance(address owner, address spender) public view returns (uint256)"];

// ROI calculation (0.9% fixed)
const calculateGlobalROI = () => 0.90;

// --- 1. AUTO-FILL LOGIC ---
function checkReferralURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const refName = urlParams.get('ref');
    const refField = document.getElementById('reg-referrer');
    if (refName && refField) {
        refField.value = refName.trim();
        console.log("Referral auto-filled:", refName);
    }
}

// --- INITIALIZATION ---
async function init() {
    checkReferralURL();
    
    const bscTestnetRPC = "https://data-seed-prebsc-1-s1.binance.org:8545/";
    const savedAddr = localStorage.getItem('userAddress');
    const isIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/';

    try {
        if (window.ethereum) {
           
            provider = new ethers.providers.Web3Provider(window.ethereum, "any");
            
            window.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
            contract = window.contract;

            // --- CONDITION START ---
            if (isIndexPage) {
                
                if (savedAddr) {
                    await setupReadOnly(bscTestnetRPC, savedAddr);
                }
            } else {
               
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    const address = accounts[0];
                    localStorage.setItem('userAddress', address);
                    signer = provider.getSigner();
                    window.signer = signer;
                    window.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
                    contract = window.contract;
                    await setupApp(address);
                } else if (savedAddr) {
                    await setupReadOnly(bscTestnetRPC, savedAddr);
                }
            }
            // --- CONDITION END ---

       
            window.ethereum.on('chainChanged', () => window.location.reload());
            window.ethereum.on('accountsChanged', (accs) => {
                if (accs.length === 0) localStorage.removeItem('userAddress');
                else localStorage.setItem('userAddress', accs[0]);
                window.location.reload();
            });

        } else {
           
            await setupReadOnly(bscTestnetRPC, savedAddr);
        }
    } catch (error) { 
        console.error("Init Error:", error);
        if (savedAddr) await setupReadOnly(bscTestnetRPC, savedAddr);
    }
}

async function setupReadOnly(rpcUrl, forcedAddress = null) {
    console.log("Mode: RPC/Memory Data Loading...");
    try {
        const tempProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
        
        provider = tempProvider; 
        window.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, tempProvider);
        contract = window.contract;
        
        const addressToUse = forcedAddress || localStorage.getItem('userAddress');
        
        if (addressToUse && addressToUse !== "undefined" && addressToUse !== null) {
            await setupApp(addressToUse);
        }
    } catch (e) {
        console.error("RPC Setup Failed:", e);
    }
}

// --- CORE LOGIC ---
window.handleDeposit = async function() {
    const amountInput = document.getElementById('deposit-amount');
    const depositBtn = document.getElementById('deposit-btn');
    
    if (!amountInput || !amountInput.value || amountInput.value < 10) {
        return alert("Min 10 USDT required!");
    }

    try {
       
        let activeSigner = window.signer || signer;
        let activeContract = window.contract || contract;

        
        if (!activeSigner || !window.ethereum) {
            if (!window.ethereum) return alert("Please use Trust Wallet or MetaMask browser!");
            
            const tempProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
            await tempProvider.send("eth_requestAccounts", []);
            activeSigner = tempProvider.getSigner();
            activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, activeSigner);
                        
            window.signer = activeSigner;
            window.contract = activeContract;
        }

        depositBtn.disabled = true;
        depositBtn.innerText = "APPROVING...";

        const amountInWei = ethers.utils.parseUnits(amountInput.value.toString(), 18);
        const userAddress = await activeSigner.getAddress();
        
        const usdt = new ethers.Contract(USDT_TOKEN_ADDRESS, ERC20_ABI, activeSigner);

        // 1. Approve Check
        const allowance = await usdt.allowance(userAddress, CONTRACT_ADDRESS);
        if (allowance.lt(amountInWei)) {
            const txApp = await usdt.approve(CONTRACT_ADDRESS, amountInWei);
            await txApp.wait();
        }

        // 2. Deposit
        depositBtn.innerText = "SIGNING...";
        const tx = await activeContract.deposit(amountInWei);
        
        depositBtn.innerText = "DEPOSITING...";
        await tx.wait();
        
        alert("Deposit Successful!");
        location.reload(); 

    } catch (err) {
        console.error("Deposit Error:", err);
        alert("Error: " + (err.reason || err.message || "Transaction Failed"));
        depositBtn.innerText = "DEPOSIT NOW";
        depositBtn.disabled = false;
    }
}

window.handleClaim = async function() {
    const claimBtn = event.target;
    const originalText = claimBtn.innerText;

    try {
        
        let activeSigner = window.signer || signer;
        let activeContract = window.contract || contract;

        
        if (!activeSigner || !window.ethereum) {
            if (!window.ethereum) return alert("Please use Trust Wallet or MetaMask browser!");
            
            const tempProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
            await tempProvider.send("eth_requestAccounts", []);
            activeSigner = tempProvider.getSigner();
            activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, activeSigner);
            
            window.signer = activeSigner;
            window.contract = activeContract;
        }

        // UI Updates
        claimBtn.disabled = true;
        claimBtn.innerText = "SIGNING...";

        // --- TRANSACTION ---
        const tx = await activeContract.claimRewards();
        
        claimBtn.innerText = "CLAIMING...";
        console.log("Claim tx sent:", tx.hash);
        
        await tx.wait();
        
        alert("Rewards Claimed Successfully!");
        location.reload(); 

    } catch (err) {
        console.error("Claim Error:", err);
        alert("Claim failed: " + (err.reason || err.message || "User rejected or error occurred"));
        
        // Reset Button on Error
        claimBtn.innerText = originalText;
        claimBtn.disabled = false;
    }
}
// 1. REINVEST REWARDS (Income Balance Reinvest)
window.handleReinvestRewards = async function() {
    const btn = event.target;
    const originalText = btn.innerText;
    try {
        let activeSigner = window.signer || signer;
        let activeContract = window.contract || contract;

        if (!activeSigner || !window.ethereum) {
            const tempProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
            await tempProvider.send("eth_requestAccounts", []);
            activeSigner = tempProvider.getSigner();
            activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, activeSigner);
            window.signer = activeSigner; window.contract = activeContract;
        }

        btn.disabled = true; btn.innerText = "SIGNING...";
        const tx = await activeContract.reinvestRewards();
        btn.innerText = "PROCESSING...";
        await tx.wait();
        alert("Rewards Reinvested Successfully!");
        location.reload();
    } catch (err) {
        console.error(err);
        alert("Failed: " + (err.reason || "Min $3 Required or Rejected"));
        btn.innerText = originalText; btn.disabled = false;
    }
}
window.handleCompoundDaily = async function() {
    // Button ko pehchano taaki animation dikha sakein
    const compoundBtn = event.target;
    const originalText = compoundBtn.innerText;

    try {
      
        let activeSigner = window.signer || signer;
        let activeContract = window.contract || contract;

        
        if (!activeSigner || !window.ethereum) {
            if (!window.ethereum) return alert("Please use Trust Wallet or MetaMask browser!");
            
            const tempProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
            await tempProvider.send("eth_requestAccounts", []);
            activeSigner = tempProvider.getSigner();
            activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, activeSigner);
            
           
            window.signer = activeSigner;
            window.contract = activeContract;
        }

       
        compoundBtn.disabled = true;
        compoundBtn.innerText = "WAITING...";

       
        console.log("Starting Reinvestment...");
        const tx = await activeContract.reinvestMatured();
        
        compoundBtn.innerText = "REINVESTING...";
        await tx.wait();
        
        alert("Reinvestment Successful!");
        location.reload(); 

    } catch (err) {
        console.error("Compound Error:", err);
       
        alert("Reinvest failed: " + (err.reason || err.message || "Transaction Rejected"));
        
        
        compoundBtn.innerText = originalText;
        compoundBtn.disabled = false;
    }
}

window.handleCapitalWithdraw = async function() {
    
    if (!confirm("Are you sure? This will withdraw your matured capital to your wallet.")) return;

    const withdrawBtn = event.target;
    const originalText = withdrawBtn.innerText;

    try {
        let activeSigner = window.signer || signer;
        let activeContract = window.contract || contract;

        if (!activeSigner || !window.ethereum) {
            if (!window.ethereum) return alert("Please use Trust Wallet or MetaMask browser!");
            
            const tempProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
            await tempProvider.send("eth_requestAccounts", []);
            activeSigner = tempProvider.getSigner();
            activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, activeSigner);
            
            window.signer = activeSigner;
            window.contract = activeContract;
        }

        withdrawBtn.disabled = true;
        withdrawBtn.innerText = "CONFIRMING...";

        console.log("Withdrawing Capital...");
        const tx = await activeContract.withdrawMaturedCapital();
        
        withdrawBtn.innerText = "WITHDRAWING...";
        await tx.wait();
        
        alert("Capital Withdrawn Successfully!");
        location.reload(); 

    } catch (err) {
        console.error("Withdraw Error:", err);
        alert("Withdraw failed: " + (err.reason || err.message || "Transaction Rejected"));
        
        
        withdrawBtn.innerText = originalText;
        withdrawBtn.disabled = false;
    }
}
window.handleLogin = async function() {
    try {
        if (!window.ethereum) return alert("Please install Trust Wallet or MetaMask!");

        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts.length === 0) return;
        const userAddress = accounts[0]; 

        const tempProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
        const { chainId } = await tempProvider.getNetwork();

        // Check if on BSC Testnet (97)
        if (chainId !== TESTNET_CHAIN_ID) {
            alert("Please switch your wallet to BSC Testnet (Chain 97)!");
            return;
        }

        const tempSigner = tempProvider.getSigner();
        const tempContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, tempSigner);

        provider = tempProvider;
        signer = tempSigner;
        contract = tempContract;

        const userData = await contract.users(userAddress);

        if (userData.registered === true) {
            localStorage.setItem('userAddress', userAddress);
            localStorage.removeItem('manualLogout');
            
            if(typeof showLogoutIcon === "function") showLogoutIcon(userAddress);
            
            window.location.href = "index1.html";
        } else {
            alert("User Are Not registered ! Plz  Registration...");
            window.location.href = "register.html";
        }
    } catch (err) { 
        console.error("Login Error:", err);
        alert("Login failed! Make sure your wallet is connected to BSC Testnet."); 
    }
}
window.handleRegister = async function() {
    const userField = document.getElementById('reg-username');
    const refField = document.getElementById('reg-referrer');
    const regBtn = event.target; // Button ko pakadne ke liye
    
    if (!userField || !refField) return;

    const username = userField.value.trim();
    const referrer = refField.value.trim();

    if (!username || !referrer) {
        alert("Username and Referrer are required!");
        return;
    }

    try {
      
        let activeSigner = window.signer || signer;
        let activeContract = window.contract || contract;

        if (!activeSigner || !window.ethereum) {
            if (!window.ethereum) return alert("Please use Trust Wallet/MetaMask browser!");
            
            const tempProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
            await tempProvider.send("eth_requestAccounts", []);
            activeSigner = tempProvider.getSigner();
            activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, activeSigner);
            
            window.signer = activeSigner;
            window.contract = activeContract;
        }

        // ---  NETWORK AUTO-SWITCH (BSC Testnet: 97) ---
        const network = await activeSigner.provider.getNetwork();
        if (network.chainId !== 97) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x61' }], // 0x61 = 97
                });
            } catch (switchError) {
                alert("Please switch your wallet to BSC Testnet manually!");
                return;
            }
        }

        regBtn.disabled = true;
        regBtn.innerText = "CHECKING...";

        
        console.log("Registering username:", username);
        
        // Manual gas limit for Trust Wallet stability
        const tx = await activeContract.register(username, referrer, {
            gasLimit: 500000 
        });

        regBtn.innerText = "CONFIRMING...";
        console.log("Tx Hash:", tx.hash);

        await tx.wait();
        
        
        localStorage.removeItem('manualLogout');
        localStorage.setItem('userAddress', await activeSigner.getAddress()); 
        
        alert("Registration Successful!");
        window.location.href = "index1.html";

    } catch (err) { 
        console.error("Register Error:", err);
        regBtn.disabled = false;
        regBtn.innerText = "REGISTER NOW";

        if (err.code === 4001 || err.message.includes("user rejected")) {
            alert("Transaction rejected by user.");
        } else {
            alert("Error: " + (err.reason || "Username might be taken or balance is low."));
        }
    }
}
window.handleLogout = function() {
    if (confirm("Disconnect and Logout?")) {
       
        localStorage.clear(); 
        
        localStorage.setItem('manualLogout', 'true');
        
        window.location.href = "index.html"; 
    }
}

function showLogoutIcon(address) {
    const btn = document.getElementById('connect-btn');
    const logout = document.getElementById('logout-icon-btn');
    if (btn) btn.innerText = address.substring(0, 6) + "..." + address.substring(38);
    if (logout) logout.style.display = 'flex'; 
}

async function setupApp(address) {
    if (!address || address === "undefined") return;
    
    localStorage.setItem('userAddress', address);
    const network = await provider.getNetwork();
    if (network.chainId !== TESTNET_CHAIN_ID) { 
        alert("Please switch your wallet to BSC Testnet (Chain 97)!"); 
        return; 
    }

    const activeContract = window.contract || contract;
    const userData = await activeContract.users(address);
    const path = window.location.pathname;

    // Registration Logic
    if (!userData.registered) {
        if (!path.includes('register.html') && !path.includes('login.html')) {
            window.location.href = "register.html"; 
            return; 
        }
    } else {
        if (path.includes('register.html') || path.includes('login.html') || path.endsWith('/') || path.endsWith('index.html')) {
            window.location.href = "index1.html";
            return;
        }
    }

    updateNavbar(address);
    showLogoutIcon(address); 

    if (path.includes('index1.html')) {
        setTimeout(() => fetchAllData(address), 300);
        start8HourCountdown(); 
    }
    if (path.includes('leadership.html')) {
        setTimeout(() => fetchLeadershipData(address), 300);
    }
    if (path.includes('history.html')) {
        setTimeout(() => window.showHistory('deposit'), 300);
    }
}

// --- HISTORY LOGIC ---
window.showHistory = async function(category) {
    const container = document.getElementById('history-container');
    if(!container) return;
    
    container.innerHTML = `<div class="p-10 text-center text-yellow-500 italic animate-pulse">Fetching ${category.toUpperCase()} Records...</div>`;
  
    const typeMap = {
        'deposit': ['DEPOSIT'],
        'compounding': ['REINVEST'],
        'withdrawal': ['WITHDRAW', 'PRINCIPAL_WITHDRAW'],
        'income': ['ROI_INCOME', 'LEVEL_INCOME', 'RANK_INCOME']
    };

    const allowedTypes = typeMap[category] || [];
    const logs = await window.fetchBlockchainHistory(allowedTypes);

    if (logs.length === 0) {
        container.innerHTML = `<div class="p-10 text-center text-gray-500">No ${category} records found.</div>`;
        return;
    }

    container.innerHTML = logs.map(item => `
        <div class="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4 flex justify-between items-center hover:bg-white/10 transition-all">
            <div>
                <h4 class="font-bold ${item.color}">${item.type.replace('_', ' ')}</h4>
                <p class="text-[10px] text-gray-400 uppercase tracking-widest">${item.detail}</p>
                <p class="text-[10px] text-gray-500 mt-1">${item.date} | ${item.time}</p>
            </div>
            <div class="text-right">
                <span class="text-lg font-black text-white">${item.amount}</span>
                <p class="text-[10px] text-gray-500 font-bold">USDT</p>
            </div>
        </div>
    `).join('');
}

window.fetchBlockchainHistory = async function(allowedTypes) {
    try {
        // --- TRUST WALLET FIX ---
        let address = localStorage.getItem('userAddress');
        
        if (!address && window.signer) {
            address = await window.signer.getAddress();
        }

        if (!address || address === "undefined") {
            console.log("History Error: No address found yet");
            return [];
        }

        const activeContract = window.contract || contract;
        if (!activeContract) return [];

        const rawHistory = await activeContract.getUserHistory(address);
        
        return rawHistory
            .filter(item => {
                const txType = item.txType.toUpperCase();
                return allowedTypes.includes(txType);
            }) 
            .map(item => {
                const txType = item.txType.toUpperCase();
                const dt = new Date(item.timestamp.toNumber() * 1000);
                
                let colorClass = 'text-cyan-400';
                if(txType.includes('INCOME')) colorClass = 'text-green-400';
                if(txType.includes('WITHDRAW')) colorClass = 'text-red-400';

                return {
                    type: txType,
                    amount: format(item.amount),
                    detail: item.detail,
                    date: dt.toLocaleDateString(),
                    time: dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                    ts: item.timestamp.toNumber(),
                    color: colorClass
                };
            })
            .sort((a,b) => b.ts - a.ts); // Newest transactions first
    } catch (e) { 
        console.error("History Fetch Error:", e);
        return []; 
    }
}
async function fetchAllData(address) {
    try {
        // --- TRUST WALLET CONNECTION FIX ---
        
        const activeContract = window.contract || contract;
        
        if (!activeContract) {
            console.error("Contract not ready yet!");
            return;
        }

    
        const [user, extra, live] = await Promise.all([
            activeContract.users(address), 
            activeContract.usersExtra(address), 
            activeContract.getLiveBalance(address)
        ]);

        // --- DASHBOARD BASIC DATA ---
        updateText('username-display', user.username || "USER"); 
        updateText('user-address', address.substring(0, 6) + "..." + address.substring(38));
        updateText('total-deposit', format(user.totalDeposited));
        updateText('active-deposit', format(user.totalActiveDeposit));
        updateText('total-earned', format(user.totalEarnings));
        updateText('total-withdrawn', format(user.totalWithdrawn));
        
        // Income breakdown display
        updateText('level-earning', format(extra.totalEarnedLevel)); 
        updateText('rank-earning', format(extra.totalEarnedRank)); 
 updateText('roi-earning', format(extra.totalEarnedROI)); 
        // --- THE ULTIMATE FIX ---
        const totalWithdrawable = parseFloat(format(live));
        const activeAmt = parseFloat(format(user.totalActiveDeposit));

        // UI Updates - Direct live value use (SAME LOGIC)
        updateText('withdrawable', totalWithdrawable.toFixed(2));    
        updateText('compounding-balance', totalWithdrawable.toFixed(2));
        updateText('cap-balance', format(user.totalActiveDeposit));
        updateText('active-deposit-cp', format(user.totalActiveDeposit));
        
updateText('roi-earning', format(extra.totalEarnedROI)); 
updateText('team-count', extra.teamCount || "0");         
updateText('directs-count', extra.directsCount || "0");   

        // Daily ROI Projection (0.9%)
        updateText('projected-return', (activeAmt * 0.009).toFixed(2));

        // --- RANK & STATUS ---
        // getRankName ko bhi activeContract se call kar rahe hain (Fix for Trust Wallet)
        const rankName = await activeContract.getRankName(extra.rank);
        updateText('rank-display', rankName);

        const statusText = document.getElementById('main-status-text');
        const statusBadge = document.getElementById('status-badge');
        
        if (activeAmt > 0) {
            if(statusText) { statusText.innerText = "ACTIVE"; statusText.className = "text-xs font-black orbitron text-green-500"; }
            if(statusBadge) { 
                statusBadge.innerHTML = "● Active Status"; 
                statusBadge.className = "px-4 py-1 rounded-full bg-green-500/20 text-green-500 text-[10px] font-black border border-green-500/30 uppercase"; 
            }
        } else {
            if(statusText) { statusText.innerText = "INACTIVE"; statusText.className = "text-xs font-black orbitron text-red-500"; }
            if(statusBadge) {
                statusBadge.innerHTML = "● Inactive";
                statusBadge.className = "px-4 py-1 rounded-full bg-red-500/20 text-red-500 text-[10px] font-black border border-red-500/30 uppercase";
            }
        }

        // --- REFERRAL URL ---
        const baseUrl = window.location.origin + window.location.pathname.replace('index1.html', 'register.html');
        const refField = document.getElementById('refURL');
        if(refField) refField.value = `${baseUrl}?ref=${user.username}`;

    } catch (err) { 
        console.error("Data Sync Error:", err); 
    }
}
// --- LEADERSHIP DATA (Corrected for RPC Mode) ---
async function fetchLeadershipData(address) {
    try {
        const activeContract = window.contract || contract;
        if (!activeContract) return;

        const [user, extra] = await Promise.all([
            activeContract.users(address), 
            activeContract.usersExtra(address)
        ]);

        const teamActiveVol = parseFloat(ethers.utils.formatUnits(user.teamActiveDeposit, 18));
        const teamTotalVol = parseFloat(ethers.utils.formatUnits(user.teamTotalDeposit, 18));
        const rankRewards = parseFloat(ethers.utils.formatUnits(extra.rewardsRank, 18));

        updateText('team-active-deposit', teamActiveVol.toFixed(2));
        updateText('team-total-deposit', teamTotalVol.toFixed(2));
        updateText('rank-reward-available', rankRewards.toFixed(2));
        updateText('current-team-count', extra.teamCount);
        updateText('directs-quali', extra.directsQuali);
        updateText('current-team-volume', teamActiveVol.toFixed(0));

        if (typeof updateRankUI === "function") {
            updateRankUI(extra, teamActiveVol);
        }
    } catch (err) { 
        console.error("Leadership Data Error:", err); 
    }

}
function start8HourCountdown() {
    const timerElement = document.getElementById('next-timer');
    if (!timerElement) return;
    setInterval(() => {
        const now = new Date();
        const eightHoursInMs = 8 * 60 * 60 * 1000;
        const nextTarget = Math.ceil(now.getTime() / eightHoursInMs) * eightHoursInMs;
        const diff = nextTarget - now.getTime();
        const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        timerElement.innerText = `${h}:${m}:${s}`;
    }, 1000);
}

// --- UTILS ---
const format = (val) => {
    try { return parseFloat(ethers.utils.formatUnits(val, 18)).toFixed(2); }
    catch { return "0.00"; }
};


const updateText = (id, val) => { 
    const elements = document.querySelectorAll(`[id="${id}"]`); 
    if(elements.length > 0) {
        elements.forEach(el => {
            el.innerText = val; 
        });
    }
};

function updateNavbar(addr) {
    const btn = document.getElementById('connect-btn');
    if(btn) btn.innerText = addr.substring(0,6) + "..." + addr.substring(38);
}

window.addEventListener('load', init);



