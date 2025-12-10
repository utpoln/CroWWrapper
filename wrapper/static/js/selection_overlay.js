(function () {
    if (window.__SCRAPER_ACTIVE__) return;
    window.__SCRAPER_ACTIVE__ = true;

    // --- CONFIGURATION ---
    const PANEL_WIDTH = 360; // [CRITICAL] Matches your CSS padding
    const BASE_URL = window.DJANGO_API_BASE || "";
    const API_ENDPOINT = `${BASE_URL}/api/stop_session/`;
    const WRAPPER_NAME = window.__WRAPPER_NAME__ || "Untitled Wrapper";

    // [CRITICAL] Use original URL for param detection
    const TARGET_URL = window.__ORIGINAL_URL__ || window.location.href;

    // --- CREATE UI SAFE ZONE ---
    try {
        document.body.style.transition = "padding-right 0.3s ease";
        document.body.style.paddingRight = `${PANEL_WIDTH}px`;
    } catch (e) { console.log("Layout adjustment warning:", e); }

    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);

    // --- ZAP MODE LOGIC ---
    let zapMode = false;
    function toggleZapMode() {
        zapMode = !zapMode;
        if (zapMode) {
            document.body.style.cursor = "crosshair";
            alert("Zap Mode ON: Click any annoying popup to delete it.");
        } else {
            document.body.style.cursor = "default";
        }
    }

    document.addEventListener("click", e => {
        if (host.contains(e.target)) return;
        if (zapMode) {
            e.preventDefault(); e.stopPropagation();
            e.target.remove(); toggleZapMode(); return;
        }
    }, true);

    shadow.innerHTML = `
    <style>
        {{ OVERLAY_CSS_PLACEHOLDER }}
    </style>

    <div id="sc-hover-box" class="sc-hover-box"></div>
    <div id="sc-layer-rows"></div>
    <div id="sc-layer-pagination"></div>

    <div id="sc-divider"></div>
    <div id="sc-zone-label">Builder Zone</div>

    <div id="sc-panel">
        <header>
            <div class="sc-logo">
                <svg class="sc-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path></svg>
                Data Wrapper - ${WRAPPER_NAME}
            </div>
            <button id="btn-exit" style="background:none; border:none; color:#666; font-size:16px; cursor:pointer;" title="Close">✕</button>
        </header>

        <div id="view-start" class="sc-content">
            <div id="params-container" style="display:none;">
                <div class="sc-params-box">
                    <div class="sc-box-title">Detected URL Parameters</div>
                    <p class="sc-desc" style="font-size:10px; margin-bottom:8px;">Rename these to allow dynamic changes.</p>
                    <div id="params-list"></div>
                </div>
            </div>
            <p class="sc-desc">Select an extraction mode:</p>
            <div class="sc-grid-buttons">
                <button id="btn-mode-a" class="sc-action-btn">
                    <svg class="sc-icon" style="width:20px; height:20px; margin-bottom:4px;" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                    List Mode
                </button>
                <button id="btn-mode-b" class="sc-action-btn">
                    <svg class="sc-icon" style="width:20px; height:20px; margin-bottom:4px;" viewBox="0 0 24 24"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path></svg>
                    Single Page
                </button>
            </div>
            <p class="sc-desc">Utilities:</p>
            <button id="btn-zap" class="sc-zap">⚡ ZAP ELEMENT (Remove Popup)</button>
        </div>

        <div id="view-working" style="display:none">
            <div class="sc-steps">
                <div id="step-1" class="sc-step active"><span class="sc-step-label">1. SELECT</span></div>
                <div id="step-2" class="sc-step"><span class="sc-step-label">2. TRAIN</span></div>
                <div id="step-3" class="sc-step"><span class="sc-step-label">3. COLUMNS</span></div>
            </div>
            <br>
            <div class="sc-content">
                <div class="sc-status-card">
                    <h4 id="mode-title">Mode Active</h4>
                    <p id="instruction">Initializing...</p>
                </div>
                <div id="pagination-section" class="sc-pagination-box">
                    <div class="sc-toggle-row">
                        <span>Infinite Scroll</span>
                        <label class="sc-switch"><input type="checkbox" id="chk-scroll"><span class="sc-slider"></span></label>
                    </div>
                    <button id="btn-set-next" class="sc-select-next">Target "Next" Button</button>
                </div>
                <div style="display:flex; gap:8px;">
                    <button id="btn-preview" class="sc-full-btn sc-primary" style="display:none;">PREVIEW</button>
                    <button id="btn-reset" class="sc-full-btn sc-secondary">RESET</button>
                </div>
            </div>
        </div>
    </div>

    <div id="sc-popover">
        <label>Column Name</label>
        <input type="text" id="col-name" placeholder="Title, Price...">
        <div class="sc-pop-actions">
            <button id="btn-save" class="sc-full-btn sc-primary">SAVE</button>
            <button id="btn-cancel" class="sc-full-btn sc-secondary">CANCEL</button>
        </div>
    </div>

    <div id="sc-modal">
        <div id="sc-modal-content">
            <h2 style="margin:0 0 10px 0; font-size:16px;">Data Preview</h2>
            <div id="sc-table-container"></div>
            <div class="sc-modal-footer">
                <button id="btn-close-modal" class="sc-full-btn sc-secondary" style="width:auto">EDIT</button>
                <button id="btn-save-server" class="sc-full-btn sc-primary" style="width:auto">SAVE & FINISH</button>
            </div>
        </div>
    </div>
    `;

    // --- LOGIC ---
    const ui = {
        panelStart: shadow.querySelector('#view-start'),
        panelWork: shadow.querySelector('#view-working'),
        hover: shadow.querySelector('#sc-hover-box'),
        rowsLayer: shadow.querySelector('#sc-layer-rows'),
        pagLayer: shadow.querySelector('#sc-layer-pagination'),
        popover: shadow.querySelector('#sc-popover'),
        modal: shadow.querySelector('#sc-modal'),
        input: shadow.querySelector('#col-name'),
        btnNext: shadow.querySelector('#btn-set-next'),
        chkScroll: shadow.querySelector('#chk-scroll'),
        pagSection: shadow.querySelector('#pagination-section'),
        steps: [shadow.querySelector('#step-1'), shadow.querySelector('#step-2'), shadow.querySelector('#step-3')],
        paramsContainer: shadow.querySelector('#params-container'),
        paramsList: shadow.querySelector('#params-list')
    };

    let state = { mode: null, step: 0, subMode: null, row1: null, rowXPath: null, cols: [], pagination: { type: 'none', xpath: null }, tempEl: null };

    // --- URL PARAMETER LOGIC ---
    let detectedParams = [];
    function initParams() {
        try {
            const urlObj = new URL(TARGET_URL);
            const searchParams = urlObj.searchParams;
            detectedParams = [];
            ui.paramsList.innerHTML = '';
            searchParams.forEach((value, key) => detectedParams.push({ key, value }));
            if (detectedParams.length > 0) {
                ui.paramsContainer.style.display = 'block';
                detectedParams.forEach((p, index) => {
                    const row = document.createElement('div');
                    row.className = 'sc-param-row';
                    row.innerHTML = `
                        <div class="sc-param-key" title="${p.key}=${p.value}">${p.key}</div>
                        <input type="text" class="sc-param-input" placeholder="Label (e.g. Type)" data-idx="${index}">
                    `;
                    ui.paramsList.appendChild(row);
                });
            }
        } catch (e) { console.error("Failed to parse URL params:", e); }
    }
    initParams();

    // --- UTILS ---
    function updateSteps(current) {
        ui.steps.forEach((el, i) => {
            el.className = 'sc-step';
            if (i < current) el.classList.add('completed');
            if (i === current) el.classList.add('active');
        });
    }

    function getXPath(el) {
        if (!el || el.nodeType !== 1) return '';
        if (el.id) return `//*[@id="${el.id}"]`;
        const parts = [];
        while (el && el.nodeType === 1) {
            let idx = 0, sib = el.previousElementSibling;
            while (sib) { if (sib.tagName === el.tagName) idx++; sib = sib.previousElementSibling; }
            parts.unshift(`${el.tagName.toLowerCase()}[${idx + 1}]`);
            el = el.parentElement;
        }
        return '/' + parts.join('/');
    }

    function findRowXPath(el1, el2) {
        const path1 = getXPath(el1).split('/');
        const path2 = getXPath(el2).split('/');
        let diffIndex = -1, len = Math.min(path1.length, path2.length);
        for (let i = 0; i < len; i++) { if (path1[i] !== path2[i]) { diffIndex = i; break; } }
        if (diffIndex === -1) return null;
        const base = path1[diffIndex].replace(/\[\d+\]/, '');
        const parts = path1.slice(0, diffIndex); parts.push(base);
        return parts.join('/');
    }

    function getRelativeXPath(rowRoot, field) {
        if (rowRoot === field) return '.';
        const parts = [];
        let curr = field;
        while (curr && curr !== rowRoot) {
            let idx = 0, sib = curr.previousElementSibling;
            while (sib) { if (sib.tagName === curr.tagName) idx++; sib = sib.previousElementSibling; }
            parts.unshift(`${curr.tagName.toLowerCase()}[${idx + 1}]`);
            curr = curr.parentElement;
        }
        if (curr !== rowRoot) return null;
        return './' + parts.join('/');
    }

    function reset() {
        state = { mode: null, step: 0, subMode: null, row1: null, rowXPath: null, cols: [], pagination: { type: 'none', xpath: null }, tempEl: null };
        ui.panelStart.style.display = 'block'; ui.panelWork.style.display = 'none';
        ui.rowsLayer.innerHTML = ''; ui.pagLayer.innerHTML = ''; ui.hover.style.display = 'none';
        ui.chkScroll.checked = false; ui.btnNext.innerHTML = 'Target "Next" Button';
        ui.btnNext.classList.remove('active-mode');
        shadow.querySelectorAll('.sc-badge').forEach(b => b.remove());
    }

    function addBadge(el, text, type = 'data') {
        const b = document.createElement('div'); b.className = 'sc-badge';
        if (type === 'training') b.classList.add('training');
        const r = el.getBoundingClientRect();

        // --- SAFE ZONE CLAMP FOR BADGES ---
        const maxLeft = window.innerWidth - PANEL_WIDTH - 100;
        const safeLeft = Math.min(r.left + window.scrollX, maxLeft + window.scrollX);

        b.style.top = (window.scrollY + r.top - 25) + 'px';
        b.style.left = safeLeft + 'px';
        b.textContent = text;
        shadow.appendChild(b);
    }

    // --- EVENTS ---
    document.addEventListener('mousemove', (e) => {
        if (ui.modal.style.display === 'flex') return;

        // 1. Hide if mouse enters the Panel Zone
        if (e.clientX > window.innerWidth - PANEL_WIDTH) {
            ui.hover.style.display = 'none';
            return;
        }

        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || host.contains(el)) { ui.hover.style.display = 'none'; return; }

        const r = el.getBoundingClientRect();

        // 2. Clamp the Width visually
        const maxWidth = (window.innerWidth - PANEL_WIDTH) - r.left;
        const safeWidth = Math.min(r.width, maxWidth);

        ui.hover.style.display = 'block';
        ui.hover.style.top = r.top + 'px';
        ui.hover.style.left = r.left + 'px';
        ui.hover.style.width = safeWidth + 'px';
        ui.hover.style.height = r.height + 'px';

        // --- HOVER COLOR LOGIC ---
        if (state.subMode === 'selecting_pagination') {
            ui.hover.style.borderColor = 'var(--danger)';
            ui.hover.style.backgroundColor = 'var(--danger-dim)';
            ui.hover.style.borderStyle = 'solid';
        } else if (state.mode === 'A' && state.step === 1) {
            ui.hover.style.borderColor = 'var(--training-blue)';
            ui.hover.style.backgroundColor = 'var(--training-dim)';
            ui.hover.style.borderStyle = state.row1 ? 'dashed' : 'solid';
        } else {
            ui.hover.style.borderColor = 'var(--primary)';
            ui.hover.style.backgroundColor = 'var(--primary-dim)';
            ui.hover.style.borderStyle = 'solid';
        }
    });

    document.addEventListener('click', (e) => {
        if (host.contains(e.target)) return;
        if (e.clientX > window.innerWidth - PANEL_WIDTH) return; // Ignore click in safe zone

        if (!state.mode) return;
        e.preventDefault(); e.stopPropagation();
        const el = document.elementFromPoint(e.clientX, e.clientY);

        if (state.subMode === 'selecting_pagination') {
            const xpath = getXPath(el);
            state.pagination = { type: 'button', xpath: xpath };
            state.subMode = null;
            ui.btnNext.classList.remove('active-mode');
            ui.btnNext.innerHTML = '✓ Button Targeted';
            ui.chkScroll.checked = false;
            ui.pagLayer.innerHTML = '';
            const r = el.getBoundingClientRect();
            const div = document.createElement('div'); div.className = 'sc-detected-row';
            div.style.borderColor = '#ef4444';
            div.style.top = (window.scrollY + r.top) + 'px'; div.style.left = (window.scrollX + r.left) + 'px';
            div.style.width = r.width + 'px'; div.style.height = r.height + 'px';
            ui.pagLayer.appendChild(div);
            return;
        }

        if (state.mode === 'A') {
            if (state.step === 1) {
                if (!state.row1) {
                    state.row1 = el;
                    addBadge(el, "Item 1", "training");
                    shadow.querySelector('#instruction').innerHTML = "Click <b>Item 2</b> (vertically below Item 1).";
                    updateSteps(1);
                }
                else {
                    // --- [CRITICAL FIX] SINGLE ROW DETECTION ---
                    const rect1 = state.row1.getBoundingClientRect();
                    const rect2 = el.getBoundingClientRect();

                    if (Math.abs(rect1.top - rect2.top) < 30) {
                        if (confirm("List Mode requires 2 DIFFERENT rows to detect a pattern.\n\nIt looks like you clicked the same row (or only 1 row exists).\n\nSwitch to Single Page Mode?")) {
                            state.mode = 'B';
                            ui.panelStart.style.display = 'none'; ui.panelWork.style.display = 'block';
                            ui.pagSection.style.display = 'none';
                            shadow.querySelector('.sc-steps').style.display = 'none';
                            shadow.querySelector('#instruction').innerHTML = "Single Page Mode: Click elements to extract.";
                            shadow.querySelectorAll('.sc-badge').forEach(b => b.remove());
                            state.row1 = null;
                            return;
                        }
                        return;
                    }

                    addBadge(el, "Item 2", "training");
                    const pattern = findRowXPath(state.row1, el);
                    if (pattern) {
                        state.rowXPath = pattern; state.step = 2;
                        ui.rowsLayer.innerHTML = '';
                        const res = document.evaluate(pattern, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                        for (let i = 0; i < res.snapshotLength; i++) {
                            const node = res.snapshotItem(i);
                            if (node.nodeType === 1) {
                                const rr = node.getBoundingClientRect();
                                const d = document.createElement('div'); d.className = 'sc-detected-row';
                                // Clamp detected rows too
                                const maxWidth = (window.innerWidth - PANEL_WIDTH) - rr.left;
                                d.style.top = (window.scrollY + rr.top) + 'px'; d.style.left = (window.scrollX + rr.left) + 'px';
                                d.style.width = Math.min(rr.width, maxWidth) + 'px'; d.style.height = rr.height + 'px';
                                ui.rowsLayer.appendChild(d);
                            }
                        }
                        shadow.querySelector('#instruction').innerHTML = "Click text fields to map (Green).";
                        shadow.querySelector('#btn-preview').style.display = 'block';
                        updateSteps(2);
                    } else { alert("Pattern not found. Try selecting elements closer in structure."); reset(); }
                }
            } else if (state.step === 2) {
                const rows = document.evaluate(state.rowXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                let pRow = null; for (let i = 0; i < rows.snapshotLength; i++) { if (rows.snapshotItem(i).contains(el)) { pRow = rows.snapshotItem(i); break; } }
                if (pRow) {
                    const relPath = getRelativeXPath(pRow, el);
                    if (relPath) openPopover(el, relPath);
                }
            }
        }
        else {
            // Mode B (Single Page)
            openPopover(el, getXPath(el));
            shadow.querySelector('#btn-preview').style.display = 'block';
        }
    }, true);

    function openPopover(el, path) {
        state.tempEl = { el, path };
        ui.input.value = '';
        ui.popover.style.display = 'block';
        const r = el.getBoundingClientRect();

        // Safe Zone Clamp for Popover
        const maxLeft = window.innerWidth - PANEL_WIDTH - 280; // 280 popover width
        const safeLeft = Math.min(r.left + window.scrollX, maxLeft + window.scrollX);

        ui.popover.style.top = (window.scrollY + r.bottom + 12) + 'px';
        ui.popover.style.left = safeLeft + 'px';
        ui.input.focus();
    }

    ui.btnNext.onclick = () => { state.subMode = 'selecting_pagination'; ui.btnNext.innerHTML = 'Select "Next"...'; ui.btnNext.classList.add('active-mode'); };
    ui.chkScroll.onchange = (e) => { if (e.target.checked) { state.pagination = { type: 'scroll', xpath: null }; ui.btnNext.innerHTML = 'Target "Next"'; ui.pagLayer.innerHTML = ''; } };

    shadow.querySelector('#btn-save').onclick = () => {
        const n = ui.input.value || 'Col ' + (state.cols.length + 1);
        state.cols.push({ name: n, path: state.tempEl.path });
        addBadge(state.tempEl.el, n);
        ui.popover.style.display = 'none';

        if (state.cols.length > 0) updateSteps(3);
    };

    shadow.querySelector('#btn-cancel').onclick = () => ui.popover.style.display = 'none';

    // --- ZAP BUTTON ---
    shadow.querySelector('#btn-zap').onclick = toggleZapMode;

    shadow.querySelector('#btn-preview').onclick = () => {
        // Mark Step 3 as Green
        updateSteps(3);

        let html = `<thead><tr>${state.cols.map(c => `<th>${c.name}</th>`).join('')}</tr></thead><tbody>`;
        if (state.mode === 'A') {
            const rows = document.evaluate(state.rowXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            const max = Math.min(rows.snapshotLength, 5);
            for (let i = 0; i < max; i++) {
                const r = rows.snapshotItem(i); html += '<tr>';
                state.cols.forEach(c => { try { const node = document.evaluate(c.path, r, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; html += `<td>${node ? node.innerText.substring(0, 50) : ''}</td>`; } catch (e) { } });
                html += '</tr>';
            }
        } else {
            html += '<tr>'; state.cols.forEach(c => { try { const node = document.evaluate(c.path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; html += `<td>${node ? node.innerText.substring(0, 50) : ''}</td>`; } catch (e) { } }); html += '</tr>';
        }
        html += '</tbody>';
        shadow.querySelector('#sc-table-container').innerHTML = `<table>${html}</table>`;
        ui.modal.style.display = 'flex';
    };
    shadow.querySelector('#btn-close-modal').onclick = () => {
        ui.modal.style.display = 'none';
        updateSteps(2); // Back to Active
    };

    shadow.querySelector('#btn-save-server').onclick = async () => {
        const btn = shadow.querySelector('#btn-save-server');
        const oldText = btn.innerHTML;
        btn.innerHTML = 'Saving...'; btn.disabled = true;

        // --- [NEW] GATHER PARAMETER INPUTS ---
        const paramInputs = shadow.querySelectorAll('.sc-param-input');
        const finalParams = detectedParams.map((p, i) => ({
            key: p.key,
            value: p.value,
            label: paramInputs[i].value.trim() || p.key
        }));

        const payload = {
            config: {
                wrapper_name: WRAPPER_NAME,
                url: TARGET_URL,
                mode: state.mode,
                url_params: finalParams, // Added to payload
                row_xpath: state.rowXPath || "",
                pagination: state.pagination,
                columns: state.cols.map(c => ({ name: c.name, xpath: c.path || c.xpath }))
            }
        };

        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok) {
                window.parent.postMessage({
                    type: 'SCRAPER_COMPLETED',
                    saved_filename: data.file
                }, '*');
                host.remove(); window.__SCRAPER_ACTIVE__ = false;
            }
            else { alert("Error saving: " + (data.error || "Unknown")); }
        } catch (e) { console.error(e); alert("Network Error"); }
        finally { btn.innerHTML = oldText; btn.disabled = false; }
    };

    // --- MODE SWITCHING ---
    shadow.querySelector('#btn-mode-a').onclick = () => {
        if (zapMode) toggleZapMode();
        state.mode = 'A'; state.step = 1;
        ui.panelStart.style.display = 'none'; ui.panelWork.style.display = 'block';
        ui.pagSection.style.display = 'block';
        shadow.querySelector('.sc-steps').style.display = 'flex';
        shadow.querySelector('#instruction').innerHTML = "Click <b>first item</b>.";
        updateSteps(0);
    };

    shadow.querySelector('#btn-mode-b').onclick = () => {
        if (zapMode) toggleZapMode();
        state.mode = 'B';
        ui.panelStart.style.display = 'none'; ui.panelWork.style.display = 'block';
        ui.pagSection.style.display = 'none';
        shadow.querySelector('.sc-steps').style.display = 'none';
        shadow.querySelector('#instruction').innerHTML = "Click elements.";
    };

    shadow.querySelector('#btn-reset').onclick = reset;

    // --- [CRITICAL FIX] PROTECTED EXIT ---
    shadow.querySelector('#btn-exit').onclick = () => {
        // This functionality is preserved exactly as it was
        if (confirm("Exit and clear current session?")) {
            window.parent.postMessage({ type: 'SCRAPER_EXIT' }, '*');
            host.remove(); window.__SCRAPER_ACTIVE__ = false;
        }
    };
})();