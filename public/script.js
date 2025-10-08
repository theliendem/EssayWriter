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
        this.updateCheckInterval = null;
        this.maxWordCount = parseInt(localStorage.getItem('maxWordCount')) || 0;
        this.isTypingInSettings = false;
        this.selectionTimeout = null;
        this.promptCollapsed = localStorage.getItem('promptCollapsed') === 'true';
        this.tagsCollapsed = localStorage.getItem('tagsCollapsed') === 'true';
        this.promptSaveTimeout = null;
        this.currentTags = [];
        this.allTags = [];
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
        this.setupPromptSection();
        this.setupTagsSection();
        this.updateStats();
        this.setupEditor();
        this.setupResizing();
        this.initializeChatPanel();
        this.initializeCarousel();
        this.startUpdatePolling();

        // Initialize format buttons
        setTimeout(() => {
            this.updateFormatButtons();
        }, 100);

        // Ensure DOM is ready before loading essay
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                // Small delay to ensure all elements are initialized
                setTimeout(() => this.loadEssayFromURL(), 100);
            });
        } else {
            // Small delay to ensure all elements are initialized
            setTimeout(() => this.loadEssayFromURL(), 100);
        }
    }

    setupEventListeners() {
        // Settings modal
        document.getElementById('settings-toggle').addEventListener('click', () => {
            this.showSettingsModal();
        });

        // Version history
        document.getElementById('version-history-btn').addEventListener('click', () => {
            this.showVersionHistory();
        });

        // Initialize resizable modal
        this.initResizableModal();

        // Zen mode
        this.isZenMode = false;
        this.zenStatsVisible = false;
        this.zenFormatVisible = false;
        document.getElementById('zen-mode-toggle').addEventListener('click', () => {
            this.toggleZenMode();
        });
        this.initZenModeControls();

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

        // Handle paste events to strip formatting
        editor.addEventListener('paste', (e) => {
            e.preventDefault();
            
            // Get plain text from clipboard
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            
            // Insert plain text at cursor position
            if (text) {
                document.execCommand('insertText', false, text);
            }
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

        // Prompt section toggle
        document.getElementById('toggle-prompt').addEventListener('click', () => {
            this.togglePromptSection();
        });

        // Prompt header click (also toggles)
        document.querySelector('.prompt-header').addEventListener('click', (e) => {
            if (e.target.closest('#toggle-prompt')) return; // Don't double-trigger
            this.togglePromptSection();
        });


        // Prompt editor events
        const promptEditor = document.getElementById('prompt-editor');
        promptEditor.addEventListener('input', () => {
            this.autoSavePrompt();
        });

        // Handle paste events in prompt editor to strip formatting
        promptEditor.addEventListener('paste', (e) => {
            e.preventDefault();
            
            // Get plain text from clipboard
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            
            // Insert plain text at cursor position
            if (text) {
                document.execCommand('insertText', false, text);
            }
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
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        this.updateThemeButtons();
    }

    updateThemeButtons() {
        const lightBtn = document.getElementById('light-theme-btn');
        const darkBtn = document.getElementById('dark-theme-btn');

        if (lightBtn && darkBtn) {
            lightBtn.classList.toggle('active', !this.isDarkMode);
            darkBtn.classList.toggle('active', this.isDarkMode);
        }
    }

    toggleTheme(theme) {
        this.isDarkMode = theme === 'dark';
        localStorage.setItem('darkMode', this.isDarkMode);
        this.setupTheme();
    }

    setupPromptSection() {
        const promptSection = document.getElementById('prompt-section');
        const toggleIcon = document.querySelector('#toggle-prompt i');
        const promptEditor = document.getElementById('prompt-editor');
        
        console.log('Setting up prompt section:', {
            promptSection: !!promptSection,
            toggleIcon: !!toggleIcon,
            promptEditor: !!promptEditor,
            collapsed: this.promptCollapsed
        });
        
        if (promptSection && this.promptCollapsed) {
            promptSection.classList.add('collapsed');
            if (toggleIcon) {
                toggleIcon.style.transform = 'rotate(180deg)';
            }
        }
    }

    setupTagsSection() {
        const tagsInput = document.getElementById('header-tags-input');
        const tagsWrapper = document.getElementById('header-tags-input-wrapper');
        const tagsSuggestions = document.getElementById('header-tags-suggestions');
        
        console.log('Setting up header tags:', {
            tagsInput: !!tagsInput,
            tagsWrapper: !!tagsWrapper,
            tagsSuggestions: !!tagsSuggestions
        });

        // Load available tags
        this.loadTags();

        // Setup tags input if available
        if (tagsInput) {
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
                this.showTagSuggestions(e.target.value, 'header-tags-suggestions');
            });

            tagsInput.addEventListener('blur', () => {
                setTimeout(() => {
                    tagsSuggestions.style.display = 'none';
                }, 200);
            });
        }
    }

    togglePromptSection() {
        const promptSection = document.getElementById('prompt-section');
        const toggleIcon = document.querySelector('#toggle-prompt i');
        
        this.promptCollapsed = !this.promptCollapsed;
        localStorage.setItem('promptCollapsed', this.promptCollapsed);
        
        if (this.promptCollapsed) {
            promptSection.classList.add('collapsed');
            toggleIcon.style.transform = 'rotate(180deg)';
        } else {
            promptSection.classList.remove('collapsed');
            toggleIcon.style.transform = 'rotate(0deg)';
        }
    }


    autoSavePrompt() {
        clearTimeout(this.promptSaveTimeout);
        this.promptSaveTimeout = setTimeout(() => {
            if (this.currentEssayId) {
                this.saveEssay(true); // Silent save that includes prompt
            }
        }, 1000); // Save 1 second after user stops typing in prompt

        // Also schedule version save for prompt changes
        this.scheduleVersionSave();
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

    addTag(tagName) {
        if (!tagName || this.currentTags.includes(tagName)) return;
        
        this.currentTags.push(tagName);
        this.renderTags();
        this.saveEssay(true); // Auto-save tags
    }

    removeTag(index) {
        this.currentTags.splice(index, 1);
        this.renderTags();
        this.saveEssay(true); // Auto-save tags
    }

    renderTags() {
        const tagsWrapper = document.getElementById('header-tags-input-wrapper');
        const tagsInput = document.getElementById('header-tags-input');
        
        if (!tagsWrapper || !tagsInput) return;
        
        // Remove existing tag chips
        tagsWrapper.querySelectorAll('.tag-chip').forEach(chip => chip.remove());
        
        // Add current tags
        this.currentTags.forEach((tag, index) => {
            const tagChip = document.createElement('div');
            tagChip.className = 'tag-chip';
            tagChip.innerHTML = `
                ${tag}
                <button type="button" class="remove-tag" onclick="platform.removeTag(${index})">
                    <i class="fas fa-times"></i>
                </button>
            `;
            tagsWrapper.insertBefore(tagChip, tagsInput);
        });
    }

    showTagSuggestions(input, suggestionsId) {
        const tagsSuggestions = document.getElementById(suggestionsId);
        
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
            `<div class="tag-suggestion" onclick="platform.selectTagSuggestion('${tag}')">${tag}</div>`
        ).join('');
        
        tagsSuggestions.style.display = 'block';
    }

    selectTagSuggestion(tag) {
        this.addTag(tag);
        document.getElementById('header-tags-input').value = '';
        document.getElementById('header-tags-suggestions').style.display = 'none';
    }

    // HTML-aware diff algorithm
    stripHtmlForDiff(html) {
        // Create a temporary div to parse HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        return tempDiv.textContent || tempDiv.innerText || '';
    }

    // Simple word-based diff algorithm
    computeWordDiff(oldText, newText) {
        const oldWords = oldText.split(/(\s+)/);
        const newWords = newText.split(/(\s+)/);
        
        // Use dynamic programming to find the longest common subsequence
        const matrix = [];
        for (let i = 0; i <= oldWords.length; i++) {
            matrix[i] = [];
            for (let j = 0; j <= newWords.length; j++) {
                if (i === 0) matrix[i][j] = j;
                else if (j === 0) matrix[i][j] = i;
                else if (oldWords[i - 1] === newWords[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = 1 + Math.min(
                        matrix[i - 1][j],    // deletion
                        matrix[i][j - 1],    // insertion
                        matrix[i - 1][j - 1] // substitution
                    );
                }
            }
        }

        // Backtrack to build the diff
        const diff = [];
        let i = oldWords.length, j = newWords.length;
        
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
                diff.unshift({ type: 'equal', content: oldWords[i - 1] });
                i--; j--;
            } else if (i > 0 && (j === 0 || matrix[i - 1][j] <= matrix[i][j - 1])) {
                diff.unshift({ type: 'delete', content: oldWords[i - 1] });
                i--;
            } else {
                diff.unshift({ type: 'insert', content: newWords[j - 1] });
                j--;
            }
        }
        
        return diff;
    }

    // HTML-aware diff that preserves structure
    computeHtmlDiff(oldHtml, newHtml) {
        // Strip HTML for text comparison but keep track of structure
        const oldText = this.stripHtmlForDiff(oldHtml);
        const newText = this.stripHtmlForDiff(newHtml);
        
        if (oldText === newText) {
            return newHtml; // No changes
        }
        
        const diff = this.computeWordDiff(oldText, newText);
        
        // Build highlighted HTML
        let result = '';
        for (const item of diff) {
            if (item.type === 'equal') {
                result += this.escapeHtml(item.content);
            } else if (item.type === 'insert') {
                result += `<span class="diff-added">${this.escapeHtml(item.content)}</span>`;
            } else if (item.type === 'delete') {
                result += `<span class="diff-removed">${this.escapeHtml(item.content)}</span>`;
            }
        }
        
        // Try to preserve some HTML structure by wrapping in paragraphs
        if (newHtml.includes('<p>') || oldHtml.includes('<p>')) {
            result = '<p>' + result.replace(/\n\n+/g, '</p><p>') + '</p>';
        }
        
        return result;
    }

    // Advanced HTML diff that preserves formatting
    computeAdvancedHtmlDiff(oldHtml, newHtml) {
        if (oldHtml === newHtml) {
            return newHtml;
        }

        // Try to preserve HTML structure by working with HTML blocks
        return this.computeHtmlBlockDiff(oldHtml, newHtml);
    }

    // HTML-aware diff that preserves block-level formatting
    computeHtmlBlockDiff(oldHtml, newHtml) {
        // Parse HTML into meaningful blocks (paragraphs, headings, etc.)
        const oldBlocks = this.parseHtmlBlocks(oldHtml);
        const newBlocks = this.parseHtmlBlocks(newHtml);

        // Compare blocks and highlight differences
        const blockDiff = this.computeBlockDiff(oldBlocks, newBlocks);
        
        // Reconstruct HTML with diff highlighting
        return this.reconstructHtmlFromBlocks(blockDiff);
    }

    // Parse HTML into meaningful blocks while preserving structure
    parseHtmlBlocks(html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        const blocks = [];
        const children = Array.from(tempDiv.childNodes);
        
        for (const child of children) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                // This is an HTML element (p, h1, div, etc.)
                blocks.push({
                    type: 'element',
                    tagName: child.tagName.toLowerCase(),
                    innerHTML: child.innerHTML,
                    outerHTML: child.outerHTML,
                    textContent: child.textContent || child.innerText || ''
                });
            } else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                // This is text outside of any element
                blocks.push({
                    type: 'text',
                    content: child.textContent,
                    textContent: child.textContent
                });
            }
        }
        
        return blocks;
    }

    // Compare blocks using content similarity
    computeBlockDiff(oldBlocks, newBlocks) {
        const diff = [];
        let oldIndex = 0;
        let newIndex = 0;
        
        while (oldIndex < oldBlocks.length || newIndex < newBlocks.length) {
            if (oldIndex >= oldBlocks.length) {
                // Remaining blocks are additions
                diff.push({ type: 'insert', block: newBlocks[newIndex] });
                newIndex++;
            } else if (newIndex >= newBlocks.length) {
                // Remaining blocks are deletions
                diff.push({ type: 'delete', block: oldBlocks[oldIndex] });
                oldIndex++;
            } else {
                const oldBlock = oldBlocks[oldIndex];
                const newBlock = newBlocks[newIndex];
                
                // Check if blocks are similar
                if (this.blocksAreSimilar(oldBlock, newBlock)) {
                    // Blocks are similar, check for text differences within
                    if (oldBlock.textContent === newBlock.textContent) {
                        diff.push({ type: 'equal', block: newBlock });
                    } else {
                        // Same structure but different content - highlight text changes
                        const modifiedBlock = this.highlightTextChangesInBlock(oldBlock, newBlock);
                        diff.push({ type: 'modified', block: modifiedBlock });
                    }
                    oldIndex++;
                    newIndex++;
                } else {
                    // Try to find if this old block appears later in new blocks
                    const laterMatch = this.findBlockLater(oldBlock, newBlocks, newIndex);
                    if (laterMatch >= 0) {
                        // Old block moved or new blocks inserted before it
                        diff.push({ type: 'insert', block: newBlocks[newIndex] });
                        newIndex++;
                    } else {
                        // Old block was deleted or modified beyond recognition
                        diff.push({ type: 'delete', block: oldBlocks[oldIndex] });
                        oldIndex++;
                    }
                }
            }
        }
        
        return diff;
    }

    // Check if two blocks are structurally similar
    blocksAreSimilar(block1, block2) {
        if (block1.type !== block2.type) return false;
        if (block1.type === 'element') {
            return block1.tagName === block2.tagName;
        }
        return true; // Text blocks are considered similar
    }

    // Find if a block appears later in the array
    findBlockLater(targetBlock, blocks, startIndex) {
        for (let i = startIndex; i < blocks.length; i++) {
            if (this.blocksAreSimilar(targetBlock, blocks[i]) && 
                targetBlock.textContent === blocks[i].textContent) {
                return i;
            }
        }
        return -1;
    }

    // Highlight text changes within a block while preserving structure
    highlightTextChangesInBlock(oldBlock, newBlock) {
        if (oldBlock.type === 'text') {
            // Simple text diff
            const textDiff = this.computeCharacterDiff(oldBlock.content, newBlock.content);
            let result = '';
            for (const item of textDiff) {
                if (item.type === 'equal') {
                    result += this.escapeHtml(item.content);
                } else if (item.type === 'insert') {
                    result += `<span class="diff-added">${this.escapeHtml(item.content)}</span>`;
                } else if (item.type === 'delete') {
                    result += `<span class="diff-removed">${this.escapeHtml(item.content)}</span>`;
                }
            }
            return { ...newBlock, content: result };
        } else {
            // Element with inner content changes
            const oldText = oldBlock.textContent;
            const newText = newBlock.textContent;
            
            const textDiff = this.computeCharacterDiff(oldText, newText);
            let diffText = '';
            for (const item of textDiff) {
                if (item.type === 'equal') {
                    diffText += item.content;
                } else if (item.type === 'insert') {
                    diffText += `<span class="diff-added">${this.escapeHtml(item.content)}</span>`;
                } else if (item.type === 'delete') {
                    diffText += `<span class="diff-removed">${this.escapeHtml(item.content)}</span>`;
                }
            }
            
            // Create new block with highlighted content
            return {
                ...newBlock,
                innerHTML: diffText,
                outerHTML: `<${newBlock.tagName}>${diffText}</${newBlock.tagName}>`
            };
        }
    }

    // Reconstruct HTML from diff blocks
    reconstructHtmlFromBlocks(blockDiff) {
        let result = '';
        
        for (const diffItem of blockDiff) {
            const block = diffItem.block;
            
            if (diffItem.type === 'equal' || diffItem.type === 'modified') {
                if (block.type === 'element') {
                    result += block.outerHTML;
                } else {
                    result += block.content;
                }
            } else if (diffItem.type === 'insert') {
                if (block.type === 'element') {
                    const wrappedContent = `<span class="diff-added">${block.innerHTML}</span>`;
                    result += `<${block.tagName}>${wrappedContent}</${block.tagName}>`;
                } else {
                    result += `<span class="diff-added">${this.escapeHtml(block.content)}</span>`;
                }
            } else if (diffItem.type === 'delete') {
                if (block.type === 'element') {
                    const wrappedContent = `<span class="diff-removed">${block.innerHTML}</span>`;
                    result += `<${block.tagName}>${wrappedContent}</${block.tagName}>`;
                } else {
                    result += `<span class="diff-removed">${this.escapeHtml(block.content)}</span>`;
                }
            }
        }
        
        return result;
    }

    // Character-level diff for more precise results
    computeCharacterDiff(oldText, newText) {
        const oldChars = oldText.split('');
        const newChars = newText.split('');
        
        // Use Myers algorithm for better diff quality
        return this.myersDiff(oldChars, newChars);
    }

    // Myers diff algorithm - more accurate than simple DP
    myersDiff(a, b) {
        const N = a.length;
        const M = b.length;
        const MAX = N + M;
        
        const v = {};
        const trace = [];
        
        v[1] = 0;
        
        for (let d = 0; d <= MAX; d++) {
            trace.push({ ...v });
            
            for (let k = -d; k <= d; k += 2) {
                let x;
                if (k === -d || (k !== d && v[k - 1] < v[k + 1])) {
                    x = v[k + 1];
                } else {
                    x = v[k - 1] + 1;
                }
                
                let y = x - k;
                
                while (x < N && y < M && a[x] === b[y]) {
                    x++;
                    y++;
                }
                
                v[k] = x;
                
                if (x >= N && y >= M) {
                    return this.buildDiffFromTrace(a, b, trace, d);
                }
            }
        }
        
        return [{ type: 'delete', content: a.join('') }, { type: 'insert', content: b.join('') }];
    }

    buildDiffFromTrace(a, b, trace, d) {
        const diff = [];
        let x = a.length;
        let y = b.length;
        
        for (let t = d; t >= 0; t--) {
            const v = trace[t];
            const k = x - y;
            
            let prevK;
            if (k === -t || (k !== t && v[k - 1] < v[k + 1])) {
                prevK = k + 1;
            } else {
                prevK = k - 1;
            }
            
            const prevX = v[prevK];
            const prevY = prevX - prevK;
            
            // Add common suffix
            while (x > prevX && y > prevY) {
                diff.unshift({ type: 'equal', content: a[x - 1] });
                x--;
                y--;
            }
            
            // Add deletion or insertion
            if (t > 0) {
                if (x > prevX) {
                    diff.unshift({ type: 'delete', content: a[x - 1] });
                    x--;
                } else {
                    diff.unshift({ type: 'insert', content: b[y - 1] });
                    y--;
                }
            }
        }
        
        // Merge consecutive items of the same type
        return this.mergeDiffItems(diff);
    }

    mergeDiffItems(diff) {
        const merged = [];
        let current = null;
        
        for (const item of diff) {
            if (current && current.type === item.type) {
                current.content += item.content;
            } else {
                if (current) merged.push(current);
                current = { ...item };
            }
        }
        
        if (current) merged.push(current);
        return merged;
    }

    splitIntoSentences(html) {
        // Simple sentence splitting that preserves HTML
        return html.split(/(?<=[.!?])\s+/)
                  .filter(s => s.trim().length > 0)
                  .map(s => s.trim());
    }

    computeSequenceDiff(oldSeq, newSeq) {
        const matrix = [];
        for (let i = 0; i <= oldSeq.length; i++) {
            matrix[i] = [];
            for (let j = 0; j <= newSeq.length; j++) {
                if (i === 0) matrix[i][j] = j;
                else if (j === 0) matrix[i][j] = i;
                else if (this.stripHtmlForDiff(oldSeq[i - 1]) === this.stripHtmlForDiff(newSeq[j - 1])) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = 1 + Math.min(
                        matrix[i - 1][j],
                        matrix[i][j - 1],
                        matrix[i - 1][j - 1]
                    );
                }
            }
        }

        const diff = [];
        let i = oldSeq.length, j = newSeq.length;
        
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && this.stripHtmlForDiff(oldSeq[i - 1]) === this.stripHtmlForDiff(newSeq[j - 1])) {
                diff.unshift({ type: 'equal', content: oldSeq[i - 1] + ' ' });
                i--; j--;
            } else if (i > 0 && (j === 0 || matrix[i - 1][j] <= matrix[i][j - 1])) {
                diff.unshift({ type: 'delete', content: oldSeq[i - 1] + ' ' });
                i--;
            } else {
                diff.unshift({ type: 'insert', content: newSeq[j - 1] + ' ' });
                j--;
            }
        }
        
        return diff;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    scheduleVersionSave() {
        clearTimeout(this.versionSaveTimeout);
        this.versionSaveTimeout = setTimeout(() => {
            if (this.currentEssayId && this.hasVersionChanges()) {
                this.saveVersionSnapshot();
            }
        }, 5000); // 5 seconds after last change
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

        // Schedule version save on content changes
        editor.addEventListener('input', () => this.scheduleVersionSave());
        titleInput.addEventListener('input', () => this.scheduleVersionSave());

        // Handle paste events in title input to strip formatting
        titleInput.addEventListener('paste', (e) => {
            e.preventDefault();
            
            // Get plain text from clipboard
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            
            // Insert plain text at cursor position (for input elements, we set the value)
            if (text) {
                const start = titleInput.selectionStart;
                const end = titleInput.selectionEnd;
                const currentValue = titleInput.value;
                
                // Replace selected text with plain text
                titleInput.value = currentValue.substring(0, start) + text + currentValue.substring(end);
                
                // Set cursor position after inserted text
                titleInput.selectionStart = titleInput.selectionEnd = start + text.length;
                
                // Trigger input event to update autosave
                titleInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

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

        const wordCountElement = document.getElementById('word-count');
        wordCountElement.textContent = words;

        // Check if there's currently a text selection
        const hasSelection = window.getSelection().toString().trim().length > 0;

        // Check word limit and apply red styling if over limit AND no text is selected
        if (this.maxWordCount > 0 && words > this.maxWordCount && !hasSelection) {
            wordCountElement.style.color = '#ef4444';
            wordCountElement.style.fontWeight = 'bold';
        } else {
            wordCountElement.style.color = '';
            wordCountElement.style.fontWeight = '';
        }

        document.getElementById('char-count').textContent = characters;
        document.getElementById('sentence-count').textContent = sentences;
        document.getElementById('paragraph-count').textContent = paragraphs;

        // Update Zen mode stats if visible
        this.updateZenStats();

        // Highlight words over limit
        this.highlightWordsOverLimit(words);
    }

    highlightWordsOverLimit(totalWords) {
        if (this.maxWordCount <= 0 || totalWords <= this.maxWordCount) {
            // Remove any existing highlighting
            this.removeWordLimitHighlighting();
            return;
        }

        // Don't highlight if user is typing in settings to avoid focus issues
        if (this.isTypingInSettings || (document.activeElement && document.activeElement.id === 'max-word-count')) {
            return;
        }

        const editor = document.getElementById('editor');
        const selection = window.getSelection();
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        let cursorOffset = 0;

        // Save cursor position only if it's in the editor
        if (range && editor.contains(range.startContainer)) {
            cursorOffset = this.getCursorOffset(editor, range.startContainer, range.startOffset);
        } else {
            // If cursor is not in editor, don't try to restore it
            range = null;
        }

        // Remove existing highlighting first
        this.removeWordLimitHighlighting();

        // Get all text nodes and their words
        const textNodes = this.getTextNodes(editor);
        let wordCount = 0;
        let wordsToHighlight = totalWords - this.maxWordCount;

        // Process text nodes to find and highlight excess words
        for (let i = textNodes.length - 1; i >= 0 && wordsToHighlight > 0; i--) {
            const textNode = textNodes[i];
            const text = textNode.textContent;
            const words = text.trim().split(/\s+/).filter(word => word.length > 0);

            if (words.length === 0) continue;

            // Count words from the end to highlight the last words that go over limit
            const wordsInThisNode = Math.min(wordsToHighlight, words.length);

            if (wordsInThisNode > 0) {
                this.highlightWordsInTextNode(textNode, wordsInThisNode);
                wordsToHighlight -= wordsInThisNode;
            }
        }

        // Restore cursor position only if it was originally in the editor
        if (range && document.activeElement !== document.getElementById('max-word-count')) {
            this.setCursorOffset(editor, cursorOffset);
        }
    }

    removeWordLimitHighlighting() {
        const editor = document.getElementById('editor');
        const highlightedElements = editor.querySelectorAll('.word-over-limit');

        highlightedElements.forEach(element => {
            const parent = element.parentNode;
            parent.insertBefore(document.createTextNode(element.textContent), element);
            parent.removeChild(element);
            parent.normalize(); // Merge adjacent text nodes
        });
    }

    getTextNodes(element) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.trim()) {
                textNodes.push(node);
            }
        }
        return textNodes;
    }

    highlightWordsInTextNode(textNode, wordsToHighlight) {
        const text = textNode.textContent;
        const words = text.split(/(\s+)/); // Split but keep whitespace
        let wordCount = 0;
        let highlightStart = -1;

        // Find where to start highlighting (from the end)
        for (let i = words.length - 1; i >= 0; i--) {
            if (words[i].trim()) { // It's a word, not whitespace
                wordCount++;
                if (wordCount === wordsToHighlight) {
                    highlightStart = i;
                    break;
                }
            }
        }

        if (highlightStart === -1) return;

        // Create new content with highlighted words
        const beforeHighlight = words.slice(0, highlightStart).join('');
        const toHighlight = words.slice(highlightStart).join('');

        const parent = textNode.parentNode;

        // Create new text node for content before highlighting
        if (beforeHighlight) {
            parent.insertBefore(document.createTextNode(beforeHighlight), textNode);
        }

        // Create highlighted span for excess words
        if (toHighlight.trim()) {
            const highlightSpan = document.createElement('span');
            highlightSpan.className = 'word-over-limit';
            highlightSpan.textContent = toHighlight;
            parent.insertBefore(highlightSpan, textNode);
        }

        // Remove original text node
        parent.removeChild(textNode);
    }

    getCursorOffset(root, node, offset) {
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let charCount = 0;
        let currentNode;

        while (currentNode = walker.nextNode()) {
            if (currentNode === node) {
                return charCount + offset;
            }
            charCount += currentNode.textContent.length;
        }

        return charCount;
    }

    setCursorOffset(root, offset) {
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let charCount = 0;
        let currentNode;

        while (currentNode = walker.nextNode()) {
            if (charCount + currentNode.textContent.length >= offset) {
                const range = document.createRange();
                const selection = window.getSelection();

                range.setStart(currentNode, offset - charCount);
                range.collapse(true);

                selection.removeAllRanges();
                selection.addRange(range);
                return;
            }
            charCount += currentNode.textContent.length;
        }
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
                    const wordCountElement = document.getElementById('word-count');
                    wordCountElement.textContent = `${words} selected`;

                    // Always show selection stats in normal color (white/default)
                    wordCountElement.style.color = '';
                    wordCountElement.style.fontWeight = '';

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

        // Update Zen mode format buttons if visible
        this.updateZenFormatButtons();
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
        const prompt = document.getElementById('prompt-editor').innerHTML || '';
        const tags = this.currentTags;

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
                body: JSON.stringify({ title, content, prompt, tags }),
            });

            const result = await response.json();

            if (!this.currentEssayId) {
                this.currentEssayId = result.id;
                // Save initial version
                this.lastVersionContent = { title, content, prompt, tags: tags.join(',') };
                // Update URL to include essay ID
                const newUrl = new URL(window.location);
                newUrl.searchParams.set('id', result.id);
                window.history.replaceState({}, '', newUrl);
            }

            this.updateAutosaveStatus('saved');

            // Update last saved content for change detection
            this.lastSavedContent = {
                title: title,
                content: content,
                prompt: prompt,
                tags: tags.join(',')
            };

            // Check sync status after a brief delay
            setTimeout(() => this.checkSyncStatus(), 1000);
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
            const prompt = document.getElementById('prompt-editor').innerHTML || '';
            return title.trim() !== '' || content.trim() !== '' || prompt.trim() !== '';
        }

        const currentTitle = document.getElementById('essay-title').value || 'Untitled Essay';
        const currentContent = document.getElementById('editor').innerHTML;
        const currentPrompt = document.getElementById('prompt-editor').innerHTML || '';

        return (
            currentTitle !== this.lastSavedContent.title ||
            currentContent !== this.lastSavedContent.content ||
            currentPrompt !== (this.lastSavedContent.prompt || '')
        );
    }

    hasVersionChanges() {
        if (!this.lastVersionContent) {
            return true; // First version
        }

        const currentTitle = document.getElementById('essay-title').value || 'Untitled Essay';
        const currentContent = document.getElementById('editor').innerHTML;
        const currentPrompt = document.getElementById('prompt-editor').innerHTML || '';

        return (
            currentTitle !== this.lastVersionContent.title ||
            currentContent !== this.lastVersionContent.content ||
            currentPrompt !== (this.lastVersionContent.prompt || '')
        );
    }

    updateAutosaveStatus(status) {
        const statusElement = document.getElementById('autosave-status');

        // Remove all status classes
        statusElement.classList.remove('saving', 'saved', 'synced', 'error', 'version-saved');

        // Add the specific status class
        if (status) {
            statusElement.classList.add(status);
        }

        // Update tooltip text
        const tooltips = {
            'saving': 'Saving...',
            'saved': 'Saved locally',
            'synced': 'Synced to cloud',
            'error': 'Error saving',
            'version-saved': 'Version saved'
        };
        statusElement.title = tooltips[status] || '';
    }

    async checkSyncStatus() {
        if (!this.currentEssayId) return;

        try {
            const response = await fetch(`/api/essays/${this.currentEssayId}/sync-status`);
            if (response.ok) {
                const { synced } = await response.json();
                if (synced) {
                    this.updateAutosaveStatus('synced');
                }
            }
        } catch (error) {
            console.error('Error checking sync status:', error);
        }
    }

    // Start polling for cloud updates
    startUpdatePolling() {
        // Poll every 3 seconds
        this.updateCheckInterval = setInterval(() => {
            this.checkForCloudUpdates();
        }, 3000);
    }

    // Check if current essay was updated from cloud
    async checkForCloudUpdates() {
        if (!this.currentEssayId) return;

        try {
            const response = await fetch('/api/sync/updates');
            if (response.ok) {
                const { updatedEssays } = await response.json();

                if (updatedEssays.includes(this.currentEssayId)) {
                    // Current essay was updated from cloud
                    await this.reloadEssayFromCloud();

                    // Clear this essay from update tracking
                    await fetch(`/api/sync/updates/${this.currentEssayId}/clear`, {
                        method: 'POST'
                    });
                }
            }
        } catch (error) {
            console.error('Error checking for cloud updates:', error);
        }
    }

    // Reload essay from database
    async reloadEssayFromCloud() {
        if (!this.currentEssayId) return;

        try {
            const response = await fetch(`/api/essays/${this.currentEssayId}`);
            if (response.ok) {
                const essay = await response.json();

                // Update UI with new content
                document.getElementById('essay-title').value = essay.title;
                document.getElementById('editor').innerHTML = essay.content;
                document.getElementById('prompt-editor').innerHTML = essay.prompt || '';

                // Update tags
                this.currentTags = essay.tags ? essay.tags.split(',').filter(t => t.trim()) : [];
                this.renderTags();

                // Update tracking
                this.lastSavedContent = {
                    title: essay.title,
                    content: essay.content,
                    prompt: essay.prompt || '',
                    tags: essay.tags || ''
                };

                this.lastVersionContent = {
                    title: essay.title,
                    content: essay.content,
                    prompt: essay.prompt || '',
                    tags: essay.tags || ''
                };

                this.updateStats();
                this.updateAutosaveStatus('synced');

                // Show notification
                this.showNotification('Essay updated from another device', 'success');
            }
        } catch (error) {
            console.error('Error reloading essay:', error);
        }
    }

    async saveVersionSnapshot() {
        if (!this.currentEssayId) return;

        const title = document.getElementById('essay-title').value || 'Untitled Essay';
        const content = document.getElementById('editor').innerHTML;
        const prompt = document.getElementById('prompt-editor').innerHTML || '';
        const tags = this.currentTags;

        // Check if this is only a whitespace change
        if (this.lastVersionContent && 
            this.shouldMergeWithPrevious(content, this.lastVersionContent.content) &&
            title === this.lastVersionContent.title &&
            prompt === this.lastVersionContent.prompt &&
            tags.join(',') === this.lastVersionContent.tags) {
            console.log('Skipping version save - only whitespace changes detected');
            // Update the last version content to current content to prevent repeated checks
            this.lastVersionContent = { title, content, prompt, tags: tags.join(',') };
            return;
        }

        try {
            const response = await fetch(`/api/essays/${this.currentEssayId}/versions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title,
                    content,
                    prompt,
                    tags,
                    changes_only: this.calculateChanges(content, prompt)
                }),
            });

            if (response.ok) {
                this.lastVersionContent = { title, content, prompt, tags: tags.join(',') };
                console.log('Version snapshot saved');
                // Show version snapshot status
                this.updateAutosaveStatus('version-saved');
            }
        } catch (error) {
            console.error('Version save error:', error);
        }
    }

    calculateChanges(newContent, newPrompt = '') {
        if (!this.lastVersionContent) {
            return 'Initial version';
        }

        const oldContentWords = this.lastVersionContent.content.replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0).length;
        const newContentWords = newContent.replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0).length;
        const contentWordDiff = newContentWords - oldContentWords;

        const oldPromptWords = (this.lastVersionContent.prompt || '').replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0).length;
        const newPromptWords = newPrompt.replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0).length;
        const promptWordDiff = newPromptWords - oldPromptWords;

        const totalWordDiff = contentWordDiff + promptWordDiff;

        // Check if prompt changed
        const promptChanged = (this.lastVersionContent.prompt || '') !== newPrompt;
        
        if (promptChanged && totalWordDiff !== 0) {
            return `Prompt updated, ${totalWordDiff > 0 ? '+' : ''}${totalWordDiff} words`;
        } else if (promptChanged) {
            return 'Prompt updated';
        } else if (totalWordDiff > 0) {
            return `+${totalWordDiff} words`;
        } else if (totalWordDiff < 0) {
            return `${totalWordDiff} words`;
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
        console.log('Version history modal opened');
        await this.loadVersionHistory();
        this.setupVersionScrolling();
    }

    hideVersionHistory() {
        document.getElementById('version-history-modal').style.display = 'none';
        this.selectedVersion = null;
        document.getElementById('restore-version-btn').disabled = true;

        // Reset modal size and position
        const modal = document.querySelector('.resizable-modal');
        if (modal) {
            modal.classList.remove('resizing');
            modal.style.width = '';
            modal.style.height = '';
            modal.style.left = '';
            modal.style.top = '';
            modal.style.maxWidth = '';
            modal.style.maxHeight = '';
            modal.style.transform = '';
        }

        // Clean up scroll listener
        const versionsList = document.getElementById('versions-list');
        if (versionsList) {
            versionsList.removeEventListener('scroll', this.handleVersionScroll);
        }
    }

    showSettingsModal() {
        document.getElementById('settings-modal').style.display = 'block';
        this.updateThemeButtons();
        this.loadSettingsValues();
        this.initSettingsListeners();
    }

    loadSettingsValues() {
        // Load max word count
        const maxWordCountInput = document.getElementById('max-word-count');
        if (maxWordCountInput) {
            maxWordCountInput.value = this.maxWordCount || '';
        }
    }

    hideSettingsModal() {
        document.getElementById('settings-modal').style.display = 'none';
    }

    initSettingsListeners() {
        // Close modal
        const closeBtn = document.getElementById('settings-modal-close');
        if (closeBtn && !closeBtn.hasSettingsListener) {
            closeBtn.addEventListener('click', () => this.hideSettingsModal());
            closeBtn.hasSettingsListener = true;
        }

        // Modal background click
        const modal = document.getElementById('settings-modal');
        if (modal && !modal.hasSettingsListener) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideSettingsModal();
                }
            });
            modal.hasSettingsListener = true;
        }

        // Theme buttons
        const lightBtn = document.getElementById('light-theme-btn');
        const darkBtn = document.getElementById('dark-theme-btn');

        if (lightBtn && !lightBtn.hasSettingsListener) {
            lightBtn.addEventListener('click', () => this.toggleTheme('light'));
            lightBtn.hasSettingsListener = true;
        }

        if (darkBtn && !darkBtn.hasSettingsListener) {
            darkBtn.addEventListener('click', () => this.toggleTheme('dark'));
            darkBtn.hasSettingsListener = true;
        }

        // Max word count input
        const maxWordCountInput = document.getElementById('max-word-count');
        if (maxWordCountInput && !maxWordCountInput.hasSettingsListener) {
            maxWordCountInput.addEventListener('input', (e) => {
                e.stopPropagation(); // Prevent event bubbling
                this.isTypingInSettings = true;

                const value = parseInt(e.target.value) || 0;
                this.maxWordCount = value;
                localStorage.setItem('maxWordCount', value.toString());

                // If setting to 0 (no limit), immediately remove highlighting
                if (value === 0) {
                    this.removeWordLimitHighlighting();
                }

                // Use setTimeout to avoid focus issues during typing
                setTimeout(() => {
                    this.isTypingInSettings = false;
                    this.updateStats(); // Refresh stats and highlighting
                }, 100);
            });

            // Also handle focus events to prevent editor interference
            maxWordCountInput.addEventListener('focus', (e) => {
                e.stopPropagation();
                this.isTypingInSettings = true;
            });

            maxWordCountInput.addEventListener('blur', (e) => {
                this.isTypingInSettings = false;
            });

            maxWordCountInput.addEventListener('keydown', (e) => {
                e.stopPropagation(); // Prevent keydown from bubbling to editor
            });

            maxWordCountInput.hasSettingsListener = true;
        }
    }

    initResizableModal() {
        const modal = document.querySelector('.resizable-modal');
        if (!modal) return;

        const handles = modal.querySelectorAll('.resize-handle');
        let isResizing = false;
        let startX, startY, startWidth, startHeight, startLeft, startTop;
        let currentHandle = null;

        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();

                isResizing = true;
                currentHandle = handle;
                startX = e.clientX;
                startY = e.clientY;

                const rect = modal.getBoundingClientRect();
                startWidth = rect.width;
                startHeight = rect.height;
                startLeft = rect.left;
                startTop = rect.top;

                modal.classList.add('resizing');
                document.body.style.userSelect = 'none';
                document.body.style.cursor = getComputedStyle(handle).cursor;
            });
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing || !currentHandle) return;

            e.preventDefault();
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const minWidth = 800;
            const minHeight = 600;
            const maxWidth = window.innerWidth * 0.98;
            const maxHeight = window.innerHeight * 0.95;

            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;

            // Handle resizing based on which handle is being dragged
            if (currentHandle.classList.contains('e')) {
                newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx));
            } else if (currentHandle.classList.contains('w')) {
                newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth - dx));
                newLeft = startLeft + (startWidth - newWidth);
            } else if (currentHandle.classList.contains('s')) {
                newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + dy));
            } else if (currentHandle.classList.contains('n')) {
                newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight - dy));
                newTop = startTop + (startHeight - newHeight);
            } else if (currentHandle.classList.contains('se')) {
                newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx));
                newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + dy));
            } else if (currentHandle.classList.contains('sw')) {
                newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth - dx));
                newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + dy));
                newLeft = startLeft + (startWidth - newWidth);
            } else if (currentHandle.classList.contains('ne')) {
                newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx));
                newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight - dy));
                newTop = startTop + (startHeight - newHeight);
            } else if (currentHandle.classList.contains('nw')) {
                newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth - dx));
                newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight - dy));
                newLeft = startLeft + (startWidth - newWidth);
                newTop = startTop + (startHeight - newHeight);
            }

            // Keep modal centered by adjusting position
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;

            modal.style.width = newWidth + 'px';
            modal.style.height = newHeight + 'px';
            modal.style.left = (centerX - newWidth / 2) + 'px';
            modal.style.top = (centerY - newHeight / 2) + 'px';
            modal.style.transform = 'none';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                currentHandle = null;
                modal.classList.remove('resizing');
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
            }
        });
    }

    toggleZenMode() {
        this.isZenMode = !this.isZenMode;

        const body = document.body;
        const zenHeader = document.getElementById('zen-header');
        const zenModeBtn = document.getElementById('zen-mode-toggle');

        if (this.isZenMode) {
            body.classList.add('zen-mode-entering');
            setTimeout(() => {
                body.classList.remove('zen-mode-entering');
                body.classList.add('zen-mode');
            }, 300);

            zenHeader.style.display = 'flex';
            zenModeBtn.classList.add('active');
            zenModeBtn.querySelector('i').className = 'fas fa-expand-arrows-alt';
            zenModeBtn.title = 'Exit Zen Mode';

            // Focus on editor
            document.getElementById('editor').focus();
        } else {
            body.classList.add('zen-mode-exiting');
            body.classList.remove('zen-mode');
            setTimeout(() => {
                body.classList.remove('zen-mode-exiting');
            }, 300);

            zenHeader.style.display = 'none';
            document.getElementById('zen-stats-group').style.display = 'none';
            document.getElementById('zen-format-group').style.display = 'none';
            this.zenStatsVisible = false;
            this.zenFormatVisible = false;

            zenModeBtn.classList.remove('active');
            zenModeBtn.querySelector('i').className = 'fas fa-leaf';
            zenModeBtn.title = 'Zen Mode';
        }
    }

    initZenModeControls() {
        // Stats toggle
        document.getElementById('zen-stats-toggle').addEventListener('click', () => {
            this.zenStatsVisible = !this.zenStatsVisible;
            const group = document.getElementById('zen-stats-group');
            const btn = document.getElementById('zen-stats-toggle');

            if (this.zenStatsVisible) {
                group.style.display = 'flex';
                btn.classList.add('active');
                this.updateZenStats();
            } else {
                group.style.display = 'none';
                btn.classList.remove('active');
            }
        });

        // Format toggle
        document.getElementById('zen-format-toggle').addEventListener('click', () => {
            this.zenFormatVisible = !this.zenFormatVisible;
            const group = document.getElementById('zen-format-group');
            const btn = document.getElementById('zen-format-toggle');

            if (this.zenFormatVisible) {
                group.style.display = 'flex';
                btn.classList.add('active');
                this.initZenFormatControls();
            } else {
                group.style.display = 'none';
                btn.classList.remove('active');
            }
        });

        // Exit zen mode
        document.getElementById('zen-exit').addEventListener('click', () => {
            this.toggleZenMode();
        });

        // ESC key to exit zen mode
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isZenMode) {
                this.toggleZenMode();
            }
        });
    }

    updateZenStats() {
        if (!this.zenStatsVisible) return;

        const editor = document.getElementById('editor');
        const text = editor.innerText || '';

        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;

        const zenWordCountElement = document.getElementById('zen-word-count');
        zenWordCountElement.textContent = words;

        // Check if there's currently a text selection
        const hasSelection = window.getSelection().toString().trim().length > 0;

        // Check word limit and apply red styling if over limit AND no text is selected
        if (this.maxWordCount > 0 && words > this.maxWordCount && !hasSelection) {
            zenWordCountElement.style.color = '#ef4444';
            zenWordCountElement.style.fontWeight = 'bold';
        } else {
            zenWordCountElement.style.color = '';
            zenWordCountElement.style.fontWeight = '';
        }

        document.getElementById('zen-char-count').textContent = chars;
        document.getElementById('zen-sentence-count').textContent = sentences;
        document.getElementById('zen-paragraph-count').textContent = paragraphs;
    }

    initZenFormatControls() {
        // Format buttons
        document.querySelectorAll('.zen-format-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const command = btn.getAttribute('data-command');
                document.execCommand(command, false, null);
                this.updateZenFormatButtons();
            });
        });

        // Heading select
        document.getElementById('zen-heading-select').addEventListener('change', (e) => {
            const value = e.target.value;
            if (value) {
                document.execCommand('formatBlock', false, value);
            } else {
                document.execCommand('formatBlock', false, 'div');
            }
        });

        this.updateZenFormatButtons();
    }

    updateZenFormatButtons() {
        if (!this.zenFormatVisible) return;

        document.querySelectorAll('.zen-format-btn').forEach(btn => {
            const command = btn.getAttribute('data-command');
            if (document.queryCommandState(command)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
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
            // Show the version content with diff highlighting
            const currentContent = document.getElementById('editor').innerHTML;
            const versionContent = version.content;
            
            // Find the previous version (chronologically earlier) to compare against
            // This will show what changed FROM the previous version TO this version
            const allVersions = [
                {
                    id: 'current',
                    content: currentContent,
                    created_at: new Date().toISOString()
                },
                ...this.versions
            ];
            
            const currentIndex = allVersions.findIndex(v => v.id === version.id);
            const previousVersion = currentIndex < allVersions.length - 1 ? allVersions[currentIndex + 1] : null;
            
            let diffContent;
            
            if (previousVersion) {
                // Compare the previous version with this version
                // This will show:
                // - Green: text that was added in this version
                // - Red strikethrough: text that was deleted from previous to this version
                diffContent = this.computeAdvancedHtmlDiff(previousVersion.content, versionContent);
            } else {
                // This is the oldest version, show as-is
                diffContent = versionContent;
            }
            
            // Show the diff content directly
            previewContent.innerHTML = diffContent;
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
            
            // Restore the prompt if it exists
            const promptEditor = document.getElementById('prompt-editor');
            if (promptEditor && this.selectedVersion.prompt) {
                promptEditor.innerHTML = this.selectedVersion.prompt;
            } else if (promptEditor) {
                promptEditor.innerHTML = '';
            }

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

    // Check if changes between two versions are only whitespace/formatting
    isOnlyWhitespaceChange(oldContent, newContent) {
        // Strip HTML and normalize whitespace for comparison
        const normalizeText = (html) => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const text = tempDiv.textContent || tempDiv.innerText || '';
            // Normalize all whitespace to single spaces and trim
            return text.replace(/\s+/g, ' ').trim();
        };

        const oldNormalized = normalizeText(oldContent);
        const newNormalized = normalizeText(newContent);
        
        return oldNormalized === newNormalized;
    }

    // Check if this version should be merged with the previous one
    shouldMergeWithPrevious(currentContent, previousContent) {
        if (!previousContent) return false;
        
        return this.isOnlyWhitespaceChange(previousContent, currentContent);
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
        
        // Set prompt with debugging
        const promptEditor = document.getElementById('prompt-editor');
        if (promptEditor) {
            promptEditor.innerHTML = essay.prompt || '';
            console.log('Prompt loaded via loadEssay:', essay.prompt || '(empty)');
        } else {
            console.error('Prompt editor element not found in loadEssay!');
        }

        // Set the last saved content to track changes
        this.lastSavedContent = {
            title: essay.title,
            content: essay.content,
            prompt: essay.prompt || ''
        };

        // Initialize version tracking
        this.lastVersionContent = {
            title: essay.title,
            content: essay.content,
            prompt: essay.prompt || ''
        };

        this.updateStats();
        this.updateAutosaveStatus('saved');
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
            // For new essays, ensure editor starts empty
            this.initializeNewEssay();
        }
    }

    initializeNewEssay() {
        // Clear all content for a fresh start
        document.getElementById('essay-title').value = '';

        // Ensure editor is completely empty for placeholder to show
        const editor = document.getElementById('editor');
        editor.innerHTML = '';
        editor.textContent = ''; // Remove any text nodes

        document.getElementById('prompt-editor').innerHTML = '';

        // Reset essay state
        this.currentEssayId = null;
        this.lastSavedContent = null;
        this.lastVersionContent = null;
        this.currentTags = [];

        // Update autosave status
        this.updateAutosaveStatus('saved');
    }

    async loadEssayById(id) {
        console.log('Loading essay with ID:', id);
        try {
            const response = await fetch(`/api/essays/${id}`);
            console.log('Response status:', response.status);

            if (response.ok) {
                const essay = await response.json();
                console.log('Essay loaded:', essay);
                console.log('Essay prompt:', essay.prompt);
                this.currentEssayId = essay.id;
                document.getElementById('essay-title').value = essay.title;
                document.getElementById('editor').innerHTML = essay.content;
                
                // Set prompt with debugging
                const promptEditor = document.getElementById('prompt-editor');
                if (promptEditor) {
                    promptEditor.innerHTML = essay.prompt || '';
                    console.log('Prompt set to:', essay.prompt || '(empty)');
                } else {
                    console.error('Prompt editor element not found!');
                }

                // Set tags
                if (essay.tags) {
                    this.currentTags = essay.tags.split(',').filter(tag => tag.trim());
                } else {
                    this.currentTags = [];
                }
                this.renderTags();

                // Initialize tracking
                this.lastSavedContent = {
                    title: essay.title,
                    content: essay.content,
                    prompt: essay.prompt || '',
                    tags: essay.tags || ''
                };
                this.lastVersionContent = {
                    title: essay.title,
                    content: essay.content,
                    prompt: essay.prompt || '',
                    tags: essay.tags || ''
                };

                this.updateStats();
                this.updateAutosaveStatus('saved');
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
let platform;
document.addEventListener('DOMContentLoaded', () => {
    platform = new EssayPlatform();
});