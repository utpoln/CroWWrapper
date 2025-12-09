import asyncio
import threading
from playwright.async_api import (
    async_playwright,
    TimeoutError as PlaywrightTimeoutError
)

class BrowserSessionManager:
    """
    Manages multiple Playwright browser sessions in a dedicated background asyncio event loop. 
    """

    def __init__(self):
        self.sessions = {}
        self.loop = asyncio.new_event_loop()

        # Run event loop in a background thread
        
        self.thread = threading.Thread(
            target=self._start_background_loop,
            daemon=True
        )
        self.thread.start()

    # Event Loop
    
    def _start_background_loop(self):
        """Runs the event loop continuously in a background thread."""
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run_async(self, coro):
        """
        Submit a coroutine to the background event loop
        and wait for the result synchronously.
        """
        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        return future.result()

 
    # Session Management - Start
    
    async def _start_session_impl(self, session_id, url):
        """Internal async method: launches a browser and opens a page."""
        print(f"[Session {session_id}] Starting session for URL: {url}")

        playwright = await async_playwright().start()

        # Launch chrome browser
        browser = await playwright.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-gpu",
                "--disable-infobars",
            ],
        )

        # Desktop ViewPort
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/119.0.0.0 Safari/537.36"
            ),
        )

        page = await context.new_page()

        try:
            # Navigation Strategy
            
            # Step 01: Load base HTML structure
            
            await page.goto(url, wait_until="domcontentloaded", timeout=50000)
            print(f"[Session {session_id}] DOM loaded.")

            # Step 02: We attempt a soft wait for SPA/ads network noise such as popup
            try:
                await page.wait_for_load_state("networkidle", timeout=6500)
                print(f"[Session {session_id}] Network is idle.")
            except PlaywrightTimeoutError:
                print(
                    f"[Session {session_id}] Network remained busy "
                    "(ads/scripts) — proceeding."
                )

        except Exception as exc:
            print(f"[Session {session_id}] Critical startup error: {exc}")
            await browser.close()
            await playwright.stop()
            raise
        
        # Store session info
        
        self.sessions[session_id] = {
            "playwright": playwright,
            "browser": browser,
            "context": context,
            "page": page,
            "data": [],
            "url": url,
        }

        return True

    def start_session(self, session_id, url):
        """Public method: starts session synchronously (for Django)."""
        return self.run_async(self._start_session_impl(session_id, url))


    # Page Content & Script Injection
    
    async def _get_page_content_impl(self, session_id):
        """Return raw HTML content of the page."""
        session = self.sessions.get(session_id)
        if session:
            return await session["page"].content()
        return None

    def get_page_content(self, session_id):
        return self.run_async(self._get_page_content_impl(session_id))

    async def _inject_script_impl(self, session_id, script_content):
        """Inject arbitrary JavaScript into the page."""
        session = self.sessions.get(session_id)
        if session:
            await session["page"].add_script_tag(content=script_content)

    def inject_script(self, session_id, script_content):
        return self.run_async(self._inject_script_impl(session_id, script_content))

   
    # Close the session we created
 
    async def _close_session_impl(self, session_id):
        """Close all Playwright objects for a session."""
        session = self.sessions.get(session_id)
        if not session:
            return False

        await session["browser"].close()
        await session["playwright"].stop()
        del self.sessions[session_id]
        return True

    def close_session(self, session_id):
        return self.run_async(self._close_session_impl(session_id))


# The global manager instance

manager = BrowserSessionManager()
