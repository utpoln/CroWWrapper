const API_BASE = window.crowConfig.apiBase;

const views = {
    dashboard: document.getElementById('dashboard-view'),
    builder: document.getElementById('builder-view'),
    create: document.getElementById('createModal'),
    run: document.getElementById('runModal'),
    results: document.getElementById('resultsModal')
};


// --- 1. LOAD WRAPPERS ---
// GLOBAL VARIABLES
let allWrappers = []; // Store data here
let activeParams = new URLSearchParams();

// 1. LOAD WRAPPERS (Fetch & Store)
async function loadWrappers() {
    const grid = document.getElementById('wrapperGrid');

    try {
        const res = await fetch(`${API_BASE}/api/list_wrappers/`);
        const data = await res.json();

        // Store global reference
        allWrappers = data.wrappers || [];

        // Initial Render
        renderWrappers(allWrappers);

    } catch (e) {
        console.error(e);
        grid.innerHTML = '<div class="empty-msg">Error loading wrappers.</div>';
    }
}

// 2. SEARCH FILTER FUNCTION
function filterWrappers() {
    const query = document.getElementById('searchInput').value.toLowerCase();

    if (!query) {
        renderWrappers(allWrappers); // Show all
        return;
    }

    const filtered = allWrappers.filter(w => {
        // Search in Name
        if (w.wrapper_name.toLowerCase().includes(query)) return true;
        // Search in URL
        if (w.url.toLowerCase().includes(query)) return true;
        // Search in Column Names
        if (w.columns_data && w.columns_data.some(c => c.toLowerCase().includes(query))) return true;

        return false;
    });

    renderWrappers(filtered);
}

// 3. RENDER FUNCTION (Decoupled from Fetch)
function renderWrappers(list) {
    const grid = document.getElementById('wrapperGrid');
    const myFiles = JSON.parse(localStorage.getItem('crow_my_files') || '[]');

    grid.innerHTML = '';

    if (list.length === 0) {
        grid.innerHTML = '<div class="empty-msg">No wrappers found matching your search.</div>';
        return;
    }

    list.forEach(w => {
        let hostname = "Unknown Site";
        try {
            const u = new URL(w.url);
            hostname = u.hostname.replace('www.', '');
        } catch (e) { }

        // --- NEW PARAMETER DISPLAY LOGIC ---
        let paramsHtml = '';

        // Check if we have saved params (The new feature)
        const hasSavedParams = w.url_params && w.url_params.length > 0;

        if (hasSavedParams) {
            paramsHtml = `<div class="card-section-label">Configurable Inputs</div><div class="card-params">`;
            w.url_params.slice(0, 3).forEach(p => {
                // Show LABEL if available, otherwise Key
                const displayKey = p.label || p.key;
                paramsHtml += `<div class="param-pill"><span class="param-key">${displayKey}:</span><span class="param-val">${p.value}</span></div>`;
            });
            if (w.url_params.length > 3) paramsHtml += `<div class="param-pill" style="color:#9ca3af">+${w.url_params.length - 3}</div>`;
            paramsHtml += `</div>`;
        }
        // Fallback: Parse URL for old wrappers
        else {
            let paramsMap = new Map();
            try {
                const u = new URL(w.url);
                u.searchParams.forEach((val, key) => paramsMap.set(key, val));
            } catch (e) { }

            if (paramsMap.size > 0) {
                paramsHtml = `<div class="card-section-label">Configurable Inputs</div><div class="card-params">`;
                let count = 0;
                paramsMap.forEach((val, key) => {
                    if (count < 3) paramsHtml += `<div class="param-pill"><span class="param-key">${key}:</span><span class="param-val">${val}</span></div>`;
                    count++;
                });
                if (paramsMap.size > 3) paramsHtml += `<div class="param-pill" style="color:#9ca3af">+${paramsMap.size - 3}</div>`;
                paramsHtml += `</div>`;
            } else {
                paramsHtml = `<div class="card-params"><div class="param-pill" style="background:#f9fafb; border:1px dashed #e5e7eb; color:#9ca3af;">Static Page / No Inputs</div></div>`;
            }
        }

        const isOwner = myFiles.includes(w.filename);
        let actionButton = isOwner
            ? `<button class="btn-icon" onclick="deleteWrapper('${w.filename}')" title="Delete Wrapper">✕</button>`
            : `<button class="btn-icon locked" title="Read Only"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></button>`;

        // Prepare data for the Modal
        const columnsData = JSON.stringify(w.columns_data || []).replace(/"/g, '&quot;');
        // [CRITICAL] Pass the url_params object safely
        const paramsData = JSON.stringify(w.url_params || []).replace(/"/g, '&quot;');

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-click-area" onclick='openRunModal("${w.filename}", "${w.url}", ${columnsData}, ${paramsData})'></div>
            <div class="card-top">
                <div class="domain-badge"><img src="https://www.google.com/s2/favicons?domain=${hostname}" class="domain-icon">${hostname}</div>
                ${actionButton}
            </div>
            <div class="card-title">${w.wrapper_name}</div>
            ${paramsHtml}
            <div class="card-stats">
                <div class="stat-item"><span class="stat-label">Mode</span><span class="stat-value">${w.mode === 'A' ? 'List' : 'Single'}</span></div>
                <div class="stat-item"><span class="stat-label">Fields</span><span class="stat-value">${w.columns} Columns</span></div>
            </div>
            <div class="card-cta"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Run Extraction</div>
        `;
        grid.appendChild(card);
    });
}

async function startSession() {
    const name = document.getElementById('inputName').value.trim();
    const url = document.getElementById('inputUrl').value.trim();
    if (!name || !url) return alert("Required");

    views.create.classList.add('hidden');
    views.dashboard.classList.add('hidden');
    views.builder.classList.remove('hidden');

    document.getElementById('activeWrapperName').innerText = name;
    document.getElementById('activeStatus').innerText = "Connecting...";

    const iframe = document.getElementById('site-viewer');
    const placeholder = document.getElementById('builderPlaceholder');
    placeholder.style.display = 'block'; iframe.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/api/start_session/`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url, wrapper_name: name })
        });
        const data = await response.json();
        if (data.redirect_url) {
            iframe.src = data.redirect_url;
            iframe.onload = () => {
                iframe.style.display = 'block'; placeholder.style.display = 'none';
                document.getElementById('activeStatus').innerText = "Active";
                document.getElementById('activeStatus').style.color = "#10b981";
                const warning = document.getElementById('proxy-warning');
                if (warning) warning.style.display = 'flex';
            };
        } else { alert(data.error); closeBuilder(); }
    } catch (e) { alert("Error"); closeBuilder(); }
}

window.addEventListener('message', e => {
    if (e.data?.type === 'SCRAPER_COMPLETED') {
        const actualFilename = e.data.saved_filename;
        if (actualFilename) {
            const myFiles = JSON.parse(localStorage.getItem('crow_my_files') || '[]');
            if (!myFiles.includes(actualFilename)) {
                myFiles.push(actualFilename);
                localStorage.setItem('crow_my_files', JSON.stringify(myFiles));
            }
        }
        alert("Wrapper Saved Successfully!");
        closeBuilder();
    }
    if (e.data?.type === 'SCRAPER_EXIT') closeBuilder();
});

// --- UPDATED OPEN RUN MODAL ---
function openRunModal(filename, savedUrl, columnsList, savedParams) {
    document.getElementById('runFilename').value = filename;
    document.getElementById('runBaseUrl').value = savedUrl; // Set Raw URL immediately

    // Render Column Manager
    renderColumnManager(columnsList || []);

    // --- PARAMETER LOGIC ---
    activeParams = [];

    // Case 1: We have the new saved params structure with Labels
    if (savedParams && savedParams.length > 0) {
        // Clone them into activeParams so we can edit values without changing the default
        activeParams = savedParams.map(p => ({
            key: p.key,
            value: p.value,
            label: p.label || p.key // Fallback to key if label missing
        }));
    }
    // Case 2: Old Wrapper (No url_params), parse from URL string
    else {
        try {
            const urlObj = new URL(savedUrl);
            urlObj.searchParams.forEach((val, key) => {
                activeParams.push({ key: key, value: val, label: key });
            });
        } catch (e) { console.error("Error parsing URL for params", e); }
    }

    renderParamInputs();
    updateUrlPreview();
    views.run.classList.remove('hidden');
}

// --- NEW: RENDER COLUMN MANAGER ---
function renderColumnManager(columns) {
    const container = document.getElementById('columnManager');
    container.innerHTML = '';

    if (!columns || columns.length === 0) {
        container.innerHTML = '<div style="padding:10px; color:#999; font-size:11px;">No column info available.</div>';
        return;
    }

    columns.forEach(colName => {
        const row = document.createElement('div');
        row.className = 'col-row';

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = true;
        chk.className = 'col-include';
        chk.dataset.original = colName;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = colName;
        input.className = 'form-control col-rename';

        row.appendChild(chk);
        row.appendChild(input);
        container.appendChild(row);
    });
}

function renderParamInputs() {
    const container = document.getElementById('paramsContainer');
    container.innerHTML = '';

    if (activeParams.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#999; font-size:12px; padding:20px;">No configurable parameters found.</div>';
        return;
    }

    activeParams.forEach((param, index) => {
        const row = document.createElement('div');
        row.className = 'param-row';

        // 1. Label (The User Friendly Name)
        const label = document.createElement('div');
        label.className = 'param-label';
        label.innerText = param.label; // Displays "A", "D", "Source" etc.

        // 2. Input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control';
        input.value = param.value;

        // Bind input to the array index
        input.dataset.index = index;

        input.addEventListener('input', (e) => {
            const idx = e.target.dataset.index;
            // Update the global state
            activeParams[idx].value = e.target.value;
            updateUrlPreview();
        });

        // 3. Hint
        const hint = document.createElement('div');
        hint.className = 'param-hint';
        // Helper text showing the actual technical key
        hint.innerHTML = `Map to URL key: <code>${param.key}</code><br>Supports batching (comma separated)`;

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(hint);
        container.appendChild(row);
    });
}

function updateUrlPreview() {
    const base = document.getElementById('runBaseUrl').value;
    try {
        const urlObj = new URL(base);

        // Apply current values from activeParams to the URL object
        activeParams.forEach(p => {
            const val = p.value;
            if (val && val.includes(',')) {
                // If comma separated, show the first one for preview
                urlObj.searchParams.set(p.key, val.split(',')[0].trim());
            } else {
                urlObj.searchParams.set(p.key, val);
            }
        });

        document.getElementById('finalUrlPreview').innerHTML = `<span style="color:#666; font-size:10px; font-weight:700; margin-right:5px;">[SAMPLE]</span> ` + urlObj.toString();
    } catch (e) {
        document.getElementById('finalUrlPreview').innerText = "Invalid Base URL";
    }
}

// --- UPDATED EXECUTE RUN ---
async function executeRun() {
    const filename = document.getElementById('runFilename').value;
    const baseUrl = document.getElementById('runBaseUrl').value;

    // 1. Params (Convert Array back to Object for Backend)
    const paramsObj = {};
    activeParams.forEach(p => {
        paramsObj[p.key] = p.value;
    });

    // 2. Max Items
    const maxItems = document.getElementById('runMaxItems').value;

    // 3. Column Mapping
    const colMapping = {};
    const colRows = document.querySelectorAll('#columnManager .col-row');
    colRows.forEach(row => {
        const chk = row.querySelector('.col-include');
        const inp = row.querySelector('.col-rename');
        if (chk.checked) {
            colMapping[chk.dataset.original] = inp.value.trim();
        }
    });

    views.run.classList.add('hidden');
    views.results.classList.remove('hidden');
    const container = document.getElementById('resultsBody');
    container.innerHTML = '<div class="loader">Running Scraper...<br><span style="font-size:12px; font-weight:400; color:#666">Please wait while we process your request.</span></div>';

    try {
        const res = await fetch(`${API_BASE}/api/run_wrapper/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify({
                filename: filename,
                base_url: baseUrl,
                params: paramsObj,
                max_items: maxItems,
                col_mapping: colMapping
            })
        });
        const json = await res.json();
        if (json.status === 'error') { container.innerHTML = `<div style="padding:20px; color:var(--danger);">Error: ${json.message}</div>`; return; }
        if (!json.data || json.data.length === 0) { container.innerHTML = `<div style="padding:20px; color:#aaa;">No data found.</div>`; return; }

        const meta = `<div style="padding:15px; border-bottom:1px solid #e5e7eb; color:#6b7280; font-size:12px;">Processed <b>${json.urls_scraped}</b> URLs. Found <b>${json.count}</b> items.</div>`;
        const headers = Object.keys(json.data[0]);
        let html = meta + `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;
        json.data.forEach(row => {
            html += `<tr>${headers.map(h => {
                const val = row[h] || '';
                return `<td>${val.length > 50 ? val.substring(0, 50) + '...' : val}</td>`;
            }).join('')}</tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) { console.error(e); container.innerHTML = `<div style="padding:20px; color:var(--danger);">Network Error</div>`; }
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

async function deleteWrapper(filename) {
    if (!confirm("Delete this wrapper?")) return;
    try { await fetch(`${API_BASE}/api/delete_wrapper/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) }); loadWrappers(); } catch (e) { alert("Error deleting."); }
}
function openCreateModal() { document.getElementById('inputName').value = ''; views.create.classList.remove('hidden'); document.getElementById('inputName').focus(); }
function closeBuilder() { document.getElementById('site-viewer').src = "about:blank"; views.builder.classList.add('hidden'); views.dashboard.classList.remove('hidden'); loadWrappers(); }

loadWrappers();