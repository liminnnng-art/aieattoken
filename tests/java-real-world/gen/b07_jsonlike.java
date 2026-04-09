import java.util.*;

public class B07_jsonlike {

    public static String formatValue(JsonValue v, int indent) {
        if (v instanceof JsonObject obj) {
            return obj.format(indent);
        }
        if (v instanceof JsonArray arr) {
            return arr.format(indent);
        }
        return v.toString();

    }

    public static JsonString str(String s) {
        return new JsonString(s);

    }

    public static JsonNumber num(double d) {
        return new JsonNumber(d);

    }

    public static JsonBool bool(boolean b) {
        return new JsonBool(b);

    }

    public static JsonNull nil() {
        return new JsonNull();

    }

    public static void main(String[] args) {
        var user = new JsonObject().set("name", str("Alice Johnson")).set("age", num(30)).set("email", str("alice@example.com")).set("active", bool(true)).set("nickname", nil());
        var skills = new JsonArray().add(str("Java")).add(str("Python")).add(str("SQL"));
        user.set("skills", skills);
        var address = new JsonObject().set("street", str("123 Main St")).set("city", str("Springfield")).set("zip", str("62704"));
        user.set("address", address);
        var scores = new JsonArray().add(num(95)).add(num(87.5)).add(num(92));
        user.set("scores", scores);
        System.out.println("=== Formatted JSON-like Output ===");
        System.out.println(user);
        System.out.println("\n=== Verification ===");
        System.out.println("Has name: " + (user.has("name") ? "PASS" : "FAIL"));
        System.out.println("Name value: " + (user.get("name").toString().equals("\"Alice Johnson\"") ? "PASS" : "FAIL"));
        System.out.println("Age value: " + (user.get("age").toString().equals("30") ? "PASS" : "FAIL"));
        System.out.println("Skills count: " + (((JsonArray) user.get("skills")).size() == 3 ? "PASS" : "FAIL"));
        System.out.println("Null renders: " + (user.get("nickname").toString().equals("null") ? "PASS" : "FAIL"));
        System.out.println("Nested city: " + (((JsonObject) user.get("address")).get("city").toString().equals("\"Springfield\"") ? "PASS" : "FAIL"));
        var escaped = new JsonObject().set("quote", str("He said \"hello\"")).set("newline", str("line1\nline2"));
        System.out.println("\n=== Escape Test ===");
        System.out.println(escaped);
        System.out.println("Escape quotes: " + (escaped.get("quote").toString().contains("\\\"") ? "PASS" : "FAIL"));
        System.out.println("Escape newline: " + (escaped.get("newline").toString().contains("\\n") ? "PASS" : "FAIL"));

    }

    public sealed interface JsonValue permits JsonString, JsonNumber, JsonBool, JsonNull, JsonArray, JsonObject {
    }

    public record JsonString(String value) implements JsonValue {

        public String toString() {
            return "\"" + escapeString(value) + "\"";

        }

        public static String escapeString(String s) {
            return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\t", "\\t");

        }
    }

    public record JsonNumber(double value) implements JsonValue {

        public String toString() {
            if (value == Math.floor(value) && !Double.isInfinite(value)) {
                return String.valueOf((long) value);
            }
            return String.valueOf(value);

        }
    }

    public record JsonBool(boolean value) implements JsonValue {

        public String toString() {
            return String.valueOf(value);

        }
    }

    public record JsonNull() implements JsonValue {

        public String toString() {
            return "null";

        }
    }

    static non-sealed class JsonArray implements JsonValue {
        private final List<JsonValue> items = new ArrayList<>();

        public JsonArray add(JsonValue v) {
            items.add(v);
            return this;

        }

        public int size() {
            return items.size();

        }

        public JsonValue get(int i) {
            return items.get(i);

        }

        public String format(int indent) {
            if (items.isEmpty()) {
                return "[]";
            }
            var sb = new StringBuilder("[\n");
            for (var i = 0; i < items.size(); ++i) {
                sb.append("  ".repeat(indent + 1));
                sb.append(formatValue(items.get(i), indent + 1));
                if (i < items.size() - 1) {
                    sb.append(",");
                }
                sb.append("\n");
            }
            sb.append("  ".repeat(indent)).append("]");
            return sb.toString();

        }

        public String toString() {
            return format(0);

        }
    }

    static non-sealed class JsonObject implements JsonValue {
        private final LinkedHashMap<String, JsonValue> fields = new LinkedHashMap();

        public JsonObject set(String key, JsonValue value) {
            fields.put(key, value);
            return this;

        }

        public JsonValue get(String key) {
            return fields.get(key);

        }

        public boolean has(String key) {
            return fields.containsKey(key);

        }

        public Set<String> keys() {
            return fields.keySet();

        }

        public String format(int indent) {
            if (fields.isEmpty()) {
                return "{}";
            }
            var sb = new StringBuilder("{\n");
            var entries = new ArrayList<>(fields.entrySet());
            for (var i = 0; i < entries.size(); ++i) {
                var e = entries.get(i);
                sb.append("  ".repeat(indent + 1));
                sb.append("\"").append(e.getKey()).append("\": ");
                sb.append(formatValue(e.getValue(), indent + 1));
                if (i < entries.size() - 1) {
                    sb.append(",");
                }
                sb.append("\n");
            }
            sb.append("  ".repeat(indent)).append("}");
            return sb.toString();

        }

        public String toString() {
            return format(0);

        }
    }
}
