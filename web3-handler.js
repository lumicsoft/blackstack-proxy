let provider, signer, contract;

// --- CONFIGURATION ---
const CONTRACT_ADDRESS = "0xe93731eEdDb1C8770138727175324ECf23c9Ef19"; 
const BLX_TOKEN_ADDRESS = "0x0C978102175c6b9f90Dd53b249C1E5EdbF82DC3A"; // BSC USDT
const TESTNET_CHAIN_ID = 97; 

// --- RANK CONFIG (Star1 to Master King) ---
const RANK_DETAILS = [
     { name: "None", count: 0, vol: 0 },
            { name: "Star", count: 10, vol: 1000 },
            { name: "Silver", count: 50, vol: 5000 },
            { name: "Gold", count: 100, vol: 20000 },
            { name: "Platinum", count: 300, vol: 50000 },
            { name: "Diamond", count: 1000, vol: 100000 },
            { name: "D. Diamond", count: 3000, vol: 1500000 },
            { name: "C. Diamond", count: 5000, vol: 2000000 }
];

const CONTRACT_ABI = [
    "function register(address referrer) external",
    "function stake(uint256 amount, bool withBurn) external",
    "function claimROI(uint256 stakeIndex) external",
    "function withdraw(uint256 amount) external",
    "function requestUnstake(uint256 stakeIndex) external",
    "function claimUnstake(uint256 stakeIndex) external",
    "function totalTeamBusiness(address) view returns (uint256)",
     "function getPendingROI(address user) external view returns (uint256)"
    "function users(address) view returns (bool exists, address referrer, uint256 totalStaked, uint256 totalIncome, uint256 totalWithdrawn, uint256 activeDirects, uint256 teamCount, string currentRank)",
    "function getIncomeHistory(address user) external view returns(tuple(string incomeType, uint256 amount, uint256 timestamp)[])",
    "function getUserStats(address user) external view returns(uint256 roi, uint256 level, uint256 referral, uint256 reward, uint256 teamShare, uint256 teamCount, string rank)",
    "function getIncomeByType(address user, string incomeType) external view returns (uint256)",
    // Naye added functions:
    "function getTeamByLevel(address _user, uint256 _level) external view returns (address[], uint256[])",
    "function getStakeCount(address user) external view returns (uint256)",
    "function getStake(address user, uint256 index) external view returns (tuple(uint256 amount, uint256 startTime, uint256 totalRoiReceived, uint256 maxPayout, bool withBurn, bool active, uint256 lastClaimTime, bool unstakeRequested, uint256 unstakeRequestTime, uint256 totalEarnedFromStake))"
];
const ERC20_ABI = ["function approve(address spender, uint256 amount) public returns (bool)", "function allowance(address owner, address spender) public view returns (uint256)"];

const calculateGlobalROI = () => 0.90;

// --- 1. AUTO-FILL LOGIC ---
async function checkReferralURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref'); 
    const refField = document.getElementById('reg-referrer');
    
    if (refParam && refField) {
        if (ethers.utils.isAddress(refParam)) {
            refField.value = refParam.trim();
        } else {
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

async function init() {
    checkReferralURL();

    try {
        if (window.ethereum) {
            provider = new ethers.providers.Web3Provider(window.ethereum, "any");
            
            // --- AUTO NETWORK SWITCH LOGIC ---
            const network = await provider.getNetwork();
            if (network.chainId !== TESTNET_CHAIN_ID) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x61' }], // 97 = 0x61
                    });
                    window.location.reload();
                    return; 
                } catch (switchError) {
                    console.warn("User denied network switch or network not added.");
                }
            }

            // Read-only contract instance
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
            window.contract = contract;

            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                signer = provider.getSigner();
                window.signer = signer; // <--- Yeh line zaroori hai
                
                // Signer ke sath contract instance
                contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
                window.contract = contract; // <--- Global contract update
                
                await setupApp(accounts[0]);
            }

            // Listeners
            window.ethereum.on('chainChanged', () => window.location.reload());
            window.ethereum.on('accountsChanged', (accs) => {
                if (accs.length === 0) localStorage.removeItem('userAddress');
                else localStorage.setItem('userAddress', accs[0]);
                window.location.reload();
            });
        }
    } catch (error) {
        console.error("Init Error:", error);
    }
}
// --- CORE LOGIC ---
window.handleDeposit = async function(withBurn) {
    const amountInput = document.getElementById('deposit-amount');
    const depositBtn = event.target; // Jo button click hua hai
    
    if (!amountInput || !amountInput.value || parseFloat(amountInput.value) < 100) {
        return alert("Min 100 BLX required!");
    }

    try {
        let activeSigner = window.signer || provider.getSigner();
        let activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, activeSigner);

        depositBtn.disabled = true;
        depositBtn.innerText = "APPROVING...";

        const amountInWei = ethers.utils.parseUnits(amountInput.value.toString(), 18);
        const blxToken = new ethers.Contract(BLX_TOKEN_ADDRESS, ERC20_ABI, activeSigner);

        // 1. Approval Step
        const allowance = await blxToken.allowance(await activeSigner.getAddress(), CONTRACT_ADDRESS);
        if (allowance.lt(amountInWei)) {
            const approveTx = await blxToken.approve(CONTRACT_ADDRESS, amountInWei);
            await approveTx.wait();
        }

        depositBtn.innerText = "SIGNING...";

        // 2. Stake Step: yahan 'withBurn' dynamic parameter use ho raha hai
        // stake(uint256 amount, bool withBurn)
        const depositGas = await activeContract.estimateGas.stake(amountInWei, withBurn);
        const tx = await activeContract.stake(amountInWei, withBurn, { 
            gasLimit: depositGas.mul(150).div(100) 
        });
        
        depositBtn.innerText = withBurn ? "BURNING & STAKING..." : "STAKING...";
        await tx.wait();
        
        alert(withBurn ? "Stake with Burn Successful!" : "Stake Successful!");
        location.reload(); 
    } catch (err) {
        console.error("Deposit Error:", err);
        alert("Error: " + (err.data?.message || err.message || "Transaction Failed"));
        depositBtn.innerText = withBurn ? "STAKE WITH BURN" : "STAKE WITHOUT BURN";
        depositBtn.disabled = false;
    }
}

window.handleClaimROI = async function(stakeIndex = 0) {
    const claimBtn = event.target;
    try {
        claimBtn.disabled = true; claimBtn.innerText = "CLAIMING...";
        const activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider.getSigner());
        const tx = await activeContract.claimROI(stakeIndex);
        await tx.wait();
        alert("ROI Claimed Successfully!");
        location.reload(); 
    } catch (err) {
        alert("Claim failed: " + (err.reason || err.message));
        claimBtn.disabled = false; claimBtn.innerText = "CLAIM ROI";
    }
}
window.handleRequestUnstake = async function(stakeIndex = 0) {
    try {
        const activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider.getSigner());
        const tx = await activeContract.requestUnstake(stakeIndex);
        await tx.wait();
        alert("Unstake Requested! Wait 14 days to claim.");
    } catch (err) { alert("Error: " + err.message); }
}
window.handleWithdraw = async function() {
    const amount = document.getElementById('withdraw-amount').value;
    if(!amount || amount <= 0) return alert("Enter valid amount");
    try {
        const amountInWei = ethers.utils.parseUnits(amount.toString(), 18);
        const tx = await window.contract.withdraw(amountInWei);
        await tx.wait();
        alert("Withdrawal Successful!");
        location.reload();
    } catch (err) { alert("Withdraw Error: " + (err.reason || err.message)); }
}
window.handleClaimUnstake = async function(stakeIndex = 0) {
    try {
        const activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider.getSigner());
        const tx = await activeContract.claimUnstake(stakeIndex);
        await tx.wait();
        alert("Capital Claimed!");
        location.reload();
    } catch (err) { alert("Error: " + err.message); }
}


window.handleCompoundDaily = async function() {
    const compoundBtn = event.target;
    const originalText = compoundBtn.innerText;
    try {
        compoundBtn.disabled = true; compoundBtn.innerText = "WAITING...";
        const tx = await contract.reinvestMatured();
        compoundBtn.innerText = "REINVESTING...";
        await tx.wait();
        alert("Reinvestment Successful!");
        location.reload(); 
    } catch (err) {
        alert("Reinvest failed: " + (err.reason || err.message));
        compoundBtn.innerText = originalText; compoundBtn.disabled = false;
    }
}


window.handleLogin = async function() {
    try {
        if (!window.ethereum) return alert("Please install Trust Wallet or MetaMask!");
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const userData = await contract.users(accounts[0]);
        if (userData.exists === true) { localStorage.setItem('userAddress', accounts[0]); window.location.href = "index1.html"; }
        else { alert("Not registered!"); window.location.href = "register.html"; }
    } catch (err) { console.error("Login Error:", err); }
}

window.handleRegister = async function() {
    const refField = document.getElementById('reg-referrer');
    const regBtn = event.target;
    if (!refField || !ethers.utils.isAddress(refField.value.trim())) return alert("Valid Referrer Address is required!");
    try {
        regBtn.disabled = true; regBtn.innerText = "REGISTERING...";
        const tx = await contract.register(refField.value.trim(), { gasLimit: 300000 });
        await tx.wait();
        localStorage.setItem('userAddress', await signer.getAddress());
        alert("Registration Successful!");
        window.location.href = "index1.html";
    } catch (err) { alert("Error: " + (err.reason || "Registration failed.")); regBtn.disabled = false; }
}

window.handleLogout = function() {
    if (confirm("Disconnect and Logout?")) { localStorage.clear(); window.location.href = "index.html"; }
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

    // 1. नेटवर्क चेक और ऑटो-स्विचिंग
    try {
        const network = await provider.getNetwork();
        if (network.chainId !== TESTNET_CHAIN_ID) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x61' }], // 97 = 0x61
                });
                window.location.reload(); // स्विच होने के बाद रीलोड
                return;
            } catch (switchError) {
                if (switchError.code === 4902) {
                    alert("Please add BSC Testnet to your wallet.");
                } else {
                    alert("Please switch to BSC Testnet manually.");
                }
            }
        }
    } catch (err) {
        console.error("Network check failed:", err);
    }

    // 2. कॉन्ट्रैक्ट डेटा और रिडायरेक्शन लॉजिक
    const userData = await contract.users(address);
    const path = window.location.pathname;

    console.log("User Exists in Contract:", userData.exists);

    if (!userData.exists && !path.includes('register.html')) {
        window.location.href = "register.html";
        return;
    } else if (userData.exists && path.includes('register.html')) {
        window.location.href = "index1.html";
        return;
    }

    updateNavbar(address);
    showLogoutIcon(address);
    if (path.includes('index1.html')) fetchAllData(address);
}
window.fetchBlockchainHistory = async function(categories) {
    try {
        const address = await window.signer.getAddress();
        const finalLogs = [];

        // 1. STAKE DATA (Name check: 'DEPOSIT' हटाकर 'STAKE' किया)
        if (categories.includes('STAKE')) { 
            const count = await window.contract.getStakeCount(address);
            console.log("Total Stakes found:", count.toString());

            for (let i = 0; i < count; i++) {
                const s = await window.contract.getStake(address, i);
                
                // डेटा मैपिंग - कॉन्ट्रैक्ट के अनुसार
                const amount = s.amount !== undefined ? s.amount : s[0];
                const startTime = s.startTime !== undefined ? s.startTime : s[1];
                const withBurn = s.withBurn !== undefined ? s.withBurn : s[4];

                if (amount) {
                    finalLogs.push({
                        type: 'STAKE', // UI में भी 'STAKE' दिखेगा
                        amount: parseFloat(ethers.utils.formatUnits(amount.toString(), 18)).toFixed(2),
                        date: new Date(startTime * 1000).toLocaleDateString(),
                        time: new Date(startTime * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                        detail: withBurn ? "With Burn" : "Standard"
                    });
                }
            }
        }

        // 2. INCOME DATA (नाम चेक)
        const incomeLogs = await window.contract.getIncomeHistory(address);
        if (incomeLogs && incomeLogs.length > 0) {
            incomeLogs.forEach(item => {
                const incomeType = item.incomeType || item[0];
                const amount = item.amount || item[1];
                const timestamp = item.timestamp || item[2];

                if (categories.includes(incomeType.toUpperCase())) {
                    finalLogs.push({
                        type: incomeType.toUpperCase(),
                        amount: parseFloat(ethers.utils.formatUnits(amount.toString(), 18)).toFixed(2),
                        date: new Date(timestamp * 1000).toLocaleDateString(),
                        time: new Date(timestamp * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                        detail: incomeType
                    });
                }
            });
        }

        return finalLogs;
    } catch (e) {
        console.error("DEBUG: History Error Trace:", e);
        return [];
    }
}

async function fetchAndDisplayData() {
    console.log("Fetching Leadership Data...");
    try {
        if (!window.contract || !window.signer) {
            console.error("Contract/Signer not ready");
            return;
        }

        const userAddress = await window.signer.getAddress();
        
        // 1. Force Dashboard Sync
        if (typeof window.fetchAllData === 'function') {
            await window.fetchAllData(userAddress);
        }

        // 2. Contract se data layein
        const stats = await window.contract.getUserStats(userAddress);
        const teamBusinessWei = await window.contract.totalTeamBusiness(userAddress);
        
        // 3. Data format karein
        const teamBusiness = parseFloat(ethers.utils.formatEther(teamBusinessWei));
        const teamCount = parseInt(stats[5].toString());
        const currentRank = stats[6]; // Contract ka rank string

        console.log("Stats Loaded:", { teamCount, teamBusiness, currentRank });

        // 4. UI Update (Leadership Specific)
        if(document.getElementById('team-total-deposit')) 
            document.getElementById('team-total-deposit').innerText = teamBusiness.toFixed(2);
        if(document.getElementById('current-team-count')) 
            document.getElementById('current-team-count').innerText = teamCount;
        if(document.getElementById('rank-reward-available')) 
            document.getElementById('rank-reward-available').innerText = parseFloat(ethers.utils.formatEther(stats[3])).toFixed(2);

        // 5. Progress Bar Update
        if(window.rankPlan) {
            const rankIndex = window.rankPlan.findIndex(r => r.name.toLowerCase() === currentRank.toLowerCase());
            const safeRankIndex = rankIndex === -1 ? 0 : rankIndex;
            
            if(typeof window.updateLeadershipUI === 'function') {
                window.updateLeadershipUI(teamCount, teamBusiness, safeRankIndex);
            }
        }
    } catch (error) {
        console.error("Data Load Error:", error);
    }
}


// --- UPDATED fetchAllData FUNCTION ---
async function fetchAllData(address) {
    const refUrl = `${window.location.origin}/register.html?ref=${address}`; 
    const refInput = document.getElementById('refURL');
    if(refInput) refInput.value = refUrl;
    
    // Address display fix
    const addrDisplay = document.getElementById('user-address');
    if(addrDisplay) addrDisplay.innerText = address;
    
    try {
        // 1. getUserStats (returns: roi, level, referral, reward, teamShare, teamCount, rank)
        const stats = await contract.getUserStats(address); 
        
        // 2. User main data call
        const userData = await contract.users(address);

        // --- Dashboard UI Mapping ---

        // Revenue Stats (From stats array)
        updateText('roi-earning', format(stats[0]));        // ROI Income
        updateText('level-earning', format(stats[1]));      // Team Bonus (Renamed Level Income)
        updateText('referral-bonus', format(stats[2]));     // Referral Bonus
        updateText('rank-earning', format(stats[3]));       // Reward Bonus (Renamed Reward)
        updateText('team-profit-share', format(stats[4]));  // Team Profit Share Bonus (New)
        
        // Dashboard Stats Box Mapping
        updateText('total-deposit', format(userData.totalStaked));
        updateText('total-earned', format(userData.totalIncome));
        updateText('total-withdrawn', format(userData.totalWithdrawn));
        updateText('team-count', stats[5].toString());
        updateText('directs-count', userData.activeDirects.toString());
        
        // Dynamic Rank Display
        updateText('rank-display', stats[6].toString());
        
        // Withdrawable Balance (Available = Total Income - Total Withdrawn)
        const withdrawable = userData.totalIncome.sub(userData.totalWithdrawn);
        updateText('compounding-balance', format(withdrawable));
        updateText('withdraw-balance-display', format(withdrawable));
        updateText('cap-balance', format(withdrawable));

        // Active Deposit for Compound Power
        updateText('active-deposit', format(userData.totalStaked));
        updateText('active-deposit-cp', format(userData.totalStaked));

    } catch (err) { 
        console.error("Data Sync Error:", err); 
    }
}

// Ensure ki 'format' function ethers.utils ka use kar raha ho
const format = (val) => val ? parseFloat(ethers.utils.formatUnits(val, 18)).toFixed(2) : "0.00";
const updateText = (id, val) => document.querySelectorAll(`[id="${id}"]`).forEach(el => el.innerText = val);
function updateNavbar(addr) { const btn = document.getElementById('connect-btn'); if(btn) btn.innerText = addr.substring(0,6) + "..." + addr.substring(38); }

window.addEventListener('load', init);
