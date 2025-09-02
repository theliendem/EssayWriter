class EssayHome {
    constructor() {
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        this.viewMode = localStorage.getItem('viewMode') || 'grid';
        this.init();
    }

    init() {
        this.setupTheme();
        this.setupEventListeners();
        this.loadEssays();
        this.setupViewMode();
    }

    setupTheme() {
        if (this.isDarkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.querySelector('#theme-toggle i').className = 'fas fa-sun';
        } else {
            document.documentElement.removeAttribute('data-theme');
            document.querySelector('#theme-toggle i').className = 'fas fa-moon';
        }
    }

    setupEventListeners() {
        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // New essay button
        document.getElementById('new-essay-btn').addEventListener('click', () => {
            this.showNewEssayModal();
        });

        // Modal events
        document.getElementById('cancel-new-essay').addEventListener('click', () => {
            this.hideNewEssayModal();
        });

        document.querySelector('.modal-close').addEventListener('click', () => {
            this.hideNewEssayModal();
        });

        document.getElementById('new-essay-modal').addEventListener('click', (e) => {
            if (e.target.id === 'new-essay-modal') {
                this.hideNewEssayModal();
            }
        });

        document.getElementById('create-essay').addEventListener('click', () => {
            this.createNewEssay();
        });

        // View mode toggles
        document.getElementById('grid-view').addEventListener('click', () => {
            this.setViewMode('grid');
        });

        document.getElementById('list-view').addEventListener('click', () => {
            this.setViewMode('list');
        });

        // Enter key in title input
        document.getElementById('essay-title-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createNewEssay();
            }
        });
    }

    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('darkMode', this.isDarkMode);
        this.setupTheme();
    }

    setupViewMode() {
        const gridBtn = document.getElementById('grid-view');
        const listBtn = document.getElementById('list-view');
        const essaysGrid = document.getElementById('essays-grid');

        if (this.viewMode === 'list') {
            gridBtn.classList.remove('active');
            listBtn.classList.add('active');
            essaysGrid.classList.add('list-view');
        } else {
            gridBtn.classList.add('active');
            listBtn.classList.remove('active');
            essaysGrid.classList.remove('list-view');
        }
    }

    setViewMode(mode) {
        this.viewMode = mode;
        localStorage.setItem('viewMode', mode);
        this.setupViewMode();
    }

    async loadEssays() {
        try {
            const response = await fetch('/api/essays');
            const essays = await response.json();
            
            const essaysGrid = document.getElementById('essays-grid');
            const emptyState = document.getElementById('empty-state');

            if (essays.length === 0) {
                essaysGrid.style.display = 'none';
                emptyState.style.display = 'flex';
                return;
            }

            essaysGrid.style.display = 'grid';
            emptyState.style.display = 'none';
            essaysGrid.innerHTML = '';

            essays.forEach(essay => {
                const essayCard = this.createEssayCard(essay);
                essaysGrid.appendChild(essayCard);
            });

        } catch (error) {
            console.error('Failed to load essays:', error);
            this.showNotification('Failed to load essays', 'error');
        }
    }

    createEssayCard(essay) {
        const card = document.createElement('div');
        card.className = 'essay-card';
        
        // Generate preview image from content
        const previewImage = this.generatePreviewImage(essay.content, essay.title);
        
        // Extract preview text
        const previewText = this.extractPreviewText(essay.content);
        
        // Format date
        const date = new Date(essay.updated_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        card.innerHTML = `
            <div class="essay-preview" data-essay-id="${essay.id}">
                ${previewImage}
            </div>
            <div class="essay-info" data-essay-id="${essay.id}">
                <h3 class="essay-title">${essay.title}</h3>
                <p class="essay-preview-text">${previewText}</p>
                <div class="essay-meta">
                    <span class="essay-date">
                        <i class="fas fa-calendar"></i> ${date}
                    </span>
                    <span class="essay-words">
                        <i class="fas fa-file-text"></i> ${this.countWords(essay.content)} words
                    </span>
                </div>
            </div>
            <div class="essay-actions">
                <button class="btn btn-primary btn-sm" onclick="essayHome.openEssay(${essay.id})">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-secondary btn-sm" onclick="essayHome.deleteEssay(${essay.id}, '${essay.title.replace(/'/g, "\\'")}'); event.stopPropagation();">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        // Add click handler to the entire card
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking on action buttons
            if (e.target.closest('.essay-actions')) {
                return;
            }
            this.openEssay(essay.id);
        });

        // Add hover effect
        card.style.cursor = 'pointer';

        return card;
    }

    generatePreviewImage(content, title) {
        // Create a canvas-based preview image
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');

        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, 300, 200);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 300, 200);

        // Add some text overlay
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 18px Inter';
        ctx.textAlign = 'center';
        
        // Title
        const titleText = title.length > 25 ? title.substring(0, 25) + '...' : title;
        ctx.fillText(titleText, 150, 60);

        // Content preview
        const textContent = content.replace(/<[^>]*>/g, '').substring(0, 100);
        ctx.font = '12px Inter';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        
        const words = textContent.split(' ');
        let line = '';
        let y = 90;
        
        for (let i = 0; i < Math.min(words.length, 15); i++) {
            const testLine = line + words[i] + ' ';
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > 260 && i > 0) {
                ctx.fillText(line, 150, y);
                line = words[i] + ' ';
                y += 16;
                if (y > 160) break;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, 150, y);

        return `<img src="${canvas.toDataURL()}" alt="Essay preview" class="preview-image">`;
    }

    extractPreviewText(content) {
        const textContent = content.replace(/<[^>]*>/g, '');
        return textContent.length > 120 ? textContent.substring(0, 120) + '...' : textContent;
    }

    countWords(content) {
        const textContent = content.replace(/<[^>]*>/g, '');
        return textContent.trim() ? textContent.trim().split(/\s+/).length : 0;
    }

    showNewEssayModal() {
        document.getElementById('new-essay-modal').style.display = 'block';
        document.getElementById('essay-title-input').focus();
    }

    hideNewEssayModal() {
        document.getElementById('new-essay-modal').style.display = 'none';
        document.getElementById('essay-title-input').value = '';
        document.getElementById('essay-description').value = '';
    }

    async createNewEssay() {
        const title = document.getElementById('essay-title-input').value.trim();
        
        if (!title) {
            this.showNotification('Please enter an essay title', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/essays', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title,
                    content: '<p>Start writing your essay here...</p>'
                }),
            });

            const result = await response.json();
            
            if (result.id) {
                this.hideNewEssayModal();
                this.showNotification('Essay created successfully!', 'success');
                // Redirect to editor
                window.location.href = `index.html?id=${result.id}`;
            } else {
                throw new Error('Failed to create essay');
            }

        } catch (error) {
            console.error('Create essay error:', error);
            this.showNotification('Failed to create essay', 'error');
        }
    }

    openEssay(id) {
        window.location.href = `index.html?id=${id}`;
    }

    async deleteEssay(id, title) {
        if (!confirm(`Are you sure you want to delete "${title}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/essays/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showNotification('Essay deleted successfully', 'success');
                this.loadEssays(); // Reload the grid
            } else {
                throw new Error('Failed to delete essay');
            }

        } catch (error) {
            console.error('Delete essay error:', error);
            this.showNotification('Failed to delete essay', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '1rem 1.5rem',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            zIndex: '1001',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            maxWidth: '300px'
        });

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        notification.style.background = colors[type] || colors.info;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// Initialize the home page
let essayHome;
document.addEventListener('DOMContentLoaded', () => {
    essayHome = new EssayHome();
});