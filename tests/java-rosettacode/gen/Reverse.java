
public class Reverse.aet {

    public static String reverse(String s) {
        return new StringBuilder(s).reverse().toString();

    }

    public static void main(String[] args) {
        var testStrings = new String[]{"Hello, World!", "racecar"};
        for (var s : testStrings) {
            var reversed = reverse(s);
            System.out.printf("\"%s\" -> \"%s\"%n", s, reversed);
        }

    }
}
