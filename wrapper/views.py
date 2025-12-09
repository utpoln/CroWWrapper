import json
import uuid
import os
import requests  # pip install requests
from urllib.parse import quote, unquote, urljoin
from bs4 import BeautifulSoup  # pip install beautifulsoup4
from django.http import JsonResponse, HttpResponse, StreamingHttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from .browser_session import manager
from django.views.decorators.clickjacking import xframe_options_exempt
from .scraper_engine import execute_scraping_job
import uuid
from datetime import datetime
import os
import json
import glob
from django.http import JsonResponse
from django.conf import settings # Assuming you use settings for paths
import json
import uuid
import os
from datetime import datetime
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.text import slugify
from playwright.sync_api import sync_playwright

from django.http import JsonResponse
from playwright.sync_api import sync_playwright
import json
import os
import itertools
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from playwright.sync_api import sync_playwright
import json
import os
import itertools
from urllib.parse import urlparse, urlencode, urlunparse
import openai
import json
from urllib.parse import urljoin



SAVE_DIR = "saved_wrappers" 

CLEANUP_CSS = """
<style id="scraper-cleanup-styles">
    /* 1. Force Scroll (Unlock body) */
    html, body {
        overflow: auto !important;
        position: static !important;
        filter: none !important; /* Remove blur effects */
    }

    /* 2. Common Cookie/GDPR Banners */
    #onetrust-banner-sdk, .onetrust-pc-dark-filter, 
    #cookie-law-info-bar, .cookie-banner, 
    #gdpr-cookie-message, .cc-banner,
    .fc-consent-root, #CybotCookiebotDialog,
    
    /* 3. Common Chatbots & Widgets */
    #intercom-container, .intercom-lightweight-app,
    #hubspot-messages-iframe-container,
    .drift-widget-container,
    iframe[title*="chat"],
    
    /* 4. Common Newsletter Popups */
    .modal-backdrop, .fade.in, 
    div[class*="popup"], div[class*="modal"], 
    div[id*="popup"], div[id*="modal"],
    div[class*="overlay"], div[id*="overlay"] 
    {
        /* Be careful with generic names, but for a scraper builder, 
           it is better to hide too much than too little. */
    }
    
    /* 5. SPECIFIC KNOWN ANNOYANCES (Add more as you find them) */
    [aria-modal="true"],
    [role="dialog"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
    }
</style>
"""

def index(request):
    """Renders the landing page."""
    context = {
        "API_BASE_URL": settings.API_BASE_URL
    }
    return render(request, "index.html", context)


@csrf_exempt
def start_session(request):
    try:
        body = json.loads(request.body)
        url = body.get("url")
        wrapper_name = body.get("wrapper_name", "Untitled") # Capture Name

        if not url: return JsonResponse({"error": "URL missing"}, status=400)

        session_id = str(uuid.uuid4())

        # Store name in session manager (Memory/DB)
        manager.start_session(session_id, url)
        manager.sessions[session_id]['wrapper_name'] = wrapper_name # STORE IT

        return JsonResponse({
            "session_id": session_id,
            "redirect_url": f"{settings.API_BASE_URL}/api/proxy_view/{session_id}/"
        })
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def proxy_view(request, session_id):
    """
    Serves the page with injected Overlay AND Anti-Popup CSS.
    """
    
    
    # 1. Fetch content
    session_data = manager.sessions.get(session_id)
    if not session_data:
        return HttpResponse("Session not found", status=404)

    wrapper_name = session_data.get('wrapper_name', 'Untitled')
    original_url = session_data['url']
    
    content = manager.get_page_content(session_id)

    if not content:
        return HttpResponse("Loading...", status=404)

    # 2. Parse HTML
    soup = BeautifulSoup(content, "html.parser")
    proxy_base = f"{settings.API_BASE_URL}/api/proxy_asset/?url="


    # --- REWRITE ASSETS ---
    for tag in soup.find_all('link', href=True):
        tag['href'] = f"{proxy_base}{quote(urljoin(original_url, tag['href']))}"

    for tag in soup.find_all('img', src=True):
        tag['src'] = f"{proxy_base}{quote(urljoin(original_url, tag['src']))}"
        if tag.has_attr('srcset'): del tag['srcset']

    # --- REMOVE JS ---
    for tag in soup.find_all('script'):
        tag.decompose()

    # --- DISABLE NAVIGATION ---
    for tag in soup.find_all('a'):
        tag['onclick'] = "return false;"
        tag['style'] = tag.get('style', '') + "; cursor: default; pointer-events: none;"
        if tag.has_attr('href'): tag['href'] = "javascript:void(0);"

    # =========================================================
    # --- [NEW] INJECT ANTI-POPUP CSS ---
    # =========================================================
    # We create a new soup object from the string and append it
    cleanup_style = BeautifulSoup(CLEANUP_CSS, "html.parser")
    if soup.head:
        soup.head.append(cleanup_style)
    elif soup.body:
        soup.body.insert(0, cleanup_style)

    # =========================================================
    # --- INJECT OVERLAY ---
    # =========================================================
    host = request.get_host()
    scheme = request.scheme
    api_base = f"{scheme}://{host}/api"
    api_base_url = settings.API_BASE_URL if settings.API_BASE_URL else f"{scheme}://{host}"

    # 1. Config
    config_script = soup.new_tag("script")
    config_script.string = f"""
        window.DJANGO_SESSION_ID = '{session_id}';
        window.DJANGO_API_URL = '{api_base}';
        window.DJANGO_API_BASE = '{api_base_url}';
        window.__WRAPPER_NAME__ = "{wrapper_name}"; 
        window.__ORIGINAL_URL__ = "{original_url}";
    """

    # 2. Overlay JS
    js_path = os.path.join("wrapper", "static", "js", "selection_overlay.js")
    overlay_script = soup.new_tag("script")
    try:
        with open(js_path, "r", encoding="utf-8") as f:
            overlay_script.string = f.read()
    except FileNotFoundError:
        overlay_script.string = "console.error('Overlay JS not found');"

    if soup.body:
        soup.body.append(config_script)
        soup.body.append(overlay_script)
    else:
        soup.append(config_script)
        soup.append(overlay_script)

    return HttpResponse(str(soup))


@csrf_exempt
@xframe_options_exempt
def proxy_asset(request):
    """
    The Asset Tunnel:
    1. Fetches an image/css/font from the real website.
    2. If it is CSS, it rewrites relative URLs to keep them working via the proxy.
    3. Streams binary data (images/fonts) directly.
    """
    target_url = request.GET.get('url')
    if not target_url:
        return HttpResponse("Missing URL", status=400)

    try:
        # 1. Decode the target URL
        target_url = unquote(target_url)
        
        # 2. Mimic a real browser
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Referer": target_url 
        }

        # 3. Fetch the asset
        # We disable verification to prevent SSL errors on some sites
        resp = requests.get(target_url, headers=headers, stream=True, timeout=15, verify=False)
        content_type = resp.headers.get('Content-Type', '').lower()

        # --- CSS REWRITING LOGIC ---
        # Only rewrite if it is explicitly CSS
        if 'text/css' in content_type:
            try:
                # Get content. Try UTF-8, fall back to Latin-1 if binary garbage
                content = resp.content
                try:
                    css_text = content.decode('utf-8')
                except UnicodeDecodeError:
                    css_text = content.decode('latin-1')
                
                # Base URL for relative paths is the CSS file's own URL
                css_base_url = target_url
                
                # Construct the local proxy prefix
      
                proxy_prefix = urljoin(settings.API_BASE_URL, '/api/proxy_asset/?url=')

                def rewrite_url(match):
                    # 1. Extract the URL from: url('...') or url("...") or url(...)
                    # match.group(1) is the quote (or empty), match.group(2) is the url
                    quote_char = match.group(1) or ""
                    original_path = match.group(2).strip()
                    
                    # 2. Don't touch data URIs or already absolute URLs
                    if original_path.startswith('data:') or original_path.startswith('http'):
                        return f'url({quote_char}{original_path}{quote_char})'
                    
                    # 3. Resolve relative path to absolute
                    # e.g. ../fonts/font.woff  ->  https://site.com/fonts/font.woff
                    absolute_url = urljoin(css_base_url, original_path)
                    
                    # 4. Wrap it in our proxy
                    new_path = f"{proxy_prefix}{quote(absolute_url)}"
                    
                    return f'url({quote_char}{new_path}{quote_char})'

                # Robust Regex: Matches url('path') | url("path") | url(path)
                # Group 1: Optional Quote
                # Group 2: The Path (non-greedy)
                new_css = re.sub(r'url\s*\(\s*(["\']?)([^)"\']+)\s*(["\']?)\s*\)', rewrite_url, css_text)
                
                return HttpResponse(new_css, content_type=content_type)

            except Exception as css_error:
                # Fallback: If rewriting fails, serve raw to prevent site breaking
                print(f"CSS Rewrite Error: {css_error}")
                return HttpResponse(resp.content, content_type=content_type)

        # --- BINARY STREAMING (Images, Fonts, etc.) ---
        return StreamingHttpResponse(
            resp.raw,
            content_type=content_type,
            status=resp.status_code
        )

    except Exception as e:
        print(f"Proxy Asset Fail: {e}")
        return HttpResponse("", status=404)

# --- SAVE & STOP LOGIC ---



@csrf_exempt
def stop_session(request):
    """
    Stops the session and saves the configuration to the SAVE_DIR.
    Uses the user-provided 'wrapper_name' to generate the filename.
    """
    try:
        body = json.loads(request.body or "{}")
        
        # The frontend sends data inside the "config" key
        config_data = body.get("config", {})
        
        # 1. Extract Wrapper Name (Fallback to 'untitled' if missing)
        wrapper_name = config_data.get("wrapper_name", "untitled")
        
        # 2. Generate a filesystem-safe filename
        # e.g., "My Scraper 1" -> "my-scraper-1_a1b2c3d4.json"
        safe_name = slugify(wrapper_name)
        unique_id = uuid.uuid4().hex[:8]
        filename = f"{safe_name}_{unique_id}.json"

        # 3. Ensure the SAVE_DIR exists
        if not os.path.exists(SAVE_DIR):
            os.makedirs(SAVE_DIR)

        # 4. Construct full path
        file_path = os.path.join(SAVE_DIR, filename)

        # 5. Save the configuration to file
        with open(file_path, "w") as f:
            json.dump(config_data, f, indent=2)

        # Optional: You can close the browser session here if you want
        # session_id = body.get("session_id")
        # if session_id: manager.close_session(session_id)

        return JsonResponse({
            "status": "saved", 
            "file": filename, 
            "wrapper_name": wrapper_name,
            "data": config_data
        })

    except Exception as e:
        print(f"Error saving wrapper: {e}")
        return JsonResponse({"error": str(e)}, status=500)




@csrf_exempt
def list_wrappers(request):
    """
    Scans the 'saved_wrappers' directory and returns wrapper details.
    """
    wrappers = []
    
    if not os.path.exists(SAVE_DIR):
        os.makedirs(SAVE_DIR)

    file_paths = glob.glob(os.path.join(SAVE_DIR, "*.json"))
    file_paths.sort(key=os.path.getmtime, reverse=True)

    for file_path in file_paths:
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                
                # Get columns
                raw_columns = data.get("columns", [])
                col_names = [col.get('name', 'Unknown') for col in raw_columns]

                # --- FIX: READ URL_PARAMS ---
                # Default to empty list if not found
                url_params = data.get("url_params", [])

                wrappers.append({
                    "filename": os.path.basename(file_path),
                    "wrapper_name": data.get("wrapper_name", "Untitled"),
                    "url": data.get("url", ""),
                    "mode": data.get("mode", "Unknown"),
                    
                    # Pass the params to the frontend
                    "url_params": url_params, 
                    
                    "columns": len(raw_columns), 
                    "columns_data": col_names 
                })
        except Exception as e:
            print(f"Error reading {file_path}: {e}")
            continue

    return JsonResponse({"wrappers": wrappers})



# Initialize OpenAI Client
# Ensure OPENAI_API_KEY is set in your environment variables
client = openai.OpenAI(api_key="Your-OpenAI-API-Key-Here")
def resolve_pagination_with_llm(html_content, current_url):
    """
    Sends pagination HTML to LLM to find the 'Next' button XPath.
    Returns: The XPath string (e.g., "//a[@class='next']") or None.
    """
    prompt = f"""
    Analyze the following HTML snippet from a website's pagination bar.
    Your goal is to identify the clickable element that goes to the **NEXT page**.

    **Context:**
    - Current URL: {current_url}
    - Look for text like ">", "Next", "»", "More", or icons (svg/i) inside buttons.
    - IGNORE "Previous" buttons or disabled buttons (class="disabled").
    - If the "Next" button is an <a> tag, target the <a> tag itself.
    - If it's a <button>, target the <button>.
    
    **Return Format:**
    Return ONLY a raw JSON object with this structure:
    {{
        "xpath": "The relative xpath to click the next button (e.g. .//a[contains(text(), 'Next')])",
        "confidence": "high/medium/low"
    }}

    **HTML Content:**
    {html_content}
    """

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini", 
            messages=[
                {"role": "system", "content": "You are a web scraping expert specializing in XPaths."},
                {"role": "user", "content": prompt}
            ],
            temperature=0,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        return result.get('xpath')
    except Exception as e:
        print(f"LLM Pagination Error: {e}")
        return None
    
    
    
@csrf_exempt 
def run_wrapper(request):
    # --- HANDLE POST REQUEST ---
    if request.method == 'POST':
        try:
            body = json.loads(request.body)
            filename = body.get('filename')
            base_url = body.get('base_url')
            dynamic_params = body.get('params', {}) 
            max_items = int(body.get('max_items') or 0) 
            col_mapping = body.get('col_mapping', None) 
        except json.JSONDecodeError:
            return JsonResponse({"status": "error", "message": "Invalid JSON"}, status=400)
    else:
        # Fallback for GET
        filename = request.GET.get('file')
        base_url = request.GET.get('url')
        dynamic_params = {}
        max_items = 0
        col_mapping = None

    if not filename: 
        return JsonResponse({"status": "error", "message": "Filename missing"}, status=400)
    
    # [TODO] Ensure this path is correct in your project
    file_path = os.path.join(SAVE_DIR, filename) 
    if not os.path.exists(file_path): 
        return JsonResponse({"status": "error", "message": "Wrapper not found"}, status=404)

    with open(file_path, 'r') as f:
        config = json.load(f)

    if not base_url: base_url = config.get('url')

    mode = config.get('mode')
    row_xpath = config.get('row_xpath')
    columns = config.get('columns', [])
    pagination = config.get('pagination', {})

    # --- 1. URL GENERATION (Standard) ---
    if not dynamic_params:
        target_urls = [base_url]
    else:
        # (Your existing param combination logic here)
        # keeping it short for clarity
        parsed_base = urlparse(base_url)
        target_urls = [base_url] 

    # --- 2. BATCH SCRAPING ---
    all_results = []
    EFFECTIVE_LIMIT = max_items if max_items > 0 else 1000 

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-gpu"])
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()
        
        # [CACHE] Store the resolved XPath so we don't call LLM on every page 
        cached_next_xpath = None 

        try:
            for url in target_urls:
                if len(all_results) >= EFFECTIVE_LIMIT: break

                print(f"--- Processing URL: {url} ---")
                try:
                    page.goto(url, timeout=80000, wait_until="domcontentloaded")
                except Exception as nav_err:
                    print(f"Navigation failed: {nav_err}")
                    continue

                current_page = 1
                MAX_PAGES_PER_URL = 10 
                
                while current_page <= MAX_PAGES_PER_URL:
                    if len(all_results) >= EFFECTIVE_LIMIT: break

                    # --- DATA EXTRACTION (Existing Logic) ---
                    if mode == 'A':
                        try: page.wait_for_selector(f"xpath={row_xpath}", state="attached", timeout=5000)
                        except: pass
                        rows = page.locator(f"xpath={row_xpath}").all()
                        for row in rows:
                            if len(all_results) >= EFFECTIVE_LIMIT: break
                            item = {}
                            for col in columns:
                                original_name = col['name']
                                if col_mapping and original_name not in col_mapping: continue
                                final_key = col_mapping[original_name] if col_mapping else original_name
                                try:
                                    raw_xpath = col['xpath']
                                    if raw_xpath in [".", "./"]: val = row.text_content()
                                    else:
                                        target = row.locator(f"xpath={raw_xpath}").first
                                        val = target.text_content() if target.count() > 0 else ""
                                    item[final_key] = val.strip() if val else ""
                                except: item[final_key] = ""
                            all_results.append(item)
                    else:
                        # (Mode B Logic - Keeping short)
                        pass 

                    # --- [NEW] INTELLIGENT PAGINATION ---
                    next_btn_xpath = None

                    # CASE 1: Standard Button (User clicked precisely)
                    if pagination.get('type') == 'button' and pagination.get('xpath'):
                        next_btn_xpath = pagination['xpath']
                    
                    # CASE 2: Container + LLM (User selected the whole bar)
                    elif pagination.get('type') == 'container' and pagination.get('xpath'):
                        
                        # Use Cache if available (High Efficiency)
                        if cached_next_xpath:
                            next_btn_xpath = cached_next_xpath
                        else:
                            # 1. Grab the HTML of the container
                            container = page.locator(f"xpath={pagination['xpath']}").first
                            if container.count() > 0:
                                container_html = container.evaluate("el => el.outerHTML")
                                
                                # 2. Ask LLM to analyze
                                print("--- Analyzing Pagination with LLM ---")
                                llm_xpath = resolve_pagination_with_llm(container_html, page.url)
                                
                                if llm_xpath:
                                    # Handle relative XPaths returned by LLM (starts with .//)
                                    if llm_xpath.startswith('.'):
                                        # Combine Container XPath + Relative XPath
                                        # e.g. //div[@id='pagination'] + //a[@class='next'] -> //div[@id='pagination']//a[@class='next']
                                        next_btn_xpath = pagination['xpath'] + llm_xpath[1:] 
                                    else:
                                        next_btn_xpath = llm_xpath
                                    
                                    # 3. Save to Cache
                                    cached_next_xpath = next_btn_xpath
                                    print(f"LLM Found XPath: {next_btn_xpath}")
                            else:
                                print("Pagination container not found on this page.")
                                break

                    if not next_btn_xpath:
                        break # No pagination defined or found

                    # --- EXECUTE NAVIGATION ---
                    next_btn = page.locator(f"xpath={next_btn_xpath}").first
                    if next_btn.is_visible():
                        try:
                            # Attempt Navigation
                            with page.expect_navigation(timeout=10000): 
                                next_btn.click()
                            current_page += 1
                        except:
                            # Fallback for AJAX / No-Reload pagination
                            try:
                                next_btn.click()
                                page.wait_for_load_state("networkidle")
                                current_page += 1
                            except Exception as e:
                                print(f"Pagination click failed: {e}")
                                break
                    else:
                        print("Next button not visible (End of List).")
                        break 

        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
        finally:
            browser.close()

    return JsonResponse({
        "status": "success", 
        "count": len(all_results),
        "data": all_results
    })
    

@csrf_exempt
def delete_wrapper(request):
    """
    Deletes a saved wrapper file.
    """
    if request.method != 'POST':
        return JsonResponse({"error": "POST required"}, status=405)
        
    try:
        body = json.loads(request.body)
        filename = body.get('filename')
        
        if not filename:
            return JsonResponse({"error": "Filename missing"}, status=400)
            
        file_path = os.path.join(SAVE_DIR, filename)
        
        if os.path.exists(file_path):
            os.remove(file_path)
            return JsonResponse({"status": "deleted"})
        else:
            return JsonResponse({"error": "File not found"}, status=404)
            
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)