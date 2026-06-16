/**
 * File Converter Pro - Application Logic
 * Implements category management, dynamic dropdown rendering, drag-and-drop mechanics,
 * conversion animations, progress reporting, and backend-driven downloads.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Application State ---
    let state = {
        selectedCategory: null, // 'audio', 'video', 'image', 'document'
        selectedFile: null,
        targetFormat: null,
        lastConvertedBlob: null
    };

    // --- Format Configuration ---
    const CATEGORY_FORMATS = {
        audio: ['mp3', 'wav', 'opus'],
        video: ['mp4', 'mkv', 'mov', 'avi', 'dv', 'mp3', 'wav', 'opus'],
        image: ['png', 'jpg', 'webp', 'pdf'],
        document: ['docx', 'pdf']
    };

    // --- DOM Elements ---
    // Sections
    const secCategorySelection = document.getElementById('step-category-selection');
    const secUploadConversion = document.getElementById('step-upload-conversion');
    const secProcessing = document.getElementById('step-processing');
    const secSuccess = document.getElementById('step-success');

    // Category Cards
    const categoryCards = document.querySelectorAll('.category-card');

    // Upload Elements
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const uploadLimitInfo = document.getElementById('upload-limit-info');

    // Selected File Elements
    const selectedFileDisplay = document.getElementById('selected-file-display');
    const displayFileName = document.getElementById('display-file-name');
    const displayFileSize = document.getElementById('display-file-size');
    const fileTypeIconContainer = document.getElementById('file-type-icon');
    const btnRemoveFile = document.getElementById('btn-remove-file');

    // Conversion Control Settings
    const conversionSettings = document.getElementById('conversion-settings');
    const targetFormatSelect = document.getElementById('target-format-select');
    const btnStartConvert = document.getElementById('btn-start-convert');

    // Processing Elements
    const processingStatusLabel = document.getElementById('processing-status-label');
    const circularProgressBar = document.getElementById('circular-progress-bar');
    const progressPercentageText = document.getElementById('progress-percentage-text');
    const linearProgressBarFill = document.getElementById('linear-progress-bar-fill');

    // Logs Elements
    const logStage1 = document.getElementById('log-stage-1');
    const logStage2 = document.getElementById('log-stage-2');
    const logStage3 = document.getElementById('log-stage-3');

    // Success Screen Elements
    const successFileName = document.getElementById('success-file-name');
    const successOriginalType = document.getElementById('success-original-type');
    const successConvertedType = document.getElementById('success-converted-type');
    const btnDownloadResult = document.getElementById('btn-download-result');
    const btnConvertAnother = document.getElementById('btn-convert-another');

    // --- SVGs for Dynamic Icons ---
    const SVG_ICONS = {
        audio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
        video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`,
        image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
        document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
        generic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`
    };

    // --- Initialization & Category Selector ---
    categoryCards.forEach(card => {
        // Handle keyboard access (Enter key)
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectCategory(card);
            }
        });

        // Click selection
        card.addEventListener('click', () => {
            selectCategory(card);
        });
    });

    function selectCategory(cardElement) {
        // Toggle Active Classes
        categoryCards.forEach(c => {
            c.classList.remove('active');
            c.setAttribute('aria-pressed', 'false');
        });
        cardElement.classList.add('active');
        cardElement.setAttribute('aria-pressed', 'true');

        // Update selected state
        state.selectedCategory = cardElement.dataset.category;

        // Reset previous file if selected, since category changed
        resetFileSelection();

        // Configure upload constraints text dynamically
        updateUploadConstraints();

        // Render target drop-down content
        populateTargetDropdown();

        // Reveal Step 2
        secUploadConversion.classList.remove('hidden');

        // Scroll to Step 2 smoothly
        secUploadConversion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function updateUploadConstraints() {
        uploadLimitInfo.innerText = 'Supports typical files of type category. Maximum size: 50MB';
    }

    function populateTargetDropdown() {
        targetFormatSelect.innerHTML = '';

        const formats = CATEGORY_FORMATS[state.selectedCategory];
        formats.forEach(format => {
            const opt = document.createElement('option');
            opt.value = format;
            opt.textContent = String(format).toUpperCase();
            targetFormatSelect.appendChild(opt);
        });

        state.targetFormat = formats[0];
    }

    targetFormatSelect.addEventListener('change', (e) => {
        state.targetFormat = e.target.value;
    });

    // --- Drag and Drop Interface & Input Trigger ---
    uploadZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.add('dragging');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.remove('dragging');
        }, false);
    });

    uploadZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            handleFileSelection(files[0]);
        }
    });

    // --- Selected File State Management ---
    function handleFileSelection(file) {
        state.selectedFile = file;
        state.lastConvertedBlob = null;

        displayFileName.textContent = file.name;
        displayFileSize.textContent = formatBytes(file.size);

        fileTypeIconContainer.innerHTML = SVG_ICONS[state.selectedCategory] || SVG_ICONS.generic;

        uploadZone.classList.add('hidden');
        selectedFileDisplay.classList.remove('hidden');
        conversionSettings.classList.remove('hidden');

        conversionSettings.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    btnRemoveFile.addEventListener('click', (e) => {
        e.stopPropagation();
        resetFileSelection();
    });

    function resetFileSelection() {
        state.selectedFile = null;
        state.lastConvertedBlob = null;
        fileInput.value = '';

        selectedFileDisplay.classList.add('hidden');
        conversionSettings.classList.add('hidden');
        uploadZone.classList.remove('hidden');

        secSuccess.classList.add('hidden');
    }

    // --- Format Bytes helper ---
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // --- Backend Conversion Engine ---
    let uiInterval = null;

    btnStartConvert.addEventListener('click', async () => {
        if (!state.selectedFile) return;

        // Hide Step 2 panel, Show Processing stage
        secUploadConversion.classList.add('hidden');
        secProcessing.classList.remove('hidden');
        secProcessing.scrollIntoView({ behavior: 'smooth', block: 'start' });

        state.lastConvertedBlob = null;

        // Start UI simulation
        startStageUISequence();

        try {
            const formData = new FormData();
            formData.append('file', state.selectedFile);
            formData.append('category', state.selectedCategory);
            formData.append('targetFormat', state.targetFormat);

            processingStatusLabel.innerText = 'Uploading & running conversion pipeline...';

            const response = await fetch('/api/convert', { method: 'POST', body: formData });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`Server error (${response.status}). ${text}`);
            }

            const blob = await response.blob();
            state.lastConvertedBlob = blob;

            updateProgressVisuals(100);
            logStage1.classList.remove('active');
            logStage2.classList.remove('active');
            logStage3.classList.remove('active');
            logStage1.classList.add('complete');
            logStage2.classList.add('complete');
            logStage3.classList.add('complete');

            transitionToSuccess();
        } catch (err) {
            console.error(err);
            processingStatusLabel.innerText = `Conversion failed: ${err.message}`;

            logStage1.classList.remove('active');
            logStage2.classList.remove('active');
            logStage3.classList.remove('active');
            logStage3.classList.add('complete');

            secProcessing.classList.add('hidden');
            secUploadConversion.classList.remove('hidden');
        }
    });

    function startStageUISequence() {
        updateProgressVisuals(0);
        processingStatusLabel.innerText = 'Engine is preparing your conversion...';

        resetLogs();

        const circumference = 2 * Math.PI * 50;
        circularProgressBar.style.strokeDasharray = circumference;
        circularProgressBar.style.strokeDashoffset = circumference;

        let progress = 0;
        logStage1.classList.add('active');

        const duration = 4500; // approximate UI duration
        const intervalTime = 40;
        const step = (100 / (duration / intervalTime));

        if (uiInterval) clearInterval(uiInterval);

        uiInterval = setInterval(() => {
            progress += step;
            if (progress >= 100) {
                progress = 100;
                clearInterval(uiInterval);
                uiInterval = null;
            }

            updateProgressVisuals(progress);

            if (progress >= 30 && progress < 70) {
                if (!logStage1.classList.contains('complete')) {
                    logStage1.classList.remove('active');
                    logStage1.classList.add('complete');
                    logStage2.classList.add('active');
                    processingStatusLabel.innerText = 'Processing formats and codecs...';
                }
            } else if (progress >= 70) {
                if (!logStage2.classList.contains('complete')) {
                    logStage2.classList.remove('active');
                    logStage2.classList.add('complete');
                    logStage3.classList.add('active');
                    processingStatusLabel.innerText = 'Optimizing final output structure...';
                }
            }
        }, intervalTime);
    }

    function updateProgressVisuals(percent) {
        percent = Math.min(100, Math.max(0, percent));
        progressPercentageText.innerText = `${Math.floor(percent)}%`;
        linearProgressBarFill.style.width = `${percent}%`;

        const circumference = 2 * Math.PI * 50;
        const offset = circumference - (percent / 100) * circumference;
        circularProgressBar.style.strokeDashoffset = offset;
    }

    function resetLogs() {
        [logStage1, logStage2, logStage3].forEach(log => {
            log.classList.remove('active', 'complete');
        });
    }

    // --- Success Stage & Download ---
    function transitionToSuccess() {
        secProcessing.classList.add('hidden');
        secSuccess.classList.remove('hidden');
        secSuccess.scrollIntoView({ behavior: 'smooth', block: 'start' });

        const originalName = state.selectedFile.name;
        const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
        const convertedName = `${nameWithoutExt}.${state.targetFormat}`;

        successFileName.innerText = convertedName;
        successOriginalType.innerText = `${state.selectedCategory.toUpperCase()} (${originalName.split('.').pop().toUpperCase()})`;
        successConvertedType.innerText = `Target: ${state.targetFormat.toUpperCase()}`;
    }

    btnDownloadResult.addEventListener('click', () => {
        if (!state.lastConvertedBlob) return;

        const originalName = state.selectedFile.name;
        const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
        const convertedName = `${nameWithoutExt}.${state.targetFormat}`;

        const url = URL.createObjectURL(state.lastConvertedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = convertedName;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 150);
    });

    btnConvertAnother.addEventListener('click', () => {
        secSuccess.classList.add('hidden');
        resetFileSelection();
        secUploadConversion.classList.remove('hidden');
        secUploadConversion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

