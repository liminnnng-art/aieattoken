"""
OOP patterns demonstrating inheritance, abstract methods, properties,
__slots__, dataclasses, enums, static methods, and class methods.
"""
from __future__ import annotations

import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import ClassVar, Iterator, Optional


class Color(Enum):
    """Color palette for shapes."""
    RED = auto()
    GREEN = auto()
    BLUE = auto()
    YELLOW = auto()
    BLACK = auto()

    def hex_code(self) -> str:
        mapping = {
            Color.RED: "#FF0000",
            Color.GREEN: "#00FF00",
            Color.BLUE: "#0000FF",
            Color.YELLOW: "#FFFF00",
            Color.BLACK: "#000000",
        }
        return mapping.get(self, "#FFFFFF")


class Shape(ABC):
    """Abstract base class for all shapes."""

    __slots__ = ("_color", "_label")

    _instance_count: ClassVar[int] = 0

    def __init__(self, color: Color = Color.BLACK, label: str = "") -> None:
        self._color = color
        self._label = label
        Shape._instance_count += 1

    @property
    def color(self) -> Color:
        return self._color

    @color.setter
    def color(self, value: Color) -> None:
        if not isinstance(value, Color):
            raise TypeError(f"Expected Color, got {type(value).__name__}")
        self._color = value

    @property
    def label(self) -> str:
        return self._label or f"{type(self).__name__}_{id(self) % 10000}"

    @abstractmethod
    def area(self) -> float:
        """Calculate the area of the shape."""
        ...

    @abstractmethod
    def perimeter(self) -> float:
        """Calculate the perimeter of the shape."""
        ...

    @classmethod
    def total_instances(cls) -> int:
        return cls._instance_count

    @staticmethod
    def is_valid_dimension(value: float) -> bool:
        return isinstance(value, (int, float)) and value > 0

    def __repr__(self) -> str:
        return f"{type(self).__name__}(color={self._color.name}, label={self.label!r})"


class Circle(Shape):
    """A circle defined by its radius."""

    __slots__ = ("_radius",)

    def __init__(self, radius: float, color: Color = Color.RED, label: str = "") -> None:
        super().__init__(color, label)
        if not self.is_valid_dimension(radius):
            raise ValueError(f"Invalid radius: {radius}")
        self._radius = radius

    @property
    def radius(self) -> float:
        return self._radius

    def area(self) -> float:
        return math.pi * self._radius ** 2

    def perimeter(self) -> float:
        return 2 * math.pi * self._radius

    @classmethod
    def unit_circle(cls) -> Circle:
        """Factory method for a unit circle."""
        return cls(radius=1.0, label="unit_circle")


class Rectangle(Shape):
    """A rectangle defined by width and height."""

    __slots__ = ("_width", "_height")

    def __init__(self, width: float, height: float,
                 color: Color = Color.BLUE, label: str = "") -> None:
        super().__init__(color, label)
        if not (self.is_valid_dimension(width) and self.is_valid_dimension(height)):
            raise ValueError(f"Invalid dimensions: {width}x{height}")
        self._width = width
        self._height = height

    @property
    def width(self) -> float:
        return self._width

    @property
    def height(self) -> float:
        return self._height

    @property
    def is_square(self) -> bool:
        return math.isclose(self._width, self._height)

    def area(self) -> float:
        return self._width * self._height

    def perimeter(self) -> float:
        return 2 * (self._width + self._height)

    def diagonal(self) -> float:
        return math.hypot(self._width, self._height)

    @classmethod
    def square(cls, side: float, **kwargs: object) -> Rectangle:
        """Factory method for a square."""
        return cls(side, side, **kwargs)  # type: ignore[arg-type]


@dataclass
class ShapeCollection:
    """A named collection of shapes with aggregate operations."""
    name: str
    shapes: list[Shape] = field(default_factory=list)

    def add(self, shape: Shape) -> None:
        self.shapes.append(shape)

    def total_area(self) -> float:
        return sum(s.area() for s in self.shapes)

    def total_perimeter(self) -> float:
        return sum(s.perimeter() for s in self.shapes)

    def filter_by_color(self, color: Color) -> list[Shape]:
        return [s for s in self.shapes if s.color == color]

    def filter_by_type(self, shape_type: type) -> list[Shape]:
        return [s for s in self.shapes if isinstance(s, shape_type)]

    def largest(self) -> Optional[Shape]:
        if not self.shapes:
            return None
        return max(self.shapes, key=lambda s: s.area())

    def sorted_by_area(self, reverse: bool = False) -> list[Shape]:
        return sorted(self.shapes, key=lambda s: s.area(), reverse=reverse)

    def __iter__(self) -> Iterator[Shape]:
        return iter(self.shapes)

    def __len__(self) -> int:
        return len(self.shapes)

    def summary(self) -> str:
        lines = [
            f"Collection: {self.name} ({len(self)} shapes)",
            f"  Total area:      {self.total_area():.4f}",
            f"  Total perimeter:  {self.total_perimeter():.4f}",
        ]
        if (big := self.largest()) is not None:
            lines.append(f"  Largest:          {big!r} (area={big.area():.4f})")
        return "\n".join(lines)


if __name__ == "__main__":
    collection = ShapeCollection(name="demo")

    collection.add(Circle(5.0, color=Color.RED, label="big_circle"))
    collection.add(Circle.unit_circle())
    collection.add(Rectangle(3.0, 4.0, color=Color.GREEN))
    collection.add(Rectangle.square(2.5, color=Color.BLUE, label="my_square"))
    collection.add(Circle(2.0, color=Color.YELLOW))

    print(collection.summary())
    print()

    print("Shapes sorted by area (descending):")
    for shape in collection.sorted_by_area(reverse=True):
        print(f"  {shape!r}  area={shape.area():.4f}")

    print(f"\nRed shapes: {collection.filter_by_color(Color.RED)}")
    print(f"Circles:    {collection.filter_by_type(Circle)}")
    print(f"Total Shape instances created: {Shape.total_instances()}")
