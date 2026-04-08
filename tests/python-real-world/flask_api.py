"""
A Flask-like REST API handler with a simple class-based router.
Simulates routing, JSON handling, error responses, decorators, and type hints.
"""
from __future__ import annotations

import json
import functools
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Callable, Optional
from enum import IntEnum


class HttpStatus(IntEnum):
    OK = 200
    CREATED = 201
    BAD_REQUEST = 400
    NOT_FOUND = 404
    METHOD_NOT_ALLOWED = 405
    INTERNAL_ERROR = 500


@dataclass
class Request:
    method: str
    path: str
    headers: dict[str, str] = field(default_factory=dict)
    body: Optional[str] = None

    def json(self) -> dict[str, Any]:
        if self.body is None:
            raise ValueError("Request body is empty")
        return json.loads(self.body)


@dataclass
class Response:
    status: int = HttpStatus.OK
    body: str = ""
    headers: dict[str, str] = field(default_factory=lambda: {"Content-Type": "application/json"})

    @staticmethod
    def json_response(data: Any, status: int = HttpStatus.OK) -> Response:
        return Response(status=status, body=json.dumps(data, default=str))

    @staticmethod
    def error(message: str, status: int = HttpStatus.BAD_REQUEST) -> Response:
        return Response.json_response({"error": message}, status=status)


@dataclass
class User:
    id: int
    name: str
    email: str
    created_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


RouteHandler = Callable[[Request], Response]


def require_json(func: RouteHandler) -> RouteHandler:
    """Decorator that validates the request has a JSON content type."""
    @functools.wraps(func)
    def wrapper(request: Request) -> Response:
        content_type = request.headers.get("Content-Type", "")
        if "application/json" not in content_type and request.method in ("POST", "PUT"):
            return Response.error("Content-Type must be application/json", HttpStatus.BAD_REQUEST)
        return func(request)
    return wrapper


def log_request(func: RouteHandler) -> RouteHandler:
    """Decorator that logs request method and path."""
    @functools.wraps(func)
    def wrapper(request: Request) -> Response:
        start = time.monotonic()
        response = func(request)
        elapsed = (time.monotonic() - start) * 1000
        print(f"{request.method} {request.path} -> {response.status} ({elapsed:.1f}ms)")
        return response
    return wrapper


class Router:
    """Simple router that maps (method, path) pairs to handler functions."""

    def __init__(self) -> None:
        self._routes: dict[tuple[str, str], RouteHandler] = {}

    def route(self, path: str, methods: list[str] | None = None) -> Callable:
        allowed = methods or ["GET"]

        def decorator(func: RouteHandler) -> RouteHandler:
            for method in allowed:
                self._routes[(method.upper(), path)] = func
            return func
        return decorator

    def dispatch(self, request: Request) -> Response:
        handler = self._routes.get((request.method, request.path))
        if handler is None:
            any_path = any(p == request.path for (_, p) in self._routes)
            if any_path:
                return Response.error("Method not allowed", HttpStatus.METHOD_NOT_ALLOWED)
            return Response.error("Not found", HttpStatus.NOT_FOUND)
        try:
            return handler(request)
        except json.JSONDecodeError:
            return Response.error("Invalid JSON in request body")
        except Exception as exc:
            return Response.error(f"Internal error: {exc}", HttpStatus.INTERNAL_ERROR)


# --- Application setup ---

app = Router()
_users_db: dict[int, User] = {}
_next_id: int = 1


@app.route("/users", methods=["GET"])
@log_request
def list_users(request: Request) -> Response:
    """Return all users as a JSON array."""
    users = [u.to_dict() for u in _users_db.values()]
    return Response.json_response(users)


@app.route("/users", methods=["POST"])
@log_request
@require_json
def create_user(request: Request) -> Response:
    """Create a new user from JSON body."""
    global _next_id
    data = request.json()
    name = data.get("name")
    email = data.get("email")
    if not name or not email:
        return Response.error("Fields 'name' and 'email' are required")
    user = User(id=_next_id, name=name, email=email, created_at=time.strftime("%Y-%m-%dT%H:%M:%S"))
    _users_db[user.id] = user
    _next_id += 1
    return Response.json_response(user.to_dict(), status=HttpStatus.CREATED)


@app.route("/health", methods=["GET"])
def health_check(request: Request) -> Response:
    """Simple health-check endpoint."""
    return Response.json_response({"status": "ok", "users_count": len(_users_db)})


if __name__ == "__main__":
    # Simulate some API calls
    print("--- Health check ---")
    resp = app.dispatch(Request(method="GET", path="/health"))
    print(resp.body)

    print("\n--- Create user ---")
    resp = app.dispatch(Request(
        method="POST",
        path="/users",
        headers={"Content-Type": "application/json"},
        body=json.dumps({"name": "Alice", "email": "alice@example.com"}),
    ))
    print(resp.body)

    print("\n--- List users ---")
    resp = app.dispatch(Request(method="GET", path="/users"))
    print(resp.body)

    print("\n--- Not found ---")
    resp = app.dispatch(Request(method="GET", path="/missing"))
    print(resp.body)
