"""A simple interactive calculator with operator dispatch via match/case."""

from dataclasses import dataclass, field


class CalculatorError(Exception):
    """Raised when the calculator encounters an invalid operation."""


@dataclass
class Calculator:
    """Stateful calculator that tracks a running result and history.

    Supports +, -, *, /, and ** (power) operators.
    """
    result: float = 0.0
    history: list[str] = field(default_factory=list)

    def apply(self, operator: str, operand: float) -> float:
        """Apply an operator with the given operand to the current result.

        Args:
            operator: One of '+', '-', '*', '/', '**'.
            operand: The right-hand side value.

        Returns:
            The new result after applying the operation.

        Raises:
            CalculatorError: On division by zero or unknown operator.
        """
        prev = self.result

        match operator:
            case "+":
                self.result += operand
            case "-":
                self.result -= operand
            case "*":
                self.result *= operand
            case "/":
                if operand == 0:
                    raise CalculatorError("Division by zero")
                self.result /= operand
            case "**":
                self.result **= operand
            case _:
                raise CalculatorError(f"Unknown operator: {operator!r}")

        self.history.append(f"{prev} {operator} {operand} = {self.result}")
        return self.result

    def reset(self) -> None:
        """Reset the result to zero and clear history."""
        self.result = 0.0
        self.history.clear()

    def show_history(self) -> None:
        """Print the full operation history."""
        if not self.history:
            print("(no history)")
            return
        for i, entry in enumerate(self.history, 1):
            print(f"  {i}. {entry}")


def repl() -> None:
    """Run an interactive read-eval-print loop."""
    calc = Calculator()
    print("Calculator  (type 'q' to quit, 'h' for history, 'c' to clear)")
    print(f"  = {calc.result}")

    while True:
        try:
            line = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not line:
            continue
        if line.lower() == "q":
            break
        if line.lower() == "h":
            calc.show_history()
            continue
        if line.lower() == "c":
            calc.reset()
            print(f"  = {calc.result}")
            continue

        parts = line.split(maxsplit=1)
        if len(parts) != 2:
            print("  Error: enter <operator> <number>  (e.g. + 5)")
            continue

        op, raw_value = parts
        try:
            value = float(raw_value)
        except ValueError:
            print(f"  Error: invalid number: {raw_value!r}")
            continue

        try:
            result = calc.apply(op, value)
            print(f"  = {result}")
        except CalculatorError as exc:
            print(f"  Error: {exc}")


if __name__ == "__main__":
    repl()
