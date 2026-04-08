"""
Data processing pipeline: reads structured data, transforms, filters,
aggregates, and writes results. Demonstrates comprehensions, typing,
dataclasses, pathlib, json, and collections usage.
"""
from __future__ import annotations

import json
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator, Optional, Sequence


@dataclass(frozen=True)
class SalesRecord:
    """A single sales transaction."""
    transaction_id: str
    product: str
    category: str
    quantity: int
    unit_price: float
    region: str
    date: str

    @property
    def total(self) -> float:
        return self.quantity * self.unit_price

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> SalesRecord:
        return cls(
            transaction_id=str(raw["transaction_id"]),
            product=str(raw["product"]),
            category=str(raw["category"]),
            quantity=int(raw["quantity"]),
            unit_price=float(raw["unit_price"]),
            region=str(raw["region"]),
            date=str(raw["date"]),
        )


@dataclass
class AggregateResult:
    """Aggregated stats for a grouping key."""
    key: str
    total_revenue: float
    transaction_count: int
    avg_quantity: float
    top_product: str
    regions: list[str] = field(default_factory=list)


def load_records(source: Path | str) -> list[SalesRecord]:
    """Load sales records from a JSON file."""
    path = Path(source)
    if not path.exists():
        raise FileNotFoundError(f"Data file not found: {path}")
    with path.open("r", encoding="utf-8") as fh:
        raw_data: list[dict[str, Any]] = json.load(fh)
    return [SalesRecord.from_dict(row) for row in raw_data]


def generate_sample_data() -> list[SalesRecord]:
    """Generate in-memory sample data for demonstration."""
    raw = [
        {"transaction_id": f"T{i:04d}", "product": prod, "category": cat,
         "quantity": qty, "unit_price": price, "region": region, "date": date}
        for i, (prod, cat, qty, price, region, date) in enumerate([
            ("Widget A", "Widgets", 10, 4.99, "North", "2024-01-15"),
            ("Widget B", "Widgets", 5, 7.49, "South", "2024-01-16"),
            ("Gadget X", "Gadgets", 3, 24.99, "North", "2024-01-17"),
            ("Gadget Y", "Gadgets", 8, 19.99, "East", "2024-02-01"),
            ("Widget A", "Widgets", 20, 4.99, "West", "2024-02-10"),
            ("Gadget X", "Gadgets", 1, 24.99, "South", "2024-02-15"),
            ("Gizmo Z", "Gizmos", 15, 9.99, "North", "2024-03-01"),
            ("Widget B", "Widgets", 12, 7.49, "East", "2024-03-05"),
            ("Gizmo Z", "Gizmos", 6, 9.99, "West", "2024-03-10"),
            ("Gadget Y", "Gadgets", 4, 19.99, "North", "2024-03-20"),
        ], start=1)
    ]
    return [SalesRecord.from_dict(r) for r in raw]


def filter_by_min_revenue(records: Sequence[SalesRecord], threshold: float) -> list[SalesRecord]:
    """Keep only records whose line total meets the threshold."""
    return [r for r in records if r.total >= threshold]


def filter_by_categories(records: Sequence[SalesRecord], categories: set[str]) -> list[SalesRecord]:
    """Keep only records in the specified categories."""
    return [r for r in records if r.category in categories]


def iter_with_running_total(records: Sequence[SalesRecord]) -> Iterator[tuple[SalesRecord, float]]:
    """Yield each record paired with its running cumulative revenue."""
    cumulative = 0.0
    for record in records:
        cumulative += record.total
        yield record, cumulative


def aggregate_by_category(records: Sequence[SalesRecord]) -> list[AggregateResult]:
    """Group records by category and compute aggregate statistics."""
    grouped: dict[str, list[SalesRecord]] = defaultdict(list)
    for rec in records:
        grouped[rec.category].append(rec)

    results: list[AggregateResult] = []
    for category, group in sorted(grouped.items()):
        total_revenue = sum(r.total for r in group)
        quantities = [r.quantity for r in group]
        avg_qty = statistics.mean(quantities) if quantities else 0.0

        product_revenue: dict[str, float] = defaultdict(float)
        for rec in group:
            product_revenue[rec.product] += rec.total
        top_product = max(product_revenue, key=product_revenue.get)  # type: ignore[arg-type]

        unique_regions = sorted({r.region for r in group})

        results.append(AggregateResult(
            key=category,
            total_revenue=round(total_revenue, 2),
            transaction_count=len(group),
            avg_quantity=round(avg_qty, 2),
            top_product=top_product,
            regions=unique_regions,
        ))
    return results


def build_summary_report(aggregates: list[AggregateResult]) -> dict[str, Any]:
    """Build a JSON-serializable summary from aggregated results."""
    return {
        "categories": [
            {
                "name": agg.key,
                "revenue": agg.total_revenue,
                "transactions": agg.transaction_count,
                "avg_quantity": agg.avg_quantity,
                "top_product": agg.top_product,
                "regions": agg.regions,
            }
            for agg in aggregates
        ],
        "grand_total": round(sum(a.total_revenue for a in aggregates), 2),
        "category_count": len(aggregates),
    }


def write_report(report: dict[str, Any], dest: Path | str) -> None:
    """Write the summary report as formatted JSON."""
    path = Path(dest)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(f"Report written to {path} ({path.stat().st_size} bytes)")


def run_pipeline(min_revenue: float = 20.0, categories: Optional[set[str]] = None) -> dict[str, Any]:
    """Execute the full pipeline and return the summary."""
    records = generate_sample_data()
    print(f"Loaded {len(records)} records")

    filtered = filter_by_min_revenue(records, min_revenue)
    print(f"After revenue filter (>= {min_revenue}): {len(filtered)} records")

    if categories:
        filtered = filter_by_categories(filtered, categories)
        print(f"After category filter ({categories}): {len(filtered)} records")

    # Show running totals for the filtered set
    for idx, (rec, cumulative) in enumerate(iter_with_running_total(filtered)):
        print(f"  [{idx + 1}] {rec.product:12s}  total={rec.total:8.2f}  cumulative={cumulative:10.2f}")

    aggregates = aggregate_by_category(filtered)
    report = build_summary_report(aggregates)
    return report


if __name__ == "__main__":
    summary = run_pipeline(min_revenue=25.0)
    print("\n--- Summary ---")
    print(json.dumps(summary, indent=2))
