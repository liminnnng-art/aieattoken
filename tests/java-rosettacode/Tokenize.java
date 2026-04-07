public class Tokenize {
    public static void main(String[] args) {
        String input = "Hello,How,Are,You,Today";
        String[] tokens = input.split(",");
        System.out.println("Input:  " + input);
        System.out.println("Tokens: " + String.join(", ", tokens));
        String joined = String.join(".", tokens);
        System.out.println("Joined: " + joined);
    }
}
