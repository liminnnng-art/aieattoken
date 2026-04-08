"""Read a CSV of sales records, filter by minimum amount, and print a summary."""

import csv
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class SaleRecord:
    """A single row from the sales CSV."""
    date: str
    product: str
    quantity: int
    unit_price: float

    @property
    def total(self) -> float:
        return self.quantity * self.unit_price


def load_records(path: Path) -> list[SaleRecord]:
    """Read a CSV file and return a list of SaleRecord objects.

    Expected columns: date, product, quantity, unit_price
    """
    records: list[SaleRecord] = []
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            records.append(SaleRecord(
                date=row["date"],
                product=row["product"],
                quantity=int(row["quantity"]),
                unit_price=float(row["unit_price"]),
            ))
    return records


def filter_by_min_total(records: list[SaleRecord], threshold: float) -> list[SaleRecord]:
    """Return records whose line total meets or exceeds the threshold."""
    return [r for r in records if r.total >= threshold]


def print_summary(records: list[SaleRecord]) -> None:
    """Print a human-readable summary of the given records."""
    if not records:
        print("No records match the filter.")
        return

    grand_total = sum(r.total for r in records)
    print(f"{'Date':<12} {'Product':<20} {'Qty':>5} {'Price':>8} {'Total':>10}")
    print("-" * 57)
    for r in records:
        print(f"{r.date:<12} {r.product:<20} {r.quantity:>5} {r.unit_price:>8.2f} {r.total:>10.2f}")
    print("-" * 57)
    print(f"{'Records:':<12} {len(records):<20} {'Grand total:':>14} {grand_total:>10.2f}")


def main() -> int:
    """Entry point: expects a CSV path and an optional minimum total filter."""
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <csv_file> [min_total]", file=sys.stderr)
        return 1

    csv_path = Path(sys.argv[1])
    min_total = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0

    try:
        records = load_records(csv_path)
    except FileNotFoundError:
        print(f"Error: file not found: {csv_path}", file=sys.stderr)
        return 1
    except (KeyError, ValueError) as exc:
        print(f"Error: malformed CSV: {exc}", file=sys.stderr)
        return 1

    filtered = filter_by_min_total(records, min_total)
    print_summary(filtered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
