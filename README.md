# CroW Wrapper -- Deep Web Data Integration (Sample Module)

This repository contains a **Django + JavaScript + Playwright** module
used for automated wrapper generation and browser-based data
extraction. It focuses on deep web data integration using automated wrappers.

## Features

### Playwright Session Manager

-   Launches browser sessions in a **background thread**
-   Handles async operations safely inside Django views
-   Custom user-agent & anti-bot flags
-   DOM-loaded + soft network-idle navigation strategy
-   Script injection support

### Django Backend Integration

-   Safe synchronous wrappers around async Playwright
-   Designed for API endpoints that trigger scraping/wrapper execution
-   Compatible with Django views & Celery tasks

### Clean Architecture

-   Modularized session lifecycle
-   Clear separation: browser, context, page, session store
-   Easily extendable for custom extraction logic

## 📦 Installation

### 1. Clone the repository

    git clone git@github.com:utpoln/CroWWrapper.git
    cd CroWWrapper

### 2. Create a virtual environment

    python3 -m venv venv
    source venv/bin/activate   # macOS / Linux
    venv\Scripts\activate      # Windows

### 3. Install Python dependencies

    pip install -r requirements.txt

Install Playwright browsers:

    playwright install

### 4. Django setup

    python manage.py migrate
    python manage.py runserver

## 🧪 Running Playwright Sessions

### Start a session

    manager.start_session(session_id="abc123", url="https://example.com")

### Get page HTML

    manager.get_page_content("abc123")

### Inject custom JavaScript

    manager.inject_script("abc123", "console.log('Hello from Django!')")

### Close session

    manager.close_session("abc123")

## 📁 Project Structure

    /your-repo
    │
    ├── wrapper/
    │   ├── views.py
    │   ├── session_manager.py
    │   └── ...
    │
    ├── project/
    │   └── settings.py
    │
    ├── manage.py
    └── README.md

## 🛡️ Environment Variables

This project includes a `.env.example` file to show how environment variables **can be configured**.

- `DJANGO_SECRET_KEY` → for securely configuring Django settings  
- `OPENAI_API_KEY` → for integrating OpenAI API calls in future modules  

### How to prepare for future use

1. Copy `.env.example` to `.env`  

```bash
cp .env.example .env


Add to `.gitignore`:

    .env
    *.pyc
    __pycache__/


## 📄 License

This sample code is provided for review and demonstration purposes only.
