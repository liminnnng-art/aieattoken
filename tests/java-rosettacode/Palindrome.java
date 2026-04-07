public class Palindrome {
    public static boolean isPalindrome(String s) {
        int left = 0, right = s.length() - 1;
        while (left < right) {
            if (s.charAt(left) != s.charAt(right)) return false;
            left++;
            right--;
        }
        return true;
    }

    public static void main(String[] args) {
        String[] tests = {"racecar", "hello", "madam", "world", "level"};
        for (String s : tests) {
            System.out.printf("%s: %b%n", s, isPalindrome(s));
        }
    }
}
