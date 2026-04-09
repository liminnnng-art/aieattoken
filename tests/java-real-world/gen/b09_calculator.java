
public class B09_calculator {

    public static double evaluate(String expression) {
        return new Parser(expression).parse();

    }

    public static boolean approxEqual(double a, double b) {
        return Math.abs(a - b) < 1.0E-9;

    }

    public static void test(String expr, double expected) {
        try {
            var result = evaluate(expr);
            var ok = approxEqual(result, expected);
            var status = ok ? "PASS" : "FAIL";
            if (ok) {
                ++passed;
            } else {
                ++failed;
            }
            System.out.printf("  %-30s = %-12.4f expected %-12.4f [%s]%n", expr, result, expected, status);

        } catch (Exception e) {
            ++failed;
            System.out.printf("  %-30s ERROR: %-20s expected %-12.4f [FAIL]%n", expr, e.getMessage(), expected);

        }

    }

    public static void testError(String expr, Class expectedType) {
        try {
            var result = evaluate(expr);
            ++failed;
            System.out.printf("  %-30s = %-12.4f (expected error) [FAIL]%n", expr, result);

        } catch (Exception e) {
            var ok = expectedType.isInstance(e);
            if (ok) {
                ++passed;
            } else {
                ++failed;
            }
            System.out.printf("  %-30s threw %-20s [%s]%n", expr, e.getClass().getSimpleName(), ok ? "PASS" : "FAIL");

        }

    }

    public static void main(String[] args) {
        System.out.println("=== Basic Arithmetic ===");
        test("2 + 3", 5);
        test("10 - 4", 6);
        test("6 * 7", 42);
        test("15 / 4", 3.75);
        System.out.println("\n=== Operator Precedence ===");
        test("2 + 3 * 4", 14);
        test("10 - 2 * 3", 4);
        test("12 / 4 + 1", 4);
        test("2 * 3 + 4 * 5", 26);
        System.out.println("\n=== Parentheses ===");
        test("(2 + 3) * 4", 20);
        test("(10 - 2) * (3 + 1)", 32);
        test("((2 + 3) * (4 - 1)) / 5", 3);
        test("(1 + 2) * (3 + 4) * (5 + 6)", 231);
        System.out.println("\n=== Unary Minus ===");
        test("-5", -5);
        test("-5 + 3", -2);
        test("-(3 + 4)", -7);
        test("--5", 5);
        test("2 * -3", -6);
        System.out.println("\n=== Decimal Numbers ===");
        test("3.14 * 2", 6.28);
        test("0.1 + 0.2", 0.3);
        test("10.5 / 2.1", 5);
        System.out.println("\n=== Complex Expressions ===");
        test("((15 / (7 - (1 + 1))) * 3) - (2 + (1 + 1))", 5);
        test("1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10", 55);
        test("2 * 2 * 2 * 2 * 2", 32);
        test("100 / 10 / 2", 5);
        System.out.println("\n=== Error Cases ===");
        testError("5 / 0", ArithmeticException.class);
        testError("2 + + 3", RuntimeException.class);
        testError("(2 + 3", RuntimeException.class);
        System.out.printf("%n=== Results: %d passed, %d failed ===%n", passed, failed);

    }

    static int passed = 0;

    static int failed = 0;

    public enum TokenType {
        NUMBER,
        PLUS,
        MINUS,
        STAR,
        SLASH,
        LPAREN,
        RPAREN,
        EOF;
    }

    static class Token {
        private final TokenType type;
        private final double value;

        public Token(TokenType type, double value) {
            this.type = type;
            this.value = value;
        }

        public Token(TokenType type) {
            this(type, 0);

        }

        public String toString() {
            return type == TokenType.NUMBER ? "NUM(" + value + ")" : type.name();

        }
    }

    static class Lexer {
        private final String input;
        private int pos;

        public Lexer(String input) {
            this.input = input.trim();
            pos = 0;

        }

        public Token nextToken() {
            skipWhitespace();
            if (pos >= input.length()) {
                return new Token(TokenType.EOF);
            }
            var c = input.charAt(pos);
            if (Character.isDigit(c) || c == '.') {
                return readNumber();
            }
            ++pos;
            return switch (c) {
    case '+' -> new Token(TokenType.PLUS);
    case '-' -> new Token(TokenType.MINUS);
    case '*' -> new Token(TokenType.STAR);
    case '/' -> new Token(TokenType.SLASH);
    case '(' -> new Token(TokenType.LPAREN);
    case ')' -> new Token(TokenType.RPAREN);
    default -> {
            throw new RuntimeException("Unexpected character: " + c + " at position " + (pos - 1));
    }
};

        }

        private Token readNumber() {
            var start = pos;
            var hasDot = false;
            while (pos < input.length()) {
                var c = input.charAt(pos);
                if (c == '.') {
                    if (hasDot) {
                        break;
                    }
                    hasDot = true;
                    ++pos;
                } else if (Character.isDigit(c)) {
    ++pos;
} else {
    break;
}
            }
            return new Token(TokenType.NUMBER, Double.parseDouble(input.substring(start, pos)));

        }

        private void skipWhitespace() {
            while (pos < input.length() && Character.isWhitespace(input.charAt(pos))) {
                ++pos;
            }

        }
    }

    static class Parser {
        private final Lexer lexer;
        private Token current;

        public Parser(String input) {
            lexer = new Lexer(input);
            current = lexer.nextToken();

        }

        private Token eat(TokenType type) {
            if (current.type != type) {
                throw new RuntimeException("Expected " + type + " but got " + current.type);
            }
            var t = current;
            current = lexer.nextToken();
            return t;

        }

        public double parse() {
            var result = expr();
            if (current.type != TokenType.EOF) {
                throw new RuntimeException("Unexpected token after expression: " + current);
            }
            return result;

        }

        private double expr() {
            var left = term();
            while (current.type == TokenType.PLUS || current.type == TokenType.MINUS) {
                var op = current.type;
                current = lexer.nextToken();
                var right = term();
                left = (op == TokenType.PLUS) ? left + right : left - right;
            }
            return left;

        }

        private double term() {
            var left = unary();
            while (current.type == TokenType.STAR || current.type == TokenType.SLASH) {
                var op = current.type;
                current = lexer.nextToken();
                var right = unary();
                if (op == TokenType.SLASH && right == 0) {
                    throw new ArithmeticException("Division by zero");
                }
                left = (op == TokenType.STAR) ? left * right : left / right;
            }
            return left;

        }

        private double unary() {
            if (current.type == TokenType.MINUS) {
                current = lexer.nextToken();
                return -unary();
            }
            return primary();

        }

        private double primary() {
            if (current.type == TokenType.NUMBER) {
                var val = current.value;
                current = lexer.nextToken();
                return val;
            }
            if (current.type == TokenType.LPAREN) {
                current = lexer.nextToken();
                var val = expr();
                eat(TokenType.RPAREN);
                return val;
            }
            throw new RuntimeException("Unexpected token: " + current);

        }
    }
}
