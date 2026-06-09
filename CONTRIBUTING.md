# Contributing to Databricks Project

Thank you for interest in contributing to this project! To make the process clean and professional, please follow the guidelines outlined below.

## 🤝 Code of Conduct

All contributors are expected to uphold the [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to **<[jewimaluwi2019@gmail.com]>**.

## 🐛 How to Contribute

### 1. Reporting Bugs

- Search existing issues to ensure the bug hasn't been reported yet.
- If it's a new bug, open a new issue using our **Bug Report** template.
- Provide clear steps to reproduce, the expected behavior, and system environment details.

### 2. Suggesting Features

- Suggest your feature ideas by opening an issue using our **Feature Request** template.
- Describe the core user need, the proposed solution, and potential alternatives.

### 3. Submitting Pull Requests (PRs)

- Fork the repository and create your branch from `main` (e.g. `feat/new-query` or `fix/api-path`).
- If you add files, follow the clean folder layout:
  - Notebooks go to `/notebooks`
  - Raw datasets go to `/data`
  - Webapp edits go to `/webapp`
- Write clear commit messages (e.g. `feat: add bigram chart styling` or `fix: parse empty CSV rows`).
- Create your PR using the **Pull Request Template**.

## 💻 Local Development Setup

To test the backend and dashboard interface locally:

1. Clone your fork and enter the directory:

   ```bash
   git clone https://github.com/nickymarzz/databricksproject.git
   cd databricksproject
   ```

2. Navigate to the webapp folder:

   ```bash
   cd webapp
   ```

3. Install dependencies:

   ```bash
   pip install fastapi uvicorn pandas
   ```

4. Run the webapp locally:

   ```bash
   python -m uvicorn main:app --port 8000
   ```

5. Run queries in the console to verify execution works.
