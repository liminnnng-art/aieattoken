"""
Mini ORM-like system with model definitions, field validation,
relationship mapping, and a fluent query builder.

Supports model registration via metaclass, typed fields with validators,
one-to-many / many-to-many relationships, and an in-memory storage backend.
"""

from __future__ import annotations

import re
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum, auto
from typing import (
    Any,
    Callable,
    ClassVar,
    Dict,
    Generator,
    Generic,
    Iterator,
    List,
    Optional,
    Sequence,
    Tuple,
    Type,
    TypeVar,
    Union,
)

# ---------------------------------------------------------------------------
# Exception hierarchy
# ---------------------------------------------------------------------------

class ORMError(Exception):
    """Base exception for every ORM-related error."""


class ValidationError(ORMError):
    """Raised when a field value fails validation."""

    def __init__(self, field_name: str, message: str) -> None:
        self.field_name = field_name
        super().__init__(f"Validation failed on '{field_name}': {message}")


class FieldRequiredError(ValidationError):
    """Raised when a required field is left empty."""

    def __init__(self, field_name: str) -> None:
        super().__init__(field_name, "This field is required")


class RecordNotFoundError(ORMError):
    """Raised when a query expects exactly one record but finds none."""


class DuplicateModelError(ORMError):
    """Raised when two models share the same table name."""


class TransactionError(ORMError):
    """Raised on transaction commit / rollback failures."""


# ---------------------------------------------------------------------------
# Field descriptors
# ---------------------------------------------------------------------------

T = TypeVar("T")
M = TypeVar("M", bound="Model")


class FieldType(Enum):
    STRING = auto()
    INTEGER = auto()
    FLOAT = auto()
    BOOLEAN = auto()
    DATETIME = auto()
    UUID = auto()


@dataclass
class FieldDescriptor(Generic[T]):
    """Metadata and validation logic for a single model field."""

    name: str = ""
    field_type: FieldType = FieldType.STRING
    required: bool = True
    default: Optional[T] = None
    default_factory: Optional[Callable[[], T]] = None
    max_length: Optional[int] = None
    min_value: Optional[Union[int, float]] = None
    max_value: Optional[Union[int, float]] = None
    regex: Optional[str] = None
    validators: List[Callable[[T], bool]] = field(default_factory=list)
    primary_key: bool = False

    # --- descriptor protocol ---
    def __set_name__(self, owner: type, name: str) -> None:
        self.name = name
        self._attr = f"_field_{name}"

    def __get__(self, obj: Any, objtype: Optional[type] = None) -> Any:
        if obj is None:
            return self
        return getattr(obj, self._attr, self.default)

    def __set__(self, obj: Any, value: Any) -> None:
        self.validate(value)
        setattr(obj, self._attr, value)

    # --- validation ---
    def validate(self, value: Any) -> None:
        if value is None:
            if self.required and self.default is None and self.default_factory is None:
                raise FieldRequiredError(self.name)
            return

        if self.field_type == FieldType.STRING:
            if not isinstance(value, str):
                raise ValidationError(self.name, f"Expected str, got {type(value).__name__}")
            if self.max_length is not None and len(value) > self.max_length:
                raise ValidationError(self.name, f"Exceeds max length {self.max_length}")
            if self.regex and not re.match(self.regex, value):
                raise ValidationError(self.name, f"Does not match pattern {self.regex}")

        if self.field_type in (FieldType.INTEGER, FieldType.FLOAT):
            if self.min_value is not None and value < self.min_value:
                raise ValidationError(self.name, f"Below minimum {self.min_value}")
            if self.max_value is not None and value > self.max_value:
                raise ValidationError(self.name, f"Above maximum {self.max_value}")

        for fn in self.validators:
            if not fn(value):
                raise ValidationError(self.name, f"Custom validator {fn.__name__} failed")


class Relationship:
    """Describes a lazy-loaded one-to-many or many-to-many link."""

    def __init__(
        self,
        target_model: str,
        *,
        back_populates: Optional[str] = None,
        many_to_many: bool = False,
    ) -> None:
        self.target_model = target_model
        self.back_populates = back_populates
        self.many_to_many = many_to_many

    def resolve(self) -> Type[Model]:
        return ModelRegistry.get_model(self.target_model)


# ---------------------------------------------------------------------------
# Registry + metaclass
# ---------------------------------------------------------------------------

class ModelRegistry:
    """Central catalogue of all registered model classes."""

    _models: ClassVar[Dict[str, Type[Model]]] = {}

    @classmethod
    def register(cls, model_cls: Type[Model]) -> None:
        table = model_cls.__table_name__
        if table in cls._models:
            raise DuplicateModelError(f"Table '{table}' already registered")
        cls._models[table] = model_cls

    @classmethod
    def get_model(cls, name: str) -> Type[Model]:
        for table, model_cls in cls._models.items():
            if model_cls.__name__ == name or table == name:
                return model_cls
        raise ORMError(f"Unknown model '{name}'")

    @classmethod
    def all_models(cls) -> Generator[Tuple[str, Type[Model]], None, None]:
        yield from cls._models.items()

    @classmethod
    def clear(cls) -> None:
        cls._models.clear()


class ModelMeta(type):
    """Metaclass that auto-registers every Model subclass."""

    def __new__(
        mcs,
        name: str,
        bases: Tuple[type, ...],
        namespace: Dict[str, Any],
        **kwargs: Any,
    ) -> ModelMeta:
        cls = super().__new__(mcs, name, bases, namespace)
        if name != "Model" and any(isinstance(b, ModelMeta) for b in bases):
            if "__table_name__" not in namespace:
                cls.__table_name__ = name.lower() + "s"  # type: ignore[attr-defined]
            ModelRegistry.register(cls)  # type: ignore[arg-type]
        return cls  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# In-memory storage (acts as a tiny database backend)
# ---------------------------------------------------------------------------

class Storage:
    """Thread-unsafe in-memory store keyed by table name."""

    _tables: ClassVar[Dict[str, List[Dict[str, Any]]]] = {}
    _transaction_stack: ClassVar[List[Dict[str, List[Dict[str, Any]]]]] = []

    @classmethod
    def _ensure_table(cls, table: str) -> List[Dict[str, Any]]:
        if table not in cls._tables:
            cls._tables[table] = []
        return cls._tables[table]

    @classmethod
    def insert(cls, table: str, row: Dict[str, Any]) -> None:
        cls._ensure_table(table).append(row)

    @classmethod
    def select_all(cls, table: str) -> List[Dict[str, Any]]:
        return list(cls._ensure_table(table))

    @classmethod
    def delete_where(cls, table: str, predicate: Callable[[Dict[str, Any]], bool]) -> int:
        rows = cls._ensure_table(table)
        before = len(rows)
        cls._tables[table] = [r for r in rows if not predicate(r)]
        return before - len(cls._tables[table])

    @classmethod
    def snapshot(cls) -> Dict[str, List[Dict[str, Any]]]:
        return {t: list(rows) for t, rows in cls._tables.items()}

    @classmethod
    def restore(cls, snap: Dict[str, List[Dict[str, Any]]]) -> None:
        cls._tables = snap

    @classmethod
    @contextmanager
    def transaction(cls) -> Generator[None, None, None]:
        snap = cls.snapshot()
        cls._transaction_stack.append(snap)
        try:
            yield
        except Exception as exc:
            cls.restore(cls._transaction_stack.pop())
            raise TransactionError("Transaction rolled back") from exc
        else:
            cls._transaction_stack.pop()

    @classmethod
    def reset(cls) -> None:
        cls._tables.clear()
        cls._transaction_stack.clear()


# ---------------------------------------------------------------------------
# Query builder (fluent interface)
# ---------------------------------------------------------------------------

class QueryBuilder(Generic[M]):
    """Chainable query constructor that operates over the in-memory store."""

    def __init__(self, model_cls: Type[M]) -> None:
        self._model = model_cls
        self._filters: List[Callable[[Dict[str, Any]], bool]] = []
        self._order_key: Optional[str] = None
        self._order_desc: bool = False
        self._limit: Optional[int] = None
        self._offset: int = 0

    # --- chaining methods ---
    def filter(self, predicate: Callable[[Dict[str, Any]], bool]) -> QueryBuilder[M]:
        self._filters.append(predicate)
        return self

    def filter_by(self, **kwargs: Any) -> QueryBuilder[M]:
        for key, val in kwargs.items():
            self._filters.append(lambda row, k=key, v=val: row.get(k) == v)
        return self

    def order_by(self, key: str, *, desc: bool = False) -> QueryBuilder[M]:
        self._order_key = key
        self._order_desc = desc
        return self

    def limit(self, n: int) -> QueryBuilder[M]:
        self._limit = n
        return self

    def offset(self, n: int) -> QueryBuilder[M]:
        self._offset = n
        return self

    # --- terminal methods ---
    def _raw_rows(self) -> List[Dict[str, Any]]:
        rows = Storage.select_all(self._model.__table_name__)
        for pred in self._filters:
            rows = [r for r in rows if pred(r)]
        if self._order_key:
            rows.sort(key=lambda r: r.get(self._order_key, ""), reverse=self._order_desc)
        rows = rows[self._offset:]
        if self._limit is not None:
            rows = rows[: self._limit]
        return rows

    def all(self) -> List[M]:
        return [self._model.from_dict(r) for r in self._raw_rows()]

    def first(self) -> Optional[M]:
        rows = self.limit(1)._raw_rows()
        return self._model.from_dict(rows[0]) if rows else None

    def one(self) -> M:
        result = self.first()
        if result is None:
            raise RecordNotFoundError(f"No {self._model.__name__} matched the query")
        return result

    def count(self) -> int:
        return len(self._raw_rows())

    def exists(self) -> bool:
        return self.count() > 0

    def delete(self) -> int:
        matching_ids = {r.get("id") for r in self._raw_rows()}
        return Storage.delete_where(
            self._model.__table_name__, lambda r: r.get("id") in matching_ids
        )

    def iterate(self, batch_size: int = 50) -> Generator[M, None, None]:
        rows = self._raw_rows()
        for i in range(0, len(rows), batch_size):
            for row in rows[i : i + batch_size]:
                yield self._model.from_dict(row)

    def __repr__(self) -> str:
        parts = [f"QueryBuilder({self._model.__name__})"]
        if self._filters:
            parts.append(f".filter(x{len(self._filters)})")
        if self._order_key:
            direction = "desc" if self._order_desc else "asc"
            parts.append(f".order_by({self._order_key!r}, {direction})")
        if self._limit is not None:
            parts.append(f".limit({self._limit})")
        return "".join(parts)


# ---------------------------------------------------------------------------
# Base Model
# ---------------------------------------------------------------------------

class Model(metaclass=ModelMeta):
    """Abstract base for all ORM models."""

    __table_name__: ClassVar[str] = ""

    id: FieldDescriptor[str] = FieldDescriptor(
        field_type=FieldType.UUID, required=False, primary_key=True
    )

    def __init__(self, **kwargs: Any) -> None:
        if "id" not in kwargs:
            kwargs["id"] = str(uuid.uuid4())

        for key, val in kwargs.items():
            setattr(self, key, val)

        self._created_at = datetime.now(timezone.utc)
        self._dirty: bool = True

    # --- magic methods ---
    def __repr__(self) -> str:
        fields = ", ".join(f"{k}={v!r}" for k, v in self.to_dict().items())
        return f"{type(self).__name__}({fields})"

    def __str__(self) -> str:
        return f"<{type(self).__name__} id={self.id}>"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Model):
            return NotImplemented
        return type(self) is type(other) and self.id == other.id

    def __hash__(self) -> int:
        return hash((type(self).__name__, self.id))

    # --- persistence helpers ---
    @property
    def created_at(self) -> datetime:
        return self._created_at

    @property
    def is_dirty(self) -> bool:
        return self._dirty

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {}
        for cls in type(self).__mro__:
            for attr_name, attr_val in vars(cls).items():
                if isinstance(attr_val, FieldDescriptor):
                    result[attr_name] = getattr(self, attr_name)
        result["_created_at"] = self._created_at.isoformat()
        return result

    @classmethod
    def from_dict(cls: Type[M], data: Dict[str, Any]) -> M:
        filtered = {
            k: v
            for k, v in data.items()
            if not k.startswith("_") and k != "_created_at"
        }
        instance = cls(**filtered)
        if "_created_at" in data:
            instance._created_at = datetime.fromisoformat(data["_created_at"])
        instance._dirty = False
        return instance

    def save(self) -> None:
        table = type(self).__table_name__
        Storage.delete_where(table, lambda r: r.get("id") == self.id)
        Storage.insert(table, self.to_dict())
        self._dirty = False

    @classmethod
    def query(cls: Type[M]) -> QueryBuilder[M]:
        return QueryBuilder(cls)

    @classmethod
    def get_by_id(cls: Type[M], record_id: str) -> M:
        return cls.query().filter_by(id=record_id).one()

    @classmethod
    def create(cls: Type[M], **kwargs: Any) -> M:
        instance = cls(**kwargs)
        instance.save()
        return instance

    @staticmethod
    def generate_id() -> str:
        return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Concrete models
# ---------------------------------------------------------------------------

def _email_validator(value: str) -> bool:
    return bool(re.match(r"^[\w.+-]+@[\w-]+\.[\w.]+$", value))


class User(Model):
    __table_name__ = "users"

    username: FieldDescriptor[str] = FieldDescriptor(
        field_type=FieldType.STRING, max_length=64, regex=r"^[a-zA-Z0-9_]+$"
    )
    email: FieldDescriptor[str] = FieldDescriptor(
        field_type=FieldType.STRING, max_length=255, validators=[_email_validator]
    )
    age: FieldDescriptor[int] = FieldDescriptor(
        field_type=FieldType.INTEGER, required=False, min_value=0, max_value=200
    )
    is_active: FieldDescriptor[bool] = FieldDescriptor(
        field_type=FieldType.BOOLEAN, required=False, default=True
    )

    posts = Relationship("Post", back_populates="author")

    @property
    def display_name(self) -> str:
        return f"@{self.username}"

    @classmethod
    def find_active(cls) -> QueryBuilder[User]:
        return cls.query().filter_by(is_active=True)


class Post(Model):
    __table_name__ = "posts"

    title: FieldDescriptor[str] = FieldDescriptor(
        field_type=FieldType.STRING, max_length=200
    )
    body: FieldDescriptor[str] = FieldDescriptor(
        field_type=FieldType.STRING, required=False, default=""
    )
    author_id: FieldDescriptor[str] = FieldDescriptor(field_type=FieldType.UUID)
    view_count: FieldDescriptor[int] = FieldDescriptor(
        field_type=FieldType.INTEGER, required=False, default=0, min_value=0
    )

    author = Relationship("User")
    tags = Relationship("Tag", many_to_many=True)

    def increment_views(self) -> None:
        current: int = self.view_count or 0
        self.view_count = current + 1
        self._dirty = True


class Tag(Model):
    __table_name__ = "tags"

    label: FieldDescriptor[str] = FieldDescriptor(
        field_type=FieldType.STRING, max_length=50
    )
    colour: FieldDescriptor[str] = FieldDescriptor(
        field_type=FieldType.STRING,
        required=False,
        default="#000000",
        regex=r"^#[0-9a-fA-F]{6}$",
    )
