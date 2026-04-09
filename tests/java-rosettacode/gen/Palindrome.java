
public class Palindrome.aet {

    public static boolean isPalindrome(String s) {
        var left = 0;
        var right = s.length() - 1;
        while (left < right) {
            if (s.charAt(left) != s.charAt(right)) {
                return false;
            }
            ++left;
            --right;
        }
        return true;

    }

    public static void main(String[] args) {
        var tests = new String[]{"racecar", "hello", "madam", "world", "level"};
        for (var s : tests) {
            System.out.printf("%s: %b%n", s, isPalindrome(s));
        }

    }
}
