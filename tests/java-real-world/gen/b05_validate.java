import java.util.regex.*;

public class B05_validate {

    public static <T> void runTest(Validator<T> validator, String label, T input, boolean expected) {
        var result = validator.isValid(input);
        var status = (result == expected) ? "PASS" : "FAIL";
        var detail = result ? "valid" : validator.getErrorMessage(input);
        System.out.printf("  %-30s -> %-8s [%s] %s%n", input, detail, status, status.equals("FAIL") ? "(expected " + expected + ")" : "");

    }

    public static void main(String[] args) {
        var emailV = new EmailValidator();
        var phoneV = new PhoneValidator();
        var passV = new PasswordValidator();
        System.out.println("=== Email Validation ===");
        runTest(emailV, "email", "user@example.com", true);
        runTest(emailV, "email", "name.last+tag@domain.co.uk", true);
        runTest(emailV, "email", "invalid@", false);
        runTest(emailV, "email", "@domain.com", false);
        runTest(emailV, "email", "no-at-sign.com", false);
        runTest(emailV, "email", "", false);
        System.out.println("\n=== Phone Validation ===");
        runTest(phoneV, "phone", "1234567890", true);
        runTest(phoneV, "phone", "(123) 456-7890", true);
        runTest(phoneV, "phone", "123-456-7890", true);
        runTest(phoneV, "phone", "+1-234-567-8901", true);
        runTest(phoneV, "phone", "12345", false);
        runTest(phoneV, "phone", "abcdefghij", false);
        System.out.println("\n=== Password Validation ===");
        runTest(passV, "pass", "Str0ng!Pass", true);
        runTest(passV, "pass", "Ab1!xxxx", true);
        runTest(passV, "pass", "weak", false);
        runTest(passV, "pass", "alllowercase1!", false);
        runTest(passV, "pass", "ALLUPPERCASE1!", false);
        runTest(passV, "pass", "NoDigits!here", false);
        runTest(passV, "pass", "NoSpecial1here", false);

    }

    public interface Validator<T> {
        boolean isValid(T input);
        String getErrorMessage(T input);
    }

    static class EmailValidator implements Validator<String> {
        private static final Pattern EMAIL_PATTERN = Pattern.compile("^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$");

        public boolean isValid(String input) {
            if (input == null || input.isBlank()) {
                return false;
            }
            return EMAIL_PATTERN.matcher(input).matches();

        }

        public String getErrorMessage(String input) {
            if (input == null || input.isBlank()) {
                return "Email cannot be empty";
            }
            if (!input.contains("@")) {
                return "Email must contain @";
            }
            if (!EMAIL_PATTERN.matcher(input).matches()) {
                return "Invalid email format";
            }
            return "";

        }
    }

    static class PhoneValidator implements Validator<String> {
        private static final Pattern PHONE_PATTERN = Pattern.compile("^\\+?\\d{0,3}[\\s\\-]?\\(?\\d{3}\\)?[\\s\\-]?\\d{3}[\\s\\-]?\\d{4}$");

        public boolean isValid(String input) {
            if (input == null || input.isBlank()) {
                return false;
            }
            return PHONE_PATTERN.matcher(input.trim()).matches();

        }

        public String getErrorMessage(String input) {
            if (input == null || input.isBlank()) {
                return "Phone number cannot be empty";
            }
            if (!PHONE_PATTERN.matcher(input.trim()).matches()) {
                return "Invalid phone format";
            }
            return "";

        }
    }

    static class PasswordValidator implements Validator<String> {

        public boolean isValid(String input) {
            if (input == null || input.length() < 8) {
                return false;
            }
            var hasUpper = false;
            var hasLower = false;
            var hasDigit = false;
            var hasSpecial = false;
            for (var c : input.toCharArray()) {
                if (Character.isUpperCase(c)) {
                    hasUpper = true;
                } else if (Character.isLowerCase(c)) {
    hasLower = true;
} else if (Character.isDigit(c)) {
    hasDigit = true;
} else {
    hasSpecial = true;
}
            }
            return hasUpper && hasLower && hasDigit && hasSpecial;

        }

        public String getErrorMessage(String input) {
            if (input == null) {
                return "Password cannot be null";
            }
            if (input.length() < 8) {
                return "Password must be at least 8 characters";
            }
            var hasUpper = false;
            var hasLower = false;
            var hasDigit = false;
            var hasSpecial = false;
            for (var c : input.toCharArray()) {
                if (Character.isUpperCase(c)) {
                    hasUpper = true;
                } else if (Character.isLowerCase(c)) {
    hasLower = true;
} else if (Character.isDigit(c)) {
    hasDigit = true;
} else {
    hasSpecial = true;
}
            }
            if (!hasUpper) {
                return "Password must contain an uppercase letter";
            }
            if (!hasLower) {
                return "Password must contain a lowercase letter";
            }
            if (!hasDigit) {
                return "Password must contain a digit";
            }
            if (!hasSpecial) {
                return "Password must contain a special character";
            }
            return "";

        }
    }
}
