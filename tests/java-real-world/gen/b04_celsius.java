
public class B04_celsius {

    public static boolean approxEqual(double a, double b) {
        return Math.abs(a - b) < 0.01;

    }

    public static void main(String[] args) {
        System.out.println("=== Temperature Conversion Table ===");
        System.out.printf("%-12s %-12s %-12s%n", "Celsius", "Fahrenheit", "Kelvin");
        System.out.println("-".repeat(36));
        var celsiusValues = new double[]{-40, -20, 0, 20, 37, 100};
        for (var c : celsiusValues) {
            var t = new Temperature(c, Unit.CELSIUS);
            var f = t.convertTo(Unit.FAHRENHEIT);
            var k = t.convertTo(Unit.KELVIN);
            System.out.printf("%-12s %-12s %-12s%n", t, f, k);
        }
        System.out.println();
        System.out.println("=== Verification Tests ===");
        var t1 = new Temperature(0, Unit.CELSIUS).convertTo(Unit.FAHRENHEIT);
        System.out.println("0C -> F: " + t1 + " " + (approxEqual(t1.value, 32.0) ? "PASS" : "FAIL"));
        var t2 = new Temperature(100, Unit.CELSIUS).convertTo(Unit.FAHRENHEIT);
        System.out.println("100C -> F: " + t2 + " " + (approxEqual(t2.value, 212.0) ? "PASS" : "FAIL"));
        var t3 = new Temperature(0, Unit.CELSIUS).convertTo(Unit.KELVIN);
        System.out.println("0C -> K: " + t3 + " " + (approxEqual(t3.value, 273.15) ? "PASS" : "FAIL"));
        var t4 = new Temperature(212, Unit.FAHRENHEIT).convertTo(Unit.CELSIUS);
        System.out.println("212F -> C: " + t4 + " " + (approxEqual(t4.value, 100.0) ? "PASS" : "FAIL"));
        var t5 = new Temperature(373.15, Unit.KELVIN).convertTo(Unit.CELSIUS);
        System.out.println("373.15K -> C: " + t5 + " " + (approxEqual(t5.value, 100.0) ? "PASS" : "FAIL"));
        var t6 = new Temperature(37, Unit.CELSIUS).convertTo(Unit.FAHRENHEIT).convertTo(Unit.KELVIN).convertTo(Unit.CELSIUS);
        System.out.println("Round-trip 37C: " + t6 + " " + (approxEqual(t6.value, 37.0) ? "PASS" : "FAIL"));
        var t7 = new Temperature(-40, Unit.CELSIUS).convertTo(Unit.FAHRENHEIT);
        System.out.println("-40C -> F: " + t7 + " " + (approxEqual(t7.value, -40.0) ? "PASS" : "FAIL"));

    }

    public enum Unit {
        CELSIUS,
        FAHRENHEIT,
        KELVIN;
    }

    static class Temperature {
        private final double value;
        private final Unit unit;

        public Temperature(double value, Unit unit) {
            this.value = value;
            this.unit = unit;
        }

        private double toCelsius() {
            return switch (unit) {
    case CELSIUS -> value;
    case FAHRENHEIT -> (value - 32.0) * 5.0 / 9.0;
    case KELVIN -> value - 273.15;
};

        }

        public Temperature convertTo(Unit target) {
            var celsius = toCelsius();
            var result = switch (target) {
    case CELSIUS -> celsius;
    case FAHRENHEIT -> celsius * 9.0 / 5.0 + 32.0;
    case KELVIN -> celsius + 273.15;
};
            return new Temperature(result, target);

        }

        public String toString() {
            var symbol = switch (unit) {
    case CELSIUS -> "C";
    case FAHRENHEIT -> "F";
    case KELVIN -> "K";
};
            return String.format("%.2f %s", value, symbol);

        }
    }
}
