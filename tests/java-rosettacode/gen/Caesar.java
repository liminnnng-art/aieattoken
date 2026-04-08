
public class Caesar {

    public static String encrypt(String text, int shift) {
        var sb = new StringBuilder();
        for (var c : text.toCharArray()) {
            if (Character.isUpperCase(c)) {
                sb.append((char) ('A' + (c - 'A' + shift) % 26));
            } else if (Character.isLowerCase(c)) {
    sb.append((char) ('a' + (c - 'a' + shift) % 26));
} else {
    sb.append(c);
}
        }
        return sb.toString();

    }

    public static String decrypt(String text, int shift) {
        return encrypt(text, 26 - shift);

    }

    public static void main(String[] args) {
        var plaintext = "The quick brown fox";
        var shift = 11;
        var encrypted = encrypt(plaintext, shift);
        var decrypted = decrypt(encrypted, shift);
        System.out.println("Plain:     " + plaintext);
        System.out.println("Encrypted: " + encrypted);
        System.out.println("Decrypted: " + decrypted);

    }
}
