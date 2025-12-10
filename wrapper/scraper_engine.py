import json
import re
import asyncio
import os
from playwright.async_api import async_playwright
from lxml import html  

class ScraperEngine:
    def __init__(self, config_source):
        """
        Load the scraper configuration.
        Args:
            config_source: Can be a file path (str) OR a Python list/dict (raw config).
        """
        if isinstance(config_source, str):
            # Check if file exists; if not, assume it's in the current working directory (project root)
            if not os.path.exists(config_source):
                 potential_path = os.path.join(os.getcwd(), config_source)
                 if os.path.exists(potential_path):
                     config_source = potential_path
            
            try:
                with open(config_source, 'r') as f:
                    self.config = json.load(f)
            except FileNotFoundError:
                raise Exception(f"Wrapper file not found: {config_source}")
        elif isinstance(config_source, (list, dict)):
            self.config = config_source
        else:
            raise Exception("Invalid config source. Must be a file path or JSON object.")

    def _extract_text(self, element):
        """
        Safe text extraction from an lxml element.
        """
        try:
            if hasattr(element, 'text_content'):
                # text_content() grabs all text inside the node and its children
                return element.text_content().strip()
            return str(element).strip()
        except Exception:
            return None

    def _process_block(self, tree, item):
        """
        Handles 'repetitive_block' (Lists/Tables) using static lxml parsing.
        """
        results = []
        specific_xpath = item['xpath']
        
        # 1. Generalize XPath: Remove the specific index [1] at the end
        general_xpath = re.sub(r'\[\d+\]$', '', specific_xpath)
        
        # 2. Find all matching elements in the static HTML tree
        elements = tree.xpath(general_xpath)
        print(f"DEBUG: Found {len(elements)} items for block '{item['name']}' using XPath: {general_xpath}")

        # 3. Iterate and Extract Columns
        for el in elements:
            row_data = {}
            
            if 'blockColumns' in item and item['blockColumns']:
                for col in item['blockColumns']:
                    rel_xpath = col['relXpath']
                    
                    # Ensure relative path syntax for lxml
                    if not rel_xpath.startswith('.'):
                        rel_xpath = '.' + rel_xpath
                    
                    try:
                        # Run xpath on the specific element node
                        child_nodes = el.xpath(rel_xpath)
                        
                        if child_nodes:
                            # Take the first match if multiple exist
                            row_data[col['name']] = self._extract_text(child_nodes[0])
                        else:
                            row_data[col['name']] = None
                    except Exception as e:
                        # print(f"DEBUG: Failed col '{col['name']}': {e}")
                        row_data[col['name']] = None
            else:
                # Fallback: grab whole row text
                row_data['raw'] = self._extract_text(el)
            
            results.append(row_data)
        
        return results

    async def run(self, target_url):
        """
        Main execution function.
        1. Loads page with Playwright (handling JS/Hydration).
        2. Captures full HTML.
        3. Parses HTML with lxml.
        """
        data = {}
        
        async with async_playwright() as p:
            # Launch Browser
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            print(f"Scraping: {target_url}")
            try:
                # 1. Navigate
                await page.goto(target_url, timeout=60000, wait_until="domcontentloaded")
                
                # 2. Wait for Data Hydration (Crucial for React/Vue apps)
                # We wait for network to be idle, meaning data has finished fetching.
                try:
                    await page.wait_for_load_state("networkidle", timeout=4000)
                except:
                    print("Warning: Network idle timeout, proceeding with current DOM.")
                
                # 3. Capture FULL HTML Snapshot
                # This gets the DOM *after* JavaScript has run and modified it.
                content = await page.content()
                
                # 4. Parse with lxml (Fast & Static)
                tree = html.fromstring(content)

                # Handle config as list or single dict
                config_items = self.config if isinstance(self.config, list) else [self.config]

                for item in config_items:
                    if item.get('deleted') or item.get('type') == 'pagination':
                        continue

                    key = item['name']
                    
                    if item.get('contentType') == 'repetitive_block':
                        data[key] = self._process_block(tree, item)
                    else:
                        # Single Text Extraction
                        try:
                            nodes = tree.xpath(item['xpath'])
                            if nodes:
                                data[key] = self._extract_text(nodes[0])
                            else:
                                data[key] = None
                        except:
                            data[key] = None

            except Exception as e:
                data['error'] = str(e)
            finally:
                await browser.close()
        
        return data



async def run_scraper(wrapper_file_name, target_url):
    if not os.path.isabs(wrapper_file_name):
        wrapper_file_name = os.path.join(os.getcwd(), wrapper_file_name)

    engine = ScraperEngine(wrapper_file_name)
    return await engine.run(target_url)

def execute_scraping_job(wrapper_file_name, url):
    return asyncio.run(run_scraper(wrapper_file_name, url))