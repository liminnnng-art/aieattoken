
public class Tokenize {

    public static void main(String[] args) {
        var input = "Hello,How,Are,You,Today";
        var tokens = input.split(",");
        System.out.println("Input:  " + input);
        System.out.println("Tokens: " + String.join(", ", tokens));
        var joined = String.join(".", tokens);
        System.out.println("Joined: " + joined);

    }
}
