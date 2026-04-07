public class Roman {
    private static final int[] VALUES =    {1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1};
    private static final String[] SYMBOLS = {"M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"};

    public static String toRoman(int number) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < VALUES.length; i++) {
            while (number >= VALUES[i]) {
                sb.append(SYMBOLS[i]);
                number -= VALUES[i];
            }
        }
        return sb.toString();
    }

    public static void main(String[] args) {
        int[] testValues = {1, 4, 9, 14, 42, 99, 2024};
        for (int v : testValues) {
            System.out.printf("%4d = %s%n", v, toRoman(v));
        }
    }
}
