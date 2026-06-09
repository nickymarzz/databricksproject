import os
import json
import re
import sqlite3
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd

app = FastAPI(title="Databricks Project Query Web App")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global database connection and data cache
conn = sqlite3.connect(":memory:", check_same_thread=False)

# Directory paths relative to the restructured repository root
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTEBOOKS_DIR = os.path.join(REPO_ROOT, "notebooks")
DATA_DIR = os.path.join(REPO_ROOT, "data")

# Custom SQLite Functions to mock Spark SQL functions
def sqlite_date_trunc(unit: str, date_str: str) -> Optional[str]:
    if not date_str:
        return None
    try:
        dt = pd.to_datetime(date_str)
        if unit.lower() == 'month':
            return dt.strftime('%Y-%m-01')
        elif unit.lower() == 'year':
            return dt.strftime('%Y-01-01')
        elif unit.lower() == 'day':
            return dt.strftime('%Y-%m-%d')
        return date_str
    except Exception:
        return date_str

def sqlite_year(date_str: str) -> Optional[int]:
    if not date_str:
        return None
    try:
        return pd.to_datetime(date_str).year
    except Exception:
        return None

def sqlite_month(date_str: str) -> Optional[int]:
    if not date_str:
        return None
    try:
        return pd.to_datetime(date_str).month
    except Exception:
        return None

# Register custom functions in SQLite connection
conn.create_function("DATE_TRUNC", 2, sqlite_date_trunc)
conn.create_function("YEAR", 1, sqlite_year)
conn.create_function("MONTH", 1, sqlite_month)

# Initialize Datasets in SQLite database
def init_db():
    print("Initializing SQLite Database...")
    
    # 1. Load retail_orders.csv -> table orders
    orders_csv = os.path.join(DATA_DIR, "retail_orders.csv")
    if os.path.exists(orders_csv):
        df_orders = pd.read_csv(orders_csv)
        # Replicate spark cleaning
        df_orders['order_date'] = pd.to_datetime(df_orders['order_date']).dt.strftime('%Y-%m-%d')
        df_orders['quantity'] = pd.to_numeric(df_orders['quantity'], errors='coerce').fillna(0).astype(int)
        df_orders['unit_price_krw'] = pd.to_numeric(df_orders['unit_price_krw'], errors='coerce').fillna(0.0)
        df_orders['discount_rate'] = pd.to_numeric(df_orders['discount_rate'], errors='coerce').fillna(0.0)
        df_orders['sales_amount_krw'] = pd.to_numeric(df_orders['sales_amount_krw'], errors='coerce').fillna(0.0)
        df_orders['returned'] = df_orders['returned'].fillna("No")
        df_orders['rating'] = pd.to_numeric(df_orders['rating'], errors='coerce')
        
        df_orders.to_sql("orders", conn, if_exists="replace", index=False)
        print(f"Loaded 'orders' table. Rows: {len(df_orders)}")
    else:
        print(f"WARNING: retail_orders.csv not found at {orders_csv}")

    # 2. Register customers and products static tables
    customers_data = [
        ("C001", "Seoul", "Premium"), ("C002", "Busan", "Standard"), ("C003", "Incheon", "Premium"), ("C004", "Daegu", "Standard"),
        ("C005", "Daejeon", "Basic"), ("C006", "Gwangju", "Standard"), ("C007", "Suwon", "Basic"), ("C008", "Ulsan", "Premium"),
        ("C009", "Jeju", "Standard"), ("C010", "Sejong", "Premium"), ("C011", "Yongin", "Basic"), ("C012", "Anyang", "Standard")
    ]
    products_data = [
        ("P001", "Laptop", "Electronics"), ("P002", "Smartphone", "Electronics"), ("P003", "Headphones", "Electronics"),
        ("P004", "Office Chair", "Furniture"), ("P005", "Desk", "Furniture"), ("P006", "Coffee Beans", "Grocery"),
        ("P007", "Green Tea", "Grocery"), ("P008", "Notebook", "Stationery"), ("P009", "Pen Set", "Stationery"),
        ("P010", "Backpack", "Accessories"), ("P011", "Water Bottle", "Accessories"), ("P012", "Monitor", "Electronics")
    ]
    
    df_customers = pd.DataFrame(customers_data, columns=["customer_id", "home_city", "segment_from_dim"])
    df_products = pd.DataFrame(products_data, columns=["product_id", "product_name_dim", "category_from_dim"])
    
    df_customers.to_sql("customers", conn, if_exists="replace", index=False)
    df_products.to_sql("products", conn, if_exists="replace", index=False)
    print("Loaded static 'customers' and 'products' tables.")

    # 3. Load Online_Retail-1.csv -> table retail, customers (online)
    retail_csv = os.path.join(DATA_DIR, "Online_Retail-1.csv")
    if os.path.exists(retail_csv):
        # Read in chunks or full if memory allows (45MB is small enough to load fully in ~1-2s)
        df_retail = pd.read_csv(retail_csv, encoding="ISO-8859-1")
        # Filter CustomerID not null (Data cleaning)
        df_retail = df_retail[df_retail['CustomerID'].notna()]
        
        # Clean InvoiceDate (Flip day/month standard regex logic)
        # "13/12/2010 9:09" -> "12/13/2010 9:09"
        # Since it is a string replacement, we can do it in pandas
        def clean_date_str(val):
            if not isinstance(val, str):
                return val
            # Matches starts with day/month/
            m = re.match(r"^(\d+)/(\d+)/(.*)$", val)
            if m:
                return f"{m.group(2)}/{m.group(1)}/{m.group(3)}"
            return val
        
        df_retail['InvoiceDate'] = df_retail['InvoiceDate'].apply(clean_date_str)
        df_retail['InvoiceDate'] = pd.to_datetime(df_retail['InvoiceDate'], errors='coerce')
        df_retail['Quantity'] = pd.to_numeric(df_retail['Quantity'], errors='coerce').fillna(0).astype(int)
        df_retail['UnitPrice'] = pd.to_numeric(df_retail['UnitPrice'], errors='coerce').fillna(0.0)
        df_retail['TotalPrice'] = df_retail['Quantity'] * df_retail['UnitPrice']
        df_retail['CustomerID'] = df_retail['CustomerID'].astype(int)
        df_retail['IsUK'] = (df_retail['Country'] == "United Kingdom").astype(int)
        
        # Load tables
        df_retail.to_sql("retail", conn, if_exists="replace", index=False)
        # Also register 'customers' view/table for sparksql.ipynb
        # In sparksql.ipynb, cell 10: df_clean.createOrReplaceTempView("customers")
        # But wait! 'customers' is already taken by sparksqlclass.ipynb!
        # In SQLite, we cannot have two tables named 'customers'.
        # Let's create an alias 'online_customers' and we will rewrite queries in the backend if they join 'customers' in the online retail notebook!
        df_retail.to_sql("online_retail_customers", conn, if_exists="replace", index=False)
        print(f"Loaded 'retail' table. Rows: {len(df_retail)}")
    else:
        print(f"WARNING: Online_Retail-1.csv not found at {retail_csv}")
        
    # Pre-create category_revenue_summary for sparksqlclass cell 18
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS category_revenue_summary AS
            SELECT category, SUM(sales_amount_krw) AS revenue_krw
            FROM orders
            WHERE returned = 'No'
            GROUP BY category
            ORDER BY revenue_krw DESC
        """)
        print("Pre-created 'category_revenue_summary' table.")
    except Exception as e:
        print(f"Error creating summary table: {e}")

# Call DB initialization
init_db()

# Models
class QueryRequest(BaseModel):
    query: str
    notebook: Optional[str] = None

class QueryResponse(BaseModel):
    columns: List[str]
    rows: List[List[Any]]
    execution_time_ms: float
    row_count: int

# Helpers
def clean_sql_query(query: str, notebook_name: str = "") -> str:
    # Remove %sql magic
    query = re.sub(r"^%sql\s*", "", query, flags=re.IGNORECASE)
    # Remove spark.sql(""" ... """) wrapping
    m_spark_sql = re.search(r"spark\.sql\(\"\"\"(.*)\"\"\"\)", query, re.DOTALL | re.IGNORECASE)
    if m_spark_sql:
        query = m_spark_sql.group(1)
        
    # Replace customers with online_retail_customers if we are running in sparksql.ipynb context
    if "sparksql.ipynb" in notebook_name.lower():
        # Replace occurrences of customers c with online_retail_customers c
        query = re.sub(r"\bjoin\s+customers\b", "join online_retail_customers", query, flags=re.IGNORECASE)
        query = re.sub(r"\bfrom\s+customers\b", "from online_retail_customers", query, flags=re.IGNORECASE)
        
    # Remove QUALIFY clause and replace with CTE for SQLite
    # Example:
    # QUALIFY rank_within_category <= 3
    # We can match: SELECT ... RANK() OVER (...) AS rank_within_category ... FROM ... QUALIFY rank_within_category <= 3 ORDER BY ...
    # Let's do a simple replace since we know the exact query
    if "qualify" in query.lower():
        # Match the rank query in cell 15 of sparksqlclass.ipynb
        m_qualify = re.search(r"SELECT(.*)FROM\s+(\w+)(.*)QUALIFY\s+(\w+)\s*<=\s*(\d+)(.*)", query, re.DOTALL | re.IGNORECASE)
        if m_qualify:
            select_cols = m_qualify.group(1).strip()
            table_name = m_qualify.group(2).strip()
            joins_and_wheres = m_qualify.group(3).strip()
            rank_col = m_qualify.group(4).strip()
            rank_val = m_qualify.group(5).strip()
            order_by = m_qualify.group(6).strip()
            
            # Reconstruct query using CTE
            query = f"""
            WITH ranked_data AS (
                SELECT {select_cols}
                FROM {table_name} {joins_and_wheres}
            )
            SELECT * FROM ranked_data
            WHERE {rank_col} <= {rank_val}
            {order_by}
            """
            
    return query.strip()

# API Endpoints
@app.get("/api/notebooks")
def get_notebooks():
    notebook_files = [f for f in os.listdir(NOTEBOOKS_DIR) if f.endswith('.ipynb')]
    notebooks = []
    
    for nb_file in notebook_files:
        path = os.path.join(NOTEBOOKS_DIR, nb_file)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            cells = []
            raw_cells = data.get('cells', [])
            for idx, cell in enumerate(raw_cells):
                cell_type = cell.get('cell_type')
                source = "".join(cell.get('source', []))
                
                # Check for SQL queries inside
                is_query = False
                sql_content = ""
                if cell_type == "code":
                    if source.strip().startswith("%sql"):
                        is_query = True
                        sql_content = re.sub(r"^%sql\s*", "", source).strip()
                    elif "spark.sql(" in source:
                        is_query = True
                        m = re.search(r"spark\.sql\(\"\"\"(.*)\"\"\"\)", source, re.DOTALL | re.IGNORECASE)
                        if m:
                            sql_content = m.group(1).strip()
                        else:
                            # Try standard single line spark.sql
                            m2 = re.search(r"spark\.sql\(\"(.*)\"\)", source, re.IGNORECASE)
                            if m2:
                                sql_content = m2.group(1).strip()
                
                # Clean cell metadata to keep transfer payload small
                cells.append({
                    "id": idx,
                    "type": cell_type,
                    "source": source,
                    "is_query": is_query,
                    "sql_content": sql_content,
                    "outputs": cell.get('outputs', [])[:3] # Limit outputs sent
                })
            
            notebooks.append({
                "name": nb_file,
                "title": nb_file.replace(".ipynb", "").replace("_", " ").title(),
                "cell_count": len(cells),
                "cells": cells
            })
        except Exception as e:
            print(f"Error reading notebook {nb_file}: {e}")
            
    return sorted(notebooks, key=lambda x: x["name"])

@app.post("/api/run_query", response_model=QueryResponse)
def run_query(request: QueryRequest):
    import time
    
    clean_query = clean_sql_query(request.query, request.notebook or "")
    print(f"Running Query: {clean_query}")
    
    # Check if this is a Delta Table Write / Mock Write from sparksqlclass cell 17
    # e.g., top_categories_df.write.mode('overwrite').format('delta').saveAsTable('category_revenue_summary')
    if "saveastable" in request.query.lower():
        try:
            start_time = time.time()
            # We already pre-created the table, but let's re-run the select statement to overwrite it
            conn.execute("DROP TABLE IF EXISTS category_revenue_summary")
            conn.execute("""
                CREATE TABLE category_revenue_summary AS
                SELECT category, SUM(sales_amount_krw) AS revenue_krw
                FROM orders
                WHERE returned = 'No'
                GROUP BY category
                ORDER BY revenue_krw DESC
            """)
            exec_time = (time.time() - start_time) * 1000.0
            return QueryResponse(
                columns=["status"],
                rows=[["Table 'category_revenue_summary' successfully created/overwritten in Delta format (mocked in SQLite)."]],
                execution_time_ms=exec_time,
                row_count=1
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
            
    try:
        start_time = time.time()
        cursor = conn.cursor()
        cursor.execute(clean_query)
        
        # Fetch data
        columns = [desc[0] for desc in cursor.description] if cursor.description else ["result"]
        rows = cursor.fetchall()
        
        # Limit rows returned to protect memory
        row_count = len(rows)
        rows_limited = [list(r) for r in rows[:1000]]
        
        exec_time = (time.time() - start_time) * 1000.0
        
        return QueryResponse(
            columns=columns,
            rows=rows_limited,
            execution_time_ms=exec_time,
            row_count=row_count
        )
    except Exception as e:
        print(f"Query Error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/text_analysis")
def text_analysis(file: str = Query(..., description="sejong or sejong_wikipedia")):
    import re
    from collections import Counter
    
    if file == "sejong":
            file_path = os.path.join(DATA_DIR, "sejong.txt")
    elif file == "sejong_wikipedia":
            file_path = os.path.join(DATA_DIR, "sejong_university_wikipedia.txt")
    else:
        raise HTTPException(status_code=400, detail="Invalid file requested")
        
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Text file not found")
        
    with open(file_path, "r", encoding="utf-8") as f:
        text = f.read()
        
    # Standard text analytics mimicking the Spark NLP notebooks
    # 1. Sentences
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    sentence_count = len(sentences)
    
    # 2. Sentences containing 'Sejong'
    sejong_sentences = [s for s in sentences if "Sejong" in s]
    
    # 3. Uppercase sentences
    uppercase_sentences = [s.upper() for s in sentences[:10]] # Limit to 10 for display
    
    # 4. Total Character length
    total_chars = len(text)
    
    # 5. Word frequencies (cleaned)
    clean_text = re.sub(r"[^\w\s]", " ", text.lower())
    words = [w for w in clean_text.split() if w.strip()]
    total_words_count = len(words)
    
    # Stopwords filter
    STOPWORDS = set("""a an and are as at be been being but by for from has 
    have had he her his i in is it its of on or our she such that the their 
    them then there these they this to was will with you list update category
    from table select order group by limit where into from""".split())
    
    filtered_words = [w for w in words if w not in STOPWORDS and len(w) > 1]
    
    word_freq = Counter(filtered_words).most_common(30)
    
    # 6. Bigrams (2-word phrases)
    bigrams = list(zip(filtered_words, filtered_words[1:]))
    bigram_freq = [
        {"phrase": f"{bg[0]} {bg[1]}", "count": count}
        for bg, count in Counter(bigrams).most_common(15)
    ]
    
    # 7. Word length distribution
    word_lengths = [len(w) for w in filtered_words]
    length_freq = Counter(word_lengths)
    sorted_lengths = sorted(length_freq.items())
    lengths_chart = [{"length": k, "count": v} for k, v in sorted_lengths if k < 15]

    return {
        "fileName": os.path.basename(file_path),
        "totalCharacters": total_chars,
        "totalWords": total_words_count,
        "totalSentences": sentence_count,
        "sejongSentencesCount": len(sejong_sentences),
        "sejongSentences": sejong_sentences[:10],
        "uppercaseSentences": uppercase_sentences,
        "wordFrequencies": [{"word": w, "count": c} for w, c in word_freq],
        "bigramFrequencies": bigram_freq,
        "wordLengthDistribution": lengths_chart
    }

@app.get("/api/files")
def get_files_metadata():
    files = ["retail_orders.csv", "Online_Retail-1.csv", "sejong.txt", "sejong_university_wikipedia.txt"]
    meta = []
    
    for f_name in files:
        f_path = os.path.join(DATA_DIR, f_name)
        if os.path.exists(f_path):
            size = os.path.getsize(f_path)
            # Row counts
            rows = 0
            columns = []
            if f_name.endswith('.csv'):
                try:
                    df = pd.read_csv(f_path, nrows=5, encoding="ISO-8859-1")
                    columns = list(df.columns)
                    # Rough row count in binary mode to prevent encoding errors
                    with open(f_path, "rb") as file:
                        rows = sum(1 for _ in file) - 1
                except Exception:
                    pass
            else:
                with open(f_path, "r", encoding="utf-8") as file:
                    rows = sum(1 for _ in file)
            
            meta.append({
                "name": f_name,
                "size_mb": round(size / (1024 * 1024), 2),
                "row_count": rows,
                "columns": columns,
                "status": "Ready"
            })
        else:
            meta.append({
                "name": f_name,
                "size_mb": 0,
                "row_count": 0,
                "columns": [],
                "status": "Missing"
            })
            
    return meta

# Mount static frontend files
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)

app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
