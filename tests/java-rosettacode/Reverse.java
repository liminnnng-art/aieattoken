public class Reverse {
    public static String reverse(String s) {
        return new StringBuilder(s).reverse().toString();
    }

    public static void main(String[] args) {
        String[] testStrings = {"Hello, World!", "racecar"};
        for (String s : testStrings) {
            String reversed = reverse(s);
            System.out.printf("\"%s\" -> \"%s\"%n", s, reversed);
        }
    }
}
