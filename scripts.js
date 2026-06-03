// 1. Function to Load Components (Header/Footer)
async function loadComponent(id, path) {
    try {
        const res = await fetch(path);
        const html = await res.text();
        document.getElementById(id).innerHTML = html;
        
        // Lucide icons ko re-initialize karna zaroori hai component load hone ke baad
        if (window.lucide) lucide.createIcons();
        
        // --- MOBILE MENU LOGIC ---
        const menuBtn = document.getElementById('menu-btn');
        const mobileMenu = document.getElementById('mobile-menu');
        
        if (menuBtn && mobileMenu) {
            menuBtn.onclick = (e) => {
                e.stopPropagation(); // Click event ko bahar jane se rokta hai
                mobileMenu.classList.toggle('hidden');
                mobileMenu.classList.toggle('flex');
            };

            // Screen par kahi bhi click karne par menu band ho jaye
            document.addEventListener('click', (e) => {
                if (!mobileMenu.contains(e.target) && !menuBtn.contains(e.target)) {
                    mobileMenu.classList.add('hidden');
                    mobileMenu.classList.remove('flex');
                }
            });
        }

        // --- ACTIVE LINK HIGHLIGHT ---
        const currentPage = window.location.pathname.split("/").pop() || "index.html";
        document.querySelectorAll('.nav-link').forEach(link => {
            if(link.getAttribute('href') === currentPage) {
                link.classList.add('text-cyan-400');
                // Agar index.html hai toh underline bhi de sakte hain
                if(currentPage === "index.html") {
                    link.classList.add('border-b', 'border-cyan-400');
                }
            }
        });

    } catch (e) { 
        console.error("Error loading component:", e); 
    }
}

// 2. Background Animation Logic
const initBackground = () => {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    
    const resize = () => { 
        canvas.width = window.innerWidth; 
        canvas.height = window.innerHeight; 
    };
    
    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2;
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.speedY = (Math.random() - 0.5) * 0.5;
            this.opacity = Math.random();
        }
        update() {
            this.x += this.speedX; 
            this.y += this.speedY;
            if (this.x > canvas.width) this.x = 0;
            if (this.x < 0) this.x = canvas.width;
            if (this.y > canvas.height) this.y = 0;
            if (this.y < 0) this.y = canvas.height;
        }
        draw() {
            ctx.fillStyle = `rgba(0, 242, 255, ${this.opacity})`;
            ctx.beginPath(); 
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); 
            ctx.fill();
        }
    }

    for (let i = 0; i < 150; i++) particles.push(new Particle());
    
    const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    };
    
    window.addEventListener('resize', resize);
    resize(); 
    animate();
};

// Start everything
document.addEventListener("DOMContentLoaded", () => {
    loadComponent("header-placeholder", "header.html");
    loadComponent("footer-placeholder", "footer.html");
    initBackground();
});