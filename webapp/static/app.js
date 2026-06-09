// Global State
let notebooksData = [];
let filesData = [];
let activeNotebook = null;
let currentQueryResult = null;
let activeChartInstance = null;
let nlpWordChart = null;
let nlpBigramChart = null;

// DOM Elements
const bodyEl = document.body;
const themeToggleBtn = document.getElementById("theme-toggle");
const sunIcon = themeToggleBtn.querySelector(".sun-icon");
const moonIcon = themeToggleBtn.querySelector(".moon-icon");

// Theme management
themeToggleBtn.addEventListener("click", () => {
    bodyEl.classList.toggle("light-theme");
    const isLight = bodyEl.classList.contains("light-theme");
    if (isLight) {
        sunIcon.classList.add("hidden");
        moonIcon.classList.remove("hidden");
    } else {
        sunIcon.classList.remove("hidden");
        moonIcon.classList.add("hidden");
    }
});

// Tab Navigation
const navButtons = document.querySelectorAll(".nav-item");
const tabPanes = document.querySelectorAll(".tab-pane");
const tabTitle = document.getElementById("current-tab-title");
const tabSubtitle = document.getElementById("current-tab-subtitle");

const tabMeta = {
    "dashboard": { title: "Dashboard Overview", subtitle: "Overview of your analytical workspace" },
    "notebooks": { title: "Notebook Explorer", subtitle: "Inspect and execute notebook code blocks" },
    "sql-console": { title: "SQL Query Console", subtitle: "Write and execute SQL queries on the datasets" },
    "text-analytics": { title: "NLP & Text Analytics", subtitle: "Run text processing pipelines and examine syntax metrics" }
};

navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const tabId = btn.getAttribute("data-tab");
        switchTab(tabId);
    });
});

function switchTab(tabId) {
    // Nav buttons
    navButtons.forEach(b => {
        if (b.getAttribute("data-tab") === tabId) {
            b.classList.add("active");
        } else {
            b.classList.remove("active");
        }
    });

    // Panes
    tabPanes.forEach(pane => {
        if (pane.id === `tab-${tabId}`) {
            pane.classList.add("active");
        } else {
            pane.classList.remove("active");
        }
    });

    // Titles
    if (tabMeta[tabId]) {
        tabTitle.textContent = tabMeta[tabId].title;
        tabSubtitle.textContent = tabMeta[tabId].subtitle;
    }

    // Dynamic checks
    if (tabId === "sql-console" && filesData.length === 0) {
        loadFilesAndSchemas();
    }
}

// Custom simple markdown parser to render descriptions beautifully
function parseMarkdown(text) {
    if (!text) return "";
    let html = text;
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');
    
    // Bullet lists
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/sim, '<ul>$1</ul>');
    
    // Line breaks
    html = html.replace(/\n$/gim, '<br />');
    
    return html;
}

// 1. DASHBOARD INITIALIZATION
async function loadFilesAndSchemas() {
    try {
        const res = await fetch("/api/files");
        if (!res.ok) throw new Error("Failed to load file metadata");
        filesData = await res.json();
        
        // Render Files Table
        const tbody = document.getElementById("files-list-body");
        tbody.innerHTML = "";
        
        let totalSize = 0;
        let activeTables = 0;

        filesData.forEach(file => {
            totalSize += file.size_mb;
            if (file.status === "Ready" && file.name.endsWith('.csv')) {
                activeTables++;
            }

            const tr = document.createElement("tr");
            
            const schemaText = file.columns.length > 0 
                ? `<span class="badge badge-info" title="${file.columns.join(', ')}">${file.columns.length} columns</span>`
                : `<span class="font-muted">N/A (Text File)</span>`;
            
            const statusBadge = file.status === "Ready"
                ? `<span class="badge badge-success">${file.status}</span>`
                : `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25)">${file.status}</span>`;

            tr.innerHTML = `
                <td><strong>${file.name}</strong></td>
                <td>${file.size_mb > 0 ? file.size_mb + ' MB' : '< 0.01 MB'}</td>
                <td>${file.row_count.toLocaleString()}</td>
                <td>${schemaText}</td>
                <td>${statusBadge}</td>
            `;
            tbody.innerHTML += tr.outerHTML;
        });

        // Update Dashboard Stats
        document.getElementById("count-datasize").textContent = `${totalSize.toFixed(2)} MB`;
        document.getElementById("count-tables").textContent = `${activeTables} Tables`;

        // Render Schema Explorer inside SQL Console
        renderSchemaExplorer();
        
    } catch (err) {
        console.error(err);
    }
}

async function loadNotebooks() {
    try {
        const res = await fetch("/api/notebooks");
        if (!res.ok) throw new Error("Failed to load notebooks");
        notebooksData = await res.json();

        // Update dashboard count
        document.getElementById("count-notebooks").textContent = `${notebooksData.length} Files`;

        // Populate Dashboard Notebook list
        const nbList = document.getElementById("dashboard-notebooks-list");
        nbList.innerHTML = "";

        // Populate Notebook Explorer Select tag
        const select = document.getElementById("notebook-select");
        select.innerHTML = '<option value="" disabled selected>Choose notebook...</option>';

        notebooksData.forEach(nb => {
            // Dashboard
            const div = document.createElement("div");
            div.className = "notebook-summary-item";
            div.innerHTML = `
                <div class="nb-meta">
                    <h5>${nb.title}</h5>
                    <span>${nb.cell_count} Cells • ${nb.name}</span>
                </div>
                <button class="btn btn-outline btn-sm">Explore</button>
            `;
            div.addEventListener("click", () => {
                select.value = nb.name;
                select.dispatchEvent(new Event("change"));
                switchTab("notebooks");
            });
            nbList.appendChild(div);

            // Select Option
            const option = document.createElement("option");
            option.value = nb.name;
            option.textContent = nb.title;
            select.appendChild(option);
        });

        // Initialize preset queries on SQL sidebar
        initializePresetQueries();

    } catch (err) {
        console.error(err);
    }
}

// 2. NOTEBOOK EXPLORER
const notebookSelect = document.getElementById("notebook-select");
const viewerContainer = document.getElementById("notebook-viewer-container");

notebookSelect.addEventListener("change", () => {
    const selectedName = notebookSelect.value;
    activeNotebook = notebooksData.find(nb => nb.name === selectedName);
    renderNotebookCells();
});

function renderNotebookCells() {
    if (!activeNotebook) return;
    
    viewerContainer.innerHTML = "";
    
    activeNotebook.cells.forEach(cell => {
        const card = document.createElement("div");
        card.className = "cell-card";
        
        // Header
        const header = document.createElement("div");
        header.className = "cell-header";
        const cellTypeLabel = cell.type === "code" ? "Code Block" : "Markdown Text";
        header.innerHTML = `
            <span>[Cell #${cell.id}] — ${cellTypeLabel}</span>
            <div class="cell-actions">
                ${cell.is_query ? `<span class="badge badge-info">SQL Query</span>` : ''}
            </div>
        `;
        card.appendChild(header);

        // Body
        const body = document.createElement("div");
        body.className = `cell-body ${cell.type}`;
        
        if (cell.type === "markdown") {
            body.innerHTML = parseMarkdown(cell.source);
        } else {
            // Code block styling
            const pre = document.createElement("pre");
            const code = document.createElement("code");
            
            // Check if it's SQL magic
            const isSqlCell = cell.source.trim().startsWith("%sql") || cell.source.includes("spark.sql");
            code.className = isSqlCell ? "language-sql" : "language-python";
            code.textContent = cell.source;
            pre.appendChild(code);
            body.appendChild(pre);
            
            // Trigger highlight
            hljs.highlightElement(code);
        }
        card.appendChild(body);

        // Live SQL runner integration
        if (cell.is_query) {
            const runnerDiv = document.createElement("div");
            runnerDiv.className = "live-runner-action";
            runnerDiv.innerHTML = `
                <button class="btn btn-primary btn-sm">
                    <i data-lucide="play"></i>
                    <span>Execute Live SQL</span>
                </button>
            `;
            runnerDiv.querySelector("button").addEventListener("click", () => {
                document.getElementById("sql-editor").value = cell.sql_content;
                switchTab("sql-console");
                runSQLQuery(cell.sql_content, activeNotebook.name);
            });
            card.appendChild(runnerDiv);
        }

        // Cell pre-saved outputs (from the .ipynb metadata)
        if (cell.outputs && cell.outputs.length > 0) {
            const outputsDiv = document.createElement("div");
            outputsDiv.className = "cell-outputs";
            outputsDiv.innerHTML = `<span class="output-label">Saved Output</span>`;
            
            let hasContent = false;
            
            cell.outputs.forEach(out => {
                // 1. Check for image display (e.g. matplotlib figures)
                if (out.data && out.data["image/png"]) {
                    const img = document.createElement("img");
                    const imgData = out.data["image/png"].join ? out.data["image/png"].join("") : out.data["image/png"];
                    img.src = `data:image/png;base64,${imgData.trim()}`;
                    img.className = "output-image";
                    img.style.maxWidth = "100%";
                    img.style.borderRadius = "8px";
                    img.style.marginTop = "10px";
                    img.style.display = "block";
                    outputsDiv.appendChild(img);
                    hasContent = true;
                }
                // 2. Check for rich HTML (e.g. pandas dataframes, tables)
                else if (out.data && out.data["text/html"]) {
                    const htmlDiv = document.createElement("div");
                    htmlDiv.className = "output-html scrollable-x";
                    htmlDiv.style.marginTop = "10px";
                    htmlDiv.innerHTML = out.data["text/html"].join ? out.data["text/html"].join("") : out.data["text/html"];
                    outputsDiv.appendChild(htmlDiv);
                    hasContent = true;
                }
                // 3. Check for standard text stream
                else if (out.text) {
                    const textPre = document.createElement("pre");
                    textPre.className = "cell-output-text";
                    textPre.textContent = out.text.join ? out.text.join("") : out.text;
                    outputsDiv.appendChild(textPre);
                    hasContent = true;
                }
                // 4. Check for text/plain representation
                else if (out.data && out.data["text/plain"]) {
                    const textPre = document.createElement("pre");
                    textPre.className = "cell-output-text";
                    textPre.textContent = out.data["text/plain"].join ? out.data["text/plain"].join("") : out.data["text/plain"];
                    outputsDiv.appendChild(textPre);
                    hasContent = true;
                }
            });
            
            if (hasContent) {
                card.appendChild(outputsDiv);
            }
        }
        
        viewerContainer.appendChild(card);
    });

    // Reinitialize icons in new DOM structure
    lucide.createIcons();
}

// 3. SQL QUERY CONSOLE
const schemaContainer = document.getElementById("schema-explorer");
const sqlEditor = document.getElementById("sql-editor");
const runSqlBtn = document.getElementById("btn-run-sql");
const sqlResultsContainer = document.getElementById("sql-table-container");
const queryStatsText = document.getElementById("query-stats-text");
const exportCsvBtn = document.getElementById("btn-export-csv");

function renderSchemaExplorer() {
    schemaContainer.innerHTML = "";
    if (filesData.length === 0) return;

    filesData.forEach(file => {
        if (file.status !== "Ready") return;
        
        // Define clean table name
        let tableName = file.name.replace(".csv", "");
        if (file.name === "retail_orders.csv") {
            tableName = "orders";
        } else if (file.name === "Online_Retail-1.csv") {
            tableName = "retail";
        }
        
        const item = document.createElement("div");
        item.className = "schema-item";
        
        const nameDiv = document.createElement("div");
        nameDiv.className = "schema-table-name";
        nameDiv.innerHTML = `
            <i data-lucide="chevron-right"></i>
            <span><strong>${tableName}</strong></span>
        `;
        
        const colsDiv = document.createElement("div");
        colsDiv.className = "schema-cols";
        
        // Populate columns schemas
        if (file.columns && file.columns.length > 0) {
            file.columns.forEach(col => {
                // Infer basic datatypes for display
                let typeStr = "TEXT";
                const lowerCol = col.toLowerCase();
                if (lowerCol.includes("id") || lowerCol.includes("quantity") || lowerCol.includes("count") || lowerCol.includes("spent") || lowerCol.includes("spent") || lowerCol.includes("isuk")) {
                    typeStr = "INT";
                } else if (lowerCol.includes("price") || lowerCol.includes("amount") || lowerCol.includes("rate") || lowerCol.includes("revenue")) {
                    typeStr = "DOUBLE";
                } else if (lowerCol.includes("date")) {
                    typeStr = "TIMESTAMP";
                }
                
                colsDiv.innerHTML += `
                    <div class="schema-col-item">
                        <span>${col}</span>
                        <span class="schema-col-type">${typeStr}</span>
                    </div>
                `;
            });
        } else {
            // Text file
            colsDiv.innerHTML = `<div class="schema-col-item font-muted">No schema columns</div>`;
        }

        nameDiv.addEventListener("click", () => {
            nameDiv.classList.toggle("expanded");
        });
        
        item.appendChild(nameDiv);
        item.appendChild(colsDiv);
        schemaContainer.appendChild(item);
    });

    // Also add the manually registered customers & products tables
    const extraTables = [
        { name: "customers", cols: ["customer_id", "home_city", "segment_from_dim"] },
        { name: "products", cols: ["product_id", "product_name_dim", "category_from_dim"] }
    ];
    extraTables.forEach(t => {
        const item = document.createElement("div");
        item.className = "schema-item";
        
        const nameDiv = document.createElement("div");
        nameDiv.className = "schema-table-name";
        nameDiv.innerHTML = `
            <i data-lucide="chevron-right"></i>
            <span><strong>${t.name}</strong></span>
        `;
        
        const colsDiv = document.createElement("div");
        colsDiv.className = "schema-cols";
        
        t.cols.forEach(col => {
            colsDiv.innerHTML += `
                <div class="schema-col-item">
                    <span>${col}</span>
                    <span class="schema-col-type">TEXT</span>
                </div>
            `;
        });
        
        nameDiv.addEventListener("click", () => {
            nameDiv.classList.toggle("expanded");
        });
        item.appendChild(nameDiv);
        item.appendChild(colsDiv);
        schemaContainer.appendChild(item);
    });

    lucide.createIcons();
}

function initializePresetQueries() {
    const list = document.getElementById("preset-queries-list");
    list.innerHTML = "";
    
    // Pre-populate with high interest queries from notebooks
    const presets = [
        {
            title: "1. Electronics Non-Returned Sales",
            query: "SELECT order_id, order_date, city, product_name, category, quantity, sales_amount_krw\nFROM orders\nWHERE category = 'Electronics' AND returned = 'No'\nORDER BY sales_amount_krw DESC\nLIMIT 10;",
            notebook: "sparksqlclass.ipynb"
        },
        {
            title: "2. Sales Summary by Category",
            query: "SELECT category,\n    COUNT(*) AS number_of_orders,\n    SUM(quantity) AS total_units,\n    ROUND(SUM(sales_amount_krw), 0) AS total_sales_krw,\n    ROUND(AVG(sales_amount_krw), 0) AS avg_order_value_krw\nFROM orders\nGROUP BY category\nORDER BY total_sales_krw DESC;",
            notebook: "sparksqlclass.ipynb"
        },
        {
            title: "3. Revenue by Customer Segment & Channel",
            query: "SELECT customer_segment, channel,\n    COUNT(*) AS orders,\n    ROUND(SUM(sales_amount_krw), 0) AS revenue_krw\nFROM orders\nGROUP BY customer_segment, channel\nORDER BY customer_segment, revenue_krw DESC;",
            notebook: "sparksqlclass.ipynb"
        },
        {
            title: "4. Monthly Sales Revenue Trend",
            query: "SELECT DATE_TRUNC('month', order_date) AS order_month,\n    COUNT(*) AS orders,\n    ROUND(SUM(sales_amount_krw), 0) AS monthly_revenue_krw\nFROM orders\nGROUP BY DATE_TRUNC('month', order_date)\nORDER BY order_month;",
            notebook: "sparksqlclass.ipynb"
        },
        {
            title: "5. Top 3 Ranked Sales inside Category (Rank Window)",
            query: "SELECT order_id, category, product_name, sales_amount_krw,\n    RANK() OVER (PARTITION BY category ORDER BY sales_amount_krw DESC) AS rank_within_category\nFROM orders\nQUALIFY rank_within_category <= 3\nORDER BY category, rank_within_category;",
            notebook: "sparksqlclass.ipynb"
        },
        {
            title: "6. Online Retail: Top Countries Revenue",
            query: "SELECT c.Country, COUNT(distinct r.InvoiceNo) as invoice_count, round(sum(r.Quantity * r.UnitPrice), 2) as total_revenue\nFROM retail r\nJOIN customers c ON r.CustomerID = c.CustomerID\nGROUP BY c.Country\nORDER BY total_revenue DESC\nLIMIT 10;",
            notebook: "sparksql.ipynb"
        },
        {
            title: "7. Online Retail: Bulk Orders (>80k qty)",
            query: "SELECT CustomerID, Description, Quantity, UnitPrice\nFROM retail\nWHERE Quantity > 80000\nORDER BY Quantity DESC;",
            notebook: "sparksql.ipynb"
        }
    ];

    presets.forEach(p => {
        const item = document.createElement("div");
        item.className = "preset-query-item";
        item.innerHTML = `
            <h6>${p.title}</h6>
            <p>${p.query.replace(/\n/g, ' ')}</p>
        `;
        item.addEventListener("click", () => {
            sqlEditor.value = p.query;
            sqlEditor.focus();
        });
        list.appendChild(item);
    });
}

runSqlBtn.addEventListener("click", () => {
    const query = sqlEditor.value.trim();
    if (!query) return;
    runSQLQuery(query);
});

async function runSQLQuery(queryText, notebookName = "") {
    sqlResultsContainer.innerHTML = `
        <div class="empty-state">
            <div class="stat-icon bg-violet" style="animation: pulse 1.5s infinite; margin: 0 auto 16px auto;">
                <i data-lucide="loader"></i>
            </div>
            <h4>Executing Database Query...</h4>
            <p>Running query against in-memory schema.</p>
        </div>
    `;
    lucide.createIcons();
    queryStatsText.textContent = "Running...";
    exportCsvBtn.classList.add("hidden");

    try {
        const res = await fetch("/api/run_query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: queryText, notebook: notebookName })
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.detail || "Error running query");
        }

        const data = await res.json();
        currentQueryResult = data;
        
        // Update stats
        queryStatsText.textContent = `Returned ${data.row_count.toLocaleString()} rows in ${data.execution_time_ms.toFixed(1)} ms`;
        exportCsvBtn.classList.remove("hidden");

        // Render Table Grid
        renderQueryTable(data);
        
        // Setup Chart Options
        setupChartControls(data);

    } catch (err) {
        queryStatsText.textContent = "Error";
        sqlResultsContainer.innerHTML = `
            <div class="empty-state" style="color: var(--color-danger)">
                <i data-lucide="alert-triangle" class="empty-icon" style="opacity: 1; color: var(--color-danger)"></i>
                <h4>Query Syntax Error</h4>
                <p style="font-family: var(--font-mono); font-size: 0.8rem; background: rgba(239, 68, 68, 0.05); padding: 12px; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.15); margin-top: 10px;">
                    ${err.message}
                </p>
            </div>
        `;
        lucide.createIcons();
    }
}

function renderQueryTable(data) {
    if (data.rows.length === 0) {
        sqlResultsContainer.innerHTML = `
            <div class="empty-state">
                <i data-lucide="info" class="empty-icon"></i>
                <h4>Empty Set</h4>
                <p>The query executed successfully but returned 0 results.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    const table = document.createElement("table");
    table.className = "table results-table";
    
    // Header
    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    data.columns.forEach(col => {
        trHead.innerHTML += `<th>${col}</th>`;
    });
    thead.appendChild(trHead);
    table.appendChild(thead);
    
    // Body
    const tbody = document.createElement("tbody");
    data.rows.forEach(row => {
        const tr = document.createElement("tr");
        row.forEach(cell => {
            // Null styling
            const val = cell === null ? `<span class="font-muted">NULL</span>` : cell;
            tr.innerHTML += `<td>${val}</td>`;
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    
    sqlResultsContainer.innerHTML = "";
    sqlResultsContainer.appendChild(table);
}

// SQL console tab views (Table vs Chart)
const resultsTabs = document.querySelectorAll(".results-tab");
const resultsPanes = document.querySelectorAll(".results-pane");

resultsTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        const viewId = tab.getAttribute("data-view");
        
        resultsTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        
        resultsPanes.forEach(pane => {
            if (pane.id === `results-pane-${viewId}`) {
                pane.classList.add("active");
            } else {
                pane.classList.remove("active");
            }
        });
        
        if (viewId === "chart") {
            renderSQLChart();
        }
    });
});

function setupChartControls(data) {
    const labelSelect = document.getElementById("chart-label-col");
    const dataSelect = document.getElementById("chart-data-col");
    
    labelSelect.innerHTML = "";
    dataSelect.innerHTML = "";
    
    data.columns.forEach(col => {
        const optX = document.createElement("option");
        optX.value = col;
        optX.textContent = col;
        labelSelect.appendChild(optX);
        
        const optY = document.createElement("option");
        optY.value = col;
        optY.textContent = col;
        dataSelect.appendChild(optY);
    });

    // Smart defaults: X is first column, Y is second column if numeric
    if (data.columns.length > 1) {
        labelSelect.selectedIndex = 0;
        dataSelect.selectedIndex = 1;
    }
}

document.getElementById("btn-render-chart").addEventListener("click", () => {
    renderSQLChart();
});

function renderSQLChart() {
    if (!currentQueryResult || currentQueryResult.rows.length === 0) return;
    
    const ctx = document.getElementById("sql-chart-canvas").getContext("2d");
    const labelCol = document.getElementById("chart-label-col").value;
    const dataCol = document.getElementById("chart-data-col").value;
    const chartType = document.getElementById("chart-type").value;
    
    const labelIdx = currentQueryResult.columns.indexOf(labelCol);
    const dataIdx = currentQueryResult.columns.indexOf(dataCol);
    
    if (labelIdx === -1 || dataIdx === -1) return;
    
    // Extract labels & numeric values
    const labels = [];
    const values = [];
    
    currentQueryResult.rows.forEach(row => {
        labels.push(row[labelIdx] !== null ? String(row[labelIdx]) : "NULL");
        const numericVal = parseFloat(row[dataIdx]);
        values.push(isNaN(numericVal) ? 0 : numericVal);
    });
    
    // Destroy existing chart to prevent redraw glitches
    if (activeChartInstance) {
        activeChartInstance.destroy();
    }
    
    // Elegant color themes matching our styles
    const colors = [
        '#8b5cf6', '#6366f1', '#06b6d4', '#10b981', '#f59e0b',
        '#ec4899', '#3b82f6', '#14b8a6', '#f43f5e', '#84cc16'
    ];
    
    const bgColors = chartType === 'pie' || chartType === 'doughnut'
        ? colors.slice(0, labels.length)
        : '#8b5cf6';
        
    activeChartInstance = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: dataCol,
                data: values,
                backgroundColor: bgColors,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: getComputedStyle(bodyEl).getPropertyValue('--text-primary') }
                }
            },
            scales: chartType === 'bar' || chartType === 'line' ? {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: getComputedStyle(bodyEl).getPropertyValue('--text-secondary') }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: getComputedStyle(bodyEl).getPropertyValue('--text-secondary') }
                }
            } : {}
        }
    });
}

// Client-side CSV Download
exportCsvBtn.addEventListener("click", () => {
    if (!currentQueryResult) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Header
    csvContent += currentQueryResult.columns.join(",") + "\n";
    
    // Rows
    currentQueryResult.rows.forEach(row => {
        const rowStr = row.map(cell => {
            if (cell === null) return "NULL";
            // Wrap in quotes if comma is present
            const cellStr = String(cell);
            return cellStr.includes(",") ? `"${cellStr}"` : cellStr;
        }).join(",");
        csvContent += rowStr + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "query_results.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// 4. TEXT ANALYTICS (NLP)
const runNlpBtn = document.getElementById("btn-run-nlp");
const nlpFileSelect = document.getElementById("nlp-file-select");

runNlpBtn.addEventListener("click", () => {
    const file = nlpFileSelect.value;
    runNLPAnalysis(file);
});

async function runNLPAnalysis(fileKey) {
    runNlpBtn.disabled = true;
    runNlpBtn.innerHTML = `<i data-lucide="loader" style="animation: pulse 1s infinite"></i> <span>Processing...</span>`;
    lucide.createIcons();

    try {
        const res = await fetch(`/api/text_analysis?file=${fileKey}`);
        if (!res.ok) throw new Error("NLP analysis failed");
        
        const data = await res.json();
        
        // Update stats
        document.getElementById("nlp-stat-chars").textContent = data.totalCharacters.toLocaleString();
        document.getElementById("nlp-stat-words").textContent = data.totalWords.toLocaleString();
        document.getElementById("nlp-stat-sentences").textContent = data.totalSentences.toLocaleString();
        document.getElementById("nlp-stat-sejong").textContent = data.sejongSentencesCount.toLocaleString();
        
        // Render word freq table
        const tbody = document.getElementById("table-nlp-words-body");
        tbody.innerHTML = "";
        data.wordFrequencies.slice(0, 15).forEach((item, index) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>#${index + 1}</strong></td>
                <td><span class="badge badge-info">${item.word}</span></td>
                <td>${item.count.toLocaleString()} times</td>
            `;
            tbody.appendChild(tr);
        });

        // Render sentences explorer
        const sentencesDiv = document.getElementById("nlp-sentences-list");
        sentencesDiv.innerHTML = "";
        
        // If sejong sentences exist, list them; else normal sentences
        const listToDisplay = data.sejongSentences.length > 0 ? data.sejongSentences : data.uppercaseSentences;
        listToDisplay.slice(0, 10).forEach((s, i) => {
            const div = document.createElement("div");
            div.className = "sentence-item";
            div.innerHTML = `
                <span>Line #${i + 1}</span>
                <p>"${s}"</p>
            `;
            sentencesDiv.appendChild(div);
        });

        // Render Charts
        renderNLPCharts(data);

    } catch (err) {
        console.error(err);
    } finally {
        runNlpBtn.disabled = false;
        runNlpBtn.innerHTML = `<i data-lucide="play-circle"></i> <span>Run NLP Processing</span>`;
        lucide.createIcons();
    }
}

function renderNLPCharts(data) {
    // 1. Word frequency Chart
    const ctxWord = document.getElementById("nlp-word-chart").getContext("2d");
    const words = data.wordFrequencies.slice(0, 15).map(i => i.word);
    const wordCounts = data.wordFrequencies.slice(0, 15).map(i => i.count);

    if (nlpWordChart) nlpWordChart.destroy();
    nlpWordChart = new Chart(ctxWord, {
        type: 'bar',
        data: {
            labels: words,
            datasets: [{
                label: 'Frequency',
                data: wordCounts,
                backgroundColor: '#8b5cf6',
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } }
            }
        }
    });

    // 2. Bigrams Chart
    const ctxBigram = document.getElementById("nlp-bigram-chart").getContext("2d");
    const phrases = data.bigramFrequencies.slice(0, 10).map(i => i.phrase);
    const phraseCounts = data.bigramFrequencies.slice(0, 10).map(i => i.count);

    if (nlpBigramChart) nlpBigramChart.destroy();
    nlpBigramChart = new Chart(ctxBigram, {
        type: 'bar',
        data: {
            labels: phrases,
            datasets: [{
                label: 'Occurrences',
                data: phraseCounts,
                backgroundColor: '#06b6d4',
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal bar chart!
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } },
                y: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

// Initial Bootstrapping
window.addEventListener("DOMContentLoaded", () => {
    loadFilesAndSchemas();
    loadNotebooks();
});
