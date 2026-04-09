
public class Roman.aet {

    public static String toRoman(int number) {
        var sb = new StringBuilder();
        for (var i = 0; i < VALUES.length; ++i) {
            while (number >= VALUES[i]) {
                sb.append(SYMBOLS[i]);
                number -= VALUES[i];
            }
        }
        return sb.toString();

    }

    public static void main(String[] args) {
        var testValues = new int[]{1, 4, 9, 14, 42, 99, 2024};
        for (var v : testValues) {
            System.out.printf("%4d = %s%n", v, toRoman(v));
        }

    }

    static int[] VALUES = new int[]{1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1};

    static String[] SYMBOLS = new String[]{"M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"};
}
