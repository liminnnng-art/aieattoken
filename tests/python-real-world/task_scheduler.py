"""
Async task scheduler with priority queuing, periodic and one-shot tasks,
decorator-based task registration, and structured logging.

Requires Python 3.10+ (match/case, type union syntax, walrus operator).
"""

from __future__ import annotations

import asyncio
import heapq
import logging
import uuid
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum, auto
from functools import wraps
from typing import (
    Any,
    AsyncGenerator,
    AsyncIterator,
    Awaitable,
    Callable,
    ClassVar,
    Dict,
    Generator,
    Generic,
    List,
    Optional,
    Protocol,
    Sequence,
    Tuple,
    TypeAlias,
    TypeVar,
    Union,
    runtime_checkable,
)

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

logger = logging.getLogger("task_scheduler")
logger.setLevel(logging.DEBUG)
_handler = logging.StreamHandler()
_handler.setFormatter(
    logging.Formatter("[%(asctime)s] %(levelname)-8s %(name)s: %(message)s")
)
logger.addHandler(_handler)

# ---------------------------------------------------------------------------
# Type aliases & protocols
# ---------------------------------------------------------------------------

TaskId: TypeAlias = str
Priority: TypeAlias = int
Timestamp: TypeAlias = datetime
TaskResult: TypeAlias = Union[str, int, float, dict, None]
TaskCallback: TypeAlias = Callable[..., Awaitable[TaskResult]]

T = TypeVar("T")
R = TypeVar("R")


@runtime_checkable
class Runnable(Protocol):
    """Any object that exposes an async run interface."""

    async def run(self) -> TaskResult: ...


@runtime_checkable
class Cancellable(Protocol):
    """Anything that can be cancelled."""

    def cancel(self) -> None: ...


# ---------------------------------------------------------------------------
# Task state machine
# ---------------------------------------------------------------------------

class TaskState(Enum):
    PENDING = auto()
    QUEUED = auto()
    RUNNING = auto()
    COMPLETED = auto()
    FAILED = auto()
    CANCELLED = auto()
    RETRYING = auto()


def describe_state(state: TaskState) -> str:
    """Use match/case to return a human-readable description."""
    match state:
        case TaskState.PENDING:
            return "Task is waiting to be queued"
        case TaskState.QUEUED:
            return "Task is in the priority queue"
        case TaskState.RUNNING:
            return "Task is currently executing"
        case TaskState.COMPLETED:
            return "Task finished successfully"
        case TaskState.FAILED:
            return "Task encountered an error"
        case TaskState.CANCELLED:
            return "Task was cancelled before completion"
        case TaskState.RETRYING:
            return "Task is being retried after a failure"
        case _:
            return "Unknown state"


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class SchedulerError(Exception):
    """Root exception for the scheduler subsystem."""


class TaskNotFoundError(SchedulerError):
    """Raised when a task id is not in the registry."""


class TaskAlreadyRunningError(SchedulerError):
    """Raised when attempting to start an already-running task."""


class MaxRetriesExceededError(SchedulerError):
    """Raised when a task exhausts its retry budget."""


# ---------------------------------------------------------------------------
# Event / hook system
# ---------------------------------------------------------------------------

class EventBus:
    """Simple publish-subscribe for scheduler lifecycle events."""

    def __init__(self) -> None:
        self._listeners: Dict[str, List[Callable[..., Awaitable[None]]]] = {}

    def on(self, event: str, callback: Callable[..., Awaitable[None]]) -> None:
        self._listeners.setdefault(event, []).append(callback)

    async def emit(self, event: str, *args: Any, **kwargs: Any) -> None:
        for cb in self._listeners.get(event, []):
            try:
                await cb(*args, **kwargs)
            except Exception:
                logger.exception(f"Listener error on event '{event}'")


# ---------------------------------------------------------------------------
# Task hierarchy (abstract base -> concrete variants)
# ---------------------------------------------------------------------------

@dataclass(order=False)
class TaskBase(ABC):
    """Abstract base for every schedulable unit of work."""

    task_id: TaskId = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "unnamed"
    priority: Priority = 5
    state: TaskState = TaskState.PENDING
    max_retries: int = 3
    retry_count: int = 0
    created_at: Timestamp = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[Timestamp] = None
    finished_at: Optional[Timestamp] = None
    result: TaskResult = None
    error: Optional[str] = None

    _registry: ClassVar[Dict[TaskId, TaskBase]] = {}

    def __post_init__(self) -> None:
        TaskBase._registry[self.task_id] = self

    # comparison helpers for heapq (lower number = higher priority)
    def __lt__(self, other: object) -> bool:
        if not isinstance(other, TaskBase):
            return NotImplemented
        return (self.priority, self.created_at) < (other.priority, other.created_at)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, TaskBase):
            return NotImplemented
        return self.task_id == other.task_id

    def __hash__(self) -> int:
        return hash(self.task_id)

    def __repr__(self) -> str:
        return (
            f"{type(self).__name__}(id={self.task_id!r}, name={self.name!r}, "
            f"state={self.state.name}, pri={self.priority})"
        )

    # --- lifecycle ---
    def transition(self, new_state: TaskState) -> None:
        old = self.state
        match (old, new_state):
            case (TaskState.CANCELLED, _):
                raise SchedulerError("Cannot transition from CANCELLED")
            case (TaskState.COMPLETED, _):
                raise SchedulerError("Cannot transition from COMPLETED")
            case (_, TaskState.RUNNING):
                self.started_at = datetime.now(timezone.utc)
            case (_, TaskState.COMPLETED | TaskState.FAILED | TaskState.CANCELLED):
                self.finished_at = datetime.now(timezone.utc)
            case _:
                pass
        self.state = new_state
        logger.info(f"Task {self.name!r} {old.name} -> {new_state.name}")

    def cancel(self) -> None:
        if self.state not in (TaskState.COMPLETED, TaskState.CANCELLED):
            self.transition(TaskState.CANCELLED)

    @property
    def elapsed(self) -> Optional[timedelta]:
        if self.started_at and self.finished_at:
            return self.finished_at - self.started_at
        return None

    @abstractmethod
    async def run(self) -> TaskResult:
        ...

    @staticmethod
    def lookup(task_id: TaskId) -> TaskBase:
        if (task := TaskBase._registry.get(task_id)) is not None:
            return task
        raise TaskNotFoundError(f"No task with id {task_id!r}")


class OneShotTask(TaskBase):
    """A task that executes exactly once."""

    callback: TaskCallback = field(default=None)  # type: ignore[assignment]
    args: Tuple[Any, ...] = ()
    kwargs: Dict[str, Any] = field(default_factory=dict)

    def __init__(
        self,
        callback: TaskCallback,
        *args: Any,
        name: str = "",
        priority: Priority = 5,
        max_retries: int = 3,
        **kwargs: Any,
    ) -> None:
        super().__init__(
            name=name or callback.__name__,
            priority=priority,
            max_retries=max_retries,
        )
        self.callback = callback
        self.args = args
        self.kwargs = kwargs

    async def run(self) -> TaskResult:
        return await self.callback(*self.args, **self.kwargs)


@dataclass
class PeriodicTask(TaskBase):
    """A task that re-schedules itself at a fixed interval."""

    interval_seconds: float = 60.0
    callback: Optional[TaskCallback] = None
    _stop_event: asyncio.Event = field(default_factory=asyncio.Event, repr=False)

    async def run(self) -> TaskResult:
        if self.callback is None:
            raise SchedulerError(f"Periodic task {self.name!r} has no callback")
        return await self.callback()

    def stop(self) -> None:
        self._stop_event.set()
        logger.info(f"Periodic task {self.name!r} stop requested")

    @property
    def stopped(self) -> bool:
        return self._stop_event.is_set()


class _CompositeBase(TaskBase):
    """Mixin providing child-task iteration via yield from."""

    children: List[TaskBase] = field(default_factory=list)

    def child_tasks(self) -> Generator[TaskBase, None, None]:
        yield from self.children

    def add(self, task: TaskBase) -> None:
        self.children.append(task)


@dataclass
class CompositeTask(_CompositeBase):
    """Runs a sequence of child tasks in order."""

    children: List[TaskBase] = field(default_factory=list)

    async def run(self) -> TaskResult:
        results: List[TaskResult] = []
        for idx, child in enumerate(self.child_tasks()):
            logger.debug(f"Composite step {idx}: running {child.name!r}")
            child.transition(TaskState.RUNNING)
            try:
                res = await child.run()
                child.result = res
                child.transition(TaskState.COMPLETED)
                results.append(res)
            except Exception as exc:
                child.error = str(exc)
                child.transition(TaskState.FAILED)
                raise
        return {"steps": len(results)}


# ---------------------------------------------------------------------------
# Decorators for task registration
# ---------------------------------------------------------------------------

_TASK_FUNCTIONS: Dict[str, TaskCallback] = {}


def task(func: TaskCallback) -> TaskCallback:
    """Register an async callable as a named task (no-arg decorator)."""
    _TASK_FUNCTIONS[func.__name__] = func
    logger.debug(f"Registered task function '{func.__name__}'")

    @wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> TaskResult:
        return await func(*args, **kwargs)

    return wrapper


def scheduled_task(
    *,
    priority: Priority = 5,
    max_retries: int = 3,
) -> Callable[[TaskCallback], TaskCallback]:
    """Parameterised decorator that also sets scheduling metadata."""

    def decorator(func: TaskCallback) -> TaskCallback:
        func._task_priority = priority  # type: ignore[attr-defined]
        func._task_max_retries = max_retries  # type: ignore[attr-defined]
        _TASK_FUNCTIONS[func.__name__] = func

        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> TaskResult:
            return await func(*args, **kwargs)

        return wrapper

    return decorator


# ---------------------------------------------------------------------------
# Priority queue wrapper
# ---------------------------------------------------------------------------

class PriorityQueue:
    """Min-heap of tasks ordered by (priority, created_at)."""

    def __init__(self) -> None:
        self._heap: List[TaskBase] = []
        self._entry_set: set[TaskId] = set()

    def push(self, task: TaskBase) -> None:
        if task.task_id in self._entry_set:
            return
        heapq.heappush(self._heap, task)
        self._entry_set.add(task.task_id)
        task.transition(TaskState.QUEUED)

    def pop(self) -> TaskBase:
        while self._heap:
            task = heapq.heappop(self._heap)
            self._entry_set.discard(task.task_id)
            if task.state != TaskState.CANCELLED:
                return task
        raise SchedulerError("Priority queue is empty")

    @property
    def size(self) -> int:
        return len(self._entry_set)

    def __bool__(self) -> bool:
        return self.size > 0

    def __repr__(self) -> str:
        return f"PriorityQueue(size={self.size})"

    def drain(self) -> Generator[TaskBase, None, None]:
        while self:
            yield self.pop()


# ---------------------------------------------------------------------------
# Scheduler (the main engine)
# ---------------------------------------------------------------------------

class Scheduler:
    """Async engine that processes tasks from a priority queue."""

    def __init__(self, *, max_concurrency: int = 4) -> None:
        self._queue = PriorityQueue()
        self._max_concurrency = max_concurrency
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._events = EventBus()
        self._running: Dict[TaskId, asyncio.Task[Any]] = {}
        self._shutdown = asyncio.Event()

    # --- public API ---
    def submit(self, task: TaskBase) -> TaskId:
        self._queue.push(task)
        logger.info(f"Submitted {task.name!r} (pri={task.priority})")
        return task.task_id

    def submit_many(self, *tasks: TaskBase) -> List[TaskId]:
        return [self.submit(t) for t in tasks]

    async def run_one(self, task: TaskBase) -> TaskResult:
        async with self._acquire_slot():
            task.transition(TaskState.RUNNING)
            await self._events.emit("task_started", task)
            try:
                result = await asyncio.wait_for(task.run(), timeout=300.0)
                task.result = result
                task.transition(TaskState.COMPLETED)
                await self._events.emit("task_completed", task)
                return result
            except asyncio.TimeoutError:
                task.error = "Timed out after 300s"
                task.transition(TaskState.FAILED)
                await self._events.emit("task_failed", task)
                raise
            except Exception as exc:
                task.error = str(exc)
                if task.retry_count < task.max_retries:
                    task.retry_count += 1
                    task.transition(TaskState.RETRYING)
                    logger.warning(
                        f"Retrying {task.name!r} "
                        f"({task.retry_count}/{task.max_retries})"
                    )
                    return await self.run_one(task)
                task.transition(TaskState.FAILED)
                await self._events.emit("task_failed", task)
                raise MaxRetriesExceededError(
                    f"Task {task.name!r} failed after {task.max_retries} retries"
                ) from exc
            finally:
                self._running.pop(task.task_id, None)

    async def process_queue(self) -> int:
        completed = 0
        async_tasks: List[asyncio.Task[Any]] = []
        for queued_task in self._queue.drain():
            t = asyncio.create_task(self.run_one(queued_task))
            self._running[queued_task.task_id] = t
            async_tasks.append(t)
        results = await asyncio.gather(*async_tasks, return_exceptions=True)
        for r in results:
            if not isinstance(r, BaseException):
                completed += 1
        return completed

    async def run_periodic(self, task: PeriodicTask) -> None:
        while not task.stopped and not self._shutdown.is_set():
            try:
                task.state = TaskState.PENDING
                await self.run_one(task)
            except Exception:
                logger.exception(f"Periodic task {task.name!r} iteration failed")
            await asyncio.sleep(task.interval_seconds)

    def shutdown(self) -> None:
        self._shutdown.set()
        for tid, async_task in self._running.items():
            async_task.cancel()
            logger.info(f"Cancelled in-flight task {tid}")

    # --- hooks ---
    def on_task_started(self, cb: Callable[..., Awaitable[None]]) -> None:
        self._events.on("task_started", cb)

    def on_task_completed(self, cb: Callable[..., Awaitable[None]]) -> None:
        self._events.on("task_completed", cb)

    def on_task_failed(self, cb: Callable[..., Awaitable[None]]) -> None:
        self._events.on("task_failed", cb)

    # --- context manager ---
    @asynccontextmanager
    async def session(self) -> AsyncGenerator[Scheduler, None]:
        logger.info("Scheduler session starting")
        try:
            yield self
        finally:
            self.shutdown()
            logger.info("Scheduler session closed")

    # --- introspection helpers ---
    @property
    def pending_count(self) -> int:
        return self._queue.size

    @property
    def running_count(self) -> int:
        return len(self._running)

    def status_report(self) -> Dict[str, Any]:
        return {
            "pending": self.pending_count,
            "running": self.running_count,
            "max_concurrency": self._max_concurrency,
            "shutdown_requested": self._shutdown.is_set(),
        }

    @asynccontextmanager
    async def _acquire_slot(self) -> AsyncGenerator[None, None]:
        await self._semaphore.acquire()
        try:
            yield
        finally:
            self._semaphore.release()

    def __repr__(self) -> str:
        return (
            f"Scheduler(pending={self.pending_count}, "
            f"running={self.running_count}, "
            f"max_concurrency={self._max_concurrency})"
        )


# ---------------------------------------------------------------------------
# Async iteration helpers
# ---------------------------------------------------------------------------

async def iter_completed(
    tasks: Sequence[TaskBase],
) -> AsyncIterator[Tuple[TaskId, TaskResult]]:
    """Yield (task_id, result) pairs as tasks complete."""
    scheduler = Scheduler()
    for t in tasks:
        scheduler.submit(t)
    await scheduler.process_queue()
    for t in tasks:
        if t.state == TaskState.COMPLETED:
            yield t.task_id, t.result


def build_task_chain(
    callbacks: List[TaskCallback],
    *,
    prefix: str = "step",
) -> CompositeTask:
    """Construct a CompositeTask from a list of async callables."""
    children = [
        OneShotTask(cb, name=f"{prefix}_{idx}", priority=idx)
        for idx, cb in enumerate(callbacks)
    ]
    composite = CompositeTask(name=f"{prefix}_chain", children=children)
    return composite


# ---------------------------------------------------------------------------
# Example registered tasks
# ---------------------------------------------------------------------------

@task
async def fetch_data(url: str = "https://example.com") -> TaskResult:
    logger.info(f"Fetching data from {url}")
    await asyncio.sleep(0.01)
    return {"url": url, "status": 200}


@scheduled_task(priority=2, max_retries=5)
async def send_heartbeat() -> TaskResult:
    now = datetime.now(timezone.utc)
    logger.debug(f"Heartbeat at {now.isoformat()}")
    return {"ts": now.isoformat()}


@task
async def aggregate_metrics(*sources: str, **options: Any) -> TaskResult:
    merged: Dict[str, Any] = {}
    for idx, src in enumerate(sources):
        merged[f"source_{idx}"] = src
    if (fmt := options.get("format")) is not None:
        merged["output_format"] = fmt
    for key, value in zip(merged.keys(), merged.values()):
        logger.debug(f"Metric entry: {key}={value}")
    return merged
