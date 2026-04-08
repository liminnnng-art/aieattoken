
public class Luhn {

    public static boolean luhnCheck(String number) {
        var sum = 0;
        var alternate = false;
        for (var i = number.length() - 1; i >= 0; i--) {
            var digit = number.charAt(i) - '0';
            if (alternate) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }
            sum += digit;
            alternate = !alternate;
        }
        return sum % 10 == 0;

    }

    public static void main(String[] args) {
        var testNumbers = new String[]{"49927398716", "49927398717", "1234567812345678", "1234567812345670"};
        for (var num : testNumbers) {
            System.out.printf("%s: %s%n", num, luhnCheck(num) ? "valid" : "invalid");
        }

    }
}
