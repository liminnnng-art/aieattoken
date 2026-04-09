import java.util.*;

public class B02_wordcount {

    public static Map<String, Integer> countWords(String text) {
        Map<String, Integer> counts = new HashMap<>();
        var words = text.toLowerCase().split("\\s+");
        for (var word : words) {
            word = word.replaceAll("[^a-z]", "");
            if (!word.isEmpty()) {
                counts.put(word, counts.getOrDefault(word, 0) + 1);
            }
        }
        return counts;

    }

    public static void main(String[] args) {
        var text = "the cat sat on the mat and the cat liked the mat";
        Map<String, Integer> counts = countWords(text);
        System.out.println("Text: \"" + text + "\"");
        System.out.println("Word frequencies (sorted):");
        counts.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey())).forEach((var e) -> System.out.println("  " + e.getKey() + ": " + e.getValue()));
        System.out.println("'the' count correct: " + (counts.get("the") == 4 ? "PASS" : "FAIL"));
        System.out.println("'cat' count correct: " + (counts.get("cat") == 2 ? "PASS" : "FAIL"));
        System.out.println("'sat' count correct: " + (counts.get("sat") == 1 ? "PASS" : "FAIL"));
        System.out.println("Total unique words: " + counts.size());
        System.out.println("Unique count correct: " + (counts.size() == 7 ? "PASS" : "FAIL"));

    }
}
