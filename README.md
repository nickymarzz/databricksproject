# Databricks Project & Analytics Dashboard

A comprehensive data analysis repository demonstrating clean PySpark SQL execution, NLP text processing workflows, and an interactive analytics dashboard.

---

## 📁 Repository Structure

The project has been organized into a professional directory structure:

```text
databricksproject/
├── data/                    # CSV and TXT Datasets
│   ├── Online_Retail-1.csv  # Large Online Retail Transactions dataset
│   ├── retail_orders.csv    # Small Retail Orders dataset
│   ├── sejong.txt           # Text processing dataset
│   └── sejong_university_wikipedia.txt
├── notebooks/               # Jupyter / Databricks Notebooks (.ipynb)
│   ├── Test1.ipynb          # Spark basic operations
│   ├── test2.ipynb          # Wikipedia bigrams and word distributions
│   ├── Text_Processing.ipynb # Sejong text parsing pipelines
│   ├── sparksql.ipynb       # Online Retail Spark SQL query sets
│   └── sparksqlclass.ipynb  # Local Retail Orders query sets
└── webapp/                  # Interactive Dashboard Application
    ├── main.py              # FastAPI server (in-memory SQLite analytics engine)
    ├── run.bat              # One-click Windows Launcher
    └── static/              # Dashboard Frontend (HTML, CSS, JS)
```

---

## 🚀 Interactive Analytics Dashboard

A premium, glassmorphic dark-themed analytical dashboard is included to browse, execute, and visualize the notebook queries and text statistics locally without requiring a full PySpark cluster configuration.

### Dashboard Key Features:
1. **Interactive Notebook Viewer**: Inspect notebook cells step-by-step with code formatting and inline execution buttons.
2. **SQL Query Console**: Live terminal to run queries on loaded tables (`orders`, `retail`, `customers`, `products`), view execution times, view table schema trees, download query outputs as CSV, and render customizable charts (Bar, Line, Pie, Doughnut).
3. **NLP Dashboard**: Word frequency counters, bigram phrase visualizers, character and sentence statistics, and sentence line explorers.
4. **Auto-fallback Query Engine**: Custom SQLite function bindings that map Spark-specific commands (`DATE_TRUNC`, `YEAR`, `MONTH`) to standard SQL, running the queries unchanged.

---

## 💻 Quick Start (Local Web App)

### Prerequisites
- Python 3.8+ installed on your system.

### One-Click Launch (Windows)
Go into the `webapp` folder and run the Windows launcher batch file:
```cmd
cd webapp
run.bat
```
This script will verify your Python environment, install required packages (`fastapi`, `uvicorn`, `pandas`), start the server process on `http://127.0.0.1:8000`, and open the dashboard in your default browser.

### Manual Launch
To start the FastAPI webapp manually from your terminal:
```bash
# Install dependencies
pip install fastapi uvicorn pandas

# Run uvicorn server
cd webapp
python -m uvicorn main:app --port 8000
```
Then visit `http://127.0.0.1:8000` in your browser.
