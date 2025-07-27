class SidebarManager {
  constructor() {
    this.sidebar = document.getElementById('sidebar');
    this.overlay = document.getElementById('overlay');
    this.menuToggle = document.querySelector('.menu-toggle');
    this.isOpen = false;
    this.init();
  }

  init() {
    this.setActivePage();
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    document.querySelectorAll('.sidebar-nav a').forEach(item => {
      item.addEventListener('click', () => { if (window.innerWidth <= 768) setTimeout(() => this.close(), 150); });
    });
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  toggle() { this.isOpen ? this.close() : this.open(); }
  open() { this.sidebar.classList.add('active'); this.overlay.classList.add('active'); if (this.menuToggle) this.menuToggle.classList.add('active'); this.isOpen = true; document.body.style.overflow = 'hidden'; }
  close() { this.sidebar.classList.remove('active'); this.overlay.classList.remove('active'); if (this.menuToggle) this.menuToggle.classList.remove('active'); this.isOpen = false; document.body.style.overflow = ''; }

  setActivePage() {
    const currentPath = window.location.pathname;
    document.querySelectorAll('.sidebar-nav a').forEach(item => {
      item.classList.remove('active');
      const itemPath = item.getAttribute('href');
      if (itemPath === currentPath || (currentPath.startsWith(itemPath) && itemPath !== '/')) item.classList.add('active');
    });
  }

  handleResize() { if (window.innerWidth > 768 && this.isOpen) this.close(); }
}

const sidebarManager = new SidebarManager();
function toggleSidebar() { sidebarManager.toggle(); }
function closeSidebar() { sidebarManager.close(); }
