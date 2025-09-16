class DeletedEssaysPage {
    constructor() {
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        this.deletedEssays = [];
        this.init();
    }

    init() {
        this.setupTheme();
        this.setupEventListeners();
        this.loadDeletedEssays();
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

        // Back to home button
        document.getElementById('back-to-home').addEventListener('click', () => {
            window.location.href = '/';
        });

        // Preview modal events
        document.getElementById('close-preview').addEventListener('click', () => {
            this.hidePreviewModal();
        });

        document.getElementById('close-preview-btn').addEventListener('click', () => {
            this.hidePreviewModal();
        });

        document.getElementById('preview-modal').addEventListener('click', (e) => {
            if (e.target.id === 'preview-modal') {
                this.hidePreviewModal();
            }
        });
    }

    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('darkMode', this.isDarkMode);
        this.setupTheme();
    }

    async loadDeletedEssays() {
        try {
            const response = await fetch('/api/essays/deleted');
            if (!response.ok) {
                throw new Error('Failed to load deleted essays');
            }
            
            this.deletedEssays = await response.json();
            this.renderDeletedEssays();
        } catch (error) {
            console.error('Error loading deleted essays:', error);
            this.showNotification('Error loading deleted essays', 'error');
        }
    }

    renderDeletedEssays() {
        const container = document.getElementById('deleted-essays-container');
        const noDeletedEssays = document.getElementById('no-deleted-essays');
        
        if (this.deletedEssays.length === 0) {
            container.style.display = 'none';
            noDeletedEssays.style.display = 'block';
            return;
        }

        container.style.display = 'block';
        noDeletedEssays.style.display = 'none';

        container.innerHTML = this.deletedEssays.map(essay => {
            const deletedDate = new Date(essay.deleted_at).toLocaleDateString();
            const createdDate = new Date(essay.created_at).toLocaleDateString();
            const preview = this.getEssayPreview(essay.content);
            
            return `
                <div class="deleted-essay-card" data-essay-id="${essay.id}">
                    <div class="deleted-essay-header">
                        <h3 class="deleted-essay-title">${this.escapeHtml(essay.title)}</h3>
                        <div class="deleted-essay-meta">
                            <span><i class="fas fa-calendar"></i> Created: ${createdDate}</span>
                            <span><i class="fas fa-trash"></i> Deleted: ${deletedDate}</span>
                            ${essay.tags ? `<span><i class="fas fa-tags"></i> ${essay.tags}</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="deleted-essay-preview">
                        <div class="preview-text">${preview}</div>
                        <button class="btn-preview" onclick="deletedPage.showPreview(${essay.id})">
                            <i class="fas fa-eye"></i> Full Preview
                        </button>
                    </div>
                    
                    <div class="deleted-essay-actions">
                        <button class="btn btn-success" onclick="deletedPage.restoreEssay(${essay.id})">
                            <i class="fas fa-undo"></i> Restore
                        </button>
                        <button class="btn btn-danger" onclick="deletedPage.permanentlyDeleteEssay(${essay.id})">
                            <i class="fas fa-trash"></i> Delete Forever
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    getEssayPreview(content) {
        // Remove HTML tags and get first 200 characters
        const textContent = content.replace(/<[^>]*>/g, '').trim();
        return textContent.length > 200 
            ? textContent.substring(0, 200) + '...' 
            : textContent || 'No content available';
    }

    showPreview(essayId) {
        const essay = this.deletedEssays.find(e => e.id === essayId);
        if (!essay) return;

        document.getElementById('preview-title').textContent = essay.title;
        document.getElementById('preview-content').innerHTML = essay.content || 'No content available';
        document.getElementById('preview-modal').style.display = 'flex';
    }

    hidePreviewModal() {
        document.getElementById('preview-modal').style.display = 'none';
    }

    async restoreEssay(essayId) {
        if (!confirm('Are you sure you want to restore this essay?')) {
            return;
        }

        try {
            const response = await fetch(`/api/essays/${essayId}/restore`, {
                method: 'PUT'
            });

            if (response.ok) {
                this.showNotification('Essay restored successfully', 'success');
                // Remove the essay from the list
                this.deletedEssays = this.deletedEssays.filter(essay => essay.id !== essayId);
                this.renderDeletedEssays();
            } else {
                this.showNotification('Error restoring essay', 'error');
            }
        } catch (error) {
            console.error('Error restoring essay:', error);
            this.showNotification('Error restoring essay', 'error');
        }
    }

    async permanentlyDeleteEssay(essayId) {
        if (!confirm('Are you sure you want to permanently delete this essay? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/api/essays/${essayId}/permanent`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showNotification('Essay permanently deleted', 'success');
                // Remove the essay from the list
                this.deletedEssays = this.deletedEssays.filter(essay => essay.id !== essayId);
                this.renderDeletedEssays();
            } else {
                this.showNotification('Error deleting essay', 'error');
            }
        } catch (error) {
            console.error('Error deleting essay:', error);
            this.showNotification('Error deleting essay', 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

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

// Initialize the deleted essays page
let deletedPage;
document.addEventListener('DOMContentLoaded', () => {
    deletedPage = new DeletedEssaysPage();
});