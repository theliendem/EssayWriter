class EssayPlatform {
    constructor() {
        this.currentEssayId = null;
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
        this.isResizing = false;
        this.lastSavedContent = null;
        this.lastVersionContent = null;
        this.versionHistoryInterval = null;
        this.versionSaveTimeout = null;
        this.isSaving = false;
        this.selectedVersion = null;
        this.versions = [];
        this.versionPage = 0;
        this.versionHasMore = true;
        this.versionLoading = false;
        this.sessionGroups = [];
        this.chatHistory = [];
        this.selectionTimeout = null;
        this.init();
    }

    // Helper function to properly handle timezone conversion
    parseTimestamp(timestamp) {
        // Create date object from timestamp
        const date = new Date(timestamp);

        // If the timestamp doesn't include timezone info, SQLite CURRENT_TIMESTAMP is UTC
        // We need to check if this is a UTC timestamp and handle it properly
        if (typeof timestamp === 'string' && !timestamp.includes('T') && !timestamp.includes('Z')) {
            // SQLite format: "YYYY-MM-DD HH:MM:SS" - this is UTC
            return new Date(timestamp + 'Z'); // Add Z to indicate UTC
        }

        return date;
    }

    init() {
        this.setupEventListeners();
        this.setupTheme();
        this.updateStats();
        this.setupEditor();
        this.setupResizing();
        this.initializeChatPanel();
        this.initializeCarousel();

        // Initialize format buttons
        setTimeout(() => {
            this.updateFormatButtons();
        }, 100);

        // Ensure DOM is ready before loading essay
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.loadEssayFromURL();
            });
        } else {
            this.loadEssayFromURL();
        }
    }

    setupEventListeners() {
        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Navigation
        document.getElementById('load-btn').addEventListener('click', () => {
            window.location.href = 'home.html';
        });

        // Version history
        document.getElementById('version-history-btn').addEventListener('click', () => {
            this.showVersionHistory();
        });

        // Editor events
        const editor = document.getElementById('editor');
        editor.addEventListener('input', () => {
            this.updateStats();
            this.updateFormatButtons(); // Update format buttons on input
        });

        editor.addEventListener('mouseup', () => {
            this.updateSelectionStats();
            this.updateFormatButtons(); // Update format buttons on selection change
        });

        editor.addEventListener('keyup', (e) => {
            this.updateSelectionStats();
            this.updateFormatButtons(); // Update format buttons on key events

            // Also update on arrow keys and other navigation keys
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
                this.updateFormatButtons();
            }
        });

        // Update format buttons when selection changes
        editor.addEventListener('selectionchange', () => {
            this.updateFormatButtons();
            this.updateSelectionStats();
        });

        // Update format buttons when editor gains focus
        editor.addEventListener('focus', () => {
            this.updateFormatButtons();
            this.updateSelectionStats();
        });

        // Global selection change listener for better cross-browser support
        document.addEventListener('selectionchange', () => {
            // Only update if the selection is within the editor
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const editorElement = document.getElementById('editor');
                if (editorElement.contains(range.commonAncestorContainer) ||
                    range.commonAncestorContainer === editorElement) {
                    this.updateFormatButtons();
                    this.updateSelectionStats();
                }
            } else {
                // No selection, show regular stats
                this.updateStats();
            }
        });

        // Additional events for comprehensive selection tracking
        editor.addEventListener('mousedown', () => {
            // Clear any existing timeout when starting a new selection
            if (this.selectionTimeout) {
                clearTimeout(this.selectionTimeout);
                this.selectionTimeout = null;
            }
        });

        editor.addEventListener('touchstart', () => {
            this.updateSelectionStats();
        });

        editor.addEventListener('touchend', () => {
            this.updateSelectionStats();
        });

        // Handle double-click and triple-click selections
        editor.addEventListener('dblclick', () => {
            setTimeout(() => this.updateSelectionStats(), 10);
        });

        // Handle Ctrl+A (select all)
        editor.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                setTimeout(() => this.updateSelectionStats(), 10);
            }
        });

        // Formatting buttons - prevent focus loss
        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent focus loss from editor
            });

            btn.addEventListener('click', (e) => {
                const command = e.target.closest('.format-btn').dataset.command;
                this.formatText(command);
            });
        });

        // Heading select
        document.getElementById('heading-select').addEventListener('change', (e) => {
            this.applyHeading(e.target.value);
        });

        // Chat functionality
        document.getElementById('send-chat').addEventListener('click', () => {
            this.sendChatMessage();
        });

        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });

        // Quick action buttons (both old and new styles)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-action-btn') || e.target.classList.contains('quick-action-chip')) {
                const prompt = e.target.dataset.prompt;
                this.populateQuickAction(prompt);
            }
        });

        // Carousel navigation
        document.getElementById('carousel-prev').addEventListener('click', () => {
            this.scrollCarousel('prev');
        });

        document.getElementById('carousel-next').addEventListener('click', () => {
            this.scrollCarousel('next');
        });

        // Clear chat button
        document.getElementById('clear-chat').addEventListener('click', () => {
            this.clearChat();
        });

        // Chat toggle button
        document.getElementById('chat-toggle').addEventListener('click', () => {
            this.toggleChatPanel();
        });

        // Chat reopen button
        document.getElementById('chat-reopen-btn').addEventListener('click', () => {
            this.toggleChatPanel();
        });

        // AI Tools
        document.getElementById('ai-detector-btn').addEventListener('click', () => {
            this.runAIDetector();
        });

        document.getElementById('humanizer-btn').addEventListener('click', () => {
            this.runHumanizer();
        });



        // Home navigation
        document.getElementById('home-link').addEventListener('click', () => {
            window.location.href = 'home.html';
        });

        // Modal events
        document.querySelector('.modal-close').addEventListener('click', () => {
            this.hideLoadModal();
        });

        document.getElementById('load-modal').addEventListener('click', (e) => {
            if (e.target.id === 'load-modal') {
                this.hideLoadModal();
            }
        });

        // Version history modal events
        document.getElementById('version-modal-close').addEventListener('click', () => {
            this.hideVersionHistory();
        });

        document.getElementById('version-history-modal').addEventListener('click', (e) => {
            if (e.target.id === 'version-history-modal') {
                this.hideVersionHistory();
            }
        });

        document.getElementById('restore-version-btn').addEventListener('click', () => {
            this.restoreVersion();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Override Cmd/Ctrl+S to save essay instead of browser save
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                this.saveEssay();
                return;
            }

            // Formatting shortcuts - only when editor is focused
            if (document.getElementById('editor').contains(document.activeElement) ||
                document.activeElement === document.getElementById('editor')) {

                if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
                    e.preventDefault();
                    this.formatText('bold');
                    // Update buttons after a short delay to ensure command is processed
                    setTimeout(() => this.updateFormatButtons(), 10);
                    return;
                }

                if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
                    e.preventDefault();
                    this.formatText('italic');
                    // Update buttons after a short delay to ensure command is processed
                    setTimeout(() => this.updateFormatButtons(), 10);
                    return;
                }

                if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
                    e.preventDefault();
                    this.formatText('underline');
                    // Update buttons after a short delay to ensure command is processed
                    setTimeout(() => this.updateFormatButtons(), 10);
                    return;
                }
            }
        });
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

    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('darkMode', this.isDarkMode);
        this.setupTheme();
    }

    setupEditor() {
        const editor = document.getElementById('editor');
        const titleInput = document.getElementById('essay-title');

        // Instant autosave on every change
        let saveTimeout;
        const autoSave = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                if (this.currentEssayId && this.hasUnsavedChanges()) {
                    this.saveEssay(true); // Silent save
                }
            }, 500); // Save 500ms after user stops typing
        };

        editor.addEventListener('input', autoSave);
        titleInput.addEventListener('input', autoSave);

        // Version history - save snapshot after 5 seconds of inactivity
        const scheduleVersionSave = () => {
            clearTimeout(this.versionSaveTimeout);
            this.versionSaveTimeout = setTimeout(() => {
                if (this.currentEssayId && this.hasVersionChanges()) {
                    this.saveVersionSnapshot();
                }
            }, 5000); // 5 seconds after last change
        };

        // Schedule version save on content changes
        editor.addEventListener('input', scheduleVersionSave);
        titleInput.addEventListener('input', scheduleVersionSave);

        // Auto-save before page unload
        window.addEventListener('beforeunload', (e) => {
            if (this.currentEssayId && this.hasUnsavedChanges() && !this.isSaving) {
                // Try to save synchronously
                this.saveEssay(true);
            }
        });

        // Additional save attempt on page visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && this.currentEssayId && this.hasUnsavedChanges() && !this.isSaving) {
                this.saveEssay(true);
            }
        });
    }

    updateStats() {
        const editor = document.getElementById('editor');
        const text = editor.innerText || '';

        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const characters = text.length;
        const sentences = text.trim() ? text.split(/[.!?]+/).filter(s => s.trim()).length : 0;
        const paragraphs = text.trim() ? text.split(/\n\s*\n/).filter(p => p.trim()).length : 0;

        document.getElementById('word-count').textContent = words;
        document.getElementById('char-count').textContent = characters;
        document.getElementById('sentence-count').textContent = sentences;
        document.getElementById('paragraph-count').textContent = paragraphs;
    }

    updateSelectionStats() {
        const selection = window.getSelection();
        const editor = document.getElementById('editor');
        
        // Clear any existing timeout
        if (this.selectionTimeout) {
            clearTimeout(this.selectionTimeout);
            this.selectionTimeout = null;
        }

        // Check if we have a selection within the editor
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const isInEditor = editor.contains(range.commonAncestorContainer) || 
                             range.commonAncestorContainer === editor;
            
            if (isInEditor) {
                const selectedText = selection.toString();
                
                if (selectedText.trim()) {
                    // Calculate selection stats
                    const trimmedText = selectedText.trim();
                    const words = trimmedText ? trimmedText.split(/\s+/).length : 0;
                    const characters = selectedText.length;
                    const charactersNoSpaces = selectedText.replace(/\s/g, '').length;
                    
                    // More accurate sentence counting
                    const sentences = trimmedText ? 
                        trimmedText.split(/[.!?]+/).filter(s => s.trim().length > 0).length : 0;
                    
                    // More accurate paragraph counting - handle both line breaks and HTML paragraphs
                    let paragraphs = 0;
                    if (trimmedText) {
                        // Count by double line breaks first
                        const byLineBreaks = trimmedText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
                        paragraphs = Math.max(1, byLineBreaks.length);
                    }

                    // Update stats with selection info
                    document.getElementById('word-count').textContent = `${words} selected`;
                    document.getElementById('char-count').textContent = `${characters} selected`;
                    document.getElementById('sentence-count').textContent = `${sentences} selected`;
                    document.getElementById('paragraph-count').textContent = `${paragraphs} selected`;

                    // Add visual indicator that these are selection stats
                    this.addSelectionIndicator();

                    // Set timeout to reset stats when selection is likely done
                    this.selectionTimeout = setTimeout(() => {
                        // Double-check if selection still exists before resetting
                        const currentSelection = window.getSelection();
                        if (!currentSelection.toString().trim()) {
                            this.updateStats();
                            this.removeSelectionIndicator();
                        }
                    }, 2000);

                    return; // Exit early since we're showing selection stats
                }
            }
        }

        // No valid selection, show regular document stats
        this.updateStats();
        this.removeSelectionIndicator();
    }

    addSelectionIndicator() {
        // Add a visual indicator that we're showing selection stats
        const statsContainer = document.querySelector('.stats');
        if (statsContainer && !statsContainer.classList.contains('selection-mode')) {
            statsContainer.classList.add('selection-mode');
        }
    }

    removeSelectionIndicator() {
        // Remove the selection indicator
        const statsContainer = document.querySelector('.stats');
        if (statsContainer) {
            statsContainer.classList.remove('selection-mode');
        }
    }

    formatText(command) {
        // Ensure editor has focus
        const editor = document.getElementById('editor');
        editor.focus();

        // Execute the formatting command
        document.execCommand(command, false, null);

        // Update button states
        this.updateFormatButtons();

        // Keep focus on editor
        editor.focus();
    }

    applyHeading(tag) {
        const editor = document.getElementById('editor');
        editor.focus();

        if (tag) {
            document.execCommand('formatBlock', false, tag);
        } else {
            document.execCommand('formatBlock', false, 'p');
        }

        // Update format buttons after applying heading
        setTimeout(() => {
            this.updateFormatButtons();
        }, 10);

        editor.focus();
    }

    updateFormatButtons() {
        // Update formatting buttons
        document.querySelectorAll('.format-btn').forEach(btn => {
            const command = btn.dataset.command;
            btn.classList.toggle('active', document.queryCommandState(command));
        });

        // Update heading select dropdown
        this.updateHeadingSelect();
    }

    updateHeadingSelect() {
        const headingSelect = document.getElementById('heading-select');
        const selection = window.getSelection();

        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let element = range.commonAncestorContainer;

            // If it's a text node, get its parent element
            if (element.nodeType === Node.TEXT_NODE) {
                element = element.parentElement;
            }

            // Walk up the DOM tree to find a heading or block element
            while (element && element !== document.getElementById('editor')) {
                const tagName = element.tagName ? element.tagName.toLowerCase() : '';

                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                    headingSelect.value = tagName;
                    return;
                }

                element = element.parentElement;
            }
        }

        // Default to normal text if no heading found
        headingSelect.value = '';
    }

    async saveEssay(silent = false) {
        const title = document.getElementById('essay-title').value || 'Untitled Essay';
        const content = document.getElementById('editor').innerHTML;

        this.isSaving = true;
        this.updateAutosaveStatus('saving');

        try {
            const url = this.currentEssayId ? `/api/essays/${this.currentEssayId}` : '/api/essays';
            const method = this.currentEssayId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title, content }),
            });

            const result = await response.json();

            if (!this.currentEssayId) {
                this.currentEssayId = result.id;
                // Save initial version
                this.lastVersionContent = { title, content };
                // Update URL to include essay ID
                const newUrl = new URL(window.location);
                newUrl.searchParams.set('id', result.id);
                window.history.replaceState({}, '', newUrl);
            }

            this.updateAutosaveStatus('saved');

            // Update last saved content for change detection
            this.lastSavedContent = {
                title: title,
                content: content
            };
        } catch (error) {
            console.error('Save error:', error);
            this.updateAutosaveStatus('error');
            if (!silent) {
                this.showNotification('Failed to save essay', 'error');
            }
        } finally {
            this.isSaving = false;
        }
    }

    hasUnsavedChanges() {
        if (!this.lastSavedContent) {
            const title = document.getElementById('essay-title').value || '';
            const content = document.getElementById('editor').innerHTML || '';
            return title.trim() !== '' || content.trim() !== '';
        }

        const currentTitle = document.getElementById('essay-title').value || 'Untitled Essay';
        const currentContent = document.getElementById('editor').innerHTML;

        return (
            currentTitle !== this.lastSavedContent.title ||
            currentContent !== this.lastSavedContent.content
        );
    }

    hasVersionChanges() {
        if (!this.lastVersionContent) {
            return true; // First version
        }

        const currentTitle = document.getElementById('essay-title').value || 'Untitled Essay';
        const currentContent = document.getElementById('editor').innerHTML;

        return (
            currentTitle !== this.lastVersionContent.title ||
            currentContent !== this.lastVersionContent.content
        );
    }

    updateAutosaveStatus(status) {
        const statusElement = document.getElementById('autosave-status');
        const icon = statusElement.querySelector('i');

        statusElement.className = `autosave-status ${status}`;

        switch (status) {
            case 'saving':
                icon.className = 'fas fa-circle-notch fa-spin';
                statusElement.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Saving...';
                break;
            case 'saved':
                // Don't show anything for regular saves - keep it minimal
                icon.className = 'fas fa-circle';
                statusElement.innerHTML = '<i class="fas fa-circle"></i>';
                statusElement.style.opacity = '0.5';
                break;
            case 'version-saved':
                icon.className = 'fas fa-history';
                statusElement.innerHTML = '<i class="fas fa-history"></i> Saved version snapshot';
                statusElement.style.opacity = '1';
                // Hide the message after 3 seconds
                setTimeout(() => {
                    this.updateAutosaveStatus('saved');
                }, 3000);
                break;
            case 'error':
                icon.className = 'fas fa-exclamation-circle';
                statusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Save failed';
                statusElement.style.opacity = '1';
                break;
            default:
                icon.className = 'fas fa-circle';
                statusElement.innerHTML = '<i class="fas fa-circle"></i>';
                statusElement.style.opacity = '0.5';
        }
    }

    async saveVersionSnapshot() {
        if (!this.currentEssayId) return;

        const title = document.getElementById('essay-title').value || 'Untitled Essay';
        const content = document.getElementById('editor').innerHTML;

        try {
            const response = await fetch(`/api/essays/${this.currentEssayId}/versions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title,
                    content,
                    changes_only: this.calculateChanges(content)
                }),
            });

            if (response.ok) {
                this.lastVersionContent = { title, content };
                console.log('Version snapshot saved');
                // Show version snapshot status
                this.updateAutosaveStatus('version-saved');
            }
        } catch (error) {
            console.error('Version save error:', error);
        }
    }

    calculateChanges(newContent) {
        if (!this.lastVersionContent) {
            return 'Initial version';
        }

        const oldWords = this.lastVersionContent.content.replace(/<[^>]*>/g, '').split(/\s+/).length;
        const newWords = newContent.replace(/<[^>]*>/g, '').split(/\s+/).length;
        const wordDiff = newWords - oldWords;

        if (wordDiff > 0) {
            return `+${wordDiff} words`;
        } else if (wordDiff < 0) {
            return `${wordDiff} words`;
        } else {
            return 'Content modified';
        }
    }

    async showVersionHistory() {
        if (!this.currentEssayId) {
            this.showNotification('Please save your essay first', 'warning');
            return;
        }

        console.log('Opening version history for essay ID:', this.currentEssayId);

        // Reset pagination
        this.versionPage = 0;
        this.versionHasMore = true;
        this.versionLoading = false;
        this.versions = [];

        document.getElementById('version-history-modal').style.display = 'block';
        await this.loadVersionHistory();
        this.setupVersionScrolling();
    }

    hideVersionHistory() {
        document.getElementById('version-history-modal').style.display = 'none';
        this.selectedVersion = null;
        document.getElementById('restore-version-btn').disabled = true;

        // Clean up scroll listener
        const versionsList = document.getElementById('versions-list');
        if (versionsList) {
            versionsList.removeEventListener('scroll', this.handleVersionScroll);
        }
    }

    setupVersionScrolling() {
        const versionsList = document.getElementById('versions-list');

        // Remove existing listener to avoid duplicates
        versionsList.removeEventListener('scroll', this.handleVersionScroll);

        // Bind the scroll handler to maintain 'this' context
        this.handleVersionScroll = this.handleVersionScroll.bind(this);
        versionsList.addEventListener('scroll', this.handleVersionScroll);
    }

    handleVersionScroll(e) {
        const container = e.target;
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;

        // Load more when scrolled to within 100px of bottom
        if (scrollTop + clientHeight >= scrollHeight - 100) {
            if (this.versionHasMore && !this.versionLoading) {
                this.loadVersionHistory(true);
            }
        }
    }

    updateLoadingIndicator() {
        const versionsList = document.getElementById('versions-list');

        // Remove existing loading indicator
        const existingIndicator = versionsList.querySelector('.loading-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        // Add loading indicator if there are more versions to load
        if (this.versionHasMore) {
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'loading-indicator';
            loadingIndicator.innerHTML = `
                <div class="loading-content">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>Scroll down to load more versions...</span>
                </div>
            `;
            versionsList.appendChild(loadingIndicator);
        }
    }



    async loadVersionHistory(append = false) {
        if (this.versionLoading || (!this.versionHasMore && append)) {
            return;
        }

        this.versionLoading = true;

        try {
            console.log(`Fetching versions for essay ID: ${this.currentEssayId}, page: ${this.versionPage}`);
            const response = await fetch(`/api/essays/${this.currentEssayId}/versions?page=${this.versionPage}&limit=50`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('API Response:', data); // Debug log

            // Handle both new paginated format and old format for backward compatibility
            let newVersions, hasMore;
            if (data.versions && data.pagination) {
                // New paginated format
                newVersions = data.versions;
                hasMore = data.pagination.hasMore;
            } else if (Array.isArray(data)) {
                // Old format - array of versions
                newVersions = data;
                hasMore = false; // No pagination in old format
            } else {
                newVersions = [];
                hasMore = false;
            }

            this.versionHasMore = hasMore;

            console.log(`Loaded ${newVersions.length} versions (page ${this.versionPage}), hasMore: ${this.versionHasMore}`);

            const versionsList = document.getElementById('versions-list');

            if (!append) {
                // First load - clear list and add current version
                versionsList.innerHTML = '';
                this.versions = [];

                // Add current version at the top
                const currentVersion = {
                    id: 'current',
                    title: document.getElementById('essay-title').value || 'Untitled Essay',
                    content: document.getElementById('editor').innerHTML,
                    created_at: new Date().toISOString(),
                    changes_only: 'Current version'
                };

                this.renderVersionItem(currentVersion, versionsList, true);
            }

            // Add new versions to the array
            this.versions.push(...newVersions);

            // Group all versions by sessions and render
            if (!append) {
                this.renderSessionGroups(versionsList);
            } else {
                // For append, just add new versions to existing structure
                this.renderNewVersions(newVersions, versionsList);
            }

            // Show empty message if no versions exist
            if (this.versions.length === 0 && !append) {
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'version-item empty';
                emptyMessage.innerHTML = '<div class="version-title">No saved versions yet</div><div class="version-changes">Versions are saved 5 seconds after you stop making changes</div>';
                versionsList.appendChild(emptyMessage);
            }

            // Add loading indicator if there are more versions
            this.updateLoadingIndicator();

            this.versionPage++;

        } catch (error) {
            console.error('Load versions error:', error);
            this.showNotification('Failed to load version history', 'error');
        } finally {
            this.versionLoading = false;
        }
    }

    renderSessionGroups(container) {
        // Clear existing content except current version
        const currentVersionElement = container.querySelector('.version-item.current');
        container.innerHTML = '';

        if (currentVersionElement) {
            container.appendChild(currentVersionElement);
        }

        // Group versions by sessions
        const sessions = this.groupVersionsBySessions(this.versions);

        sessions.forEach(session => {
            this.renderSessionGroup(session, container);
        });
    }

    renderNewVersions(newVersions, container) {
        // For appending new versions, add them to the last session or create new ones
        const newSessions = this.groupVersionsBySessions(newVersions);
        newSessions.forEach(session => {
            this.renderSessionGroup(session, container);
        });
    }

    renderSessionGroup(session, container) {
        const sessionElement = document.createElement('div');
        sessionElement.className = 'version-session';

        const startDate = this.parseTimestamp(session.startTime);
        const endDate = this.parseTimestamp(session.endTime);
        const sessionDuration = Math.round((endDate - startDate) / (1000 * 60)); // minutes

        const sessionHeader = document.createElement('div');
        sessionHeader.className = 'session-header';

        // Format date and time in local timezone
        const dateOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
        const timeOptions = {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };

        sessionHeader.innerHTML = `
            <div class="session-info">
                <div class="session-date">${startDate.toLocaleDateString(undefined, dateOptions)} ${startDate.toLocaleTimeString(undefined, timeOptions)}</div>
                <div class="session-summary">${session.versions.length} versions • ${sessionDuration > 0 ? sessionDuration + ' min' : 'Quick edit'}</div>
            </div>
            <i class="fas fa-chevron-down session-toggle"></i>
        `;

        const sessionVersions = document.createElement('div');
        sessionVersions.className = 'session-versions';

        session.versions.forEach(version => {
            this.renderSessionVersionItem(version, sessionVersions);
        });

        sessionHeader.addEventListener('click', () => {
            const toggle = sessionHeader.querySelector('.session-toggle');
            const isExpanded = sessionVersions.classList.contains('expanded');

            if (isExpanded) {
                sessionVersions.classList.remove('expanded');
                toggle.classList.remove('expanded');
            } else {
                sessionVersions.classList.add('expanded');
                toggle.classList.add('expanded');
            }
        });

        sessionElement.appendChild(sessionHeader);
        sessionElement.appendChild(sessionVersions);
        container.appendChild(sessionElement);
    }

    renderSessionVersionItem(version, container) {
        const versionItem = document.createElement('div');
        versionItem.className = 'session-version-item';

        const date = this.parseTimestamp(version.created_at);
        const timeOptions = {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
        const timeString = date.toLocaleTimeString(undefined, timeOptions);

        versionItem.innerHTML = `
            <div class="version-time-small">${timeString}</div>
            <div class="version-changes-small">${version.changes_only || 'No changes recorded'}</div>
        `;

        versionItem.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectVersion(version, versionItem);
        });

        container.appendChild(versionItem);
    }

    renderVersionItem(version, container, isCurrent = false) {
        const versionItem = document.createElement('div');
        versionItem.className = `version-item ${isCurrent ? 'current' : ''}`;

        const date = this.parseTimestamp(version.created_at);
        const dateTimeOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
        const timeString = date.toLocaleString(undefined, dateTimeOptions);

        versionItem.innerHTML = `
            <div class="version-time">${timeString}${isCurrent ? '<span class="version-current-badge">Current</span>' : ''}</div>
            <div class="version-title">${version.title}</div>
            <div class="version-changes">${version.changes_only || 'No changes recorded'}</div>
        `;

        versionItem.addEventListener('click', () => {
            this.selectVersion(version, versionItem);
        });

        container.appendChild(versionItem);
    }

    selectVersion(version, element) {
        // Remove previous selection from both old and new structures
        document.querySelectorAll('.version-item, .session-version-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Select current item
        element.classList.add('selected');
        this.selectedVersion = version;

        // Show preview with proper HTML formatting
        const previewContent = document.getElementById('version-preview-content');

        if (version.id === 'current') {
            // Show current version as-is with full HTML formatting
            previewContent.innerHTML = version.content;
        } else {
            // Show the version content with full HTML formatting preserved
            // For now, we'll show the version content directly to preserve formatting
            // TODO: Implement HTML-aware diff highlighting in the future
            previewContent.innerHTML = version.content;
            
            // Add a subtle indicator that this is a different version
            const versionIndicator = document.createElement('div');
            versionIndicator.className = 'version-indicator';
            versionIndicator.innerHTML = '<small><em>Viewing historical version</em></small>';
            previewContent.insertBefore(versionIndicator, previewContent.firstChild);
        }

        previewContent.classList.remove('empty');

        // Enable restore button (except for current version)
        document.getElementById('restore-version-btn').disabled = version.id === 'current';
    }

    async restoreVersion() {
        if (!this.selectedVersion || this.selectedVersion.id === 'current') {
            return;
        }

        if (!confirm('Are you sure you want to restore this version? Your current changes will be lost.')) {
            return;
        }

        try {
            // Update the editor with the selected version
            document.getElementById('essay-title').value = this.selectedVersion.title;
            document.getElementById('editor').innerHTML = this.selectedVersion.content;

            // Save the restored version
            await this.saveEssay(true);

            this.hideVersionHistory();
            this.showNotification('Version restored successfully!', 'success');
            this.updateStats();

        } catch (error) {
            console.error('Restore version error:', error);
            this.showNotification('Failed to restore version', 'error');
        }
    }





    // Diff highlighting utility - creates visual red/green highlighting
    createDiffHighlight(oldContent, newContent) {
        // Convert HTML to plain text for comparison
        const oldText = this.stripHtml(oldContent);
        const newText = this.stripHtml(newContent);

        // Split into words for granular comparison
        const oldWords = this.splitIntoWords(oldText);
        const newWords = this.splitIntoWords(newText);

        // Compute word-level diff
        const diff = this.computeWordDiff(oldWords, newWords);

        // Render the diff with visual highlighting
        return this.renderVisualDiff(diff);
    }

    stripHtml(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent || temp.innerText || '';
    }

    splitIntoWords(text) {
        // Split text into words and whitespace, preserving both
        return text.split(/(\s+)/).filter(part => part.length > 0);
    }

    computeWordDiff(oldWords, newWords) {
        // Simple LCS-based diff algorithm
        const m = oldWords.length;
        const n = newWords.length;

        // Create DP table for LCS
        const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

        // Fill DP table
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (oldWords[i - 1] === newWords[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        // Backtrack to create diff
        const diff = [];
        let i = m, j = n;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
                // Words match
                diff.unshift({ type: 'equal', word: oldWords[i - 1] });
                i--; j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                // Word was added in new version
                diff.unshift({ type: 'added', word: newWords[j - 1] });
                j--;
            } else if (i > 0) {
                // Word was removed from old version
                diff.unshift({ type: 'removed', word: oldWords[i - 1] });
                i--;
            }
        }

        return diff;
    }

    renderVisualDiff(diff) {
        let result = '';

        diff.forEach(item => {
            switch (item.type) {
                case 'equal':
                    result += this.escapeHtml(item.word);
                    break;
                case 'added':
                    result += `<span class="diff-added">${this.escapeHtml(item.word)}</span>`;
                    break;
                case 'removed':
                    result += `<span class="diff-removed">${this.escapeHtml(item.word)}</span>`;
                    break;
            }
        });

        return result;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Group versions by editing sessions (within 30 minutes of each other)
    groupVersionsBySessions(versions) {
        if (!versions.length) return [];

        const sessions = [];
        let currentSession = null;
        const sessionGapMinutes = 30;

        versions.forEach(version => {
            const versionTime = this.parseTimestamp(version.created_at);

            if (!currentSession ||
                (versionTime - this.parseTimestamp(currentSession.endTime)) > sessionGapMinutes * 60 * 1000) {
                // Start new session
                currentSession = {
                    startTime: version.created_at,
                    endTime: version.created_at,
                    versions: [version],
                    id: `session-${sessions.length}`
                };
                sessions.push(currentSession);
            } else {
                // Add to current session
                currentSession.versions.push(version);
                currentSession.endTime = version.created_at;
            }
        });

        return sessions;
    }

    scrollCarousel(direction) {
        const track = document.querySelector('.carousel-track');
        const scrollAmount = 200; // pixels to scroll

        if (direction === 'prev') {
            track.scrollLeft -= scrollAmount;
        } else {
            track.scrollLeft += scrollAmount;
        }

        // Update navigation button states
        setTimeout(() => {
            this.updateCarouselNavigation();
        }, 100);
    }

    updateCarouselNavigation() {
        const track = document.querySelector('.carousel-track');
        const prevBtn = document.getElementById('carousel-prev');
        const nextBtn = document.getElementById('carousel-next');

        if (!track || !prevBtn || !nextBtn) return;

        const isAtStart = track.scrollLeft <= 0;
        const isAtEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth;

        prevBtn.disabled = isAtStart;
        nextBtn.disabled = isAtEnd;
    }

    initializeCarousel() {
        // Set up initial carousel state
        setTimeout(() => {
            this.updateCarouselNavigation();

            // Add scroll listener to update navigation
            const track = document.querySelector('.carousel-track');
            if (track) {
                track.addEventListener('scroll', () => {
                    this.updateCarouselNavigation();
                });
            }
        }, 100);
    }

    cleanup() {
        // Clear version save timeout
        if (this.versionSaveTimeout) {
            clearTimeout(this.versionSaveTimeout);
            this.versionSaveTimeout = null;
        }
    }

    async loadEssays() {
        try {
            const response = await fetch('/api/essays');
            const essays = await response.json();

            const essaysList = document.getElementById('essays-list');
            essaysList.innerHTML = '';

            if (essays.length === 0) {
                essaysList.innerHTML = '<p>No essays found. Create your first essay!</p>';
                return;
            }

            essays.forEach(essay => {
                const essayItem = document.createElement('div');
                essayItem.className = 'essay-item';
                essayItem.innerHTML = `
                    <div class="essay-title">${essay.title}</div>
                    <div class="essay-date">${new Date(essay.updated_at).toLocaleDateString()}</div>
                `;

                essayItem.addEventListener('click', () => {
                    this.loadEssay(essay);
                    this.hideLoadModal();
                });

                essaysList.appendChild(essayItem);
            });
        } catch (error) {
            console.error('Load essays error:', error);
            this.showNotification('Failed to load essays', 'error');
        }
    }

    loadEssay(essay) {
        this.currentEssayId = essay.id;
        document.getElementById('essay-title').value = essay.title;
        document.getElementById('editor').innerHTML = essay.content;

        // Set the last saved content to track changes
        this.lastSavedContent = {
            title: essay.title,
            content: essay.content
        };

        // Initialize version tracking
        this.lastVersionContent = {
            title: essay.title,
            content: essay.content
        };

        this.updateStats();
        this.updateAutosaveStatus('saved');
        this.showNotification('Essay loaded successfully!', 'success');
    }

    showLoadModal() {
        document.getElementById('load-modal').style.display = 'block';
        this.loadEssays();
    }

    hideLoadModal() {
        document.getElementById('load-modal').style.display = 'none';
    }

    async sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message) return;

        // Add user message to chat history
        this.chatHistory.push({ role: 'user', content: message });

        // Add user message to UI
        this.addChatMessage(message, 'user');
        input.value = '';

        // Show typing indicator
        this.addTypingIndicator();

        // Get essay context
        const context = document.getElementById('editor').innerText.substring(0, 1000);

        // Limit chat history to last 10 messages to avoid token limits
        const recentChatHistory = this.chatHistory.slice(-10);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    message, 
                    context,
                    chatHistory: recentChatHistory
                }),
            });

            const result = await response.json();

            // Remove typing indicator
            this.removeTypingIndicator();

            // Add AI response to chat history
            this.chatHistory.push({ role: 'assistant', content: result.response });

            // Add AI response with source indicator to UI
            this.addChatMessage(result.response, 'assistant', result.source, true);
        } catch (error) {
            console.error('Chat error:', error);
            this.removeTypingIndicator();
            this.addChatMessage('Sorry, I encountered an error. Please try again.', 'assistant');
        }
    }

    addChatMessage(message, sender, source = null, animate = true) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        const icon = sender === 'user' ? 'fas fa-user' : 'fas fa-robot';
        const sourceIndicator = source ? `<small class="ai-source">via ${source}</small>` : '';

        messageDiv.innerHTML = `
            <i class="${icon}"></i>
            <div class="message-content">
                <span class="message-text"></span>
                ${sourceIndicator}
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        const messageTextElement = messageDiv.querySelector('.message-text');

        // Always show text immediately without animation
        messageTextElement.innerHTML = this.formatMarkdown(message);
    }

    formatMarkdown(text) {
        // Convert markdown to HTML
        let formatted = text
            // Bold text **text**
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Code blocks ```code``` (must come before italic)
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            // Inline code `code` (must come before italic)
            .replace(/`(.*?)`/g, '<code>$1</code>')
            // Bullet points - convert * to bullet symbol (must come before italic)
            .replace(/^[\s]*[\*\-•]\s+(.+)$/gm, '<li class="bullet-item">• $1</li>')
            // Also handle bullet points that appear after line breaks
            .replace(/(<br>)[\s]*[\*\-•]\s+(.+)/g, '$1<li class="bullet-item">• $2</li>')
            // Italic text *text* (but not bullet points)
            .replace(/(?<!^[\s]*)\*((?!\s)[^*\n]+?)\*/gm, '<em>$1</em>')
            // Line breaks
            .replace(/\n/g, '<br>')
            // Numbered lists
            .replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');

        // Wrap consecutive list items in ul tags
        formatted = formatted.replace(/(<li[^>]*>.*?<\/li>(?:<br>)*)+/gs, (match) => {
            // Remove <br> tags between list items
            const cleanMatch = match.replace(/<br>/g, '');
            return '<ul>' + cleanMatch + '</ul>';
        });

        return formatted;
    }



    addTypingIndicator() {
        const messagesContainer = document.getElementById('chat-messages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant-message typing-indicator';
        typingDiv.id = 'typing-indicator';

        typingDiv.innerHTML = `
            <i class="fas fa-robot"></i>
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;

        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    removeTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    populateQuickAction(prompt) {
        // Populate the chat input with the prompt text
        const chatInput = document.getElementById('chat-input');
        chatInput.value = prompt;
        
        // Focus on the input so user can edit or send immediately
        chatInput.focus();
        
        // Move cursor to the end of the text
        chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
    }

    async sendQuickAction(prompt) {
        // Add user message to chat history
        this.chatHistory.push({ role: 'user', content: prompt });

        // Add user message to UI
        this.addChatMessage(prompt, 'user');

        // Show typing indicator
        this.addTypingIndicator();

        // Get essay context
        const context = document.getElementById('editor').innerText.substring(0, 1000);

        // Limit chat history to last 10 messages to avoid token limits
        const recentChatHistory = this.chatHistory.slice(-10);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    message: prompt, 
                    context,
                    chatHistory: recentChatHistory
                }),
            });

            const result = await response.json();

            // Remove typing indicator
            this.removeTypingIndicator();

            // Add AI response to chat history
            this.chatHistory.push({ role: 'assistant', content: result.response });

            // Add AI response with source indicator to UI
            this.addChatMessage(result.response, 'assistant', result.source, true);
        } catch (error) {
            console.error('Chat error:', error);
            this.removeTypingIndicator();
            this.addChatMessage('Sorry, I encountered an error. Please try again.', 'assistant');
        }
    }

    clearChat() {
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.innerHTML = `
            <div class="message assistant-message">
                <i class="fas fa-robot"></i>
                <div class="message-content">
                    <span>Chat cleared! How can I help you with your essay? Use the quick actions above or ask me anything.</span>
                </div>
            </div>
        `;
    }

    initializeChatPanel() {
        // Ensure chat panel is visible by default and buttons are in correct state
        const chatPanel = document.querySelector('.chat-panel');
        const chatToggleBtn = document.getElementById('chat-toggle');
        const chatToggleIcon = chatToggleBtn.querySelector('i');
        const chatReopenBtn = document.getElementById('chat-reopen-btn');

        // Set initial state - chat panel visible
        chatPanel.style.display = 'flex';
        chatToggleIcon.className = 'fas fa-times';
        chatToggleBtn.title = 'Close Chat';
        chatReopenBtn.style.display = 'none';
    }

    toggleChatPanel() {
        const chatPanel = document.querySelector('.chat-panel');
        const chatToggleBtn = document.getElementById('chat-toggle');
        const chatToggleIcon = chatToggleBtn.querySelector('i');
        const chatReopenBtn = document.getElementById('chat-reopen-btn');

        if (chatPanel.style.display === 'none') {
            // Show chat panel
            chatPanel.style.display = 'flex';
            chatToggleIcon.className = 'fas fa-times';
            chatToggleBtn.title = 'Close Chat';
            chatReopenBtn.style.display = 'none';
        } else {
            // Hide chat panel
            chatPanel.style.display = 'none';
            chatToggleIcon.className = 'fas fa-comments';
            chatToggleBtn.title = 'Open Chat';
            chatReopenBtn.style.display = 'inline-flex';
        }
    }



    async runAIDetector() {
        const text = document.getElementById('editor').innerText;
        if (!text.trim()) {
            this.showNotification('Please write some text first', 'warning');
            return;
        }

        this.showNotification('Running enhanced AI detection...', 'info');

        try {
            const response = await fetch('/api/ai-detect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text }),
            });

            const result = await response.json();

            if (result.error) {
                this.showNotification(result.error, 'warning');
                return;
            }

            const aiProb = result.ai_probability;
            const humanProb = result.human_probability;

            this.showNotification(`AI Detection: ${aiProb}% AI / ${humanProb}% Human`, 'info');

            // Create a more readable, structured response
            let feedback = `🤖 AI Detection Results\n\n`;

            // Main verdict with clear visual indicator
            const verdict = aiProb > 70 ? '🚨 Likely AI-Generated' :
                aiProb > 50 ? '⚠️ Mixed Signals' :
                    '✅ Likely Human-Written';
            feedback += `${verdict}\n`;
            feedback += `AI: ${aiProb}% | Human: ${humanProb}%\n\n`;

            // Key insights in simple terms
            if (result.enhanced && result.metrics) {
                feedback += `📊 Key Metrics:\n`;
                feedback += `• Sentence Variety: ${this.getReadableScore(result.metrics.burstiness, 'burstiness')}\n`;
                feedback += `• Predictability: ${this.getReadableScore(result.metrics.perplexity, 'perplexity')}\n`;
                feedback += `• Word Diversity: ${this.getReadableScore(result.metrics.diversity, 'diversity')}\n\n`;
            }

            // Simple, actionable recommendations
            feedback += `💡 What to do:\n`;
            if (aiProb > 70) {
                feedback += `• Add personal stories or examples\n`;
                feedback += `• Mix short and long sentences\n`;
                feedback += `• Use more casual, conversational tone`;
            } else if (aiProb > 50) {
                feedback += `• Add more variety to sentence structure\n`;
                feedback += `• Include personal opinions or experiences\n`;
                feedback += `• Use more unique word choices`;
            } else {
                feedback += `• Great work! Your writing sounds natural\n`;
                feedback += `• Keep using varied sentence lengths\n`;
                feedback += `• Continue with your authentic voice`;
            }

            this.addChatMessage(feedback, 'assistant');

        } catch (error) {
            console.error('AI Detection error:', error);
            this.showNotification('Enhanced AI detection unavailable, using fallback', 'warning');

            // Fallback to original method
            const analysis = this.analyzeTextForAI(text);
            const percentage = Math.round(analysis.score * 100);

            let feedback = `🔄 Fallback AI Detection Results:\n\n`;
            feedback += `📊 AI Probability: ${percentage}%\n`;
            feedback += `📊 Human Probability: ${100 - percentage}%\n\n`;
            feedback += `📈 Basic Metrics:\n`;
            feedback += `• Repetition: ${Math.round(analysis.repetition * 100)}%\n`;
            feedback += `• Uniformity: ${Math.round(analysis.uniformity * 100)}%\n`;
            feedback += `• Diversity: ${Math.round(analysis.diversity * 100)}%\n`;
            feedback += `• Complexity: ${Math.round(analysis.complexity * 100)}%\n\n`;
            feedback += `ℹ️ Note: Enhanced detection requires Python 3. This fallback analysis is still effective!\n\n`;

            if (percentage > 70) {
                feedback += `💡 Recommendations:\n• Add more personal examples\n• Vary sentence structure\n• Use more diverse vocabulary`;
            } else if (percentage > 40) {
                feedback += `✅ Good balance detected\n• Consider adding more unique perspectives`;
            } else {
                feedback += `🎉 Strong human characteristics detected!`;
            }

            this.addChatMessage(feedback, 'assistant');
        }
    }

    analyzeTextForAI(text) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);

        if (sentences.length === 0 || words.length === 0) {
            return { score: 0, repetition: 0, uniformity: 0, diversity: 0, complexity: 0 };
        }

        // 1. Repetition analysis
        const uniqueWords = new Set(words);
        const repetitionScore = 1 - (uniqueWords.size / words.length);

        // 2. Sentence length uniformity
        const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
        const avgLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
        const variance = sentenceLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / sentenceLengths.length;
        const uniformityScore = Math.max(0, 1 - (variance / 50)); // Normalize variance

        // 3. Vocabulary diversity
        const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those']);
        const contentWords = words.filter(w => !commonWords.has(w) && w.length > 3);
        const uniqueContentWords = new Set(contentWords);
        const diversityScore = contentWords.length > 0 ? 1 - (uniqueContentWords.size / contentWords.length) : 0;

        // 4. Complexity analysis
        const avgWordsPerSentence = words.length / sentences.length;
        const longWords = words.filter(w => w.length > 6).length;
        const complexityScore = Math.min(1, (avgWordsPerSentence / 20) + (longWords / words.length));

        // AI indicators (higher = more AI-like)
        const aiIndicators = [
            repetitionScore * 0.3,
            uniformityScore * 0.25,
            diversityScore * 0.25,
            (1 - complexityScore) * 0.2
        ];

        const finalScore = aiIndicators.reduce((a, b) => a + b, 0);

        return {
            score: Math.min(0.95, Math.max(0.05, finalScore)),
            repetition: repetitionScore,
            uniformity: uniformityScore,
            diversity: diversityScore,
            complexity: complexityScore
        };
    }

    async runHumanizer() {
        const text = document.getElementById('editor').innerText;
        if (!text.trim()) {
            this.showNotification('Please write some text first', 'warning');
            return;
        }

        this.showNotification('Analyzing text for humanization...', 'info');

        setTimeout(() => {
            const suggestions = this.generateHumanizationSuggestions(text);

            let feedback = `Humanization Suggestions:\n\n`;

            if (suggestions.length === 0) {
                feedback += `Great work! Your text already sounds very human and natural. Keep up the authentic writing style!`;
            } else {
                feedback += `Here are some ways to make your writing sound more human and natural:\n\n`;
                suggestions.forEach((suggestion, index) => {
                    feedback += `${index + 1}. ${suggestion}\n\n`;
                });

                feedback += `Additional Tips:\n`;
                feedback += `• Use contractions occasionally (don't, can't, won't)\n`;
                feedback += `• Add personal anecdotes or examples\n`;
                feedback += `• Include rhetorical questions\n`;
                feedback += `• Vary your sentence beginnings\n`;
                feedback += `• Use more conversational transitions`;
            }

            this.addChatMessage(feedback, 'assistant');
            this.showNotification('Humanization analysis complete!', 'success');
        }, 2000);
    }

    generateHumanizationSuggestions(text) {
        const suggestions = [];
        const sentences = text.split(/[.!?]+/).filter(s => s.trim());
        const words = text.toLowerCase().split(/\s+/);

        // Check sentence length variation
        const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
        const avgLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
        const hasVariation = sentenceLengths.some(len => Math.abs(len - avgLength) > 5);

        if (!hasVariation && sentences.length > 3) {
            suggestions.push("Vary your sentence lengths - mix short, punchy sentences with longer, more detailed ones for better flow.");
        }

        // Check for repetitive sentence starters
        const starters = sentences.map(s => s.trim().split(/\s+/)[0]?.toLowerCase()).filter(Boolean);
        const starterCounts = {};
        starters.forEach(starter => {
            starterCounts[starter] = (starterCounts[starter] || 0) + 1;
        });

        const repetitiveStarters = Object.entries(starterCounts).filter(([_, count]) => count > 2);
        if (repetitiveStarters.length > 0) {
            suggestions.push(`Vary your sentence beginnings - you're starting multiple sentences with "${repetitiveStarters[0][0]}". Try using different words or phrases.`);
        }

        // Check for passive voice overuse
        const passiveIndicators = ['was', 'were', 'been', 'being'];
        const passiveCount = words.filter(word => passiveIndicators.includes(word)).length;
        if (passiveCount > words.length * 0.1) {
            suggestions.push("Consider using more active voice - replace phrases like 'was done by' with 'X did' for more engaging writing.");
        }

        // Check for word repetition
        const contentWords = words.filter(w => w.length > 4);
        const wordCounts = {};
        contentWords.forEach(word => {
            wordCounts[word] = (wordCounts[word] || 0) + 1;
        });

        const overusedWords = Object.entries(wordCounts).filter(([_, count]) => count > 3);
        if (overusedWords.length > 0) {
            suggestions.push(`You're repeating the word "${overusedWords[0][0]}" frequently. Try using synonyms or rephrasing to add variety.`);
        }

        // Check for transition words
        const transitions = ['however', 'therefore', 'furthermore', 'moreover', 'additionally', 'consequently', 'meanwhile', 'nevertheless'];
        const hasTransitions = transitions.some(t => text.toLowerCase().includes(t));
        if (!hasTransitions && sentences.length > 4) {
            suggestions.push("Add transition words between ideas (however, therefore, meanwhile) to create smoother connections between your thoughts.");
        }

        // Check for personal elements
        const personalWords = ['i', 'my', 'me', 'we', 'our', 'you', 'your'];
        const hasPersonalTouch = personalWords.some(p => words.includes(p));
        if (!hasPersonalTouch && text.length > 200) {
            suggestions.push("Consider adding a personal perspective or addressing the reader directly to make your writing more engaging and human.");
        }

        // Check for contractions
        const contractionWords = ["don't", "can't", "won't", "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't"];
        const hasContractions = contractionWords.some(c => text.toLowerCase().includes(c));
        if (!hasContractions && text.length > 300) {
            suggestions.push("Occasionally use contractions (don't, can't, won't) to make your writing sound more natural and conversational.");
        }

        return suggestions.slice(0, 4); // Limit to top 4 suggestions
    }

    getReadableScore(value, type) {
        switch (type) {
            case 'burstiness':
                return value > 0.5 ? 'Good 👍' : value > 0.3 ? 'Fair 👌' : 'Low ⚠️';
            case 'perplexity':
                return value > 50 ? 'Complex 🧠' : value > 20 ? 'Moderate 📝' : 'Simple 📖';
            case 'diversity':
                return value > 0.8 ? 'Rich 🌟' : value > 0.6 ? 'Good 👍' : 'Limited ⚠️';
            default:
                return Math.round(value * 100) / 100;
        }
    }



    loadEssayFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const essayId = urlParams.get('id');
        console.log('URL params:', window.location.search);
        console.log('Essay ID from URL:', essayId);

        if (essayId) {
            this.loadEssayById(essayId);
        } else {
            console.log('No essay ID in URL');
        }
    }

    async loadEssayById(id) {
        console.log('Loading essay with ID:', id);
        try {
            const response = await fetch(`/api/essays/${id}`);
            console.log('Response status:', response.status);

            if (response.ok) {
                const essay = await response.json();
                console.log('Essay loaded:', essay);
                this.currentEssayId = essay.id;
                document.getElementById('essay-title').value = essay.title;
                document.getElementById('editor').innerHTML = essay.content;

                // Initialize tracking
                this.lastSavedContent = {
                    title: essay.title,
                    content: essay.content
                };
                this.lastVersionContent = {
                    title: essay.title,
                    content: essay.content
                };

                this.updateStats();
                this.updateAutosaveStatus('saved');
                this.showNotification('Essay loaded successfully!', 'success');
            } else {
                const errorText = await response.text();
                console.error('Response error:', errorText);
                throw new Error(`Essay not found: ${response.status}`);
            }
        } catch (error) {
            console.error('Load essay error:', error);
            this.showNotification('Failed to load essay', 'error');
            // Redirect to home if essay not found
            setTimeout(() => {
                window.location.href = 'home.html';
            }, 2000);
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        // Style the notification
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

        // Set background color based on type
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        notification.style.background = colors[type] || colors.info;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    hasUnsavedChanges() {
        // Simple check - in a real app, you'd compare with last saved state
        return document.getElementById('editor').innerHTML.trim() !== '';
    }

    setupResizing() {
        const chatPanel = document.querySelector('.chat-panel');
        const resizeHandle = document.querySelector('.resize-handle');
        let startX, startWidth;

        const startResize = (e) => {
            this.isResizing = true;
            startX = e.clientX;
            startWidth = parseInt(document.defaultView.getComputedStyle(chatPanel).width, 10);
            chatPanel.classList.add('resizing');
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        };

        const doResize = (e) => {
            if (!this.isResizing) return;
            const width = startWidth - (e.clientX - startX);
            const minWidth = 250;
            const maxWidth = 600;
            const newWidth = Math.max(minWidth, Math.min(maxWidth, width));
            chatPanel.style.width = newWidth + 'px';
        };

        const stopResize = () => {
            this.isResizing = false;
            chatPanel.classList.remove('resizing');
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
            document.body.style.cursor = '';
        };

        // Add resize functionality to handle and panel edge
        resizeHandle.addEventListener('mousedown', startResize);

        chatPanel.addEventListener('mousedown', (e) => {
            if (e.offsetX <= 6) {
                startResize(e);
            }
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new EssayPlatform();
});