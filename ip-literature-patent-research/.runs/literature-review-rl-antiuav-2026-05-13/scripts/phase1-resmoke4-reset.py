#!/usr/bin/env python3
import asyncio
from playwright.async_api import async_playwright

CDP = "http://127.0.0.1:9223"
TARGET_ID = "6a04a213"
TARGET_URL = "https://chatgpt.com/c/6a04a213-5648-83e8-b9d0-6134aef56831"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP)
        contexts = browser.contexts
        pages = [pg for ctx in contexts for pg in ctx.pages]
        matches = [pg for pg in pages if TARGET_ID in (pg.url or "")]
        if not matches:
            raise SystemExit(f"No page URL matching {TARGET_ID}; pages={[pg.url for pg in pages]}")

        keep = matches[0]
        print(f"Keeping page before reset: {keep.url}")
        await keep.goto("about:blank", wait_until="load")
        await keep.wait_for_timeout(1000)
        await keep.goto(TARGET_URL, wait_until="domcontentloaded")
        await keep.wait_for_timeout(1000)

        # Close duplicate conversation tabs after the kept tab has been restored.
        pages = [pg for ctx in contexts for pg in ctx.pages]
        for pg in pages:
            if pg is not keep and TARGET_URL in (pg.url or ""):
                print(f"Closing duplicate: {pg.url}")
                await pg.close()

        try:
            await keep.keyboard.press("Escape")
            await keep.wait_for_timeout(500)
        except Exception as e:
            print(f"Escape press warning: {e!r}")

        pages = [pg for ctx in contexts for pg in ctx.pages]
        print("Final tab list:")
        for i, pg in enumerate(pages, 1):
            marker = " KEEP" if pg is keep else ""
            print(f"{i}. {pg.url}{marker}")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
