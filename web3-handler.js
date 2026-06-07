let provider, signer, contract;

// --- CONFIGURATION ---
const CONTRACT_ADDRESS = "0xC43b35712b32C44b390059E42538E817c7efB6EF"; 
const USDT_TOKEN_ADDRESS = "0x0C978102175c6b9f90Dd53b249C1E5EdbF82DC3A"; // BSC USDT
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
    "function register(address referrer) external",
    "function stake(uint256 amount, bool withBurn, address referrer) external",
    "function withdraw(uint256 amount) external",
    "function requestUnstake(uint256 stakeIndex) external",
    "function claimUnstake(uint256 stakeIndex) external",
    "function users(address) view returns (bool exists, address referrer, uint256 totalStaked, uint256 totalIncome, uint256 totalWithdrawn, uint256 activeDirects, uint256 teamCount)",
    "function getIncomeHistory(address user) external view returns(tuple(string incomeType, uint256 amount, uint256 timestamp)[])",
    "function getUserStats(address user) external view returns(uint256 totalStaked, uint256 totalIncome, uint256 totalWithdrawn, uint256 activeDirects, uint256 teamCount)",
    "function getIncomeByType(address user, string incomeType) external view returns (uint256)"
];

const ERC20_ABI = ["function approve(address spender, uint256 amount) public returns (bool)", "function allowance(address owner, address spender) public view returns (uint256)"];

// ROI calculation (0.9% fixed)
const calculateGlobalROI = () => 0.90;

// --- 1. AUTO-FILL LOGIC ---
// --- UPDATED REFERRAL LOGIC ---
async function checkReferralURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref'); // Ye username ya address dono ho sakta hai
    const refField = document.getElementById('reg-referrer');
    
    if (refParam && refField) {
        // Logic: Agar ye valid Ethereum address format mein hai, toh seedha set kar do
        if (ethers.utils.isAddress(refParam)) {
            refField.value = refParam.trim();
        } else {
            // Agar ye username hai, toh contract se uska address find karo
            // NOTE: Iske liye contract mein 'usernames[username] -> address' mapping honi chahiye
            try {
                const address = await contract.usernameToAddress(refParam);
                refField.value = address;
            } catch (e) {
                console.log("Username not found, using as is:", refParam);
                refField.value = refParam.trim();
            }
        }
        console.log("Referral processed:", refField.value);
    }
}

// --- INITIALIZATION ---
async function init() {
    checkReferralURL();
    const bscTestnetRPC = "https://data-seed-prebsc-1-s1.binance.org:8545/";
    const savedAddr = localStorage.getItem('userAddress');

    try {
        if (window.ethereum) {
            provider = new ethers.providers.Web3Provider(window.ethereum, "any");
            
            // Sabse pehle network check karo
            const network = await provider.getNetwork();
            if (network.chainId !== TESTNET_CHAIN_ID) {
                console.warn("Wrong Network, please switch to 97");
            }

            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                signer = provider.getSigner();
                // Contract ko Signer ke sath re-initialize karo
                contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
                await setupApp(accounts[0]);
            } else if (savedAddr) {
                await setupReadOnly(bscTestnetRPC, savedAddr);
            }

            // Listeners
            window.ethereum.on('chainChanged', () => window.location.reload());
            window.ethereum.on('accountsChanged', (accs) => {
                if (accs.length === 0) localStorage.removeItem('userAddress');
                else localStorage.setItem('userAddress', accs[0]);
                window.location.reload();
            });
        } else {
            // Agar MetaMask/Trust Wallet nahi hai
            await setupReadOnly(bscTestnetRPC, savedAddr);
        }
    } catch (error) {
        console.error("Init Error:", error);
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
    // Referrer address input ya URL se le rahe hain
    const referrer = document.getElementById('reg-referrer')?.value || "0x0000000000000000000000000000000000000000";
    
    // Min 100 BLX requirement (Aapke naye contract ke hisaab se)
    if (!amountInput || !amountInput.value || amountInput.value < 100) {
        return alert("Min 100 BLX required!");
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
        
        // Token contract (BLX)
        const blxToken = new ethers.Contract(BLX_TOKEN_ADDRESS, ERC20_ABI, activeSigner);

        // 1. Approve Check (Contract Address ko approve kar rahe hain)
        const allowance = await blxToken.allowance(userAddress, CONTRACT_ADDRESS);
        if (allowance.lt(amountInWei)) {
            const txApp = await blxToken.approve(CONTRACT_ADDRESS, amountInWei);
            await txApp.wait();
        }

        // 2. Deposit (Stake call: amount, withBurn=true, referrer)
        depositBtn.innerText = "SIGNING...";
        const tx = await activeContract.stake(amountInWei, true, referrer);
        
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
        const userAddress = accounts[0]; 

        const tempProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, tempProvider.getSigner());

        // Contract call
        const userData = await contract.users(userAddress);

        // FIX: userData.exists check karein (contract ke struct ke hisaab se)
        if (userData.exists === true) { 
            localStorage.setItem('userAddress', userAddress);
            window.location.href = "index1.html";
        } else {
            alert("Not registered! Redirecting to Registration...");
            window.location.href = "register.html";
        }
    } catch (err) { 
        console.error("Login Error:", err);
    }
}
window.handleRegister = async function() {
    // Contract mein sirf 'referrer' address chahiye, 'username' ki zarurat nahi hai
    const refField = document.getElementById('reg-referrer');
    const regBtn = event.target; 
    
    if (!refField) return;

    const referrer = refField.value.trim();

    // Referrer address check
    if (!referrer || !ethers.utils.isAddress(referrer)) {
        alert("Valid Referrer Address is required!");
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

        // --- NETWORK AUTO-SWITCH (BSC Testnet: 97) ---
        const network = await activeSigner.provider.getNetwork();
        if (network.chainId !== 97) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x61' }],
                });
            } catch (switchError) {
                alert("Please switch your wallet to BSC Testnet manually!");
                return;
            }
        }

        regBtn.disabled = true;
        regBtn.innerText = "REGISTERING...";

        console.log("Registering with referrer:", referrer);
        
        // Naye contract ke hisaab se: register(address referrer)
        const tx = await activeContract.register(referrer, {
            gasLimit: 300000 
        });

        regBtn.innerText = "CONFIRMING...";
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
            alert("Error: " + (err.reason || "Registration failed. Check address or balance."));
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
    if (!address) return;
    localStorage.setItem('userAddress', address);
    
    const activeContract = window.contract || contract;
    const userData = await activeContract.users(address); 
    const path = window.location.pathname;

    console.log("User Exists in Contract:", userData.exists);

    // FIX: userData.exists check karein
    if (!userData.exists) {
        if (!path.includes('register.html')) {
            window.location.href = "register.html";
            return;
        }
    } else {
        if (path.includes('register.html')) {
            window.location.href = "index1.html";
            return;
        }
    }

    updateNavbar(address);
    showLogoutIcon(address);
    if (path.includes('index1.html')) fetchAllData(address);
}
// --- HISTORY LOGIC ---
window.showHistory = async function(category) {
    const container = document.getElementById('history-container');
    if(!container) return;
    
    container.innerHTML = `<div class="p-10 text-center text-yellow-500 italic animate-pulse">Fetching ${category.toUpperCase()} Records...</div>`;
  
    // Naye contract ke categories ke hisaab se mapping
    const typeMap = {
        'deposit': ['STAKE'], // Contract mein event 'StakeCreated' hai
        'withdrawal': ['WITHDRAW'],
        'income': ['ROI'] // Contract mein incomeType 'ROI' aayega
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
                <h4 class="font-bold ${item.color}">${item.type}</h4>
                <p class="text-[10px] text-gray-500 mt-1">${item.date} | ${item.time}</p>
            </div>
            <div class="text-right">
                <span class="text-lg font-black text-white">${item.amount}</span>
                <p class="text-[10px] text-gray-500 font-bold">BLX</p>
            </div>
        </div>
    `).join('');
}

window.fetchBlockchainHistory = async function(allowedTypes) {
    try {
        let address = localStorage.getItem('userAddress');
        if (!address) return [];

        const activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        
        // Contract se history fetch karo
        const rawHistory = await activeContract.getIncomeHistory(address);
        
        return rawHistory
            .filter(item => allowedTypes.includes(item.incomeType.toUpperCase()))
            .map(item => {
                const dt = new Date(item.timestamp.toNumber() * 1000);
                
                let colorClass = 'text-green-400';
                if(item.incomeType.toUpperCase() === 'WITHDRAW') colorClass = 'text-red-400';

                return {
                    type: item.incomeType,
                    amount: format(item.amount),
                    date: dt.toLocaleDateString(),
                    time: dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                    ts: item.timestamp.toNumber(),
                    color: colorClass
                };
            })
            .sort((a,b) => b.ts - a.ts);
    } catch (e) { 
        console.error("History Fetch Error:", e);
        return []; 
    }
}
async function fetchAllData(address) {
    try {
        const activeContract = window.contract || contract;
        if (!activeContract) return;

        // Contract calls
        const stats = await activeContract.getUserStats(address); 
        const roi = await activeContract.getIncomeByType(address, "ROI");
        const level = await activeContract.getIncomeByType(address, "LEVEL");
        const rank = await activeContract.getIncomeByType(address, "RANK");

        // UI Updates with safe formatting
        updateText('total-deposit', format(stats[0]));
        updateText('active-deposit', format(stats[0]));
        updateText('total-earned', format(stats[1]));
        updateText('total-withdrawn', format(stats[2]));
        updateText('team-count', stats[4] ? stats[4].toString() : "0");
        updateText('directs-count', stats[3] ? stats[3].toString() : "0");
        
        // Income Types
        updateText('roi-earning', format(roi));
        updateText('level-earning', format(level));
        updateText('rank-earning', format(rank));

        // Withdrawable Calculation (BigNumber check)
        // stats[1] is Total Income, stats[2] is Total Withdrawn
        let earned = ethers.BigNumber.isBigNumber(stats[1]) ? parseFloat(ethers.utils.formatUnits(stats[1], 18)) : 0;
        let withdrawn = ethers.BigNumber.isBigNumber(stats[2]) ? parseFloat(ethers.utils.formatUnits(stats[2], 18)) : 0;
        let withdrawable = earned - withdrawn;
        
        updateText('compounding-balance', withdrawable > 0 ? withdrawable.toFixed(2) : "0.00");
        updateText('cap-balance', format(stats[0]));
        updateText('active-deposit-cp', format(stats[0]));

        console.log("Dashboard Data Loaded Successfully!");
    } catch (err) { 
        console.error("Data Sync Error:", err); 
    }
}
// --- LEADERSHIP DATA (Corrected for RPC Mode) ---
async function fetchLeadershipData(address) {
    try {
        const activeContract = window.contract || contract;
        if (!activeContract) return;

        const stats = await activeContract.getUserStats(address);
        // stats: totalStaked, totalIncome, totalWithdrawn, activeDirects, teamCount
        
        updateText('current-team-count', stats[4].toString());
        updateText('directs-quali', stats[3].toString());
        updateText('team-total-deposit', format(stats[0]));
    } catch (err) { console.error("Leadership Data Error:", err); }
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
    try {
        if (!val) return "0.00";
        // Check if it's a BigNumber object
        if (val.toString) {
            return parseFloat(ethers.utils.formatUnits(val, 18)).toFixed(2);
        }
        return parseFloat(val).toFixed(2);
    } catch (e) {
        return "0.00";
    }
};

const updateText = (id, val) => { 
    const elements = document.querySelectorAll(`[id="${id}"]`); 
    if(elements.length > 0) {
        elements.forEach(el => { el.innerText = val; });
    }
};

function updateNavbar(addr) {
    const btn = document.getElementById('connect-btn');
    if(btn) btn.innerText = addr.substring(0,6) + "..." + addr.substring(38);
}

window.addEventListener('load', init);



