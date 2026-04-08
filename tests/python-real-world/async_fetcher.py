"""
Async HTTP fetcher pattern using asyncio. Simulates HTTP requests with
async context managers, async generators, semaphore-based concurrency
limiting, retry logic, and structured result handling.
"""
from __future__ import annotations

import asyncio
import json
import random
import time
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, AsyncIterator, Optional


class FetchStatus(Enum):
    SUCCESS = auto()
    TIMEOUT = auto()
    ERROR = auto()
    RETRIED = auto()


@dataclass(frozen=True)
class FetchResult:
    """Result of a single fetch operation."""
    url: str
    status_code: int
    body: Optional[str]
    elapsed_ms: float
    fetch_status: FetchStatus
    attempt: int = 1

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 300

    def json(self) -> Any:
        if self.body is None:
            raise ValueError("Response body is empty")
        return json.loads(self.body)


@dataclass
class FetchStats:
    """Aggregate statistics for a batch of fetch operations."""
    total: int = 0
    succeeded: int = 0
    failed: int = 0
    retried: int = 0
    total_time_ms: float = 0.0

    @property
    def avg_time_ms(self) -> float:
        return self.total_time_ms / self.total if self.total > 0 else 0.0

    def record(self, result: FetchResult) -> None:
        self.total += 1
        self.total_time_ms += result.elapsed_ms
        if result.ok:
            self.succeeded += 1
        else:
            self.failed += 1
        if result.attempt > 1:
            self.retried += 1

    def summary(self) -> str:
        return (
            f"Fetched {self.total} URLs: {self.succeeded} ok, {self.failed} failed, "
            f"{self.retried} retried | avg {self.avg_time_ms:.1f}ms"
        )


class SimulatedConnection:
    """Async context manager simulating an HTTP connection pool."""

    def __init__(self, base_delay: float = 0.05) -> None:
        self._base_delay = base_delay
        self._open = False

    async def __aenter__(self) -> SimulatedConnection:
        await asyncio.sleep(0.01)  # Simulate connection setup
        self._open = True
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self._open = False

    async def request(self, url: str) -> tuple[int, str]:
        """Simulate an HTTP GET request with random latency and occasional failures."""
        if not self._open:
            raise RuntimeError("Connection is not open")

        delay = self._base_delay + random.uniform(0.01, 0.1)
        await asyncio.sleep(delay)

        # Simulate occasional failures
        roll = random.random()
        if roll < 0.1:
            raise TimeoutError(f"Request to {url} timed out")
        if roll < 0.15:
            return 500, json.dumps({"error": "Internal server error"})

        body = json.dumps({
            "url": url,
            "data": f"response_for_{url.split('/')[-1]}",
            "timestamp": time.time(),
        })
        return 200, body


async def fetch_one(
    conn: SimulatedConnection,
    url: str,
    semaphore: asyncio.Semaphore,
    max_retries: int = 3,
) -> FetchResult:
    """Fetch a single URL with retry logic and concurrency limiting."""
    async with semaphore:
        last_error: Optional[str] = None
        for attempt in range(1, max_retries + 1):
            start = time.monotonic()
            try:
                status_code, body = await conn.request(url)
                elapsed = (time.monotonic() - start) * 1000
                fetch_status = FetchStatus.SUCCESS if 200 <= status_code < 300 else FetchStatus.ERROR
                if attempt > 1:
                    fetch_status = FetchStatus.RETRIED
                return FetchResult(
                    url=url,
                    status_code=status_code,
                    body=body,
                    elapsed_ms=round(elapsed, 2),
                    fetch_status=fetch_status,
                    attempt=attempt,
                )
            except TimeoutError as exc:
                elapsed = (time.monotonic() - start) * 1000
                last_error = str(exc)
                if attempt < max_retries:
                    await asyncio.sleep(0.02 * attempt)  # Backoff

        return FetchResult(
            url=url,
            status_code=0,
            body=None,
            elapsed_ms=round(elapsed, 2),
            fetch_status=FetchStatus.TIMEOUT,
            attempt=max_retries,
        )


async def fetch_batch(urls: list[str], concurrency: int = 5) -> AsyncIterator[FetchResult]:
    """Fetch multiple URLs concurrently and yield results as they complete."""
    semaphore = asyncio.Semaphore(concurrency)
    async with SimulatedConnection() as conn:
        tasks = [
            asyncio.create_task(fetch_one(conn, url, semaphore))
            for url in urls
        ]
        for coro in asyncio.as_completed(tasks):
            result = await coro
            yield result


async def run_fetcher(urls: list[str], concurrency: int = 5) -> FetchStats:
    """Run the full fetch pipeline and print results."""
    stats = FetchStats()

    print(f"Fetching {len(urls)} URLs (concurrency={concurrency})...")
    async for result in fetch_batch(urls, concurrency):
        stats.record(result)
        symbol = "OK" if result.ok else "FAIL"
        retry_info = f" (attempt {result.attempt})" if result.attempt > 1 else ""
        print(f"  [{symbol}] {result.url} -> {result.status_code} "
              f"({result.elapsed_ms:.1f}ms){retry_info}")

    print(f"\n{stats.summary()}")
    return stats


async def main() -> None:
    urls = [f"https://api.example.com/items/{i}" for i in range(1, 16)]
    await run_fetcher(urls, concurrency=4)


if __name__ == "__main__":
    asyncio.run(main())
