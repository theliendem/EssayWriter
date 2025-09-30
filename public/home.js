class EssayHome {
    constructor() {
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        this.viewMode = localStorage.getItem('viewMode') || 'grid';
        this.allEssays = [];
        this.filteredEssays = [];
        this.searchTimeout = null;
        this.currentTags = [];
        this.allTags = [];
        this.init();
    }

    init() {
        this.setupTheme();
        this.setupEventListeners();
        this.loadEssays();
        this.loadTags();
        this.setupViewMode();
        this.setupTagsInput();
        this.setupDatabaseStatus();
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

        // Search functionality
        const searchInput = document.getElementById('search-input');
        const clearSearchBtn = document.getElementById('clear-search');
        const searchSuggestions = document.getElementById('search-suggestions');

        searchInput.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim()) {
                this.handleSearch(searchInput.value);
            }
        });

        searchInput.addEventListener('blur', () => {
            // Delay hiding suggestions to allow clicking on them
            setTimeout(() => {
                searchSuggestions.style.display = 'none';
            }, 200);
        });

        clearSearchBtn.addEventListener('click', () => {
            this.clearSearch();
        });

        // Handle escape key to clear search
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearSearch();
            }
        });

        // Recently deleted button
        document.getElementById('recently-deleted-btn').addEventListener('click', () => {
            window.location.href = '/deleted.html';
        });

        // Database status click
        document.getElementById('database-status').addEventListener('click', () => {
            this.triggerSync();
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

            // Store all essays for search functionality
            this.allEssays = essays;
            this.filteredEssays = essays;

            // Display essays using the new method
            this.displayEssays(essays);

        } catch (error) {
            console.error('Failed to load essays:', error);
            this.showNotification('Failed to load essays', 'error');
        }
    }

    async loadTags() {
        try {
            const response = await fetch('/api/tags');
            this.allTags = await response.json();
        } catch (error) {
            console.error('Failed to load tags:', error);
            this.allTags = [];
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

        // Format tags
        const tags = essay.tags ? essay.tags.split(',').filter(tag => tag.trim()) : [];
        const tagsHtml = tags.length > 0 ? `
            <div class="essay-tags">
                ${tags.map(tag => `<span class="essay-tag clickable" data-tag="${tag.trim()}">${tag.trim()}</span>`).join('')}
            </div>
        ` : '';

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
                <div class="action-buttons">
                    <button class="btn btn-primary btn-sm" onclick="essayHome.openEssay(${essay.id})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="essayHome.deleteEssay(${essay.id}, '${essay.title.replace(/'/g, "\\'")}'); event.stopPropagation();">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="action-tags">
                    ${tagsHtml}
                </div>
            </div>
        `;

        // Add click handler to the entire card
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking on action buttons or tags
            if (e.target.closest('.essay-actions') || e.target.closest('.essay-tag')) {
                return;
            }
            this.openEssay(essay.id);
        });

        // Add click handlers for tags after the card is added to DOM
        setTimeout(() => {
            card.querySelectorAll('.essay-tag').forEach(tagElement => {
                tagElement.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const tagName = tagElement.getAttribute('data-tag');
                    this.searchByTag(tagName);
                });
            });
        }, 0);

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
        document.getElementById('essay-prompt').value = '';
        this.clearTagsInput();
    }

    setupTagsInput() {
        const tagsInput = document.getElementById('essay-tags-input');
        const tagsWrapper = document.getElementById('tags-input-wrapper');
        const tagsSuggestions = document.getElementById('tags-suggestions');

        if (!tagsInput) return; // Modal might not be loaded yet

        tagsInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                this.addTag(tagsInput.value.trim());
                tagsInput.value = '';
                tagsSuggestions.style.display = 'none';
            } else if (e.key === 'Backspace' && tagsInput.value === '' && this.currentTags.length > 0) {
                this.removeTag(this.currentTags.length - 1);
            }
        });

        tagsInput.addEventListener('input', (e) => {
            this.showTagSuggestions(e.target.value);
        });

        tagsInput.addEventListener('blur', () => {
            setTimeout(() => {
                tagsSuggestions.style.display = 'none';
            }, 200);
        });
    }

    addTag(tagName) {
        if (!tagName || this.currentTags.includes(tagName)) return;

        this.currentTags.push(tagName);
        this.renderTags();
    }

    removeTag(index) {
        this.currentTags.splice(index, 1);
        this.renderTags();
    }

    renderTags() {
        const tagsWrapper = document.getElementById('tags-input-wrapper');
        const tagsInput = document.getElementById('essay-tags-input');

        // Remove existing tag chips
        tagsWrapper.querySelectorAll('.tag-chip').forEach(chip => chip.remove());

        // Add current tags
        this.currentTags.forEach((tag, index) => {
            const tagChip = document.createElement('div');
            tagChip.className = 'tag-chip';
            tagChip.innerHTML = `
                ${tag}
                <button type="button" class="remove-tag" onclick="essayHome.removeTag(${index})">
                    <i class="fas fa-times"></i>
                </button>
            `;
            tagsWrapper.insertBefore(tagChip, tagsInput);
        });
    }

    showTagSuggestions(input) {
        const tagsSuggestions = document.getElementById('tags-suggestions');

        if (!input.trim()) {
            tagsSuggestions.style.display = 'none';
            return;
        }

        const suggestions = this.allTags.filter(tag =>
            tag.toLowerCase().includes(input.toLowerCase()) &&
            !this.currentTags.includes(tag)
        ).slice(0, 5);

        if (suggestions.length === 0) {
            tagsSuggestions.style.display = 'none';
            return;
        }

        tagsSuggestions.innerHTML = suggestions.map(tag =>
            `<div class="tag-suggestion" onclick="essayHome.selectTagSuggestion('${tag}')">${tag}</div>`
        ).join('');

        tagsSuggestions.style.display = 'block';
    }

    selectTagSuggestion(tag) {
        this.addTag(tag);
        document.getElementById('essay-tags-input').value = '';
        document.getElementById('tags-suggestions').style.display = 'none';
    }

    clearTagsInput() {
        this.currentTags = [];
        this.renderTags();
    }

    async createNewEssay() {
        const title = document.getElementById('essay-title-input').value.trim();
        const prompt = document.getElementById('essay-prompt').value.trim();

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
                    content: '<p placeholder="Start writing your essay here..."></p>',
                    prompt,
                    tags: this.currentTags
                }),
            });

            const result = await response.json();

            if (result.id) {
                this.hideNewEssayModal();
                this.showNotification('Essay created successfully!', 'success');
                // Reload tags list
                this.loadTags();
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

    handleSearch(query) {
        const searchInput = document.getElementById('search-input');
        const clearSearchBtn = document.getElementById('clear-search');
        const searchSuggestions = document.getElementById('search-suggestions');

        // Show/hide clear button
        if (query.trim()) {
            clearSearchBtn.style.display = 'block';
        } else {
            clearSearchBtn.style.display = 'none';
            searchSuggestions.style.display = 'none';
            this.displayEssays(this.allEssays);
            return;
        }

        // Debounce search
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.performSearch(query.trim());
        }, 300);
    }

    performSearch(query) {
        if (!query) {
            this.displayEssays(this.allEssays);
            return;
        }

        const results = this.searchEssays(query);
        this.displaySearchResults(results);
        this.showSearchSuggestions(results.slice(0, 5), query);
    }

    searchEssays(query) {
        const lowerQuery = query.toLowerCase();
        const results = [];

        // Check if this is a tag search
        const tagMatch = lowerQuery.match(/^tag:(.+)$/);
        if (tagMatch) {
            const searchTag = tagMatch[1].trim();
            this.allEssays.forEach(essay => {
                if (essay.tags) {
                    const essayTags = essay.tags.toLowerCase().split(',').map(tag => tag.trim());
                    if (essayTags.includes(searchTag)) {
                        results.push({ essay, score: 100, matchType: 'tag' });
                    }
                }
            });
            return results;
        }

        const searchTerms = lowerQuery.split(/\s+/).filter(term => term.length > 0);

        // Check if query looks like a date
        const dateQuery = this.parseSearchDate(query);

        this.allEssays.forEach(essay => {
            const score = this.calculateSearchScore(essay, searchTerms, dateQuery);
            if (score > 0) {
                results.push({ essay, score, matchType: this.getMatchType(essay, searchTerms, dateQuery) });
            }
        });

        // Sort by score (highest first)
        results.sort((a, b) => b.score - a.score);
        return results;
    }

    calculateSearchScore(essay, searchTerms, dateQuery) {
        let score = 0;
        const title = essay.title.toLowerCase();
        const content = this.stripHtml(essay.content).toLowerCase();
        const prompt = (essay.prompt || '').toLowerCase();

        // Date matching (highest priority)
        if (dateQuery) {
            const essayDate = new Date(essay.updated_at);

            if (dateQuery.type === 'specific') {
                const daysDiff = Math.abs((essayDate - dateQuery.date) / (1000 * 60 * 60 * 24));
                if (daysDiff <= 1) score += 100; // Same day
                else if (daysDiff <= 7) score += 80; // Same week
                else if (daysDiff <= 30) score += 60; // Same month
                else if (daysDiff <= 90) score += 40; // Same quarter
            } else if (dateQuery.type === 'year') {
                if (essayDate.getFullYear() === dateQuery.year) {
                    score += 100; // Same year
                }
            } else if (dateQuery.type === 'month') {
                if (essayDate.getMonth() === dateQuery.month) {
                    score += 100; // Same month (any year)
                }
            } else if (dateQuery.type === 'monthYear') {
                if (essayDate.getFullYear() === dateQuery.year && essayDate.getMonth() === dateQuery.month) {
                    score += 100; // Same month and year
                }
            }
        }

        // Title matching (high priority)
        searchTerms.forEach(term => {
            if (title.includes(term)) {
                if (title.startsWith(term)) score += 50; // Title starts with term
                else if (title.split(/\s+/).some(word => word.startsWith(term))) score += 40; // Word starts with term
                else score += 30; // Contains term
            }
        });

        // Content matching (medium priority)
        searchTerms.forEach(term => {
            const contentMatches = (content.match(new RegExp(term, 'gi')) || []).length;
            score += contentMatches * 10;
        });

        // Prompt matching (medium priority)
        searchTerms.forEach(term => {
            if (prompt.includes(term)) {
                score += 15;
            }
        });

        return score;
    }

    getMatchType(essay, searchTerms, dateQuery) {
        if (dateQuery) return 'date';

        const title = essay.title.toLowerCase();
        const hasTitle = searchTerms.some(term => title.includes(term));

        if (hasTitle) return 'title';

        const content = this.stripHtml(essay.content).toLowerCase();
        const hasContent = searchTerms.some(term => content.includes(term));

        if (hasContent) return 'content';

        const prompt = (essay.prompt || '').toLowerCase();
        const hasPrompt = searchTerms.some(term => prompt.includes(term));

        if (hasPrompt) return 'prompt';

        return 'other';
    }

    parseSearchDate(query) {
        const lowerQuery = query.toLowerCase().trim();

        // Try to parse various date formats
        const datePatterns = [
            /(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // MM/DD/YYYY
            /(\d{4})-(\d{1,2})-(\d{1,2})/,   // YYYY-MM-DD
            /(\d{1,2})-(\d{1,2})-(\d{4})/,   // MM-DD-YYYY
        ];

        for (const pattern of datePatterns) {
            const match = query.match(pattern);
            if (match) {
                const [, p1, p2, p3] = match;
                // Try different interpretations
                const dates = [
                    new Date(p3, p1 - 1, p2), // MM/DD/YYYY
                    new Date(p1, p2 - 1, p3), // YYYY-MM-DD
                ];

                for (const date of dates) {
                    if (!isNaN(date.getTime())) {
                        return { type: 'specific', date: date };
                    }
                }
            }
        }

        // Check for year only (e.g., "2025", "2024")
        const yearPattern = /^\d{4}$/;
        if (yearPattern.test(lowerQuery)) {
            const year = parseInt(lowerQuery);
            if (year >= 1900 && year <= 2100) {
                return { type: 'year', year: year };
            }
        }

        // Check for month names (case-insensitive)
        const monthNames = {
            'january': 0, 'jan': 0,
            'february': 1, 'feb': 1,
            'march': 2, 'mar': 2,
            'april': 3, 'apr': 3,
            'may': 4,
            'june': 5, 'jun': 5,
            'july': 6, 'jul': 6,
            'august': 7, 'aug': 7,
            'september': 8, 'sep': 8, 'sept': 8,
            'october': 9, 'oct': 9,
            'november': 10, 'nov': 10,
            'december': 11, 'dec': 11
        };

        // Check for month name only
        for (const [monthName, monthIndex] of Object.entries(monthNames)) {
            if (lowerQuery === monthName) {
                return { type: 'month', month: monthIndex };
            }
        }

        // Check for month + year (e.g., "september 2024", "sep 2024")
        const monthYearPattern = /^(\w+)\s+(\d{4})$/;
        const monthYearMatch = lowerQuery.match(monthYearPattern);
        if (monthYearMatch) {
            const [, monthStr, yearStr] = monthYearMatch;
            const month = monthNames[monthStr];
            const year = parseInt(yearStr);
            if (month !== undefined && year >= 1900 && year <= 2100) {
                return { type: 'monthYear', month: month, year: year };
            }
        }

        // Try natural language dates
        const today = new Date();

        if (lowerQuery.includes('today')) return { type: 'specific', date: today };
        if (lowerQuery.includes('yesterday')) {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            return { type: 'specific', date: yesterday };
        }
        if (lowerQuery.includes('last week')) {
            const lastWeek = new Date(today);
            lastWeek.setDate(lastWeek.getDate() - 7);
            return { type: 'specific', date: lastWeek };
        }

        return null;
    }

    displaySearchResults(results) {
        this.filteredEssays = results.map(r => r.essay);
        this.displayEssays(this.filteredEssays);
    }

    showSearchSuggestions(results, query) {
        const searchSuggestions = document.getElementById('search-suggestions');

        if (results.length === 0) {
            searchSuggestions.innerHTML = '<div class="search-no-results">No essays found</div>';
            searchSuggestions.style.display = 'block';
            return;
        }

        const suggestionsHtml = results.map(result => {
            const { essay, matchType } = result;
            const date = new Date(essay.updated_at).toLocaleDateString();
            const typeLabel = {
                'title': 'Title',
                'content': 'Content',
                'prompt': 'Prompt',
                'date': 'Date',
                'tag': 'Tag',
                'other': 'Match'
            }[matchType];

            const highlightedTitle = this.highlightSearchTerms(essay.title, query);

            return `
                <div class="search-suggestion" data-essay-id="${essay.id}">
                    <div class="search-suggestion-title">${highlightedTitle}</div>
                    <div class="search-suggestion-meta">
                        <span class="search-suggestion-type">${typeLabel}</span>
                        <span class="search-suggestion-date">${date}</span>
                        <span>${this.countWords(essay.content)} words</span>
                    </div>
                </div>
            `;
        }).join('');

        searchSuggestions.innerHTML = suggestionsHtml;
        searchSuggestions.style.display = 'block';

        // Add click handlers to suggestions
        searchSuggestions.querySelectorAll('.search-suggestion').forEach(suggestion => {
            suggestion.addEventListener('click', () => {
                const essayId = suggestion.dataset.essayId;
                this.openEssay(essayId);
            });
        });
    }

    highlightSearchTerms(text, query) {
        const terms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
        let highlighted = text;

        terms.forEach(term => {
            const regex = new RegExp(`(${term})`, 'gi');
            highlighted = highlighted.replace(regex, '<span class="search-highlight">$1</span>');
        });

        return highlighted;
    }

    searchByTag(tagName) {
        const searchInput = document.getElementById('search-input');
        searchInput.value = `tag:${tagName}`;
        this.handleSearch(`tag:${tagName}`);
    }

    clearSearch() {
        const searchInput = document.getElementById('search-input');
        const clearSearchBtn = document.getElementById('clear-search');
        const searchSuggestions = document.getElementById('search-suggestions');

        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        searchSuggestions.style.display = 'none';

        this.displayEssays(this.allEssays);
        searchInput.blur();
    }

    displayEssays(essays) {
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
    }

    stripHtml(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent || temp.innerText || '';
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


    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Database Status Methods
    async setupDatabaseStatus() {
        await this.updateDatabaseStatus();
        // Update status every 30 seconds
        setInterval(() => {
            this.updateDatabaseStatus();
        }, 30000);
    }

    async updateDatabaseStatus() {
        try {
            const response = await fetch('/api/database/status');
            const status = await response.json();

            const statusElement = document.getElementById('database-status');
            const statusText = document.getElementById('status-text');
            const statusIcon = statusElement.querySelector('i');

            // Remove all status classes
            statusElement.className = 'database-status';

            if (status.cloudAvailable) {
                statusElement.classList.add('connected');
                statusIcon.className = 'fas fa-sync-alt';
                statusText.textContent = 'Synced';
                statusElement.title = 'Local database with cloud sync';
            } else {
                statusElement.classList.add('local');
                statusIcon.className = 'fas fa-laptop';
                statusText.textContent = 'Local';
                statusElement.title = 'Local database only (cloud unavailable)';
            }

            if (status.syncInProgress) {
                statusElement.classList.add('syncing');
                statusIcon.className = 'fas fa-sync-alt';
                statusText.textContent = 'Syncing...';
                statusElement.title = 'Syncing data to cloud...';
            }

        } catch (error) {
            console.error('Failed to update database status:', error);
            const statusElement = document.getElementById('database-status');
            const statusText = document.getElementById('status-text');
            const statusIcon = statusElement.querySelector('i');

            statusElement.className = 'database-status error';
            statusIcon.className = 'fas fa-exclamation-triangle';
            statusText.textContent = 'Error';
            statusElement.title = 'Database connection error';
        }
    }

    async triggerSync() {
        const statusElement = document.getElementById('database-status');
        const statusText = document.getElementById('status-text');
        const statusIcon = statusElement.querySelector('i');

        // Show syncing state
        statusElement.className = 'database-status syncing';
        statusIcon.className = 'fas fa-sync-alt';
        statusText.textContent = 'Syncing...';

        try {
            const response = await fetch('/api/database/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                if (result.message && result.message.includes('Already using cloud database')) {
                    this.showNotification('Already connected to cloud database - all changes are automatically saved!', 'success');
                } else {
                    this.showNotification('Sync completed successfully!', 'success');
                }
                await this.updateDatabaseStatus();
            } else {
                throw new Error(result.error || 'Sync failed');
            }

        } catch (error) {
            console.error('Sync failed:', error);
            this.showNotification('Sync failed: ' + error.message, 'error');
            await this.updateDatabaseStatus();
        }
    }
}

// Initialize the home page
let essayHome;
document.addEventListener('DOMContentLoaded', () => {
    essayHome = new EssayHome();
});