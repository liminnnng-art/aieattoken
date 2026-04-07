public class Luhn {
    public static boolean luhnCheck(String number) {
        int sum = 0;
        boolean alternate = false;
        for (int i = number.length() - 1; i >= 0; i--) {
            int digit = number.charAt(i) - '0';
            if (alternate) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            sum += digit;
            alternate = !alternate;
        }
        return sum % 10 == 0;
    }

    public static void main(String[] args) {
        String[] testNumbers = {
            "49927398716",
            "49927398717",
            "1234567812345678",
            "1234567812345670"
        };
        for (String num : testNumbers) {
            System.out.printf("%s: %s%n", num, luhnCheck(num) ? "valid" : "invalid");
        }
    }
}
