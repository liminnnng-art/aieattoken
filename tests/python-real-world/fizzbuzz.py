"""FizzBuzz CLI tool with configurable range and divisors."""

import argparse
import sys
from typing import Iterator


def fizzbuzz(n: int, fizz: int = 3, buzz: int = 5) -> Iterator[str]:
    """Yield FizzBuzz results from 1 to n inclusive.

    Args:
        n: Upper bound of the range (inclusive).
        fizz: Divisor for "Fizz" (default 3).
        buzz: Divisor for "Buzz" (default 5).

    Yields:
        "Fizz", "Buzz", "FizzBuzz", or the number as a string.
    """
    for i in range(1, n + 1):
        label = ""
        if i % fizz == 0:
            label += "Fizz"
        if i % buzz == 0:
            label += "Buzz"
        yield label or str(i)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="Print FizzBuzz sequence.")
    parser.add_argument("n", type=int, help="Upper bound (inclusive)")
    parser.add_argument("--fizz", type=int, default=3, help="Fizz divisor")
    parser.add_argument("--buzz", type=int, default=5, help="Buzz divisor")
    return parser.parse_args(argv)


def main() -> int:
    """Entry point. Returns 0 on success, 1 on error."""
    args = parse_args()
    if args.n < 1:
        print(f"Error: n must be >= 1, got {args.n}", file=sys.stderr)
        return 1

    for line in fizzbuzz(args.n, fizz=args.fizz, buzz=args.buzz):
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
