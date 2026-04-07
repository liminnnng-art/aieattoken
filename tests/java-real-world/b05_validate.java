import java.util.regex.Pattern;

public class b05_validate {

    interface Validator<T> {
        boolean isValid(T input);
        String getErrorMessage(T input);
    }

    static class EmailValidator implements Validator<String> {
        private static final Pattern EMAIL_PATTERN =
            Pattern.compile("^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$");

        @Override
        public boolean isValid(String input) {
            if (input == null || input.isBlank()) return false;
            return EMAIL_PATTERN.matcher(input).matches();
        }

        @Override
        public String getErrorMessage(String input) {
            if (input == null || input.isBlank()) return "Email cannot be empty";
            if (!input.contains("@")) return "Email must contain @";
            if (!EMAIL_PATTERN.matcher(input).matches()) return "Invalid email format";
            return "";
        }
    }

    static class PhoneValidator implements Validator<String> {
        // Accepts: (123) 456-7890, 123-456-7890, 1234567890, +1-234-567-8901
        private static final Pattern PHONE_PATTERN =
            Pattern.compile("^\\+?\\d{0,3}[\\s\\-]?\\(?\\d{3}\\)?[\\s\\-]?\\d{3}[\\s\\-]?\\d{4}$");

        @Override
        public boolean isValid(String input) {
            if (input == null || input.isBlank()) return false;
            return PHONE_PATTERN.matcher(input.trim()).matches();
        }

        @Override
        public String getErrorMessage(String input) {
            if (input == null || input.isBlank()) return "Phone number cannot be empty";
            if (!PHONE_PATTERN.matcher(input.trim()).matches()) return "Invalid phone format";
            return "";
        }
    }

    static class PasswordValidator implements Validator<String> {
        @Override
        public boolean isValid(String input) {
            if (input == null || input.length() < 8) return false;
            boolean hasUpper = false, hasLower = false, hasDigit = false, hasSpecial = false;
            for (char c : input.toCharArray()) {
                if (Character.isUpperCase(c)) hasUpper = true;
                else if (Character.isLowerCase(c)) hasLower = true;
                else if (Character.isDigit(c)) hasDigit = true;
                else hasSpecial = true;
            }
            return hasUpper && hasLower && hasDigit && hasSpecial;
        }

        @Override
        public String getErrorMessage(String input) {
            if (input == null) return "Password cannot be null";
            if (input.length() < 8) return "Password must be at least 8 characters";
            boolean hasUpper = false, hasLower = false, hasDigit = false, hasSpecial = false;
            for (char c : input.toCharArray()) {
                if (Character.isUpperCase(c)) hasUpper = true;
                else if (Character.isLowerCase(c)) hasLower = true;
                else if (Character.isDigit(c)) hasDigit = true;
                else hasSpecial = true;
            }
            if (!hasUpper) return "Password must contain an uppercase letter";
            if (!hasLower) return "Password must contain a lowercase letter";
            if (!hasDigit) return "Password must contain a digit";
            if (!hasSpecial) return "Password must contain a special character";
            return "";
        }
    }

    static <T> void runTest(Validator<T> validator, String label, T input, boolean expected) {
        boolean result = validator.isValid(input);
        String status = (result == expected) ? "PASS" : "FAIL";
        String detail = result ? "valid" : validator.getErrorMessage(input);
        System.out.printf("  %-30s -> %-8s [%s] %s%n", input, detail, status,
            status.equals("FAIL") ? "(expected " + expected + ")" : "");
    }

    public static void main(String[] args) {
        EmailValidator emailV = new EmailValidator();
        PhoneValidator phoneV = new PhoneValidator();
        PasswordValidator passV = new PasswordValidator();

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
}
